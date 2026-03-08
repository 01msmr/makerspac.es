// @ts-check
// app-context.js — Zentraler App-Kontext
// Ersetzt schrittweise die window.* Zuweisungen.
// Phasen: idle → services → map → data → app
//
// Verwendung:
//   import { appContext } from './app-context.js';
//   appContext.map  // Leaflet Map
//   appContext.waitFor('app').then(() => { ... })

/** @typedef {import('./types.js').MakerSpace} MakerSpace */
/** @typedef {import('./types.js').MakerSpaceAddress} MakerSpaceAddress */
/** @typedef {import('./types.js').MarkerState} MarkerState */
/** @typedef {import('./types.js').AppPhase} AppPhase */
/** @typedef {import('./types.js').Pill} Pill */
/** @typedef {import('leaflet').Map} LeafletMap */
/** @typedef {import('leaflet').Marker} LeafletMarker */
/** @typedef {import('leaflet').LayerGroup} LeafletLayerGroup */

/**
 * Rückwärts-kompatibler Alias — neu: MakerSpace aus types.js verwenden.
 * @typedef {MakerSpace} Location
 */

/**
 * Rückwärts-kompatibler Alias — neu: MakerSpaceAddress aus types.js verwenden.
 * @typedef {MakerSpaceAddress} LocationLoc
 */

class AppContext extends EventTarget {

  // ─── Phase 1: Services (synchron beim Start) ──────────────────────────────
  /** @type {any} */ i18n          = null;
  /** @type {any} */ config        = null;
  /** @type {any} */ bookmarks     = null;
  /** @type {any} */ consent       = null;
  /** @type {any} */ dataStore     = null;
  /** @type {any} */ zoomManager   = null;
  /** @type {any} */ bookmarkSync  = null;

  // ─── Phase 2: Karte + Daten (nach Leaflet-Init + fetch) ──────────────────
  /** @type {MakerSpace[]} */
  locations     = [];
  /** @type {Map<number, MakerSpace>} */
  locationById  = new Map();
  /** @type {Map<number, LeafletMarker>} */
  markerById    = new Map();
  /** @type {LeafletMap|null} */ map           = null;
  /** @type {LeafletLayerGroup|null} */ clusterGroup  = null;
  /** @type {any} */ spaceAPI      = null;
  /** @type {any} */ mapIcons      = null;
  /** @type {any} */ markerStateManager = null;
  /** @type {any} */ mapUtils      = null;

  // ─── Phase 3: UI-Komponenten (nach initApp()) ─────────────────────────────
  /** @type {any} */ searchHeader  = null;
  /** @type {any} */ searchFilter  = null;
  /** @type {any} */ listingCore   = null;
  /** @type {any} */ nearbyHeader  = null;
  /** @type {any} */ mobileFilterUI = null;
  /** @type {any} */ routingManager = null;

  // ─── Lifecycle ────────────────────────────────────────────────────────────
  /** @type {AppPhase} */
  #phase = 'idle';
  #phaseOrder = /** @type {AppPhase[]} */ (['idle', 'services', 'map', 'data', 'app']);

  /** @returns {AppPhase} */
  get phase() { return this.#phase; }

  /**
   * Setzt die aktuelle Phase und feuert ein 'phase'-Event.
   * @param {AppPhase} phase
   */
  ready(phase) {
    this.#phase = phase;
    this.dispatchEvent(new CustomEvent('phase', { detail: { phase } }));
  }

  /**
   * Gibt ein Promise zurück, das auflöst sobald die Zielphase erreicht ist.
   * Löst sofort auf wenn die Phase bereits überschritten wurde.
   *
   * @param {Exclude<AppPhase, 'idle'>} phase
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
