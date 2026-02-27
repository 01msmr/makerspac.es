// map.js - Finale Anti-Flacker Version mit ID-basiertem State Management und Navigation

import { RoutingManager } from './routing.js';

window.addEventListener("keydown", (e) => {
  if (e.code === 'F3' || ((e.ctrlKey || e.metaKey) && e.code === 'KeyF')) {
    e.preventDefault();
    const search = document.querySelector('#search-bar')
    search.focus()
    search.select()
  }
})

// ✅ OPTIMIERUNG: Globale Indizes für schnellen ID-Zugriff
window.locationById = new Map();
window.markerById = new Map();

// *** Modul-Scope Start ***

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

// ZENTRALISIERTER MARKER-STATE MANAGEMENT
window.markerStateManager = {
  states: new Map(),

  setState(locationId, state) {
    this.states.set(locationId, { ...this.getState(locationId), ...state });
  },

  getState(locationId) {
    return this.states.get(locationId) || {
      isHovering: false,
      isDropdownHovering: false,
      isScaling: false,
      currentScale: 1,
      hoverTimeout: null,
      stickyTimeout: null,
      closeTimeout: null,
      debounceTimeout: null
    };
  },

  isAnyHoverActive(locationId) {
    const state = this.getState(locationId);
    return state.isHovering || state.isDropdownHovering;
  },

  clearTimeouts(locationId) {
    const state = this.getState(locationId);
    if (state.hoverTimeout) {
      clearTimeout(state.hoverTimeout);
      state.hoverTimeout = null;
    }
    if (state.stickyTimeout) {
      clearTimeout(state.stickyTimeout);
      state.stickyTimeout = null;
    }
    if (state.closeTimeout) {
      clearTimeout(state.closeTimeout);
      state.closeTimeout = null;
    }
    if (state.debounceTimeout) {
      clearTimeout(state.debounceTimeout);
      state.debounceTimeout = null;
    }
    this.setState(locationId, state);
  }
};

// ✅ REFACTORED: Icons über icons-Namespace (Lazy Loading)
const icons = {
  get defaultIcon() { return window.MapIcons.icons.defaultIcon; },
  get highlightIcon() { return window.MapIcons.icons.highlightIcon; },
  get hoverIcon() { return window.MapIcons.icons.hoverIcon; },
  get redIcon() { return window.MapIcons.icons.redIcon; },
  get greenIcon() { return window.MapIcons.icons.greenIcon; },
  get unknownStatusIcon() { return window.MapIcons.icons.unknownStatusIcon; }
};


// Helper-Funktion, die den Zustand direkt aus der Modul-Variable liest
function isClusteringCurrentlyEnabled() {
  return clusteringEnabled;
}

// Globaler Status-Flag
let clusteringEnabled = true;

// ----------------------------------------------------
// Clustering Ein-/Ausschalten Logik
// ----------------------------------------------------

function toggleClustering(enable) {
  if (enable === clusteringEnabled) return;

  clusteringEnabled = enable;

  // 1. ClusterGroup komplett leeren
  clusterGroup.clearLayers();

  // 2. Layer-Container togglen
  if (enable) {
    if (!map.hasLayer(clusterGroup)) map.addLayer(clusterGroup);
  } else {
    if (map.hasLayer(clusterGroup)) map.removeLayer(clusterGroup);
  }

  // ✅ WICHTIG: Blockiere Auto-Zoom beim Clustering-Toggle IMMER!
  if (window.searchManager) {
    window.searchManager._manualSpaceClick = true;
  }

  // 3. Filter-Kette neu starten
  if (window.searchManager && typeof window.searchManager.applyPillFilters === 'function') {
    const pills = window.searchManager.pillsManager.getPillsArray();
    setTimeout(() => {
      window.searchManager.applyPillFilters(pills);

      // ✅ Reset Flag nach Filter-Anwendung
      setTimeout(() => {
        if (window.searchManager) {
          window.searchManager._manualSpaceClick = false;
        }
      }, 100);
    }, 50);
  }
}

let clusterGroup = null;

// Map Utils für Search Manager
window.mapUtils = {
  createConnectionLine: createConnectionLine,
  removeConnectionLine: removeConnectionLine,
  clearStickyPopup: clearStickyPopup,
  setStickyPopup: setStickyPopup,
  isStickyMarker: (marker) => currentStickyMarker === marker && isPopupSticky,
  setMarkerDropdownHover: setMarkerDropdownHover,
  clearMarkerDropdownHover: clearMarkerDropdownHover,
  updateMarkerIcon: updateMarkerIcon,
  toggleClustering: toggleClustering,
  isClusteringEnabled: isClusteringCurrentlyEnabled
};

// Map für Style-Übersetzungen
const styleTranslationMap = {
  'for all': 'style.forAll',
  'for students': 'style.forStudents',
  'for youth': 'style.forYouth',
  'for students & youth': 'style.forStudents',
  'commercial': 'style.commercial'
};

// +++ START: NAVIGATION LINK FUNCTIONS +++
function updateNavigationIconAppearance(navLinkElement, location) {
  const icon = navLinkElement.querySelector('i');
  const parentContainer = navLinkElement.parentElement;
  if (!icon || !parentContainer) return;

  const serviceToUse = window.consent.get('mapService') || 'default';
  navLinkElement.setAttribute('data-service', serviceToUse);

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

  const colorMap = {
    'status-open': 'var(--space-open)',
    'status-closed': 'var(--space-closed)',
    'status-unknown': 'var(--space-unknown)',
    'status-default': 'var(--space-hover)'
  };
  const popupRoot = navLinkElement.closest('.leaflet-popup-content')?.firstElementChild;
  if (popupRoot) {
    popupRoot.style.setProperty('--status-color', colorMap[statusClass] || 'var(--space-hover)');
  }
}

function handleNavigationClick(event, location) {
  event.preventDefault();
  const { lat, long } = location.loc;
  if (typeof lat !== 'number' || typeof long !== 'number') return;

  const serviceToUse = window.consent.get('mapService') || 'google';
  openMap(serviceToUse, lat, long);
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
    url = `https://www.google.com/maps/dir/?api=1&destination=${lat},${long}`;
  }
  window.open(url, '_blank');
}
// +++ END: NAVIGATION LINK FUNCTIONS +++

// DROPDOWN HOVER MANAGEMENT
function setMarkerDropdownHover(marker, isHovering) {
  const state = window.markerStateManager.getState(marker.locationId);
  window.markerStateManager.setState(marker.locationId, { isDropdownHovering: isHovering });

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
    }
    connectionLine = null;
  }
}

// ✅ REFACTORED: Nutze MapIcons.colors für Default-Farbe
function createConnectionLine(suggestionItem, targetMarker, color = null, weight = 6) {
  // Wenn keine Farbe übergeben, nutze HOVER-Farbe (Dark Mode aware)
  if (!color) {
    const isDarkMode = window.matchMedia &&
      window.matchMedia('(prefers-color-scheme: dark)').matches;
    color = isDarkMode ? window.MapIcons.colors.HOVER_DARK : window.MapIcons.colors.HOVER_LIGHT;
  }

  removeConnectionLine();

  const suggestionRect = suggestionItem.getBoundingClientRect();
  const mapContainer = document.getElementById('map');
  const mapRect = mapContainer.getBoundingClientRect();

  const connectionEndX = suggestionRect.left + window.AppConfig.connectorOffsetLeft - mapRect.left;
  const connectionEndY = suggestionRect.top + 0.4 + (suggestionRect.height / 2) - mapRect.top;
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
    weight: weight,  // ✅ Jetzt konfigurierbar (default: 6, nearby: 5)
    opacity: 1,
    interactive: false,
    bubblingMouseEvents: false,
    smoothFactor: 0.0,
    noClip: true,
  }).addTo(map);


  connectionLine.bringToFront();

  return connectionLine;
}

// ZENTRALISIERTE MARKER SKALIERUNG mit Animation
function applyMarkerScale(marker, targetScale) {
  const state = window.markerStateManager.getState(marker.locationId);

  if (state.currentScale === targetScale || state.isScaling) return;

  window.markerStateManager.setState(marker.locationId, {
    isScaling: true,
    currentScale: targetScale
  });

  if (marker._icon) {
    marker._icon.style.zIndex = targetScale > 1 ? '1000' : '';

    setTimeout(() => {
      window.markerStateManager.setState(marker.locationId, { isScaling: false });
    }, 200);
  }
}

// Helper function zum konsistenten Icon-Update
function updateMarkerIcon(marker, location) {
  const state = window.markerStateManager.getState(marker.locationId);

  if (state.isHovering || state.isDropdownHovering) {
    return;
  }

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

  const hasActiveFilters = window.styleFilterManager &&
    window.styleFilterManager.hasActiveFilters();

  if (searchQuery.length > 0 || hasActiveFilters) {
    const filteredLocations = window.json.filter(loc =>
      loc.name.toLowerCase().includes(searchQuery) ||
      zfill(loc.loc.plz, loc.loc.country).startsWith(searchQuery) ||
      loc.loc.city.toLowerCase().includes(searchQuery)
    );

    if (filteredLocations.some(loc => loc.ID === location.ID)) {
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
    if (location.isOpen === true) {
      marker.setIcon(icons.greenIcon);
    } else if (location.isOpen === false) {
      marker.setIcon(icons.redIcon);
    } else if (location.spaceapi && location.spaceapi.endpoint) {
      marker.setIcon(icons.unknownStatusIcon);
    } else {
      marker.setIcon(icons.defaultIcon);
    }
  }
}

// Helper function
function zfill(plz, country) {
  const expectedLengths = { Germany: 5, Austria: 4, Belgium: 4, Switzerland: 4, Poland: 5, USA: 5, Italy: 5, Spain: 5, France: 5, Luxemburg: 4, Netherlands: 4, Ukraine: 5 };
  let plzStr = String(plz);
  let expectedLength = expectedLengths[country] || plzStr.length;
  return plzStr.padStart(expectedLength, "0");
}
window.zfill = zfill;

// ✅ REFACTORED: Nutze zentrale Funktion aus MapIcons
// ✅ REFACTORED: Nutze zentrale Funktion aus MapIcons
function getCountryCode(countryName) {
  return window.MapIcons.getCountryCode(countryName);
}

// Füge updateMarkerIcon zu mapUtils hinzu
window.mapUtils.updateMarkerIcon = updateMarkerIcon;

// Main initialization
async function initializeApp() {
  try {
    await window.i18n.load('./lang.json');
    setupMap();
    initializeClustering();
    await loadData();

    setupSearch();
    setupStyleFilter();
    setupRouting();
    setupMapClickHandler();
  } catch (error) {
    console.error('⛔ A critical error occurred during app initialization:', error);
    alert('The application could not be started. Please check the developer console.');
  }
}

// GLOBAL: Map und MapLibre Layer
let currentMapLibreLayer = null;

function setupMap() {

  map = new L.Map('map', {
    maxZoom: 18,
    zoomControl: false,
    closePopupOnClick: window.innerWidth > 767, // Mobile: false (verhindert sofortiges Schließen), Desktop: true (Standard)
  });

  window.map = map;

  const darkModeQuery = window.matchMedia('(prefers-color-scheme: dark)');

  function updateMapTiles() {
    let isDarkMode = false;
    const colorScheme = window.consent.get('color-scheme') || 'auto';

    if (colorScheme === 'dark') {
      isDarkMode = true;
    } else if (colorScheme === 'light') {
      isDarkMode = false;
    } else {
      isDarkMode = darkModeQuery.matches;
    }


    const styleUrl = 'https://tiles.openfreemap.org/styles/liberty';

    if (currentMapLibreLayer) {
      map.removeLayer(currentMapLibreLayer);
    }

    try {
      currentMapLibreLayer = L.maplibreGL({
        style: styleUrl,
        attribution: '&copy; <a href="https://openfreemap.org/">OpenFreeMap</a> &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
      });

      currentMapLibreLayer.addTo(map);

      // Suppress benign MapLibre GL tile parsing errors (null values in OpenFreeMap vector tiles)
      const glMap = currentMapLibreLayer.getMaplibreMap();
      if (glMap) {
        glMap.on('error', (e) => {
          if (e.error?.message?.includes('Expected value to be of type number')) return;
          console.warn('MapLibre GL:', e.error?.message || e.error);
        });
      }

      window.currentMapLibreLayer = currentMapLibreLayer;

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

  window.updateMapTiles = updateMapTiles;

  // ✅ FIX: Setze IMMER ein initiales Center/Zoom (verhindert "Set map center first" Fehler)
  // Im Embed-Mode wird das später durch fitBounds() überschrieben
  map.setView(new L.LatLng(51.0122995, 10.3995537), 7);

  updateMapTiles();

  darkModeQuery.addEventListener('change', () => {
    const currentScheme = window.consent.get('color-scheme') || 'auto';
    if (currentScheme === 'auto') {
      updateMapTiles();
    }
  });
}

function initializeClustering() {
  clusterGroup = L.markerClusterGroup({
    maxClusterRadius: function (zoom) {
      if (zoom <= 9) return 50;
      if (zoom <= 11) return 30;
      if (zoom <= 13) return 20;
      return 0;
    },
    disableClusteringAtZoom: 14,
    spiderfyOnMaxZoom: true,
    spiderfyDistanceMultiplier: 2,
    showCoverageOnHover: false,
    zoomToBoundsOnClick: true,
    animate: true,
    animateAddingMarkers: false,
    chunkedLoading: true,
    chunkInterval: 200,
    chunkDelay: 50,
    polygonOptions: {
      // ✅ REFACTORED: Nutze MapIcons.colors (dynamisch für Dark Mode)
      fillColor: window.MapIcons.colors.HOVER_LIGHT,
      color: window.MapIcons.colors.HOVER_LIGHT,
      weight: 3,
      opacity: 0.8,
      fillOpacity: 0.2
    },
    iconCreateFunction: function (cluster) {
      const count = cluster.getChildCount();
      let className;
      let size;

      if (count > 19) {
        className = 'marker-cluster-large';
        size = 48;
      } else if (count > 9) {
        className = 'marker-cluster-medium';
        size = 32;
      } else {
        className = 'marker-cluster-small';
        size = 24;
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
    if (!response.ok) throw new Error(`Network response was not ok: ${response.statusStatus}`);

    const rawData = await response.json();

    window.json = rawData;
    json = window.json;


    // ✅ OPTIMIERUNG: Baue Index für schnellen ID-Zugriff
    const idSet = new Set();
    let issuesFound = 0;

    json.forEach((location, index) => {
      // 1. Prüfe ob ID existiert
      if (typeof location.ID !== 'number') {
        console.error(`❌ Location "${location.name}" (index ${index}) has invalid ID: ${location.ID}`);
        issuesFound++;
        return;
      }

      // 2. Prüfe auf Duplikate
      if (idSet.has(location.ID)) {
        console.error(`❌ DUPLICATE ID ${location.ID} found for "${location.name}" (index ${index})`);
        issuesFound++;
        return;
      }

      // 3. Speichere im globalen Index
      idSet.add(location.ID);
      window.locationById.set(location.ID, location);
    });

    if (issuesFound > 0) {
      console.error(`❌ Found ${issuesFound} ID issues - some locations may not work correctly`);
    } else {
    }

    json.forEach((location, index) => {
      if (location.loc && typeof location.loc.lat === 'number' && typeof location.loc.long === 'number') {
        createMarkerForLocation(location);
      }
    });


    const spaceAPI = new StaticSpaceAPI();
    window.spaceAPI = spaceAPI;


    spaceAPI.onStatusUpdate((location) => {
      updateMarkerIconForLocation(location);
    });

    spaceAPI.enrichLocationData(json).then(() => {
      const openCount = json.filter(loc => loc.isOpen === true).length;
      const closedCount = json.filter(loc => loc.isOpen === false).length;
      const nullCount = json.filter(loc => loc.isOpen === null).length;
      const undefinedCount = json.filter(loc => loc.isOpen === undefined).length;


      if (window.styleFilterManager && typeof window.styleFilterManager.refreshStyleStats === 'function') {
        window.styleFilterManager.refreshStyleStats();
      }

      if (window.routingManager && typeof window.routingManager.rerunRouteHandler === 'function') {
        window.routingManager.rerunRouteHandler();
      } else {
        console.warn('⚠️ RoutingManager not available for re-run.');
      }
    });

  } catch (error) {
    console.error("Error fetching or parsing locations.json:", error);
    alert("Failed to load location pins.");
  }
}

// Positioniert das Popup smart:
// - Horizontal: verschiebt content-wrapper seitlich (Pfeil bleibt am Marker)
//   maxShift = wrapperBreite/2 − borderRadius (Pfeil bleibt auf der flachen Kante)
// - Vertikal: spiegelt das Popup unter den Marker wenn es oben aus dem Screen ragt
//   Nutzt CSS `translate`-Property (unabhängig von Leaflet's `transform`) + CSS-Variable
function adjustPopupPosition(popup, map) {
  const el = popup._container;
  if (!el) return;

  const wrapper = el.querySelector('.leaflet-popup-content-wrapper');
  if (!wrapper) return;

  // Reset
  wrapper.style.transform = '';
  el.classList.remove('popup-flipped');
  el.style.removeProperty('--flip-dy');

  const mapRect = map.getContainer().getBoundingClientRect();
  const popupRect = el.getBoundingClientRect();
  const wrapperRect = wrapper.getBoundingClientRect();
  const br = parseFloat(getComputedStyle(wrapper).borderRadius) || 12;
  // maxShift: Pfeil muss auf der flachen Kante bleiben → wrapperBreite/2 − borderRadius
  const maxShift = wrapperRect.width / 2 - br;
  const pad = 10;

  // Vertikal: Popup über Oberkante → unter den Marker spiegeln
  // CSS `translate` addiert sich zu Leaflet's `transform` (beide Properties wirken unabhängig)
  // flipDy in Screen-Koordinaten: Popup-Oberkante → Marker-Y (Tip zeigt dann nach oben zum Marker)
  const overflowTop = (mapRect.top + pad) - popupRect.top;
  if (overflowTop > 0) {
    const markerContainerPt = map.latLngToContainerPoint(popup.getLatLng());
    const markerScreenY = mapRect.top + markerContainerPt.y;
    const flipDy = markerScreenY - popupRect.top + 15;
    el.style.setProperty('--flip-dy', `${flipDy}px`);
    el.classList.add('popup-flipped');
  }

  // Horizontal: Popup links/rechts aus dem Container
  const overflowL = (mapRect.left + pad) - wrapperRect.left;
  const overflowR = wrapperRect.right - (mapRect.right - pad);

  let shift = 0;
  if (overflowL > 0) {
    shift = Math.min(overflowL, maxShift);
    const extra = overflowL - shift;
    if (extra > 0) map.panBy([-extra, 0], { animate: true, duration: 0.3 });
  } else if (overflowR > 0) {
    shift = -Math.min(overflowR, maxShift);
    const extra = overflowR - Math.abs(shift);
    if (extra > 0) map.panBy([extra, 0], { animate: true, duration: 0.3 });
  }

  if (shift !== 0) wrapper.style.transform = `translateX(${shift}px)`;
}

function createMarkerForLocation(location) {
  const lat = location.loc?.lat;
  const lng = location.loc?.long;

  if (typeof lat !== 'number' || typeof lng !== 'number' || isNaN(lat) || isNaN(lng)) {
    console.warn('⚠️ Invalid coordinates for location:', location.name, 'lat:', lat, 'lng:', lng);
    return null;
  }

  const marker = L.marker([lat, lng], {
    icon: icons.defaultIcon,
    opacity: 0.66
  });

  clusterGroup.addLayer(marker);

  // ✅ OPTIMIERUNG: Verwende location.ID direkt
  marker.locationId = location.ID;

  // ✅ OPTIMIERUNG: Speichere Marker im globalen Index für schnellen Zugriff
  window.markerById.set(location.ID, marker);

  // ✅ NEU: Click-Handler für Auto-Zoom-Prevention
  marker.on('click', () => {
    // ✅ SAUBERE LÖSUNG: Verhindere Auto-Zoom bei Marker-Klick
    if (window.searchManager) {
      window.searchManager._manualSpaceClick = true;
      clearTimeout(window.searchManager.zoomDebounceTimeout);

      // Reset nach 1000ms
      setTimeout(() => {
        window.searchManager._manualSpaceClick = false;
      }, 1000);
    }
    // URL-Update erfolgt automatisch durch popupopen-Event ✅
  });

  marker.bindPopup((layer) => {
    let statusIconHtml = '';
    let nameClass = '';

    let statusColor = 'var(--space-hover)';
    if (location.isOpen === true) {
      statusColor = 'var(--space-open)';
    }
    else if (location.isOpen === false) {
      statusColor = 'var(--space-closed)';
    }
    else if (location.spaceapi && location.spaceapi.endpoint) {
      statusColor = 'var(--space-unknown)';
    }

    const getTooltip = (key) => window.i18n ? window.i18n.t(key) : '';

    if (location.isOpen === true) {
      statusIconHtml = `<span aria-label="${getTooltip('tooltips.spaceOpen')}" role="tooltip" data-microtip-position="bottom"><i class="fas fa-door-open"></i></span> `;
      nameClass = 'space-open';
    }
    else if (location.isOpen === false) {
      statusIconHtml = `<span aria-label="${getTooltip('tooltips.spaceClosed')}" role="tooltip" data-microtip-position="bottom"><i class="fas fa-lock"></i></span> `;
      nameClass = 'space-closed';
    }
    else if (location.spaceapi && location.spaceapi.endpoint) {
      const tipLabel = location.statusMessage || getTooltip('tooltips.spaceStatusLoading');
      const tipPos = location.statusMessage ? 'top-right' : 'bottom';
      statusIconHtml = `<span aria-label="${tipLabel}" role="tooltip" data-microtip-position="${tipPos}"><i class="fas fa-question-circle"></i></span> `;
      nameClass = 'space-unknown';
    }

    // ✅ REFACTORED: Nutze zentrale getStyleIcon Funktion
    let styleIconHtml = '';
    const locationStyle = location.style ? location.style.toLowerCase() : '';
    const styleIconClass = window.MapIcons.getStyleIcon(locationStyle);

    if (styleIconClass) {
      const translatedStyle = window.i18n ? window.i18n.t(styleTranslationMap[locationStyle]) : location.style;
      styleIconHtml = `<span aria-label="${translatedStyle}" role="tooltip" data-microtip-position="top"><i class="${styleIconClass}"></i></span>`;
    }

    const streetName = location.loc?.street?.name || '';
    const streetNumber = location.loc?.street?.number || '';
    const streetExt = location.loc?.street?.ext || '';
    const linkUrl = location.link?.url || '#';
    const linkText = location.link?.text || linkUrl;

    const countryName = location.loc?.country || '';
    const translatedCountry = window.i18n ? window.i18n.t(`countries.${countryName}`) : countryName;

    const bookmarkIcon = window.bookmarkManager ?
      window.bookmarkManager.createBookmarkIcon(location.ID, 'popup-bookmark') :
      '';

    return `
            <div style="--status-color: ${statusColor};">
              <div class="popup-body-grid">
                ${location.workshops && location.workshops.length > 0 ? `<div></div><div class="popup-workshops" aria-label="${window.AppConfig.getWorkshopsTooltip(location.workshops)}" role="tooltip" data-microtip-position="top">${location.workshops.map(w => { const icon = window.AppConfig.getWorkshopIcon(w); return icon ? `<i class="${icon}"></i>` : ''; }).join('')}</div>` : ''}
                <div class="popup-style-cell">${styleIconHtml}</div>
                <div class="popup-title-row">
                  <a id="titleurl" href="${linkUrl}" target="_blank">
                    <h3 class="${nameClass}" data-id="${location.ID}">
                      ${statusIconHtml}${location.name || 'Unnamed Space'}
                    </h3>
                  </a>
                  ${bookmarkIcon}
                </div>
                ${location.weekly && location.weekly.time && location.weekly.weekday <= 6 ? (() => { const _t = (k) => window.i18n ? window.i18n.t(k) : ''; const _isToday = location.weekly.weekday === new Date().getDay(); const _timeStr = String(location.weekly.time).padStart(4, '0').replace(/(\d{2})(\d{2})/, '$1:$2'); const _suf = _t('weekly.timeSuffix'); const _label = _isToday ? _t('weekly.today') : _t('weekdaysShort.' + location.weekly.weekday); return `<div></div><div class="popup-weekly" aria-label="${_t('weekly.tooltip')}" role="tooltip" data-microtip-position="bottom"><i class="fas fa-calendar-day"></i> ${_label} — ${_timeStr}${_suf}</div>`; })() : ''}
              </div>
              <a href="#" class="popup-street-line navigation-icon" aria-label="Route zu ${location.name || ''}" role="tooltip" data-microtip-position="bottom">
                <i></i>
                <div class="popup-address-lines">
                  <div>${streetName} ${streetNumber}<span class="streetext">${streetExt}</span></div>
                  <div>${zfill(location.loc?.plz || '', countryName)} <b>${location.loc?.city || ''}</b></div>
                  <div><span class="fi fi-${getCountryCode(countryName)}"></span> ${translatedCountry}</div>
                </div>
              </a>
              <a id="url" href="${linkUrl}" target="_blank"><b>${linkText}</b></a>
              `;
  }, {
    maxWidth: 440,
    minWidth: 160,
    autoPan: false
  });
  marker.on('popupopen', (e) => {
    // ✅ WICHTIG: _openedByHover VOR dem Clearen prüfen!
    const wasOpenedByHover = marker._openedByHover;

    if (!wasOpenedByHover) {
      // Popup wurde NICHT durch Hover geöffnet → Sofort sticky
      setStickyPopup(marker);

      // Mobile: Entsprechendes Listing-Item im Dropdown als aktiv markieren
      if (window.innerWidth <= 767) {
        const dropdown = document.getElementById('suggestions-dropdown');
        if (dropdown) {
          dropdown.querySelectorAll('.listing-item.active').forEach(el => el.classList.remove('active'));
          const activeItem = dropdown.querySelector(`.listing-item[data-location-id="${location.ID}"]`);
          if (activeItem) {
            activeItem.classList.add('active');
            activeItem.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
          }
        }
      }
    }

    // Jetzt clearen (für nächstes Mal)
    marker._openedByHover = false;

    // ✅ URL setzen wenn Popup STICKY ist
    // Delay damit setStickyPopup() sicher ausgeführt wurde
    setTimeout(() => {
      if (currentStickyMarker === marker && isPopupSticky) {
        // ✅ Popup ist sticky → URL setzen!
        if (window.routingManager && window.routingManager.navigateToLocations) {
          window.routingManager.navigateToLocations([location.ID]);
          marker._hasSetUrl = true;
        }
      }
    }, 50);

    const popup = marker.getPopup();
    const popupElement = popup._container;
    const logoElement = document.querySelector('.title');

    if (popupElement) {
      popupElement.addEventListener('mousedown', (event) => {
        if (!event.target.closest('.leaflet-popup-close-button')) {
          event.stopPropagation();
        }
      });
      popupElement.addEventListener('click', (event) => {
        if (!event.target.closest('.leaflet-popup-close-button')) {
          event.stopPropagation();
        }
      });
      popupElement.addEventListener('dblclick', (event) => {
        event.stopPropagation();
      });
    }

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

    // Pan map if popup overlaps with active search dropdown
    if (popupElement && !wasOpenedByHover) {
      setTimeout(() => {
        const dropdown = document.getElementById('suggestions-dropdown');
        if (!dropdown || !dropdown.classList.contains('is-active')) return;
        const searchContainer = dropdown.closest('.search-container');
        if (!searchContainer) return;
        const popupRect = popupElement.getBoundingClientRect();
        const containerRect = searchContainer.getBoundingClientRect();
        const isOverlapping = !(popupRect.right < containerRect.left ||
          popupRect.left > containerRect.right ||
          popupRect.bottom < containerRect.top ||
          popupRect.top > containerRect.bottom);
        if (isOverlapping) {
          map.panBy([popupRect.right - containerRect.left + 12, 0], { animate: true, duration: 0.3 });
        }
      }, 350);
    }

    if (popupElement) {
      const handlePopupEnter = () => {
        const state = window.markerStateManager.getState(marker.locationId);

        if (state.closeTimeout) {
          clearTimeout(state.closeTimeout);
          window.markerStateManager.setState(marker.locationId, { closeTimeout: null });
        }

        if (currentStickyMarker !== marker) {
          window.markerStateManager.clearTimeouts(marker.locationId);
          setStickyPopup(marker);

          // ✅ NEU: URL setzen nachdem Popup sticky wurde (durch Hover ins Popup)
          if (window.routingManager && window.routingManager.navigateToLocations) {
            window.routingManager.navigateToLocations([location.ID]);
            marker._hasSetUrl = true;
          }
        }
      };

      popupElement.removeEventListener('mouseenter', handlePopupEnter);
      popupElement.addEventListener('mouseenter', handlePopupEnter);

      // ✅ OPTIMALE LÖSUNG: Nutze requestAnimationFrame
      // Wartet auf nächsten Browser-Frame (wenn Popup garantiert gerendert ist)
      requestAnimationFrame(() => {
        if (popupElement.matches(':hover')) {
          // Maus ist bereits im Popup → Trigger handlePopupEnter
          handlePopupEnter();
        }
      });
    }

    requestAnimationFrame(() => adjustPopupPosition(popup, map));

    const navLink = e.popup._container.querySelector('.navigation-icon');
    if (navLink) {
      updateNavigationIconAppearance(navLink, location);
      navLink.addEventListener('click', (event) => {
        handleNavigationClick(event, location);
      });
    }

    if (window.bookmarkManager) {
      const popupContainer = e.popup._container;
      window.bookmarkManager.initializeBookmarkListeners(popupContainer);
    }
  });
  marker.on('popupclose', () => {
    document.querySelector('.title').classList.remove('popup-active');
    // Mobile: Marker zurück in Cluster geben (war temporär direkt auf Map)
    if (marker._isTemporarilyUnclustered) {
      map.removeLayer(marker);
      marker._isTemporarilyUnclustered = false;
    }

    // ✅ URL zurücksetzen wenn dieser Marker sticky war und URL gesetzt hatte
    if (marker._hasSetUrl && currentStickyMarker === marker) {
      if (window.routingManager && window.routingManager.clearLocationURL) {
        window.routingManager.clearLocationURL();
      }
      marker._hasSetUrl = false;
    }

    if (currentStickyMarker === marker) {
      currentStickyMarker = null;
      isPopupSticky = false;
    }
  });
  marker.on('mouseover', (e) => {
    const state = window.markerStateManager.getState(marker.locationId);
    if (state.isHovering) return;

    window.markerStateManager.clearTimeouts(marker.locationId);

    if (currentStickyMarker && currentStickyMarker !== marker) {
      currentStickyMarker.closePopup();
      currentStickyMarker = null;
      isPopupSticky = false;
    }
    allMarkers.forEach(m => {
      if (m !== marker && m.isPopupOpen()) {
        m.closePopup();
      }
    });

    window.markerStateManager.setState(marker.locationId, { isHovering: true });
    applyMarkerScale(marker, 1.15);

    const hoverTimeout = setTimeout(() => {
      const currentState = window.markerStateManager.getState(marker.locationId);
      if (currentState.isHovering && !marker.isPopupOpen()) {
        marker._openedByHover = true;
        marker.openPopup();
      }
    }, 400);

    const stickyTimeout = setTimeout(() => {
      const currentState = window.markerStateManager.getState(marker.locationId);
      if (currentState.isHovering && marker.isPopupOpen()) {
        setStickyPopup(marker);

        // ✅ NEU: URL setzen nachdem Popup sticky wurde
        if (window.routingManager && window.routingManager.navigateToLocations) {
          window.routingManager.navigateToLocations([location.ID]);
          marker._hasSetUrl = true;
        }
      }
    }, 1500);

    window.markerStateManager.setState(marker.locationId, { hoverTimeout, stickyTimeout });
  });
  marker.on('mouseout', (e) => {
    const state = window.markerStateManager.getState(marker.locationId);
    window.markerStateManager.setState(marker.locationId, { isHovering: false });
    window.markerStateManager.clearTimeouts(marker.locationId);

    if (!state.isDropdownHovering) {
      applyMarkerScale(marker, 1);
    }

    const closeCheckTimeout = setTimeout(() => {
      if (marker.isPopupOpen() && (!isPopupSticky || currentStickyMarker !== marker)) {
        marker.closePopup();
      }

      window.markerStateManager.setState(marker.locationId, { closeTimeout: null });

      setTimeout(() => {
        if (!window.markerStateManager.isAnyHoverActive(marker.locationId)) {
          updateMarkerIcon(marker, location);
        }
      }, 50);

    }, 0);

    window.markerStateManager.setState(marker.locationId, { closeTimeout: closeCheckTimeout });
  });
  allMarkers.push(marker);
}
// ============================================================================
// OPTIMIERTE HILFSFUNKTIONEN: Nutzen ID statt find() - O(1) statt O(n)
// ============================================================================
/**
 
Findet Location anhand ID
*/
function getLocationById(id) {
  return window.locationById.get(id);
}

/**
 
Findet Marker anhand Location ID
*/
function getMarkerByLocationId(id) {
  return window.markerById.get(id);
}

/**
 
Aktualisiert Marker-Icon für Location
*/
function updateMarkerIconForLocation(location) {
  const marker = getMarkerByLocationId(location.ID);
  if (!marker) return;

  const state = window.markerStateManager.getState(marker.locationId);
  if (state.isHovering || state.isDropdownHovering) {
    return;
  }
  let newIcon;
  if (location.isOpen === true) {
    newIcon = icons.greenIcon;
  } else if (location.isOpen === false) {
    newIcon = icons.redIcon;
  } else if (location.spaceapi && location.spaceapi.endpoint) {
    newIcon = icons.unknownStatusIcon;
  } else {
    newIcon = icons.highlightIcon;
  }
  marker.setIcon(newIcon);
  if (marker.isPopupOpen()) {
    marker.closePopup();
    marker.openPopup();
  }
}
// Style Filter Setup - wird jetzt von AppMain.init() erledigt
function setupStyleFilter() {
  // ✨ NEU: SearchFilter ersetzt StyleFilterManager
  if (window.styleFilterManager) {
    styleFilterManager = window.styleFilterManager;
    return;
  }

  // Fallback für alte StyleFilterManager (falls noch geladen)
  if (!window.StyleFilterManager) {
    return;
  }
  styleFilterManager = new StyleFilterManager(window.json, allMarkers, icons, searchManager);
  window.styleFilterManager = styleFilterManager;
  if (searchManager) {
    searchManager.setStyleFilterManager(styleFilterManager);
  }
  const openCount = window.json.filter(loc => loc.isOpen === true).length;
  const closedCount = window.json.filter(loc => loc.isOpen === false).length;
  const unknownCount = window.json.filter(loc => loc.isOpen === null || loc.isOpen === undefined).length;
  if (openCount === 0 && closedCount === 0) {
  }
}
function setupSearch() {
  if (!window.mapUtils) {
    console.error('mapUtils not available when setting up search');
    return;
  }

  // ✨ NEU: Verwende AppMain.init() statt altem SearchManager
  if (window.AppMain) {
    window.AppMain.init({
      map,
      json: window.json,
      allMarkers,
      zfill
    });
    // searchManager wird von AppMain.init() gesetzt (Backward Compatibility)
    searchManager = window.searchManager;
  } else {
    console.error('❌ AppMain not available');
  }
}
function clearStickyPopup() {
  if (currentStickyMarker && isPopupSticky) {
    currentStickyMarker.closePopup();
    currentStickyMarker = null;
    isPopupSticky = false;
  }
}
function setStickyPopup(marker) {
  clearStickyPopup();
  currentStickyMarker = marker;
  isPopupSticky = true;
}
function setupMapClickHandler() {
  map.on('click', (e) => {
    if (e.originalEvent && e.originalEvent.target &&
      !e.originalEvent.target.closest('.leaflet-marker-icon') &&
      !e.originalEvent.target.closest('.search-container')) {
      clearStickyPopup();
    }
  });

  // ✅ RECHTSKLICK - Nearby-Popover wird in nearby-header.js gehandhabt
  // Hier nur sticky Popup schließen, KEIN ESC-Cleanup mehr
  map.on('contextmenu', (e) => {
    // Nur wenn NICHT auf Marker geklickt wurde
    if (e.originalEvent && e.originalEvent.target &&
      !e.originalEvent.target.closest('.leaflet-marker-icon')) {
      // Schließe nur sticky Popup - Rest macht nearby-header.js
      clearStickyPopup();
    }
  });
}

function setupRouting() {
  const routingManager = new RoutingManager(
    window.styleFilterManager,
    window.searchManager,
    window.json
  );
  window.routingManager = routingManager;
}
// ============================================================================
// NEUE UTILITY-FUNKTIONEN: ID-basierte Validierung
// ============================================================================
/**
 
Validiert alle IDs in der JSON
*/
window.validateLocationIds = function () {
  const idSet = new Set();
  const issues = [];

  window.json.forEach((location, index) => {
    if (typeof location.ID !== 'number') {
      issues.push({
        type: 'invalid',
        index,
        name: location.name,
        id: location.ID,
        message: `Location "${location.name}" (index ${index}) has invalid ID: ${location.ID}`
      });
      return;
    }
    if (idSet.has(location.ID)) {
      const duplicate = Array.from(window.json).find((loc, i) =>
        i < index && loc.ID === location.ID
      );
      issues.push({
        type: 'duplicate',
        index,
        name: location.name,
        id: location.ID,
        duplicate: duplicate,
        message: `Duplicate ID ${location.ID} - also used by "${duplicate?.name}"`
      });
      return;
    }

    idSet.add(location.ID);
  });
  return {
    valid: issues.length === 0,
    totalLocations: window.json.length,
    uniqueIds: idSet.size,
    issues: issues
  };
};
/**
 
Gibt einen Bericht über alle IDs aus
*/
window.reportLocationIdStatus = function () {

  const validation = window.validateLocationIds();
  if (validation.issues.length > 0) {
    validation.issues.forEach((issue, i) => {
      if (issue.duplicate) {
      }
    });
  } else {
  }
  const ids = window.json.map(loc => loc.ID).filter(id => typeof id === 'number');
  if (ids.length > 0) {
    const sortedIds = [...ids].sort((a, b) => a - b);
    const isSequential = sortedIds.every((id, i) => i === 0 || id === sortedIds[i - 1] + 1);
  }
};
// Hauptinitialisierung
const init = async () => {
  try {
    await window.i18n.load('./lang.json');
    setupMap();
    initializeClustering();
    await loadData();
    setupSearch();
    setupStyleFilter();
    setupRouting();
    setupMapClickHandler();

    // ✅ Nearby Spaces wird von AppMain.init() initialisiert
  } catch (error) {
    console.error('⛔ A critical error occurred during app initialization:', error);
    alert('The application could not be started. Please check the developer console.');
  }
};

init();