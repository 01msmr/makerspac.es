// nearby-spaces.js
class NearbySpacesManager {
  constructor() {
    this.map = null;
    this.clickLocation = null;
    this.popoverElement = null;
    this.cursorIcon = null;
    this.hintElement = null;
    this.nearbySpaces = [];
    this.currentRadius = 25;
    this.searchCircle = null;
    this.radii = [15, 25, 40, 65];

    this.shrinkTimer = null;
    this.inactivityTimer = null;
    this.opacityTimer = null;
    this.isInactive = false;
    this.isOverSearchUI = false; // Flag für UI-Hover

    this.keyboardIndex = -1;
    this.currentHoverItem = null;
    this._keyboardHandler = this.handleKeyDown.bind(this);
    this.lastInputMethod = null;  // 'mouse' oder 'keyboard' - letztes aktives Eingabemedium
    this._mouseHasMoved = false;  // Wird auf true gesetzt wenn Maus sich tatsächlich bewegt
    this._lastMousePos = { x: 0, y: 0 };  // Letzte bekannte Mausposition
    this.styleIconMap = window.MapIcons.styleMap;
  }

  init(map) {
    if (window.embedModeActive) return;
    this.map = map;
    this.createHint();
    this.setupEventListeners();

    // Nearby-Fenster schließen bei Such-Fokus
    const searchBar = document.getElementById('search-bar');
    const dropdown = document.getElementById('suggestions-dropdown');

    if (searchBar) {
      searchBar.addEventListener('focus', () => this.hide());

      // ✅ NEU: Flag setzen wenn Maus über Searchbar
      searchBar.addEventListener('mouseenter', () => { this.isOverSearchUI = true; this.updateHintState(); });
      searchBar.addEventListener('mouseleave', () => { this.isOverSearchUI = false; });
    }

    // ✅ NEU: Flag setzen wenn Maus über Dropdown
    if (dropdown) {
      dropdown.addEventListener('mouseenter', () => { this.isOverSearchUI = true; this.updateHintState(); });
      dropdown.addEventListener('mouseleave', () => { this.isOverSearchUI = false; });
    }

    // ✅ Home-Button/Logo (.title)
    const titleElement = document.querySelector('.title');
    if (titleElement) {
      titleElement.addEventListener('mouseenter', () => { this.isOverSearchUI = true; this.updateHintState(); });
      titleElement.addEventListener('mouseleave', () => { this.isOverSearchUI = false; });
    }

    // ✅ User Guide
    const userGuide = document.querySelector('.user-guide');
    if (userGuide) {
      userGuide.addEventListener('mouseenter', () => { this.isOverSearchUI = true; this.updateHintState(); });
      userGuide.addEventListener('mouseleave', () => { this.isOverSearchUI = false; });
    }

    // ✅ Add Makerspace
    const addMakerspace = document.querySelector('.add-makerspace');
    if (addMakerspace) {
      addMakerspace.addEventListener('mouseenter', () => { this.isOverSearchUI = true; this.updateHintState(); });
      addMakerspace.addEventListener('mouseleave', () => { this.isOverSearchUI = false; });
    }

    // ✅ Leaflet Controls (Zoom-Buttons etc.)
    const leafletControls = document.querySelectorAll('.leaflet-control');
    leafletControls.forEach(control => {
      control.addEventListener('mouseenter', () => { this.isOverSearchUI = true; this.updateHintState(); });
      control.addEventListener('mouseleave', () => { this.isOverSearchUI = false; });
    });

    // ✅ Marker-Popups (dynamisch, da sie erst bei Klick erstellt werden)
    document.addEventListener('mouseenter', (e) => {
      if (e.target.closest('.leaflet-popup')) {
        this.isOverSearchUI = true;
        this.updateHintState();
      }
    }, true);
    document.addEventListener('mouseleave', (e) => {
      if (e.target.closest('.leaflet-popup')) {
        this.isOverSearchUI = false;
      }
    }, true);

    document.addEventListener('languageChanged', () => {
      // Update Popup wenn offen
      if (this.popoverElement && this.popoverElement.parentElement) this.showPopover();

      // ✅ Update Hint-Text bei Sprachwechsel
      if (this.hintElement && this.hintElement.parentElement) {
        const hintText = window.i18n ?
          window.i18n.t('nearbySpaces.hint') :
          'Rechtsklick für lokale Makerspaces';
        const span = this.hintElement.querySelector('span');
        if (span) span.textContent = hintText;
      }
    });
  }

  // Hilfsmethode um Hint sofort auszublenden
  updateHintState() {
    if (this.isOverSearchUI && this.hintElement) {
      this.hintElement.style.opacity = "0";
    }
  }

  createHint() {
    if (this.hintElement) this.hintElement.remove();
    this.hintElement = document.createElement('div');
    this.hintElement.className = 'nearby-cursor-hint';

    // ✅ Übersetzter Hint-Text
    const hintText = window.i18n ?
      window.i18n.t('nearbySpaces.hint') :
      'Rechtsklick für lokale Makerspaces';

    this.hintElement.innerHTML = `<div class="hint-icon-wrapper"><i class="fas fa-crosshairs"></i></div><span>${hintText}</span>`;
    document.body.appendChild(this.hintElement);
    this.startHintAutoShrink();
  }

  startHintAutoShrink() {
    clearTimeout(this.shrinkTimer);
    this.shrinkTimer = setTimeout(() => { if (this.hintElement) this.hintElement.classList.add('icon-only'); }, 1350);
  }

  setupEventListeners() {
    document.addEventListener('mousemove', (e) => {
      if (!this.hintElement) return;

      // Position immer aktualisieren
      this.hintElement.style.left = (e.clientX + 8) + 'px';
      this.hintElement.style.top = (e.clientY + 8) + 'px';

      // ✅ Logik für Sichtbarkeit: Ausblenden wenn Fenster offen ODER über UI
      if (this.popoverElement || this.isOverSearchUI) {
        this.hintElement.style.opacity = "0";
        return;
      }

      this.hintElement.style.opacity = "1";

      clearTimeout(this.opacityTimer);
      this.opacityTimer = setTimeout(() => {
        if (this.hintElement && !this.popoverElement && !this.isOverSearchUI) {
          this.hintElement.style.opacity = "0.3";
        }
      }, 1200);

      if (this.isInactive) {
        this.isInactive = false;
        this.hintElement.classList.remove('icon-only');
        this.startHintAutoShrink();
      }

      clearTimeout(this.inactivityTimer);
      this.inactivityTimer = setTimeout(() => { this.isInactive = true; }, 3500);
    });

    this.map.on('contextmenu', (e) => this.showAtCursor(e.latlng.lat, e.latlng.lng, e.originalEvent.clientX, e.originalEvent.clientY));
    this.map.on('click', (e) => {
      const isMap = e.originalEvent.target.classList.contains('leaflet-container') || e.originalEvent.target.classList.contains('maplibregl-canvas');
      if (isMap) this.showAtCursor(e.latlng.lat, e.latlng.lng, e.originalEvent.clientX, e.originalEvent.clientY);
      else this.hide();
    });
  }

  drawSearchCircle(lat, lon, animate = false) {
    const targetRadius = this.currentRadius * 1000;
    const circleColor = window.matchMedia('(prefers-color-scheme: dark)').matches ? window.MapIcons.colors.HOVER_DARK : window.MapIcons.colors.HOVER_LIGHT;

    if (!this.searchCircle) {
      // Neuer Kreis
      this.searchCircle = L.circle([lat, lon], { radius: targetRadius, color: circleColor, weight: 3, fillOpacity: 0.15, interactive: false, pane: 'overlayPane' }).addTo(this.map);
    } else {
      // Aktualisiere Position
      this.searchCircle.setLatLng([lat, lon]);

      if (animate) {
        // Animiere Radius-Änderung
        const startRadius = this.searchCircle.getRadius();
        const radiusDiff = targetRadius - startRadius;
        const duration = 200; // ms
        const startTime = performance.now();

        const animateRadius = (currentTime) => {
          const elapsed = currentTime - startTime;
          const progress = Math.min(elapsed / duration, 1);

          // Easing function (easeInOutQuad)
          const eased = progress < 0.5
            ? 2 * progress * progress
            : 1 - Math.pow(-2 * progress + 2, 2) / 2;

          const newRadius = startRadius + radiusDiff * eased;
          this.searchCircle.setRadius(newRadius);

          if (progress < 1) {
            requestAnimationFrame(animateRadius);
          }
        };

        requestAnimationFrame(animateRadius);
      } else {
        // Sofort ändern
        this.searchCircle.setRadius(targetRadius);
      }
    }
  }

  showAtCursor(lat, lon, mouseX, mouseY) {
    this.lastPixels = { x: mouseX, y: mouseY };
    this.clickLocation = { lat, lon };
    this.updateNearbyData(lat, lon);

    let bestIndex = this.radii.indexOf(this.currentRadius);
    if (bestIndex === -1) bestIndex = 1;
    while (bestIndex > 0 && (this.resultsCache[this.radii[bestIndex]] || []).length > 5) bestIndex--;
    while (bestIndex < this.radii.length - 1 && (this.resultsCache[this.radii[bestIndex]] || []).length < 2) bestIndex++;

    this.currentRadius = this.radii[bestIndex];
    this.drawSearchCircle(lat, lon);
    this.showPopover(mouseX, mouseY);
    if (this.hintElement) this.hintElement.style.opacity = '0'; // Sofort unsichtbar wenn Fenster kommt
  }

  hide() {
    this.clearAllHoverEffects();
    if (this.popoverElement) this.popoverElement.remove();
    this.popoverElement = null;
    if (this.cursorIcon) this.map.removeLayer(this.cursorIcon);
    this.cursorIcon = null;
    if (this.searchCircle) this.map.removeLayer(this.searchCircle);
    this.searchCircle = null;
    if (this.map) { this.map.keyboard.enable(); this.map.dragging.enable(); }
    document.removeEventListener('keydown', this._keyboardHandler);
    this.keyboardIndex = -1;

    if (this.hintElement) {
      this.hintElement.style.display = 'flex';
      this.hintElement.classList.remove('icon-only');
      this.startHintAutoShrink();
    }
  }

  updateNearbyData(lat, lon) {
    if (!window.json) return;
    const allWithDist = window.json.map(loc => ({ ...loc, distance: this.calculateDistance(lat, lon, loc.loc.lat, loc.loc.long) })).sort((a, b) => a.distance - b.distance);
    this.resultsCache = {};
    this.radii.forEach(r => { this.resultsCache[r] = allWithDist.filter(s => s.distance <= r); });
  }

  showPopover(mouseX, mouseY) {
    const x = mouseX || (this.lastPixels ? this.lastPixels.x : 0);
    const y = mouseY || (this.lastPixels ? this.lastPixels.y : 0);
    const currentSpaces = this.resultsCache[this.currentRadius] || [];
    const isFirstTime = !this.popoverElement;

    // ✅ FEHLER BEHOBEN: _mouseHasMoved = false hier entfernt! 
    // Das Flag wird jetzt nur noch in handleKeyDown auf false gesetzt.

    if (isFirstTime) {
      this.popoverElement = document.createElement('div');
      this.popoverElement.className = 'nearby-popover settings-popover';
      L.DomEvent.disableClickPropagation(this.popoverElement);
      L.DomEvent.disableScrollPropagation(this.popoverElement);
      document.addEventListener('keydown', this._keyboardHandler);
    }

    if (this.map) this.map.keyboard.disable();

    if (isFirstTime) {
      this.keyboardIndex = -1;
    }

    const makerspaceText = window.i18n ? window.i18n.t('nearbySpaces.makerspaces') : 'Makerspaces';
    const emptyText = window.i18n ? window.i18n.t('nearbySpaces.empty') : 'keine makerspaces … Umkreis erweitern';

    const currentIndex = this.radii.indexOf(this.currentRadius);
    const fraction = currentIndex / (this.radii.length - 1);
    const pillPosition = `calc(28px + (100% - 56px) * ${fraction})`;

    const headerHTML = `
      <div class="nearby-header-row-top">
        <div class="settings-header-content">
          <i class="fas fa-map-marker-alt" style="color: var(--space-hover); margin-right: 6px;"></i>
          <span class="nearby-header-text"><b>${currentSpaces.length}</b> ${makerspaceText}</span>
        </div>
        <button class="settings-icon-btn nearby-close-btn"><i class="fas fa-times"></i></button>
      </div>
      <div class="nearby-header-row-bottom">
        <div class="nearby-radius-slider-container">
          <div class="nearby-radius-slider-row">
            <span class="nearby-radius-label-prefix">${window.i18n ? window.i18n.t('nearbySpaces.radius') : 'Umkreis'}</span>
            <div class="nearby-radius-track">
              <div class="nearby-radius-labels">
                ${this.radii.map((r, idx) =>
      `<span class="nearby-radius-label ${this.currentRadius === r ? 'active' : ''}" data-index="${idx}">${r}km</span>`
    ).join('')}
              </div>
              <div class="nearby-radius-pill" data-current-index="${currentIndex}" style="left: ${pillPosition}">
                ${this.currentRadius}km
              </div>
              ${this.radii.map((r, idx) => {
      const fraction = idx / (this.radii.length - 1);
      const position = `calc(28px + (100% - 56px) * ${fraction})`;
      return `<button class="nearby-radius-clickarea" data-index="${idx}" style="left: ${position}"></button>`;
    }).join('')}
            </div>
          </div>
        </div>
      </div>`;

    let listHTML = currentSpaces.length === 0 ? `<div class="nearby-empty"> &nbsp;&nbsp;${emptyText}</div>` :
      currentSpaces.slice(0, 20).map((space, idx) => {
        const countryCode = this.getCountryCode(space.loc.country);
        const fullSpaceName = this.escapeHtml(space.name);
        return `
          <div class="nearby-item ${idx % 2 !== 0 ? 'nearby-item-alt' : ''}" data-location-id="${space.ID}" style="--item-status-color: ${this.getSpaceStatusColor(space)}">
              <span class="nearby-dist-badge">${Math.round(space.distance)} km</span>
              <div class="nearby-item-content">
                  <div class="nearby-item-name">${this.getStyleIcon(space)}${this.getStatusIcon(space)}<span class="nearby-name-text" title="${fullSpaceName}">${fullSpaceName}</span></div>
                  <div class="nearby-item-details"><span class="fi fi-${countryCode}"></span><span>${space.loc.plz || ''} ${this.escapeHtml(space.loc.city)}</span></div>
              </div>
          </div>`;
      }).join('');

    if (isFirstTime) {
      this.popoverElement.innerHTML = `<div class="nearby-popover-header settings-header">${headerHTML}</div><div class="nearby-popover-list">${listHTML}</div><div class="nearby-resize-handle"><i class="fas fa-grip-lines"></i></div>`;
      document.body.appendChild(this.popoverElement);
      this.attachEventListeners();

      this.popoverElement.querySelector('.nearby-popover-list').addEventListener('scroll', () => {
        if (window.searchManager) window.searchManager.updateHoverSVGPosition();
      });

      // ✅ Mousemove-Erkennung auf Popover
      this.popoverElement.addEventListener('mousemove', (e) => {
        if (e.clientX !== this._lastMousePos.x || e.clientY !== this._lastMousePos.y) {
          this._lastMousePos = { x: e.clientX, y: e.clientY };
          this._mouseHasMoved = true;

          // ✅ WICHTIG: pointer-events auf allen Items wieder freigeben
          this.popoverElement.querySelectorAll('.nearby-item').forEach(item => {
            item.style.pointerEvents = '';
          });
        }
      });
      this.positionPopover(x, y);
    } else {
      if (this.popoverElement && this.popoverElement.parentElement) {
        this.popoverElement.querySelector('.nearby-popover-header').innerHTML = headerHTML;
        this.popoverElement.querySelector('.nearby-popover-list').innerHTML = listHTML;
        this.reattachRadiusAndItemListeners();

        if (this._pendingReactivationId !== null && this._pendingReactivationId !== undefined) {
          const reactivationId = this._pendingReactivationId;
          this._pendingReactivationId = null;

          requestAnimationFrame(() => {
            const items = this.popoverElement?.querySelectorAll('.nearby-item');
            if (!items) {
              if (this.map) this.map.dragging.enable();
              return;
            }

            let foundIndex = -1;
            items.forEach((item, idx) => {
              if (parseInt(item.dataset.locationId) === reactivationId) {
                foundIndex = idx;
              }
            });

            if (foundIndex !== -1) {
              this.keyboardIndex = foundIndex;
              this.updateKeyboardSelection(items);
            } else {
              this.keyboardIndex = -1;
              this.currentHoverItem = null;
              if (window.searchManager) {
                window.searchManager.removeConnectionLine();
                window.searchManager.cleanupHoverSVG();
              }
            }
            if (this.map) this.map.dragging.enable();
          });
        } else {
          if (this.map) this.map.dragging.enable();
        }
      }
    }
  }


  // --- LOGIK-VERKNÜPFUNG MIT SEARCH.JS ---
  applyMarkerHighlight(item) {
    if (!window.searchManager) return;
    const id = parseInt(item.dataset.locationId);
    const location = window.locationById.get(id);
    if (!location) return;
    if (this.currentHoverItem && this.currentHoverItem !== item) {
      const prevId = parseInt(this.currentHoverItem.dataset.locationId);
      const prevLoc = window.locationById.get(prevId);
      window.searchManager.removeHoverEffects(prevLoc);
    }
    this.currentHoverItem = item;
    window.searchManager.applyHoverEffects(item, location, 5);  // ✅ weight=5 für nearby-spaces!
  }

  clearAllHoverEffects() {
    if (!window.searchManager) return;
    // ✅ Nicht während Popover-Drag ausführen (mouseleave wird fälschlicherweise getriggert)
    if (this._isPopoverDragging) return;

    this.popoverElement?.querySelectorAll('.keyboard-active').forEach(i => {
      i.classList.remove('keyboard-active');
      i.style.backgroundColor = '';
    });
    if (this.currentHoverItem) {
      const id = parseInt(this.currentHoverItem.dataset.locationId);
      const location = window.locationById.get(id);
      window.searchManager.removeHoverEffects(location);
      this.currentHoverItem = null;
    }
  }

  handleKeyDown(e) {
    if (!this.popoverElement) return;
    const navKeys = ['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight', 'Enter', 'Escape'];
    if (!navKeys.includes(e.key)) return;
    e.preventDefault(); e.stopImmediatePropagation();

    // ✅ Tastatur übernimmt Kontrolle
    this.lastInputMethod = 'keyboard';
    this._mouseHasMoved = false;  // Maus muss sich erst bewegen bevor sie übernehmen kann

    // ✅ pointer-events auf Items deaktivieren um CSS :hover zu unterdrücken (Liste bleibt scrollbar)
    this.popoverElement.querySelectorAll('.nearby-item').forEach(item => {
      item.style.pointerEvents = 'none';
    });

    const items = this.popoverElement.querySelectorAll('.nearby-item');
    if (e.key === 'ArrowDown') this.keyboardIndex = (this.keyboardIndex + 1) % (items.length || 1);
    else if (e.key === 'ArrowUp') this.keyboardIndex = (this.keyboardIndex <= 0) ? (items.length - 1) : this.keyboardIndex - 1;
    else if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      let idx = this.radii.indexOf(this.currentRadius);
      this.changeRadius(this.radii[e.key === 'ArrowRight' ? Math.min(idx + 1, this.radii.length - 1) : Math.max(idx - 1, 0)]);
      return;
    }
    else if (e.key === 'Enter') { if (this.keyboardIndex >= 0 && items[this.keyboardIndex]) items[this.keyboardIndex].click(); return; }
    else if (e.key === 'Escape') { this.hide(); return; }
    this.updateKeyboardSelection(items);
  }

  updateKeyboardSelection(items) {
    items.forEach((item, idx) => {
      if (idx === this.keyboardIndex) {
        item.classList.add('keyboard-active');
        item.style.backgroundColor = 'var(--item-status-color)';
        item.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        this.applyMarkerHighlight(item);
      } else {
        item.classList.remove('keyboard-active');
        item.style.backgroundColor = '';
      }
    });
  }

  changeRadius(newRadius) {
    if (this.currentRadius === newRadius) return;

    // ✅ Aktiven Makerspace speichern BEVOR wir etwas ändern
    this._pendingReactivationId = null;
    if (this.currentHoverItem) {
      this._pendingReactivationId = parseInt(this.currentHoverItem.dataset.locationId);
      // ✅ currentHoverItem auf null setzen - verhindert dass removeHoverEffects
      // aufgerufen wird (Connection Line bleibt erhalten)
      this.currentHoverItem = null;
    }

    const pill = this.popoverElement?.querySelector('.nearby-radius-pill');
    const oldRadius = this.currentRadius;
    const oldIndex = this.radii.indexOf(oldRadius);
    const newIndex = this.radii.indexOf(newRadius);

    if (pill) {
      const fraction = newIndex / (this.radii.length - 1);
      const newPosition = `calc(28px + (100% - 56px) * ${fraction})`;

      // 1. Richtung setzen
      pill.textContent = newIndex > oldIndex ? '>' : '<';

      pill.style.left = newPosition;
      pill.dataset.currentIndex = newIndex;

      // Labels aktualisieren
      this.popoverElement.querySelectorAll('.nearby-radius-label').forEach((label, idx) => {
        label.classList.toggle('active', idx === newIndex);
      });

      // 2. Nach der CSS-Transition (300ms) den Wert wieder anzeigen
      setTimeout(() => {
        if (pill) pill.textContent = newRadius + 'km';
      }, 300);
    }

    // ✅ Hover-Effekte NICHT entfernen - Connection Line bleibt erhalten
    // this.clearAllHoverEffects();
    this.currentRadius = newRadius;
    // ✅ keyboardIndex wird später in showPopover gesetzt
    if (this.clickLocation) this.drawSearchCircle(this.clickLocation.lat, this.clickLocation.lon, true);

    // Der restliche showPopover Aufruf bleibt für das Laden der neuen Liste
    // ✅ Muss länger als die CSS-Transition (300ms) sein
    setTimeout(() => { this.showPopover(); }, 320);
  }



  escapeHtml(text) { const div = document.createElement('div'); div.textContent = text || ''; return div.innerHTML; }
  positionPopover(mouseX, mouseY) {
    if (!this.popoverElement) return;
    const popWidth = 320, popHeight = this.popoverElement.offsetHeight;
    let left = Math.max(10, Math.min(mouseX + 15, window.innerWidth - popWidth - 15));
    let top = Math.max(10, Math.min(mouseY + 15, window.innerHeight - popHeight - 15));
    this.popoverElement.style.left = left + 'px'; this.popoverElement.style.top = top + 'px';
  }
  getStyleIcon(space) { const key = space.style ? space.style.toLowerCase() : ''; return this.styleIconMap[key] ? `<i class="${this.styleIconMap[key]} nearby-icon"></i>` : ''; }
  getStatusIcon(space) { if (!space.spaceapi?.endpoint) return ''; return `<i class="${window.MapIcons.getStatusIcon(space.isOpen)} nearby-icon"></i>`; }
  getSpaceStatusColor(space) { return window.MapIcons.getDynamicColor(space); }
  getCountryCode(c) { return window.MapIcons.getCountryCode(c); }
  calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371, dLat = (lat2 - lat1) * Math.PI / 180, dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  attachEventListeners() {
    this.popoverElement.querySelector('.nearby-close-btn').addEventListener('click', () => this.hide());
    const header = this.popoverElement.querySelector('.nearby-popover-header');
    header.style.cursor = 'grab';

    let isDraggingPopover = false, startPos = { x: 0, y: 0 };

    this.popoverElement.addEventListener('pointerdown', (e) => {
      // ERWEITERT: Ignoriere Fenster-Verschiebung, wenn auf bestimmte Elemente geklickt wird
      if (e.target.closest('.nearby-radius-track, .nearby-radius-pill, .nearby-radius-clickarea, .nearby-close-btn, .nearby-item, .nearby-resize-handle')) {
        return;
      }

      isDraggingPopover = true;
      this._isPopoverDragging = true;  // ✅ Flag für clearAllHoverEffects
      this.popoverElement.style.cursor = 'grabbing';
      header.style.cursor = 'grabbing';
      e.preventDefault();
      e.stopPropagation();
      startPos = { x: e.clientX - this.popoverElement.offsetLeft, y: e.clientY - this.popoverElement.offsetTop };
      this.popoverElement.setPointerCapture(e.pointerId);

      // ✅ Map-Dragging deaktivieren während Popover-Drag (verhindert movestart Events)
      if (this.map) this.map.dragging.disable();
    });

    this.popoverElement.addEventListener('pointermove', (e) => {
      if (!isDraggingPopover) return;
      this.popoverElement.style.left = Math.max(0, Math.min(e.clientX - startPos.x, window.innerWidth - this.popoverElement.offsetWidth)) + 'px';
      this.popoverElement.style.top = Math.max(0, Math.min(e.clientY - startPos.y, window.innerHeight - this.popoverElement.offsetHeight)) + 'px';
      if (window.searchManager) window.searchManager.updateHoverSVGPosition();
    });

    this.popoverElement.addEventListener('pointerup', () => {
      if (!isDraggingPopover) return;
      isDraggingPopover = false;
      this.popoverElement.style.cursor = '';
      header.style.cursor = 'grab';

      // ✅ Connection Line nach dem Drag NEU ERSTELLEN (mit minimaler Verzögerung)
      setTimeout(() => {
        // ✅ Connection Line komplett neu erstellen über applyMarkerHighlight
        if (this.currentHoverItem) {
          const item = this.currentHoverItem;
          this.currentHoverItem = null;
          this.applyMarkerHighlight(item);
        }

        // ✅ Flag und Map-Dragging erst NACH dem Neu-Erstellen zurücksetzen
        this._isPopoverDragging = false;
        if (this.map) this.map.dragging.enable();
      }, 1);
    });

    // ✅ RESIZE-HANDLE LOGIK
    const resizeHandle = this.popoverElement.querySelector('.nearby-resize-handle');
    const list = this.popoverElement.querySelector('.nearby-popover-list');
    const ITEM_HEIGHT = 56;
    const MIN_ITEMS = 3;
    const MAX_ITEMS = 8;

    if (resizeHandle && list) {
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

        // Auf ITEM_HEIGHT-Schritte runden
        const itemCount = Math.round(newHeight / ITEM_HEIGHT);
        const actualItemCount = list.querySelectorAll('.nearby-item').length;

        // Prüfen ob Nutzer versucht zu erweitern aber nicht genug Items da sind
        const currentMaxItems = Math.round(list.offsetHeight / ITEM_HEIGHT);
        const wantsMore = itemCount > currentMaxItems;
        const cantExpand = actualItemCount <= currentMaxItems;

        if (wantsMore && cantExpand && !resizeHandle.classList.contains('limit-reached')) {
          // Flicker-Animation auslösen
          resizeHandle.classList.add('limit-reached');
          setTimeout(() => resizeHandle.classList.remove('limit-reached'), 300);
        }

        // Clamp auf tatsächlich verfügbare Items oder MIN/MAX
        const maxPossible = Math.min(MAX_ITEMS, actualItemCount);
        const clampedCount = Math.max(MIN_ITEMS, Math.min(maxPossible, itemCount));
        const snappedHeight = clampedCount * ITEM_HEIGHT;

        list.style.maxHeight = snappedHeight + 'px';

        // Connection Line Position aktualisieren
        if (window.searchManager) window.searchManager.updateHoverSVGPosition();
      });

      resizeHandle.addEventListener('pointerup', (e) => {
        if (!isResizing) return;
        isResizing = false;
        resizeHandle.releasePointerCapture(e.pointerId);

        if (this.map) this.map.dragging.enable();
      });
    }

    this.reattachRadiusAndItemListeners();
  }

  reattachRadiusAndItemListeners() {
    const pill = this.popoverElement.querySelector('.nearby-radius-pill');
    const track = this.popoverElement.querySelector('.nearby-radius-track');

    if (pill && track) {
      this.isPillDragging = false;

      // --- 1. PILL DRAGGING LOGIK ---
      pill.addEventListener('pointerdown', (e) => {
        // Verhindert, dass das Popover-Fenster mitzieht
        e.stopPropagation();

        this.isPillDragging = true;
        pill.classList.add('dragging');
        pill.setPointerCapture(e.pointerId);

        // Karte einfrieren während des Draggens
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

        // Nutzbaren Bereich berechnen (identisch mit CSS calc-Logik)
        const leftLimit = trackPadding + pillHalfWidth; // 28px
        const rightLimit = trackRect.width - trackPadding - pillHalfWidth;
        const innerWidth = rightLimit - leftLimit;

        // Position des Cursors relativ zum Track
        const mouseX = e.clientX - trackRect.left;
        const clampedX = Math.max(leftLimit, Math.min(mouseX, rightLimit));

        // PILL FOLGT DEM CURSOR (Echtzeit)
        pill.style.left = `${clampedX}px`;

        // LOGIK FÜR TEXT - beim Draggen immer nur Richtung zeigen
        const currentPct = ((clampedX - leftLimit) / innerWidth) * 100;
        const snapIdx = Math.round(currentPct / (100 / (this.radii.length - 1)));

        // Richtung bestimmen im Vergleich zum aktuell aktiven Radius
        const startIdx = this.radii.indexOf(this.currentRadius);
        if (snapIdx !== startIdx) {
          pill.textContent = snapIdx > startIdx ? '>' : '<';
        }

        // Index für das Snapping beim Loslassen speichern
        pill.dataset.currentIndex = snapIdx;
      });

      pill.addEventListener('pointerup', (e) => {
        if (!this.isPillDragging) return;
        e.stopPropagation();

        this.isPillDragging = false;
        pill.classList.remove('dragging');
        pill.releasePointerCapture(e.pointerId);

        // ✅ Map-Dragging NICHT hier aktivieren - wird später in changeRadius gemacht
        // damit kein versehentlicher movestart die Connection Line entfernt

        // Finales Snapping über changeRadius (inkl. Animation)
        const newIndex = parseInt(pill.dataset.currentIndex);
        this.changeRadius(this.radii[newIndex]);
      });

      // --- 2. TRACK & LABEL KLICKS ---
      track.addEventListener('pointerdown', (e) => {
        // Verhindert Fenster-Drag wenn man auf den Track klickt
        e.stopPropagation();
      });

      track.addEventListener('click', (e) => {
        if (this.isPillDragging) return;

        // Klick auf ein Label (z.B. "15km", "40km")
        if (e.target.classList.contains('nearby-radius-label')) {
          const index = parseInt(e.target.dataset.index);
          this.changeRadius(this.radii[index]);
          return;
        }

        // Klick auf den Track (Pill springt zum Punkt)
        if (e.target === pill || pill.contains(e.target)) return;

        const trackRect = track.getBoundingClientRect();
        const relativeX = e.clientX - trackRect.left - 28;
        const innerWidth = trackRect.width - 56;
        const percentage = (relativeX / innerWidth) * 100;
        const snapIndex = Math.round(percentage / (100 / (this.radii.length - 1)));
        const safeIndex = Math.max(0, Math.min(snapIndex, this.radii.length - 1));

        this.changeRadius(this.radii[safeIndex]);
      });
    }

    // --- 3. TRANSPARENTE KLICK-AREAS (Buttons unter der Pill) ---
    this.popoverElement.querySelectorAll('.nearby-radius-clickarea').forEach((button) => {
      button.addEventListener('pointerdown', (e) => {
        e.stopPropagation();
        const index = parseInt(e.target.dataset.index);
        this.changeRadius(this.radii[index]);
      });
    });

    // --- 4. LISTE DER MAKERSPACES (Items) ---
    this.popoverElement.querySelectorAll('.nearby-item').forEach(item => {
      item.addEventListener('click', () => {
        const marker = window.markerById.get(parseInt(item.dataset.locationId));
        if (marker) {
          window.map.flyTo(marker.getLatLng(), 15);
          setTimeout(() => {
            marker.openPopup();
            this.hide();
          }, 500);
        }
      });

      item.addEventListener('mouseenter', () => {
        // ✅ Nur übernehmen wenn Maus sich tatsächlich bewegt hat (nicht bei DOM-Rebuild)
        if (!this._mouseHasMoved) {
          return;  // Maus muss sich erst bewegen um Kontrolle zu übernehmen
        }

        // ✅ Maus übernimmt Kontrolle
        this.lastInputMethod = 'mouse';

        // Keyboard-Styling entfernen wenn Maus übernimmt
        if (this.keyboardIndex !== -1) {
          this.popoverElement?.querySelectorAll('.keyboard-active').forEach(i => {
            i.classList.remove('keyboard-active');
            i.style.backgroundColor = '';
          });
          this.keyboardIndex = -1;
        }

        this.applyMarkerHighlight(item);
      });

      // ✅ Kein mouseleave-Handler: Letztes Element bleibt aktiv beim Verlassen der Liste
    });
  }


}

window.nearbySpacesManager = new NearbySpacesManager();