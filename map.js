// map.js - Finale Anti-Flacker Version mit zentralisiertem Marker-State Management und Navigation

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

// ✨ NEU: Globaler Cache für City Slugs -> Kanonische Namen
// (Wird zwar im aktuellen Design nicht mehr genutzt, aber als Fallback beibehalten)
window.CITY_SLUG_CACHE = new Map();

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
let json = window.json; // HINWEIS: 'json' ist hier nur eine lokale Kopie von window.json

// ZENTRALISIERTER MARKER-STATE MANAGEMENT
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
      stickyTimeout: null,
      closeTimeout: null,
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

  if (mapService && mapServiceTimestamp && (Date.now() - parseInt(mapServiceTimestamp, 10)) > ninetySixHours) {
    localStorage.removeItem('mapService');
    localStorage.removeItem('mapServiceTimestamp');
    mapService = null;
  }

  const serviceToUse = mapService || 'google';
  openMap(serviceToUse, lat, long);
}

function handleNavigationRightClick(event, location, navLinkElement) {
  event.preventDefault();

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
    marker._icon.style.zIndex = targetScale > 1 ? '1000' : '';

    setTimeout(() => {
      window.markerStateManager.setState(marker.uniqueId, { isScaling: false });
    }, 200);
  }
}





// Helper function zum konsistenten Icon-Update
function updateMarkerIcon(marker, location) {
  const state = window.markerStateManager.getState(marker.uniqueId);

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
    // WICHTIG: Hier verwenden wir window.json
    const filteredLocations = window.json.filter(loc =>
      loc.name.toLowerCase().includes(searchQuery) ||
      zfill(loc.loc.plz, loc.loc.country).startsWith(searchQuery) ||
      loc.loc.city.toLowerCase().includes(searchQuery)
    );

    if (filteredLocations.some(loc => loc.uniqueId === location.uniqueId)) {
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

function getCountryCode(countryName) {
  const countryCodeMap = {
    'Germany': 'de',
    'Austria': 'at',
    'Switzerland': 'ch',
    'France': 'fr',
    'Netherlands': 'nl',
    'Belgium': 'be',
    'Italy': 'it',
    'Spain': 'es',
    'Portugal': 'pt',
    'Poland': 'pl',
    'Czech Republic': 'cz',
    'Denmark': 'dk',
    'Sweden': 'se',
    'Norway': 'no',
    'Finland': 'fi',
    'United Kingdom': 'gb',
    'Ireland': 'ie',
    'Luxembourg': 'lu',
    'Liechtenstein': 'li',
    'Slovenia': 'si',
    'Croatia': 'hr',
    'Hungary': 'hu',
    'Romania': 'ro',
    'Bulgaria': 'bg',
    'Greece': 'gr',
    'Slovakia': 'sk',
    'Estonia': 'ee',
    'Latvia': 'lv',
    'Lithuania': 'lt',
    'Ukraine': 'ua'
  };

  return countryCodeMap[countryName] || countryName.toLowerCase().substring(0, 2);
}

// Füge updateMarkerIcon zu mapUtils hinzu
window.mapUtils.updateMarkerIcon = updateMarkerIcon;

// Main initialization
async function initializeApp() {
  try {
    await window.i18n.load('./lang.json');
    setupMap();
    initializeClustering();
    await loadData(); // WICHTIG: loadData füllt window.json
    setupSearch();
    setupStyleFilter();
    setupRouting();
    setupMapClickHandler();
  } catch (error) {
    console.error("A critical error occurred during app initialization:", error);
    alert("The application could not be started. Please check the developer console.");
  }
}

// ✅ GLOBAL: Map und MapLibre Layer
let currentMapLibreLayer = null;

function setupMap() {
  console.log('🔧 Starting MapLibre setup...');

  map = new L.Map('map', {
    maxZoom: 18
  });
  console.log('✅ Leaflet map created');

  window.map = map;

  const darkModeQuery = window.matchMedia('(prefers-color-scheme: dark)');

  function updateMapTiles() {
    let isDarkMode = false;
    const colorScheme = localStorage.getItem('color-scheme') || 'auto';

    if (colorScheme === 'dark') {
      isDarkMode = true;
    } else if (colorScheme === 'light') {
      isDarkMode = false;
    } else { // auto
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

  map.setView(new L.LatLng(51.0122995, 10.3995537), 7);
  updateMapTiles();

  darkModeQuery.addEventListener('change', () => {
    const currentScheme = localStorage.getItem('color-scheme') || 'auto';
    if (currentScheme === 'auto') {
      updateMapTiles();
    }
  });
}


function initializeClustering() {
  clusterGroup = L.markerClusterGroup({
    maxClusterRadius: function (zoom) {
      if (zoom <= 9) return 60;
      if (zoom <= 11) return 40;
      if (zoom <= 13) return 25;
      return 0;
    },
    disableClusteringAtZoom: 14,
    spiderfyOnMaxZoom: true,
    spiderfyDistanceMultiplier: 2,
    showCoverageOnHover: true,
    zoomToBoundsOnClick: true,
    animate: true,
    animateAddingMarkers: false,
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

    // ✨ WICHTIG: Befüllen der GLOBALEN Variable
    window.json = await response.json();
    json = window.json; // Aktualisiere die lokale Kopie (optional, aber sicher)

    console.log("📍 Creating markers immediately...");
    json.forEach((location, index) => {
      if (location.loc && typeof location.loc.lat === 'number' && typeof location.loc.long === 'number') {
        location.uniqueId = 'loc-' + index;
        createMarkerForLocation(location);
      }
    });

    console.log("✅ All markers created immediately!");

    const spaceAPI = new StaticSpaceAPI();
    window.spaceAPI = spaceAPI;

    console.log("📄 Loading fresh SpaceAPI status in background for", json.filter(loc => loc.spaceapi?.endpoint).length, "spaces...");

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
      console.log(`- ⚠️ Null: ${nullCount}`);
      console.log(`- ❓ Undefined: ${undefinedCount}`);

      if (window.styleFilterManager && typeof window.styleFilterManager.refreshStyleStats === 'function') {
        window.styleFilterManager.refreshStyleStats();
      }

      // ✨ FINALER FIX: Routing-Logik erneut ausführen
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
  marker.uniqueId = location.uniqueId;

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
      statusIconHtml = `<i class="fas fa-door-closed" title="${getTooltip('tooltips.spaceClosed')}"></i> `;
      nameClass = 'space-closed';
    }
    else if (location.spaceapi && location.spaceapi.endpoint) {
      statusIconHtml = `<i class="fas fa-question-circle" title="${getTooltip('tooltips.spaceStatusLoading')}"></i> `;
      nameClass = 'space-unknown';
    }

    let styleIconHtml = '';
    const styleIconMap = {
      'for all': 'fas fa-people-group',
      'for students': 'fas fa-graduation-cap',
      'for youth': 'fas fa-child',
      'for students & youth': 'fas fa-graduation-cap',
      'commercial': 'fas fa-money-bill-wave',
    };

    const locationStyle = location.style ? location.style.toLowerCase() : '';

    if (locationStyle && styleIconMap[locationStyle]) {
      const translatedStyle = window.i18n ? window.i18n.t(styleTranslationMap[locationStyle]) : location.style;
      styleIconHtml = `<i class="${styleIconMap[locationStyle]}" title="${translatedStyle}"></i> `;
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
      window.bookmarkManager.createBookmarkIcon(location.uniqueId, 'popup-bookmark') :
      '';

    return `
        <div style="--status-color: ${statusColor};">
          <h3 id="style">${styleIconHtml}${styleLabel}</h3>
          <a id="titleurl" href="${linkUrl}" target="_blank">
            <h3 class="${nameClass}">
              ${statusIconHtml}${location.name || 'Unnamed Space'}
            </h3>${bookmarkIcon}<br><br>
          </a>
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
  });

  marker.on('popupopen', (e) => {
    if (!marker._openedByHover) {
      setStickyPopup(marker);
    }
    marker._openedByHover = false;

    const popup = marker.getPopup();
    const popupElement = popup._container;
    const logoElement = document.querySelector('.title');

    if (popupElement) {
      popupElement.addEventListener('mousedown', (event) => {
        if (!event.target.closest('.leaflet-popup-close-button')) {
          event.stopPropagation();
        }
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
        const state = window.markerStateManager.getState(marker.uniqueId);
        if (state.closeTimeout) {
          clearTimeout(state.closeTimeout);
          window.markerStateManager.setState(marker.uniqueId, { closeTimeout: null });
        }
        if (currentStickyMarker !== marker) {
          marker._openedByHover = false;
          setStickyPopup(marker);
        }
      };

      popupElement.removeEventListener('mouseenter', handlePopupEnter);
      popupElement.addEventListener('mouseenter', handlePopupEnter);
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
    if (currentStickyMarker === marker) {
      currentStickyMarker = null;
      isPopupSticky = false;
    }
  });

  marker.on('mouseover', (e) => {
    const state = window.markerStateManager.getState(marker.uniqueId);

    if (state.isHovering) return;

    window.markerStateManager.clearTimeouts(marker.uniqueId);

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

    window.markerStateManager.setState(marker.uniqueId, { isHovering: true });
    applyMarkerScale(marker, 1.15);

    const hoverTimeout = setTimeout(() => {
      const currentState = window.markerStateManager.getState(marker.uniqueId);
      if (currentState.isHovering && !marker.isPopupOpen()) {
        marker._openedByHover = true;
        marker.openPopup();
      }
    }, 400);

    const stickyTimeout = setTimeout(() => {
      const currentState = window.markerStateManager.getState(marker.uniqueId);
      if (currentState.isHovering && marker.isPopupOpen()) {
        marker._openedByHover = false;
        setStickyPopup(marker);
      }
    }, 1500);

    window.markerStateManager.setState(marker.uniqueId, { hoverTimeout, stickyTimeout });
  });

  marker.on('mouseout', (e) => {
    const state = window.markerStateManager.getState(marker.uniqueId);

    window.markerStateManager.setState(marker.uniqueId, { isHovering: false });
    window.markerStateManager.clearTimeouts(marker.uniqueId);

    if (!state.isDropdownHovering) {
      applyMarkerScale(marker, 1);
    }

    if (marker.isPopupOpen() && (!isPopupSticky || currentStickyMarker !== marker)) {
      const closeTimeout = setTimeout(() => {
        if (!isPopupSticky || currentStickyMarker !== marker) {
          marker.closePopup();
        }
      }, 120);

      window.markerStateManager.setState(marker.uniqueId, { closeTimeout });
    }

    setTimeout(() => {
      if (!window.markerStateManager.isAnyHoverActive(marker.uniqueId)) {
        updateMarkerIcon(marker, location);
      }
    }, 50);
  });

  marker.on('click', (e) => {
    e.originalEvent?.stopPropagation();
    marker._openedByHover = false;

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

  const state = window.markerStateManager.getState(marker.uniqueId);
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



// Style Filter Setup
function setupStyleFilter() {
  if (!window.StyleFilterManager) {
    console.error('StyleFilterManager not available');
    return;
  }

  // WICHTIG: window.json als Quelle verwenden
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

  // WICHTIG: window.json als Quelle verwenden
  searchManager = new SearchManager(map, allMarkers, window.json, icons, zfill);
  window.searchManager = searchManager;
  console.log('SearchManager initialized successfully');
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
}


function setupRouting() {
  const routingManager = new RoutingManager(
    window.styleFilterManager,
    window.searchManager,
    window.json
  );

  window.routingManager = routingManager;
}

// ✨ KORRIGIERTE Hauptfunktion (const init) um Syntaxfehler zu vermeiden
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
  } catch (error) {
    console.error("A critical error occurred during app initialization:", error);
    alert("The application could not be started. Please check the developer console.");
  }
}

// FINALER AUFRUF IM MODUL-SCOPE
init();