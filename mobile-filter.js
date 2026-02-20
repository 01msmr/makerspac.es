'use strict';

class MobileFilterUI {
  constructor() {
    this.selectedCategory = null;
    this.sheet = null;
  }

  init() {
    document.getElementById('filter-toggle-btn')
      ?.addEventListener('click', () => this.open());

    document.getElementById('dropdown-nav-up')
      ?.addEventListener('click', () => this.scrollDropdown(-1));
    document.getElementById('dropdown-nav-down')
      ?.addEventListener('click', () => this.scrollDropdown(1));

    // Grid-Snapping auf Dropdown-Items setzen wenn Inhalt sich ändert
    const dropdown = document.getElementById('suggestions-dropdown');
    if (dropdown) {
      new MutationObserver(() => this.applyGridSnapping(dropdown))
        .observe(dropdown, { childList: true, subtree: false });
    }
  }

  scrollDropdown(direction) {
    const dropdown = document.getElementById('suggestions-dropdown');
    if (dropdown) {
      const pageH = 116; // 2 Zeilen × 58px (kein gap)
      dropdown.scrollBy({ top: direction * pageH, behavior: 'smooth' });
    }
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

  open() {
    if (this.sheet) return;
    this.selectedCategory = null;
    this.sheet = this.buildSheet();
    document.body.appendChild(this.sheet);
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
    overlay.appendChild(panel);
    return overlay;
  }

  renderCategories(container) {
    container.innerHTML = '';
    Object.entries(this.getCategories()).forEach(([key, cfg]) => {
      const active = window.app?.searchHeader?.getActiveFilterForCategory(key);
      const activeLabel = active ? this.translateValue(key, active) : null;

      const item = document.createElement('div');
      item.className = 'mf-cat-item'
        + (this.selectedCategory === key ? ' mf-selected' : '')
        + (active ? ' mf-has-value' : '');
      item.innerHTML = `
        <i class="${cfg.icon}"></i>
        <span class="mf-cat-label">
          <span class="mf-cat-name">${cfg.label}</span>
          ${activeLabel ? `<span class="mf-cat-value">${activeLabel}</span>` : ''}
        </span>`;

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

    const clear = document.createElement('div');
    clear.className = 'mf-opt-item mf-opt-clear';
    clear.textContent = '–';
    clear.addEventListener('click', () => {
      window.app?.searchHeader?.clearCategoryFilter(key);
      this.close();
    });
    container.appendChild(clear);

    options.forEach(opt => {
      const item = document.createElement('div');
      item.className = 'mf-opt-item' + (opt === activeValue ? ' mf-opt-active' : '');
      item.textContent = this.translateValue(key, opt);
      item.addEventListener('click', () => {
        window.app?.searchHeader?.selectCategoryOption(key, opt);
        this.close();
      });
      container.appendChild(item);
    });
  }

  translateValue(key, value) {
    if (key === 'weekly') {
      if (value === 'any') return window.i18n?.t('weekly.any') || 'Beliebig';
      const days = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
      return days[parseInt(value)] || value;
    }
    if (key === 'workshops') return window.i18n?.t('workshops.' + value) || value;
    if (key === 'style')     return window.i18n?.t('styles.' + value)    || value;
    if (key === 'doorState') return value === 'open' ? 'Offen' : 'Geschlossen';
    if (key === 'bookmarks') return window.i18n?.t('filter.bookmarks') || 'Favoriten';
    return value;
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
      return `<span class="mf-chip${statusClass}" data-key="${key}">
        <i class="${cfg.icon}"></i> ${this.translateValue(key, val)}
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

  // Scroll-Snapping: jede 2×2-Gruppe bekommt einen Snap-Punkt (nur Mobile)
  applyGridSnapping(dropdown) {
    if (window.innerWidth > 767) return; // Desktop: nicht eingreifen
    const items = Array.from(dropdown.querySelectorAll('.listing-item'));
    items.forEach((item, i) => {
      item.style.scrollSnapAlign = (i % 4 === 0) ? 'start' : '';
    });
    // max-height auf genau 2 Zeilen fixieren (inline style wird von adjustDropdownHeight gesetzt)
    const rowH = 58; // px, muss mit CSS grid-auto-rows übereinstimmen
    if (items.length > 0) {
      dropdown.style.maxHeight = (2 * rowH) + 'px'; // 116px, kein gap
    }
  }
}

window.MobileFilterUI = MobileFilterUI;
