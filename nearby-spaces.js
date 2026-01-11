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

    this.shrinkTimer = null;
    this.inactivityTimer = null;
    this.opacityTimer = null;
    this.isInactive = false;

    this.styleIconMap = {
      'for all': 'fas fa-people-group',
      'for students': 'fas fa-graduation-cap',
      'for youth': 'fas fa-child',
      'for students & youth': 'fas fa-graduation-cap',
      'commercial': 'fas fa-money-bill-wave',
    };
  }

  init(map) {
    this.map = map;
    this.createHint();
    this.setupEventListeners();
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
    }, 1200);
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
      }, 4200);
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

  showAtCursor(lat, lon, mouseX, mouseY) {
    this.lastPixels = { x: mouseX, y: mouseY };
    this.clickLocation = { lat, lon };
    this.showCursorIcon(lat, lon);

    // 1. Alle Daten vorab berechnen
    this.updateNearbyData(lat, lon);

    // 2. Radius-Automatik (Goldilocks-Logik: Nicht zu viele, nicht zu wenige)
    const radii = [15, 25, 50, 75];

    // Wir starten die Prüfung beim aktuell gesetzten Radius (Standard 25)
    let bestIndex = radii.indexOf(this.currentRadius);
    if (bestIndex === -1) bestIndex = 1; // Fallback auf 25km

    // Schritt A: Wenn zu viele (> 5), versuche kleiner zu werden
    while (bestIndex > 0) {
      const currentCount = (this.resultsCache[radii[bestIndex]] || []).length;
      if (currentCount > 5) {
        bestIndex--; // Eine Stufe kleiner probieren
      } else {
        break; // Anzahl ist okay (<= 5)
      }
    }

    // Schritt B: Wenn danach immer noch zu wenige (< 2), versuche größer zu werden
    // (Aber nur, wenn wir nicht gerade in Schritt A verkleinert haben)
    while (bestIndex < radii.length - 1) {
      const currentCount = (this.resultsCache[radii[bestIndex]] || []).length;
      if (currentCount < 2) {
        bestIndex++; // Eine Stufe größer probieren
      } else {
        break; // Anzahl ist okay (>= 2)
      }
    }

    // Den finalen Radius setzen
    this.currentRadius = radii[bestIndex];

    // 3. Popover anzeigen
    this.showPopover(mouseX, mouseY);

    if (this.hintElement) this.hintElement.style.display = 'none';
  }



  hide() {
    if (this.popoverElement) this.popoverElement.remove();
    this.popoverElement = null;
    if (this.cursorIcon) this.map.removeLayer(this.cursorIcon);
    this.cursorIcon = null;
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

    this.resultsCache = {
      15: allWithDist.filter(s => s.distance <= 15),
      25: allWithDist.filter(s => s.distance <= 25),
      50: allWithDist.filter(s => s.distance <= 50),
      75: allWithDist.filter(s => s.distance <= 75)
    };
  }

  showPopover(mouseX, mouseY) {
    // 1. Koordinaten-Management
    const x = mouseX || (this.lastPixels ? this.lastPixels.x : 0);
    const y = mouseY || (this.lastPixels ? this.lastPixels.y : 0);

    if (!this.lastPixels && !mouseX) return;

    // 2. Daten aus dem Cache holen
    const currentSpaces = this.resultsCache[this.currentRadius] || [];

    if (this.popoverElement) this.popoverElement.remove();

    // 3. Container erstellen
    this.popoverElement = document.createElement('div');
    this.popoverElement.className = 'nearby-popover settings-popover';

    // 4. Header erstellen (Zweizeilig)
    const header = document.createElement('div');
    header.className = 'nearby-popover-header settings-header';
    header.innerHTML = `
      <div class="nearby-header-row-top">
        <div class="settings-header-content">
          <i class="fas fa-map-marker-alt" style="color: var(--space-hover); margin-right: 6px;"></i>
          <span class="nearby-header-text"><b>${currentSpaces.length}</b> Makerspaces in der Nähe:</span>
        </div>
        <button class="settings-icon-btn nearby-close-btn"><i class="fas fa-times"></i></button>
      </div>
      <div class="nearby-header-row-bottom">
        <div class="settings-header-icons">
          <span class="nearby-header-text" style="margin-right:8px">Umkreis:</span>
          ${[15, 25, 50, 75].map(r => `
            <button class="nearby-radius-btn ${this.currentRadius === r ? 'active' : ''}" data-radius="${r}">${r}</button>
          `).join('')}
          <span class="nearby-header-text" style="margin-left:5px">km</span>
        </div>
      </div>
    `;

    // 5. Liste erstellen
    const list = document.createElement('div');
    list.className = 'nearby-popover-list';

    if (currentSpaces.length === 0) {
      list.innerHTML = `<div class="nearby-empty">Keine Spaces - Radius erweitern.</div>`;
    } else {
      list.innerHTML = currentSpaces.slice(0, 20).map(space => {
        const statusColor = this.getSpaceStatusColor(space);
        const styleIcon = this.getStyleIcon(space);
        const statusIcon = this.getStatusIcon(space);
        const countryCode = this.getCountryCode(space.loc.country);
        const distInt = Math.round(space.distance);

        // DIESE ZEILE HAT GEFEHLT:
        const fullSpaceName = this.escapeHtml(space.name);

        return `
          <div class="nearby-item" data-id="${space.ID}" style="--item-status-color: ${statusColor}">
              <span class="nearby-dist-badge">${distInt} km</span>
              <div class="nearby-item-content">
                  <div class="nearby-item-name" style="color: ${statusColor}">
                    <span class="nearby-icons-container">${styleIcon}${statusIcon}</span>
                    <span class="nearby-name-text" title="${fullSpaceName}">${fullSpaceName}</span>
                  </div>
                  <div class="nearby-item-details">
                    <span class="fi fi-${countryCode}"></span>
                    <span class="nearby-plz">${space.loc.plz || ''}</span>
                    <span class="nearby-city">${this.escapeHtml(space.loc.city)}</span>
                  </div>
              </div>
          </div>
        `;
      }).join('');
    }

    // WICHTIG: Vergiss nicht die Zeilen nach dem Loop, 
    // die alles zusammenfügen (falls du sie versehentlich mitgelöscht hast):
    this.popoverElement.appendChild(header);
    this.popoverElement.appendChild(list);
    this.popoverElement.style.visibility = 'hidden';
    this.popoverElement.style.display = 'flex';
    document.body.appendChild(this.popoverElement);
    this.positionPopover(x, y);
    this.popoverElement.style.visibility = 'visible';
    this.attachEventListeners();
  }



  // Diese Funktion hat gefehlt!
  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text || '';
    return div.innerHTML;
  }

  positionPopover(mouseX, mouseY) {
    if (!this.popoverElement) return;
    const popWidth = 300;
    const popHeight = this.popoverElement.offsetHeight;
    const padding = 15;
    const winWidth = window.innerWidth;
    const winHeight = window.innerHeight;
    let left = mouseX + padding;
    let top = mouseY + padding;
    if (left + popWidth > winWidth) left = mouseX - popWidth - padding;
    if (top + popHeight > winHeight) top = mouseY - popHeight - padding;
    this.popoverElement.style.left = Math.max(padding, left) + 'px';
    this.popoverElement.style.top = Math.max(padding, top) + 'px';
    this.popoverElement.style.width = popWidth + 'px';
  }

  getStyleIcon(space) {
    const key = space.style ? space.style.toLowerCase() : '';
    return this.styleIconMap[key] ? `<i class="${this.styleIconMap[key]} nearby-icon"></i>` : '';
  }
  getStatusIcon(space) {
    if (space.isOpen === true) return `<i class="fas fa-door-open nearby-icon"></i>`;
    if (space.isOpen === false) return `<i class="fas fa-door-closed nearby-icon"></i>`;
    if (space.spaceapi && space.spaceapi.endpoint) return `<i class="fas fa-question-circle nearby-icon"></i>`;
    return '';
  }
  getSpaceStatusColor(space) {
    if (space.isOpen === true) return 'var(--space-open)';
    if (space.isOpen === false) return 'var(--space-closed)';
    if (space.spaceapi && space.spaceapi.endpoint) return 'var(--space-unknown)';
    return 'blue';
  }
  getCountryCode(c) {
    const m = { 'Germany': 'de', 'Austria': 'at', 'Switzerland': 'ch', 'France': 'fr', 'Netherlands': 'nl', 'Belgium': 'be', 'Italy': 'it', 'Spain': 'es', 'Ukraine': 'ua' };
    return m[c] || 'un';
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

    this.popoverElement.querySelectorAll('.nearby-radius-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.currentRadius = parseInt(e.target.dataset.radius);
        this.showPopover();
      });
    });
    this.popoverElement.querySelectorAll('.nearby-item').forEach(item => {
      item.addEventListener('click', () => {
        const marker = window.markerById.get(parseInt(item.dataset.id));
        if (marker) {
          this.map.flyTo(marker.getLatLng(), 15);
          setTimeout(() => marker.openPopup(), 500);
          this.hide();
        }
      });
    });
  }
  showCursorIcon(lat, lon) {
    if (this.cursorIcon) this.map.removeLayer(this.cursorIcon);
    const icon = L.divIcon({
      html: `<div class="nearby-cursor-icon"><i class="fas fa-crosshairs"></i></div>`,
      className: 'nearby-cursor-marker',
      iconSize: [40, 40],
      iconAnchor: [20, 20]
    });
    this.cursorIcon = L.marker([lat, lon], { icon, interactive: false, zIndexOffset: 1000 }).addTo(this.map);
  }
}

window.nearbySpacesManager = new NearbySpacesManager();