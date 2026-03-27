// data-store.js - Settings: Sprache, Farbschema, Clustering, Bookmarks, Consent

import { consent } from './datasync.js';

class DataStore {
  constructor() {
    // ✅ Lade Sprache SOFORT aus localStorage (synchron!)
    const savedLang = consent.get('preferred_language');
    this.currentLanguage = savedLang || 'de'; // Fallback zu 'de'


    this.container = null;
    this.settingsPopover = null;
    this.documentClickHandler = null;
    this.init();
  }

  init() {
    this.createSettingsButton();
    // ✨ NEU: Erstelle das Popover nur einmal
    this.createSettingsPopover();
    this.loadLanguagePreference();
    this.loadColorScheme();
  }

  // ✅ Hole Übersetzungen aus i18n (lang.json)
  t(key) {
    if (window.i18n && window.i18n.t) {
      const translation = window.i18n.t(`settings.${key}`);
      if (translation === `settings.${key}`) {
        return this.getFallbackTranslation(key);
      }
      return translation;
    }
    return this.getFallbackTranslation(key);
  }

  getFallbackTranslation(key) {
    const fallbacks = {
      title: 'Einstellungen',
      language: 'Sprache',
      colorScheme: 'Farbschema',
      clustering: 'Orte clustern',
      clusteringOn: 'aktivieren',
      clusteringOff: 'deaktivieren',
      mapService: 'Navigation mit',
      light: 'Hell',
      auto: 'Automatisch',
      dark: 'Dunkel',
      bookmarks: 'Favoriten',
      share: 'Teilen',
      import: 'Importieren',
      deleteAll: 'Alle löschen',
      confirmDelete: 'Alle Favoriten löschen?',
      aboutLink: 'Über Makerspaces ›'
    };
    return fallbacks[key] || key;
  }


  createSettingsButton() {
    this.container = document.createElement('div');
    this.container.className = 'language-switcher';

    const settingsButton = document.createElement('button');
    settingsButton.className = 'settings-gear-button-solo';
    settingsButton.innerHTML = '<i class="fas fa-gear"></i>';
    settingsButton.setAttribute('aria-label', this.t('title'));
    settingsButton.setAttribute('role', 'tooltip');
    settingsButton.setAttribute('data-microtip-position', 'left');
    settingsButton.addEventListener('click', (e) => {
      e.stopPropagation();
      this.toggleSettingsPopover();
    });
    settingsButton.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      e.stopPropagation();
      window.zoomManager?.toggleZoomIndicator();
    });

    // Rezoom button — links vom Gear, nur Desktop, Sichtbarkeit via map.js
    if (!('ontouchstart' in window)) {
      const rezoomButton = document.createElement('button');
      rezoomButton.id = 'desktop-rezoom-btn';
      rezoomButton.className = 'settings-gear-button-solo desktop-rezoom-btn';
      rezoomButton.innerHTML = '<i class="fas fa-compress"></i>';
      rezoomButton.setAttribute('aria-label', 'Auf gefilterte Ergebnisse zoomen');
      this.container.appendChild(rezoomButton);
    }

    this.container.appendChild(settingsButton);
    document.body.appendChild(this.container);
  }

  /**
   * Erstellt das Popover nur einmal beim Initialisieren der Seite.
   */
  createSettingsPopover() {
    if (this.settingsPopover) return;

    this.settingsPopover = document.createElement('div');
    this.settingsPopover.className = 'settings-popover is-hidden'; // Standardmäßig unsichtbar

    // 0. TITEL-ZEILE mit Close-Button
    const titleHeader = document.createElement('div');
    titleHeader.className = 'settings-header settings-title-header';
    titleHeader.innerHTML = `
      <div class="settings-header-content">
        <i class="fas fa-gear"></i>
        <span>${this.t('title')}</span>
      </div>
      <button class="settings-close-btn"><i class="fas fa-xmark"></i></button>
    `;
    titleHeader.querySelector('.settings-close-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      this.closeSettingsPopover();
    });
    this.settingsPopover.appendChild(titleHeader);

    // 1. SPRACHE SECTION - ZWEIZEILIG
    const languageHeader = document.createElement('div');
    languageHeader.className = 'settings-header settings-header-languages';

    const languages = [
      { code: 'de', flag: 'de', name: 'Deutsch' },
      { code: 'en', flag: 'gb', name: 'English' },
      { code: 'fr', flag: 'fr', name: 'Français' },
      { code: 'nl', flag: 'nl', name: 'Nederlands' },
      { code: 'it', flag: 'it', name: 'Italiano' },
      { code: 'da', flag: 'dk', name: 'Dansk' },
      { code: 'uk', flag: 'ua', name: 'Українська' }
    ];

    const languageIconsHTML = languages.map((lang, i) => {
      const isActive = lang.code === this.currentLanguage ? 'active' : '';
      const pos = i >= languages.length - 2 ? 'bottom-left' : 'bottom';
      return `<span class="fi fi-${lang.flag} settings-icon-btn settings-flag-btn ${isActive}" data-lang="${lang.code}" aria-label="${lang.name}" role="tooltip" data-microtip-position="${pos}"></span>`;
    }).join('');

    languageHeader.innerHTML = `
      <div class="settings-header-row">
        <div class="settings-header-content">
          <i class="fas fa-language"></i>
          <span>${this.t('language')}</span>
        </div>
      </div>
      <div class="settings-header-row">
        <div class="settings-header-icons settings-language-icons">
          ${languageIconsHTML}
        </div>
      </div>
    `;

    this.settingsPopover.appendChild(languageHeader);

    languageHeader.querySelectorAll('[data-lang]').forEach(flag => {
      flag.addEventListener('click', (e) => {
        e.stopPropagation();
        const langCode = flag.dataset.lang;
        this.changeLanguage(langCode);
      });
    });

    // 2. DARK MODE SECTION
    const darkModeHeader = document.createElement('div');
    darkModeHeader.className = 'settings-header';
    const currentMode = consent.get('color-scheme') || 'auto';

    darkModeHeader.innerHTML = `
      <div class="settings-header-content">
        <i class="fas fa-circle-half-stroke"></i>
        <span>${this.t('colorScheme')}</span>
      </div>
      <div class="settings-header-icons">
        <span class="settings-icon-btn ${currentMode === 'auto' ? 'active' : ''}" data-mode="auto" aria-label="${this.t('auto')}" role="tooltip" data-microtip-position="bottom"><i class="fas fa-adjust"></i></span>
        <span class="settings-icon-btn ${currentMode === 'light' ? 'active' : ''}" data-mode="light" aria-label="${this.t('light')}" role="tooltip" data-microtip-position="bottom-left"><i class="far fa-circle"></i></span>
        <span class="settings-icon-btn ${currentMode === 'dark' ? 'active' : ''}" data-mode="dark" aria-label="${this.t('dark')}" role="tooltip" data-microtip-position="bottom-left"><i class="fas fa-circle"></i></span>
      </div>
    `;

    darkModeHeader.querySelectorAll('[data-mode]').forEach(icon => {
      icon.addEventListener('click', (e) => {
        e.stopPropagation();
        const mode = icon.dataset.mode;
        this.setColorScheme(mode);
        darkModeHeader.querySelectorAll('[data-mode]').forEach(i => i.classList.remove('active'));
        icon.classList.add('active');
      });
    });

    this.settingsPopover.appendChild(darkModeHeader);

    // 3. CLUSTERING SECTION - JETZT ALS EINZELNER TOGGLE
    const clusteringHeader = document.createElement('div');
    clusteringHeader.className = 'settings-header';

    const isClusteringActive = window.mapUtils ? window.mapUtils.isClusteringEnabled() : true;
    clusteringHeader.innerHTML = `
      <div class="settings-header-content">
        <i class="fas fa-circle-nodes"></i>
        <span>${this.t('clustering')}</span>
      </div>
      <div class="settings-header-icons">
        <span class="settings-icon-btn ${isClusteringActive ? 'active' : ''}" id="clustering-btn-cluster" aria-label="${this.t('clusteringOn')}" role="tooltip" data-microtip-position="bottom"><i class="fas fa-circle-nodes"></i></span>
        <span class="settings-icon-btn ${!isClusteringActive ? 'active' : ''}" id="clustering-btn-pin" aria-label="${this.t('clusteringOff')}" role="tooltip" data-microtip-position="bottom-left"><i class="fas fa-location-dot"></i></span>
      </div>
    `;

    clusteringHeader.querySelector('#clustering-btn-cluster').addEventListener('click', (e) => {
      e.stopPropagation();
      window.mapUtils?.toggleClustering(true);
      this.updateClusteringToggleUI();
    });
    clusteringHeader.querySelector('#clustering-btn-pin').addEventListener('click', (e) => {
      e.stopPropagation();
      window.mapUtils?.toggleClustering(false);
      this.updateClusteringToggleUI();
    });

    this.settingsPopover.appendChild(clusteringHeader);

    // 4. NAVIGATION SERVICE SECTION
    const navServiceHeader = document.createElement('div');
    navServiceHeader.className = 'settings-header';
    const currentNavService = consent.get('mapService') || 'osm';

    navServiceHeader.innerHTML = `
      <div class="settings-header-content">
        <i class="fas fa-route"></i>
        <span>${this.t('mapService')}</span>
      </div>
      <div class="settings-header-icons">
        <span class="settings-icon-btn ${currentNavService === 'osm' ? 'active' : ''}" data-nav="osm" aria-label="OpenStreetMap" role="tooltip" data-microtip-position="bottom"><i class="fas fa-map"></i></span>
        <span class="settings-icon-btn ${currentNavService === 'google' ? 'active' : ''}" data-nav="google" aria-label="Google Maps" role="tooltip" data-microtip-position="bottom"><i class="fab fa-google"></i></span>
        <span class="settings-icon-btn ${currentNavService === 'apple' ? 'active' : ''}" data-nav="apple" aria-label="Apple Maps" role="tooltip" data-microtip-position="bottom"><i class="fab fa-apple"></i></span>
      </div>
    `;

    navServiceHeader.querySelectorAll('[data-nav]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const service = btn.dataset.nav;
        consent.set('mapService', service);
        consent.remove('mapServiceTimestamp');
        navServiceHeader.querySelectorAll('[data-nav]').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        document.querySelectorAll('.navigation-icon').forEach(navLink => {
          navLink.setAttribute('data-service', service);
        });
      });
    });

    this.settingsPopover.appendChild(navServiceHeader);

    // 5. SAVED SETTINGS SECTION
    const settingsSection = document.createElement('div');
    settingsSection.className = 'settings-header';
    settingsSection.innerHTML = `
      <div class="settings-header-content">
        <i class="fas fa-floppy-disk"></i>
        <span>${this.t('savedSettings')}</span>
      </div>
      <div class="settings-header-icons">
        <span class="settings-icon-btn" data-action="qr-settings" aria-label="${this.t('qrSettings')}" role="tooltip" data-microtip-position="bottom-left"><i class="fas fa-qrcode"></i></span>
        <span class="settings-icon-btn settings-icon-danger" data-action="delete-all" aria-label="${this.t('deleteAll')}" role="tooltip" data-microtip-position="bottom-left"><i class="fas fa-trash"></i></span>
      </div>
    `;

    settingsSection.querySelector('[data-action="qr-settings"]').addEventListener('click', (e) => {
      e.stopPropagation();
      this.showSettingsQRCode();
    });
    settingsSection.querySelector('[data-action="delete-all"]').addEventListener('click', (e) => {
      e.stopPropagation();
      this.showDeleteConfirmation(e.target.closest('.settings-icon-btn'));
    });

    this.settingsPopover.appendChild(settingsSection);

    // ===================================================================
    // === STORAGE/CONSENT SECTION — DEAKTIVIERT ========================
    // ===================================================================
    /*
    const storageHeader = document.createElement('div');
    storageHeader.className = 'settings-header';
    storageHeader.id = 'settings-storage-section';

    const stateText = this._getConsentStateText();
    storageHeader.innerHTML = `
      <div class="settings-header-content">
        <i class="fas fa-database"></i>
        <span>${this.t('storage')}: ${stateText}</span>
      </div>
      <div class="settings-header-icons">
        <i class="fas fa-rotate settings-icon-btn" data-action="reset-consent" title="${this.t('resetConsent')}"></i>
      </div>
    `;

    storageHeader.querySelector('[data-action="reset-consent"]').addEventListener('click', (e) => {
      e.stopPropagation();
      this.toggleSettingsPopover();
      if (window.consent) {
        window.consent.resetAndAsk();
      }
    });

    this.settingsPopover.appendChild(storageHeader);
    */
    // ===================================================================
    // === STORAGE/CONSENT SECTION — ENDE ===============================
    // ===================================================================
    // Footer: Link zur About-Seite
    const aboutLink = document.createElement('a');
    aboutLink.href = '/about.html';
    aboutLink.className = 'settings-about-link';
    aboutLink.textContent = this.t('aboutLink');
    this.settingsPopover.appendChild(aboutLink);

    this.container.appendChild(this.settingsPopover);

    // Führe die Übersetzung und Zustands-Aktualisierung beim Erstellen aus
    this.updateSettingsLabels();
    this.updateClusteringToggleUI();
  }

  toggleSettingsPopover() {
    if (!this.settingsPopover) {
      this.createSettingsPopover();
    }

    const isVisible = !this.settingsPopover.classList.contains('is-hidden');

    if (isVisible) {
      this.closeSettingsPopover();
    } else {
      // Öffnen
      this.settingsPopover.classList.remove('is-hidden');
      // Zahnrad verstecken
      const gearBtn = this.container.querySelector('.settings-gear-button-solo:not(.desktop-rezoom-btn)');
      if (gearBtn) gearBtn.style.visibility = 'hidden';
      this.updateSettingsLabels();
      this.updateClusteringToggleUI();

      // ESC-Handler hinzufügen
      this.escHandler = (e) => {
        if (e.key === 'Escape') {
          // Falls ein Bookmark-Sync-Dialog offen ist, diesen schließen
          if (document.querySelector('.sync-dialog-overlay')) {
            if (window.bookmarkSync) window.bookmarkSync.closeDialog();
          } else {
            this.closeSettingsPopover();
          }
        }
      };
      document.addEventListener('keydown', this.escHandler);

      // Click Outside
      setTimeout(() => {
        this.documentClickHandler = (e) => {
          if (!this.container.contains(e.target) && !e.target.closest('.sync-dialog-overlay')) {
            this.closeSettingsPopover();
          }
        };
        document.addEventListener('click', this.documentClickHandler);
      }, 100);
    }
  }


  closeSettingsPopover() {
    if (this.settingsPopover) {
      this.settingsPopover.classList.add('is-hidden');
    }
    // Zahnrad wieder einblenden
    const gearBtn = this.container?.querySelector('.settings-gear-button-solo:not(.desktop-rezoom-btn)');
    if (gearBtn) gearBtn.style.visibility = '';
    // Listener entfernen
    if (this.documentClickHandler) {
      document.removeEventListener('click', this.documentClickHandler);
      this.documentClickHandler = null;
    }
    if (this.escHandler) {
      document.removeEventListener('keydown', this.escHandler);
      this.escHandler = null;
    }
  }


  // Bookmark Actions
  showSettingsQRCode() {
    if (typeof QRCode === 'undefined') return;

    const url = window.location.href;
    const currentLang = window.currentLanguage || 'de';
    const t = window.translations || {};

    const dialog = document.createElement('div');
    dialog.className = 'sync-dialog-overlay';
    dialog.innerHTML = `
      <div class="sync-dialog">
        <h2>${t.settings?.qrTitle?.[currentLang] || 'Übergib Einstellungen und Lesezeichen an ein anderes Gerät'}</h2>
        <div class="sync-section">
          <div class="sync-qr-container" id="qr-settings-code"></div>
        </div>
        <div class="sync-actions">
          <button class="sync-btn sync-btn-primary" id="qr-settings-copy">
            <i class="fas fa-copy"></i> URL kopieren
          </button>
          <button class="sync-btn sync-btn-secondary" id="qr-settings-close">
            ${t.sync?.close?.[currentLang] || 'Schließen'}
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(dialog);

    new QRCode(document.getElementById('qr-settings-code'), {
      text: url,
      width: 200,
      height: 200,
      colorDark: '#000000',
      colorLight: '#ffffff',
      correctLevel: QRCode.CorrectLevel.M
    });

    dialog.querySelector('#qr-settings-close').addEventListener('click', () => dialog.remove());
    dialog.addEventListener('click', (e) => {
      if (e.target === dialog) dialog.remove();
    });

    dialog.querySelector('#qr-settings-copy').addEventListener('click', () => {
      navigator.clipboard.writeText(url).then(() => {
        const rect = dialog.querySelector('.sync-dialog').getBoundingClientRect();
        let toast = document.querySelector('.settings-hash-toast');
        if (!toast) {
          toast = document.createElement('div');
          toast.className = 'settings-hash-toast';
          document.body.appendChild(toast);
        } else {
          toast.classList.remove('show', 'zoom-out');
          clearTimeout(toast._hideTimer);
        }
        toast.style.top = (rect.top - 10) + 'px';
        toast.style.left = (rect.left + rect.width / 2) + 'px';
        toast.style.transform = 'translate(-50%, -100%)';
        toast.innerHTML = '✓ URL kopiert';
        requestAnimationFrame(() => toast.classList.add('show'));
        toast._hideTimer = setTimeout(() => {
          toast.classList.remove('show');
          toast.classList.add('zoom-out');
          setTimeout(() => { toast.style.transform = ''; toast.remove(); }, 300);
        }, 2500);
      });
    });
  }

  showDeleteConfirmation(anchorEl) {
    // Vorherige Bestätigung entfernen
    document.querySelector('.settings-confirm-tooltip')?.remove();

    const tooltip = document.createElement('div');
    tooltip.className = 'settings-confirm-tooltip';
    tooltip.innerHTML = `
      <span>${this.t('confirmDeleteSettings')}</span>
      <button class="settings-confirm-yes">${this.t('confirmYes')}</button>
    `;

    document.body.appendChild(tooltip);

    // Position über dem Icon (wie Microtip)
    const rect = anchorEl.getBoundingClientRect();
    tooltip.style.left = (rect.left + rect.width / 2) + 'px';
    tooltip.style.top = (rect.top - 8) + 'px';

    requestAnimationFrame(() => tooltip.classList.add('show'));

    tooltip.querySelector('.settings-confirm-yes').addEventListener('click', (e) => {
      e.stopPropagation();
      // Bookmarks löschen
      if (window.bookmarkManager) {
        window.bookmarkManager.clearAllBookmarks();
      }
      // localStorage-Settings zurücksetzen
      localStorage.removeItem('color-scheme');
      localStorage.removeItem('preferred_language');
      // Hash entfernen
      history.replaceState(null, '', window.location.pathname);
      // UI auf Defaults zurücksetzen
      this.setColorScheme('auto');
      this.changeLanguage('de');
      tooltip.remove();
    });

    // Wegklicken = schließen
    const dismiss = (e) => {
      if (!tooltip.contains(e.target) && e.target !== anchorEl) {
        tooltip.remove();
        document.removeEventListener('click', dismiss, true);
      }
    };
    setTimeout(() => document.addEventListener('click', dismiss, true), 0);
  }

  // Color Scheme
  setColorScheme(mode) {
    consent.set('color-scheme', mode);
    if (mode === 'auto') {
      document.documentElement.removeAttribute('data-color-scheme');
    } else {
      document.documentElement.setAttribute('data-color-scheme', mode);
    }
    this.updateMapColorScheme(mode);

    if (window.bookmarkSync && typeof window.bookmarkSync.syncSettings === 'function') {
      window.bookmarkSync.syncSettings({
        colorScheme: mode,
        language: this.currentLanguage
      });
    }

    this.updateSettingsHash();
  }

  updateMapColorScheme(mode) {
    let isDarkMode = false;
    if (mode === 'dark') {
      isDarkMode = true;
    } else if (mode === 'auto') {
      isDarkMode = window.matchMedia('(prefers-color-scheme: dark)').matches;
    }
    const mapContainer = document.getElementById('map');
    if (mapContainer) {
      if (isDarkMode) mapContainer.classList.add('dark-mode-map');
      else mapContainer.classList.remove('dark-mode-map');
    }
    if (window.updateMapTiles && typeof window.updateMapTiles === 'function') {
      window.updateMapTiles();
    }
  }

  loadColorScheme() {
    const mode = consent.get('color-scheme') || 'auto';
    this.setColorScheme(mode);
  }

  // Language
  changeLanguage(langCode) {
    this.currentLanguage = langCode;
    window.currentLanguage = langCode;
    consent.set('preferred_language', langCode);

    if (window.i18n) {
      window.i18n.setLanguage(langCode);
    }

    if (window.bookmarkSync && typeof window.bookmarkSync.syncSettings === 'function') {
      window.bookmarkSync.syncSettings({
        colorScheme: consent.get('color-scheme') || 'auto',
        language: langCode
      });
    }

    this.refreshUI();
    document.dispatchEvent(new CustomEvent('languageChanged', {
      detail: { language: langCode }
    }));

    this.updateSettingsHash();
  }

  refreshUI() {
    const searchBar = document.getElementById('search-bar');
    if (searchBar && window.i18n) {
      searchBar.placeholder = window.i18n.t('searchPlaceholder');
    }
    // Always update gear button tooltip regardless of popover state
    const gearBtn = this.container?.querySelector('.settings-gear-button-solo:not(.desktop-rezoom-btn)');
    if (gearBtn) gearBtn.setAttribute('aria-label', this.t('title'));
    if (this.settingsPopover && !this.settingsPopover.classList.contains('is-hidden')) {
      this.updateSettingsLabels();
      this.updateClusteringToggleUI();
    }
  }

  updateSettingsLabels() {
    if (!this.settingsPopover) return;

    const headers = this.settingsPopover.querySelectorAll('.settings-header-content span');
    if (headers.length >= 6) {
      headers[0].textContent = this.t('title');
      headers[1].textContent = this.t('language');
      headers[2].textContent = this.t('colorScheme');
      headers[3].textContent = this.t('clustering');
      headers[4].textContent = this.t('mapService');
      headers[5].textContent = this.t('savedSettings');
    }

    const currentService = consent.get('mapService') || 'osm';
    this.settingsPopover.querySelectorAll('[data-nav]').forEach(b => {
      b.classList.toggle('active', b.dataset.nav === currentService);
    });

    const allFlags = this.settingsPopover.querySelectorAll('[data-lang]');
    allFlags.forEach(flag => {
      flag.classList.toggle('active', flag.dataset.lang === this.currentLanguage);
    });

    const lightBtn = this.settingsPopover.querySelector('[data-mode="light"]');
    const autoBtn = this.settingsPopover.querySelector('[data-mode="auto"]');
    const darkBtn = this.settingsPopover.querySelector('[data-mode="dark"]');
    const qrBtn = this.settingsPopover.querySelector('[data-action="qr-settings"]');
    const deleteBtn = this.settingsPopover.querySelector('[data-action="delete-all"]');

    if (lightBtn) lightBtn.setAttribute('aria-label', this.t('light'));
    if (autoBtn) autoBtn.setAttribute('aria-label', this.t('auto'));
    if (darkBtn) darkBtn.setAttribute('aria-label', this.t('dark'));
    if (qrBtn) qrBtn.setAttribute('aria-label', this.t('qrSettings'));
    if (deleteBtn) deleteBtn.setAttribute('aria-label', this.t('deleteAll'));

    const gearBtn = this.container?.querySelector('.settings-gear-button-solo:not(.desktop-rezoom-btn)');
    if (gearBtn) gearBtn.setAttribute('aria-label', this.t('title'));

    const aboutLinkEl = this.settingsPopover.querySelector('.settings-about-link');
    if (aboutLinkEl) aboutLinkEl.textContent = this.t('aboutLink');

    // Clustering aria-label Update
    const clusterBtn = this.settingsPopover.querySelector('#clustering-btn-cluster');
    const pinBtn = this.settingsPopover.querySelector('#clustering-btn-pin');
    if (clusterBtn) clusterBtn.setAttribute('aria-label', this.t('clusteringOn'));
    if (pinBtn) pinBtn.setAttribute('aria-label', this.t('clusteringOff'));
  }

  /**
   * Aktualisiert den visuellen Zustand des Clustering-Schalters (Icon & active-Klasse)
   */
  updateClusteringToggleUI() {
    if (!this.settingsPopover) return;
    const clusterBtn = this.settingsPopover.querySelector('#clustering-btn-cluster');
    const pinBtn = this.settingsPopover.querySelector('#clustering-btn-pin');
    if (!clusterBtn || !pinBtn) return;
    const isClusteringActive = window.mapUtils?.isClusteringEnabled() ?? true;
    clusterBtn.classList.toggle('active', isClusteringActive);
    pinBtn.classList.toggle('active', !isClusteringActive);
  }

  _getConsentStateText() {
    const state = consent._state || 'unknown';
    if (state === 'accepted') return this.t('storageAllowed');
    if (state === 'declined') return this.t('storageDenied');
    return this.t('storageNotSet');
  }

  updateStorageSection() {
    const section = this.settingsPopover?.querySelector('#settings-storage-section');
    if (!section) return;
    const span = section.querySelector('.settings-header-content span');
    if (span) span.textContent = `${this.t('storage')}: ${this._getConsentStateText()}`;
    const resetBtn = section.querySelector('[data-action="reset-consent"]');
    if (resetBtn) resetBtn.title = this.t('resetConsent');
  }

  loadLanguagePreference() {
    const savedLang = consent.get('preferred_language');
    if (!savedLang && window.i18n && window.i18n.currentLang) {
      this.currentLanguage = window.i18n.currentLang;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SETTINGS HASH — URL-basierte Settings-Persistenz (#s=...)
  // ═══════════════════════════════════════════════════════════════════════════

  encodeSettingsHash() {
    const colorSchemes = ['auto', 'light', 'dark'];
    const cs = colorSchemes.indexOf(consent.get('color-scheme') || 'auto');
    const lang = consent.get('preferred_language') || 'de';

    let hash = `#s=${Math.max(0, cs)}${lang}`;

    const bookmarks = window.bookmarkManager?.getBookmarkedIds?.() || [];
    if (bookmarks.length > 0) {
      hash += '-' + bookmarks.slice().sort((a, b) => a - b).join('.');
    }

    return hash;
  }

  updateSettingsHash() {
    clearTimeout(this._hashDebounce);
    this._hashDebounce = setTimeout(async () => {
      const hash = this.encodeSettingsHash();
      history.replaceState(null, '', hash);

      try {
        await navigator.clipboard.writeText(window.location.href);

        const now = Date.now();
        const isRapid = this._lastHashToastTime && (now - this._lastHashToastTime < 10000);
        this._lastHashToastTime = now;

        if (isRapid) {
          const msg = this.t('linkCopiedNew') || '<b>neuen</b> Settings-Link kopiert';
          this.showSettingsToast(msg);
        } else {
          const msg = this.t('linkCopied') || 'Für Lesezeichen: Settings-Link kopiert';
          this.showSettingsToast(msg);
        }
      } catch (err) {
        // Clipboard nicht verfügbar (z.B. HTTP, iframe)
      }
    }, 300);
  }

  showSettingsToast(msg) {
    let toast = document.querySelector('.settings-hash-toast');
    if (toast) {
      toast.classList.remove('show', 'zoom-out');
      clearTimeout(toast._hideTimer);
    } else {
      toast = document.createElement('div');
      toast.className = 'settings-hash-toast';
      document.body.appendChild(toast);
    }

    toast.innerHTML = msg;
    requestAnimationFrame(() => toast.classList.add('show'));

    toast._hideTimer = setTimeout(() => {
      toast.classList.remove('show');
      toast.classList.add('zoom-out');
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  }
}

export { DataStore };
export const dataStore = new DataStore();