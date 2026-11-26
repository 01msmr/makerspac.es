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
    /** Werkzeug-Pills (z. B. „/zoom“): sehen aus wie Pills, sind aber KEINE Filter — nicht in `pills`, lösen kein onChange aus, überleben clear() */
    this.toolPills = new Map();
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

  /**
   * Zeigt eine Werkzeug-Pill (immer hinter den Filter-Pills). Klick entfernt sie über `onRemove`.
   * @param {string} id
   * @param {string} text
   * @param {() => void} onRemove
   */
  setToolPill(id, text, onRemove) {
    this.toolPills.set(id, { text, onRemove });
    const el = this.container.querySelector(`[data-id="${id}"]`);
    const label = el?.querySelector('.search-pill-text');
    if (label) label.textContent = text;
    this.render();
    this.updateSearchBarPadding();
  }

  /** @param {string} id @param {string} text */
  updateToolPillText(id, text) {
    const tool = this.toolPills.get(id);
    if (!tool || tool.text === text) return;
    tool.text = text;
    const label = this.container.querySelector(`[data-id="${id}"] .search-pill-text`);
    if (label) label.textContent = text;
  }

  /** @param {string} id */
  removeToolPill(id) {
    if (!this.toolPills.delete(id)) return;
    this.render();
    this.updateSearchBarPadding();
  }

  render() {
    if (this.pills.size === 0 && this.toolPills.size === 0) {
      this.container.innerHTML = '';
      this.searchBar.classList.remove('has-pills');
      return;
    }

    this.searchBar.classList.add('has-pills');

    // Remove DOM nodes for pills that no longer exist
    this.container.querySelectorAll('[data-id]').forEach(el => {
      const elId = /** @type {HTMLElement} */ (el).dataset.id;
      if (!this.pills.has(elId) && !this.toolPills.has(elId)) el.remove();
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

    // Werkzeug-Pills: anlegen, falls neu, und stets ans Ende rücken
    this.toolPills.forEach((tool, id) => {
      let el = /** @type {HTMLElement|null} */ (this.container.querySelector(`[data-id="${id}"]`));
      if (!el) {
        el = document.createElement('div');
        el.className = 'search-pill';
        el.dataset.id = id;
        el.dataset.type = 'tool';
        el.setAttribute('role', 'button');
        el.setAttribute('aria-label', `Remove ${tool.text}`);
        const textSpan = document.createElement('span');
        textSpan.className = 'search-pill-text';
        textSpan.textContent = tool.text;
        const removeSpan = document.createElement('span');
        removeSpan.className = 'search-pill-remove';
        removeSpan.setAttribute('aria-hidden', 'true');
        removeSpan.textContent = '×';
        el.appendChild(textSpan);
        el.appendChild(removeSpan);
        el.addEventListener('click', (e) => {
          e.stopPropagation();
          this.toolPills.get(id)?.onRemove();
        });
      }
      this.container.appendChild(el);
    });
  }

  updateSearchBarPadding() {
    if (this.pills.size === 0 && this.toolPills.size === 0) {
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
      if (this.pills.size + this.toolPills.size > 0) {
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
