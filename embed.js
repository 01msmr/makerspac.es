// embed.js - Extended Embed Map mit Icon-Unterstützung

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

    console.log('🎯 Extended Embed Map initialized:', {
      target: this.targetId,
      friends: this.friendIds,
      total: this.allIds.length
    });
  }

  async init() {
    try {
      await this.loadData();
      this.createMap();
      this.createMarkers();
      this.fitToMarkers();
      this.showLogo();
      this.createTargetDropdown();

      // ✅ Erstelle Minimap ZWISCHEN Target und Friends
      this.createMinimap();

      if (this.friendSpaces.length > 0) {
        this.createFriendsDropdown();
      }

      setTimeout(() => this.openTargetPopup(), 800);
      document.getElementById('loading').style.display = 'none';

      console.log('✅ Extended Embed Map ready');

    } catch (error) {
      console.error('❌ Extended Embed Map error:', error);
      this.showError('Failed to load map: ' + error.message);
    }
  }

  async loadData() {
    console.log('📥 Loading data...');

    const response = await fetch('locations.json');
    if (!response.ok) {
      throw new Error('Failed to load locations.json');
    }

    const allSpaces = await response.json();

    this.targetSpace = allSpaces.find(s => s.ID === this.targetId);
    this.friendSpaces = this.friendIds
      .map(id => allSpaces.find(s => s.ID === id))
      .filter(Boolean);

    if (!this.targetSpace) {
      throw new Error(`Target space not found: ID ${this.targetId}`);
    }

    console.log('✅ Loaded:', {
      target: this.targetSpace.name,
      friends: this.friendSpaces.length
    });
  }

  createMap() {
    console.log('🗺️ Creating map...');

    this.map = L.map('map', {
      zoomControl: true,
      attributionControl: true,
      maxZoom: 18,
      minZoom: 3
    });

    try {
      const mapLibreLayer = L.maplibreGL({
        style: 'https://tiles.openfreemap.org/styles/liberty',
        attribution: '&copy; <a href="https://openfreemap.org/">OpenFreeMap</a> &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
      });

      mapLibreLayer.addTo(this.map);
      console.log('✅ MapLibre layer added');

    } catch (error) {
      console.error('⚠️ MapLibre failed, falling back to OSM tiles');

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
      }).addTo(this.map);
    }

    window.map = this.map;
  }

  createMarkers() {
    console.log('📍 Creating markers...');

    this.createMarker(this.targetSpace, true);

    this.friendSpaces.forEach(space => {
      this.createMarker(space, false);
    });

    console.log('✅ Created', this.markers.size, 'markers');
  }

  createMarker(space, isTarget) {
    // ✅ KORRIGIERT: Prüfe SpaceAPI ZUERST
    let icon;

    if (space.spaceapi && space.spaceapi.endpoint) {
      // Hat SpaceAPI → Verwende Status-Icon
      if (space.isOpen === true) {
        icon = window.MapIcons?.greenIcon;
      } else if (space.isOpen === false) {
        icon = window.MapIcons?.redIcon;
      } else {
        icon = window.MapIcons?.unknownStatusIcon;
      }
    } else {
      // Kein SpaceAPI → Grau
      icon = window.MapIcons?.highlightIcon;
    }

    if (!icon) {
      console.warn('⚠️ Icon not found, using default');
      icon = window.MapIcons?.defaultIcon;
    }

    console.log(`📍 ${space.name}: isOpen=${space.isOpen}, hasAPI=${!!space.spaceapi?.endpoint}`);

    const marker = L.marker([space.loc.lat, space.loc.long], {
      icon: icon,
      riseOnHover: true
    });

    const popupContent = this.createPopupContent(space, isTarget);
    marker.bindPopup(popupContent, {
      maxWidth: 440,
      minWidth: 160
    });

    marker.on('popupopen', (e) => {
      this.handlePopupOpen(marker, space, isTarget);
    });

    marker.addTo(this.map);
    this.markers.set(space.ID, marker);
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
      statusIconHtml = '<i class="fas fa-door-closed"></i> ';
      nameClass = 'space-closed';
      statusColor = 'var(--space-closed)';
    } else if (space.spaceapi?.endpoint) {
      statusIconHtml = '<i class="fas fa-question-circle"></i> ';
      nameClass = 'space-unknown';
      statusColor = 'var(--space-unknown)';
    }

    let styleIconHtml = '';
    const styleIconMap = {
      'for all': 'fas fa-people-group',
      'for students': 'fas fa-graduation-cap',
      'for youth': 'fas fa-child',
      'commercial': 'fas fa-money-bill-wave',
    };

    const locationStyle = space.style?.toLowerCase() || '';
    if (styleIconMap[locationStyle]) {
      styleIconHtml = `<i class="${styleIconMap[locationStyle]}"></i> `;
    }

    const streetName = space.loc?.street?.name || '';
    const streetNumber = space.loc?.street?.number || '';
    const streetExt = space.loc?.street?.ext || '';
    const zip = space.loc?.plz || '';
    const city = space.loc?.city || '';
    const country = space.loc?.country || '';
    const linkUrl = space.link?.url || '#';
    const linkText = space.link?.text || linkUrl;
    const countryCode = this.getCountryCode(country);

    // ✅ BACKLINK AUSKOMMENTIERT (für spätere Verwendung)
    /*
    let backLink = '';
    if (!isTarget) {
      backLink = `
        <div style="margin-bottom: 12px; padding-bottom: 12px; border-bottom: 1px solid rgba(0,0,0,0.1);">
          <a href="#" class="back-to-target" onclick="window.embedMap.jumpToTarget(event)" 
             style="display: flex; align-items: center; gap: 4px; text-decoration: none; font-weight: 600;">
            <i class="fas fa-arrow-left"></i> Back to ${this.targetSpace.name}
          </a>
        </div>
      `;
    }
    */
    const backLink = ''; // Temporär deaktiviert

    return `
      <div style="--status-color: ${statusColor};">
        ${backLink}
        <h3 id="style">${styleIconHtml}${space.style || ''}</h3>
        <div style="display: flex; align-items: center; gap: 8px;">
          <a id="titleurl" href="${linkUrl}" target="_blank">
            <h3 class="${nameClass}">
              ${statusIconHtml}${space.name || 'Unnamed Space'}
            </h3>
          </a>
        </div>
        <br><br>
        <div class="popup-street-line">
          <span class="street">${streetName} ${streetNumber}<span class="streetext">${streetExt}</span></span>
        </div>
        ${this.zfill(zip, country)} <b>${city}</b><br>
        <span class="country">
          <span class="fi fi-${countryCode}" style="margin-right: 4px;"></span>${country}
        </span><br>
        <a id="url" href="${linkUrl}" target="_blank"><b>${linkText}</b></a>
      </div>
    `;
  }

  createDropdownItem(space, isTarget) {
    let statusIcon = '';
    let statusClass = '';

    if (space.spaceapi?.endpoint) {
      if (space.isOpen === true) {
        statusIcon = '<i class="fas fa-door-open door-icon-open"></i> ';
        statusClass = 'space-open';
      } else if (space.isOpen === false) {
        statusIcon = '<i class="fas fa-door-closed door-icon-closed"></i> ';
        statusClass = 'space-closed';
      } else {
        statusIcon = '<i class="fas fa-question-circle door-icon-unknown"></i> ';
        statusClass = 'space-unknown';
      }
    }

    let styleIconHtml = '';
    const styleIconMap = {
      'for all': 'fas fa-people-group',
      'for students': 'fas fa-graduation-cap',
      'for youth': 'fas fa-child',
      'commercial': 'fas fa-money-bill-wave',
    };

    const locationStyle = space.style?.toLowerCase() || '';
    if (styleIconMap[locationStyle]) {
      styleIconHtml = `<i class="${styleIconMap[locationStyle]} style-icon"></i> `;
    }

    const streetName = space.loc?.street?.name || '';
    const streetNumber = space.loc?.street?.number || '';
    const streetExt = space.loc?.street?.ext || '';
    const zip = this.zfill(space.loc?.plz || '', space.loc?.country || '');
    const city = space.loc?.city || '';
    const country = space.loc?.country || '';
    const countryCode = this.getCountryCode(country);

    const item = document.createElement('div');
    item.className = 'space-item suggestion-item';
    if (statusClass) item.classList.add(statusClass);
    if (isTarget) item.classList.add('target');
    item.dataset.spaceId = space.ID;

    // ✅ "Our Space" Pill OBERHALB von Name
    const ourSpacePill = isTarget ? '<div class="our-space-pill">Our Space</div>' : '';

    item.innerHTML = `
      <div class="item-content">
        ${ourSpacePill}
        <div class="item-name">
          <span>${styleIconHtml}${statusIcon}${space.name}</span>
        </div>
        <div class="item-details">${streetName} ${streetNumber} ${streetExt}</div>
        <div class="item-details">${zip} <b>${city}</b></div>
        <div class="item-details"><span class="fi fi-${countryCode}"></span> ${country}</div>
      </div>
    `;

    return item;
  }

  fitToMarkers() {
    // ✅ GEÄNDERT: Fokussiere NUR auf Target-Marker, nicht alle
    const targetMarker = this.markers.get(this.targetId);
    if (targetMarker) {
      this.map.setView(targetMarker.getLatLng(), 14);
      console.log('🎯 Map centered on target marker');
    }
  }

  showLogo() {
    // ✅ Container für Logo + Dropdowns (exakte Ausrichtung)
    const container = document.createElement('div');
    container.id = 'embed-sidebar';
    container.style.cssText = `
      position: absolute;
      left: 2.5em;
      top: 1em;
      z-index: 400;
      display: flex;
      flex-direction: column;
      gap: 16px;
    `;

    const logo = document.createElement('a');
    logo.href = './';
    logo.innerHTML = `
      <div class="title">
        🔧maker<span class="frame"><span class="spac">spac</span><span class="smaller">.es</span></span>
      </div>
    `;

    container.appendChild(logo);
    document.body.appendChild(container);
  }

  createTargetDropdown() {
    console.log('📋 Creating target dropdown...');

    const dropdown = document.createElement('div');
    dropdown.className = 'embed-dropdown target-dropdown is-active';
    dropdown.id = 'target-dropdown';

    // ✅ KEIN HEADER - "Our Space" ist jetzt im Item

    const item = this.createDropdownItem(this.targetSpace, true);
    item.addEventListener('click', () => this.selectSpace(this.targetId));
    dropdown.appendChild(item);

    // ✅ Füge in Container ein (statt body)
    const container = document.getElementById('embed-sidebar');
    if (container) {
      container.appendChild(dropdown);
    } else {
      document.body.appendChild(dropdown);
    }

    console.log('✅ Target dropdown added');
  }

  createMinimap() {
    console.log('🗺️ Creating minimap...');

    // Container für Minimap
    const minimapContainer = document.createElement('div');
    minimapContainer.id = 'minimap-container';

    const minimapDiv = document.createElement('div');
    minimapDiv.id = 'minimap';
    minimapContainer.appendChild(minimapDiv);

    // Füge in Sidebar ein
    const container = document.getElementById('embed-sidebar');
    if (container) {
      container.appendChild(minimapContainer);
    }

    // Erstelle Minimap
    const minimap = L.map('minimap', {
      zoomControl: false,
      attributionControl: false,
      dragging: false,
      touchZoom: false,
      scrollWheelZoom: false,
      doubleClickZoom: false,
      boxZoom: false,
      keyboard: false,
      tap: false
    });

    // Tile Layer
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: ''
    }).addTo(minimap);

    // Alle Marker hinzufügen (halbe Größe, mit SpaceAPI-Farben)
    const allSpaces = [this.targetSpace, ...this.friendSpaces];
    const minimapMarkers = [];

    allSpaces.forEach(space => {
      // ✅ Icon basierend auf SpaceAPI
      let iconUrl;
      let color;

      if (space.spaceapi && space.spaceapi.endpoint) {
        if (space.isOpen === true) {
          color = '#009900'; // Grün
        } else if (space.isOpen === false) {
          color = '#DD0000'; // Rot
        } else {
          color = '#FF8C00'; // Orange
        }
      } else {
        color = '#666666'; // Grau (kein API)
      }

      // ✅ Halbe Größe: 12.5px x 20.5px (statt 25px x 41px)
      const icon = L.divIcon({
        className: 'minimap-marker',
        html: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 25 41" width="12.5" height="20.5">
          <path fill="${color}" stroke="#000" stroke-width="1" d="M12.5,1 C6.16,1 1,6.16 1,12.5 C1,20.88 12.5,39 12.5,39 C12.5,39 24,20.88 24,12.5 C24,6.16 18.84,1 12.5,1 Z"/>
          <circle fill="#fff" cx="12.5" cy="12.5" r="3"/>
        </svg>`,
        iconSize: [12.5, 20.5],
        iconAnchor: [6.25, 20.5]
      });

      const marker = L.marker([space.loc.lat, space.loc.long], {
        icon,
        title: space.name, // ✅ HTML-Title für Hover
        spaceId: space.ID  // ✅ Speichere ID für Click-Handler
      });

      // ✅ Click-Handler: Springe zu diesem Space
      marker.on('click', () => {
        console.log('🗺️ Minimap click:', space.name);
        this.selectSpace(space.ID);
      });

      // ✅ Hover-Cursor
      marker.on('mouseover', function () {
        this._icon.style.cursor = 'pointer';
      });

      marker.addTo(minimap);
      minimapMarkers.push([space.loc.lat, space.loc.long]);

      // ✅ Speichere Minimap-Marker für Highlighting
      if (!this.minimapMarkersBySpaceId) {
        this.minimapMarkersBySpaceId = new Map();
      }
      this.minimapMarkersBySpaceId.set(space.ID, { marker, color, space });
    });

    // ✅ Fit auf alle Marker
    if (minimapMarkers.length > 0) {
      const bounds = L.latLngBounds(minimapMarkers);
      minimap.fitBounds(bounds, {
        padding: [20, 20]
      });
    }

    this.minimap = minimap;

    console.log('✅ Minimap created');
  }

  highlightMinimapMarker(spaceId) {
    if (!this.minimapMarkersBySpaceId) return;

    console.log('🎯 Highlighting minimap marker:', spaceId);

    // Entferne alte Highlights
    this.minimapMarkersBySpaceId.forEach((data, id) => {
      if (data.marker._icon) {
        data.marker._icon.classList.remove('active');
      }
    });

    // Setze neues Highlight
    const activeData = this.minimapMarkersBySpaceId.get(spaceId);
    if (activeData && activeData.marker._icon) {
      activeData.marker._icon.classList.add('active');
    }
  }

  createFriendsDropdown() {
    console.log('📋 Creating friends dropdown...');

    const dropdown = document.createElement('div');
    dropdown.className = 'embed-dropdown friends-dropdown is-active';
    dropdown.id = 'friends-dropdown';

    const header = document.createElement('div');
    header.className = 'dropdown-header';
    header.textContent = `Our ${this.friendSpaces.length} Friends`; // ✅ "Our X Friends"
    dropdown.appendChild(header);

    this.friendSpaces.forEach(space => {
      const item = this.createDropdownItem(space, false);
      item.addEventListener('click', () => this.selectSpace(space.ID));
      dropdown.appendChild(item);
    });

    // ✅ Füge in Container ein (statt body)
    const container = document.getElementById('embed-sidebar');
    if (container) {
      container.appendChild(dropdown);
    } else {
      document.body.appendChild(dropdown);
    }

    console.log('✅ Friends dropdown added');
  }

  selectSpace(spaceId) {
    console.log('🎯 Selecting space:', spaceId);

    const marker = this.markers.get(spaceId);
    if (!marker) return;

    // ✅ Entferne alte active-Klasse
    document.querySelectorAll('.space-item.active').forEach(item => {
      item.classList.remove('active');
    });

    // ✅ Setze neue active-Klasse
    const item = document.querySelector(`.space-item[data-space-id="${spaceId}"]`);
    if (item) {
      item.classList.add('active');
    }

    // ✅ Highlight in Minimap
    this.highlightMinimapMarker(spaceId);

    // ✅ Schließe alle anderen Popups
    this.markers.forEach((m, id) => {
      if (id !== spaceId && m.isPopupOpen()) {
        m.closePopup();
      }
    });

    // ✅ Öffne Popup SOFORT
    marker.openPopup();
    this.stickyMarker = marker;

    // ✅ FOKUSSIERE NUR auf diesen Marker (Zoom 14)
    const markerLatLng = marker.getLatLng();
    this.map.setView(markerLatLng, 14, {
      animate: true,
      duration: 0.8
    });
  }

  openTargetPopup() {
    const targetMarker = this.markers.get(this.targetId);
    if (!targetMarker) {
      console.warn('⚠️ Target marker not found');
      return;
    }

    console.log('🎯 Opening target popup (sticky)');

    targetMarker.openPopup();
    this.stickyMarker = targetMarker;

    const item = document.querySelector(`.space-item[data-space-id="${this.targetId}"]`);
    if (item) {
      item.classList.add('active');
    }

    // ✅ Highlight Target in Minimap
    this.highlightMinimapMarker(this.targetId);

    this.map.panTo(targetMarker.getLatLng(), {
      animate: true,
      duration: 0.5
    });
  }

  handlePopupOpen(marker, space, isTarget) {
    document.querySelectorAll('.space-item.active').forEach(item => {
      item.classList.remove('active');
    });

    const item = document.querySelector(`.space-item[data-space-id="${space.ID}"]`);
    if (item) {
      item.classList.add('active');
    }
  }

  jumpToTarget(event) {
    event.preventDefault();
    console.log('⬅️ Jumping back to target');
    this.selectSpace(this.targetId);
  }

  zfill(value, country) {
    if (!value) return '';
    const str = value.toString();
    if (country === 'Germany' && str.length < 5) return str.padStart(5, '0');
    if (country === 'Austria' && str.length < 4) return str.padStart(4, '0');
    return str;
  }

  getCountryCode(country) {
    const countryMap = {
      'Germany': 'de', 'Austria': 'at', 'Switzerland': 'ch',
      'Netherlands': 'nl', 'Belgium': 'be', 'Luxembourg': 'lu',
      'Denmark': 'dk', 'Italy': 'it', 'Ukraine': 'ua'
    };
    return countryMap[country] || 'un';
  }

  showError(message) {
    const loading = document.getElementById('loading');
    if (loading) loading.style.display = 'none';

    const errorDiv = document.createElement('div');
    errorDiv.className = 'error';
    errorDiv.innerHTML = `
      <div class="error-title">⚠️ Error</div>
      <div class="error-message">${message}</div>
    `;
    document.body.appendChild(errorDiv);
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    window.embedMap = new EmbedMapExtended();
    if (window.embedMap.targetId) {
      window.embedMap.init();
    }
  });
} else {
  window.embedMap = new EmbedMapExtended();
  if (window.embedMap.targetId) {
    window.embedMap.init();
  }
}