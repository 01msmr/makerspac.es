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
    const currentMode = window.consent.get('color-scheme') || 'auto';

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

    clusteringHeader.innerHTML = `
      <div class="settings-header-content">
        <i class="fas fa-circle-nodes"></i>
        <span>${this.t('clustering')}</span>
      </div>
      <div class="settings-header-icons">
        <span class="settings-icon-btn" id="clustering-toggle-btn" role="tooltip" data-microtip-position="bottom-left"><i class="fas fa-toggle-on"></i></span>
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

    // 4. SAVED SETTINGS SECTION
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
      const gearBtn = this.container.querySelector('.settings-gear-button-solo');
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
    const gearBtn = this.container?.querySelector('.settings-gear-button-solo');
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

    this.updateSettingsHash();
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
    if (headers.length >= 5) {
      headers[0].textContent = this.t('title');
      headers[1].textContent = this.t('language');
      headers[2].textContent = this.t('colorScheme');
      headers[3].textContent = this.t('clustering');
      headers[4].textContent = this.t('savedSettings');
    }

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

    // Clustering aria-label Update
    const toggleBtn = this.settingsPopover.querySelector('#clustering-toggle-btn');
    if (toggleBtn && window.mapUtils) {
      const isClusteringActive = window.mapUtils.isClusteringEnabled();
      toggleBtn.setAttribute('aria-label', isClusteringActive ? this.t('clusteringOff') : this.t('clusteringOn'));
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

    const toggleIcon = toggleBtn.querySelector('i');
    if (isClusteringActive) {
      toggleBtn.classList.add('active'); // Hintergrund an
      if (toggleIcon) toggleIcon.classList.replace('fa-toggle-off', 'fa-toggle-on');
      toggleBtn.setAttribute('aria-label', this.t('clusteringOff')); // Tooltip sagt was beim Klick passiert
    } else {
      toggleBtn.classList.remove('active'); // Hintergrund aus (passiv)
      if (toggleIcon) toggleIcon.classList.replace('fa-toggle-on', 'fa-toggle-off');
      toggleBtn.setAttribute('aria-label', this.t('clusteringOn'));
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

  // ═══════════════════════════════════════════════════════════════════════════
  // SETTINGS HASH — URL-basierte Settings-Persistenz (#s=...)
  // ═══════════════════════════════════════════════════════════════════════════

  encodeSettingsHash() {
    const colorSchemes = ['auto', 'light', 'dark'];
    const cs = colorSchemes.indexOf(window.consent.get('color-scheme') || 'auto');
    const lang = window.consent.get('preferred_language') || 'de';

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

// Initialize
window.dataStore = new DataStore();
// window.languageSwitcher = window.dataStore; // Rückwärtskompatibilität