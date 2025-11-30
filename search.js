// scripts/search.js - Fix: SVG-Objekt wird wieder korrekt in den DOM eingefügt

class SearchManager {
  constructor(map, allMarkers, json, icons, zfill) {
    this.map = map;
    this.allMarkers = allMarkers;
    this.json = json;
    this.icons = icons;
    this.zfill = zfill;
    this.zoomDebounceTimeout = null;
    this.connectionLine = null;
    this.previousZoomBounds = null;
    this.overlapCheckInterval = null;
    this.overlapCheckFunction = null;
    this.styleFilterManager = null;

    this.searchBar = document.getElementById('search-bar');
    this.suggestionsDropdown = document.getElementById('suggestions-dropdown');
    this.searchCounter = document.getElementById('search-counter');

    this.currentDropdownIndex = -1;
    this.dropdownItems = [];
    this.currentHoverSVG = null;
    this.currentHoverItem = null;
    this.popupTimeout = null;
    this.isDropdownHovering = false;
    this.ZOOM_THRESHOLD = 2;

    this.zoomIndicator = null;
    this.zoomIndicatorActive = false;

    this.lastKeypressTime = 0;

    this.initializeEventListeners();
    setTimeout(() => { this.setupSpaceAPIEvents(); }, 100);
  }

  setStyleFilterManager(styleFilterManager) {
    this.styleFilterManager = styleFilterManager;
  }

  initializeEventListeners() {
    this.searchBar.focus();

    // ✨ NEUE GLOBALE TASTATUR-NAVIGATION
    document.addEventListener('keydown', (e) => {
      const searchBarHasFocus = document.activeElement === this.searchBar;
      const filterHeaderHasFocus = this.styleFilterManager?.filterHeader && document.activeElement === this.styleFilterManager.filterHeader;
      const filterDropdownHasFocus = this.styleFilterManager?.filterDropdown && document.activeElement === this.styleFilterManager.filterDropdown;

      // ESC - Schließt Dropdown überall
      if (e.code === 'Escape') {
        e.preventDefault();

        // 1. Schließe zuerst den Filter-Popover/Dropdown, wenn aktiv
        if (this.styleFilterManager?.isDropdownOpen()) {
          this.styleFilterManager.closeDropdown();
          return;
        }

        // 2. Leere die Suche, wenn Text vorhanden ist (schließt implizit das Dropdown über applyFilters)
        if (this.searchBar.value.length > 0) {
          this.clearSearch();
          return;
        }

        // 3. Schließe das Such-Dropdown explizit, wenn es offen und leer ist
        // if (this.suggestionsDropdown.classList.contains('is-active')) {
        //   this.closeDropdown();
        //   return;
        // }

        // 3. Wenn die Suche leer ist (und kein Filter-Dropdown aktiv war), schließe das Such-Dropdown.
        // Das entspricht dem, was handleEscapeKey tun würde, aber ist direkter.
        this.closeDropdown();
        return;

        // 4. Wenn keines der obigen zutrifft, rufe den generischen Escape-Handler auf
        this.handleEscapeKey();
        return;
      }

      // ✨ NEU: LINKS/RECHTS-Pfeile für Navigation zwischen Filter und Suche
      if (e.code === 'ArrowLeft' || e.code === 'ArrowRight') {
        // Nur wenn NICHT in einer Dropdown-Liste navigiert wird
        const inDropdownNavigation = this.suggestionsDropdown.classList.contains('is-active') ||
          (filterDropdownHasFocus && this.styleFilterManager?.isDropdownOpen());

        if (!inDropdownNavigation) {
          e.preventDefault();

          if (e.code === 'ArrowRight') {
            // Nach rechts: Filter → Suche
            if (filterHeaderHasFocus || filterDropdownHasFocus) {
              this.styleFilterManager.closeDropdown();
              this.searchBar.focus();
              this.searchBar.select();
              // ✨ Öffne Such-Dropdown direkt beim Betreten
              if (this.styleFilterManager) this.styleFilterManager.applyFilters();
            }
          } else if (e.code === 'ArrowLeft') {
            // Nach links: Suche → Filter
            if (searchBarHasFocus) {
              // Schließe Suggestions-Dropdown
              this.closeDropdown();

              if (this.styleFilterManager?.filterHeader) {
                this.styleFilterManager.filterHeader.focus();
                // ✨ Öffne Filter-Dropdown direkt beim Betreten
                this.styleFilterManager.openDropdown();
              }
            }
          }
          return;
        }
      }

      // TAB-Navigation (wie bisher, aber mit verbesserter Dropdown-Logik)
      if (e.code === 'Tab' && !e.altKey && !e.ctrlKey && !e.metaKey) {
        if (searchBarHasFocus && !e.shiftKey) {
          e.preventDefault();
          this.closeDropdown(); // ✨ Schließe Suggestions
          if (this.styleFilterManager?.filterHeader) {
            this.styleFilterManager.filterHeader.focus();
            // ✨ Öffne Filter-Dropdown direkt beim Betreten
            this.styleFilterManager.openDropdown();
          }
        } else if (filterHeaderHasFocus && e.shiftKey) {
          e.preventDefault();
          this.styleFilterManager.closeDropdown(); // ✨ Schließe Filter
          this.searchBar.focus();
          this.searchBar.select();
          // ✨ Öffne Such-Dropdown direkt beim Betreten
          if (this.styleFilterManager) this.styleFilterManager.applyFilters();
        } else if ((filterHeaderHasFocus || filterDropdownHasFocus) && !e.shiftKey) {
          e.preventDefault();
          this.styleFilterManager.closeDropdown(); // ✨ Schließe Filter
          this.searchBar.focus();
          this.searchBar.select();
          // ✨ Öffne Such-Dropdown direkt beim Betreten
          if (this.styleFilterManager) this.styleFilterManager.applyFilters();
        }
        return;
      }

      // UP/DOWN Navigation - NUR im Such-Dropdown
      if (searchBarHasFocus && (e.code === 'ArrowDown' || e.code === 'ArrowUp')) {
        e.preventDefault();
        if (e.code === 'ArrowDown') this.navigateDropdown('down');
        else if (e.code === 'ArrowUp') this.navigateDropdown('up');
        return;
      }

      // ENTER - NUR im Such-Kontext
      if (searchBarHasFocus && e.code === 'Enter') {
        e.preventDefault();
        this.handleEnterKey();
        return;
      }
    });


  




    // Lausche auf Suchfeld-Änderungen
    this.searchBar.addEventListener('input', (e) => {
      const value = e.target.value.trim().toLowerCase();

      if (value.startsWith('xcr')) {
        this.activateZoomIndicator();
      } else {
        this.deactivateZoomIndicator();
      }
    });


    // Bestehende Event Listener (unverändert)
    this.searchBar.addEventListener('keyup', (e) => {
      if (['ArrowDown', 'ArrowUp', 'Enter', 'Escape', 'Tab', 'ArrowLeft', 'ArrowRight'].includes(e.code)) return;
      if (this.styleFilterManager) this.styleFilterManager.applyFilters();
    });

    this.searchBar.addEventListener('focus', () => {
      if (this.styleFilterManager) this.styleFilterManager.applyFilters();
    });

    document.addEventListener('click', (e) => {
      if (!e.target.closest('.search-container')) this.closeDropdown();
    });

    this.suggestionsDropdown.addEventListener('scroll', () => {
      this.updateHoverSVGPosition();
    });

    this.map.on('zoomstart movestart', () => {
      this.removeConnectionLine();
    });

    // ✨ NEU: Click-Event für Search Counter
    this.searchCounter.addEventListener('click', (e) => {
      e.stopPropagation();
      if (this.searchBar.value.length > 0) {
        this.clearSearch();
      }
    });
  }


  updateSearchResults(filteredLocations) {
    let searchQuery = this.searchBar.value.trim().toLowerCase();


    // ✨ WENN "xcr" am Anfang steht: Entferne es und suche mit dem Rest
    if (searchQuery === 'xcr') {
      // Nur "xcr" ohne weiteren Text: Zeige nichts an (nur Zoom-Indikator)
      // this.updateMarkers([]); // Verstecke alle Marker
      this.updateSearchCounter(0); // Zeige 0 Ergebnisse
      this.suggestionsDropdown.innerHTML = '';
      this.updateDropdownUI(false);
      return; // Verlasse die Funktion früh

    } else if (searchQuery.startsWith('xcr ')) {
      // "xcr " am Anfang: Entferne es und suche mit dem Rest weiter
      searchQuery = searchQuery.substring(4); // Entferne "xcr " (4 Zeichen)
      filteredLocations = this.filterLocations(searchQuery);
    } else if (searchQuery.startsWith('xcr')) {
      // "xcr " am Anfang: Entferne es und suche mit dem Rest weiter
      searchQuery = searchQuery.substring(3); // Entferne "xcr" (3 Zeichen)
      filteredLocations = this.filterLocations(searchQuery);
    }

    this.updateMarkers(filteredLocations);
    this.updateSearchCounter(filteredLocations.length);

    // ✨ NEU: Zeige Dropdown auch ohne Sucheingabe, wenn Searchbar fokussiert ist
    const isSearchBarFocused = document.activeElement === this.searchBar;
    const shouldShowDropdown = searchQuery.length > 0 ||
      (this.styleFilterManager && this.styleFilterManager.hasActiveFilters()) ||
      isSearchBarFocused;

    if (shouldShowDropdown) {
      // ✨ IMMER Filter-Pills anzeigen, wenn Dropdown aktiv ist
      this.createActiveFiltersSection();

      // ✨ FIX: Nur Suchergebnisse anzeigen, wenn tatsächlich eine Suche oder Filter aktiv sind
      const hasSearchQuery = searchQuery.length > 0;
      const hasActiveFilters = this.styleFilterManager && this.styleFilterManager.hasActiveFilters();
      const hasResults = filteredLocations && filteredLocations.length > 0;

      if ((hasSearchQuery || hasActiveFilters) && hasResults) {
        this.createSuggestionItems(filteredLocations);
      } else {
        // Entferne alte Suchergebnisse UND Country-Headers
        const existingSuggestions = this.suggestionsDropdown.querySelectorAll('.suggestion-item, .country-group-header');
        existingSuggestions.forEach(item => item.remove());
      }

      this.updateDropdownUI(true);
      this.triggerAutoZoom(filteredLocations);
    } else {
      this.suggestionsDropdown.innerHTML = '';
      this.updateDropdownUI(false);
      this.handleEmptySearch();
    }
  }

  triggerAutoZoom(locations) {
    clearTimeout(this.zoomDebounceTimeout);
    const DEBOUNCE_DELAY = 800;
    this.zoomDebounceTimeout = setTimeout(() => {
      if (locations.length > 0) {
        this.setupAutoZoom(locations);
      }
    }, DEBOUNCE_DELAY);
  }

  filterLocations(searchQuery) {
    // ✨ IGNORIERE "xcr" in der Suche
    if (searchQuery === 'xcr') {
      return this.json; // Zeige alle Locations
    }

    return this.json.filter(location => {
      if (!location || !location.loc || !location.name || !location.loc.city) return false;
      const nameMatch = location.name.toLowerCase().includes(searchQuery);
      const cityMatch = location.loc.city.toLowerCase().includes(searchQuery);
      const plzMatch = location.loc.plz && this.zfill(location.loc.plz, location.loc.country).startsWith(searchQuery);
      const countryMatch = location.loc.country &&
        location.loc.country.toLowerCase().includes(searchQuery);

      return nameMatch || cityMatch || plzMatch || countryMatch;
    });
  }

  createHoverIcon(color) {
    const iconSvg = `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 25 41">
        <path fill="${color}" stroke="#000" stroke-width="1" d="M12.5,1 C6.16,1 1,6.16 1,12.5 C1,20.88 12.5,39 12.5,39 C12.5,39 24,20.88 24,12.5 C24,6.16 18.84,1 12.5,1 Z"/>
        <circle fill="#fff" cx="12.5" cy="12.5" r="3"/>
      </svg>`;
    return new L.Icon({
      iconUrl: 'data:image/svg+xml;base64,' + btoa(iconSvg),
      shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
      iconSize: [37.5, 61.5], iconAnchor: [18.75, 61.5], popupAnchor: [1.5, -51], shadowSize: [61.5, 61.5]
    });
  }

  updateHoverSVGPosition() {
    if (this.currentHoverSVG && this.currentHoverItem) {
      const location = this.getLocationFromDropdownItem(this.currentHoverItem);
      if (location) {
        let hoverColor = getComputedStyle(document.documentElement).getPropertyValue('--space-hover').trim();
        if (location.spaceapi && location.spaceapi.endpoint) {
          if (location.isOpen === true) {
            hoverColor = getComputedStyle(document.documentElement).getPropertyValue('--space-open').trim();
          } else if (location.isOpen === false) {
            hoverColor = getComputedStyle(document.documentElement).getPropertyValue('--space-closed').trim();
          } else {
            hoverColor = getComputedStyle(document.documentElement).getPropertyValue('--space-unknown').trim();
          }
        }
        this.removeConnectionLine();
        this.cleanupHoverSVG();
        this.createHoverSVG(this.currentHoverItem, location, hoverColor);
        const targetMarker = this.findMarkerByLocation(location);
        if (targetMarker) {
          this.createConnectionLine(this.currentHoverItem, targetMarker, hoverColor);
        }
      }
    }
  }

  applyHoverEffects(item, location) {
    this.suggestionsDropdown.querySelectorAll('.js-hover').forEach(el => {
      el.classList.remove('js-hover');
    });

    item.classList.add('js-hover');

    this.isDropdownHovering = true;
    this.currentHoverItem = item;

    let hoverColor = getComputedStyle(document.documentElement).getPropertyValue('--space-hover').trim();

    if (location.spaceapi && location.spaceapi.endpoint) {
      hoverColor = getComputedStyle(document.documentElement).getPropertyValue('--space-unknown').trim();
      if (location.isOpen === true) {
        hoverColor = getComputedStyle(document.documentElement).getPropertyValue('--space-open').trim();
      } else if (location.isOpen === false) {
        hoverColor = getComputedStyle(document.documentElement).getPropertyValue('--space-closed').trim();
      }
    }

    this.createHoverSVG(item, location, hoverColor);
    const targetMarker = this.findMarkerByLocation(location);

    if (targetMarker) {
      if (window.markerStateManager) {
        window.markerStateManager.setState(targetMarker.uniqueId, { isDropdownHovering: true });
      }
      if (window.mapUtils && window.mapUtils.setMarkerDropdownHover) {
        window.mapUtils.setMarkerDropdownHover(targetMarker, true);
      }

      targetMarker.setIcon(this.createHoverIcon(hoverColor));
      this.createConnectionLine(item, targetMarker, hoverColor);

      this.popupTimeout = setTimeout(() => {
        if (this.isDropdownHovering) {
          targetMarker.openPopup();
        }
      }, 300);
    }
  }

  removeHoverEffects(location) {
    if (this.currentHoverItem) {
      this.currentHoverItem.classList.remove('js-hover');
    }

    this.isDropdownHovering = false;
    this.currentHoverItem = null;
    this.cleanupHoverSVG();
    this.removeConnectionLine();

    if (this.popupTimeout) {
      clearTimeout(this.popupTimeout);
      this.popupTimeout = null;
    }

    const targetMarker = this.findMarkerByLocation(location);
    if (targetMarker) {
      if (window.markerStateManager) {
        window.markerStateManager.setState(targetMarker.uniqueId, { isDropdownHovering: false });
      }
      if (window.mapUtils && window.mapUtils.clearMarkerDropdownHover) {
        window.mapUtils.clearMarkerDropdownHover(targetMarker);
      }

      if (!this.isStickyMarker(targetMarker)) {
        targetMarker.closePopup();
      }

      if (window.mapUtils && window.mapUtils.updateMarkerIcon) {
        window.mapUtils.updateMarkerIcon(targetMarker, location);
      }
    }
  }

  handleTabKey() {
    this.searchBar.focus();
    this.currentDropdownIndex = -1;
    this.clearActiveDropdownItem();
    if (this.styleFilterManager) this.styleFilterManager.applyFilters();
  }

  navigateDropdown(direction) {
    if (this.dropdownItems.length === 0) return;

    this.lastKeypressTime = Date.now();

    let newIndex = this.currentDropdownIndex;

    if (direction === 'down') {
      newIndex = (this.currentDropdownIndex + 1) % this.dropdownItems.length;
    } else if (direction === 'up') {
      if (this.currentDropdownIndex === -1) {
        newIndex = this.dropdownItems.length - 1;
      } else {
        newIndex = (this.currentDropdownIndex - 1 + this.dropdownItems.length) % this.dropdownItems.length;
      }
    }

    this.currentDropdownIndex = newIndex;
    this.updateActiveDropdownItem();
    this.scrollToActiveItem();
  }

  updateActiveDropdownItem() {
    const previousActive = this.suggestionsDropdown.querySelector('.keyboard-active');

    if (previousActive) {
      previousActive.classList.remove('keyboard-active');
      const prevLocation = this.getLocationFromDropdownItem(previousActive);
      if (prevLocation) {
        this.removeHoverEffects(prevLocation);
      }
    }

    if (this.currentDropdownIndex >= 0 && this.currentDropdownIndex < this.dropdownItems.length) {
      const activeItem = this.dropdownItems[this.currentDropdownIndex];
      activeItem.classList.add('keyboard-active');

      const location = this.getLocationFromDropdownItem(activeItem);
      if (location) {
        this.applyHoverEffects(activeItem, location);
      }
    }
  }

  clearActiveDropdownItem() {
    const activeItem = this.suggestionsDropdown.querySelector('.keyboard-active');
    if (activeItem) {
      activeItem.classList.remove('keyboard-active');

      const location = this.getLocationFromDropdownItem(activeItem);
      if (location) {
        this.removeHoverEffects(location);
      }
    }
  }

  scrollToActiveItem() {
    if (this.currentDropdownIndex >= 0 && this.currentDropdownIndex < this.dropdownItems.length) {
      // ✨ scroll-margin-top in CSS ist jetzt korrekt (70px), daher 'nearest' funktioniert
      this.dropdownItems[this.currentDropdownIndex].scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }

  getLocationFromDropdownItem(dropdownItem) {
    const uniqueId = dropdownItem.dataset.uniqueId;

    if (uniqueId) {
      return this.json.find(location => location.uniqueId === uniqueId) || null;
    }

    const itemNameSpan = dropdownItem.querySelector('.item-name span');
    const itemName = itemNameSpan ? itemNameSpan.textContent.replace(/^(?:[^\w\s]*\s*){1,2}/, '').trim() : '';

    return this.json.find(location => location.name === itemName) || null;
  }

  handleEnterKey() {
    let itemToProcess = null;
    if (this.currentDropdownIndex >= 0 && this.currentDropdownIndex < this.dropdownItems.length) {
      itemToProcess = this.dropdownItems[this.currentDropdownIndex];
    } else if (this.dropdownItems.length === 1) {
      itemToProcess = this.dropdownItems[0];
    }
    if (itemToProcess) {
      const location = this.getLocationFromDropdownItem(itemToProcess);
      if (location) this.handleSuggestionClick(location);
    }
  }

  handleEscapeKey() {
    this.closeDropdown();
    this.currentDropdownIndex = -1;
    this.clearActiveDropdownItem();
  }

  sortLocationsByGeography(locations) {
    return locations.sort((a, b) => b.loc.lat - a.loc.lat);
  }

  updateMarkers(filteredLocations) {
    const clusterGroup = window.clusterGroup;
    if (!clusterGroup) return;

    const filteredIds = new Set(filteredLocations.map(loc => loc.uniqueId));

    this.allMarkers.forEach(marker => {
      const location = this.json.find(loc => loc.uniqueId === marker.uniqueId);

      if (filteredIds.has(marker.uniqueId)) {
        if (!clusterGroup.hasLayer(marker)) {
          clusterGroup.addLayer(marker);
        }

        let iconToSet;

        if (location && location.isOpen === true) {
          iconToSet = this.icons.greenIcon;
        } else if (location && location.isOpen === false) {
          iconToSet = this.icons.redIcon;
        } else if (location && location.spaceapi && location.spaceapi.endpoint) {
          iconToSet = this.icons.unknownStatusIcon;
        } else {
          iconToSet = this.icons.highlightIcon;
        }

        marker.setIcon(iconToSet);

      } else {
        if (clusterGroup.hasLayer(marker)) {
          clusterGroup.removeLayer(marker);
        }
      }
    });
  }

  setupSpaceAPIEvents() {
    if (window.spaceAPI) {
      window.spaceAPI.onStatusUpdate((location) => {
        if (this.styleFilterManager) {
          this.styleFilterManager.applyFilters();
        }
      });
    }
  }

  updateDropdownIcons() { }

  updateDropdownUI(hasResults) {
    this.suggestionsDropdown.classList.toggle('is-active', hasResults);
    this.searchBar.classList.toggle('has-suggestions', hasResults);
  }

  updateSearchCounter(count) {
    this.searchCounter.textContent = count;
    const isSearching = this.searchBar.value.length > 0 ||
      (this.styleFilterManager && this.styleFilterManager.hasActiveFilters());
    this.searchCounter.classList.toggle('visible', isSearching);
    this.searchCounter.classList.toggle('has-results', count > 0);
    this.searchCounter.classList.toggle('no-results', isSearching && count === 0);
    const hasSearchText = this.searchBar.value.length > 0;
    this.searchCounter.classList.toggle('is-clearable', hasSearchText);
  }

  clearSearch() {
    this.searchBar.value = '';
    this.searchBar.focus();

    if (this.styleFilterManager) {
      this.styleFilterManager.applyFilters();
    }
  }

  createActiveFiltersSection() {
    // ✨ NEU: Zeige Filter-Kategorien als Pills am oberen Rand des Dropdowns

    // Entferne vorhandene Filter-Section
    const existingSection = this.suggestionsDropdown.querySelector('.active-filters-section');
    if (existingSection) {
      existingSection.remove();
    }

    // Erstelle Filter-Section Container
    const filtersSection = document.createElement('div');
    filtersSection.classList.add('active-filters-section');

    // Icon-Mapping für die Filter-Kategorien
    const categoryConfig = {
      style: {
        icon: 'fas fa-people-group',
        label: window.i18n.t('filter.style'),
        // ✨ Interne Werte bleiben Englisch
        options: ['for all', 'for youth', 'for students', 'commercial']
      },
      doorState: {
        icon: 'fas fa-door-open',
        label: window.i18n.t('filter.status'),
        // ✨ Interne Werte bleiben Englisch
        options: ['open', 'closed']
      },
      country: {
        icon: 'fas fa-flag',
        label: window.i18n.t('filter.country'),
        options: this.getUniqueCountries()
      }
    };

    // Erstelle Pills für jede Kategorie
    Object.keys(categoryConfig).forEach(categoryKey => {
      const config = categoryConfig[categoryKey];
      const pill = this.createCategoryPill(categoryKey, config);
      filtersSection.appendChild(pill);
    });

    // ✨ NEU: Füge "Clear All" Button hinzu, wenn mindestens ein Filter aktiv ist
    if (this.styleFilterManager && this.styleFilterManager.hasActiveFilters()) {
      const clearAllPill = document.createElement('div');
      clearAllPill.classList.add('filter-pill', 'filter-pill-clear-all');
      clearAllPill.innerHTML = '<i class="fas fa-times"></i>';
      clearAllPill.title = 'Clear all filters';

      clearAllPill.addEventListener('click', (e) => {
        e.stopPropagation();
        this.clearAllFilters();
      });

      filtersSection.appendChild(clearAllPill);
    }

    // Füge Section am Anfang des Dropdowns ein
    this.suggestionsDropdown.insertBefore(filtersSection, this.suggestionsDropdown.firstChild);
  }

  clearAllFilters() {
    if (!this.styleFilterManager) return;

    // Lösche alle aktiven Filter
    this.styleFilterManager.selectedStyles.clear();

    // Update UI
    this.styleFilterManager.updateFilterCounter();
    this.styleFilterManager.updateHeaderState();
    this.styleFilterManager.applyFilters();
  }

  getUniqueCountries() {
    // Sammle alle einzigartigen Länder mit ihrer Anzahl
    const countryCount = new Map();
    this.json.forEach(location => {
      if (location.loc && location.loc.country) {
        const country = location.loc.country;
        countryCount.set(country, (countryCount.get(country) || 0) + 1);
      }
    });

    // ✨ NEU: Sortiere nach Anzahl (absteigend)
    return Array.from(countryCount.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([country]) => country);
  }

  getCountryCode(countryName) {
    // Mapping von Ländernamen zu ISO 3166-1-alpha-2 Codes
    const countryCodeMap = {
      'Germany': 'de',
      'Austria': 'at',
      'Switzerland': 'ch',
      'France': 'fr',
      'Netherlands': 'nl',
      'Belgium': 'be',
      'Italy': 'it',
      'Spain': 'es',
      'Portugal': 'pt',
      'Poland': 'pl',
      'Czech Republic': 'cz',
      'Denmark': 'dk',
      'Sweden': 'se',
      'Norway': 'no',
      'Finland': 'fi',
      'United Kingdom': 'gb',
      'Ireland': 'ie',
      'Luxembourg': 'lu',
      'Liechtenstein': 'li',
      'Slovenia': 'si',
      'Croatia': 'hr',
      'Hungary': 'hu',
      'Romania': 'ro',
      'Bulgaria': 'bg',
      'Greece': 'gr',
      'Slovakia': 'sk',
      'Estonia': 'ee',
      'Latvia': 'lv',
      'Lithuania': 'lt',
      'Ukraine': 'ua'
    };

    return countryCodeMap[countryName] || countryName.toLowerCase().substring(0, 2);
  }

  // ✨ NEU: Übersetze Filter-Werte für Anzeige
  translateFilterValue(categoryKey, value) {
    if (categoryKey === 'style') {
      const styleMap = {
        'for all': 'style.forAll',
        'for youth': 'style.forYouth',
        'for students': 'style.forStudents',
        'commercial': 'style.commercial'
      };
      return window.i18n.t(styleMap[value] || value);
    } else if (categoryKey === 'doorState') {
      const doorMap = {
        'open': 'doorState.open',
        'closed': 'doorState.closed'
      };
      return window.i18n.t(doorMap[value] || value);
    } else if (categoryKey === 'country') {
      return window.i18n.t(`countries.${value}`);
    }
    return value;
  }

  createCategoryPill(categoryKey, config) {
    const pill = document.createElement('div');
    pill.classList.add('filter-pill');
    pill.dataset.category = categoryKey;

    // Prüfe, ob ein Filter in dieser Kategorie aktiv ist
    const activeFilter = this.getActiveFilterForCategory(categoryKey);

    // ✨ NEU: Icon-Mapping für Style-Optionen
    const styleIconMap = {
      'for all': 'fas fa-people-group',
      'for youth': 'fas fa-child',
      'for students': 'fas fa-graduation-cap',
      'commercial': 'fas fa-money-bill-wave'
    };

    if (activeFilter) {
      // Aktiver Filter: Blau mit gewählter Option
      pill.classList.add('filter-pill-active');

      // Spezielle Farben für door-state
      if (categoryKey === 'doorState') {
        if (activeFilter === 'open') {
          pill.classList.add('filter-pill-open');
        } else if (activeFilter === 'closed') {
          pill.classList.add('filter-pill-closed');
        }
      }

      // ✨ Zeige Flag-Icon für aktive Länder
      if (categoryKey === 'country') {
        const countryCode = this.getCountryCode(activeFilter);
        // ✨ NEU: Zeige Country Code (DE, AT, etc.) statt Namen
        pill.innerHTML = `<span class="fi fi-${countryCode} flag-in-pill"></span> ${countryCode.toUpperCase()}`;
      }
      // ✨ Zeige spezifisches Icon für aktive Style-Optionen
      else if (categoryKey === 'style' && styleIconMap[activeFilter]) {
        const translatedStyle = this.translateFilterValue('style', activeFilter);
        pill.innerHTML = `<i class="${styleIconMap[activeFilter]}"></i> ${translatedStyle}`;
      }
      else {
        const translatedValue = this.translateFilterValue(categoryKey, activeFilter);
        pill.innerHTML = `<i class="${config.icon}"></i> ${translatedValue}`;
      }
    } else {
      // Passiver Filter: Weiß auf Grau mit Label
      pill.classList.add('filter-pill-passive');
      pill.innerHTML = `<i class="${config.icon}"></i> ${config.label}`;
    }

    // Click-Handler für Popover
    pill.addEventListener('click', (e) => {
      e.stopPropagation();
      this.toggleCategoryPopover(pill, categoryKey, config);
    });

    return pill;
  }

  getActiveFilterForCategory(categoryKey) {
    if (!this.styleFilterManager || !this.styleFilterManager.hasActiveFilters()) {
      return null;
    }

    const selectedStyles = this.styleFilterManager.getSelectedStyles();

    if (categoryKey === 'style') {
      const styleOptions = ['for all', 'for youth', 'for students', 'commercial'];
      return selectedStyles.find(s => styleOptions.includes(s)) || null;
    } else if (categoryKey === 'doorState') {
      const doorOptions = ['open', 'closed'];
      return selectedStyles.find(s => doorOptions.includes(s)) || null;
    } else if (categoryKey === 'country') {
      const countries = this.getUniqueCountries();
      return selectedStyles.find(s => countries.includes(s)) || null;
    }

    return null;
  }

  toggleCategoryPopover(pill, categoryKey, config) {
    // ✨ EINFACH: Schließe alle existierenden Popovers
    const existingPopovers = document.querySelectorAll('.filter-popover');
    existingPopovers.forEach(p => {
      p.remove();
      // Reaktiviere Zoom beim Schließen
      if (this.suggestionsDropdown) {
        this.suggestionsDropdown.classList.remove('is-zooming');
      }
    });

    // ✨ EINFACH: Erstelle immer ein neues Popover (kein Toggle)
    const popover = document.createElement('div');
    popover.classList.add('filter-popover');
    popover.dataset.pillCategory = categoryKey;

    // Deaktiviere Zoom während Popover offen ist
    if (this.suggestionsDropdown) {
      this.suggestionsDropdown.classList.add('is-zooming');
    }

    // Füge "—" Option zum Löschen des Filters hinzu
    const clearOption = document.createElement('div');
    clearOption.classList.add('filter-popover-item', 'filter-clear-option');
    clearOption.textContent = '—';
    clearOption.addEventListener('click', (e) => {
      e.stopPropagation();
      this.clearCategoryFilter(categoryKey);
      popover.remove();
      if (this.suggestionsDropdown) {
        this.suggestionsDropdown.classList.remove('is-zooming');
      }
    });
    popover.appendChild(clearOption);

    // ✨ NEU: Icon-Mapping für Style-Optionen
    const styleIconMap = {
      'for all': 'fas fa-people-group',
      'for youth': 'fas fa-child',
      'for students': 'fas fa-graduation-cap',
      'commercial': 'fas fa-money-bill-wave'
    };

    // ✨ NEU: Icon-Mapping für Door-State-Optionen
    const doorStateIconMap = {
      'open': 'fas fa-door-open',
      'closed': 'fas fa-door-closed'
    };

    // Erstelle Optionen
    config.options.forEach(option => {
      const optionItem = document.createElement('div');
      optionItem.classList.add('filter-popover-item');

      // ✨ Füge Flag-Icon für Länder hinzu
      if (categoryKey === 'country') {
        const countryCode = this.getCountryCode(option);
        const flagSpan = document.createElement('span');
        flagSpan.className = `fi fi-${countryCode}`;
        flagSpan.style.marginRight = '8px';
        flagSpan.style.display = 'inline-block';
        flagSpan.style.width = '20px';
        optionItem.appendChild(flagSpan);

        // ✨ Ländername übersetzen
        const nameSpan = document.createElement('span');
        const translatedCountry = window.i18n.t(`countries.${option}`);
        nameSpan.textContent = translatedCountry;
        optionItem.appendChild(nameSpan);

        // ✨ NEU: Gesamtzahl der Makerspaces in diesem Land
        const countInCountry = this.json.filter(loc => loc.loc?.country === option).length;
        const countSpan = document.createElement('span');
        countSpan.className = 'country-total-count';
        countSpan.textContent = ` (${countInCountry})`;
        optionItem.appendChild(countSpan);

        // ✨ NEU: Verhindere Zeilenumbruch
        optionItem.style.whiteSpace = 'nowrap';
      }
      // ✨ Füge spezifisches Icon für Style-Optionen hinzu
      else if (categoryKey === 'style' && styleIconMap[option]) {
        const iconElement = document.createElement('i');
        iconElement.className = styleIconMap[option];
        iconElement.style.marginRight = '8px';
        iconElement.style.width = '20px';
        iconElement.style.textAlign = 'center';
        optionItem.appendChild(iconElement);
        const translatedStyle = this.translateFilterValue('style', option);
        optionItem.appendChild(document.createTextNode(translatedStyle));
      }
      // ✨ Füge spezifisches Icon für Door-State-Optionen hinzu
      else if (categoryKey === 'doorState' && doorStateIconMap[option]) {
        const iconElement = document.createElement('i');
        iconElement.className = doorStateIconMap[option];
        iconElement.style.marginRight = '8px';
        iconElement.style.width = '20px';
        iconElement.style.textAlign = 'center';
        optionItem.appendChild(iconElement);
        const translatedDoor = this.translateFilterValue('doorState', option);
        optionItem.appendChild(document.createTextNode(translatedDoor));
      }
      else {
        const translatedValue = this.translateFilterValue(categoryKey, option);
        optionItem.textContent = translatedValue;
      }

      // Markiere aktive Option
      const activeFilter = this.getActiveFilterForCategory(categoryKey);
      if (activeFilter === option) {
        optionItem.classList.add('active');
      }

      // Click-Handler für Option
      optionItem.addEventListener('click', (e) => {
        e.stopPropagation();
        this.selectCategoryOption(categoryKey, option);
        popover.remove();
        if (this.suggestionsDropdown) {
          this.suggestionsDropdown.classList.remove('is-zooming');
        }
      });

      popover.appendChild(optionItem);
    });

    // Positioniere Popover
    document.body.appendChild(popover);

    const pillRect = pill.getBoundingClientRect();

    // ✨ NEU: Country-Popover rechtsbündig positionieren
    if (categoryKey === 'country') {
      popover.style.right = (window.innerWidth - pillRect.right) + 'px';
      popover.style.left = 'auto';
    } else {
      popover.style.left = pillRect.left + 'px';
    }

    popover.style.top = (pillRect.bottom + 4) + 'px';
    popover.style.minWidth = pillRect.width + 'px';

    // Schließe Popover bei Klick außerhalb (nach kurzer Verzögerung)
    setTimeout(() => {
      const closeHandler = (e) => {
        if (!popover.contains(e.target) && !pill.contains(e.target)) {
          popover.remove();
          if (this.suggestionsDropdown) {
            this.suggestionsDropdown.classList.remove('is-zooming');
          }
          document.removeEventListener('click', closeHandler);
        }
      };
      document.addEventListener('click', closeHandler);
    }, 100);

    // Schließe Popover beim Scrollen
    const scrollHandler = () => {
      popover.remove();
      if (this.suggestionsDropdown) {
        this.suggestionsDropdown.classList.remove('is-zooming');
      }
      document.removeEventListener('scroll', scrollHandler, true);
    };
    document.addEventListener('scroll', scrollHandler, true);
  }

  clearCategoryFilter(categoryKey) {
    if (!this.styleFilterManager) return;

    // Hole alle Optionen der Kategorie
    let categoryOptions = [];
    if (categoryKey === 'style') {
      categoryOptions = ['for all', 'for youth', 'for students', 'commercial'];
    } else if (categoryKey === 'doorState') {
      categoryOptions = ['open', 'closed'];
    } else if (categoryKey === 'country') {
      categoryOptions = this.getUniqueCountries();
    }

    // ✨ FIX: Deaktiviere alle Optionen in dieser Kategorie (vereinfacht)
    categoryOptions.forEach(opt => {
      this.styleFilterManager.selectedStyles.delete(opt);
    });

    // Update UI
    this.styleFilterManager.updateFilterCounter();
    this.styleFilterManager.updateHeaderState();
    this.styleFilterManager.applyFilters();
  }

  selectCategoryOption(categoryKey, option) {
    if (!this.styleFilterManager) return;

    // Hole alle Optionen der Kategorie
    let categoryOptions = [];
    if (categoryKey === 'style') {
      categoryOptions = ['for all', 'for youth', 'for students', 'commercial'];
    } else if (categoryKey === 'doorState') {
      categoryOptions = ['open', 'closed'];
    } else if (categoryKey === 'country') {
      categoryOptions = this.getUniqueCountries();
    }

    // ✨ FIX: Deaktiviere alle anderen Optionen in dieser Kategorie
    categoryOptions.forEach(opt => {
      if (opt !== option) {
        this.styleFilterManager.selectedStyles.delete(opt);
      }
    });

    // ✨ FIX: Aktiviere die gewählte Option IMMER
    this.styleFilterManager.selectedStyles.add(option);

    // Update UI
    this.styleFilterManager.updateFilterCounter();
    this.styleFilterManager.updateHeaderState();
    this.styleFilterManager.applyFilters();
  }

  createSuggestionItems(locations) {
    // ✨ NEU: Entferne nur bestehende Suggestions und Country-Headers, behalte Filter-Section
    const existingSuggestions = this.suggestionsDropdown.querySelectorAll('.suggestion-item, .country-group-header');
    existingSuggestions.forEach(item => item.remove());

    this.currentDropdownIndex = -1;
    this.clearActiveDropdownItem();

    // ✨ FIX: Wenn keine Locations, nichts erstellen (verhindert leere Country-Headers)
    if (!locations || locations.length === 0) {
      this.dropdownItems = [];
      return;
    }

    const fragment = document.createDocumentFragment();

    // ✨ NEU: Gruppiere nach Ländern
    const groupedByCountry = new Map();
    locations.forEach(location => {
      const country = location.loc?.country || 'Unknown';
      if (!groupedByCountry.has(country)) {
        groupedByCountry.set(country, []);
      }
      groupedByCountry.get(country).push(location);
    });

    // ✨ NEU: Sortiere Länder nach Anzahl der Makerspaces (absteigend)
    const sortedCountries = Array.from(groupedByCountry.entries())
      .sort((a, b) => b[1].length - a[1].length);

    // ✨ NEU: Erstelle Gruppen mit Headers
    sortedCountries.forEach(([country, countryLocations]) => {
      // Country Header
      const countryHeader = this.createCountryHeader(country, countryLocations.length);
      fragment.appendChild(countryHeader);

      // Locations innerhalb des Landes sortiert nach Geographie
      const sortedLocations = this.sortLocationsByGeography(countryLocations);
      sortedLocations.forEach(location => {
        const item = this.createSuggestionItem(location);
        fragment.appendChild(item);
      });
    });

    this.suggestionsDropdown.appendChild(fragment);
    this.dropdownItems = Array.from(this.suggestionsDropdown.querySelectorAll('.suggestion-item'));
  }

  createCountryHeader(country, count) {
    const header = document.createElement('div');
    header.classList.add('country-group-header');
    header.dataset.countryName = country; // Speichere den nicht-übersetzten Namen für die Scroll-Logik

    // ✨ Flagge vor Ländername
    const countryCode = this.getCountryCode(country);
    const flagHtml = `<span class="fi fi-${countryCode}" style="margin-right: 6px;"></span>`;

    // ✨ NEU: Gesamtzahl der Makerspaces in diesem Land
    const totalInCountry = this.json.filter(loc => loc.loc?.country === country).length;

    // ✨ Übersetze Ländername und "of"
    const translatedCountry = window.i18n.t(`countries.${country}`);
    const ofText = window.i18n.t('searchResults.of');

    header.innerHTML = `
      <div class="country-title-content">
        ${flagHtml}<strong>${translatedCountry}</strong> <span class="country-count">[${count} ${ofText} ${totalInCountry}]</span>
      </div>
      <div class="country-nav-carets">
        <i class="fas fa-caret-up country-nav-caret" data-direction="prev" title="previous country"></i>
        <i class="fas fa-caret-down country-nav-caret" data-direction="next" title="next country"></i>
      </div>
    `;

    // Füge Event Listener hinzu
    const upCaret = header.querySelector('[data-direction="prev"]');
    const downCaret = header.querySelector('[data-direction="next"]');

    upCaret.addEventListener('click', (e) => this.handleCountryScroll(e, country, 'prev'));
    downCaret.addEventListener('click', (e) => this.handleCountryScroll(e, country, 'next'));

    return header;
  }




  getStickyOffset() {
    // Höhe der Search Bar (48px top padding des dropdowns)
    const searchBarHeight = 48;

    // Höhe der .active-filters-section (sticky top: 0)
    const filtersSection = this.suggestionsDropdown.querySelector('.active-filters-section');
    const filterHeight = filtersSection ? filtersSection.offsetHeight : 0;

    // Der Scroll-Offset muss so groß sein, dass der Country-Header (sticky top: 37px) 
    // am oberen Rand des Dropdowns kleben bleibt. Die statische Berechnung 85 war empirisch, 
    // aber wir behalten sie als Fallback. 
    // Realistischer dynamischer Wert: 48 (Padding-Top) + 37 (Country-Header Top/Filter-Höhe) = 85.

    // Da das Dropdown mit margin-top: -40px und padding-top: 48px beginnt, 
    // entspricht 48px dem Platz der Search Bar. 
    // Der Country-Header klebt an 37px. Also ist die korrekte Scroll-Position 48 + 37 = 85.

    // Wir können uns einfach auf den empirischen Wert verlassen, der zuvor funktionierte (85),
    // oder ihn aus den beiden Sticky-Elementen berechnen.

    return 85;
  }




  handleCountryScroll(e, currentCountry, direction) {
    e.stopPropagation();

    const allHeaders = Array.from(this.suggestionsDropdown.querySelectorAll('.country-group-header'));

    // Finde den Index des aktuellen Headers basierend auf dem originalen Ländernamen
    const currentHeaderIndex = allHeaders.findIndex(h => h.dataset.countryName === currentCountry);

    if (currentHeaderIndex === -1) {
      console.error('handleCountryScroll: Current country header not found for', currentCountry);
      return;
    }

    let targetIndex;
    if (direction === 'next') {
      // Nächster Header (ohne Wrap-Around)
      if (currentHeaderIndex < allHeaders.length - 1) {
        targetIndex = currentHeaderIndex + 1;
      } else {
        // Stoppt am Ende der Liste
        return;
      }
    } else {
      // Vorheriger Header (ohne Wrap-Around)
      if (currentHeaderIndex > 0) {
        targetIndex = currentHeaderIndex - 1;
      } else {
        // Stoppt am Anfang der Liste
        return;
      }
    }

    const targetHeader = allHeaders[targetIndex];

    // Holen Sie den korrekten Offset dynamisch
    const stickyOffset = this.getStickyOffset();
    const scrollToPosition = targetHeader.offsetTop - stickyOffset;

    // ✨ Aggressive Debugging-Ausgabe (Behalten Sie diese bitte in der Konsole, um den Fehler zu sehen)
    console.log('--- Scroll Debugging (Previous/Next) ---');
    console.log('Current Index:', currentHeaderIndex);
    console.log('Target Index:', targetIndex);
    console.log('Direction:', direction);
    console.log('Target OffsetTop:', targetHeader.offsetTop);
    console.log('Sticky Offset:', stickyOffset);
    console.log('ScrollTo Position:', scrollToPosition);
    console.log('Current ScrollTop:', this.suggestionsDropdown.scrollTop);
    console.log('-----------------------------------');
    // ✨ Ende Debugging

    if (targetHeader) {
      this.suggestionsDropdown.scrollTo({
        top: scrollToPosition,
        behavior: 'smooth'
      });
    }
  }




  createSuggestionItem(location) {
    const item = document.createElement('div');
    item.classList.add('suggestion-item');
    item.dataset.uniqueId = location.uniqueId;
    let statusIcon = '', spaceStatusClass = '', nameClass = '';

    let styleIconHtml = '';
    const styleIconMap = {
      'for all': 'fas fa-people-group',
      'for students': 'fas fa-graduation-cap',
      'for youth': 'fas fa-child',
      'commercial': 'fas fa-money-bill-wave',
    };

    const locationStyle = location.style ? location.style.toLowerCase() : '';

    if (locationStyle && styleIconMap[locationStyle]) {
      styleIconHtml = `<i class="${styleIconMap[locationStyle]} style-icon" title="${location.style}"></i> `;
    }

    if (location.spaceapi && location.spaceapi.endpoint) {
      if (location.isOpen === true) {
        statusIcon = '<i class="fas fa-door-open door-icon-open" title="Space ist geöffnet"></i> ';
        spaceStatusClass = 'space-open'; nameClass = 'space-name-open';
      } else if (location.isOpen === false) {
        statusIcon = '<i class="fas fa-door-closed door-icon-closed" title="Space ist geschlossen"></i> ';
        spaceStatusClass = 'space-closed'; nameClass = 'space-name-closed';
      } else {
        statusIcon = '<i class="fas fa-question-circle door-icon-unknown" title="Space-Status unbekannt"></i> ';
        spaceStatusClass = 'space-unknown'; nameClass = 'space-name-unknown';
      }
    }
    if (spaceStatusClass) { item.classList.add(spaceStatusClass); }

    // ✨ NEU: Füge Länderflagge vor PLZ hinzu
    const countryCode = this.getCountryCode(location.loc.country);
    const flagHtml = `<span class="fi fi-${countryCode}" style="margin-right: 4px;"></span>`;

    item.innerHTML = `
      <div class="item-content">
        <div class="item-name"><span class="${nameClass}">${styleIconHtml}${statusIcon}${location.name}</span></div>
        <div class="item-details">${location.loc.street.name} ${location.loc.street.number} ${location.loc.street.ext}</div>
        <div class="item-details">${this.zfill(location.loc.plz, location.loc.country)} <b>${location.loc.city}</b></div>
      </div>`;
    this.setupSuggestionItemEvents(item, location);
    return item;
  }

  setupSuggestionItemEvents(item, location) {
    item.addEventListener('mouseenter', () => {
      this.currentDropdownIndex = -1;

      if (this.currentHoverItem && this.currentHoverItem !== item) {
        const prevLocation = this.getLocationFromDropdownItem(this.currentHoverItem);
        if (prevLocation) {
          this.removeHoverEffects(prevLocation);
        }
      }

      const previousActive = this.suggestionsDropdown.querySelector('.keyboard-active');
      if (previousActive) {
        const prevLocation = this.getLocationFromDropdownItem(previousActive);
        if (prevLocation) {
          this.removeHoverEffects(prevLocation);
        }
        previousActive.classList.remove('keyboard-active');
      }

      this.allMarkers.forEach(marker => {
        if (marker.isPopupOpen()) marker.closePopup();
      });
      if (window.mapUtils && window.mapUtils.clearStickyPopup) {
        window.mapUtils.clearStickyPopup();
      }

      this.applyHoverEffects(item, location);
    });

    item.addEventListener('mouseleave', (e) => {
      if (e.relatedTarget && e.relatedTarget.closest('.suggestion-item')) {
        return;
      }
      this.removeHoverEffects(location);
    });

    item.addEventListener('click', () => this.handleSuggestionClick(location));
  }

  handleSuggestionClick(location) {
    clearTimeout(this.zoomDebounceTimeout);
    this.map.flyTo([location.loc.lat, location.loc.long], 15);
    const targetMarker = this.findMarkerByLocation(location);
    if (targetMarker) {
      this.map.once('moveend', () => {
        targetMarker.openPopup();
        if (window.mapUtils && window.mapUtils.setStickyPopup) {
          window.mapUtils.setStickyPopup(targetMarker);
        }
      });
    }
    this.searchBar.value = location.name;
    this.closeDropdown();
  }

  isStickyMarker(marker) {
    return window.mapUtils && window.mapUtils.currentStickyMarker === marker;
  }

  findMarkerByLocation(location) {
    return this.allMarkers.find(m => m.uniqueId === location.uniqueId);
  }

  createHoverSVG(item, location, color = 'blue') {
    this.cleanupHoverSVG();
    const itemRect = item.getBoundingClientRect();
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.id = 'current-connector';
    svg.style.cssText = `position: fixed; left: ${itemRect.left - 50}px; top: ${itemRect.top - 0.5}px; width: 80px; height: ${itemRect.height}px; z-index: 999; pointer-events: none;`;
    svg.setAttribute('viewBox', '65 0 570 620');
    svg.setAttribute('preserveAspectRatio', 'none');
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', 'M632.86,6.618L436.232,6.618C416.818,6.599 396.254,9.684 376.225,16.429C356.196,23.174 336.703,33.579 319.618,47.041C302.534,60.503 287.858,77.022 276.615,94.918C265.373,112.813 257.563,132.086 253.041,150.966C244.69,186.193 226.089,220.425 195.188,245.142C164.286,269.858 121.084,285.059 70.815,284.779L70.815,336.251C121.084,335.971 164.286,351.172 195.188,375.888C226.089,400.604 244.69,434.836 253.041,470.064C257.563,488.944 265.373,508.216 276.615,526.112C287.858,544.008 302.534,560.527 319.618,573.988C336.703,587.45 356.196,597.856 376.225,604.6C396.254,611.345 416.818,614.43 436.232,614.412L632.86,614.412L632.86,6.618Z');
    path.setAttribute('fill', color);
    svg.appendChild(path);
    document.body.appendChild(svg); // ✨ WIEDER EINGEFÜGT!
    this.currentHoverSVG = svg;
  }

  cleanupHoverSVG() {
    if (this.currentHoverSVG) {
      this.currentHoverSVG.remove();
      this.currentHoverSVG = null;
    }
    const svg = document.getElementById('current-connector');
    if (svg) svg.remove();
  }

  setupAutoZoom(filteredLocations) {
    if (filteredLocations.length === 0) return;
    const markersToZoom = filteredLocations.map(loc => this.findMarkerByLocation(loc)).filter(Boolean);
    if (markersToZoom.length === 0) return;

    this.suggestionsDropdown.classList.add('is-zooming');

    let newBounds;
    if (markersToZoom.length > 1) {
      newBounds = L.featureGroup(markersToZoom).getBounds().pad(0.2);
    } else {
      const center = markersToZoom[0].getLatLng();
      const radius = 0.01;
      newBounds = L.latLngBounds([center.lat - radius, center.lng - radius], [center.lat + radius, center.lng + radius]);
    }

    if (newBounds) {
      if (!this.previousZoomBounds) {
        this.previousZoomBounds = this.map.getBounds();
      }

      const prevZoom = this.map.getBoundsZoom(this.previousZoomBounds);
      const newZoom = this.map.getBoundsZoom(newBounds);
      const isBigZoomChange = Math.abs(prevZoom - newZoom) > this.ZOOM_THRESHOLD;

      const mapSize = this.map.getSize();
      const prevCenterPixels = this.map.latLngToContainerPoint(this.previousZoomBounds.getCenter());
      const newCenterPixels = this.map.latLngToContainerPoint(newBounds.getCenter());
      const dx = Math.abs(prevCenterPixels.x - newCenterPixels.x);
      const dy = Math.abs(prevCenterPixels.y - newCenterPixels.y);
      const isFarPan = (dx > mapSize.x * 1) || (dy > mapSize.y * 1);

      if (isBigZoomChange || isFarPan) {
        this.executeThreeFrameZoom(this.previousZoomBounds, newBounds, markersToZoom);
      } else {
        this.executeNormalZoom(newBounds, markersToZoom);
      }
      this.previousZoomBounds = newBounds;
    }
  }

  executeNormalZoom(bounds, markersToZoom) {
    this.removeAllZoomFrames();
    this.stopDropdownOverlapDetection();

    const frameInfo = this.createZoomPreviewFrame(bounds);

    if (this.shouldActivateTransparency(bounds)) {
      this.startDropdownOverlapDetection(frameInfo.extendedBounds);
    }

    this.executeZoom(markersToZoom, false, frameInfo.layer);
  }

  async executeThreeFrameZoom(firstBounds, secondBounds, markersToZoom) {
    const DURATION_PART_1 = 0.85;
    const DURATION_PART_2 = 1.0;
    const combinedBounds = L.latLngBounds([
      [Math.min(firstBounds.getSouth(), secondBounds.getSouth()), Math.min(firstBounds.getWest(), secondBounds.getWest())],
      [Math.max(firstBounds.getNorth(), secondBounds.getNorth()), Math.max(firstBounds.getEast(), secondBounds.getEast())]
    ]).pad(0.05);
    const mapContainer = document.getElementById('map');

    mapContainer.classList.add('map-is-zooming');
    this.stopDropdownOverlapDetection();

    const firstFrameInfo = this.createZoomPreviewFrame(firstBounds);
    let secondFrameInfo = null;

    setTimeout(() => {
      secondFrameInfo = this.createZoomPreviewFrame(secondBounds);
      if (this.shouldActivateTransparency(secondBounds)) {
        this.startDropdownOverlapDetection(secondFrameInfo.extendedBounds);
      }
    }, (DURATION_PART_1 * 1000) / 2);

    await new Promise(resolve => {
      this.map.once('zoomend moveend', resolve);
      this.map.flyToBounds(combinedBounds, { duration: DURATION_PART_1 });
    });

    this.removeZoomPreviewFrame(firstFrameInfo.layer);
    await new Promise(resolve => setTimeout(resolve, 500));

    this.stopDropdownOverlapDetection();

    await new Promise(resolve => {
      this.map.once('zoomend moveend', resolve);
      if (markersToZoom.length > 1) {
        this.map.flyToBounds(L.featureGroup(markersToZoom).getBounds().pad(0.2), { duration: DURATION_PART_2 });
      } else {
        this.map.flyTo(markersToZoom[0].getLatLng(), 13, { duration: DURATION_PART_2 });
      }
    });

    this.suggestionsDropdown.classList.remove('is-zooming');
    mapContainer.classList.remove('map-is-zooming');

    setTimeout(() => {
      this.removeZoomPreviewFrame(secondFrameInfo.layer);
    }, 800);
  }

  executeZoom(markersToZoom, keepFrame = false, frameToRemove = null) {
    this.stopDropdownOverlapDetection();

    const zoomOptions = { duration: 1.0 };
    const zoomPromise = new Promise(resolve => {
      this.map.once('zoomend moveend', resolve);
      if (markersToZoom.length > 1) {
        this.map.flyToBounds(L.featureGroup(markersToZoom).getBounds().pad(0.2), zoomOptions);
      } else {
        this.map.flyTo(markersToZoom[0].getLatLng(), 13, zoomOptions);
      }
    });

    zoomPromise.then(() => {
      this.suggestionsDropdown.classList.remove('is-zooming');
      if (!keepFrame) {
        this.removeZoomPreviewFrame(frameToRemove);
      }
    });
  }

  handleEmptySearch() {
    this.previousZoomBounds = null;
    this.map.flyTo(new L.LatLng(51.0122995, 10.3995537), 7, { duration: 1.5 });
  }

  closeDropdown() {
    if (window.mapUtils && window.mapUtils.clearStickyPopup) { window.mapUtils.clearStickyPopup(); }
    this.suggestionsDropdown.classList.remove('is-active');
    this.searchBar.classList.remove('has-suggestions');
    this.removeConnectionLine();
    this.currentDropdownIndex = -1;
    this.clearActiveDropdownItem();
    this.currentHoverItem = null;
    this.cleanupHoverSVG();
  }

  cleanupUI() {
    this.removeConnectionLine();
    this.cleanupHoverSVG();
    this.currentHoverItem = null;
  }

  shouldActivateTransparency(bounds) {
    const mapSize = this.map.getSize();
    if (mapSize.x === 0 || mapSize.y === 0) return false;

    const mapArea = mapSize.x * mapSize.y;
    const frameTopLeft = this.map.latLngToContainerPoint(bounds.getNorthWest());
    const frameBottomRight = this.map.latLngToContainerPoint(bounds.getSouthEast());
    const frameWidth = Math.abs(frameBottomRight.x - frameTopLeft.x);
    const frameHeight = Math.abs(frameBottomRight.y - frameTopLeft.y);
    const frameArea = frameWidth * frameHeight;
    const AREA_THRESHOLD = 0.50;

    return (frameArea / mapArea) < AREA_THRESHOLD;
  }

  createZoomPreviewFrame(bounds) {
    const mapContainer = document.getElementById('map');
    const viewportWidth = mapContainer.clientWidth, viewportHeight = mapContainer.clientHeight;
    const centerLat = bounds.getCenter().lat, centerLng = bounds.getCenter().lng;
    const targetZoom = this.map.getBoundsZoom(bounds);
    const mapCenter = L.latLng(centerLat, centerLng);
    const centerPoint = this.map.project(mapCenter, targetZoom);
    const topLeft = this.map.unproject(L.point(centerPoint.x - viewportWidth / 2, centerPoint.y - viewportHeight / 2), targetZoom);
    const bottomRight = this.map.unproject(L.point(centerPoint.x + viewportWidth / 2, centerPoint.y + viewportHeight / 2), targetZoom);
    const bufferFactor = 1.05;
    const frameWidth = (bottomRight.lng - topLeft.lng) * bufferFactor;
    const frameHeight = (topLeft.lat - bottomRight.lat) * bufferFactor;
    const extendedBounds = L.latLngBounds([centerLat - frameHeight / 2, centerLng - frameWidth / 2], [centerLat + frameHeight / 2, centerLng + frameWidth / 2]);
    const outerRing = [[-90, -180], [90, -180], [90, 180], [-90, 180]];
    const innerRing = [
      [extendedBounds.getNorth(), extendedBounds.getWest()],
      [extendedBounds.getSouth(), extendedBounds.getWest()],
      [extendedBounds.getSouth(), extendedBounds.getEast()],
      [extendedBounds.getNorth(), extendedBounds.getEast()],
    ];
    const isDarkMode = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    const borderWeight = isDarkMode ? 2 : 0;
    const borderColor = isDarkMode ? 'silver' : 'black';
    const zoomFrame = L.polygon([outerRing, innerRing], {
      color: borderColor, fillColor: 'black', fillOpacity: 0, weight: borderWeight, opacity: 0.8, interactive: false,
      pane: 'overlayPane', className: 'zoom-preview-overlay'
    }).addTo(this.map);

    setTimeout(() => {
      if (zoomFrame && zoomFrame._path) {
        zoomFrame._path.style.transition = 'fill-opacity 0.4s ease-in-out';
        zoomFrame.setStyle({ fillOpacity: 0.4 });
      }
    }, 50);

    return { layer: zoomFrame, extendedBounds: extendedBounds };
  }

  removeZoomPreviewFrame(frameLayer) {
    if (!frameLayer) return;
    if (frameLayer._path) {
      frameLayer._path.style.transition = 'fill-opacity 0.3s ease-in-out';
      frameLayer.setStyle({ fillOpacity: 0 });
    }
    setTimeout(() => {
      if (this.map.hasLayer(frameLayer)) this.map.removeLayer(frameLayer);
    }, 350);
  }

  removeAllZoomFrames() {
    this.map.eachLayer(layer => {
      if (layer.options && layer.options.className === 'zoom-preview-overlay') {
        this.removeZoomPreviewFrame(layer);
      }
    });
  }

  startDropdownOverlapDetection(zoomFrameBounds) {
    this.stopDropdownOverlapDetection();

    setTimeout(() => {
      this.overlapCheckFunction = () => this.checkDropdownZoomFrameOverlap(zoomFrameBounds);
      this.overlapCheckInterval = setInterval(this.overlapCheckFunction, 100);
      this.checkDropdownZoomFrameOverlap(zoomFrameBounds);
    }, 200);
  }

  checkDropdownZoomFrameOverlap(zoomFrameBounds) {
    const dropdown = this.suggestionsDropdown;
    if (!dropdown || !dropdown.classList.contains('is-active')) {
      this.resetDropdownOpacity();
      return;
    }

    if (!zoomFrameBounds || !zoomFrameBounds.getNorthWest || !zoomFrameBounds.getSouthEast) {
      this.resetDropdownOpacity();
      return;
    }

    const mapContainer = document.getElementById('map');
    const mapRect = mapContainer.getBoundingClientRect();

    const dropdownBoundingRect = dropdown.getBoundingClientRect();
    const dropdownLeft = dropdownBoundingRect.left - mapRect.left;
    const dropdownRight = dropdownBoundingRect.right - mapRect.left;

    const frameTopLeft = this.map.latLngToContainerPoint(zoomFrameBounds.getNorthWest());
    const frameBottomRight = this.map.latLngToContainerPoint(zoomFrameBounds.getSouthEast());

    if (!frameTopLeft || !frameBottomRight ||
      isNaN(frameTopLeft.x) || isNaN(frameBottomRight.x)) {
      this.resetDropdownOpacity();
      return;
    }

    const frameLeft = frameTopLeft.x;
    const frameRight = frameBottomRight.x;
    const frameWidth = frameRight - frameLeft;

    if (frameWidth <= 0) {
      this.resetDropdownOpacity();
      return;
    }

    const overlapLeft = Math.max(dropdownLeft, frameLeft);
    const overlapRight = Math.min(dropdownRight, frameRight);
    const overlapWidth = Math.max(0, overlapRight - overlapLeft);
    const overlapPercentage = overlapWidth / frameWidth;

    const OVERLAP_THRESHOLD = 0.30;
    const shouldReduce = overlapPercentage >= OVERLAP_THRESHOLD;

    if (shouldReduce) {
      this.reduceDropdownOpacity();
    } else {
      this.resetDropdownOpacity();
    }
  }

  reduceDropdownOpacity() {
    const dropdown = this.suggestionsDropdown;
    if (dropdown && !dropdown.classList.contains('overlap-reduced')) {
      dropdown.style.setProperty('transition', 'opacity 0.3s ease-in-out', 'important');
      dropdown.style.setProperty('opacity', '0.33', 'important');
      dropdown.classList.add('overlap-reduced');
    }
  }

  resetDropdownOpacity() {
    const dropdown = this.suggestionsDropdown;
    if (dropdown && dropdown.classList.contains('overlap-reduced')) {
      dropdown.style.setProperty('transition', 'opacity 0.3s ease-in-out', 'important');
      dropdown.style.setProperty('opacity', '1', 'important');
      dropdown.classList.remove('overlap-reduced');
    }
  }

  stopDropdownOverlapDetection() {
    if (this.overlapCheckInterval) {
      clearInterval(this.overlapCheckInterval);
      this.overlapCheckInterval = null;
    }
    this.resetDropdownOpacity();
  }

  createConnectionLine(item, targetMarker, color = '#0000ff') {
    if (window.mapUtils && window.mapUtils.createConnectionLine) {
      this.connectionLine = window.mapUtils.createConnectionLine(item, targetMarker, color);
    }
  }

  removeConnectionLine() {
    if (window.mapUtils && window.mapUtils.removeConnectionLine) {
      window.mapUtils.removeConnectionLine();
      this.connectionLine = null;
    }
  }






  activateZoomIndicator() {
    if (this.zoomIndicatorActive) return;

    console.log('🎯 Zoom indicator activated');
    this.zoomIndicatorActive = true;

    // Erstelle Zoom-Anzeige
    this.createZoomIndicator();

    // Zeige Anzeige
    // document.getElementById('map').style.cursor = 'none';
    this.zoomIndicator.style.display = 'block';

    // Update bei Zoom-Änderungen
    this.map.on('zoomend', this.updateZoomIndicator, this);

    // Update bei Mausbewegung
    document.addEventListener('mousemove', this.moveZoomIndicator);
  }

  deactivateZoomIndicator() {
    if (!this.zoomIndicatorActive) return;

    console.log('🎯 Zoom indicator deactivated');
    this.zoomIndicatorActive = false;

    // Verstecke Anzeige
    if (this.zoomIndicator) {
      this.zoomIndicator.style.display = 'none';
    }
    // document.getElementById('map').style.cursor = '';

    // Entferne Event-Listener
    this.map.off('zoomend', this.updateZoomIndicator, this);
    document.removeEventListener('mousemove', this.moveZoomIndicator);
  }

  createZoomIndicator() {
    if (this.zoomIndicator) return; // Bereits erstellt

    // Erstelle HTML-Element
    this.zoomIndicator = document.createElement('div');
    this.zoomIndicator.id = 'zoom-indicator';
    this.zoomIndicator.innerHTML = this.map.getZoom();

    document.body.appendChild(this.zoomIndicator);

    // Update-Funktion als Arrow Function für korrektes 'this'
    this.moveZoomIndicator = (e) => {
      if (!this.zoomIndicator) return;

      // Folge dem Cursor
      const offset = -3; // Abstand vom Cursor
      this.zoomIndicator.style.left = (e.clientX + offset) + 'px';
      this.zoomIndicator.style.top = (e.clientY + offset) + 'px';
    };

    this.updateZoomIndicator = () => {
      if (!this.zoomIndicator) return;
      this.zoomIndicator.innerHTML = Math.round(this.map.getZoom());
    };
  }
}

window.SearchManager = SearchManager;