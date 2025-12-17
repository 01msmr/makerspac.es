// routing.js - URL-basiertes Routing für Filter

class RoutingManager {
  constructor(styleFilterManager, searchManager, json) {
    this.styleFilterManager = styleFilterManager;
    this.searchManager = searchManager;
    this.json = json;
    
    // Extrahiere ALLE Länder aus den Daten (nicht nur D-A-CH)
    this.countries = this.findAllCountries();
    
    // Erstelle dynamische Routes für alle Länder
    this.routes = this.createRoutes();
    
    // Extrahiere alle Städte mit 2+ Makerspaces
    this.citiesWithMultipleSpaces = this.findCitiesWithMultipleSpaces();
    
    // Erstelle Map für Städte-URLs (mit und ohne city- prefix)
    this.cityRoutes = this.createCityRoutes();
    
    // Initialisiere Routing
    this.init();
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
    // Erstelle Routes dynamisch
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
  
  init() {
    // GitHub Pages Workaround: Prüfe Query-Parameter von 404.html
    const queryPath = this.getQueryPath();
    if (queryPath) {
      // Ersetze Query-Parameter mit richtigem Pfad in der URL
      const newUrl = window.location.origin + '/' + queryPath;
      window.history.replaceState(null, '', newUrl);
    }
    
    // Prüfe URL beim Laden der Seite
    window.addEventListener('DOMContentLoaded', () => {
      this.handleRoute();
    });
    
    // Reagiere auf URL-Änderungen (Browser vor/zurück)
    window.addEventListener('popstate', () => {
      this.handleRoute();
    });
    
    console.log('RoutingManager initialized');
    console.log('Countries found:', this.countries);
    console.log('Cities with multiple spaces:', Array.from(this.citiesWithMultipleSpaces.keys()));
    console.log('City routes:', Array.from(this.cityRoutes.entries()));
  }
  
  getQueryPath() {
    // Extrahiert Pfad aus Query-String (GitHub Pages 404 Workaround)
    // URL: /?germany -> return 'germany'
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
  
  handleRoute() {
    const path = window.location.pathname.slice(1); // Entfernt führendes "/"
    
    if (!path || path === '') {
      // Hauptseite - keine Filter aktiv
      this.clearAllFilters();
      this.updatePageMeta('Makerspace Map', 'Find makerspaces, fablabs and hackerspaces in Germany, Austria and Switzerland');
      return;
    }
    
    // Prüfe auf Stadt-Filter (mit oder ohne city- prefix)
    if (this.cityRoutes.has(path)) {
      this.handleCityRoute(path);
      return;
    }
    
    // Prüfe auf vordefinierte Routen (Länder, Styles)
    if (this.routes[path]) {
      this.handleDefinedRoute(path);
      return;
    }
    
    // Wenn keine Route passt, zeige Hauptseite
    console.warn('Unknown route:', path);
    this.clearAllFilters();
  }
  
  handleCityRoute(slug) {
    // Hole Stadt-Namen direkt aus der cityRoutes Map
    const cityName = this.cityRoutes.get(slug);
    
    if (!cityName) {
      console.warn('City not found for slug:', slug);
      this.clearAllFilters();
      return;
    }
    
    // Filtere nach Stadt
    this.filterByCity(cityName);
    this.updatePageMeta(
      `Makerspaces in ${cityName}`,
      `Find all makerspaces, fablabs and hackerspaces in ${cityName}. Interactive map with details and contact information.`
    );
  }
  
  handleDefinedRoute(path) {
    const route = this.routes[path];
    
    switch (route.type) {
      case 'country':
        this.filterByCountry(route.value);
        this.updatePageMeta(
          `Makerspaces in ${route.value}`,
          `Find all makerspaces, fablabs and hackerspaces in ${route.value}. Interactive map with opening hours and contact details.`
        );
        break;
        
      case 'style':
        this.filterByStyle(route.value);
        const styleTitle = this.formatStyleTitle(route.value);
        this.updatePageMeta(
          `${styleTitle} Makerspaces`,
          `Find ${route.value} makerspaces, fablabs and hackerspaces. Interactive map of maker communities.`
        );
        break;
    }
  }
  
  filterByCity(cityName) {
    // Setze Suchfeld
    if (this.searchManager && this.searchManager.searchBar) {
      this.searchManager.searchBar.value = cityName;
      
      // Triggere Suche programmatisch
      const event = new Event('input', { bubbles: true });
      this.searchManager.searchBar.dispatchEvent(event);
    }
  }
  
  filterByCountry(country) {
    // Filtere alle Marker nach Land
    const matchingLocations = this.json.filter(loc => 
      loc.loc?.country === country
    );
    
    // Zeige nur passende Marker
    this.searchManager.allMarkers.forEach(marker => {
      const locationData = marker.options.locationData;
      const matches = matchingLocations.some(loc => 
        loc.name === locationData.name
      );
      
      if (matches) {
        marker.addTo(this.searchManager.map);
      } else {
        marker.remove();
      }
    });
    
    // Passe Karte an sichtbare Marker an
    this.fitMapToVisibleMarkers();
  }
  
  filterByStyle(style) {
    // Aktiviere Style-Filter
    if (this.styleFilterManager) {
      // Lösche bestehende Filter
      this.styleFilterManager.selectedStyles.clear();
      
      // Aktiviere gewünschten Style
      this.styleFilterManager.selectedStyles.add(style);
      
      // Aktualisiere UI und Filter
      this.styleFilterManager.applyFilters();
      this.styleFilterManager.updateCounter();
      
      // Aktualisiere UI der Filter-Items
      const allItems = document.querySelectorAll('.style-filter-item');
      allItems.forEach(item => {
        if (item.dataset.style === style) {
          item.classList.add('active');
        } else {
          item.classList.remove('active');
        }
      });
    }
  }
  
  clearAllFilters() {
    // Lösche Style-Filter
    if (this.styleFilterManager) {
      this.styleFilterManager.selectedStyles.clear();
      this.styleFilterManager.applyFilters();
      this.styleFilterManager.updateCounter();
      
      const allItems = document.querySelectorAll('.style-filter-item');
      allItems.forEach(item => item.classList.remove('active'));
    }
    
    // Lösche Such-Filter
    if (this.searchManager && this.searchManager.searchBar) {
      this.searchManager.searchBar.value = '';
      this.searchManager.clearSearch();
    }
  }
  
  fitMapToVisibleMarkers() {
    // Sammle alle sichtbaren Marker
    const visibleMarkers = this.searchManager.allMarkers.filter(marker => 
      this.searchManager.map.hasLayer(marker)
    );
    
    if (visibleMarkers.length === 0) return;
    
    // Erstelle Bounds aus sichtbaren Markern
    const group = L.featureGroup(visibleMarkers);
    this.searchManager.map.fitBounds(group.getBounds(), {
      padding: [50, 50],
      maxZoom: 12
    });
  }
  
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
    this.handleRoute();
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
}

// Export für Nutzung in anderen Modulen
if (typeof module !== 'undefined' && module.exports) {
  module.exports = RoutingManager;
}