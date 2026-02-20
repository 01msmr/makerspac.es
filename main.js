// main.js - Orchestrator für makerspac.es
// Initialisiert und verbindet alle Module

(function() {
  'use strict';

  const CONFIG = window.AppConfig;

  // ═══════════════════════════════════════════════════════════════════════════
  // LEAFLET ICON FACTORY
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Erstellt ein Leaflet Icon mit gegebener Farbe und Größe
   * @param {string} color - Hex-Farbcode für die Icon-Füllung
   * @param {number} scale - Skalierungsfaktor (1.0 = normal, 1.5 = groß)
   * @returns {L.Icon} Leaflet Icon Instanz
   */
  function createLeafletIcon(color, scale = 1.0) {
    const baseSize = [25, 41];
    const iconSize = [baseSize[0] * scale, baseSize[1] * scale];
    const iconAnchor = [baseSize[0] * scale / 2, baseSize[1] * scale];
    const popupAnchor = [1 * scale, -34 * scale];
    const shadowSize = [41 * scale, 41 * scale];

    return new L.Icon({
      iconUrl: 'data:image/svg+xml;base64,' + btoa(`
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 25 41">
          <path fill="${color}" stroke="#000" stroke-width="1" d="M12.5,1 C6.16,1 1,6.16 1,12.5 C1,20.88 12.5,39 12.5,39 C12.5,39 24,20.88 24,12.5 C24,6.16 18.84,1 12.5,1 Z"/>
          <circle fill="#fff" cx="12.5" cy="12.5" r="3"/>
        </svg>
      `),
      shadowUrl: 'libs/leaflet/images/marker-shadow.png',
      iconSize: iconSize,
      iconAnchor: iconAnchor,
      popupAnchor: popupAnchor,
      shadowSize: shadowSize
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // LEAFLET ICON DEFINITIONEN (Lazy Loading)
  // ═══════════════════════════════════════════════════════════════════════════

  let LeafletIcons = null;

  function initializeLeafletIcons() {
    if (LeafletIcons || typeof L === 'undefined') {
      return LeafletIcons;
    }

    LeafletIcons = {
      // Standard Icon (Dark Mode aware)
      defaultIcon: createLeafletIcon(CONFIG.getDefaultIconColor()),

      // Highlight Icon
      highlightIcon: createLeafletIcon(CONFIG.getDefaultIconColor()),

      // Hover Icon (vergrößert)
      hoverIcon: createLeafletIcon(CONFIG.getHoverColor(), 1.5),

      // Status Icons
      greenIcon: createLeafletIcon(CONFIG.colours.open),
      redIcon: createLeafletIcon(CONFIG.colours.closed),
      unknownStatusIcon: createLeafletIcon(CONFIG.colours.unknown)
    };

    return LeafletIcons;
  }

  // Auto-initialize wenn Leaflet verfügbar ist
  if (typeof L !== 'undefined') {
    initializeLeafletIcons();
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // MAPICONS NAMESPACE (Backward Compatibility)
  // ═══════════════════════════════════════════════════════════════════════════

  window.MapIcons = {
    // Leaflet Icon Instanzen (Lazy Loading via Getter)
    get icons() {
      return initializeLeafletIcons();
    },

    // Icon Factory
    createIcon: createLeafletIcon,

    // Farb-Konstanten (Backward Compatibility)
    colors: {
      DEFAULT: CONFIG.colours.default,
      HIGHLIGHT: CONFIG.colours.highlight,
      OPEN: CONFIG.colours.open,
      CLOSED: CONFIG.colours.closed,
      UNKNOWN: CONFIG.colours.unknown,
      HOVER_LIGHT: CONFIG.colours.hoverLight,
      HOVER_DARK: CONFIG.colours.hoverDark,
      DARK_MODE_DEFAULT: CONFIG.colours.darkModeDefault
    },

    // Icon-Mappings (Backward Compatibility)
    styleMap: CONFIG.icons.styles,
    statusMap: CONFIG.icons.status,
    uiMap: {
      BOOKMARK_FILLED: CONFIG.icons.ui.bookmarkFilled,
      BOOKMARK_OUTLINE: CONFIG.icons.ui.bookmarkOutline,
      CROSSHAIRS: CONFIG.icons.ui.crosshairs,
      CLOSE: CONFIG.icons.ui.close,
      SETTINGS: CONFIG.icons.ui.settings,
      SEARCH: CONFIG.icons.ui.search
    },
    countryMap: CONFIG.countryCodes,

    // Helper-Funktionen (Backward Compatibility)
    getDynamicColor: CONFIG.getDynamicSpaceColor,
    getStyleIcon: CONFIG.getStyleIcon,
    getStatusIcon: CONFIG.getStatusIcon,
    getCountryCode: CONFIG.getCountryCode,
    getDefaultColor: CONFIG.getDefaultIconColor
  };

  // Weitere Backward Compatibility
  window.IC = CONFIG.colours;
  window.getDynamicSpaceColor = CONFIG.getDynamicSpaceColor;

  // ═══════════════════════════════════════════════════════════════════════════
  // APP INITIALISIERUNG
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Haupt-Initialisierungsfunktion
   * Wird von map.js aufgerufen, wenn alle Daten geladen sind
   */
  function initApp(options = {}) {
    const {
      map,
      json,
      allMarkers,
      zfill
    } = options;

    console.log('🚀 Initializing App...');

    // Icons initialisieren
    const icons = initializeLeafletIcons();
    if (!icons) {
      console.error('❌ Leaflet not available');
      return null;
    }

    // ═══════════════════════════════════════════════════════════════════════
    // MODUL-INSTANZEN ERSTELLEN
    // ═══════════════════════════════════════════════════════════════════════

    // 1. ListingCore (Gemeinsame Item-Darstellung)
    const listingCore = new window.ListingCore();

    // 2. SearchFilter (Such- und Filter-Logik)
    const searchFilter = new window.SearchFilter(json, allMarkers, icons);

    // 3. ZoomManager initialisieren
    if (window.zoomManager) {
      window.zoomManager.init(map);
    }

    // 4. SearchHeader (Searchbar-UI)
    const searchHeader = new window.SearchHeader({
      map,
      json,
      zfill
    });
    searchHeader.init(listingCore, searchFilter, window.zoomManager);

    // 5. NearbyHeader (Nearby-Popover-UI)
    const nearbyHeader = new window.NearbyHeader();
    nearbyHeader.init(map, listingCore);

    // ═══════════════════════════════════════════════════════════════════════
    // GLOBALE REFERENZEN (für Backward Compatibility)
    // ═══════════════════════════════════════════════════════════════════════

    window.app = {
      listingCore,
      searchFilter,
      searchHeader,
      nearbyHeader,
      zoomManager: window.zoomManager,
      config: CONFIG,
      icons
    };

    // Mobile Filter UI
    if (window.MobileFilterUI) {
      window.app.mobileFilterUI = new window.MobileFilterUI();
      window.app.mobileFilterUI.init();
    }

    // Backward Compatibility: window.searchManager
    window.searchManager = {
      // Referenz auf SearchHeader
      _header: searchHeader,
      _filter: searchFilter,
      _listingCore: listingCore,

      // Methoden für Backward Compatibility
      applyHoverEffects: (item, location, weight) => listingCore.applyHoverEffects(item, location, weight),
      removeHoverEffects: (location) => listingCore.removeHoverEffects(location),
      updateHoverSVGPosition: () => listingCore.updateHoverSVGPosition(),
      createConnectionLine: (item, marker, color, weight) => listingCore.createConnectionLine(item, marker, color, weight),
      removeConnectionLine: () => listingCore.removeConnectionLine(),
      cleanupHoverSVG: () => listingCore.cleanupHoverSVG(),
      clearSearch: (focus) => searchHeader.clearSearch(focus),
      applyPillFilters: (pills) => searchHeader.triggerFilterUpdate(),
      closeDropdown: () => searchHeader.closeDropdown(),
      createSuggestionItems: (locations, idMatch) => searchHeader.createSuggestionItems(locations, idMatch),
      updateSearchCounter: (count) => searchHeader.updateSearchCounter(count),
      updateDropdownUI: (show) => searchHeader.updateDropdownUI(show),
      executeRightClickCleanup: () => {
        searchHeader._manualSpaceClick = true;
        searchHeader.closeDropdown();
        if (document.activeElement === searchHeader.searchBar) {
          searchHeader.searchBar.blur();
        }
        setTimeout(() => { searchHeader._manualSpaceClick = false; }, 100);
      },
      setStyleFilterManager: () => {}, // Nicht mehr nötig

      // Getters für Kompatibilität
      get styleFilterManager() { return searchFilter; },
      get searchBar() { return searchHeader.searchBar; },
      get pillsManager() { return searchHeader.pillsManager; },
      get autocompleteManager() { return searchHeader.autocompleteManager; }
    };

    // Backward Compatibility: window.styleFilterManager
    window.styleFilterManager = searchFilter;

    // Backward Compatibility: window.nearbySpacesManager
    window.nearbySpacesManager = nearbyHeader;

    console.log('✅ App initialized successfully');
    console.log('  - ListingCore:', !!listingCore);
    console.log('  - SearchFilter:', !!searchFilter);
    console.log('  - SearchHeader:', !!searchHeader);
    console.log('  - NearbyHeader:', !!nearbyHeader);

    return {
      listingCore,
      searchFilter,
      searchHeader,
      nearbyHeader,
      icons
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // LEGACY-MODUS: Alte Module erstellen falls noch benötigt
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Erstellt Legacy-kompatible Manager-Instanzen
   * Für schrittweise Migration
   */
  function initLegacyMode(map, allMarkers, json, icons, zfill) {
    console.log('⚠️ Running in Legacy Mode');

    // Wenn die neuen Module nicht geladen sind, nutze alte
    if (!window.ListingCore || !window.SearchFilter || !window.SearchHeader) {
      console.log('  - New modules not loaded, using legacy modules');
      return null;
    }

    return initApp({ map, json, allMarkers, zfill });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // GLOBALER EXPORT
  // ═══════════════════════════════════════════════════════════════════════════

  window.AppMain = {
    init: initApp,
    initLegacy: initLegacyMode,
    createLeafletIcon,
    initializeLeafletIcons,
    get icons() {
      return initializeLeafletIcons();
    },
    CONFIG
  };

  console.log('✅ AppMain loaded');

})();
