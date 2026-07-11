import AppConfig from './config.js';
import { appContext } from './app-context.js';

// zoom-manager.js - Zentrale Zoom-Logik für die Karte
// Enthält: Auto-Zoom, Three-Frame-Zoom, Zoom-Preview-Frames, Overlap-Detection

// ═══════════════════════════════════════════════════════════════════════════════
// POLYGON-FIT (Desktop)
// Die sichtbare Kartenfläche ist EIN rechtwinkliges Polygon: Viewport minus
// Logo-Rechteck (oben links) minus Search-Container/Dropdown-Rechteck (oben
// rechts). Alle Pins der aktiven Auswahl müssen einzeln in dieser Form liegen —
// Pins dürfen sich also über die Arme der Form verteilen (Mittelspalte,
// unterhalb der UI), auch wenn ihre gemeinsame Bounding-Box in kein einzelnes
// Teilrechteck passt.
// ═══════════════════════════════════════════════════════════════════════════════

/** Innenabstand zu UI-Flächen (Logo/Search/Dropdown), unabhängig vom Pin-Displayrand-Abstand (px) */
const FIT_MARGIN = 8;
/**
 * Mindestabstand zwischen Pin und Displaykante (px): 50px vertikal (unten zur
 * Pin-Spitze, oben zur Pin-Oberkante/Kreis-Kopf), 25px horizontal (zur Icon-Seite).
 */
const VERTICAL_MARGIN = 50;
const HORIZONTAL_MARGIN = 25;
/** Marker-Icon-Ausdehnung um den Ankerpunkt (Icon ~25×41, Anker unten Mitte) */
const ICON_SIDE = 13;
const ICON_UP = 41;

/**
 * Sucht eine Verschiebung t, sodass alle (fest skalierten) Punkte im Polygon
 * liegen. Die Ausschluss-Rechtecke sind kantenverankert: Logo ab x=0, Search/
 * Dropdown bis x=mapW, beide ab y=0. Pro Punkt gilt disjunktiv „rechts vom
 * Logo ODER darunter" bzw. „links vom Dropdown ODER darunter" — bei fixem ty
 * kollabiert das zu einem x-Intervall für tx. Feasibility ist monoton in ty
 * (größeres ty = Punkte tiefer = weniger Konflikte), Wechsel nur an den
 * Breakpoints ty = rect.bottom − p.y → exakte Prüfung über die Kandidaten,
 * bevorzugt nahe der zentrierten Lage.
 *
 * @param {{x:number,y:number}[]} pts - Punkte in Container-Pixeln (skaliert)
 * @param {number} mapW @param {number} mapH
 * @param {{right:number,bottom:number}|null} leftUI - Logo (inkl. Icon-Puffer)
 * @param {{left:number,bottom:number}|null} rightUI - Search/Dropdown (inkl. Icon-Puffer)
 * @param {{top:number,right:number,bottom:number,left:number}} m - Randabstände
 * @returns {{tx:number,ty:number}|null} Verschiebung oder null (passt nicht)
 */
function findFitTranslation(pts, mapW, mapH, leftUI, rightUI, m) {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const p of pts) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  const txLo0 = m.left - minX, txHi0 = mapW - m.right - maxX;
  const tyLo = m.top - minY, tyHi = mapH - m.bottom - maxY;
  if (txLo0 > txHi0 || tyLo > tyHi) return null;

  const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi);
  const tyCentered = clamp((mapH - minY - maxY) / 2, tyLo, tyHi);

  // Kandidaten: zentrierte Lage, Extrema, alle Band-Wechsel-Breakpoints
  const cands = new Set([tyCentered, tyHi, tyLo]);
  for (const p of pts) {
    if (leftUI) cands.add(leftUI.bottom - p.y);
    if (rightUI) cands.add(rightUI.bottom - p.y);
  }
  const sorted = [...cands]
    .filter(ty => ty >= tyLo && ty <= tyHi)
    .sort((a, b) => Math.abs(a - tyCentered) - Math.abs(b - tyCentered));

  for (const ty of sorted) {
    let lo = txLo0, hi = txHi0;
    for (const p of pts) {
      const y = p.y + ty;
      if (leftUI && y < leftUI.bottom) lo = Math.max(lo, leftUI.right - p.x);
      if (rightUI && y < rightUI.bottom) hi = Math.min(hi, rightUI.left - p.x);
      if (lo > hi) break;
    }
    if (lo <= hi) {
      return { tx: clamp((mapW - minX - maxX) / 2, lo, hi), ty };
    }
  }
  return null;
}

/**
 * Maximiert per Binärsuche den Maßstab, bei dem alle Punkte ins Polygon passen,
 * und liefert Maßstab + Verschiebung. Referenz-Maßstab 1 = Punkte wie übergeben.
 *
 * @param {{x:number,y:number}[]} pts - Punkte in Container-Pixeln (Referenz-Zoom)
 * @param {number} mapW @param {number} mapH
 * @param {{right:number,bottom:number}|null} leftUI
 * @param {{left:number,bottom:number}|null} rightUI
 * @param {{top:number,right:number,bottom:number,left:number,maxScale?:number}} opts
 * @returns {{scale:number,tx:number,ty:number}}
 */
function computePolygonFit(pts, mapW, mapH, leftUI, rightUI, opts) {
  const m = { top: opts.top, right: opts.right, bottom: opts.bottom, left: opts.left };
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const p of pts) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  const bw = Math.max(maxX - minX, 1e-9), bh = Math.max(maxY - minY, 1e-9);
  const availW = mapW - m.left - m.right, availH = mapH - m.top - m.bottom;

  // Obere Schranke: Bounding-Box füllt den vollen Viewport (besser geht nie)
  const sMax = Math.min(availW / bw, availH / bh, opts.maxScale ?? Infinity);
  // Fallback: Bounding-Box zentriert, UI-Flächen ignoriert (altes Verhalten)
  const fallback = () => ({
    scale: sMax,
    tx: m.left + (availW - bw * sMax) / 2 - minX * sMax,
    ty: m.top + (availH - bh * sMax) / 2 - minY * sMax,
  });
  if (availW <= 0 || availH <= 0 || sMax <= 0) return { scale: Math.max(sMax, 1e-9), tx: 0, ty: 0 };

  const tryScale = (s) => findFitTranslation(
    pts.map(p => ({ x: p.x * s, y: p.y * s })), mapW, mapH, leftUI, rightUI, m
  );

  const tMax = tryScale(sMax);
  if (tMax) return { scale: sMax, ...tMax };

  let lo = 0, hi = sMax;
  let best = null;
  for (let i = 0; i < 25; i++) {
    const s = (lo + hi) / 2;
    const t = tryScale(s);
    if (t) { best = { scale: s, ...t }; lo = s; } else { hi = s; }
  }
  return best ?? fallback();
}

class ZoomManager {
  constructor() {
    this.map = null;
    this.suggestionsDropdown = null;
    this.searchBar = null;

    // State
    this.previousZoomBounds = null;
    this.zoomDebounceTimeout = null;
    this.ZOOM_THRESHOLD = AppConfig?.settings?.zoomThreshold || 2;

    // Mobile: Nutzer-Interaktion mit der Karte unterdrückt Auto-Zoom
    // bis Searchbar fokussiert oder Suchtext geändert wird.
    this._userMoved = false;
    this._isAutoZooming = false;

    // Overlap Detection
    this.overlapCheckInterval = null;
    this.overlapCheckFunction = null;

    // Zoom Indicator
    this.zoomIndicator = null;
    this.zoomIndicatorActive = false;
    this._moveZoomIndicator = null;
    this._updateZoomIndicator = null;
  }

  /**
   * Initialisiert den ZoomManager
   */
  init(map) {
    this.map = map;
    this.suggestionsDropdown = document.getElementById('suggestions-dropdown');
    this.searchBar = document.getElementById('search-bar');

    // Nutzer-Drag/-Zoom setzt _userMoved → Auto-Zoom pausiert bis Suchinteraktion
    map.on('dragstart', () => { this._userMoved = true; });
    map.on('zoomstart', () => { if (!this._isAutoZooming) this._userMoved = true; });
  }

  /** Setzt _userMoved zurück – aufgerufen wenn Searchbar fokussiert oder Text geändert */
  resetUserMoved() {
    this._userMoved = false;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // AUTO-ZOOM
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Triggert Auto-Zoom mit Debounce
   * @param {Array} locations - Locations zum Zoomen
   * @param {Function} findMarker - Funktion zum Finden eines Markers
   */
  triggerAutoZoom(locations, findMarker) {
    clearTimeout(this.zoomDebounceTimeout);

    const DEBOUNCE_DELAY = AppConfig?.settings?.zoomDebounceMs || 800;

    this.zoomDebounceTimeout = setTimeout(() => {
      if (locations.length > 0) {
        this.setupAutoZoom(locations, findMarker);
      }
    }, DEBOUNCE_DELAY);
  }

  /**
   * Setup Auto-Zoom basierend auf gefilterten Locations
   */
  setupAutoZoom(filteredLocations, findMarker) {
    if (!this.map || filteredLocations.length === 0) return;

    const markersToZoom = filteredLocations
      .map(loc => findMarker(loc))
      .filter(Boolean);

    if (markersToZoom.length === 0) return;

    this.suggestionsDropdown?.classList.add('is-zooming');

    let newBounds;
    if (markersToZoom.length > 1) {
      newBounds = L.featureGroup(markersToZoom).getBounds().pad(0.05);
    } else {
      const center = markersToZoom[0].getLatLng();
      const radius = 0.01;
      newBounds = L.latLngBounds(
        [center.lat - radius, center.lng - radius],
        [center.lat + radius, center.lng + radius]
      );
    }

    if (newBounds) {
      // Map bereit?
      if (!this.map.getCenter()) {
        console.warn('⚠️ Map not initialized yet, skipping auto-zoom');
        return;
      }

      // Mobile/Tablet: schneller, direkter Zoom ohne Frame-Effekte
      // Nur wenn Nutzer die Karte nicht manuell bewegt hat (wird durch Searchbar-Fokus/Input zurückgesetzt)
      const isMobileUI = window.matchMedia('(max-width: 1024px), (min-width: 768px) and (pointer: coarse)').matches;
      if (isMobileUI) {
        if (appContext.searchHeader?._manualSpaceClick) return;
        if (this._userMoved) return;
        const uiH = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--mobile-ui-height')) || 0;
        this._isAutoZooming = true;
        this.map.fitBounds(newBounds, {
          animate: true,
          duration: 0.35,
          paddingTopLeft: L.point(8, 8),
          paddingBottomRight: L.point(8, 8 + uiH),
        });
        this.map.once('moveend', () => { this._isAutoZooming = false; });
        this.previousZoomBounds = newBounds;
        return;
      }

      if (!this.previousZoomBounds) {
        this.previousZoomBounds = this.map.getBounds();
      }

      const prevZoom = this.map.getBoundsZoom(this.previousZoomBounds);
      const newZoom = this.map.getBoundsZoom(newBounds);
      const isBigZoomChange = Math.abs(prevZoom - newZoom) > this.ZOOM_THRESHOLD;

      const mapSize = this.map.getSize();
      const prevCenterPixels = this.map.latLngToContainerPoint(this.previousZoomBounds.getCenter());
      const newCenterPixels = this.map.latLngToContainerPoint(newBounds.getCenter());
      const dx = Math.abs(prevCenterPixels.x - newCenterPixels.x);
      const dy = Math.abs(prevCenterPixels.y - newCenterPixels.y);
      const isFarPan = (dx > mapSize.x) || (dy > mapSize.y);

      if (isBigZoomChange || isFarPan) {
        this.executeThreeFrameZoom(this.previousZoomBounds, newBounds, markersToZoom);
      } else {
        this.executeNormalZoom(newBounds, markersToZoom);
      }

      this.previousZoomBounds = newBounds;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // NORMAL ZOOM
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Zoomt auf die Bounds, sodass alle Pins im freien Polygon liegen
   * (Viewport minus Logo- und Search/Dropdown-Fläche).
   * @param {import('leaflet').LatLngBounds} bounds
   * @param {object} [options] - flyTo-Optionen
   * @param {import('leaflet').LatLng[]|null} [latlngs] - Pin-Positionen;
   *        ohne latlngs wird die Bounding-Box (4 Ecken) gefittet
   */
  flyToBoundsTight(bounds, options = {}, latlngs = null) {
    const origSnap = this.map.options.zoomSnap;
    this.map.options.zoomSnap = 0;

    const mapSize = this.map.getSize();
    const zRef = this.map.getZoom();
    const lls = (latlngs && latlngs.length) ? latlngs : [
      bounds.getNorthWest(), bounds.getNorthEast(),
      bounds.getSouthWest(), bounds.getSouthEast(),
    ];
    const pts = lls.map(ll => this.map.project(ll, zRef));

    const { leftUI, rightUI } = this._getUIExclusionRects();
    const maxZoom = this.map.getMaxZoom();
    const fit = computePolygonFit(pts, mapSize.x, mapSize.y, leftUI, rightUI, {
      top: VERTICAL_MARGIN + ICON_UP,
      right: HORIZONTAL_MARGIN + ICON_SIDE,
      bottom: VERTICAL_MARGIN,
      left: HORIZONTAL_MARGIN + ICON_SIDE,
      maxScale: Number.isFinite(maxZoom) ? 2 ** (maxZoom - zRef) : undefined,
    });

    const zoom = zRef + Math.log2(fit.scale);
    // Container-Punkt (W/2 − tx, H/2 − ty) ist die Projektion des Map-Centers
    const center = this.map.unproject(
      L.point(mapSize.x / 2 - fit.tx, mapSize.y / 2 - fit.ty), zoom
    );

    this.map.flyTo(center, zoom, options);
    this.map.once('moveend', () => { this.map.options.zoomSnap = origSnap; });
  }

  /**
   * Liefert die UI-Ausschluss-Rechtecke in Map-Container-Koordinaten,
   * aufgeblasen um die Marker-Icon-Ausdehnung (Icon darf UI nicht berühren).
   * leftUI: Logo/Title-Bar · rightUI: Search-Container ∪ aktives Dropdown ∪
   * Language-Switcher. Nicht sichtbare Elemente → null.
   * @returns {{leftUI: {right:number,bottom:number}|null, rightUI: {left:number,bottom:number}|null}}
   */
  _getUIExclusionRects() {
    const mapEl = document.getElementById('map');
    if (!mapEl) return { leftUI: null, rightUI: null };
    const mapRect = mapEl.getBoundingClientRect();

    const rel = (el) => {
      if (!el) return null;
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height) return null;
      return { left: r.left - mapRect.left, right: r.right - mapRect.left, bottom: r.bottom - mapRect.top };
    };

    const title = rel(document.querySelector('.title-bar'));
    const leftUI = title ? { right: title.right + ICON_SIDE, bottom: title.bottom + ICON_UP } : null;

    let ru = rel(document.querySelector('.search-container'));
    if (this.suggestionsDropdown?.classList.contains('is-active')) {
      const dd = rel(this.suggestionsDropdown);
      if (dd) ru = ru
        ? { left: Math.min(ru.left, dd.left), right: Math.max(ru.right, dd.right), bottom: Math.max(ru.bottom, dd.bottom) }
        : dd;
    }
    const switcher = rel(document.querySelector('.language-switcher'));
    if (switcher) ru = ru
      ? { left: Math.min(ru.left, switcher.left), right: Math.max(ru.right, switcher.right), bottom: Math.max(ru.bottom, switcher.bottom) }
      : switcher;

    const rightUI = ru ? { left: ru.left - ICON_SIDE, bottom: ru.bottom + ICON_UP } : null;
    return { leftUI, rightUI };
  }

  executeNormalZoom(bounds, markersToZoom) {
    this.removeAllZoomFrames();
    this.stopDropdownOverlapDetection();

    const frameInfo = this.createZoomPreviewFrame(bounds);

    if (this.shouldActivateTransparency(bounds)) {
      this.startDropdownOverlapDetection(frameInfo.extendedBounds);
    }

    this.executeZoom(markersToZoom, false, frameInfo.layer);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // THREE-FRAME ZOOM (Für große Distanzen)
  // ═══════════════════════════════════════════════════════════════════════════

  async executeThreeFrameZoom(firstBounds, secondBounds, markersToZoom) {
    const DURATION_PART_1 = 0.85;
    const DURATION_PART_2 = 1.0;

    const combinedBounds = L.latLngBounds([
      [Math.min(firstBounds.getSouth(), secondBounds.getSouth()),
      Math.min(firstBounds.getWest(), secondBounds.getWest())],
      [Math.max(firstBounds.getNorth(), secondBounds.getNorth()),
      Math.max(firstBounds.getEast(), secondBounds.getEast())]
    ]).pad(0.05);

    const mapContainer = document.getElementById('map');
    mapContainer?.classList.add('map-is-zooming');
    this._isAutoZooming = true;
    this.stopDropdownOverlapDetection();

    const firstFrameInfo = this.createZoomPreviewFrame(firstBounds);
    let secondFrameInfo = null;

    setTimeout(() => {
      secondFrameInfo = this.createZoomPreviewFrame(secondBounds);
      if (this.shouldActivateTransparency(secondBounds)) {
        this.startDropdownOverlapDetection(secondFrameInfo.extendedBounds);
      }
    }, (DURATION_PART_1 * 1000) / 2);

    // Phase 1: Zoom Out
    await new Promise(resolve => {
      this.map.once('zoomend moveend', resolve);
      this.flyToBoundsTight(combinedBounds, { duration: DURATION_PART_1 });
    });

    this.removeZoomPreviewFrame(firstFrameInfo.layer);
    await new Promise(resolve => setTimeout(resolve, 500));

    this.stopDropdownOverlapDetection();

    // Phase 2: Zoom In
    await new Promise(resolve => {
      this.map.once('zoomend moveend', resolve);
      if (markersToZoom.length > 1) {
        this.flyToBoundsTight(
          L.featureGroup(markersToZoom).getBounds().pad(0.05),
          { duration: DURATION_PART_2 },
          markersToZoom.map(mk => mk.getLatLng())
        );
      } else {
        this.map.flyTo(markersToZoom[0].getLatLng(), 13, { duration: DURATION_PART_2 });
      }
    });

    this._isAutoZooming = false;
    this.suggestionsDropdown?.classList.remove('is-zooming');
    mapContainer?.classList.remove('map-is-zooming');

    setTimeout(() => {
      this.removeZoomPreviewFrame(secondFrameInfo?.layer);
      const isMobile = window.matchMedia('(max-width: 1024px), (min-width: 768px) and (pointer: coarse)').matches;
      if (!isMobile) this.searchBar?.focus();
    }, 800);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ZOOM EXECUTION
  // ═══════════════════════════════════════════════════════════════════════════

  executeZoom(markersToZoom, keepFrame = false, frameToRemove = null) {
    this.stopDropdownOverlapDetection();

    this._isAutoZooming = true;
    const zoomOptions = { duration: 1.0 };
    const zoomPromise = new Promise(resolve => {
      this.map.once('zoomend moveend', resolve);
      if (markersToZoom.length > 1) {
        this.flyToBoundsTight(
          L.featureGroup(markersToZoom).getBounds().pad(0.05),
          zoomOptions,
          markersToZoom.map(mk => mk.getLatLng())
        );
      } else {
        this.map.flyTo(markersToZoom[0].getLatLng(), 13, zoomOptions);
      }
    });

    zoomPromise.then(() => {
      this._isAutoZooming = false;
      this.suggestionsDropdown?.classList.remove('is-zooming');
      if (!keepFrame) {
        this.removeZoomPreviewFrame(frameToRemove);
      }
      const isMobile = window.matchMedia('(max-width: 1024px), (min-width: 768px) and (pointer: coarse)').matches;
      if (!isMobile) this.searchBar?.focus();
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ZOOM PREVIEW FRAMES
  // ═══════════════════════════════════════════════════════════════════════════

  createZoomPreviewFrame(bounds) {
    const mapContainer = document.getElementById('map');
    const viewportWidth = mapContainer.clientWidth;
    const viewportHeight = mapContainer.clientHeight;

    const centerLat = bounds.getCenter().lat;
    const centerLng = bounds.getCenter().lng;
    const targetZoom = this.map.getBoundsZoom(bounds);
    const mapCenter = L.latLng(centerLat, centerLng);
    const centerPoint = this.map.project(mapCenter, targetZoom);

    const topLeft = this.map.unproject(
      L.point(centerPoint.x - viewportWidth / 2, centerPoint.y - viewportHeight / 2),
      targetZoom
    );
    const bottomRight = this.map.unproject(
      L.point(centerPoint.x + viewportWidth / 2, centerPoint.y + viewportHeight / 2),
      targetZoom
    );

    const bufferFactor = 1.05;
    const frameWidth = (bottomRight.lng - topLeft.lng) * bufferFactor;
    const frameHeight = (topLeft.lat - bottomRight.lat) * bufferFactor;

    const extendedBounds = L.latLngBounds(
      [centerLat - frameHeight / 2, centerLng - frameWidth / 2],
      [centerLat + frameHeight / 2, centerLng + frameWidth / 2]
    );

    const outerRing = [[-90, -180], [90, -180], [90, 180], [-90, 180]];
    const innerRing = [
      [extendedBounds.getNorth(), extendedBounds.getWest()],
      [extendedBounds.getSouth(), extendedBounds.getWest()],
      [extendedBounds.getSouth(), extendedBounds.getEast()],
      [extendedBounds.getNorth(), extendedBounds.getEast()]
    ];

    const isDarkMode = AppConfig?.isDarkMode?.() || false;
    const borderWeight = isDarkMode ? 2 : 0;
    const borderColor = isDarkMode ? AppConfig.colours.zoomFrameBorder : AppConfig.colours.default;

    const zoomFrame = L.polygon([outerRing, innerRing], {
      color: borderColor,
      fillColor: AppConfig.colours.default,
      fillOpacity: 0,
      weight: borderWeight,
      opacity: 0.8,
      interactive: false,
      pane: 'overlayPane',
      className: 'zoom-preview-overlay'
    }).addTo(this.map);

    setTimeout(() => {
      if (zoomFrame?._path) {
        zoomFrame._path.style.transition = 'fill-opacity 0.4s ease-in-out';
        zoomFrame.setStyle({ fillOpacity: 0.4 });
      }
    }, 50);

    return { layer: zoomFrame, extendedBounds };
  }

  removeZoomPreviewFrame(frameLayer) {
    if (!frameLayer) return;

    if (frameLayer._path) {
      frameLayer._path.style.transition = 'fill-opacity 0.3s ease-in-out';
      frameLayer.setStyle({ fillOpacity: 0 });
    }

    setTimeout(() => {
      if (this.map.hasLayer(frameLayer)) {
        this.map.removeLayer(frameLayer);
      }
    }, 350);
  }

  removeAllZoomFrames() {
    this.map.eachLayer(layer => {
      if (layer.options?.className === 'zoom-preview-overlay') {
        this.removeZoomPreviewFrame(layer);
      }
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // TRANSPARENCY / OVERLAP DETECTION
  // ═══════════════════════════════════════════════════════════════════════════

  shouldActivateTransparency(bounds) {
    const mapSize = this.map.getSize();
    if (mapSize.x === 0 || mapSize.y === 0) return false;

    const mapArea = mapSize.x * mapSize.y;
    const frameTopLeft = this.map.latLngToContainerPoint(bounds.getNorthWest());
    const frameBottomRight = this.map.latLngToContainerPoint(bounds.getSouthEast());
    const frameWidth = Math.abs(frameBottomRight.x - frameTopLeft.x);
    const frameHeight = Math.abs(frameBottomRight.y - frameTopLeft.y);
    const frameArea = frameWidth * frameHeight;
    const AREA_THRESHOLD = 0.50;

    return (frameArea / mapArea) < AREA_THRESHOLD;
  }

  startDropdownOverlapDetection(zoomFrameBounds) {
    this.stopDropdownOverlapDetection();

    setTimeout(() => {
      this.overlapCheckFunction = () => this.checkDropdownZoomFrameOverlap(zoomFrameBounds);
      this.overlapCheckInterval = setInterval(this.overlapCheckFunction, 100);
      this.checkDropdownZoomFrameOverlap(zoomFrameBounds);
    }, 200);
  }

  checkDropdownZoomFrameOverlap(zoomFrameBounds) {
    const dropdown = this.suggestionsDropdown;
    if (!dropdown?.classList.contains('is-active')) {
      this.resetDropdownOpacity();
      return;
    }

    if (!zoomFrameBounds?.getNorthWest || !zoomFrameBounds?.getSouthEast) {
      this.resetDropdownOpacity();
      return;
    }

    const mapContainer = document.getElementById('map');
    const mapRect = mapContainer.getBoundingClientRect();
    const dropdownRect = dropdown.getBoundingClientRect();

    const dropdownLeft = dropdownRect.left - mapRect.left;
    const dropdownRight = dropdownRect.right - mapRect.left;

    const frameTopLeft = this.map.latLngToContainerPoint(zoomFrameBounds.getNorthWest());
    const frameBottomRight = this.map.latLngToContainerPoint(zoomFrameBounds.getSouthEast());

    if (!frameTopLeft || !frameBottomRight || isNaN(frameTopLeft.x) || isNaN(frameBottomRight.x)) {
      this.resetDropdownOpacity();
      return;
    }

    const frameLeft = frameTopLeft.x;
    const frameRight = frameBottomRight.x;
    const frameWidth = frameRight - frameLeft;

    if (frameWidth <= 0) {
      this.resetDropdownOpacity();
      return;
    }

    const overlapLeft = Math.max(dropdownLeft, frameLeft);
    const overlapRight = Math.min(dropdownRight, frameRight);
    const overlapWidth = Math.max(0, overlapRight - overlapLeft);
    const overlapPercentage = overlapWidth / frameWidth;

    const OVERLAP_THRESHOLD = 0.30;

    if (overlapPercentage >= OVERLAP_THRESHOLD) {
      this.reduceDropdownOpacity();
    } else {
      this.resetDropdownOpacity();
    }
  }

  reduceDropdownOpacity() {
    // Transparenz deaktiviert
  }

  resetDropdownOpacity() {
    // Transparenz deaktiviert
  }

  stopDropdownOverlapDetection() {
    if (this.overlapCheckInterval) {
      clearInterval(this.overlapCheckInterval);
      this.overlapCheckInterval = null;
    }
    this.resetDropdownOpacity();
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ZOOM INDICATOR (Rechtsklick auf Settings-Icon)
  // ═══════════════════════════════════════════════════════════════════════════

  toggleZoomIndicator() {
    if (this.zoomIndicatorActive) {
      this.deactivateZoomIndicator();
    } else {
      this.activateZoomIndicator();
    }
  }

  activateZoomIndicator() {
    if (this.zoomIndicatorActive) return;
    this.zoomIndicatorActive = true;
    this._createZoomIndicator();
    this.zoomIndicator.style.display = 'block';
    this.map.on('zoomend', this._updateZoomIndicator, this);
    document.addEventListener('mousemove', this._moveZoomIndicator);
    const nearbyHint = window.nearbySpacesManager?.hintElement;
    if (nearbyHint) nearbyHint.style.display = 'none';
  }

  deactivateZoomIndicator() {
    if (!this.zoomIndicatorActive) return;
    this.zoomIndicatorActive = false;
    if (this.zoomIndicator) {
      this.zoomIndicator.style.display = 'none';
    }
    this.map.off('zoomend', this._updateZoomIndicator, this);
    document.removeEventListener('mousemove', this._moveZoomIndicator);
    const nearbyHint = window.nearbySpacesManager?.hintElement;
    if (nearbyHint) nearbyHint.style.display = '';
  }

  _createZoomIndicator() {
    if (this.zoomIndicator) return;
    this.zoomIndicator = document.createElement('div');
    this.zoomIndicator.id = 'zoom-indicator';
    this.zoomIndicator.textContent = Math.round(this.map.getZoom());
    document.body.appendChild(this.zoomIndicator);

    this._moveZoomIndicator = (e) => {
      const offset = -3;
      this.zoomIndicator.style.left = (e.clientX + offset) + 'px';
      this.zoomIndicator.style.top = (e.clientY + offset) + 'px';
    };

    this._updateZoomIndicator = () => {
      this.zoomIndicator.textContent = Math.round(this.map.getZoom());
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // RESET
  // ═══════════════════════════════════════════════════════════════════════════

  handleEmptySearch() {
    if (this.previousZoomBounds) {
      this.previousZoomBounds = null;
      this.map?.flyTo(new L.LatLng(51.0122995, 10.3995537), 7, { duration: 1.5 });
    }
  }

  resetBounds() {
    this.previousZoomBounds = null;
  }
}


export { ZoomManager, computePolygonFit, findFitTranslation };
export const zoomManager = new ZoomManager();
