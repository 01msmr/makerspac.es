// map.js (Updated with improved connection lines and styling)

window.addEventListener("keydown", (e) => {
  if (e.code === 'F3' || ((e.ctrlKey || e.metaKey) && e.code === 'KeyF')) {
    e.preventDefault();
    const search = document.querySelector('#search-bar')
    search.focus()
    search.select() // Markiert den gesamten Text, sodass er überschrieben werden kann
  }
})

document.addEventListener('DOMContentLoaded', () => {
  let map;
  let allMarkers = [];
  let json = [];
  let zoomDebounceTimeout;
  let connectionLine = null;

  const defaultIcon = new L.Icon.Default();
  const highlightIcon = new L.Icon({
    iconUrl: 'https://cdn.rawgit.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png',
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
    iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34], shadowSize: [41, 41]
  });

  const hoverIcon = new L.Icon({
    iconUrl: 'https://cdn.rawgit.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-black.png',
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
    iconSize: [37.5, 61.5],
    iconAnchor: [18.75, 61.5],
    popupAnchor: [1.5, -51],
    shadowSize: [61.5, 61.5]
  });

  // Einfache Linien-Entfernung
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

  // Verbesserte Bézier-Kurve mit zusätzlichen Kontrollpunkten
  function createConnectionLine(suggestionItem, targetMarker) {
    // Entferne alte Linie
    removeConnectionLine();

    const numberCircle = suggestionItem.querySelector('.item-number');
    if (!numberCircle) return;

    const suggestionRect = suggestionItem.getBoundingClientRect();
    const mapContainer = document.getElementById('map');
    const mapRect = mapContainer.getBoundingClientRect();

    // Punkt 1: Anfang des SVG-Pfads (ursprünglich bei 60px Überstand)
    const connectionEndX = suggestionRect.left - 60 - mapRect.left;
    const connectionEndY = suggestionRect.top + (suggestionRect.height / 2) - mapRect.top;
    const startLatLng = map.containerPointToLatLng([connectionEndX, connectionEndY]);

    // Punkt: Marker Position (Pin)
    const endLatLng = targetMarker.getLatLng();
    const markerPixel = map.latLngToContainerPoint(endLatLng);

    // Erstelle komplexere Bézier-Kurve mit mehreren Kontrollpunkten
    const curvePoints = [];
    const steps = 100;

    // Kontrollpunkte definieren
    const controlPoints = [];

    // Erster Kontrollpunkt: 60px links vom Startpunkt (falls Pin rechts liegt) - halbiert von 120px
    if (markerPixel.x > connectionEndX) {
      const leftControlX = connectionEndX - 60;
      const leftControlY = connectionEndY;
      const leftControlLatLng = map.containerPointToLatLng([leftControlX, leftControlY]);
      controlPoints.push(leftControlLatLng);
    }

    // Hauptkontrollpunkt: X wie PIN, Y wie Verbindungsende
    const mainControlX = markerPixel.x;
    const mainControlY = connectionEndY;
    const mainControlLatLng = map.containerPointToLatLng([mainControlX, mainControlY]);
    controlPoints.push(mainControlLatLng);

    // Zusätzlicher Kontrollpunkt vor dem Pin (80px rechts vom Pin bei deutlichem Höhenunterschied)
    const heightDifference = Math.abs(markerPixel.y - connectionEndY);
    if (heightDifference > 100) { // Nur bei deutlichem Höhenunterschied
      const preMarkerControlX = markerPixel.x + 80;
      const preMarkerControlY = markerPixel.y;
      const preMarkerControlLatLng = map.containerPointToLatLng([preMarkerControlX, preMarkerControlY]);
      controlPoints.push(preMarkerControlLatLng);
    }

    // Erstelle Kurve basierend auf Anzahl der Kontrollpunkte
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
    }

    // Erstelle Linie
    connectionLine = L.polyline(curvePoints, {
      color: '#000000',
      weight: 5.5,
      opacity: 1,
      interactive: false,
      bubblingMouseEvents: false,
      smoothFactor: 0,
      noClip: true
    }).addTo(map);

    connectionLine.bringToFront();
    console.log('Enhanced connection line created with', controlPoints.length, 'control points');
  }

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
    const osmUrl = 'https://api.maptiler.com/maps/streets-v2/{z}/{x}/{y}.png?key=FWYhsr9NFS0ukx1nyaXp';
    const osmAttrib = '\u003ca href=\"https://www.maptiler.com/copyright/\" target=\"_blank\"\u003e\u0026copy; MapTiler\u003c/a\u003e \u003ca href=\"https://www.openstreetmap.org/copyright\" target=\"_blank\"\u003e\u0026copy; OpenStreetMap contributors\u003c/a\u003e';
    const osmLayer = new L.TileLayer(osmUrl, {
      minZoom: 2, maxZoom: 19, tileSize: 512,
      zoomOffset: -1, attribution: osmAttrib
    });
    map.setView(new L.LatLng(51.0122995, 10.3995537), 7);
    map.addLayer(osmLayer);
  }

  async function loadData() {
    try {
      const response = await fetch("./locations.json");
      if (!response.ok) throw new Error(`Network response was not ok: ${response.statusText}`);
      json = await response.json();

      json.forEach((location, index) => {
        if (location.loc && typeof location.loc.lat === 'number' && typeof location.loc.long === 'number') {
          location.uniqueId = 'loc-' + index;
          const marker = L.marker([location.loc.lat, location.loc.long], { icon: defaultIcon }).addTo(map);
          marker.uniqueId = location.uniqueId;
          marker.bindPopup(`<h3 id="style">${location.style}</h3><a id="titleurl" href="${location.link.url}" target="_blank"><h3>${location.name}</h3><br><br></a>${location.loc.street.name} ${location.loc.street.number}<span id="streetext">${location.loc.street.ext}</span><br><b>${zfill(location.loc.plz, location.loc.country)} ${location.loc.city}</b><br>${location.loc.country}<br><a id="url" href="${location.link.url}" target="_blank"><b>${location.link.text}</b></a>`);
          allMarkers.push(marker);
        }
      });
    } catch (error) {
      console.error("Error fetching or parsing locations.json:", error);
      alert("Failed to load location pins.");
    }
  }

  // Zentrale Suchfunktion - ausgelagert für bessere Wartbarkeit
  function performSearch() {
    const searchBar = document.getElementById('search-bar');
    const suggestionsDropdown = document.getElementById('suggestions-dropdown');

    clearTimeout(zoomDebounceTimeout);
    const searchQuery = searchBar.value.toLowerCase();
    suggestionsDropdown.innerHTML = '';
    removeConnectionLine();

    if (searchQuery.length < 1) {
      suggestionsDropdown.classList.remove('is-active');
      searchBar.classList.remove('has-suggestions');
      allMarkers.forEach(marker => marker.setIcon(defaultIcon));
      return;
    }

    const filteredLocations = json.filter(location =>
      location.name.toLowerCase().includes(searchQuery) ||
      zfill(location.loc.plz, location.loc.country).startsWith(searchQuery) ||
      location.loc.city.toLowerCase().includes(searchQuery)
    );

    const filteredIds = new Set(filteredLocations.map(loc => loc.uniqueId));
    allMarkers.forEach(marker => {
      marker.setIcon(filteredIds.has(marker.uniqueId) ? highlightIcon : defaultIcon);
    });

    if (filteredLocations.length > 0) {
      suggestionsDropdown.classList.add('is-active');
      searchBar.classList.add('has-suggestions');

      filteredLocations.forEach((location, index) => {
        const item = document.createElement('div');
        item.classList.add('suggestion-item');

        const numberCircle = document.createElement('div');
        numberCircle.classList.add('item-number');
        numberCircle.textContent = (index + 1).toString();

        const contentDiv = document.createElement('div');
        contentDiv.classList.add('item-content');
        contentDiv.innerHTML = `<div class="item-name">${location.name}</div><div class="item-details">${location.loc.street.name} ${location.loc.street.number} ${location.loc.street.ext}</div><div class="item-details"><b>${zfill(location.loc.plz, location.loc.country)}</b> ${location.loc.city}</div>`;

        item.appendChild(numberCircle);
        item.appendChild(contentDiv);

        item.addEventListener('mouseenter', () => {
          // Berechne korrekte Position und Höhe des gehoverten Elements
          const itemRect = item.getBoundingClientRect();
          const itemHeight = itemRect.height;

          // Erstelle SVG-Element mit ursprünglicher Breite (60px) und 20px Überstand
          const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
          svg.id = 'current-connector';
          svg.style.cssText = `
            position: fixed !important;
            left: ${itemRect.left - 60}px !important;
            top: ${itemRect.top}px !important;
            width: 80px !important;
            height: ${itemHeight}px !important;
            z-index: 999 !important;
            pointer-events: none !important;
          `;

          // ViewBox: ursprüngliche 52 Einheiten für 60px breiten Teil, plus 20px rechteckige Erweiterung
          svg.setAttribute('viewBox', '169 259 72 71');
          svg.setAttribute('preserveAspectRatio', 'none');

          // Ursprünglicher Pfad mit 20px rechteckiger Erweiterung
          const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
          path.setAttribute('d', 'm169.14,297.303L169.505,297.303C179.656,296.897 190.964,304.015 194.988,313.343C199.01,322.661 210.299,329.776 220.44,329.383L220.44,329.383L240.44,329.383L240.44,259.286L220.44,259.286L220.44,259.286C210.299,258.893 199.01,266.008 194.988,275.326C190.964,284.654 179.656,291.772 169.505,291.366L169.14,291.366L169.14,297.303Z');
          path.setAttribute('fill', 'black');
          path.setAttribute('opacity', '1');

          svg.appendChild(path);
          document.body.appendChild(svg);

          console.log('New SVG callout created with height:', itemHeight);

          const targetMarker = allMarkers.find(m => m.uniqueId === location.uniqueId);
          if (targetMarker) {
            targetMarker.setIcon(hoverIcon);
            createConnectionLine(item, targetMarker);
          }
        });

        item.addEventListener('mouseleave', () => {
          // Entferne SVG-Element
          const svg = document.getElementById('current-connector');
          if (svg) {
            document.body.removeChild(svg);
            console.log('SVG callout removed');
          }

          const targetMarker = allMarkers.find(m => m.uniqueId === location.uniqueId);
          if (targetMarker) {
            targetMarker.setIcon(highlightIcon);
          }
          removeConnectionLine();
        });

        item.addEventListener('click', () => {
          map.flyTo([location.loc.lat, location.loc.long], 15);
          const targetMarker = allMarkers.find(m => m.uniqueId === location.uniqueId);
          if (targetMarker) targetMarker.openPopup();
          searchBar.value = location.name;
          suggestionsDropdown.classList.remove('is-active');
          searchBar.classList.remove('has-suggestions');
          removeConnectionLine();
        });

        suggestionsDropdown.appendChild(item);
      });
    } else {
      suggestionsDropdown.classList.remove('is-active');
      searchBar.classList.remove('has-suggestions');
    }

    if (filteredLocations.length > 0) {
      zoomDebounceTimeout = setTimeout(() => {
        const markersToZoom = filteredLocations.map(loc => allMarkers.find(m => m.uniqueId === loc.uniqueId)).filter(Boolean);

        suggestionsDropdown.classList.add('is-zooming');
        removeConnectionLine();

        let zoomPromise;
        if (markersToZoom.length > 1) {
          zoomPromise = new Promise(resolve => {
            let zoomEnded = false;
            let moveEnded = false;

            const checkComplete = () => {
              if (zoomEnded && moveEnded) resolve();
            };

            map.once('zoomend', () => { zoomEnded = true; checkComplete(); });
            map.once('moveend', () => { moveEnded = true; checkComplete(); });

            map.flyToBounds(L.featureGroup(markersToZoom).getBounds().pad(0.2));
          });
        } else if (markersToZoom.length === 1) {
          zoomPromise = new Promise(resolve => {
            let zoomEnded = false;
            let moveEnded = false;

            const checkComplete = () => {
              if (zoomEnded && moveEnded) resolve();
            };

            map.once('zoomend', () => { zoomEnded = true; checkComplete(); });
            map.once('moveend', () => { moveEnded = true; checkComplete(); });

            map.flyTo(markersToZoom[0].getLatLng(), 13);
          });
        }

        if (zoomPromise) {
          zoomPromise.then(() => {
            suggestionsDropdown.classList.remove('is-zooming');
          });
        } else {
          suggestionsDropdown.classList.remove('is-zooming');
        }
      }, 1000);
    }
  }

  function setupSearch() {
    const searchBar = document.getElementById('search-bar');
    const suggestionsDropdown = document.getElementById('suggestions-dropdown');

    // Focus auf Suchfeld beim Laden der Website
    searchBar.focus();

    // Keyup-Event führt die Suche aus
    searchBar.addEventListener('keyup', performSearch);

    // Event-Listener für erneuten Focus (führt Suche mit aktuellem Inhalt aus)
    searchBar.addEventListener('focus', () => {
      if (searchBar.value.trim().length > 0) {
        performSearch();
      }
    });

    document.addEventListener('click', (e) => {
      if (!e.target.closest('.search-container')) {
        suggestionsDropdown.classList.remove('is-active');
        searchBar.classList.remove('has-suggestions');
        removeConnectionLine();
      }
    });

    map.on('zoomstart movestart', () => {
      removeConnectionLine();
    });
  }

  function zfill(plz, country) {
    const expectedLengths = { Germany: 5, Austria: 4, Switzerland: 4, Poland: 5, USA: 5, Italy: 5, Spain: 5, France: 5, Luxemburg: 4, Netherlands: 4 };
    let plzStr = String(plz);
    let expectedLength = expectedLengths[country] || plzStr.length;
    return plzStr.padStart(expectedLength, "0");
  }

  initializeApp();
});