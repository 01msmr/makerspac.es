// search-autocomplete.js - Smart Autocomplete mit Filter-Integration

class AutocompleteManager {
  constructor(json, searchBar, styleFilterManager) {
    this.json = json;
    this.searchBar = searchBar;
    this.styleFilterManager = styleFilterManager;
    this.container = this.createContainer();
    this.suggestions = [];
    this.focusedIndex = -1;
    this.onSelectCallback = null;
    this.minChars = 2; // ANPASSUNG: minChars von 3 auf 2

    this.initializeEventListeners();
    console.log('✅ AutocompleteManager initialized');
  }

  createContainer() {
    const container = document.createElement('div');
    container.className = 'autocomplete-container';
    container.id = 'autocomplete-container';

    // Füge ÜBER der Searchbar ein (als Sibling)
    this.searchBar.parentElement.insertBefore(
      container,
      this.searchBar.parentElement.firstChild
    );

    return container;
  }

  /**
   * Generiere Vorschläge basierend auf Input
   * Quellen: City, ZIP, Country, Style-Filter
   */
  generateSuggestions(query) {

    // ✨ KORREKTUR: Vorschläge ausblenden, wenn ein Leerzeichen eingegeben wurde.
    if (this.searchBar.value.endsWith(' ') || query.length < this.minChars) {
      this.hide();
      return;
    }

    query = query.toLowerCase().trim();
    const suggestions = [];
    const seenTexts = new Set(); // Verhindere Duplikate

    // 1. CITIES - mit Zählung (BEIBEHALTEN)
    const cityCount = new Map();
    this.json.forEach(loc => {
      const city = loc.loc?.city;
      if (city && city !== 'CITY_CITY' &&
        city.toLowerCase().startsWith(query)) {
        cityCount.set(city, (cityCount.get(city) || 0) + 1);
      }
    });

    // Sortiere Städte nach Häufigkeit (meiste zuerst)
    Array.from(cityCount.entries())
      .sort((a, b) => b[1] - a[1])
      .forEach(([city, count]) => {
        if (!seenTexts.has(city.toLowerCase())) {
          suggestions.push({
            text: city,
            type: 'city',
            count: count,
            sortKey: count * 1000 // Hohe Priorität
          });
          seenTexts.add(city.toLowerCase());
        }
      });

    // 2. COUNTRIES (AUSKOMMENTIERT)
    /*
    const countryCount = new Map();
    this.json.forEach(loc => {
      const country = loc.loc?.country;
      if (country && country !== 'COUNTRY_COUNTRY' &&
        country.toLowerCase().startsWith(query)) {
        countryCount.set(country, (countryCount.get(country) || 0) + 1);
      }
    });

    Array.from(countryCount.entries())
      .forEach(([country, count]) => {
        if (!seenTexts.has(country.toLowerCase())) {
          suggestions.push({
            text: country,
            type: 'country',
            count: count,
            sortKey: count * 500 // Mittlere Priorität
          });
          seenTexts.add(country.toLowerCase());
        }
      });
    */

    // 3. ZIP (PLZ) (BEIBEHALTEN, da als Ort/Adresse relevant)
    const zipSet = new Set();
    this.json.forEach(loc => {
      const zip = loc.loc?.zip;
      if (zip && zip.toString().startsWith(query)) {
        zipSet.add(zip.toString());
      }
    });

    Array.from(zipSet).forEach(zip => {
      if (!seenTexts.has(zip)) {
        suggestions.push({
          text: zip,
          type: 'zip',
          count: null,
          sortKey: 100 // Niedrige Priorität
        });
        seenTexts.add(zip);
      }
    });

    // 4. STYLE-FILTER (for-all, commercial, open, closed, etc.) (AUSKOMMENTIERT)
    /*
    const styleFilters = [
      { key: 'for all', label: 'for all', type: 'style' },
      { key: 'for students', label: 'for students', type: 'style' },
      { key: 'for youth', label: 'for youth', type: 'style' },
      { key: 'commercial', label: 'commercial', type: 'style' },
      { key: 'open', label: 'open', type: 'status' },
      { key: 'closed', label: 'closed', type: 'status' }
    ];

    styleFilters.forEach(filter => {
      if (filter.key.toLowerCase().includes(query)) {
        suggestions.push({
          text: filter.label,
          type: filter.type,
          filterKey: filter.key,
          count: this.getFilterCount(filter.key),
          sortKey: 200 // Mittlere Priorität
        });
      }
    });
    */

    // Sortiere nach Priorität + Relevanz
    suggestions.sort((a, b) => b.sortKey - a.sortKey);

    // Limitiere auf 5 Vorschläge
    this.suggestions = suggestions.slice(0, 5);

    if (this.suggestions.length > 0) {
      this.render();
    } else {
      this.hide();
    }
  }

  /**
   * Zähle Makerspaces für einen Filter
   */
  getFilterCount(filterKey) {
    if (filterKey === 'open') {
      return this.json.filter(loc => loc.isOpen === true).length;
    } else if (filterKey === 'closed') {
      return this.json.filter(loc => loc.isOpen === false).length;
    } else {
      return this.json.filter(loc => loc.style === filterKey).length;
    }
  }

  /**
   * Rendere Vorschläge
   */
  render() {
    this.container.innerHTML = '';

    this.suggestions.forEach((suggestion, index) => {
      const pill = document.createElement('div');
      pill.className = 'autocomplete-pill';
      pill.dataset.index = index;
      pill.setAttribute('role', 'option');
      pill.setAttribute('aria-selected', 'false');

      // Text
      let html = `<span>${suggestion.text}</span>`;

      // Count Badge (optional)
      if (suggestion.count > 1 && suggestion.count !== undefined) {
        html += `<span class="count-badge">${suggestion.count}</span>`;
      }

      pill.innerHTML = html;

      // Click-Handler
      pill.addEventListener('click', () => {
        this.selectSuggestion(index);
      });

      // Hover-Handler (für Keyboard-Navigation)
      pill.addEventListener('mouseenter', () => {
        this.setFocus(index);
      });

      this.container.appendChild(pill);
    });

    this.show();
    this.focusedIndex = -1;

    // Accessibility
    this.container.setAttribute('role', 'listbox');
  }

  /**
   * Tastatur-Navigation (Wird durch TAB/SHIFT+TAB Logik ersetzt, aber für setFocus() beibehalten)
   */
  navigate(direction) {
    if (this.suggestions.length === 0) return;

    // Remove old focus
    if (this.focusedIndex >= 0 && this.focusedIndex < this.container.children.length) {
      const oldPill = this.container.children[this.focusedIndex];
      if (oldPill) {
        oldPill.classList.remove('focused');
        oldPill.setAttribute('aria-selected', 'false');
      }
    }

    // Update index
    if (direction === 'down') {
      this.focusedIndex = Math.min(
        this.focusedIndex + 1,
        this.suggestions.length - 1
      );
    } else if (direction === 'up') {
      this.focusedIndex = Math.max(this.focusedIndex - 1, -1);
    }

    // Add new focus
    if (this.focusedIndex >= 0 && this.focusedIndex < this.container.children.length) {
      const newPill = this.container.children[this.focusedIndex];
      if (newPill) {
        newPill.classList.add('focused');
        newPill.setAttribute('aria-selected', 'true');
        newPill.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }
    }
  }

  /**
   * Setze Focus auf bestimmten Index (für Hover)
   */
  setFocus(index) {
    // Remove old focus
    if (this.focusedIndex >= 0 && this.focusedIndex < this.container.children.length) {
      const oldPill = this.container.children[this.focusedIndex];
      if (oldPill) {
        oldPill.classList.remove('focused');
        oldPill.setAttribute('aria-selected', 'false');
      }
    }

    this.focusedIndex = index;

    // Add new focus
    if (this.focusedIndex >= 0 && this.focusedIndex < this.container.children.length) {
      const newPill = this.container.children[this.focusedIndex];
      if (newPill) {
        newPill.classList.add('focused');
        newPill.setAttribute('aria-selected', 'true');
      }
    }
  }

  /**
   * Auswahl bestätigen
   */
  selectSuggestion(index) {
    if (index === undefined) {
      index = this.focusedIndex;
    }

    if (index >= 0 && index < this.suggestions.length) {
      const suggestion = this.suggestions[index];

      // Unterscheide zwischen Orten und Filtern
      if (suggestion.type === 'style' || suggestion.type === 'status') {
        // FILTER: Aktiviere existierende Filter-Pills
        this.activateFilter(suggestion);

        // ✨ KORREKTUR 1: Leere das Suchfeld auch nach Aktivierung eines Style-Filters
        this.searchBar.value = '';

      } else {
        // ORTE: Callback für Pill-Manager
        if (this.onSelectCallback) {
          this.onSelectCallback(suggestion);
        }
      }

      this.hide();
      this.searchBar.focus();
    }
  }

  /**
   * Aktiviere Style-Filter (statt Pill zu erstellen)
   */
  activateFilter(suggestion) {
    if (!this.styleFilterManager) {
      console.warn('StyleFilterManager not available');
      return;
    }

    const filterKey = suggestion.filterKey || suggestion.text;

    // Toggle Filter im StyleFilterManager
    if (!this.styleFilterManager.selectedStyles.has(filterKey)) {
      this.styleFilterManager.selectedStyles.add(filterKey);
      console.log(`✅ Activated filter: ${filterKey}`);
    } else {
      console.log(`ℹ️ Filter already active: ${filterKey}`);
    }

    // Aktualisiere UI
    this.styleFilterManager.applyFilters();
    this.styleFilterManager.updateCounter();

    // Trigger auch die Filter-Pills-Darstellung in der Suche
    if (window.searchManager) {
      window.searchManager.createActiveFiltersSection();
    }
  }

  /**
   * Enter-Handler
   */
  handleEnter() {
    if (this.focusedIndex >= 0) {
      this.selectSuggestion(this.focusedIndex);
      return true;
    }
    return false;
  }

  /**
   * Zeige Container
   */
  show() {
    this.container.classList.add('is-active');
  }

  /**
   * Verstecke Container
   */
  hide() {
    this.container.classList.remove('is-active');
    this.suggestions = [];
    this.focusedIndex = -1;
  }

  /**
   * Ist Autocomplete aktiv?
   */
  isActive() {
    return this.container.classList.contains('is-active');
  }

  /**
   * Callback bei Auswahl
   */
  onSelect(callback) {
    this.onSelectCallback = callback;
  }

  /**
   * Event Listeners
   */
  initializeEventListeners() {
    // Input Event - nur wenn Autocomplete nicht über Keyboard gesteuert wird
    let lastInputTime = 0;
    this.searchBar.addEventListener('input', (e) => {
      lastInputTime = Date.now();

      // Debounce für Performance
      setTimeout(() => {
        if (Date.now() - lastInputTime >= 150) {
          this.generateSuggestions(e.target.value);
        }
      }, 150);
    });

    // Keyboard Navigation
    this.searchBar.addEventListener('keydown', (e) => {
      // Wenn das Autocomplete-Dropdown NICHT aktiv ist, return.
      if (!this.isActive()) return;

      const numSuggestions = this.suggestions.length;

      // KORREKTUR: Navigation per TAB / SHIFT+TAB
      if (e.code === 'Tab') {
        e.preventDefault(); // WICHTIG: Überschreibt die globale Tab-Funktion

        if (numSuggestions === 0) {
          return; // Nichts zu tun
        }

        if (numSuggestions === 1) {
          // ANFORDERUNG 1: Bei genau 1 Ergebnis aktivieren
          this.selectSuggestion(0);
          return;
        }

        // --- Mehrere Ergebnisse (numSuggestions > 1): Im Kreis navigieren ---

        let newIndex;
        if (e.shiftKey) {
          // SHIFT+TAB (Rückwärts/Zyklisch)
          // Wenn der Fokus bei -1 (Sucheingabe) ist, gehe zum letzten Element.
          // Ansonsten normal rückwärts.
          newIndex = this.focusedIndex <= 0 ? numSuggestions - 1 : this.focusedIndex - 1;
        } else {
          // TAB (Vorwärts/Zyklisch)
          // Wenn der Fokus beim letzten Element ist, gehe zu 0.
          // Ansonsten normal vorwärts.
          newIndex = this.focusedIndex >= numSuggestions - 1 ? 0 : this.focusedIndex + 1;
        }

        this.setFocus(newIndex);
      }
      // KORREKTUR: Auswahl per ENTER / SPACE
      else if (e.code === 'Enter' || e.code === 'Space') {
        if (numSuggestions === 0) {
          return; // Nichts zu aktivieren
        }

        // Index der Auswahl: Fokussiertes Element, oder wenn kein Fokus (-1) und nur 1 Ergebnis, dann Element 0.
        const indexToSelect = (this.focusedIndex === -1 && numSuggestions === 1) ? 0 : this.focusedIndex;

        if (indexToSelect >= 0) {
          this.selectSuggestion(indexToSelect);
          e.preventDefault();
        }

      }
      // ESCAPE bleibt für das Schließen
      else if (e.code === 'Escape') {
        e.preventDefault();
        this.hide();
      }

      // ArrowDown/ArrowUp/ArrowLeft/ArrowRight werden NICHT hier abgefangen, 
      // um mit dem SearchManager kompatibel zu bleiben.
    });

    // Click outside - verstecke Autocomplete
    document.addEventListener('click', (e) => {
      if (!this.container.contains(e.target) &&
        e.target !== this.searchBar) {
        this.hide();
      }
    });
  }

  /**
   * Destroy (Cleanup)
   */
  destroy() {
    if (this.container && this.container.parentElement) {
      this.container.parentElement.removeChild(this.container);
    }
  }
}

// Export
window.AutocompleteManager = AutocompleteManager;