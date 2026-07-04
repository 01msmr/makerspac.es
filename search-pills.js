// @ts-check
// search-pills.js - SearchPillsManager

/** @typedef {import('./types.js').Pill} Pill */

// ═══════════════════════════════════════════════════════════════════════════════
// SEARCH PILLS MANAGER
// Pills innerhalb der Searchbar
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Verwaltet die Filter-Pills in der Suchleiste (Stadt, Land, Style).
 * Pills werden als `Map<id, Pill>` gehalten; Änderungen triggern `onChangeCallback`.
 */
class SearchPillsManager {
  /**
   * @param {HTMLInputElement} searchBar - Das #search-bar Input-Element
   */
  constructor(searchBar) {
    this.searchBar = searchBar;
    this.container = this.createContainer();
    this.pills = new Map();
    this.onChangeCallback = null;

    this.initializeEventListeners();
  }

  createContainer() {
    const container = document.createElement('div');
    container.className = 'search-pills-container';
    container.id = 'search-pills-container';
    this.searchBar.parentElement.insertBefore(container, this.searchBar);
    return container;
  }

  /**
   * Fügt eine neue Pill hinzu (ignoriert Duplikate).
   * @param {Pill} suggestion
   */
  addPill(suggestion) {
    const id = this.generatePillId(suggestion);
    if (this.pills.has(id)) {
      return;
    }

    this.pills.set(id, suggestion);
    this.render();
    this.updateSearchBarPadding();

    if (this.onChangeCallback) {
      this.onChangeCallback(this.getPillsArray());
    }
  }

  /**
   * Generiert eine eindeutige ID für eine Pill (z.B. 'city-berlin').
   * @param {Pill} suggestion
   * @returns {string}
   */
  generatePillId(suggestion) {
    return `${suggestion.type}-${suggestion.text.toLowerCase().replace(/\s+/g, '-')}`;
  }

  /**
   * Entfernt eine Pill anhand ihrer ID.
   * @param {string} id
   */
  removePill(id) {
    if (!this.pills.has(id)) return;

    const pill = this.pills.get(id);

    this.pills.delete(id);
    this.render();
    this.updateSearchBarPadding();

    if (this.onChangeCallback) {
      this.onChangeCallback(this.getPillsArray());
    }
  }

  /**
   * Entfernt die zuletzt hinzugefügte Pill (z.B. bei Backspace in leerer Searchbar).
   * @returns {boolean} false wenn keine Pills vorhanden
   */
  removeLastPill() {
    if (this.pills.size === 0) return false;

    const pillsArray = Array.from(this.pills.keys());
    const lastId = pillsArray[pillsArray.length - 1];

    const pillElement = this.container.querySelector(`[data-id="${lastId}"]`);
    if (pillElement) {
      pillElement.classList.add('removing');
      setTimeout(() => this.removePill(lastId), 150);
    } else {
      this.removePill(lastId);
    }
    return true;
  }

  clear() {
    this.pills.clear();
    this.render();
    this.updateSearchBarPadding();

    if (this.onChangeCallback) {
      this.onChangeCallback([]);
    }
  }

  render() {
    if (this.pills.size === 0) {
      this.container.innerHTML = '';
      this.searchBar.classList.remove('has-pills');
      return;
    }

    this.searchBar.classList.add('has-pills');

    // Remove DOM nodes for pills that no longer exist
    this.container.querySelectorAll('[data-id]').forEach(el => {
      if (!this.pills.has(/** @type {HTMLElement} */ (el).dataset.id)) el.remove();
    });

    // Append only newly added pills (existing ones stay untouched)
    this.pills.forEach((pill, id) => {
      if (this.container.querySelector(`[data-id="${id}"]`)) return;

      const pillElement = document.createElement('div');
      pillElement.className = 'search-pill';
      pillElement.dataset.id = id;
      pillElement.dataset.type = pill.type;
      pillElement.setAttribute('role', 'button');
      pillElement.setAttribute('aria-label', `Remove ${pill.text}`);

      const textSpan = document.createElement('span');
      textSpan.className = 'search-pill-text';
      textSpan.textContent = pill.text;
      const removeSpan = document.createElement('span');
      removeSpan.className = 'search-pill-remove';
      removeSpan.setAttribute('aria-hidden', 'true');
      removeSpan.textContent = '×';
      pillElement.appendChild(textSpan);
      pillElement.appendChild(removeSpan);

      pillElement.addEventListener('click', (e) => {
        e.stopPropagation();
        this.removePill(id);
      });

      this.container.appendChild(pillElement);
    });
  }

  updateSearchBarPadding() {
    if (this.pills.size === 0) {
      this.searchBar.style.removeProperty('--dynamic-pill-padding');
      this.searchBar.classList.remove('has-pills');
      return;
    }

    this.searchBar.classList.add('has-pills');

    requestAnimationFrame(() => {
      const containerWidth = this.container.scrollWidth;
      const padding = containerWidth + 24;
      this.searchBar.style.setProperty('--dynamic-pill-padding', `${padding}px`);
      this.searchBar.style.removeProperty('--pills-width');
    });
  }

  /**
   * Gibt alle aktiven Pills als Array zurück.
   * @returns {Pill[]}
   */
  getPillsArray() {
    return Array.from(this.pills.values());
  }

  getPillIds() {
    return Array.from(this.pills.keys());
  }

  /**
   * Prüft ob eine Pill bereits aktiv ist.
   * @param {Pill} suggestion
   * @returns {boolean}
   */
  hasPill(suggestion) {
    const id = this.generatePillId(suggestion);
    return this.pills.has(id);
  }

  count() {
    return this.pills.size;
  }

  /**
   * Registriert einen Callback der bei jeder Pill-Änderung aufgerufen wird.
   * @param {function(Pill[]): void} callback
   */
  onChange(callback) {
    this.onChangeCallback = callback;
  }

  /**
   * Lädt Pills aus einem Array (z.B. aus URL-Hash beim Start).
   * @param {Pill[]} pillsArray
   */
  loadPills(pillsArray) {
    this.pills.clear();
    pillsArray.forEach(pill => {
      const id = this.generatePillId(pill);
      this.pills.set(id, pill);
    });
    this.render();
    this.updateSearchBarPadding();

    if (this.onChangeCallback) {
      this.onChangeCallback(this.getPillsArray());
    }
  }

  initializeEventListeners() {
    this.searchBar.addEventListener('keydown', (e) => {
      if (e.code === 'Backspace' && this.searchBar.value === '' && this.pills.size > 0) {
        e.preventDefault();
        this.removeLastPill();
      }
    });

    this.container.addEventListener('click', (e) => {
      if (e.target === this.container) {
        this.searchBar.focus();
      }
    });

    const resizeObserver = new ResizeObserver(() => {
      if (this.pills.size > 0) {
        this.updateSearchBarPadding();
      }
    });
    resizeObserver.observe(this.container);
  }

  destroy() {
    if (this.container && this.container.parentElement) {
      this.container.parentElement.removeChild(this.container);
    }
  }
}

export { SearchPillsManager };
