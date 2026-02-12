// map.js - Finale Anti-Flacker Version mit ID-basiertem State Management und Navigation

import { RoutingManager } from './routing.js';
console.log('📦 map.js loaded as module');

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
    console.log('✅ Clustering aktiviert.');
  } else {
    if (map.hasLayer(clusterGroup)) map.removeLayer(clusterGroup);
    console.log('❌ Clustering deaktiviert.');
  }

  // ✅ WICHTIG: Blockiere Auto-Zoom beim Clustering-Toggle IMMER!
  if (window.searchManager) {
    console.log('🚫 Clustering-Toggle - Auto-Zoom wird blockiert');
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
          console.log('✅ Auto-Zoom-Blockade aufgehoben');
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

  const savedService = window.consent.get('mapService');
  const mapServiceTimestamp = window.consent.get('mapServiceTimestamp');
  const ninetySixHours = 96 * 60 * 60 * 1000;
  let serviceExpired = !savedService || (mapServiceTimestamp && (Date.now() - parseInt(mapServiceTimestamp, 10)) > ninetySixHours);

  const serviceToUse = serviceExpired ? 'default' : savedService;
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
}

function handleNavigationClick(event, location) {
  event.preventDefault();
  const { lat, long } = location.loc;
  if (typeof lat !== 'number' || typeof long !== 'number') return;

  let mapService = window.consent.get('mapService');
  const mapServiceTimestamp = window.consent.get('mapServiceTimestamp');
  const ninetySixHours = 96 * 60 * 60 * 1000;

  if (mapService && mapServiceTimestamp && (Date.now() - parseInt(mapServiceTimestamp, 10)) > ninetySixHours) {
    window.consent.remove('mapService');
    window.consent.remove('mapServiceTimestamp');
    mapService = null;
  }

  const serviceToUse = mapService || 'google';
  openMap(serviceToUse, lat, long);
}

function handleNavigationRightClick(event, location, navLinkElement) {
  event.preventDefault();

  const savedService = window.consent.get('mapService');
  let nextService;

  if (!savedService || savedService === 'google') {
    nextService = 'apple';
  } else if (savedService === 'apple') {
    nextService = 'osm';
  } else {
    nextService = 'google';
  }

  window.consent.set('mapService', nextService);
  window.consent.set('mapServiceTimestamp', String(Date.now()));

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
      console.log('Error removing line:', e);
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

  console.log('🔍 Connection Line created with weight:', weight);  // DEBUG

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
  console.log('🔧 Starting MapLibre setup...');

  map = new L.Map('map', {
    maxZoom: 18,
    zoomControl: false,
  });
  console.log('✅ Leaflet map created');

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

    console.log('🗺️ Updating map - Dark mode:', isDarkMode, 'Color scheme:', colorScheme);

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

    // ✅ FILTER: Entferne das erste Objekt (TEMPLATE) - enthält die nächste zu verwendende ID
    window.json = rawData.slice(1); // Überspringe Index 0
    json = window.json;

    console.log(`🗑️ Filtered out template (next ID: ${rawData[0]?.ID})`);
    console.log(`📊 Loaded ${json.length} active locations`);

    // ✅ OPTIMIERUNG: Baue Index für schnellen ID-Zugriff
    console.log("🔍 Building location index by ID...");
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
      console.log(`✅ All ${json.length} location IDs validated successfully`);
    }

    console.log("📍 Creating markers immediately...");
    json.forEach((location, index) => {
      if (location.loc && typeof location.loc.lat === 'number' && typeof location.loc.long === 'number') {
        createMarkerForLocation(location);
      }
    });

    console.log("✅ All markers created immediately!");

    const spaceAPI = new StaticSpaceAPI();
    window.spaceAPI = spaceAPI;

    console.log("🔄 Loading fresh SpaceAPI status in background for", json.filter(loc => loc.spaceapi?.endpoint).length, "spaces...");

    spaceAPI.onStatusUpdate((location) => {
      updateMarkerIconForLocation(location);
    });

    spaceAPI.enrichLocationData(json).then(() => {
      const openCount = json.filter(loc => loc.isOpen === true).length;
      const closedCount = json.filter(loc => loc.isOpen === false).length;
      const nullCount = json.filter(loc => loc.isOpen === null).length;
      const undefinedCount = json.filter(loc => loc.isOpen === undefined).length;

      console.log("✅ SpaceAPI status loading complete:");
      console.log(`   - ✅ Open: ${openCount}`);
      console.log(`   - ❌ Closed: ${closedCount}`);
      console.log(`   - ⚠️ Null: ${nullCount}`);
      console.log(`   - ❓ Undefined: ${undefinedCount}`);

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

    let statusColor = 'blue';
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
      statusIconHtml = `<i class="fas fa-door-open" title="${getTooltip('tooltips.spaceOpen')}"></i> `;
      nameClass = 'space-open';
    }
    else if (location.isOpen === false) {
      statusIconHtml = `<i class="fas fa-lock" title="${getTooltip('tooltips.spaceClosed')}"></i> `;
      nameClass = 'space-closed';
    }
    else if (location.spaceapi && location.spaceapi.endpoint) {
      statusIconHtml = `<i class="fas fa-question-circle" title="${getTooltip('tooltips.spaceStatusLoading')}"></i> `;
      nameClass = 'space-unknown';
    }

    // ✅ REFACTORED: Nutze zentrale getStyleIcon Funktion
    let styleIconHtml = '';
    const locationStyle = location.style ? location.style.toLowerCase() : '';
    const styleIconClass = window.MapIcons.getStyleIcon(locationStyle);

    if (styleIconClass) {
      const translatedStyle = window.i18n ? window.i18n.t(styleTranslationMap[locationStyle]) : location.style;
      styleIconHtml = `<i class="${styleIconClass}" title="${translatedStyle}"></i> `;
    }

    const streetName = location.loc?.street?.name || '';
    const streetNumber = location.loc?.street?.number || '';
    const streetExt = location.loc?.street?.ext || '';
    const linkUrl = location.link?.url || '#';
    const linkText = location.link?.text || linkUrl;

    const countryName = location.loc?.country || '';
    const translatedCountry = window.i18n ? window.i18n.t(`countries.${countryName}`) : countryName;

    const styleLabel = locationStyle && styleTranslationMap[locationStyle] ?
      (window.i18n ? window.i18n.t(styleTranslationMap[locationStyle]) : location.style) :
      (location.style || '');

    const bookmarkIcon = window.bookmarkManager ?
      window.bookmarkManager.createBookmarkIcon(location.ID, 'popup-bookmark') :
      '';

    return `
            <div style="--status-color: ${statusColor};">
              <h3 id="style">${styleIconHtml}${styleLabel}</h3>
              <div style="display: flex; align-items: center; gap: 8px;">
                <a id="titleurl" href="${linkUrl}" target="_blank">
                  <h3 class="${nameClass}" data-id="${location.ID}">
                    ${statusIconHtml}${location.name || 'Unnamed Space'}
                  </h3>
                </a>
                ${bookmarkIcon}
              </div>
              <br><br>
                  <div class="popup-street-line">
                    <span class="street">${streetName} ${streetNumber}<span class="streetext">${streetExt}</span></span>
                    <a href="#" class="navigation-icon" title="${getTooltip('tooltips.routeToMakerspace')}">
                      <i></i>
                    </a>
                  </div>
                  ${zfill(location.loc?.plz || '', countryName)} <b>${location.loc?.city || ''}</span><br>
                    <span class="country"><span class="fi fi-${getCountryCode(countryName)}" style="margin-right: 4px;"></span>${translatedCountry}</span><br>
                      <a id="url" href="${linkUrl}" target="_blank"><b>${linkText}</b></a>
                      `;
  }, {
    maxWidth: 440,
    minWidth: 160,
    autoPanPaddingTopLeft: L.point(50, 50),
    autoPanPaddingBottomRight: L.point(50, 80)
  });
  marker.on('popupopen', (e) => {
    // ✅ WICHTIG: _openedByHover VOR dem Clearen prüfen!
    const wasOpenedByHover = marker._openedByHover;

    if (!wasOpenedByHover) {
      // Popup wurde NICHT durch Hover geöffnet → Sofort sticky
      setStickyPopup(marker);
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

    const navLink = e.popup._container.querySelector('.navigation-icon');
    if (navLink) {
      updateNavigationIconAppearance(navLink, location);
      navLink.addEventListener('click', (event) => {
        handleNavigationClick(event, location);
      });
      navLink.addEventListener('contextmenu', (event) => {
        handleNavigationRightClick(event, location, navLink);
      });
    }

    if (window.bookmarkManager) {
      const popupContainer = e.popup._container;
      window.bookmarkManager.initializeBookmarkListeners(popupContainer);
    }
  });
  marker.on('popupclose', () => {
    document.querySelector('.title').classList.remove('popup-active');

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
    console.log('✅ StyleFilter already initialized by AppMain');
    return;
  }

  // Fallback für alte StyleFilterManager (falls noch geladen)
  if (!window.StyleFilterManager) {
    console.log('ℹ️ StyleFilterManager not needed (using SearchFilter)');
    return;
  }
  styleFilterManager = new StyleFilterManager(window.json, allMarkers, icons, searchManager);
  window.styleFilterManager = styleFilterManager;
  if (searchManager) {
    searchManager.setStyleFilterManager(styleFilterManager);
  }
  console.log('StyleFilterManager initialized successfully');
  const openCount = window.json.filter(loc => loc.isOpen === true).length;
  const closedCount = window.json.filter(loc => loc.isOpen === false).length;
  const unknownCount = window.json.filter(loc => loc.isOpen === null || loc.isOpen === undefined).length;
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
    console.log('✅ AppMain initialized successfully');
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
      !e.originalEvent.target.closest('.leaflet-marker-icon')) {
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

/**
 * ✅ Rest der ESC-Logik (wird nur ausgeführt wenn KEIN nearby-popover)
 */
function executeEscapeLogicRest() {
  if (!window.searchManager) return;

  const searchManager = window.searchManager;

  console.log('🧹 executeEscapeLogicRest: START');

  // Blockiere Auto-Zoom
  searchManager._manualSpaceClick = true;

  // 1. Schließe Filter-Dropdown, falls aktiv
  if (searchManager.styleFilterManager &&
    typeof searchManager.styleFilterManager.isDropdownOpen === 'function' &&
    searchManager.styleFilterManager.isDropdownOpen()) {
    searchManager.styleFilterManager.closeDropdown();
    console.log('   ✅ Filter-Dropdown geschlossen');
  }

  // 2. Leere Pills
  if (searchManager.pillsManager) {
    searchManager.pillsManager.clear();
    console.log('   ✅ Pills geleert');
  }

  // 3. Routing clearen
  if (window.routingManager) {
    window.routingManager._activeCountryFilter = null;
    window.routingManager._isNavigating = true;
    window.location.hash = '';
    console.log('   ✅ Routing geleert');
  }

  // 4. Filter neu anwenden
  searchManager.applyPillFilters([]);
  console.log('   ✅ Filter neu angewendet');

  // 5. Schließe Such-Dropdown
  searchManager.closeDropdown();
  console.log('   ✅ Dropdown geschlossen');

  // Reset Flags
  setTimeout(() => {
    if (window.routingManager) window.routingManager._isNavigating = false;
    searchManager._manualSpaceClick = false;
    console.log('   ✅ Flags zurückgesetzt');
  }, 100);

  console.log('🧹 executeEscapeLogicRest: ENDE');
}

/**
 * ✅ VERALTET - wird nicht mehr verwendet
 * Searchbar-Leerung passiert jetzt direkt im contextmenu Handler
 */
function executeEscapeLogic() {
  executeEscapeLogicRest();
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
  console.log('═══════════════════════════════════════════════════════════');
  console.log('📊 LOCATION ID STATUS REPORT');
  console.log('═══════════════════════════════════════════════════════════');

  const validation = window.validateLocationIds();
  console.log(`Total Locations: ${validation.totalLocations}`);
  console.log(`Valid IDs: ${validation.uniqueIds}`);
  console.log(`Status: ${validation.valid ? '✅ VALID' : '❌ ISSUES FOUND'}`);
  if (validation.issues.length > 0) {
    console.log('\n⚠️ ISSUES FOUND:');
    validation.issues.forEach((issue, i) => {
      console.log(`\n${i + 1}. ${issue.type.toUpperCase()}`);
      console.log(`   Location: "${issue.name}" (index ${issue.index})`);
      console.log(`   ID: ${issue.id}`);
      if (issue.duplicate) {
        console.log(`   Also used by: "${issue.duplicate.name}"`);
      }
    });
  } else {
    console.log('\n✅ No issues found - all IDs are valid and unique!');
  }
  console.log('\n📈 ID STATISTICS:');
  const ids = window.json.map(loc => loc.ID).filter(id => typeof id === 'number');
  if (ids.length > 0) {
    console.log(`   Min ID: ${Math.min(...ids)}`);
    console.log(`   Max ID: ${Math.max(...ids)}`);
    console.log(`   ID Range: ${Math.max(...ids) - Math.min(...ids) + 1}`);
    const sortedIds = [...ids].sort((a, b) => a - b);
    const isSequential = sortedIds.every((id, i) => i === 0 || id === sortedIds[i - 1] + 1);
    console.log(`   Sequential: ${isSequential ? '✅ Yes' : '⚠️ No (gaps exist)'}`);
  }
  console.log('\n═══════════════════════════════════════════════════════════');
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