// types.js — Zentrale JSDoc-Typdefinitionen für makerspac.es
// Kein ausführbarer Code — nur @typedef für IDE und @ts-check.
// Import-Syntax: /** @typedef {import('./types.js').MakerSpace} MakerSpace */

// Leerer Export macht diese Datei zu einem ES-Modul,
// damit TypeScript die Typen per import() finden kann.
export {};

// ─── Rohdaten aus locations.json ─────────────────────────────────────────────

/**
 * Adress- und Geo-Daten eines Makerspace.
 * @typedef {Object} MakerSpaceAddress
 * @property {number}           lat
 * @property {number}           long
 * @property {number|string}    [plz]
 * @property {string}           city
 * @property {string}           country   - Vollständiger Ländername (z.B. 'Germany')
 * @property {{ name: string, number: string|number, ext: string }} [street]
 */

/**
 * Ein Makerspace-Eintrag wie er aus locations.json geladen wird,
 * ggf. angereichert mit Live-Status aus status.json.
 * @typedef {Object} MakerSpace
 * @property {number}           ID
 * @property {string}           name
 * @property {MakerSpaceAddress} loc
 * @property {SpaceStyle}       style
 * @property {{ url: string, text: string }} link
 * @property {{ endpoint: string }} [spaceapi]
 * @property {{ 'space.init': number, 'datacheck.latest': number }} [dates]
 * @property {{ weekday: number, time: number }} [weekly]
 * @property {string}           [events]        - URL zum Veranstaltungskalender
 * @property {WorkshopType[]}   [workshops]
 * @property {boolean|null}     [isOpen]        - Zur Laufzeit aus status.json gesetzt
 * @property {string}           [statusMessage] - Zur Laufzeit aus status.json gesetzt
 */

// ─── Laufzeit-Status (status.json) ───────────────────────────────────────────

/**
 * Ein Eintrag im `spaces`-Objekt von status.json.
 * @typedef {Object} SpaceApiStatusEntry
 * @property {boolean|null} status
 * @property {string}       name
 * @property {string}       [message]
 */

/**
 * Zusammenfassung aus status.json (`stats`-Eintrag).
 * @typedef {Object} SpaceApiStats
 * @property {number} total
 * @property {number} open
 * @property {number} closed
 * @property {number} unknown
 * @property {string} lastUpdate
 * @property {string} duration
 */

// ─── Marker-State (markerStateManager) ───────────────────────────────────────

/**
 * Zustand eines einzelnen Kartenmarkers.
 * @typedef {Object} MarkerState
 * @property {boolean}          isHovering
 * @property {boolean}          isDropdownHovering
 * @property {boolean}          isScaling
 * @property {number}           currentScale
 * @property {number|null}      hoverTimeout
 * @property {number|null}      stickyTimeout
 * @property {number|null}      closeTimeout
 * @property {number|null}      debounceTimeout
 */

// ─── Union-Typen ──────────────────────────────────────────────────────────────

/**
 * Alle gültigen `style`-Werte in locations.json.
 * @typedef {'for all'|'commercial'|'for students'|'for youth'|'for students & youth'|'for students // commercial'} SpaceStyle
 */

/**
 * Alle gültigen Workshop-Typ-IDs (aus workshop-types.js).
 * @typedef {'3d'|'laser'|'electronics'|'wood'|'metal'|'textile'|'screenprint'|'music'|'coding'|'vr'|'cnc'|'ceramics'|'photo'|'bike'} WorkshopType
 */

/**
 * AppContext-Phasen in ihrer Reihenfolge.
 * @typedef {'idle'|'services'|'map'|'data'|'app'} AppPhase
 */

// ─── UI-Typen ─────────────────────────────────────────────────────────────────

/**
 * Eine Suchpille im Dropdown (Ort, Stil, Land).
 * @typedef {Object} Pill
 * @property {string}                   text        - Anzeigetext (z.B. 'Berlin')
 * @property {'city'|'style'|'country'} type
 * @property {number}                   count       - Anzahl passender Locations
 * @property {string}                   [filterKey]
 */
