// data-store.js - Settings: Sprache, Farbschema, Clustering, Bookmarks, Consent

class DataStore {
  constructor() {
    // ✅ Lade Sprache SOFORT aus localStorage (synchron!)
    const savedLang = window.consent.get('preferred_language');
    this.currentLanguage = savedLang || 'de'; // Fallback zu 'de'

    console.log('🔧 DataStore constructor:');
    console.log('   - savedLang from localStorage:', savedLang);
    console.log('   - this.currentLanguage set to:', this.currentLanguage);

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
      clustering: 'Orte gruppieren',
      clusteringOn: 'aktivieren',
      clusteringOff: 'deaktivieren',
      light: 'Hell',
      auto: 'Automatisch',
      dark: 'Dunkel',
      bookmarks: 'Favoriten',
      share: 'Teilen',
      import: 'Importieren',
      deleteAll: 'Alle löschen',
      confirmDelete: 'Alle Favoriten löschen?'
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

    const languageIconsHTML = languages.map(lang => {
      const isActive = lang.code === this.currentLanguage ? 'active' : '';
      return `<span class="fi fi-${lang.flag} settings-icon-btn settings-flag-btn ${isActive}" data-lang="${lang.code}" title="${lang.name}"></span>`;
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
    const currentMode = window.consent.get('color-scheme') || 'auto';

    darkModeHeader.innerHTML = `
      <div class="settings-header-content">
        <i class="fas fa-circle-half-stroke"></i>
        <span>${this.t('colorScheme')}</span>
      </div>
      <div class="settings-header-icons">
        <i class="fas fa-adjust settings-icon-btn ${currentMode === 'auto' ? 'active' : ''}" data-mode="auto" title="${this.t('auto')}"></i>
        <i class="far fa-circle settings-icon-btn ${currentMode === 'light' ? 'active' : ''}" data-mode="light" title="${this.t('light')}"></i>
        <i class="fas fa-circle settings-icon-btn ${currentMode === 'dark' ? 'active' : ''}" data-mode="dark" title="${this.t('dark')}"></i>
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

    clusteringHeader.innerHTML = `
      <div class="settings-header-content">
        <i class="fas fa-circle-nodes"></i>
        <span>${this.t('clustering')}</span>
      </div>
      <div class="settings-header-icons">
        <i class="fas fa-toggle-on settings-icon-btn" id="clustering-toggle-btn"></i>
      </div>
    `;

    const toggleBtn = clusteringHeader.querySelector('#clustering-toggle-btn');
    toggleBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (window.mapUtils && typeof window.mapUtils.isClusteringEnabled === 'function') {
        const isCurrentlyEnabled = window.mapUtils.isClusteringEnabled();
        window.mapUtils.toggleClustering(!isCurrentlyEnabled);
        this.updateClusteringToggleUI();
      }
    });

    this.settingsPopover.appendChild(clusteringHeader);

    // 4. BOOKMARKS SECTION
    const bookmarkCount = window.bookmarkManager ? window.bookmarkManager.getCount() : 0;
    const bookmarksHeader = document.createElement('div');
    bookmarksHeader.className = 'settings-header';
    bookmarksHeader.innerHTML = `
      <div class="settings-header-content">
        <i class="fas fa-bookmark"></i>
        <span>${bookmarkCount} ${this.t('bookmarks')}</span>
      </div>
      <div class="settings-header-icons">
        <i class="fas fa-download settings-icon-btn" data-action="share" title="${this.t('share')}"></i>
        <i class="fas fa-upload settings-icon-btn" data-action="import" title="${this.t('import')}"></i>
        <i class="fas fa-trash settings-icon-btn settings-icon-danger" data-action="delete" title="${this.t('deleteAll')}"></i>
      </div>
    `;

    bookmarksHeader.querySelector('[data-action="share"]').addEventListener('click', (e) => {
      e.stopPropagation();
      this.handleBookmarkShare();
    });
    bookmarksHeader.querySelector('[data-action="import"]').addEventListener('click', (e) => {
      e.stopPropagation();
      this.handleBookmarkImport();
    });
    bookmarksHeader.querySelector('[data-action="delete"]').addEventListener('click', (e) => {
      e.stopPropagation();
      this.handleBookmarkDelete();
    });

    this.settingsPopover.appendChild(bookmarksHeader);

    // 5. STORAGE/CONSENT SECTION
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
      // Settings schließen und Consent-Dialog direkt anzeigen
      this.toggleSettingsPopover();
      if (window.consent) {
        window.consent.resetAndAsk();
      }
    });

    this.settingsPopover.appendChild(storageHeader);
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
          if (!this.container.contains(e.target)) {
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
  handleBookmarkShare(retryCount = 0) {
    const maxRetries = 50;
    if (!window.bookmarkSync) {
      if (retryCount < maxRetries) {
        setTimeout(() => this.handleBookmarkShare(retryCount + 1), 100);
        return;
      }
      return;
    }
    window.bookmarkSync.showExportDialog();
  }

  handleBookmarkImport(retryCount = 0) {
    const maxRetries = 50;
    if (!window.bookmarkSync) {
      if (retryCount < maxRetries) {
        setTimeout(() => this.handleBookmarkImport(retryCount + 1), 100);
        return;
      }
      return;
    }
    window.bookmarkSync.showImportDialog();
  }

  handleBookmarkDelete() {
    if (window.bookmarkManager && confirm(this.t('confirmDelete'))) {
      window.bookmarkManager.clearAllBookmarks();
    }
  }

  // Color Scheme
  setColorScheme(mode) {
    window.consent.set('color-scheme', mode);
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
    const mode = window.consent.get('color-scheme') || 'auto';
    this.setColorScheme(mode);
  }

  // Language
  changeLanguage(langCode) {
    this.currentLanguage = langCode;
    window.currentLanguage = langCode;
    window.consent.set('preferred_language', langCode);

    if (window.i18n) {
      window.i18n.setLanguage(langCode);
    }

    if (window.bookmarkSync && typeof window.bookmarkSync.syncSettings === 'function') {
      window.bookmarkSync.syncSettings({
        colorScheme: window.consent.get('color-scheme') || 'auto',
        language: langCode
      });
    }

    this.refreshUI();
    document.dispatchEvent(new CustomEvent('languageChanged', {
      detail: { language: langCode }
    }));
  }

  refreshUI() {
    const searchBar = document.getElementById('search-bar');
    if (searchBar && window.i18n) {
      searchBar.placeholder = window.i18n.t('searchPlaceholder');
    }
    if (this.settingsPopover && !this.settingsPopover.classList.contains('is-hidden')) {
      this.updateSettingsLabels();
      this.updateClusteringToggleUI();
    }
  }

  updateSettingsLabels() {
    if (!this.settingsPopover) return;

    const headers = this.settingsPopover.querySelectorAll('.settings-header-content span');
    if (headers.length >= 4) {
      headers[0].textContent = this.t('language');
      headers[1].textContent = this.t('colorScheme');
      headers[2].textContent = this.t('clustering');
      const bookmarkCount = window.bookmarkManager ? window.bookmarkManager.getCount() : 0;
      headers[3].textContent = `${bookmarkCount} ${this.t('bookmarks')}`;
    }
    if (headers.length >= 5) {
      headers[4].textContent = `${this.t('storage')}: ${this._getConsentStateText()}`;
    }
    this.updateStorageSection();

    const allFlags = this.settingsPopover.querySelectorAll('[data-lang]');
    allFlags.forEach(flag => {
      flag.classList.toggle('active', flag.dataset.lang === this.currentLanguage);
    });

    const lightBtn = this.settingsPopover.querySelector('[data-mode="light"]');
    const autoBtn = this.settingsPopover.querySelector('[data-mode="auto"]');
    const darkBtn = this.settingsPopover.querySelector('[data-mode="dark"]');
    const shareBtn = this.settingsPopover.querySelector('[data-action="share"]');
    const importBtn = this.settingsPopover.querySelector('[data-action="import"]');
    const deleteBtn = this.settingsPopover.querySelector('[data-action="delete"]');

    if (lightBtn) lightBtn.title = this.t('light');
    if (autoBtn) autoBtn.title = this.t('auto');
    if (darkBtn) darkBtn.title = this.t('dark');
    if (shareBtn) shareBtn.title = this.t('share');
    if (importBtn) importBtn.title = this.t('import');
    if (deleteBtn) deleteBtn.title = this.t('deleteAll');

    // Clustering Title Update
    const toggleBtn = this.settingsPopover.querySelector('#clustering-toggle-btn');
    if (toggleBtn && window.mapUtils) {
      const isClusteringActive = window.mapUtils.isClusteringEnabled();
      toggleBtn.title = isClusteringActive ? this.t('clusteringOff') : this.t('clusteringOn');
    }
  }

  /**
   * Aktualisiert den visuellen Zustand des Clustering-Schalters (Icon & active-Klasse)
   */
  updateClusteringToggleUI() {
    if (!this.settingsPopover) return;

    const toggleBtn = this.settingsPopover.querySelector('#clustering-toggle-btn');
    if (!toggleBtn) return;

    // Liest den Zustand direkt aus mapUtils
    const isClusteringActive = window.mapUtils && window.mapUtils.isClusteringEnabled();

    if (typeof isClusteringActive !== 'boolean') return;

    if (isClusteringActive) {
      toggleBtn.classList.add('active'); // Hintergrund an
      toggleBtn.classList.replace('fa-toggle-off', 'fa-toggle-on');
      toggleBtn.title = this.t('clusteringOff'); // Tooltip sagt was beim Klick passiert
    } else {
      toggleBtn.classList.remove('active'); // Hintergrund aus (passiv)
      toggleBtn.classList.replace('fa-toggle-on', 'fa-toggle-off');
      toggleBtn.title = this.t('clusteringOn');
    }
  }

  _getConsentStateText() {
    const state = window.consent?._state || 'unknown';
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
    const savedLang = window.consent.get('preferred_language');
    if (!savedLang && window.i18n && window.i18n.currentLang) {
      this.currentLanguage = window.i18n.currentLang;
    }
  }
}

// Initialize
window.dataStore = new DataStore();
// window.languageSwitcher = window.dataStore; // Rückwärtskompatibilität