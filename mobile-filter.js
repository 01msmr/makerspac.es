import AppConfig from './config.js';
import { appContext } from './app-context.js';

class MobileFilterUI {
  constructor() {
    this.sheet = null;
    this._autoCloseTimer = null;
    this._toastTimer = null;
    this._resizeHandler = null;
    this._hasInteracted = false;
    this._navClickCounts = { up: 0, down: 0 };
    this._navClickTimers = { up: null, down: null };
    this._scrollSessionTimer = null;
  }

  // Spiegelt die CSS-Bedingungen: aktiv wenn <= 1024px ODER Touch-Tablet (pointer: coarse)
  _isMobileUI() {
    return window.matchMedia('(max-width: 1024px), (min-width: 768px) and (pointer: coarse)').matches;
  }

  // Tablet: Touch-Gerät mit Mindestbreite 768px (portrait + landscape)
  _isTablet() {
    return window.matchMedia('(min-width: 768px) and (pointer: coarse)').matches;
  }

  // ISO 3166-1 alpha-2 → Länderbezeichnung (wie in locations.json verwendet)
  static COUNTRY_CODE_MAP = {
    'AT': 'Austria', 'BE': 'Belgium', 'CH': 'Switzerland', 'CZ': 'Czechia',
    'DE': 'Germany', 'DK': 'Denmark', 'ES': 'Spain', 'FI': 'Finland',
    'FR': 'France', 'GB': 'United Kingdom', 'GR': 'Greece', 'HU': 'Hungary',
    'IE': 'Ireland', 'IT': 'Italy', 'LU': 'Luxembourg', 'NL': 'Netherlands',
    'NO': 'Norway', 'PL': 'Poland', 'PT': 'Portugal', 'SE': 'Sweden',
    'SK': 'Slovakia', 'UA': 'Ukraine', 'US': 'United States',
  };

  init() {
    document.getElementById('filter-toggle-btn')
      ?.addEventListener('click', () => this.sheet ? this.close() : this.open());

    document.getElementById('dropdown-nav-up')
      ?.addEventListener('click', () => this._navClick('up'));
    document.getElementById('dropdown-nav-down')
      ?.addEventListener('click', () => this._navClick('down'));

    // Map-Bottom dynamisch an Search-Container anpassen (Mobile)
    const searchContainer = document.querySelector('.search-container');
    if (searchContainer) {
      const updateMapBottom = () => {
        document.documentElement.style.setProperty('--mobile-ui-height', searchContainer.offsetHeight + 'px');
      };
      updateMapBottom();
      new ResizeObserver(updateMapBottom).observe(searchContainer);

      // Android: Keyboard open/close changes visualViewport — Leaflet canvas muss neu berechnet werden
      // sonst bleibt ein schwarzer Streifen rechts (Canvas-Breite stimmt nicht mit Container überein)
      if ('ontouchstart' in window && window.visualViewport) {
        window.visualViewport.addEventListener('resize', () => {
          updateMapBottom();
          const m = appContext.map;
          if (m) requestAnimationFrame(() => m.invalidateSize());
        });
      }
    }

    // Grid-Snapping auf Dropdown-Items setzen wenn Inhalt sich ändert
    const dropdown = document.getElementById('suggestions-dropdown');
    if (dropdown) {
      new MutationObserver((mutations) => {
        // Ghost-Items ignorieren (würden sonst Endlosschleife erzeugen)
        const ghostOnly = mutations.every(m =>
          [...m.addedNodes, ...m.removedNodes].every(node =>
            node.classList?.contains('mf-ghost-item')
          )
        );
        if (ghostOnly) return;
        this.applyGridSnapping(dropdown);
        this._updateItemNumbers(dropdown);
        this._resetNavClick('up');
        this._resetNavClick('down');
        this._updateEndIndicators();
      }).observe(dropdown, { childList: true, subtree: false });

      // Maus-Wheel → Snap-Pages auf Mobile
      dropdown.addEventListener('wheel', (e) => {
        if (!this._isMobileUI()) return;
        e.preventDefault();
        this.scrollDropdown(e.deltaY > 0 ? 1 : -1);
      }, { passive: false });

      dropdown.addEventListener('touchstart', () => {
        if (!this._isMobileUI()) return;
        this._touchFastDir = null; // erlaubt Re-Aktivierung pro Geste
      }, { passive: true });

      dropdown.addEventListener('touchend', () => {
        if (!this._isMobileUI()) return;
        this._updateEndIndicators();
      }, { passive: true });

      // Scroll-Event: End-Indikatoren + kumulative Fast-Scroll-Erkennung
      dropdown.addEventListener('scroll', () => {
        if (!this._isMobileUI()) return;
        this._updateEndIndicators();
        if (this._scrollRaf) return; // programmatischen Scroll ausschließen

        const curTop = dropdown.scrollTop;
        const step   = curTop - (this._scrollLastTop ?? curTop);
        this._scrollLastTop = curTop;

        if (step !== 0) {
          const dir = step > 0 ? 'down' : 'up';
          // Richtungswechsel → Session zurücksetzen
          if (dir !== this._scrollSessionDir) {
            this._scrollSessionDir  = dir;
            this._scrollSessionDist = 0;
          }
          this._scrollSessionDist += Math.abs(step);

          // Aktivieren wenn kumulativ ≥ 1 pageH in gleicher Richtung
          if (this._scrollSessionDist >= 116 && this._touchFastDir !== dir) {
            this._touchFastDir = dir;
            clearTimeout(this._navClickTimers[dir]);
            this._navClickCounts[dir] = 1; // nächster Click → count=2 → 5×-Scroll
            const icon = document.querySelector(`#dropdown-nav-${dir} i`);
            if (icon && !icon.className.includes('arrows')) {
              icon.className = `fas fa-angles-${dir}`;
            }
            this._navClickTimers[dir] = setTimeout(() => this._resetNavClick(dir), 600);
          }

          // Session nach kurzer Pause zurücksetzen
          clearTimeout(this._scrollSessionTimer);
          this._scrollSessionTimer = setTimeout(() => {
            this._scrollSessionDir  = null;
            this._scrollSessionDist = 0;
          }, 600);
        }
      }, { passive: true });

      this._updateEndIndicators();
    }
  }

  scrollDropdown(direction) {
    const dropdown = document.getElementById('suggestions-dropdown');
    if (!dropdown) return;
    const isTablet   = this._isTablet();
    const landscape  = isTablet && window.matchMedia('(orientation: landscape)').matches;
    const rowH = landscape ? 174 : isTablet ? 232 : 116; // Landscape: 3×58=174, Portrait: 4×58=232, Phone: 2×58=116
    // Basis auf nächste rowH-Grenze runden → sauberes Snapping auch nach Touch
    const base = Math.round((this._scrollTarget ?? dropdown.scrollTop) / rowH) * rowH;
    this._scrollTarget = base + direction * rowH;
    this._smoothScroll(dropdown, this._scrollTarget, 420);
  }

  _smoothScroll(el, targetTop, duration = 420) {
    // Laufende Animation cancellen (verhindert mehrere gleichzeitige RAF-Loops)
    if (this._scrollRaf) {
      cancelAnimationFrame(this._scrollRaf);
      this._scrollRaf = null;
    }
    const start = el.scrollTop;
    const end = Math.max(0, Math.min(targetTop, el.scrollHeight - el.clientHeight));
    const dist = end - start;
    if (dist === 0) { el.style.scrollSnapType = ''; this._scrollTarget = null; this._scrollingToEnd = false; return; }
    el.style.scrollSnapType = 'none';
    const t0 = performance.now();
    const ease = t => t < 0.5 ? 4*t*t*t : 1 - Math.pow(-2*t + 2, 3) / 2; // easeInOutCubic
    const step = now => {
      const p = Math.min((now - t0) / duration, 1);
      el.scrollTop = start + dist * ease(p);
      if (p < 1) {
        this._scrollRaf = requestAnimationFrame(step);
      } else {
        this._scrollRaf = null;
        this._scrollTarget = null;
        this._scrollingToEnd = false;
        el.style.scrollSnapType = ''; // Snap nach Animation wiederherstellen
        this._updateEndIndicators();
      }
    };
    this._scrollRaf = requestAnimationFrame(step);
  }

  _navClick(direction) {
    if (!this._isMobileUI()) return;
    clearTimeout(this._navClickTimers[direction]);
    this._navClickCounts[direction] = (this._navClickCounts[direction] || 0) + 1;
    const count = this._navClickCounts[direction];

    const iconUp   = { 1: 'fa-angle-up',            2: 'fa-angles-up',   3: 'fa-arrows-up-to-line'   };
    const iconDown = { 1: 'fa-angle-down',           2: 'fa-angles-down', 3: 'fa-arrows-down-to-line' };
    const iconMap  = direction === 'up' ? iconUp : iconDown;
    const btnId    = `dropdown-nav-${direction}`;
    const icon     = document.querySelector(`#${btnId} i`);

    if (count === 1) {
      this.scrollDropdown(direction === 'up' ? -1 : 1);
    } else if (count === 2) {
      this.scrollDropdown(direction === 'up' ? -4 : 4);
    } else {
      // Triple-Klick: an den Rand springen, to-line Icon während Animation halten
      this._scrollingToEnd = true;
      if (icon) icon.className = `fas ${iconMap[3]}`;
      if (direction === 'up') this._scrollToTop();
      else this._scrollToBottom();
      this._navClickCounts[direction] = 0;
      this._navClickTimers[direction] = setTimeout(() => this._resetNavClick(direction), 600);
      return;
    }

    if (icon) icon.className = `fas ${iconMap[count]}`;
    this._navClickTimers[direction] = setTimeout(() => this._resetNavClick(direction), 600);
  }

  _resetNavClick(direction) {
    clearTimeout(this._navClickTimers[direction]);
    this._navClickCounts[direction] = 0;
    const iconClass = direction === 'up' ? 'fas fa-angle-up' : 'fas fa-angle-down';
    const icon = document.querySelector(`#dropdown-nav-${direction} i`);
    if (icon) icon.className = iconClass;
    this._updateEndIndicators(); // ggf. to-line Icon wiederherstellen
  }

  _updateEndIndicators() {
    const dropdown = document.getElementById('suggestions-dropdown');
    if (!dropdown || !this._isMobileUI()) return;
    const atTop    = dropdown.scrollTop <= 1;
    const atBottom = dropdown.scrollTop >= dropdown.scrollHeight - dropdown.clientHeight - 1;
    const upBtn    = document.getElementById('dropdown-nav-up');
    const downBtn  = document.getElementById('dropdown-nav-down');
    upBtn?.classList.toggle('at-end', atTop);
    downBtn?.classList.toggle('at-end', atBottom);
    const upIcon   = upBtn?.querySelector('i');
    const downIcon = downBtn?.querySelector('i');
    if (atTop    && upIcon)   upIcon.className   = 'fas fa-arrows-up-to-line';
    if (atBottom && downIcon) downIcon.className = 'fas fa-arrows-down-to-line';
    // Normales Icon sofort zurücksetzen sobald Endposition verlassen —
    // außer während triple-click-Animation zum Ende hin
    if (!this._scrollingToEnd) {
      if (!atTop    && upIcon?.className.includes('arrows-up-to-line'))
        upIcon.className   = `fas fa-angle${this._navClickCounts.up   >= 2 ? 's' : ''}-up`;
      if (!atBottom && downIcon?.className.includes('arrows-down-to-line'))
        downIcon.className = `fas fa-angle${this._navClickCounts.down >= 2 ? 's' : ''}-down`;
    }
  }

  _disableNavButtons() {
    document.querySelectorAll('.dropdown-nav-btn').forEach(btn => { btn.disabled = true; });
    const dropdown = document.getElementById('suggestions-dropdown');
    let scrollEndTimer = null;

    const reEnable = () => {
      clearTimeout(scrollEndTimer);
      dropdown?.removeEventListener('scroll', onScroll);
      this._resetNavClick('up');
      this._resetNavClick('down');
      document.querySelectorAll('.dropdown-nav-btn').forEach(btn => { btn.disabled = false; });
    };

    const onScroll = () => {
      clearTimeout(scrollEndTimer);
      scrollEndTimer = setTimeout(reEnable, 900);
    };

    dropdown?.addEventListener('scroll', onScroll);
    // Fallback: falls kein Scroll-Event feuert (z.B. bereits am Anfang/Ende)
    scrollEndTimer = setTimeout(reEnable, 900);
  }

  _scrollToTop() {
    const dropdown = document.getElementById('suggestions-dropdown');
    if (dropdown) this._smoothScroll(dropdown, 0, 500);
  }

  _scrollToBottom() {
    const dropdown = document.getElementById('suggestions-dropdown');
    if (dropdown) this._smoothScroll(dropdown, dropdown.scrollHeight, 600);
  }

  getCategories() {
    return {
      bookmarks: { icon: 'fas fa-bookmark',           label: window.i18n?.t('filter.bookmarks') || 'Favoriten' },
      style:     { icon: 'fas fa-people-group',       label: window.i18n?.t('filter.style')     || 'Style' },
      doorState: { icon: 'fas fa-door-open',          label: window.i18n?.t('filter.status')    || 'Status' },
      weekly:    { icon: 'fas fa-calendar-day',       label: window.i18n?.t('filter.weekly')    || 'Meeting' },
      workshops: { icon: 'fas fa-wrench',             label: window.i18n?.t('filter.workshops') || 'Werkstätten' },
      country:   { icon: 'fas fa-flag',               label: window.i18n?.t('filter.country')   || 'Land' },
    };
  }

  getOptions(key) {
    const fc = AppConfig.filterCategories;
    if (key === 'weekly')    return [...(fc?.weekly?.options || []), 'any'];
    if (key === 'country')   return appContext.searchFilter?.getUniqueCountries?.() || [];
    if (key === 'bookmarks') return ['bookmarked'];
    return fc?.[key]?.options || [];
  }

  // Ermittelt das Land des Nutzers anhand der Browser-Sprache
  getUserCountry() {
    const available = appContext.searchFilter?.getUniqueCountries?.() || [];
    const langs = navigator.languages?.length ? Array.from(navigator.languages) : [navigator.language || ''];
    for (const lang of langs) {
      const code = lang.split('-')[1]?.toUpperCase();
      if (!code) continue;
      const name = MobileFilterUI.COUNTRY_CODE_MAP[code];
      if (name && available.includes(name)) return name;
    }
    return null;
  }

  // ISO-Code für fi fi-XX Flag-Icons
  getCountryCode(countryName) {
    const code = AppConfig.getCountryCode(countryName);
    return (!code || code === 'un') ? null : code;
  }

  open() {
    if (this.sheet) return;

    this.sheet = this.buildSheet();
    document.body.appendChild(this.sheet);

    // Position: bottom of overlay = top edge of search-input-row
    // Filter pane covers the dropdown area; z-index: 10001 keeps it above dropdown
    const searchRow = document.querySelector('.search-input-row');
    const rect      = searchRow?.getBoundingClientRect();
    const bottomPos = rect ? window.innerHeight - rect.top : 44;
    this.sheet.style.left   = '0';
    this.sheet.style.right  = '0';
    this.sheet.style.bottom = bottomPos + 'px';

    // Slide-in Animation
    requestAnimationFrame(() => requestAnimationFrame(() => {
      this.sheet?.querySelector('.mf-sheet')?.classList.add('mf-sheet-open');
    }));

    // Tippen auf Overlay-Hintergrund → schließen
    this.sheet.addEventListener('click', e => {
      if (e.target === this.sheet) this.close();
    });

    // Tippen innerhalb des Panels → Timer zurücksetzen (Panel bleibt offen)
    this.sheet.querySelector('.mf-sheet')?.addEventListener('click', () => this._resetAutoClose());

    // Außerhalb tippen → schließen (Filter-Button ausgenommen)
    this._outsideHandler = (e) => {
      const filterBtn = document.getElementById('filter-toggle-btn');
      if (this.sheet && !this.sheet.contains(e.target) && !filterBtn?.contains(e.target)) this.close();
    };
    setTimeout(() => document.addEventListener('pointerdown', this._outsideHandler), 0);

    // Resize/Orientierungswechsel → sofort schließen
    this._resizeHandler = () => this.close();
    window.addEventListener('resize', this._resizeHandler, { once: true });

    document.querySelector('#filter-toggle-btn i')?.setAttribute('class', 'fas fa-angle-down');

    this._hasInteracted = false;
    this._resetAutoClose();
  }

  close() {
    if (!this.sheet) return;
    clearTimeout(this._autoCloseTimer);
    this._autoCloseTimer = null;
    clearTimeout(this._toastTimer);
    this._toastTimer = null;
    this._clearClosingTip();
    if (this._resizeHandler) {
      window.removeEventListener('resize', this._resizeHandler);
      this._resizeHandler = null;
    }
    document.removeEventListener('pointerdown', this._outsideHandler);
    this._outsideHandler = null;

    // Slide-out Animation, dann DOM-Entfernung
    const overlay = this.sheet;
    const panel = overlay.querySelector('.mf-sheet');
    this.sheet = null;
    this._track = null;
    this._prevBtn = null;
    this._nextBtn = null;
    if (panel) {
      panel.classList.remove('mf-sheet-open');
      panel.addEventListener('transitionend', () => overlay.remove(), { once: true });
    } else {
      overlay.remove();
    }

    document.querySelector('#filter-toggle-btn i')?.setAttribute('class', 'fas fa-filter');

    this.updateChipBar();
  }

  buildSheet() {
    const overlay = document.createElement('div');
    overlay.className = 'mf-overlay';

    const panel = document.createElement('div');
    panel.className = 'mf-sheet';

    const prevBtn = document.createElement('button');
    prevBtn.className = 'mf-nav-btn mf-nav-prev';
    prevBtn.innerHTML = '&#8249;';
    prevBtn.disabled = true;

    const nextBtn = document.createElement('button');
    nextBtn.className = 'mf-nav-btn mf-nav-next';
    nextBtn.innerHTML = '&#8250;';

    const track = document.createElement('div');
    track.className = 'mf-sections-track';

    for (const [key, cfg] of Object.entries(this.getCategories())) {
      track.appendChild(this.renderSection(key, cfg));
    }

    this._applyUnifiedGrid(track);

    prevBtn.addEventListener('click', () => this._navPrev());
    nextBtn.addEventListener('click', () => this._navNext());
    track.addEventListener('scroll', () => this._onTrackScroll(), { passive: true });

    panel.appendChild(prevBtn);
    panel.appendChild(track);
    panel.appendChild(nextBtn);

    this._track = track;
    this._prevBtn = prevBtn;
    this._nextBtn = nextBtn;

    this._updateNavButtons();

    overlay.appendChild(panel);
    return overlay;
  }

  renderSection(key, cfg) {
    const section = document.createElement('div');
    section.className = 'mf-section';
    section.dataset.key = key;

    const activeValue = appContext.searchHeader?.getActiveFilterForCategory(key);

    const title = document.createElement('div');
    title.className = 'mf-section-title' + (activeValue ? ' mf-has-value' : '');
    title.textContent = (cfg.label || key).toUpperCase();

    // Title first — becomes row 0 in the unified grid
    section.appendChild(title);

    const options = this.getOptions(key);
    const userCountry = (key === 'country' && !activeValue) ? this.getUserCountry() : null;

    let activeItem = null;

    options.forEach(opt => {
      const isActive = opt === activeValue;
      const isUserCountry = opt === userCountry;
      const isDoorOpen   = key === 'doorState' && opt === 'open';
      const isDoorClosed = key === 'doorState' && opt === 'closed';

      const item = document.createElement('div');
      item.className = 'mf-opt-item'
        + (isActive      ? ' mf-opt-active'      : '')
        + (isUserCountry ? ' mf-opt-user-country' : '')
        + (isDoorOpen    ? ' mf-opt-door-open'    : '')
        + (isDoorClosed  ? ' mf-opt-door-closed'  : '');

      // Check icon (always first, visible only when active via CSS)
      const checkIcon = document.createElement('i');
      checkIcon.className = 'fas fa-check mf-opt-check';
      item.appendChild(checkIcon);

      // Flag (country only)
      if (key === 'country') {
        const code = this.getCountryCode(opt);
        if (code) {
          const flag = document.createElement('span');
          flag.className = `fi fi-${code} mf-opt-flag`;
          item.appendChild(flag);
        }
      }

      // Workshop icon
      if (key === 'workshops') {
        const iconClass = AppConfig.getWorkshopIcon(opt);
        if (iconClass) {
          const workshopIcon = document.createElement('i');
          workshopIcon.className = `${iconClass} mf-opt-workshop-icon`;
          item.appendChild(workshopIcon);
        }
      }

      // Style icon
      if (key === 'style') {
        const iconClass = AppConfig.getStyleIcon(opt);
        if (iconClass) {
          const styleIcon = document.createElement('i');
          styleIcon.className = `${iconClass} mf-opt-style-icon`;
          item.appendChild(styleIcon);
        }
      }

      // Door state icon
      if (key === 'doorState') {
        const iconClass = isDoorOpen ? AppConfig.icons.status.open : AppConfig.icons.status.closed;
        const doorIcon = document.createElement('i');
        doorIcon.className = `${iconClass} mf-opt-door-icon`;
        item.appendChild(doorIcon);
      }

      // Bookmark icon
      if (key === 'bookmarks') {
        const bookmarkIcon = document.createElement('i');
        bookmarkIcon.className = 'fas fa-bookmark mf-opt-bookmark-icon';
        item.appendChild(bookmarkIcon);
      }

      // Label text
      const label = document.createElement('span');
      label.textContent = this.translateValue(key, opt);
      item.appendChild(label);

      // Today marker for weekly filter
      if (key === 'weekly' && opt !== 'any' && parseInt(opt) === new Date().getDay()) {
        const todayDot = document.createElement('i');
        todayDot.className = 'fas fa-circle mf-opt-today-dot';
        item.appendChild(todayDot);
      }

      item.addEventListener('click', (e) => {
        // Bail out if the pane is already closing (this.sheet is null) or if the
        // ghost click coordinates land outside the still-visible sheet area.
        if (!this.sheet) return;
        const sheetEl = this.sheet.querySelector('.mf-sheet');
        if (sheetEl) {
          const r = sheetEl.getBoundingClientRect();
          if (e.clientY > r.bottom || e.clientY < r.top) return;
        }
        this._hasInteracted = true;
        const isCurrentlyActive = item.classList.contains('mf-opt-active');
        if (isCurrentlyActive) {
          // Toggle off
          appContext.searchHeader?.clearCategoryFilter(key);
          item.classList.remove('mf-opt-active');
          if (!section.querySelector('.mf-opt-active')) {
            title.classList.remove('mf-has-value');
          }
        } else {
          appContext.searchHeader?.selectCategoryOption(key, opt);
          section.querySelectorAll('.mf-opt-item').forEach(el => el.classList.remove('mf-opt-active'));
          item.classList.add('mf-opt-active');
          title.classList.add('mf-has-value');
        }
        this._resetAutoClose();
      });

      // Direct child of section — becomes a grid row in the unified grid
      section.appendChild(item);
      if (isActive || isUserCountry) activeItem = item;
    });

    if (activeItem) {
      requestAnimationFrame(() => activeItem.scrollIntoView({ block: 'nearest' }));
    }

    return section;
  }

  _resetAutoClose() {
    clearTimeout(this._autoCloseTimer);
    clearTimeout(this._toastTimer);
    this._toastTimer = null;
    this._clearClosingTip();
    const delay = this._hasInteracted ? 3500 : 7000;
    this._autoCloseTimer = setTimeout(() => this._startClosing(), delay);
  }

  _clearClosingTip() {
    this._closingTip?.remove();
    this._closingTip = null;
  }

  _startClosing() {
    if (!this.sheet) return;
    const pane = this.sheet.querySelector('.mf-sheet');
    if (pane) {
      const rect = pane.getBoundingClientRect();
      const tip = document.createElement('div');
      tip.className = 'mf-closing-tip';
      tip.textContent = window.i18n?.t('filter.closingPane') || '… closing filter pane …';
      tip.style.top = Math.round(rect.top + rect.height / 2) + 'px';
      document.body.appendChild(tip);
      this._closingTip = tip;
    }
    this._toastTimer = setTimeout(() => this.close(), 1750);
  }

  _navPrev() {
    if (!this._track) return;
    const sectionW = this._track.querySelector('.mf-section')?.offsetWidth || this._track.clientWidth;
    this._track.scrollBy({ left: -sectionW, behavior: 'smooth' });
    this._resetAutoClose();
  }

  _navNext() {
    if (!this._track) return;
    const sectionW = this._track.querySelector('.mf-section')?.offsetWidth || this._track.clientWidth;
    this._track.scrollBy({ left: sectionW, behavior: 'smooth' });
    this._resetAutoClose();
  }

  _onTrackScroll() {
    this._updateNavButtons();
  }

  // Build a real CSS Grid across all sections so horizontal borders align.
  // Phone: two 3-column tables stacked — second half on top, first half on bottom.
  // Tablet: one 6-column table in normal order.
  _applyUnifiedGrid(track) {
    const sections = Array.from(track.querySelectorAll('.mf-section'));
    const isPhone = window.matchMedia('(max-width: 767px)').matches && !this._isTablet();
    const numCols = isPhone ? 3 : sections.length;
    const numGroups = Math.ceil(sections.length / numCols);

    track.style.display = 'grid';
    track.style.gridTemplateColumns = `repeat(${numCols}, 1fr)`;

    // Sections become transparent to the grid — their children are placed directly
    sections.forEach(s => { s.style.display = 'contents'; });

    // Max rows per group
    const groupMaxRows = [];
    for (let g = 0; g < numGroups; g++) {
      let maxRows = 0;
      for (let c = 0; c < numCols; c++) {
        const s = sections[g * numCols + c];
        if (s) maxRows = Math.max(maxRows, s.children.length);
      }
      groupMaxRows.push(maxRows);
    }

    // Phone: second group on top (rows start at 0), first group below it.
    // Tablet: natural top-to-bottom order.
    const groupOffsets = new Array(numGroups);
    if (isPhone && numGroups === 2) {
      groupOffsets[1] = 0;
      groupOffsets[0] = groupMaxRows[1];
    } else {
      let offset = 0;
      for (let g = 0; g < numGroups; g++) {
        groupOffsets[g] = offset;
        offset += groupMaxRows[g];
      }
    }

    // Assign explicit grid-column and grid-row to every cell;
    // add white ghost cells to fill shorter columns so track bg stays hidden
    sections.forEach((section, i) => {
      const colIdx   = i % numCols;
      const groupIdx = Math.floor(i / numCols);
      const rowBase  = groupOffsets[groupIdx];
      Array.from(section.children).forEach((child, rowIdx) => {
        child.style.gridColumn = String(colIdx + 1);
        child.style.gridRow    = String(rowBase + rowIdx + 1);
      });

      const realRows = section.children.length;
      for (let r = realRows; r < groupMaxRows[groupIdx]; r++) {
        const ghost = document.createElement('div');
        ghost.className = 'mf-ghost-cell';
        ghost.style.gridColumn = String(colIdx + 1);
        ghost.style.gridRow    = String(rowBase + r + 1);
        ghost.style.background = 'var(--dropdown-bg)';
        ghost.style.height     = '32px';
        ghost.style.boxSizing  = 'border-box';
        track.appendChild(ghost);
      }
    });
  }

  _updateNavButtons() {
    if (!this._track || !this._prevBtn || !this._nextBtn) return;
    const { scrollLeft, scrollWidth, clientWidth } = this._track;
    this._prevBtn.disabled = scrollLeft <= 0;
    this._nextBtn.disabled = scrollLeft >= scrollWidth - clientWidth - 1;
  }

  translateValue(key, value) {
    if (key === 'bookmarks') return window.i18n?.t('filter.bookmarks') || 'Favoriten';
    // Delegate to SearchHeader's canonical translation (avoids duplication)
    return appContext.searchHeader?.translateFilterValue(key, value) ?? value;
  }

  updateChipBar() {
    const bar = document.getElementById('mobile-active-filters');
    if (!bar) return;

    const categories = this.getCategories();
    const activeEntries = Object.keys(categories)
      .map((key) => {
        const cfg = categories[key];
        const val = appContext.searchHeader?.getActiveFilterForCategory(key);
        return val ? { key, cfg, val } : null;
      })
      .filter(Boolean);

    if (!activeEntries.length || !this._isMobileUI()) {
      bar.style.display = 'none';
      bar.innerHTML = '';
    } else {
      bar.style.display = 'flex';
      bar.innerHTML = '';

      activeEntries.forEach(({ key, cfg, val }) => {
        const statusClass = key === 'doorState' ? ` mf-chip-${val}` : '';
        const countryCode = key === 'country' ? this.getCountryCode(val) : null;
        const specificIcon = appContext.searchHeader?.getFilterIcon(key, val);
        const iconHtml = countryCode
          ? `<span class="fi fi-${countryCode} mf-country-flag"></span>`
          : `<i class="${specificIcon || cfg.icon}"></i>`;

        const chip = document.createElement('span');
        chip.className = `mf-chip${statusClass}`;
        chip.dataset.key = key;
        chip.innerHTML = `${iconHtml} <span class="mf-chip-label">${this.translateValue(key, val)}</span><span class="mf-chip-remove" aria-label="Filter entfernen"><i class="fas fa-xmark"></i></span>`;

        chip.querySelector('.mf-chip-remove').addEventListener('click', e => {
          e.stopPropagation();
          appContext.searchHeader?.clearCategoryFilter(key);
          this.updateChipBar();
        });

        bar.appendChild(chip);
      });

      // Clear-all ganz rechts
      if (activeEntries.length >= 1) {
        const clearAll = document.createElement('span');
        clearAll.className = 'filter-pill filter-pill-clear-all mf-clear-all-btn';
        clearAll.setAttribute('role', 'tooltip');
        clearAll.setAttribute('data-microtip-position', 'top-left');
        clearAll.setAttribute('aria-label', window.i18n?.t('filter.clearAll') || 'clear all filters');
        clearAll.innerHTML = `<i class="${AppConfig.icons.ui.close}"></i>`;
        clearAll.addEventListener('click', e => {
          e.stopPropagation();
          appContext.searchHeader?.clearAllFilters();
          this.updateChipBar();
        });
        bar.appendChild(clearAll);
      }
    }

    // Inline-Indicator in der Search-Input-Row
    const indicator = document.getElementById('filter-active-indicator');
    if (indicator) {
      if (activeEntries.length > 0) {
        const first = activeEntries[0];
        const more = activeEntries.length > 1 ? `<span class="fi-more">+${activeEntries.length - 1}</span>` : '';
        indicator.innerHTML =
          `<i class="${first.cfg.icon}"></i>` +
          `<span class="fi-cat">${first.cfg.label}</span>` +
          `<span class="fi-sep">|</span>` +
          `<span class="fi-val">${this.translateValue(first.key, first.val)}</span>` +
          more;
        indicator.classList.add('has-filters');
        indicator.onclick = () => this.open();
      } else {
        indicator.innerHTML = '';
        indicator.classList.remove('has-filters');
        indicator.onclick = null;
      }
    }
  }

  // Laufende Nummer unten rechts in jedem Item-Badge (nur Mobile)
  _updateItemNumbers(dropdown) {
    if (!this._isMobileUI()) return;
    const items = dropdown.querySelectorAll('.listing-item');
    items.forEach((item, i) => {
      let num = item.querySelector('.item-number');
      if (!num) {
        num = document.createElement('span');
        num.className = 'item-number';
        item.appendChild(num);
      }
      num.textContent = i + 1;
    });
  }

  // Scroll-Snapping + Border-Radius:
  // Phone: 2x2
  // Tablet Portrait: 4x4 (16 Items)
  // Tablet Landscape: 3x5 (15 Items)
  applyGridSnapping(dropdown) {
    if (!this._isMobileUI()) return;

    // Bestehende Ghost-Items entfernen
    dropdown.querySelectorAll('.mf-ghost-item').forEach(el => el.remove());

    const isTablet = this._isTablet();
    const isLandscape = isTablet && window.matchMedia('(orientation: landscape)').matches;

    let cols, rowsPerPage;

    if (isTablet) {
      if (isLandscape) {
        cols = 5;         // 5 Spalten
        rowsPerPage = 3;  // 3 Zeilen
      } else {
        cols = 4;         // 4 Spalten
        rowsPerPage = 4;  // 4 Zeilen
      }
    } else {
      // Phone Default
      cols = 2;
      rowsPerPage = 2;
    }

    const itemsPerPage = cols * rowsPerPage;
    const rowH = 58;
    const items = Array.from(dropdown.querySelectorAll('.listing-item'));
    const n = items.length;

    // Letzte Zeile mit Ghost-Items auffüllen
    const remainder = n % cols;
    const ghostCount = remainder === 0 ? 0 : cols - remainder;
    for (let g = 0; g < ghostCount; g++) {
      const ghost = document.createElement('div');
      ghost.className = 'mf-ghost-item';
      ghost.style.height = rowH + 'px';
      ghost.style.background = '#555';
      ghost.style.boxSizing = 'border-box';
      dropdown.appendChild(ghost);
    }

    // Alle Items (real + ghost) für Border-/Radius-Berechnung
    const allItems = Array.from(dropdown.querySelectorAll('.listing-item, .mf-ghost-item'));
    const total = allItems.length;
    const lastRowIdx = total > 0 ? Math.floor((total - 1) / cols) : 0;

    allItems.forEach((item, i) => {
      // Reset styles
      item.style.borderRadius = '0';
      item.style.border = 'none';

      // Snapping nur für reale Items
      if (!item.classList.contains('mf-ghost-item')) {
        item.style.scrollSnapAlign = (i % itemsPerPage === 0) ? 'start' : 'none';
        item.style.scrollSnapStop = (i % itemsPerPage === 0) ? 'always' : 'normal';
      }

      // Innere Borders: rechts außer in der letzten Spalte, unten außer in der letzten Zeile
      if (i % cols !== cols - 1) {
        item.style.borderRight = '1px solid white';
      }
      if (Math.floor(i / cols) !== lastRowIdx) {
        item.style.borderBottom = '1px solid white';
      }
    });

    // Abrundung der Ecken des Gesamt-Grids
    if (total >= 1) {
      allItems[0].style.borderTopLeftRadius = '12px';
      allItems[Math.min(total, cols) - 1].style.borderTopRightRadius = '12px';

      const lastRowStart = Math.floor((total - 1) / cols) * cols;
      allItems[lastRowStart].style.borderBottomLeftRadius = '12px';

      // Letzte Zeile ist immer voll → unten rechts immer runden
      allItems[total - 1].style.borderBottomRightRadius = '12px';
    }

    // Container-Höhe auf exakt die Anzahl der Zeilen fixieren
    if (total > 0) {
      dropdown.style.maxHeight = (rowsPerPage * rowH) + 'px';
    }
  }
}

export { MobileFilterUI };
