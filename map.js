// map.js - Finale Anti-Flacker Version mit zentralisiertem Marker-State Management und Navigation

window.addEventListener("keydown", (e) => {
  if (e.code === 'F3' || ((e.ctrlKey || e.metaKey) && e.code === 'KeyF')) {
    e.preventDefault();
    const search = document.querySelector('#search-bar')
    search.focus()
    search.select()
  }
})

document.addEventListener('DOMContentLoaded', () => {
  let map;
  let allMarkers = [];
  let connectionLine = null;
  let styleFilterManager;
  let searchManager;
  let currentStickyMarker = null;
  let isPopupSticky = false;

  // *** WICHTIG: json als globale Variable ***
  window.json = [];
  let json = window.json;

  // ZENTRALISIERTES MARKER-STATE MANAGEMENT
  window.markerStateManager = {
    states: new Map(),

    setState(markerId, state) {
      this.states.set(markerId, { ...this.getState(markerId), ...state });
    },

    getState(markerId) {
      return this.states.get(markerId) || {
        isHovering: false,
        isDropdownHovering: false,
        isScaling: false,
        currentScale: 1,
        hoverTimeout: null,
        debounceTimeout: null
      };
    },

    isAnyHoverActive(markerId) {
      const state = this.getState(markerId);
      return state.isHovering || state.isDropdownHovering;
    },

    clearTimeouts(markerId) {
      const state = this.getState(markerId);
      if (state.hoverTimeout) {
        clearTimeout(state.hoverTimeout);
        state.hoverTimeout = null;
      }
      if (state.debounceTimeout) {
        clearTimeout(state.debounceTimeout);
        state.debounceTimeout = null;
      }
      this.setState(markerId, state);
    }
  };

  // Icons aus der globalen icons.js verwenden
  const icons = {
    defaultIcon: window.MapIcons.defaultIcon,
    highlightIcon: window.MapIcons.highlightIcon,
    hoverIcon: window.MapIcons.hoverIcon,
    redIcon: window.MapIcons.redIcon,
    greenIcon: window.MapIcons.greenIcon,
    unknownStatusIcon: window.MapIcons.unknownStatusIcon
  };

  // Map Utils für Search Manager
  window.mapUtils = {
    createConnectionLine: createConnectionLine,
    removeConnectionLine: removeConnectionLine,
    clearStickyPopup: clearStickyPopup,
    setStickyPopup: setStickyPopup,
    setMarkerDropdownHover: setMarkerDropdownHover,
    clearMarkerDropdownHover: clearMarkerDropdownHover
  };

  let clusterGroup = null;

  // +++ START: NAVIGATION LINK FUNCTIONS +++
  function updateNavigationIconAppearance(navLinkElement, location) {
    const icon = navLinkElement.querySelector('i');
    const parentContainer = navLinkElement.parentElement; // Das ist .popup-street-line
    if (!icon || !parentContainer) return;

    // 1. Set service data attribute for CSS to handle icon selection
    const savedService = localStorage.getItem('mapService');
    const mapServiceTimestamp = localStorage.getItem('mapServiceTimestamp');
    const ninetySixHours = 96 * 60 * 60 * 1000;
    let serviceExpired = !savedService || (mapServiceTimestamp && (Date.now() - parseInt(mapServiceTimestamp, 10)) > ninetySixHours);

    const serviceToUse = serviceExpired ? 'default' : savedService;
    navLinkElement.setAttribute('data-service', serviceToUse);

    // 2. Set status data attribute for CSS to handle coloring
    parentContainer.classList.remove('status-open', 'status-closed', 'status-unknown', 'status-default');

    let statusClass = 'status-default';
    if (location.isOpen === true) {
      statusClass = 'status-open';
    } else if (location.isOpen === false) {
      statusClass = 'status-closed';
    } else if (location.spaceapi && location.spaceapi.endpoint) {
      statusClass = 'status-unknown';
    }

    parentContainer.classList.add(statusClass);
    navLinkElement.setAttribute('data-status', statusClass.replace('status-', ''));
  }

  function handleNavigationClick(event, location) {
    event.preventDefault();
    const { lat, long } = location.loc;
    if (typeof lat !== 'number' || typeof long !== 'number') return;

    let mapService = localStorage.getItem('mapService');
    const mapServiceTimestamp = localStorage.getItem('mapServiceTimestamp');
    const ninetySixHours = 96 * 60 * 60 * 1000;

    // Re-check for expiration on click, but don't prompt on left-click
    if (mapService && mapServiceTimestamp && (Date.now() - parseInt(mapServiceTimestamp, 10)) > ninetySixHours) {
      localStorage.removeItem('mapService');
      localStorage.removeItem('mapServiceTimestamp');
      mapService = null;
    }

    // Default to Google Maps if no service is set
    const serviceToUse = mapService || 'google';
    openMap(serviceToUse, lat, long);
  }

  function handleNavigationRightClick(event, location, navLinkElement) {
    event.preventDefault(); // Prevent browser context menu

    // Cycle through services without popup
    const savedService = localStorage.getItem('mapService');
    let nextService;

    if (!savedService || savedService === 'google') {
      nextService = 'apple';
    } else if (savedService === 'apple') {
      nextService = 'osm';
    } else {
      nextService = 'google';
    }

    localStorage.setItem('mapService', nextService);
    localStorage.setItem('mapServiceTimestamp', String(Date.now()));

    // Immediately update the icon
    updateNavigationIconAppearance(navLinkElement, location);
  }

  function openMap(service, lat, long) {
    let url;
    if (service === 'google') {
      url = `https://www.google.com/maps/dir/?api=1&destination=${lat},${long}`;
    } else if (service === 'apple') {
      url = `http://maps.apple.com/?daddr=${lat},${long}`;
    } else if (service === 'osm') {
      url = `https://www.openstreetmap.org/directions?to=${lat},${long}`;
    } else {
      // Fallback to Google
      url = `https://www.google.com/maps/dir/?api=1&destination=${lat},${long}`;
    }
    window.open(url, '_blank');
  }
  // +++ END: NAVIGATION LINK FUNCTIONS +++

  // DROPDOWN HOVER MANAGEMENT
  function setMarkerDropdownHover(marker, isHovering) {
    const state = window.markerStateManager.getState(marker.uniqueId);
    window.markerStateManager.setState(marker.uniqueId, { isDropdownHovering: isHovering });

    if (isHovering) {
      applyMarkerScale(marker, 1.15);
    } else if (!state.isHovering) {
      applyMarkerScale(marker, 1);
    }
  }

  function clearMarkerDropdownHover(marker) {
    setMarkerDropdownHover(marker, false);
  }

  // Connection Line Functions
  function removeConnectionLine() {
    if (connectionLine) {
      try {
        if (map.hasLayer(connectionLine)) {
          map.removeLayer(connectionLine);
        }
      } catch (e) {
        console.log('Error removing line:', e);
      }
      connectionLine = null;
    }
  }

  function createConnectionLine(suggestionItem, targetMarker, color = '#0000ff') {
    removeConnectionLine();

    const suggestionRect = suggestionItem.getBoundingClientRect();
    const mapContainer = document.getElementById('map');
    const mapRect = mapContainer.getBoundingClientRect();

    const connectionEndX = suggestionRect.left - 50 - mapRect.left;
    const connectionEndY = suggestionRect.top - 0.5 + (suggestionRect.height / 2) - mapRect.top;
    const startLatLng = map.containerPointToLatLng([connectionEndX, connectionEndY]);

    const endLatLng = targetMarker.getLatLng();
    const markerPixel = map.latLngToContainerPoint(endLatLng);

    const curvePoints = [];
    const deltaX = Math.abs(markerPixel.x - connectionEndX);
    const deltaY = Math.abs(markerPixel.y - connectionEndY);
    const approximateLength = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
    const steps = Math.max(100, Math.min(400, Math.round(approximateLength)));

    const controlPoints = [];
    let mainControlX, mainControlY;

    if (markerPixel.x > (connectionEndX - 80)) {
      mainControlX = connectionEndX - 60;
      mainControlY = connectionEndY;
    } else {
      mainControlX = markerPixel.x;
      mainControlY = connectionEndY;
    }

    const mainControlLatLng = map.containerPointToLatLng([mainControlX, mainControlY]);
    controlPoints.push(mainControlLatLng);

    if (markerPixel.x > (connectionEndX - 80)) {
      const midHeightControlX = markerPixel.x - 240;
      const midHeightControlY = connectionEndY + (markerPixel.y - connectionEndY) / 2;
      const midHeightControlLatLng = map.containerPointToLatLng([midHeightControlX, midHeightControlY]);
      controlPoints.push(midHeightControlLatLng);
    }

    const horizontalDistance = Math.abs(markerPixel.x - connectionEndX);
    if (horizontalDistance > 30) {
      let preMarkerControlX;

      if (markerPixel.x > (connectionEndX - 80)) {
        preMarkerControlX = markerPixel.x - 80;
      } else {
        preMarkerControlX = markerPixel.x + 80;
      }

      const preMarkerControlY = markerPixel.y;
      const preMarkerControlLatLng = map.containerPointToLatLng([preMarkerControlX, preMarkerControlY]);
      controlPoints.push(preMarkerControlLatLng);
    }

    // Vollständige Bézier curve calculation
    if (controlPoints.length === 1) {
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const lat = Math.pow(1 - t, 2) * startLatLng.lat +
          2 * (1 - t) * t * controlPoints[0].lat +
          Math.pow(t, 2) * endLatLng.lat;
        const lng = Math.pow(1 - t, 2) * startLatLng.lng +
          2 * (1 - t) * t * controlPoints[0].lng +
          Math.pow(t, 2) * endLatLng.lng;
        curvePoints.push([lat, lng]);
      }
    } else if (controlPoints.length === 2) {
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const lat = Math.pow(1 - t, 3) * startLatLng.lat +
          3 * Math.pow(1 - t, 2) * t * controlPoints[0].lat +
          3 * (1 - t) * Math.pow(t, 2) * controlPoints[1].lat +
          Math.pow(t, 3) * endLatLng.lat;
        const lng = Math.pow(1 - t, 3) * startLatLng.lng +
          3 * Math.pow(1 - t, 2) * t * controlPoints[0].lng +
          3 * (1 - t) * Math.pow(t, 2) * controlPoints[1].lng +
          Math.pow(t, 3) * endLatLng.lng;
        curvePoints.push([lat, lng]);
      }
    } else if (controlPoints.length === 3) {
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const lat = Math.pow(1 - t, 4) * startLatLng.lat +
          4 * Math.pow(1 - t, 3) * t * controlPoints[0].lat +
          6 * Math.pow(1 - t, 2) * Math.pow(t, 2) * controlPoints[1].lat +
          4 * (1 - t) * Math.pow(t, 3) * controlPoints[2].lat +
          Math.pow(t, 4) * endLatLng.lat;
        const lng = Math.pow(1 - t, 4) * startLatLng.lng +
          4 * Math.pow(1 - t, 3) * t * controlPoints[0].lng +
          6 * Math.pow(1 - t, 2) * Math.pow(t, 2) * controlPoints[1].lng +
          4 * (1 - t) * Math.pow(t, 3) * controlPoints[2].lng +
          Math.pow(t, 4) * endLatLng.lng;
        curvePoints.push([lat, lng]);
      }
    } else {
      curvePoints.push([startLatLng.lat, startLatLng.lng]);
      curvePoints.push([endLatLng.lat, endLatLng.lng]);
    }

    connectionLine = L.polyline(curvePoints, {
      color: color,
      weight: 5.5,
      opacity: 1,
      interactive: false,
      bubblingMouseEvents: false,
      smoothFactor: 0,
      noClip: true
    }).addTo(map);

    connectionLine.bringToFront();

    return connectionLine;
  }

  


  // ZENTRALISIERTE MARKER SKALIERUNG mit Animation
  function applyMarkerScale(marker, targetScale) {
    const state = window.markerStateManager.getState(marker.uniqueId);

    if (state.currentScale === targetScale || state.isScaling) return;

    window.markerStateManager.setState(marker.uniqueId, {
      isScaling: true,
      currentScale: targetScale
    });

    if (marker._icon) {
      // Nur z-index ändern, keine Skalierung
      marker._icon.style.zIndex = targetScale > 1 ? '1000' : '';

      setTimeout(() => {
        window.markerStateManager.setState(marker.uniqueId, { isScaling: false });
      }, 200);
    }
  }





  // Helper function zum konsistenten Icon-Update
  function updateMarkerIcon(marker, location) {
    const state = window.markerStateManager.getState(marker.uniqueId);

    // Verhindere Icon-Updates während aktiver Hover-Zustände
    if (state.isHovering || state.isDropdownHovering) return;

    if (currentStickyMarker === marker && isPopupSticky) {
      if (window.spaceAPI) {
        const statusIcon = window.spaceAPI.getStatusIcon(location, icons);
        marker.setIcon(statusIcon);
      } else {
        marker.setIcon(icons.highlightIcon);
      }
    } else {
      const searchQuery = document.querySelector('#search-bar').value.trim().toLowerCase();

      if (searchQuery.length > 0) {
        const filteredLocations = json.filter(loc =>
          loc.name.toLowerCase().includes(searchQuery) ||
          zfill(loc.loc.plz, loc.loc.country).startsWith(searchQuery) ||
          loc.loc.city.toLowerCase().includes(searchQuery)
        );

        if (filteredLocations.some(loc => loc.uniqueId === location.uniqueId)) {
          let iconToSet;

          if (location.isOpen === true) {
            iconToSet = icons.greenIcon;
          } else if (location.isOpen === false) {
            iconToSet = icons.redIcon;
          } else if (location.spaceapi && location.spaceapi.endpoint) {
            iconToSet = icons.unknownStatusIcon;
          } else {
            iconToSet = icons.highlightIcon;
          }

          marker.setIcon(iconToSet);
        } else {
          marker.setIcon(icons.defaultIcon);
        }
      } else {
        marker.setIcon(icons.defaultIcon);
      }
    }
  }

  // Helper function
  function zfill(plz, country) {
    const expectedLengths = { Germany: 5, Austria: 4, Switzerland: 4, Poland: 5, USA: 5, Italy: 5, Spain: 5, France: 5, Luxemburg: 4, Netherlands: 4 };
    let plzStr = String(plz);
    let expectedLength = expectedLengths[country] || plzStr.length;
    return plzStr.padStart(expectedLength, "0");
  }

  // Main initialization
  async function initializeApp() {
    try {
      setupMap();
      initializeClustering(); // NEU
      await loadData();
      setupSearch();
      setupStyleFilter();
      setupMapClickHandler();
    } catch (error) {
      console.error("A critical error occurred during app initialization:", error);
      alert("The application could not be started. Please check the developer console.");
    }
  }

  function setupMap() {
    console.log('🔧 Starting MapLibre setup...');

    map = new L.Map('map', {
      maxZoom: 18
    });
    console.log('✅ Leaflet map created');

    const darkModeQuery = window.matchMedia('(prefers-color-scheme: dark)');
    let currentMapLibreLayer = null;

    function updateMapTiles() {
      const isDarkMode = darkModeQuery.matches;
      console.log('Dark mode:', isDarkMode);

      const styleUrl = 'https://tiles.openfreemap.org/styles/liberty';
      console.log('Style URL:', styleUrl);

      if (currentMapLibreLayer) {
        map.removeLayer(currentMapLibreLayer);
      }

      try {
        currentMapLibreLayer = L.maplibreGL({
          style: styleUrl,
          attribution: '&copy; <a href="https://openfreemap.org/">OpenFreeMap</a> &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        });

        currentMapLibreLayer.addTo(map);

        const mapContainer = document.getElementById('map');
        if (isDarkMode) {
          mapContainer.classList.add('dark-mode-map');
        } else {
          mapContainer.classList.remove('dark-mode-map');
        }

      } catch (error) {
        console.error('⛔ Error creating MapLibre layer:', error);
        alert('MapLibre konnte nicht geladen werden.');
      }
    }


    map.setView(new L.LatLng(51.0122995, 10.3995537), 7);
    updateMapTiles();

    darkModeQuery.addEventListener('change', updateMapTiles);
  }


  function initializeClustering() {
    clusterGroup = L.markerClusterGroup({
      maxClusterRadius: function (zoom) {
        if (zoom >= 11) return 30;
        if (zoom >= 9) return 45;
        return 60;
      },
      disableClusteringAtZoom: 12,
      spiderfyOnMaxZoom: true,
      showCoverageOnHover: true,

      // Optional: Polygon-Styling anpassen
      polygonOptions: {
        fillColor: '#0000ff',
        color: '#0000ff',
        weight: 3,
        opacity: 0.8,
        fillOpacity: 0.2
      },

      iconCreateFunction: function (cluster) {
        const count = cluster.getChildCount();
        let className = 'marker-cluster-small';

        if (count > 20) className = 'marker-cluster-large';
        else if (count > 10) className = 'marker-cluster-medium';

        // KORREKTUR: Verwende new L.DivIcon() statt L.divIcon()
        return new L.DivIcon({
          html: '<div>' + count + '</div>',
          className: 'marker-cluster ' + className,
          iconSize: new L.Point(40, 40)
        });
      }
    });

    map.addLayer(clusterGroup);
    window.clusterGroup = clusterGroup;
  }



  async function loadData() {
    try {
      const response = await fetch("./locations.json");
      if (!response.ok) throw new Error(`Network response was not ok: ${response.statusText}`);
      json = await response.json();

      const spaceAPI = new SimpleSpaceAPI();
      window.spaceAPI = spaceAPI;
      console.log("📄 Loading SpaceAPI status...");
      json = await spaceAPI.enrichLocationData(json);
      console.log("✅ SpaceAPI status loaded");

      json.forEach((location, index) => {
        if (location.loc && typeof location.loc.lat === 'number' && typeof location.loc.long === 'number') {
          location.uniqueId = 'loc-' + index;

          const marker = L.marker([location.loc.lat, location.loc.long], {
            icon: icons.defaultIcon,
            opacity: 0.66
          });
          clusterGroup.addLayer(marker); // GEÄNDERT

          marker.uniqueId = location.uniqueId;

          marker.bindPopup((layer) => {
            let statusIconHtml = '';
            let nameClass = '';

            if (location.isOpen === true) {
              statusIconHtml = '<i class="fas fa-door-open" title="Space ist geöffnet"></i> ';
              nameClass = 'space-open';
            }
            else if (location.isOpen === false) {
              statusIconHtml = '<i class="fas fa-door-closed" title="Space ist geschlossen"></i> ';
              nameClass = 'space-closed';
            }
            else if (location.spaceapi && location.spaceapi.endpoint) {
              statusIconHtml = '<i class="fas fa-question-circle" title="Space-Status unbekannt"></i> ';
              nameClass = 'space-unknown';
            }

            const streetName = location.loc?.street?.name || '';
            const streetNumber = location.loc?.street?.number || '';
            const streetExt = location.loc?.street?.ext || '';
            const linkUrl = location.link?.url || '#';
            const linkText = location.link?.text || linkUrl;

            return `
              <h3 id="style">${location.style || ''}</h3>
              <a id="titleurl" href="${linkUrl}" target="_blank">
                <h3 class="${nameClass}">${statusIconHtml}${location.name || 'Unnamed Space'}</h3><br><br>
              </a>
              <div class="popup-street-line">
                ${streetName} ${streetNumber}<span id="streetext">${streetExt}</span>
                <a href="#" class="navigation-icon" title="Navigation starten (Rechtsklick zum Ändern)">
                  <i></i>
                </a>
              </div>
              <b>${zfill(location.loc?.plz || '', location.loc?.country || '')} ${location.loc?.city || ''}</b><br>
              ${location.loc?.country || ''}<br>
              <a id="url" href="${linkUrl}" target="_blank"><b>${linkText}</b></a>
            `;
          });

          // === VEREINFACHTES, ROBUSTES EVENT SYSTEM ===

          // Popup Events
          marker.on('popupopen', (e) => {
            if (!marker._openedByHover) {
              setStickyPopup(marker);
            }
            marker._openedByHover = false;

            const popup = marker.getPopup();
            const popupElement = popup._container;
            const logoElement = document.querySelector('.title');

            if (popupElement && logoElement) {
              const popupRect = popupElement.getBoundingClientRect();
              const logoRect = logoElement.getBoundingClientRect();

              const isOverlapping = !(popupRect.right < logoRect.left ||
                popupRect.left > logoRect.right ||
                popupRect.bottom < logoRect.top ||
                popupRect.top > logoRect.bottom);

              if (isOverlapping) {
                logoElement.classList.add('popup-active');
              }
            }

            // +++ START: NAVIGATION LINK EVENT LISTENERS +++
            const navLink = e.popup._container.querySelector('.navigation-icon');
            if (navLink) {
              // Set initial icon appearance (class and color)
              updateNavigationIconAppearance(navLink, location);

              // Left-click handler
              navLink.addEventListener('click', (event) => {
                handleNavigationClick(event, location);
              });

              // Right-click handler
              navLink.addEventListener('contextmenu', (event) => {
                handleNavigationRightClick(event, location, navLink);
              });
            }
            // +++ END: NAVIGATION LINK EVENT LISTENERS +++
          });

          marker.on('popupclose', () => {
            document.querySelector('.title').classList.remove('popup-active');
            if (currentStickyMarker === marker) {
              currentStickyMarker = null;
              isPopupSticky = false;
            }
          });

          // HOVER EVENTS mit zentralisiertem State Management
          marker.on('mouseover', (e) => {
            const state = window.markerStateManager.getState(marker.uniqueId);

            // Verhindere doppelte Hover-Events
            if (state.isHovering) return;

            window.markerStateManager.setState(marker.uniqueId, { isHovering: true });

            // Sofortige Skalierung ohne Debounce für bessere UX
            applyMarkerScale(marker, 1.15);

            // Verzögerte Popup-Öffnung
            const hoverTimeout = setTimeout(() => {
              const currentState = window.markerStateManager.getState(marker.uniqueId);
              if (currentState.isHovering && !isPopupSticky) {
                marker._openedByHover = true;
                marker.openPopup();
              }
            }, 400);

            window.markerStateManager.setState(marker.uniqueId, { hoverTimeout });
          });

          marker.on('mouseout', (e) => {
            const state = window.markerStateManager.getState(marker.uniqueId);

            window.markerStateManager.setState(marker.uniqueId, { isHovering: false });
            window.markerStateManager.clearTimeouts(marker.uniqueId);

            // Skalierung zurücksetzen nur wenn kein Dropdown-Hover aktiv
            if (!state.isDropdownHovering) {
              applyMarkerScale(marker, 1);
            }

            if (!isPopupSticky || currentStickyMarker !== marker) {
              marker.closePopup();
            }

            // Icon-Update nur wenn kein Hover-Zustand mehr aktiv
            if (!window.markerStateManager.isAnyHoverActive(marker.uniqueId)) {
              updateMarkerIcon(marker, location);
            }
          });

          marker.on('click', (e) => {
            e.originalEvent?.stopPropagation();
            marker._openedByHover = false;

            // Alle Hover-States zurücksetzen
            window.markerStateManager.setState(marker.uniqueId, {
              isHovering: false,
              isDropdownHovering: false
            });
            window.markerStateManager.clearTimeouts(marker.uniqueId);

            if (!marker.isPopupOpen()) {
              marker.openPopup();
            }
          });

          allMarkers.push(marker);
          // let clusterGroup = null;
        }
      });

      console.log("✅ Markers created with SpaceAPI data ready");

    } catch (error) {
      console.error("Error fetching or parsing locations.json:", error);
      alert("Failed to load location pins.");
    }
  }


  // Style Filter Setup
  function setupStyleFilter() {
    if (!window.StyleFilterManager) {
      console.error('StyleFilterManager not available');
      return;
    }

    styleFilterManager = new StyleFilterManager(json, allMarkers, icons, searchManager);
    window.styleFilterManager = styleFilterManager;

    // Integration: SearchManager über StyleFilter informieren
    if (searchManager) {
      searchManager.setStyleFilterManager(styleFilterManager);
    }

    console.log('StyleFilterManager initialized successfully');
  }


  function setupSearch() {
    if (!window.mapUtils) {
      console.error('mapUtils not available when setting up search');
      return;
    }

    searchManager = new SearchManager(map, allMarkers, json, icons, zfill);
    window.searchManager = searchManager;
    console.log('SearchManager initialized successfully');
  }

  function clearStickyPopup() {
    if (currentStickyMarker && isPopupSticky) {
      currentStickyMarker.closePopup();
      currentStickyMarker = null;
      isPopupSticky = false;
      console.log('Sticky popup cleared');
    }
  }

  function setStickyPopup(marker) {
    clearStickyPopup();
    currentStickyMarker = marker;
    isPopupSticky = true;
    console.log('Sticky popup set for marker');
  }

  function setupMapClickHandler() {
    map.on('click', (e) => {
      if (e.originalEvent && e.originalEvent.target &&
        !e.originalEvent.target.closest('.leaflet-marker-icon')) {
        clearStickyPopup();
      }
    });
  }

  initializeApp();
});