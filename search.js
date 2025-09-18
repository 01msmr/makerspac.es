// search.js - Finale Lösung mit zentralisiertem Marker-State Management und Style-Filter Integration

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

    this.initializeEventListeners();
    setTimeout(() => { this.setupSpaceAPIEvents(); }, 100);
  }

  setStyleFilterManager(styleFilterManager) {
    this.styleFilterManager = styleFilterManager;
  }

  initializeEventListeners() {
    this.searchBar.focus();

    document.addEventListener('keydown', (e) => {
      // Tab-Navigation zwischen Suche und Filter
      if (e.code === 'Tab') {
        const searchBarHasFocus = document.activeElement === this.searchBar;
        const filterHeaderHasFocus = document.activeElement === this.styleFilterManager.filterHeader;

        if (searchBarHasFocus && !e.shiftKey) { // Vorwärts von Suche
          e.preventDefault();
          this.styleFilterManager.filterHeader.focus();
        } else if (filterHeaderHasFocus && e.shiftKey) { // Rückwärts von Filter
          e.preventDefault();
          this.searchBar.focus();
        } else if (filterHeaderHasFocus && !e.shiftKey) { // Vorwärts von Filter
          e.preventDefault();
          this.searchBar.focus();
        }
        return;
      }

      if (e.code === 'ArrowDown') { e.preventDefault(); this.navigateDropdown('down'); }
      else if (e.code === 'ArrowUp') { e.preventDefault(); this.navigateDropdown('up'); }
      else if (e.code === 'Enter') { e.preventDefault(); this.handleEnterKey(); }
      else if (e.code === 'Escape') { e.preventDefault(); this.handleEscapeKey(); }
    });

    this.searchBar.addEventListener('keyup', (e) => {
      if (['ArrowDown', 'ArrowUp', 'Enter', 'Escape', 'Tab'].includes(e.code)) return;
      if (this.styleFilterManager) this.styleFilterManager.applyFilters();
    });

    this.searchBar.addEventListener('focus', () => {
      if (this.styleFilterManager) this.styleFilterManager.applyFilters();
    });

    document.addEventListener('click', (e) => {
      if (!e.target.closest('.search-container')) this.closeDropdown();
    });

    this.suggestionsDropdown.addEventListener('scroll', () => { this.updateHoverSVGPosition(); });
    this.map.on('zoomstart movestart', () => { this.removeConnectionLine(); });
  }


  updateSearchResults(filteredLocations) {
    this.updateMarkers(filteredLocations);
    this.updateSearchCounter(filteredLocations.length);
    const searchQuery = this.searchBar.value.trim().toLowerCase();

    // NEUE BEDINGUNG: Zeige Dropdown, wenn Suchtext vorhanden ODER Filter aktiv sind
    const shouldShowDropdown = searchQuery.length > 0 || (this.styleFilterManager && this.styleFilterManager.hasActiveFilters());

    if (shouldShowDropdown) {
      this.createSuggestionItems(filteredLocations);
      this.updateDropdownUI(filteredLocations.length > 0);
      this.triggerAutoZoom(filteredLocations);
    } else {
      // Leert das Dropdown, wenn weder gesucht noch gefiltert wird
      this.suggestionsDropdown.innerHTML = '';
      this.updateDropdownUI(false);
      this.handleEmptySearch(); // Zoomt auf die Gesamtansicht
    }
  }

  // NEUE Methode, die die Zoom-Logik bündelt
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
    return this.json.filter(location => {
      if (!location || !location.loc || !location.name || !location.loc.city) return false;
      const nameMatch = location.name.toLowerCase().includes(searchQuery);
      const cityMatch = location.loc.city.toLowerCase().includes(searchQuery);
      const plzMatch = location.loc.plz && this.zfill(location.loc.plz, location.loc.country).startsWith(searchQuery);
      return nameMatch || cityMatch || plzMatch;
    });
  }

  // Unveränderter Rest der Datei...
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
        let hoverColor = '#0000ff';
        if (location.spaceapi && location.spaceapi.endpoint) {
          if (location.isOpen === true) { hoverColor = '#009900'; }
          else if (location.isOpen === false) { hoverColor = '#dd4444'; }
          else { hoverColor = '#f59e0b'; }
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

  handleTabKey() {
    this.searchBar.focus();
    this.currentDropdownIndex = -1;
    this.clearActiveDropdownItem();
    if (this.styleFilterManager) this.styleFilterManager.applyFilters();
  }

  navigateDropdown(direction) {
    this.dropdownItems = Array.from(this.suggestionsDropdown.querySelectorAll('.suggestion-item'));
    if (this.dropdownItems.length === 0) return;
    if (direction === 'down') {
      this.currentDropdownIndex = (this.currentDropdownIndex + 1) % this.dropdownItems.length;
    } else if (direction === 'up') {
      this.currentDropdownIndex = (this.currentDropdownIndex - 1 + this.dropdownItems.length) % this.dropdownItems.length;
    }
    this.updateActiveDropdownItem();
    this.scrollToActiveItem();
  }

  updateActiveDropdownItem() {
    this.clearActiveDropdownItem();
    if (this.currentDropdownIndex >= 0 && this.currentDropdownIndex < this.dropdownItems.length) {
      const activeItem = this.dropdownItems[this.currentDropdownIndex];
      activeItem.classList.add('keyboard-active');
      activeItem.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true, cancelable: true }));
    }
  }

  clearActiveDropdownItem() {
    const activeItem = this.suggestionsDropdown.querySelector('.keyboard-active');
    if (activeItem) {
      activeItem.classList.remove('keyboard-active');
      activeItem.dispatchEvent(new MouseEvent('mouseleave', { bubbles: true, cancelable: true }));
    }
  }

  scrollToActiveItem() {
    if (this.currentDropdownIndex >= 0 && this.currentDropdownIndex < this.dropdownItems.length) {
      this.dropdownItems[this.currentDropdownIndex].scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }

  getLocationFromDropdownItem(dropdownItem) {
    const itemName = dropdownItem.querySelector('.item-name')?.textContent;
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
    const filteredIds = new Set(filteredLocations.map(loc => loc.uniqueId));
    this.allMarkers.forEach(marker => {
      if (filteredIds.has(marker.uniqueId)) {
        const location = this.json.find(loc => loc.uniqueId === marker.uniqueId);
        let iconToSet;
        if (location && location.isOpen === true) { iconToSet = this.icons.greenIcon; }
        else if (location && location.isOpen === false) { iconToSet = this.icons.redIcon; }
        else if (location && location.spaceapi && location.spaceapi.endpoint) { iconToSet = this.icons.unknownStatusIcon; }
        else { iconToSet = this.icons.highlightIcon; }
        marker.setIcon(iconToSet);
        marker.setOpacity(1);
      } else {
        marker.setIcon(this.icons.defaultIcon);
        marker.setOpacity(0.6);
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

  updateDropdownIcons() {
    const suggestionItems = this.suggestionsDropdown.querySelectorAll('.suggestion-item');
    suggestionItems.forEach(item => {
      const itemName = item.querySelector('.item-name');
      if (!itemName) return;
      const nameText = itemName.textContent.trim();
      const location = this.json.find(loc => loc.name === nameText);
      if (location && location.spaceapi && location.spaceapi.endpoint) {
        let statusIcon = '';
        if (location.isOpen === true) { statusIcon = '<i class="fas fa-door-open door-icon-open" title="Space ist geöffnet"></i>'; }
        else if (location.isOpen === false) { statusIcon = '<i class="fas fa-door-closed door-icon-closed" title="Space ist geschlossen"></i>'; }
        else { statusIcon = '<i class="fas fa-question-circle door-icon-unknown" title="Space-Status unbekannt"></i>'; }
        itemName.innerHTML = statusIcon + location.name;
      }
    });
  }

  updateDropdownUI(hasResults) {
    this.suggestionsDropdown.classList.toggle('is-active', hasResults);
    this.searchBar.classList.toggle('has-suggestions', hasResults);
  }

  updateSearchCounter(count) {
    this.searchCounter.textContent = count;
    const isSearching = this.searchBar.value.length > 0 || (this.styleFilterManager && this.styleFilterManager.hasActiveFilters());
    this.searchCounter.classList.toggle('visible', isSearching);
    this.searchCounter.classList.toggle('has-results', count > 0);
    this.searchCounter.classList.toggle('no-results', isSearching && count === 0);
  }

  createSuggestionItems(locations) {
    this.suggestionsDropdown.innerHTML = '';
    this.currentDropdownIndex = -1;
    this.clearActiveDropdownItem();
    const fragment = document.createDocumentFragment();
    const sortedLocations = this.sortLocationsByGeography(locations);
    sortedLocations.forEach(location => {
      const item = this.createSuggestionItem(location);
      fragment.appendChild(item);
    });
    this.suggestionsDropdown.appendChild(fragment);
    this.dropdownItems = Array.from(this.suggestionsDropdown.querySelectorAll('.suggestion-item'));
  }

  createSuggestionItem(location) {
    const item = document.createElement('div');
    item.classList.add('suggestion-item');
    let statusIcon = '', spaceStatusClass = '', nameClass = '';
    if (location.spaceapi && location.spaceapi.endpoint) {
      if (location.isOpen === true) {
        statusIcon = '<i class="fas fa-door-open door-icon-open" title="Space ist geöffnet"></i>';
        spaceStatusClass = 'space-open'; nameClass = 'space-name-open';
      } else if (location.isOpen === false) {
        statusIcon = '<i class="fas fa-door-closed door-icon-closed" title="Space ist geschlossen"></i>';
        spaceStatusClass = 'space-closed'; nameClass = 'space-name-closed';
      } else {
        statusIcon = '<i class="fas fa-question-circle door-icon-unknown" title="Space-Status unbekannt"></i>';
        spaceStatusClass = 'space-unknown'; nameClass = 'space-name-unknown';
      }
    }
    if (spaceStatusClass) { item.classList.add(spaceStatusClass); }
    item.innerHTML = `
      <div class="item-content">
        <div class="item-name"><span class="${nameClass}">${statusIcon}${location.name}</span></div>
        <div class="item-details">${location.loc.street.name} ${location.loc.street.number} ${location.loc.street.ext}</div>
        <div class.item-details"><b>${this.zfill(location.loc.plz, location.loc.country)}</b> ${location.loc.city}</div>
      </div>`;
    this.setupSuggestionItemEvents(item, location);
    return item;
  }

  setupSuggestionItemEvents(item, location) {
    item.addEventListener('mouseenter', () => {
      this.allMarkers.forEach(marker => {
        if (marker.isPopupOpen()) marker.closePopup();
      });
      if (window.mapUtils && window.mapUtils.clearStickyPopup) {
        window.mapUtils.clearStickyPopup();
      }

      this.isDropdownHovering = true;
      this.currentHoverItem = item;

      let hoverColor = '#0000ff';
      if (location.spaceapi && location.spaceapi.endpoint) {
        if (location.isOpen === true) { hoverColor = '#00AA00'; }
        else if (location.isOpen === false) { hoverColor = '#DD0000'; }
        else { hoverColor = '#FF8C00'; }
      }

      this.createHoverSVG(item, location, hoverColor);
      const targetMarker = this.findMarkerByLocation(location);

      if (targetMarker) {
        if (window.markerStateManager) {
          window.markerStateManager.setState(targetMarker.uniqueId, {
            isDropdownHovering: true
          });
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
    });

    item.addEventListener('mouseleave', () => {
      this.isDropdownHovering = false;
      if (this.popupTimeout) {
        clearTimeout(this.popupTimeout);
        this.popupTimeout = null;
      }

      this.currentHoverItem = null;
      this.cleanupHoverSVG();
      this.removeConnectionLine();

      const targetMarker = this.findMarkerByLocation(location);
      if (targetMarker) {
        if (window.markerStateManager) {
          window.markerStateManager.setState(targetMarker.uniqueId, {
            isDropdownHovering: false
          });
        }

        if (window.mapUtils && window.mapUtils.clearMarkerDropdownHover) {
          window.mapUtils.clearMarkerDropdownHover(targetMarker);
        }

        if (!this.isStickyMarker(targetMarker)) {
          targetMarker.closePopup();
        }

        setTimeout(() => {
          if (window.markerStateManager && !window.markerStateManager.isAnyHoverActive(targetMarker.uniqueId)) {
            if (this.styleFilterManager) this.styleFilterManager.applyFilters();
          }
        }, 100);
      }
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
    const dropdownWidth = dropdownRight - dropdownLeft;

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
}

window.SearchManager = SearchManager;