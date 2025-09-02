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
      icon.className = 'fa-brands fa-google';
    } else if (serviceToUse === 'apple') {
      icon.className = 'fa-brands fa-apple';
    } else { // osm
      icon.className = 'fa-solid fa-map-location-dot';
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
    icon.className = 'fa-solid fa-spinner fa-spin'; // Lade-Spinner anzeigen

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
    let cp1X, cp1Y, cp2X, cp2Y;

    // Fall 1: Ziel ist rechts von der Liste (oder nur leicht links davon).
    // In diesem Fall erzwingen wir eine weiche C-Kurve ohne S-Krümmung.
    if (endX > (startX - 80)) {
      // Wir berechnen einen horizontalen Versatz, der die Kurve bauchiger macht,
      // je größer der vertikale Abstand ist. Das verhindert zu enge Kurven.
      const offsetX = 100 + Math.abs(startY - endY) / 2;

      // Beide Kontrollpunkte werden nach links verschoben, um die C-Form zu erzeugen.
      cp1X = startX - offsetX;
      cp1Y = startY;
      cp2X = endX - offsetX;
      cp2Y = endY;

    }
    // Fall 2: Ziel ist weit links von der Liste.
    // Hier ist eine S-Kurve die eleganteste und direkteste Verbindung.
    else {
      // Der horizontale Versatz wird hier größer, je weiter die Punkte horizontal entfernt sind.
      const offsetX = 100 + Math.abs(startX - endX) / 4;

      // Der erste Kontrollpunkt zieht nach links, der zweite nach rechts. Das erzeugt die S-Form.
      cp1X = startX - offsetX;
      cp1Y = startY;
      cp2X = endX + offsetX; // Beachten Sie das Pluszeichen hier!
      cp2Y = endY;
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

    // Erstelle Bézier-Pfad
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');

    // Wir verwenden jetzt IMMER eine einfache und glatte kubische Bézier-Kurve.
    // Die alte, komplizierte Logik mit "isQuintic" wird entfernt.
    const { cp1X, cp1Y, cp2X, cp2Y } = controlPoints;
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
    console.log('🔧 Starting MapLibre setup...');

    map = new L.Map('map');
    console.log('✅ Leaflet map created');

    const darkModeQuery = window.matchMedia('(prefers-color-scheme: dark)');
    let currentMapLibreLayer = null;

    function updateMapTiles() {
      const isDarkMode = darkModeQuery.matches;
      console.log('Dark mode:', isDarkMode);

      // Immer Liberty Style verwenden
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

        // CSS-Klasse für Dark Mode setzen
        const mapContainer = document.getElementById('map');
        if (isDarkMode) {
          mapContainer.classList.add('dark-mode-map');
        } else {
          mapContainer.classList.remove('dark-mode-map');
        }

      } catch (error) {
        console.error('❌ Error creating MapLibre layer:', error);
        alert('MapLibre konnte nicht geladen werden.');
      }
    }

    map.setView(new L.LatLng(51.0122995, 10.3995537), 7);
    updateMapTiles();

    darkModeQuery.addEventListener('change', updateMapTiles);
  }




  // OPTIONAL: Debug-Funktion zum Testen
  function debugMapLibre() {
    console.log('=== MAPLIBRE DEBUG ===');
    console.log('maplibregl:', typeof maplibregl);
    console.log('L.maplibreGL:', typeof L.maplibreGL);
    console.log('Map container exists:', !!document.getElementById('map'));

    // Teste OpenFreeMap Verbindung
    fetch('https://tiles.openfreemap.org/styles/liberty')
      .then(response => {
        console.log('OpenFreeMap liberty response:', response.status, response.ok);
        return response.json();
      })
      .then(style => {
        console.log('OpenFreeMap style loaded successfully:', !!style.sources);
      })
      .catch(error => {
        console.error('OpenFreeMap connection error:', error);
      });
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
              statusIconHtml = '<i class="fa-solid fa-door-open" title="space is open"></i> ';
              nameClass = 'space-open';
            }
            
            else if (location.isOpen === false) {
              statusIconHtml = '<i class="fa-solid fa-door-closed" title="space is closed"></i> ';
              nameClass = 'space-closed'; // Klasse für geschlossenen Status
            }
            
            else if (location.spaceapi && location.spaceapi.endpoint) {
              statusIconHtml = '<i class="fa-solid fa-circle-question" title="space-status unknown"></i> ';
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
                <a href="${navUrl}" target="_blank" class="navigation-icon" title="&#013;   L:  ⤴️   Route to this makerspace   &#013;&#013;   R:  🔀   OSM / Google / Apple Maps   &#013;   ">
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