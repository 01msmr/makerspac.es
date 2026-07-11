// @ts-check
// nearby-header.js - Nearby-Popover-UI
// Enthält: Popover mit Radius-Slider, Drag, Resize, Cursor-Hint

/** @typedef {import('./types.js').MakerSpace} MakerSpace */

/**
 * Geo-Koordinaten des letzten Rechtsklick/Long-Tap auf die Karte.
 * @typedef {Object} ClickLocation
 * @property {number} lat
 * @property {number} lon
 */

import AppConfig from './config.js';
import { appContext } from './app-context.js';

const CONFIG = AppConfig;

  class NearbyHeader {
    constructor() {
      this.map = null;
      this.listingCore = null;

      // State
      this.clickLocation = null;
      this.popoverElement = null;
      this.mobilePanel = null; // Phone-Layout: kompaktes Header-Panel im .search-container
      this._lastTouchLongPress = 0; // Timestamp des eigenen Long-Press (Dedupe für contextmenu/click)
      this.hintElement = null;
      this.searchCircle = null;
      this.nearbySpaces = [];
      this.resultsCache = {};

      // Radius
      this.radii = CONFIG.settings.radiusOptions;
      this.currentRadius = CONFIG.settings.defaultRadius;

      // Timers
      this.shrinkTimer = null;
      this.inactivityTimer = null;
      this.opacityTimer = null;
      this.isInactive = false;

      // UI-State
      this._isPopoverDragging = false;
      this.isPillDragging = false;
      this._pendingReactivationId = null;
      this.lastPixels = null;

      // rAF-Throttle für mousemove
      this._pendingMouseMove = null;
      this._lastMouseMoveEvent = null;
      this._mapEl = null;

      // Keyboard Handler
      this._keyboardHandler = this.handleKeyDown.bind(this);

    }

    /**
     * Initialisiert das NearbyHeader-Modul
     * @param {any} map - Leaflet Map-Instanz
     * @param {import('./listing-core.js').ListingCore} listingCore
     */
    init(map, listingCore) {
      if (window.embedModeActive) return;
      if (window !== window.top) return; // in iframe (e.g. about.html backdrop) — no nearby UI

      this.map = map;
      this.listingCore = listingCore;

      this.createHint();
      this.setupEventListeners();

    }

    // ═══════════════════════════════════════════════════════════════════════════
    // HINT-ELEMENT (Cursor-Hinweis)
    // ═══════════════════════════════════════════════════════════════════════════

    createHint() {
      if (this.hintElement) this.hintElement.remove();

      this.hintElement = document.createElement('div');
      this.hintElement.className = 'nearby-cursor-hint';

      const hintKey = ('ontouchstart' in window) ? 'nearbySpaces.hintTouch' : 'nearbySpaces.hint';
      const hintText = window.i18n?.t(hintKey) || (('ontouchstart' in window) ? 'Lange tippen für lokale Makerspaces' : 'Rechtsklick für lokale Makerspaces');
      this.hintElement.innerHTML = `
        <div class="hint-icon-wrapper">
          <i class="${CONFIG.icons.ui.crosshairs}"></i>
        </div>
        <span>${hintText}</span>
      `;

      document.body.appendChild(this.hintElement);
      this.startHintAutoShrink();
    }

    startHintAutoShrink() {
      clearTimeout(this.shrinkTimer);
      this.shrinkTimer = setTimeout(() => {
        if (this.hintElement) {
          this.hintElement.classList.add('icon-only');
        }
      }, CONFIG.settings.hintShrinkMs);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // EVENT-LISTENER
    // ═══════════════════════════════════════════════════════════════════════════

    setupEventListeners() {
      // Mausbewegung: Hint folgen
      document.addEventListener('mousemove', (e) => this.handleMouseMove(e));

      // Searchbar-Fokus: Nearby schließen
      const searchBar = document.getElementById('search-bar');
      if (searchBar) {
        searchBar.addEventListener('focus', () => this.hide());
      }

      // Rechtsklick: Nearby anzeigen
      this.map.on('contextmenu', (e) => {
        // Doppel-Trigger vermeiden: auf Geräten, wo tapHold/natives contextmenu
        // doch feuert (Android, PWA), hat der eigene Long-Press-Detektor schon
        // übernommen. Timestamp-Guard statt hartem Touch-Return, damit
        // Maus-Rechtsklick auf Touch-Laptops funktionsfähig bleibt.
        if (Date.now() - this._lastTouchLongPress < 1200) return;
        this.showAtCursor(
          e.latlng.lat,
          e.latlng.lng,
          e.originalEvent.clientX,
          e.originalEvent.clientY
        );
      });

      // Touch (Phone + Tablet): eigener Long-Press-Detektor.
      // Leaflets tapHold ist im iOS-Safari-TAB unzuverlässig: Safaris eigener
      // Long-Press-Recognizer feuert bei ~500ms ein touchcancel und bricht
      // tapHold ab (im Standalone-/PWA-Modus passiert das nicht).
      if ('ontouchstart' in window) {
        this._setupTouchLongPress();
      }

      // Linksklick auf Karte: Nearby anzeigen
      this.map.on('click', (e) => {
        // Phone-Layout: Nearby nur per Long-Tap (contextmenu) — einfacher Tap
        // öffnet/schließt nichts (Karte bleibt für Popups/Panning frei)
        if (this._isMobileLayout()) return;

        // Release-Click direkt nach eigenem Long-Press (Tablet) ignorieren
        if (Date.now() - this._lastTouchLongPress < 1200) return;

        // Klick auf den Search-Circle ignorieren
        if (e.originalEvent.target.classList?.contains('nearby-circle-draggable')) return;

        const isMap = e.originalEvent.target.classList.contains('leaflet-container') ||
          e.originalEvent.target.classList.contains('maplibregl-canvas');
        if (isMap) {
          this.showAtCursor(
            e.latlng.lat,
            e.latlng.lng,
            e.originalEvent.clientX,
            e.originalEvent.clientY
          );
        } else {
          this.hide();
        }
      });

      // Sprachwechsel
      document.addEventListener('languageChanged', () => {
        // NEU: Adresse sofort neu berechnen (für das Label "rund um")
        this.updateAddressHTML();

        if (this.popoverElement?.parentElement) {
          this.showPopover();
        }
        if (this.hintElement?.parentElement) {
          const hintKey = ('ontouchstart' in window) ? 'nearbySpaces.hintTouch' : 'nearbySpaces.hint';
          const hintText = window.i18n?.t(hintKey) || (('ontouchstart' in window) ? 'Lange tippen für lokale Makerspaces' : 'Rechtsklick für lokale Makerspaces');
          const span = this.hintElement.querySelector('span');
          if (span) span.textContent = hintText;
        }
      });
    }

    handleMouseMove(e) {
      this._lastMouseMoveEvent = e;
      if (this._pendingMouseMove) return;
      this._pendingMouseMove = requestAnimationFrame(() => {
        this._pendingMouseMove = null;
        this._updateHint(this._lastMouseMoveEvent);
      });
    }

    _updateHint(e) {
      if (!this.hintElement) return;

      // Hint-Position aktualisieren
      this.hintElement.style.left = (e.clientX + 8) + 'px';
      this.hintElement.style.top = (e.clientY + 8) + 'px';

      // Nur auf der Map sichtbar (nicht auf UI-Elementen, Controls, Popups)
      const mapContainer = this._mapEl ??= document.getElementById('map');
      const isOverMap = mapContainer && mapContainer.contains(e.target) &&
                        !e.target.closest('.leaflet-control-container') &&
                        !e.target.closest('.leaflet-popup');

      const settingsOpen = document.querySelector('.language-switcher .settings-popover:not(.is-hidden)');
      if (this.popoverElement || !isOverMap || settingsOpen || document.body.classList.contains('consent-active')) {
        this.hintElement.style.opacity = '0';
        return;
      }

      this.hintElement.style.opacity = '1';

      // Fade nach Inaktivität
      clearTimeout(this.opacityTimer);
      this.opacityTimer = setTimeout(() => {
        if (this.hintElement && !this.popoverElement) {
          this.hintElement.style.opacity = '0.3';
        }
      }, CONFIG.settings.hintFadeMs);

      // Auto-Shrink Reset
      if (this.isInactive) {
        this.isInactive = false;
        this.hintElement.classList.remove('icon-only');
        this.startHintAutoShrink();
      }

      clearTimeout(this.inactivityTimer);
      this.inactivityTimer = setTimeout(() => {
        this.isInactive = true;
      }, CONFIG.settings.inactivityMs);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // NEARBY ANZEIGEN
    // ═══════════════════════════════════════════════════════════════════════════

    showAtCursor(lat, lon, mouseX, mouseY) {
      // Nearby unterdrücken, solange der Consent-Banner offen ist
      if (document.body.classList.contains('consent-active')) return;

      // Phone-Layout: Nearby-Modus VOR den Clears setzen — unterdrückt
      // handleFilterResults-Rendering (Dropdown gehört jetzt der Nearby-Liste)
      if (this._isMobileLayout() && appContext.searchHeader) {
        appContext.searchHeader._nearbyMode = true;
      }

      // ✨ Suche und alle Filter löschen beim Aktivieren von Nearby (silent = kein UI-Update)
      if (appContext.searchHeader) {
        appContext.searchHeader._manualSpaceClick = true;
        appContext.searchHeader.clearSearch(false, true); // (shouldFocus=false, silent=true)
        appContext.searchHeader.clearAllFilters(true);    // (silent=true)
        appContext.searchHeader.closeDropdown?.();
        setTimeout(() => {
          if (appContext.searchHeader) {
            appContext.searchHeader._manualSpaceClick = false;
          }
        }, 500);
      }
      // Searchbar blur
      const searchBar = document.getElementById('search-bar');
      if (searchBar) searchBar.blur();

      this.lastPixels = { x: mouseX, y: mouseY };
      this.clickLocation = { lat, lon };
      this.updateNearbyData(lat, lon);

      // --- NEUE LOGIK: Kleinsten Radius mit >= 2 Items finden ---
      // Wir suchen den ersten Index in der Liste [10, 15, 25, 40, 65],
      // dessen Trefferzahl >= 2 ist.
      let bestIndex = this.radii.findIndex(r => (this.resultsCache[r] || []).length >= 2);

      // Fallback: Wenn nirgends 2 Treffer sind, nehmen wir den größten Radius (65km),
      // um zumindest die Chance auf einen einzelnen Treffer zu maximieren.
      if (bestIndex === -1) {
        bestIndex = this.radii.length - 1;
      }
      // ---------------------------------------------------------

      this.currentRadius = this.radii[bestIndex];
      this.drawSearchCircle(lat, lon);
      if (this._isMobileLayout()) {
        this.showMobileNearby();
      } else {
        this.showPopover(mouseX, mouseY);
      }

      if (this.hintElement) {
        this.hintElement.style.opacity = '0';
      }

      this.reverseGeocode(lat, lon);
    }

    reverseGeocode(lat, lon) {
      // 1. Initialzustand (Koordinaten) speichern
      this._currentAddressData = {
        lat: lat.toFixed(4),
        lon: lon.toFixed(4),
        street: null,
        cityPart: null
      };

      // Sofortige Anzeige der Koordinaten (während die API lädt)
      this.updateAddressHTML();

      fetch(`https://photon.komoot.io/reverse?lon=${lon}&lat=${lat}`)
        .then(r => r.ok ? r.json() : null)
        .then(data => {
          const p = data?.features?.[0]?.properties || {};
          this._currentAddressData.street = [p.street, p.housenumber].filter(Boolean).join(' ');
          this._currentAddressData.cityPart = [p.postcode, p.city || p.town || p.village].filter(Boolean).join(' ');
          this.updateAddressHTML();
        })
        .catch(() => {
          this.updateAddressHTML();
        });
    }


    updateAddressHTML() {
      if (!this._currentAddressData) return;

      const nearText = window.i18n?.t('nearbySpaces.nearLocation') || 'nahe';
      const { lat, lon, street, cityPart } = this._currentAddressData;

      if (street || cityPart) {
        // Format mit Adresse
        this._lastAddressHTML = `${nearText} &ensp;<b>${street ? street + ', ' : ''}</b><b style="color:var(--text-color)">${cityPart}</b>`;
      } else {
        // Fallback auf Koordinaten
        this._lastAddressHTML = `${nearText} &ensp;${lat}, ${lon}`;
      }

      // Falls das Popover offen ist, das Element direkt im DOM aktualisieren
      const addrElement = this.popoverElement?.querySelector('.nearby-click-address');
      if (addrElement) {
        addrElement.innerHTML = this._lastAddressHTML;
      }

      // Mobile-Panel: nur "PLZ Ort" (kurz), sobald das Geocoding eintrifft
      const placeEl = this.mobilePanel?.querySelector('.nearby-mobile-place');
      if (placeEl) {
        placeEl.textContent = this._mobilePlaceText();
      }
    }



    updateNearbyData(lat, lon) {
      if (!appContext.locations) return;

      const allWithDist = appContext.locations.map(loc => ({
        ...loc,
        distance: CONFIG.calculateDistance(lat, lon, loc.loc.lat, loc.loc.long)
      })).sort((a, b) => a.distance - b.distance);

      this.resultsCache = {};
      this.radii.forEach(r => {
        this.resultsCache[r] = allWithDist.filter(s => s.distance <= r);
      });
    }

    hide() {
      if (this._isCircleDragging) return;

      this.listingCore?.clearAllHoverEffects();

      // Circle-Drag-Handler aufräumen
      if (this._circleDragMove) {
        document.removeEventListener('mousemove', this._circleDragMove);
        this._circleDragMove = null;
      }
      if (this._circleDragUp) {
        document.removeEventListener('mouseup', this._circleDragUp);
        this._circleDragUp = null;
      }
      this._isCircleDragging = false;

      if (this.popoverElement) {
        this.popoverElement.remove();
      }
      this.popoverElement = null;

      // Mobile-Panel + Nearby-Modus aufräumen, normales Listing wiederherstellen
      if (this.mobilePanel) {
        this.mobilePanel.remove();
        this.mobilePanel = null;
      }
      if (appContext.searchHeader?._nearbyMode) {
        appContext.searchHeader._nearbyMode = false;
        appContext.searchHeader.triggerFilterUpdate();
      }

      if (this.searchCircle) {
        this.map.removeLayer(this.searchCircle);
      }
      this.searchCircle = null;

      if (this.map) {
        this.map.keyboard.enable();
        this.map.dragging.enable();
      }

      document.removeEventListener('keydown', this._keyboardHandler, true);
      this.listingCore.keyboardIndex = -1;

      if (this.hintElement) {
        this.hintElement.style.display = 'flex';
        this.hintElement.classList.remove('icon-only');
        this.startHintAutoShrink();
      }
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // SEARCH CIRCLE
    // ═══════════════════════════════════════════════════════════════════════════

    drawSearchCircle(lat, lon, animate = false) {
      const targetRadius = this.currentRadius * 1000;
      const circleColor = CONFIG.getHoverColor();

      if (!this.searchCircle) {
        // Phone-Layout: Kreis nicht interaktiv — setupCircleDrag nutzt reine
        // Maus-Events (funktioniert auf Touch nicht) und 1-Finger-Ziehen
        // kollidierte mit dem Karten-Panning. Neustart per neuem Long-Tap.
        const isMobile = this._isMobileLayout();
        this.searchCircle = L.circle([lat, lon], {
          radius: targetRadius,
          color: circleColor,
          weight: 3,
          fillOpacity: 0.15,
          interactive: !isMobile,
          bubblingMouseEvents: false,
          className: 'nearby-circle-draggable',
          pane: 'overlayPane'
        }).addTo(this.map);
        if (!isMobile) this.setupCircleDrag();
      } else {
        this.searchCircle.setLatLng([lat, lon]);

        if (animate) {
          const startRadius = this.searchCircle.getRadius();
          const radiusDiff = targetRadius - startRadius;
          const duration = 200;
          const startTime = performance.now();

          const animateRadius = (currentTime) => {
            const elapsed = currentTime - startTime;
            const progress = Math.min(elapsed / duration, 1);
            const eased = progress < 0.5
              ? 2 * progress * progress
              : 1 - Math.pow(-2 * progress + 2, 2) / 2;

            this.searchCircle.setRadius(startRadius + radiusDiff * eased);

            if (progress < 1) {
              requestAnimationFrame(animateRadius);
            }
          };

          requestAnimationFrame(animateRadius);
        } else {
          this.searchCircle.setRadius(targetRadius);
        }
      }
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // CIRCLE DRAG
    // ═══════════════════════════════════════════════════════════════════════════

    setupCircleDrag() {
      if (!this.searchCircle) return;

      let isDragging = false;
      let dragStartLatLng = null;
      let circleStartLatLng = null;

      // Cursor: move beim Hovern über dem Kreis
      this.searchCircle.on('mouseover', () => {
        if (!isDragging) this.map.getContainer().style.cursor = 'move';
      });
      this.searchCircle.on('mouseout', () => {
        if (!isDragging) this.map.getContainer().style.cursor = '';
      });

      // Drag starten
      this.searchCircle.on('mousedown', (e) => {
        isDragging = true;
        this._isCircleDragging = true;
        dragStartLatLng = e.latlng;
        circleStartLatLng = this.searchCircle.getLatLng();
        this.map.dragging.disable();

        const el = this.searchCircle.getElement();
        if (el) el.style.cursor = 'grabbing';
        this.map.getContainer().style.cursor = 'grabbing';

        L.DomEvent.stop(e.originalEvent);
      });

      // Drag bewegen (document-level, damit es auch außerhalb des Kreises funktioniert)
      this._circleDragMove = (e) => {
        if (!isDragging) return;
        const latlng = this.map.mouseEventToLatLng(e);
        const latDiff = latlng.lat - dragStartLatLng.lat;
        const lngDiff = latlng.lng - dragStartLatLng.lng;
        this.searchCircle.setLatLng([
          circleStartLatLng.lat + latDiff,
          circleStartLatLng.lng + lngDiff
        ]);
      };

      // Drag beenden → Daten aktualisieren
      this._circleDragUp = () => {
        if (!isDragging) return;
        isDragging = false;
        this._isCircleDragging = false;
        this.map.dragging.enable();

        const el = this.searchCircle.getElement();
        if (el) el.style.cursor = '';
        this.map.getContainer().style.cursor = '';

        // Neue Position übernehmen
        const newCenter = this.searchCircle.getLatLng();
        this.clickLocation = { lat: newCenter.lat, lon: newCenter.lng };
        this.updateNearbyData(newCenter.lat, newCenter.lng);
        this.reverseGeocode(newCenter.lat, newCenter.lng);
        this.showPopover();
      };

      document.addEventListener('mousemove', this._circleDragMove);
      document.addEventListener('mouseup', this._circleDragUp);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // POPOVER
    // ═══════════════════════════════════════════════════════════════════════════

    showPopover(mouseX, mouseY) {
      const x = mouseX || this.lastPixels?.x || 0;
      const y = mouseY || this.lastPixels?.y || 0;
      const currentSpaces = this.resultsCache[this.currentRadius] || [];
      const isFirstTime = !this.popoverElement;

      if (isFirstTime) {
        this.popoverElement = document.createElement('div');
        this.popoverElement.className = 'nearby-popover settings-popover';
        L.DomEvent.disableClickPropagation(this.popoverElement);
        L.DomEvent.disableScrollPropagation(this.popoverElement);
        document.addEventListener('keydown', this._keyboardHandler, true);
      }

      if (this.map) {
        this.map.keyboard.disable();
      }

      if (isFirstTime) {
        this.listingCore.keyboardIndex = -1;
      }

      // HTML generieren
      const headerHTML = this.createHeaderHTML(currentSpaces.length);
      const listHTML = this.createListHTML(currentSpaces);

      if (isFirstTime) {
        this.popoverElement.innerHTML = `
          <div class="nearby-popover-header">${headerHTML}</div>
          <div class="nearby-popover-list listing-container">${listHTML}</div>
          <div class="nearby-resize-handle"><i class="${CONFIG.icons.ui.grip}"></i></div>
        `;
        document.body.appendChild(this.popoverElement);
        this.attachPopoverEventListeners();
        this.positionPopover(x, y);
      } else {
        this.popoverElement.querySelector('.nearby-popover-header').innerHTML = headerHTML;
        this.popoverElement.querySelector('.nearby-popover-list').innerHTML = listHTML;
        this.reattachListeners();

        // Pending Reactivation
        if (this._pendingReactivationId !== null) {
          const reactivationId = this._pendingReactivationId;
          this._pendingReactivationId = null;

          requestAnimationFrame(() => {
            const items = this.popoverElement?.querySelectorAll('.listing-item');
            if (!items) return;

            let foundIndex = -1;
            items.forEach((item, idx) => {
              if (parseInt(item.dataset.locationId) === reactivationId) {
                foundIndex = idx;
              }
            });

            if (foundIndex !== -1) {
              this.listingCore.keyboardIndex = foundIndex;
              this.listingCore.updateKeyboardSelection(items);
            } else {
              this.listingCore.keyboardIndex = -1;
              this.listingCore.currentHoverItem = null;
              this.listingCore.removeConnectionLine();
              this.listingCore.cleanupHoverSVG();
            }

            if (this.map) this.map.dragging.enable();
          });
        } else {
          if (this.map) this.map.dragging.enable();
        }
      }
    }

    /** Radius-Slider-HTML — gemeinsam für Desktop-Popover und Mobile-Panel */
    createSliderHTML() {
      const radiusText = window.i18n?.t('nearbySpaces.radius') || 'Umkreis';
      const currentIndex = this.radii.indexOf(this.currentRadius);
      const fraction = currentIndex / (this.radii.length - 1);
      const pillPosition = `calc(28px + (100% - 56px) * ${fraction})`;

      return `
        <div class="nearby-radius-slider-container">
          <div class="nearby-radius-slider-row">
            <span class="nearby-radius-label-prefix">${radiusText}</span>
            <div class="nearby-radius-track">
              <div class="nearby-radius-labels">
                ${this.radii.map((r, idx) =>
                  `<span class="nearby-radius-label ${this.currentRadius === r ? 'active' : ''}" data-index="${idx}">${r}&thinsp;km</span>`
                ).join('')}
              </div>
              <div class="nearby-radius-pill" data-current-index="${currentIndex}" style="left: ${pillPosition}">
                ${this.currentRadius}&thinsp;km
              </div>
              ${this.radii.map((r, idx) => {
                const f = idx / (this.radii.length - 1);
                const pos = `calc(28px + (100% - 56px) * ${f})`;
                return `<button class="nearby-radius-clickarea" data-index="${idx}" style="left: ${pos}"></button>`;
              }).join('')}
            </div>
          </div>
        </div>
      `;
    }

    createHeaderHTML(count) {
      const makerspaceText = window.i18n?.t('nearbySpaces.makerspaces') || 'Makerspaces';

      return `
        <div class="nearby-header-row-top">
          <span class="nearby-grip-wrapper"><i class="${CONFIG.icons.ui.grip}"></i></span>
          <span class="nearby-header-text"><b>${count} ${makerspaceText}</b></span>
          <span class="nearby-grip-wrapper"><i class="${CONFIG.icons.ui.grip}"></i></span>
        </div>
        <div class="nearby-header-row-address">
          <span class="nearby-click-address">${this._lastAddressHTML || ''}</span>
        </div>
        <div class="nearby-header-row-bottom">
          ${this.createSliderHTML()}
        </div>
      `;
    }

    createListHTML(spaces) {
      if (spaces.length === 0) {
        const emptyText = window.i18n?.t('nearbySpaces.empty') || 'keine makerspaces … Umkreis erweitern';
        return `<div class="nearby-empty">&nbsp;&nbsp;${emptyText}</div>`;
      }

      return spaces.slice(0, CONFIG.settings.maxListItems).map((space, idx) => {
        const item = this.listingCore.createItem(space, {
          showDistance: true,
          distance: space.distance,
          showBookmark: true,
          showStreet: true,
          showFlag: true
        });

        // Alternating background
        if (idx % 2 !== 0) {
          item.classList.add('listing-item-alt');
        }

        return item.outerHTML;
      }).join('');
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // MOBILE (Phone-Layout ≤767px): Header-Panel + Treffer im Suggestions-Dropdown
    // ═══════════════════════════════════════════════════════════════════════════

    /** Phone-Layout? Layout-Frage → Breite (Tablets behalten den Desktop-Popover) */
    _isMobileLayout() {
      return window.innerWidth <= 767;
    }

    /**
     * Eigener Long-Press-Detektor für Touch-Geräte (Phone + Tablet).
     * Bricht NUR bei touchend (früh losgelassen) oder touchmove > Toleranz ab.
     * touchcancel wird bewusst ignoriert: iOS Safari (Browser-Tab) cancelt die
     * Geste bei ~500ms, wenn sein eigener Long-Press-Recognizer übernimmt —
     * der Finger liegt aber noch auf dem Glas, und die System-UI (Loupe/
     * Selektion) ist per CSS unterdrückt (#map user-select/touch-callout).
     */
    _setupTouchLongPress() {
      const container = this.map.getContainer();
      const HOLD_MS = 500;
      const MOVE_TOLERANCE = 12;
      let timer = null;
      let startX = 0, startY = 0;

      const cancel = () => { clearTimeout(timer); timer = null; };

      container.addEventListener('touchstart', (e) => {
        cancel();
        if (e.touches.length !== 1) return; // Pinch/Mehrfinger: kein Long-Press
        const target = /** @type {HTMLElement} */ (e.target);
        // Nur auf der Karte selbst — nicht auf Markern, Popups oder Controls
        if (target.closest('.leaflet-marker-icon, .leaflet-popup, .leaflet-control-container')) return;
        startX = e.touches[0].clientX;
        startY = e.touches[0].clientY;
        timer = setTimeout(() => {
          timer = null;
          this._lastTouchLongPress = Date.now();
          const rect = container.getBoundingClientRect();
          const latlng = this.map.containerPointToLatLng(
            L.point(startX - rect.left, startY - rect.top)
          );
          this.showAtCursor(latlng.lat, latlng.lng, startX, startY);
        }, HOLD_MS);
      }, { passive: true });

      container.addEventListener('touchmove', (e) => {
        if (!timer) return;
        const t = e.touches[0];
        if (Math.abs(t.clientX - startX) > MOVE_TOLERANCE ||
            Math.abs(t.clientY - startY) > MOVE_TOLERANCE) {
          cancel(); // Panning begonnen
        }
      }, { passive: true });

      container.addEventListener('touchend', cancel, { passive: true });
      // KEIN touchcancel-Listener — siehe JSDoc oben
    }

    /**
     * Zeigt Nearby im Mobile-Layout: kompaktes Header-Panel (Count + Ort + Slider,
     * fix über der Liste) im .search-container; Treffer im normalen Dropdown.
     */
    showMobileNearby() {
      if (!this.mobilePanel) {
        this.mobilePanel = document.createElement('div');
        this.mobilePanel.className = 'nearby-mobile-panel';
        // column-reverse im .search-container: letztes DOM-Kind = optisch oben (an der Karte)
        document.querySelector('.search-container')?.appendChild(this.mobilePanel);
      }
      this.updateMobileNearby();
      this._fitMobileToCircle();
    }

    /** Panel-Inhalt + Dropdown-Liste aktualisieren (initial und nach Radius-Wechsel) */
    updateMobileNearby() {
      if (!this.mobilePanel) return;
      const spaces = this.resultsCache[this.currentRadius] || [];
      const makerspaceText = window.i18n?.t('nearbySpaces.makerspaces') || 'Makerspaces';
      const nearText = window.i18n?.t('nearbySpaces.nearLocation') || 'nahe';

      this.mobilePanel.innerHTML = `
        <div class="nearby-mobile-row-top">
          <span class="nearby-mobile-title"><b>${spaces.length} ${makerspaceText}</b>&nbsp;${nearText}&nbsp;<span class="nearby-mobile-place">${this._mobilePlaceText()}</span></span>
          <button class="nearby-mobile-close" aria-label="Schließen"><i class="fas fa-xmark"></i></button>
        </div>
        ${this.createSliderHTML()}
      `;
      this.mobilePanel.querySelector('.nearby-mobile-close')?.addEventListener('click', () => this.hide());
      this.setupRadiusControls(this.mobilePanel);
      this._renderMobileList(spaces);
    }

    /** Kurzer Ortstext für den Mobile-Header: nur "PLZ Ort", Fallback Koordinaten */
    _mobilePlaceText() {
      const d = this._currentAddressData;
      if (!d) return '';
      return d.cityPart || `${d.lat}, ${d.lon}`;
    }

    /** Treffer (distanz-sortiert) im Mobile-Design ins Suggestions-Dropdown rendern */
    _renderMobileList(spaces) {
      const sh = appContext.searchHeader;
      const dropdown = document.getElementById('suggestions-dropdown');
      if (!sh || !dropdown) return;

      dropdown.querySelectorAll('.listing-item, .country-group-header, .id-match-separator, .nearby-empty')
        .forEach(el => el.remove());

      const fragment = document.createDocumentFragment();
      spaces.forEach(space => {
        // showStreet: true — Mobile-CSS versteckt die Straßenzeile ohnehin
        // (search.css: address-lines > div:first-child); ohne sie würde die
        // PLZ-Zeile zur ersten und fälschlich ausgeblendet.
        fragment.appendChild(this.listingCore.createItem(space, {
          distanceLine: true,
          distance: space.distance,
          showBookmark: true,
          showStreet: true,
          showFlag: true,
          zfill: sh.zfill
        }));
      });
      dropdown.appendChild(fragment);
      dropdown.classList.add('is-active');
      sh.updateSearchCounter(spaces.length);

      // Zentrale Item-Listener (Tap → Popup, wie im Such-Dropdown)
      this.listingCore.setupItemListeners(dropdown, {
        onItemClick: (location) => sh.handleItemClick(location),
        connectionWeight: CONFIG.settings.connectionWeightSearch
      });
    }

    /** Karte auf den Suchkreis zoomen; Kreis-Bounds als Rezoom-Ziel (#map-zoom-out-btn) */
    _fitMobileToCircle() {
      const zm = window.zoomManager;
      if (!this.searchCircle || !this.map || !zm) return;
      // Panel wurde gerade eingehängt → --mobile-ui-height erst nach ResizeObserver-Tick aktuell
      requestAnimationFrame(() => requestAnimationFrame(() => {
        if (!this.searchCircle) return;
        // 20% Luft um den Umkreis; symmetrisches Padding relativ zum sichtbaren
        // Kartenbereich (Bottom-UI via uiH ausgeglichen) → Kreis vertikal mittig
        const bounds = this.searchCircle.getBounds().pad(0.2);
        const uiH = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--mobile-ui-height')) || 0;
        zm.previousZoomBounds = bounds; // → Rezoom-Button zoomt auf die Nearby-Gesamtheit
        zm._isAutoZooming = true;
        zm._userMoved = false;
        this.map.once('moveend', () => { zm._isAutoZooming = false; });
        this.map.fitBounds(bounds, {
          animate: true,
          duration: 0.35,
          paddingTopLeft: L.point(8, 8),
          paddingBottomRight: L.point(8, 8 + uiH),
        });
      }));
    }

    // Untere Grenze des sichtbaren Kartenbereichs (exkl. Dropdown-UI am unteren Rand)
    _visibleBottom() {
      const uiH = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--mobile-ui-height')) || 0;
      return window.innerHeight - uiH;
    }

    positionPopover(mouseX, mouseY) {
      if (!this.popoverElement) return;

      const popWidth = 320;
      const popHeight = this.popoverElement.offsetHeight;
      const visBottom = this._visibleBottom();

      const left = Math.max(8, Math.min(mouseX + 15, window.innerWidth - popWidth - 8));
      const top = Math.max(8, Math.min(mouseY + 15, visBottom - popHeight - 8));

      this.popoverElement.style.left = left + 'px';
      this.popoverElement.style.top = top + 'px';
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // POPOVER EVENT-LISTENER
    // ═══════════════════════════════════════════════════════════════════════════

    attachPopoverEventListeners() {
      // Close Button
      this.popoverElement.querySelector('.nearby-close-btn')?.addEventListener('click', () => this.hide());

      // Drag
      this.setupPopoverDrag();

      // Resize
      this.setupPopoverResize();

      // Scroll → SVG-Position aktualisieren
      this.popoverElement.querySelector('.nearby-popover-list')?.addEventListener('scroll', () => {
        this.listingCore?.updateHoverSVGPosition();
      });

      // Mouse-Tracking (nicht während Drag!)
      this.popoverElement.addEventListener('mousemove', (e) => {
        if (this._isPopoverDragging) return;

        if (e.clientX !== this.listingCore?._lastMousePos?.x || e.clientY !== this.listingCore?._lastMousePos?.y) {
          this.listingCore._lastMousePos = { x: e.clientX, y: e.clientY };
          this.listingCore._mouseHasMoved = true;

          this.popoverElement.querySelectorAll('.listing-item').forEach(item => {
            item.style.pointerEvents = '';
          });
        }
      });

      // Beim Verlassen des Popovers: Aktiven State sicherstellen
      this.popoverElement.addEventListener('mouseleave', () => {
        if (this._isPopoverDragging) return;

        // Aktiven State aktiv wiederherstellen (Sicherheitsnetz)
        if (this.listingCore?.currentHoverItem) {
          const item = this.listingCore.currentHoverItem;
          // Sicherstellen dass .active Klasse vorhanden ist
          if (!item.classList.contains('active')) {
            item.classList.add('active');
          }
          // keyboardIndex synchronisieren
          const items = this.popoverElement?.querySelectorAll('.listing-item');
          if (items) {
            const idx = Array.from(items).indexOf(item);
            if (idx !== -1) {
              this.listingCore.keyboardIndex = idx;
            }
          }
        }

        // Mouse-Tracking zurücksetzen damit nachfolgende Events den State nicht ändern
        this.listingCore?.resetMouseTracking();
      });

      this.reattachListeners();
    }

    setupPopoverDrag() {
      let isDragging = false;
      let startPos = { x: 0, y: 0 };
      let savedDragState = null;

      this.popoverElement.addEventListener('pointerdown', (e) => {
        if (e.target.closest('.nearby-radius-track, .nearby-radius-pill, .nearby-radius-clickarea, .nearby-close-btn, .listing-item, .nearby-resize-handle')) {
          return;
        }

        isDragging = true;
        this._isPopoverDragging = true;
        this.popoverElement.style.cursor = 'grabbing';
        e.preventDefault();
        e.stopPropagation();

        // Aktiven State VOR dem Drag sichern (Maus-Bewegung zum Header kann ihn verändert haben)
        savedDragState = null;
        if (this.listingCore) {
          const items = this.popoverElement?.querySelectorAll('.listing-item');
          const savedIndex = this.listingCore.keyboardIndex;
          const savedItem = (savedIndex >= 0 && items?.[savedIndex]) ? items[savedIndex] : this.listingCore.currentHoverItem;
          if (savedItem) {
            savedDragState = {
              locationId: parseInt(savedItem.dataset.locationId),
              keyboardIndex: savedIndex
            };
          }
        }

        startPos = {
          x: e.clientX - this.popoverElement.offsetLeft,
          y: e.clientY - this.popoverElement.offsetTop
        };

        this.popoverElement.setPointerCapture(e.pointerId);
        if (this.map) this.map.dragging.disable();
      });

      this.popoverElement.addEventListener('pointermove', (e) => {
        if (!isDragging) return;

        const newLeft = Math.max(8, Math.min(e.clientX - startPos.x, window.innerWidth - this.popoverElement.offsetWidth - 8));
        const newTop = Math.max(8, Math.min(e.clientY - startPos.y, this._visibleBottom() - this.popoverElement.offsetHeight - 8));

        this.popoverElement.style.left = newLeft + 'px';
        this.popoverElement.style.top = newTop + 'px';

        this.listingCore?.updateHoverSVGPosition();
      });

      this.popoverElement.addEventListener('pointerup', () => {
        if (!isDragging) return;

        isDragging = false;
        this.popoverElement.style.cursor = '';

        setTimeout(() => {
          // Gesicherten State wiederherstellen
          if (savedDragState && this.listingCore) {
            const items = this.popoverElement?.querySelectorAll('.listing-item');
            if (items) {
              // Alle active-Klassen entfernen
              items.forEach(item => item.classList.remove('active'));

              // Gespeichertes Item anhand locationId finden (DOM-Referenz könnte stale sein)
              let targetItem = null;
              let targetIndex = -1;
              items.forEach((item, idx) => {
                if (parseInt(item.dataset.locationId) === savedDragState.locationId) {
                  targetItem = item;
                  targetIndex = idx;
                }
              });

              if (targetItem) {
                const location = appContext.locationById.get(savedDragState.locationId);
                if (location) {
                  // keyboardIndex wiederherstellen
                  this.listingCore.keyboardIndex = targetIndex;
                  // Active-Klasse setzen
                  targetItem.classList.add('active');
                  // Visuelle Effekte neu anwenden
                  this.listingCore.applyHoverEffects(targetItem, location, CONFIG.settings.connectionWeightNearby);
                }
              }
            }
          }

          // Mouse-Tracking zurücksetzen damit mouseenter nicht sofort feuert
          this.listingCore?.resetMouseTracking();
          this._isPopoverDragging = false;
          if (this.map) this.map.dragging.enable();
        }, 1);
      });
    }

    setupPopoverResize() {
      const resizeHandle = this.popoverElement.querySelector('.nearby-resize-handle');
      const list = this.popoverElement.querySelector('.nearby-popover-list');
      const ITEM_HEIGHT = CONFIG.settings.itemHeight;
      const MIN_ITEMS = CONFIG.settings.minVisibleItems;
      const MAX_ITEMS = CONFIG.settings.maxVisibleItems;

      if (!resizeHandle || !list) return;

      let isResizing = false;
      let startY = 0;
      let startHeight = 0;

      resizeHandle.addEventListener('pointerdown', (e) => {
        isResizing = true;
        startY = e.clientY;
        startHeight = list.offsetHeight;
        resizeHandle.setPointerCapture(e.pointerId);
        e.preventDefault();
        e.stopPropagation();

        if (this.map) this.map.dragging.disable();
      });

      resizeHandle.addEventListener('pointermove', (e) => {
        if (!isResizing) return;

        const deltaY = e.clientY - startY;
        const newHeight = startHeight + deltaY;
        const itemCount = Math.round(newHeight / ITEM_HEIGHT);
        const actualItemCount = list.querySelectorAll('.listing-item').length;

        const currentMaxItems = Math.round(list.offsetHeight / ITEM_HEIGHT);
        const wantsMore = itemCount > currentMaxItems;
        const cantExpand = actualItemCount <= currentMaxItems;

        if (wantsMore && cantExpand && !resizeHandle.classList.contains('limit-reached')) {
          resizeHandle.classList.add('limit-reached');
          setTimeout(() => resizeHandle.classList.remove('limit-reached'), 300);
        }

        const maxPossible = Math.min(MAX_ITEMS, actualItemCount);
        const clampedCount = Math.max(MIN_ITEMS, Math.min(maxPossible, itemCount));
        let snappedHeight = clampedCount * ITEM_HEIGHT;

        // Viewport-Constraint: Popover inkl. Resize-Handle muss sichtbar bleiben (8px Abstand)
        const popTop = this.popoverElement.offsetTop;
        const nonListHeight = this.popoverElement.offsetHeight - list.offsetHeight;
        const maxListHeight = this._visibleBottom() - popTop - nonListHeight - 8;
        snappedHeight = Math.min(snappedHeight, Math.max(MIN_ITEMS * ITEM_HEIGHT, maxListHeight));

        list.style.maxHeight = snappedHeight + 'px';
        this.listingCore?.updateHoverSVGPosition();
      });

      resizeHandle.addEventListener('pointerup', (e) => {
        if (!isResizing) return;
        isResizing = false;
        resizeHandle.releasePointerCapture(e.pointerId);
        if (this.map) this.map.dragging.enable();
      });
    }

    reattachListeners() {
      // Radius Controls
      this.setupRadiusControls();

      // Zentrale Item-Listener (wie Search, nur mit Nearby-spezifischem connectionWeight)
      const listContainer = this.popoverElement.querySelector('.nearby-popover-list');
      this.listingCore?.setupItemListeners(listContainer, {
        onItemClick: (location) => {
          const marker = appContext.markerById.get(location.id);
          if (marker) {
            appContext.map.flyTo(marker.getLatLng(), CONFIG.settings.defaultZoomLevel);
            setTimeout(() => {
              marker.openPopup();
              this.hide();
            }, 500);
          }
        },
        connectionWeight: CONFIG.settings.connectionWeightNearby,
        keepHoverOnLeave: true
      });
    }

    /** @param {HTMLElement} [root] - Container mit Slider (Desktop-Popover oder Mobile-Panel) */
    setupRadiusControls(root = this.popoverElement) {
      const pill = root.querySelector('.nearby-radius-pill');
      const track = root.querySelector('.nearby-radius-track');

      if (!pill || !track) return;

      // Pill Dragging
      pill.addEventListener('pointerdown', (e) => {
        e.stopPropagation();
        this.isPillDragging = true;
        pill.classList.add('dragging');
        pill.setPointerCapture(e.pointerId);
        if (this.map) this.map.dragging.disable();
        e.preventDefault();
      });

      pill.addEventListener('pointermove', (e) => {
        if (!this.isPillDragging) return;
        e.stopPropagation();

        const trackRect = track.getBoundingClientRect();
        const pillWidth = 50;
        const pillHalfWidth = pillWidth / 2;
        const trackPadding = 3;

        const leftLimit = trackPadding + pillHalfWidth;
        const rightLimit = trackRect.width - trackPadding - pillHalfWidth;
        const innerWidth = rightLimit - leftLimit;

        const mouseX = e.clientX - trackRect.left;
        const clampedX = Math.max(leftLimit, Math.min(mouseX, rightLimit));

        pill.style.left = `${clampedX}px`;

        const currentPct = ((clampedX - leftLimit) / innerWidth) * 100;
        const snapIdx = Math.round(currentPct / (100 / (this.radii.length - 1)));
        const startIdx = this.radii.indexOf(this.currentRadius);

        if (snapIdx !== startIdx) {
          pill.textContent = snapIdx > startIdx ? '>' : '<';
        }

        pill.dataset.currentIndex = snapIdx;
      });

      pill.addEventListener('pointerup', (e) => {
        if (!this.isPillDragging) return;
        e.stopPropagation();

        this.isPillDragging = false;
        pill.classList.remove('dragging');
        pill.releasePointerCapture(e.pointerId);

        const newIndex = parseInt(pill.dataset.currentIndex);
        this.changeRadius(this.radii[newIndex]);
      });

      // Track/Label Clicks
      track.addEventListener('pointerdown', (e) => e.stopPropagation());

      track.addEventListener('click', (e) => {
        if (this.isPillDragging) return;

        if (e.target.classList.contains('nearby-radius-label')) {
          const index = parseInt(e.target.dataset.index);
          this.changeRadius(this.radii[index]);
          return;
        }

        if (e.target === pill || pill.contains(e.target)) return;

        const trackRect = track.getBoundingClientRect();
        const relativeX = e.clientX - trackRect.left - 28;
        const innerWidth = trackRect.width - 56;
        const percentage = (relativeX / innerWidth) * 100;
        const snapIndex = Math.round(percentage / (100 / (this.radii.length - 1)));
        const safeIndex = Math.max(0, Math.min(snapIndex, this.radii.length - 1));

        this.changeRadius(this.radii[safeIndex]);
      });

      // Click Areas
      root.querySelectorAll('.nearby-radius-clickarea').forEach(button => {
        button.addEventListener('pointerdown', (e) => {
          e.stopPropagation();
          const index = parseInt(e.target.dataset.index);
          this.changeRadius(this.radii[index]);
        });
      });
    }

    changeRadius(newRadius) {
      if (this.currentRadius === newRadius) return;

      // Aktiven Space speichern
      this._pendingReactivationId = null;
      if (this.listingCore?.currentHoverItem) {
        this._pendingReactivationId = parseInt(this.listingCore.currentHoverItem.dataset.locationId);
        this.listingCore.currentHoverItem = null;
      }

      const root = this.popoverElement || this.mobilePanel;
      const pill = root?.querySelector('.nearby-radius-pill');
      const oldIndex = this.radii.indexOf(this.currentRadius);
      const newIndex = this.radii.indexOf(newRadius);

      if (pill) {
        const fraction = newIndex / (this.radii.length - 1);
        const newPosition = `calc(28px + (100% - 56px) * ${fraction})`;

        pill.textContent = newIndex > oldIndex ? '>' : '<';
        pill.style.left = newPosition;
        pill.dataset.currentIndex = newIndex;

        root.querySelectorAll('.nearby-radius-label').forEach((label, idx) => {
          label.classList.toggle('active', idx === newIndex);
        });

        setTimeout(() => {
          if (pill) pill.textContent = newRadius + '\u2009km';
        }, 300);
      }

      this.currentRadius = newRadius;

      if (this.clickLocation) {
        this.drawSearchCircle(this.clickLocation.lat, this.clickLocation.lon, true);
      }

      setTimeout(() => {
        if (this.popoverElement) {
          this.showPopover();
        } else if (this.mobilePanel) {
          this.updateMobileNearby();
          this._fitMobileToCircle(); // neuer Radius \u2192 Kreis wieder einpassen
        }
      }, 320);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // KEYBOARD-NAVIGATION
    // ═══════════════════════════════════════════════════════════════════════════

    handleKeyDown(e) {
      if (!this.popoverElement) return;

      e.stopImmediatePropagation(); // capture phase: block ALL keys from reaching search-header etc.

      const navKeys = ['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight', 'Enter', 'Escape', 'Tab'];
      if (!navKeys.includes(e.key)) return;

      e.preventDefault();

      const listContainer = this.popoverElement.querySelector('.nearby-popover-list');
      const items = listContainer?.querySelectorAll('.listing-item');

      // Tab / ArrowUp/Down: Zentrale Navigation nutzen (wie Search-Dropdown)
      if (e.key === 'Tab' || e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        const direction = (e.key === 'ArrowDown' || (e.key === 'Tab' && !e.shiftKey)) ? 'down' : 'up';
        this.listingCore?.navigateDropdown(direction, listContainer);
        return;
      }

      // ArrowLeft/Right: Radius ändern (Nearby-spezifisch)
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        let idx = this.radii.indexOf(this.currentRadius);
        const newIdx = e.key === 'ArrowRight'
          ? Math.min(idx + 1, this.radii.length - 1)
          : Math.max(idx - 1, 0);
        this.changeRadius(this.radii[newIdx]);
        return;
      }

      // Enter: Item anklicken
      if (e.key === 'Enter') {
        if (this.listingCore?.keyboardIndex >= 0 && items?.[this.listingCore.keyboardIndex]) {
          items[this.listingCore.keyboardIndex].click();
        }
        return;
      }

      // Escape: Schließen
      if (e.key === 'Escape') {
        this.hide();
        return;
      }
    }

  }

export { NearbyHeader };
