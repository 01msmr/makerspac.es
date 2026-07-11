// @ts-check
// search-header.js - Search UI-Komponenten
// Enthält: SearchHeader (koordiniert SearchPillsManager + AutocompleteManager)

/** @typedef {import('./types.js').MakerSpace} MakerSpace */
/** @typedef {import('./types.js').Pill} Pill */

import AppConfig from './config.js';
import { todayWeekday } from './date-utils.js';
import { SearchPillsManager } from './search-pills.js';
import { AutocompleteManager } from './autocomplete-manager.js';

const CONFIG = AppConfig;

// ═══════════════════════════════════════════════════════════════════════════════
// SEARCH HEADER
// Searchbar-spezifische UI
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Haupt-UI-Klasse für die Suchleiste.
 * Koordiniert SearchPillsManager, AutocompleteManager, SearchFilter und ListingCore.
 * Rendert das Suggestions-Dropdown und verwaltet Keyboard-Navigation.
 */
class SearchHeader {
  /**
   * @param {object} [options]
   * @param {any} [options.map] - Leaflet Map-Instanz
   * @param {MakerSpace[]} [options.json]
   * @param {function(string|number, string): string} [options.zfill]
   */
  constructor(options = {}) {
    this.map = options.map;
    this.json = options.json;
    this.zfill = options.zfill || ((plz) => String(plz));

    this.searchBar = /** @type {HTMLInputElement|null} */ (document.getElementById('search-bar'));
    this.suggestionsDropdown = document.getElementById('suggestions-dropdown');
    this.searchCounter = document.getElementById('search-counter');

    this.listingCore = null;
    this.searchFilter = null;
    this.autocompleteManager = null;
    this.pillsManager = null;

    this.dropdownItems = [];
    this._manualSpaceClick = false;
    this._skipAutoZoom = false;
    // Mobile Nearby aktiv: Dropdown gehört der Nearby-Liste — Filter-Events
    // dürfen sie nicht überschreiben (nearby-header.js setzt/löscht das Flag)
    this._nearbyMode = false;
    this.zoomManager = null;

    // rAF-Throttle für Connection-Line-Redraw
    this._pendingSVGRedraw = null;

  }

  /**
   * Verbindet SearchHeader mit den anderen Modulen und startet Event-Listener.
   * Muss nach dem Konstruktor aufgerufen werden.
   * @param {import('./listing-core.js').ListingCore} listingCore
   * @param {import('./search-filter.js').SearchFilter} searchFilter
   * @param {import('./zoom-manager.js').ZoomManager|null} [zoomManager]
   */
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

    // Gesamtzahl beim Start anzeigen
    this.updateSearchCounter(this.json?.length || 0);

  }

  focusSearchBarIfDesktop() {
    if (new URLSearchParams(location.search).has('nofocus')) return;
    const isMobile = window.matchMedia('(max-width: 1024px), (min-width: 768px) and (pointer: coarse)').matches;
    if (!isMobile) {
      this.searchBar.focus();
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // EVENT-LISTENER
  // ═══════════════════════════════════════════════════════════════════════════

  initializeEventListeners() {
    this.focusSearchBarIfDesktop();

    document.addEventListener('keydown', (e) => this.handleGlobalKeydown(e));
    this.searchBar.addEventListener('input', () => this.handleSearchInput());
    this.searchBar.addEventListener('focus', () => this.handleSearchFocus());
    this.searchBar.addEventListener('blur', () => this.handleSearchBlur());

    // Filter-Button: Blur soll Bar nicht kollabieren
    document.getElementById('filter-toggle-btn')
      ?.addEventListener('pointerdown', () => { this._filterBtnDown = true; });

    document.addEventListener('click', (e) => {
      // Klicks innerhalb des Filter-Popovers (auch nach Entfernen aus DOM) ignorieren
      // Auf Mobile/Tablet-Touch: kein closeDropdown bei Außenklick
      const isMobileUI = window.matchMedia('(max-width: 1024px), (min-width: 768px) and (pointer: coarse)').matches;
      if (!isMobileUI &&
        !/** @type {HTMLElement} */ (e.target).closest('.search-container') && !/** @type {HTMLElement} */ (e.target).closest('.mf-overlay')) {
        this.closeDropdown();
      }
    });

    this.suggestionsDropdown.addEventListener('scroll', () => {
      if (this._pendingSVGRedraw) return;
      this._pendingSVGRedraw = requestAnimationFrame(() => {
        this._pendingSVGRedraw = null;
        this.listingCore?.updateHoverSVGPosition();
      });
    });

    if (this.listingCore) {
      this.listingCore.setupMouseTracking(this.suggestionsDropdown);
    }

    // Container-Klasse für einheitliche Listing-Navigation
    this.suggestionsDropdown.classList.add('listing-container');

    this.suggestionsDropdown.addEventListener('wheel', (e) => {
      e.stopPropagation();
      setTimeout(() => this.focusSearchBarIfDesktop(), 0);
    }, { passive: true });

    this.suggestionsDropdown.addEventListener('mousedown', (e) => {
      e.preventDefault();
    });

    if (this.map) {
      this.map.on('zoomstart movestart', () => {
        this.listingCore?.removeConnectionLine();
      });
      this.map.on('moveend zoomend', () => {
        if (this._pendingSVGRedraw) return;
        this._pendingSVGRedraw = requestAnimationFrame(() => {
          this._pendingSVGRedraw = null;
          this.listingCore?.updateHoverSVGPosition();
        });
      });
    }

    this.searchCounter.addEventListener('click', (e) => {
      e.stopPropagation();
      if (this.searchBar.value.length > 0 || this.pillsManager?.count() > 0) {
        this.searchBar.value = '';
        this.pillsManager?.clear();
        // User cleared the search → exit location route (sonst bleibt der
        // stale Route-Pre-Filter über den empty-query Branch aktiv)
        if (window.routingManager) window.routingManager._isOnLocationRoute = false;
        this.focusSearchBarIfDesktop();
        this.triggerFilterUpdate();
      }
    });

    document.addEventListener('languageChanged', () => {
      this.createActiveFiltersSection();
      if (this.suggestionsDropdown.classList.contains('is-active')) {
        this.triggerFilterUpdate();
      }
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
      }
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
    // User edits the bar → a location route no longer drives the filter.
    // Otherwise triggerFilterUpdate() keeps re-applying the stale route
    // pre-filter after the term is deleted (empty-query branch).
    if (window.routingManager) window.routingManager._isOnLocationRoute = false;
    this.zoomManager?.resetUserMoved();
    this.triggerFilterUpdate();
  }

  handleSearchFocus() {
    this.zoomManager?.resetUserMoved();
    if (window.innerWidth <= 767) {
      window.mobileFilterUI?.close();
      this.searchBar.closest('.search-container')?.classList.add('bar-focused');
    }

    this.listingCore?.cleanupHoverSVG();
    this.listingCore?.clearAllHoverEffects();

    this.createActiveFiltersSection();
    this.suggestionsDropdown.classList.add('is-active');
    this.searchBar.classList.add('has-suggestions');

    this._skipAutoZoom = true;
    this.triggerFilterUpdate();
    this._skipAutoZoom = false;
  }

  handleSearchBlur() {
    if (window.innerWidth <= 767) {
      if (this._filterBtnDown) {
        this._filterBtnDown = false;
        return; // Filter-Button getippt → Bar bleibt expandiert
      }
      this.searchBar.closest('.search-container')?.classList.remove('bar-focused');
    }
  }

  triggerFilterUpdate() {
    const pills = this.pillsManager?.getPillsArray() || [];
    const query = this.searchBar.value.trim();
    // On a location route with no user search/filters, re-apply filters with the
    // existing pre-filter rather than resetting it to all locations.
    // Prevents SpaceAPI updates and pill-clear events from overriding the route filter.
    // Exception: when a country filter is active it must always go through filterByText
    // so preFilteredLocations gets the country-filtered set (not stale location-route data).
    const hasCountryFilter = !!window.routingManager?._activeCountryFilter;
    if (!hasCountryFilter && window.routingManager?._isOnLocationRoute && !query && !pills.length) {
      this.searchFilter.applyFilters();
      return;
    }
    const filtered = this.searchFilter.filterByText(query, pills, this.zfill);
    this.searchFilter.applyPreFilters(filtered);
  }

  applyPillFilters(pillsArray) {
    this.pillsManager?.loadPills(pillsArray);
    this.triggerFilterUpdate();
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
      const location = this.listingCore?.getLocationFromItem(/** @type {HTMLElement} */ (itemToProcess));
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
          this.focusSearchBarIfDesktop();
        }, 10);
      } else if (suggestion.type === 'city' || suggestion.type === 'zip') {
        this.pillsManager?.addPill(suggestion);
        this.searchBar.value = '';
        this.focusSearchBarIfDesktop();
      }
    });

  }

  // ═══════════════════════════════════════════════════════════════════════════
  // FILTER-RESULTS HANDLER
  // ═══════════════════════════════════════════════════════════════════════════

  handleFilterResults(filteredLocations, locationsForZoom, idMatch) {
    // Mobile Nearby: Dropdown zeigt die Nearby-Liste — nicht überschreiben,
    // kein Auto-Zoom (SpaceAPI-Updates etc. laufen sonst dazwischen)
    if (this._nearbyMode) return;

    this.createActiveFiltersSection();
    this.createSuggestionItems(filteredLocations, idMatch);
    this.updateSearchCounter(filteredLocations.length);
    // Autocomplete ausblenden wenn nur noch 1 Suchergebnis übrig
    if (filteredLocations.length === 1 && this.autocompleteManager?.isActive()) {
      this.autocompleteManager.hide();
    }
    // Mobile Chip-Bar synchron halten (auch bei Routing-getriggerten Filter-Änderungen)
    window.app?.mobileFilterUI?.updateChipBar?.();
    // Mobile: Dropdown nach Filteränderung zum ersten Item scrollen
    if (window.innerWidth <= 767) this.suggestionsDropdown.scrollTop = 0;

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
    const searchContainer = this.suggestionsDropdown.parentElement;
    const existingSection = searchContainer.querySelector('.active-filters-section');
    if (existingSection) existingSection.remove();

    const filtersSection = document.createElement('div');
    filtersSection.classList.add('active-filters-section');

    const categories = {
      bookmarks: {
        icon: CONFIG.icons.ui.bookmarkFilled,
        label: window.i18n?.t('filter.bookmarks') || 'Bookmarks',
        options: ['bookmarked'],
        iconOnly: true
      },
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
      weekly: {
        icon: CONFIG.icons.ui.calendarDay,
        label: window.i18n?.t('filter.weekly') || 'Meeting',
        options: [...CONFIG.filterCategories.weekly.options, 'any']
      },
      workshops: {
        icon: CONFIG.icons.ui.workshops,
        label: window.i18n?.t('filter.workshops') || 'Werkstätten',
        options: CONFIG.filterCategories.workshops.options
      },
      country: {
        icon: CONFIG.icons.ui.flag,
        label: window.i18n?.t('filter.country') || 'Country',
        options: this.searchFilter?.getUniqueCountries() || []
      },
    };

    const categoryKeys = Object.keys(categories);
    const midIndex = Math.floor(categoryKeys.length / 2);
    categoryKeys.forEach((categoryKey, index) => {
      const config = categories[categoryKey];
      const position = index < midIndex ? 'top-right' : 'top-left';
      const pill = this.createCategoryPill(categoryKey, config, position);
      filtersSection.appendChild(pill);
    });

    if (this.searchFilter?.hasActiveFilters() || window.routingManager?._activeCountryFilter) {
      const clearAllPill = document.createElement('div');
      clearAllPill.classList.add('filter-pill', 'filter-pill-clear-all');
      clearAllPill.setAttribute('aria-label', window.i18n?.t('filter.clearAll') || 'Clear all filters');
      clearAllPill.setAttribute('role', 'tooltip');
      clearAllPill.setAttribute('data-microtip-position', 'top-left');
      clearAllPill.innerHTML = `<i class="${CONFIG.icons.ui.close}"></i>`;
      clearAllPill.addEventListener('click', (e) => {
        e.stopPropagation();
        this.clearAllFilters();
      });
      filtersSection.appendChild(clearAllPill);
    }

    searchContainer.insertBefore(filtersSection, this.suggestionsDropdown);
  }

  /* === ORIGINAL createCategoryPill (mit Text-Labels) ===
  createCategoryPill(categoryKey, config, microtipPosition = 'top-left') {
    const pill = document.createElement('div');
    pill.classList.add('filter-pill');
    pill.dataset.category = categoryKey;
    pill.setAttribute('role', 'tooltip');
    pill.setAttribute('data-microtip-position', microtipPosition);

    const activeFilter = this.getActiveFilterForCategory(categoryKey);

    if (activeFilter) {
      pill.classList.add('filter-pill-active');

      if (categoryKey === 'doorState') {
        pill.classList.add(`filter-pill-${activeFilter}`);
      }

      if (categoryKey === 'bookmarks' && config.iconOnly) {
        const bookmarkCount = window.bookmarkManager?.getCount() || 0;
        pill.innerHTML = `<i class="${config.icon}"></i>`;
        pill.setAttribute('aria-label', `${config.label} (${bookmarkCount})`);
      } else if (categoryKey === 'country') {
        const countryCode = CONFIG.getCountryCode(activeFilter);
        pill.innerHTML = `<span class="fi fi-${countryCode} flag-in-pill"></span> ${countryCode.toUpperCase()}`;
        pill.setAttribute('aria-label', config.label);
      } else if (categoryKey === 'style') {
        const styleIconClass = CONFIG.getStyleIcon(activeFilter);
        const translatedStyle = this.translateFilterValue('style', activeFilter);
        pill.innerHTML = styleIconClass
          ? `<i class="${styleIconClass}"></i> ${translatedStyle}`
          : `<i class="${config.icon}"></i> ${translatedStyle}`;
        pill.setAttribute('aria-label', config.label);
      } else {
        const translatedValue = this.translateFilterValue(categoryKey, activeFilter);
        pill.innerHTML = `<i class="${config.icon}"></i> ${translatedValue}`;
        pill.setAttribute('aria-label', config.label);
      }
    } else {
      pill.classList.add('filter-pill-passive');
      if (categoryKey === 'bookmarks' && config.iconOnly) {
        const bookmarkCount = window.bookmarkManager?.getCount() || 0;
        pill.innerHTML = `<i class="${config.icon}"></i>`;
        pill.setAttribute('aria-label', `${config.label} (${bookmarkCount})`);
      } else {
        pill.innerHTML = `<i class="${config.icon}"></i> ${config.label}`;
        pill.setAttribute('aria-label', config.label);
      }
    }
  === END ORIGINAL === */

  createCategoryPill(categoryKey, config, microtipPosition = 'top-left') {
    const pill = document.createElement('div');
    pill.classList.add('filter-pill');
    pill.dataset.category = categoryKey;
    pill.setAttribute('role', 'tooltip');
    pill.setAttribute('data-microtip-position', microtipPosition);

    const activeFilter = this.getActiveFilterForCategory(categoryKey);

    if (activeFilter) {
      pill.classList.add('filter-pill-active');

      if (categoryKey === 'doorState') {
        pill.classList.add(`filter-pill-${activeFilter}`);
      }

      // Aktiver Filter: Icon + gewählter Wert anzeigen
      if (categoryKey === 'bookmarks' && config.iconOnly) {
        const bookmarkCount = window.bookmarkManager?.getCount() || 0;
        pill.innerHTML = `<i class="${config.icon}"></i>`;
        pill.setAttribute('aria-label', `${config.label} (${bookmarkCount})`);
      } else if (categoryKey === 'country') {
        const countryCode = CONFIG.getCountryCode(activeFilter);
        pill.innerHTML = `<span class="fi fi-${countryCode} flag-in-pill"></span> ${countryCode.toUpperCase()}`;
        pill.setAttribute('aria-label', config.label);
      } else {
        const icon = this.getFilterIcon(categoryKey, activeFilter) || config.icon;
        const translatedValue = this.translateFilterValue(categoryKey, activeFilter);
        pill.innerHTML = `<i class="${icon}"></i> ${translatedValue}`;
        pill.setAttribute('aria-label', config.label);
      }
    } else {
      // Passiv: nur Icon, Name nur im Microtip
      pill.classList.add('filter-pill-passive');
      if (categoryKey === 'bookmarks' && config.iconOnly) {
        const bookmarkCount = window.bookmarkManager?.getCount() || 0;
        pill.innerHTML = `<i class="${config.icon}"></i>`;
        pill.setAttribute('aria-label', `${config.label} (${bookmarkCount})`);
      } else {
        pill.innerHTML = `<i class="${config.icon}"></i>`;
        pill.setAttribute('aria-label', config.label);
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

    if (activeFilter && categoryKey !== 'bookmarks') {
      const clearX = document.createElement('i');
      clearX.className = 'fas fa-times pill-clear-x';
      clearX.addEventListener('click', (e) => {
        e.stopPropagation();
        this.clearCategoryFilter(categoryKey);
      });
      pill.appendChild(clearX);
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
    } else if (categoryKey === 'weekly') {
      return selectedStyles.find(s => CONFIG.filterCategories.weekly.options.includes(s) || s === 'any') || null;
    } else if (categoryKey === 'workshops') {
      return selectedStyles.find(s => CONFIG.filterCategories.workshops.options.includes(s)) || null;
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
    } else if (categoryKey === 'weekly') {
      if (value === 'any') return window.i18n?.t('weekdays.any') || 'any day';
      return window.i18n?.t(`weekdays.${value}`) || value;
    } else if (categoryKey === 'country') {
      return window.i18n?.t(`countries.${value}`) || value;
    } else if (categoryKey === 'workshops') {
      return window.i18n?.t(`workshops.${value}`) || value;
    }
    return value;
  }

  getFilterIcon(categoryKey, value) {
    if (categoryKey === 'workshops') return CONFIG.getWorkshopIcon(value);
    if (categoryKey === 'style')     return CONFIG.getStyleIcon(value);
    return null;
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
      this.focusSearchBarIfDesktop();
    });
    popover.appendChild(clearOption);

    config.options.forEach(option => {
      const optionItem = this.createPopoverOption(categoryKey, option, config);
      optionItem.addEventListener('click', (e) => {
        e.stopPropagation();
        this.selectCategoryOption(categoryKey, option);
        popover.remove();
        this.focusSearchBarIfDesktop();
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
          this.focusSearchBarIfDesktop();
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
          <span class="country-total-count"> (${this.searchFilter?.styleStats?.get(option) ?? this.json.filter(loc => loc.loc?.country === option).length})</span>
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
    } else if (categoryKey === 'weekly') {
      const label = this.translateFilterValue('weekly', option);
      const todayMarker = (option !== 'any' && parseInt(option) === todayWeekday()) ? ' <i class="fas fa-circle" style="font-size: 0.5em; vertical-align: middle;"></i>' : '';
      optionItem.innerHTML = `<i class="${CONFIG.icons.ui.calendarDay}" style="margin-right: 8px; width: 20px; text-align: center;"></i>${label}${todayMarker}`;
    } else if (categoryKey === 'workshops') {
      const workshopIcon = CONFIG.getWorkshopIcon(option);
      const label = this.translateFilterValue('workshops', option);
      optionItem.innerHTML = `<i class="${workshopIcon}" style="margin-right: 8px; width: 20px; text-align: center;"></i>${label}`;
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
      this.focusSearchBarIfDesktop();
      return;
    }

    if (categoryKey === 'bookmarks' && option === 'bookmarked') {
      const isActive = this.searchFilter?.getSelectedStyles().includes('bookmarked');
      this.searchFilter?.setStyleFilter('bookmarked', !isActive);
    } else if (categoryKey === 'weekly') {
      // Clear all weekday options + 'any'
      CONFIG.filterCategories.weekly.options.forEach(opt => this.searchFilter?.setStyleFilter(opt, false));
      this.searchFilter?.setStyleFilter('any', false);
      this.searchFilter?.setStyleFilter(option, true);
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
    this.focusSearchBarIfDesktop();
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
    if (categoryKey === 'weekly') {
      this.searchFilter?.setStyleFilter('any', false);
    }

    this.searchFilter?.applyFilters();
    this.scrollToTop();
    this.focusSearchBarIfDesktop();
  }

  clearAllFilters(silent = false) {

    this.searchBar.value = '';
    this.pillsManager?.clear();

    window.routingManager?.resetRouteState();

    this.searchFilter?.clearAllStyleFilters();

    if (!silent) {
      this.triggerFilterUpdate();
      this.scrollToTop();
      this.focusSearchBarIfDesktop();
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // DROPDOWN-LISTE
  // ═══════════════════════════════════════════════════════════════════════════

  createSuggestionItems(locations, idMatch) {
    // Clear connection line + SVG before removing DOM items — prevents stale
    // currentHoverItem refs from drawing the line to (0,0) after re-render
    if (this.listingCore?.currentHoverItem) {
      this.listingCore.removeConnectionLine();
      this.listingCore.cleanupHoverSVG();
      this.listingCore.currentHoverItem = null;
    }

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

      countryLocations
        .sort((a, b) => b.loc.lat - a.loc.lat)
        .forEach(location => {
          fragment.appendChild(this.createSearchItem(location));
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
    const totalInCountry = this.searchFilter?.styleStats?.get(country) ?? this.json.filter(loc => loc.loc?.country === country).length;

    header.innerHTML = `
        <div class="country-title-content">
          <span class="fi fi-${countryCode} flag-in-header"></span>
          <div class="country-filter-button ${activeClass}" data-country="${country}">
            <i class="${CONFIG.icons.ui.filter} filter-icon-in-header"></i>
            <span class="country-filter-name">${translatedCountry}</span>
          </div>
          ${!isFilterActive ? `<span class="country-count">[${count} ${window.i18n?.t('searchResults.of') || 'of'} ${totalInCountry}]</span>` : ''}
        </div>
        ${!isFilterActive ? `<div class="country-nav-carets">
          <i class="${CONFIG.icons.ui.caretUp} country-nav-caret" data-direction="prev"></i>
          <i class="${CONFIG.icons.ui.caretDown} country-nav-caret" data-direction="next"></i>
        </div>` : ''}
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
      this.focusSearchBarIfDesktop();
    });

    header.querySelectorAll('.country-nav-caret').forEach(caret => {
      caret.addEventListener('click', (e) => {
        e.stopPropagation();
        this.handleCountryScroll(country, /** @type {HTMLElement} */ (caret).dataset.direction);
      });
    });

    if (isFilterActive) header.classList.add('is-filtered');
    return header;
  }

  handleCountryScroll(currentCountry, direction) {
    const headers = Array.from(this.suggestionsDropdown.querySelectorAll('.country-group-header:not(.id-match-header)'));
    const currentIndex = headers.findIndex(h => /** @type {HTMLElement} */ (h).dataset.countryName === currentCountry);

    let targetIndex;
    if (direction === 'next') {
      targetIndex = Math.min(currentIndex + 1, headers.length - 1);
    } else {
      targetIndex = Math.max(currentIndex - 1, 0);
    }

    if (targetIndex !== currentIndex && headers[targetIndex]) {
      const dropdown = this.suggestionsDropdown;
      dropdown.scrollTo({
        top: /** @type {HTMLElement} */ (headers[targetIndex]).offsetTop,
        behavior: 'instant'
      });
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ITEM-CLICK HANDLER
  // ═══════════════════════════════════════════════════════════════════════════

  handleItemClick(location) {
    const isMobile = window.innerWidth <= 767 || ('ontouchstart' in window);

    // Doppelklick / Doppeltap erkennen
    if (!this._clickTimestamps) this._clickTimestamps = {};
    const now = Date.now();
    const isDoubleClick = (now - (this._clickTimestamps[location.ID] || 0)) < 400;
    this._clickTimestamps[location.ID] = now;

    this.searchFilter.currentIdMatch = null;
    clearTimeout(this.zoomManager?.zoomDebounceTimeout);
    this._manualSpaceClick = true;

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

      // Mobile: Marker ggf. aus Cluster holen, damit Popup + Pin sichtbar werden
      if (isMobile) {
        const clusterGroup = window.clusterGroup;
        if (clusterGroup && window.mapUtils?.isClusteringEnabled()) {
          const visibleParent = clusterGroup.getVisibleParent(targetMarker);
          if (visibleParent && visibleParent !== targetMarker) {
            targetMarker.addTo(window.map);
            targetMarker._isTemporarilyUnclustered = true;
          }
        }
      }

      const popupWasAlreadyOpen = targetMarker.isPopupOpen();
      targetMarker._openedByItemClick = true; // Signal an popupopen: Navigation direkt hier erledigt
      targetMarker.openPopup();
      // Nur sticky setzen wenn Popup schon offen war (dann feuert popupopen nicht nochmal).
      // War es zu, übernimmt der popupopen-Handler das setStickyPopup.
      if (popupWasAlreadyOpen && window.mapUtils?.setStickyPopup) {
        window.mapUtils.setStickyPopup(targetMarker);
      }

      // URL nur auf Desktop setzen; Mobile: nur Popup öffnen, kein Navigieren
      if (!isMobile && window.routingManager) {
        window.routingManager.navigateToLocations([location.ID]);
      }
    }

    if (isMobile) {
      // Mobile: BG/FG invertieren; bei Doppeltap Namen in Searchbar
      this.suggestionsDropdown.querySelectorAll('.listing-item.active')
        .forEach(el => el.classList.remove('active'));
      const clickedItem = this.suggestionsDropdown.querySelector(
        `.listing-item[data-location-id="${location.ID}"]`
      );
      if (clickedItem) clickedItem.classList.add('active');
      this.searchBar.blur(); // Tastatur schließen
      if (isDoubleClick) {
        this.searchBar.value = location.name;
      }
      // Kein Auto-Zoom beim Tap auf ein Listing-Item – nur Marker öffnen
    } else {
      // Desktop: flyTo + Namen in Searchbar + Dropdown auf diesen Eintrag einschränken
      if (targetMarker) {
        this.zoomManager?.map?.flyTo(targetMarker.getLatLng(), 13, { duration: 1.0 });
      }
      this.searchFilter.applyPreFilters([location]);
      this.searchBar.value = location.name;
      this.createSuggestionItems([location], null);
      this.updateSearchCounter(1);
      this.updateDropdownUI(true);
      const activeItem = this.suggestionsDropdown.querySelector('.listing-item');
      if (activeItem) {
        activeItem.classList.add('active');
        if (this.listingCore) this.listingCore.currentHoverItem = /** @type {HTMLElement} */ (activeItem);
      }
    }

    setTimeout(() => {
      this._manualSpaceClick = false;
    }, 1000);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // UI-HELFER
  // ═══════════════════════════════════════════════════════════════════════════

  updateSearchCounter(count) {
    this.searchCounter.innerHTML = count + '<span class="counter-x" aria-hidden="true"></span>';
    this.searchCounter.classList.add('visible');
    this.searchCounter.classList.toggle('has-results', count > 0);
    this.searchCounter.classList.toggle('is-pill', count > 99);
    this.searchCounter.classList.remove('no-results');
    this.searchCounter.classList.toggle('is-clearable', this.searchBar.value.length > 0 || this.pillsManager?.count() > 0);

    // Microtip: "x makerspaces"
    const label = count + ' ' + (window.i18n?.t('nearbySpaces.makerspaces') || 'makerspaces');
    this.searchCounter.setAttribute('role', 'tooltip');
    this.searchCounter.setAttribute('data-microtip-position', 'bottom-left');
    this.searchCounter.setAttribute('aria-label', label);
  }

  updateDropdownUI(shouldShow) {
    this.suggestionsDropdown.classList.toggle('is-active', shouldShow);
    this.searchBar.classList.toggle('has-suggestions', shouldShow);
    // Spiegelt is-active auf .dropdown-wrap für mobile Nav-Sichtbarkeit
    this.suggestionsDropdown.closest('.dropdown-wrap')
      ?.classList.toggle('is-active', shouldShow);
    if (shouldShow) this.adjustDropdownHeight();
  }

  closeDropdown() {
    // Der Dropdown wird NIEMALS geschlossen — er ist das primäre Listing-UI auf allen Geräten.
    return;

    if (!this._manualSpaceClick && window.mapUtils?.clearStickyPopup) {
      window.mapUtils.clearStickyPopup();
    }

    this.suggestionsDropdown.classList.remove('is-active');
    this.searchBar.classList.remove('has-suggestions');
    this.suggestionsDropdown.closest('.dropdown-wrap')?.classList.remove('is-active');
    this.listingCore?.removeConnectionLine();
    this.listingCore?.resetKeyboardNavigation();
    this.listingCore?.cleanupHoverSVG();
  }

  clearSearch(shouldFocus = true, silent = false) {
    this.searchBar.value = '';

    if (shouldFocus && !silent) {
      this.focusSearchBarIfDesktop();
    }

    window.routingManager?.resetRouteState();

    this.pillsManager?.clear();

    if (!silent) {
      this.triggerFilterUpdate();
    }
  }

  adjustDropdownHeight() {
    if (window.innerWidth <= 767) return; // Mobile: Höhe wird von CSS (116px) und applyGridSnapping gesetzt
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
    const behavior = window.innerWidth <= 767 ? 'instant' : 'smooth';
    this.suggestionsDropdown?.scrollTo({ top: 0, behavior });
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

  /** Sofort-Zoom auf aktuelle Filter-Ergebnisse (kein Debounce, keine Guards). */
  reZoom() {
    const locations = this.searchFilter?.lastLocationsForZoom || [];
    if (!this.zoomManager || locations.length === 0) return;
    const findMarker = (loc) => this.listingCore?.findMarkerByLocation(loc);
    this.zoomManager.setupAutoZoom(locations, findMarker);
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
      // Filter nur aktualisieren wenn Bookmark-Filter aktiv ist
      if (this.searchFilter?.selectedStyles?.has('bookmarked')) {
        this.triggerFilterUpdate();
      }
    });
  }
}

export { SearchPillsManager, AutocompleteManager, SearchHeader };
