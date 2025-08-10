// map.js (Updated with improved connection lines and geographic sorting)

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
    iconUrl: 'https://cdn.rawgit.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-orange.png',
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png', iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34], shadowSize: [41, 41]
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

    const suggestionRect = suggestionItem.getBoundingClientRect();
    const mapContainer = document.getElementById('map');
    const mapRect = mapContainer.getBoundingClientRect();

    // Punkt 1: Anfang des SVG-Pfads (am sichtbaren Radius-Teil des SVG-Objekts)
    const connectionEndX = suggestionRect.left - 50 - mapRect.left;
    const connectionEndY = suggestionRect.top - 0.5 + (suggestionRect.height / 2) - mapRect.top;
    const startLatLng = map.containerPointToLatLng([connectionEndX, connectionEndY]);

    // Punkt: Marker Position (Pin)
    const endLatLng = targetMarker.getLatLng();
    const markerPixel = map.latLngToContainerPoint(endLatLng);

    // Erstelle komplexere Bézier-Kurve mit mehreren Kontrollpunkten
    const curvePoints = [];

    // Berechne die ungefähre Linienlänge für adaptive Punktanzahl
    const deltaX = Math.abs(markerPixel.x - connectionEndX);
    const deltaY = Math.abs(markerPixel.y - connectionEndY);
    const approximateLength = Math.sqrt(deltaX * deltaX + deltaY * deltaY);

    // Adaptive Punktanzahl: mindestens 100, höchstens 400, etwa 1 Punkt pro 1 Pixel
    const steps = Math.max(100, Math.min(400, Math.round(approximateLength)));

    // Kontrollpunkte definieren
    const controlPoints = [];

    // Hauptkontrollpunkt: Angepasst je nach Pin-Position
    let mainControlX, mainControlY;

    if (markerPixel.x > (connectionEndX - 80)) {
      // Pin ist bis zu 80px links vom Startpunkt oder weiter rechts: Zweiter Fall
      // Hauptkontrollpunkt links verschieben für bessere Kurvenführung
      mainControlX = connectionEndX - 60;
      mainControlY = connectionEndY;
    } else {
      // Pin ist mehr als 80px links vom Startpunkt: Erster Fall
      // Hauptkontrollpunkt wie bisher
      mainControlX = markerPixel.x;
      mainControlY = connectionEndY;
    }

    const mainControlLatLng = map.containerPointToLatLng([mainControlX, mainControlY]);
    controlPoints.push(mainControlLatLng);

    // Zusätzlicher Kontrollpunkt auf halber Höhe für zweiten Fall
    if (markerPixel.x > (connectionEndX - 80)) {
      const midHeightControlX = markerPixel.x - 240;
      const midHeightControlY = connectionEndY + (markerPixel.y - connectionEndY) / 2;
      const midHeightControlLatLng = map.containerPointToLatLng([midHeightControlX, midHeightControlY]);
      controlPoints.push(midHeightControlLatLng);
    }

    // KORRIGIERT: Zusätzlicher Kontrollpunkt vor dem Pin - immer hinzufügen wenn horizontaler Abstand > 30px
    const horizontalDistance = Math.abs(markerPixel.x - connectionEndX);
    if (horizontalDistance > 30) { // Reduzierte Schwelle von 100 auf 30px
      let preMarkerControlX;

      if (markerPixel.x > (connectionEndX - 80)) {
        // Zweiter Fall: Kontrollpunkt 80px LINKS vom Pin
        preMarkerControlX = markerPixel.x - 80;
      } else {
        // Erster Fall: Kontrollpunkt 80px RECHTS vom Pin
        preMarkerControlX = markerPixel.x + 80;
      }

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
    } else {
      // Fallback: Einfache gerade Linie bei unerwarteter Anzahl von Kontrollpunkten
      curvePoints.push([startLatLng.lat, startLatLng.lng]);
      curvePoints.push([endLatLng.lat, endLatLng.lng]);
    }

    // Erstelle Linie
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
  }



  // Geografische Sortierungsfunktion
  function sortLocationsByGeography(locations) {
    return locations.sort((a, b) => {
      // Zuerst nach Breitengrad sortieren (höhere Werte = weiter nördlich)
      // Negative Sortierung, da wir von oben nach unten wollen
      const latDiff = b.loc.lat - a.loc.lat;

      // Bei ähnlichen Breitengraden (Unterschied < 0.1°) nach Längengrad sortieren
      if (Math.abs(latDiff) < 0.1) {
        // Von links nach rechts (niedrigere Längenwerte zuerst)
        return a.loc.long - b.loc.long;
      }

      return latDiff;
    });
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
          const marker = L.marker([location.loc.lat, location.loc.long], {
            icon: defaultIcon, opacity: 0.66
          }).addTo(map);
          marker.uniqueId = location.uniqueId;
          marker.bindPopup(`<h3 id="style">${location.style}</h3><a id="titleurl" href="${location.link.url}" target="_blank"><h3>${location.name}</h3><br><br></a>${location.loc.street.name} ${location.loc.street.number}<span id="streetext">${location.loc.street.ext}</span><br><b>${zfill(location.loc.plz, location.loc.country)} ${location.loc.city}</b><br>${location.loc.country}<br><a id="url" href="${location.link.url}" target="_blank"><b>${location.link.text}</b></a>`);

          // HIER den neuen Code einfügen:
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


          // neuen Pin-Hover-Events:
          marker.on('mouseover', () => {
            marker.openPopup();
          });

          // Simuliere den Hover-Effekt im Dropdown, wenn ein Pin gefiltert ist
          const suggestionItems = document.querySelectorAll('.suggestion-item');
          suggestionItems.forEach(item => {
            const itemNumberElement = item.querySelector('.item-number');
            if (itemNumberElement) {
              // Finde das Item durch Vergleich der uniqueId
              const itemContent = item.querySelector('.item-name');
              if (itemContent && itemContent.textContent === location.name) {
                // Simuliere mouseenter Event
                item.style.backgroundColor = 'blue';
                item.style.color = 'white';
                itemNumberElement.style.backgroundColor = 'white';
                itemNumberElement.style.color = 'blue';

                // Erstelle SVG und Linie (gleicher Code wie im mouseenter)
                // ... (den kompletten mouseenter Code hier einfügen)
              }
            }
          });

          // mouseout Event entfernt - Popup bleibt geöffnet

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

    // Entferne alle bestehenden SVG-Objekte bei neuer Suche
    const existingSVG = document.getElementById('current-connector');
    if (existingSVG) {
      if (existingSVG._scrollListener) {
        suggestionsDropdown.removeEventListener('scroll', existingSVG._scrollListener);
        window.removeEventListener('scroll', existingSVG._scrollListener);
      }
      document.body.removeChild(existingSVG);
    }

    if (searchQuery.length < 1) {
      suggestionsDropdown.classList.remove('is-active');
      searchBar.classList.remove('has-suggestions');
      allMarkers.forEach(marker => {
        marker.setIcon(defaultIcon);
        marker.setOpacity(0.66); // Zurück zur Standardsichtbarkeit
      });
      return;
    }

    const filteredLocations = json.filter(location =>
      location.name.toLowerCase().includes(searchQuery) ||
      zfill(location.loc.plz, location.loc.country).startsWith(searchQuery) ||
      location.loc.city.toLowerCase().includes(searchQuery)
    );

    // Geografische Sortierung der gefilterten Ergebnisse
    const sortedFilteredLocations = sortLocationsByGeography(filteredLocations);

    const filteredIds = new Set(sortedFilteredLocations.map(loc => loc.uniqueId));
    allMarkers.forEach(marker => {
      marker.setIcon(filteredIds.has(marker.uniqueId) ? highlightIcon : defaultIcon);
    });

    if (sortedFilteredLocations.length > 0) {
      suggestionsDropdown.classList.add('is-active');
      searchBar.classList.add('has-suggestions');

      // Opacity SOFORT setzen, bevor der Zoom-Timeout startet
      allMarkers.forEach(marker => {
        if (filteredIds.has(marker.uniqueId)) {
          marker.setIcon(highlightIcon);
          marker.setOpacity(1); // Sofort auf volle Sichtbarkeit setzen
        } else {
          marker.setIcon(defaultIcon);
          marker.setOpacity(0.6);
        }
      });

      sortedFilteredLocations.forEach((location) => {
        const item = document.createElement('div');
        item.classList.add('suggestion-item');

        const contentDiv = document.createElement('div');
        contentDiv.classList.add('item-content');
        contentDiv.innerHTML = `<div class="item-name">${location.name}</div><div class="item-details">${location.loc.street.name} ${location.loc.street.number} ${location.loc.street.ext}</div><div class="item-details"><b>${zfill(location.loc.plz, location.loc.country)}</b> ${location.loc.city}</div>`;

        item.appendChild(contentDiv);

        item.addEventListener('mouseenter', () => {

          // Schließe alle offenen Popups von anderen Markern
          allMarkers.forEach(marker => {
            if (marker.isPopupOpen()) {
              marker.closePopup();
            }
          });

          // Berechne korrekte Position und Höhe des gehoverten Elements
          const itemRect = item.getBoundingClientRect();
          const itemHeight = itemRect.height;

          // Erstelle SVG-Element soweit nach rechts verschoben, dass nur der Radius-Teil sichtbar ist
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

          // ViewBox für das neue SVG (angepasst an den bereitgestellten Code)
          svg.setAttribute('viewBox', '65 0 570 620');
          svg.setAttribute('preserveAspectRatio', 'none');

          // Neuer SVG-Pfad
          const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
          path.setAttribute('d', 'M632.86,6.618L436.232,6.618C416.818,6.599 396.254,9.684 376.225,16.429C356.196,23.174 336.703,33.579 319.618,47.041C302.534,60.503 287.858,77.022 276.615,94.918C265.373,112.813 257.563,132.086 253.041,150.966C244.69,186.193 226.089,220.425 195.188,245.142C164.286,269.858 121.084,285.059 70.815,284.779L70.815,336.251C121.084,335.971 164.286,351.172 195.188,375.888C226.089,400.604 244.69,434.836 253.041,470.064C257.563,488.944 265.373,508.216 276.615,526.112C287.858,544.008 302.534,560.527 319.618,573.988C336.703,587.45 356.196,597.856 376.225,604.6C396.254,611.345 416.818,614.43 436.232,614.412L632.86,614.412L632.86,6.618Z');
          path.setAttribute('fill', 'blue');
          path.setAttribute('fill-rule', 'nonzero');
          path.setAttribute('stroke', 'blue');
          path.setAttribute('stroke-width', '0.24px');

          svg.appendChild(path);
          document.body.appendChild(svg);

          // Funktion zum Aktualisieren der SVG-Position beim Scrollen
          const updateSVGPosition = () => {
            const currentItemRect = item.getBoundingClientRect();
            svg.style.left = `${currentItemRect.left - 50}px`;
            svg.style.top = `${currentItemRect.top - 0.5}px`;
            svg.style.height = `${currentItemRect.height}px`;

            // Aktualisiere auch die Verbindungslinie
            const targetMarker = allMarkers.find(m => m.uniqueId === location.uniqueId);
            if (targetMarker) {
              targetMarker.setIcon(hoverIcon);
              targetMarker.setOpacity(1); // Gehoverte Pins: volle Sichtbarkeit
              createConnectionLine(item, targetMarker);
            }
          };

          // Event-Listener für Scroll-Events hinzufügen
          const scrollListener = () => {
            updateSVGPosition();
          };

          // Scroll-Listener sowohl für das Dropdown als auch für das Fenster
          suggestionsDropdown.addEventListener('scroll', scrollListener);
          window.addEventListener('scroll', scrollListener);

          // Speichere den Scroll-Listener am SVG für späteren Cleanup
          svg._scrollListener = scrollListener;

          console.log('New SVG callout created with height:', itemHeight);

          const targetMarker = allMarkers.find(m => m.uniqueId === location.uniqueId);
          if (targetMarker) {
            targetMarker.setIcon(hoverIcon);
            createConnectionLine(item, targetMarker);
          }

          // Timeout für automatisches Popup-Öffnen nach 0.5s
          const popupTimeout = setTimeout(() => {
            const targetMarker = allMarkers.find(m => m.uniqueId === location.uniqueId);
            if (targetMarker) {
              targetMarker.openPopup();
            }
          }, 500);

          // Timeout am SVG speichern für späteren Cleanup
          svg._popupTimeout = popupTimeout;

          console.log('New SVG callout created with height:', itemHeight);

        });

        item.addEventListener('mouseleave', () => {
          // Entferne SVG-Element
          const svg = document.getElementById('current-connector');
          if (svg) {

            // Entferne Popup-Timeout
            if (svg._popupTimeout) {
              clearTimeout(svg._popupTimeout);
            }

            // Entferne Scroll-Listener
            if (svg._scrollListener) {
              suggestionsDropdown.removeEventListener('scroll', svg._scrollListener);
              window.removeEventListener('scroll', svg._scrollListener);
            }
            document.body.removeChild(svg);
            console.log('SVG callout removed');
          }

          const targetMarker = allMarkers.find(m => m.uniqueId === location.uniqueId);
          if (targetMarker) {
            targetMarker.setIcon(highlightIcon);
            targetMarker.setOpacity(1); // Bleibt bei voller Sichtbarkeit (da gefiltert)
          }
          removeConnectionLine();

          // Entferne alle bestehenden SVG-Objekte
          const existingSVG = document.getElementById('current-connector');
          if (existingSVG) {
            if (existingSVG._scrollListener) {
              suggestionsDropdown.removeEventListener('scroll', existingSVG._scrollListener);
              window.removeEventListener('scroll', existingSVG._scrollListener);
            }
            document.body.removeChild(existingSVG);
          }
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

    if (sortedFilteredLocations.length > 0) {
      zoomDebounceTimeout = setTimeout(() => {
        const markersToZoom = sortedFilteredLocations.map(loc => allMarkers.find(m => m.uniqueId === loc.uniqueId)).filter(Boolean);

        suggestionsDropdown.classList.add('is-zooming');
        removeConnectionLine();

        // Entferne auch alle SVG-Objekte beim Zoom
        const existingSVG = document.getElementById('current-connector');
        if (existingSVG) {
          if (existingSVG._scrollListener) {
            suggestionsDropdown.removeEventListener('scroll', existingSVG._scrollListener);
            window.removeEventListener('scroll', existingSVG._scrollListener);
          }
          document.body.removeChild(existingSVG);
        }

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

            // Opacity nach dem Zoom wiederherstellen
            const filteredIds = new Set(sortedFilteredLocations.map(loc => loc.uniqueId));
            allMarkers.forEach(marker => {
              if (filteredIds.has(marker.uniqueId)) {
                marker.setOpacity(1); // Gefilterte Pins: volle Sichtbarkeit
              } else {
                marker.setOpacity(0.6); // Andere Pins: reduzierte Sichtbarkeit
              }
            });
          });
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