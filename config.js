// config.js - Zentrale Konfiguration für makerspac.es
// Enthält alle Konstanten, Mappings und einfache Helper-Funktionen

(function() {
  'use strict';

  // ═══════════════════════════════════════════════════════════════════════════
  // FARBEN
  // ═══════════════════════════════════════════════════════════════════════════

  const COLOURS = {
    // Standard Farben
    default: '#2c2c2c',
    highlight: '#2c2c2c',

    // SpaceAPI Status Farben
    open: '#009900',
    closed: '#DD0000',
    unknown: '#FF8C00',

    // Hover/Interaktive Farben
    hoverLight: '#0000ff',
    hoverDark: '#66b3ff',

    // Dark Mode
    darkModeDefault: '#666666',

    // UI Farben
    textLight: '#2c2c2c',
    textDark: '#e0e0e0',
    backgroundLight: '#ffffff',
    backgroundDark: '#2c2c2c',

    // Feature-spezifische Farben
    nearbyTitle: 'rgba(111, 233, 166, 0.66)'
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // ICON-KLASSEN (FontAwesome)
  // ═══════════════════════════════════════════════════════════════════════════

  const ICONS = {
    // Style-Icons für Makerspace-Typen
    styles: {
      'for all': 'fas fa-people-group',
      'for students': 'fas fa-graduation-cap',
      'for youth': 'fas fa-child',
      'for students & youth': 'fas fa-graduation-cap',
      'commercial': 'fas fa-money-bill-wave'
    },

    // Status-Icons (SpaceAPI)
    status: {
      open: 'fas fa-door-open',
      closed: 'fas fa-door-closed',
      unknown: 'fas fa-question-circle'
    },

    // UI-Icons
    ui: {
      bookmarkFilled: 'fas fa-bookmark',
      bookmarkOutline: 'far fa-bookmark',
      crosshairs: 'fas fa-crosshairs',
      close: 'fas fa-times',
      settings: 'fas fa-cog',
      search: 'fas fa-search',
      filter: 'fas fa-filter',
      marker: 'fas fa-map-marker-alt',
      grip: 'fas fa-grip-lines',
      caretUp: 'fas fa-caret-up',
      caretDown: 'fas fa-caret-down',
      flag: 'fas fa-flag',
      peopleGroup: 'fas fa-people-group',
      doorOpen: 'fas fa-door-open'
    }
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // LÄNDER-CODES (für Flag-Icons)
  // ═══════════════════════════════════════════════════════════════════════════

  const COUNTRY_CODES = {
    'Germany': 'de',
    'Austria': 'at',
    'Switzerland': 'ch',
    'France': 'fr',
    'Netherlands': 'nl',
    'Belgium': 'be',
    'Italy': 'it',
    'Spain': 'es',
    'Ukraine': 'ua',
    'Denmark': 'dk',
    'Poland': 'pl',
    'Luxembourg': 'lu'
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // UI-EINSTELLUNGEN
  // ═══════════════════════════════════════════════════════════════════════════

  const SETTINGS = {
    // Nearby-Spaces Radien (in km)
    radiusOptions: [15, 25, 40, 65],
    defaultRadius: 25,

    // Listen-Einstellungen
    maxListItems: 20,
    itemHeight: 70,

    // Timing
    debounceMs: 150,
    zoomDebounceMs: 800,
    popupDelayMs: 300,
    hintShrinkMs: 1350,
    hintFadeMs: 1200,
    inactivityMs: 3500,

    // Zoom
    zoomThreshold: 2,
    defaultZoomLevel: 15,

    // Connection Line
    connectionWeightSearch: 6,
    connectionWeightNearby: 5,

    // Sticky Header Offset
    stickyOffset: 85,
    filterSectionHeight: 119,

    // Resize Handle
    minVisibleItems: 3,
    maxVisibleItems: 8
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // FILTER-KATEGORIEN
  // ═══════════════════════════════════════════════════════════════════════════

  const FILTER_CATEGORIES = {
    style: {
      icon: 'fas fa-people-group',
      options: ['for all', 'for youth', 'for students', 'commercial']
    },
    doorState: {
      icon: 'fas fa-door-open',
      options: ['open', 'closed']
    },
    country: {
      icon: 'fas fa-flag',
      options: [] // Wird dynamisch befüllt
    },
    bookmarks: {
      icon: 'fas fa-bookmark',
      options: ['bookmarked'],
      iconOnly: true
    }
  };

  // Ignorierte Styles (werden nicht in Filtern angezeigt)
  const IGNORED_STYLES = [
    'unknown',
    'STYLE_STYLE',
    'for students & youth',
    'for students // commercial'
  ];

  // Feste Reihenfolge für Filter
  const FILTER_ORDER = [
    'for all',
    'for youth',
    'for students',
    'commercial',
    'open',
    'closed'
  ];

  // ═══════════════════════════════════════════════════════════════════════════
  // HELPER-FUNKTIONEN
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Holt Style-Icon-Klasse für einen Space-Typ
   * @param {string} style - Style-String (z.B. 'for all')
   * @returns {string} FontAwesome Klasse oder leerer String
   */
  function getStyleIcon(style) {
    const key = style ? style.toLowerCase() : '';
    return ICONS.styles[key] || '';
  }

  /**
   * Holt Status-Icon-Klasse basierend auf isOpen
   * @param {boolean|null} isOpen - Space Status
   * @returns {string} FontAwesome Klasse
   */
  function getStatusIcon(isOpen) {
    if (isOpen === true) return ICONS.status.open;
    if (isOpen === false) return ICONS.status.closed;
    return ICONS.status.unknown;
  }

  /**
   * Holt Country-Code für Flag-Icons
   * @param {string} country - Ländername
   * @returns {string} 2-stelliger Country Code (lowercase)
   */
  function getCountryCode(country) {
    return COUNTRY_CODES[country] || 'un';
  }

  /**
   * Prüft ob Dark Mode aktiv ist
   * @returns {boolean}
   */
  function isDarkMode() {
    return window.matchMedia?.('(prefers-color-scheme: dark)').matches || false;
  }

  /**
   * Bestimmt die aktuelle Default-Icon-Farbe basierend auf Dark Mode
   * @returns {string} Hex-Farbcode
   */
  function getDefaultIconColor() {
    return isDarkMode() ? COLOURS.darkModeDefault : COLOURS.default;
  }

  /**
   * Bestimmt die Hover-Farbe basierend auf Dark Mode
   * @returns {string} Hex-Farbcode
   */
  function getHoverColor() {
    return isDarkMode() ? COLOURS.hoverDark : COLOURS.hoverLight;
  }

  /**
   * Bestimmt die dynamische Farbe für einen Space basierend auf Status
   * @param {Object} location - Location-Objekt mit isOpen und spaceapi
   * @returns {string} Hex-Farbcode
   */
  function getDynamicSpaceColor(location) {
    if (location && location.spaceapi && location.spaceapi.endpoint) {
      if (location.isOpen === true) {
        return COLOURS.open;
      } else if (location.isOpen === false) {
        return COLOURS.closed;
      } else {
        return COLOURS.unknown;
      }
    }
    // Standard Akzentfarbe (Hover)
    return getHoverColor();
  }

  /**
   * Berechnet die Entfernung zwischen zwei Koordinaten (Haversine)
   * @param {number} lat1 - Breitengrad 1
   * @param {number} lon1 - Längengrad 1
   * @param {number} lat2 - Breitengrad 2
   * @param {number} lon2 - Längengrad 2
   * @returns {number} Entfernung in km
   */
  function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // Erdradius in km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  /**
   * Escaped HTML-Zeichen für sichere Ausgabe
   * @param {string} text - Zu escapender Text
   * @returns {string} Escaped Text
   */
  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text || '';
    return div.innerHTML;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SCHWEIF SVG (Connector zwischen Liste und Karte)
  // ═══════════════════════════════════════════════════════════════════════════

  const SCHWEIF_PATH = 'M632.86,6.618L436.232,6.618C416.818,6.599 396.254,9.684 376.225,16.429C356.196,23.174 336.703,33.579 319.618,47.041C302.534,60.503 287.858,77.022 276.615,94.918C265.373,112.813 257.563,132.086 253.041,150.966C244.69,186.193 226.089,220.425 195.188,245.142C164.286,269.858 121.084,285.059 70.815,284.779L70.815,336.251C121.084,335.971 164.286,351.172 195.188,375.888C226.089,400.604 244.69,434.836 253.041,470.064C257.563,488.944 276.615,526.112 287.858,544.008C302.534,560.527 319.618,573.988 336.703,587.45C356.196,597.856 376.225,604.6 396.254,611.345C416.818,614.43 436.232,614.412 436.232,614.412L632.86,614.412L632.86,6.618Z';

  function createConnectorSVG(itemRect, color, topOffset = 0) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.id = 'current-connector';
    svg.style.cssText = `position: fixed; left: ${itemRect.left - 50}px; top: ${itemRect.top + topOffset}px; width: 80px; height: ${itemRect.height}px; z-index: 999; pointer-events: none;`;
    svg.setAttribute('viewBox', '65 0 570 620');
    svg.setAttribute('preserveAspectRatio', 'none');

    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', SCHWEIF_PATH);
    path.setAttribute('fill', color);
    svg.appendChild(path);

    document.body.appendChild(svg);
    return svg;
  }

  function cleanupConnectorSVG(svgRef) {
    if (svgRef) svgRef.remove();
    const svg = document.getElementById('current-connector');
    if (svg) svg.remove();
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // GLOBALER EXPORT
  // ═══════════════════════════════════════════════════════════════════════════

  window.AppConfig = {
    // Konstanten
    colours: COLOURS,
    icons: ICONS,
    countryCodes: COUNTRY_CODES,
    settings: SETTINGS,
    filterCategories: FILTER_CATEGORIES,
    ignoredStyles: IGNORED_STYLES,
    filterOrder: FILTER_ORDER,

    // Helper-Funktionen
    getStyleIcon,
    getStatusIcon,
    getCountryCode,
    isDarkMode,
    getDefaultIconColor,
    getHoverColor,
    getDynamicSpaceColor,
    calculateDistance,
    escapeHtml,
    schweifPath: SCHWEIF_PATH,
    createConnectorSVG,
    cleanupConnectorSVG
  };

  // Backward Compatibility (für existierenden Code während Migration)
  window.IC = COLOURS;
  window.getDynamicSpaceColor = getDynamicSpaceColor;

  console.log('✅ AppConfig loaded');

})();
