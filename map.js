// @ts-check
// map.js - Finale Anti-Flacker Version mit ID-basiertem State Management und Navigation

/** @typedef {import('./types.js').MakerSpace} MakerSpace */
/** @typedef {import('leaflet').Map} LeafletMap */
/** @typedef {import('leaflet').Marker} LeafletMarker */
/** @typedef {import('leaflet').DivIcon} LeafletDivIcon */

import { RoutingManager } from './routing.js';
import AppConfig from './config.js';
import { I18n } from './i18n.js';
import { StaticSpaceAPI } from './spaceapi-static.js';
import { bookmarkManager } from './bookmark-manager.js';
import { BookmarkSync, consent } from './datasync.js';
import { dataStore } from './data-store.js';
import { zoomManager } from './zoom-manager.js';
import { initApp } from './main.js';
import { initEmbedOverlay } from './embed-overlay.js';
import { buildPopupHTML } from './popup-builder.js';
import { appContext } from './app-context.js';
import { errorMonitor } from './error-monitor.js';
errorMonitor.init();

// i18n Singleton (ersetzt i18n-init.js)
const i18n = new I18n();
appContext.i18n = i18n;
window.i18n = i18n; // backward compat

// Backward Compat für embed.js und andere Legacy-Zugriffe
appContext.config = AppConfig;
window.AppConfig = AppConfig; // backward compat

// BookmarkSync (ersetzt Auto-Init in datasync.js)
const bookmarkSync = new BookmarkSync(bookmarkManager);
appContext.bookmarkSync = bookmarkSync;
appContext.bookmarks = bookmarkManager;
appContext.consent = consent;
appContext.dataStore = dataStore;
appContext.zoomManager = zoomManager;
window.bookmarkSync = bookmarkSync; // backward compat
window.consent = consent;           // backward compat
window.dataStore = dataStore;       // backward compat
window.languageSwitcher = dataStore; // backward compat
window.zoomManager = zoomManager;   // backward compat

appContext.ready('services');
initEmbedOverlay();

// Loading overlay — backdrop + two stacked toasts, verschwindet beim ersten filterResultsChanged
{
  const backdrop = document.createElement('div');
  backdrop.className = 'map-backdrop';
  backdrop.style.setProperty('--backdrop-opacity', '0.3');
  backdrop.style.setProperty('--backdrop-duration', '1s');
  backdrop.style.zIndex = '9998';
  document.body.appendChild(backdrop);

  const stack = document.createElement('div');
  stack.className = 'loading-overlay-stack';

  const main = document.createElement('div');
  main.className = 'loading-overlay-toast loading-overlay-toast--large';
  main.innerHTML = '<i class="fas fa-cog fa-spin"></i> Karte wird geladen\u2026';

  const sub = document.createElement('div');
  sub.className = 'loading-overlay-toast';
  sub.textContent = 'Makerspaces werden vorbereitet\u2026';

  stack.append(main, sub);
  document.body.appendChild(stack);
  requestAnimationFrame(() => { backdrop.classList.add('show'); main.classList.add('show'); sub.classList.add('show'); });

  document.addEventListener('filterResultsChanged', () => {
    backdrop.classList.add('fade-out');
    setTimeout(() => backdrop.remove(), 1000);
    main.classList.remove('show'); main.classList.add('zoom-out');
    sub.classList.remove('show');  sub.classList.add('zoom-out');
    setTimeout(() => stack.remove(), 300);
  }, { once: true });
}

window.addEventListener("keydown", (e) => {
  if (e.code === 'F3' || ((e.ctrlKey || e.metaKey) && e.code === 'KeyF')) {
    e.preventDefault();
    const search = document.querySelector('#search-bar')
    search.focus()
    search.select()
  }
})

// ✅ OPTIMIERUNG: Globale Indizes für schnellen ID-Zugriff
appContext.locationById = new Map();
appContext.markerById = new Map();
window.locationById = appContext.locationById; // backward compat (gleiche Map-Referenz)
window.markerById = appContext.markerById;

// *** Modul-Scope Start ***

let map;
let allMarkers = [];
let connectionLine = null;
let styleFilterManager;
let currentStickyMarker = null;
let isPopupSticky = false;
let _suppressUnspiderify = false; // verhindert unspiderify wenn gespiderfied Marker getippt wird
let _lastMarkerTapTime = 0;       // verhindert clearStickyPopup durch map-click nach Marker-Tap

// *** WICHTIG: json als globale Variable ***
window.json = [];
let json = [];

// ZENTRALISIERTER MARKER-STATE MANAGEMENT
appContext.markerStateManager = {
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
window.markerStateManager = appContext.markerStateManager; // backward compat

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
  if (window.app?.searchHeader) {
    window.app.searchHeader._manualSpaceClick = true;
  }

  // 3. Filter-Kette neu starten
  if (window.app?.searchHeader) {
    setTimeout(() => {
      window.app.searchHeader.triggerFilterUpdate();

      // ✅ Reset Flag nach Filter-Anwendung
      setTimeout(() => {
        if (window.app?.searchHeader) {
          window.app.searchHeader._manualSpaceClick = false;
        }
      }, 100);
    }, 50);
  }
}

let clusterGroup = null;

// Map Utils für Search Manager
appContext.mapUtils = {
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
window.mapUtils = appContext.mapUtils; // backward compat


// +++ START: NAVIGATION LINK FUNCTIONS +++
function updateNavigationIconAppearance(navLinkElement, location) {
  const icon = navLinkElement.querySelector('i');
  const parentContainer = navLinkElement.parentElement;
  if (!icon || !parentContainer) return;

  const serviceToUse = consent.get('mapService') || 'osm';
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

  const serviceToUse = consent.get('mapService') || 'osm';
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

  const connectionEndX = suggestionRect.left + AppConfig.connectorOffsetLeft - mapRect.left;
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

/**
 * Formatiert eine PLZ auf die landesspezifische Länge (mit führenden Nullen).
 * @param {string|number} plz
 * @param {string} country - Vollständiger Ländername (z.B. 'Germany')
 * @returns {string}
 */
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

// GLOBAL: Map und MapLibre Layer
let currentMapLibreLayer = null;
let currentRasterLayer = null;

/**
 * Detects whether this device should use raster tiles (OSM PNG) instead of
 * vector tiles (MapLibre GL / WebGL). First match wins.
 * @returns {'vector'|'raster'}
 */
function detectTileMode() {
  // 1. WebGL unavailable (e.g. Raspberry Pi Chromium, old Android)
  try {
    const canvas = document.createElement('canvas');
    if (!canvas.getContext('webgl2') && !canvas.getContext('webgl')) return 'raster';
  } catch { return 'raster'; }

  // 2. iOS PWA — memory limits cause crashes with MapLibre WebGL context
  if (navigator.standalone && /iPhone|iPad/i.test(navigator.userAgent)) return 'raster';

  // 3. Low RAM device (Android/Chrome only — not available on iOS, covered by #2)
  if (navigator.deviceMemory && navigator.deviceMemory <= 2) return 'raster';

  return 'vector';
}

const tileMode = detectTileMode();

function setupMap() {

  map = new L.Map('map', {
    maxZoom: 18,
    zoomControl: false,
    closePopupOnClick: !('ontouchstart' in window), // Touch-Geräte (Phone + Tablet): false, Desktop: true
    doubleClickZoom: !('ontouchstart' in window),   // Eigener touchend-Handler übernimmt auf Touch
  });

  appContext.map = map;
  window.map = map; // backward compat

  const darkModeQuery = window.matchMedia('(prefers-color-scheme: dark)');

  function updateMapTiles() {
    if (tileMode === 'raster') {
      // Raster tiles (OSM PNG) — added once, no dark mode variant
      if (currentRasterLayer) return;
      currentRasterLayer = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
      });
      currentRasterLayer.addTo(map);
      return;
    }

    // Vector tiles via MapLibre GL
    let isDarkMode = false;
    const colorScheme = consent.get('color-scheme') || 'auto';
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
      console.error('⛔ MapLibre layer failed, falling back to raster tiles:', error);
      currentRasterLayer = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
      });
      currentRasterLayer.addTo(map);
    }
  }

  window.updateMapTiles = updateMapTiles;

  // ✅ FIX: Setze IMMER ein initiales Center/Zoom (verhindert "Set map center first" Fehler)
  // Im Embed-Mode wird das später durch fitBounds() überschrieben
  map.setView(new L.LatLng(51.0122995, 10.3995537), 7);

  updateMapTiles();

  darkModeQuery.addEventListener('change', () => {
    const currentScheme = consent.get('color-scheme') || 'auto';
    if (currentScheme === 'auto') {
      updateMapTiles();
    }
  });

  appContext.ready('map');
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
    zoomToBoundsOnClick: !('ontouchstart' in window), // Mobile: kein Zoom bei Cluster-Tap
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
  appContext.clusterGroup = clusterGroup;
  window.clusterGroup = clusterGroup; // backward compat

  // Mobile/Tablet: Cluster-Tap → Spiderify statt Zoom
  // (zoomToBoundsOnClick ist false auf Touch-Geräten, daher sonst kein Effekt)
  // Bibliothek wählt automatisch: Kreis (<9 Marker) oder wachsende Spirale (≥9 Marker)
  if ('ontouchstart' in window) {
    clusterGroup.on('clusterclick', (e) => {
      clearStickyPopup(); // offenes Popup schließen bevor Cluster aufspringt
      e.layer.spiderfy();
    });

    // Patch: Die Bibliothek registriert map.on('click', _unspiderfyWrapper) beim addLayer.
    // Auf Touch-Geräten löst ein Tap auf einen gespiderfied Marker ebenfalls einen map-click aus
    // (Leaflet's Tap-Helper synthetisiert ihn unabhängig vom Marker-click),
    // was _unspiderfyWrapper → _unspiderfy → closePopup() auf allen Markern auslöst.
    // Lösung: Original-Handler ersetzen durch einen der _suppressUnspiderify prüft.
    map.off('click', clusterGroup._unspiderfyWrapper, clusterGroup);
    map.on('click', () => {
      if (!_suppressUnspiderify) clusterGroup._unspiderfyWrapper();
    });
  }
}

// ─── Split-Loading Helpers ────────────────────────────────────────────────

// URL-Slug → ISO-Code (stimmt mit routing.js normalizeSlug + config.js COUNTRY_CODES überein)
const SLUG_TO_CODE = {
  'germany': 'de', 'austria': 'at', 'switzerland': 'ch',
  'france': 'fr', 'netherlands': 'nl', 'belgium': 'be',
  'italy': 'it', 'spain': 'es', 'ukraine': 'ua',
  'denmark': 'dk', 'luxembourg': 'lu',
};

// Geografisch benachbarte Länder-Splits → werden nach Stage-1a im Hintergrund prefetched
const NEIGHBOR_SPLITS = {
  'de': ['at', 'ch', 'nl', 'be', 'lu'],
  'at': ['de', 'ch', 'it'],
  'ch': ['de', 'at', 'fr', 'it'],
  'fr': ['be', 'ch', 'lu', 'it'],
  'nl': ['de', 'be'],
  'be': ['de', 'fr', 'nl', 'lu'],
  'it': ['at', 'ch', 'fr'],
  'dk': ['de'],
  'lu': ['de', 'fr', 'be'],
};

// (Manuelles Prefetch-Block entfernt, da nun über index.html preload optimiert gesteuert)

/**
 * Erkennt den ISO-Länder-Code aus dem URL-Hash.
 * '#/germany' → 'de', '#/germany/berlin/1,2' → 'de', '#/for-all' → null
 * @returns {string|null}
 */
function detectCountryCodeFromURL() {
  const hash = window.location.hash;
  if (!hash?.startsWith('#/')) return null;
  const firstSegment = hash.slice(2).split('/')[0].split('+')[0];
  return SLUG_TO_CODE[firstSegment] ?? null;
}

// Preload data split at module-evaluation time — fires before loadData() runs through appContext phases.
// Single source of truth: reuses detectCountryCodeFromURL() and SLUG_TO_CODE defined above.
(function preloadDataSplit() {
  const code = detectCountryCodeFromURL();
  const href = code ? `data/spaces-${code}.json` : 'data/markers.json';
  if (!document.querySelector(`link[rel="preload"][href="${href}"]`)) {
    const l = document.createElement('link');
    l.rel = 'preload'; l.as = 'fetch'; l.crossOrigin = 'anonymous'; l.href = href;
    document.head.appendChild(l);
  }
})();

/**
 * Indexiert + erstellt Marker für eine Batch neuer Locations (Non-blocking).
 * Überspringt bekannte IDs (Duplikat-Schutz beim Merge).
 * @param {MakerSpace[]} newLocs
 * @param {{ idle?: boolean }} [opts] - idle:true → requestIdleCallback (für Stage-2-Hintergrund)
 */
function processNewLocations(newLocs, { idle = false } = {}) {
  const idSet = new Set(appContext.locationById.keys());
  let issues = 0;

  for (const loc of newLocs) {
    if (typeof loc.ID !== 'number') {
      console.error(`❌ "${loc.name}" hat ungültige ID: ${loc.ID}`);
      issues++;
      continue;
    }
    if (idSet.has(loc.ID)) {
      // In-place enrichment occurs in Stage 2, so duplicates here are usually benign
      continue;
    }
    idSet.add(loc.ID);
    appContext.locationById.set(loc.ID, loc);
  }

  if (issues > 0) console.error(`❌ ${issues} ID-Probleme gefunden`);

  // Non-blocking Marker-Erstellung in Chunks (für flüssige UI).
  // Gibt ein Promise zurück, das auflöst wenn der letzte Chunk gerendert wurde.
  const locationsWithCoords = newLocs.filter(loc =>
    loc.loc && typeof loc.loc.lat === 'number' && typeof loc.loc.long === 'number'
  );

  return new Promise(resolve => {
    if (locationsWithCoords.length === 0) { resolve(); return; }

    const CHUNK_SIZE = 50;
    let index = 0;

    function addNextChunk() {
      const end = Math.min(index + CHUNK_SIZE, locationsWithCoords.length);
      for (; index < end; index++) {
        createMarkerForLocation(locationsWithCoords[index]);
      }

      if (index < locationsWithCoords.length) {
        if (idle && 'requestIdleCallback' in window) {
          requestIdleCallback(addNextChunk, { timeout: 2000 });
        } else {
          requestAnimationFrame(addNextChunk);
        }
      } else {
        resolve();
      }
    }

    addNextChunk();
  });
}

/**
 * Lädt fehlende Spaces aus spaces-all.json nach und mergt sie in die laufende App.
 * Wird im Hintergrund nach dem Laden eines Länder-Splits aufgerufen.
 */
async function loadAndMergeFullData() {
  try {
    const r = await fetch('./data/spaces-all.json');
    if (!r.ok) return;
    const allData = await r.json();

    // Bekannte Locations in-place anreichern (ergänzt link, workshops, weekly, street etc.),
    // unbekannte (andere Länder nach Country-Split) als neue Locations hinzufügen.
    const newLocs = [];
    for (const fullLoc of allData) {
      const existing = appContext.locationById.get(fullLoc.ID);
      if (existing) {
        Object.assign(existing, fullLoc);
      } else {
        newLocs.push(fullLoc);
      }
    }

    if (newLocs.length) {
      appContext.locations.push(...newLocs);
      processNewLocations(newLocs, { idle: true });
    }

    appContext.spaceAPI?.enrichLocationData(appContext.locations);
    appContext.searchFilter?.refreshStyleStats();

    console.log(`✅ Stage 2: ${allData.length} Spaces angereichert, ${newLocs.length} neue hinzugefügt`);
  } catch { /* Hintergrund-Fehler sind nicht kritisch */ }
}

// ─── Haupt-Laderoutine ────────────────────────────────────────────────────

async function loadData() {
  try {
    let rawData = null;
    let needsEnrichment = false;
    const countryCode = detectCountryCodeFromURL();

    // Stage 1a: Länderspezifischer Split (URL-Land bekannt → volle Daten, prefetched)
    if (countryCode) {
      const splitCacheKey = `ms-split-${countryCode}`;
      // Sofort aus localStorage zeigen (vor Netzwerk-Roundtrip)
      try {
        const cached = localStorage.getItem(splitCacheKey);
        if (cached) {
          rawData = JSON.parse(cached);
          needsEnrichment = true;
          console.log(`⚡ Stage 1a (Cache): spaces-${countryCode}.json (${rawData.length} Spaces)`);
        }
      } catch { localStorage.removeItem(splitCacheKey); }

      // Immer frische Version holen + Cache aktualisieren
      try {
        const r = await fetch(`./data/spaces-${countryCode}.json`);
        if (r.ok) {
          rawData = await r.json();
          needsEnrichment = true;
          try { localStorage.setItem(splitCacheKey, JSON.stringify(rawData)); } catch { /* quota */ }
          console.log(`⚡ Stage 1a: spaces-${countryCode}.json (${rawData.length} Spaces)`);
        }
      } catch (err) {
        console.warn(`Stage 1a (Country Split) failed for ${countryCode}:`, err.message);
      }

      // Nachbarländer erst nach App-Start prefetchen (nicht während kritischem Ladepfad)
      appContext.waitFor('app').then(() => {
        (NEIGHBOR_SPLITS[countryCode] || []).forEach(code => {
          fetch(`./data/spaces-${code}.json`, { priority: 'low' }).catch(() => {});
        });
      });
    }

    // Stage 1b: markers.json (alle Spaces, minimal → sofortige Anzeige aller Pins)
    if (!rawData?.length) {
      // 1b-i: Check localStorage first for instant pins
      const cachedMarkers = localStorage.getItem('ms-markers-cache');
      if (cachedMarkers) {
        try {
          rawData = JSON.parse(cachedMarkers);
          needsEnrichment = true;
          console.log(`⚡ Stage 1b (Cache): markers.json (${rawData.length} Pins loaded from localStorage)`);
        } catch (e) {
          localStorage.removeItem('ms-markers-cache');
        }
      }

      // 1b-ii: Fetch network version (always update — SW SWR ensures freshness)
      try {
        const r = await fetch('./data/markers.json', { mode: 'cors' });
        if (r.ok) {
          rawData = await r.json();
          try { localStorage.setItem('ms-markers-cache', JSON.stringify(rawData)); } catch { /* quota */ }
          needsEnrichment = true;
          console.log(`⚡ Stage 1b (Network): markers.json (${rawData.length} Pins)`);
        } else if (r.status === 404) {
          console.error("❌ Critical: data/markers.json missing! Run 'node generate-map-splits.js' if in development.");
        }
      } catch (err) {
        console.error("Stage 1b (Markers) fetch error:", err.message);
      }
    }

    // Letzter Fallback: vollständiger Datensatz (alter Server-Stand / kein per-country Split)
    if (!rawData?.length) {
      const r = await fetch('./data/spaces-all.json');
      if (!r.ok) throw new Error(`HTTP ${r.status} — data/spaces-all.json fehlt. 'node generate-map-splits.js' ausführen.`);
      rawData = await r.json();
    }

    // Daten in App-Kontext setzen
    appContext.locations = rawData;
    window.json = rawData; // backward compat
    json = rawData;

    // SpaceAPI setup runs in parallel with marker creation chunks
    const spaceAPI = new StaticSpaceAPI();
    appContext.spaceAPI = spaceAPI;
    window.spaceAPI = spaceAPI; // backward compat

    spaceAPI.onStatusUpdate((location) => {
      updateMarkerIconForLocation(location);
    });

    // Await all marker chunks so ready('data') fires only when all pins are in the cluster
    await processNewLocations(rawData);

    appContext.ready('data');

    spaceAPI.enrichLocationData(json).then(() => {
      if (appContext.searchFilter?.refreshStyleStats) appContext.searchFilter.refreshStyleStats();
      if (appContext.routingManager?.rerunRouteHandler) appContext.routingManager.rerunRouteHandler();
    });

    // Stage 2: vollständige Daten nachladen + in-place anreichern (nach App-Init)
    // Mobile-Optimierung: Defer enrichment to prioritize tile loading bandwidth
    if (needsEnrichment) {
      appContext.waitFor('app').then(() => {
        const enrichmentDelay = (window.innerWidth <= 767) ? 3000 : 800;
        setTimeout(() => {
          loadAndMergeFullData();
        }, enrichmentDelay);
      });
    }

  } catch (error) {
    console.error("Error fetching or parsing location data:", error);
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

  // UI-Elemente die den nutzbaren Kartenbereich einschränken
  const uiRects = ['.title-bar', '.search-container', '#suggestions-dropdown.is-active']
    .map(sel => document.querySelector(sel))
    .filter(Boolean)
    .map(el => el.getBoundingClientRect())
    .filter(r => r.width > 0 && r.height > 0);

  const midY = mapRect.top + mapRect.height / 2;

  // Horizontale Überlappung mit dem Popup prüfen (nur überlappende Elemente schränken ein)
  const hOverlap = r => r.right > popupRect.left && r.left < popupRect.right;

  // Obere Grenze: Unterkante der oberen UI-Elemente die horizontal mit dem Popup überlappen
  const topBoundary = uiRects
    .filter(r => r.top < midY && hOverlap(r))
    .reduce((acc, r) => Math.max(acc, r.bottom), mapRect.top) + pad;

  // Untere Grenze: Oberkante der unteren UI-Elemente die horizontal mit dem Popup überlappen
  const bottomBoundary = uiRects
    .filter(r => r.top >= midY && hOverlap(r))
    .reduce((acc, r) => Math.min(acc, r.top), mapRect.bottom) - pad;

  // Vertikal: Popup über Oberkante → unter den Marker spiegeln
  // CSS `translate` addiert sich zu Leaflet's `transform` (beide Properties wirken unabhängig)
  // flipDy in Screen-Koordinaten: Popup-Oberkante → Marker-Y (Tip zeigt dann nach oben zum Marker)
  let flipDy = 0;
  const overflowTop = topBoundary - popupRect.top;
  if (overflowTop > 0) {
    const latlng = popup.getLatLng();
    if (!latlng) return;
    const markerContainerPt = map.latLngToContainerPoint(latlng);
    const markerScreenY = mapRect.top + markerContainerPt.y;
    const flippedBottom = markerScreenY + 15 + popupRect.height;
    if (flippedBottom <= bottomBoundary) {
      flipDy = markerScreenY - popupRect.top + 15;
      el.style.setProperty('--flip-dy', `${flipDy}px`);
      el.classList.add('popup-flipped');
    }
  }

  // Horizontal: Popup links/rechts aus dem Container oder hinter UI-Elementen
  // Nach einem Flip hat sich das Popup vertikal um flipDy verschoben; wrapperRect ist aber
  // noch vor dem Flip gemessen → effektive Position berechnen statt stale Rect verwenden.
  const effectiveWrapperTop = wrapperRect.top + flipDy;
  const effectiveWrapperBottom = wrapperRect.bottom + flipDy;
  const vOverlap = r => r.bottom > effectiveWrapperTop && r.top < effectiveWrapperBottom;
  const midX = mapRect.left + mapRect.width / 2;

  // Rechte Grenze: Linkskante der rechten UI-Elemente, die vertikal mit dem Popup überlappen
  const rightBoundary = uiRects
    .filter(r => r.left > midX && vOverlap(r))
    .reduce((acc, r) => Math.min(acc, r.left), mapRect.right - pad);

  const overflowL = (mapRect.left + pad) - wrapperRect.left;
  const overflowR = wrapperRect.right - rightBoundary;

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

// ============================================================================
// MARKER CREATION
// ============================================================================

/**
 * Erstellt einen Leaflet-Marker für eine Location und registriert alle Event-Handler.
 * @param {MakerSpace} location
 * @returns {LeafletMarker|null}
 */
function createMarkerForLocation(location) {
  const lat = location.loc?.lat;
  const lng = location.loc?.long;

  if (typeof lat !== 'number' || typeof lng !== 'number' || isNaN(lat) || isNaN(lng)) {
    console.warn('⚠️ Invalid coordinates for location:', location.name, 'lat:', lat, 'lng:', lng);
    return null;
  }

  const marker = L.marker([lat, lng], { icon: icons.defaultIcon, opacity: 0.66 });
  clusterGroup.addLayer(marker);
  marker.locationId = location.ID;
  window.markerById.set(location.ID, marker);

  _applyMarkerClickHandler(marker);
  marker.bindPopup(() => buildPopupHTML(location, { bookmarkManager }), { maxWidth: 440, minWidth: 160, autoPan: false, closeButton: false });
  _applyPopupOpenHandler(marker, location);
  _applyPopupCloseHandler(marker);
  _applyMarkerHoverHandlers(marker, location);

  allMarkers.push(marker);
}

// --- Click Handler: Auto-Zoom-Prevention + Re-Tap-Schutz ---

/**
 * @param {LeafletMarker} marker
 */
function _applyMarkerClickHandler(marker) {
  marker.on('click', (e) => {
    if (window.app?.searchHeader) {
      window.app.searchHeader._manualSpaceClick = true;
      clearTimeout(window.app.searchHeader.zoomManager?.zoomDebounceTimeout);
      setTimeout(() => { window.app.searchHeader._manualSpaceClick = false; }, 1000);
    }
    if ('ontouchstart' in window) {
      _lastMarkerTapTime = Date.now(); // map-click kommt nach marker-click → guard in setupMapClickHandler
      // Gespiderfied: _suppressUnspiderify setzen damit unser gepatchter map-click-Handler
      // _unspiderfyWrapper überspringt. Das Flag wird im selben Tick gesetzt und im nächsten
      // Tick (nach dem synthetischen map-click) durch setTimeout zurückgesetzt.
      if (marker._spiderLeg) {
        _suppressUnspiderify = true;
        setTimeout(() => { _suppressUnspiderify = false; }, 0);
      }

      // Kein URL-Routing beim Marker-Tap: _openedByItemClick überspringt navigateToLocations in popupopen
      marker._openedByItemClick = true;
      // WICHTIG: Unser Handler läuft VOR Leaflet's _openPopup (weil _applyMarkerClickHandler vor
      // bindPopup aufgerufen wird). Deshalb NIEMALS marker.openPopup() hier aufrufen —
      // das würde das Popup öffnen, dann sieht _openPopup es als bereits offen und toggle-schließt es.
      // Stattdessen: _openPopup öffnet das Popup selbst. Für den Re-Tap-Fall (Popup ist schon offen)
      // setzen wir _retainPopup = true, damit der popupclose-Handler es sofort wieder öffnet.
      if (marker.isPopupOpen()) {
        // Re-Tap: _openPopup wird toggle-schließen → _retainPopup verhindert das Schließen
        marker._retainPopup = true;
      } else if (!map.hasLayer(marker)) {
        // Gruppierter Marker (Cluster): zum Map hinzufügen damit _openPopup Popup anzeigen kann
        marker.addTo(map);
        marker._isTemporarilyUnclustered = true;
      }
    }
  });
}

// --- Popup Open: Sticky-Logic, URL-Navigation, Position, Hover-Enter ---

/**
 * @param {LeafletMarker} marker
 * @param {MakerSpace} location
 */
function _applyPopupOpenHandler(marker, location) {
  marker.on('popupopen', (e) => {
    const wasOpenedByHover = marker._openedByHover;

    if (!wasOpenedByHover) {
      setStickyPopup(marker);
      // Mobile: Listing-Item im Dropdown als aktiv markieren
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

    marker._openedByHover = false;

    // URL setzen wenn Popup sticky ist (Delay damit setStickyPopup sicher gelaufen ist)
    setTimeout(() => {
      if (marker._openedByItemClick) {
        marker._openedByItemClick = false;
        marker._hasSetUrl = true;
        return;
      }
      if (currentStickyMarker === marker && isPopupSticky) {
        if (window.routingManager && window.routingManager.navigateToLocations) {
          window.routingManager.navigateToLocations([location.ID]);
          marker._hasSetUrl = true;
        }
      }
    }, 50);

    const popup = marker.getPopup();
    const popupElement = popup._container;
    const logoElement = document.querySelector('.title');

    // Popup-Klicks nicht an die Map durchleiten
    if (popupElement) {
      popupElement.addEventListener('mousedown', (event) => {
        if (!event.target.closest('.leaflet-popup-close-button')) event.stopPropagation();
      });
      popupElement.addEventListener('click', (event) => {
        if (!event.target.closest('.leaflet-popup-close-button')) event.stopPropagation();
      });
      popupElement.addEventListener('dblclick', (event) => { event.stopPropagation(); });
    }

    // Logo ausblenden wenn Popup überlappt
    if (popupElement && logoElement) {
      const popupRect = popupElement.getBoundingClientRect();
      const logoRect = logoElement.getBoundingClientRect();
      const isOverlapping = !(popupRect.right < logoRect.left || popupRect.left > logoRect.right ||
        popupRect.bottom < logoRect.top || popupRect.top > logoRect.bottom);
      if (isOverlapping) logoElement.classList.add('popup-active');
    }

    // Map seitlich verschieben wenn Popup das Dropdown überlappt
    if (popupElement && !wasOpenedByHover) {
      setTimeout(() => {
        const dropdown = document.getElementById('suggestions-dropdown');
        if (!dropdown || !dropdown.classList.contains('is-active')) return;
        const popupRect = popupElement.getBoundingClientRect();
        // Nur gegen das Dropdown selbst prüfen, nicht gegen searchContainer:
        // searchContainer.getBoundingClientRect() schließt die gesamte Dropdown-Höhe ein,
        // was zu falsch-positivem Overlap führt wenn das Popup unterhalb des Dropdowns passt.
        const dropdownRect = dropdown.getBoundingClientRect();
        const isOverlapping = !(popupRect.right < dropdownRect.left || popupRect.left > dropdownRect.right ||
          popupRect.bottom < dropdownRect.top || popupRect.top > dropdownRect.bottom);
        if (isOverlapping) {
          map.panBy([popupRect.right - dropdownRect.left + 12, 0], { animate: true, duration: 0.3 });
        }
      }, 350);
    }

    // Maus-Enter ins Popup: Sticky setzen + URL
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
          if (window.routingManager && window.routingManager.navigateToLocations) {
            window.routingManager.navigateToLocations([location.ID]);
            marker._hasSetUrl = true;
          }
        }
      };
      popupElement.removeEventListener('mouseenter', handlePopupEnter);
      popupElement.addEventListener('mouseenter', handlePopupEnter);
      requestAnimationFrame(() => {
        if (popupElement.matches(':hover')) handlePopupEnter();
      });
    }

    requestAnimationFrame(() => adjustPopupPosition(popup, map));

    const navLink = e.popup._container.querySelector('.navigation-icon');
    if (navLink) {
      updateNavigationIconAppearance(navLink, location);
      navLink.addEventListener('click', (event) => { handleNavigationClick(event, location); });
    }

    bookmarkManager.initializeBookmarkListeners(e.popup._container);
  });
}

// --- Popup Close: URL zurücksetzen, Sticky-State aufräumen ---

/**
 * @param {LeafletMarker} marker
 */
function _applyPopupCloseHandler(marker) {
  marker.on('popupclose', () => {
    // Touch-Geräte: Popup sofort wieder öffnen wenn Re-Tap (kein Toggle)
    if (marker._retainPopup) {
      marker._retainPopup = false;
      requestAnimationFrame(() => marker.openPopup());
      return;
    }

    document.querySelector('.title').classList.remove('popup-active');

    // Mobile: Marker zurück in Cluster geben (war temporär direkt auf Map)
    if (marker._isTemporarilyUnclustered) {
      map.removeLayer(marker);
      marker._isTemporarilyUnclustered = false;
    }

    // URL zurücksetzen wenn dieser Marker sticky war
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
}

// --- Hover: Popup öffnen (400ms), Sticky setzen (1500ms), Skalierung ---

/**
 * Registriert mouseover/mouseout-Handler (nur Desktop-Non-Touch).
 * @param {LeafletMarker} marker
 * @param {MakerSpace} location
 */
function _applyMarkerHoverHandlers(marker, location) {
  // Touch-Geräte (Phone + Tablet) haben kein Hover-Konzept.
  // mouseover/mouseout werden dort durch Tap-Events simuliert und führen
  // zu falschem isHovering-State und stickyTimeout-Fehlern (Popup-Schließen, ungewollter Zoom).
  if ('ontouchstart' in window) return;

  marker.on('mouseover', () => {
    const state = window.markerStateManager.getState(marker.locationId);
    if (state.isHovering) return;

    window.markerStateManager.clearTimeouts(marker.locationId);

    if (currentStickyMarker && currentStickyMarker !== marker) {
      currentStickyMarker.closePopup();
      currentStickyMarker = null;
      isPopupSticky = false;
    }
    allMarkers.forEach(m => { if (m !== marker && m.isPopupOpen()) m.closePopup(); });

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
        if (window.routingManager && window.routingManager.navigateToLocations) {
          window.routingManager.navigateToLocations([location.ID]);
          marker._hasSetUrl = true;
        }
      }
    }, 1500);

    window.markerStateManager.setState(marker.locationId, { hoverTimeout, stickyTimeout });
  });

  marker.on('mouseout', () => {
    const state = window.markerStateManager.getState(marker.locationId);
    window.markerStateManager.setState(marker.locationId, { isHovering: false });
    window.markerStateManager.clearTimeouts(marker.locationId);

    if (!state.isDropdownHovering) applyMarkerScale(marker, 1);

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
}
// ============================================================================
// OPTIMIERTE HILFSFUNKTIONEN: Nutzen ID statt find() - O(1) statt O(n)
// ============================================================================
/**
 * Findet Location anhand ID. O(1) via locationById-Map.
 * @param {number} id
 * @returns {MakerSpace|undefined}
 */
function getLocationById(id) {
  return window.locationById.get(id);
}

/**
 * Findet Marker anhand Location ID. O(1) via markerById-Map.
 * @param {number} id
 * @returns {LeafletMarker|undefined}
 */
function getMarkerByLocationId(id) {
  return window.markerById.get(id);
}

/**
 * Aktualisiert Marker-Icon für eine Location (respektiert Hover/Sticky-State).
 * @param {MakerSpace} location
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
  styleFilterManager = new StyleFilterManager(window.json, allMarkers, icons, window.app?.searchHeader);
  window.styleFilterManager = styleFilterManager;
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

  initApp({
    map,
    json: window.json,
    allMarkers,
    zfill
  });
}
function clearStickyPopup() {
  if (currentStickyMarker && isPopupSticky) {
    // Nur schließen wenn tatsächlich offen — Leaflet könnte es bereits extern geschlossen haben
    if (currentStickyMarker.isPopupOpen()) {
      currentStickyMarker.closePopup();
    }
    currentStickyMarker = null;
    isPopupSticky = false;
  }
}
function setStickyPopup(marker) {
  // Gleichen Marker nicht schließen und neu öffnen — das würde Cleanup in popupclose auslösen
  if (marker !== currentStickyMarker) {
    clearStickyPopup();
  }
  currentStickyMarker = marker;
  isPopupSticky = true;
}
function setupZoomOutButton() {
  const btn = document.getElementById('map-zoom-out-btn');
  if (!btn) return;

  function updateButtonVisibility() {
    const shouldShow = !!zoomManager.previousZoomBounds && zoomManager._userMoved;
    if (shouldShow) {
      btn.classList.add('visible');
    } else {
      btn.classList.remove('visible');
    }
  }

  // Show button when user drags or manually zooms
  map.on('dragstart', () => setTimeout(updateButtonVisibility, 0));
  map.on('moveend', updateButtonVisibility);
  map.on('zoomend', updateButtonVisibility);

  btn.addEventListener('click', () => {
    if (!zoomManager.previousZoomBounds) return;
    const uiH = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--mobile-ui-height')) || 0;
    // Treat like an auto-zoom so zoomstart doesn't re-set _userMoved
    zoomManager._isAutoZooming = true;
    zoomManager._userMoved = false;
    map.once('moveend', () => { zoomManager._isAutoZooming = false; });
    map.fitBounds(zoomManager.previousZoomBounds, {
      animate: true,
      duration: 0.35,
      paddingTopLeft: L.point(8, 8),
      paddingBottomRight: L.point(8, 8 + uiH),
    });
    updateButtonVisibility(); // fade out immediately
  });
}

function setupDesktopRezoomButton() {
  if ('ontouchstart' in window) return;
  const btn = document.getElementById('desktop-rezoom-btn');
  if (!btn) return;

  function updateVisibility() {
    const shouldShow = zoomManager._userMoved && !!zoomManager.previousZoomBounds;
    btn.classList.toggle('visible', shouldShow);
  }

  map.on('dragstart', () => setTimeout(updateVisibility, 0));
  map.on('moveend', updateVisibility);
  map.on('zoomend', updateVisibility);

  document.addEventListener('filterResultsChanged', () => {
    zoomManager._userMoved = false;
    btn.classList.remove('visible');
  });

  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    zoomManager._userMoved = false;
    appContext.searchHeader?.reZoom();
    updateVisibility();
  });
}

function setupTitleResetButton() {
  const btn = document.querySelector('.title-bar a');
  if (!btn) return;
  btn.addEventListener('click', (e) => {
    e.preventDefault();
    appContext.mobileFilterUI?.close?.();
    window.mapUtils?.clearStickyPopup();
    appContext.searchHeader?.clearAllFilters();
    zoomManager.handleEmptySearch();
  });
}

function setupMapClickHandler() {
  map.on('click', (e) => {
    // Touch: Leaflet's Tap-Helper feuert den map-click auf dem Map-Container (nicht auf dem Marker-Icon).
    // Der .leaflet-marker-icon-Guard funktioniert deshalb auf Touch nicht — stattdessen prüfen
    // ob ein Marker-Tap gerade stattgefunden hat (marker-click feuert immer vor dem map-click).
    if ('ontouchstart' in window) {
      if (Date.now() - _lastMarkerTapTime < 350) return;
    } else {
      if (!e.originalEvent?.target) return;
      if (e.originalEvent.target.closest('.leaflet-marker-icon')) return;
      if (e.originalEvent.target.closest('.search-container')) return;
    }
    clearStickyPopup();
  });

  // 1-Finger-Doppeltap: eine Stufe hereinzoomen (Phone + Tablet)
  // 2-Finger-Doppeltap: eine Stufe herauszoomen (Phone + Tablet)
  // Leaflet's DoubleClickZoom basiert auf 'dblclick' — das wird auf Touch-Geräten
  // vom Tap-Helper nicht synthetisiert, daher eigene touchend-Zählung nötig.
  if ('ontouchstart' in window) {
    let prevOneFingerEnd = 0;
    let prevTwoFingerEnd = 0;
    let oneFingerMoved = false;
    let twoFingerMoved = false;
    let twoFingerActive = false; // wurde ein 2-Finger-Tap gestartet?
    let lastTwoFingerPoint = null; // Mittelpunkt zwischen zwei Fingern (Container-Koordinaten)
    const mapContainer = map.getContainer();

    mapContainer.addEventListener('touchstart', (e) => {
      if (e.touches.length === 1) { oneFingerMoved = false; twoFingerActive = false; }
      if (e.touches.length === 2) {
        twoFingerMoved = false; twoFingerActive = true;
        const t0 = e.touches[0], t1 = e.touches[1];
        const rect = mapContainer.getBoundingClientRect();
        lastTwoFingerPoint = L.point(
          (t0.clientX + t1.clientX) / 2 - rect.left,
          (t0.clientY + t1.clientY) / 2 - rect.top
        );
      }
    }, { passive: true });

    mapContainer.addEventListener('touchmove', (e) => {
      if (e.touches.length === 1) oneFingerMoved = true;
      if (e.touches.length === 2) twoFingerMoved = true;
    }, { passive: true });

    mapContainer.addEventListener('touchend', (e) => {
      const now = Date.now();

      // 2-Finger-Doppeltap → herauszoomen
      // e.touches.length === 0: alle Finger gehoben (egal ob gleichzeitig oder nacheinander)
      // twoFingerActive: es waren zuvor 2 Finger auf dem Bildschirm
      if (twoFingerActive && e.touches.length === 0) {
        twoFingerActive = false;
        if (twoFingerMoved) { twoFingerMoved = false; prevTwoFingerEnd = 0; return; }
        if (now - prevTwoFingerEnd < 350) {
          if (lastTwoFingerPoint) {
            map.setZoomAround(lastTwoFingerPoint, map.getZoom() - 1);
          } else {
            map.zoomOut(1);
          }
          prevTwoFingerEnd = 0;
        } else {
          prevTwoFingerEnd = now;
        }
        return;
      }

      // 1-Finger-Doppeltap → hereinzoomen
      if (!twoFingerActive && e.touches.length === 0 && e.changedTouches.length === 1) {
        if (oneFingerMoved) { oneFingerMoved = false; prevOneFingerEnd = 0; return; }
        // Kein Zoom auf Markern, Popups oder UI-Elementen
        if (e.target.closest('.leaflet-marker-icon') ||
            e.target.closest('.leaflet-popup') ||
            e.target.closest('.search-container')) { prevOneFingerEnd = 0; return; }
        if (now - prevOneFingerEnd < 350) {
          const t = e.changedTouches[0];
          const rect = mapContainer.getBoundingClientRect();
          const tapPoint = L.point(t.clientX - rect.left, t.clientY - rect.top);
          map.setZoomAround(tapPoint, map.getZoom() + 1);
          prevOneFingerEnd = 0;
        } else {
          prevOneFingerEnd = now;
        }
      }
    }, { passive: true });
  }

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
    appContext.searchFilter,
    appContext.searchHeader,
    appContext.locations
  );
  // appContext.routingManager wird im RoutingManager-Konstruktor gesetzt (Schritt 4)
  window.routingManager = routingManager; // backward compat
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
    // i18n und Map/Data parallel laden — map nicht auf lang.json warten lassen
    const i18nPromise = window.i18n.load('./lang.json');
    setupMap();
    initializeClustering();
    await Promise.all([i18nPromise, loadData()]);
    bookmarkSync.init(window.translations);

    setupSearch();
    setupStyleFilter();
    setupRouting();
    setupMapClickHandler();
    setupZoomOutButton();
    setupDesktopRezoomButton();
    setupTitleResetButton();

    // ✅ Nearby Spaces wird von AppMain.init() initialisiert
  } catch (error) {
    console.error('⛔ A critical error occurred during app initialization:', error);
    alert('The application could not be started. Please check the developer console. — [F12]');
  }
};

init();