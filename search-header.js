// search-header.js - Search UI-Komponenten
// Enthält: SearchPillsManager, AutocompleteManager, SearchHeader

(function() {
  'use strict';

  const CONFIG = window.AppConfig;

  // ═══════════════════════════════════════════════════════════════════════════════
  // SEARCH PILLS MANAGER
  // Pills innerhalb der Searchbar
  // ═══════════════════════════════════════════════════════════════════════════════

  class SearchPillsManager {
    constructor(searchBar) {
      this.searchBar = searchBar;
      this.container = this.createContainer();
      this.pills = new Map();
      this.onChangeCallback = null;

      this.initializeEventListeners();
      console.log('✅ SearchPillsManager initialized');
    }

    createContainer() {
      const container = document.createElement('div');
      container.className = 'search-pills-container';
      container.id = 'search-pills-container';
      this.searchBar.parentElement.insertBefore(container, this.searchBar);
      return container;
    }

    addPill(suggestion) {
      const id = this.generatePillId(suggestion);
      if (this.pills.has(id)) {
        console.log(`ℹ️ Pill already exists: ${id}`);
        return;
      }

      this.pills.set(id, suggestion);
      this.render();
      this.updateSearchBarPadding();

      if (this.onChangeCallback) {
        this.onChangeCallback(this.getPillsArray());
      }
      console.log(`➕ Added pill: ${suggestion.text} (${suggestion.type})`);
    }

    generatePillId(suggestion) {
      return `${suggestion.type}-${suggestion.text.toLowerCase().replace(/\s+/g, '-')}`;
    }

    removePill(id) {
      if (!this.pills.has(id)) return;

      const pill = this.pills.get(id);
      console.log(`➖ Removed pill: ${pill.text} (${pill.type})`);

      this.pills.delete(id);
      this.render();
      this.updateSearchBarPadding();

      if (this.onChangeCallback) {
        this.onChangeCallback(this.getPillsArray());
      }
    }

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
      console.log('🗑️ Clearing all pills');
      this.pills.clear();
      this.render();
      this.updateSearchBarPadding();

      if (this.onChangeCallback) {
        this.onChangeCallback([]);
      }
    }

    render() {
      this.container.innerHTML = '';

      if (this.pills.size === 0) {
        this.searchBar.classList.remove('has-pills');
        return;
      }

      this.searchBar.classList.add('has-pills');

      this.pills.forEach((pill, id) => {
        const pillElement = document.createElement('div');
        pillElement.className = 'search-pill';
        pillElement.dataset.id = id;
        pillElement.dataset.type = pill.type;
        pillElement.setAttribute('role', 'button');
        pillElement.setAttribute('aria-label', `Remove ${pill.text}`);

        pillElement.innerHTML = `
          <span class="search-pill-text">${pill.text}</span>
          <span class="search-pill-remove" aria-hidden="true">×</span>
        `;

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

    getPillsArray() {
      return Array.from(this.pills.values());
    }

    getPillIds() {
      return Array.from(this.pills.keys());
    }

    hasPill(suggestion) {
      const id = this.generatePillId(suggestion);
      return this.pills.has(id);
    }

    count() {
      return this.pills.size;
    }

    onChange(callback) {
      this.onChangeCallback = callback;
    }

    loadPills(pillsArray) {
      console.log('📥 Loading pills:', pillsArray);
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

  // ═══════════════════════════════════════════════════════════════════════════════
  // AUTOCOMPLETE MANAGER
  // Smart Autocomplete mit Filter-Integration
  // ═══════════════════════════════════════════════════════════════════════════════

  class AutocompleteManager {
    constructor(json, searchBar, styleFilterManager) {
      this.json = json;
      this.searchBar = searchBar;
      this.styleFilterManager = styleFilterManager;
      this.container = this.createContainer();
      this.suggestions = [];
      this.focusedIndex = -1;
      this.onSelectCallback = null;
      this.minChars = 2;

      this.initializeEventListeners();
      console.log('✅ AutocompleteManager initialized');
    }

    createContainer() {
      const container = document.createElement('div');
      container.className = 'autocomplete-container';
      container.id = 'autocomplete-container';
      this.searchBar.parentElement.insertBefore(container, this.searchBar.parentElement.firstChild);
      return container;
    }

    generateSuggestions(query) {
      if (this.searchBar.value.endsWith(' ') || query.length < this.minChars) {
        this.hide();
        return;
      }

      query = query.toLowerCase().trim();
      const suggestions = [];
      const seenTexts = new Set();

      // Cities
      const cityCount = new Map();
      this.json.forEach(loc => {
        const city = loc.loc?.city;
        if (city && city !== 'CITY_CITY' && city.toLowerCase().startsWith(query)) {
          cityCount.set(city, (cityCount.get(city) || 0) + 1);
        }
      });

      Array.from(cityCount.entries())
        .sort((a, b) => b[1] - a[1])
        .forEach(([city, count]) => {
          if (!seenTexts.has(city.toLowerCase())) {
            suggestions.push({ text: city, type: 'city', count: count, sortKey: count * 1000 });
            seenTexts.add(city.toLowerCase());
          }
        });

      // ZIP
      const zipSet = new Set();
      this.json.forEach(loc => {
        const zip = loc.loc?.zip;
        if (zip && zip.toString().startsWith(query)) {
          zipSet.add(zip.toString());
        }
      });

      Array.from(zipSet).forEach(zip => {
        if (!seenTexts.has(zip)) {
          suggestions.push({ text: zip, type: 'zip', count: null, sortKey: 100 });
          seenTexts.add(zip);
        }
      });

      suggestions.sort((a, b) => b.sortKey - a.sortKey);
      this.suggestions = suggestions.slice(0, 5);

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
        pill.dataset.index = index;
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
        this.searchBar.focus();
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
        console.log(`✅ Activated filter: ${filterKey}`);
      }

      this.styleFilterManager.applyFilters();
      this.styleFilterManager.updateCounter?.();

      if (window.searchManager) {
        window.searchManager.createActiveFiltersSection?.();
      }
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

    onSelect(callback) {
      this.onSelectCallback = callback;
    }

    initializeEventListeners() {
      let lastInputTime = 0;
      this.searchBar.addEventListener('input', (e) => {
        lastInputTime = Date.now();
        setTimeout(() => {
          if (Date.now() - lastInputTime >= 150) {
            this.generateSuggestions(e.target.value);
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

      document.addEventListener('click', (e) => {
        if (!this.container.contains(e.target) && e.target !== this.searchBar) {
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

  // ═══════════════════════════════════════════════════════════════════════════════
  // SEARCH HEADER
  // Searchbar-spezifische UI
  // ═══════════════════════════════════════════════════════════════════════════════

  class SearchHeader {
    constructor(options = {}) {
      this.map = options.map;
      this.json = options.json;
      this.zfill = options.zfill || ((plz) => plz);

      this.searchBar = document.getElementById('search-bar');
      this.suggestionsDropdown = document.getElementById('suggestions-dropdown');
      this.searchCounter = document.getElementById('search-counter');

      this.listingCore = null;
      this.searchFilter = null;
      this.autocompleteManager = null;
      this.pillsManager = null;

      this.dropdownItems = [];
      this._manualSpaceClick = false;
      this._skipAutoZoom = false;
      this.zoomManager = null;

      console.log('✅ SearchHeader created');
    }

    init(listingCore, searchFilter, zoomManager = null) {
      this.listingCore = listingCore;
      this.searchFilter = searchFilter;
      this.zoomManager = zoomManager || window.zoomManager;

      this.initializeEventListeners();
      this.initializeAutocompleteAndPills();

      this.searchFilter.onResultsChange((filtered, forZoom, idMatch) => {
        this.handleFilterResults(filtered, forZoom, idMatch);
      });

      this.setupSpaceAPIEvents();
      this.setupBookmarkEvents();

      console.log('✅ SearchHeader initialized');
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // EVENT-LISTENER
    // ═══════════════════════════════════════════════════════════════════════════

    initializeEventListeners() {
      this.searchBar.focus();

      document.addEventListener('keydown', (e) => this.handleGlobalKeydown(e));
      this.searchBar.addEventListener('input', () => this.handleSearchInput());
      this.searchBar.addEventListener('focus', () => this.handleSearchFocus());

      document.addEventListener('click', (e) => {
        if (!e.target.closest('.search-container')) {
          this.closeDropdown();
        }
      });

      this.suggestionsDropdown.addEventListener('scroll', () => {
        this.listingCore?.updateHoverSVGPosition();
      });

      if (this.listingCore) {
        this.listingCore.setupMouseTracking(this.suggestionsDropdown);
      }

      // Container-Klasse für einheitliche Listing-Navigation
      this.suggestionsDropdown.classList.add('listing-container');

      this.suggestionsDropdown.addEventListener('wheel', (e) => {
        e.stopPropagation();
        setTimeout(() => this.searchBar.focus(), 0);
      }, { passive: true });

      this.suggestionsDropdown.addEventListener('mousedown', (e) => {
        e.preventDefault();
      });

      if (this.map) {
        this.map.on('zoomstart movestart', () => {
          this.listingCore?.removeConnectionLine();
        });
      }

      this.searchCounter.addEventListener('click', (e) => {
        e.stopPropagation();
        if (this.searchBar.value.length > 0) {
          this.clearSearch();
        }
      });

      document.addEventListener('languageChanged', () => {
        this.createActiveFiltersSection();
        this.triggerFilterUpdate();
      });

      window.addEventListener('resize', () => {
        if (this.suggestionsDropdown.classList.contains('is-active')) {
          this.adjustDropdownHeight();
        }
      });
    }

    handleGlobalKeydown(e) {
      const searchBarHasFocus = document.activeElement === this.searchBar;

      if (e.code === 'Escape') {
        e.preventDefault();
        if (this.searchBar.value.length > 0) {
          this.clearSearch();
          return;
        }
        this.closeDropdown();
        return;
      }

      if (searchBarHasFocus) {
        if (e.code === 'ArrowDown' || e.code === 'ArrowUp') {
          e.preventDefault();
          const direction = e.code === 'ArrowDown' ? 'down' : 'up';
          this.listingCore?.navigateDropdown(direction, this.suggestionsDropdown);
          return;
        }

        if (e.code === 'Enter') {
          e.preventDefault();
          this.handleEnterKey();
          return;
        }
      }
    }

    handleSearchInput() {
      this.triggerFilterUpdate();
    }

    handleSearchFocus() {
      this.listingCore?.cleanupHoverSVG();
      this.listingCore?.clearAllHoverEffects();

      this.createActiveFiltersSection();
      this.suggestionsDropdown.classList.add('is-active');
      this.searchBar.classList.add('has-suggestions');

      this.triggerFilterUpdate();
    }

    triggerFilterUpdate() {
      const pills = this.pillsManager?.getPillsArray() || [];
      const query = this.searchBar.value.trim();
      const filtered = this.searchFilter.filterByText(query, pills, this.zfill);
      this.searchFilter.applyPreFilters(filtered);
    }

    handleEnterKey() {
      const items = this.suggestionsDropdown.querySelectorAll('.listing-item');
      const keyboardIndex = this.listingCore?.keyboardIndex ?? -1;

      let itemToProcess = null;
      if (keyboardIndex >= 0 && keyboardIndex < items.length) {
        itemToProcess = items[keyboardIndex];
      } else if (items.length === 1) {
        itemToProcess = items[0];
      }

      if (itemToProcess) {
        const location = this.listingCore?.getLocationFromItem(itemToProcess);
        if (location) {
          this.handleItemClick(location);
        }
      }
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // AUTOCOMPLETE & PILLS
    // ═══════════════════════════════════════════════════════════════════════════

    initializeAutocompleteAndPills() {
      this.pillsManager = new SearchPillsManager(this.searchBar);

      this.pillsManager.onChange((pills) => {
        this.triggerFilterUpdate();

        if (window.routingManager && !window.routingManager._isNavigating) {
          window.routingManager.updateURLFromPills(pills);
        }

        this.createActiveFiltersSection();
      });

      this.autocompleteManager = new AutocompleteManager(
        this.json,
        this.searchBar,
        this.searchFilter
      );

      this.autocompleteManager.onSelect((suggestion) => {
        if (suggestion.type === 'country') {
          const searchTerm = this.searchBar.value;
          if (window.routingManager) {
            window.routingManager.applyCountryFilter(suggestion.text);
          }
          setTimeout(() => {
            this.searchBar.value = searchTerm;
            this.searchBar.focus();
          }, 10);
        } else if (suggestion.type === 'city' || suggestion.type === 'zip') {
          this.pillsManager?.addPill(suggestion);
          this.searchBar.value = '';
          this.searchBar.focus();
        }
      });

      console.log('✅ Autocomplete & Pills initialized');
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // FILTER-RESULTS HANDLER
    // ═══════════════════════════════════════════════════════════════════════════

    handleFilterResults(filteredLocations, locationsForZoom, idMatch) {
      this.createActiveFiltersSection();
      this.createSuggestionItems(filteredLocations, idMatch);
      this.updateSearchCounter(filteredLocations.length);

      const query = this.searchBar.value.trim();
      const hasPills = this.pillsManager?.count() > 0;
      const hasCountry = window.routingManager?._activeCountryFilter;
      const hasStyleFilters = this.searchFilter?.hasActiveFilters();

      const shouldShow = filteredLocations.length > 0 || query.length > 0 || hasPills || hasCountry || hasStyleFilters;
      this.updateDropdownUI(shouldShow);

      if (!this._manualSpaceClick && !this._skipAutoZoom) {
        this.triggerAutoZoom(locationsForZoom);
      }
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // FILTER-PILLS UI
    // ═══════════════════════════════════════════════════════════════════════════

    createActiveFiltersSection() {
      const existingSection = this.suggestionsDropdown.querySelector('.active-filters-section');
      if (existingSection) existingSection.remove();

      const filtersSection = document.createElement('div');
      filtersSection.classList.add('active-filters-section');

      const categories = {
        style: {
          icon: CONFIG.icons.ui.peopleGroup,
          label: window.i18n?.t('filter.style') || 'Style',
          options: CONFIG.filterCategories.style.options
        },
        doorState: {
          icon: CONFIG.icons.ui.doorOpen,
          label: window.i18n?.t('filter.status') || 'Status',
          options: CONFIG.filterCategories.doorState.options
        },
        country: {
          icon: CONFIG.icons.ui.flag,
          label: window.i18n?.t('filter.country') || 'Country',
          options: this.searchFilter?.getUniqueCountries() || []
        },
        bookmarks: {
          icon: CONFIG.icons.ui.bookmarkFilled,
          label: window.i18n?.t('filter.bookmarks') || 'Bookmarks',
          options: ['bookmarked'],
          iconOnly: true
        }
      };

      Object.keys(categories).forEach(categoryKey => {
        const config = categories[categoryKey];
        const pill = this.createCategoryPill(categoryKey, config);
        filtersSection.appendChild(pill);
      });

      if (this.searchFilter?.hasActiveFilters()) {
        const clearAllPill = document.createElement('div');
        clearAllPill.classList.add('filter-pill', 'filter-pill-clear-all');
        clearAllPill.innerHTML = `<i class="${CONFIG.icons.ui.close}"></i>`;
        clearAllPill.title = 'Clear all filters';
        clearAllPill.addEventListener('click', (e) => {
          e.stopPropagation();
          this.clearAllFilters();
        });
        filtersSection.appendChild(clearAllPill);
      }

      this.suggestionsDropdown.insertBefore(filtersSection, this.suggestionsDropdown.firstChild);
    }

    createCategoryPill(categoryKey, config) {
      const pill = document.createElement('div');
      pill.classList.add('filter-pill');
      pill.dataset.category = categoryKey;

      const activeFilter = this.getActiveFilterForCategory(categoryKey);

      if (activeFilter) {
        pill.classList.add('filter-pill-active');

        if (categoryKey === 'doorState') {
          pill.classList.add(`filter-pill-${activeFilter}`);
        }

        if (categoryKey === 'bookmarks' && config.iconOnly) {
          const bookmarkCount = window.bookmarkManager?.getCount() || 0;
          pill.innerHTML = `<i class="${config.icon}"></i>`;
          pill.title = `${config.label} (${bookmarkCount})`;
        } else if (categoryKey === 'country') {
          const countryCode = CONFIG.getCountryCode(activeFilter);
          pill.innerHTML = `<span class="fi fi-${countryCode} flag-in-pill"></span> ${countryCode.toUpperCase()}`;
        } else if (categoryKey === 'style') {
          const styleIconClass = CONFIG.getStyleIcon(activeFilter);
          const translatedStyle = this.translateFilterValue('style', activeFilter);
          pill.innerHTML = styleIconClass
            ? `<i class="${styleIconClass}"></i> ${translatedStyle}`
            : `<i class="${config.icon}"></i> ${translatedStyle}`;
        } else {
          const translatedValue = this.translateFilterValue(categoryKey, activeFilter);
          pill.innerHTML = `<i class="${config.icon}"></i> ${translatedValue}`;
        }
      } else {
        pill.classList.add('filter-pill-passive');
        if (categoryKey === 'bookmarks' && config.iconOnly) {
          const bookmarkCount = window.bookmarkManager?.getCount() || 0;
          pill.innerHTML = `<i class="${config.icon}"></i>`;
          pill.title = `${config.label} (${bookmarkCount})`;
        } else {
          pill.innerHTML = `<i class="${config.icon}"></i> ${config.label}`;
        }
      }

      if (categoryKey === 'bookmarks') {
        pill.addEventListener('click', (e) => {
          e.stopPropagation();
          this.selectCategoryOption('bookmarks', 'bookmarked');
        });
      } else {
        pill.addEventListener('click', (e) => {
          e.stopPropagation();
          this.toggleCategoryPopover(pill, categoryKey, config);
        });
      }

      return pill;
    }

    getActiveFilterForCategory(categoryKey) {
      if (categoryKey === 'country') {
        return window.routingManager?._activeCountryFilter || null;
      }

      const selectedStyles = this.searchFilter?.getSelectedStyles() || [];

      if (categoryKey === 'bookmarks') {
        return selectedStyles.find(s => s === 'bookmarked') || null;
      } else if (categoryKey === 'style') {
        return selectedStyles.find(s => CONFIG.filterCategories.style.options.includes(s)) || null;
      } else if (categoryKey === 'doorState') {
        return selectedStyles.find(s => CONFIG.filterCategories.doorState.options.includes(s)) || null;
      }

      return null;
    }

    translateFilterValue(categoryKey, value) {
      if (categoryKey === 'style') {
        const styleMap = {
          'for all': 'style.forAll',
          'for youth': 'style.forYouth',
          'for students': 'style.forStudents',
          'commercial': 'style.commercial'
        };
        return window.i18n?.t(styleMap[value] || value) || value;
      } else if (categoryKey === 'doorState') {
        const doorMap = { 'open': 'doorState.open', 'closed': 'doorState.closed' };
        return window.i18n?.t(doorMap[value] || value) || value;
      } else if (categoryKey === 'country') {
        return window.i18n?.t(`countries.${value}`) || value;
      }
      return value;
    }

    toggleCategoryPopover(pill, categoryKey, config) {
      document.querySelectorAll('.filter-popover').forEach(p => p.remove());

      const popover = document.createElement('div');
      popover.classList.add('filter-popover');
      popover.dataset.pillCategory = categoryKey;

      const clearOption = document.createElement('div');
      clearOption.classList.add('filter-popover-item', 'filter-clear-option');
      clearOption.textContent = '—';
      clearOption.addEventListener('click', (e) => {
        e.stopPropagation();
        this.clearCategoryFilter(categoryKey);
        popover.remove();
        this.searchBar.focus();
      });
      popover.appendChild(clearOption);

      config.options.forEach(option => {
        const optionItem = this.createPopoverOption(categoryKey, option, config);
        optionItem.addEventListener('click', (e) => {
          e.stopPropagation();
          this.selectCategoryOption(categoryKey, option);
          popover.remove();
          this.searchBar.focus();
        });
        popover.appendChild(optionItem);
      });

      document.body.appendChild(popover);

      const pillRect = pill.getBoundingClientRect();
      if (categoryKey === 'country') {
        popover.style.right = (window.innerWidth - pillRect.right) + 'px';
        popover.style.left = 'auto';
      } else {
        popover.style.left = pillRect.left + 'px';
      }
      popover.style.top = (pillRect.bottom + 4) + 'px';
      popover.style.minWidth = pillRect.width + 'px';

      setTimeout(() => {
        const closeHandler = (e) => {
          if (!popover.contains(e.target) && !pill.contains(e.target)) {
            popover.remove();
            document.removeEventListener('click', closeHandler);
            this.searchBar.focus();
          }
        };
        document.addEventListener('click', closeHandler);
      }, 100);
    }

    createPopoverOption(categoryKey, option, config) {
      const optionItem = document.createElement('div');
      optionItem.classList.add('filter-popover-item');

      if (categoryKey === 'country') {
        const countryCode = CONFIG.getCountryCode(option);
        optionItem.innerHTML = `
          <span class="fi fi-${countryCode}" style="margin-right: 8px;"></span>
          <span>${window.i18n?.t(`countries.${option}`) || option}</span>
          <span class="country-total-count"> (${this.json.filter(loc => loc.loc?.country === option).length})</span>
        `;
      } else if (categoryKey === 'style') {
        const styleIconClass = CONFIG.getStyleIcon(option);
        if (styleIconClass) {
          optionItem.innerHTML = `<i class="${styleIconClass}" style="margin-right: 8px; width: 20px; text-align: center;"></i>`;
        }
        optionItem.appendChild(document.createTextNode(this.translateFilterValue('style', option)));
      } else if (categoryKey === 'doorState') {
        const statusIconClass = CONFIG.getStatusIcon(option === 'open' ? true : false);
        optionItem.innerHTML = `<i class="${statusIconClass}" style="margin-right: 8px; width: 20px; text-align: center;"></i>`;
        optionItem.appendChild(document.createTextNode(this.translateFilterValue('doorState', option)));
      }

      const activeFilter = this.getActiveFilterForCategory(categoryKey);
      if (activeFilter === option) {
        optionItem.classList.add('active');
      }

      return optionItem;
    }

    selectCategoryOption(categoryKey, option) {
      if (categoryKey === 'country') {
        if (window.routingManager) {
          window.routingManager.applyCountryFilter(option);
        }
        this.scrollToTop();
        this.searchBar.focus();
        return;
      }

      if (categoryKey === 'bookmarks' && option === 'bookmarked') {
        const isActive = this.searchFilter?.getSelectedStyles().includes('bookmarked');
        this.searchFilter?.setStyleFilter('bookmarked', !isActive);
      } else {
        const categoryOptions = CONFIG.filterCategories[categoryKey]?.options || [];
        categoryOptions.forEach(opt => {
          if (opt !== option) {
            this.searchFilter?.setStyleFilter(opt, false);
          }
        });
        this.searchFilter?.setStyleFilter(option, true);
      }

      this.searchFilter?.applyFilters();
      this.scrollToTop();
      this.searchBar.focus();
    }

    clearCategoryFilter(categoryKey) {
      if (categoryKey === 'country') {
        if (window.routingManager) {
          window.routingManager.clearAllPillsAndFilters();
        }
        return;
      }

      const categoryOptions = CONFIG.filterCategories[categoryKey]?.options || [];
      categoryOptions.forEach(opt => {
        this.searchFilter?.setStyleFilter(opt, false);
      });

      this.triggerFilterUpdate();
    }

    clearAllFilters(silent = false) {
      console.log('🗑️ Master Reset: ALLES wird gelöscht.');

      this.searchBar.value = '';
      this.pillsManager?.clear();

      if (window.routingManager) {
        window.routingManager._activeCountryFilter = null;
        window.routingManager._isNavigating = true;
        window.location.hash = '';
      }

      this.searchFilter?.clearAllStyleFilters();

      if (!silent) {
        this.triggerFilterUpdate();
        this.scrollToTop();
        this.searchBar.focus();
      }

      setTimeout(() => {
        if (window.routingManager) {
          window.routingManager._isNavigating = false;
        }
      }, 100);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // DROPDOWN-LISTE
    // ═══════════════════════════════════════════════════════════════════════════

    createSuggestionItems(locations, idMatch) {
      this.suggestionsDropdown.querySelectorAll('.listing-item, .country-group-header, .id-match-separator').forEach(item => item.remove());

      this.listingCore?.resetKeyboardNavigation();

      if (!idMatch && (!locations || locations.length === 0)) {
        this.dropdownItems = [];
        return;
      }

      const fragment = document.createDocumentFragment();

      if (idMatch) {
        const idHeader = document.createElement('div');
        idHeader.classList.add('country-group-header', 'id-match-header');
        idHeader.innerHTML = '<span class="country-title-content">exact ID found:</span>';
        fragment.appendChild(idHeader);

        const item = this.createSearchItem(idMatch);
        fragment.appendChild(item);
      }

      const groupedByCountry = new Map();
      (locations || []).forEach(location => {
        const country = location.loc?.country || 'Unknown';
        if (!groupedByCountry.has(country)) {
          groupedByCountry.set(country, []);
        }
        groupedByCountry.get(country).push(location);
      });

      const sortedCountries = Array.from(groupedByCountry.entries())
        .sort((a, b) => b[1].length - a[1].length);

      sortedCountries.forEach(([country, countryLocations]) => {
        const header = this.createCountryHeader(country, countryLocations.length);
        fragment.appendChild(header);

        const sorted = countryLocations.sort((a, b) => b.loc.lat - a.loc.lat);
        sorted.forEach(location => {
          const item = this.createSearchItem(location);
          fragment.appendChild(item);
        });
      });

      this.suggestionsDropdown.appendChild(fragment);
      this.dropdownItems = Array.from(this.suggestionsDropdown.querySelectorAll('.listing-item'));

      // Zentrale Item-Listener
      this.listingCore?.setupItemListeners(this.suggestionsDropdown, {
        onItemClick: (location) => this.handleItemClick(location),
        connectionWeight: CONFIG.settings.connectionWeightSearch
      });
    }

    createSearchItem(location) {
      return this.listingCore.createItem(location, {
        showDistance: false,
        showBookmark: true,
        showStreet: true,
        showFlag: false,
        zfill: this.zfill
      });
    }

    createCountryHeader(country, count) {
      const header = document.createElement('div');
      header.classList.add('country-group-header');
      header.dataset.countryName = country;

      const isFilterActive = window.routingManager?._activeCountryFilter === country;
      const activeClass = isFilterActive ? 'country-filter-active' : '';

      const countryCode = CONFIG.getCountryCode(country);
      const translatedCountry = window.i18n?.t(`countries.${country}`) || country;
      const totalInCountry = this.json.filter(loc => loc.loc?.country === country).length;

      header.innerHTML = `
        <div class="country-title-content">
          <span class="fi fi-${countryCode} flag-in-header"></span>
          <div class="country-filter-button ${activeClass}" data-country="${country}">
            <i class="${CONFIG.icons.ui.filter} filter-icon-in-header"></i>
            <span class="country-filter-name">${translatedCountry}</span>
          </div>
          <span class="country-count">[${count} ${window.i18n?.t('searchResults.of') || 'of'} ${totalInCountry}]</span>
        </div>
        <div class="country-nav-carets">
          <i class="${CONFIG.icons.ui.caretUp} country-nav-caret" data-direction="prev"></i>
          <i class="${CONFIG.icons.ui.caretDown} country-nav-caret" data-direction="next"></i>
        </div>
      `;

      header.querySelector('.country-filter-button')?.addEventListener('click', (e) => {
        e.stopPropagation();
        if (window.routingManager) {
          const isActive = window.routingManager._activeCountryFilter === country;
          if (isActive) {
            window.routingManager.clearAllPillsAndFilters();
          } else {
            window.routingManager.applyCountryFilter(country);
          }
        }
        this.searchBar.focus();
      });

      header.querySelectorAll('.country-nav-caret').forEach(caret => {
        caret.addEventListener('click', (e) => {
          e.stopPropagation();
          this.handleCountryScroll(country, caret.dataset.direction);
        });
      });

      if (isFilterActive) header.classList.add('is-filtered');
      return header;
    }

    handleCountryScroll(currentCountry, direction) {
      const headers = Array.from(this.suggestionsDropdown.querySelectorAll('.country-group-header:not(.id-match-header)'));
      const currentIndex = headers.findIndex(h => h.dataset.countryName === currentCountry);

      let targetIndex;
      if (direction === 'next') {
        targetIndex = Math.min(currentIndex + 1, headers.length - 1);
      } else {
        targetIndex = Math.max(currentIndex - 1, 0);
      }

      if (targetIndex !== currentIndex && headers[targetIndex]) {
        headers[targetIndex].scrollIntoView({ block: 'start', behavior: 'smooth' });
      }
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // ITEM-CLICK HANDLER
    // ═══════════════════════════════════════════════════════════════════════════

    handleItemClick(location) {
      this.searchFilter.currentIdMatch = null;

      clearTimeout(this.zoomDebounceTimeout);
      this._manualSpaceClick = true;

      this.map?.flyTo([location.loc.lat, location.loc.long], CONFIG.settings.defaultZoomLevel);

      const targetMarker = this.listingCore?.findMarkerByLocation(location);
      if (targetMarker) {
        targetMarker._openedByHover = false;

        if (window.markerStateManager) {
          window.markerStateManager.clearTimeouts(targetMarker.locationId);
          window.markerStateManager.setState(targetMarker.locationId, {
            isHovering: false,
            isDropdownHovering: false
          });
        }

        this.map?.once('moveend', () => {
          targetMarker._openedByHover = false;
          targetMarker.openPopup();
          if (window.mapUtils?.setStickyPopup) {
            window.mapUtils.setStickyPopup(targetMarker);
          }
        });
      }

      this.searchFilter.applyPreFilters([location]);

      this.searchBar.value = location.name;
      this.createSuggestionItems([location], null);
      this.updateSearchCounter(1);
      this.updateDropdownUI(true);

      setTimeout(() => {
        this._manualSpaceClick = false;
      }, 1000);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // UI-HELFER
    // ═══════════════════════════════════════════════════════════════════════════

    updateSearchCounter(count) {
      this.searchCounter.textContent = count;

      const isSearching = this.searchBar.value.length > 0 || this.searchFilter?.hasActiveFilters();

      this.searchCounter.classList.toggle('visible', isSearching);
      this.searchCounter.classList.toggle('has-results', count > 0);
      this.searchCounter.classList.toggle('no-results', isSearching && count === 0);
      this.searchCounter.classList.toggle('is-clearable', this.searchBar.value.length > 0);
    }

    updateDropdownUI(shouldShow) {
      this.suggestionsDropdown.classList.toggle('is-active', shouldShow);
      this.searchBar.classList.toggle('has-suggestions', shouldShow);
      if (shouldShow) this.adjustDropdownHeight();
    }

    closeDropdown() {
      if (!this._manualSpaceClick && window.mapUtils?.clearStickyPopup) {
        window.mapUtils.clearStickyPopup();
      }

      this.suggestionsDropdown.classList.remove('is-active');
      this.searchBar.classList.remove('has-suggestions');
      this.listingCore?.removeConnectionLine();
      this.listingCore?.resetKeyboardNavigation();
      this.listingCore?.cleanupHoverSVG();
    }

    clearSearch(shouldFocus = true, silent = false) {
      this.searchBar.value = '';

      if (shouldFocus && !silent) {
        this.searchBar.focus();
      }

      if (window.routingManager) {
        window.routingManager._activeCountryFilter = null;
        window.routingManager._isNavigating = true;
        window.location.hash = '';
      }

      this.pillsManager?.clear();

      if (!silent) {
        this.triggerFilterUpdate();
      }

      setTimeout(() => {
        if (window.routingManager) {
          window.routingManager._isNavigating = false;
        }
      }, 100);
    }

    adjustDropdownHeight() {
      const dropdown = this.suggestionsDropdown;
      if (!dropdown) return;

      const dropdownTop = dropdown.getBoundingClientRect().top;
      const paddingTop = parseFloat(getComputedStyle(dropdown).paddingTop) || 0;
      const maxBottom = window.innerHeight * 0.7;

      // Max content-area height (content-box: element height = max-height + padding)
      const maxContentHeight = maxBottom - dropdownTop - paddingTop;

      // overhead = scrollPaddingTop - paddingTop (sticky-Header-Bereich)
      const scrollPaddingTop = parseFloat(getComputedStyle(dropdown).scrollPaddingTop) || 0;
      const overhead = scrollPaddingTop - paddingTop;

      // Max 6 Items, reduzieren bis 30% Bildschirm unten frei bleibt
      const itemHeight = 70;
      let items = Math.min(6, Math.floor((maxContentHeight - overhead) / itemHeight));
      items = Math.max(1, items);

      dropdown.style.maxHeight = (overhead + items * itemHeight) + 'px';
    }

    scrollToTop() {
      this.suggestionsDropdown?.scrollTo({ top: 0, behavior: 'smooth' });
      this.listingCore.keyboardIndex = 0;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // AUTO-ZOOM
    // ═══════════════════════════════════════════════════════════════════════════

    triggerAutoZoom(locations) {
      if (this._manualSpaceClick || this._skipAutoZoom) return;

      if (this.zoomManager) {
        const findMarker = (loc) => this.listingCore?.findMarkerByLocation(loc);
        this.zoomManager.triggerAutoZoom(locations, findMarker);
      }
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // EVENTS
    // ═══════════════════════════════════════════════════════════════════════════

    setupSpaceAPIEvents() {
      if (window.spaceAPI) {
        window.spaceAPI.onStatusUpdate(() => {
          this.triggerFilterUpdate();
        });
      }
    }

    setupBookmarkEvents() {
      window.addEventListener('bookmarksChanged', () => {
        this.createActiveFiltersSection();
        this.triggerFilterUpdate();
      });
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // GLOBALE EXPORTS
  // ═══════════════════════════════════════════════════════════════════════════════

  window.SearchPillsManager = SearchPillsManager;
  window.AutocompleteManager = AutocompleteManager;
  window.SearchHeader = SearchHeader;

  console.log('✅ SearchHeader loaded (Pills, Autocomplete, Header)');

})();
