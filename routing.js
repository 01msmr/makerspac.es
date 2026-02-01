// routing.js (ES MODULE)
// URL-basiertes Routing für Filter + Pills, NEU: **HASH-MODE**

export class RoutingManager {
  constructor(styleFilterManager, searchManager, json) {
    window.routingManager = this; // <--- Das muss ganz oben stehen!
    this.styleFilterManager = styleFilterManager;
    this.searchManager = searchManager;
    this.json = json;

    // === Daten vorbereiten: Initialisierung verzögern (Private Properties) ===
    this._countries = null;
    this._routes = null;
    this._citiesWithMultipleSpaces = null;
    this._cityRoutes = null;

    // ✅ NEU: Flag um hashchange nach eigenem navigateToLocations zu ignorieren
    this._isNavigating = false;

    // ✅ Flag: Zeigt an, dass wir gerade eine Location-Route anzeigen
    this._isOnLocationRoute = false;

    // ✅ Aktiver Country-Filter (für URL-Updates)
    this._activeCountryFilter = null;

    // ✨ NEU: Übersetzungstabelle für Städte (Deutsch -> Englisch für Slugs)
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

    console.log('✅ RoutingManager constructor called (Hash Mode)');

    // Init mit Pills-Support
    this.initRoutingListeners();
  }

  // === LAZY GETTER: Stellt sicher, dass die Daten nur einmal geladen werden ===
  _ensureDataLoaded() {
    // 1. Prüft, ob die Extraktion bereits erfolgreich war
    if (this._countries !== null) return;

    // 2. Prüft, ob this.json gefüllt ist. Wenn nicht, brechen wir ab.
    if (this.json.length === 0) {
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

  /**
   * ✅ Finde Country-Name anhand von Slug
   */
  findCountryBySlug(slug) {
    this._ensureDataLoaded();
    const countries = this._countries || [];

    for (const country of countries) {
      if (this.countryToSlug(country) === slug) {
        return country;
      }
    }
    return null;
  }

  /**
   * ✅ Finde City-Name anhand von Slug (mit Translation-Support)
   */
  findCityBySlug(slug) {
    this._ensureDataLoaded();

    // Prüfe alle Städte in den Daten
    for (const location of this.json) {
      const city = location.loc?.city;
      if (city && city !== 'CITY_CITY') {
        const citySlug = this.cityToSlug(city);
        if (citySlug === slug) {
          return city;
        }
      }
    }
    return null;
  }



  /**
 * ✅ Schützt Favoriten beim Togglen des Headers.
 */
  applyCountryFilter(countryName) {
    const bar = this.searchManager.searchBar;
    const SearchTerm = bar.value;

    this._isNavigating = true;

    // Deaktivieren wenn schon aktiv
    if (this._activeCountryFilter === countryName) {
      this.clearAllPillsAndFilters();
      return;
    }

    // Aktivieren
    this._activeCountryFilter = countryName;

    if (this.searchManager?.pillsManager) {
      this.searchManager.pillsManager.clear();
    }

    window.location.hash = `#/${this.countryToSlug(countryName)}`;

    setTimeout(() => {
      bar.value = SearchTerm;
      if (this.searchManager) {
        // Hier bleiben Favoriten/Styles aktiv, da wir selectedStyles nicht löschen.
        this.searchManager.applyPillFilters([]);
      }
      this._isNavigating = false;
    }, 50);
  }



  /**
   * ✅ Aktiviere City-Filter (als Pill!)
   */
  applyCityFilter(cityName) {
    console.log(`🏙️ City selected: ${cityName}. Clearing country filter.`);

    // 1. Country-Filter explizit deaktivieren
    this._activeCountryFilter = null;

    // 2. City-Pill erstellen
    const cityPill = {
      text: cityName,
      type: 'city',
      count: this.json.filter(loc => loc.loc?.city === cityName).length
    };

    // 3. Pills setzen
    if (this.searchManager?.pillsManager) {
      this.searchManager.pillsManager.clear();
      this.searchManager.pillsManager.addPill(cityPill); // Triggert applyPillFilters
    }

    // 4. URL auf City-Ebene aktualisieren (Löscht #/germany und setzt #/germany/berlin)
    this.updateURLFromPills([cityPill]);
  }


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
    return str
      .trim() // ✨ HINZUGEFÜGT: Entfernt führende/anhängende Leerzeichen
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

  // ✨ ENTFERNT: getQueryPath() ist im Hash-Mode nicht mehr nötig

  updateURLFromPills(pills) {
    this._ensureDataLoaded();

    const slugs = pills
      .map(p => this.findSlugByPill(p))
      .filter(Boolean);

    // Format: #/slug1+slug2
    const newHash = slugs.length > 0 ? `#/${slugs.join('+')}` : '';

    // ✅ Nutze window.location.hash statt history.pushState
    // Das triggert hashchange-Event, sodass handleRouteWithPills() aufgerufen wird
    if (newHash !== window.location.hash) {
      this._isNavigating = true; // Verhindere Loop
      window.location.hash = newHash || ''; // Setze Hash oder lösche ihn
    }
  }

  findSlugByPill(pill) {
    this._ensureDataLoaded();

    // Fallback-Listen für sicheren Zugriff
    const cityRoutes = this._cityRoutes || new Map();
    const routes = this._routes || {};

    // ✅ COUNTRY ENTFERNT - wird als Filter gehandhabt, nicht als Pill!

    // ✅ City Slug HIERARCHISCH: country/city
    if (pill.type === 'city') {
      const cityName = pill.text;
      const citySlug = this.cityToSlug(cityName);

      // Finde das Land dieser Stadt
      const location = this.json.find(loc => loc.loc?.city === cityName);
      if (location && location.loc?.country) {
        const countrySlug = this.countryToSlug(location.loc.country);
        return `${countrySlug}/${citySlug}`;  // ✅ Hierarchisch!
      }

      // Fallback: nur City (sollte nicht vorkommen)
      return citySlug;
    }

    // Style Slugs
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

    let path = hash.slice(2);

    // ✅ Entferne trailing slash: #/germany/ → germany
    path = path.replace(/\/$/, '');

    if (!path) return [];

    // ✅ Verhindere hierarchische URLs als Pills
    if (path.includes('/')) return [];

    const slugs = path.split('+');
    return slugs
      .map(slug => this.findPillBySlug(slug))
      .filter(Boolean);
  }

  findPillBySlug(slug) {
    this._ensureDataLoaded();

    // Fallback auf leere Strukturen
    const countries = this._countries || [];
    const cityRoutes = this._cityRoutes || new Map();
    const routes = this._routes || {};

    // ✅ COUNTRY ENTFERNT - wird jetzt als Filter gehandhabt, nicht als Pill!

    // 1. Suche nach CITY
    let foundCityName = null;

    // A. Prüfe CityRoutes (mit Kollisions-Slugs)
    for (const [routeSlug, city] of cityRoutes) {
      if (routeSlug === slug) { // Prüft auf z.B. 'city-berlin'
        foundCityName = city;
        break;
      }
    }

    // B. Fallback: Prüfe alle Städte direkt (für Slugs ohne Kollisionspräfix)
    if (!foundCityName) {
      // ✨ KORREKTUR: Direkte Suche über die Rohdaten für den kanonischen Namen
      for (const loc of this.json) {
        if (loc.loc?.city) {
          // Muss den Slug des *kanonischen* Namens (z.B. "Munich") mit dem Slug aus der URL vergleichen.
          const expectedSlug = this.cityToSlug(loc.loc.city);

          if (expectedSlug === slug) {
            foundCityName = loc.loc.city;
            break;
          }
        }
      }
    }

    // Wenn ein City-Name gefunden wurde
    if (foundCityName) {
      return { text: foundCityName, type: 'city', count: this._countLocationsByCity(foundCityName) };
    }

    // 2. Suche nach STYLE
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
  // COUNTS (Private, da sie intern sind)
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
    // Wenn Titel schon mit "makerspac.es" beginnt, nicht nochmal anhängen
    document.title = title.startsWith('makerspac.es') ? title : `${title} | makerspac.es`;

    let meta = document.querySelector('meta[name="description"]');
    if (!meta) {
      meta = document.createElement('meta');
      meta.name = 'description';
      document.head.appendChild(meta);
    }
    meta.content = desc;
  }

  // ✨ NEU: Erzwingt einen erneuten Aufruf der Routenbehandlung
  rerunRouteHandler() {
    console.log('🔄 Rerunning route handler after data load.');
    this._ensureDataLoaded(); // Stellt sicher, dass die Daten extrahiert werden
    this.handleRouteWithPills();
  }

  // ========================================
  // ROUTING CORE
  // ========================================



  /**
 * ✅ Schützt Favoriten, wenn die URL leer ist.
 */
  clearAllPillsAndFilters() {
    console.log("🌍 Routing-Info: Deaktiviere Land. Stadt-Pills und Style-Filter bleiben aktiv.");

    // ✅ FIX: Nur Country-Filter deaktivieren, Pills und Style-Filter NICHT löschen
    this._activeCountryFilter = null;

    // Text retten
    const bar = this.searchManager?.searchBar;
    const rescuedText = bar ? bar.value : '';

    this._isNavigating = true;

    // ✅ FIX: URL-Update berücksichtigt Bookmarks und Pills
    const currentPills = this.searchManager?.pillsManager?.getPillsArray() || [];
    const hasBookmarkFilter = this.styleFilterManager?.selectedStyles?.has('bookmarked');

    if (hasBookmarkFilter && window.bookmarkManager) {
      // Bookmark-Filter aktiv → URL auf Bookmark-IDs setzen
      const allBookmarkedIds = window.bookmarkManager.getBookmarkedIds();
      if (allBookmarkedIds.length > 0) {
        this.navigateToLocations(allBookmarkedIds);
      } else {
        // Keine Bookmarks → URL leeren
        window.location.hash = '';
      }
    } else if (currentPills.length > 0) {
      // Pills vorhanden → URL auf Pills-Basis setzen
      this.updateURLFromPills(currentPills);
    } else {
      // Nichts aktiv → URL komplett leeren
      window.location.hash = '';
    }

    // ✅ FIX: applyPillFilters mit den aktuellen Pills
    setTimeout(() => {
      if (bar) bar.value = rescuedText;
      if (this.searchManager) {
        this.searchManager.applyPillFilters(currentPills);
      }
      this._isNavigating = false;
    }, 50);
  }





  handleRouteWithPills() {
    this._ensureDataLoaded(); // <--- DATEN LADEN BEI ERSTEM AUFRUF

    // ✅ LÖSUNG 2: Ignoriere hashchange wenn WIR die URL gesetzt haben
    if (this._isNavigating) {
      console.log('🔒 Ignoring hashchange - was set by navigateToLocations');
      this._isNavigating = false;
      return;
    }

    const hash = window.location.hash;

    // ✅ KURZ-URL: #/123 → Umleitung zu hierarchischer URL
    const shortIdMatch = hash.match(/^#\/(\d+)$/);
    if (shortIdMatch) {
      const id = parseInt(shortIdMatch[1], 10);
      const location = window.locationById.get(id);
      if (location) {
        this.navigateToLocations([id]);
        return;
      }
    }

    // ✅ BOOKMARK-ROUTING: #/bookmarks/1,5,12
    if (hash.startsWith('#/bookmarks/')) {
      this.handleBookmarkRoute(hash);
      return;
    }

    // ✅ HIERARCHISCHES ROUTING: #/country/city/ID/name
    // Format: #/germany/markdorf/1/toolbox-bodensee
    // Regex: Land/Stadt/ID(s)/optionaler-Name
    const hierarchicalMatch = hash.match(/^#\/([^/]+)\/([^/]+)\/(\d+(?:,\d+)*)/);
    if (hierarchicalMatch) {
      this.handleLocationRoute(hash);
      return;
    }

    // ✅ Kein Location-Route Match → Flag zurücksetzen
    this._isOnLocationRoute = false;

    // ✅ COUNTRY-FILTER: #/germany oder #/germany/
    // Prüfe ob URL ein einzelnes Land ist (mit optionalem trailing slash)
    const singleCountryMatch = hash.match(/^#\/([^/+]+)\/?$/);
    if (singleCountryMatch) {
      const slug = singleCountryMatch[1];
      const countryName = this.findCountryBySlug(slug);

      if (countryName) {
        // Aktiviere Country-Filter (KEIN Pill!)
        this.applyCountryFilter(countryName);
        return;
      }
    }

    // ✅ CITY-FILTER: #/country/city oder #/country/city/
    const countryCityMatch = hash.match(/^#\/([^/+]+)\/([^/+]+)\/?$/);
    if (countryCityMatch) {
      const countrySlug = countryCityMatch[1];
      const citySlug = countryCityMatch[2];

      const countryName = this.findCountryBySlug(countrySlug);
      const cityName = this.findCityBySlug(citySlug);

      if (countryName && cityName) {
        // Aktiviere City-Filter (als Pill!)
        this.applyCityFilter(cityName);
        return;
      }
    }

    const pills = this.loadPillsFromURL();

    // Debugging-Zeile
    console.log(`🔎 Route Handler: Hash='${hash}', Pills found: ${pills.length > 0 ? pills.map(p => p.text).join(', ') : 'None'}`);

    if (!pills.length) {
      this.clearAllPillsAndFilters();
      // ✅ Titel nur setzen wenn NICHT auf einer Location-Route
      if (!this._isOnLocationRoute) {
        this.updatePageMeta(
          'Makerspace Map',
          'Find makerspaces, fablabs and hackerspaces in Germany, Austria and Switzerland'
        );
      }
      return;
    }

    if (this.searchManager?.pillsManager) {
      // ✅ Lösche aktiven Country-Filter
      this._activeCountryFilter = null;

      this.searchManager.pillsManager.loadPills(pills);
      this.updatePageMeta(
        `Makerspaces in ${pills.map(p => p.text).join(', ')}`,
        `Find makerspaces in ${pills.map(p => p.text).join(', ')}`
      );
    } else {
      console.error('❌ FATAL: SearchPillsManager is null during route handling.');
    }
  }

  initRoutingListeners() {
    // Horcht auf Änderungen des Hash-Fragments (z.B. manuelles Ändern oder Back/Forward-Button)
    window.addEventListener('hashchange', () => this.handleRouteWithPills());

    // Initialer Aufruf
    this.handleRouteWithPills();

    console.log('✅ RoutingManager initialized with Hash listeners');
  }

  // ========================================
  // ✅ NEU: ID-BASIERTES ROUTING
  // ========================================

  /**
   * ✅ BOOKMARK ROUTING
   * Handling für URLs: #/bookmarks/ID1,ID2,ID3
   * 
   * Beispiel:
   * - #/bookmarks/1,5,12 → IDs 1, 5, 12
   */
  handleBookmarkRoute(hash) {
    // Format: #/bookmarks/IDs
    const idsString = hash.replace('#/bookmarks/', '');

    console.log(`🔖 Bookmark route: ${idsString}`);

    // Parse IDs
    const ids = idsString.split(',').map(id => parseInt(id.trim(), 10)).filter(id => !isNaN(id));

    if (ids.length === 0) {
      console.warn('⚠️ No valid IDs in bookmark route');
      return;
    }

    // Hole Locations per ID (✅ O(1) Lookup!)
    const locations = ids.map(id => window.locationById.get(id)).filter(Boolean);

    if (locations.length === 0) {
      console.warn('⚠️ No locations found for IDs:', ids);
      return;
    }

    console.log(`✅ Found ${locations.length} location(s) for IDs:`, ids);

    // Zeige diese Locations
    this.showLocations(locations, ids);
  }

  /**
   * ✅ HIERARCHISCHES ROUTING
   * Handling für URLs: #/country/city/ID/name
   * 
   * Beispiele:
   * - #/germany/markdorf/1/toolbox-bodensee → ID 1
   * - #/germany/berlin/5,12 → IDs 5, 12 (mehrere Spaces)
   * - #/austria/vienna/42/happylab → ID 42
   */
  handleLocationRoute(hash) {
    // Format: #/country/city/IDs[/name]
    // Extrahiere IDs aus Position 3
    const parts = hash.substring(2).split('/'); // Entferne #/
    const country = parts[0];
    const city = parts[1];
    const idsString = parts[2];
    const name = parts[3]; // optional

    console.log(`🌍 Hierarchical route: ${country}/${city}/${idsString}${name ? '/' + name : ''}`);

    const ids = idsString.split(',')
      .map(id => parseInt(id.trim(), 10))
      .filter(id => !isNaN(id) && id > 0);

    console.log('📍 Location route detected:', ids);

    if (ids.length === 0) {
      console.warn('⚠️ No valid IDs found in route');
      this.clearAllPillsAndFilters();
      return;
    }

    // Hole Locations per ID (O(1) Zugriff!)
    const locations = ids
      .map(id => window.locationById.get(id))
      .filter(loc => loc !== undefined);

    if (locations.length === 0) {
      console.warn('⚠️ No locations found for IDs:', ids);
      this.clearAllPillsAndFilters();
      return;
    }

    console.log(`✅ Found ${locations.length} location(s) for IDs:`, ids);

    // Zeige diese Locations
    this.showLocations(locations, ids);
  }

  /**
   * Zeige spezifische Locations auf der Karte
   */
  showLocations(locations, ids) {
    if (!this.searchManager) {
      console.error('❌ SearchManager not available');
      return;
    }

    // ✅ Flag setzen BEVOR pillsManager.clear() Events triggert
    this._isOnLocationRoute = true;

    // Clear Pills (ID-Route hat keine Pills)
    if (this.searchManager.pillsManager) {
      this.searchManager.pillsManager.clear();
    }

    // Clear Style-Filter
    if (this.styleFilterManager) {
      this.styleFilterManager.selectedStyles.clear();
    }

    // Setze Pre-Filter auf diese Locations
    if (this.styleFilterManager) {
      this.styleFilterManager.applyPreFilters(locations);
    }

    // ✅ NEU: Bei einem Space → Setze Name in Searchbar
    if (locations.length === 1 && this.searchManager.searchBar) {
      this.searchManager.searchBar.value = locations[0].name;
    }

    // Update Search-Dropdown
    this.searchManager.createSuggestionItems(locations);
    this.searchManager.updateSearchCounter(locations.length);
    this.searchManager.updateDropdownUI(true);

    // Zoom auf diese Locations
    this.zoomToLocations(locations);

    // Wenn nur eine Location: Öffne Popup nach kurzem Delay
    if (locations.length === 1) {
      setTimeout(() => {
        this.openLocationPopup(locations[0]);
      }, 500); // Warte bis Zoom fertig
    }

    // Update Page Meta
    const names = locations.map(l => l.name).join(', ');
    if (locations.length === 1) {
      const loc = locations[0];
      const plz = loc.loc?.plz || '';
      const city = loc.loc?.city || '';
      // Format: makerspac.es > PLZ City > Makerspace Name
      this.updatePageMeta(
        `makerspac.es > ${plz} ${city} > ${loc.name}`,
        `View ${loc.name} in ${plz} ${city} on the map`
      );
    } else {
      this.updatePageMeta(
        `${locations.length} Makerspaces`,
        `View ${names} on the map`
      );
    }
  }

  /**
   * Zoom auf Locations
   */
  zoomToLocations(locations) {
    if (!window.map || locations.length === 0) return;

    if (locations.length === 1) {
      // Einzelne Location: Direkter Zoom
      const loc = locations[0];
      window.map.setView([loc.loc.lat, loc.loc.long], 15);
    } else {
      // Mehrere Locations: Fit Bounds
      const bounds = L.latLngBounds(
        locations.map(loc => [loc.loc.lat, loc.loc.long])
      );
      window.map.fitBounds(bounds, { padding: [50, 50] });
    }
  }

  /**
   * Öffne Popup für eine Location
   */
  openLocationPopup(location) {
    const marker = window.markerById.get(location.ID);
    if (marker) {
      marker.openPopup();
      console.log('📍 Opened popup for:', location.name);
    }
  }

  /**
   * ✅ Erstelle Location-URL (hierarchisch oder Bookmark)
   * 
   * Einzelner Space: #/country/city/ID/name (hierarchisch)
   * Mehrere Spaces: #/bookmarks/ID1,ID2,ID3 (flach)
   * 
   * Beispiele: 
   * - createLocationURL([1]) → "#/germany/markdorf/1/toolbox-bodensee"
   * - createLocationURL([1, 5, 12]) → "#/bookmarks/1,5,12"
   */
  createLocationURL(locationIds, includeNames = true) {
    if (!Array.isArray(locationIds) || locationIds.length === 0) {
      return '';
    }

    // Mehrere Spaces → Bookmark-URL
    if (locationIds.length > 1) {
      return `#/bookmarks/${locationIds.join(',')}`;
    }

    // Einzelner Space → Hierarchische URL
    const location = window.locationById.get(locationIds[0]);
    if (!location) {
      console.warn('⚠️ Location not found:', locationIds[0]);
      return '';
    }

    const country = location.loc?.country;
    const city = location.loc?.city;

    if (!country || !city) {
      console.warn('⚠️ Location missing country or city:', location);
      return '';
    }

    // Normalisiere zu Slugs
    const countrySlug = this.normalizeSlug(country);
    const citySlug = this.normalizeSlug(city);
    const id = locationIds[0];

    if (includeNames && location.name) {
      const nameSlug = this.normalizeSlug(location.name);
      return `#/${countrySlug}/${citySlug}/${id}/${nameSlug}`;
    }

    // Ohne Namen
    return `#/${countrySlug}/${citySlug}/${id}`;
  }

  /**
   * ✅ NEU: Navigiere zu Location(s) per ID
   * Bei einem Space: URL enthält Namen-Slug
   * Bei mehreren Spaces: Nur IDs
   */
  navigateToLocations(locationIds) {
    const url = this.createLocationURL(locationIds, true); // true = Namen inkludieren
    if (url) {
      // ✅ LÖSUNG 2: Setze Flag VOR Hash-Änderung
      this._isNavigating = true;
      this._isOnLocationRoute = true;
      window.location.hash = url;

      // ✅ Titel sofort setzen (für Lesezeichen)
      if (locationIds.length === 1) {
        const location = window.locationById.get(locationIds[0]);
        if (location) {
          const plz = location.loc?.plz || '';
          const city = location.loc?.city || '';
          document.title = `makerspac.es > ${plz} ${city} > ${location.name}`;
        }
      } else {
        document.title = `${locationIds.length} Makerspaces | makerspac.es`;
      }
    }
  }

  /**
   * ✅ NEU: Zurücksetzen der Location-URL
   * Kehrt zurück zu Bookmark-URL, Filter-URL oder Home
   */
  clearLocationURL() {
    // ✅ Prüfe zuerst ob Bookmark-Filter aktiv ist
    const isBookmarkFilterActive = this.styleFilterManager?.selectedStyles?.has('bookmarked');

    if (isBookmarkFilterActive && window.bookmarkManager) {
      // Bookmark-Filter aktiv → Zurück zu Bookmark-URLs
      const allBookmarkedIds = window.bookmarkManager.getBookmarkedIds();
      if (allBookmarkedIds.length > 0) {
        this.navigateToLocations(allBookmarkedIds);
        return;
      }
    }

    // Prüfe ob Pills aktiv sind
    const pills = this.searchManager?.pillsManager?.getPillsArray() || [];

    if (pills.length > 0) {
      // Zurück zur Filter-URL (Pills)
      this.updateURLFromPills(pills);
    } else {
      // Zurück zu Home (keine Filter)
      this._isNavigating = true;
      window.location.hash = '';
    }
  }
}