// @ts-check
// config.js - Zentrale Konfiguration für makerspac.es
// Assembliert AppConfig aus den Sub-Modulen:
//   colours.js        → Farben & Dark-Mode-Helpers
//   workshop-types.js → Workshop-Definitionen
//   filter-config.js  → Filter-Kategorien & Style-Icons
//
// Alle bestehenden Imports (import AppConfig from './config.js') bleiben unverändert.

import {
  COLOURS,
  isDarkMode,
  getDefaultIconColor,
  getHoverColor,
  getDynamicSpaceColor,
  applyCssColours,
} from './colours.js';

import {
  WORKSHOP_TYPES,
  getWorkshopIcon,
  getWorkshopsTooltip,
  getSortedWorkshops,
} from './workshop-types.js';

import {
  FILTER_CATEGORIES,
  IGNORED_STYLES,
  FILTER_ORDER,
  getStyleIcon,
} from './filter-config.js';

// ═══════════════════════════════════════════════════════════════════════════
// ICON-KLASSEN (FontAwesome) — UI-Icons + abgeleitete Workshop-Icons
// ═══════════════════════════════════════════════════════════════════════════

const ICONS = {
  styles: {
    'for all':              'fas fa-people-group',
    'for students':         'fas fa-graduation-cap',
    'for youth':            'fas fa-child',
    'for students & youth': 'fas fa-graduation-cap',
    'commercial':           'fas fa-money-bill-wave',
  },
  status: {
    open:    'fas fa-door-open',
    closed:  'fas fa-lock',
    unknown: 'fas fa-question-circle',
  },
  ui: {
    bookmarkFilled:  'fas fa-bookmark',
    bookmarkOutline: 'far fa-bookmark',
    crosshairs:      'fas fa-crosshairs',
    close:           'fas fa-times',
    settings:        'fas fa-cog',
    search:          'fas fa-search',
    filter:          'fas fa-filter',
    marker:          'fas fa-map-marker-alt',
    grip:            'fas fa-grip-lines',
    caretUp:         'fas fa-caret-up',
    caretDown:       'fas fa-caret-down',
    flag:            'fas fa-flag',
    peopleGroup:     'fas fa-people-group',
    doorOpen:        'fas fa-door-open',
    calendarDay:     'fas fa-calendar-day',
    workshops:       'fas fa-wrench',
  },
  // Workshop-Icons — abgeleitet aus WORKSHOP_TYPES (nicht manuell pflegen)
  workshops: Object.fromEntries(Object.entries(WORKSHOP_TYPES).map(([id, def]) => [id, def.icon])),
};

// ═══════════════════════════════════════════════════════════════════════════
// LÄNDER-CODES (für Flag-Icons)
// ═══════════════════════════════════════════════════════════════════════════

const COUNTRY_CODES = {
  'Germany':     'de',
  'Austria':     'at',
  'Switzerland': 'ch',
  'France':      'fr',
  'Netherlands': 'nl',
  'Belgium':     'be',
  'Italy':       'it',
  'Spain':       'es',
  'Ukraine':     'ua',
  'Denmark':     'dk',
  'Poland':      'pl',
  'Luxembourg':  'lu',
};

// ═══════════════════════════════════════════════════════════════════════════
// UI-EINSTELLUNGEN
// ═══════════════════════════════════════════════════════════════════════════

const SETTINGS = {
  radiusOptions:          [10, 15, 25, 40, 65],
  defaultRadius:          25,
  maxListItems:           20,
  itemHeight:             70,
  debounceMs:             150,
  zoomDebounceMs:         800,
  popupDelayMs:           300,
  hintShrinkMs:           1350,
  hintFadeMs:             1200,
  inactivityMs:           3500,
  zoomThreshold:          2,
  defaultZoomLevel:       15,
  connectionWeightSearch: 6,
  connectionWeightNearby: 5,
  stickyOffset:           85,
  filterSectionHeight:    119,
  minVisibleItems:        3,
  maxVisibleItems:        8,
};

// ═══════════════════════════════════════════════════════════════════════════
// HELPER-FUNKTIONEN
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Holt Status-Icon-Klasse basierend auf isOpen
 * @param {boolean|null} isOpen - Space Status
 * @returns {string} FontAwesome-Klasse
 */
function getStatusIcon(isOpen) {
  if (isOpen === true)  return ICONS.status.open;
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
 * Formatiert eine PLZ auf die landesspezifische Länge (mit führenden Nullen).
 * @param {string|number} plz
 * @param {string} country - Vollständiger Ländername (z.B. 'Germany')
 * @returns {string}
 */
function zfill(plz, country) {
  const expectedLengths = { Germany: 5, Austria: 4, Belgium: 4, Switzerland: 4, Poland: 5, USA: 5, Italy: 5, Spain: 5, France: 5, Luxemburg: 4, Netherlands: 4, Ukraine: 5 };
  const plzStr = String(plz || '');
  const expectedLength = expectedLengths[country] || plzStr.length;
  return plzStr.padStart(expectedLength, '0');
}

/**
 * Berechnet die Entfernung zwischen zwei Koordinaten (Haversine)
 * @param {number} lat1
 * @param {number} lon1
 * @param {number} lat2
 * @param {number} lon2
 * @returns {number} Entfernung in km
 */
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Escaped HTML-Zeichen für sichere Ausgabe
 * @param {string} text
 * @returns {string}
 */
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text || '';
  return div.innerHTML;
}

// ═══════════════════════════════════════════════════════════════════════════
// LEAFLET MARKER ICON
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Erstellt ein Leaflet DivIcon (SVG-Pin) in der gewünschten Farbe und Größe.
 * Benötigt Leaflet (L) zur Laufzeit.
 * @param {string} color - Fill-Farbe (CSS-Farbwert)
 * @param {number} [scale=1.0] - Skalierungsfaktor
 * @returns {L.DivIcon}
 */
export function createLeafletIcon(color, scale = 1.0) {
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
// SCHWEIF SVG (Connector zwischen Liste und Karte)
// ═══════════════════════════════════════════════════════════════════════════

// schweif3-erw.svg
const SCHWEIF_PATH = 'M1387.99,414.821C1344.24,414.778 1297.9,421.73 1252.77,436.929C1207.64,452.128 1163.71,475.574 1125.21,505.909C1086.72,536.244 1053.65,573.467 1028.31,613.793C1002.98,654.118 985.382,697.547 975.191,740.09C956.386,819.552 914.422,896.452 844.896,952.282C810.133,980.198 768.48,1002.85 721.184,1018.21C673.888,1033.58 620.949,1041.66 564.569,1041.62L564.569,1157.61C620.949,1157.57 673.888,1165.65 721.184,1181.02C768.48,1196.38 810.133,1219.03 844.896,1246.95C914.422,1302.78 956.386,1379.68 975.191,1459.14C985.382,1501.68 1002.98,1545.11 1028.31,1585.44C1053.65,1625.76 1086.72,1662.99 1125.21,1693.32C1163.71,1723.65 1207.64,1747.1 1252.77,1762.3C1297.9,1777.5 1344.24,1784.45 1387.99,1784.41L1387.99,786.606L1831.07,414.821L1387.99,414.821Z';
const SCHWEIF_TRANSFORM = 'matrix(4.16667,0,0,-4.16667,0,9163.45)';
const CONNECTOR_OFFSET_LEFT = -50;
const CONNECTOR_OFFSET_TOP  = 0.0;

function updateConnectorPosition(svg, itemRect, topOffset = 0) {
  svg.style.left   = `${itemRect.left + CONNECTOR_OFFSET_LEFT}px`;
  svg.style.top    = `${itemRect.top + topOffset + CONNECTOR_OFFSET_TOP}px`;
  svg.style.height = `${itemRect.height - 0.0}px`;
}

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
// CSS-VARIABLEN SOFORT SETZEN
// ═══════════════════════════════════════════════════════════════════════════

applyCssColours();
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyCssColours);

// ═══════════════════════════════════════════════════════════════════════════
// GLOBALER EXPORT (backward-compatible)
// ═══════════════════════════════════════════════════════════════════════════

const AppConfig = {
  // Konstanten
  colours:          COLOURS,
  icons:            ICONS,
  workshopTypes:    WORKSHOP_TYPES,
  countryCodes:     COUNTRY_CODES,
  settings:         SETTINGS,
  filterCategories: FILTER_CATEGORIES,
  ignoredStyles:    IGNORED_STYLES,
  filterOrder:      FILTER_ORDER,

  // Helper-Funktionen
  getStyleIcon,
  getWorkshopIcon,
  getWorkshopsTooltip,
  getSortedWorkshops,
  getStatusIcon,
  getCountryCode,
  zfill,
  isDarkMode,
  getDefaultIconColor,
  getHoverColor,
  getDynamicSpaceColor,
  calculateDistance,
  escapeHtml,

  // Leaflet Icon Factory
  createLeafletIcon,

  // SVG Connector
  schweifPath:         SCHWEIF_PATH,
  createConnectorSVG,
  updateConnectorPosition,
  cleanupConnectorSVG,
  connectorOffsetLeft: CONNECTOR_OFFSET_LEFT,
};

export default AppConfig;
