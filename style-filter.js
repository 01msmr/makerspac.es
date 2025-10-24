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
    this.filterHeader.setAttribute('tabindex', '-1');

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

    // Definiere die fixe Reihenfolge
    const fixedOrder = [
      'for all',
      'for youth',
      'for students',
      'commercial',
      'open',
      'closed'
    ];

    // Temporäre Map für die Zählung
    const tempStats = new Map();

    this.json.forEach(location => {
      const style = location.style || 'unknown';
      if (ignoredStyles.includes(style)) {
        return;
      }
      if (!tempStats.has(style)) {
        tempStats.set(style, 0);
      }
      tempStats.set(style, tempStats.get(style) + 1);
    });

    const openCount = this.json.filter(loc => loc.isOpen === true).length;
    const closedCount = this.json.filter(loc => loc.isOpen === false).length;

    if (openCount > 0) {
      tempStats.set('open', openCount);
    }
    if (closedCount > 0) {
      tempStats.set('closed', closedCount);
    }

    // Erstelle die finale Map in der gewünschten Reihenfolge
    this.styleStats = new Map();

    // Füge zuerst die Einträge in der fixen Reihenfolge hinzu
    fixedOrder.forEach(style => {
      if (tempStats.has(style)) {
        this.styleStats.set(style, tempStats.get(style));
      }
    });

    // Füge dann alle anderen Styles hinzu (falls vorhanden), sortiert nach Anzahl
    const remainingStyles = [...tempStats.entries()]
      .filter(([style]) => !fixedOrder.includes(style))
      .sort((a, b) => b[1] - a[1]);

    remainingStyles.forEach(([style, count]) => {
      this.styleStats.set(style, count);
    });
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
      'for all': 'fas fa-people-group',
      'open': 'fas fa-door-open',
      'closed': 'fas fa-door-closed',
      'for students': 'fas fa-graduation-cap',
      'for youth': 'fas fa-child',
      'commercial': 'fas fa-money-bill-wave',
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
    const isSelected = this.selectedStyles.has(style);

    if (isSelected) {
      this.selectedStyles.delete(style);
      item.classList.remove('selected');
    } else {
      // --- NEUE LOGIK FÜR GEGENSEITIGEN AUSSCHLUSS ---
      // Bevor der neue Filter hinzugefügt wird:
      if (style === 'open') {
        // Wenn "open" aktiviert wird, deaktiviere "closed"
        this.selectedStyles.delete('closed');
        const closedItem = this.filterContent.querySelector('[data-style="closed"]');
        if (closedItem) closedItem.classList.remove('selected');
      } else if (style === 'closed') {
        // Wenn "closed" aktiviert wird, deaktiviere "open"
        this.selectedStyles.delete('open');
        const openItem = this.filterContent.querySelector('[data-style="open"]');
        if (openItem) openItem.classList.remove('selected');
      }

      // Füge den geklickten Filter hinzu
      this.selectedStyles.add(style);
      item.classList.add('selected');
    }

    this.updateFilterCounter();
    this.updateHeaderState();
    this.applyFilters();

    // Schließe das Dropdown nach der Auswahl.
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

      const items = [
        ...this.filterContent.querySelectorAll('.style-filter-item'),
        this.clearAllBtn
      ];
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
    if (document.activeElement === this.filterDropdown) {
      this.filterHeader.focus();
    }
  }

  isDropdownOpen() {
    return this.filterDropdown.classList.contains('is-active');
  }

  applyFilters() {
    const searchQuery = this.searchManager.searchBar.value.trim().toLowerCase();
    let searchFiltered = searchQuery.length > 0 ? this.searchManager.filterLocations(searchQuery) : this.json;

    // Wenn keine Filter aktiv sind, zeige alle Suchergebnisse
    if (!this.hasActiveFilters()) {
      this.updateMarkers(searchFiltered);
      if (this.searchManager) {
        this.searchManager.updateSearchResults(searchFiltered);
      }
      return;
    }

    // --- NEUE AND-FILTERLOGIK ---

    // 1. Trenne die aktiven Filter in "normale" Styles und "Status"-Filter
    const selectedNormalStyles = new Set();
    const selectedStateFilters = new Set();
    this.selectedStyles.forEach(style => {
      if (style === 'open' || style === 'closed') {
        selectedStateFilters.add(style);
      } else {
        selectedNormalStyles.add(style);
      }
    });

    // 2. Wende die Filter nacheinander an (AND-Verknüpfung)
    const finalFiltered = searchFiltered.filter(location => {
      const locationStyle = location.style || 'unknown';

      // Bedingung 1: Muss einem der ausgewählten Styles entsprechen
      // Diese Bedingung ist erfüllt, wenn KEIN Style-Filter aktiv ist ODER das Element passt.
      const styleMatch = selectedNormalStyles.size === 0 || selectedNormalStyles.has(locationStyle);

      // Bedingung 2: Muss dem ausgewählten Status entsprechen
      // Diese Bedingung ist erfüllt, wenn KEIN Status-Filter aktiv ist ODER das Element passt.
      const stateMatch = selectedStateFilters.size === 0 ||
        (selectedStateFilters.has('open') && location.isOpen === true) ||
        (selectedStateFilters.has('closed') && location.isOpen === false);

      // Das Element wird nur angezeigt, wenn BEIDE Bedingungen erfüllt sind
      return styleMatch && stateMatch;
    });

    this.updateMarkers(finalFiltered);
    if (this.searchManager) {
      this.searchManager.updateSearchResults(finalFiltered);
    }
  }
  

  updateMarkers(filteredLocations) {
    const clusterGroup = window.clusterGroup;
    if (!clusterGroup) return; // Fallback falls Clustering nicht initialisiert

    const filteredIds = new Set(filteredLocations.map(loc => loc.uniqueId));

    this.allMarkers.forEach(marker => {
      const location = this.json.find(loc => loc.uniqueId === marker.uniqueId);

      if (filteredIds.has(marker.uniqueId)) {
        // Marker soll angezeigt werden
        if (!clusterGroup.hasLayer(marker)) {
          clusterGroup.addLayer(marker);
        }

        // Icon-Update basierend auf Status
        let iconToSet;
        if (location && location.isOpen === true) iconToSet = this.icons.greenIcon;
        else if (location && location.isOpen === false) iconToSet = this.icons.redIcon;
        else if (location && location.spaceapi && location.spaceapi.endpoint) iconToSet = this.icons.unknownStatusIcon;
        else iconToSet = this.icons.highlightIcon;
        marker.setIcon(iconToSet);

      } else {
        // Marker soll versteckt werden
        if (clusterGroup.hasLayer(marker)) {
          clusterGroup.removeLayer(marker);
        }
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