// style-filter.js

class StyleFilterManager {
  constructor(json, allMarkers, icons, searchManager) {
    this.json = json;
    this.allMarkers = allMarkers;
    this.icons = icons;
    this.searchManager = searchManager;

    this.filterContainer = document.querySelector('.style-filter-container');
    this.filterHeader = document.querySelector('.style-filter-header');
    this.filterDropdown = document.getElementById('style-filter-dropdown');
    this.filterContent = document.querySelector('.style-filter-content');
    this.filterCounter = document.getElementById('style-filter-counter');
    this.clearAllBtn = document.getElementById('clear-all-styles');

    this.selectedStyles = new Set();
    this.styleStats = new Map();
    this.closeDropdownTimeout = null;

    this.initializeStyleStats();
    this.createFilterItems();
    this.setupEventListeners();

    // Mache den Header für die Tab-Navigation fokussierbar
    this.filterHeader.setAttribute('tabindex', '0');

    console.log('StyleFilterManager initialized with', this.styleStats.size, 'unique styles');
  }

  initializeStyleStats() {
    // Ignoriere nur noch "technische" oder unklare Styles
    const ignoredStyles = [
      'unknown',
      'STYLE_STYLE',
      'for students & youth',
      'for students // commercial'

    ];

    this.json.forEach(location => {
      const style = location.style || 'unknown';
      if (ignoredStyles.includes(style)) {
        return;
      }
      if (!this.styleStats.has(style)) {
        this.styleStats.set(style, 0);
      }
      this.styleStats.set(style, this.styleStats.get(style) + 1);
    });

    const openCount = this.json.filter(loc => loc.isOpen === true).length;
    const closedCount = this.json.filter(loc => loc.isOpen === false).length;

    if (openCount > 0) {
      this.styleStats.set('open', openCount);
    }
    if (closedCount > 0) {
      this.styleStats.set('closed', closedCount);
    }

    this.styleStats = new Map([...this.styleStats.entries()].sort((a, b) => b[1] - a[1]));
  }

  createFilterItems() {
    const fragment = document.createDocumentFragment();
    this.styleStats.forEach((count, style) => {
      fragment.appendChild(this.createFilterItem(style, count));
    });
    this.filterContent.appendChild(fragment);
  }

  createFilterItem(style, count) {
    const item = document.createElement('div');
    item.classList.add('style-filter-item');
    item.dataset.style = style;

    const iconMap = {
      'open': 'fas fa-door-open',
      'closed': 'fas fa-door-closed',
      'for students': 'fas fa-graduation-cap',
      'for students & youth': 'fas fa-graduation-cap',
      'for youth': 'fas fa-child',
      'commercial': 'fas fa-money-bill-wave',
      'for students // commercial': 'fas fa-money-bill-wave'
    };

    const iconClass = iconMap[style.toLowerCase()] || '';
    const iconHTML = iconClass ? `<i class="${iconClass} filter-item-icon"></i>` : '';

    const displayStyle = style === 'unknown' ? 'Unbekannt' : style;

    item.innerHTML = `
      <span class="style-label">${iconHTML}${displayStyle}</span>
      <span class="style-count">${count}</span>
    `;

    item.addEventListener('click', (e) => {
      e.stopPropagation();
      this.toggleStyleSelection(style, item);
    });

    return item;
  }

  toggleStyleSelection(style, item) {
    if (this.selectedStyles.has(style)) {
      this.selectedStyles.delete(style);
      item.classList.remove('selected');
    } else {
      this.selectedStyles.add(style);
      item.classList.add('selected');
    }
    this.updateFilterCounter();
    this.updateHeaderState();
    this.applyFilters();

    // KORREKTUR: Schließe das Dropdown nach der Auswahl.
    this.closeDropdown();
  }




  setupEventListeners() {
    const isDesktop = !window.matchMedia("(any-hover: none)").matches;
    if (isDesktop) {
      this.filterContainer.addEventListener('mouseenter', () => {
        clearTimeout(this.closeDropdownTimeout);
        this.openDropdown();
      });
      this.filterContainer.addEventListener('mouseleave', () => {
        this.closeDropdownTimeout = setTimeout(() => this.closeDropdown(), 3000);
      });
    }

    // KORREKTUR: Die Logik wurde überarbeitet, um den Fokus zuverlässig zu setzen.
    const handleActivation = (e) => {
      e.preventDefault();
      e.stopPropagation();

      this.toggleDropdown();

      // Prüfe den ZUSTAND NACH DEM TOGGLE:
      // Wenn das Dropdown jetzt offen ist (egal ob es vorher schon offen war),
      // setze den Fokus und resette die Tastaturnavigation.
      if (this.isDropdownOpen()) {
        this.currentFilterIndex = -1;
        this.updateActiveFilterItem();
        setTimeout(() => this.filterDropdown.focus(), 0);
      }
    };

    // Events, die die Aktivierungsfunktion aufrufen
    this.filterHeader.addEventListener('click', handleActivation);
    this.filterHeader.addEventListener('touchstart', handleActivation);
    this.filterHeader.addEventListener('keydown', (e) => {
      if (e.code === 'Enter' || e.code === 'Space') {
        handleActivation(e);
      }
    });

    this.clearAllBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.clearAllStyles();
    });
    document.addEventListener('click', (e) => {
      if (!e.target.closest('.style-filter-container')) this.closeDropdown();
    });
    document.addEventListener('keydown', (e) => {
      if (e.code === 'Escape' && this.isDropdownOpen()) {
        e.preventDefault(); // Verhindert ggf. andere ESC-Aktionen im Browser
        this.closeDropdown();
      }
    });

    this.currentFilterIndex = -1;

    // Event Listener für die Tastaturnavigation INNERHALB des Dropdowns
    this.filterDropdown.addEventListener('keydown', (e) => {
      e.stopPropagation();

      if (['ArrowUp', 'ArrowDown', 'Enter'].includes(e.code)) {
        e.preventDefault();
      } else {
        return;
      }

      const items = this.filterContent.querySelectorAll('.style-filter-item, .filter-btn');
      if (items.length === 0) return;

      let newIndex = this.currentFilterIndex;

      if (e.code === 'ArrowDown') {
        newIndex = (this.currentFilterIndex + 1) % items.length;
      } else if (e.code === 'ArrowUp') {
        newIndex = (this.currentFilterIndex - 1 + items.length) % items.length;
      } else if (e.code === 'Enter') {
        if (this.currentFilterIndex !== -1) {
          items[this.currentFilterIndex].click();
        }
      }

      if (newIndex !== this.currentFilterIndex) {
        this.currentFilterIndex = newIndex;
        this.updateActiveFilterItem(items);
      }
    });
  }





  // NEUE Methode zum Verwalten des "keyboard-active" Zustands
  updateActiveFilterItem(items) {
    items = items || this.filterContent.querySelectorAll('.style-filter-item, .filter-btn');
    items.forEach((item, index) => {
      if (index === this.currentFilterIndex) {
        item.classList.add('keyboard-active');
        item.scrollIntoView({ block: 'nearest' });
      } else {
        item.classList.remove('keyboard-active');
      }
    });
  
  }

  clearAllStyles() {
    this.selectedStyles.clear();
    this.filterContent.querySelectorAll('.style-filter-item.selected').forEach(item => {
      item.classList.remove('selected');
    });
    this.updateFilterCounter();
    this.updateHeaderState();
    this.applyFilters();

    // Schließe das Dropdown auch nach dem Leeren.
    this.closeDropdown();
  }

  updateFilterCounter() {
    this.filterCounter.textContent = this.selectedStyles.size;
    this.filterCounter.classList.toggle('visible', this.selectedStyles.size > 0);
  }

  updateHeaderState() {
    this.filterHeader.classList.toggle('has-filters', this.selectedStyles.size > 0);
  }

  toggleDropdown() {
    this.isDropdownOpen() ? this.closeDropdown() : this.openDropdown();
  }

  openDropdown() {
    this.filterDropdown.classList.add('is-active');
  }

  closeDropdown() {
    this.filterDropdown.classList.remove('is-active');
    this.filterHeader.focus();
  }

  isDropdownOpen() {
    return this.filterDropdown.classList.contains('is-active');
  }

  applyFilters() {
    const searchQuery = this.searchManager.searchBar.value.trim().toLowerCase();
    let searchFiltered = searchQuery.length > 0 ? this.searchManager.filterLocations(searchQuery) : this.json;

    let finalFiltered = searchFiltered;
    if (this.hasActiveFilters()) {
      finalFiltered = searchFiltered.filter(location => {
        const style = location.style || 'unknown';
        return this.selectedStyles.has(style) ||
          (this.selectedStyles.has('open') && location.isOpen === true) ||
          (this.selectedStyles.has('closed') && location.isOpen === false);
      });
    }

    this.updateMarkers(finalFiltered);
    if (this.searchManager) {
      this.searchManager.updateSearchResults(finalFiltered);
    }
  }

  updateMarkers(filteredLocations) {
    const filteredIds = new Set(filteredLocations.map(loc => loc.uniqueId));
    this.allMarkers.forEach(marker => {
      const location = this.json.find(loc => loc.uniqueId === marker.uniqueId);
      if (filteredIds.has(marker.uniqueId)) {
        let iconToSet;
        if (location && location.isOpen === true) iconToSet = this.icons.greenIcon;
        else if (location && location.isOpen === false) iconToSet = this.icons.redIcon;
        else if (location && location.spaceapi && location.spaceapi.endpoint) iconToSet = this.icons.unknownStatusIcon;
        else iconToSet = this.icons.highlightIcon;
        marker.setIcon(iconToSet);
        marker.setOpacity(1);
      } else {
        marker.setIcon(this.icons.defaultIcon);
        marker.setOpacity(0.6);
      }
    });
  }

  getSelectedStyles() {
    return Array.from(this.selectedStyles);
  }

  hasActiveFilters() {
    return this.selectedStyles.size > 0;
  }
}

window.StyleFilterManager = StyleFilterManager;