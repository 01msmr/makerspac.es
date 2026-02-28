// app-context.js — Zentraler App-Kontext
// Ersetzt schrittweise die window.* Zuweisungen.
// Phasen: idle → services → map → data → app
//
// Verwendung:
//   import { appContext } from './app-context.js';
//   appContext.map  // Leaflet Map
//   appContext.waitFor('app').then(() => { ... })

/**
 * @typedef {Object} Location
 * @property {string}   name
 * @property {number}   ID
 * @property {LocationLoc} loc
 * @property {string}   style - 'for all' | 'for youth' | 'for students' | 'commercial'
 * @property {{ url: string, text: string }} [link]
 * @property {{ endpoint: string }} [spaceapi]
 * @property {boolean|null} [isOpen]  - Wird zur Laufzeit aus status.json gesetzt
 * @property {{ space.init: number, datacheck.latest: number }} [dates]
 * @property {{ weekday: number, time: number }} [weekly]
 * @property {string[]} [workshops]
 */

/**
 * @typedef {Object} LocationLoc
 * @property {number} lat
 * @property {number} long
 * @property {number|string} [plz]
 * @property {string} city
 * @property {string} country
 * @property {{ name: string, number: string|number, ext: string }} [street]
 */

/**
 * @typedef {Object} Pill
 * @property {string} text       - Anzeigetext (z.B. 'Berlin')
 * @property {'city'|'style'|'country'} type
 * @property {number} count      - Anzahl passender Locations
 * @property {string} [filterKey]
 */

class AppContext extends EventTarget {

  // ─── Phase 1: Services (synchron beim Start) ──────────────────────────────
  i18n          = null;
  config        = null;
  bookmarks     = null;
  consent       = null;
  dataStore     = null;
  zoomManager   = null;
  bookmarkSync  = null;

  // ─── Phase 2: Karte + Daten (nach Leaflet-Init + fetch) ──────────────────
  locations     = [];       // Alle Makerspace-Einträge (locations.json)
  locationById  = new Map();
  markerById    = new Map();
  map           = null;     // Leaflet Map-Instanz
  clusterGroup  = null;
  spaceAPI      = null;
  mapIcons      = null;     // MapIcons-Namespace (Icons, Farben, Hilfsfunktionen)
  markerStateManager = null;
  mapUtils      = null;

  // ─── Phase 3: UI-Komponenten (nach initApp()) ─────────────────────────────
  searchHeader  = null;
  searchFilter  = null;
  listingCore   = null;
  nearbyHeader  = null;
  mobileFilterUI = null;
  routingManager = null;

  // ─── Lifecycle ────────────────────────────────────────────────────────────
  #phase = 'idle';
  #phaseOrder = ['idle', 'services', 'map', 'data', 'app'];

  get phase() { return this.#phase; }

  /** Setzt die aktuelle Phase und feuert ein 'phase'-Event. */
  ready(phase) {
    this.#phase = phase;
    this.dispatchEvent(new CustomEvent('phase', { detail: { phase } }));
  }

  /**
   * Gibt ein Promise zurück, das auflöst sobald die Zielphase erreicht ist.
   * Löst sofort auf wenn die Phase bereits überschritten wurde.
   *
   * @param {'services'|'map'|'data'|'app'} phase
   * @returns {Promise<void>}
   */
  waitFor(phase) {
    const current = this.#phaseOrder.indexOf(this.#phase);
    const target  = this.#phaseOrder.indexOf(phase);
    if (current >= target) return Promise.resolve();

    return new Promise(resolve => {
      const handler = (e) => {
        if (this.#phaseOrder.indexOf(e.detail.phase) >= target) {
          this.removeEventListener('phase', handler);
          resolve();
        }
      };
      this.addEventListener('phase', handler);
    });
  }
}

export const appContext = new AppContext();
