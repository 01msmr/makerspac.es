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
    // Zoom-Rahmen - Element für die Zoom-Vorschau (nur Overlay)
    this.zoomPreviewOverlay = null;
    // Zoom-Rahmen - Erinnerung an vorherigen Rahmen für 2-Schritt-Zoom
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

    this.initializeEventListeners();
  }

  initializeEventListeners() {
    // Focus auf Suchfeld beim Laden
    this.searchBar.focus();

    // *** NEU: Globale Keyboard-Navigation (überall auf der Seite) ***
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

    // Keyup-Event für die Suche
    this.searchBar.addEventListener('keyup', (e) => {
      // Ignoriere Navigation-Tasten für Search
      if (['ArrowDown', 'ArrowUp', 'Enter', 'Escape'].includes(e.code)) {
        return;
      }

      this.performSearch();
      // Schließe User Guide bei Suche
      this.closeUserGuideOnInteraction();
    });

    // Focus Event
    this.searchBar.addEventListener('focus', () => {
      if (this.searchBar.value.trim().length > 0) {
        this.performSearch();
      }
    });

    // Click außerhalb schließt Dropdown (aber nicht User Guide)
    document.addEventListener('click', (e) => {
      if (!e.target.closest('.search-container')) {
        this.closeDropdown();
      }
    });

    // Map-Events für Connection Line Cleanup und User Guide schließen
    this.map.on('zoomstart movestart', () => {
      this.removeConnectionLine();
    });

    // User Guide bei Map-Interaktion schließen
    this.map.on('click', () => {
      this.closeUserGuideOnInteraction();
    });
  }

  // *** NEU: Tabulator-Taste Behandlung ***
  handleTabKey() {
    console.log('Tab-Taste gedrückt - springe ins Suchfeld');
    this.searchBar.focus();
    this.searchBar.value = ''; // Leere das Suchfeld
    this.currentDropdownIndex = -1; // Reset Dropdown-Navigation
    this.clearActiveDropdownItem();

    // Triggere Search-Reset
    this.performSearch();

    // Schließe User Guide
    this.closeUserGuideOnInteraction();
  }

  // *** NEU: Cursortasten-Navigation im Dropdown ***
  navigateDropdown(direction) {
    // Update Dropdown-Items Array
    this.dropdownItems = Array.from(this.suggestionsDropdown.querySelectorAll('.suggestion-item'));

    if (this.dropdownItems.length === 0) {
      console.log('Keine Dropdown-Items verfügbar');
      return;
    }

    // Berechne neuen Index
    if (direction === 'down') {
      if (this.currentDropdownIndex < this.dropdownItems.length - 1) {
        this.currentDropdownIndex++;
      } else {
        this.currentDropdownIndex = 0; // Wrap to first
      }
    } else if (direction === 'up') {
      if (this.currentDropdownIndex > 0) {
        this.currentDropdownIndex--;
      } else {
        this.currentDropdownIndex = this.dropdownItems.length - 1; // Wrap to last
      }
    }

    // Aktualisiere visuelle Darstellung
    this.updateActiveDropdownItem();

    // Scrolle zu aktivem Element
    this.scrollToActiveItem();

    console.log(`Navigation ${direction}: Item ${this.currentDropdownIndex + 1}/${this.dropdownItems.length} aktiv`);
  }

  // *** NEU: Aktives Dropdown-Item visuell markieren (nutzt vorhandenes CSS) ***
  updateActiveDropdownItem() {
    // Entferne previous hover-Effekte
    this.clearActiveDropdownItem();

    // Aktiviere CSS :hover Zustand für aktuelles Item
    if (this.currentDropdownIndex >= 0 && this.currentDropdownIndex < this.dropdownItems.length) {
      const activeItem = this.dropdownItems[this.currentDropdownIndex];

      // Direkte CSS-Hover-Simulation über Style-Eigenschaften
      activeItem.style.backgroundColor = 'blue';
      activeItem.style.color = 'white';

      // Setze auch die item-details Farbe (wie im CSS :hover definiert)
      const itemDetails = activeItem.querySelectorAll('.item-details');
      itemDetails.forEach(detail => {
        detail.style.color = '#ccc';
      });

      // Zusätzlich: Triggere mouseenter Event für Connection Line etc.
      const mouseEnterEvent = new MouseEvent('mouseenter', {
        bubbles: true,
        cancelable: true
      });
      activeItem.dispatchEvent(mouseEnterEvent);

      console.log(`Keyboard-Navigation: Item ${this.currentDropdownIndex + 1} aktiviert`);
    }
  }

  // *** NEU: Hover-Effekte entfernen (nutzt vorhandenes CSS) ***
  clearActiveDropdownItem() {
    this.dropdownItems.forEach(item => {
      // Entferne direktes Styling
      item.style.backgroundColor = '';
      item.style.color = '';

      // Setze item-details Farbe zurück
      const itemDetails = item.querySelectorAll('.item-details');
      itemDetails.forEach(detail => {
        detail.style.color = '';
      });

      // Zusätzlich: Triggere mouseleave Event für Connection Line Cleanup
      const mouseLeaveEvent = new MouseEvent('mouseleave', {
        bubbles: true,
        cancelable: true
      });
      item.dispatchEvent(mouseLeaveEvent);
    });
  }

  // *** NEU: Zum aktiven Element scrollen ***
  scrollToActiveItem() {
    if (this.currentDropdownIndex >= 0 && this.currentDropdownIndex < this.dropdownItems.length) {
      const activeItem = this.dropdownItems[this.currentDropdownIndex];
      const dropdown = this.suggestionsDropdown;

      // Element-Position berechnen
      const itemTop = activeItem.offsetTop;
      const itemHeight = activeItem.offsetHeight;
      const dropdownScrollTop = dropdown.scrollTop;
      const dropdownHeight = dropdown.clientHeight;

      // Prüfe ob Element vollständig sichtbar ist
      const itemBottom = itemTop + itemHeight;
      const visibleTop = dropdownScrollTop;
      const visibleBottom = dropdownScrollTop + dropdownHeight;

      if (itemTop < visibleTop) {
        // Element ist oben außerhalb - scrolle nach oben
        dropdown.scrollTop = itemTop;
      } else if (itemBottom > visibleBottom) {
        // Element ist unten außerhalb - scrolle nach unten
        dropdown.scrollTop = itemBottom - dropdownHeight;
      }

      console.log(`Scrolled to item ${this.currentDropdownIndex + 1}`);
    }
  }

  // *** NEU: Location-Daten aus Dropdown-Item extrahieren ***
  getLocationFromDropdownItem(dropdownItem) {
    const itemName = dropdownItem.querySelector('.item-name')?.textContent;
    if (itemName) {
      return this.json.find(location => location.name === itemName);
    }
    return null;
  }

  // *** NEU: Enter-Taste Behandlung ***
  handleEnterKey() {
    if (this.currentDropdownIndex >= 0 && this.currentDropdownIndex < this.dropdownItems.length) {
      // Aktives Dropdown-Item auswählen
      const activeItem = this.dropdownItems[this.currentDropdownIndex];
      const location = this.getLocationFromDropdownItem(activeItem);

      if (location) {
        console.log(`Enter: Wähle Item ${this.currentDropdownIndex + 1} - ${location.name}`);
        this.handleSuggestionClick(location);
      }
    } else if (this.dropdownItems.length === 1) {
      // Wenn nur ein Item da ist, wähle es aus
      const location = this.getLocationFromDropdownItem(this.dropdownItems[0]);
      if (location) {
        console.log('Enter: Wähle einziges verfügbares Item');
        this.handleSuggestionClick(location);
      }
    }
  }

  // *** NEU: Escape-Taste Behandlung ***
  handleEscapeKey() {
    console.log('Escape: Schließe Dropdown und reset Navigation');
    this.closeDropdown();
    this.currentDropdownIndex = -1;
    this.clearActiveDropdownItem();
  }

  performSearch() {
    const searchQuery = this.searchBar.value.trim().toLowerCase(); // trim() entfernt Leerzeichen

    // Cleanup
    clearTimeout(this.zoomDebounceTimeout);
    this.suggestionsDropdown.innerHTML = '';
    this.cleanupUI();

    // Early return für leere Suche - aber mit Delay wie bei normaler Suche
    if (searchQuery.length < 1) {
      // Zoom-Rahmen - Verzögertes Zurückzoomen bei leerer Suche
      this.zoomDebounceTimeout = setTimeout(() => {
        this.handleEmptySearch();
      }, 600); // Gleiche 0.6s Verzögerung wie bei normaler Suche
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
    this.updateSearchCounter(sortedFilteredLocations.length);

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
      // Strikte Nord-Süd Sortierung: Nur nach Breitengrad (latitude)
      // Höhere Werte = weiter nördlich → diese kommen zuerst
      return b.loc.lat - a.loc.lat;
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

  updateSearchCounter(count) {
    this.searchCounter.textContent = count;

    if (count > 0) {
      this.searchCounter.classList.add('visible', 'has-results');
      this.searchCounter.classList.remove('no-results');
    } else if (this.searchBar.value.length > 0) {
      // Zeige "0" wenn gesucht wird aber keine Ergebnisse gefunden werden
      this.searchCounter.classList.add('visible', 'no-results');
      this.searchCounter.classList.remove('has-results');
    } else {
      // Verstecke Counter wenn keine Suche aktiv ist
      this.searchCounter.classList.remove('visible', 'has-results', 'no-results');
    }
  }

  // *** ERWEITERT: createSuggestionItems mit Navigation-Reset ***
  createSuggestionItems(locations) {
    // Reset Navigation bei neuen Items
    this.currentDropdownIndex = -1;
    this.clearActiveDropdownItem();

    locations.forEach(location => {
      const item = this.createSuggestionItem(location);
      this.suggestionsDropdown.appendChild(item);
    });

    // Update Items-Array
    this.dropdownItems = Array.from(this.suggestionsDropdown.querySelectorAll('.suggestion-item'));
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
    // Schließe User Guide bei Hover über Suchergebnisse
    this.closeUserGuideOnInteraction();

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
    // Schließe User Guide bei Click auf Suchergebnis
    this.closeUserGuideOnInteraction();

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
      this.cleanupHoverSVG(); // Cleanup ohne Zoom-Rahmen-Entfernung

      // Zoom-Rahmen - Berechne die neuen (zweiten) Bounds
      let newBounds;
      if (markersToZoom.length > 1) {
        newBounds = L.featureGroup(markersToZoom).getBounds().pad(0.2);
      } else if (markersToZoom.length === 1) {
        const center = markersToZoom[0].getLatLng();
        const radius = 0.01; // Ungefähr 1km Radius für Zoom-Level 13
        newBounds = L.latLngBounds(
          [center.lat - radius, center.lng - radius],
          [center.lat + radius, center.lng + radius]
        );
      }

      if (newBounds) {
        // Zoom-Rahmen - Prüfe ob vorheriger Rahmen existiert und neuer außerhalb liegt
        if (this.previousZoomBounds && !this.previousZoomBounds.intersects(newBounds)) {
          console.log('Zoom-Rahmen: 2-Schritt-Zoom mit Rahmen-Erinnerung');
          this.executeThreeFrameZoom(this.previousZoomBounds, newBounds, markersToZoom, filteredLocations);
        } else {
          // Zoom-Rahmen - Normaler 1-Schritt-Zoom
          console.log('Zoom-Rahmen: Normaler 1-Schritt-Zoom');
          this.executeNormalZoom(newBounds, markersToZoom, filteredLocations);
        }

        // Zoom-Rahmen - Speichere aktuelle Bounds für nächste Suche
        this.previousZoomBounds = newBounds;
      }
    }, 600);
  }

  // Zoom-Rahmen - Normaler Zoom mit Rahmen-Speicherung
  executeNormalZoom(bounds, markersToZoom, filteredLocations) {
    // Zoom-Rahmen - Entferne vorherigen Rahmen und zeige neuen
    this.removeZoomPreviewFrame();
    this.createZoomPreviewFrame(bounds);

    // Zoom-Rahmen - Warte 0.2s für Einblendung + 0.6s für Anzeige
    setTimeout(() => {
      this.executeZoom(markersToZoom, filteredLocations, bounds);
    }, 800); // 0.2s Einblendung + .6s Anzeige
  }

  // Zoom-Rahmen - 3-Rahmen-Zoom: Erster + Zweiter + Gemeinsamer
  executeThreeFrameZoom(firstBounds, secondBounds, markersToZoom, filteredLocations) {
    // Zoom-Rahmen - Schritt 1: Berechne gemeinsamen (dritten) Rahmen
    const combinedBounds = L.latLngBounds([
      [Math.min(firstBounds.getSouth(), secondBounds.getSouth()),
      Math.min(firstBounds.getWest(), secondBounds.getWest())],
      [Math.max(firstBounds.getNorth(), secondBounds.getNorth()),
      Math.max(firstBounds.getEast(), secondBounds.getEast())]
    ]).pad(0.05); // 10% Puffer

    console.log('Zoom-Rahmen: Schritt 1 - Zeige gemeinsamen Rahmen und zoome');

    // Zoom-Rahmen - Entferne vorherigen Rahmen und zeige gemeinsamen
    this.removeZoomPreviewFrame();
    this.createZoomPreviewFrame(combinedBounds);

    // Zoom-Rahmen - Schritt 2: Zoom zum gemeinsamen Rahmen
    const combinedZoomPromise = new Promise(resolve => {
      let zoomEnded = false;
      let moveEnded = false;

      const checkComplete = () => {
        if (zoomEnded && moveEnded) resolve();
      };

      this.map.once('zoomend', () => { zoomEnded = true; checkComplete(); });
      this.map.once('moveend', () => { moveEnded = true; checkComplete(); });

      // Zoom zum gemeinsamen Bereich - warte 0.2s für Einblendung + 0.6s für Anzeige
      setTimeout(() => {
        this.map.flyToBounds(combinedBounds, { duration: 0.8 });
      }, 800); // 0.2s Einblendung + 0.6s Anzeige
    });

    // Zoom-Rahmen - Schritt 3: Nach gemeinsamen Zoom, wechsle DIREKT zum finalen Rahmen
    combinedZoomPromise.then(() => {
      console.log('Zoom-Rahmen: Schritt 1 beendet, wechsle nach 0.1s zu finalem Rahmen');

      setTimeout(() => {
        console.log('Zoom-Rahmen: Schritt 2 - Wechsle direkt zu finalem Rahmen');

        // Zoom-Rahmen - DIREKTER Wechsel ohne removeZoomPreviewFrame()
        if (this.zoomPreviewOverlay && this.map.hasLayer(this.zoomPreviewOverlay)) {
          this.map.removeLayer(this.zoomPreviewOverlay);
        }
        this.zoomPreviewOverlay = null;

        // Zoom-Rahmen - Sofort neuen Rahmen erstellen (ohne Fade-Out/In Pause)
        this.createZoomPreviewFrame(secondBounds);

        // Zoom-Rahmen - Längere Anzeige des finalen Rahmens (0.2s Einblendung + 0.6s Anzeige)
        setTimeout(() => {
          console.log('Zoom-Rahmen: Starte finalen Zoom - Rahmen bleibt sichtbar');

          // Zoom-Rahmen - Starte Zoom OHNE Rahmen-Entfernung
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
              // Zoom-Rahmen - Cleanup: Entferne ALLE Zoom-Rahmen am Ende
              setTimeout(() => {
                this.removeAllZoomFrames();
              }, 800); // 0.8s nach Zoom-Ende für längere Sichtbarkeit
            });
          }
        }, 800); // 0.2s Einblendung + 0.6s Anzeige
      }, 50); // 0.05s Wartezeit zwischen den Zooms
    });
  }

  executeZoom(markersToZoom, filteredLocations, bounds) {
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
        // Zoom-Rahmen - Entferne Vorschau-Rahmen nachdem Zoom beendet ist
        this.removeZoomPreviewFrame();
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
    this.updateSearchCounter(0);
    this.allMarkers.forEach(marker => {
      marker.setIcon(this.icons.defaultIcon);
      marker.setOpacity(0.66);
    });

    // Zoom-Rahmen - Bei leerer Suche langsam zum Startpunkt zoomen und Erinnerung löschen
    this.previousZoomBounds = null; // Lösche Rahmen-Erinnerung
    this.map.flyTo(new L.LatLng(51.0122995, 10.3995537), 7, {
      duration: 1.5 // 1.5 Sekunden für perfektes Timing
    });
  }

  // *** ERWEITERT: closeDropdown mit Navigation-Reset ***
  closeDropdown() {
    this.suggestionsDropdown.classList.remove('is-active');
    this.searchBar.classList.remove('has-suggestions');
    this.removeConnectionLine();

    // *** NEU: Reset Keyboard-Navigation ***
    this.currentDropdownIndex = -1;
    this.clearActiveDropdownItem();
  }

  cleanupUI() {
    this.removeConnectionLine();
    this.cleanupHoverSVG();
    // Zoom-Rahmen - Cleanup bei UI-Reset (aber nicht bei neuer Filterung)
    // this.removeZoomPreviewFrame(); // Entfernt, damit Rahmen bei neuer Filterung bleibt
  }

  // Zoom-Rahmen - Erstellt und zeigt den Vorschau-Rahmen (KORRIGIERT)
  createZoomPreviewFrame(bounds) {
    this.removeZoomPreviewFrame();

    // Zoom-Rahmen - Berechne die Browser-Viewport-Dimensionen
    const mapContainer = document.getElementById('map');
    const viewportWidth = mapContainer.clientWidth;
    const viewportHeight = mapContainer.clientHeight;
    const viewportAspectRatio = viewportWidth / viewportHeight;

    // Zoom-Rahmen - Berechne das Zentrum der ursprünglichen Bounds
    const centerLat = bounds.getCenter().lat;
    const centerLng = bounds.getCenter().lng;

    // Zoom-Rahmen - Berechne den Zoom-Level, den Leaflet für diese Bounds verwenden wird
    const targetZoom = this.map.getBoundsZoom(bounds);

    // Zoom-Rahmen - Verwende Leaflet's eigene Methoden für Pixel-zu-LatLng-Umrechnung
    const mapCenter = L.latLng(centerLat, centerLng);

    // Zoom-Rahmen - Berechne die Ecken des sichtbaren Bereichs basierend auf Pixel-Offset
    const halfWidth = viewportWidth / 2;
    const halfHeight = viewportHeight / 2;

    // Zoom-Rahmen - Simuliere die Pixel-Koordinaten bei dem Ziel-Zoom-Level
    const centerPoint = this.map.project(mapCenter, targetZoom);

    const topLeft = this.map.unproject(L.point(centerPoint.x - halfWidth, centerPoint.y - halfHeight), targetZoom);
    const bottomRight = this.map.unproject(L.point(centerPoint.x + halfWidth, centerPoint.y + halfHeight), targetZoom);

    // Zoom-Rahmen - Erweitere um Puffer damit er außerhalb des Viewports liegt
    const bufferFactor = 1.05; // 5% größer
    const frameWidth = (bottomRight.lng - topLeft.lng) * bufferFactor;
    const frameHeight = (topLeft.lat - bottomRight.lat) * bufferFactor;

    // Zoom-Rahmen - Erstelle die finalen Bounds zentriert um die ursprünglichen Bounds
    const extendedBounds = L.latLngBounds(
      [centerLat - frameHeight / 2, centerLng - frameWidth / 2],
      [centerLat + frameHeight / 2, centerLng + frameWidth / 2]
    );

    // Zoom-Rahmen - Erstelle große Außenfläche (gesamte Weltkarte)
    const worldBounds = L.latLngBounds([-90, -180], [90, 180]);

    // Zoom-Rahmen - Erstelle Polygon mit Loch (Außenfläche minus Rahmenbereich)
    const outerRing = [
      [worldBounds.getNorth(), worldBounds.getWest()],
      [worldBounds.getNorth(), worldBounds.getEast()],
      [worldBounds.getSouth(), worldBounds.getEast()],
      [worldBounds.getSouth(), worldBounds.getWest()],
      [worldBounds.getNorth(), worldBounds.getWest()]
    ];

    const innerRing = [
      [extendedBounds.getNorth(), extendedBounds.getWest()],
      [extendedBounds.getSouth(), extendedBounds.getWest()],
      [extendedBounds.getSouth(), extendedBounds.getEast()],
      [extendedBounds.getNorth(), extendedBounds.getEast()],
      [extendedBounds.getNorth(), extendedBounds.getWest()]
    ];

    // Zoom-Rahmen - Erstelle das Overlay mit Loch (KORRIGIERT für sanfte Einblendung)
    this.zoomPreviewOverlay = L.polygon([outerRing, innerRing], {
      color: 'black',
      fillColor: 'black',
      fillOpacity: 0, // Startet unsichtbar
      opacity: 0, // Startet unsichtbar
      weight: 0,
      interactive: false,
      pane: 'overlayPane',
      className: 'zoom-preview-overlay' // CSS-Klasse für Transitions
    }).addTo(this.map);

    // Zoom-Rahmen - KORRIGIERT: Sanfte Einblendung über CSS-Transitions
    // Kurze Verzögerung, dann CSS-Eigenschaften direkt am DOM-Element setzen
    setTimeout(() => {
      if (this.zoomPreviewOverlay && this.zoomPreviewOverlay._path) {
        // Zugriff auf das SVG-Path-Element für direkte CSS-Manipulation
        const pathElement = this.zoomPreviewOverlay._path;
        if (pathElement) {
          pathElement.style.transition = 'opacity 0.25s ease-in-out, fill-opacity 0.25s ease-in-out';
          // pathElement.style.opacity = '0.4';
          pathElement.style.fillOpacity = '0.4';
        }

        // Fallback: Leaflet's setStyle als Backup
        this.zoomPreviewOverlay.setStyle({
          opacity: 0.66,
          fillOpacity: 0.4
        });

        // *** NEU: Dropdown-Overlap-Erkennung starten ***
        this.startDropdownOverlapDetection(extendedBounds);
      }
    }, 50); // Etwas längere Verzögerung für DOM-Bereitschaft

    console.log('Zoom-Rahmen mit verbesserter sanfter Einblendung erstellt');
  }

  // *** NEU: Dropdown-Overlap-Erkennung ***
  startDropdownOverlapDetection(zoomFrameBounds) {
    // Stoppe vorherige Überwachung
    this.stopDropdownOverlapDetection();

    // Überwachungs-Funktion
    this.overlapCheckFunction = () => {
      this.checkDropdownZoomFrameOverlap(zoomFrameBounds);
    };

    // Kontinuierliche Überwachung alle 100ms
    this.overlapCheckInterval = setInterval(this.overlapCheckFunction, 100);

    // Sofortige erste Prüfung
    this.checkDropdownZoomFrameOverlap(zoomFrameBounds);
  }

  // *** NEU: Erweiterte Überlappungs-Prüfung mit 20%-Regel ***
  checkDropdownZoomFrameOverlap(zoomFrameBounds) {
    const dropdown = this.suggestionsDropdown;

    // Prüfe ob Dropdown sichtbar ist
    if (!dropdown || !dropdown.classList.contains('is-active')) {
      // Dropdown nicht sichtbar - Opacity zurücksetzen
      this.resetDropdownOpacity();
      return;
    }

    // Berechne Dropdown-Position in Weltkoordinaten
    const dropdownRect = dropdown.getBoundingClientRect();
    const mapContainer = document.getElementById('map');
    const mapRect = mapContainer.getBoundingClientRect();

    // Konvertiere Dropdown-Ecken zu LatLng
    const dropdownTopLeft = this.map.containerPointToLatLng([
      dropdownRect.left - mapRect.left,
      dropdownRect.top - mapRect.top
    ]);

    const dropdownBottomRight = this.map.containerPointToLatLng([
      dropdownRect.right - mapRect.left,
      dropdownRect.bottom - mapRect.top
    ]);

    const dropdownBounds = L.latLngBounds(dropdownBottomRight, dropdownTopLeft);

    // Prüfe grundsätzliche Überlappung
    if (!zoomFrameBounds.intersects(dropdownBounds)) {
      this.resetDropdownOpacity();
      return;
    }

    // *** NEU: Berechne Überlappungs-Prozentsatz der Zoomrahmen-Breite ***

    // Zoomrahmen-Pixel-Koordinaten berechnen
    const zoomFrameTopLeft = this.map.latLngToContainerPoint(
      L.latLng(zoomFrameBounds.getNorth(), zoomFrameBounds.getWest())
    );
    const zoomFrameBottomRight = this.map.latLngToContainerPoint(
      L.latLng(zoomFrameBounds.getSouth(), zoomFrameBounds.getEast())
    );

    // Zoomrahmen-Abmessungen in Pixeln
    const zoomFrameLeft = Math.min(zoomFrameTopLeft.x, zoomFrameBottomRight.x);
    const zoomFrameRight = Math.max(zoomFrameTopLeft.x, zoomFrameBottomRight.x);
    const zoomFrameWidth = zoomFrameRight - zoomFrameLeft;

    // Dropdown-Abmessungen relativ zur Karte
    const dropdownLeft = dropdownRect.left - mapRect.left;
    const dropdownRight = dropdownRect.right - mapRect.left;

    // Berechne überlappende Breite
    const overlapLeft = Math.max(zoomFrameLeft, dropdownLeft);
    const overlapRight = Math.min(zoomFrameRight, dropdownRight);
    const overlapWidth = Math.max(0, overlapRight - overlapLeft);

    // Berechne Prozentsatz der überlappenden Zoomrahmen-Breite
    const overlapPercentage = (overlapWidth / zoomFrameWidth) * 100;

    console.log(`Zoomrahmen-Überlappung: ${overlapPercentage.toFixed(1)}% der Breite`);

    // *** Nur wenn mehr als 80% der Zoomrahmen-Breite überlappt (weniger als 20% sichtbar) ***
    if (overlapPercentage > 80) {
      this.reduceDropdownOpacity();
    } else {
      this.resetDropdownOpacity();
    }
  }

  // *** NEU: Dropdown-Opacity reduzieren auf 0.33 ***
  reduceDropdownOpacity() {
    const dropdown = this.suggestionsDropdown;
    if (dropdown && !dropdown.classList.contains('overlap-reduced')) {
      dropdown.style.transition = 'opacity 0.3s ease-in-out';
      dropdown.style.opacity = '0.33';
      dropdown.classList.add('overlap-reduced');
      console.log('Dropdown-Opacity auf 0.33 reduziert (Zoomrahmen >80% überlappt)');
    }
  }

  // *** NEU: Dropdown-Opacity zurücksetzen ***
  resetDropdownOpacity() {
    const dropdown = this.suggestionsDropdown;
    if (dropdown && dropdown.classList.contains('overlap-reduced')) {
      dropdown.style.transition = 'opacity 0.3s ease-in-out';
      dropdown.style.opacity = '1';
      dropdown.classList.remove('overlap-reduced');
      console.log('Dropdown-Opacity auf 1 zurückgesetzt');
    }
  }

  // *** NEU: Überwachung stoppen ***
  stopDropdownOverlapDetection() {
    if (this.overlapCheckInterval) {
      clearInterval(this.overlapCheckInterval);
      this.overlapCheckInterval = null;
    }

    // Opacity zurücksetzen beim Stoppen
    this.resetDropdownOpacity();
  }

  // Zoom-Rahmen - Entfernt ALLE Zoom-Rahmen (Cleanup-Funktion) - UNVERÄNDERT
  removeAllZoomFrames() {
    // *** NEU: Stoppe Overlap-Erkennung ***
    this.stopDropdownOverlapDetection();

    // Entferne aktuellen Overlay
    if (this.zoomPreviewOverlay) {
      if (this.map.hasLayer(this.zoomPreviewOverlay)) {
        this.map.removeLayer(this.zoomPreviewOverlay);
      }
      this.zoomPreviewOverlay = null;
    }

    // Suche und entferne alle möglichen Zoom-Rahmen auf der Karte
    this.map.eachLayer((layer) => {
      if (layer instanceof L.Polygon &&
        layer.options &&
        layer.options.pane === 'overlayPane' &&
        (layer.options.fillColor === 'grey' || layer.options.fillColor === 'black')) {
        this.map.removeLayer(layer);
      }
    });

    console.log('Zoom-Rahmen: Alle Rahmen entfernt (Cleanup)');
  }

  // Zoom-Rahmen - Entfernt den Vorschau-Rahmen (KORRIGIERT für sanfte Ausblendung)
  removeZoomPreviewFrame() {
    // *** NEU: Stoppe Overlap-Erkennung ***
    this.stopDropdownOverlapDetection();

    if (this.zoomPreviewOverlay) {
      // KORRIGIERT: Sanfte Ausblendung über CSS
      if (this.zoomPreviewOverlay._path) {
        const pathElement = this.zoomPreviewOverlay._path;
        if (pathElement) {
          pathElement.style.transition = 'opacity 0.3s ease-in-out, fill-opacity 0.3s ease-in-out';
          pathElement.style.opacity = '0';
          pathElement.style.fillOpacity = '0';
        }
      }

      // Fallback: Leaflet's setStyle
      this.zoomPreviewOverlay.setStyle({
        opacity: 0,
        fillOpacity: 0
      });

      // Nach Ausblendung entfernen
      setTimeout(() => {
        if (this.zoomPreviewOverlay && this.map.hasLayer(this.zoomPreviewOverlay)) {
          this.map.removeLayer(this.zoomPreviewOverlay);
        }
        this.zoomPreviewOverlay = null;
      }, 350); // Entspricht der Ausblend-Dauer

      console.log('Zoom-Rahmen mit sanfter Ausblendung entfernt');
    }
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

  // User Guide Funktionen (falls nicht bereits in map.js verfügbar)
  closeUserGuideOnInteraction() {
    if (window.closeUserGuide) {
      window.closeUserGuide();
    }
  }
}

// Export für Verwendung in map.js
window.SearchManager = SearchManager;