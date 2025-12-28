// search.js - Fix: Konsolidierte Korrekturen

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

      // ✨ NEU: Autocomplete + Pills
      this.autocompleteManager = null;
      this.pillsManager = null;

      // ✨ KORREKTUR: Synchroner Aufruf ohne setTimeout
      this.searchBar = document.getElementById('search-bar');
      this.suggestionsDropdown = document.getElementById('suggestions-dropdown');
      this.searchCounter = document.getElementById('search-counter');
      this.initializeAutocompleteAndPills();
      // ------------------------------------

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
      // this.isSvgUpdateScheduled = false; // ✨ NEU: rAF-Status-Flag

      this._skipAutoZoom = false; // ✨ WICHTIG: Flag, das von map.js gesetzt wird

      this.initializeEventListeners();
      setTimeout(() => { this.setupSpaceAPIEvents(); }, 100);

      // ✨ Event-Listener für Bookmark-Änderungen
      window.addEventListener('bookmarksChanged', () => {
        // Aktualisiere Filter-Pills wenn Bookmarks sich ändern
        if (this.styleFilterManager) {
          this.createActiveFiltersSection();
          // Starte Filter-Zyklus neu
          this.applyPillFilters(this.pillsManager.getPillsArray());
        }
      });
    }

    setStyleFilterManager(styleFilterManager) {
      this.styleFilterManager = styleFilterManager;
      // ✨ WICHTIG: AutocompleteManager muss den StyleFilterManager erhalten
      if (this.autocompleteManager) {
        this.autocompleteManager.styleFilterManager = styleFilterManager;
      }
    }

    initializeEventListeners() {
      // ✨ Auto-Focus beim Laden - User kann direkt suchen
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
          // ✨ KORREKTUR: Prüfe, ob die Methode existiert UND aufgerufen werden kann
          if (this.styleFilterManager && typeof this.styleFilterManager.isDropdownOpen === 'function' && this.styleFilterManager.isDropdownOpen()) {
            this.styleFilterManager.closeDropdown();
            return;
          }

          // 2. Leere die Suche, wenn Text vorhanden ist (schließt implizit das Dropdown über applyFilters)
          if (this.searchBar.value.length > 0) {
            this.clearSearch();
            return;
          }

          // 3. Wenn die Suche leer ist (und kein Filter-Dropdown aktiv war), schließe das Such-Dropdown.
          this.closeDropdown();
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

        // ✨ FIX: applyPillFilters übernimmt die komplette Filter-Logik
        // (Text-Suche + Pills + Style-Filter)
        if (this.pillsManager) {
          this.applyPillFilters(this.pillsManager.getPillsArray());
        }
      });


      // Bestehende Event Listener (unverändert)
      this.searchBar.addEventListener('keyup', (e) => {
        if (['ArrowDown', 'ArrowUp', 'Enter', 'Escape', 'Tab', 'ArrowLeft', 'ArrowRight'].includes(e.code)) return;
        // if (this.styleFilterManager) this.styleFilterManager.applyFilters(); // <-- AUSKOMMENTIEREN / ENTFERNEN
      });

      // ✨ Zeige Filter-Pills beim Focus (auch ohne Suche)
      this.searchBar.addEventListener('focus', () => {
        if (!this.styleFilterManager) return;

        // 1. Erstelle Filter-Section
        this.createActiveFiltersSection();

        // 2. Öffne Dropdown SOFORT (auch ohne Suchergebnisse)
        this.suggestionsDropdown.classList.add('is-active');
        this.searchBar.classList.add('has-suggestions');

        // 3. Optional: Zeige alle Locations nur wenn keine Suche/Pills aktiv
        // (Auskommentiert, damit nicht alle Ergebnisse angezeigt werden)
        /*
        if (this.searchBar.value.trim() === '' && 
            (!this.pillsManager || this.pillsManager.count() === 0)) {
          this.styleFilterManager.applyFilters();
        }
        */
      });

      document.addEventListener('click', (e) => {
        if (!e.target.closest('.search-container')) this.closeDropdown();
      });

      // ✨ SCROLL-FIX: Hier findet die Positionsaktualisierung statt
      this.suggestionsDropdown.addEventListener('scroll', () => {
        this.updateHoverSVGPosition();
      });

      // ✨ Verhindere Fokusverlust beim Scrollen im Dropdown
      this.suggestionsDropdown.addEventListener('wheel', (e) => {
        e.stopPropagation();
        setTimeout(() => {
          this.searchBar.focus();
        }, 0);
      }, { passive: true });

      // ✨ Verhindere Fokusverlust beim Touchpad-Scrollen
      this.suggestionsDropdown.addEventListener('mousedown', (e) => {
        e.preventDefault();
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
      // ✨ KORREKTUR: Listener für Sprachwechsel hinzufügen
      document.addEventListener('languageChanged', () => {
        // Filter-Sektion (Pills) muss neu erstellt werden, um die Übersetzungen zu aktualisieren
        this.createActiveFiltersSection();

        // Wenn das Dropdown aktiv ist oder Pills/Text aktiv sind, muss die Filterung neu ausgelöst werden.
        if (this.suggestionsDropdown.classList.contains('is-active') || this.pillsManager.count() > 0 || this.searchBar.value.length > 0) {
          // Führe eine Filterung aus, um die Vorschlagselemente neu zu rendern
          this.applyPillFilters(this.pillsManager.getPillsArray());
        }
      });
    }

    updateSearchResults(filteredLocations) {
      let searchQuery = this.searchBar.value.trim().toLowerCase();

      // ✨ WENN "xcr" am Anfang steht: Entferne es und suche mit dem Rest
      if (searchQuery === 'xcr') {
        this.updateSearchCounter(0);
        this.suggestionsDropdown.innerHTML = '';
        this.updateDropdownUI(false);
        return;
      } else if (searchQuery.startsWith('xcr ')) {
        searchQuery = searchQuery.substring(4);
        filteredLocations = this.filterLocations(searchQuery);
      } else if (searchQuery.startsWith('xcr')) {
        searchQuery = searchQuery.substring(3);
        filteredLocations = this.filterLocations(searchQuery);
      }

      // Wenn XCR aktiv: Update UI mit den XCR-Ergebnissen
      this.updateMarkers(filteredLocations);
      this.updateSearchCounter(filteredLocations.length);
      this.createSuggestionItems(filteredLocations);
      this.updateDropdownUI(filteredLocations.length > 0 || searchQuery.length > 0);

      // HIER WIRD DIE LOGIK EINGEFÜGT:
      // ✨ FIX: AutoZoom unterdrücken, wenn das Flag gesetzt ist
      if (!this._skipAutoZoom) {
        this.triggerAutoZoom(filteredLocations);
      } else {
        // ✨ WICHTIG: Flag ZURÜCKSETZEN, da der Zoom-Versuch jetzt beendet ist
        this._skipAutoZoom = false;
      }

      return;
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
      if (searchQuery === 'xcr') {
        return this.json;
      }

      // ✨ ANFORDERUNG: Robuste Suche nach Wortanfang/Trennzeichen
      const normalizedQuery = searchQuery.toLowerCase();

      return this.json.filter(location => {
        if (!location || !location.loc || !location.name || !location.loc.city) return false;

        const fieldsToSearch = [
          location.name,
          location.loc.city,
          location.loc.country,
          // KORREKTUR: Straßennamen hinzufügen
          location.loc.street?.name
        ].filter(Boolean).map(f => f.toLowerCase());

        const plz = location.loc.plz && this.zfill(location.loc.plz, location.loc.country);

        // --- PLZ-Match (Bleibt: startsWith) ---
        const plzMatch = plz && plz.startsWith(normalizedQuery);
        if (plzMatch) return true;

        // --- Wortanfang-Match (Name, City, Country) ---

        // Definiere Trennzeichen: Leerzeichen, Bindestrich, Komma (für Berlin, Deutschland)
        const separators = /[\s,-]/;

        const wordStartMatch = fieldsToSearch.some(field => {
          // 1. Prüfe den Anfang des gesamten Feldes
          if (field.startsWith(normalizedQuery)) return true;

          // 2. Prüfe den Anfang jedes Wortes (nach Trennzeichen)
          return field.split(separators).some(word => word.startsWith(normalizedQuery));
        });

        return wordStartMatch;
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

    // ✨ KORRIGIERTE FUNKTION: Nur Position aktualisieren, nicht neu zeichnen!
    updateHoverSVGPosition() {
      if (this.currentHoverSVG && this.currentHoverItem) {
        const location = this.getLocationFromDropdownItem(this.currentHoverItem);
        if (location) {
          const hoverColor = window.getDynamicSpaceColor(location);
          const item = this.currentHoverItem;
          const itemRect = item.getBoundingClientRect();
          const targetMarker = this.findMarkerByLocation(location);

          // ✨ KORRIGIERTE POSITIONIERUNG (Muss der einzige synchrone DOM-Schreibzugriff sein)
          this.currentHoverSVG.style.left = `${itemRect.left - 50}px`;
          this.currentHoverSVG.style.top = `${itemRect.top - 0.5}px`;

          // Connection Line MUSS neu gezeichnet werden, da sich ihr Startpunkt im Viewport ändert.
          // HINWEIS: Dies ist immer noch eine relativ teure Operation und könnte die Ursache sein.
          // Da wir es aber nicht vermeiden können, ist rAF die beste Lösung.
          this.removeConnectionLine();
          if (targetMarker) {
            this.createConnectionLine(item, targetMarker, hoverColor);
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

      // KORREKTUR: Verwende die globale Funktion, die den HEX-WERT zurückgibt
      const hoverColor = window.getDynamicSpaceColor(location);

      // ✨ WICHTIG: createHoverSVG wird hier aufgerufen, um das Element ZU INITIALISIEREN.
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
      this.cleanupHoverSVG(); // ✨ SVG WIRD HIER ENTFERNT (nur beim Mouseout)
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
        const activeItem = this.dropdownItems[this.currentDropdownIndex];

        const dropdown = this.suggestionsDropdown;
        const dropdownRect = dropdown.getBoundingClientRect();
        const itemRect = activeItem.getBoundingClientRect();

        const filterSectionHeight = 119;
        const minAllowedTop = dropdownRect.top + filterSectionHeight;

        if (itemRect.top < minAllowedTop) {
          const scrollAmount = minAllowedTop - itemRect.top;
          const targetScrollTop = dropdown.scrollTop - scrollAmount;

          dropdown.scrollTo({
            top: targetScrollTop,
            behavior: 'smooth'
          });
        }
        else if (itemRect.bottom > dropdownRect.bottom) {
          activeItem.scrollIntoView({
            block: 'nearest',
            behavior: 'smooth'
          });
        }
      }
    }

    scrollToTop() {
      if (this.suggestionsDropdown) {
        this.suggestionsDropdown.scrollTo({
          top: 0,
          behavior: 'smooth'
        });
      }

      this.currentDropdownIndex = 0;
      this.updateActiveDropdownItem();
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
      const isClusteringActive = window.mapUtils && window.mapUtils.isClusteringEnabled();
      if (!clusterGroup) return;

      const filteredIds = new Set(filteredLocations.map(loc => loc.uniqueId));

      this.allMarkers.forEach(marker => {
        const location = this.json.find(loc => loc.uniqueId === marker.uniqueId);

        // 1. Markern von ALLEN Layern entfernen (Hard Reset)
        if (clusterGroup.hasLayer(marker)) {
          clusterGroup.removeLayer(marker);
        }
        if (this.map.hasLayer(marker)) {
          this.map.removeLayer(marker);
        }

        // Nur Marker, die den Filtern entsprechen, verarbeiten
        if (filteredIds.has(marker.uniqueId)) {

          // 2. MARKER ZUM AKTUELLEM AKTIVEN LAYER HINZUFÜGEN
          if (isClusteringActive) {
            clusterGroup.addLayer(marker);
          } else {
            // Hinzufügen zur Map, da Clustering aus ist
            this.map.addLayer(marker);
          }

          // 3. ICON SETZEN (Diese Logik war bereits korrekt)
          let iconToSet;

          if (location.isOpen === true) {
            iconToSet = this.icons.greenIcon;
          } else if (location.isOpen === false) {
            iconToSet = this.icons.redIcon;
          } else if (location.spaceapi && location.spaceapi.endpoint) {
            iconToSet = this.icons.unknownStatusIcon;
          } else {
            iconToSet = this.icons.highlightIcon;
          }

          marker.setIcon(iconToSet);
        }
        // Wenn der Marker NICHT gefiltert ist, bleibt er entfernt (durch Schritt 1)
      });
    }



    setupSpaceAPIEvents() {
      if (window.spaceAPI) {
        window.spaceAPI.onStatusUpdate((location) => {
          if (this.styleFilterManager) {
            // ✨ KORREKTUR: Filter-Zyklus erneut auslösen, um neue Markertypen zu zeigen
            this.applyPillFilters(this.pillsManager.getPillsArray());
          }
        });
      }
    }

    updateDropdownIcons() { }

    updateDropdownUI(hasResults) {
      const hasFilterSection = this.suggestionsDropdown.querySelector('.active-filters-section') !== null;

      // NEU HINZUGEFÜGT: Wenn SearchManager existiert, prüfen wir auf aktive Pills/Filter
      const hasActiveFiltersOrPills = this.pillsManager?.count() > 0 ||
        (this.styleFilterManager && this.styleFilterManager.hasActiveFilters());

      // shouldShow ist TRUE, wenn Ergebnisse ODER Filter-Sektion ODER aktive Filter/Pills vorhanden sind.
      const shouldShow = hasResults || hasFilterSection || hasActiveFiltersOrPills;

      this.suggestionsDropdown.classList.toggle('is-active', shouldShow);
      this.searchBar.classList.toggle('has-suggestions', shouldShow);
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
      // Wenn Pills da sind, lösche nur den Text und Pill-Filter-Logik übernimmt
      if (this.pillsManager.count() > 0) {
        this.searchBar.value = '';
        this.searchBar.focus();
        this.applyPillFilters(this.pillsManager.getPillsArray());
      } else {
        // Wenn keine Pills da sind, mache den Voll-Reset
        this.searchBar.value = '';
        this.searchBar.focus();

        // ✨ KORREKTUR: Rufe die zentrale Filter-Logik auf
        this.applyPillFilters(this.pillsManager.getPillsArray());
      }
    }

    createActiveFiltersSection() {
      const existingSection = this.suggestionsDropdown.querySelector('.active-filters-section');
      if (existingSection) {
        existingSection.remove();
      }

      const filtersSection = document.createElement('div');
      filtersSection.classList.add('active-filters-section');

      const categoryConfig = {
        style: {
          icon: 'fas fa-people-group',
          label: window.i18n.t('filter.style'),
          options: ['for all', 'for youth', 'for students', 'commercial']
        },
        doorState: {
          icon: 'fas fa-door-open',
          label: window.i18n.t('filter.status'),
          options: ['open', 'closed']
        },
        country: {
          icon: 'fas fa-flag',
          label: window.i18n.t('filter.country'),
          options: this.getUniqueCountries()
        },
        bookmarks: {
          icon: 'fas fa-bookmark',
          label: window.i18n.t('filter.bookmarks') || 'Bookmarks',
          options: ['bookmarked'],
          iconOnly: true
        }
      };

      Object.keys(categoryConfig).forEach(categoryKey => {
        const config = categoryConfig[categoryKey];
        const pill = this.createCategoryPill(categoryKey, config);
        filtersSection.appendChild(pill);
      });

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

      this.suggestionsDropdown.insertBefore(filtersSection, this.suggestionsDropdown.firstChild);
    }

    clearAllFilters() {
      if (!this.styleFilterManager) return;

      this.styleFilterManager.selectedStyles.clear();

      this.styleFilterManager.updateFilterCounter();
      this.styleFilterManager.updateHeaderState();

      // ✨ KORREKTUR: Rufe die zentrale Filter-Logik auf
      this.applyPillFilters(this.pillsManager.getPillsArray());

      this.scrollToTop();

      this.searchBar.focus();
    }

    getUniqueCountries() {
      const countryCount = new Map();
      this.json.forEach(location => {
        if (location.loc && location.loc.country) {
          const country = location.loc.country;
          countryCount.set(country, (countryCount.get(country) || 0) + 1);
        }
      });

      return Array.from(countryCount.entries())
        .sort((a, b) => b[1] - a[1])
        .map(([country]) => country);
    }

    getCountryCode(countryName) {
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

      const activeFilter = this.getActiveFilterForCategory(categoryKey);

      const styleIconMap = {
        'for all': 'fas fa-people-group',
        'for youth': 'fas fa-child',
        'for students': 'fas fa-graduation-cap',
        'commercial': 'fas fa-money-bill-wave'
      };

      if (activeFilter) {
        pill.classList.add('filter-pill-active');

        if (categoryKey === 'doorState') {
          if (activeFilter === 'open') {
            pill.classList.add('filter-pill-open');
          } else if (activeFilter === 'closed') {
            pill.classList.add('filter-pill-closed');
          }
        }

        if (categoryKey === 'bookmarks' && config.iconOnly) {
          const bookmarkCount = window.bookmarkManager ? window.bookmarkManager.getCount() : 0;
          pill.innerHTML = `<i class="${config.icon}"></i>`;
          pill.title = `${config.label} (${bookmarkCount})`;
        }
        else if (categoryKey === 'country') {
          const countryCode = this.getCountryCode(activeFilter);
          pill.innerHTML = `<span class="fi fi-${countryCode} flag-in-pill"></span> ${countryCode.toUpperCase()}`;
        }
        else if (categoryKey === 'style' && styleIconMap[activeFilter]) {
          const translatedStyle = this.translateFilterValue('style', activeFilter);
          pill.innerHTML = `<i class="${styleIconMap[activeFilter]}"></i> ${translatedStyle}`;
        }
        else {
          const translatedValue = this.translateFilterValue(categoryKey, activeFilter);
          pill.innerHTML = `<i class="${config.icon}"></i> ${translatedValue}`;
        }
      } else {
        pill.classList.add('filter-pill-passive');

        if (categoryKey === 'bookmarks' && config.iconOnly) {
          const bookmarkCount = window.bookmarkManager ? window.bookmarkManager.getCount() : 0;
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
      if (!this.styleFilterManager || !this.styleFilterManager.hasActiveFilters()) {
        return null;
      }

      const selectedStyles = this.styleFilterManager.getSelectedStyles();

      if (categoryKey === 'bookmarks') {
        const bookmarkOptions = ['bookmarked'];
        return selectedStyles.find(s => bookmarkOptions.includes(s)) || null;
      } else if (categoryKey === 'style') {
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
      const existingPopovers = document.querySelectorAll('.filter-popover');
      existingPopovers.forEach(p => {
        p.remove();
        if (this.suggestionsDropdown) {
          this.suggestionsDropdown.classList.remove('is-zooming');
        }
      });

      if (existingPopovers.length > 0) {
        this.searchBar.focus();
      }

      const popover = document.createElement('div');
      popover.classList.add('filter-popover');
      popover.dataset.pillCategory = categoryKey;

      if (this.suggestionsDropdown) {
        this.suggestionsDropdown.classList.add('is-zooming');
      }

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
        this.searchBar.focus();
      });
      popover.appendChild(clearOption);

      const styleIconMap = {
        'for all': 'fas fa-people-group',
        'for youth': 'fas fa-child',
        'for students': 'fas fa-graduation-cap',
        'commercial': 'fas fa-money-bill-wave'
      };

      const doorStateIconMap = {
        'open': 'fas fa-door-open',
        'closed': 'fas fa-door-closed'
      };

      const bookmarkIconMap = {
        'bookmarked': 'fas fa-bookmark'
      };

      config.options.forEach(option => {
        const optionItem = document.createElement('div');
        optionItem.classList.add('filter-popover-item');

        if (categoryKey === 'country') {
          const countryCode = this.getCountryCode(option);
          const flagSpan = document.createElement('span');
          flagSpan.className = `fi fi-${countryCode}`;
          flagSpan.style.marginRight = '8px';
          flagSpan.style.display = 'inline-block';
          flagSpan.style.width = '20px';
          optionItem.appendChild(flagSpan);

          const nameSpan = document.createElement('span');
          const translatedCountry = window.i18n.t(`countries.${option}`);
          nameSpan.textContent = translatedCountry;
          optionItem.appendChild(nameSpan);

          const countInCountry = this.json.filter(loc => loc.loc?.country === option).length;
          const countSpan = document.createElement('span');
          countSpan.className = 'country-total-count';
          countSpan.textContent = ` (${countInCountry})`;
          optionItem.appendChild(countSpan);

          optionItem.style.whiteSpace = 'nowrap';
        }
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
        else if (categoryKey === 'bookmarks' && bookmarkIconMap[option]) {
          const iconElement = document.createElement('i');
          iconElement.className = bookmarkIconMap[option];
          iconElement.style.marginRight = '8px';
          iconElement.style.width = '20px';
          iconElement.style.textAlign = 'center';
          optionItem.appendChild(iconElement);
          optionItem.appendChild(document.createTextNode(config.label));
        }
        else {
          const translatedValue = this.translateFilterValue(categoryKey, option);
          optionItem.textContent = translatedValue;
        }

        const activeFilter = this.getActiveFilterForCategory(categoryKey);
        if (activeFilter === option) {
          optionItem.classList.add('active');
        }

        optionItem.addEventListener('click', (e) => {
          e.stopPropagation();
          this.selectCategoryOption(categoryKey, option);
          popover.remove();
          if (this.suggestionsDropdown) {
            this.suggestionsDropdown.classList.remove('is-zooming');
          }
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
            if (this.suggestionsDropdown) {
              this.suggestionsDropdown.classList.remove('is-zooming');
            }
            document.removeEventListener('click', closeHandler);
            this.searchBar.focus();
          }
        };
        document.addEventListener('click', closeHandler);
      }, 100);

      const scrollHandler = () => {
        popover.remove();
        if (this.suggestionsDropdown) {
          this.suggestionsDropdown.classList.remove('is-zooming');
        }
        document.removeEventListener('scroll', scrollHandler, true);
        this.searchBar.focus();
      };
      document.addEventListener('scroll', scrollHandler, true);
    }

    clearCategoryFilter(categoryKey) {
      if (!this.styleFilterManager) return;

      let categoryOptions = [];
      if (categoryKey === 'bookmarks') {
        categoryOptions = ['bookmarked'];
      } else if (categoryKey === 'style') {
        categoryOptions = ['for all', 'for youth', 'for students', 'commercial'];
      } else if (categoryKey === 'doorState') {
        categoryOptions = ['open', 'closed'];
      } else if (categoryKey === 'country') {
        categoryOptions = this.getUniqueCountries();
      }

      categoryOptions.forEach(opt => {
        this.styleFilterManager.selectedStyles.delete(opt);
      });

      this.styleFilterManager.updateFilterCounter();
      this.styleFilterManager.updateHeaderState();

      // ✨ KORREKTUR: Rufe die zentrale Filter-Logik auf
      this.applyPillFilters(this.pillsManager.getPillsArray());
    }

    selectCategoryOption(categoryKey, option) {
      if (!this.styleFilterManager) return;

      if (categoryKey === 'bookmarks' && option === 'bookmarked') {
        if (this.styleFilterManager.selectedStyles.has('bookmarked')) {
          this.styleFilterManager.selectedStyles.delete('bookmarked');
        } else {
          this.styleFilterManager.selectedStyles.add('bookmarked');
        }
      } else {
        let categoryOptions = [];
        if (categoryKey === 'style') {
          categoryOptions = ['for all', 'for youth', 'for students', 'commercial'];
        } else if (categoryKey === 'doorState') {
          categoryOptions = ['open', 'closed'];
        } else if (categoryKey === 'country') {
          categoryOptions = this.getUniqueCountries();
        }

        categoryOptions.forEach(opt => {
          if (opt !== option) {
            this.styleFilterManager.selectedStyles.delete(opt);
          }
        });

        this.styleFilterManager.selectedStyles.add(option);
      }

      this.styleFilterManager.updateFilterCounter();
      this.styleFilterManager.updateHeaderState();

      // ✨ KORREKTUR: Rufe die zentrale Filter-Logik auf
      this.applyPillFilters(this.pillsManager.getPillsArray());

      this.scrollToTop();

      this.searchBar.focus();
    }

    createSuggestionItems(locations) {
      const existingSuggestions = this.suggestionsDropdown.querySelectorAll('.suggestion-item, .country-group-header');
      existingSuggestions.forEach(item => item.remove());

      this.currentDropdownIndex = -1;
      this.clearActiveDropdownItem();

      if (!locations || locations.length === 0) {
        this.dropdownItems = [];
        return;
      }

      const fragment = document.createDocumentFragment();

      const groupedByCountry = new Map();
      locations.forEach(location => {
        const country = location.loc?.country || 'Unknown';
        if (!groupedByCountry.has(country)) {
          groupedByCountry.set(country, []);
        }
        groupedByCountry.get(country).push(location);
      });

      const sortedCountries = Array.from(groupedByCountry.entries())
        .sort((a, b) => b[1].length - a[1].length);

      sortedCountries.forEach(([country, countryLocations]) => {
        const countryHeader = this.createCountryHeader(country, countryLocations.length);
        fragment.appendChild(countryHeader);

        const sortedLocations = this.sortLocationsByGeography(countryLocations);
        sortedLocations.forEach(location => {
          const item = this.createSuggestionItem(location);
          fragment.appendChild(item);
        });
      });

      this.suggestionsDropdown.appendChild(fragment);
      this.dropdownItems = Array.from(this.suggestionsDropdown.querySelectorAll('.suggestion-item'));

      // ✨ KRITISCH: Speichere Positionen NACH dem DOM-Rendering
      requestAnimationFrame(() => {
        const allHeaders = Array.from(this.suggestionsDropdown.querySelectorAll('.country-group-header'));
        allHeaders.forEach((header) => {
          const originalPosition = header.offsetTop;
          header.dataset.originalTop = originalPosition;
          console.log(`📍 Saved position for ${header.dataset.countryName}: ${originalPosition}`);
        });
      });
    }

    createCountryHeader(country, count) {
      const header = document.createElement('div');
      header.classList.add('country-group-header');
      header.dataset.countryName = country;

      const countryCode = this.getCountryCode(country);
      const translatedCountry = window.i18n.t(`countries.${country}`);
      const ofText = window.i18n.t('searchResults.of');

      const isFilterActive = this.getActiveFilterForCategory('country') === country;
      const activeClass = isFilterActive ? 'country-filter-active' : '';

      const countClass = isFilterActive ? 'is-hidden' : '';
      const caretsClass = isFilterActive ? 'is-hidden' : '';

      header.innerHTML = `
      <div class="country-title-content">
        
        <span class="fi fi-${countryCode} flag-in-header"></span> 
        
        <div class="country-filter-button ${activeClass}" data-country="${country}" title="${window.i18n.t('filter.country')} ${translatedCountry}">
          
          <i class="fas fa-filter filter-icon-in-header"></i> 
          
          <span class="country-filter-name">${translatedCountry}</span>

        </div>
        
        <span class="country-count ${countClass}">[${count} ${ofText} ${this.json.filter(loc => loc.loc?.country === country).length}]</span>
      </div>
      
      <div class="country-nav-carets ${caretsClass}">
        <i class="fas fa-caret-up country-nav-caret" data-direction="prev" title="previous country"></i>
        <i class="fas fa-caret-down country-nav-caret" data-direction="next" title="next country"></i>
      </div>
    `;

      const upCaret = header.querySelector('[data-direction="prev"]');
      const downCaret = header.querySelector('[data-direction="next"]');
      const filterButton = header.querySelector('.country-filter-button');

      if (upCaret) upCaret.addEventListener('click', (e) => this.handleCountryScroll(e, country, 'prev'));
      if (downCaret) downCaret.addEventListener('click', (e) => this.handleCountryScroll(e, country, 'next'));

      if (filterButton) {
        filterButton.addEventListener('click', (e) => this.handleCountryFilterClick(e, country));
      }

      if (isFilterActive) {
        header.classList.add('is-filtered');
      }

      return header;
    }

    handleCountryScroll(e, currentCountry, direction) {
      e.stopPropagation();

      const allHeaders = Array.from(this.suggestionsDropdown.querySelectorAll('.country-group-header'));

      if (allHeaders.length === 0) return;

      const scrollTop = this.suggestionsDropdown.scrollTop;
      const stickyOffset = this.getStickyOffset();

      const headerData = allHeaders.map((header, idx) => {
        const savedPosition = parseInt(header.dataset.originalTop);

        let position = savedPosition;

        if (!savedPosition || isNaN(savedPosition)) {
          let nextItem = header.nextElementSibling;
          while (nextItem && !nextItem.classList.contains('suggestion-item')) {
            nextItem = nextItem.nextElementSibling;
          }

          if (nextItem) {
            position = nextItem.offsetTop - 50;
          } else {
            position = header.offsetTop;
          }
        }

        return {
          index: idx,
          element: header,
          country: header.dataset.countryName,
          position: position
        };
      });

      console.log('📋 Header Data with saved positions:');
      headerData.forEach(h => {
        console.log(`  [${h.index}] ${h.country} @ ${h.position}`);
      });

      let currentIndex = -1;

      for (let i = 0; i < headerData.length; i++) {
        const headerTop = headerData[i].position - stickyOffset;

        if (i < headerData.length - 1) {
          const nextHeaderTop = headerData[i + 1].position - stickyOffset;

          if (scrollTop >= headerTop - 30 && scrollTop < nextHeaderTop - 30) {
            currentIndex = i;
            break;
          }
        } else {
          if (scrollTop >= headerTop - 30) {
            currentIndex = i;
            break;
          }
        }
      }

      if (currentIndex === -1) {
        currentIndex = 0;
      }

      console.log('🎯 Detected current index:', currentIndex, '-', headerData[currentIndex].country);

      let targetIndex;
      if (direction === 'next') {
        targetIndex = Math.min(currentIndex + 1, headerData.length - 1);
        if (targetIndex === currentIndex) {
          return;
        }
      } else {
        targetIndex = Math.max(currentIndex - 1, 0);
        if (targetIndex === currentIndex) {
          return;
        }
      }

      const targetData = headerData[targetIndex];
      const scrollToPosition = targetData.position - stickyOffset;

      this.suggestionsDropdown.scrollTo({
        top: scrollToPosition,
        behavior: 'smooth'
      });
    }

    handleCountryFilterClick(e, country) {
      e.stopPropagation();

      if (!this.styleFilterManager) return;

      const currentActiveFilter = this.getActiveFilterForCategory('country');

      if (currentActiveFilter === country) {
        this.clearCategoryFilter('country');
      } else {
        this.selectCategoryOption('country', country);
      }

      this.searchBar.focus();
    }

    getStickyOffset() {
      return 85;
    }

    createSuggestionItem(location) {
      const item = document.createElement('div');
      item.classList.add('suggestion-item');
      item.dataset.uniqueId = location.uniqueId;
      let statusIcon = '', spaceStatusClass = '', nameClass = '';

      let statusColor = 'blue';
      if (location.isOpen === true) {
        statusColor = 'var(--space-open)';
      } else if (location.isOpen === false) {
        statusColor = 'var(--space-closed)';
      } else if (location.spaceapi && location.spaceapi.endpoint) {
        statusColor = 'var(--space-unknown)';
      }

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

      const countryCode = this.getCountryCode(location.loc.country);
      const flagHtml = `<span class="fi fi-${countryCode}" style="margin-right: 4px;"></span>`;

      const bookmarkIcon = window.bookmarkManager ?
        window.bookmarkManager.createBookmarkIcon(location.uniqueId, 'suggestion-bookmark') :
        '';

      item.innerHTML = `
      <div class="item-content" style="--status-color: ${statusColor};">
        <div class="item-name">
          <span class="${nameClass}">${styleIconHtml}${statusIcon}${location.name}</span>
          ${bookmarkIcon}
        </div>
        <div class="item-details">${location.loc.street.name} ${location.loc.street.number} ${location.loc.street.ext}</div>
        <div class="item-details">${this.zfill(location.loc.plz, location.loc.country)} <b>${location.loc.city}</b></div>
      </div>`;
      this.setupSuggestionItemEvents(item, location);

      if (window.bookmarkManager) {
        window.bookmarkManager.initializeBookmarkListeners(item);
      }

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

      // ✨ WICHTIG: Wenn der Click-Handler entfernt wurde, muss hier die Navigation zur Karte erfolgen
      item.addEventListener('click', () => this.handleSuggestionClick(location));
    }

    // WIEDERHERGESTELLTE Methode handleSuggestionClick (Original)
    handleSuggestionClick(location) {

      clearTimeout(this.zoomDebounceTimeout);
      this.map.flyTo([location.loc.lat, location.loc.long], 15);
      const targetMarker = this.findMarkerByLocation(location);
      if (targetMarker) {
        targetMarker._openedByHover = false;

        if (window.markerStateManager) {
          window.markerStateManager.clearTimeouts(targetMarker.uniqueId);
          window.markerStateManager.setState(targetMarker.uniqueId, {
            isHovering: false,
            isDropdownHovering: false
          });
        }

        this.map.once('moveend', () => {
          targetMarker._openedByHover = false;
          targetMarker.openPopup();
          if (window.mapUtils && window.mapUtils.setStickyPopup) {
            window.mapUtils.setStickyPopup(targetMarker);
          }
        });
      }

      // WIEDERHERGESTELLTE LOGIK: Name wird immer eingetragen
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
      path.setAttribute('d', 'M632.86,6.618L436.232,6.618C416.818,6.599 396.254,9.684 376.225,16.429C356.196,23.174 336.703,33.579 319.618,47.041C302.534,60.503 287.858,77.022 276.615,94.918C265.373,112.813 257.563,132.086 253.041,150.966C244.69,186.193 226.089,220.425 195.188,245.142C164.286,269.858 121.084,285.059 70.815,284.779L70.815,336.251C121.084,335.971 164.286,351.172 195.188,375.888C226.089,400.604 244.69,434.836 253.041,470.064C257.563,488.944 276.615,526.112 287.858,544.008C302.534,560.527 319.618,573.988 336.703,587.45C356.196,597.856 376.225,604.6 396.254,611.345C416.818,614.43 436.232,614.412 436.232,614.412L632.86,614.412L632.86,6.618Z');
      path.setAttribute('fill', color);
      svg.appendChild(path);
      document.body.appendChild(svg);
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
        this.searchBar.focus();
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
        this.searchBar.focus();
      });
    }

    handleEmptySearch() {
      if (this.previousZoomBounds) {
        this.previousZoomBounds = null;
        this.map.flyTo(new L.LatLng(51.0122995, 10.3995537), 7, { duration: 1.5 });
      }
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

      this.createZoomIndicator();

      this.zoomIndicator.style.display = 'block';

      this.map.on('zoomend', this.updateZoomIndicator, this);

      document.addEventListener('mousemove', this.moveZoomIndicator);
    }

    deactivateZoomIndicator() {
      if (this.zoomIndicatorActive) return;

      console.log('🎯 Zoom indicator deactivated');
      this.zoomIndicatorActive = false;

      if (this.zoomIndicator) {
        this.zoomIndicator.style.display = 'none';
      }

      this.map.off('zoomend', this.updateZoomIndicator, this);
      document.removeEventListener('mousemove', this.moveZoomIndicator);
    }

    createZoomIndicator() {
      if (this.zoomIndicator) return;

      this.zoomIndicator = document.createElement('div');
      this.zoomIndicator.id = 'zoom-indicator';
      this.zoomIndicator.innerHTML = this.map.getZoom();

      document.body.appendChild(this.zoomIndicator);

      this.moveZoomIndicator = (e) => {
        if (!this.zoomIndicator) return;

        const offset = -3;
        this.zoomIndicator.style.left = (e.clientX + offset) + 'px';
        this.zoomIndicator.style.top = (e.clientY + offset) + 'px';
      };

      this.updateZoomIndicator = () => {
        if (!this.zoomIndicator) return;
        this.zoomIndicator.innerHTML = Math.round(this.map.getZoom());
      };
    }


    /**
          Führt die SVG-Positionsaktualisierung im nächsten Animationsframe aus.
     **/
    scheduleHoverSVGUpdate() {
      if (this.isSvgUpdateScheduled) {
        return;
      }

      this.isSvgUpdateScheduled = true;

      requestAnimationFrame(() => {
        this.updateHoverSVGPosition();
        this.isSvgUpdateScheduled = false;
      });
    }


    /**
     * Initialize Autocomplete & Pills
     */
    initializeAutocompleteAndPills() {
      // 💡 HINWEIS: styleFilterManager ist hier evtl. noch null, 
      // muss über setStyleFilterManager nachgeliefert werden.

      // 1. Erstelle Pills-Manager
      this.pillsManager = new SearchPillsManager(this.searchBar);

      // 2. Erstelle Autocomplete-Manager
      this.autocompleteManager = new window.AutocompleteManager( // KORREKTUR für ReferenceError: Zugriff über window
        this.json,
        this.searchBar,
        this.styleFilterManager // Kann null sein, wird später über setStyleFilterManager gesetzt
      );

      // 3. Setup Callbacks
      this.setupAutocompleteCallbacks();

      console.log('✅ Autocomplete & Pills initialized SYNCHRONOUSLY');
    }

    /**
     * Setup Callbacks zwischen Komponenten
     */
    setupAutocompleteCallbacks() {
      // Autocomplete → Pills (bei Ort-Auswahl)
      this.autocompleteManager.onSelect((suggestion) => {
        // Nur Orte werden zu Pills (Styles werden direkt als Filter aktiviert)
        if (suggestion.type === 'city' ||
          suggestion.type === 'zip' ||
          suggestion.type === 'country') {
          this.pillsManager.addPill(suggestion);
          // ✨ FINALER FIX: Leere das Suchfeld nach dem Hinzufügen der Pill
          this.searchBar.value = '';
        }
      });

      // Pills → Filter anwenden
      this.pillsManager.onChange((pills) => {
        this.applyPillFilters(pills);

        // Update URL (wenn RoutingManager verfügbar)
        if (window.routingManager) {
          window.routingManager.updateURLFromPills(pills);
        }
      });
    }

    /**
     * Filter anwenden basierend auf Pills (AND-Verknüpfung)
     * WICHTIG: styleFilterManager.applyPreFilters(filtered) wendet die STYLE-FILTER an!
     */
    applyPillFilters(pills) {
      const searchQuery = this.searchBar.value.trim().toLowerCase();

      // ✨ WICHTIG: 1. RESET-LOGIK (MUSS ALS ERSTES KOMMEN!)
      if (pills.length === 0 && searchQuery.length === 0) {
        if (this.styleFilterManager) {
          // Setzt preFilteredLocations auf null und triggert den Filter-Reset
          // Dies wendet AUCH die Style-Filter an, WENN sie aktiv sind!
          this.styleFilterManager.applyPreFilters(null);
        }
        return;
      }

      // ✨ 2. HAUPT-FILTER-LOGIK (Wird nur ausgeführt, wenn Pills ODER Text aktiv sind)
      let filtered = this.json;

      // Text-Suche
      if (searchQuery.length > 0) {
        filtered = this.filterLocations(searchQuery);
      }

      // Pill-Filterung
      if (pills.length > 0) {
        const router = window.routingManager;

        if (router) {
          pills.forEach(pill => {
            filtered = filtered.filter(loc => {
              switch (pill.type) {
                case 'city':
                  if (loc.loc?.city) {
                    const locationSlug = router.cityToSlug(loc.loc.city);
                    const pillSlug = router.cityToSlug(pill.text);
                    return locationSlug === pillSlug;
                  }
                  return false;

                case 'zip':
                  return loc.loc?.plz?.toString() === pill.text;

                case 'country':
                  return loc.loc?.country === pill.text;

                default:
                  return true;
              }
            });
          });
        }
      }

      // 3. Übergabe an StyleFilterManager
      if (this.styleFilterManager) {
        // Wenn wir hier ankommen, sind Pills ODER Text aktiv ODER Style-Filter sind aktiv.
        // applyPreFilters filtert die "filtered" Liste (aus Text/Pills) WEITER nach Style-Filtern.
        this.styleFilterManager.applyPreFilters(filtered);
      } else {
        // Fallback
        this.updateSearchResults(filtered);
      }
    }

    /**
     * Update Counter Display
     */
    updateCounterDisplay(count) {
      if (!this.searchCounter) return;

      this.searchCounter.textContent = count;

      if (count > 0) {
        this.searchCounter.classList.add('visible');
        this.searchCounter.classList.add('has-results');
        this.searchCounter.classList.remove('no-results');
      } else {
        this.searchCounter.classList.remove('visible');
        this.searchCounter.classList.add('no-results');
        this.searchCounter.classList.remove('has-results');
      }
    }

    /**
     * Keyboard Shortcuts für Pills
     */
    setupPillKeyboardShortcuts() {
      document.addEventListener('keydown', (e) => {
        // Cmd/Ctrl + K = Focus Search
        if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
          e.preventDefault();
          this.searchBar.focus();
          this.searchBar.select();
        }

        // Cmd/Ctrl + Shift + C = Clear Pills
        if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'C') {
          e.preventDefault();
          if (this.pillsManager) {
            this.pillsManager.clear();
          }
        }
      });
    }

    /**
     * Clear Search completely (Pills + Text + Filter)
     */
    clearSearchAndPills() {
      // Clear Text
      this.searchBar.value = '';

      // Clear Pills
      if (this.pillsManager) {
        this.pillsManager.clear();
      }

      // Clear Style-Filter
      if (this.styleFilterManager) {
        this.styleFilterManager.selectedStyles.clear();
        this.styleFilterManager.applyFilters();
      }

      // Hide Autocomplete
      if (this.autocompleteManager) {
        this.autocompleteManager.hide();
      }

      // Reset URL
      if (window.routingManager) {
        window.routingManager.updateURLFromPills([]);
      }

      console.log('🗑️ Search, Pills and Filters cleared');

    }
  }

window.SearchManager = SearchManager;