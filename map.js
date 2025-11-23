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
    if (state.isHovering || state.isDropdownHovering) {
      return;
    }

    // Sticky Marker haben Priorität
    if (currentStickyMarker === marker && isPopupSticky) {
      if (window.spaceAPI) {
        const statusIcon = window.spaceAPI.getStatusIcon(location, icons);
        marker.setIcon(statusIcon);
      } else {
        marker.setIcon(icons.highlightIcon);
      }
      return;
    }

    const searchQuery = document.querySelector('#search-bar').value.trim().toLowerCase();

    // ✨ FIX: Prüfe auch ob Style-Filter aktiv sind
    const hasActiveFilters = window.styleFilterManager &&
      window.styleFilterManager.hasActiveFilters();

    if (searchQuery.length > 0 || hasActiveFilters) {
      // Marker ist gefiltert/gesucht - zeige Status-basiertes Icon
      const filteredLocations = json.filter(loc =>
        loc.name.toLowerCase().includes(searchQuery) ||
        zfill(loc.loc.plz, loc.loc.country).startsWith(searchQuery) ||
        loc.loc.city.toLowerCase().includes(searchQuery)
      );

      if (filteredLocations.some(loc => loc.uniqueId === location.uniqueId)) {
        // ✨ KRITISCHER FIX: Zeige immer den korrekten Status!
        let iconToSet;

        if (location.isOpen === true) {
          iconToSet = icons.greenIcon;  // ✅ Grün bleibt grün!
        } else if (location.isOpen === false) {
          iconToSet = icons.redIcon;    // ✅ Rot bleibt rot!
        } else if (location.spaceapi && location.spaceapi.endpoint) {
          iconToSet = icons.unknownStatusIcon; // ✅ Unknown bleibt unknown!
        } else {
          iconToSet = icons.highlightIcon; // Standard-Highlight
        }

        marker.setIcon(iconToSet);
      } else {
        // Marker ist nicht im Filter - graues Default-Icon
        marker.setIcon(icons.defaultIcon);
      }
    } else {
      // Spaces mit bekanntem Status sollen ihre Farbe behalten!

      if (location.isOpen === true) {
        marker.setIcon(icons.greenIcon);  // ✅ Offene Spaces bleiben grün!
      } else if (location.isOpen === false) {
        marker.setIcon(icons.redIcon);    // ✅ Geschlossene Spaces bleiben rot!
      } else if (location.spaceapi && location.spaceapi.endpoint) {
        marker.setIcon(icons.unknownStatusIcon); // ✅ Unknown bleibt gelb!
      } else {
        marker.setIcon(icons.defaultIcon); // Normale Spaces grau
      }
    }
  }

  // Helper function
  function zfill(plz, country) {
    const expectedLengths = { Germany: 5, Austria: 4, Belgium: 4, Switzerland: 4, Poland: 5, USA: 5, Italy: 5, Spain: 5, France: 5, Luxemburg: 4, Netherlands: 4, Ukraine: 5};
    let plzStr = String(plz);
    let expectedLength = expectedLengths[country] || plzStr.length;
    return plzStr.padStart(expectedLength, "0");
  }

  // Füge updateMarkerIcon zu mapUtils hinzu
  window.mapUtils.updateMarkerIcon = updateMarkerIcon;

  // Main initialization
  async function initializeApp() {
    try {
      setupMap();
      initializeClustering();
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
      // ✨ Dynamischer Radius basierend auf Zoom
      maxClusterRadius: function (zoom) {
        // Zoom 0-7: Viele Marker, viel Clustering
        // if (zoom <= 7) return 80;

        // Zoom 8-9: Standard Clustering
        if (zoom <= 9) return 60;

        // Zoom 10-11: Reduziertes Clustering
        if (zoom <= 11) return 40;

        // Zoom 12-13: Minimales Clustering
        if (zoom <= 13) return 25;

        // Zoom 14+: Kein Clustering
        return 0;
      },

      // ✨ Clustering wird ab Zoom 14 komplett deaktiviert
      disableClusteringAtZoom: 14,

      // ✨ Spiderfy bei maximaler Zoom
      spiderfyOnMaxZoom: true,
      spiderfyDistanceMultiplier: 2,

      // ✨ Zeige Polygon beim Hover
      showCoverageOnHover: true,
      zoomToBoundsOnClick: true,

      // ✨ Animation
      animate: true,
      animateAddingMarkers: false,

      // ✨ Chunk-Delay für bessere Performance
      chunkedLoading: true,
      chunkInterval: 200,
      chunkDelay: 50,

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
        let size = 40;

        // ✨ Größe basierend auf Anzahl
        if (count > 20) {
          className = 'marker-cluster-large';
          size = 40;
        } else if (count > 10) {
          className = 'marker-cluster-medium';
          size = 40;
        }

        return new L.DivIcon({
          html: '<div>' + count + '</div>',
          className: 'marker-cluster ' + className,
          iconSize: new L.Point(size, size)
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

      // // ✨ PHASE 0: Lade cached SpaceAPI-Status aus LocalStorage (INSTANT!)
      // const cachedStatus = loadCachedSpaceAPIStatus();
      // if (cachedStatus) {
      //   console.log("💾 Found cached SpaceAPI status, applying immediately...");
      //   applyCachedStatus(json, cachedStatus);
      //   console.log(`✅ Applied ${Object.keys(cachedStatus).length} cached statuses`);
      // }

      // // ✨ PHASE 1: Zeige Marker SOFORT
      console.log("📍 Creating markers immediately...");
      json.forEach((location, index) => {
        if (location.loc && typeof location.loc.lat === 'number' && typeof location.loc.long === 'number') {
          location.uniqueId = 'loc-' + index;
          createMarkerForLocation(location);
        }
      });

      console.log("✅ All markers created immediately!");

      // 🔄 PHASE 2: Lade SpaceAPI-Status im Hintergrund (auch wenn cached)
      // const spaceAPI = new SimpleSpaceAPI();
      const spaceAPI = new StaticSpaceAPI();
      window.spaceAPI = spaceAPI;

      console.log("📄 Loading fresh SpaceAPI status in background for", json.filter(loc => loc.spaceapi?.endpoint).length, "spaces...");

      // Lausche auf Status-Updates und aktualisiere Marker live
      spaceAPI.onStatusUpdate((location) => {
        updateMarkerIconForLocation(location);
      });

      // Starte asynchrones Laden (ohne await = blockiert nicht!)
      spaceAPI.enrichLocationData(json).then(() => {
        // Debug: Zähle die Ergebnisse
        const openCount = json.filter(loc => loc.isOpen === true).length;
        const closedCount = json.filter(loc => loc.isOpen === false).length;
        const nullCount = json.filter(loc => loc.isOpen === null).length;
        const undefinedCount = json.filter(loc => loc.isOpen === undefined).length;

        console.log("✅ SpaceAPI status loading complete:");
        console.log(`   - ✅ Open: ${openCount}`);
        console.log(`   - ❌ Closed: ${closedCount}`);
        console.log(`   - ⚠️  Null: ${nullCount}`);
        console.log(`   - ❓ Undefined: ${undefinedCount}`);

        // ✨ NEU: Aktualisiere Filter NACH dem Laden!
        if (window.styleFilterManager && typeof window.styleFilterManager.refreshStyleStats === 'function') {
          window.styleFilterManager.refreshStyleStats();
        } else {
          console.log('⚠️ styleFilterManager.refreshStyleStats not available');
        }
      });

    } catch (error) {
      console.error("Error fetching or parsing locations.json:", error);
      alert("Failed to load location pins.");
    }
  }



  // ✨ NEUE HILFSFUNKTION: Erstelle Marker für eine Location
  function createMarkerForLocation(location) {
    // Validiere Koordinaten (verhindere null/undefined)
    const lat = location.loc?.lat;
    const lng = location.loc?.long;

    if (typeof lat !== 'number' || typeof lng !== 'number' || isNaN(lat) || isNaN(lng)) {
      console.warn('⚠️ Invalid coordinates for location:', location.name, 'lat:', lat, 'lng:', lng);
      return null; // Skip this marker
    }

    const marker = L.marker([lat, lng], {
      icon: icons.defaultIcon,
      opacity: 0.66
    });

    clusterGroup.addLayer(marker);
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
        statusIconHtml = '<i class="fas fa-question-circle" title="Space-Status wird geladen..."></i> ';
        nameClass = 'space-unknown';
      }

      // ✨ NEU: Style-Icons hinzufügen
      let styleIconHtml = '';
      const styleIconMap = {
        'for all': 'far fa-circle',
        'for students': 'fas fa-graduation-cap',
        'for youth': 'fas fa-child',
        'for students & youth': 'fas fa-graduation-cap',
        'commercial': 'fas fa-money-bill-wave',
      };

      const locationStyle = location.style ? location.style.toLowerCase() : '';

      if (locationStyle && styleIconMap[locationStyle]) {
        styleIconHtml = `<i class="${styleIconMap[locationStyle]}" title="${location.style}"></i> `;
      }

      const streetName = location.loc?.street?.name || '';
      const streetNumber = location.loc?.street?.number || '';
      const streetExt = location.loc?.street?.ext || '';
      const linkUrl = location.link?.url || '#';
      const linkText = location.link?.text || linkUrl;

      return `
        <h3 id = "style" > ${ styleIconHtml }${ location.style || '' }</h3 >
          <a id="titleurl" href="${linkUrl}" target="_blank">
            <h3 class="${nameClass}">${statusIconHtml}${location.name || 'Unnamed Space'}</h3><br><br>
            </a>
              <div class="popup-street-line">
                <span class="street">${streetName} ${streetNumber}<span class="streetext">${streetExt}</span></span>
                <a href="#" class="navigation-icon" title="&#013;    L:   START     route to makerspace    &#013;&#013;    R:   SWITCH  map routing service &#013;">
                  <i></i>
                </a>
              </div>
              <span class="city">${zfill(location.loc?.plz || '', location.loc?.country || '')} <b>${location.loc?.city || ''}</span><br>
                <span class="country">${location.loc?.country || ''}</span><br>
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
      setTimeout(() => {
        if (!window.markerStateManager.isAnyHoverActive(marker.uniqueId)) {
          // ✨ WICHTIG: Verwende updateMarkerIcon statt direkt setIcon!
          updateMarkerIcon(marker, location);
        }
      }, 50);
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
  }

  // ✨ NEUE HILFSFUNKTION: Aktualisiere Marker-Icon für eine Location
  function updateMarkerIconForLocation(location) {
    const marker = allMarkers.find(m => m.uniqueId === location.uniqueId);
    if (!marker) return;

    // ✨ WICHTIG: Nur aktualisieren wenn KEIN Hover aktiv ist
    const state = window.markerStateManager.getState(marker.uniqueId);
    if (state.isHovering || state.isDropdownHovering) {
      console.log('⏸️ Skipping icon update during hover:', location.name);
      return;
    }

    // Bestimme das richtige Icon basierend auf Status
    let newIcon;
    if (location.isOpen === true) {
      newIcon = icons.greenIcon;
      console.log(`🟢 Updated marker for ${location.name} to OPEN`);
    } else if (location.isOpen === false) {
      newIcon = icons.redIcon;
      console.log(`🔴 Updated marker for ${location.name} to CLOSED`);
    } else if (location.spaceapi && location.spaceapi.endpoint) {
      newIcon = icons.unknownStatusIcon;
      console.log(`🟡 Updated marker for ${location.name} to UNKNOWN`);
    } else {
      newIcon = icons.highlightIcon;
    }

    // Setze das neue Icon
    marker.setIcon(newIcon);

    // Wenn Popup offen ist, aktualisiere auch den Inhalt
    if (marker.isPopupOpen()) {
      marker.closePopup();
      marker.openPopup();
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

    // Debug: Zeige die aktuellen Counts
    const openCount = json.filter(loc => loc.isOpen === true).length;
    const closedCount = json.filter(loc => loc.isOpen === false).length;
    const unknownCount = json.filter(loc => loc.isOpen === null || loc.isOpen === undefined).length;

    console.log('📊 Filter initialized with:');
    console.log(`   - Open spaces: ${openCount}`);
    console.log(`   - Closed spaces: ${closedCount}`);
    console.log(`   - Unknown/loading: ${unknownCount}`);

    if (openCount === 0 && closedCount === 0) {
      console.log('⏳ SpaceAPI status is still loading in background...');
      console.log('   Filter will be updated automatically when data arrives');
    }
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