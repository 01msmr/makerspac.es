// main.js - Orchestrator für makerspac.es
// Initialisiert und verbindet alle Module

import AppConfig from './config.js';
import { ListingCore } from './listing-core.js';
import { SearchFilter } from './search-filter.js';
import { SearchHeader } from './search-header.js';
import { NearbyHeader } from './nearby-header.js';
import { zoomManager } from './zoom-manager.js';
import { MobileFilterUI } from './mobile-filter.js';
import { appContext } from './app-context.js';

const CONFIG = AppConfig;

  // ═══════════════════════════════════════════════════════════════════════════
  // LEAFLET ICON FACTORY
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Erstellt ein Leaflet DivIcon mit inline-SVG (kein base64, CSS-targetierbar).
   * @param {string} color - Hex-Farbcode für die Icon-Füllung
   * @param {number} scale - Skalierungsfaktor (1.0 = normal, 1.5 = groß)
   * @returns {L.DivIcon} Leaflet DivIcon Instanz
   */
  function createLeafletIcon(color, scale = 1.0) {
    const w = Math.round(25 * scale);
    const h = Math.round(41 * scale);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 25 41" width="${w}" height="${h}" style="overflow:visible;display:block">` +
      `<path fill="${color}" stroke="#000" stroke-width="1" d="M12.5,1 C6.16,1 1,6.16 1,12.5 C1,20.88 12.5,39 12.5,39 C12.5,39 24,20.88 24,12.5 C24,6.16 18.84,1 12.5,1 Z"/>` +
      `<circle fill="#fff" cx="12.5" cy="12.5" r="3"/>` +
      `</svg>`;
    return L.divIcon({
      html: svg,
      className: 'ms-marker-icon',
      iconSize: [w, h],
      iconAnchor: [w / 2, h],
      popupAnchor: [Math.round(scale), Math.round(-34 * scale)],
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // LEAFLET ICON DEFINITIONEN (Lazy Loading)
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * @typedef {Object} LeafletIconSet
   * @property {L.Icon} defaultIcon
   * @property {L.Icon} highlightIcon
   * @property {L.Icon} hoverIcon
   * @property {L.Icon} greenIcon
   * @property {L.Icon} redIcon
   * @property {L.Icon} unknownStatusIcon
   */

  /** @type {LeafletIconSet|null} */
  let LeafletIcons = null;

  /**
   * Initialisiert alle Leaflet-Icons (Lazy: nur einmal, nur wenn L verfügbar).
   * @returns {LeafletIconSet|null} null wenn Leaflet noch nicht geladen
   */
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

  appContext.mapIcons = {
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
  window.MapIcons = appContext.mapIcons; // backward compat

  // Weitere Backward Compatibility
  window.IC = CONFIG.colours;
  window.getDynamicSpaceColor = CONFIG.getDynamicSpaceColor;

  // ═══════════════════════════════════════════════════════════════════════════
  // APP INITIALISIERUNG
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * @typedef {Object} InitAppOptions
   * @property {L.Map} map - Leaflet Map-Instanz
   * @property {import('./app-context.js').Location[]} json - Alle Makerspace-Einträge
   * @property {L.Marker[]} allMarkers - Alle Leaflet-Marker
   * @property {function(string|number, string): string} zfill - PLZ-Formatierungsfunktion
   */

  /**
   * Haupt-Initialisierungsfunktion — wird von map.js nach Phase 'data' aufgerufen.
   * Erstellt alle UI-Module und verbindet sie via appContext.
   * @param {InitAppOptions} options
   * @returns {{ listingCore: ListingCore, searchFilter: SearchFilter, searchHeader: SearchHeader, nearbyHeader: NearbyHeader, icons: LeafletIconSet }|null}
   */
  function initApp(options = {}) {
    const {
      map,
      json,
      allMarkers,
      zfill
    } = options;


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
    const listingCore = new ListingCore();

    // 2. SearchFilter (Such- und Filter-Logik)
    const searchFilter = new SearchFilter(json, allMarkers, icons);

    // 3. ZoomManager initialisieren
    zoomManager.init(map);

    // 4. SearchHeader (Searchbar-UI)
    const searchHeader = new SearchHeader({
      map,
      json,
      zfill
    });
    searchHeader.init(listingCore, searchFilter, zoomManager);

    // 5. NearbyHeader (Nearby-Popover-UI)
    const nearbyHeader = new NearbyHeader();
    nearbyHeader.init(map, listingCore);

    // ═══════════════════════════════════════════════════════════════════════
    // APP-KONTEXT BEFÜLLEN
    // ═══════════════════════════════════════════════════════════════════════

    appContext.listingCore   = listingCore;
    appContext.searchFilter  = searchFilter;
    appContext.searchHeader  = searchHeader;
    appContext.nearbyHeader  = nearbyHeader;

    // Mobile Filter UI
    const mobileFilterUI = new MobileFilterUI();
    mobileFilterUI.init();
    appContext.mobileFilterUI = mobileFilterUI;

    // window.app als Proxy auf appContext (backward compat für noch nicht migrierte Dateien)
    window.app = {
      get listingCore()    { return appContext.listingCore; },
      get searchFilter()   { return appContext.searchFilter; },
      get searchHeader()   { return appContext.searchHeader; },
      get nearbyHeader()   { return appContext.nearbyHeader; },
      get mobileFilterUI() { return appContext.mobileFilterUI; },
      zoomManager,
      config: CONFIG,
      icons
    };
    window.mobileFilterUI      = appContext.mobileFilterUI;   // backward compat
    window.styleFilterManager  = searchFilter;                // backward compat
    window.nearbySpacesManager = nearbyHeader;                // backward compat

    appContext.ready('app');

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
   * Legacy-Wrapper um initApp — für noch nicht migrierte Aufrufer.
   * @param {L.Map} map
   * @param {L.Marker[]} allMarkers
   * @param {import('./app-context.js').Location[]} json
   * @param {LeafletIconSet} icons
   * @param {function(string|number, string): string} zfill
   * @returns {ReturnType<typeof initApp>}
   */
  function initLegacyMode(map, allMarkers, json, icons, zfill) {
    return initApp({ map, json, allMarkers, zfill });
  }

export { initApp, initLegacyMode, createLeafletIcon, initializeLeafletIcons };
