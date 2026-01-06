// style-filter.js

class StyleFilterManager {
  constructor(json, allMarkers, icons, searchManager) {
    this.json = json;
    this.allMarkers = allMarkers;
    this.icons = icons;
    this.searchManager = searchManager;

    // ✨ NEU: Speichert die Liste, die von SearchManager/PillsManager vorgefiltert wurde
    this.preFilteredLocations = null;

    this.selectedStyles = new Set();
    this.styleStats = new Map();

    this.initializeStyleStats();


    console.log('StyleFilterManager initialized with', this.styleStats.size, 'unique styles');
  }

  initializeStyleStats() {
    // Ignoriere nur noch "technische" oder unklare Styles
    const ignoredStyles = [
      'unknown',
      'STYLE_STYLE',
      'for students & youth',
      'for students // commercial'
    ];

    // Definiere die fixe Reihenfolge
    const fixedOrder = [
      'for all',
      'for youth',
      'for students',
      'commercial',
      'open',
      'closed'
    ];

    // Temporäre Map für die Zählung
    const tempStats = new Map();

    this.json.forEach(location => {
      const style = location.style || 'unknown';
      if (ignoredStyles.includes(style)) {
        return;
      }
      if (!tempStats.has(style)) {
        tempStats.set(style, 0);
      }
      tempStats.set(style, tempStats.get(style) + 1);
    });

    const openCount = this.json.filter(loc => loc.isOpen === true).length;
    const closedCount = this.json.filter(loc => loc.isOpen === false).length;

    tempStats.set('open', openCount);
    tempStats.set('closed', closedCount);

    // ✨ NEU: Füge Länder hinzu
    const countryStats = new Map();
    this.json.forEach(location => {
      if (location.loc && location.loc.country) {
        const country = location.loc.country;
        if (!countryStats.has(country)) {
          countryStats.set(country, 0);
        }
        countryStats.set(country, countryStats.get(country) + 1);
      }
    });

    // Erstelle die finale Map in der gewünschten Reihenfolge
    this.styleStats = new Map();

    // Füge zuerst die Einträge in der fixen Reihenfolge hinzu
    fixedOrder.forEach(style => {
      if (tempStats.has(style)) {
        this.styleStats.set(style, tempStats.get(style));
      }
    });

    // Füge dann alle anderen Styles hinzu (falls vorhanden), sortiert nach Anzahl
    const remainingStyles = [...tempStats.entries()]
      .filter(([style]) => !fixedOrder.includes(style))
      .sort((a, b) => b[1] - a[1]);

    remainingStyles.forEach(([style, count]) => {
      this.styleStats.set(style, count);
    });

    // ✨ NEU: Füge Länder am Ende hinzu, alphabetisch sortiert
    const sortedCountries = [...countryStats.entries()].sort((a, b) => a[0].localeCompare(b[0]));
    sortedCountries.forEach(([country, count]) => {
      this.styleStats.set(country, count);
    });
  }


  // ✨ NEU: Öffentliche Funktion zum Neuberechnen
  refreshStyleStats() {
    console.log('🔄 Refreshing filter statistics...');
    this.initializeStyleStats();

    // ✅ FIX: Prüfe ob filterContent existiert
    if (this.filterContent) {
      // Lösche alte Filter-Items
      this.filterContent.innerHTML = '';
      // Erstelle neue Filter-Items
      this.createFilterItems();
    }

    console.log('✅ Filter refreshed with', this.styleStats.size, 'items');
  }


  // ✨ NEU: Dummy-Methode für Kompatibilität mit search.js
  toggleStyleSelection(style, item) {
    // Diese Methode wird von search.js aufgerufen
    // Die eigentliche Logik ist jetzt in search.js
    const isSelected = this.selectedStyles.has(style);

    if (isSelected) {
      this.selectedStyles.delete(style);
    } else {
      this.selectedStyles.add(style);
    }

    this.applyFilters();
  }


  // ✨ KORREKTUR: Fehlende Methode hinzufügen (behebt TypeError)
  updateFilterCounter() {
    // Wird von search.js erwartet. Die Logik zur Aktualisierung der Pills liegt in search.js.
  }

  // ✨ KORREKTUR: Fehlende Methode hinzufügen
  updateHeaderState() {
    // Platzhalter
  }


  // ✨ NEU: Wird von SearchManager aufgerufen, um die Basisliste zu setzen
  applyPreFilters(locations) {
    if (locations === null) {
      console.log('🔗 Pre-Filter removed. Using all locations as base.');
      this.preFilteredLocations = null;
    } else {
      console.log('🔗 Pre-Filter applied with', locations.length, 'locations.');
      this.preFilteredLocations = locations;
    }
    this.applyFilters();
  }

  applyFilters() {
    // ✨ KORREKTUR: Basisliste ist entweder die vorgefilterte Liste ODER alle Locations
    const baseLocations = this.preFilteredLocations || this.json;

    console.log('🎯 applyFilters called');
    console.log('  - preFilteredLocations:', this.preFilteredLocations?.length || 'null');
    console.log('  - baseLocations:', baseLocations.length);
    console.log('  - hasActiveFilters:', this.hasActiveFilters());

    // 1. VOLL-RESET-LOGIK: Wenn keine aktiven Filter und keine Pre-Filter (Text/Pills) aktiv sind
    if (!this.hasActiveFilters() && this.preFilteredLocations === null) {
      this.updateMarkers(baseLocations);
      if (this.searchManager) {
        // Aktualisiere alle Sektionen mit der vollen Liste
        this.searchManager.createActiveFiltersSection();
        this.searchManager.createSuggestionItems(baseLocations);
        this.searchManager.updateSearchCounter(baseLocations.length);
        this.searchManager.triggerAutoZoom(baseLocations);

        // ✨ KORREKTUR: Dropdown ausblenden, da keine aktive Suche/Filterung stattfindet
        this.searchManager.updateDropdownUI(false);
      }
      return;
    }

    // --- FILTER-LOGIK (Nur ausgeführt, wenn Style-Filter ODER Pre-Filter aktiv sind) ---

    // 1. Trenne die aktiven Filter in Kategorien
    const selectedNormalStyles = new Set();
    const selectedStateFilters = new Set();
    const selectedCountries = new Set();
    let bookmarkFilterActive = false;

    const allCountries = new Set();
    this.json.forEach(location => {
      if (location.loc && location.loc.country) {
        allCountries.add(location.loc.country);
      }
    });

    this.selectedStyles.forEach(style => {
      if (style === 'bookmarked') {
        bookmarkFilterActive = true;
      } else if (style === 'open' || style === 'closed') {
        selectedStateFilters.add(style);
      } else if (allCountries.has(style)) {
        selectedCountries.add(style);
      } else {
        selectedNormalStyles.add(style);
      }
    });

    // ✅ OPTIMIERUNG #2: Cache gebookmarkte IDs einmal (statt bei jeder Location zu prüfen)
    const bookmarkedIds = bookmarkFilterActive && window.bookmarkManager
      ? new Set(window.bookmarkManager.getBookmarkedIds())
      : null;

    // 2. Wende die Filter nacheinander an (AND-Verknüpfung)
    const finalFiltered = baseLocations.filter(location => {
      const locationStyle = location.style || 'unknown';
      const locationCountry = location.loc && location.loc.country ? location.loc.country : null;

      // Bedingung 1: Style
      const styleMatch = selectedNormalStyles.size === 0 || selectedNormalStyles.has(locationStyle);

      // Bedingung 2: Status
      let stateMatch = true;
      if (selectedStateFilters.size > 0) {
        stateMatch = false;
        if (selectedStateFilters.has('open') && location.isOpen === true) {
          stateMatch = true;
        }
        if (selectedStateFilters.has('closed') && location.isOpen === false) {
          stateMatch = true;
        }
      }

      // Bedingung 3: Land
      const countryMatch = selectedCountries.size === 0 ||
        (locationCountry && selectedCountries.has(locationCountry));

      // Bedingung 4: Bookmark
      // ✅ OPTIMIERT: Set-Lookup statt Funktionsaufruf bei jeder Location
      const bookmarkMatch = !bookmarkFilterActive || (bookmarkedIds && bookmarkedIds.has(location.ID));

      return styleMatch && stateMatch && countryMatch && bookmarkMatch;
    });

    console.log('  - finalFiltered:', finalFiltered.length);

    // 3. ANWENDUNG AUF MAP UND DROPDOWN
    this.updateMarkers(finalFiltered);

    // ✅ NEU: URL-Update bei Bookmark-Filter → ALLE gebookmarten Spaces in URL
    if (bookmarkFilterActive && window.bookmarkManager) {
      // Hole ALLE gebookmarten IDs (unabhängig von anderen Filtern!)
      const allBookmarkedIds = window.bookmarkManager.getBookmarkedIds();

      if (allBookmarkedIds.length > 0) {
        // Setze URL mit allen gebookmarten Spaces
        // Beispiel: #/location/1,5,12,42
        if (window.routingManager && window.routingManager.navigateToLocations) {
          window.routingManager.navigateToLocations(allBookmarkedIds);
        }
      }
    } else if (!bookmarkFilterActive && this.selectedStyles.size === 0 && finalFiltered.length === this.json.length) {
      // Kein Filter aktiv → URL clearen
      if (window.routingManager && window.routingManager.clearLocationURL) {
        window.routingManager.clearLocationURL();
      }
    }

    if (this.searchManager) {
      // Aktualisiere Dropdown (Liste) und Counter
      this.searchManager.createActiveFiltersSection();
      this.searchManager.createSuggestionItems(finalFiltered);
      this.searchManager.updateSearchCounter(finalFiltered.length);
      this.searchManager.triggerAutoZoom(finalFiltered);

      // ✨ KORREKTUR: Explizites Update des Dropdown-Zustands
      const hasResults = finalFiltered.length > 0;
      const hasSearchQuery = this.searchManager.searchBar.value.trim().length > 0;
      const hasActivePills = this.searchManager.pillsManager.count() > 0;

      // Das Dropdown ist sichtbar, wenn IRGENDEIN Filter-Zustand aktiv ist
      this.searchManager.updateDropdownUI(hasResults || hasSearchQuery || hasActivePills || this.hasActiveFilters());

      // 4. Map-Neuzechnung erzwingen 
      const clusterGroup = window.clusterGroup;
      if (clusterGroup) {
        if (typeof clusterGroup.refreshClusters === 'function') {
          clusterGroup.refreshClusters(); // Erzwingt Cluster-Update
        }
        window.map.invalidateSize(); // Erzwingt Leaflet Map-Update
      }
    }
  }


  updateMarkers(filteredLocations) {
    const clusterGroup = window.clusterGroup;
    const map = window.map;
    if (!clusterGroup || !map) return;

    // ✅ WICHTIG: Prüfe Clustering-Status
    const isClusteringActive = window.mapUtils && window.mapUtils.isClusteringEnabled();

    // ✅ OPTIMIERT: Nutze location.ID
    const filteredIds = new Set(filteredLocations.map(loc => loc.ID));

    this.allMarkers.forEach(marker => {
      // ✅ OPTIMIERT: O(1) statt O(n) mit Map.get()
      const location = window.locationById.get(marker.locationId);

      // 1. ENTFERNE Marker von ALLEN Layern (Hard Reset)
      if (clusterGroup.hasLayer(marker)) {
        clusterGroup.removeLayer(marker);
      }
      if (map.hasLayer(marker)) {
        map.removeLayer(marker);
      }

      if (filteredIds.has(marker.locationId)) {
        // 2. FÜGE Marker zum RICHTIGEN Layer hinzu
        if (isClusteringActive) {
          clusterGroup.addLayer(marker);
        } else {
          // ✅ Wenn Clustering deaktiviert, füge direkt zur Map hinzu
          map.addLayer(marker);
        }

        // 3. Icon setzen
        let iconToSet;

        if (location && location.isOpen === true) {
          iconToSet = this.icons.greenIcon;
        } else if (location && location.isOpen === false) {
          iconToSet = this.icons.redIcon;
        } else if (location && location.spaceapi && location.spaceapi.endpoint) {
          iconToSet = this.icons.unknownStatusIcon;
        } else {
          iconToSet = this.icons.highlightIcon;
        }

        marker.setIcon(iconToSet);
      }
      // Wenn nicht gefiltert: Marker bleibt entfernt (durch Schritt 1)
    });
  }


  getSelectedStyles() {
    return Array.from(this.selectedStyles);
  }

  hasActiveFilters() {
    return this.selectedStyles.size > 0;
  }
}

window.StyleFilterManager = StyleFilterManager;