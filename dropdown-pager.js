// dropdown-pager.js — Seitenweises Blättern im Dropdown-Grid (Phone/Tablet)
//
// Zuständig für: Snap-Seiten (Grid-Maße, Ghost-Items, Ecken-Rundung), laufende Item-Nummern, Hoch/Runter-Buttons
// (1× Seite, 2× 4 Seiten, 3× zum Rand), Mausrad, Fast-Scroll-Erkennung per Touch und die Rand-Indikatoren.
// Das Filter-Pane und die Chip-Leiste liegen in mobile-filter.js. Grid-Maße: layout-mode.js (`gridSpec`).

import { isMobileUI, isTablet, currentGridSpec } from './layout-mode.js';

const DROPDOWN_ID = 'suggestions-dropdown';
const NAV_RESET_MS = 600;       // Klick-Zähler/Icon nach dieser Pause zurücksetzen
const SCROLL_SESSION_MS = 600;  // Fast-Scroll-Session nach dieser Pause beenden
const PAGES_PER_DOUBLE_CLICK = 4;

// Icon je Klick-Stufe (1 Seite → 4 Seiten → zum Rand)
const NAV_ICONS = {
  up:   ['fa-angle-up', 'fa-angles-up', 'fa-arrows-up-to-line'],
  down: ['fa-angle-down', 'fa-angles-down', 'fa-arrows-down-to-line'],
};

const dropdownEl = () => document.getElementById(DROPDOWN_ID);
const navIcon = direction => document.querySelector(`#dropdown-nav-${direction} i`);

class DropdownPager {
  constructor() {
    this._navClickCounts = { up: 0, down: 0 };
    this._navClickTimers = { up: null, down: null };
    this._scrollRaf = null;          // laufende programmatische Scroll-Animation
    this._scrollTarget = null;
    this._scrollingToEnd = false;    // Triple-Klick-Animation zum Rand läuft
    this._touchFastDir = null;       // Fast-Scroll bereits ausgelöst (pro Geste einmal)
    this._scrollLastTop = null;
    this._scrollSessionDir = null;
    this._scrollSessionDist = 0;
    this._scrollSessionTimer = null;
  }

  init() {
    document.getElementById('dropdown-nav-up')?.addEventListener('click', () => this._navClick('up'));
    document.getElementById('dropdown-nav-down')?.addEventListener('click', () => this._navClick('down'));

    const dropdown = dropdownEl();
    if (!dropdown) return;

    // Grid-Snapping + Nummern neu setzen, wenn sich der Inhalt ändert
    new MutationObserver(mutations => {
      // Ghost-Items ignorieren (würden sonst Endlosschleife erzeugen)
      const ghostOnly = mutations.every(m =>
        [...m.addedNodes, ...m.removedNodes].every(node => node.classList?.contains('mf-ghost-item')));
      if (ghostOnly) return;
      this.applyGridSnapping(dropdown);
      this.updateItemNumbers(dropdown);
      this._resetNavClick('up');
      this._resetNavClick('down');
      this._updateEndIndicators();
    }).observe(dropdown, { childList: true, subtree: false });

    // Maus-Wheel → Snap-Seiten
    dropdown.addEventListener('wheel', e => {
      if (!isMobileUI()) return;
      e.preventDefault();
      this._scrollPages(e.deltaY > 0 ? 1 : -1);
    }, { passive: false });

    dropdown.addEventListener('touchstart', () => {
      if (isMobileUI()) this._touchFastDir = null; // erlaubt Re-Aktivierung pro Geste
    }, { passive: true });
    dropdown.addEventListener('touchend', () => this._updateEndIndicators(), { passive: true });
    dropdown.addEventListener('scroll', () => this._onScroll(dropdown), { passive: true });

    this._updateEndIndicators();
  }

  // ── Scrollen ────────────────────────────────────────────────────────────

  /** Rand-Indikatoren + kumulative Fast-Scroll-Erkennung (≥ 1 Seite in gleicher Richtung → 2-Seiten-Icon) */
  _onScroll(dropdown) {
    if (!isMobileUI()) return;
    this._updateEndIndicators();
    if (this._scrollRaf) return; // programmatischen Scroll ausschließen

    const top = dropdown.scrollTop;
    const step = top - (this._scrollLastTop ?? top);
    this._scrollLastTop = top;
    if (step === 0) return;

    const dir = step > 0 ? 'down' : 'up';
    if (dir !== this._scrollSessionDir) { // Richtungswechsel → Session zurücksetzen
      this._scrollSessionDir = dir;
      this._scrollSessionDist = 0;
    }
    this._scrollSessionDist += Math.abs(step);

    if (this._scrollSessionDist >= currentGridSpec().pageHeight && this._touchFastDir !== dir) {
      this._touchFastDir = dir;
      this._navClickCounts[dir] = 1; // nächster Klick → Stufe 2 (4 Seiten)
      const icon = navIcon(dir);
      if (icon && !icon.className.includes('arrows')) icon.className = `fas ${NAV_ICONS[dir][1]}`;
      this._scheduleNavReset(dir);
    }

    clearTimeout(this._scrollSessionTimer);
    this._scrollSessionTimer = setTimeout(() => {
      this._scrollSessionDir = null;
      this._scrollSessionDist = 0;
    }, SCROLL_SESSION_MS);
  }

  /** Um `pages` Seiten scrollen (negativ = hoch); rundet zuerst auf die nächste Seitengrenze */
  _scrollPages(pages) {
    const dropdown = dropdownEl();
    if (!dropdown) return;
    const pageH = currentGridSpec().pageHeight;
    const base = Math.round((this._scrollTarget ?? dropdown.scrollTop) / pageH) * pageH;
    this._scrollTarget = base + pages * pageH;
    this._smoothScroll(dropdown, this._scrollTarget, 420);
  }

  _smoothScroll(el, targetTop, duration = 420) {
    if (this._scrollRaf) { // laufende Animation abbrechen (verhindert parallele RAF-Loops)
      cancelAnimationFrame(this._scrollRaf);
      this._scrollRaf = null;
    }
    const start = el.scrollTop;
    const end = Math.max(0, Math.min(targetTop, el.scrollHeight - el.clientHeight));
    const dist = end - start;
    const finish = () => {
      this._scrollRaf = null;
      this._scrollTarget = null;
      this._scrollingToEnd = false;
      el.style.scrollSnapType = ''; // Snap nach der Animation wiederherstellen
    };
    if (dist === 0) { finish(); return; }

    el.style.scrollSnapType = 'none';
    const t0 = performance.now();
    const easeInOutCubic = t => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    const step = now => {
      const p = Math.min((now - t0) / duration, 1);
      el.scrollTop = start + dist * easeInOutCubic(p);
      if (p < 1) {
        this._scrollRaf = requestAnimationFrame(step);
      } else {
        finish();
        this._updateEndIndicators();
      }
    };
    this._scrollRaf = requestAnimationFrame(step);
  }

  // ── Hoch/Runter-Buttons ─────────────────────────────────────────────────

  _navClick(direction) {
    if (!isMobileUI()) return;
    clearTimeout(this._navClickTimers[direction]);
    const count = (this._navClickCounts[direction] || 0) + 1;
    this._navClickCounts[direction] = count;
    const sign = direction === 'up' ? -1 : 1;
    const icon = navIcon(direction);

    if (count === 1) {
      this._scrollPages(sign);
    } else if (count === 2) {
      this._scrollPages(sign * PAGES_PER_DOUBLE_CLICK);
    } else { // Triple-Klick: an den Rand springen, to-line-Icon während der Animation halten
      this._scrollingToEnd = true;
      if (icon) icon.className = `fas ${NAV_ICONS[direction][2]}`;
      const dropdown = dropdownEl();
      if (dropdown) this._smoothScroll(dropdown, direction === 'up' ? 0 : dropdown.scrollHeight, direction === 'up' ? 500 : 600);
      this._navClickCounts[direction] = 0;
      this._scheduleNavReset(direction);
      return;
    }

    if (icon) icon.className = `fas ${NAV_ICONS[direction][count - 1]}`;
    this._scheduleNavReset(direction);
  }

  _scheduleNavReset(direction) {
    clearTimeout(this._navClickTimers[direction]);
    this._navClickTimers[direction] = setTimeout(() => this._resetNavClick(direction), NAV_RESET_MS);
  }

  _resetNavClick(direction) {
    clearTimeout(this._navClickTimers[direction]);
    this._navClickCounts[direction] = 0;
    const icon = navIcon(direction);
    if (icon) icon.className = `fas ${NAV_ICONS[direction][0]}`;
    this._updateEndIndicators(); // ggf. to-line-Icon wiederherstellen
  }

  /** Am Anfang/Ende: Button als `at-end` markieren und to-line-Icon zeigen; sonst normales Icon zurück */
  _updateEndIndicators() {
    const dropdown = dropdownEl();
    if (!dropdown || !isMobileUI()) return;
    const atTop = dropdown.scrollTop <= 1;
    const atBottom = dropdown.scrollTop >= dropdown.scrollHeight - dropdown.clientHeight - 1;
    this._applyEndState('up', atTop);
    this._applyEndState('down', atBottom);
  }

  _applyEndState(direction, atEnd) {
    const btn = document.getElementById(`dropdown-nav-${direction}`);
    const icon = btn?.querySelector('i');
    btn?.classList.toggle('at-end', atEnd);
    if (!icon) return;
    const [, , toLine] = NAV_ICONS[direction];
    if (atEnd) {
      icon.className = `fas ${toLine}`;
    } else if (!this._scrollingToEnd && icon.className.includes(toLine)) {
      // Endposition verlassen → normales Icon (außer während der Triple-Klick-Animation zum Rand)
      icon.className = `fas ${NAV_ICONS[direction][this._navClickCounts[direction] >= 2 ? 1 : 0]}`;
    }
  }

  // ── Grid: Snap-Seiten, Ghost-Items, Rundung, Nummern ────────────────────

  /** Laufende Nummer in jedem Item-Badge (nur Mobile) */
  updateItemNumbers(dropdown) {
    if (!isMobileUI()) return;
    dropdown.querySelectorAll('.listing-item').forEach((item, i) => {
      let num = item.querySelector('.item-number');
      if (!num) {
        num = document.createElement('span');
        num.className = 'item-number';
        item.appendChild(num);
      }
      num.textContent = i + 1;
    });
  }

  /**
   * Snap-Punkt je Seite, weiße Innen-Rahmen, abgerundete Ecken des Gesamt-Grids; die letzte Zeile wird mit
   * Ghost-Items aufgefüllt. Maße: layout-mode.js (Phone 2×3, Tablet 4×4 bzw. 5×3).
   */
  applyGridSnapping(dropdown) {
    if (!isMobileUI()) return;
    dropdown.querySelectorAll('.mf-ghost-item').forEach(el => el.remove());

    const { cols, rowsPerPage, rowH } = currentGridSpec();
    const itemsPerPage = cols * rowsPerPage;
    const items = Array.from(dropdown.querySelectorAll('.listing-item'));

    const ghostCount = (cols - (items.length % cols)) % cols;
    for (let g = 0; g < ghostCount; g++) {
      const ghost = document.createElement('div');
      ghost.className = 'mf-ghost-item';
      ghost.style.height = rowH + 'px';
      ghost.style.background = '#555';
      ghost.style.boxSizing = 'border-box';
      dropdown.appendChild(ghost);
    }

    const allItems = Array.from(dropdown.querySelectorAll('.listing-item, .mf-ghost-item'));
    const total = allItems.length;
    const lastRowIdx = total > 0 ? Math.floor((total - 1) / cols) : 0;

    allItems.forEach((item, i) => {
      item.style.borderRadius = '0';
      item.style.border = 'none';
      if (!item.classList.contains('mf-ghost-item')) { // Snapping nur für reale Items
        const isPageStart = i % itemsPerPage === 0;
        item.style.scrollSnapAlign = isPageStart ? 'start' : 'none';
        item.style.scrollSnapStop = isPageStart ? 'always' : 'normal';
      }
      if (i % cols !== cols - 1) item.style.borderRight = '1px solid white';
      if (Math.floor(i / cols) !== lastRowIdx) item.style.borderBottom = '1px solid white';
    });

    if (total >= 1) { // Ecken des Gesamt-Grids runden (letzte Zeile ist durch Ghosts immer voll)
      allItems[0].style.borderTopLeftRadius = '12px';
      allItems[Math.min(total, cols) - 1].style.borderTopRightRadius = '12px';
      allItems[lastRowIdx * cols].style.borderBottomLeftRadius = '12px';
      allItems[total - 1].style.borderBottomRightRadius = '12px';
      dropdown.style.maxHeight = (rowsPerPage * rowH) + 'px'; // Container exakt auf die Zeilenzahl fixieren
    }
  }
}

export { DropdownPager };
