// icons.js - Zentrale Icon & Farb-Definitionen mit einheitlichem Namespace

/* ============================================================================
   FARBDEFINITIONEN (Kanonische Quelle für JavaScript)
   ============================================================================ */

const ICON_COLOURS = {
  // Standard Farben
  DEFAULT: '#2c2c2c',
  HIGHLIGHT: '#2c2c2c',

  // SpaceAPI Status Farben
  OPEN: '#009900',
  CLOSED: '#DD0000',
  UNKNOWN: '#FF8C00',

  // Hover/Interaktive Farben
  HOVER_LIGHT: '#0000ff',
  HOVER_DARK: '#66b3ff',

  // Dark Mode
  DARK_MODE_DEFAULT: '#666666',

  // UI Farben (falls in JS benötigt)
  TEXT_LIGHT: '#2c2c2c',
  TEXT_DARK: '#e0e0e0',
  BACKGROUND_LIGHT: '#ffffff',
  BACKGROUND_DARK: '#2c2c2c'
};

/* ============================================================================
   ICON-MAPPINGS (Kanonische Quelle für alle Icon-Klassen)
   ============================================================================ */

const STYLE_ICON_MAP = {
  'for all': 'fas fa-people-group',
  'for students': 'fas fa-graduation-cap',
  'for youth': 'fas fa-child',
  'for students & youth': 'fas fa-graduation-cap',
  'commercial': 'fas fa-money-bill-wave'
};

const STATUS_ICON_MAP = {
  open: 'fas fa-door-open',
  closed: 'fas fa-door-closed',
  unknown: 'fas fa-question-circle'
};

const UI_ICON_MAP = {
  BOOKMARK_FILLED: 'fas fa-bookmark',
  BOOKMARK_OUTLINE: 'far fa-bookmark',
  CROSSHAIRS: 'fas fa-crosshairs',
  CLOSE: 'fas fa-times',
  SETTINGS: 'fas fa-cog',
  SEARCH: 'fas fa-search'
};

/* ============================================================================
   COUNTRY CODE MAPPING (Zentrale Quelle)
   ============================================================================ */

const COUNTRY_CODE_MAP = {
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

/* ============================================================================
   HILFSFUNKTIONEN
   ============================================================================ */

/**
 * Bestimmt die aktuelle Default-Icon-Farbe basierend auf Dark Mode
 * @returns {string} Hex-Farbcode
 */
function getDefaultIconColor() {
  const isDarkMode = window.matchMedia &&
    window.matchMedia('(prefers-color-scheme: dark)').matches;
  return isDarkMode ? ICON_COLOURS.DARK_MODE_DEFAULT : ICON_COLOURS.DEFAULT;
}

/**
 * Bestimmt die dynamische Farbe für einen Space basierend auf Status
 * @param {Object} location - Location-Objekt mit isOpen und spaceapi
 * @returns {string} Hex-Farbcode
 */
function getDynamicSpaceColor(location) {
  const isDarkMode = window.matchMedia &&
    window.matchMedia('(prefers-color-scheme: dark)').matches;

  if (location && location.spaceapi && location.spaceapi.endpoint) {
    if (location.isOpen === true) {
      return ICON_COLOURS.OPEN;
    } else if (location.isOpen === false) {
      return ICON_COLOURS.CLOSED;
    } else {
      return ICON_COLOURS.UNKNOWN;
    }
  } else {
    // Standard Akzentfarbe (Hover)
    return isDarkMode ? ICON_COLOURS.HOVER_DARK : ICON_COLOURS.HOVER_LIGHT;
  }
}

/**
 * Holt Style-Icon-Klasse für einen Space-Typ
 * @param {string} style - Style-String (z.B. 'for all')
 * @returns {string} FontAwesome Klasse oder leerer String
 */
function getStyleIcon(style) {
  const styleKey = style ? style.toLowerCase() : '';
  return STYLE_ICON_MAP[styleKey] || '';
}

/**
 * Holt Status-Icon-Klasse basierend auf isOpen
 * @param {boolean|null} isOpen - Space Status
 * @returns {string} FontAwesome Klasse
 */
function getStatusIcon(isOpen) {
  if (isOpen === true) return STATUS_ICON_MAP.open;
  if (isOpen === false) return STATUS_ICON_MAP.closed;
  return STATUS_ICON_MAP.unknown;
}

/**
 * Holt Country-Code für Flag-Icons
 * @param {string} country - Ländername
 * @returns {string} 2-stelliger Country Code (lowercase)
 */
function getCountryCode(country) {
  return COUNTRY_CODE_MAP[country] || 'un';
}

/* ============================================================================
   LEAFLET ICON FACTORY
   ============================================================================ */

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
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
    iconSize: iconSize,
    iconAnchor: iconAnchor,
    popupAnchor: popupAnchor,
    shadowSize: shadowSize
  });
}

/* ============================================================================
   LEAFLET ICON DEFINITIONEN (Lazy Loading)
   ============================================================================ */

// ✅ FIX: Icons werden erst erstellt, wenn Leaflet verfügbar ist
let LeafletIcons = null;

function initializeLeafletIcons() {
  if (LeafletIcons || typeof L === 'undefined') {
    return LeafletIcons;
  }

  LeafletIcons = {
    // Standard dunkelgraues/schwarzes Icon (Dark Mode aware)
    defaultIcon: createLeafletIcon(getDefaultIconColor()),

    // Highlight Icon (identisch zu default für Konsistenz)
    highlightIcon: createLeafletIcon(getDefaultIconColor()),

    // Hover Icon (vergrößert, blau)
    hoverIcon: createLeafletIcon(ICON_COLOURS.HOVER_LIGHT, 1.5),

    // Grünes Icon für geöffnete Spaces
    greenIcon: createLeafletIcon(ICON_COLOURS.OPEN),

    // Rotes Icon für geschlossene Spaces
    redIcon: createLeafletIcon(ICON_COLOURS.CLOSED),

    // Orange Icon für Spaces mit unbekanntem Status
    unknownStatusIcon: createLeafletIcon(ICON_COLOURS.UNKNOWN)
  };

  return LeafletIcons;
}

// ✅ Auto-initialize wenn Leaflet verfügbar ist
if (typeof L !== 'undefined') {
  initializeLeafletIcons();
}

/* ============================================================================
   GLOBALER NAMESPACE EXPORT
   ============================================================================ */

window.MapIcons = {
  // Leaflet Icon Instanzen (Lazy Loading via Getter)
  get icons() {
    return initializeLeafletIcons();
  },

  // Icon Factory (für dynamische Icon-Erstellung)
  createIcon: createLeafletIcon,

  // Farb-Konstanten
  colors: ICON_COLOURS,

  // Icon-Mappings
  styleMap: STYLE_ICON_MAP,
  statusMap: STATUS_ICON_MAP,
  uiMap: UI_ICON_MAP,
  countryMap: COUNTRY_CODE_MAP,

  // Helper-Funktionen
  getDynamicColor: getDynamicSpaceColor,
  getStyleIcon: getStyleIcon,
  getStatusIcon: getStatusIcon,
  getCountryCode: getCountryCode,
  getDefaultColor: getDefaultIconColor
};

// Backward Compatibility (für existierenden Code)
window.IC = ICON_COLOURS;
window.getDynamicSpaceColor = getDynamicSpaceColor;

console.log('✅ MapIcons namespace loaded:', Object.keys(window.MapIcons));