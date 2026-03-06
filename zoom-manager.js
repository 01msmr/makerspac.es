import AppConfig from './config.js';
import { appContext } from './app-context.js';

// zoom-manager.js - Zentrale Zoom-Logik für die Karte
// Enthält: Auto-Zoom, Three-Frame-Zoom, Zoom-Preview-Frames, Overlap-Detection

class ZoomManager {
  constructor() {
    this.map = null;
    this.suggestionsDropdown = null;
    this.searchBar = null;

    // State
    this.previousZoomBounds = null;
    this.zoomDebounceTimeout = null;
    this.ZOOM_THRESHOLD = AppConfig?.settings?.zoomThreshold || 2;

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

      // Mobile: schneller, direkter Zoom ohne Frame-Effekte
      if (window.innerWidth <= 767) {
        if (appContext.searchHeader?._manualSpaceClick) return;
        const uiH = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--mobile-ui-height')) || 0;
        this.map.fitBounds(newBounds, {
          animate: true,
          duration: 0.35,
          paddingTopLeft: L.point(8, 8),
          paddingBottomRight: L.point(8, 8 + uiH),
        });
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

  flyToBoundsTight(bounds, options = {}) {
    const origSnap = this.map.options.zoomSnap;
    this.map.options.zoomSnap = 0;
    const zoom = this.map.getBoundsZoom(bounds);
    let center = bounds.getCenter();

    const mapEl = document.getElementById('map');
    if (mapEl) {
      const mapRect = mapEl.getBoundingClientRect();

      let rightUI = 0;
      const settingsEl = document.querySelector('.language-switcher');
      const searchEl = document.querySelector('.search-container');
      if (settingsEl) {
        rightUI = mapRect.right - settingsEl.getBoundingClientRect().left;
      } else if (searchEl) {
        rightUI = mapRect.right - searchEl.getBoundingClientRect().left;
      }

      let leftUI = 0;
      const titleBar = document.querySelector('.title-bar');
      if (titleBar) {
        leftUI = titleBar.getBoundingClientRect().right - mapRect.left;
      }

      const xShift = (leftUI - rightUI) / 2;

      const centerPoint = this.map.project(center, zoom);
      center = this.map.unproject(
        L.point(centerPoint.x + xShift, centerPoint.y), zoom
      );
    }

    this.map.flyTo(center, zoom, options);
    this.map.once('moveend', () => { this.map.options.zoomSnap = origSnap; });
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
        this.flyToBoundsTight(L.featureGroup(markersToZoom).getBounds().pad(0.05), { duration: DURATION_PART_2 });
      } else {
        this.map.flyTo(markersToZoom[0].getLatLng(), 13, { duration: DURATION_PART_2 });
      }
    });

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

    const zoomOptions = { duration: 1.0 };
    const zoomPromise = new Promise(resolve => {
      this.map.once('zoomend moveend', resolve);
      if (markersToZoom.length > 1) {
        this.flyToBoundsTight(L.featureGroup(markersToZoom).getBounds().pad(0.05), zoomOptions);
      } else {
        this.map.flyTo(markersToZoom[0].getLatLng(), 13, zoomOptions);
      }
    });

    zoomPromise.then(() => {
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
    const borderColor = isDarkMode ? 'silver' : 'black';

    const zoomFrame = L.polygon([outerRing, innerRing], {
      color: borderColor,
      fillColor: 'black',
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


export { ZoomManager };
export const zoomManager = new ZoomManager();
