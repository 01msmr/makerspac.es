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

      // Status icon placeholder (always rendered for consistent indentation)
      const addressStatusIcon = `<span class="listing-status-icon">${statusIconHtml}</span>`;

      // Weekly meeting icon (nur wenn Meeting heute ist)
      const meetingIconHtml = this.getMeetingIconHtml(location);

      // Workshop-Anzahl
      const workshopsHtml = this.getWorkshopsHtml(location);



      

      // Item-HTML zusammenbauen
      item.innerHTML = `
        ${distanceBadgeHtml}
        <div class="listing-item-content">
          <div class="listing-item-name">
            <span class="${nameClass}">${styleIconHtml}${CONFIG.escapeHtml(location.name)}</span>
            ${bookmarkIcon} <!-- Bookmark ist hier oben rechts -->
          </div>
          <div class="listing-item-address">
            ${addressStatusIcon}
            <div class="listing-item-address-lines">
              ${streetHtml}
              <div class="listing-item-details">${flagHtml}${formattedPlz || ''} <b>${CONFIG.escapeHtml(location.loc.city)}</b></div>
            </div>
            ${meetingIconHtml} <!-- Erst das Heute-Badge -->
            ${workshopsHtml}   <!-- Dann die Workshops (wird per CSS nach rechts geschoben) -->
          </div>
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
        return `<i class="${CONFIG.icons.status.unknown} door-icon-unknown" style="opacity:0"></i> `;
      }

      const _t = (k) => window.i18n ? window.i18n.t(k) : '';
      if (location.isOpen === true) {
        return `<i class="${CONFIG.icons.status.open} door-icon-open" aria-label="${_t('tooltips.spaceOpen')}" role="tooltip" data-microtip-position="right"></i> `;
      } else if (location.isOpen === false) {
        return `<i class="${CONFIG.icons.status.closed} door-icon-closed" aria-label="${_t('tooltips.spaceClosed')}" role="tooltip" data-microtip-position="right"></i> `;
      } else {
        return `<i class="${CONFIG.icons.status.unknown} door-icon-unknown" aria-label="${_t('tooltips.spaceStatusLoading')}" role="tooltip" data-microtip-position="right"></i> `;
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

    /**
     * Formatiert die Uhrzeit aus dem weekly-Format (z.B. 1900 → "19:00")
     */
    formatWeeklyTime(time) {
      const str = String(time).padStart(4, '0');
      return str.slice(0, 2) + ':' + str.slice(2);
    }

    /**
     * Generiert das Meeting-Icon HTML (nur wenn Meeting heute ist)
     */
    getWorkshopsHtml(location) {
      if (!location.workshops || location.workshops.length === 0) return '';

      return `
    <span class="listing-workshops"
          aria-label="${CONFIG.getWorkshopsTooltip(location.workshops)}"
          role="tooltip"
          data-microtip-position="bottom-left">
      ${location.workshops.length} <i class="${CONFIG.icons.ui.workshops}"></i>
    </span>`;
    }

    getMeetingIconHtml(location) {
      if (!location.weekly || !location.weekly.time || location.weekly.weekday > 6) return '';
      if (location.weekly.weekday !== new Date().getDay()) return '';

      const todayLabel = window.i18n ? window.i18n.t('weekly.today') : 'heute';
      const weeklyTooltip = window.i18n ? window.i18n.t('weekly.tooltip') : 'wöchentliches Treffen';
      const timeStr = String(location.weekly.time).padStart(4, '0').replace(/(\d{2})(\d{2})/, '$1:$2');
      const timeSuffix = window.i18n ? window.i18n.t('weekly.timeSuffix') : ' Uhr';
      return `<span class="listing-meeting-today" aria-label="${weeklyTooltip} — ${timeStr}${timeSuffix}" role="tooltip" data-microtip-position="bottom-left"><i class="${CONFIG.icons.ui.calendarDay}"></i> ${todayLabel}</span>`;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // MEETING-TOOLTIP POSITION (bottom-left / top-left je nach Scroll-Position)
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Registriert Scroll-Listener auf Dropdown-Containern,
     * um Meeting-Tooltips am unteren Rand nach oben zu klappen.
     */
    initMeetingTooltipObserver(container) {
      if (!container) return;
      const update = () => this.updateMeetingTooltipPositions(container);
      container.addEventListener('scroll', update, { passive: true });
      // Einmal initial ausführen
      update();
    }

    updateMeetingTooltipPositions(container) {
      const containerRect = container.getBoundingClientRect();
      const halfY = containerRect.top + containerRect.height / 2;
      container.querySelectorAll('.listing-meeting-today, .listing-workshops').forEach(el => {
        const elRect = el.getBoundingClientRect();
        const inLowerHalf = elRect.top > halfY;
        el.setAttribute('data-microtip-position', inLowerHalf ? 'top-left' : 'bottom-left');
      });
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
      this.setKeyboardInput();

      // pointer-events deaktivieren um CSS :hover zu unterdrücken
      items.forEach(item => {
        item.style.pointerEvents = 'none';
      });

      // Einfache Index-Berechnung (wie Nearby)
      if (direction === 'down') {
        this.keyboardIndex = (this.keyboardIndex + 1) % items.length;
      } else if (direction === 'up') {
        this.keyboardIndex = this.keyboardIndex <= 0
          ? items.length - 1
          : this.keyboardIndex - 1;
      }

      this.updateKeyboardSelection(items);
    }

    /**
     * Aktualisiert die visuelle Keyboard-Selektion
     * Verwendet die GLEICHEN Methoden wie Maus-Navigation!
     */
    updateKeyboardSelection(items) {
      const newIndex = this.keyboardIndex;
      const newItem = items[newIndex];
      if (!newItem) return;

      const newLocationId = parseInt(newItem.dataset.locationId);
      const newLocation = window.locationById?.get(newLocationId);

      // 1. Altes Item: Effekte entfernen (wenn unterschiedlich)
      if (this.currentHoverItem && this.currentHoverItem !== newItem) {
        const oldLocationId = parseInt(this.currentHoverItem.dataset.locationId);
        const oldLocation = window.locationById?.get(oldLocationId);
        const oldIndex = Array.from(items).indexOf(this.currentHoverItem);

        // CSS-Klassen entfernen (Item + Nachbarn)
        for (let i = oldIndex - 1; i <= oldIndex + 1; i++) {
          if (items[i]) items[i].classList.remove('active');
        }

        // Alle visuellen Effekte entfernen (SVG, Marker, Line) - GLEICHE Methode wie Maus!
        if (oldLocation) {
          this.removeHoverEffects(oldLocation);
        }
      }

      // 2. Neues Item: CSS-Klassen setzen (Item + Nachbarn bereinigen)
      for (let i = newIndex - 1; i <= newIndex + 1; i++) {
        if (items[i]) items[i].classList.remove('active');
      }
      newItem.classList.add('active');
      this.scrollItemIntoContainer(newItem);

      // 3. Neues Item: Alle visuellen Effekte anwenden - GLEICHE Methode wie Maus!
      if (newLocation) {
        this.applyHoverEffects(newItem, newLocation);

        // SVG-Position nach Scroll-Animation aktualisieren
        setTimeout(() => this.updateHoverSVGPosition(), 150);
      }
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
      this.isDropdownHovering = true;
      this.currentHoverItem = item;

      // NUR visuelle Effekte - CSS-Klassen werden woanders verwaltet!
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
      // NUR visuelle Effekte entfernen - CSS-Klassen werden woanders verwaltet!
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
     * Setzt nur Marker-Effekte zurück (ohne currentHoverItem/SVG zu ändern)
     * Wird verwendet beim Wechsel zwischen Items
     */
    resetMarkerEffects(location) {
      const targetMarker = this.findMarkerByLocation(location);
      if (!targetMarker) return;

      // Marker zurück ins Cluster
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
     * SVG im Body mit position:fixed - wird bei Scroll/Navigation aktualisiert
     */
    createHoverSVG(item, location, color = 'blue') {
      this.cleanupHoverSVG();
      const itemRect = item.getBoundingClientRect();
      this.currentHoverSVG = CONFIG.createConnectorSVG(itemRect, color);
    }

    /**
     * Entfernt das Hover-SVG
     */
    cleanupHoverSVG() {
      CONFIG.cleanupConnectorSVG(this.currentHoverSVG);
      this.currentHoverSVG = null;
    }

    /**
     * Aktualisiert SVG-Position und Connection Line (beim Scrollen)
     */
    updateHoverSVGPosition() {
      if (this.currentHoverItem) {
        const location = this.getLocationFromItem(this.currentHoverItem);
        if (location) {
          const hoverColor = CONFIG.getDynamicSpaceColor(location);
          const itemRect = this.currentHoverItem.getBoundingClientRect();
          const targetMarker = this.findMarkerByLocation(location);

          // SVG-Position aktualisieren
          if (this.currentHoverSVG) {
            CONFIG.updateConnectorPosition(this.currentHoverSVG, itemRect);
          }

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
    // SCROLL-HELFER
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Scrollt ein Item sichtbar innerhalb seines Scroll-Containers.
     * Ersetzt scrollIntoView — vermeidet Konflikte mit scroll-margin und scroll-snap.
     * Nutzt scroll-padding-top aus CSS (deckt sticky-Elemente ab).
     */
    scrollItemIntoContainer(item) {
      const container = item.closest('.nearby-popover-list, #suggestions-dropdown');
      if (!container) return;

      const containerRect = container.getBoundingClientRect();
      const itemRect = item.getBoundingClientRect();

      // scroll-padding-top aus CSS lesen (deckt sticky-Header ab), Fallback auf padding-top
      const style = getComputedStyle(container);
      const scrollPadding = parseFloat(style.scrollPaddingTop) || 0;
      const topOffset = scrollPadding > 0 ? scrollPadding : (parseFloat(style.paddingTop) || 0);
      const visibleTop = containerRect.top + topOffset;

      if (itemRect.top < visibleTop) {
        container.scrollTo({
          top: container.scrollTop + (itemRect.top - visibleTop),
          behavior: 'smooth'
        });
      } else if (itemRect.bottom > containerRect.bottom) {
        container.scrollTo({
          top: container.scrollTop + (itemRect.bottom - containerRect.bottom),
          behavior: 'smooth'
        });
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

          // ✨ Maus übernimmt Kontrolle zurück von Tastatur
          if (this.lastInputMethod === 'keyboard') {
            this.lastInputMethod = 'mouse';
          }

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

    // ═══════════════════════════════════════════════════════════════════════════
    // ZENTRALE ITEM-LISTENER (für Search UND Nearby)
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Setup Event-Listener für alle Items in einem Container
     * @param {HTMLElement} container - Der Container mit .listing-item Elementen
     * @param {Object} options - Konfiguration
     * @param {Function} options.onItemClick - Click-Handler (location, item) => void
     * @param {number} options.connectionWeight - Liniendicke (default: connectionWeightSearch)
     * @param {boolean} options.keepHoverOnLeave - Hover-Effekte beim Verlassen behalten (für Nearby)
     */
    setupItemListeners(container, options = {}) {
      const {
        onItemClick,
        connectionWeight = CONFIG.settings.connectionWeightSearch,
        keepHoverOnLeave = false
      } = options;

      // Meeting-Tooltip Positionierung initialisieren
      this.initMeetingTooltipObserver(container);

      container.querySelectorAll('.listing-item').forEach(item => {
        const locationId = parseInt(item.dataset.locationId);
        const location = window.locationById?.get(locationId);
        if (!location) return;

        // Mouseenter
        item.addEventListener('mouseenter', () => {
          if (!this.hasMouseMoved()) return;
          this.setMouseInput();

          // Altes Item: CSS-Klasse und Marker-Effekte entfernen
          if (this.currentHoverItem && this.currentHoverItem !== item) {
            this.currentHoverItem.classList.remove('active');
            const oldLocation = this.getLocationFromItem(this.currentHoverItem);
            if (oldLocation) {
              this.resetMarkerEffects(oldLocation);
            }
          }

          // CSS-Klasse: Neues Item aktivieren
          item.classList.add('active');

          // Index synchronisieren
          const items = container.querySelectorAll('.listing-item');
          this.keyboardIndex = Array.from(items).indexOf(item);

          // Visuelle Effekte
          this.applyHoverEffects(item, location, connectionWeight);
        });

        // Mouseleave
        item.addEventListener('mouseleave', (e) => {
          // Ignorieren wenn wir zu einem anderen Item wechseln
          if (e.relatedTarget?.closest('.listing-item')) return;

          // Nearby-Modus: Alles beim Verlassen behalten
          if (keepHoverOnLeave) {
            return;
          }

          // Nicht aufräumen wenn Tastatur die Kontrolle übernommen hat
          // (pointer-events: none löst verzögertes mouseleave aus, das sonst
          // das frisch erstellte SVG des neuen Keyboard-Items zerstören würde)
          if (this.lastInputMethod === 'keyboard') {
            return;
          }

          // Standard (Dropdown): Alles entfernen
          item.classList.remove('active');
          this.removeHoverEffects(location);
        });

        // Click
        if (onItemClick) {
          item.addEventListener('click', () => onItemClick(location, item));
        }

        // Bookmarks
        if (window.bookmarkManager) {
          window.bookmarkManager.initializeBookmarkListeners(item);
        }
      });
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // GLOBALER EXPORT
  // ═══════════════════════════════════════════════════════════════════════════

  window.ListingCore = ListingCore;

  console.log('✅ ListingCore loaded');

})();
