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
    console.log('🔗 Pre-Filter applied with', locations.length, 'locations.');
    this.preFilteredLocations = locations;
    this.applyFilters();
  }

  applyFilters() {
    // ✨ KORREKTUR: Basisliste ist entweder die vorgefilterte Liste ODER alle Locations
    const baseLocations = this.preFilteredLocations || this.json;

    console.log('🎯 applyFilters called');
    console.log('  - preFilteredLocations:', this.preFilteredLocations?.length || 'null');
    console.log('  - baseLocations:', baseLocations.length);
    console.log('  - hasActiveFilters:', this.hasActiveFilters());

    // Wenn keine Style-Filter aktiv sind, zeige alle Suchergebnisse
    if (!this.hasActiveFilters()) {
      this.updateMarkers(baseLocations);
      if (this.searchManager) {
        // ✨ WICHTIG: Erstelle Vorschläge mit der BASISt-Liste
        this.searchManager.createSuggestionItems(baseLocations);
        this.searchManager.updateSearchCounter(baseLocations.length);
        this.searchManager.triggerAutoZoom(baseLocations);

        // ✨ FIX: Öffne Dropdown auch wenn KEINE Style-Filter aktiv sind
        const hasResults = baseLocations.length > 0;
        const hasSearchQuery = this.searchManager.searchBar.value.trim().length > 0;
        this.searchManager.updateDropdownUI(hasResults || hasSearchQuery);
      }
      // ✨ FIX: Setze preFilteredLocations NICHT zurück - wird von applyPillFilters verwaltet
      // this.preFilteredLocations = null;
      return;
    }

    // --- NEUE AND-FILTERLOGIK mit Country-Support und Bookmarks ---

    // 1. Trenne die aktiven Filter in Kategorien
    const selectedNormalStyles = new Set();
    const selectedStateFilters = new Set();
    const selectedCountries = new Set();
    let bookmarkFilterActive = false;

    // Hole alle möglichen Länder
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

    // 2. Wende die Filter nacheinander an (AND-Verknüpfung)
    const finalFiltered = baseLocations.filter(location => {
      const locationStyle = location.style || 'unknown';
      const locationCountry = location.loc && location.loc.country ? location.loc.country : null;

      // Bedingung 1: Muss einem der ausgewählten Styles entsprechen
      const styleMatch = selectedNormalStyles.size === 0 || selectedNormalStyles.has(locationStyle);

      // Bedingung 2: Muss dem ausgewählten Status entsprechen
      // ✨ FIX: Korrekte AND-Logik - nur die passenden Status zeigen
      let stateMatch = true; // Default: kein Status-Filter aktiv
      if (selectedStateFilters.size > 0) {
        // Wenn Status-Filter aktiv sind, muss die Location einen der Status erfüllen
        stateMatch = false;
        if (selectedStateFilters.has('open') && location.isOpen === true) {
          stateMatch = true;
        }
        if (selectedStateFilters.has('closed') && location.isOpen === false) {
          stateMatch = true;
        }
      }

      // Bedingung 3: Muss dem ausgewählten Land entsprechen
      const countryMatch = selectedCountries.size === 0 ||
        (locationCountry && selectedCountries.has(locationCountry));

      // Bedingung 4: Muss gebookmarkt sein (wenn Bookmark-Filter aktiv)
      const bookmarkMatch = !bookmarkFilterActive ||
        (window.bookmarkManager && window.bookmarkManager.isBookmarked(location.uniqueId));

      // Das Element wird nur angezeigt, wenn ALLE Bedingungen erfüllt sind
      return styleMatch && stateMatch && countryMatch && bookmarkMatch;
    });

    console.log('  - finalFiltered:', finalFiltered.length);

    this.updateMarkers(finalFiltered);
    if (this.searchManager) {
      // ✨ KORREKTUR: Aktualisiere Vorschläge und Counter mit der FINALEN Liste
      this.searchManager.createSuggestionItems(finalFiltered);
      this.searchManager.updateSearchCounter(finalFiltered.length);
      this.searchManager.triggerAutoZoom(finalFiltered);

      // ✨ FIX: Öffne Dropdown wenn Suchergebnisse vorhanden sind
      const hasResults = finalFiltered.length > 0;
      const hasSearchQuery = this.searchManager.searchBar.value.trim().length > 0;
      this.searchManager.updateDropdownUI(hasResults || hasSearchQuery);
    }

    // ✨ FIX: preFilteredLocations NICHT zurücksetzen - bleibt für nächste Filter-Aktivierung
  }


  updateMarkers(filteredLocations) {
    const clusterGroup = window.clusterGroup;
    if (!clusterGroup) return;

    const filteredIds = new Set(filteredLocations.map(loc => loc.uniqueId));

    this.allMarkers.forEach(marker => {
      const location = this.json.find(loc => loc.uniqueId === marker.uniqueId);

      if (filteredIds.has(marker.uniqueId)) {
        // Marker soll angezeigt werden
        if (!clusterGroup.hasLayer(marker)) {
          clusterGroup.addLayer(marker);
        }

        // ✨ FIX: Icon-Update basierend auf Status
        let iconToSet;

        if (location && location.isOpen === true) {
          iconToSet = this.icons.greenIcon;  // ✅ Grün!
        } else if (location && location.isOpen === false) {
          iconToSet = this.icons.redIcon;    // ✅ Rot!
        } else if (location && location.spaceapi && location.spaceapi.endpoint) {
          iconToSet = this.icons.unknownStatusIcon; // ✅ Gelb/Unknown!
        } else {
          iconToSet = this.icons.highlightIcon;
        }

        marker.setIcon(iconToSet);

      } else {
        // Marker soll versteckt werden
        if (clusterGroup.hasLayer(marker)) {
          clusterGroup.removeLayer(marker);
        }
      }
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