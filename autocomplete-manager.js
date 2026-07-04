// @ts-check
// autocomplete-manager.js - AutocompleteManager

/** @typedef {import('./types.js').MakerSpace} MakerSpace */
/** @typedef {import('./types.js').Pill} Pill */

// ═══════════════════════════════════════════════════════════════════════════════
// AUTOCOMPLETE MANAGER
// Smart Autocomplete mit Filter-Integration
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Autocomplete-Dropdown unterhalb der Suchleiste.
 * Schlägt Städte, PLZ und Filter-Optionen vor (max. 5 Einträge).
 * Tab/Enter wählt aus; Escape schließt.
 */
class AutocompleteManager {
  /**
   * @param {MakerSpace[]} json - Alle Makerspace-Einträge
   * @param {HTMLInputElement} searchBar - Das #search-bar Input-Element
   * @param {import('./search-filter.js').SearchFilter} styleFilterManager
   */
  constructor(json, searchBar, styleFilterManager) {
    this.json = json;
    this.searchBar = searchBar;
    this.styleFilterManager = styleFilterManager;
    this.container = this.createContainer();
    this.suggestions = [];
    this.focusedIndex = -1;
    this.onSelectCallback = null;
    this.minChars = 2;

    // Pre-build city index once — never changes at runtime
    /** @type {Map<string, number>} */
    this._cityIndex = new Map();
    json.forEach(loc => {
      const city = loc.loc?.city;
      if (city && city !== 'CITY_CITY')
        this._cityIndex.set(city, (this._cityIndex.get(city) || 0) + 1);
    });

    this.initializeEventListeners();
  }

  createContainer() {
    const container = document.createElement('div');
    container.className = 'autocomplete-container';
    container.id = 'autocomplete-container';
    this.searchBar.parentElement.insertBefore(container, this.searchBar.parentElement.firstChild);
    return container;
  }

  /**
   * Generiert Autocomplete-Vorschläge für den gegebenen Query-String.
   * Verbirgt das Dropdown wenn < minChars Zeichen oder keine Treffer.
   * @param {string} query
   */
  generateSuggestions(query) {
    if (this.searchBar.value.endsWith(' ') || query.length < this.minChars) {
      this.hide();
      return;
    }

    query = query.toLowerCase().trim();
    const suggestions = [];

    this._cityIndex.forEach((count, city) => {
      if (city.toLowerCase().startsWith(query)) {
        const specificity = query.length / city.length;
        suggestions.push({ text: city, type: 'city', count, sortKey: specificity * 10 + count });
      }
    });

    suggestions.sort((a, b) => {
      if (b.sortKey !== a.sortKey) return b.sortKey - a.sortKey;
      return a.text.localeCompare(b.text, undefined, { sensitivity: 'base' });
    });
    this.suggestions = suggestions.slice(0, 8);

    if (this.suggestions.length > 0) {
      this.render();
    } else {
      this.hide();
    }
  }

  render() {
    this.container.innerHTML = '';

    this.suggestions.forEach((suggestion, index) => {
      const pill = document.createElement('div');
      pill.className = 'autocomplete-pill';
      pill.dataset.index = String(index);
      pill.setAttribute('role', 'option');
      pill.setAttribute('aria-selected', 'false');

      let html = `<span>${suggestion.text}</span>`;
      if (suggestion.count > 1 && suggestion.count !== undefined) {
        html += `<span class="count-badge">${suggestion.count}</span>`;
      }
      pill.innerHTML = html;

      pill.addEventListener('click', () => this.selectSuggestion(index));
      pill.addEventListener('mouseenter', () => this.setFocus(index));

      this.container.appendChild(pill);
    });

    this.show();
    this.focusedIndex = -1;
    this.container.setAttribute('role', 'listbox');
  }

  setFocus(index) {
    if (this.focusedIndex >= 0 && this.focusedIndex < this.container.children.length) {
      const oldPill = this.container.children[this.focusedIndex];
      if (oldPill) {
        oldPill.classList.remove('focused');
        oldPill.setAttribute('aria-selected', 'false');
      }
    }

    this.focusedIndex = index;

    if (this.focusedIndex >= 0 && this.focusedIndex < this.container.children.length) {
      const newPill = this.container.children[this.focusedIndex];
      if (newPill) {
        newPill.classList.add('focused');
        newPill.setAttribute('aria-selected', 'true');
      }
    }
  }

  /**
   * Wählt einen Vorschlag aus — fügt Filter-Pill hinzu oder ruft onSelectCallback auf.
   * @param {number} [index] - Index in this.suggestions; Fallback auf focusedIndex
   */
  selectSuggestion(index) {
    if (index === undefined) index = this.focusedIndex;

    if (index >= 0 && index < this.suggestions.length) {
      const suggestion = this.suggestions[index];

      if (suggestion.type === 'style' || suggestion.type === 'status') {
        this.activateFilter(suggestion);
        this.searchBar.value = '';
      } else {
        if (this.onSelectCallback) {
          this.onSelectCallback(suggestion);
        }
      }

      this.hide();
      const isMobile = window.matchMedia('(max-width: 1024px), (min-width: 768px) and (pointer: coarse)').matches;
      if (!isMobile) this.searchBar.focus();
    }
  }

  activateFilter(suggestion) {
    if (!this.styleFilterManager) {
      console.warn('StyleFilterManager not available');
      return;
    }

    const filterKey = suggestion.filterKey || suggestion.text;

    if (!this.styleFilterManager.selectedStyles.has(filterKey)) {
      this.styleFilterManager.selectedStyles.add(filterKey);
    }

    this.styleFilterManager.applyFilters();
    (/** @type {any} */ (this.styleFilterManager)).updateCounter?.();

    window.app?.searchHeader?.createActiveFiltersSection?.();
  }

  show() {
    this.container.classList.add('is-active');
  }

  hide() {
    this.container.classList.remove('is-active');
    this.suggestions = [];
    this.focusedIndex = -1;
  }

  isActive() {
    return this.container.classList.contains('is-active');
  }

  /**
   * Registriert einen Callback für Stadt/PLZ-Auswahl (nicht für Style/Status-Filter).
   * @param {function(Pill): void} callback
   */
  onSelect(callback) {
    this.onSelectCallback = callback;
  }

  initializeEventListeners() {
    let lastInputTime = 0;
    this.searchBar.addEventListener('input', (e) => {
      lastInputTime = Date.now();
      setTimeout(() => {
        if (Date.now() - lastInputTime >= 150) {
          this.generateSuggestions(/** @type {HTMLInputElement} */ (e.target).value);
        }
      }, 150);
    });

    this.searchBar.addEventListener('keydown', (e) => {
      if (!this.isActive()) return;

      const numSuggestions = this.suggestions.length;

      if (e.code === 'Tab') {
        e.preventDefault();
        if (numSuggestions === 0) return;
        if (numSuggestions === 1) {
          this.selectSuggestion(0);
          return;
        }

        let newIndex;
        if (e.shiftKey) {
          newIndex = this.focusedIndex <= 0 ? numSuggestions - 1 : this.focusedIndex - 1;
        } else {
          newIndex = this.focusedIndex >= numSuggestions - 1 ? 0 : this.focusedIndex + 1;
        }
        this.setFocus(newIndex);
      } else if (e.code === 'Enter' || e.code === 'Space') {
        if (numSuggestions === 0) return;
        const indexToSelect = (this.focusedIndex === -1 && numSuggestions === 1) ? 0 : this.focusedIndex;
        if (indexToSelect >= 0) {
          this.selectSuggestion(indexToSelect);
          e.preventDefault();
        }
      } else if (e.code === 'Escape') {
        e.preventDefault();
        this.hide();
      }
    });

    // Verhindert blur auf searchBar beim Tippen auf einen Vorschlag
    this.container.addEventListener('mousedown', (e) => {
      e.preventDefault();
    });

    document.addEventListener('click', (e) => {
      if (!this.container.contains(/** @type {Node} */ (e.target)) && e.target !== this.searchBar) {
        this.hide();
      }
    });
  }

  destroy() {
    if (this.container && this.container.parentElement) {
      this.container.parentElement.removeChild(this.container);
    }
  }
}

export { AutocompleteManager };
