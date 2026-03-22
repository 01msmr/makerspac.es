// @ts-check
// demo-mode.js — Attract / kiosk demo for trade shows
//
// Triggers:
//   • type '/demo' in the search bar
//   • 3 min of inactivity
//
// Deactivates immediately on any key / mouse / touch input.
// On stop: clears search bar + applies Germany filter.

/** @typedef {import('./types.js').MakerSpace} MakerSpace */

const INACTIVITY_MS    = 3 * 60 * 1000;   // 3 min until auto-start
const CITY_PAUSE_MS    = 2000;             // pause after results appear
const POPUP_DWELL_MS   = 7000;             // dwell on last selected space
const CLEAR_PAUSE_MS   = 1500;             // gap before next city
const OVERVIEW_MS      = 3000;             // Germany overview hold
const CHAR_DELAY_MS    = () => 85 + Math.random() * 55;  // 85–140 ms / char
const NAV_STEP_MS      = () => 2000 + Math.random() * 1000;  // 2–3 s between ArrowDown steps
const NAV_STEP_PINNED  = 5000;             // ms between steps for pinned (featured) cities

/** Always show the city of these space IDs */
const PINNED_IDS = [1, 73];  // Toolbox Bodensee, Gütersloh

/**
 * PLZ prefix to use instead of city name for specific pinned spaces.
 * Key = space ID, value = PLZ prefix string to type.
 */
const PLZ_BY_ID = new Map([
  [1,  '88'],  // Toolbox Bodensee (Radolfzell / 88xxx)
  [73, '33'],  // Gütersloh (33xxx)
]);

export class DemoMode {
  /** @param {import('./app-context.js').AppContext} appContext */
  constructor(appContext) {
    this._ac           = appContext;
    this._running      = false;
    this._timers       = /** @type {number[]} */ ([]);
    this._loopT        = 0;
    this._inactT       = 0;
    this._inDemoInput  = false;   // true while dispatching demo key events
    /** @type {EventListener|null} */
    this._stopFn       = null;

    this._initInactivity();
    this._initCommandTrigger();
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Inactivity timer
  // ═══════════════════════════════════════════════════════════════════════════

  _initInactivity() {
    const reset = () => {
      if (this._running) return;
      clearTimeout(this._inactT);
      this._inactT = setTimeout(() => this.start(), INACTIVITY_MS);
    };
    ['pointermove', 'keydown', 'mousedown', 'touchstart', 'wheel']
      .forEach(e => document.addEventListener(e, reset, { passive: true }));
    reset();
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // /demo command
  // ═══════════════════════════════════════════════════════════════════════════

  _initCommandTrigger() {
    const bar = /** @type {HTMLInputElement|null} */ (document.getElementById('search-bar'));
    if (!bar) return;
    bar.addEventListener('input', () => {
      if (bar.value.trim() === '/demo') {
        bar.value = '';
        bar.dispatchEvent(new Event('input', { bubbles: true }));
        this.start();
      }
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Start / Stop
  // ═══════════════════════════════════════════════════════════════════════════

  start() {
    if (this._running) return;
    this._running = true;
    this._showIndicator();
    this._showStartToast();
    this._attachStop();
    this._runSequence();
  }

  _showStartToast() {
    const stack = document.createElement('div');
    stack.className = 'loading-overlay-stack';

    const toast = document.createElement('div');
    toast.className = 'loading-overlay-toast loading-overlay-toast--large';
    toast.innerHTML = '<i class="fas fa-circle-nodes"></i> Demo mode activated';

    stack.appendChild(toast);
    document.body.appendChild(stack);

    requestAnimationFrame(() => toast.classList.add('show'));

    setTimeout(() => {
      toast.classList.remove('show');
      toast.classList.add('zoom-out');
      setTimeout(() => stack.remove(), 300);
    }, 2200);
  }

  stop() {
    if (!this._running) return;
    this._running = false;
    this._timers.forEach(clearTimeout);
    this._timers = [];
    clearTimeout(this._loopT);
    this._detachStop();
    this._hideIndicator();
    this._resetToGermany();
  }

  _showIndicator() {
    let el = document.getElementById('demo-indicator');
    if (!el) {
      el = document.createElement('div');
      el.id = 'demo-indicator';
      el.className = 'settings-gear-button-solo demo-indicator';
      el.setAttribute('aria-label', 'Demo');
      el.innerHTML = '<i class="fas fa-circle-nodes"></i><span class="demo-play-triangle"></span>';
      const container = document.querySelector('.title-bar');
      container?.appendChild(el);
    }
    el.style.display = 'flex';
  }

  _hideIndicator() {
    const el = document.getElementById('demo-indicator');
    if (el) el.style.display = 'none';
  }

  /**
   * Dispatch a demo key event on the search bar.
   * _inDemoInput prevents the stop listener from treating it as user input.
   * @param {string} code  KeyboardEvent.code value (e.g. 'ArrowDown', 'Tab', 'Enter')
   */
  _dispatchDemoKey(code) {
    const bar = document.getElementById('search-bar');
    if (!bar) return;
    this._inDemoInput = true;
    bar.dispatchEvent(new KeyboardEvent('keydown', { code, key: code, bubbles: true }));
    this._inDemoInput = false;
  }

  _resetToGermany() {
    const bar = /** @type {HTMLInputElement|null} */ (document.getElementById('search-bar'));
    if (bar) {
      bar.value = '';
      bar.dispatchEvent(new Event('input', { bubbles: true }));
    }
    // Clear any active city/zip pills
    window.app?.searchHeader?.pillsManager?.clear();
    window.routingManager?.applyCountryFilter('Germany');
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Stop on any user interaction
  // ═══════════════════════════════════════════════════════════════════════════

  _attachStop() {
    this._stopFn = (/** @type {Event} */ e) => {
      if (this._inDemoInput) return;   // demo's own key events — ignore
      this.stop();
    };
    ['keydown', 'mousedown', 'touchstart', 'wheel']
      .forEach(e => document.addEventListener(
        e, /** @type {EventListener} */ (this._stopFn), { capture: true }
      ));
  }

  _detachStop() {
    if (!this._stopFn) return;
    ['keydown', 'mousedown', 'touchstart', 'wheel']
      .forEach(e => document.removeEventListener(
        e, /** @type {EventListener} */ (this._stopFn), { capture: true }
      ));
    this._stopFn = null;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // City selection
  // ═══════════════════════════════════════════════════════════════════════════

  _pickCities() {
    const locs = this._ac.locations || [];
    const de   = locs.filter(l => l.loc?.country === 'Germany');

    // Count spaces per city
    /** @type {Map<string, number>} */
    const counts = new Map();
    de.forEach(l => {
      if (l.loc?.city) counts.set(l.loc.city, (counts.get(l.loc.city) || 0) + 1);
    });

    // Pinned cities (always included)
    const pinned = PINNED_IDS
      .map(id => locs.find(l => l.ID === id)?.loc?.city ?? '')
      .filter(Boolean);

    const shuffle = (/** @type {string[]} */ arr) => {
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
      }
      return arr;
    };

    // Split eligible cities into rich (3+ spaces) and sparse (exactly 2)
    const rich   = shuffle([...counts.entries()].filter(([c, n]) => n >= 3 && !pinned.includes(c)).map(([c]) => c));
    const sparse = shuffle([...counts.entries()].filter(([c, n]) => n === 2 && !pinned.includes(c)).map(([c]) => c));

    // At most half of the 5 random slots from sparse cities; fill rest from rich
    const RANDOM_SLOTS  = 5;
    const maxSparse     = Math.floor(RANDOM_SLOTS / 2);          // 2
    const sparseCount   = Math.min(maxSparse, sparse.length);
    const richCount     = Math.min(RANDOM_SLOTS - sparseCount, rich.length);
    const pool          = [...rich.slice(0, richCount), ...sparse.slice(0, sparseCount)];

    // Combine pinned + random, deduplicate, then shuffle the whole list
    const combined = [...new Set([...pinned, ...pool])];
    for (let i = combined.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [combined[i], combined[j]] = [combined[j], combined[i]];
    }
    return combined;
  }

  /**
   * Returns the PLZ prefix for a city if it's a pinned space with PLZ_BY_ID, else null.
   * @param {string} city
   * @returns {string|null}
   */
  _plzForCity(city) {
    for (const [id, plz] of PLZ_BY_ID) {
      const loc = (this._ac.locations || []).find(l => l.ID === id);
      if (loc?.loc?.city === city) return plz;
    }
    return null;
  }

  /**
   * Minimum prefix length so the city is the only autocomplete suggestion.
   * Starts at 2 (matching autocomplete minChars).
   * @param {string} city
   * @returns {number}
   */
  _minPrefix(city) {
    const allCities = [...new Set(
      (this._ac.locations || []).map(l => l.loc?.city).filter(Boolean)
    )];
    for (let n = 2; n <= city.length; n++) {
      const prefix = city.slice(0, n).toLowerCase();
      if (allCities.filter(c => c.toLowerCase().startsWith(prefix)).length <= 1) return n;
    }
    return city.length;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Scheduling helpers
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Schedule fn at absolute offset ms from now.
   * @param {number} ms
   * @param {() => void} fn
   */
  _at(ms, fn) {
    this._timers.push(setTimeout(() => { if (this._running) fn(); }, ms));
  }

  /**
   * Schedule character-by-character typing starting at ms.
   * @param {string} text
   * @param {number} ms  start offset
   * @returns {number}   offset after last character
   */
  _type(text, ms) {
    let t = ms;
    const bar = () => /** @type {HTMLInputElement|null} */ (document.getElementById('search-bar'));
    for (const char of text) {
      const delay = Math.round(CHAR_DELAY_MS());
      this._at(t, () => {
        const b = bar();
        if (!b) return;
        b.value += char;
        b.dispatchEvent(new Event('input', { bubbles: true }));
      });
      t += delay;
    }
    return t;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Sequence — chained so navigation count adapts to actual result count
  // ═══════════════════════════════════════════════════════════════════════════

  _runSequence() {
    if (!this._running) return;
    const cities = this._pickCities();

    // Germany overview, then kick off city chain
    this._at(0, () => {
      this._resetToGermany();
      const bar = /** @type {HTMLInputElement|null} */ (document.getElementById('search-bar'));
      bar?.focus();
    });
    this._timers.push(setTimeout(() => this._runCity(cities, 0), OVERVIEW_MS));
  }

  /**
   * One city step:
   *  - PLZ mode (pinned IDs): type 1-2 PLZ digits → navigate results directly
   *  - City mode (others): type minimum prefix → Tab (1 suggestion) or Tab+Enter (>1)
   *                         → wait for filter → navigate results → clear
   * @param {string[]} cities
   * @param {number}   index
   */
  _runCity(cities, index) {
    if (!this._running) return;

    if (index >= cities.length) {
      // All cities done — Germany overview, then restart loop
      this._resetToGermany();
      this._loopT = setTimeout(() => { if (this._running) this._runSequence(); }, OVERVIEW_MS);
      return;
    }

    const city = cities[index];
    const plz  = this._plzForCity(city);
    let t = 0;

    const stepMs = plz !== null ? NAV_STEP_PINNED : NAV_STEP_MS;

    if (plz) {
      // ── PLZ mode: type digits, results appear immediately, navigate directly ──
      t = this._type(plz, t);
      t += CITY_PAUSE_MS;
      this._timers.push(setTimeout(() =>
        this._waitForZoom(() => this._navigateSpaces(cities, index, stepMs)), t));

    } else {
      // ── City mode: type minimum prefix, activate city filter via Tab/Enter ──
      const prefix = city.slice(0, this._minPrefix(city));
      t = this._type(prefix, t);
      t += CITY_PAUSE_MS;

      this._timers.push(setTimeout(() => {
        if (!this._running) return;
        const numSuggestions = document.querySelectorAll('#autocomplete-container .autocomplete-pill').length;

        if (numSuggestions === 0) {
          // No city suggestion appeared — wait for zoom then navigate
          this._waitForZoom(() => this._navigateSpaces(cities, index, stepMs));
          return;
        }

        // Tab: selects if 1 suggestion, or focuses first of multiple
        this._dispatchDemoKey('Tab');

        if (numSuggestions > 1) {
          // Need Enter to confirm the focused suggestion
          this._timers.push(setTimeout(() => {
            if (!this._running) return;
            this._dispatchDemoKey('Enter');
            this._waitForZoom(() => this._navigateSpaces(cities, index, stepMs));
          }, 350));
        } else {
          // Single suggestion — Tab already selected it
          this._waitForZoom(() => this._navigateSpaces(cities, index, stepMs));
        }
      }, t));
    }
  }

  /**
   * Wait until the map zoom animation finishes, then call callback.
   * Polls zoomManager._isAutoZooming every 100ms.
   * - If zoom starts: waits for it to end (hard cap 4s)
   * - If zoom never starts within 1.5s: proceeds anyway (map already in position)
   * @param {() => void} callback
   */
  _waitForZoom(callback) {
    let zoomSeen = false;
    const start  = Date.now();

    const check = () => {
      if (!this._running) return;
      const zooming = !!window.zoomManager?._isAutoZooming;
      const elapsed = Date.now() - start;

      if (zooming) zoomSeen = true;

      if (zoomSeen && !zooming)  { this._timers.push(setTimeout(callback, 400)); return; }   // zoom finished
      if (!zoomSeen && elapsed > 1500) { callback(); return; }   // no zoom started — proceed
      if (elapsed > 4000)        { callback(); return; }   // hard cap

      this._timers.push(setTimeout(check, 100));
    };

    // Short initial delay to let filter pipeline trigger the zoom
    this._timers.push(setTimeout(check, 200));
  }

  /**
   * Cycle through all visible listing items with ArrowDown, dwell on the last,
   * then hand off to _clearCity.
   * @param {string[]} cities
   * @param {number}   index
   * @param {number | (() => number)} stepMs  ms (or fn returning ms) between each ArrowDown
   */
  _navigateSpaces(cities, index, stepMs = NAV_STEP_MS) {
    const getStep = typeof stepMs === 'function' ? stepMs : () => stepMs;
    if (!this._running) return;

    const hasIdMatch = !!document.querySelector('#suggestions-dropdown .id-match-header');
    const allItems   = document.querySelectorAll('#suggestions-dropdown .listing-item');
    const count      = allItems.length - (hasIdMatch ? 1 : 0);  // exclude ID match item

    if (count === 0) {
      this._clearCity(cities, index);
      return;
    }

    // Skip past the ID match item immediately (no dwell)
    if (hasIdMatch) this._dispatchDemoKey('ArrowDown');

    let step = 0;
    const tick = () => {
      if (!this._running) return;
      this._dispatchDemoKey('ArrowDown');
      step++;
      if (step < count) {
        this._timers.push(setTimeout(tick, getStep()));
      } else {
        // Dwell on last selected item, then clear
        this._timers.push(setTimeout(() => {
          if (this._running) this._clearCity(cities, index);
        }, POPUP_DWELL_MS));
      }
    };
    tick();
  }

  /**
   * Reset to Germany (clears bar + city pills) and advance to the next city.
   * @param {string[]} cities
   * @param {number}   index
   */
  _clearCity(cities, index) {
    this._resetToGermany();
    const bar = /** @type {HTMLInputElement|null} */ (document.getElementById('search-bar'));
    this._timers.push(setTimeout(() => {
      if (!this._running) return;
      bar?.focus();
      this._runCity(cities, index + 1);
    }, CLEAR_PAUSE_MS));
  }
}
