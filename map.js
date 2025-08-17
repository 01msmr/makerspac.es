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
  let json = [];
  let connectionLine = null;
  let searchManager;

  // Icons
  const defaultIcon = new L.Icon.Default();
  const highlightIcon = new L.Icon({
    iconUrl: 'https://cdn.rawgit.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-orange.png',
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
    shadowSize: [41, 41]
  });

  const hoverIcon = new L.Icon({
    iconUrl: 'data:image/svg+xml;base64,' + btoa(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 25 41">
  <path fill="#0000ff" stroke="#000" stroke-width="1" d="M12.5,1 C6.16,1 1,6.16 1,12.5 C1,20.88 12.5,39 12.5,39 C12.5,39 24,20.88 24,12.5 C24,6.16 18.84,1 12.5,1 Z"/>
  <circle fill="#fff" cx="12.5" cy="12.5" r="3"/>
</svg>`),
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
    iconSize: [37.5, 61.5],
    iconAnchor: [18.75, 61.5],
    popupAnchor: [1.5, -51],
    shadowSize: [61.5, 61.5]
  });

  // Map Utils für Search Manager
  window.mapUtils = {
    createConnectionLine: createConnectionLine,
    removeConnectionLine: removeConnectionLine
  };

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

  function createConnectionLine(suggestionItem, targetMarker) {
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
      color: 'blue',
      weight: 5.5,
      opacity: 1,
      interactive: false,
      bubblingMouseEvents: false,
      smoothFactor: 0,
      noClip: true
    }).addTo(map);

    connectionLine.bringToFront();
    console.log('Enhanced connection line created with', controlPoints.length, 'control points');

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
        osmUrl = 'https://api.maptiler.com/maps/streets-v2-dark/{z}/{x}/{y}.png?key=FWYhsr9NFS0ukx1nyaXp';
        osmAttrib = '\u003ca href=\"https://www.maptiler.com/copyright/\" target=\"_blank\"\u003e\u0026copy; MapTiler\u003c/a\u003e \u003ca href=\"https://www.openstreetmap.org/copyright\" target=\"_blank\"\u003e\u0026copy; OpenStreetMap contributors\u003c/a\u003e';
      } else {
        // Light Mode Karte (Standard)
        osmUrl = 'https://api.maptiler.com/maps/streets-v2/{z}/{x}/{y}.png?key=FWYhsr9NFS0ukx1nyaXp';
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

      json.forEach((location, index) => {
        if (location.loc && typeof location.loc.lat === 'number' && typeof location.loc.long === 'number') {
          location.uniqueId = 'loc-' + index;
          const marker = L.marker([location.loc.lat, location.loc.long], {
            icon: defaultIcon, opacity: 0.66
          }).addTo(map);

          marker.uniqueId = location.uniqueId;
          marker.bindPopup(`<h3 id="style">${location.style}</h3><a id="titleurl" href="${location.link.url}" target="_blank"><h3>${location.name}</h3><br><br></a>${location.loc.street.name} ${location.loc.street.number}<span id="streetext">${location.loc.street.ext}</span><br><b>${zfill(location.loc.plz, location.loc.country)} ${location.loc.city}</b><br>${location.loc.country}<br><a id="url" href="${location.link.url}" target="_blank"><b>${location.link.text}</b></a>`);

          // Popup events für Logo-Transparenz
          marker.on('popupopen', () => {
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
          });

          marker.on('popupclose', () => {
            document.querySelector('.title').classList.remove('popup-active');
          });

          // *** NEU: Hover-Event für Pins mit verzögertem Popup ***
          let hoverTimeout = null;

          marker.on('mouseover', () => {
            marker.setIcon(hoverIcon); // Sofort Icon wechseln

            // Popup nach 0.3s öffnen (nach Pin-Animation)
            hoverTimeout = setTimeout(() => {
              marker.openPopup();
            }, 300);
          });

          // Mouseleave-Event für Pins  
          marker.on('mouseout', () => {
            // Timeout abbrechen falls Pin verlassen wird
            if (hoverTimeout) {
              clearTimeout(hoverTimeout);
              hoverTimeout = null;
            }

            marker.closePopup(); // Popup sofort schließen

            // Überprüfen, ob es noch Teil der gefilterten Ergebnisse ist
            const searchQuery = document.querySelector('#search-bar').value.trim().toLowerCase();
            if (searchQuery.length > 0) {
              const filteredLocations = json.filter(loc =>
                loc.name.toLowerCase().includes(searchQuery) ||
                zfill(loc.loc.plz, loc.loc.country).startsWith(searchQuery) ||
                loc.loc.city.toLowerCase().includes(searchQuery)
              );
              if (filteredLocations.some(loc => loc.uniqueId === location.uniqueId)) {
                marker.setIcon(highlightIcon); // Zurück zum orange highlightIcon
              } else {
                marker.setIcon(defaultIcon); // Zurück zum Standard-Icon
              }
            } else {
              marker.setIcon(defaultIcon); // Zurück zum Standard-Icon
            }
          });

          allMarkers.push(marker);
        }
      });
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

    // Initialisiere den SearchManager
    const icons = { defaultIcon, highlightIcon, hoverIcon };
    searchManager = new SearchManager(map, allMarkers, json, icons, zfill);

    // Mache SearchManager global verfügbar für Debugging
    window.searchManager = searchManager;

    console.log('SearchManager initialized successfully');

  }

  // Starte die App
  initializeApp();
});