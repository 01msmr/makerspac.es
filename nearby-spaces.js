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
    this.radii = [15, 25, 50, 75];

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

  drawSearchCircle(lat, lon) {
    if (this.searchCircle) this.map.removeLayer(this.searchCircle);
    const circleColor = window.matchMedia('(prefers-color-scheme: dark)').matches ? window.MapIcons.colors.HOVER_DARK : window.MapIcons.colors.HOVER_LIGHT;
    this.searchCircle = L.circle([lat, lon], { radius: this.currentRadius * 1000, color: circleColor, weight: 1, fillOpacity: 0.05, interactive: false, pane: 'overlayPane' }).addTo(this.map);
  }

  showAtCursor(lat, lon, mouseX, mouseY) {
    this.lastPixels = { x: mouseX, y: mouseY };
    this.clickLocation = { lat, lon };
    this.showCursorIcon(lat, lon);
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

    // ✅ ENTFERNT: clearAllFilters() fokussiert die Searchbar - das wollen wir NICHT!
    // Die ESC-Logik in map.js kümmert sich darum

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
    const radiusText = window.i18n ? window.i18n.t('nearbySpaces.radius') : 'Umkreis';
    const emptyText = window.i18n ? window.i18n.t('nearbySpaces.empty') : 'keine makerspaces … Umkreis erweitern';

    const headerHTML = `
      <div class="nearby-header-row-top">
        <div class="settings-header-content">
          <i class="fas fa-map-marker-alt" style="color: var(--space-hover); margin-right: 6px;"></i>
          <span class="nearby-header-text"><b>${currentSpaces.length}</b> ${makerspaceText}:</span>
        </div>
        <button class="settings-icon-btn nearby-close-btn"><i class="fas fa-times"></i></button>
      </div>
      <div class="nearby-header-row-bottom">
        <div class="settings-header-icons">
          <span class="nearby-header-text">${radiusText}:</span>
          ${this.radii.map(r => `<button class="nearby-radius-btn ${this.currentRadius === r ? 'active' : ''}" data-radius="${r}">${r}km</button>`).join('')}
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
    if (this.currentRadius === newRadius) return;
    this.clearAllHoverEffects();
    this.currentRadius = newRadius;
    this.keyboardIndex = -1;
    if (this.clickLocation) this.drawSearchCircle(this.clickLocation.lat, this.clickLocation.lon);
    this.showPopover();
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
    this.popoverElement.querySelectorAll('.nearby-radius-btn').forEach(btn => btn.addEventListener('click', (e) => this.changeRadius(parseInt(e.target.dataset.radius))));
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
      item.addEventListener('mouseenter', () => { this.keyboardIndex = -1; this.applyMarkerHighlight(item); });  // ✅ Das zeichnet die Connection Line!
      item.addEventListener('mouseleave', () => { this.clearAllHoverEffects(); });
    });
  }

  showCursorIcon(lat, lon) {
    if (this.cursorIcon) this.map.removeLayer(this.cursorIcon);
    this.cursorIcon = L.marker([lat, lon], { icon: L.divIcon({ html: `<div class="nearby-cursor-icon"><i class="${window.MapIcons.uiMap.CROSSHAIRS}"></i></div>`, className: 'nearby-cursor-marker', iconSize: [40, 40], iconAnchor: [20, 20] }), interactive: false, zIndexOffset: 1000 }).addTo(this.map);
  }
}

window.nearbySpacesManager = new NearbySpacesManager();