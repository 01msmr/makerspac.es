// routing.js (ES MODULE)
// URL-basiertes Routing für Filter + Pills

export class RoutingManager {
  constructor(styleFilterManager, searchManager, json) {
    this.styleFilterManager = styleFilterManager;
    this.searchManager = searchManager;
    this.json = json; // <-- Referenz auf window.json

    // === Daten vorbereiten: Initialisierung verzögern (Private Properties) ===
    this._countries = null;
    this._routes = null;
    this._citiesWithMultipleSpaces = null;
    this._cityRoutes = null;

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

    console.log('✅ RoutingManager constructor called (Lazy Load - Final)');

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
  // URL HELPERS
  // ========================================

  getQueryPath() {
    if (window.location.search.startsWith('?')) {
      return decodeURIComponent(window.location.search.slice(1));
    }
    return null;
  }

  updateURLFromPills(pills) {
    this._ensureDataLoaded();

    const slugs = pills
      .map(p => this.findSlugByPill(p))
      .filter(Boolean);

    const newPath = slugs.length > 0 ? `/${slugs.join('+')}` : window.location.pathname;

    if (newPath !== window.location.pathname) {
      history.pushState(null, '', newPath);
    }
  }

  findSlugByPill(pill) {
    this._ensureDataLoaded();

    // Fallback-Listen für sicheren Zugriff
    const cityRoutes = this._cityRoutes || new Map();
    const routes = this._routes || {};

    if (pill.type === 'country') {
      return this.countryToSlug(pill.text);
    }

    // City Slug (mit oder ohne "city-" Präfix)
    if (pill.type === 'city') {
      // Prüfe Kollisionen
      for (const [routeSlug, city] of cityRoutes) {
        if (city === pill.text) {
          return routeSlug;
        }
      }
      // Fallback über alle Slugs
      return this.cityToSlug(pill.text);
    }

    // Style Slugs
    if (pill.type === 'style') {
      const slug = Object.keys(routes).find(key => routes[key].value === pill.text);
      return slug;
    }

    return null;
  }

  // ========================================
  // PILLS <-> URL
  // ========================================

  loadPillsFromURL() {
    this._ensureDataLoaded();
    const path = window.location.pathname.slice(1);
    if (!path) return [];

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
    document.title = `${title} | makerspac.es`;

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
    this._ensureDataLoaded(); // <--- DATEN LADEN BEI ERSTEM AUFRUF

    const queryPath = this.getQueryPath();
    if (queryPath) {
      // Wenn wir einen Query-Parameter (?berlin) sehen, wandeln wir ihn in einen Pfad um
      history.replaceState(null, '', `/${queryPath}`);
      return this.handleRouteWithPills();
    }

    const pills = this.loadPillsFromURL();

    // Debugging-Zeile
    console.log(`🔎 Route Handler: Path='${window.location.pathname}', Pills found: ${pills.length > 0 ? pills.map(p => p.text).join(', ') : 'None'}`);

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
    } else {
      console.error('❌ FATAL: SearchPillsManager is null during route handling.');
    }
  }

  initRoutingListeners() {
    // Wir rufen ensureDataLoaded nicht hier auf, sondern im handleRouteWithPills, 
    // um den asynchronen Load-Status zu berücksichtigen.
    window.addEventListener('popstate', () => this.handleRouteWithPills());
    this.handleRouteWithPills();

    console.log('✅ RoutingManager initialized with Pills listeners');
  }
}