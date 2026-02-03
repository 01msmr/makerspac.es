// listing-core.js - Gemeinsame Item-Darstellung, Navigation und Hover-Effekte
// Wird von search-header.js und nearby-header.js genutzt

(function() {
  'use strict';

  const CONFIG = window.AppConfig;

  class ListingCore {
    constructor() {
      this.currentHoverItem = null;
      this.currentHoverSVG = null;
      this.keyboardIndex = -1;
      this.dropdownItems = [];
      this.connectionLine = null;
      this.connectionWeight = CONFIG.settings.connectionWeightSearch;
      this.popupTimeout = null;
      this.isDropdownHovering = false;

      // Mutual Exclusion zwischen Maus und Tastatur
      this.lastInputMethod = null;
      this._mouseHasMoved = false;
      this._lastMousePos = { x: 0, y: 0 };
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // ITEM-ERSTELLUNG (Gemeinsam für Search und Nearby)
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Erstellt ein einheitliches Listing-Item
     * @param {Object} location - Location-Objekt
     * @param {Object} options - Optionen
     * @param {boolean} options.showDistance - Zeige km-Badge (nur nearby)
     * @param {number} options.distance - Entfernung in km
     * @param {boolean} options.showBookmark - Zeige Bookmark-Icon
     * @param {boolean} options.showStreet - Zeige Straßendetails
     * @param {boolean} options.showFlag - Zeige Länder-Flagge in Details
     * @param {Function} options.zfill - PLZ-Formatierung Funktion
     * @returns {HTMLElement} Das erstellte Item-Element
     */
    createItem(location, options = {}) {
      const {
        showDistance = false,
        distance = null,
        showBookmark = true,
        showStreet = true,
        showFlag = false,
        zfill = (plz) => plz
      } = options;

      const item = document.createElement('div');
      item.classList.add('listing-item');
      item.dataset.locationId = location.ID;

      // Status-Farbe bestimmen
      const statusColor = this.getStatusColor(location);
      item.style.setProperty('--status-color', statusColor);

      // Icons generieren
      const styleIconHtml = this.getStyleIconHtml(location);
      const statusIconHtml = this.getStatusIconHtml(location);
      const nameClass = this.getNameClass(location);

      // Bookmark-Icon
      const bookmarkIcon = showBookmark && window.bookmarkManager
        ? window.bookmarkManager.createBookmarkIcon(location.ID, 'listing-bookmark')
        : '';

      // Country-Flag (für Nearby)
      const countryCode = CONFIG.getCountryCode(location.loc.country);
      const flagHtml = showFlag
        ? `<span class="fi fi-${countryCode}" style="margin-right: 4px;"></span>`
        : '';

      // PLZ formatieren
      const formattedPlz = zfill(location.loc.plz, location.loc.country);

      // Distance Badge (nur für Nearby)
      const distanceBadgeHtml = showDistance && distance !== null
        ? `<span class="listing-dist-badge">${Math.round(distance)} km</span>`
        : '';

      // Street-Details
      const streetHtml = showStreet && location.loc.street
        ? `<div class="listing-item-details">${CONFIG.escapeHtml(location.loc.street.name || '')} ${CONFIG.escapeHtml(location.loc.street.number || '')} ${CONFIG.escapeHtml(location.loc.street.ext || '')}</div>`
        : '';

      // Item-HTML zusammenbauen
      item.innerHTML = `
        ${distanceBadgeHtml}
        <div class="listing-item-content">
          <div class="listing-item-name">
            <span class="${nameClass}">${styleIconHtml}${statusIconHtml}${CONFIG.escapeHtml(location.name)}</span>
            ${bookmarkIcon}
          </div>
          ${streetHtml}
          <div class="listing-item-details">${flagHtml}${formattedPlz || ''} <b>${CONFIG.escapeHtml(location.loc.city)}</b></div>
        </div>
      `;

      return item;
    }

    /**
     * Bestimmt die Status-Farbe für ein Item
     */
    getStatusColor(location) {
      if (location.isOpen === true) {
        return 'var(--space-open)';
      } else if (location.isOpen === false) {
        return 'var(--space-closed)';
      } else if (location.spaceapi && location.spaceapi.endpoint) {
        return 'var(--space-unknown)';
      }
      return 'var(--space-hover)';
    }

    /**
     * Generiert das Style-Icon HTML
     */
    getStyleIconHtml(location) {
      const locationStyle = location.style ? location.style.toLowerCase() : '';
      const styleIconClass = CONFIG.getStyleIcon(locationStyle);
      if (styleIconClass) {
        return `<i class="${styleIconClass} style-icon" title="${location.style || ''}"></i> `;
      }
      return '';
    }

    /**
     * Generiert das Status-Icon HTML (SpaceAPI)
     */
    getStatusIconHtml(location) {
      if (!location.spaceapi || !location.spaceapi.endpoint) {
        return '';
      }

      if (location.isOpen === true) {
        return `<i class="${CONFIG.icons.status.open} door-icon-open" title="Space ist geöffnet"></i> `;
      } else if (location.isOpen === false) {
        return `<i class="${CONFIG.icons.status.closed} door-icon-closed" title="Space ist geschlossen"></i> `;
      } else {
        return `<i class="${CONFIG.icons.status.unknown} door-icon-unknown" title="Space-Status unbekannt"></i> `;
      }
    }

    /**
     * Bestimmt die CSS-Klasse für den Namen
     */
    getNameClass(location) {
      if (!location.spaceapi || !location.spaceapi.endpoint) {
        return 'space-name-default';
      }
      if (location.isOpen === true) return 'space-name-open';
      if (location.isOpen === false) return 'space-name-closed';
      return 'space-name-unknown';
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // KEYBOARD-NAVIGATION
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Navigiert im Dropdown (hoch/runter)
     * @param {string} direction - 'up' oder 'down'
     * @param {HTMLElement} container - Der Container mit den Items
     */
    navigateDropdown(direction, container) {
      const items = container.querySelectorAll('.listing-item');
      if (items.length === 0) return;

      // Tastatur übernimmt Kontrolle
      this.lastInputMethod = 'keyboard';
      this._mouseHasMoved = false;

      // pointer-events deaktivieren um CSS :hover zu unterdrücken
      items.forEach(item => {
        item.style.pointerEvents = 'none';
      });

      let newIndex = this.keyboardIndex;

      // ✨ NEU: Bei Wechsel von Maus zu Tastatur, übernehme aktuelle Mausposition
      if (this.keyboardIndex === -1 && this.currentHoverItem) {
        const itemsArray = Array.from(items);
        const hoverIndex = itemsArray.indexOf(this.currentHoverItem);
        if (hoverIndex !== -1) {
          // Übernehme die Mausposition als Startpunkt
          newIndex = hoverIndex;
          // Bei 'down' bleiben wir dort, bei 'up' gehen wir eins hoch
          if (direction === 'up' && newIndex > 0) {
            newIndex = newIndex - 1;
          } else if (direction === 'down' && newIndex < items.length - 1) {
            newIndex = newIndex + 1;
          }
          this.keyboardIndex = newIndex;
          this.updateKeyboardSelection(items);
          return;
        }
      }

      if (direction === 'down') {
        newIndex = (this.keyboardIndex + 1) % items.length;
      } else if (direction === 'up') {
        if (this.keyboardIndex === -1) {
          newIndex = items.length - 1;
        } else {
          newIndex = (this.keyboardIndex - 1 + items.length) % items.length;
        }
      }

      this.keyboardIndex = newIndex;
      this.updateKeyboardSelection(items);
    }

    /**
     * Aktualisiert die visuelle Keyboard-Selektion
     */
    updateKeyboardSelection(items) {
      items.forEach((item, idx) => {
        if (idx === this.keyboardIndex) {
          item.classList.add('active');
          // Kein Inline-Style! CSS .active übernimmt das Styling
          item.scrollIntoView({ block: 'nearest', behavior: 'smooth' });

          // Hover-Effekte anwenden
          const locationId = parseInt(item.dataset.locationId);
          const location = window.locationById?.get(locationId);
          if (location) {
            this.applyHoverEffects(item, location);
          }
        } else {
          item.classList.remove('active');

          // Vorherige Hover-Effekte entfernen
          if (this.currentHoverItem === item) {
            const locationId = parseInt(item.dataset.locationId);
            const location = window.locationById?.get(locationId);
            if (location) {
              this.removeHoverEffects(location);
            }
          }
        }
      });
    }

    /**
     * Setzt die Keyboard-Navigation zurück
     */
    resetKeyboardNavigation() {
      this.keyboardIndex = -1;
      this.clearActiveItem();
    }

    /**
     * Entfernt aktive Markierung von allen Items
     */
    clearActiveItem() {
      document.querySelectorAll('.listing-item.active').forEach(item => {
        item.classList.remove('active');
      });
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // HOVER-EFFEKTE
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Wendet Hover-Effekte auf ein Item an
     * @param {HTMLElement} item - Das Item-Element
     * @param {Object} location - Location-Objekt
     * @param {number} weight - Liniendicke für Connection Line
     */
    applyHoverEffects(item, location, weight = CONFIG.settings.connectionWeightSearch) {
      this.connectionWeight = weight;

      // Vorherige Hover-Klassen entfernen
      document.querySelectorAll('.listing-item.active').forEach(el => {
        el.classList.remove('active');
      });

      item.classList.add('active');
      this.isDropdownHovering = true;
      this.currentHoverItem = item;

      const hoverColor = CONFIG.getDynamicSpaceColor(location);
      this.createHoverSVG(item, location, hoverColor);

      const targetMarker = this.findMarkerByLocation(location);

      if (targetMarker) {
        const clusterGroup = window.clusterGroup;
        const isClusteringActive = window.mapUtils?.isClusteringEnabled();

        // Marker aus Cluster holen wenn nötig
        if (isClusteringActive && clusterGroup) {
          const visibleParent = clusterGroup.getVisibleParent(targetMarker);
          if (visibleParent && visibleParent !== targetMarker) {
            targetMarker.addTo(window.map);
            targetMarker._isTemporarilyUnclustered = true;
          }
        }

        // Marker-State setzen
        if (window.markerStateManager) {
          window.markerStateManager.setState(targetMarker.locationId, { isDropdownHovering: true });
        }

        if (window.mapUtils?.setMarkerDropdownHover) {
          window.mapUtils.setMarkerDropdownHover(targetMarker, true);
        }

        // Hover-Icon setzen
        targetMarker.setIcon(this.createHoverIcon(hoverColor));

        // Connection Line erstellen
        this.createConnectionLine(item, targetMarker, hoverColor);

        // Popup nach Verzögerung öffnen
        this.popupTimeout = setTimeout(() => {
          if (this.isDropdownHovering) {
            targetMarker._openedByHover = true;
            targetMarker.openPopup();
          }
        }, CONFIG.settings.popupDelayMs);
      }
    }

    /**
     * Entfernt Hover-Effekte
     * @param {Object} location - Location-Objekt
     */
    removeHoverEffects(location) {
      if (this.currentHoverItem) {
        this.currentHoverItem.classList.remove('active');
      }

      this.isDropdownHovering = false;
      this.currentHoverItem = null;
      this.cleanupHoverSVG();
      this.removeConnectionLine();

      if (this.popupTimeout) {
        clearTimeout(this.popupTimeout);
        this.popupTimeout = null;
      }

      const targetMarker = this.findMarkerByLocation(location);
      if (targetMarker) {
        // Marker zurück ins Cluster geben
        if (targetMarker._isTemporarilyUnclustered) {
          window.map.removeLayer(targetMarker);
          targetMarker._isTemporarilyUnclustered = false;
        }

        // Marker-State zurücksetzen
        if (window.markerStateManager) {
          window.markerStateManager.setState(targetMarker.locationId, { isDropdownHovering: false });
        }

        if (window.mapUtils?.clearMarkerDropdownHover) {
          window.mapUtils.clearMarkerDropdownHover(targetMarker);
        }

        // Popup schließen (außer sticky)
        if (!this.isStickyMarker(targetMarker)) {
          targetMarker.closePopup();
        }

        // Original-Icon wiederherstellen
        if (window.mapUtils?.updateMarkerIcon) {
          window.mapUtils.updateMarkerIcon(targetMarker, location);
        }
      }
    }

    /**
     * Entfernt alle Hover-Effekte (für Cleanup)
     */
    clearAllHoverEffects() {
      document.querySelectorAll('.listing-item.active').forEach(item => {
        item.classList.remove('active');
      });

      if (this.currentHoverItem) {
        const locationId = parseInt(this.currentHoverItem.dataset.locationId);
        const location = window.locationById?.get(locationId);
        if (location) {
          this.removeHoverEffects(location);
        }
        this.currentHoverItem = null;
      }
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // HOVER-SVG (Visuelle Verbindung zum Item)
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Erstellt das Hover-SVG für ein Item
     */
    createHoverSVG(item, location, color = 'blue') {
      this.cleanupHoverSVG();
      const itemRect = item.getBoundingClientRect();
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.id = 'current-connector';
      svg.style.cssText = `position: fixed; left: ${itemRect.left - 50}px; top: ${itemRect.top - 0.5}px; width: 80px; height: ${itemRect.height}px; z-index: 999; pointer-events: none;`;
      svg.setAttribute('viewBox', '65 0 570 620');
      svg.setAttribute('preserveAspectRatio', 'none');

      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', 'M632.86,6.618L436.232,6.618C416.818,6.599 396.254,9.684 376.225,16.429C356.196,23.174 336.703,33.579 319.618,47.041C302.534,60.503 287.858,77.022 276.615,94.918C265.373,112.813 257.563,132.086 253.041,150.966C244.69,186.193 226.089,220.425 195.188,245.142C164.286,269.858 121.084,285.059 70.815,284.779L70.815,336.251C121.084,335.971 164.286,351.172 195.188,375.888C226.089,400.604 244.69,434.836 253.041,470.064C257.563,488.944 276.615,526.112 287.858,544.008C302.534,560.527 319.618,573.988 336.703,587.45C356.196,597.856 376.225,604.6 396.254,611.345C416.818,614.43 436.232,614.412 436.232,614.412L632.86,614.412L632.86,6.618Z');
      path.setAttribute('fill', color);
      svg.appendChild(path);

      document.body.appendChild(svg);
      this.currentHoverSVG = svg;
    }

    /**
     * Entfernt das Hover-SVG
     */
    cleanupHoverSVG() {
      if (this.currentHoverSVG) {
        this.currentHoverSVG.remove();
        this.currentHoverSVG = null;
      }
      const svg = document.getElementById('current-connector');
      if (svg) svg.remove();
    }

    /**
     * Aktualisiert die Position des Hover-SVG (beim Scrollen)
     */
    updateHoverSVGPosition() {
      if (this.currentHoverSVG && this.currentHoverItem) {
        const location = this.getLocationFromItem(this.currentHoverItem);
        if (location) {
          const hoverColor = CONFIG.getDynamicSpaceColor(location);
          const itemRect = this.currentHoverItem.getBoundingClientRect();
          const targetMarker = this.findMarkerByLocation(location);

          this.currentHoverSVG.style.left = `${itemRect.left - 50}px`;
          this.currentHoverSVG.style.top = `${itemRect.top - 0.5}px`;

          // Connection Line neu zeichnen
          this.removeConnectionLine();
          if (targetMarker) {
            this.createConnectionLine(this.currentHoverItem, targetMarker, hoverColor);
          }
        }
      }
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // CONNECTION LINE
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Erstellt eine Connection Line zum Marker
     */
    createConnectionLine(item, targetMarker, color = '#0000ff') {
      if (window.mapUtils?.createConnectionLine) {
        this.connectionLine = window.mapUtils.createConnectionLine(item, targetMarker, color, this.connectionWeight);
      }
    }

    /**
     * Entfernt die Connection Line
     */
    removeConnectionLine() {
      if (window.mapUtils?.removeConnectionLine) {
        window.mapUtils.removeConnectionLine();
        this.connectionLine = null;
      }
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // MARKER-HELFER
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Findet einen Marker anhand der Location
     */
    findMarkerByLocation(location) {
      return window.markerById?.get(location.ID) || null;
    }

    /**
     * Prüft ob ein Marker sticky ist
     */
    isStickyMarker(marker) {
      return window.mapUtils?.currentStickyMarker === marker;
    }

    /**
     * Erstellt ein Hover-Icon für Leaflet
     */
    createHoverIcon(color) {
      const iconSvg = `
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 25 41">
          <path fill="${color}" stroke="#000" stroke-width="1" d="M12.5,1 C6.16,1 1,6.16 1,12.5 C1,20.88 12.5,39 12.5,39 C12.5,39 24,20.88 24,12.5 C24,6.16 18.84,1 12.5,1 Z"/>
          <circle fill="#fff" cx="12.5" cy="12.5" r="3"/>
        </svg>`;
      return new L.Icon({
        iconUrl: 'data:image/svg+xml;base64,' + btoa(iconSvg),
        shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
        iconSize: [37.5, 61.5],
        iconAnchor: [18.75, 61.5],
        popupAnchor: [1.5, -51],
        shadowSize: [61.5, 61.5]
      });
    }

    /**
     * Holt Location-Objekt aus einem Item-Element
     */
    getLocationFromItem(item) {
      const locationId = item.dataset.locationId;
      if (locationId) {
        const id = parseInt(locationId, 10);
        return window.locationById?.get(id) || null;
      }
      return null;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // MAUS-TRACKING (Mutual Exclusion)
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Setup Mousemove-Tracking für einen Container
     */
    setupMouseTracking(container) {
      container.addEventListener('mousemove', (e) => {
        if (e.clientX !== this._lastMousePos.x || e.clientY !== this._lastMousePos.y) {
          this._lastMousePos = { x: e.clientX, y: e.clientY };
          this._mouseHasMoved = true;

          // pointer-events wieder aktivieren
          container.querySelectorAll('.listing-item').forEach(item => {
            if (item.style.pointerEvents === 'none') {
              item.style.pointerEvents = '';
            }
          });
        }
      });
    }

    /**
     * Prüft ob Maus sich bewegt hat (für mouseenter Events)
     */
    hasMouseMoved() {
      return this._mouseHasMoved;
    }

    /**
     * Setzt Maus-Tracking zurück (nach Keyboard-Aktion)
     */
    resetMouseTracking() {
      this._mouseHasMoved = false;
    }

    /**
     * Setzt Eingabemethode auf Maus
     */
    setMouseInput() {
      this.lastInputMethod = 'mouse';
    }

    /**
     * Setzt Eingabemethode auf Tastatur
     */
    setKeyboardInput() {
      this.lastInputMethod = 'keyboard';
      this._mouseHasMoved = false;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // GLOBALER EXPORT
  // ═══════════════════════════════════════════════════════════════════════════

  window.ListingCore = ListingCore;

  console.log('✅ ListingCore loaded');

})();
