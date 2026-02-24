'use strict';

class MobileFilterUI {
  constructor() {
    this.selectedCategory = null;
    this.sheet = null;
    this._navClickCounts = { up: 0, down: 0 };
    this._navClickTimers = { up: null, down: null };
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
      style:     { icon: 'fas fa-people-group',       label: window.i18n?.t('filter.style')     || 'Style' },
      doorState: { icon: 'fas fa-door-open',          label: window.i18n?.t('filter.status')    || 'Status' },
      weekly:    { icon: 'fas fa-calendar-day',       label: window.i18n?.t('filter.weekly')    || 'Meeting' },
      workshops: { icon: 'fas fa-wrench', label: window.i18n?.t('filter.workshops') || 'Werkstätten' },
      country:   { icon: 'fas fa-flag',               label: window.i18n?.t('filter.country')   || 'Land' },
      bookmarks: { icon: 'fas fa-bookmark',           label: window.i18n?.t('filter.bookmarks') || 'Favoriten' },
    };
  }

  getOptions(key) {
    const fc = window.AppConfig?.filterCategories;
    if (key === 'weekly')    return [...(fc?.weekly?.options || []), 'any'];
    if (key === 'country')   return window.app?.searchFilter?.getUniqueCountries?.() || [];
    if (key === 'bookmarks') return ['bookmarked'];
    return fc?.[key]?.options || [];
  }

  // Ermittelt das Land des Nutzers anhand der Browser-Sprache
  getUserCountry() {
    const available = window.app?.searchFilter?.getUniqueCountries?.() || [];
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
    const code = window.AppConfig?.getCountryCode?.(countryName);
    return (!code || code === 'un') ? null : code;
  }

  open() {
    if (this.sheet) return;

    // Starte mit aktiver Filter-Kategorie, sonst mit Länder-Filter
    const activeCategory = Object.keys(this.getCategories()).find(key =>
      key !== 'bookmarks' && window.app?.searchHeader?.getActiveFilterForCategory(key)
    );
    this.selectedCategory = activeCategory || 'country';

    this.sheet = this.buildSheet();
    document.body.appendChild(this.sheet);

    // Overlay-Unterkante dynamisch über Searchbar + Chip-Bar positionieren
    const searchRow = document.querySelector('.search-input-row');
    const chipBar   = document.getElementById('mobile-active-filters');
    const rowH  = searchRow?.offsetHeight || 36;
    const chipH = (chipBar && chipBar.style.display !== 'none') ? chipBar.offsetHeight : 0;
    const safeArea = parseFloat(getComputedStyle(document.documentElement).paddingBottom) || 0;
    this.sheet.style.bottom = (rowH + chipH + safeArea) + 'px';

    this.sheet.addEventListener('click', e => {
      if (e.target === this.sheet) this.close();
    });

    // Außerhalb tippen → schließen (Filter-Button ausgenommen: der handled toggle selbst)
    this._outsideHandler = (e) => {
      const filterBtn = document.getElementById('filter-toggle-btn');
      if (this.sheet && !this.sheet.contains(e.target) && !filterBtn?.contains(e.target)) this.close();
    };
    setTimeout(() => document.addEventListener('pointerdown', this._outsideHandler), 0);
  }

  close() {
    document.removeEventListener('pointerdown', this._outsideHandler);
    this._outsideHandler = null;
    this.sheet?.remove();
    this.sheet = null;
    this.updateChipBar();
    document.querySelector('.search-container')?.classList.remove('bar-focused');
  }

  buildSheet() {
    const overlay = document.createElement('div');
    overlay.className = 'mf-overlay';

    const panel = document.createElement('div');
    panel.className = 'mf-sheet';
    panel.innerHTML = '<div class="mf-categories"></div><div class="mf-options"></div>';

    this.renderCategories(panel.querySelector('.mf-categories'));

    // Optionen sofort für die vorgewählte Kategorie anzeigen
    if (this.selectedCategory) {
      this.renderOptions(panel.querySelector('.mf-options'), this.selectedCategory);
    }

    overlay.appendChild(panel);
    return overlay;
  }

  renderCategories(container) {
    container.innerHTML = '';
    Object.entries(this.getCategories()).forEach(([key, cfg]) => {
      const active = window.app?.searchHeader?.getActiveFilterForCategory(key);

      const item = document.createElement('div');
      item.className = 'mf-cat-item'
        + (this.selectedCategory === key ? ' mf-selected' : '')
        + (active ? ' mf-has-value' : '');
      // Kein activeLabel mehr – aktiver Wert steht in der Options-Spalte
      item.innerHTML = `
        <i class="${cfg.icon}"></i>
        <span class="mf-cat-name">${cfg.label}</span>`;

      item.addEventListener('click', () => {
        // Bookmarks: direkt toggling, keine zweite Ebene
        if (key === 'bookmarks') {
          const isActive = window.app?.searchHeader?.getActiveFilterForCategory('bookmarks');
          if (isActive) {
            window.app?.searchHeader?.clearCategoryFilter('bookmarks');
          } else {
            window.app?.searchHeader?.selectCategoryOption('bookmarks', 'bookmarked');
          }
          this.close();
          return;
        }
        this.selectedCategory = key;
        this.renderCategories(container);
        const sheet = container.closest('.mf-sheet');
        this.renderOptions(sheet.querySelector('.mf-options'), key);
      });
      container.appendChild(item);
    });
  }

  renderOptions(oldContainer, key) {
    // Frisches Element erstellen – altes komplett ersetzen
    const container = document.createElement('div');
    container.className = 'mf-options';
    oldContainer.replaceWith(container);

    const options = this.getOptions(key);
    const activeValue = window.app?.searchHeader?.getActiveFilterForCategory(key);

    // Ggf. User-Land vormarkieren (nur bei country ohne aktiven Filter)
    const userCountry = (key === 'country' && !activeValue) ? this.getUserCountry() : null;

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

      // Bei Country: Flagge als fi fi-XX Icon im Kreis voranstellen
      if (key === 'country') {
        const code = this.getCountryCode(opt);
        const flagHtml = code
          ? `<span class="fi fi-${code} mf-opt-flag"></span> `
          : '';
        item.innerHTML = flagHtml + this.translateValue(key, opt);
      } else {
        item.textContent = this.translateValue(key, opt);
      }
      item.addEventListener('click', () => {
        window.app?.searchHeader?.selectCategoryOption(key, opt);
        this.close();
      });
      container.appendChild(item);

      // Zum aktiven oder User-Land-Eintrag scrollen
      if (isActive || isUserCountry) {
        requestAnimationFrame(() => item.scrollIntoView({ block: 'nearest' }));
      }
    });
  }

  translateValue(key, value) {
    if (key === 'bookmarks') return window.i18n?.t('filter.bookmarks') || 'Favoriten';
    // Delegate to SearchHeader's canonical translation (avoids duplication)
    return window.app?.searchHeader?.translateFilterValue(key, value) ?? value;
  }

  updateChipBar() {
    const bar = document.getElementById('mobile-active-filters');
    if (!bar) return;

    const activeEntries = Object.entries(this.getCategories())
      .map(([key, cfg]) => {
        const val = window.app?.searchHeader?.getActiveFilterForCategory(key);
        return val ? { key, cfg, val } : null;
      })
      .filter(Boolean);

    // Chip-Bar (unter der Searchbar)
    const chips = activeEntries.map(({ key, cfg, val }) => {
      const statusClass = key === 'doorState' ? ` mf-chip-${val}` : '';
      const countryCode = key === 'country' ? this.getCountryCode(val) : null;
      const iconHtml = countryCode
        ? `<span class="fi fi-${countryCode} mf-country-flag"></span>`
        : `<i class="${cfg.icon}"></i>`;
      return `<span class="mf-chip${statusClass}" data-key="${key}">
        ${iconHtml} ${this.translateValue(key, val)}
        <span class="mf-chip-remove" aria-label="Filter entfernen">×</span>
      </span>`;
    });

    const clearAllHtml = chips.length > 0
      ? `<span class="filter-pill filter-pill-clear-all mf-clear-all-btn" role="tooltip"
             data-microtip-position="top-left"
             aria-label="${window.i18n?.t('filter.clearAll') || 'clear all filters'}">
           <i class="${window.AppConfig?.icons?.ui?.close || 'fas fa-xmark'}"></i>
         </span>`
      : '';

    bar.innerHTML = chips.join('') + clearAllHtml;
    bar.style.display = (chips.length && this._isMobileUI()) ? 'flex' : 'none';

    bar.querySelectorAll('.mf-chip').forEach(chip => {
      chip.querySelector('.mf-chip-remove').addEventListener('click', e => {
        e.stopPropagation();
        window.app?.searchHeader?.clearCategoryFilter(chip.dataset.key);
        this.updateChipBar();
      });
    });

    bar.querySelector('.mf-clear-all-btn')?.addEventListener('click', e => {
      e.stopPropagation();
      window.app?.searchHeader?.clearAllFilters();
      this.updateChipBar();
    });

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
      ghost.style.background = '#555555';
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

window.MobileFilterUI = MobileFilterUI;
