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
    open: '#0e9000',
    closed: '#DD0000',
    unknown: '#f67b00',

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
      closed: 'fas fa-lock',
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
    radiusOptions: [10, 15, 25, 40, 65],
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

  // const SCHWEIF_PATH = 'M632.86,6.618L436.232,6.618C416.818,6.599 396.254,9.684 376.225,16.429C356.196,23.174 336.703,33.579 319.618,47.041C302.534,60.503 287.858,77.022 276.615,94.918C265.373,112.813 257.563,132.086 253.041,150.966C244.69,186.193 226.089,220.425 195.188,245.142C164.286,269.858 121.084,285.059 70.815,284.779L70.815,336.251C121.084,335.971 164.286,351.172 195.188,375.888C226.089,400.604 244.69,434.836 253.041,470.064C257.563,488.944 276.615,526.112 287.858,544.008C302.534,560.527 319.618,573.988 336.703,587.45C356.196,597.856 376.225,604.6 396.254,611.345C416.818,614.43 436.232,614.412 436.232,614.412L632.86,614.412L632.86,6.618Z';
  // schweif3-erw.svg
  const SCHWEIF_PATH = 'M1387.99,414.821C1344.24,414.778 1297.9,421.73 1252.77,436.929C1207.64,452.128 1163.71,475.574 1125.21,505.909C1086.72,536.244 1053.65,573.467 1028.31,613.793C1002.98,654.118 985.382,697.547 975.191,740.09C956.386,819.552 914.422,896.452 844.896,952.282C810.133,980.198 768.48,1002.85 721.184,1018.21C673.888,1033.58 620.949,1041.66 564.569,1041.62L564.569,1157.61C620.949,1157.57 673.888,1165.65 721.184,1181.02C768.48,1196.38 810.133,1219.03 844.896,1246.95C914.422,1302.78 956.386,1379.68 975.191,1459.14C985.382,1501.68 1002.98,1545.11 1028.31,1585.44C1053.65,1625.76 1086.72,1662.99 1125.21,1693.32C1163.71,1723.65 1207.64,1747.1 1252.77,1762.3C1297.9,1777.5 1344.24,1784.45 1387.99,1784.41L1387.99,786.606L1831.07,414.821L1387.99,414.821Z';
  const SCHWEIF_TRANSFORM = 'matrix(4.16667,0,0,-4.16667,0,9163.45)';

  const CONNECTOR_OFFSET_LEFT = -50;
  const CONNECTOR_OFFSET_TOP = 0.0;

  function updateConnectorPosition(svg, itemRect, topOffset = 0) {
    svg.style.left = `${itemRect.left + CONNECTOR_OFFSET_LEFT}px`;
    svg.style.top = `${itemRect.top + topOffset + CONNECTOR_OFFSET_TOP}px`;
    svg.style.height = `${itemRect.height - 0.0}px`;
  }

  // function createConnectorSVG(itemRect, color, topOffset = 0) {
  //   const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  //   svg.id = 'current-connector';
  //   updateConnectorPosition(svg, itemRect, topOffset);
  //   svg.setAttribute('viewBox', '65 0 570 620');
  //   svg.setAttribute('preserveAspectRatio', 'none');
  //
  //   const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  //   path.setAttribute('d', SCHWEIF_PATH);
  //   path.setAttribute('fill', color);
  //   svg.appendChild(path);
  //
  //   document.body.appendChild(svg);
  //   return svg;
  // }

  function createConnectorSVG(itemRect, color, topOffset = 0) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.id = 'current-connector';
    updateConnectorPosition(svg, itemRect, topOffset);
    svg.setAttribute('viewBox', '2350 1725 5280 5710');
    svg.setAttribute('preserveAspectRatio', 'none');

    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    g.setAttribute('transform', SCHWEIF_TRANSFORM);

    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', SCHWEIF_PATH);
    path.setAttribute('fill', color);
    // path.setAttribute('stroke', 'black');
    // path.setAttribute('stroke-width', '2');
    // path.setAttribute('vector-effect', 'non-scaling-stroke');
    g.appendChild(path);
    svg.appendChild(g);

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
    updateConnectorPosition,
    cleanupConnectorSVG,
    connectorOffsetLeft: CONNECTOR_OFFSET_LEFT
  };

  // Backward Compatibility (für existierenden Code während Migration)
  window.IC = COLOURS;
  window.getDynamicSpaceColor = getDynamicSpaceColor;

  // ═══════════════════════════════════════════════════════════════════════════
  // CSS-VARIABLEN AUS COLOURS SETZEN (Single Source of Truth)
  // ═══════════════════════════════════════════════════════════════════════════

  function applyCssColours() {
    const root = document.documentElement;
    const dark = isDarkMode();

    root.style.setProperty('--space-hover', dark ? COLOURS.hoverDark : COLOURS.hoverLight);
    root.style.setProperty('--space-open', COLOURS.open);
    root.style.setProperty('--space-closed', COLOURS.closed);
    root.style.setProperty('--space-unknown', COLOURS.unknown);
    root.style.setProperty('--color-default', dark ? COLOURS.darkModeDefault : COLOURS.default);
    root.style.setProperty('--color-highlight', dark ? COLOURS.darkModeDefault : COLOURS.highlight);
  }

  // Sofort anwenden
  applyCssColours();

  // Bei Dark/Light Mode Wechsel aktualisieren
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyCssColours);

  console.log('✅ AppConfig loaded');

})();
