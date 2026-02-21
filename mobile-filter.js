'use strict';

class MobileFilterUI {
  constructor() {
    this.selectedCategory = null;
    this.sheet = null;
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
      ?.addEventListener('click', () => this.scrollDropdown(-1));
    document.getElementById('dropdown-nav-down')
      ?.addEventListener('click', () => this.scrollDropdown(1));

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
      new MutationObserver(() => this.applyGridSnapping(dropdown))
        .observe(dropdown, { childList: true, subtree: false });

      // Maus-Wheel → Snap-Pages auf Mobile
      dropdown.addEventListener('wheel', (e) => {
        if (window.innerWidth > 767) return;
        e.preventDefault();
        this.scrollDropdown(e.deltaY > 0 ? 1 : -1);
      }, { passive: false });
    }
  }

  scrollDropdown(direction) {
    const dropdown = document.getElementById('suggestions-dropdown');
    if (!dropdown) return;
    const pageH = 116; // 2 Zeilen × 512px (kein gap)
    const page = Math.round(dropdown.scrollTop / pageH);
    dropdown.scrollTo({ top: Math.max(0, page + direction) * pageH, behavior: 'smooth' });
  }

  getCategories() {
    return {
      style:     { icon: 'fas fa-people-group',       label: window.i18n?.t('filter.style')     || 'Style' },
      doorState: { icon: 'fas fa-door-open',          label: window.i18n?.t('filter.status')    || 'Status' },
      weekly:    { icon: 'fas fa-calendar-day',       label: window.i18n?.t('filter.weekly')    || 'Meeting' },
      workshops: { icon: 'fas fa-screwdriver-wrench', label: window.i18n?.t('filter.workshops') || 'Werkstätten' },
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
  }

  close() {
    this.sheet?.remove();
    this.sheet = null;
    this.updateChipBar();
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

    bar.innerHTML = chips.join('');
    bar.style.display = chips.length ? 'flex' : 'none';

    bar.querySelectorAll('.mf-chip').forEach(chip => {
      chip.querySelector('.mf-chip-remove').addEventListener('click', e => {
        e.stopPropagation();
        window.app?.searchHeader?.clearCategoryFilter(chip.dataset.key);
        this.updateChipBar();
      });
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

  // Scroll-Snapping + Border-Radius: erste/letzte Items im 2-Spalten-Grid
  applyGridSnapping(dropdown) {
    if (window.innerWidth > 767) return; // Desktop: nicht eingreifen
    const items = Array.from(dropdown.querySelectorAll('.listing-item'));
    const n = items.length;

    const lastRowIdx = Math.floor((n - 1) / 2); // 0-basierter Index der letzten Zeile

    items.forEach((item, i) => {
      item.style.borderRadius = '0';
      item.style.scrollSnapAlign = (i % 4 === 0) ? 'start' : 'none';

      // Nur innere Borders: rechts nur linke Spalte, unten nur nicht-letzte Zeile
      item.style.border = 'none';
      if (i % 2 === 0) item.style.borderRight = '1px solid white';
      if (Math.floor(i / 2) !== lastRowIdx) item.style.borderBottom = '1px solid white';
    });

    // Obere Ecken (erste Zeile)
    if (n >= 1) items[0].style.borderTopLeftRadius = '12px';
    if (n >= 2) items[1].style.borderTopRightRadius = '12px';

    // Untere Ecken (letzte Zeile)
    if (n >= 1) {
      const lastCol = (n - 1) % 2;
      if (lastCol === 1) {
        // gerade Anzahl: letztes rechts, vorletztes links
        items[n - 1].style.borderBottomRightRadius = '12px';
        if (n >= 2) items[n - 2].style.borderBottomLeftRadius = '12px';
      } else {
        // ungerade Anzahl: letztes ist allein links
        items[n - 1].style.borderBottomLeftRadius = '12px';
      }
    }

    // max-height auf genau 2 Zeilen fixieren
    const rowH = 58;
    if (n > 0) dropdown.style.maxHeight = (2 * rowH) + 'px';
  }
}

window.MobileFilterUI = MobileFilterUI;
