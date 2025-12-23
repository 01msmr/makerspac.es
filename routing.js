// routing.js - URL-basisches Routing für Filter + Pills

class RoutingManager {
  constructor(styleFilterManager, searchManager, json) {
    this.styleFilterManager = styleFilterManager;
    this.searchManager = searchManager;
    this.json = json;

    // Extrahiere ALLE Länder aus den Daten
    this.countries = this.findAllCountries();

    // Erstelle dynamische Routes für alle Länder (Style/Country)
    this.routes = this.createRoutes();

    // Extrahiere alle Städte mit 2+ Makerspaces
    this.citiesWithMultipleSpaces = this.findCitiesWithMultipleSpaces();

    // Erstelle Map für Städte-URLs (mit und ohne city- prefix)
    this.cityRoutes = this.createCityRoutes();

    // Init mit Pills-Support (ersetzt die alte init())
    this.initWithPills();
  }

  findAllCountries() {
    // Sammle alle einzigartigen Länder aus den Daten
    const countries = new Set();

    this.json.forEach(location => {
      const country = location.loc?.country;
      if (country && country !== 'COUNTRY_COUNTRY') {
        countries.add(country);
      }
    });

    return Array.from(countries).sort();
  }

  createRoutes() {
    // Erstelle Routes dynamisch für Styles und Länder
    const routes = {};

    // Länder - dynamisch aus Daten
    this.countries.forEach(country => {
      const slug = this.countryToSlug(country);
      routes[slug] = { type: 'country', value: country };
    });

    // Zielgruppen (Styles) - statisch
    routes['for-all'] = { type: 'style', value: 'for all' };
    routes['for-students'] = { type: 'style', value: 'for students' };
    routes['for-youth'] = { type: 'style', value: 'for youth' };
    routes['commercial'] = { type: 'style', value: 'commercial' };
    routes['open'] = { type: 'style', value: 'open' };
    routes['closed'] = { type: 'style', value: 'closed' };

    return routes;
  }

  countryToSlug(country) {
    // Konvertiert Länder-Namen zu URL-Slugs
    return country
      .toLowerCase()
      .replace(/ä/g, 'ae')
      .replace(/ö/g, 'oe')
      .replace(/ü/g, 'ue')
      .replace(/ß/g, 'ss')
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9-]/g, '');
  }

  getQueryPath() {
    // Extrahiert Pfad aus Query-String (GitHub Pages 404 Workaround)
    const query = window.location.search;
    if (query && query.startsWith('?')) {
      const path = decodeURIComponent(query.slice(1));
      return path;
    }
    return null;
  }

  findCitiesWithMultipleSpaces() {
    const cityCount = new Map();

    this.json.forEach(location => {
      const city = location.loc?.city;
      if (city && city !== 'CITY_CITY') {
        cityCount.set(city, (cityCount.get(city) || 0) + 1);
      }
    });

    // Nur Städte mit 2+ Spaces behalten
    const result = new Map();
    cityCount.forEach((count, city) => {
      if (count >= 2) {
        result.set(city, count);
      }
    });

    return result;
  }

  createCityRoutes() {
    // Erstellt Map von URL-Slugs zu Stadt-Namen
    // Fügt "city-" prefix nur bei Konflikten mit bestehenden Routes hinzu
    const cityRoutes = new Map();
    const conflicts = new Set();

    this.citiesWithMultipleSpaces.forEach((count, city) => {
      const slug = this.cityToSlug(city);

      // Prüfe ob der Slug mit bestehenden Routes kollidiert
      if (this.routes[slug]) {
        conflicts.add(city);
        // Verwende city- prefix bei Konflikt
        cityRoutes.set('city-' + slug, city);
        console.log(`Conflict detected: "${city}" -> using "city-${slug}"`);
      } else {
        // Kein Konflikt - verwende Slug ohne prefix
        cityRoutes.set(slug, city);
      }
    });

    if (conflicts.size > 0) {
      console.log('City name conflicts resolved:', Array.from(conflicts));
    }

    return cityRoutes;
  }

  // Die alten Methoden (handleRoute, filterByCity, filterByCountry etc.) 
  // wurden entfernt, da ihre Funktionalität durch die Pill-Logik ersetzt wird.
  // Es bleiben nur die Hilfsmethoden:

  slugToCity(slug) {
    // Konvertiert URL-Slug zu Stadt-Namen
    // berlin -> Berlin
    // bad-tolz -> Bad Tölz
    return slug
      .split('-')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ')
      .replace(/Ae/g, 'Ä')
      .replace(/Oe/g, 'Ö')
      .replace(/Ue/g, 'Ü');
  }

  cityToSlug(city) {
    // Konvertiert Stadt-Namen zu URL-Slug
    // Berlin -> berlin
    // Bad Tölz -> bad-tolz
    return city
      .toLowerCase()
      .replace(/ä/g, 'ae')
      .replace(/ö/g, 'oe')
      .replace(/ü/g, 'ue')
      .replace(/ß/g, 'ss')
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9-]/g, '');
  }

  formatStyleTitle(style) {
    // Formatiert Style für Title Tag
    const map = {
      'for all': 'Public',
      'for students': 'Student',
      'for youth': 'Youth',
      'commercial': 'Commercial',
      'open': 'Currently Open',
      'closed': 'Currently Closed'
    };
    return map[style] || style;
  }

  updatePageMeta(title, description) {
    // Aktualisiere Page Title
    document.title = `${title} | makerspac.es`;

    // Aktualisiere Meta Description
    let metaDesc = document.querySelector('meta[name="description"]');
    if (!metaDesc) {
      metaDesc = document.createElement('meta');
      metaDesc.name = 'description';
      document.head.appendChild(metaDesc);
    }
    metaDesc.content = description;

    // Aktualisiere Open Graph Tags
    this.updateOGTag('og:title', title);
    this.updateOGTag('og:description', description);
    this.updateOGTag('og:url', window.location.href);
  }

  updateOGTag(property, content) {
    let tag = document.querySelector(`meta[property="${property}"]`);
    if (!tag) {
      tag = document.createElement('meta');
      tag.setAttribute('property', property);
      document.head.appendChild(tag);
    }
    tag.content = content;
  }

  // Public API für Navigation
  navigateTo(path) {
    window.history.pushState(null, '', `/${path}`);
    // Der Aufruf von handleRoute() wird durch den expliziten Aufruf der Pill-Logik ersetzt
    this.handleRouteWithPills();
  }

  // Generiere alle verfügbaren Filter-URLs
  getAllFilterUrls() {
    const urls = [];

    // Länder und Styles
    Object.keys(this.routes).forEach(route => {
      urls.push(`/${route}`);
    });

    // Städte (mit oder ohne city- prefix je nach Konflikt)
    this.cityRoutes.forEach((cityName, slug) => {
      urls.push(`/${slug}`);
    });

    return urls;
  }

  // Hilfsfunktion: Hole URL für eine bestimmte Stadt
  getCityUrl(cityName) {
    for (let [slug, name] of this.cityRoutes) {
      if (name === cityName) {
        return `/${slug}`;
      }
    }
    return null;
  }

  // ========================================
  // PILL-ROUTING METHODS
  // ========================================

  /**
   * Update URL basierend auf aktiven Pills
   * Format: /berlin oder /germany+berlin+commercial
   */
  updateURLFromPills(pills) {
    if (!pills || pills.length === 0) {
      if (window.location.pathname !== '/') {
        window.history.pushState(null, '', '/');
        this.updatePageMeta(
          'Makerspace Map',
          'Find makerspaces, fablabs and hackerspaces in Germany, Austria and Switzerland'
        );
      }
      return;
    }

    // Nur die ERSTE Pill verwenden
    const firstPill = pills[0];
    const path = this.pillToSlug(firstPill);

    // Update URL
    const newUrl = `/${path}`;
    if (window.location.pathname !== newUrl) {
      window.history.pushState(null, '', newUrl);

      const title = this.generateTitleFromPills([firstPill]);
      const description = this.generateDescriptionFromPills([firstPill]);
      this.updatePageMeta(title, description);
    }
  }

  /**
   * Konvertiere Pill zu URL-Slug
   * Stadt-Namen bekommen "-city" Suffix nur bei Konflikten
   */
  pillToSlug(pill) {
    let slug = pill.text
      .toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/ä/g, 'ae')
      .replace(/ö/g, 'oe')
      .replace(/ü/g, 'ue')
      .replace(/ß/g, 'ss')
      .replace(/[^a-z0-9-]/g, '');

    // Bei Cities: Prüfe auf Konflikte mit bestehenden Routes
    if (pill.type === 'city') {
      // Prüfe ob der Slug mit Ländern oder Styles kollidiert
      if (this.routes[slug]) {
        slug = slug + '-city';
        console.log(`⚠️ Conflict detected: Added -city suffix to "${pill.text}" → ${slug}`);
      }
    }

    return slug;
  }

  /**
   * Lade Pills aus URL beim Seitenaufruf
   */
  loadPillsFromURL() {
    const path = window.location.pathname.slice(1); // Remove leading /

    console.log('🔍 loadPillsFromURL called');
    console.log('   - Full URL:', window.location.href);
    console.log('   - Pathname:', window.location.pathname);
    console.log('   - Extracted path:', path);

    if (!path || path === '') {
      console.log('   ⚠️ Empty path, returning no pills');
      return [];
    }

    // Parse: berlin oder germany+berlin+commercial
    const slugs = path.split('+').filter(s => s.length > 0);
    console.log('   - Slugs to process:', slugs);

    const pills = [];

    slugs.forEach(slug => {
      console.log(`   🔎 Looking for pill with slug: "${slug}"`);
      const pill = this.findPillBySlug(slug);
      if (pill) {
        pills.push(pill);
        console.log(`   ✅ Loaded pill from URL: ${pill.text} (${pill.type})`);
      } else {
        console.warn(`   ⚠️ Unknown slug in URL: ${slug}`);
      }
    });

    console.log('   📊 Total pills loaded:', pills.length);
    return pills;
  }

  /**
   * Finde Pill-Objekt basierend auf URL-Slug
   */
  findPillBySlug(slug) {
    // 1. Prüfe Länder
    for (let country of this.countries) {
      if (this.countryToSlug(country) === slug) {
        return {
          text: country,
          type: 'country',
          count: this.countLocationsByCountry(country)
        };
      }
    }

    // 2. Prüfe Städte (mit und ohne -city Suffix)
    const citySlug = slug.endsWith('-city') ? slug.slice(0, -5) : slug;

    for (let [routeSlug, cityName] of this.cityRoutes) {
      if (routeSlug === slug || routeSlug === citySlug) {
        return {
          text: cityName,
          type: 'city',
          count: this.countLocationsByCity(cityName)
        };
      }
    }

    // 3. Prüfe PLZ
    const zip = slug.replace(/^plz-/, ''); // Support für plz-12345
    if (/^\d+$/.test(zip)) {
      const hasZip = this.json.some(loc => loc.loc?.zip?.toString() === zip);
      if (hasZip) {
        return {
          text: zip,
          type: 'zip',
          count: this.countLocationsByZip(zip)
        };
      }
    }

    // 4. Prüfe Style-Filter
    if (this.routes[slug] && this.routes[slug].type === 'style') {
      return {
        text: this.routes[slug].value,
        type: 'style',
        filterKey: this.routes[slug].value,
        count: this.countLocationsByStyle(this.routes[slug].value)
      };
    }

    // Nicht gefunden
    return null;
  }

  /**
   * Zähle Locations nach Kriterien (für Count-Badges)
   */
  countLocationsByCountry(country) {
    return this.json.filter(loc => loc.loc?.country === country).length;
  }

  countLocationsByCity(city) {
    return this.json.filter(loc => loc.loc?.city === city).length;
  }

  countLocationsByZip(zip) {
    return this.json.filter(loc => loc.loc?.zip?.toString() === zip).length;
  }

  countLocationsByStyle(style) {
    if (style === 'open') {
      return this.json.filter(loc => loc.isOpen === true).length;
    } else if (style === 'closed') {
      return this.json.filter(loc => loc.isOpen === false).length;
    } else {
      return this.json.filter(loc => loc.style === style).length;
    }
  }

  /**
   * Generiere Seiten-Titel aus Pills
   */
  generateTitleFromPills(pills) {
    if (pills.length === 0) {
      return 'Makerspace Map';
    }

    const parts = pills.map(pill => pill.text);
    return `Makerspaces in ${parts.join(', ')}`;
  }

  /**
   * Generiere Meta-Description aus Pills
   */
  generateDescriptionFromPills(pills) {
    if (pills.length === 0) {
      return 'Find makerspaces, fablabs and hackerspaces in Germany, Austria and Switzerland';
    }

    const parts = pills.map(pill => pill.text);
    const location = parts.join(', ');

    return `Find all makerspaces, fablabs and hackerspaces in ${location}. Interactive map with opening hours and contact details.`;
  }

  /**
   * Browser Back/Forward Handler - erweitert für Pills
   */
  handleRouteWithPills() {
    // 1. GitHub Pages Workaround: URL korrigieren (z.B. /?berlin -> /berlin)
    const queryPath = this.getQueryPath();
    if (queryPath && queryPath.length > 0) {
      const newUrl = '/' + queryPath;
      window.history.replaceState(null, '', newUrl);
      // WICHTIG: Nach dem Korrigieren der URL müssen wir die Methode neu aufrufen
      // damit loadPillsFromURL() den korrigierten Pfad liest
      setTimeout(() => this.handleRouteWithPills(), 0);
      return;
    }

    // 2. Lade Pills aus URL (liest jetzt den korrigierten Pfad)
    const pills = this.loadPillsFromURL();

    if (pills.length === 0) {
      // Keine Pills = Standard-Zustand herstellen
      this.clearAllPillsAndFilters();
      this.updatePageMeta('Makerspace Map', 'Find makerspaces, fablabs and hackerspaces in Germany, Austria and Switzerland');
      return;
    }

    // 3. Lade Pills in SearchPillsManager
    if (window.searchManager && window.searchManager.pillsManager) {
      window.searchManager.pillsManager.loadPills(pills);

      // Metadaten aktualisieren, da Pills geladen wurden
      const title = this.generateTitleFromPills(pills);
      const description = this.generateDescriptionFromPills(pills);
      this.updatePageMeta(title, description);

      // Pills triggern automatisch Filter über onChange-Callback
    } else {
      console.warn('⚠️ SearchManager not ready yet');
      // ✨ KORREKTUR: Setze einen Timeout, um es später zu versuchen (Rennen vermeiden)
      setTimeout(() => this.handleRouteWithPills(), 200); 
    }
  }

  /**
   * ✨ NEU: Initialisierung mit Pills-Support (ersetzt die alte init())
   */
  initWithPills() {
    // Handle Route beim Laden (muss nach DOMContentLoaded passieren)
    window.addEventListener('DOMContentLoaded', () => {
      this.handleRouteWithPills();
    });

    // Browser Back/Forward
    window.addEventListener('popstate', () => {
      this.handleRouteWithPills();
    });

    // ✨ NEU: Führe den 404-Workaround sofort beim Laden aus
    // und initialisiere die clearAllPillsAndFilters Methode (wie in der letzten Korrektur)
    this.clearAllPillsAndFilters = () => {
      if (this.styleFilterManager) {
        this.styleFilterManager.selectedStyles.clear();
      }
      if (this.searchManager && this.searchManager.pillsManager) {
        this.searchManager.pillsManager.clear();
        this.searchManager.searchBar.value = '';
      } else if (this.searchManager) {
        this.searchManager.clearSearchAndPills();
      }

      // ✨ WICHTIG: Manuelle Filterung auslösen, falls SearchManager nicht existiert
      if (this.styleFilterManager) this.styleFilterManager.applyFilters();
    }

    // Führe den 404-Workaround sofort beim Laden aus (bevor DOMContentLoaded triggert)
    this.handleRouteWithPills();

    console.log('✅ RoutingManager initialized with Pills support');
    console.log('📍 Countries:', this.countries);
    console.log('🏙️ Cities:', Array.from(this.cityRoutes.keys()));
  }
}

// Export für Nutzung in anderen Modulen
if (typeof module !== 'undefined' && module.exports) {
  module.exports = RoutingManager;
}