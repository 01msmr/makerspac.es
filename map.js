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
import { DemoMode, OpenDemoMode, TodayDemoMode } from './demo-mode.js';
import { getTileMode, loadMaplibreIfNeeded } from './tile-loader.js';
import {
  initMarkerManager,
  createMarkerForLocation,
  updateMarkerIconForLocation,
  clearStickyPopup,
  zfill,
  getAllMarkers,
  getSuppressUnspiderify,
  getLastMarkerTapTime,
} from './marker-manager.js';
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
let styleFilterManager;

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

  // 1b. Direkt auf der Map liegende Marker räumen (aus ungeclustertem Modus)
  //     + Diff-Tracking invalidieren — sonst hält updateMarkers() die Marker
  //     für "bereits sichtbar" und fügt sie nach dem Toggle nie wieder hinzu.
  getAllMarkers().forEach(m => { if (map.hasLayer(m)) map.removeLayer(m); });
  appContext.searchFilter?.resetMarkerDiff();

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
// Marker-bezogene Einträge (createConnectionLine, clearStickyPopup, updateMarkerIcon …)
// werden von initMarkerManager() in marker-manager.js in dieses Objekt gemergt.
appContext.mapUtils = {
  toggleClustering: toggleClustering,
  isClusteringEnabled: isClusteringCurrentlyEnabled
};
window.mapUtils = appContext.mapUtils; // backward compat


// ✅ REFACTORED: Nutze zentrale Funktion aus MapIcons
// ✅ REFACTORED: Nutze zentrale Funktion aus MapIcons
function getCountryCode(countryName) {
  return window.MapIcons.getCountryCode(countryName);
}

// GLOBAL: Map und MapLibre Layer
let currentMapLibreLayer = null;
let currentRasterLayer = null;


function setupMap() {

  map = new L.Map('map', {
    maxZoom: 18,
    zoomControl: false,
    closePopupOnClick: !('ontouchstart' in window), // Touch-Geräte (Phone + Tablet): false, Desktop: true
    doubleClickZoom: !('ontouchstart' in window),   // Eigener touchend-Handler übernimmt auf Touch
    // Touch: stufenloser Zoom — Pinch bleibt exakt stehen, fitBounds passt exakt
    // (kein Abrunden auf ganze Stufen). Desktop behält Stufen (Mausrad-Raster).
    zoomSnap: ('ontouchstart' in window) ? 0 : 1,
  });

  appContext.map = map;
  window.map = map; // backward compat

  // In iframe context (backdrop embedding): disable all map interaction so the
  // search bar + dropdown work via mouse without the map panning/zooming underneath.
  if (window !== window.top) {
    map.dragging.disable();
    map.scrollWheelZoom.disable();
    map.doubleClickZoom.disable();
    map.touchZoom.disable();
    map.boxZoom.disable();
    map.keyboard.disable();
    map.tap?.disable();

    const navigateParent = () => {
      setTimeout(() => { window.top.location.href = window.location.href; }, 0);
    };

    // Click on any dropdown item → navigate parent to full map
    const dropdown = document.getElementById('suggestions-dropdown');
    if (dropdown) {
      dropdown.addEventListener('click', navigateParent, true);
    }

    // Enter on a focused dropdown item → same (routing updates hash first via selectSuggestion)
    // Enter on a bare search term → navigate parent to map root
    const searchBar = document.getElementById('search-bar');
    if (searchBar) {
      searchBar.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') navigateParent();
      }, true);
    }
  }

  const darkModeQuery = window.matchMedia('(prefers-color-scheme: dark)');

  function updateMapTiles() {
    if (getTileMode() === 'raster') {
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
      if (!getSuppressUnspiderify()) clusterGroup._unspiderfyWrapper();
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
      await processNewLocations(newLocs, { idle: true });
      // Re-apply the current filter so new markers respect country/style filters already active.
      appContext.searchHeader?.triggerFilterUpdate();
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

    // Await all marker chunks so ready('data') fires only when all markers are in allMarkers[]
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
  styleFilterManager = new StyleFilterManager(window.json, getAllMarkers(), icons, window.app?.searchHeader);
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
    allMarkers: getAllMarkers(),
    zfill
  });
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
      if (Date.now() - getLastMarkerTapTime() < 350) return;
    } else {
      if (!e.originalEvent?.target) return;
      if (e.originalEvent.target.closest('.leaflet-marker-icon')) return;
      if (e.originalEvent.target.closest('.search-container')) return;
    }
    clearStickyPopup();
  });

  // 1-Finger-Doppeltap: hereinzoomen (Phone + Tablet)
  // 2-Finger-Doppeltap: herauszoomen (Phone + Tablet)
  // Leaflet's DoubleClickZoom basiert auf 'dblclick' — das wird auf Touch-Geräten
  // vom Tap-Helper nicht synthetisiert, daher eigene touchend-Zählung nötig.
  if ('ontouchstart' in window) {
    // Zoom-Schritt pro Doppeltap: 2/3 Stufe = Faktor 2^(2/3) ≈ 1.59 (statt 2.0).
    // Feiner dosierbar; 3 Doppeltaps = exakt 2 ganze Kachelstufen, d.h. die
    // Rasterdarstellung landet regelmäßig wieder auf nativer Schärfe.
    const TOUCH_ZOOM_STEP = 2 / 3;
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
            map.setZoomAround(lastTwoFingerPoint, map.getZoom() - TOUCH_ZOOM_STEP);
          } else {
            map.zoomOut(TOUCH_ZOOM_STEP);
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
          map.setZoomAround(tapPoint, map.getZoom() + TOUCH_ZOOM_STEP);
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
    // MapLibre wird nur im vector-Modus geladen (spart ~750KB auf Low-Memory-Geräten)
    const i18nPromise = window.i18n.load('./lang.json');
    await loadMaplibreIfNeeded();
    setupMap();
    initMarkerManager({ map, icons });
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

    // Demo/attract mode (trade-show kiosk)
    appContext.waitFor('app').then(() => {
      const demoMode = new DemoMode(appContext);
      new OpenDemoMode(appContext);
      const todayDemo = new TodayDemoMode(appContext);
      todayDemo._handoffTo = demoMode;   // after today's cycle: hand off to city tour
    });

    // ✅ Nearby Spaces wird von AppMain.init() initialisiert
  } catch (error) {
    console.error('⛔ A critical error occurred during app initialization:', error);
    alert('The application could not be started. Please check the developer console. — [F12]');
  }
};

init();