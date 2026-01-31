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

    if (isFirstTime) {
      this.popoverElement = document.createElement('div');
      this.popoverElement.className = 'nearby-popover settings-popover';
      L.DomEvent.disableClickPropagation(this.popoverElement);
      L.DomEvent.disableScrollPropagation(this.popoverElement);
      document.addEventListener('keydown', this._keyboardHandler);
    }

    if (this.map) this.map.keyboard.disable();
    this.keyboardIndex = -1;

    const makerspaceText = window.i18n ? window.i18n.t('nearbySpaces.makerspaces') : 'Makerspaces';
    const emptyText = window.i18n ? window.i18n.t('nearbySpaces.empty') : 'keine makerspaces … Umkreis erweitern';

    const currentIndex = this.radii.indexOf(this.currentRadius);
    // Berechne Position: Track-Padding (3px) + halbe Pill-Breite (25px) = 28px an den Rändern
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
      this.popoverElement.innerHTML = `<div class="nearby-popover-header settings-header">${headerHTML}</div><div class="nearby-popover-list">${listHTML}</div>`;
      document.body.appendChild(this.popoverElement);
      this.attachEventListeners();
      this.popoverElement.querySelector('.nearby-popover-list').addEventListener('scroll', () => {
        if (window.searchManager) window.searchManager.updateHoverSVGPosition();
      });
      this.positionPopover(x, y);
    } else {
      // ✅ NULL-CHECK: Falls popoverElement zwischenzeitlich entfernt wurde
      if (this.popoverElement && this.popoverElement.parentElement) {
        this.popoverElement.querySelector('.nearby-popover-header').innerHTML = headerHTML;
        this.popoverElement.querySelector('.nearby-popover-list').innerHTML = listHTML;
        this.reattachRadiusAndItemListeners();
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
    if (this.currentRadius === newRadius) {
      return;
    }

    const pill = this.popoverElement?.querySelector('.nearby-radius-pill');

    // Animiere die Pill zur neuen Position
    if (pill) {
      const newIndex = this.radii.indexOf(newRadius);
      const fraction = newIndex / (this.radii.length - 1);
      const newPosition = `calc(28px + (100% - 56px) * ${fraction})`;

      // Setze neue Position (CSS transition wird automatisch angewendet)
      pill.style.left = newPosition;
      pill.textContent = newRadius + 'km';
      pill.dataset.currentIndex = newIndex;

      // Update active class auf Labels
      this.popoverElement.querySelectorAll('.nearby-radius-label').forEach((label, idx) => {
        if (idx === newIndex) {
          label.classList.add('active');
        } else {
          label.classList.remove('active');
        }
      });
    }

    this.clearAllHoverEffects();
    this.currentRadius = newRadius;
    this.keyboardIndex = -1;
    if (this.clickLocation) this.drawSearchCircle(this.clickLocation.lat, this.clickLocation.lon, true);

    // Aktualisiere Popover nach kurzer Verzögerung (nach Animation)
    setTimeout(() => {
      this.showPopover();
    }, 250);
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
    let isDragging = false, startPos = { x: 0, y: 0 };
    this.popoverElement.addEventListener('pointerdown', (e) => {
      if (e.target.closest('.nearby-radius-btn, .nearby-close-btn, .nearby-item')) return;
      isDragging = true;
      this.popoverElement.style.cursor = 'grabbing';
      header.style.cursor = 'grabbing';
      e.preventDefault();
      startPos = { x: e.clientX - this.popoverElement.offsetLeft, y: e.clientY - this.popoverElement.offsetTop };
      this.popoverElement.setPointerCapture(e.pointerId);
    });
    this.popoverElement.addEventListener('pointermove', (e) => {
      if (!isDragging) return;
      this.popoverElement.style.left = Math.max(0, Math.min(e.clientX - startPos.x, window.innerWidth - this.popoverElement.offsetWidth)) + 'px';
      this.popoverElement.style.top = Math.max(0, Math.min(e.clientY - startPos.y, window.innerHeight - this.popoverElement.offsetHeight)) + 'px';
      if (window.searchManager) window.searchManager.updateHoverSVGPosition();
    });
    this.popoverElement.addEventListener('pointerup', () => {
      isDragging = false;
      this.popoverElement.style.cursor = '';
      header.style.cursor = 'grab';
    });
    this.reattachRadiusAndItemListeners();
  }

  reattachRadiusAndItemListeners() {
    // ✅ Draggable Pill Setup
    const pill = this.popoverElement.querySelector('.nearby-radius-pill');
    const track = this.popoverElement.querySelector('.nearby-radius-track');

    if (pill && track) {
      let isDragging = false;

      pill.addEventListener('pointerdown', (e) => {
        // Ignoriere pointerdown auf Buttons
        if (e.target.classList.contains('nearby-radius-clickarea')) {
          return;
        }

        isDragging = true;
        pill.classList.add('dragging');
        pill.setPointerCapture(e.pointerId);
        e.preventDefault();
        e.stopPropagation();
      });

      pill.addEventListener('pointermove', (e) => {
        if (!isDragging) return;

        const trackRect = track.getBoundingClientRect();
        const pillHalfWidth = 25; // halbe Pill-Breite (50px / 2)
        const trackPadding = 3;
        const leftLimit = trackPadding + pillHalfWidth; // 28px
        const rightLimit = trackRect.width - trackPadding - pillHalfWidth;
        const innerWidth = rightLimit - leftLimit; // nutzbarer Bereich
        const relativeX = e.clientX - trackRect.left - leftLimit;
        const percentage = Math.max(0, Math.min(100, (relativeX / innerWidth) * 100));

        // Finde nächsten Snap-Punkt
        const snapIndex = Math.round(percentage / (100 / (this.radii.length - 1)));
        const snapFraction = snapIndex / (this.radii.length - 1);

        // Update visuell während des Draggings
        pill.style.left = `calc(${leftLimit}px + ${innerWidth}px * ${snapFraction})`;
        pill.dataset.currentIndex = snapIndex;
        pill.textContent = this.radii[snapIndex] + 'km';
      });

      pill.addEventListener('pointerup', (e) => {
        if (!isDragging) return;
        isDragging = false;
        pill.classList.remove('dragging');

        const newIndex = parseInt(pill.dataset.currentIndex);
        const newRadius = this.radii[newIndex];

        if (newRadius !== this.currentRadius) {
          this.changeRadius(newRadius);
        }

        e.preventDefault();
        e.stopPropagation();
      });

      // Klick auf Track oder Labels
      track.addEventListener('click', (e) => {
        // Prüfe ob es ein Label ist
        if (e.target.classList.contains('nearby-radius-label')) {
          const index = parseInt(e.target.dataset.index);
          this.changeRadius(this.radii[index]);
          return;
        }

        // Ignoriere Klicks auf Pill
        if (e.target === pill || pill.contains(e.target)) {
          return;
        }

        // Track-Click
        const trackRect = track.getBoundingClientRect();
        const pillHalfWidth = 25;
        const trackPadding = 3;
        const leftLimit = trackPadding + pillHalfWidth;
        const rightLimit = trackRect.width - trackPadding - pillHalfWidth;
        const innerWidth = rightLimit - leftLimit;
        const relativeX = e.clientX - trackRect.left - leftLimit;
        const percentage = (relativeX / innerWidth) * 100;
        const snapIndex = Math.round(percentage / (100 / (this.radii.length - 1)));

        this.changeRadius(this.radii[snapIndex]);
      });
    }

    // ✅ Transparente Klick-Buttons
    const clickButtons = this.popoverElement.querySelectorAll('.nearby-radius-clickarea');
    clickButtons.forEach((button) => {
      button.addEventListener('pointerdown', (e) => {
        e.stopPropagation();
        e.preventDefault();
        const index = parseInt(e.target.dataset.index);
        this.changeRadius(this.radii[index]);
      });
    });

    // Klickbare Labels (Fallback - werden normalerweise über Track-Click gehandhabt)
    const labels = this.popoverElement.querySelectorAll('.nearby-radius-label');
    labels.forEach((label) => {
      label.addEventListener('click', (e) => {
        e.stopPropagation();
        e.preventDefault();
        const index = parseInt(e.target.dataset.index);
        this.changeRadius(this.radii[index]);
      });
    });

    // Klickbare Marker (die Punkte)
    this.popoverElement.querySelectorAll('.nearby-radius-marker').forEach(marker => {
      marker.addEventListener('click', (e) => {
        const index = parseInt(e.target.dataset.index);
        this.changeRadius(this.radii[index]);
      });
    });

    // Items
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
      item.addEventListener('mouseenter', () => { this.keyboardIndex = -1; this.applyMarkerHighlight(item); });
      item.addEventListener('mouseleave', () => { this.clearAllHoverEffects(); });
    });
  }

}

window.nearbySpacesManager = new NearbySpacesManager();