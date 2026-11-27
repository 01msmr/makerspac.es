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
  statusIconKey,
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
  IGNORED_STYLES_SET,
  FILTER_ORDER,
  FILTER_ORDER_SET,
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
  maxListItems:           20, // used only by nearby-header.js (Nearby-Popover cap); dropdown renders all filtered locations without cap
  itemHeight:             70,
  debounceMs:             150,
  zoomDebounceMs:         800,
  popupDelayMs:           0,      // Popup öffnet sofort (Listen-Hover und Pin-Hover gleich)
  popupGraceMs:          300,    // Karenz nach Verlassen von Listeneintrag/Pin, damit die Maus das Popup erreicht (→ sticky)
  pinOpacity:            0.66,   // leichte Transparenz der Pins; im SVG (nicht am Marker-Element), damit der Halo nicht mit abgedunkelt/abgeschnitten wird
  haloMinZoom:           14,     // Pin-Halo erst ab diesem Zoom (dichte Stadtkarte; nur einzelne Pins, Cluster haben keinen Halo), 0,8 s Einblenden (CSS)
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
  return String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ═══════════════════════════════════════════════════════════════════════════
// LEAFLET MARKER ICON
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Erstellt ein Leaflet DivIcon (SVG-Pin) in der gewünschten Farbe und Größe.
 * Benötigt Leaflet (L) zur Laufzeit.
 * @param {string} color - Fill-Farbe (CSS-Farbwert)
 * @param {number} [scale=1.0] - Skalierungsfaktor
 * @param {number} [pinOpacity=1] - Deckkraft des Pins (ohne Halo); App-Pins: AppConfig.settings.pinOpacity
 * @returns {L.DivIcon}
 */
const HALO_SIZE = 220;   // Durchmesser des Pin-Halos in px — FEST, unabhängig von der Pin-Größe (auch am Hover-/Ziel-Pin)

// ─── Geometrie des Popup-Pfeils: im Stamm festgelegt, aus dem Aufbau hergeleitet (nicht gemessen) ───────────────────────
// Prinzip: Die Pfeilspitze liegt von Haus aus EXAKT auf dem Anker des Popups (Leaflets eigenes `offset`, hier hergeleitet).
// Der Anker (popupAnchor) ist dann nur noch Pin-Geometrie: Pin-Oberkante (Popup über dem Pin) bzw. Pin-Spitze (gespiegelt).
// Quellen: Leaflet 1.9.4 (Popup._updatePosition: container.style.bottom = −offset.y; translate auf Marker + popupAnchor),
//          leaflet.css (Popup-/Pfeil-Maße), main-components.css (.popup-flipped). Alle Maße in px.
export const POPUP_GEOMETRY = Object.freeze({
  MARGIN_BOTTOM: 20,               // .leaflet-popup { margin-bottom: 20px }
  TIP_CONTAINER_H: 20,             // .leaflet-popup-tip-container { height: 20px }
  TIP_CONTAINER_MARGIN_TOP: -1,    // … { margin-top: -1px } (position: absolute, hängt direkt unter dem Inhalt)
  TIP_MARGIN_TOP: -10,             // .leaflet-popup-tip { margin: -10px auto 0 }
  TIP_BOX: 19,                     // … { width/height: 17px; padding: 1px } → 19 × 19, um 45° gedreht
  FLIPPED_WRAPPER_MARGIN_TOP: 20,  // .popup-flipped .leaflet-popup-content-wrapper { margin-top: 20px } (Platz für den Pfeil oben)
});
const G = POPUP_GEOMETRY;
// Spitze des gedrehten Quadrats unter der Oberkante des Pfeil-Containers: Quadrat-Oberkante + halbe Kante (= Mitte) + halbe Diagonale
const TIP_VERTEX_BELOW_TOP = G.TIP_MARGIN_TOP + G.TIP_BOX / 2 + (G.TIP_BOX / 2) * Math.SQRT2;   // 12,935
/** Pin im 25 × 41-Raster (createLeafletIcon): Pfad y = 1 … 39 (Spitze bei 39), Außenkontur 1,5 (3-px-Weiß-Unterlage). */
export const PIN_GEOMETRY = Object.freeze({ VIEW_H: 41, TOP_Y: 1, TIP_Y: 39, OUTLINE: 1.5, TIP_X: 12.5 });
/** Hover-/Popup-Vergrößerung des Pins (CSS `.pin-big .pin-body`, um die Pin-Spitze); Pin und Popup-Anker müssen dazu passen */
export const PIN_BIG_SCALE = 1.5;
const P = PIN_GEOMETRY;
/** Sichtbare Oberkante des GROSSEN Pins, in Raster-Einheiten ab SVG-Oberkante (Skalierung um die Spitze: Spitze bleibt, Kopf wächst nach oben) */
const bigTopEdge = P.TIP_Y - (P.TIP_Y - P.TOP_Y) * PIN_BIG_SCALE - P.OUTLINE * PIN_BIG_SCALE;      // −20,25
/** Sichtbare Spitze des GROSSEN Pins (Kontur mitskaliert), ab SVG-Oberkante */
const bigTipEdge = P.TIP_Y + P.OUTLINE * PIN_BIG_SCALE;                                              // 41,25

/**
 * Leaflet-`offset` des Popups (an JEDEM bindPopup mit diesen Pins mitgeben): Die Spitze des Pfeils (Popup über dem Pin) liegt bei
 * Anker + offset.y − MARGIN_BOTTOM + TIP_CONTAINER_MARGIN_TOP + TIP_VERTEX_BELOW_TOP; = 0 gesetzt, fällt sie auf den Anker.
 * Auf ganze Pixel gerundet (halbe Pixel würden die Popup-Schrift verwischen): Rest 0,065 px.
 */
export const POPUP_OFFSET = Object.freeze([0, Math.round(G.MARGIN_BOTTOM - G.TIP_CONTAINER_MARGIN_TOP - TIP_VERTEX_BELOW_TOP)]);   // [0, 8]

/**
 * popupAnchor.y: der Anker liegt an der sichtbaren Oberkante des GROSSEN Pins (bei offenem Popup ist der Pin immer groß, auch
 * während der Animation) → die Pfeilspitze (Popup über dem Pin) berührt den vergrößerten Pin, ohne hineinzuragen.
 * @param {number} scale Icon-Skalierung (Standard 1, Embed-Ziel 1,2)
 */
export function popupAnchorY(scale = 1) {
  return Math.round(-(P.VIEW_H - bigTopEdge) * scale);                  // −61 bei scale 1
}

/**
 * Abstand Popup-Oberkante ↔ Marker-Punkt beim gespiegelten Popup (UNTER dem Pin), bei dem die Pfeilspitze genau die Spitze des
 * großen Pins berührt. Container oben (top: 0, 180° gedreht): Spitze liegt TIP_CONTAINER_MARGIN_TOP + (TIP_CONTAINER_H − 12,935) unter
 * der Popup-Oberkante; der zusätzliche margin-top des Inhalts schiebt die Oberkante um FLIPPED_WRAPPER_MARGIN_TOP nach oben.
 * Der große Pin ragt (um die Spitze skaliert) 0,25 × scale unter den Marker-Punkt. Unabhängig vom Popup-`offset`.
 * @param {number} scale Icon-Skalierung
 */
export function popupFlipGap(scale = 1) {
  const tipBelowPopupTop = G.TIP_CONTAINER_MARGIN_TOP + (G.TIP_CONTAINER_H - TIP_VERTEX_BELOW_TOP);   // 6,065
  return G.FLIPPED_WRAPPER_MARGIN_TOP - tipBelowPopupTop + (bigTipEdge - P.VIEW_H) * scale;              // 14,185 bei scale 1
}

/**
 * Deckkraft des Halos über den Radius t = 0 … 1 (Mitte → Rand): Smoothstep 1 − (3t² − 2t³) — Steigung 0 an BEIDEN Enden, also kein
 * Knick im Verlauf (weder in der Mitte noch am Rand), Wendepunkt bei t = 0,5. SVG-Verläufe sind stückweise linear → aus HALO_STEPS
 * Stützstellen zusammengesetzt (gleiche Farbe, nur stop-opacity; Farbe: .pin-halo-s in main-layout.css).
 */
export const HALO_PEAK = 0.7;      // Deckkraft in der Mitte (Pin-Mittelpunkt)
const HALO_STEPS = 4;   // 5 Stützstellen
export const haloOpacity = t => HALO_PEAK * (1 - t * t * (3 - 2 * t));
const HALO_STOPS = Array.from({ length: HALO_STEPS + 1 }, (_, i) => {
  const t = i / HALO_STEPS;
  return `<stop class="pin-halo-s" offset="${+t.toFixed(4)}" stop-opacity="${+haloOpacity(t).toFixed(4)}"/>`;
}).join('');

let haloSeq = 0;   // eindeutige Gradient-IDs je Pin (mehrere Pins im selben Dokument)

export function createLeafletIcon(color, scale = 1.0, pinOpacity = 1) {
  const w = Math.round(25 * scale);
  const h = Math.round(41 * scale);
  const PIN = 'M12.5,1 C6.16,1 1,6.16 1,12.5 C1,20.88 12.5,39 12.5,39 C12.5,39 24,20.88 24,12.5 C24,6.16 18.84,1 12.5,1 Z';
  // Halo: fester Kreis (HALO_SIZE px, unabhängig von der Pin-Größe) um den Pin-Körper, Mitte 70 % Deckung → außen 0 % (nichtlinear, ohne Knick:
  // Smoothstep, siehe haloOpacity; gleiche Farbe). Als Kreis mit Radialverlauf IM Pin-SVG (liegt vor dem Pin im Quelltext = dahinter): kein z-index:-1, keine CSS-Farb-
  // Funktion im Verlauf, kein visibility-Übergang — das war auf iOS-Safari nicht zu sehen. Farbe/Deckkraft: .pin-halo-in/-out in main-layout.css;
  // sichtbar erst ab Zoom AppConfig.settings.haloMinZoom (Klasse .halo-on am Karten-Container, marker-manager), 0,8 s Einblenden.
  const haloR = +(HALO_SIZE / 2 / scale).toFixed(3);   // Radius in Pin-Einheiten (viewBox 25 × 41): × scale ergibt HALO_SIZE / 2 px
  const gid = `pin-halo-g${haloSeq++}`;
  const halo = `<defs><radialGradient id="${gid}" gradientUnits="userSpaceOnUse" cx="12.5" cy="12.5" r="${haloR}">${HALO_STOPS}</radialGradient></defs>` +
    `<circle class="pin-halo" cx="12.5" cy="12.5" r="${haloR}" fill="url(#${gid})" pointer-events="none"/>`;
  // Pin: 1 px weißer Rand (direkt im Symbol, außerhalb des schwarzen 1-px-Rands) → löst den Pin von dunklen/bunten Kartenflächen
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 25 41" width="${w}" height="${h}" style="overflow:visible;display:block">` +
    halo +
    // Pin-Deckkraft als Gruppe im SVG: Weiß-Unterlage, Füllung, Rand und Punkt blenden gemeinsam durch (wie die frühere Marker-Opacity),
    // der Halo davor bleibt davon unberührt (volle 70 % in der Mitte)
    // Gruppe `pin-body`: wird bei Hover/offenem Popup um die Spitze vergrößert (CSS .pin-big, main-layout.css); der Halo davor bleibt fest
    `<g class="pin-body"${pinOpacity < 1 ? ` opacity="${pinOpacity}"` : ''}>` +
    `<path fill="#fff" stroke="#fff" stroke-width="3" stroke-linejoin="round" d="${PIN}"/>` +
    `<path class="pin-fill" fill="${color}" stroke="#000" stroke-width="1" d="${PIN}"/>` +
    `<circle fill="#fff" cx="12.5" cy="12.5" r="3"/>` +
    `</g></svg>`;
  return L.divIcon({
    html: svg,
    className: 'ms-marker-icon',
    iconSize: [w, h],
    iconAnchor: [w / 2, h],
    // Popup-Anker = Oberkante des GROSSEN Pins, waagerecht Pin-Mitte (mit POPUP_OFFSET fällt die Pfeilspitze darauf; s. POPUP_GEOMETRY)
    popupAnchor: [0, popupAnchorY(scale)],
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// SCHWEIF SVG (Connector zwischen Liste und Karte)
// ═══════════════════════════════════════════════════════════════════════════

// schweif3-erw.svg
const SCHWEIF_PATH = 'M1387.99,414.821C1344.24,414.778 1297.9,421.73 1252.77,436.929C1207.64,452.128 1163.71,475.574 1125.21,505.909C1086.72,536.244 1053.65,573.467 1028.31,613.793C1002.98,654.118 985.382,697.547 975.191,740.09C956.386,819.552 914.422,896.452 844.896,952.282C810.133,980.198 768.48,1002.85 721.184,1018.21C673.888,1033.58 620.949,1041.66 564.569,1041.62L564.569,1157.61C620.949,1157.57 673.888,1165.65 721.184,1181.02C768.48,1196.38 810.133,1219.03 844.896,1246.95C914.422,1302.78 956.386,1379.68 975.191,1459.14C985.382,1501.68 1002.98,1545.11 1028.31,1585.44C1053.65,1625.76 1086.72,1662.99 1125.21,1693.32C1163.71,1723.65 1207.64,1747.1 1252.77,1762.3C1297.9,1777.5 1344.24,1784.45 1387.99,1784.41L1387.99,786.606L1831.07,414.821L1387.99,414.821Z';
const SCHWEIF_TRANSFORM = 'matrix(4.16667,0,0,-4.16667,0,9163.45)';
const CONNECTOR_OFFSET_LEFT = -50;
const CONNECTOR_OFFSET_TOP  = -0.5;

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
  ignoredStylesSet: IGNORED_STYLES_SET,
  filterOrder:      FILTER_ORDER,
  filterOrderSet:   FILTER_ORDER_SET,

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
  statusIconKey,
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
