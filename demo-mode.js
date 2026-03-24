// @ts-check
// demo-mode.js — Attract / kiosk demos for trade shows
//
// DemoMode     — triggered by /demo or 3 min of inactivity
//                cycles through German cities, navigates spaces with cursor keys
//
// OpenDemoMode — triggered by /opendemo only
//                filters to currently-open spaces, navigates the list with cursor keys
//
// Both stop immediately on any key / mouse / touch input.
// On stop: clears search bar + applies Germany filter.

/** @typedef {import('./types.js').MakerSpace} MakerSpace */

// ─── Shared constants ─────────────────────────────────────────────────────────

const POPUP_DWELL_MS   = 7000;             // dwell on last selected space (city demo)
const OVERVIEW_MS      = 3000;             // Germany overview hold
const AUTOCOMPLETE_MS  = 150;              // pause after last typed char before Tab/Enter
const CHAR_DELAY_MS    = () => 85 + Math.random() * 55;  // 85–140 ms / char
const NAV_STEP_MS      = () => 2000 + Math.random() * 1000;  // 2–3 s between ArrowDown steps

// ─── DemoMode-only constants ──────────────────────────────────────────────────

const INACTIVITY_MS    = 3 * 60 * 1000;   // 3 min until auto-start
const CITY_PAUSE_MS    = 2000;             // pause after results appear
const NAV_STEP_PINNED  = 5000;             // ms between steps for pinned (featured) cities
const CLEAR_PAUSE_MS   = 1500;             // gap before next city

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

// ─── Mutual exclusion ─────────────────────────────────────────────────────────

/** Currently running demo instance — only one can run at a time. */
let _runningDemo = /** @type {_DemoBase|null} */ (null);

// ═══════════════════════════════════════════════════════════════════════════════
// Shared base class (not exported)
// ═══════════════════════════════════════════════════════════════════════════════

class _DemoBase {
  /** @param {import('./app-context.js').AppContext} appContext */
  constructor(appContext) {
    this._ac          = appContext;
    this._running     = false;
    this._timers      = /** @type {ReturnType<typeof setTimeout>[]} */ ([]);
    this._inDemoInput = false;   // true while dispatching demo key events
    /** @type {EventListener|null} */
    this._stopFn      = null;
  }

  // ── Lifecycle ────────────────────────────────────────────────────────────────

  start() {
    _runningDemo?.stop();
    _runningDemo  = this;
    this._running = true;
    this._showIndicator();
    this._showStartToast();
    this._attachStop();
    this._runSequence();
  }

  stop() {
    if (!this._running) return;
    this._running = false;
    if (_runningDemo === this) _runningDemo = null;
    this._timers.forEach(clearTimeout);
    this._timers = [];
    this._detachStop();
    this._hideIndicator();
    this._resetToGermany();
  }

  // ── Indicator (subclasses supply content/class) ───────────────────────────────

  /** @param {string} innerHtml @param {string} [extraClass] */
  _showIndicatorWith(innerHtml, extraClass = '') {
    let el = document.getElementById('demo-indicator');
    if (!el) {
      el = document.createElement('div');
      el.id = 'demo-indicator';
      document.querySelector('.title-bar')?.appendChild(el);
    }
    el.className = `settings-gear-button-solo demo-indicator${extraClass ? ' ' + extraClass : ''}`;
    el.setAttribute('aria-label', 'Demo');
    el.innerHTML = innerHtml;
    el.style.display = 'flex';
  }

  _hideIndicator() {
    const el = document.getElementById('demo-indicator');
    if (el) el.style.display = 'none';
  }

  // ── Toast ─────────────────────────────────────────────────────────────────────

  /** @param {string} html */
  _showToast(html) {
    const stack = document.createElement('div');
    stack.className = 'loading-overlay-stack';
    const toast = document.createElement('div');
    toast.className = 'loading-overlay-toast loading-overlay-toast--large';
    toast.innerHTML = html;
    stack.appendChild(toast);
    document.body.appendChild(stack);
    requestAnimationFrame(() => toast.classList.add('show'));
    setTimeout(() => {
      toast.classList.remove('show');
      toast.classList.add('zoom-out');
      setTimeout(() => stack.remove(), 300);
    }, 2200);
  }

  // ── Stop on any user interaction ──────────────────────────────────────────────

  _attachStop() {
    this._stopFn = (/** @type {Event} */ e) => {
      if (this._inDemoInput) return;
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

  // ── Scheduling helpers ────────────────────────────────────────────────────────

  /**
   * Schedule fn at offset ms from now.
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

  /**
   * Dispatch a demo key event on the search bar.
   * _inDemoInput prevents the stop listener from treating it as user input.
   * @param {string} code  KeyboardEvent.code (e.g. 'ArrowDown', 'Tab', 'Enter')
   */
  _dispatchDemoKey(code) {
    const bar = document.getElementById('search-bar');
    if (!bar) return;
    this._inDemoInput = true;
    bar.dispatchEvent(new KeyboardEvent('keydown', { code, key: code, bubbles: true }));
    this._inDemoInput = false;
  }

  // ── State cleanup ─────────────────────────────────────────────────────────────

  _clearConnectionLine() {
    const lc = window.app?.searchHeader?.listingCore;
    if (!lc) return;
    lc.removeConnectionLine();
    lc.cleanupHoverSVG();
    lc.currentHoverItem = null;
    lc.keyboardIndex    = -1;
  }

  _resetToGermany() {
    this._clearConnectionLine();
    const bar = /** @type {HTMLInputElement|null} */ (document.getElementById('search-bar'));
    if (bar) {
      bar.value = '';
      bar.dispatchEvent(new Event('input', { bubbles: true }));
    }
    window.app?.searchHeader?.pillsManager?.clear();
    window.routingManager?.applyCountryFilter('Germany');
  }

  // ── Zoom wait ─────────────────────────────────────────────────────────────────

  /**
   * Wait until the map zoom animation finishes, then call callback.
   * Polls zoomManager._isAutoZooming every 100ms.
   * - If zoom starts: waits for it to end (hard cap 4s)
   * - If zoom never starts within 1.5s: proceeds anyway
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

      if (zoomSeen && !zooming)        { this._timers.push(setTimeout(callback, 600)); return; }
      if (!zoomSeen && elapsed > 1500) { callback(); return; }
      if (elapsed > 4000)              { callback(); return; }

      this._timers.push(setTimeout(check, 100));
    };

    this._timers.push(setTimeout(check, 200));
  }

  // ── Subclass interface ────────────────────────────────────────────────────────

  _showIndicator() {}
  _showStartToast() {}
  _runSequence() {}
}

// ═══════════════════════════════════════════════════════════════════════════════
// DemoMode — city tour with cursor navigation
// ═══════════════════════════════════════════════════════════════════════════════

export class DemoMode extends _DemoBase {
  /** @param {import('./app-context.js').AppContext} appContext */
  constructor(appContext) {
    super(appContext);
    this._loopT  = 0;
    this._inactT = 0;
    this._initInactivity();
    this._initCommandTrigger();
  }

  stop() {
    super.stop();
    clearTimeout(this._loopT);
  }

  _showIndicator() {
    this._showIndicatorWith(
      '<i class="fas fa-circle-nodes"></i><span class="demo-play-triangle"></span>'
    );
  }

  _showStartToast() {
    this._showToast('<i class="fas fa-circle-nodes"></i> Demo mode activated');
  }

  // ── Inactivity timer ──────────────────────────────────────────────────────────

  _initInactivity() {
    const reset = () => {
      if (_runningDemo) return;   // any demo active — don't restart timer
      clearTimeout(this._inactT);
      this._inactT = setTimeout(() => this.start(), INACTIVITY_MS);
    };
    ['pointermove', 'keydown', 'mousedown', 'touchstart', 'wheel']
      .forEach(e => document.addEventListener(e, reset, { passive: true }));
    reset();
  }

  // ── /demo command ─────────────────────────────────────────────────────────────

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

  // ── City selection ────────────────────────────────────────────────────────────

  _pickCities() {
    const locs = this._ac.locations || [];
    const de   = locs.filter(l => l.loc?.country === 'Germany');

    /** @type {Map<string, number>} */
    const counts = new Map();
    de.forEach(l => {
      if (l.loc?.city) counts.set(l.loc.city, (counts.get(l.loc.city) || 0) + 1);
    });

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

    const rich   = shuffle([...counts.entries()].filter(([c, n]) => n >= 3 && !pinned.includes(c)).map(([c]) => c));
    const sparse = shuffle([...counts.entries()].filter(([c, n]) => n === 2 && !pinned.includes(c)).map(([c]) => c));

    const RANDOM_SLOTS = 5;
    const maxSparse    = Math.floor(RANDOM_SLOTS / 2);
    const sparseCount  = Math.min(maxSparse, sparse.length);
    const richCount    = Math.min(RANDOM_SLOTS - sparseCount, rich.length);
    const pool         = [...rich.slice(0, richCount), ...sparse.slice(0, sparseCount)];

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
   * @param {string} city
   * @returns {number}
   */
  _minPrefix(city) {
    const allCities = [...new Set(
      (this._ac.locations || []).map(l => l.loc?.city).filter(Boolean)
    )];
    let unique = city.length;
    for (let n = 2; n <= city.length; n++) {
      const prefix = city.slice(0, n).toLowerCase();
      if (allCities.filter(c => c.toLowerCase().startsWith(prefix)).length <= 1) {
        unique = n;
        break;
      }
    }
    const natural = Math.min(Math.ceil(city.length / 2), city.length - 1);
    return Math.max(unique, natural);
  }

  // ── Sequence ──────────────────────────────────────────────────────────────────

  _runSequence() {
    if (!this._running) return;
    const cities = this._pickCities();
    this._at(0, () => {
      this._resetToGermany();
      const bar = /** @type {HTMLInputElement|null} */ (document.getElementById('search-bar'));
      bar?.focus();
    });
    this._timers.push(setTimeout(() => this._runCity(cities, 0), OVERVIEW_MS));
  }

  /**
   * @param {string[]} cities
   * @param {number}   index
   */
  _runCity(cities, index) {
    if (!this._running) return;

    if (index >= cities.length) {
      this._resetToGermany();
      this._loopT = setTimeout(() => { if (this._running) this._runSequence(); }, OVERVIEW_MS);
      return;
    }

    const city   = cities[index];
    const plz    = this._plzForCity(city);
    let t        = 0;
    const stepMs = plz !== null ? NAV_STEP_PINNED : NAV_STEP_MS;

    if (plz) {
      t = this._type(plz, t);
      t += CITY_PAUSE_MS;
      this._timers.push(setTimeout(() =>
        this._waitForZoom(() => this._navigateSpaces(cities, index, stepMs)), t));

    } else {
      const prefix = city.slice(0, this._minPrefix(city));
      t = this._type(prefix, t);
      t += AUTOCOMPLETE_MS;

      this._timers.push(setTimeout(() => {
        if (!this._running) return;
        const numSuggestions = document.querySelectorAll('#autocomplete-container .autocomplete-pill').length;

        if (numSuggestions === 0) {
          this._waitForZoom(() => this._navigateSpaces(cities, index, stepMs));
          return;
        }

        this._clearConnectionLine();
        this._dispatchDemoKey('Tab');

        if (numSuggestions > 1) {
          this._timers.push(setTimeout(() => {
            if (!this._running) return;
            this._dispatchDemoKey('Enter');
            this._waitForZoom(() => this._navigateSpaces(cities, index, stepMs));
          }, 350));
        } else {
          this._waitForZoom(() => this._navigateSpaces(cities, index, stepMs));
        }
      }, t));
    }
  }

  /**
   * @param {string[]} cities
   * @param {number}   index
   * @param {number | (() => number)} stepMs
   */
  _navigateSpaces(cities, index, stepMs = NAV_STEP_MS) {
    const getStep = typeof stepMs === 'function' ? stepMs : () => stepMs;
    if (!this._running) return;

    const hasIdMatch = !!document.querySelector('#suggestions-dropdown .id-match-header');
    const allItems   = document.querySelectorAll('#suggestions-dropdown .listing-item');
    const count      = allItems.length - (hasIdMatch ? 1 : 0);

    if (count === 0) { this._clearCity(cities, index); return; }

    if (hasIdMatch) this._dispatchDemoKey('ArrowDown');

    let step = 0;
    const tick = () => {
      if (!this._running) return;
      this._dispatchDemoKey('ArrowDown');
      step++;
      if (step < count) {
        this._timers.push(setTimeout(tick, getStep()));
      } else {
        this._timers.push(setTimeout(() => {
          if (this._running) this._clearCity(cities, index);
        }, POPUP_DWELL_MS));
      }
    };
    tick();
  }

  /**
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

// ═══════════════════════════════════════════════════════════════════════════════
// OpenDemoMode — shows all currently-open makerspaces via the 'open' filter,
//                then navigates the list with cursor keys
// ═══════════════════════════════════════════════════════════════════════════════

export class OpenDemoMode extends _DemoBase {
  /** @param {import('./app-context.js').AppContext} appContext */
  constructor(appContext) {
    super(appContext);
    this._initCommandTrigger();
  }

  _showIndicator() {
    this._showIndicatorWith(
      '<i class="fas fa-door-open"></i><span class="demo-play-triangle demo-play-triangle--open"></span>',
      'demo-indicator--open'
    );
  }

  _showStartToast() {
    this._showToast('<i class="fas fa-door-open"></i> Open spaces · LIVE');
  }

  // ── /opendemo command ─────────────────────────────────────────────────────────

  _initCommandTrigger() {
    const bar = /** @type {HTMLInputElement|null} */ (document.getElementById('search-bar'));
    if (!bar) return;
    bar.addEventListener('input', () => {
      if (bar.value.trim() === '/opendemo') {
        bar.value = '';
        bar.dispatchEvent(new Event('input', { bubbles: true }));
        this.start();
      }
    });
  }

  // ── Reset: clear 'open' filter before base reset triggers applyFilters ────────

  _resetToGermany() {
    const sf = this._ac.searchFilter;
    if (sf) sf.setStyleFilter('open', false);
    super._resetToGermany();
  }

  // ── Sequence ──────────────────────────────────────────────────────────────────

  _runSequence() {
    if (!this._running) return;

    // Germany overview
    this._at(0, () => {
      this._resetToGermany();
      document.getElementById('search-bar')?.focus();
    });

    // After overview: apply 'open' filter, wait for zoom, then navigate
    this._timers.push(setTimeout(() => {
      if (!this._running) return;
      const sf = this._ac.searchFilter;
      if (!sf) { this.stop(); return; }

      sf.setStyleFilter('open', true);
      sf.applyFilters();

      this._waitForZoom(() => this._navigateOpenSpaces());
    }, OVERVIEW_MS));
  }

  /** Navigate through all open spaces in the dropdown with ArrowDown. */
  _navigateOpenSpaces() {
    if (!this._running) return;

    const count = document.querySelectorAll('#suggestions-dropdown .listing-item').length;

    if (count === 0) {
      this._showToast('<i class="fas fa-door-open"></i> No open spaces right now');
      setTimeout(() => this.stop(), 2500);
      return;
    }

    let step = 0;
    const tick = () => {
      if (!this._running) return;
      this._dispatchDemoKey('ArrowDown');
      step++;
      if (step < count) {
        this._timers.push(setTimeout(tick, NAV_STEP_MS()));
      } else {
        // All open spaces visited — dwell on last then restart
        this._timers.push(setTimeout(() => {
          if (this._running) this._runSequence();
        }, POPUP_DWELL_MS));
      }
    };
    tick();
  }
}
