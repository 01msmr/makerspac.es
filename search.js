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
    this.connectionWeight = 6;  // ✅ weight=6 - Default für Search-Dropdown
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

    // pointer-events der Items während der Tastaturnavigation deaktivieren - und umgekehrt
    this.lastInputMethod = null;
    this._mouseHasMoved = false;
    this._lastMousePos = { x: 0, y: 0 };


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
        if (this.styleFilterManager && typeof this.styleFilterManager.isDropdownOpen === 'function' && this.styleFilterManager.isDropdownOpen()) {
          this.styleFilterManager.closeDropdown();
          return;
        }

        // 2. Leere die Suche, wenn Text vorhanden ist
        if (this.searchBar.value.length > 0) {
          this.clearSearch();
          return;
        }

        // 3. Wenn die Suche leer ist, schließe das Such-Dropdown.
        this.closeDropdown();
        return;
      }

      // ✨ NEU: LINKS/RECHTS-Pfeile für Navigation zwischen Filter und Suche
      if (e.code === 'ArrowLeft' || e.code === 'ArrowRight') {
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
              if (this.styleFilterManager) this.styleFilterManager.applyFilters();
            }
          } else if (e.code === 'ArrowLeft') {
            // Nach links: Suche → Filter
            if (searchBarHasFocus) {
              this.closeDropdown();
              if (this.styleFilterManager?.filterHeader) {
                this.styleFilterManager.filterHeader.focus();
                this.styleFilterManager.openDropdown();
              }
            }
          }
          return;
        }
      }

      // TAB-Navigation
      if (e.code === 'Tab' && !e.altKey && !e.ctrlKey && !e.metaKey) {
        if (searchBarHasFocus && !e.shiftKey) {
          e.preventDefault();
          this.closeDropdown();
          if (this.styleFilterManager?.filterHeader) {
            this.styleFilterManager.filterHeader.focus();
            this.styleFilterManager.openDropdown();
          }
        } else if (filterHeaderHasFocus && e.shiftKey) {
          e.preventDefault();
          this.styleFilterManager.closeDropdown();
          this.searchBar.focus();
          this.searchBar.select();
          if (this.styleFilterManager) this.styleFilterManager.applyFilters();
        } else if ((filterHeaderHasFocus || filterDropdownHasFocus) && !e.shiftKey) {
          e.preventDefault();
          this.styleFilterManager.closeDropdown();
          this.searchBar.focus();
          this.searchBar.select();
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

      if (this.pillsManager) {
        this.applyPillFilters(this.pillsManager.getPillsArray());
      }
    });

    this.searchBar.addEventListener('keyup', (e) => {
      if (['ArrowDown', 'ArrowUp', 'Enter', 'Escape', 'Tab', 'ArrowLeft', 'ArrowRight'].includes(e.code)) return;
    });

    // ✨ Zeige Filter-Pills beim Focus
    this.searchBar.addEventListener('focus', () => {
      if (!this.styleFilterManager) return;

      this.cleanupHoverSVG();
      if (this.currentHoverItem) {
        this.currentHoverItem.classList.remove('js-hover');
        this.currentHoverItem = null;
      }

      this.createActiveFiltersSection();
      this.suggestionsDropdown.classList.add('is-active');
      this.searchBar.classList.add('has-suggestions');

      // ✅ FIX: Triggere Filter-Logik beim Focus, damit der Auto-Zoom 
      // basierend auf den aktuellen Inhalten (Text/Pills) ausgeführt wird.
      this.applyPillFilters(this.pillsManager.getPillsArray());
    });

    document.addEventListener('click', (e) => {
      if (!e.target.closest('.search-container')) this.closeDropdown();
    });

    // ✨ SCROLL-FIX: Hier findet die Positionsaktualisierung statt
    this.suggestionsDropdown.addEventListener('scroll', () => {
      this.updateHoverSVGPosition();
    });

    // ✅ Mousemove-Erkennung auf Dropdown (Mutual Exclusion)
    this.suggestionsDropdown.addEventListener('mousemove', (e) => {
      if (e.clientX !== this._lastMousePos.x || e.clientY !== this._lastMousePos.y) {
        this._lastMousePos = { x: e.clientX, y: e.clientY };
        this._mouseHasMoved = true;

        // ✅ pointer-events wieder aktivieren wenn Maus sich bewegt
        this.suggestionsDropdown.querySelectorAll('.suggestion-item').forEach(item => {
          if (item.style.pointerEvents === 'none') {
            item.style.pointerEvents = '';
          }
        });
      }
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
      this.createActiveFiltersSection();
      if (this.suggestionsDropdown.classList.contains('is-active') || this.pillsManager.count() > 0 || this.searchBar.value.length > 0) {
        this.applyPillFilters(this.pillsManager.getPillsArray());
      }
    });
  }
















  triggerAutoZoom(locations) {
    // ✅ SAUBERE LÖSUNG: Blockiere Auto-Zoom bei manuellem Space-Klick
    if (this._manualSpaceClick) {
      console.log('🚫 Auto-Zoom blocked - manual space click active');
      return;
    }

    clearTimeout(this.zoomDebounceTimeout);
    const DEBOUNCE_DELAY = 800;
    this.zoomDebounceTimeout = setTimeout(() => {
      if (locations.length > 0 && !this._manualSpaceClick) {
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

      // ✅ ID-Match (nur exakte Treffer) - wird später für Sortierung genutzt
      const idString = String(location.ID || '');
      if (idString === normalizedQuery) {
        location._isIdMatch = true; // Markiere für spätere Sortierung
        return true;
      }

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


  applyHoverEffects(item, location, weight = 6) {
    this.connectionWeight = weight;  // ✅ Speichere für spätere Verwendung

    this.suggestionsDropdown.querySelectorAll('.js-hover').forEach(el => {
      el.classList.remove('js-hover');
    });

    item.classList.add('js-hover');
    this.isDropdownHovering = true;
    this.currentHoverItem = item;

    const hoverColor = window.getDynamicSpaceColor(location);
    this.createHoverSVG(item, location, hoverColor);

    const targetMarker = this.findMarkerByLocation(location);

    if (targetMarker) {
      const clusterGroup = window.clusterGroup;
      const isClusteringActive = window.mapUtils && window.mapUtils.isClusteringEnabled();

      // ✨ OPTIMIERUNG: Nur wenn Clustering aktiv ist UND der Marker in einem Cluster steckt
      if (isClusteringActive && clusterGroup) {
        const visibleParent = clusterGroup.getVisibleParent(targetMarker);

        // Wenn der sichtbare Elternteil NICHT der Marker selbst ist, ist er in einem Cluster versteckt
        if (visibleParent && visibleParent !== targetMarker) {
          targetMarker.addTo(this.map);
          targetMarker._isTemporarilyUnclustered = true;
          console.log(`📌 Marker für ${location.name} temporär aus Cluster geholt.`);
        }
      }

      if (window.markerStateManager) {
        window.markerStateManager.setState(targetMarker.locationId, { isDropdownHovering: true });
      }

      if (window.mapUtils && window.mapUtils.setMarkerDropdownHover) {
        window.mapUtils.setMarkerDropdownHover(targetMarker, true);
      }

      targetMarker.setIcon(this.createHoverIcon(hoverColor));
      this.createConnectionLine(item, targetMarker, hoverColor);  // ✅ Nutzt this.connectionWeight

      this.popupTimeout = setTimeout(() => {
        if (this.isDropdownHovering) {
          targetMarker._openedByHover = true; // ✅ Markiere als Hover-Popup
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
      // ✨ OPTIMIERUNG: Nur entfernen, wenn er wirklich temporär "geholt" wurde
      if (targetMarker._isTemporarilyUnclustered) {
        this.map.removeLayer(targetMarker);
        targetMarker._isTemporarilyUnclustered = false;
        console.log(`♻️ Marker für ${location.name} zurück ins Cluster gegeben.`);
      }

      if (window.markerStateManager) {
        window.markerStateManager.setState(targetMarker.locationId, { isDropdownHovering: false });
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

    // ✅ Tastatur übernimmt Kontrolle
    this.lastInputMethod = 'keyboard';
    this._mouseHasMoved = false;

    // ✅ pointer-events auf Items deaktivieren um CSS :hover zu unterdrücken
    this.suggestionsDropdown.querySelectorAll('.suggestion-item').forEach(item => {
      item.style.pointerEvents = 'none';
    });

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
    // ✅ OPTIMIERT: Nutze location.ID statt uniqueId
    const locationId = dropdownItem.dataset.locationId;

    if (locationId) {
      const id = parseInt(locationId, 10);
      return window.locationById.get(id) || null; // O(1) statt O(n)!
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

    // ✅ OPTIMIERT: Nutze location.ID
    const filteredIds = new Set(filteredLocations.map(loc => loc.ID));

    this.allMarkers.forEach(marker => {
      // ✅ OPTIMIERT: O(1) statt O(n) mit Map.get()
      const location = window.locationById.get(marker.locationId);

      // Erst überall entfernen (Reset)
      if (clusterGroup.hasLayer(marker)) {
        clusterGroup.removeLayer(marker);
      }
      if (this.map.hasLayer(marker)) {
        this.map.removeLayer(marker);
      }

      // Wenn der Marker zum Suchergebnis gehört
      if (filteredIds.has(marker.locationId)) {
        // ✨ ÄNDERUNG: Marker dem korrekten Layer hinzufügen (Cluster oder direkt Map)
        if (isClusteringActive) {
          clusterGroup.addLayer(marker);
        } else {
          this.map.addLayer(marker);
        }

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

  /**
 * Klick auf den Such-Counter / Clear-Button im Input-Feld
 * Soll nur den Text und das Land/Pills lösen, NICHT die Favoriten/Styles
 */
  clearSearch(shouldFocus = true) {
    this.searchBar.value = '';

    // ✅ Focus nur wenn erwünscht (bei Rechtsklick NICHT fokussieren!)
    if (shouldFocus) {
      this.searchBar.focus();
    }

    // Land im Routing ebenfalls löschen
    if (window.routingManager) {
      window.routingManager._activeCountryFilter = null;
      window.routingManager._isNavigating = true;
      window.location.hash = '';
    }

    // Pills löschen
    if (this.pillsManager) {
      this.pillsManager.clear();
    }

    // ✨ Filter neu berechnen - Styles bleiben erhalten!
    this.applyPillFilters([]);

    setTimeout(() => { if (window.routingManager) window.routingManager._isNavigating = false; }, 100);
  }

  /**
   * ✅ Dedizierte Methode für Rechtsklick - Führt ESC-Logik aus (ohne Auto-Zoom)
   * Wird von map.js aufgerufen
   */
  executeRightClickCleanup() {
    console.log('🖱️ Right-click cleanup: Executing ESC logic (Auto-Zoom suppressed)');

    // Blockiere Auto-Zoom während des Rechtsklicks
    this._manualSpaceClick = true;

    // Exakt die gleiche Logik wie ESC-Handler (Zeilen 77-96):

    // 1. Schließe Filter-Dropdown, falls aktiv
    if (this.styleFilterManager &&
      typeof this.styleFilterManager.isDropdownOpen === 'function' &&
      this.styleFilterManager.isDropdownOpen()) {
      this.styleFilterManager.closeDropdown();
    }

    // 2. Leere die Suche, wenn Text vorhanden ist (OHNE zu fokussieren!)
    if (this.searchBar.value.length > 0) {
      this.clearSearch(false); // ✅ false = kein Focus!
    }

    // 3. Schließe Such-Dropdown
    this.closeDropdown();

    // 4. Entferne Fokus von Searchbar
    if (document.activeElement === this.searchBar) {
      this.searchBar.blur();
    }

    // Reset Flag nach kurzer Verzögerung
    setTimeout(() => {
      this._manualSpaceClick = false;
    }, 100);
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

  /**
 * 💣 NUR HIER wird alles gelöscht!
 * (Klick auf das große X in der Pill-Leiste)
 */
  clearAllFilters() {
    console.log('🗑️ Master Reset: ALLES wird gelöscht.');

    this.searchBar.value = '';
    if (this.pillsManager) this.pillsManager.clear();

    if (window.routingManager) {
      window.routingManager._activeCountryFilter = null;
      window.routingManager._isNavigating = true;
      window.location.hash = '';
    }

    // ✨ Nur bei diesem händischen Klick löschen wir die Favoriten/Status
    if (this.styleFilterManager) {
      this.styleFilterManager.selectedStyles.clear();
      this.styleFilterManager.updateFilterCounter();
      this.styleFilterManager.updateHeaderState();
    }

    this.applyPillFilters([]);
    this.scrollToTop();
    this.searchBar.focus();

    setTimeout(() => { if (window.routingManager) window.routingManager._isNavigating = false; }, 100);
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

  // ✅ REFACTORED: Nutze zentrale Funktion
  getCountryCode(countryName) {
    return window.MapIcons.getCountryCode(countryName);
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

    // ✅ REFACTORED: Keine lokale styleIconMap mehr nötig

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
      else if (categoryKey === 'style') {
        // ✅ REFACTORED: Nutze zentrale getStyleIcon Funktion
        const styleIconClass = window.MapIcons.getStyleIcon(activeFilter);
        const translatedStyle = this.translateFilterValue('style', activeFilter);
        if (styleIconClass) {
          pill.innerHTML = `<i class="${styleIconClass}"></i> ${translatedStyle}`;
        } else {
          pill.innerHTML = `<i class="${config.icon}"></i> ${translatedStyle}`;
        }
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
    if (categoryKey === 'country') {
      // ✅ Country-Filter ist jetzt in routingManager, nicht in Pills!
      return window.routingManager?._activeCountryFilter || null;
    }

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

    // ✅ REFACTORED: Keine lokalen Icon-Maps mehr nötig

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
      else if (categoryKey === 'style') {
        // ✅ REFACTORED: Nutze zentrale getStyleIcon
        const styleIconClass = window.MapIcons.getStyleIcon(option);
        if (styleIconClass) {
          const iconElement = document.createElement('i');
          iconElement.className = styleIconClass;
          iconElement.style.marginRight = '8px';
          iconElement.style.width = '20px';
          iconElement.style.textAlign = 'center';
          optionItem.appendChild(iconElement);
        }
        const translatedStyle = this.translateFilterValue('style', option);
        optionItem.appendChild(document.createTextNode(translatedStyle));
      }
      else if (categoryKey === 'doorState') {
        // ✅ REFACTORED: Nutze zentrale statusMap
        const statusIconClass = option === 'open' ? window.MapIcons.statusMap.open :
          option === 'closed' ? window.MapIcons.statusMap.closed : null;
        if (statusIconClass) {
          const iconElement = document.createElement('i');
          iconElement.className = statusIconClass;
          iconElement.style.marginRight = '8px';
          iconElement.style.width = '20px';
          iconElement.style.textAlign = 'center';
          optionItem.appendChild(iconElement);
        }
        const translatedDoor = this.translateFilterValue('doorState', option);
        optionItem.appendChild(document.createTextNode(translatedDoor));
      }
      else if (categoryKey === 'bookmarks') {
        // ✅ REFACTORED: Nutze zentrale uiMap
        const iconElement = document.createElement('i');
        iconElement.className = window.MapIcons.uiMap.BOOKMARK_FILLED;
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
    // ✅ Country wird jetzt über routingManager gehandhabt
    if (categoryKey === 'country') {
      if (window.routingManager) {
        window.routingManager.clearAllPillsAndFilters();
      }
      return;
    }

    if (!this.styleFilterManager) return;

    let categoryOptions = [];
    if (categoryKey === 'bookmarks') {
      categoryOptions = ['bookmarked'];
    } else if (categoryKey === 'style') {
      categoryOptions = ['for all', 'for youth', 'for students', 'commercial'];
    } else if (categoryKey === 'doorState') {
      categoryOptions = ['open', 'closed'];
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
    // ✅ Country wird jetzt über routingManager gehandhabt
    if (categoryKey === 'country') {
      if (window.routingManager) {
        window.routingManager.applyCountryFilter(option);
      }
      this.scrollToTop();
      this.searchBar.focus();
      return;
    }

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
    const existingSuggestions = this.suggestionsDropdown.querySelectorAll('.suggestion-item, .country-group-header, .id-match-separator');
    existingSuggestions.forEach(item => item.remove());

    this.currentDropdownIndex = -1;
    this.clearActiveDropdownItem();

    // ✅ Prüfen ob wir überhaupt etwas anzeigen können
    const hasIdMatch = !!this._currentIdMatch;
    const hasLocations = locations && locations.length > 0;

    if (!hasIdMatch && !hasLocations) {
      this.dropdownItems = [];
      return;
    }

    const fragment = document.createDocumentFragment();

    // ✅ ID-Match zuerst anzeigen (falls vorhanden)
    if (this._currentIdMatch) {
      const idHeader = document.createElement('div');
      idHeader.classList.add('country-group-header', 'id-match-header');
      idHeader.innerHTML = `<span class="country-title-content">exact ID found:</span>`;
      fragment.appendChild(idHeader);

      const item = this.createSuggestionItem(this._currentIdMatch);
      fragment.appendChild(item);
    }

    // Normale Ergebnisse nach Land gruppiert
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

  /**
   * Erstellt den Header für Ländergruppen in der Liste
   */
  createCountryHeader(country, count) {
    const header = document.createElement('div');
    header.classList.add('country-group-header');
    header.dataset.countryName = country;

    // Header ist aktiv, wenn der globale Country-Filter genau dieses Land ist
    const isFilterActive = window.routingManager?._activeCountryFilter === country;
    const activeClass = isFilterActive ? 'country-filter-active' : '';

    const countryCode = this.getCountryCode(country);
    const translatedCountry = window.i18n.t(`countries.${country}`);

    header.innerHTML = `
      <div class="country-title-content">
        <span class="fi fi-${countryCode} flag-in-header"></span> 
        <div class="country-filter-button ${activeClass}" data-country="${country}">
          <i class="fas fa-filter filter-icon-in-header"></i> 
          <span class="country-filter-name">${translatedCountry}</span>
        </div>
        <span class="country-count">[${count} ${window.i18n.t('searchResults.of')} ${this.json.filter(loc => loc.loc?.country === country).length}]</span>
      </div>
      <div class="country-nav-carets">
        <i class="fas fa-caret-up country-nav-caret" onclick="window.searchManager.handleCountryScroll(event, '${country}', 'prev')"></i>
        <i class="fas fa-caret-down country-nav-caret" onclick="window.searchManager.handleCountryScroll(event, '${country}', 'next')"></i>
      </div>
    `;

    header.querySelector('.country-filter-button').addEventListener('click', (e) => {
      this.handleCountryFilterClick(e, country);
    });

    if (isFilterActive) header.classList.add('is-filtered');
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

    // ✅ Nutze Country-Filter statt Pills!
    if (window.routingManager) {
      const isActive = window.routingManager._activeCountryFilter === country;

      if (isActive) {
        // Deaktiviere Country-Filter
        window.routingManager.clearAllPillsAndFilters();
      } else {
        // Aktiviere Country-Filter
        window.routingManager.applyCountryFilter(country);
      }
    }

    this.searchBar.focus();
  }

  getStickyOffset() {
    return 85;
  }

  createSuggestionItem(location) {
    const item = document.createElement('div');
    item.classList.add('suggestion-item');
    // ✅ OPTIMIERT: Nutze location.ID statt uniqueId
    item.dataset.locationId = location.ID;
    let statusIcon = '', spaceStatusClass = '', nameClass = '';

    let statusColor = 'blue';
    if (location.isOpen === true) {
      statusColor = 'var(--space-open)';
    } else if (location.isOpen === false) {
      statusColor = 'var(--space-closed)';
    } else if (location.spaceapi && location.spaceapi.endpoint) {
      statusColor = 'var(--space-unknown)';
    }

    // ✅ REFACTORED: Nutze zentrale getStyleIcon
    let styleIconHtml = '';
    const locationStyle = location.style ? location.style.toLowerCase() : '';
    const styleIconClass = window.MapIcons.getStyleIcon(locationStyle);

    if (styleIconClass) {
      styleIconHtml = `<i class="${styleIconClass} style-icon" title="${location.style}"></i> `;
    }

    // ✅ REFACTORED: Nutze zentrale statusMap
    if (location.spaceapi && location.spaceapi.endpoint) {
      if (location.isOpen === true) {
        statusIcon = `<i class="${window.MapIcons.statusMap.open} door-icon-open" title="Space ist geöffnet"></i> `;
        spaceStatusClass = 'space-open'; nameClass = 'space-name-open';
      } else if (location.isOpen === false) {
        statusIcon = `<i class="${window.MapIcons.statusMap.closed} door-icon-closed" title="Space ist geschlossen"></i> `;
        spaceStatusClass = 'space-closed'; nameClass = 'space-name-closed';
      } else {
        statusIcon = `<i class="${window.MapIcons.statusMap.unknown} door-icon-unknown" title="Space-Status unbekannt"></i> `;
        spaceStatusClass = 'space-unknown'; nameClass = 'space-name-unknown';
      }
    }
    if (spaceStatusClass) { item.classList.add(spaceStatusClass); }

    const countryCode = this.getCountryCode(location.loc.country);
    const flagHtml = `<span class="fi fi-${countryCode}" style="margin-right: 4px;"></span>`;

    // ✅ OPTIMIERT: Nutze location.ID statt uniqueId
    const bookmarkIcon = window.bookmarkManager ?
      window.bookmarkManager.createBookmarkIcon(location.ID, 'suggestion-bookmark') :
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
      // ✅ Nur übernehmen wenn Maus sich tatsächlich bewegt hat (nicht bei DOM-Rebuild)
      if (!this._mouseHasMoved) {
        return;
      }

      // ✅ Maus übernimmt Kontrolle
      this.lastInputMethod = 'mouse';
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


  // WIEDERHERGESTELLTE Methode handleSuggestionClick (Original)
  handleSuggestionClick(location) {
    // ✅ SAUBERE LÖSUNG: Verhindere alle Auto-Zoom-Mechanismen
    // 1. Clearer Debounce-Timeout (verhindert verzögerten Auto-Zoom)
    clearTimeout(this.zoomDebounceTimeout);

    // 2. Setze Flag um triggerAutoZoom zu blockieren
    this._manualSpaceClick = true;

    // 3. Direkter Zoom auf Space
    this.map.flyTo([location.loc.lat, location.loc.long], 15);

    const targetMarker = this.findMarkerByLocation(location);
    if (targetMarker) {
      targetMarker._openedByHover = false;

      // ✅ OPTIMIERT: Nutze locationId statt uniqueId
      if (window.markerStateManager) {
        window.markerStateManager.clearTimeouts(targetMarker.locationId);
        window.markerStateManager.setState(targetMarker.locationId, {
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
        // URL-Update erfolgt automatisch durch popupopen-Event ✅
      });
    }

    // ✅ NEU: Setze Pre-Filter auf diesen EINEN Space
    if (window.styleFilterManager) {
      window.styleFilterManager.applyPreFilters([location]);
    }

    // Setze Name im Suchfeld
    this.searchBar.value = location.name;

    // ✅ NEU: Zeige Dropdown mit diesem einen Space
    this.createSuggestionItems([location]);
    this.updateSearchCounter(1);
    this.updateDropdownUI(true); // Dropdown bleibt offen

    // ✅ WICHTIG: Reset Flag nach 1000ms (sicher nach allen Events)
    setTimeout(() => {
      this._manualSpaceClick = false;
    }, 1000);
  }


  isStickyMarker(marker) {
    return window.mapUtils && window.mapUtils.currentStickyMarker === marker;
  }

  findMarkerByLocation(location) {
    // ✅ OPTIMIERT: O(1) statt O(n) mit Map.get()
    return window.markerById.get(location.ID) || null;
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
      // ✅ FIX: Prüfe ob Map ein Center/Zoom hat
      if (!this.map.getCenter()) {
        console.warn('⚠️ Map not initialized yet, skipping auto-zoom');
        return;
      }

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
    // ✅ Nur clearStickyPopup wenn KEIN manueller Space-Click aktiv
    // (Bei manuellem Click wird setStickyPopup im moveend aufgerufen)
    if (!this._manualSpaceClick) {
      if (window.mapUtils && window.mapUtils.clearStickyPopup) {
        window.mapUtils.clearStickyPopup();
      }
    }

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
      // ✅ Nutze this.connectionWeight (gesetzt in applyHoverEffects)
      this.connectionLine = window.mapUtils.createConnectionLine(item, targetMarker, color, this.connectionWeight);
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
   * 1. Initialisierung (Hier wird nur erstellt und der Befehl gegeben)
   */
  initializeAutocompleteAndPills() {
    this.pillsManager = new SearchPillsManager(this.searchBar);
    this.autocompleteManager = new window.AutocompleteManager(
      this.json,
      this.searchBar,
      this.styleFilterManager
    );

    // ✨ Wir rufen die Methode unten auf, anstatt den Code hier reinzuschreiben
    this.setupAutocompleteCallbacks();

    console.log('✅ Autocomplete & Pills initialized SYNCHRONOUSLY');
  }

  /**
   * 2. Definition der Callbacks (Hier liegt die eigentliche Logik)
   */
  setupAutocompleteCallbacks() {
    this.autocompleteManager.onSelect((suggestion) => {
      // FALL A: LAND AUSGEWÄHLT
      if (suggestion.type === 'country') {
        // ✨ Text merken (z.B. die "8")
        const SearchTerm = this.searchBar.value;

        if (window.routingManager) {
          window.routingManager.applyCountryFilter(suggestion.text);
        }

        // ✨ Wiederherstellung erzwingen
        setTimeout(() => {
          this.searchBar.value = SearchTerm;
          this.searchBar.focus();
        }, 10);
        return;
      }

      // FALL B: STADT / PLZ AUSGEWÄHLT
      if (suggestion.type === 'city' || suggestion.type === 'zip') {
        this.pillsManager.addPill(suggestion);
        this.searchBar.value = ''; // Hier ist Leeren gewollt (City ersetzt Text)
        this.searchBar.focus();
      }
    });

    this.pillsManager.onChange((pills) => {
      this.applyPillFilters(pills);
      if (window.routingManager && !window.routingManager._isNavigating) {
        window.routingManager.updateURLFromPills(pills);
      }
      this.createActiveFiltersSection();
    });
  }



  /**
   * Aktualisiert die Suchergebnisse in der Liste
   */
  updateSearchResults(filteredLocations) {
    const searchQuery = this.searchBar.value.trim().toLowerCase();
    this.createActiveFiltersSection();
    this.updateMarkers(filteredLocations);
    this.updateSearchCounter(filteredLocations.length);
    this.createSuggestionItems(filteredLocations);

    const hasActivePills = this.pillsManager && this.pillsManager.count() > 0;
    const hasCountry = window.routingManager && window.routingManager._activeCountryFilter;

    this.updateDropdownUI(filteredLocations.length > 0 || searchQuery.length > 0 || hasActivePills || hasCountry);

    if (!this._manualSpaceClick) {
      this.triggerAutoZoom(filteredLocations);
    }
  }

  /**
   * Steuert die Sichtbarkeit des Dropdowns
   */
  updateDropdownUI(shouldShowByResults) {
    const hasPills = this.pillsManager && this.pillsManager.count() > 0;
    const hasCountry = window.routingManager && window.routingManager._activeCountryFilter;
    const hasStyleFilters = this.styleFilterManager && this.styleFilterManager.hasActiveFilters();
    const hasSearchText = this.searchBar.value.trim().length > 0;
    const hasFilterSection = this.suggestionsDropdown.querySelector('.active-filters-section') !== null;

    const shouldShow = shouldShowByResults || hasSearchText || hasPills || hasCountry || hasStyleFilters || hasFilterSection;

    this.suggestionsDropdown.classList.toggle('is-active', shouldShow);
    this.searchBar.classList.toggle('has-suggestions', shouldShow);
  }

  /**
   * Die zentrale Filter-Logik (Kombiniert Text, Land und Pills)
   */
  applyPillFilters(pills) {
    const searchQuery = this.searchBar.value.trim().toLowerCase();
    const router = window.routingManager;
    const hasCityPill = pills.some(p => p.type === 'city');

    if (hasCityPill && router && router._activeCountryFilter) {
      router._activeCountryFilter = null;
    }

    let filtered = this.json;

    if (router && router._activeCountryFilter && !hasCityPill) {
      filtered = filtered.filter(loc => loc.loc?.country === router._activeCountryFilter);
    }

    if (searchQuery.length > 0 && searchQuery !== 'xcr') {
      const normalizedQuery = searchQuery.toLowerCase();

      // ✅ Speichere ID-Match separat (falls Eingabe eine exakte ID ist)
      if (/^\d+$/.test(normalizedQuery)) {
        const idNum = parseInt(normalizedQuery, 10);
        const idMatchLocation = window.locationById?.get(idNum);
        if (idMatchLocation) {
          this._currentIdMatch = idMatchLocation;
        } else {
          this._currentIdMatch = null;
        }
      } else {
        this._currentIdMatch = null;
      }

      // Normale Suche (PLZ, Name, City, Street)
      filtered = filtered.filter(location => {
        if (!location || !location.loc) return false;
        const plz = location.loc.plz && this.zfill(location.loc.plz, location.loc.country);
        if (plz && plz.startsWith(normalizedQuery)) return true;
        const fieldsToSearch = [location.name, location.loc.city, location.loc.country, location.loc.street?.name].filter(Boolean).map(f => f.toLowerCase());
        const separators = /[\s,-]/;
        return fieldsToSearch.some(field => field.startsWith(normalizedQuery) || field.split(separators).some(word => word.startsWith(normalizedQuery)));
      });
    } else {
      this._currentIdMatch = null;
    }

    if (pills.length > 0) {
      pills.forEach(pill => {
        filtered = filtered.filter(loc => {
          if (pill.type === 'city' && router) return router.cityToSlug(loc.loc.city) === router.cityToSlug(pill.text);
          if (pill.type === 'zip') return loc.loc.plz?.toString() === pill.text;
          return true;
        });
      });
    }

    // ✨ WICHTIG: Hier werden Favoriten, Offen-Status etc. angewendet!
    if (this.styleFilterManager) {
      // ✨ DIESER BEFEHL WENDET DIE FAVORITEN AN!
      // Da wir selectedStyles oben NICHT gelöscht haben,
      // filtert er jetzt die aktuelle Liste nach deinen Bookmarks.
      this.styleFilterManager.applyPreFilters(filtered);
    } else {
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
   * ✅ ENTSCHÄRFT: Diese Funktion löscht nur Text und Land/Pills.
   * Sie schont die Favoriten und den Status (Open/Closed)!
   */
  clearSearchAndPills() {
    console.log("♻️ System-Reset: Lösche Text/Land, schütze Styles.");

    this.searchBar.value = '';

    if (this.pillsManager) {
      this.pillsManager.clear();
    }

    // Land im Routing löschen (ohne Styles zu killen)
    if (window.routingManager) {
      window.routingManager._activeCountryFilter = null;
      window.routingManager._isNavigating = true;
      window.location.hash = '';
    }

    // ✨ WICHTIG: Hier KEIN selectedStyles.clear() mehr!
    // Wir triggern nur die Filterung neu, damit Favoriten aktiv bleiben.
    this.applyPillFilters([]);

    if (this.autocompleteManager) {
      this.autocompleteManager.hide();
    }

    setTimeout(() => { if (window.routingManager) window.routingManager._isNavigating = false; }, 100);
  }

}

window.SearchManager = SearchManager;