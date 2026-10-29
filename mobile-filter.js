import AppConfig from './config.js';
import { appContext } from './app-context.js';
import { todayWeekday } from './date-utils.js';
import { isMobileUI, isTablet, isPhone } from './layout-mode.js';
import { DropdownPager } from './dropdown-pager.js';

class MobileFilterUI {
  constructor() {
    this.sheet = null;
    this._autoCloseTimer = null;
    this._toastTimer = null;
    this._resizeHandler = null;
    this._hasInteracted = false;
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
    // Phone: Lupe in der Nav-Spalte (öffnet Eingabezeile + Filter-Pane); Tablet/Desktop: Filter-Button
    for (const id of ['filter-toggle-btn', 'search-open-btn']) {
      document.getElementById(id)
        ?.addEventListener('click', () => this.sheet ? this.close() : this.open());
    }

    // Treffer gewählt → Pane + Tastatur weg, Karte sichtbar
    document.getElementById('suggestions-dropdown')
      ?.addEventListener('click', e => { if (this.sheet && e.target.closest('.listing-item')) this.close(); });

    // Map-Bottom dynamisch an Search-Container anpassen (Mobile)
    const searchContainer = document.querySelector('.search-container');
    if (searchContainer) {
      let mapResizeFrame = 0;
      const updateMapBottom = () => {
        document.documentElement.style.setProperty('--mobile-ui-height', searchContainer.offsetHeight + 'px');
        this._positionSheet(); // Pane sitzt direkt über dem Container (Höhe ändert sich mit der Eingabezeile)
        // #map folgt `bottom: var(--mobile-ui-height)`: Leaflet muss die neue Containergröße kennen,
        // sonst rechnen fitBounds/GL-Canvas mit der alten Höhe (beim Start 844 statt 655px).
        cancelAnimationFrame(mapResizeFrame);
        mapResizeFrame = requestAnimationFrame(() => appContext.map?.invalidateSize());
      };
      updateMapBottom();
      new ResizeObserver(updateMapBottom).observe(searchContainer);

      // Android: Keyboard open/close changes visualViewport — Leaflet canvas muss neu berechnet werden
      // sonst bleibt ein schwarzer Streifen rechts (Canvas-Breite stimmt nicht mit Container überein)
      if ('ontouchstart' in window && window.visualViewport) {
        window.visualViewport.addEventListener('resize', updateMapBottom);
      }
    }

    // Seitenweises Blättern, Snap-Grid, Item-Nummern, Hoch/Runter-Buttons
    this.pager = new DropdownPager();
    this.pager.init();
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

    // Suche offen: das Pane (z-index 10001) liegt über der Liste; auf Phone sitzt die Eingabezeile ganz unten im Pane.
    // Kein Auto-Fokus: Tastatur erst beim Tippen ins Feld.
    document.querySelector('.search-container')?.classList.add('search-open');
    if (isPhone()) this._moveInputRowIntoSheet();
    this.sheet.style.left  = '0';
    this.sheet.style.right = '0';
    this._positionSheet();

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
      const container = document.querySelector('.search-container');
      if (this.sheet && !this.sheet.contains(e.target) && !container?.contains(e.target) && !filterBtn?.contains(e.target)) this.close();
    };
    setTimeout(() => document.addEventListener('pointerdown', this._outsideHandler), 0);

    // Orientierungswechsel (Breite ändert sich) → schließen. Höhenänderungen (Tastatur) schließen NICHT.
    const openWidth = window.innerWidth;
    this._resizeHandler = () => { if (window.innerWidth !== openWidth) this.close(); };
    window.addEventListener('resize', this._resizeHandler);

    document.querySelector('#filter-toggle-btn i')?.setAttribute('class', 'fas fa-angle-down');
    document.querySelector('#search-open-btn i')?.setAttribute('class', 'fas fa-angle-down');

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
    document.querySelector('#search-open-btn i')?.setAttribute('class', 'fas fa-magnifying-glass');

    this._restoreInputRow(); // vor dem Slide-out: die Zeile darf nicht mit dem Overlay entfernt werden
    document.querySelector('.search-container')?.classList.remove('search-open');
    document.getElementById('search-bar')?.blur(); // Tastatur weg

    this.updateChipBar();
  }

  _moveInputRowIntoSheet() {
    this._inputRow = document.querySelector('.search-input-row');
    if (this._inputRow) this.sheet.appendChild(this._inputRow);
  }

  _restoreInputRow() {
    if (!this._inputRow) return;
    document.querySelector('.search-container')?.prepend(this._inputRow);
    this._inputRow = null;
  }

  /**
   * Pane-Unterkante: Phone = unterer Rand (die Eingabezeile sitzt im Pane); Tablet = Oberkante der Eingabezeile
   * (sie bleibt im Container). Das Pane überdeckt in beiden Fällen die Liste (z-Achse).
   */
  _positionSheet() {
    if (!this.sheet) return;
    if (isPhone()) { this.sheet.style.bottom = '0'; return; }
    const rect = document.querySelector('.search-input-row')?.getBoundingClientRect();
    this.sheet.style.bottom = (rect ? window.innerHeight - rect.top : 44) + 'px';
  }

  _setupDragToClose(panel) {
    let startY = 0, startX = 0, currentY = 0, isDragging = false;

    const onStart = (e) => {
      const t = e.touches[0];
      startY = t.clientY; startX = t.clientX;
      currentY = 0; isDragging = false;
    };

    const onMove = (e) => {
      const t = e.touches[0];
      const dy = t.clientY - startY;
      const dx = t.clientX - startX;

      if (isDragging) {
        currentY = dy;
        panel.style.transform = `translateY(${currentY}px)`;
        e.preventDefault();
        return;
      }

      // Decide direction as early as possible — call preventDefault before iOS claims the touch
      if (Math.abs(dy) < 4 && Math.abs(dx) < 4) return;
      if (Math.abs(dx) >= Math.abs(dy) || dy <= 0) return; // horizontal or upward → ignore

      isDragging = true;
      currentY = dy;
      panel.style.transition = 'none';
      panel.style.transform = `translateY(${currentY}px)`;
      e.preventDefault();
    };

    const onEnd = () => {
      if (!isDragging) return;
      isDragging = false;

      if (currentY > Math.min(80, panel.offsetHeight * 0.3)) {
        panel.style.transition = '';
        panel.style.transform = '';
        this.close();
      } else {
        panel.style.transition = 'transform 0.25s ease-out';
        panel.style.transform = '';
        panel.addEventListener('transitionend', () => { panel.style.transition = ''; }, { once: true });
      }
      currentY = 0;
    };

    panel.addEventListener('touchstart', onStart, { passive: true });
    panel.addEventListener('touchmove', onMove, { passive: false });
    panel.addEventListener('touchend', onEnd, { passive: true });
    panel.addEventListener('touchcancel', onEnd, { passive: true });
  }

  buildSheet() {
    const overlay = document.createElement('div');
    overlay.className = 'mf-overlay';

    const panel = document.createElement('div');
    panel.className = 'mf-sheet';

    this._setupDragToClose(panel);

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
      if (key === 'weekly' && opt !== 'any' && parseInt(opt) === todayWeekday()) {
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
    // Bei geöffneter Suche (Eingabezeile sichtbar) bleibt das Pane offen, bis es geschlossen wird
    if (document.querySelector('.search-container.search-open')) return;
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
    const isPhone = isPhone() && !isTablet();
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

    if (!activeEntries.length || !isMobileUI()) {
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
}

export { MobileFilterUI };
