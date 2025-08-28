// map.js - Fokus nur auf Map-Funktionalität mit Dark Mode

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
  let searchManager;
  let currentStickyMarker = null;
  let isPopupSticky = false;

  // *** WICHTIG: json als globale Variable ***
  window.json = []; // Macht json überall verfügbar
  let json = window.json; // Lokale Referenz für Kompatibilität

  // Icons aus der globalen icons.js verwenden
  const icons = {
    defaultIcon: window.MapIcons.defaultIcon,
    highlightIcon: window.MapIcons.highlightIcon,
    hoverIcon: window.MapIcons.hoverIcon,
    redIcon: window.MapIcons.redIcon,
    greenIcon: window.MapIcons.greenIcon,
    // KORRIGIERT: Hier wird jetzt der korrekte neue Name verwendet.
    unknownStatusIcon: window.MapIcons.unknownStatusIcon
  };

  // Map Utils für Search Manager
  window.mapUtils = {
    createConnectionLine: createConnectionLine,
    removeConnectionLine: removeConnectionLine,
    clearStickyPopup: clearStickyPopup,
    setStickyPopup: setStickyPopup,
    // *** NEU: Globale Referenz auf currentStickyMarker ***
    currentStickyMarker: null
  };

  // +++ START: REVISED NAVIGATION LINK FUNCTIONS +++

  function updateNavigationIconAppearance(navLinkElement, location) {
    const icon = navLinkElement.querySelector('i');
    const parentContainer = navLinkElement.parentElement; // Das ist .popup-street-line
    if (!icon || !parentContainer) return;

    // 1. Set the icon class for Apple/Google
    const savedService = localStorage.getItem('mapService');
    const mapServiceTimestamp = localStorage.getItem('mapServiceTimestamp');
    const ninetySixHours = 96 * 60 * 60 * 1000;
    let serviceExpired = !savedService || (mapServiceTimestamp && (Date.now() - parseInt(mapServiceTimestamp, 10)) > ninetySixHours);

    if (serviceExpired) {
      icon.className = 'fas fa-directions';
    } else if (savedService === 'google') {
      icon.className = 'fab fa-google';
    } else if (savedService === 'apple') {
      icon.className = 'fab fa-apple';
    } else {
      icon.className = 'fas fa-directions';
    }

    // 2. Determine and set the status class on the parent container for CSS to handle coloring
    parentContainer.classList.remove('status-open', 'status-closed', 'status-unknown', 'status-default'); // Clear previous status

    if (location.isOpen === true) {
      parentContainer.classList.add('status-open');
    } else if (location.isOpen === false) {
      parentContainer.classList.add('status-closed');
    } else if (location.spaceapi && location.spaceapi.endpoint) {
      parentContainer.classList.add('status-unknown');
    } else {
      parentContainer.classList.add('status-default');
    }
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

    let mapService;
    if (confirm('Google Maps für die Navigation verwenden?\n(OK = Google Maps, Abbrechen = Apple Maps)')) {
      mapService = 'google';
    } else {
      mapService = 'apple';
    }
    localStorage.setItem('mapService', mapService);
    localStorage.setItem('mapServiceTimestamp', String(Date.now()));

    // Immediately update the icon in the current popup to reflect the new choice
    updateNavigationIconAppearance(navLinkElement, location);
  }


  function openMap(service, lat, long) {
    let url;
    if (service === 'google') {
      url = `https://www.google.com/maps/dir/?api=1&destination=${lat},${long}`;
    } else { // apple
      url = `http://maps.apple.com/?daddr=${lat},${long}`;
    }
    window.open(url, '_blank');
  }
  // +++ END: REVISED NAVIGATION LINK FUNCTIONS +++


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
      console.log('Connection line removed');
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
      // Einfache quadratische Bézier-Kurve
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
      // Kubische Bézier-Kurve
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
      // Quartische Bézier-Kurve (4 Kontrollpunkte + Start/End)
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
      // Fallback: Einfache gerade Linie
      curvePoints.push([startLatLng.lat, startLatLng.lng]);
      curvePoints.push([endLatLng.lat, endLatLng.lng]);
    }

    connectionLine = L.polyline(curvePoints, {
      color: color, // *** NEU: Dynamische Farbe ***
      weight: 5.5,
      opacity: 1,
      interactive: false,
      bubblingMouseEvents: false,
      smoothFactor: 0,
      noClip: true
    }).addTo(map);

    connectionLine.bringToFront();
    console.log('Enhanced connection line created with', controlPoints.length, 'control points, color:', color);

    return connectionLine;
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
      await loadData();
      setupSearch();
      setupMapClickHandler(); // *** NEU: Setup map click handler ***
    } catch (error) {
      console.error("A critical error occurred during app initialization:", error);
      alert("The application could not be started. Please check the developer console.");
    }
  }

  function setupMap() {
    map = new L.Map('map');

    // *** NEU: Dark Mode Detection mit Live-Updates ***
    const darkModeQuery = window.matchMedia('(prefers-color-scheme: dark)');
    let currentTileLayer = null;

    function updateMapTiles() {
      const isDarkMode = darkModeQuery.matches;

      let osmUrl, osmAttrib;

      if (isDarkMode) {
        // Dark Mode Karte
        osmUrl = 'https://api.maptiler.com/maps/streets-v2-dark/{z}/{x}/{y}.png?key=MfoJXkQ2J0VOMKPKK9Df';
        osmAttrib = '\u003ca href=\"https://www.maptiler.com/copyright/\" target=\"_blank\"\u003e\u0026copy; MapTiler\u003c/a\u003e \u003ca href=\"https://www.openstreetmap.org/copyright\" target=\"_blank\"\u003e\u0026copy; OpenStreetMap contributors\u003c/a\u003e';
      } else {
        // Light Mode Karte (Standard)
        osmUrl = 'https://api.maptiler.com/maps/streets-v2/{z}/{x}/{y}.png?key=MfoJXkQ2J0VOMKPKK9Df';
        osmAttrib = '\u003ca href=\"https://www.maptiler.com/copyright/\" target=\"_blank\"\u003e\u0026copy; MapTiler\u003c/a\u003e \u003ca href=\"https://www.openstreetmap.org/copyright\" target=\"_blank\"\u003e\u0026copy; OpenStreetMap contributors\u003c/a\u003e';
      }

      // Entferne alte Tile-Layer
      if (currentTileLayer) {
        map.removeLayer(currentTileLayer);
      }

      // Füge neue Tile-Layer hinzu
      currentTileLayer = new L.TileLayer(osmUrl, {
        minZoom: 2, maxZoom: 19, tileSize: 512,
        zoomOffset: -1, attribution: osmAttrib
      });

      map.addLayer(currentTileLayer);
    }

    // Initiale Karten-Setup
    map.setView(new L.LatLng(51.0122995, 10.3995537), 7);
    updateMapTiles();

    // *** Live-Update bei Dark Mode Änderungen ***
    darkModeQuery.addEventListener('change', updateMapTiles);
  }

  async function loadData() {
    try {
      const response = await fetch("./locations.json");
      if (!response.ok) throw new Error(`Network response was not ok: ${response.statusText}`);
      json = await response.json();

      // *** ZUERST: SpaceAPI Status abrufen ***
      const spaceAPI = new SimpleSpaceAPI();
      window.spaceAPI = spaceAPI;
      console.log("🔄 Loading SpaceAPI status...");
      json = await spaceAPI.enrichLocationData(json);
      console.log("✅ SpaceAPI status loaded");

      // *** DANN: Marker erstellen (immer mit defaultIcon) ***
      json.forEach((location, index) => {
        if (location.loc && typeof location.loc.lat === 'number' && typeof location.loc.long === 'number') {
          location.uniqueId = 'loc-' + index;

          const marker = L.marker([location.loc.lat, location.loc.long], {
            icon: icons.defaultIcon,
            opacity: 0.66
          }).addTo(map);

          marker.uniqueId = location.uniqueId;

          // KORRIGIERT: Der Popup-Inhalt wird jetzt durch eine Funktion dynamisch
          marker.bindPopup((layer) => {
            // Diese Funktion wird jedes Mal ausgeführt, wenn ein Popup geöffnet wird.

            // 1. Erweitere die Logik, um "offen", "geschlossen" UND "unbekannt" zu behandeln.
            let statusIconHtml = '';
            let nameClass = '';

            if (location.isOpen === true) {
              statusIconHtml = '<i class="fas fa-door-open" title="Space ist geöffnet"></i> ';
              nameClass = 'space-open';
            }
            // NEU: Füge den "else if"-Block für den geschlossenen Zustand hinzu.
            else if (location.isOpen === false) {
              statusIconHtml = '<i class="fas fa-door-closed" title="Space ist geschlossen"></i> ';
              nameClass = 'space-closed'; // Klasse für geschlossenen Status
            }
            // *** NEU: Füge den "else"-Block für unbekannten Status hinzu. ***
            else if (location.spaceapi && location.spaceapi.endpoint) {
              statusIconHtml = '<i class="fas fa-question-circle" title="Space-Status unbekannt"></i> ';
              nameClass = 'space-unknown'; // *** NEU: Klasse für unbekannten Status ***
            }
            // Wenn kein SpaceAPI endpoint vorhanden ist, bleiben beide Variablen leer.

            // 2. Baue den HTML-Inhalt.
            const streetName = location.loc?.street?.name || '';
            const streetNumber = location.loc?.street?.number || '';
            const streetExt = location.loc?.street?.ext || '';
            const linkUrl = location.link?.url || '#';
            const linkText = location.link?.text || linkUrl;

            // 3. Gib den fertigen HTML-String zurück.
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

          // Popup events (dieser Teil bleibt für die Logo-Interaktion wichtig)
          marker.on('popupopen', (e) => {
            // Set this popup as sticky when it opens
            setStickyPopup(marker);

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

            // +++ START: REVISED NAVIGATION LINK EVENT LISTENERS +++
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
            // +++ END: REVISED NAVIGATION LINK EVENT LISTENERS +++
          });

          marker.on('popupclose', () => {
            document.querySelector('.title').classList.remove('popup-active');
            // Only clear sticky if this was the sticky marker
            if (currentStickyMarker === marker) {
              currentStickyMarker = null;
              isPopupSticky = false;
            }
          });

          let hoverTimeout = null;

          marker.on('mouseover', () => {
            marker.setIcon(icons.hoverIcon);
            hoverTimeout = setTimeout(() => {
              // *** MODIFIED: Only open popup if no sticky popup is active ***
              if (!isPopupSticky) {
                marker.openPopup();
              }
            }, 300);
          });

          marker.on('mouseout', () => {
            if (hoverTimeout) {
              clearTimeout(hoverTimeout);
              hoverTimeout = null;
            }

            // Only close popup if it's not sticky
            if (!isPopupSticky || currentStickyMarker !== marker) {
              marker.closePopup();
            }

            // Icon-Status korrekt setzen basierend auf Sticky und Search-Status
            if (currentStickyMarker === marker && isPopupSticky) {
              // Sticky Marker behält seinen Status-Icon
              if (window.spaceAPI) {
                const statusIcon = window.spaceAPI.getStatusIcon(location, icons);
                marker.setIcon(statusIcon);
              } else {
                marker.setIcon(icons.highlightIcon);
              }
            } else {
              // Normales Verhalten für nicht-sticky Marker
              const searchQuery = document.querySelector('#search-bar').value.trim().toLowerCase();

              if (searchQuery.length > 0) {
                const filteredLocations = json.filter(loc =>
                  loc.name.toLowerCase().includes(searchQuery) ||
                  zfill(loc.loc.plz, loc.loc.country).startsWith(searchQuery) ||
                  loc.loc.city.toLowerCase().includes(searchQuery)
                );

                if (filteredLocations.some(loc => loc.uniqueId === location.uniqueId)) {
                  // KORRIGIERT: Verwende die gleiche Logik wie in updateMarkers
                  let iconToSet;

                  if (location.isOpen === true) {
                    iconToSet = icons.greenIcon;
                  } else if (location.isOpen === false) {
                    iconToSet = icons.redIcon;
                  } else if (location.spaceapi && location.spaceapi.endpoint) {
                    // Hat SpaceAPI aber Status unbekannt - orange
                    iconToSet = icons.unknownStatusIcon;
                  } else {
                    // Hat keine SpaceAPI - schwarz/grau
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
          });


          allMarkers.push(marker);
        }
      });

      console.log("✅ Markers created with SpaceAPI data ready");

    } catch (error) {
      console.error("Error fetching or parsing locations.json:", error);
      alert("Failed to load location pins.");
    }
  }

  function setupSearch() {
    // Stelle sicher, dass mapUtils verfügbar ist
    if (!window.mapUtils) {
      console.error('mapUtils not available when setting up search');
      return;
    }

    // Initialisiere den SearchManager mit korrekten Icons
    searchManager = new SearchManager(map, allMarkers, json, icons, zfill);

    // Mache SearchManager global verfügbar für Debugging
    window.searchManager = searchManager;

    console.log('SearchManager initialized successfully');
  }

  // *** NEU: Sticky Popup Functions ***
  function clearStickyPopup() {
    if (currentStickyMarker && isPopupSticky) {
      currentStickyMarker.closePopup();
      currentStickyMarker = null;
      isPopupSticky = false;
      // *** NEU: Aktualisiere globale Referenz ***
      window.mapUtils.currentStickyMarker = null;
      console.log('Sticky popup cleared');
    }
  }

  function setStickyPopup(marker) {
    // Clear any existing sticky popup first
    clearStickyPopup();

    currentStickyMarker = marker;
    isPopupSticky = true;
    // *** NEU: Aktualisiere globale Referenz ***
    window.mapUtils.currentStickyMarker = marker;
    console.log('Sticky popup set for marker');
  }


  // *** NEU: Map click event to clear sticky popup ***
  function setupMapClickHandler() {
    map.on('click', (e) => {
      // Only clear if the click wasn't on a marker
      if (e.originalEvent && e.originalEvent.target &&
        !e.originalEvent.target.closest('.leaflet-marker-icon')) {
        clearStickyPopup();
      }
    });
  }


  // Starte die App
  initializeApp();
});