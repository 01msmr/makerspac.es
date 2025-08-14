// search.js - Suchfunktionalität als separates Modul

class SearchManager {
  constructor(map, allMarkers, json, icons, zfill) {
    this.map = map;
    this.allMarkers = allMarkers;
    this.json = json;
    this.icons = icons; // { defaultIcon, highlightIcon, hoverIcon }
    this.zfill = zfill;
    this.zoomDebounceTimeout = null;
    this.connectionLine = null;

    this.searchBar = document.getElementById('search-bar');
    this.suggestionsDropdown = document.getElementById('suggestions-dropdown');

    this.initializeEventListeners();
  }

  initializeEventListeners() {
    // Focus auf Suchfeld beim Laden
    this.searchBar.focus();

    // Keyup-Event für die Suche
    this.searchBar.addEventListener('keyup', () => this.performSearch());

    // Focus Event
    this.searchBar.addEventListener('focus', () => {
      if (this.searchBar.value.trim().length > 0) {
        this.performSearch();
      }
    });

    // Click außerhalb schließt Dropdown
    document.addEventListener('click', (e) => {
      if (!e.target.closest('.search-container')) {
        this.closeDropdown();
      }
    });

    // Map-Events für Connection Line Cleanup
    this.map.on('zoomstart movestart', () => {
      this.removeConnectionLine();
    });
  }

  performSearch() {
    const searchQuery = this.searchBar.value.toLowerCase();

    // Cleanup
    clearTimeout(this.zoomDebounceTimeout);
    this.suggestionsDropdown.innerHTML = '';
    this.cleanupUI();

    // Early return für leere Suche
    if (searchQuery.length < 1) {
      this.handleEmptySearch();
      return;
    }

    // Filter und sortiere Locations
    const filteredLocations = this.filterLocations(searchQuery);
    const sortedFilteredLocations = this.sortLocationsByGeography(filteredLocations);

    // Update Markers
    this.updateMarkers(sortedFilteredLocations);

    // Update UI
    const hasResults = sortedFilteredLocations.length > 0;
    this.updateDropdownUI(hasResults);

    // Erstelle Suggestion Items
    if (hasResults) {
      this.createSuggestionItems(sortedFilteredLocations);
      this.setupAutoZoom(sortedFilteredLocations);
    }
  }

  filterLocations(searchQuery) {
    return this.json.filter(location =>
      location.name.toLowerCase().includes(searchQuery) ||
      this.zfill(location.loc.plz, location.loc.country).startsWith(searchQuery) ||
      location.loc.city.toLowerCase().includes(searchQuery)
    );
  }

  sortLocationsByGeography(locations) {
    return locations.sort((a, b) => {
      const latDiff = b.loc.lat - a.loc.lat;
      if (Math.abs(latDiff) < 0.1) {
        return a.loc.long - b.loc.long;
      }
      return latDiff;
    });
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
    if (hasResults) {
      this.suggestionsDropdown.classList.add('is-active');
      this.searchBar.classList.add('has-suggestions');
    } else {
      this.suggestionsDropdown.classList.remove('is-active');
      this.searchBar.classList.remove('has-suggestions');
    }
  }

  createSuggestionItems(locations) {
    locations.forEach(location => {
      const item = this.createSuggestionItem(location);
      this.suggestionsDropdown.appendChild(item);
    });
  }

  createSuggestionItem(location) {
    const item = document.createElement('div');
    item.classList.add('suggestion-item');

    const contentDiv = document.createElement('div');
    contentDiv.classList.add('item-content');
    contentDiv.innerHTML = `
      <div class="item-name">${location.name}</div>
      <div class="item-details">${location.loc.street.name} ${location.loc.street.number} ${location.loc.street.ext}</div>
      <div class="item-details"><b>${this.zfill(location.loc.plz, location.loc.country)}</b> ${location.loc.city}</div>
    `;

    item.appendChild(contentDiv);
    this.setupSuggestionItemEvents(item, location);

    return item;
  }

  setupSuggestionItemEvents(item, location) {
    item.addEventListener('mouseenter', () => {
      this.handleSuggestionMouseEnter(item, location);
    });

    item.addEventListener('mouseleave', () => {
      this.handleSuggestionMouseLeave(location);
    });

    item.addEventListener('click', () => {
      this.handleSuggestionClick(location);
    });
  }

  handleSuggestionMouseEnter(item, location) {
    // Schließe alle offenen Popups
    this.allMarkers.forEach(marker => {
      if (marker.isPopupOpen()) {
        marker.closePopup();
      }
    });

    this.createHoverSVG(item, location);

    const targetMarker = this.findMarkerByLocation(location);
    if (targetMarker) {
      targetMarker.setIcon(this.icons.hoverIcon);
      this.createConnectionLine(item, targetMarker);
    }
  }

  handleSuggestionMouseLeave(location) {
    this.cleanupHoverSVG();

    const targetMarker = this.findMarkerByLocation(location);
    if (targetMarker) {
      targetMarker.setIcon(this.icons.highlightIcon);
      targetMarker.setOpacity(1);
    }

    this.removeConnectionLine();
  }

  handleSuggestionClick(location) {
    this.map.flyTo([location.loc.lat, location.loc.long], 15);

    const targetMarker = this.findMarkerByLocation(location);
    if (targetMarker) targetMarker.openPopup();

    this.searchBar.value = location.name;
    this.closeDropdown();
  }

  findMarkerByLocation(location) {
    return this.allMarkers.find(m => m.uniqueId === location.uniqueId);
  }

  createHoverSVG(item, location) {
    const itemRect = item.getBoundingClientRect();
    const itemHeight = itemRect.height;

    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.id = 'current-connector';
    svg.style.cssText = `
      position: fixed !important;
      left: ${itemRect.left - 50}px !important;
      top: ${itemRect.top - 0.5}px !important;
      width: 80px !important;
      height: ${itemHeight}px !important;
      z-index: 999 !important;
      pointer-events: none !important;
    `;

    svg.setAttribute('viewBox', '65 0 570 620');
    svg.setAttribute('preserveAspectRatio', 'none');

    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', 'M632.86,6.618L436.232,6.618C416.818,6.599 396.254,9.684 376.225,16.429C356.196,23.174 336.703,33.579 319.618,47.041C302.534,60.503 287.858,77.022 276.615,94.918C265.373,112.813 257.563,132.086 253.041,150.966C244.69,186.193 226.089,220.425 195.188,245.142C164.286,269.858 121.084,285.059 70.815,284.779L70.815,336.251C121.084,335.971 164.286,351.172 195.188,375.888C226.089,400.604 244.69,434.836 253.041,470.064C257.563,488.944 265.373,508.216 276.615,526.112C287.858,544.008 302.534,560.527 319.618,573.988C336.703,587.45 356.196,597.856 376.225,604.6C396.254,611.345 416.818,614.43 436.232,614.412L632.86,614.412L632.86,6.618Z');
    path.setAttribute('fill', 'blue');
    path.setAttribute('fill-rule', 'nonzero');
    path.setAttribute('stroke', 'blue');
    path.setAttribute('stroke-width', '0.24px');

    svg.appendChild(path);
    document.body.appendChild(svg);

    this.setupSVGScrollListener(svg, item, location);
    this.setupPopupTimeout(svg, location);
  }

  setupSVGScrollListener(svg, item, location) {
    const scrollListener = () => {
      const currentItemRect = item.getBoundingClientRect();
      svg.style.left = `${currentItemRect.left - 50}px`;
      svg.style.top = `${currentItemRect.top - 0.5}px`;
      svg.style.height = `${currentItemRect.height}px`;

      const targetMarker = this.findMarkerByLocation(location);
      if (targetMarker) {
        targetMarker.setIcon(this.icons.hoverIcon);
        targetMarker.setOpacity(1);
        this.createConnectionLine(item, targetMarker);
      }
    };

    this.suggestionsDropdown.addEventListener('scroll', scrollListener);
    window.addEventListener('scroll', scrollListener);
    svg._scrollListener = scrollListener;
  }

  setupPopupTimeout(svg, location) {
    const popupTimeout = setTimeout(() => {
      const targetMarker = this.findMarkerByLocation(location);
      if (targetMarker) {
        targetMarker.openPopup();
      }
    }, 500);

    svg._popupTimeout = popupTimeout;
  }

  cleanupHoverSVG() {
    const svg = document.getElementById('current-connector');
    if (svg) {
      if (svg._scrollListener) {
        this.suggestionsDropdown.removeEventListener('scroll', svg._scrollListener);
        window.removeEventListener('scroll', svg._scrollListener);
      }
      if (svg._popupTimeout) {
        clearTimeout(svg._popupTimeout);
      }
      document.body.removeChild(svg);
    }
  }

  setupAutoZoom(filteredLocations) {
    if (filteredLocations.length === 0) return;

    this.zoomDebounceTimeout = setTimeout(() => {
      const markersToZoom = filteredLocations
        .map(loc => this.findMarkerByLocation(loc))
        .filter(Boolean);

      this.suggestionsDropdown.classList.add('is-zooming');
      this.removeConnectionLine();
      this.cleanupUI();

      this.executeZoom(markersToZoom, filteredLocations);
    }, 1000);
  }

  executeZoom(markersToZoom, filteredLocations) {
    let zoomPromise;

    if (markersToZoom.length > 1) {
      zoomPromise = this.createMultiMarkerZoom(markersToZoom);
    } else if (markersToZoom.length === 1) {
      zoomPromise = this.createSingleMarkerZoom(markersToZoom[0]);
    }

    if (zoomPromise) {
      zoomPromise.then(() => {
        this.suggestionsDropdown.classList.remove('is-zooming');
        this.restoreMarkerOpacity(filteredLocations);
      });
    }
  }

  createMultiMarkerZoom(markersToZoom) {
    return new Promise(resolve => {
      let zoomEnded = false;
      let moveEnded = false;

      const checkComplete = () => {
        if (zoomEnded && moveEnded) resolve();
      };

      this.map.once('zoomend', () => { zoomEnded = true; checkComplete(); });
      this.map.once('moveend', () => { moveEnded = true; checkComplete(); });

      this.map.flyToBounds(L.featureGroup(markersToZoom).getBounds().pad(0.2));
    });
  }

  createSingleMarkerZoom(marker) {
    return new Promise(resolve => {
      let zoomEnded = false;
      let moveEnded = false;

      const checkComplete = () => {
        if (zoomEnded && moveEnded) resolve();
      };

      this.map.once('zoomend', () => { zoomEnded = true; checkComplete(); });
      this.map.once('moveend', () => { moveEnded = true; checkComplete(); });

      this.map.flyTo(marker.getLatLng(), 13);
    });
  }

  restoreMarkerOpacity(filteredLocations) {
    const filteredIds = new Set(filteredLocations.map(loc => loc.uniqueId));

    this.allMarkers.forEach(marker => {
      if (filteredIds.has(marker.uniqueId)) {
        marker.setOpacity(1);
      } else {
        marker.setOpacity(0.6);
      }
    });
  }

  handleEmptySearch() {
    this.updateDropdownUI(false);
    this.allMarkers.forEach(marker => {
      marker.setIcon(this.icons.defaultIcon);
      marker.setOpacity(0.66);
    });
  }

  closeDropdown() {
    this.suggestionsDropdown.classList.remove('is-active');
    this.searchBar.classList.remove('has-suggestions');
    this.removeConnectionLine();
  }

  cleanupUI() {
    this.removeConnectionLine();
    this.cleanupHoverSVG();
  }

  // Diese Funktionen verwenden die map.js Implementierung
  createConnectionLine(item, targetMarker) {
    if (window.mapUtils && window.mapUtils.createConnectionLine) {
      this.connectionLine = window.mapUtils.createConnectionLine(item, targetMarker);
      console.log('Connection line created from search.js');
      return this.connectionLine;
    } else {
      console.error('mapUtils.createConnectionLine not available');
      return null;
    }
  }

  removeConnectionLine() {
    if (window.mapUtils && window.mapUtils.removeConnectionLine) {
      window.mapUtils.removeConnectionLine();
      this.connectionLine = null;
      console.log('Connection line removed from search.js');
    } else {
      console.error('mapUtils.removeConnectionLine not available');
    }
  }
}

// Export für Verwendung in map.js
window.SearchManager = SearchManager;