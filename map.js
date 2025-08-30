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
  // +++ NEU: Cache für den Benutzerstandort +++
  let userLocation = null;
  let userLocationTimestamp = 0;

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

  // +++ START: FINAL NAVIGATION LOGIC WITH GEOLOCATION +++

  // Generiert die URL für alle drei Dienste, jetzt mit optionalen Startkoordinaten
  function getNavigationUrl(service, destLat, destLon, startLat = null, startLon = null) {
    if (startLat && startLon) {
      // Vollständige Route von A nach B
      if (service === 'google') {
        return `https://www.google.com/maps/dir/${startLat},${startLon}/${destLat},${destLon}`;
      } else if (service === 'apple') {
        return `http://maps.apple.com/?saddr=${startLat},${startLon}&daddr=${destLat},${destLon}`;
      } else { // osm
        return `https://www.openstreetmap.org/directions?route=${startLat}%2C${startLon}%3B${destLat}%2C${destLon}`;
      }
    } else {
      // Fallback: Route nur zum Ziel
      if (service === 'google') {
        return `https://www.google.com/maps/dir/?api=1&destination=${destLat},${destLon}`;
      } else if (service === 'apple') {
        return `http://maps.apple.com/?daddr=${destLat},${destLon}`;
      } else { // osm
        return `https://www.openstreetmap.org/directions?route=;${destLat},${destLon}`;
      }
    }
  }

  // Aktualisiert das Icon und den Tooltip (aber nicht mehr den Link selbst)
  function updateNavigationIconAppearance(navLinkElement, location) {
    const icon = navLinkElement.querySelector('i');
    const parentContainer = navLinkElement.parentElement;
    if (!icon || !parentContainer) return;

    // 1. Speicherdauer auf 48 Stunden ändern
    const mapServiceTimestamp = localStorage.getItem('mapServiceTimestamp');
    const fortyEightHours = 48 * 60 * 60 * 1000;
    let savedService = localStorage.getItem('mapService');
    const serviceExpired = !savedService || (mapServiceTimestamp && (Date.now() - parseInt(mapServiceTimestamp, 10)) > fortyEightHours);

    if (serviceExpired && savedService) {
      localStorage.removeItem('mapService');
      localStorage.removeItem('mapServiceTimestamp');
      savedService = null;
    }

    // 2. OSM als Standard festlegen
    const serviceToUse = savedService || 'osm';

    // 3. Icon-Klasse direkt setzen (kein generisches Icon mehr)
    if (serviceToUse === 'google') {
      icon.className = 'fab fa-google';
    } else if (serviceToUse === 'apple') {
      icon.className = 'fab fa-apple';
    } else { // osm
      icon.className = 'fas fa-map-marked-alt';
    }

    // 4. Status-Klasse für die Farbgebung im CSS setzen
    parentContainer.classList.remove('status-open', 'status-closed', 'status-unknown', 'status-default');
    if (location.isOpen === true) parentContainer.classList.add('status-open');
    else if (location.isOpen === false) parentContainer.classList.add('status-closed');
    else if (location.spaceapi && location.spaceapi.endpoint) parentContainer.classList.add('status-unknown');
    else parentContainer.classList.add('status-default');
  }


  // Die Hauptfunktion, die die Navigation startet
  function handleNavigationClick(event, location, navLinkElement) {
    event.preventDefault();
    const icon = navLinkElement.querySelector('i');
    const originalIconClass = icon.className;
    icon.className = 'fas fa-spinner fa-spin'; // Lade-Spinner anzeigen

    const openNavigationLink = (startLat = null, startLon = null) => {
      const savedService = localStorage.getItem('mapService') || 'osm';
      const url = getNavigationUrl(savedService, location.loc.lat, location.loc.long, startLat, startLon);

      const a = document.createElement('a');
      a.href = url;
      a.target = '_blank';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);

      icon.className = originalIconClass; // Icon wiederherstellen
    };

    // Standort aus dem Cache verwenden, wenn er frisch ist (unter 1 Minute alt)
    const cacheDuration = 60 * 1000;
    if (userLocation && (Date.now() - userLocationTimestamp < cacheDuration)) {
      openNavigationLink(userLocation.latitude, userLocation.longitude);
      return;
    }

    // Neuen Standort abfragen
    navigator.geolocation.getCurrentPosition(
      (position) => { // Erfolgsfall
        userLocation = position.coords;
        userLocationTimestamp = Date.now();
        openNavigationLink(userLocation.latitude, userLocation.longitude);
      },
      (error) => { // Fehlerfall
        console.warn("Geolocation Error:", error.message);
        // alert("Standort nicht verfügbar. Navigation ohne Startpunkt.");
        openNavigationLink(); // Fallback ohne Startkoordinaten
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  }

  // Rechtsklick-Handler bleibt fast gleich, aktualisiert nur das Icon
  function handleNavigationRightClick(event, location, navLinkElement) {
    event.preventDefault();

    const currentService = localStorage.getItem('mapService');
    let newService;

    // Korrigierte Reihenfolge: (null/osm) -> google -> apple -> osm
    if (currentService === 'google') {
      newService = 'apple';
    } else if (currentService === 'apple') {
      newService = 'osm';
    } else { // Behandelt 'osm' und den Fall, dass nichts gesetzt ist (null)
      newService = 'google';
    }

    localStorage.setItem('mapService', newService);
    localStorage.setItem('mapServiceTimestamp', String(Date.now()));

    updateNavigationIconAppearance(navLinkElement, location);
  }


  // +++ END: FINAL NAVIGATION LOGIC WITH GEOLOCATION +++


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

    // Startpunkt der Kurve (rechts vom Dropdown-Item)
    const startX = suggestionRect.left - 50 - mapRect.left;
    const startY = suggestionRect.top - 0.5 + (suggestionRect.height / 2) - mapRect.top;
    const startLatLng = map.containerPointToLatLng([startX, startY]);

    // Endpunkt der Kurve (Marker-Position)
    const endLatLng = targetMarker.getLatLng();
    const markerPixel = map.latLngToContainerPoint(endLatLng);

    // Kontrollpunkte für die Bézier-Kurve berechnen
    const controlPoints = calculateBezierControlPoints(
      startX, startY,
      markerPixel.x, markerPixel.y
    );

    // Erstelle SVG-Pfad mit echter Bézier-Kurve
    const svgElement = createBezierSVG(
      startLatLng, endLatLng,
      controlPoints,
      color,
      mapContainer
    );

    // Konvertiere SVG zu Leaflet-Layer für konsistente Behandlung
    connectionLine = L.svgOverlay(svgElement, map.getBounds(), {
      interactive: false,
      bubblingMouseEvents: false
    }).addTo(map);

    connectionLine.bringToFront();
    console.log('Elegante Bézier-Kurve erstellt, Farbe:', color);

    return connectionLine;
  }

  function calculateBezierControlPoints(startX, startY, endX, endY) {
    const deltaX = Math.abs(endX - startX);
    const deltaY = Math.abs(endY - startY);

    let cp1X, cp1Y, cp2X, cp2Y;

    if (endX > (startX - 80)) {
      // Marker ist rechts vom Dropdown - S-Kurve
      cp1X = startX - 60;
      cp1Y = startY; // Horizontal zum Startpunkt
      cp2X = endX - 80;
      cp2Y = endY; // Horizontal zum Endpunkt
    } else {
      // Marker ist links vom Dropdown - sanfte Kurve
      const horizontalOffset = deltaX * 0.6;

      cp1X = startX - horizontalOffset;
      cp1Y = startY; // KORRIGIERT: Horizontal zum Startpunkt
      cp2X = endX + horizontalOffset;
      cp2Y = endY; // KORRIGIERT: Horizontal zum Endpunkt
    }

    return { cp1X, cp1Y, cp2X, cp2Y };
  }

  function createBezierSVG(startLatLng, endLatLng, controlPoints, color, mapContainer) {
    // Erstelle SVG-Element
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.style.cssText = `
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
    z-index: 100;
  `;

    // Berechne Pixel-Koordinaten für SVG
    const startPixel = map.latLngToContainerPoint(startLatLng);
    const endPixel = map.latLngToContainerPoint(endLatLng);
    const { cp1X, cp1Y, cp2X, cp2Y } = controlPoints;

    // Erstelle Bézier-Pfad
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    const pathData = `M ${startPixel.x} ${startPixel.y} C ${cp1X} ${cp1Y}, ${cp2X} ${cp2Y}, ${endPixel.x} ${endPixel.y}`;

    path.setAttribute('d', pathData);
    path.setAttribute('stroke', color);
    path.setAttribute('stroke-width', '5.5');
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke-linecap', 'round');
    path.setAttribute('opacity', '1');

    svg.appendChild(path);
    return svg;
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
            
            else if (location.isOpen === false) {
              statusIconHtml = '<i class="fas fa-door-closed" title="Space ist geschlossen"></i> ';
              nameClass = 'space-closed'; // Klasse für geschlossenen Status
            }
            
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

            // 3. Generate initial navigation URL
            const initialMapService = localStorage.getItem('mapService') || 'google';
            const navUrl = getNavigationUrl(initialMapService, location.loc.lat, location.loc.long);

            // 4. Gib den fertigen HTML-String zurück.
            return `
              <h3 id="style">${location.style || ''}</h3>
              <a id="titleurl" href="${linkUrl}" target="_blank">
                <h3 class="${nameClass}">${statusIconHtml}${location.name || 'Unnamed Space'}</h3><br><br>
              </a>
              <div class="popup-street-line">
                ${streetName} ${streetNumber}<span id="streetext">${streetExt}</span>
                <a href="${navUrl}" target="_blank" class="navigation-icon" title="&#013;   L:  ⤴️   Route to this makerspace   &#013;&#013;   R:  🔀   OSM / Google / Apple Maps   &#013;">
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
              updateNavigationIconAppearance(navLink, location);

              // Linksklick startet die Standortabfrage
              navLink.addEventListener('click', (event) => {
                handleNavigationClick(event, location, navLink);
              });

              // Rechtsklick schaltet den Dienst um
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