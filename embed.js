// embed.js - Präzise Zentrierung mit Sidebar-Offset

class EmbedMapExtended {
  constructor() {
    const params = new URLSearchParams(window.location.search);
    this.targetId = parseInt(params.get('id'));
    this.friendIds = (params.get('friends') || '')
      .split(',')
      .map(Number)
      .filter(Boolean);

    if (!this.targetId || isNaN(this.targetId)) {
      this.showError('Invalid or missing space ID');
      return;
    }

    this.allIds = [this.targetId, ...this.friendIds];
    this.targetSpace = null;
    this.friendSpaces = [];
    this.markers = new Map();
    this.map = null;
    this.stickyMarker = null;
    this.minimapMarkersBySpaceId = new Map();

    console.log('🎯 Extended Embed Map initialized:', {
      target: this.targetId,
      friends: this.friendIds
    });
  }

  async init() {
    try {
      await this.loadData();
      this.createMap();
      this.createMarkers();
      this.showLogo();
      this.createTargetDropdown();
      this.createMinimap();

      if (this.friendSpaces.length > 0) {
        this.createFriendsDropdown();
      }

      this.setupKeyboardNavigation();

      // ✅ Initialer Aufruf: Kurz warten, bis der Container stabil ist
      setTimeout(() => {
        this.selectSpace(this.targetId, false);
        this.snapFriendsDropdownHeight();
      }, 400);

      document.getElementById('loading').style.display = 'none';
    } catch (error) {
      console.error('❌ Extended Embed Map error:', error);
      this.showError('Failed to load map: ' + error.message);
    }
  }

  async loadData() {
    const response = await fetch('locations.json');
    if (!response.ok) throw new Error('Failed to load locations.json');

    const allSpaces = await response.json();
    this.targetSpace = allSpaces.find(s => s.ID === this.targetId);
    this.friendSpaces = this.friendIds
      .map(id => allSpaces.find(s => s.ID === id))
      .filter(Boolean);

    if (!this.targetSpace) throw new Error(`Target space not found: ID ${this.targetId}`);

    try {
      const statusResponse = await fetch('status.json');
      if (statusResponse.ok) {
        const statusData = await statusResponse.json();
        const allData = [this.targetSpace, ...this.friendSpaces];
        statusData.spaces.forEach(statusEntry => {
          const space = allData.find(s => s.name === statusEntry.name);
          if (space && statusEntry.status !== undefined) {
            space.isOpen = statusEntry.status;
          }
        });
      }
    } catch (error) {
      console.warn('⚠️ SpaceAPI Status Update failed');
    }
  }

  createMap() {
    this.map = L.map('map', {
      zoomControl: false,
      attributionControl: true,
      maxZoom: 18,
      minZoom: 3,
      closePopupOnClick: false   // WICHTIG: Klick in die Karte schließt das geöffnete Popup NICHT
    });

    // ✅ Initialer Viewport, damit Leaflet ein Koordinatensystem hat
    this.map.setView([51.1657, 10.4515], 6);

    try {
      const mapLibreLayer = L.maplibreGL({
        style: 'https://tiles.openfreemap.org/styles/liberty',
        attribution: '&copy; <a href="https://openfreemap.org/">OpenFreeMap</a>'
      });
      mapLibreLayer.addTo(this.map);
    } catch (error) {
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(this.map);
    }
    window.map = this.map;
  }

  createMarkers() {
    this.createMarker(this.targetSpace, true);
    this.friendSpaces.forEach(space => this.createMarker(space, false));
  }

  createMarker(space, isTarget) {
    // ✅ KORRIGIERT: Zugriff über window.MapIcons.icons (lazy loaded getters)
    let icon = window.MapIcons?.icons?.highlightIcon;
    if (space.spaceapi && space.spaceapi.endpoint) {
      if (space.isOpen === true) icon = window.MapIcons?.icons?.greenIcon;
      else if (space.isOpen === false) icon = window.MapIcons?.icons?.redIcon;
      else icon = window.MapIcons?.icons?.unknownStatusIcon;
    }
    if (!icon) icon = window.MapIcons?.icons?.defaultIcon;

    const marker = L.marker([space.loc.lat, space.loc.long], {
      icon, riseOnHover: true, interactive: false
    });
    marker.bindPopup(this.createPopupContent(space, isTarget), { maxWidth: 440, minWidth: 160, closeButton: false });
    marker.on('popupopen', () => this.handlePopupOpen(marker, space));
    marker.addTo(this.map);
    this.markers.set(space.ID, marker);
  }

  /**
   * ✅ PRÄZISE ZENTRIERUNG:
   * Berechnet den Ziel-Mittelpunkt so, dass der Marker im freien Bereich 
   * rechts neben der Sidebar landet.
   */
  selectSpace(spaceId, animate = true) {
    console.log('🎯 Selecting space:', spaceId);
    const marker = this.markers.get(spaceId);
    if (!marker) return;

    this.activeSpaceId = spaceId;

    // Sidebar UI Sync
    document.querySelectorAll('.space-item.active').forEach(item => item.classList.remove('active'));
    const item = document.querySelector(`.space-item[data-space-id="${spaceId}"]`);
    if (item) {
      item.classList.add('active');
      const friendsDropdown = document.querySelector('.friends-dropdown');
      if (friendsDropdown && friendsDropdown.contains(item)) {
        const items = friendsDropdown.querySelectorAll('.listing-item');
        if (item === items[0]) {
          friendsDropdown.scrollTo({ top: 0, behavior: 'smooth' });
        } else if (item === items[items.length - 1]) {
          friendsDropdown.scrollTo({ top: friendsDropdown.scrollHeight, behavior: 'smooth' });
        } else {
          item.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        }
      }
    }

    // Minimap Sync
    this.highlightMinimapMarker(spaceId);

    // Popup Logic
    this.markers.forEach((m, id) => { if (id !== spaceId) m.closePopup(); });
    marker.openPopup();
    this.stickyMarker = marker;

    // --- BERECHNUNG DES OFFSETS ---
    const zoom = 14;
    const sidebarWidth = 316; // Breite + Gap
    const targetLatLng = marker.getLatLng();

    // 1. Projiziere die Koordinaten des Markers in Pixel (bei Zoom 14)
    const targetPoint = this.map.project(targetLatLng, zoom);

    // 2. Verschiebe den Kartenmittelpunkt-Pixelwert nach LINKS.
    // Wenn der Kartenmittelpunkt nach links wandert, rückt der Marker nach rechts.
    const offsetPoint = L.point(targetPoint.x - (sidebarWidth / 2 - 20), targetPoint.y - 120);

    // 3. Rückumrechnung in Geokoordinaten
    const offsetLatLng = this.map.unproject(offsetPoint, zoom);

    // 4. EINZIGER Aufruf für die Bewegung
    this.map.setView(offsetLatLng, zoom, {
      animate: animate,
      duration: animate ? 0.8 : 0
    });
  }

  createPopupContent(space, isTarget) {
    let statusIconHtml = '';
    let nameClass = '';
    let statusColor = 'blue';

    if (space.isOpen === true) {
      statusIconHtml = '<i class="fas fa-door-open"></i> ';
      nameClass = 'space-open';
      statusColor = 'var(--space-open)';
    } else if (space.isOpen === false) {
      statusIconHtml = '<i class="fas fa-lock"></i> ';
      nameClass = 'space-closed';
      statusColor = 'var(--space-closed)';
    } else if (space.spaceapi?.endpoint) {
      statusIconHtml = '<i class="fas fa-question-circle"></i> ';
      nameClass = 'space-unknown';
      statusColor = 'var(--space-unknown)';
    }

    const styleIconMap = { 'for all': 'fas fa-people-group', 'for students': 'fas fa-graduation-cap', 'for youth': 'fas fa-child', 'commercial': 'fas fa-money-bill-wave' };
    const locationStyle = space.style?.toLowerCase() || '';
    const styleIconHtml = styleIconMap[locationStyle] ? `<i class="${styleIconMap[locationStyle]}"></i> ` : '';
    const countryCode = this.getCountryCode(space.loc?.country || '');

    return `
      <div style="--status-color: ${statusColor};">
        <h3 id="style">${styleIconHtml}${space.style || ''}</h3>
        <div style="display: flex; align-items: center; gap: 8px;">
          <a id="titleurl" href="${space.link?.url || '#'}" target="_blank">
            <h3 class="${nameClass}" data-id="${space.ID}">${statusIconHtml}${space.name || 'Unnamed Space'}</h3>
          </a>
        </div>
        <br><br>
        <div class="popup-street-line">
          <span class="street">${space.loc?.street?.name || ''} ${space.loc?.street?.number || ''}<span class="streetext">${space.loc?.street?.ext || ''}</span></span>
        </div>
        ${this.zfill(space.loc?.plz || '', space.loc?.country || '')} <b>${space.loc?.city || ''}</b><br>
        <span class="country"><span class="fi fi-${countryCode}"></span>${space.loc?.country || ''}</span><br>
        <a id="url" href="${space.link?.url || '#'}" target="_blank"><b>${space.link?.text || space.link?.url || ''}</b></a>
      </div>`;
  }

  createDropdownItem(space, isTarget) {
    let statusIconHtml = '<i class="fas fa-question-circle door-icon-unknown" style="opacity:0"></i>';
    let statusClass = 'space-default';
    if (space.spaceapi?.endpoint) {
      if (space.isOpen === true) { statusIconHtml = '<i class="fas fa-door-open door-icon-open"></i>'; statusClass = 'space-open'; }
      else if (space.isOpen === false) { statusIconHtml = '<i class="fas fa-lock door-icon-closed"></i>'; statusClass = 'space-closed'; }
      else { statusIconHtml = '<i class="fas fa-question-circle door-icon-unknown"></i>'; statusClass = 'space-unknown'; }
    }
    const styleIconMap = { 'for all': 'fas fa-people-group', 'for students': 'fas fa-graduation-cap', 'for youth': 'fas fa-child', 'commercial': 'fas fa-money-bill-wave' };
    const styleIconHtml = styleIconMap[space.style?.toLowerCase()] ? `<i class="${styleIconMap[space.style?.toLowerCase()]} style-icon"></i> ` : '';
    const item = document.createElement('div');
    item.className = `space-item listing-item ${statusClass} ${isTarget ? 'target' : ''}`;
    item.dataset.spaceId = space.ID;
    const addressLines = isTarget ? `
      <div class="listing-item-details">${space.loc?.street?.name || ''} ${space.loc?.street?.number || ''}</div>
      <div class="listing-item-details">${this.zfill(space.loc?.plz, space.loc?.country)} <b>${space.loc?.city || ''}</b></div>
      <div class="listing-item-details"><span class="fi fi-${this.getCountryCode(space.loc?.country)}"></span> ${space.loc?.country || ''}</div>` : `
      <div class="listing-item-details"><b>${space.loc?.city || ''}</b>, ${space.loc?.country || ''}</div>`;
    item.innerHTML = `
      <div class="listing-item-content">
        ${isTarget ? '<div class="our-space-pill">Our Space</div>' : ''}
        <div class="listing-item-name"><span>${styleIconHtml}${space.name}</span></div>
        <div class="listing-item-address">
          <span class="listing-status-icon">${statusIconHtml}</span>
          <div class="listing-item-address-lines">
            ${addressLines}
          </div>
        </div>
      </div>`;
    return item;
  }

  showLogo() {
    const container = document.createElement('div');
    container.id = 'embed-sidebar';
    container.style.cssText = `position: absolute; left: 1em; top: 1em; z-index: 400; display: flex; flex-direction: column; gap: 16px; max-height: calc(100vh - 2em);`;
    container.innerHTML = `<a href="./" target="_blank"><div class="title">📍maker<span class="frame"><span class="spac">spac</span><span class="smaller">.es</span></span></div></a>`;
    document.body.appendChild(container);
  }

  createTargetDropdown() {
    const dropdown = document.createElement('div');
    dropdown.className = 'embed-dropdown target-dropdown is-active';
    const item = this.createDropdownItem(this.targetSpace, true);
    item.addEventListener('click', () => this.selectSpace(this.targetId));
    dropdown.appendChild(item);
    document.getElementById('embed-sidebar').appendChild(dropdown);
  }

  createMinimap() {
    const minimapContainer = document.createElement('div');
    minimapContainer.id = 'minimap-container';
    minimapContainer.innerHTML = '<div id="minimap"></div>';
    document.getElementById('embed-sidebar').appendChild(minimapContainer);
    const minimap = L.map('minimap', { zoomControl: false, attributionControl: false, dragging: false, scrollWheelZoom: false });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(minimap);
    const coords = [];
    [this.targetSpace, ...this.friendSpaces].forEach(space => {
      let color = space.spaceapi ? (space.isOpen === true ? '#009900' : (space.isOpen === false ? '#DD0000' : '#FF8C00')) : '#0000ff';
      const icon = L.divIcon({ className: 'minimap-marker', html: `<svg viewBox="0 0 25 41" width="12" height="20"><path fill="${color}" stroke="#000" d="M12.5,1 C6,1 1,6 1,12.5 C1,21 12.5,39 12.5,39 C12.5,39 24,21 24,12.5 C24,6 19,1 12.5,1 Z"/><circle fill="#fff" cx="12.5" cy="12.5" r="3"/></svg>`, iconSize: [12, 20], iconAnchor: [6, 20] });
      const m = L.marker([space.loc.lat, space.loc.long], { icon, title: space.name }).addTo(minimap);  // ✅ title hinzugefügt
      m.on('click', () => this.selectSpace(space.ID));
      this.minimapMarkersBySpaceId.set(space.ID, { marker: m });
      coords.push([space.loc.lat, space.loc.long]);
    });
    if (coords.length) minimap.fitBounds(L.latLngBounds(coords), { padding: [2, 2] });
    this.minimap = minimap;
  }

  highlightMinimapMarker(spaceId) {
    this.minimapMarkersBySpaceId.forEach((data) => data.marker._icon?.classList.remove('active'));
    this.minimapMarkersBySpaceId.get(spaceId)?.marker._icon?.classList.add('active');
  }

  createFriendsDropdown() {
    const dropdown = document.createElement('div');
    dropdown.className = 'embed-dropdown friends-dropdown is-active';
    dropdown.innerHTML = '<div class="dropdown-header">friends of our makerspace</div>';
    this.friendSpaces.forEach(space => {
      const item = this.createDropdownItem(space, false);
      item.addEventListener('click', () => this.selectSpace(space.ID));
      dropdown.appendChild(item);
    });
    document.getElementById('embed-sidebar').appendChild(dropdown);
  }

  snapFriendsDropdownHeight() {
    const dropdown = document.querySelector('.friends-dropdown');
    if (!dropdown) return;

    const header = dropdown.querySelector('.dropdown-header');
    const items = dropdown.querySelectorAll('.listing-item');
    if (!items.length) return;

    const headerHeight = header ? header.getBoundingClientRect().height : 0;
    const itemHeight = items[0].getBoundingClientRect().height;
    const availableHeight = dropdown.getBoundingClientRect().height;
    const itemsSpace = availableHeight - headerHeight;
    const visibleItems = Math.floor(itemsSpace / itemHeight);

    if (visibleItems > 0 && visibleItems < items.length) {
      dropdown.style.maxHeight = (headerHeight + visibleItems * itemHeight) + 'px';
    }
  }

  setupKeyboardNavigation() {
    this.activeSpaceId = this.targetId;

    document.addEventListener('keydown', (e) => {
      if (!['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp'].includes(e.key)) return;
      e.preventDefault();

      const idx = this.allIds.indexOf(this.activeSpaceId);
      let next;

      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        next = (idx + 1) % this.allIds.length;
      } else {
        next = (idx - 1 + this.allIds.length) % this.allIds.length;
      }

      this.activeSpaceId = this.allIds[next];
      this.selectSpace(this.activeSpaceId);
    });
  }

  handlePopupOpen(marker, space) {
    document.querySelectorAll('.space-item.active').forEach(item => item.classList.remove('active'));
    document.querySelector(`.space-item[data-space-id="${space.ID}"]`)?.classList.add('active');
    this.highlightMinimapMarker(space.ID);
  }

  zfill(value, country) {
    if (!value) return '';
    const str = value.toString();
    if (country === 'Germany' && str.length < 5) return str.padStart(5, '0');
    if (country === 'Austria' && str.length < 4) return str.padStart(4, '0');
    return str;
  }

  getCountryCode(country) {
    const countryMap = { 'Germany': 'de', 'Austria': 'at', 'Switzerland': 'ch', 'Ukraine': 'ua', 'Netherlands': 'nl', 'Belgium': 'be' };
    return countryMap[country] || 'un';
  }

  showError(message) {
    const load = document.getElementById('loading'); if (load) load.style.display = 'none';
    const errorDiv = document.createElement('div'); errorDiv.className = 'error';
    errorDiv.innerHTML = `<div class="error-title">⚠️ Error</div><div class="error-message">${message}</div>`;
    document.body.appendChild(errorDiv);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  window.embedMap = new EmbedMapExtended();
  if (window.embedMap.targetId) window.embedMap.init();
});