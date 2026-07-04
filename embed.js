// embed.js - Präzise Zentrierung mit Sidebar-Offset

import { I18n } from './i18n.js';
import AppConfig, { createLeafletIcon } from './config.js';
import { buildPopupHTML } from './popup-builder.js';
import { getTileMode, loadMaplibreIfNeeded } from './tile-loader.js';
import { isWeeklyToday } from './date-utils.js';

class EmbedMapExtended {
  constructor() {
    const params = new URLSearchParams(window.location.search);
    this.targetId = parseInt(params.get('id'));
    this.friendIds = (params.get('friends') || '')
      .split(',')
      .map(Number)
      .filter(Boolean);
    this.friendsRows = parseInt(params.get('friendsrows')) || 0;
    this.showMinimap = params.has('minimap');

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
      // i18n laden
      window.i18n = new I18n();
      await window.i18n.load();
      await this.loadData();
      await this.createMap();
      this.createMarkers();
      this.showLogo();
      this.createTargetDropdown();
      this.createLanguageSwitcher();
      if (this.showMinimap) this.createMinimap();

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
    const response = await fetch('data/spaces-all.json');
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
        allData.forEach(space => {
          const entry = statusData.spaces[space.spaceapi?.endpoint];
          if (entry && entry.status !== undefined) {
            space.isOpen = entry.status;
            if (entry.message) space.statusMessage = entry.message;
          }
        });
      }
    } catch (error) {
      console.warn('⚠️ SpaceAPI Status Update failed');
    }
  }

  async createMap() {
    const params = new URLSearchParams(window.location.search);
    this.map = L.map('map', {
      zoomControl: false,
      attributionControl: true,
      maxZoom: 18,
      minZoom: 3,
      scrollWheelZoom: !params.has('noscroll'),
      closePopupOnClick: false   // WICHTIG: Klick in die Karte schließt das geöffnete Popup NICHT
    });

    // ✅ Initialer Viewport, damit Leaflet ein Koordinatensystem hat
    this.map.setView([51.1657, 10.4515], 6);

    if (getTileMode() === 'vector') {
      await loadMaplibreIfNeeded();
      try {
        const mapLibreLayer = L.maplibreGL({
          style: 'https://tiles.openfreemap.org/styles/liberty',
          attribution: '&copy; <a href="https://openfreemap.org/">OpenFreeMap</a>'
        });
        mapLibreLayer.addTo(this.map);
      } catch (error) {
        L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
          maxZoom: 19,
          attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        }).addTo(this.map);
      }
    } else {
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
      }).addTo(this.map);
    }
    window.map = this.map;
  }

  createMarkers() {
    this.createMarker(this.targetSpace, true);
    this.friendSpaces.forEach(space => this.createMarker(space, false));
  }

  createMarker(space, isTarget) {
    const color = AppConfig.getDynamicSpaceColor(space);
    const icon = createLeafletIcon(color, isTarget ? 1.2 : 1.0);

    const marker = L.marker([space.loc.lat, space.loc.long], {
      icon, riseOnHover: true, interactive: false
    });
    marker.bindPopup(() => buildPopupHTML(space), { maxWidth: 440, minWidth: 160, autoPan: false, closeButton: false });
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

    // 4. "Last mile" animation: jump near the target, then short-animate the final stretch
    if (animate) {
      const cur = this.map.getCenter();
      const dlat = offsetLatLng.lat - cur.lat;
      const dlng = offsetLatLng.lng - cur.lng;
      const dist = Math.sqrt(dlat * dlat + dlng * dlng);
      const lastMile = Math.min(dist * 0.18, 0.06); // 18% of journey, max 0.06°
      if (dist > lastMile * 2) {
        const r = lastMile / dist;
        this.map.setView(
          [offsetLatLng.lat - dlat * r, offsetLatLng.lng - dlng * r],
          zoom, { animate: false }
        );
      }
    }
    this.map.setView(offsetLatLng, zoom, {
      animate: animate,
      duration: animate ? 0.45 : 0
    });
  }

  createDropdownItem(space, isTarget) {
    let statusIconHtml = '<i class="fas fa-question-circle door-icon-unknown" style="opacity:0"></i>';
    let statusClass = 'space-default';
    if (space.spaceapi?.endpoint) {
      if (space.isOpen === true) { statusIconHtml = '<i class="fas fa-door-open door-icon-open"></i>'; statusClass = 'space-open'; }
      else if (space.isOpen === false) { statusIconHtml = '<i class="fas fa-lock door-icon-closed"></i>'; statusClass = 'space-closed'; }
      else { statusIconHtml = '<i class="fas fa-question-circle door-icon-unknown"></i>'; statusClass = 'space-unknown'; }
    }
    const styleClass2 = AppConfig.getStyleIcon(space.style?.toLowerCase() || '');
    const styleIconHtml = styleClass2 ? `<i class="${styleClass2} style-icon"></i> ` : '';
    const statusColorMap = { 'space-open': 'var(--space-open)', 'space-closed': 'var(--space-closed)', 'space-unknown': 'var(--space-unknown)' };
    const item = document.createElement('div');
    item.className = `space-item listing-item ${statusClass} ${isTarget ? 'target' : ''}`;
    item.style.setProperty('--status-color', statusColorMap[statusClass] || 'var(--space-hover)');
    item.dataset.spaceId = space.ID;
    const addressLines = (isTarget && this.friendIds.length === 0) ? `
      <div class="listing-item-details">${space.loc?.street?.name || ''} ${space.loc?.street?.number || ''}</div>
      <div class="listing-item-details">${AppConfig.zfill(space.loc?.plz, space.loc?.country)} <b>${space.loc?.city || ''}</b></div>
      <div class="listing-item-details"><span class="fi fi-${AppConfig.getCountryCode(space.loc?.country)}"></span> ${space.loc?.country || ''}</div>` : `
      <div class="listing-item-details"><b>${space.loc?.city || ''}</b>, ${space.loc?.country || ''}</div>`;
    // Weekly Meeting Badge
    let meetingHtml = '';
    if (isWeeklyToday(space)) {
      const _t = (k) => window.i18n ? window.i18n.t(k) : '';
      const todayLabel = _t('weekly.today') || 'heute';
      const weeklyTooltip = _t('weekly.tooltip') || 'wöchentliches Treffen';
      const timeStr = String(space.weekly.time).padStart(4, '0').replace(/(\d{2})(\d{2})/, '$1:$2');
      const timeSuffix = _t('weekly.timeSuffix') || '';
      meetingHtml = `<span class="listing-meeting-today" aria-label="◷ ${timeStr}${timeSuffix} — ${weeklyTooltip}" role="tooltip" data-microtip-position="bottom-left"><i class="fas fa-calendar-day"></i> ${todayLabel}</span>`;
    }

    const workshopsCount = space.workshops ? space.workshops.length : 0;
    const workshopColor = AppConfig.getDynamicSpaceColor(space);
    const workshopsHtml = workshopsCount > 0 ? `
      <span class="listing-workshops" style="color: ${workshopColor}; font-weight: bold; margin-left: 8px; font-size: 0.8em; opacity: 1;">
        <i class="fas fa-wrench"></i> ${workshopsCount}
      </span>` : '';

    item.innerHTML = `
      <div class="listing-item-content">
        ${isTarget ? '<div class="our-space-pill">Our Space</div>' : ''}
        <div class="listing-item-name"><span>${styleIconHtml}${space.name}</span></div>
        <div class="listing-item-address">
          <span class="listing-status-icon">${statusIconHtml}</span>
          <div class="listing-item-address-lines">
            ${addressLines}
          </div>
          ${workshopsHtml}${meetingHtml}
        </div>
      </div>`;
    return item;
  }

  showLogo() {
    const container = document.createElement('div');
    container.id = 'embed-sidebar';
    container.style.cssText = `position: absolute; left: 1em; top: 1em; z-index: 400; display: flex; flex-direction: column; align-items: flex-start; gap: 16px; max-height: calc(100vh - 2em); overflow: hidden;`;
    container.innerHTML = `<a href="./" target="_blank"><div class="title">📍maker<span class="frame"><span class="spac">spac</span><span class="smaller">.es</span></span></div></a>`;
    document.body.appendChild(container);
  }

  createTargetDropdown() {
    // Wrapper für Target-Dropdown + Sprach-Switcher nebeneinander
    const row = document.createElement('div');
    row.className = 'embed-target-row';
    document.getElementById('embed-sidebar').appendChild(row);

    const dropdown = document.createElement('div');
    dropdown.className = 'embed-dropdown target-dropdown is-active';
    const item = this.createDropdownItem(this.targetSpace, true);
    item.addEventListener('click', () => this.selectSpace(this.targetId));
    dropdown.appendChild(item);
    row.appendChild(dropdown);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // LANGUAGE SWITCHER
  // ═══════════════════════════════════════════════════════════════════════════

  getLanguageForCountry(country) {
    const map = { 'Germany': 'de', 'Austria': 'de', 'Switzerland': 'de', 'France': 'fr', 'Italy': 'it', 'Netherlands': 'nl', 'Belgium': 'nl', 'Denmark': 'da', 'Ukraine': 'uk' };
    return map[country] || 'en';
  }

  createLanguageSwitcher() {
    this.languages = [
      { code: 'de', flag: 'de' },
      { code: 'en', flag: 'gb' },
      { code: 'fr', flag: 'fr' },
      { code: 'nl', flag: 'nl' },
      { code: 'it', flag: 'it' },
      { code: 'da', flag: 'dk' },
      { code: 'uk', flag: 'ua' }
    ];

    // Startsprache = Land des Makerspaces
    const startLang = this.getLanguageForCountry(this.targetSpace.loc?.country);
    if (window.i18n) window.i18n.setLanguage(startLang);
    this.currentLang = startLang;

    const switcher = document.createElement('div');
    switcher.className = 'embed-lang-switcher';
    this.langSwitcher = switcher;

    const activeBtn = document.createElement('span');
    const activeLang = this.languages.find(l => l.code === startLang) || this.languages[0];
    activeBtn.className = `fi fi-${activeLang.flag} embed-lang-active`;
    activeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      switcher.classList.toggle('expanded');
    });
    switcher.appendChild(activeBtn);

    const options = document.createElement('div');
    options.className = 'embed-lang-options';
    this.languages.forEach(lang => {
      if (lang.code === startLang) return; // aktive Sprache nicht doppelt
      const btn = document.createElement('span');
      btn.className = `fi fi-${lang.flag} embed-lang-btn`;
      btn.dataset.lang = lang.code;
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.switchLanguage(lang.code);
      });
      options.appendChild(btn);
    });
    switcher.appendChild(options);

    // In die Target-Row hängen (rechts neben dem Dropdown)
    document.querySelector('.embed-target-row').appendChild(switcher);

    // Schließen bei Klick außerhalb
    document.addEventListener('click', () => switcher.classList.remove('expanded'));
  }

  switchLanguage(langCode) {
    if (!window.i18n) return;
    window.i18n.setLanguage(langCode);
    this.currentLang = langCode;

    // Aktive Flagge aktualisieren
    const lang = this.languages.find(l => l.code === langCode);
    if (lang) {
      const activeBtn = this.langSwitcher.querySelector('.embed-lang-active');
      activeBtn.className = `fi fi-${lang.flag} embed-lang-active`;
    }

    // Options neu rendern (ohne aktive Sprache)
    const options = this.langSwitcher.querySelector('.embed-lang-options');
    options.innerHTML = '';
    this.languages.forEach(l => {
      if (l.code === langCode) return;
      const btn = document.createElement('span');
      btn.className = `fi fi-${l.flag} embed-lang-btn`;
      btn.dataset.lang = l.code;
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.switchLanguage(l.code);
      });
      options.appendChild(btn);
    });

    // Schließen
    this.langSwitcher.classList.remove('expanded');

    // Popups und Dropdowns neu rendern
    this.refreshAllContent();
  }

  refreshAllContent() {
    // Alle Popups neu bauen
    this.markers.forEach((marker, spaceId) => {
      const space = spaceId === this.targetId ? this.targetSpace : this.friendSpaces.find(s => s.ID === spaceId);
      if (space) {
        const isTarget = spaceId === this.targetId;
        marker.setPopupContent(buildPopupHTML(space));
      }
    });

    // Target-Dropdown neu bauen
    const targetDropdown = document.querySelector('.target-dropdown');
    if (targetDropdown) {
      targetDropdown.innerHTML = '';
      const item = this.createDropdownItem(this.targetSpace, true);
      item.addEventListener('click', () => this.selectSpace(this.targetId));
      targetDropdown.appendChild(item);
    }

    // Friends-Dropdown neu bauen
    const friendsDropdown = document.querySelector('.friends-dropdown');
    if (friendsDropdown) {
      friendsDropdown.innerHTML = '';
      this.friendSpaces.forEach(space => {
        const item = this.createDropdownItem(space, false);
        item.addEventListener('click', () => this.selectSpace(space.ID));
        friendsDropdown.appendChild(item);
      });
    }

    // Aktiven Makerspace im Dropdown markiert lassen
    const activeItem = document.querySelector(`.space-item[data-space-id="${this.targetId}"]`);
    if (activeItem) activeItem.classList.add('active');
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
      let color = space.spaceapi ? (space.isOpen === true ? AppConfig.colours.open : (space.isOpen === false ? AppConfig.colours.closed : AppConfig.colours.unknown)) : AppConfig.colours.hoverLight;
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
    const items = dropdown.querySelectorAll('.listing-item');
    if (!items.length) return;

    if (this.friendsRows > 0) {
      dropdown.style.height = (28 + this.friendsRows * 43) + 'px';
      dropdown.style.flexShrink = '0';
      const targetRow = document.querySelector('.embed-target-row');
      if (targetRow) targetRow.style.flexShrink = '1';
    } else {
      const header = dropdown.querySelector('.dropdown-header');
      const headerHeight = header ? header.getBoundingClientRect().height : 0;
      const itemHeight = items[0].getBoundingClientRect().height;
      if (!itemHeight) return;
      const availableHeight = dropdown.getBoundingClientRect().height;
      const visibleItems = Math.floor((availableHeight - headerHeight) / itemHeight);
      if (visibleItems > 0 && visibleItems < items.length) {
        dropdown.style.maxHeight = (headerHeight + visibleItems * itemHeight) + 'px';
      }
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

    // Wire up the navigation link (popup uses href="#"; we open OSM on click)
    const navLink = marker.getPopup()?.getElement()?.querySelector('.navigation-icon');
    if (navLink && space.loc?.lat != null && space.loc?.long != null) {
      navLink.setAttribute('data-service', 'osm');
      navLink.addEventListener('click', (e) => {
        e.preventDefault();
        window.open(`https://www.openstreetmap.org/directions?to=${space.loc.lat},${space.loc.long}`, '_blank');
      }, { once: true });
    }
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