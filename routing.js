// routing.js (ES MODULE)
import { appContext } from './app-context.js';

export class RoutingManager {
  constructor(styleFilterManager, searchManager, json) {
    appContext.routingManager = this;
    window.routingManager = this; // backward compat
    this.styleFilterManager = styleFilterManager ?? appContext.searchFilter;
    this.searchManager = searchManager ?? appContext.searchHeader;
    this.json = json?.length ? json : appContext.locations;

    this._countries = null;
    this._routes = null;
    this._citiesWithMultipleSpaces = null;
    this._cityRoutes = null;
    this._cityCountMap = null;
    this._styleCountMap = null;

    this._isNavigating = false;
    this._isOnLocationRoute = false;
    this._activeCountryFilter = null;

    this._cityTranslationMap = {
      'München': 'Munich', 'Köln': 'Cologne', 'Nürnberg': 'Nuremberg',
      'Wien': 'Vienna', 'Zürich': 'Zurich', 'Genf': 'Geneva',
      'Basel': 'Basel', 'Graz': 'Graz', 'Linz': 'Linz', 'Bern': 'Bern'
    };

    // WICHTIG: Erst am Ende des Constructors aufrufen
    this.initRoutingListeners();
  }

  _ensureDataLoaded() {
    if (this._countries !== null) return;
    if (!this.json || this.json.length === 0) return;

    this._countries = this._findAllCountries();
    this._citiesWithMultipleSpaces = this._findCitiesWithMultipleSpaces();
    this._routes = this._createRoutes();
    this._cityRoutes = this._createCityRoutes();

    // Cache city counts (static — never changes)
    this._cityCountMap = new Map();
    for (const loc of this.json) {
      const city = loc.loc?.city;
      if (city) this._cityCountMap.set(city, (this._cityCountMap.get(city) || 0) + 1);
    }

    // Cache style counts for non-status styles (static)
    this._styleCountMap = new Map();
    for (const loc of this.json) {
      if (loc.style) this._styleCountMap.set(loc.style, (this._styleCountMap.get(loc.style) || 0) + 1);
    }
  }

  // ========================================
  // NEU: AUTO-DETECTION & TOAST
  // ========================================

  autoDetectAndApplyCountry() {
    this._ensureDataLoaded();
    if (!this._countries) return;

    const userLangs = navigator.languages || [navigator.language];
    const codeToName = {
      'DE': 'Germany', 'AT': 'Austria', 'CH': 'Switzerland',
      'FR': 'France', 'NL': 'Netherlands', 'BE': 'Belgium',
      'IT': 'Italy', 'ES': 'Spain', 'UA': 'Ukraine', 'DK': 'Denmark'
    };

    let detectedCountry = null;
    for (const lang of userLangs) {
      const code = lang.split('-')[1]?.toUpperCase() || lang.split('-')[0]?.toUpperCase();
      if (code && codeToName[code] && this._countries.includes(codeToName[code])) {
        detectedCountry = codeToName[code];
        break;
      }
    }

    if (detectedCountry) {
      this.applyCountryFilter(detectedCountry);
      const i18n = appContext.i18n;
      const countryLabel = i18n?.t(`countries.${detectedCountry}`) || detectedCountry;
      const message = i18n?.t('filter.autoDetected').replace('{country}', countryLabel) || countryLabel;
      this.showCenteredToast(message);
    } else {
      // Fallback falls nichts erkannt wurde
      this.handleRouteWithPills();
    }
  }

  showCenteredToast(text) {
    const toast = document.createElement('div');
    toast.className = 'settings-hash-toast';
    toast.innerHTML = text;
    document.body.appendChild(toast);

    requestAnimationFrame(() => {
      toast.classList.add('show');
    });

    setTimeout(() => {
      toast.classList.add('zoom-out');
      toast.style.opacity = '0';
      setTimeout(() => toast.remove(), 500);
    }, 3000);
  }

  // ========================================
  // ROUTING LOGIK
  // ========================================

  initRoutingListeners() {
    window.addEventListener('hashchange', () => this.handleRouteWithPills());

    const hash = window.location.hash;
    // Warten bis appContext.ready('app') — stellt sicher dass searchHeader/searchFilter bereit sind
    appContext.waitFor('app').then(() => {
      // Sync mit aktuellsten Referenzen (könnten sich nach Konstruktor-Aufruf geändert haben)
      if (!this.styleFilterManager) this.styleFilterManager = appContext.searchFilter;
      if (!this.searchManager) this.searchManager = appContext.searchHeader;
      if (!this.json?.length) this.json = appContext.locations;

      if (!hash || hash === '#' || hash === '#/') {
        this.autoDetectAndApplyCountry();
      } else {
        this.handleRouteWithPills();
      }
    });
  }

  handleRouteWithPills() {
    this._ensureDataLoaded();

    if (this._isNavigating) {
      this._isNavigating = false;
      return;
    }

    const hash = window.location.hash;

    // Short-ID Match
    const shortIdMatch = hash.match(/^#\/(\d+)$/);
    if (shortIdMatch) {
      const id = parseInt(shortIdMatch[1], 10);
      const location = appContext.locationById.get(id);
      if (location) {
        this.navigateToLocations([id]);
        return;
      }
    }

    if (hash.startsWith('#/bookmarks/')) {
      this.handleBookmarkRoute(hash);
      return;
    }

    const hierarchicalMatch = hash.match(/^#\/([^/]+)\/([^/]+)\/(\d+(?:,\d+)*)/);
    if (hierarchicalMatch) {
      this.handleLocationRoute(hash);
      return;
    }

    this._isOnLocationRoute = false;

    // Country-Filter Match
    const singleCountryMatch = hash.match(/^#\/([^/+]+)\/?$/);
    if (singleCountryMatch) {
      const slug = singleCountryMatch[1];
      const countryName = this.findCountryBySlug(slug);
      if (countryName) {
        this.applyCountryFilter(countryName);
        return;
      }
    }

    // City-Filter Match
    const countryCityMatch = hash.match(/^#\/([^/+]+)\/([^/+]+)\/?$/);
    if (countryCityMatch) {
      const countrySlug = countryCityMatch[1];
      const citySlug = countryCityMatch[2];
      const countryName = this.findCountryBySlug(countrySlug);
      const cityName = this.findCityBySlug(citySlug);
      if (countryName && cityName) {
        this.applyCityFilter(cityName);
        return;
      }
    }

    const pills = this.loadPillsFromURL();
    if (!pills.length) {
      this.clearAllPillsAndFilters();
      if (!this._isOnLocationRoute) {
        this.updatePageMeta('Makerspace Map', 'Find makerspaces, fablabs and hackerspaces...');
      }
      return;
    }

    if (this.searchManager?.pillsManager) {
      this._activeCountryFilter = null;
      this.searchManager.pillsManager.loadPills(pills);
      this.updatePageMeta(
        `Makerspaces in ${pills.map(p => p.text).join(', ')}`,
        `Find makerspaces in ${pills.map(p => p.text).join(', ')}`
      );
    }
  }

  // --- Helfer Methoden (gekürzt für Übersicht, müssen in deiner Datei bleiben) ---

  findCountryBySlug(slug) {
    this._ensureDataLoaded();
    const countries = this._countries || [];
    for (const country of countries) {
      if (this.countryToSlug(country) === slug) return country;
    }
    return null;
  }

  findCityBySlug(slug) {
    this._ensureDataLoaded();
    for (const location of this.json) {
      const city = location.loc?.city;
      if (city && city !== 'CITY_CITY') {
        if (this.cityToSlug(city) === slug) return city;
      }
    }
    return null;
  }

  applyCountryFilter(countryName) {
    const bar = this.searchManager.searchBar;
    const SearchTerm = bar.value;
    // Flag schon VOR pillsManager.clear() setzen (nicht erst in _setHash):
    // der onChange-Callback der Pills würde sonst die URL überschreiben.
    this._isNavigating = true;

    if (this._activeCountryFilter === countryName) {
      this.clearAllPillsAndFilters();
      return;
    }

    this._activeCountryFilter = countryName;
    this._isOnLocationRoute = false; // country filter overrides any prior location route
    if (this.searchManager?.pillsManager) this.searchManager.pillsManager.clear();
    this._setHash(`#/${this.countryToSlug(countryName)}`);

    this._afterNavigation(() => {
      bar.value = SearchTerm;
      // Use triggerFilterUpdate directly — applyPillFilters would call loadPills([])
      // which fires onChangeCallback → updateURLFromPills([]) → clears hash → undoes filter.
      if (this.searchManager) this.searchManager.triggerFilterUpdate();
    });
  }

  applyCityFilter(cityName) {
    this._activeCountryFilter = null;
    const cityPill = {
      text: cityName,
      type: 'city',
      count: this.json.filter(loc => loc.loc?.city === cityName).length
    };
    if (this.searchManager?.pillsManager) {
      this.searchManager.pillsManager.clear();
      this.searchManager.pillsManager.addPill(cityPill);
    }
    this.updateURLFromPills([cityPill]);
  }

  _findAllCountries() {
    const countries = new Set();
    this.json.forEach(loc => {
      const c = loc.loc?.country;
      if (c && c !== 'COUNTRY_COUNTRY') countries.add(c);
    });
    return Array.from(countries).sort();
  }

  _findCitiesWithMultipleSpaces() {
    const counts = new Map();
    this.json.forEach(loc => {
      const city = loc.loc?.city;
      if (city && city !== 'CITY_CITY') counts.set(city, (counts.get(city) || 0) + 1);
    });
    const result = new Map();
    counts.forEach((count, city) => { if (count >= 2) result.set(city, count); });
    return result;
  }

  _createRoutes() {
    const routes = {};
    this._countries.forEach(country => {
      routes[this.countryToSlug(country)] = { type: 'country', value: country };
    });
    const styles = ['for all', 'for students', 'for youth', 'commercial', 'open', 'closed'];
    styles.forEach(s => routes[s.replace(/\s+/g, '-')] = { type: 'style', value: s });
    return routes;
  }

  _createCityRoutes() {
    const cityRoutes = new Map();
    this._citiesWithMultipleSpaces.forEach((_, city) => {
      const slug = this.cityToSlug(city);
      cityRoutes.set(this._routes[slug] ? `city-${slug}` : slug, city);
    });
    return cityRoutes;
  }

  countryToSlug(str) { return this.normalizeSlug(str); }
  cityToSlug(str) { return this.normalizeSlug(this._cityTranslationMap[str] || str); }
  normalizeSlug(str) {
    return str.trim().toLowerCase()
      // Deutsche Umlaute zuerst (ae/oe/ue, nicht nur a/o/u via NFD)
      .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
      // Andere Akzente via Unicode-Normalisierung (é→e, à→a, ç→c, ...)
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
  }

  updateURLFromPills(pills) {
    this._ensureDataLoaded();
    const slugs = pills.map(p => this.findSlugByPill(p)).filter(Boolean);
    const newHash = slugs.length > 0 ? `#/${slugs.join('+')}` : '';
    if (newHash !== window.location.hash) {
      this._setHash(newHash || '');
    }
  }

  findSlugByPill(pill) {
    if (pill.type === 'city') {
      const location = this.json.find(loc => loc.loc?.city === pill.text);
      if (location?.loc?.country) {
        return `${this.countryToSlug(location.loc.country)}/${this.cityToSlug(pill.text)}`;
      }
      return this.cityToSlug(pill.text);
    }
    if (pill.type === 'style') {
      return Object.keys(this._routes).find(key => this._routes[key].value === pill.text);
    }
    return null;
  }

  loadPillsFromURL() {
    this._ensureDataLoaded();
    const hash = window.location.hash;
    if (!hash || !hash.startsWith('#/')) return [];
    let path = hash.slice(2).replace(/\/$/, '');
    if (!path || path.includes('/')) return [];
    return path.split('+').map(slug => this.findPillBySlug(slug)).filter(Boolean);
  }

  findPillBySlug(slug) {
    this._ensureDataLoaded();
    const cityRoutes = this._cityRoutes || new Map();
    for (const [routeSlug, city] of cityRoutes) {
      if (routeSlug === slug) return { text: city, type: 'city', count: this._countLocationsByCity(city) };
    }
    for (const loc of this.json) {
      if (loc.loc?.city && this.cityToSlug(loc.loc.city) === slug) {
        return { text: loc.loc.city, type: 'city', count: this._countLocationsByCity(loc.loc.city) };
      }
    }
    if (this._routes[slug]?.type === 'style') {
      const style = this._routes[slug].value;
      return { text: style, type: 'style', filterKey: style, count: this._countLocationsByStyle(style) };
    }
    return null;
  }

  _countLocationsByCity(c) {
    return this._cityCountMap?.get(c) ?? this.json.filter(l => l.loc?.city === c).length;
  }
  _countLocationsByStyle(style) {
    // open/closed depend on runtime status — cannot be pre-cached
    if (style === 'open')   return this.json.filter(l => l.isOpen === true).length;
    if (style === 'closed') return this.json.filter(l => l.isOpen === false).length;
    return this._styleCountMap?.get(style) ?? this.json.filter(l => l.style === style).length;
  }

  updatePageMeta(title, desc, loc = null) {
    document.title = title.startsWith('makerspac.es') ? title : `${title} | makerspac.es`;
    let meta = document.querySelector('meta[name="description"]');
    if (!meta) { meta = document.createElement('meta'); meta.name = 'description'; document.head.appendChild(meta); }
    meta.content = desc;

    let ldScript = document.getElementById('ld-space');
    if (loc) {
      if (!ldScript) {
        ldScript = document.createElement('script');
        ldScript.id = 'ld-space';
        ldScript.type = 'application/ld+json';
        document.head.appendChild(ldScript);
      }
      const cc = appContext.mapIcons?.getCountryCode(loc.loc?.country)?.toUpperCase() || '';
      const street = loc.loc?.street ? `${loc.loc.street.name || ''} ${loc.loc.street.number || ''}${loc.loc.street.ext || ''}`.trim() : '';
      ldScript.textContent = JSON.stringify({
        '@context': 'https://schema.org',
        '@type': 'LocalBusiness',
        'name': loc.name,
        'url': loc.link || undefined,
        'address': {
          '@type': 'PostalAddress',
          'streetAddress': street || undefined,
          'addressLocality': loc.loc?.city || undefined,
          'postalCode': loc.loc?.plz ? String(loc.loc.plz) : undefined,
          'addressCountry': cc || undefined,
        },
        'geo': loc.loc?.lat != null ? {
          '@type': 'GeoCoordinates',
          'latitude': loc.loc.lat,
          'longitude': loc.loc.long,
        } : undefined,
      });
    } else if (ldScript) {
      ldScript.remove();
    }
  }

  // Führt callback aus nachdem der durch uns ausgelöste hashchange verarbeitet wurde.
  // Robuster als setTimeout(fn, 50): wartet auf das tatsächliche Event statt auf einen
  // festen Timeout. Fallback nach 200ms falls kein hashchange feuert (z.B. Hash bereits leer).
  _afterNavigation(callback) {
    let fired = false;
    const handler = () => {
      if (fired) return;
      fired = true;
      window.removeEventListener('hashchange', handler);
      this._isNavigating = false;
      callback();
    };
    window.addEventListener('hashchange', handler);
    setTimeout(handler, 200);
  }

  clearAllPillsAndFilters() {
    this._activeCountryFilter = null;
    const bar = this.searchManager?.searchBar;
    const rescuedText = bar ? bar.value : '';
    // Flag schon VOR den folgenden Aufrufen setzen (nicht erst in _setHash):
    // Pill-/Filter-Callbacks würden sonst die URL überschreiben.
    this._isNavigating = true;

    const currentPills = this.searchManager?.pillsManager?.getPillsArray() || [];
    const hasBookmarkFilter = this.styleFilterManager?.selectedStyles?.has('bookmarked');

    if (hasBookmarkFilter && appContext.bookmarks) {
      const ids = appContext.bookmarks.getBookmarkedIds();
      ids.length > 0 ? this.navigateToLocations(ids) : this._setHash('');
    } else if (currentPills.length > 0) {
      this.updateURLFromPills(currentPills);
    } else {
      this._setHash('');
    }

    this._afterNavigation(() => {
      if (bar) bar.value = rescuedText;
      if (this.searchManager) this.searchManager.applyPillFilters(currentPills);
    });
  }

  handleBookmarkRoute(hash) {
    const ids = hash.replace('#/bookmarks/', '').split(',').map(id => parseInt(id.trim(), 10)).filter(id => !isNaN(id));
    if (ids.length === 0) return;
    const locations = ids.map(id => appContext.locationById.get(id)).filter(Boolean);
    if (locations.length > 0) this.showLocations(locations, ids);
  }

  handleLocationRoute(hash) {
    const parts = hash.substring(2).split('/');
    const ids = parts[2].split(',').map(id => parseInt(id.trim(), 10)).filter(id => !isNaN(id) && id > 0);
    const locations = ids.map(id => appContext.locationById.get(id)).filter(Boolean);
    locations.length > 0 ? this.showLocations(locations, ids) : this.clearAllPillsAndFilters();
  }

  showLocations(locations, ids) {
    if (!this.searchManager) return;
    // Race-Condition: _isNavigating kann durch ältere Timer zurückgesetzt werden,
    // bevor hashchange feuert. Wenn der User gerade manuell ein Item angeklickt hat,
    // URL-Routing nicht anwenden – Popup und Filter wurden bereits korrekt gesetzt.
    if (window.app?.searchHeader?._manualSpaceClick) return;
    this._isOnLocationRoute = true;
    if (this.searchManager.pillsManager) this.searchManager.pillsManager.clear();
    if (this.styleFilterManager) {
      this.styleFilterManager.selectedStyles.clear();
      this.styleFilterManager.applyPreFilters(locations);
    }
    this.searchManager.createSuggestionItems(locations);
    this.searchManager.updateSearchCounter(locations.length);
    this.searchManager.updateDropdownUI(true);
    this.zoomToLocations(locations);
    if (locations.length === 1) setTimeout(() => this.openLocationPopup(locations[0]), 500);

    // Meta Update
    if (locations.length === 1) {
      const loc = locations[0];
      const cc = appContext.mapIcons?.getCountryCode(loc.loc?.country).toUpperCase();
      const plz = loc.loc?.plz ? window.zfill(loc.loc.plz, loc.loc.country) : ''; // zfill: step 5
      this.updatePageMeta(`makerspac.es > ${cc}-${plz} ${loc.loc?.city} > ${loc.name}`, `View ${loc.name} on the map`, loc);
    }
  }

  zoomToLocations(locations) {
    if ('ontouchstart' in window) return; // Touch-Geräte (Phone + Tablet): kein URL-getriggerter Zoom
    if (window.app?.searchHeader?._manualSpaceClick) return; // Kein Zoom bei direktem Marker-Klick/Tap
    if (!appContext.map || locations.length === 0) return;
    if (locations.length === 1) {
      appContext.map.setView([locations[0].loc.lat, locations[0].loc.long], 15);
    } else {
      const bounds = L.latLngBounds(locations.map(loc => [loc.loc.lat, loc.loc.long]));
      appContext.map.fitBounds(bounds, { padding: [12, 12] });
    }
  }

  openLocationPopup(location) {
    const marker = appContext.markerById.get(location.ID);
    if (marker) marker.openPopup();
  }

  createLocationURL(locationIds, includeNames = true) {
    if (!locationIds.length) return '';
    if (locationIds.length > 1) return `#/bookmarks/${locationIds.join(',')}`;
    const loc = appContext.locationById.get(locationIds[0]);
    if (!loc) return '';
    const slug = `${this.normalizeSlug(loc.loc.country)}/${this.normalizeSlug(loc.loc.city)}/${loc.ID}`;
    return includeNames ? `#/${slug}/${this.normalizeSlug(loc.name)}` : `#/${slug}`;
  }

  navigateToLocations(locationIds) {
    const url = this.createLocationURL(locationIds, true);
    if (url) {
      this._isOnLocationRoute = true;
      this._setHash(url);
      if (locationIds.length === 1) {
        const loc = appContext.locationById.get(locationIds[0]);
        if (loc) {
          const cc = appContext.mapIcons?.getCountryCode(loc.loc?.country)?.toUpperCase() || '';
          const plz = loc.loc?.plz ? window.zfill?.(loc.loc.plz, loc.loc.country) ?? '' : '';
          this.updatePageMeta(`makerspac.es > ${cc}-${plz} ${loc.loc?.city} > ${loc.name}`, `View ${loc.name} on the map`, loc);
        }
      }
    }
  }

  clearLocationURL() {
    const isBookmarkFilterActive = this.styleFilterManager?.selectedStyles?.has('bookmarked');
    if (isBookmarkFilterActive && appContext.bookmarks) {
      const ids = appContext.bookmarks.getBookmarkedIds();
      if (ids.length > 0) { this.navigateToLocations(ids); return; }
    }
    const pills = this.searchManager?.pillsManager?.getPillsArray() || [];
    pills.length > 0 ? this.updateURLFromPills(pills) : this._setHash('');
  }

  /**
   * Programmatische Hash-Änderung — _isNavigating unterdrückt den dadurch
   * ausgelösten eigenen hashchange-Handler (handleRouteWithPills).
   * Achtung: Wo VOR der Hash-Änderung noch Pill-Callbacks laufen
   * (applyCountryFilter, clearAllPillsAndFilters), muss das Flag zusätzlich
   * schon früher gesetzt werden — siehe Kommentare dort.
   * @param {string} hash
   */
  _setHash(hash) {
    this._isNavigating = true;
    window.location.hash = hash;
  }

  /**
   * Verlässt Country- und Location-Route und leert den URL-Hash.
   * Für User-Clear-Aktionen (Suchbegriff gelöscht, Escape, Alle-Filter-löschen).
   */
  resetRouteState() {
    this._activeCountryFilter = null;
    this._isOnLocationRoute = false;
    this._setHash('');
    this._afterNavigation(() => {});
  }
}