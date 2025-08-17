// search.js - SuchfunktionalitÃ¤t als separates Modul

class SearchManager {
  constructor(map, allMarkers, json, icons, zfill) {
    this.map = map;
    this.allMarkers = allMarkers;
    this.json = json;
    this.icons = icons; // { defaultIcon, highlightIcon, hoverIcon }
    this.zfill = zfill;
    this.zoomDebounceTimeout = null;
    this.connectionLine = null;
    // Zoom-Rahmen - Element fÃ¼r die Zoom-Vorschau (nur Overlay)
    this.zoomPreviewOverlay = null;
    // Zoom-Rahmen - Erinnerung an vorherigen Rahmen fÃ¼r 2-Schritt-Zoom
    this.previousZoomBounds = null;
    // Dropdown-Overlap-Erkennung
    this.overlapCheckInterval = null;
    this.overlapCheckFunction = null;

    this.searchBar = document.getElementById('search-bar');
    this.suggestionsDropdown = document.getElementById('suggestions-dropdown');
    this.searchCounter = document.getElementById('search-counter');

    // *** NEU: Keyboard-Navigation Variablen ***
    this.currentDropdownIndex = -1; // -1 = kein Element aktiv
    this.dropdownItems = []; // Array der aktuellen Dropdown-Items

    // *** NEU: SVG Scroll-Tracking ***
    this.currentHoverSVG = null;
    this.currentHoverItem = null;

    this.initializeEventListeners();
  }

  initializeEventListeners() {
    // Focus auf Suchfeld beim Laden
    this.searchBar.focus();

    // *** NEU: Globale Keyboard-Navigation (Ã¼berall auf der Seite) ***
    document.addEventListener('keydown', (e) => {
      if (e.code === 'Tab') {
        e.preventDefault();
        this.handleTabKey();
      } else if (e.code === 'ArrowDown') {
        e.preventDefault();
        this.navigateDropdown('down');
      } else if (e.code === 'ArrowUp') {
        e.preventDefault();
        this.navigateDropdown('up');
      } else if (e.code === 'Enter') {
        e.preventDefault();
        this.handleEnterKey();
      } else if (e.code === 'Escape') {
        e.preventDefault();
        this.handleEscapeKey();
      }
    });

    // Keyup-Event fÃ¼r die Suche
    this.searchBar.addEventListener('keyup', (e) => {
      // Ignoriere Navigation-Tasten fÃ¼r Search
      if (['ArrowDown', 'ArrowUp', 'Enter', 'Escape'].includes(e.code)) {
        return;
      }

      this.performSearch();
    });

    // Focus Event
    this.searchBar.addEventListener('focus', () => {
      if (this.searchBar.value.trim().length > 0) {
        this.performSearch();
      }
    });

    // Click auÃŸerhalb schlieÃŸt Dropdown
    document.addEventListener('click', (e) => {
      if (!e.target.closest('.search-container')) {
        this.closeDropdown();
      }
    });

    // *** NEU: Scroll-Event fÃ¼r Dropdown ***
    this.suggestionsDropdown.addEventListener('scroll', () => {
      this.updateHoverSVGPosition();
    });

    // Map-Events fÃ¼r Connection Line Cleanup 
    this.map.on('zoomstart movestart', () => {
      this.removeConnectionLine();
    });
  }

  // *** NEU: SVG und Verbindungslinie Position bei Scroll aktualisieren ***
  updateHoverSVGPosition() {
    if (this.currentHoverSVG && this.currentHoverItem) {
      const location = this.getLocationFromDropdownItem(this.currentHoverItem);
      if (location) {
        // Entferne alte Verbindungslinie
        this.removeConnectionLine();
        // Entferne das alte SVG
        this.cleanupHoverSVG();
        // Erstelle SVG und Verbindungslinie neu an der aktuellen Position
        this.createHoverSVG(this.currentHoverItem, location);
        const targetMarker = this.findMarkerByLocation(location);
        if (targetMarker) {
          this.createConnectionLine(this.currentHoverItem, targetMarker);
        }
      }
    }
  }

  // *** NEU: Tabulator-Taste Behandlung ***
  handleTabKey() {
    this.searchBar.focus();
    this.currentDropdownIndex = -1;
    this.clearActiveDropdownItem();
    this.performSearch();
  }

  // *** NEU: Cursortasten-Navigation im Dropdown ***
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

  // *** NEU: Aktives Dropdown-Item visuell markieren (nutzt vorhandenes CSS) ***
  updateActiveDropdownItem() {
    this.clearActiveDropdownItem();
    if (this.currentDropdownIndex >= 0 && this.currentDropdownIndex < this.dropdownItems.length) {
      const activeItem = this.dropdownItems[this.currentDropdownIndex];
      activeItem.style.backgroundColor = 'blue';
      activeItem.style.color = 'white';
      activeItem.querySelectorAll('.item-details').forEach(detail => { detail.style.color = '#ccc'; });
      activeItem.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true, cancelable: true }));
    }
  }

  // *** NEU: Hover-Effekte entfernen (nutzt vorhandenes CSS) ***
  clearActiveDropdownItem() {
    this.dropdownItems.forEach(item => {
      item.style.backgroundColor = '';
      item.style.color = '';
      item.querySelectorAll('.item-details').forEach(detail => { detail.style.color = ''; });
      item.dispatchEvent(new MouseEvent('mouseleave', { bubbles: true, cancelable: true }));
    });
  }

  // *** NEU: Zum aktiven Element scrollen ***
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

  // *** KORRIGIERT: Implementiert ein Debounce-Muster fÃ¼r die Suche ***
  performSearch() {
    // *** WICHTIG: Bricht jeden zuvor geplanten Zoom sofort ab ***
    clearTimeout(this.zoomDebounceTimeout);
    this.cleanupUI(); // Bereinigt visuelle Elemente wie Hover-Effekte sofort

    const searchQuery = this.searchBar.value.trim().toLowerCase();

    // *** Schritt 1: FÃ¼hrt die UI-Updates sofort fÃ¼r ein responsives GefÃ¼hl aus ***
    if (searchQuery.length < 1) {
      // Bei leerer Suche, die UI sofort zurÃ¼cksetzen
      this.suggestionsDropdown.innerHTML = '';
      this.updateDropdownUI(false);
      this.updateSearchCounter(0);
      this.allMarkers.forEach(marker => {
        marker.setIcon(this.icons.defaultIcon);
        marker.setOpacity(0.66);
      });
    } else {
      const filteredLocations = this.filterLocations(searchQuery);
      const sortedFilteredLocations = this.sortLocationsByGeography(filteredLocations);

      this.updateMarkers(sortedFilteredLocations); // Marker sofort aktualisieren
      this.updateDropdownUI(sortedFilteredLocations.length > 0);
      this.updateSearchCounter(sortedFilteredLocations.length);
      this.createSuggestionItems(sortedFilteredLocations); // Dropdown sofort erstellen
    }

    // *** Schritt 2: Plant die disruptive Zoom-Aktion mit einer VerzÃ¶gerung (Debounce) ***
    // Dies wird nur ausgefÃ¼hrt, wenn der Benutzer mit dem Tippen fÃ¼r 400ms pausiert.
    const DEBOUNCE_DELAY = 400; // 250ms ist sehr schnell, 400ms fÃ¼hlt sich natÃ¼rlicher an
    this.zoomDebounceTimeout = setTimeout(() => {
      const currentQuery = this.searchBar.value.trim().toLowerCase();
      if (currentQuery.length < 1) {
        this.handleEmptySearch();
      } else {
        const finalLocations = this.filterLocations(currentQuery);
        if (finalLocations.length > 0) {
          this.setupAutoZoom(finalLocations);
        }
      }
    }, DEBOUNCE_DELAY);
  }

  filterLocations(searchQuery) {
    return this.json.filter(location =>
      location.name.toLowerCase().includes(searchQuery) ||
      this.zfill(location.loc.plz, location.loc.country).startsWith(searchQuery) ||
      location.loc.city.toLowerCase().includes(searchQuery)
    );
  }

  sortLocationsByGeography(locations) {
    return locations.sort((a, b) => b.loc.lat - a.loc.lat);
  }

  updateMarkers(filteredLocations) {
    const filteredIds = new Set(filteredLocations.map(loc => loc.uniqueId));

    this.allMarkers.forEach(marker => {
      if (filteredIds.has(marker.uniqueId)) {
        marker.setIcon(this.icons.highlightIcon);
        marker.setOpacity(1);
      } else {
        marker.setIcon(this.icons.defaultIcon);
        marker.setOpacity(0.6);
      }
    });
  }

  updateDropdownUI(hasResults) {
    this.suggestionsDropdown.classList.toggle('is-active', hasResults);
    this.searchBar.classList.toggle('has-suggestions', hasResults);
  }

  updateSearchCounter(count) {
    this.searchCounter.textContent = count;
    const isSearching = this.searchBar.value.length > 0;
    this.searchCounter.classList.toggle('visible', isSearching);
    this.searchCounter.classList.toggle('has-results', count > 0);
    this.searchCounter.classList.toggle('no-results', isSearching && count === 0);
  }

  createSuggestionItems(locations) {
    this.suggestionsDropdown.innerHTML = ''; // Vorherige Ergebnisse lÃ¶schen
    this.currentDropdownIndex = -1;
    this.clearActiveDropdownItem();

    const fragment = document.createDocumentFragment();
    locations.forEach(location => {
      const item = this.createSuggestionItem(location);
      fragment.appendChild(item);
    });
    this.suggestionsDropdown.appendChild(fragment);

    this.dropdownItems = Array.from(this.suggestionsDropdown.querySelectorAll('.suggestion-item'));
  }

  createSuggestionItem(location) {
    const item = document.createElement('div');
    item.classList.add('suggestion-item');
    item.innerHTML = `
      <div class="item-content">
        <div class="item-name">${location.name}</div>
        <div class="item-details">${location.loc.street.name} ${location.loc.street.number} ${location.loc.street.ext}</div>
        <div class="item-details"><b>${this.zfill(location.loc.plz, location.loc.country)}</b> ${location.loc.city}</div>
      </div>
    `;
    this.setupSuggestionItemEvents(item, location);
    return item;
  }

  setupSuggestionItemEvents(item, location) {
    item.addEventListener('mouseenter', () => this.handleSuggestionMouseEnter(item, location));
    item.addEventListener('mouseleave', () => this.handleSuggestionMouseLeave(location));
    item.addEventListener('click', () => this.handleSuggestionClick(location));
  }

  handleSuggestionMouseEnter(item, location) {
    this.allMarkers.forEach(marker => { if (marker.isPopupOpen()) marker.closePopup(); });

    // *** NEU: Speichere aktuelles Hover-Item fÃ¼r Scroll-Updates ***
    this.currentHoverItem = item;

    this.createHoverSVG(item, location);
    const targetMarker = this.findMarkerByLocation(location);
    if (targetMarker) {
      targetMarker.setIcon(this.icons.hoverIcon);
      this.createConnectionLine(item, targetMarker);
    }
  }

  handleSuggestionMouseLeave(location) {
    // *** NEU: Entferne Hover-Item Referenz ***
    this.currentHoverItem = null;

    this.cleanupHoverSVG();
    const targetMarker = this.findMarkerByLocation(location);
    if (targetMarker) {
      // ÃœberprÃ¼fen, ob es noch Teil der gefilterten Ergebnisse ist, bevor das Icon geÃ¤ndert wird
      const currentQuery = this.searchBar.value.trim().toLowerCase();
      const currentFiltered = this.filterLocations(currentQuery);
      if (currentFiltered.some(loc => loc.uniqueId === location.uniqueId)) {
        targetMarker.setIcon(this.icons.highlightIcon);
      }
    }
    this.removeConnectionLine();
  }

  handleSuggestionClick(location) {
    clearTimeout(this.zoomDebounceTimeout); // Verhindert, dass ein Auto-Zoom den Klick Ã¼berschreibt
    this.map.flyTo([location.loc.lat, location.loc.long], 15);
    const targetMarker = this.findMarkerByLocation(location);
    if (targetMarker) {
      // Popup nach Abschluss des flyTo Ã¶ffnen fÃ¼r eine flÃ¼ssigere Erfahrung
      this.map.once('moveend', () => targetMarker.openPopup());
    }
    this.searchBar.value = location.name;
    this.closeDropdown();
  }

  findMarkerByLocation(location) {
    return this.allMarkers.find(m => m.uniqueId === location.uniqueId);
  }

  createHoverSVG(item, location) {
    // *** NEU: Cleanup vorheriges SVG ***
    this.cleanupHoverSVG();

    const itemRect = item.getBoundingClientRect();
    const itemHeight = itemRect.height;
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.id = 'current-connector';
    svg.style.cssText = `position: fixed; left: ${itemRect.left - 50}px; top: ${itemRect.top - 0.5}px; width: 80px; height: ${itemHeight}px; z-index: 999; pointer-events: none;`;
    svg.setAttribute('viewBox', '65 0 570 620');
    svg.setAttribute('preserveAspectRatio', 'none');
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', 'M632.86,6.618L436.232,6.618C416.818,6.599 396.254,9.684 376.225,16.429C356.196,23.174 336.703,33.579 319.618,47.041C302.534,60.503 287.858,77.022 276.615,94.918C265.373,112.813 257.563,132.086 253.041,150.966C244.69,186.193 226.089,220.425 195.188,245.142C164.286,269.858 121.084,285.059 70.815,284.779L70.815,336.251C121.084,335.971 164.286,351.172 195.188,375.888C226.089,400.604 244.69,434.836 253.041,470.064C257.563,488.944 265.373,508.216 276.615,526.112C287.858,544.008 302.534,560.527 319.618,573.988C336.703,587.45 356.196,597.856 376.225,604.6C396.254,611.345 416.818,614.43 436.232,614.412L632.86,614.412L632.86,6.618Z');
    path.setAttribute('fill', 'blue');
    svg.appendChild(path);
    document.body.appendChild(svg);

    // *** NEU: Speichere SVG Referenz ***
    this.currentHoverSVG = svg;
  }

  cleanupHoverSVG() {
    if (this.currentHoverSVG) {
      this.currentHoverSVG.remove();
      this.currentHoverSVG = null;
    }
    // *** FALLBACK: Entferne auch ältere SVGs mit der ID ***
    const svg = document.getElementById('current-connector');
    if (svg) svg.remove();
  }

  // Diese Funktion wird nun von dem debounced Timeout in performSearch aufgerufen
  setupAutoZoom(filteredLocations) {
    if (filteredLocations.length === 0) return;

    const markersToZoom = filteredLocations
      .map(loc => this.findMarkerByLocation(loc))
      .filter(Boolean);

    if (markersToZoom.length === 0) return;

    this.suggestionsDropdown.classList.add('is-zooming');

    let newBounds;
    if (markersToZoom.length > 1) {
      newBounds = L.featureGroup(markersToZoom).getBounds().pad(0.2);
    } else if (markersToZoom.length === 1) {
      const center = markersToZoom[0].getLatLng();
      const radius = 0.01;
      newBounds = L.latLngBounds(
        [center.lat - radius, center.lng - radius],
        [center.lat + radius, center.lng + radius]
      );
    }

    if (newBounds) {
      if (this.previousZoomBounds && !this.previousZoomBounds.intersects(newBounds)) {
        this.executeThreeFrameZoom(this.previousZoomBounds, newBounds, markersToZoom);
      } else {
        this.executeNormalZoom(newBounds, markersToZoom);
      }
      this.previousZoomBounds = newBounds;
    }
  }

  executeNormalZoom(bounds, markersToZoom) {
    this.removeZoomPreviewFrame();
    this.createZoomPreviewFrame(bounds);
    setTimeout(() => {
      this.executeZoom(markersToZoom);
    }, 800);
  }

  executeThreeFrameZoom(firstBounds, secondBounds, markersToZoom) {
    const combinedBounds = L.latLngBounds([
      [Math.min(firstBounds.getSouth(), secondBounds.getSouth()), Math.min(firstBounds.getWest(), secondBounds.getWest())],
      [Math.max(firstBounds.getNorth(), secondBounds.getNorth()), Math.max(firstBounds.getEast(), secondBounds.getEast())]
    ]).pad(0.05);

    this.removeZoomPreviewFrame();
    this.createZoomPreviewFrame(combinedBounds);

    const combinedZoomPromise = new Promise(resolve => {
      this.map.once('zoomend moveend', resolve);
      setTimeout(() => this.map.flyToBounds(combinedBounds, { duration: 0.8 }), 800);
    });

    combinedZoomPromise.then(() => {
      setTimeout(() => {
        this.removeZoomPreviewFrame(); // Entfernt den kombinierten Rahmen
        this.createZoomPreviewFrame(secondBounds); // Zeigt den finalen Rahmen
        setTimeout(() => {
          this.executeZoom(markersToZoom, true); // keepFrame = true
        }, 800);
      }, 50);
    });
  }

  executeZoom(markersToZoom, keepFrame = false) {
    const zoomPromise = new Promise(resolve => {
      this.map.once('zoomend moveend', resolve);
      if (markersToZoom.length > 1) {
        this.map.flyToBounds(L.featureGroup(markersToZoom).getBounds().pad(0.2));
      } else if (markersToZoom.length === 1) {
        this.map.flyTo(markersToZoom[0].getLatLng(), 13);
      }
    });

    zoomPromise.then(() => {
      this.suggestionsDropdown.classList.remove('is-zooming');
      if (keepFrame) {
        setTimeout(() => this.removeAllZoomFrames(), 800);
      } else {
        this.removeZoomPreviewFrame();
      }
    });
  }

  handleEmptySearch() {
    this.previousZoomBounds = null;
    this.map.flyTo(new L.LatLng(51.0122995, 10.3995537), 7, {
      duration: 1.5
    });
  }

  closeDropdown() {
    this.suggestionsDropdown.classList.remove('is-active');
    this.searchBar.classList.remove('has-suggestions');
    this.removeConnectionLine();
    this.currentDropdownIndex = -1;
    this.clearActiveDropdownItem();
    // *** NEU: Cleanup bei Dropdown-SchlieÃŸung ***
    this.currentHoverItem = null;
    this.cleanupHoverSVG();
  }

  cleanupUI() {
    this.removeConnectionLine();
    this.cleanupHoverSVG();
    // *** NEU: Reset Hover-Item ***
    this.currentHoverItem = null;
  }

  createZoomPreviewFrame(bounds) {
    this.removeZoomPreviewFrame();
    const mapContainer = document.getElementById('map');
    const viewportWidth = mapContainer.clientWidth;
    const viewportHeight = mapContainer.clientHeight;
    const centerLat = bounds.getCenter().lat;
    const centerLng = bounds.getCenter().lng;
    const targetZoom = this.map.getBoundsZoom(bounds);
    const mapCenter = L.latLng(centerLat, centerLng);
    const centerPoint = this.map.project(mapCenter, targetZoom);
    const topLeft = this.map.unproject(L.point(centerPoint.x - viewportWidth / 2, centerPoint.y - viewportHeight / 2), targetZoom);
    const bottomRight = this.map.unproject(L.point(centerPoint.x + viewportWidth / 2, centerPoint.y + viewportHeight / 2), targetZoom);
    const bufferFactor = 1.05;
    const frameWidth = (bottomRight.lng - topLeft.lng) * bufferFactor;
    const frameHeight = (topLeft.lat - bottomRight.lat) * bufferFactor;
    const extendedBounds = L.latLngBounds(
      [centerLat - frameHeight / 2, centerLng - frameWidth / 2],
      [centerLat + frameHeight / 2, centerLng + frameWidth / 2]
    );
    const outerRing = [[-90, -180], [90, -180], [90, 180], [-90, 180]];
    const innerRing = [
      [extendedBounds.getNorth(), extendedBounds.getWest()],
      [extendedBounds.getSouth(), extendedBounds.getWest()],
      [extendedBounds.getSouth(), extendedBounds.getEast()],
      [extendedBounds.getNorth(), extendedBounds.getEast()],
    ];

    this.zoomPreviewOverlay = L.polygon([outerRing, innerRing], {
      color: 'black', fillColor: 'black', fillOpacity: 0, weight: 0, interactive: false,
      pane: 'overlayPane', className: 'zoom-preview-overlay'
    }).addTo(this.map);

    setTimeout(() => {
      if (this.zoomPreviewOverlay && this.zoomPreviewOverlay._path) {
        this.zoomPreviewOverlay._path.style.transition = 'fill-opacity 0.25s ease-in-out';
        this.zoomPreviewOverlay.setStyle({ fillOpacity: 0.4 });
        this.startDropdownOverlapDetection(extendedBounds);
      }
    }, 50);
  }

  startDropdownOverlapDetection(zoomFrameBounds) {
    this.stopDropdownOverlapDetection();
    this.overlapCheckFunction = () => this.checkDropdownZoomFrameOverlap(zoomFrameBounds);
    this.overlapCheckInterval = setInterval(this.overlapCheckFunction, 100);
    this.checkDropdownZoomFrameOverlap(zoomFrameBounds);
  }

  checkDropdownZoomFrameOverlap(zoomFrameBounds) {
    const dropdown = this.suggestionsDropdown;
    if (!dropdown || !dropdown.classList.contains('is-active')) {
      this.resetDropdownOpacity();
      return;
    }
    const dropdownRect = dropdown.getBoundingClientRect();
    const mapRect = document.getElementById('map').getBoundingClientRect();
    const dropdownTopLeft = this.map.containerPointToLatLng([dropdownRect.left - mapRect.left, dropdownRect.top - mapRect.top]);
    const dropdownBottomRight = this.map.containerPointToLatLng([dropdownRect.right - mapRect.left, dropdownRect.bottom - mapRect.top]);
    const dropdownBounds = L.latLngBounds(dropdownBottomRight, dropdownTopLeft);

    if (!zoomFrameBounds.intersects(dropdownBounds)) {
      this.resetDropdownOpacity();
      return;
    }

    const zfTopLeft = this.map.latLngToContainerPoint(zoomFrameBounds.getNorthWest());
    const zfBottomRight = this.map.latLngToContainerPoint(zoomFrameBounds.getSouthEast());
    const zfWidth = zfBottomRight.x - zfTopLeft.x;
    const overlapLeft = Math.max(zfTopLeft.x, dropdownRect.left - mapRect.left);
    const overlapRight = Math.min(zfBottomRight.x, dropdownRect.right - mapRect.left);
    const overlapWidth = Math.max(0, overlapRight - overlapLeft);
    const overlapPercentage = (overlapWidth / zfWidth) * 100;

    if (overlapPercentage > 80) this.reduceDropdownOpacity();
    else this.resetDropdownOpacity();
  }

  reduceDropdownOpacity() {
    const dropdown = this.suggestionsDropdown;
    if (dropdown && !dropdown.classList.contains('overlap-reduced')) {
      dropdown.style.transition = 'opacity 0.3s ease-in-out';
      dropdown.style.opacity = '0.33';
      dropdown.classList.add('overlap-reduced');
    }
  }

  resetDropdownOpacity() {
    const dropdown = this.suggestionsDropdown;
    if (dropdown && dropdown.classList.contains('overlap-reduced')) {
      dropdown.style.transition = 'opacity 0.3s ease-in-out';
      dropdown.style.opacity = '1';
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

  removeAllZoomFrames() {
    this.stopDropdownOverlapDetection();
    if (this.zoomPreviewOverlay) {
      this.map.removeLayer(this.zoomPreviewOverlay);
      this.zoomPreviewOverlay = null;
    }
  }

  removeZoomPreviewFrame() {
    this.stopDropdownOverlapDetection();
    if (this.zoomPreviewOverlay) {
      const overlay = this.zoomPreviewOverlay;
      if (overlay._path) {
        overlay._path.style.transition = 'fill-opacity 0.3s ease-in-out';
        overlay.setStyle({ fillOpacity: 0 });
      }
      setTimeout(() => {
        if (this.map.hasLayer(overlay)) this.map.removeLayer(overlay);
      }, 350);
      this.zoomPreviewOverlay = null;
    }
  }

  createConnectionLine(item, targetMarker) {
    if (window.mapUtils && window.mapUtils.createConnectionLine) {
      this.connectionLine = window.mapUtils.createConnectionLine(item, targetMarker);
    } else {
      console.error('mapUtils.createConnectionLine not available');
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