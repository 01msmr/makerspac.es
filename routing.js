// routing.js (ES MODULE)
// URL-basiertes Routing für Filter + Pills, NEU: **HASH-MODE** mit Hierarchie-Support

export class RoutingManager {
  constructor(styleFilterManager, searchManager, json) {
    this.styleFilterManager = styleFilterManager;
    this.searchManager = searchManager;
    this.json = json;

    // === Daten vorbereiten: Initialisierung verzögern (Private Properties) ===
    this._countries = null;
    this._routes = null;
    this._citiesWithMultipleSpaces = null;
    this._cityRoutes = null;

    // ✅ Flag um hashchange nach eigenem navigateToLocations zu ignorieren
    this._isNavigating = false;

    // ✨ Übersetzungstabelle für Städte (Deutsch -> Englisch für Slugs)
    this._cityTranslationMap = {
      'München': 'Munich',
      'Köln': 'Cologne',
      'Nürnberg': 'Nuremberg',
      'Wien': 'Vienna',
      'Zürich': 'Zurich',
      'Genf': 'Geneva',
      'Basel': 'Basel',
      'Graz': 'Graz',
      'Linz': 'Linz',
      'Bern': 'Bern'
      // Weitere Städte könnten hier bei Bedarf hinzugefügt werden
    };

    console.log('✅ RoutingManager constructor called (Hash Mode & Hierarchical Support)');

    // Init mit Pills-Support
    this.initRoutingListeners();
  }

  // === LAZY GETTER: Stellt sicher, dass die Daten nur einmal geladen werden ===
  _ensureDataLoaded() {
    // 1. Prüft, ob die Extraktion bereits erfolgreich war
    if (this._countries !== null) return;

    // 2. Prüft, ob this.json gefüllt ist. Wenn nicht, brechen wir ab.
    if (!this.json || this.json.length === 0) {
      return;
    }

    // DATENEXTRAKTION WIRD JETZT AUSGEFÜHRT (mit korrekter Reihenfolge)
    this._countries = this._findAllCountries();
    this._citiesWithMultipleSpaces = this._findCitiesWithMultipleSpaces();
    this._routes = this._createRoutes();
    this._cityRoutes = this._createCityRoutes();

    console.log('--- DEBUG: Routing Data Loaded LAZY ---');
    console.log(`JSON Data Length: ${this.json.length}`);
    console.log(`Countries: ${this._countries.slice(0, 3)}... (${this._countries.length})`);
    console.log(`Cities with multiple spaces: ${this._citiesWithMultipleSpaces.size}`);
    console.log('--------------------------------------');
  }

  // ========================================
  // DATA EXTRACTION (Private Helfer)
  // ========================================

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
      if (city && city !== 'CITY_CITY') {
        counts.set(city, (counts.get(city) || 0) + 1);
      }
    });

    const result = new Map();
    counts.forEach((count, city) => {
      if (count >= 2) result.set(city, count);
    });
    return result;
  }

  // ========================================
  // ROUTES & SLUGS
  // ========================================

  _createRoutes() {
    const routes = {};

    this._countries.forEach(country => {
      routes[this.countryToSlug(country)] = {
        type: 'country',
        value: country
      };
    });

    routes['for-all'] = { type: 'style', value: 'for all' };
    routes['for-students'] = { type: 'style', value: 'for students' };
    routes['for-youth'] = { type: 'style', value: 'for youth' };
    routes['commercial'] = { type: 'style', value: 'commercial' };
    routes['open'] = { type: 'style', value: 'open' };
    routes['closed'] = { type: 'style', value: 'closed' };

    return routes;
  }

  _createCityRoutes() {
    const cityRoutes = new Map();

    this._citiesWithMultipleSpaces.forEach((_, city) => {
      const slug = this.cityToSlug(city);
      // Kollisionsprüfung: Wenn Slug bereits vergeben (z.B. durch ein Land)
      if (this._routes[slug]) {
        cityRoutes.set(`city-${slug}`, city);
      } else {
        cityRoutes.set(slug, city);
      }
    });

    return cityRoutes;
  }

  countryToSlug(str) {
    return this.normalizeSlug(str);
  }

  cityToSlug(str) {
    // 1. Prüfe, ob eine englische/kanonische Übersetzung existiert
    const translatedCity = this._cityTranslationMap[str] || str;

    // 2. Erzeuge Slug aus der (ggf. übersetzten) Zeichenkette
    return this.normalizeSlug(translatedCity);
  }

  normalizeSlug(str) {
    if (!str) return '';
    return str
      .trim()
      .toLowerCase()
      .replace(/ä/g, 'ae')
      .replace(/ö/g, 'oe')
      .replace(/ü/g, 'ue')
      .replace(/ß/g, 'ss')
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9-]/g, '');
  }

  // ========================================
  // URL HELPERS (HASH-MODE)
  // ========================================

  updateURLFromPills(pills) {
    this._ensureDataLoaded();

    const slugs = pills
      .map(p => this.findSlugByPill(p))
      .filter(Boolean);

    // Format: #/slug1+slug2
    const newHash = slugs.length > 0 ? `#/${slugs.join('+')}` : '';

    if (newHash !== window.location.hash) {
      const newPath = newHash || window.location.pathname;
      history.pushState(null, '', newPath);
    }
  }

  findSlugByPill(pill) {
    this._ensureDataLoaded();

    const cityRoutes = this._cityRoutes || new Map();
    const routes = this._routes || {};

    if (pill.type === 'country') {
      return this.countryToSlug(pill.text);
    }

    if (pill.type === 'city') {
      for (const [routeSlug, city] of cityRoutes) {
        if (city === pill.text) {
          return routeSlug;
        }
      }
      return this.cityToSlug(pill.text);
    }

    if (pill.type === 'style') {
      const slug = Object.keys(routes).find(key => routes[key].value === pill.text);
      return slug;
    }

    return null;
  }

  // ========================================
  // PILLS <-> URL (HASH-MODE)
  // ========================================

  loadPillsFromURL() {
    this._ensureDataLoaded();

    const hash = window.location.hash;
    if (!hash || !hash.startsWith('#/')) return [];

    // Der Pfad ist nun der Hash-Teil ohne das # und ohne das /
    const path = hash.slice(2);

    // Verhindere Interpretation von Hierarchie-URLs als Pills
    if (!path || path.includes('/')) return [];

    const slugs = path.split('+');
    return slugs
      .map(slug => this.findPillBySlug(slug))
      .filter(Boolean);
  }

  findPillBySlug(slug) {
    this._ensureDataLoaded();

    const countries = this._countries || [];
    const cityRoutes = this._cityRoutes || new Map();
    const routes = this._routes || {};

    // 1. Suche nach COUNTRY
    for (const c of countries) {
      const countrySlug = this.countryToSlug(c);
      if (countrySlug === slug) {
        return { text: c, type: 'country', count: this._countLocationsByCountry(c) };
      }
    }

    // 2. Suche nach CITY: Aggressive Suche über alle Cities
    let foundCityName = null;

    // A. Prüfe CityRoutes (mit Kollisions-Slugs)
    for (const [routeSlug, city] of cityRoutes) {
      if (routeSlug === slug) {
        foundCityName = city;
        break;
      }
    }

    // B. Fallback: Prüfe alle Städte direkt
    if (!foundCityName) {
      for (const loc of this.json) {
        if (loc.loc?.city) {
          const expectedSlug = this.cityToSlug(loc.loc.city);
          if (expectedSlug === slug) {
            foundCityName = loc.loc.city;
            break;
          }
        }
      }
    }

    if (foundCityName) {
      return { text: foundCityName, type: 'city', count: this._countLocationsByCity(foundCityName) };
    }

    // 3. Suche nach STYLE
    if (routes[slug]?.type === 'style') {
      const style = routes[slug].value;
      return {
        text: style,
        type: 'style',
        filterKey: style,
        count: this._countLocationsByStyle(style)
      };
    }

    return null;
  }

  // ========================================
  // COUNTS (Private)
  // ========================================

  _countLocationsByCountry(c) {
    return this.json.filter(l => l.loc?.country === c).length;
  }

  _countLocationsByCity(c) {
    return this.json.filter(l => l.loc?.city === c).length;
  }

  _countLocationsByStyle(style) {
    if (style === 'open') return this.json.filter(l => l.isOpen === true).length;
    if (style === 'closed') return this.json.filter(l => l.isOpen === false).length;
    return this.json.filter(l => l.style === style).length;
  }

  // ========================================
  // META
  // ========================================

  updatePageMeta(title, desc) {
    document.title = `${title} | makerspac.es`;

    let meta = document.querySelector('meta[name="description"]');
    if (!meta) {
      meta = document.createElement('meta');
      meta.name = 'description';
      document.head.appendChild(meta);
    }
    meta.content = desc;
  }

  rerunRouteHandler() {
    console.log('🔄 Rerunning route handler after data load.');
    this._ensureDataLoaded();
    this.handleRouteWithPills();
  }

  // ========================================
  // ROUTING CORE
  // ========================================

  clearAllPillsAndFilters() {
    this.styleFilterManager?.selectedStyles?.clear();
    this.styleFilterManager?.applyFilters();

    if (this.searchManager?.pillsManager) {
      this.searchManager.pillsManager.clear();
      this.searchManager.searchBar.value = '';
    } else {
      this.searchManager?.clearSearchAndPills();
    }
  }

  handleRouteWithPills() {
    this._ensureDataLoaded();

    if (this._isNavigating) {
      console.log('🔒 Ignoring hashchange - was set by navigateToLocations');
      this._isNavigating = false;
      return;
    }

    const hash = window.location.hash;

    // ✅ HIERARCHISCHES ROUTING DETECTION
    const hierarchicalMatch = hash.match(/^#\/([^/]+)\/([^/]+)\/(\d+(?:,\d+)*)/);

    if (hierarchicalMatch || hash.startsWith('#/location/')) {
      this.handleLocationRoute(hash);
      return;
    }

    const pills = this.loadPillsFromURL();

    if (!pills.length) {
      this.clearAllPillsAndFilters();
      this.updatePageMeta(
        'Makerspace Map',
        'Find makerspaces, fablabs and hackerspaces in Germany, Austria and Switzerland'
      );
      return;
    }

    if (this.searchManager?.pillsManager) {
      this.searchManager.pillsManager.loadPills(pills);
      this.updatePageMeta(
        `Makerspaces in ${pills.map(p => p.text).join(', ')}`,
        `Find makerspaces in ${pills.map(p => p.text).join(', ')}`
      );
    }
  }

  initRoutingListeners() {
    window.addEventListener('hashchange', () => this.handleRouteWithPills());
    this.handleRouteWithPills();
    console.log('✅ RoutingManager initialized with Hash listeners');
  }

  // ========================================
  // ✅ ID-BASIERTES ROUTING (FIXED SYNTAX)
  // ========================================

  handleLocationRoute(hash) {
    let idsString = "";

    if (hash.startsWith('#/location/')) {
      idsString = hash.replace('#/location/', '');
      const slashIndex = idsString.indexOf('/');
      if (slashIndex > 0) {
        idsString = idsString.substring(0, slashIndex);
      }
    } else {
      const parts = hash.substring(2).split('/');
      idsString = parts[2] || "";
      console.log(`🌍 Hierarchical route detected: ${parts[0]}/${parts[1]}/${idsString}`);
    }

    const ids = idsString.split(',')
      .map(id => parseInt(id.trim(), 10))
      .filter(id => !isNaN(id) && id > 0);

    if (ids.length === 0) {
      this.clearAllPillsAndFilters();
      return;
    }

    const locations = ids
      .map(id => window.locationById.get(id))
      .filter(loc => loc !== undefined);

    if (locations.length === 0) {
      this.clearAllPillsAndFilters();
      return;
    }

    this.showLocations(locations, ids);
  }

  showLocations(locations, ids) {
    if (!this.searchManager) return;

    if (this.searchManager.pillsManager) {
      this.searchManager.pillsManager.clear();
    }

    if (this.styleFilterManager) {
      this.styleFilterManager.selectedStyles.clear();
      this.styleFilterManager.applyPreFilters(locations);
    }

    if (locations.length === 1 && this.searchManager.searchBar) {
      this.searchManager.searchBar.value = locations[0].name;
    }

    this.searchManager.createSuggestionItems(locations);
    this.searchManager.updateSearchCounter(locations.length);
    this.searchManager.updateDropdownUI(true);

    this.zoomToLocations(locations);

    if (locations.length === 1) {
      setTimeout(() => {
        this.openLocationPopup(locations[0]);
      }, 500);
    }

    const names = locations.map(l => l.name).join(', ');
    this.updatePageMeta(
      locations.length === 1 ? locations[0].name : `${locations.length} Makerspaces`,
      `View ${names} on the map`
    );
  }

  zoomToLocations(locations) {
    if (!window.map || locations.length === 0) return;

    if (locations.length === 1) {
      const loc = locations[0];
      window.map.setView([loc.loc.lat, loc.loc.long], 15);
    } else {
      const bounds = L.latLngBounds(
        locations.map(loc => [loc.loc.lat, loc.loc.long])
      );
      window.map.fitBounds(bounds, { padding: [50, 50] });
    }
  }

  openLocationPopup(location) {
    const marker = window.markerById.get(location.ID);
    if (marker) {
      marker.openPopup();
    }
  }

  createLocationURL(locationIds, includeNames = true) {
    if (!Array.isArray(locationIds) || locationIds.length === 0) return '';

    const firstLocation = window.locationById.get(locationIds[0]);
    if (!firstLocation) return '';

    const countrySlug = this.normalizeSlug(firstLocation.loc?.country || 'unknown');
    const citySlug = this.normalizeSlug(firstLocation.loc?.city || 'unknown');
    const idsString = locationIds.join(',');

    if (includeNames && locationIds.length === 1 && firstLocation.name) {
      const nameSlug = this.normalizeSlug(firstLocation.name);
      return `#/${countrySlug}/${citySlug}/${idsString}/${nameSlug}`;
    }

    return `#/${countrySlug}/${citySlug}/${idsString}`;
  }

  navigateToLocations(locationIds) {
    const url = this.createLocationURL(locationIds, true);
    if (url) {
      this._isNavigating = true;
      window.location.hash = url;
    }
  }

  clearLocationURL() {
    const isBookmarkFilterActive = this.styleFilterManager?.selectedStyles?.has('bookmarked');

    if (isBookmarkFilterActive && window.bookmarkManager) {
      const allBookmarkedIds = window.bookmarkManager.getBookmarkedIds();
      if (allBookmarkedIds.length > 0) {
        this.navigateToLocations(allBookmarkedIds);
        return;
      }
    }

    const pills = this.searchManager?.pillsManager?.getPillsArray() || [];

    if (pills.length > 0) {
      this.updateURLFromPills(pills);
    } else {
      this._isNavigating = true;
      window.location.hash = '';
    }
  }
}