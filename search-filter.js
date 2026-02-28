import AppConfig from './config.js';
import { bookmarkManager } from './bookmark-manager.js';
import { appContext } from './app-context.js';

// search-filter.js - Zentrale Such- und Filter-Logik
// Reine Geschäftslogik ohne UI-Komponenten

class SearchFilter {
  /**
   * @param {import('./app-context.js').Location[]} json - Alle Makerspace-Einträge
   * @param {Object[]} allMarkers - Leaflet-Marker-Array
   * @param {{ greenIcon, redIcon, unknownStatusIcon, highlightIcon }} icons
   */
  constructor(json, allMarkers, icons) {
    this.json = json;
    this.allMarkers = allMarkers;
    this.icons = icons;

    // Filter-State
    this.selectedStyles = new Set();
    this.styleStats = new Map();
    this.preFilteredLocations = null;

    // ID-Match für exakte ID-Suche
    this._currentIdMatch = null;

    // Callbacks
    this._onResultsChange = null;

    this.initializeStyleStats();

  }

  // ═══════════════════════════════════════════════════════════════════════════
  // STYLE-STATISTIKEN
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Initialisiert die Style-Statistiken
   */
  initializeStyleStats() {
    const tempStats = new Map();

    // Styles zählen
    this.json.forEach(location => {
      const style = location.style || 'unknown';
      if (AppConfig.ignoredStyles.includes(style)) {
        return;
      }
      if (!tempStats.has(style)) {
        tempStats.set(style, 0);
      }
      tempStats.set(style, tempStats.get(style) + 1);
    });

    // SpaceAPI Status zählen
    const openCount = this.json.filter(loc => loc.isOpen === true).length;
    const closedCount = this.json.filter(loc => loc.isOpen === false).length;
    tempStats.set('open', openCount);
    tempStats.set('closed', closedCount);

    // Länder zählen
    const countryStats = new Map();
    this.json.forEach(location => {
      if (location.loc?.country) {
        const country = location.loc.country;
        countryStats.set(country, (countryStats.get(country) || 0) + 1);
      }
    });

    // Finale Map in gewünschter Reihenfolge erstellen
    this.styleStats = new Map();

    // Feste Reihenfolge zuerst
    AppConfig.filterOrder.forEach(style => {
      if (tempStats.has(style)) {
        this.styleStats.set(style, tempStats.get(style));
      }
    });

    // Restliche Styles nach Anzahl sortiert
    const remainingStyles = [...tempStats.entries()]
      .filter(([style]) => !AppConfig.filterOrder.includes(style))
      .sort((a, b) => b[1] - a[1]);

    remainingStyles.forEach(([style, count]) => {
      this.styleStats.set(style, count);
    });

    // Länder alphabetisch am Ende
    const sortedCountries = [...countryStats.entries()].sort((a, b) => a[0].localeCompare(b[0]));
    sortedCountries.forEach(([country, count]) => {
      this.styleStats.set(country, count);
    });
  }

  /**
   * Aktualisiert die Style-Statistiken
   */
  refreshStyleStats() {
    this.initializeStyleStats();
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // FILTER-VERWALTUNG
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Wählt einen Style-Filter aus/ab und wendet Filter sofort an.
   * @param {string} style - z.B. 'for all', 'commercial', 'open'
   */
  toggleStyleSelection(style) {
    if (this.selectedStyles.has(style)) {
      this.selectedStyles.delete(style);
    } else {
      this.selectedStyles.add(style);
    }
    this.applyFilters();
  }

  /**
   * Setzt einen Style-Filter (ohne sofortigen applyFilters()-Aufruf).
   * @param {string} style
   * @param {boolean} active
   */
  setStyleFilter(style, active) {
    if (active) {
      this.selectedStyles.add(style);
    } else {
      this.selectedStyles.delete(style);
    }
  }

  /**
   * Löscht alle Style-Filter
   */
  clearAllStyleFilters() {
    this.selectedStyles.clear();
  }

  /**
   * Prüft ob irgendein Style-Filter aktiv ist.
   * @returns {boolean}
   */
  hasActiveFilters() {
    return this.selectedStyles.size > 0;
  }

  /**
   * Gibt aktive Filter als Array zurück.
   * @returns {string[]}
   */
  getSelectedStyles() {
    return Array.from(this.selectedStyles);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PRE-FILTER (von Text-/Pill-Suche)
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Setzt die vorgefilterte Liste (von SearchHeader)
   */
  applyPreFilters(locations) {
    this.preFilteredLocations = locations;
    this.applyFilters();
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // HAUPT-FILTER-LOGIK
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Wendet alle Filter an und aktualisiert die Ergebnisse
   */
  applyFilters() {
    // Basisliste
    const baseLocations = this.preFilteredLocations || this.json;

    const hasStyleFilters = this.hasActiveFilters();
    const hasPillFilters = this.preFilteredLocations !== null;

    // Keine Filter aktiv → alle zeigen
    if (!hasStyleFilters && !hasPillFilters) {
      this.updateMarkers(this.json);
      this._notifyResultsChange(this.json, this.json);
      return;
    }

    // Filter-Kategorien aufteilen
    const selectedNormalStyles = new Set();
    const selectedStateFilters = new Set();
    const selectedCountries = new Set();
    const selectedWeekdays = new Set();
    const selectedWorkshops = new Set();
    let bookmarkFilterActive = false;
    let weeklyAnyActive = false;

    // Weekly-Optionen
    const weeklyOptions = new Set(AppConfig.filterCategories.weekly?.options || []);
    const workshopOptions = new Set(AppConfig.filterCategories.workshops?.options || []);

    // Alle Länder sammeln
    const allCountries = new Set();
    this.json.forEach(location => {
      if (location.loc?.country) {
        allCountries.add(location.loc.country);
      }
    });

    // Filter kategorisieren
    this.selectedStyles.forEach(style => {
      if (style === 'bookmarked') {
        bookmarkFilterActive = true;
      } else if (style === 'any') {
        weeklyAnyActive = true;
      } else if (style === 'open' || style === 'closed') {
        selectedStateFilters.add(style);
      } else if (weeklyOptions.has(style)) {
        selectedWeekdays.add(parseInt(style));
      } else if (allCountries.has(style)) {
        selectedCountries.add(style);
      } else if (workshopOptions.has(style)) {
        selectedWorkshops.add(style);
      } else {
        selectedNormalStyles.add(style);
      }
    });

    // Bookmarks laden
    const bookmarkedIds = bookmarkFilterActive && bookmarkManager
      ? new Set(bookmarkManager.getBookmarkedIds())
      : null;

    // Filter anwenden
    const finalFiltered = baseLocations.filter(location => {
      const locationStyle = location.style || 'unknown';
      const locationCountry = location.loc?.country || null;

      // Style-Match (OR innerhalb der Kategorie)
      const styleMatch = selectedNormalStyles.size === 0 || selectedNormalStyles.has(locationStyle);

      // State-Match (OR innerhalb der Kategorie)
      let stateMatch = true;
      if (selectedStateFilters.size > 0) {
        stateMatch = false;
        if (selectedStateFilters.has('open') && location.isOpen === true) stateMatch = true;
        if (selectedStateFilters.has('closed') && location.isOpen === false) stateMatch = true;
      }

      // Country-Match (OR innerhalb der Kategorie)
      const countryMatch = selectedCountries.size === 0 ||
        (locationCountry && selectedCountries.has(locationCountry));

      // Weekly-Match
      let weeklyMatch = true;
      if (weeklyAnyActive) {
        weeklyMatch = !!location.weekly?.time && location.weekly.weekday <= 6;
      } else if (selectedWeekdays.size > 0) {
        weeklyMatch = location.weekly?.weekday != null && selectedWeekdays.has(location.weekly.weekday);
      }

      // Bookmark-Match
      const bookmarkMatch = !bookmarkFilterActive || (bookmarkedIds && bookmarkedIds.has(location.ID));

      // Workshop-Match (OR innerhalb der Kategorie)
      const workshopMatch = selectedWorkshops.size === 0 ||
        (location.workshops && location.workshops.some(w => selectedWorkshops.has(w)));

      // AND zwischen Kategorien
      return styleMatch && stateMatch && countryMatch && weeklyMatch && bookmarkMatch && workshopMatch;
    });

    // ═══════════════════════════════════════════════════════════════════════
    // TRENNUNG: Display vs. Zoom
    // ═══════════════════════════════════════════════════════════════════════

    // 1. Liste für Marker & Dropdown (Display) - ID-Match als Bonus
    let locationsForDisplay = finalFiltered;
    if (this._currentIdMatch && window.innerWidth > 767) {
      const idMatchId = this._currentIdMatch.ID;
      const alreadyIncluded = finalFiltered.some(loc => loc.ID === idMatchId);
      if (!alreadyIncluded) {
        locationsForDisplay = [this._currentIdMatch, ...finalFiltered];
      }
    }

    // 2. Liste für Zoom (Priorisierung)
    let locationsForZoom;
    if (finalFiltered.length > 0) {
      locationsForZoom = finalFiltered;
    } else if (this._currentIdMatch) {
      locationsForZoom = [this._currentIdMatch];
    } else {
      locationsForZoom = [];
    }

    // Marker aktualisieren
    this.updateMarkers(locationsForDisplay);

    // URL-Update Logik
    this._handleURLUpdate(bookmarkFilterActive, finalFiltered);

    // Callback aufrufen
    this._notifyResultsChange(finalFiltered, locationsForZoom);
  }

  /**
   * Handhabt URL-Updates basierend auf Filter-Status
   */
  _handleURLUpdate(bookmarkFilterActive, finalFiltered) {
    const hasActiveCountry = appContext.routingManager?._activeCountryFilter;
    const isNavigating = appContext.routingManager?._isNavigating;

    if (!hasActiveCountry && !isNavigating) {
      if (bookmarkFilterActive && bookmarkManager) {
        const allBookmarkedIds = bookmarkManager.getBookmarkedIds();
        if (allBookmarkedIds.length > 0 && appContext.routingManager?.navigateToLocations) {
          appContext.routingManager.navigateToLocations(allBookmarkedIds);
        }
      } else if (!bookmarkFilterActive && this.selectedStyles.size === 0 && finalFiltered.length === this.json.length) {
        if (appContext.routingManager?.clearLocationURL) {
          appContext.routingManager.clearLocationURL();
        }
      }
    }
  }

  /**
   * Benachrichtigt über Ergebnis-Änderungen
   */
  _notifyResultsChange(filteredLocations, locationsForZoom) {
    if (this._onResultsChange) {
      this._onResultsChange(filteredLocations, locationsForZoom,
        window.innerWidth > 767 ? this._currentIdMatch : null);
    }
  }

  /**
   * Registriert einen Callback für Ergebnis-Änderungen nach Filter/Suche.
   * @param {(filtered: Location[], forZoom: Location[], idMatch: Location|null) => void} callback
   */
  onResultsChange(callback) {
    this._onResultsChange = callback;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // TEXT-SUCHE
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Führt eine Text-Suche durch
   * @param {string} query - Suchbegriff
   * @param {Array} pills - Aktive Pills
   * @param {Function} zfill - PLZ-Formatierung
   * @returns {Array} Gefilterte Locations
   */
  filterByText(query, pills = [], zfill = (plz) => plz) {
    const router = appContext.routingManager;
    const hasCityPill = pills.some(p => p.type === 'city');

    // City-Pill deaktiviert Country-Filter
    if (hasCityPill && router?._activeCountryFilter) {
      router._activeCountryFilter = null;
    }

    let filtered = this.json;

    // Country-Filter anwenden
    if (router?._activeCountryFilter && !hasCityPill) {
      filtered = filtered.filter(loc => loc.loc?.country === router._activeCountryFilter);
    }

    // Text-Suche
    if (query.length > 0) {
      const normalizedQuery = query.toLowerCase();

      // ID-Match prüfen
      if (/^\d+$/.test(normalizedQuery)) {
        const idNum = parseInt(normalizedQuery, 10);
        const idMatchLocation = appContext.locationById.get(idNum);
        this._currentIdMatch = idMatchLocation || null;
      } else {
        this._currentIdMatch = null;
      }

      // Geografische Suche
      filtered = filtered.filter(location => {
        if (!location || !location.loc) return false;

        // PLZ-Match
        const plz = location.loc.plz && zfill(location.loc.plz, location.loc.country);
        if (plz && plz.startsWith(normalizedQuery)) return true;

        // Wortanfang-Match
        const fieldsToSearch = [
          location.name,
          location.loc.city,
          location.loc.country,
          location.loc.street?.name
        ].filter(Boolean).map(f => f.toLowerCase());

        const separators = /[\s,-]/;
        return fieldsToSearch.some(field =>
          field.startsWith(normalizedQuery) ||
          field.split(separators).some(word => word.startsWith(normalizedQuery))
        );
      });
    } else {
      this._currentIdMatch = null;
    }

    // Pill-Filter anwenden
    if (pills.length > 0) {
      pills.forEach(pill => {
        filtered = filtered.filter(loc => {
          if (pill.type === 'city' && router) {
            return router.cityToSlug(loc.loc.city) === router.cityToSlug(pill.text);
          }
          if (pill.type === 'zip') {
            return loc.loc.plz?.toString() === pill.text;
          }
          return true;
        });
      });
    }

    return filtered;
  }

  /**
   * Getter für aktuellen ID-Match
   */
  get currentIdMatch() {
    return this._currentIdMatch;
  }

  /**
   * Setter für ID-Match (für manuelle Resets)
   */
  set currentIdMatch(value) {
    this._currentIdMatch = value;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // MARKER-UPDATE
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Aktualisiert die Marker auf der Karte
   */
  updateMarkers(filteredLocations) {
    const clusterGroup = appContext.clusterGroup;
    const map = appContext.map;
    if (!clusterGroup || !map) return;

    const isClusteringActive = appContext.mapUtils?.isClusteringEnabled();
    const filteredIds = new Set(filteredLocations.map(loc => loc.ID));

    this.allMarkers.forEach(marker => {
      const location = appContext.locationById.get(marker.locationId);

      // 1. ENTFERNEN von allen Layern
      if (clusterGroup.hasLayer(marker)) {
        clusterGroup.removeLayer(marker);
      }
      if (map.hasLayer(marker)) {
        map.removeLayer(marker);
      }

      // 2. HINZUFÜGEN wenn gefiltert
      if (filteredIds.has(marker.locationId)) {
        if (isClusteringActive) {
          clusterGroup.addLayer(marker);
        } else {
          map.addLayer(marker);
        }

        // 3. Icon setzen
        let iconToSet;
        if (location?.isOpen === true) {
          iconToSet = this.icons.greenIcon;
        } else if (location?.isOpen === false) {
          iconToSet = this.icons.redIcon;
        } else if (location?.spaceapi?.endpoint) {
          iconToSet = this.icons.unknownStatusIcon;
        } else {
          iconToSet = this.icons.highlightIcon;
        }

        marker.setIcon(iconToSet);
      }
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // UNIQUE COUNTRIES (für Filter-UI)
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Gibt alle einzigartigen Länder zurück, sortiert nach Anzahl
   */
  getUniqueCountries() {
    const countryCount = new Map();
    this.json.forEach(location => {
      if (location.loc?.country) {
        const country = location.loc.country;
        countryCount.set(country, (countryCount.get(country) || 0) + 1);
      }
    });

    return Array.from(countryCount.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([country]) => country);
  }
}


export { SearchFilter };
