// @ts-check
/**
 * marker-manager.js — Marker-/Popup-/Connection-Line-Logik.
 *
 * Aus map.js extrahiert (reine Code-Verschiebung, keine Logik-Änderung).
 * map.js bleibt Entry-Point und ruft initMarkerManager() nach setupMap() auf.
 *
 * Modul-Ebene ist import-sicher: nur Deklarationen. Alle aktive Verdrahtung
 * (window-Bridges, mapUtils-Registrierung, injizierte Abhängigkeiten) läuft in
 * initMarkerManager(). Dadurch können reine Funktionen (z.B. zfill) in Node
 * getestet werden, ohne dass Modul-Ebene DOM/Leaflet berührt.
 */

/** @typedef {import('./types.js').MakerSpace} MakerSpace */
/** @typedef {import('leaflet').Marker} LeafletMarker */

import AppConfig from './config.js';
import { appContext } from './app-context.js';
import { bookmarkManager } from './bookmark-manager.js';
import { consent } from './datasync.js';
import { buildPopupHTML } from './popup-builder.js';

// ─── Injizierte Abhängigkeiten (in initMarkerManager gesetzt) ───────────────
/** @type {import('leaflet').Map} */
let map;
let icons;

// ─── Modul-State (aus map.js verschoben) ────────────────────────────────────
let allMarkers = [];
const openPopupMarkers = new Set();
let connectionLine = null;
let currentStickyMarker = null;
let isPopupSticky = false;
let _suppressUnspiderify = false; // verhindert unspiderify wenn gespiderfied Marker getippt wird
let _lastMarkerTapTime = 0;       // verhindert clearStickyPopup durch map-click nach Marker-Tap

// ─── Accessors für verbleibenden map.js-Code ────────────────────────────────
/** @returns {LeafletMarker[]} die (per Referenz geteilte) Marker-Liste */
export function getAllMarkers() { return allMarkers; }
/** @returns {boolean} */
export function getSuppressUnspiderify() { return _suppressUnspiderify; }
/** @returns {number} */
export function getLastMarkerTapTime() { return _lastMarkerTapTime; }

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
  const connectionEndY = suggestionRect.top + (suggestionRect.height / 2) - mapRect.top;
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
    const ids = appContext.searchFilter?.lastFilteredIds;
    const isMatch = ids ? ids.has(location.ID) : true;

    if (isMatch) {
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
export function zfill(plz, country) {
  const expectedLengths = { Germany: 5, Austria: 4, Belgium: 4, Switzerland: 4, Poland: 5, USA: 5, Italy: 5, Spain: 5, France: 5, Luxemburg: 4, Netherlands: 4, Ukraine: 5 };
  let plzStr = String(plz);
  let expectedLength = expectedLengths[country] || plzStr.length;
  return plzStr.padStart(expectedLength, "0");
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
export function createMarkerForLocation(location) {
  const lat = location.loc?.lat;
  const lng = location.loc?.long;

  if (typeof lat !== 'number' || typeof lng !== 'number' || isNaN(lat) || isNaN(lng)) {
    console.warn('⚠️ Invalid coordinates for location:', location.name, 'lat:', lat, 'lng:', lng);
    return null;
  }

  const marker = L.marker([lat, lng], { icon: icons.defaultIcon, opacity: 0.66 });
  // Do NOT add to clusterGroup here — updateMarkers() controls visibility based on active filters.
  // Adding directly would bypass country/style filters that may already be active (e.g. Stage 2 enrichment).
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
    openPopupMarkers.add(marker);
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

    // Logo ausblenden wenn Popup überlappt — Reads zuerst, dann Write
    if (popupElement && logoElement) {
      const popupRect = popupElement.getBoundingClientRect();
      const logoRect = logoElement.getBoundingClientRect();
      const isOverlapping = !(popupRect.right < logoRect.left || popupRect.left > logoRect.right ||
        popupRect.bottom < logoRect.top || popupRect.top > logoRect.bottom);
      if (isOverlapping) logoElement.classList.add('popup-active');
    }

    // Container-Listener einmalig binden — popup._container ist pro Marker persistent,
    // daher akkumulieren mousedown/click/dblclick/mouseenter ohne diesen Guard bei jedem Open.
    if (popupElement) {
      // handlePopupEnter vor dem Guard definieren — wird im Guard (mouseenter) und im rAF referenziert.
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
      if (!popupElement.dataset.msHandlersBound) {
        popupElement.addEventListener('mousedown', (event) => {
          if (!event.target.closest('.leaflet-popup-close-button')) event.stopPropagation();
        });
        popupElement.addEventListener('click', (event) => {
          if (!event.target.closest('.leaflet-popup-close-button')) event.stopPropagation();
        });
        popupElement.addEventListener('dblclick', (event) => { event.stopPropagation(); });
        popupElement.addEventListener('mouseenter', handlePopupEnter);
        popupElement.dataset.msHandlersBound = '1';
      }
      // Hover-Recheck muss bei jedem Open laufen — außerhalb des Guards
      requestAnimationFrame(() => {
        if (popupElement.matches(':hover')) handlePopupEnter();
      });
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
    openPopupMarkers.delete(marker);
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
    openPopupMarkers.forEach(m => { if (m !== marker && m.isPopupOpen()) m.closePopup(); });

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
export function updateMarkerIconForLocation(location) {
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

export function clearStickyPopup() {
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

// ─── Init-Wrapper ───────────────────────────────────────────────────────────
/**
 * Verdrahtet die injizierten Abhängigkeiten und registriert die window-/mapUtils-
 * Bridges. Muss VOR dem ersten Marker-Nutzer aufgerufen werden (in map.js direkt
 * nach setupMap(), vor loadData()).
 * @param {{ map: import('leaflet').Map, icons: any }} deps
 */
export function initMarkerManager({ map: mapInstance, icons: iconsRef }) {
  map = mapInstance;
  icons = iconsRef;

  // window-Bridge (routing.js nutzt window.zfill)
  window.zfill = zfill;

  // Marker-bezogene Einträge in das bestehende mapUtils-Objekt (aus map.js) mergen.
  // toggleClustering/isClusteringEnabled bleiben in map.js registriert.
  Object.assign(appContext.mapUtils, {
    createConnectionLine: createConnectionLine,
    removeConnectionLine: removeConnectionLine,
    clearStickyPopup: clearStickyPopup,
    setStickyPopup: setStickyPopup,
    isStickyMarker: (marker) => currentStickyMarker === marker && isPopupSticky,
    setMarkerDropdownHover: setMarkerDropdownHover,
    clearMarkerDropdownHover: clearMarkerDropdownHover,
    updateMarkerIcon: updateMarkerIcon,
  });
}
