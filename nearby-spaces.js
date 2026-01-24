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

    // Gültige Radien für die Navigation
    this.radii = [15, 25, 50, 75];

    this.shrinkTimer = null;
    this.inactivityTimer = null;
    this.opacityTimer = null;
    this.isInactive = false;

    // Tastaturnavigation
    this.keyboardIndex = -1;
    this._keyboardHandler = this.handleKeyDown.bind(this);

    // Nutze zentrale Definition aus icons.js
    this.styleIconMap = window.MapIcons.styleMap;
  }

  init(map) {
    if (window.embedModeActive) return;

    this.map = map;
    this.createHint();
    this.setupEventListeners();

    document.addEventListener('languageChanged', () => {
      if (this.popoverElement && this.popoverElement.parentElement) {
        this.showPopover();
      }
    });
  }

  createHint() {
    if (this.hintElement) this.hintElement.remove();
    this.hintElement = document.createElement('div');
    this.hintElement.className = 'nearby-cursor-hint';
    this.hintElement.innerHTML = `
        <div class="hint-icon-wrapper"><i class="fas fa-crosshairs"></i></div>
        <span>Rechtsklick für makerspaces in der Nähe</span>
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
    }, 1350);
  }

  setupEventListeners() {
    document.addEventListener('mousemove', (e) => {
      if (!this.hintElement) return;

      this.hintElement.style.left = (e.clientX + 8) + 'px';
      this.hintElement.style.top = (e.clientY + 8) + 'px';
      this.hintElement.style.opacity = "1";

      clearTimeout(this.opacityTimer);
      this.opacityTimer = setTimeout(() => {
        if (this.hintElement) this.hintElement.style.opacity = "0.3";
      }, 1200);

      if (this.isInactive) {
        this.isInactive = false;
        this.hintElement.classList.remove('icon-only');
        this.startHintAutoShrink();
      }

      clearTimeout(this.inactivityTimer);
      this.inactivityTimer = setTimeout(() => {
        this.isInactive = true;
      }, 3500);
    });

    this.map.on('contextmenu', (e) => {
      this.showAtCursor(e.latlng.lat, e.latlng.lng, e.originalEvent.clientX, e.originalEvent.clientY);
    });

    this.map.on('click', (e) => {
      const isMap = e.originalEvent.target.classList.contains('leaflet-container') ||
        e.originalEvent.target.classList.contains('maplibregl-canvas');
      if (isMap) {
        this.showAtCursor(e.latlng.lat, e.latlng.lng, e.originalEvent.clientX, e.originalEvent.clientY);
      } else {
        this.hide();
      }
    });
  }

  drawSearchCircle(lat, lon) {
    if (this.searchCircle) this.map.removeLayer(this.searchCircle);

    const isDarkMode = window.matchMedia &&
      window.matchMedia('(prefers-color-scheme: dark)').matches;
    const circleColor = isDarkMode
      ? window.MapIcons.colors.HOVER_DARK
      : window.MapIcons.colors.HOVER_LIGHT;

    this.searchCircle = L.circle([lat, lon], {
      radius: this.currentRadius * 1000,
      color: circleColor,
      weight: 1,
      fillOpacity: 0.05,
      interactive: false,
      pane: 'overlayPane'
    }).addTo(this.map);
  }

  showAtCursor(lat, lon, mouseX, mouseY) {
    this.lastPixels = { x: mouseX, y: mouseY };
    this.clickLocation = { lat, lon };
    this.showCursorIcon(lat, lon);

    this.updateNearbyData(lat, lon);

    // Automatischer Radius-Vorschlag basierend auf Trefferdichte
    let bestIndex = this.radii.indexOf(this.currentRadius);
    if (bestIndex === -1) bestIndex = 1;

    while (bestIndex > 0) {
      const currentCount = (this.resultsCache[this.radii[bestIndex]] || []).length;
      if (currentCount > 5) bestIndex--;
      else break;
    }
    while (bestIndex < this.radii.length - 1) {
      const currentCount = (this.resultsCache[this.radii[bestIndex]] || []).length;
      if (currentCount < 2) bestIndex++;
      else break;
    }

    this.currentRadius = this.radii[bestIndex];
    this.drawSearchCircle(lat, lon);
    this.showPopover(mouseX, mouseY);
    if (this.hintElement) this.hintElement.style.display = 'none';
  }

  hide() {
    if (this.popoverElement) this.popoverElement.remove();
    this.popoverElement = null;
    if (this.cursorIcon) this.map.removeLayer(this.cursorIcon);
    this.cursorIcon = null;
    if (this.searchCircle) this.map.removeLayer(this.searchCircle);
    this.searchCircle = null;

    // Karte wieder steuerbar machen
    if (this.map) {
      this.map.keyboard.enable();
      this.map.dragging.enable();
    }

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

    const allWithDist = window.json.map(loc => ({
      ...loc,
      distance: this.calculateDistance(lat, lon, loc.loc.lat, loc.loc.long)
    })).sort((a, b) => a.distance - b.distance);

    this.resultsCache = {};
    this.radii.forEach(r => {
      this.resultsCache[r] = allWithDist.filter(s => s.distance <= r);
    });
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

    // Map-Steuerung deaktivieren solange Fenster offen
    if (this.map) {
      this.map.keyboard.disable();
    }

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
          ${this.radii.map(r => `
            <button class="nearby-radius-btn ${this.currentRadius === r ? 'active' : ''}" data-radius="${r}">${r}km</button>
          `).join('')}
        </div>
      </div>
    `;

    let listHTML = '';
    if (currentSpaces.length === 0) {
      listHTML = `<div class="nearby-empty"> &nbsp;&nbsp;${emptyText}</div>`;
    } else {
      listHTML = currentSpaces.slice(0, 20).map((space, idx) => {
        const statusColor = this.getSpaceStatusColor(space);
        const styleIcon = this.getStyleIcon(space);
        const statusIcon = this.getStatusIcon(space);
        const countryCode = this.getCountryCode(space.loc.country);
        const fullSpaceName = this.escapeHtml(space.name);
        const altClass = idx % 2 !== 0 ? 'nearby-item-alt' : '';

        return `
          <div class="nearby-item ${altClass}" data-id="${space.ID}" style="--item-status-color: ${statusColor}">
              <span class="nearby-dist-badge">${Math.round(space.distance)} km</span>
              <div class="nearby-item-content">
                  <div class="nearby-item-name">
                    ${styleIcon}${statusIcon}
                    <span class="nearby-name-text" title="${fullSpaceName}">${fullSpaceName}</span>
                  </div>
                  <div class="nearby-item-details">
                    <span class="fi fi-${countryCode}"></span>
                    <span>${space.loc.plz || ''} ${this.escapeHtml(space.loc.city)}</span>
                  </div>
              </div>
          </div>
        `;
      }).join('');
    }

    if (isFirstTime) {
      const header = document.createElement('div');
      header.className = 'nearby-popover-header settings-header';
      header.innerHTML = headerHTML;

      const list = document.createElement('div');
      list.className = 'nearby-popover-list';
      list.innerHTML = listHTML;

      this.popoverElement.appendChild(header);
      this.popoverElement.appendChild(list);
      document.body.appendChild(this.popoverElement);

      this.attachEventListeners();
      this.positionPopover(x, y);
    } else {
      const header = this.popoverElement.querySelector('.nearby-popover-header');
      const list = this.popoverElement.querySelector('.nearby-popover-list');

      if (header) header.innerHTML = headerHTML;
      if (list) list.innerHTML = listHTML;

      this.reattachRadiusAndItemListeners();
    }
  }

  handleKeyDown(e) {
    if (!this.popoverElement) return;

    const navKeys = ['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight', 'Enter', 'Escape'];
    if (!navKeys.includes(e.key)) return;

    e.preventDefault();
    e.stopImmediatePropagation();

    const items = this.popoverElement.querySelectorAll('.nearby-item');

    // 1. Liste navigieren (Hoch/Runter)
    if (e.key === 'ArrowDown') {
      this.keyboardIndex = (this.keyboardIndex + 1) % (items.length || 1);
      this.updateKeyboardSelection(items);
    }
    else if (e.key === 'ArrowUp') {
      this.keyboardIndex = (this.keyboardIndex <= 0) ? (items.length - 1) : this.keyboardIndex - 1;
      this.updateKeyboardSelection(items);
    }

    // 2. Radius wechseln (Links/Rechts)
    else if (e.key === 'ArrowRight') {
      let idx = this.radii.indexOf(this.currentRadius);
      idx = Math.min(idx + 1, this.radii.length - 1);
      this.changeRadius(this.radii[idx]);
    }
    else if (e.key === 'ArrowLeft') {
      let idx = this.radii.indexOf(this.currentRadius);
      idx = Math.max(idx - 1, 0);
      this.changeRadius(this.radii[idx]);
    }

    // 3. Auswahl bestätigen (Enter)
    else if (e.key === 'Enter') {
      if (this.keyboardIndex >= 0 && items[this.keyboardIndex]) {
        items[this.keyboardIndex].click();
      }
    }

    // 4. Schließen (Esc)
    else if (e.key === 'Escape') {
      this.hide();
    }
  }

  // Hilfsmethode für Radius-Wechsel (via Click oder Keyboard)
  changeRadius(newRadius) {
    if (this.currentRadius === newRadius) return;
    this.currentRadius = newRadius;
    this.keyboardIndex = -1; // Reset Auswahl bei Radius-Wechsel
    if (this.clickLocation) this.drawSearchCircle(this.clickLocation.lat, this.clickLocation.lon);
    this.showPopover();
  }

  updateKeyboardSelection(items) {
    items.forEach((item, idx) => {
      if (idx === this.keyboardIndex) {
        item.style.backgroundColor = 'var(--item-status-color)';
        item.classList.add('keyboard-active');
        item.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      } else {
        item.style.backgroundColor = '';
        item.classList.remove('keyboard-active');
      }
    });
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text || '';
    return div.innerHTML;
  }

  positionPopover(mouseX, mouseY) {
    if (!this.popoverElement) return;
    const popWidth = 300;
    const popHeight = this.popoverElement.offsetHeight;
    let left = mouseX + 15;
    let top = mouseY + 15;
    if (left + popWidth > window.innerWidth) left = mouseX - popWidth - 15;
    if (top + popHeight > window.innerHeight) top = mouseY - popHeight - 15;
    this.popoverElement.style.left = Math.max(10, left) + 'px';
    this.popoverElement.style.top = Math.max(10, top) + 'px';
  }

  getStyleIcon(space) {
    const key = space.style ? space.style.toLowerCase() : '';
    return this.styleIconMap[key] ? `<i class="${this.styleIconMap[key]} nearby-icon"></i>` : '';
  }

  getStatusIcon(space) {
    if (!space.spaceapi?.endpoint) return '';
    if (space.isOpen === true) return `<i class="${window.MapIcons.statusMap.open} nearby-icon"></i>`;
    if (space.isOpen === false) return `<i class="${window.MapIcons.statusMap.closed} nearby-icon"></i>`;
    return `<i class="${window.MapIcons.statusMap.unknown} nearby-icon"></i>`;
  }

  getSpaceStatusColor(space) {
    return window.MapIcons.getDynamicColor(space);
  }

  getCountryCode(c) {
    return window.MapIcons.getCountryCode(c);
  }

  calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  attachEventListeners() {
    this.popoverElement.querySelector('.nearby-close-btn').addEventListener('click', () => this.hide());
    this.popoverElement.style.cursor = 'grab';

    let isDragging = false;
    let startPos = { x: 0, y: 0 };

    this.popoverElement.addEventListener('pointerdown', (e) => {
      if (e.target.closest('.nearby-radius-btn') ||
        e.target.closest('.nearby-close-btn') ||
        e.target.closest('.nearby-item') ||
        e.target.closest('.nearby-popover-list')) {
        return;
      }

      isDragging = true;
      startPos = {
        x: e.clientX - this.popoverElement.offsetLeft,
        y: e.clientY - this.popoverElement.offsetTop
      };

      this.popoverElement.style.cursor = 'grabbing';
      this.popoverElement.setPointerCapture(e.pointerId);
      e.preventDefault();
    });

    this.popoverElement.addEventListener('pointermove', (e) => {
      if (!isDragging) return;
      const newLeft = e.clientX - startPos.x;
      const newTop = e.clientY - startPos.y;
      const maxX = window.innerWidth - this.popoverElement.offsetWidth;
      const maxY = window.innerHeight - this.popoverElement.offsetHeight;
      this.popoverElement.style.left = Math.max(0, Math.min(newLeft, maxX)) + 'px';
      this.popoverElement.style.top = Math.max(0, Math.min(newTop, maxY)) + 'px';
    });

    this.popoverElement.addEventListener('pointerup', (e) => {
      if (isDragging) {
        isDragging = false;
        this.popoverElement.style.cursor = 'grab';
      }
    });

    this.reattachRadiusAndItemListeners();
  }

  reattachRadiusAndItemListeners() {
    this.popoverElement.querySelectorAll('.nearby-radius-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        this.changeRadius(parseInt(e.target.dataset.radius));
      });
    });

    this.popoverElement.querySelectorAll('.nearby-item').forEach(item => {
      item.addEventListener('click', () => {
        const marker = window.markerById.get(parseInt(item.dataset.id));
        if (marker) {
          window.map.flyTo(marker.getLatLng(), 15);
          setTimeout(() => marker.openPopup(), 500);
          this.hide();
        }
      });

      item.addEventListener('mouseenter', () => {
        this.keyboardIndex = -1;
        this.popoverElement.querySelectorAll('.nearby-item').forEach(i => {
          i.style.backgroundColor = '';
          i.classList.remove('keyboard-active');
        });
      });
    });
  }

  showCursorIcon(lat, lon) {
    if (this.cursorIcon) this.map.removeLayer(this.cursorIcon);
    this.cursorIcon = L.marker([lat, lon], {
      icon: L.divIcon({
        html: `<div class="nearby-cursor-icon"><i class="${window.MapIcons.uiMap.CROSSHAIRS}"></i></div>`,
        className: 'nearby-cursor-marker',
        iconSize: [40, 40],
        iconAnchor: [20, 20]
      }),
      interactive: false,
      zIndexOffset: 1000
    }).addTo(this.map);
  }
}

window.nearbySpacesManager = new NearbySpacesManager();