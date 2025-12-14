// language-switcher.js - FINAL: Flaggen in 2. Zeile, schließt nur bei Map/Search Click

class LanguageSwitcher {
  constructor() {
    // ✅ Lade Sprache SOFORT aus localStorage (synchron!)
    const savedLang = localStorage.getItem('preferred_language');
    this.currentLanguage = savedLang || 'de'; // Fallback zu 'de'

    console.log('🔧 LanguageSwitcher constructor:');
    console.log('   - savedLang from localStorage:', savedLang);
    console.log('   - this.currentLanguage set to:', this.currentLanguage);

    this.container = null;
    this.settingsPopover = null;
    this.documentClickHandler = null;
    this.init();
  }

  init() {
    this.createSettingsButton();
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
    settingsButton.title = this.t('title');
    settingsButton.addEventListener('click', (e) => {
      e.stopPropagation();
      this.toggleSettingsPopover();
    });

    this.container.appendChild(settingsButton);
    document.body.appendChild(this.container);
  }

  toggleSettingsPopover() {
    if (this.settingsPopover) {
      this.closeSettingsPopover();
      return;
    }

    this.settingsPopover = document.createElement('div');
    this.settingsPopover.className = 'settings-popover';

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

    // ✅ Erstelle Flaggen-HTML für ZWEITE ZEILE
    console.log('🎌 Creating flags with currentLanguage:', this.currentLanguage);
    const languageIconsHTML = languages.map(lang => {
      const isActive = lang.code === this.currentLanguage ? 'active' : '';
      console.log(`   - ${lang.code}: ${isActive ? 'ACTIVE' : 'inactive'}`);
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

    // Event-Listener für Flaggen
    languageHeader.querySelectorAll('[data-lang]').forEach(flag => {
      flag.addEventListener('click', (e) => {
        e.stopPropagation();
        const langCode = flag.dataset.lang;
        this.changeLanguage(langCode);

        // ✅ Klassen im Popover aktualisieren
        languageHeader.querySelectorAll('[data-lang]').forEach(f => f.classList.remove('active'));
        flag.classList.add('active');
      });
    });

    // 2. DARK MODE SECTION
    const darkModeHeader = document.createElement('div');
    darkModeHeader.className = 'settings-header';

    const currentMode = localStorage.getItem('color-scheme') || 'auto';

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

    // 3. BOOKMARKS SECTION
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

    this.container.appendChild(this.settingsPopover);

    // ✅ NEUE LOGIK: Schließe NUR bei Klick außerhalb des Settings-Popovers
    setTimeout(() => {
      this.documentClickHandler = (e) => {
        // Prüfe ob der Klick INNERHALB des Settings-Containers war
        if (!this.container.contains(e.target)) {
          // Klick war außerhalb -> Schließe Settings
          this.closeSettingsPopover();
        }
        // Sonst: Klick war innerhalb -> Settings bleibt offen
      };
      document.addEventListener('click', this.documentClickHandler);
    }, 100);
  }

  closeSettingsPopover() {
    if (this.settingsPopover) {
      this.settingsPopover.remove();
      this.settingsPopover = null;
    }

    // Entferne Event-Listener
    if (this.documentClickHandler) {
      document.removeEventListener('click', this.documentClickHandler);
      this.documentClickHandler = null;
    }
  }

  // Bookmark Actions mit separaten Retry-Countern
  handleBookmarkShare(retryCount = 0) {
    const maxRetries = 50; // ✅ 5 Sekunden (50 × 100ms)

    if (!window.bookmarkSync) {
      if (retryCount < maxRetries) {
        if (retryCount === 0) {
          console.log('⏳ bookmarkSync not ready yet, waiting...');
        }
        if (retryCount % 10 === 0 && retryCount > 0) {
          console.log(`⏳ Still waiting for bookmarkSync... (${retryCount * 100}ms elapsed)`);
        }
        setTimeout(() => this.handleBookmarkShare(retryCount + 1), 100);
        return;
      } else {
        console.error('❌ bookmarkSync not available after 5 seconds');
        console.error('Debug info:');
        console.error('  - window.bookmarkManager:', typeof window.bookmarkManager);
        console.error('  - window.bookmarkSync:', typeof window.bookmarkSync);
        console.error('  - window.BookmarkSync:', typeof window.BookmarkSync);
        alert('Bookmark-Synchronisierung ist nicht verfügbar.\n\nBitte öffne die Browser-Console (F12) für Details.');
        return;
      }
    }

    console.log('✅ bookmarkSync ready, opening share dialog');
    window.bookmarkSync.showExportDialog();
  }

  handleBookmarkImport(retryCount = 0) {
    const maxRetries = 50; // ✅ 5 Sekunden (50 × 100ms)

    if (!window.bookmarkSync) {
      if (retryCount < maxRetries) {
        if (retryCount === 0) {
          console.log('⏳ bookmarkSync not ready yet, waiting...');
        }
        if (retryCount % 10 === 0 && retryCount > 0) {
          console.log(`⏳ Still waiting for bookmarkSync... (${retryCount * 100}ms elapsed)`);
        }
        setTimeout(() => this.handleBookmarkImport(retryCount + 1), 100);
        return;
      } else {
        console.error('❌ bookmarkSync not available after 5 seconds');
        console.error('Debug info:');
        console.error('  - window.bookmarkManager:', typeof window.bookmarkManager);
        console.error('  - window.bookmarkSync:', typeof window.bookmarkSync);
        console.error('  - window.BookmarkSync:', typeof window.BookmarkSync);
        alert('Bookmark-Synchronisierung ist nicht verfügbar.\n\nBitte öffne die Browser-Console (F12) für Details.');
        return;
      }
    }

    console.log('✅ bookmarkSync ready, opening import dialog');
    window.bookmarkSync.showImportDialog();
  }

  handleBookmarkDelete() {
    if (window.bookmarkManager && confirm(this.t('confirmDelete'))) {
      window.bookmarkManager.clearAllBookmarks();
      console.log('✅ All bookmarks deleted');
    }
  }

  // Color Scheme
  setColorScheme(mode) {
    localStorage.setItem('color-scheme', mode);

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
      console.log('✅ Settings synced to cloud');
    }

    console.log('✅ Color scheme set to:', mode);
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
      if (isDarkMode) {
        mapContainer.classList.add('dark-mode-map');
      } else {
        mapContainer.classList.remove('dark-mode-map');
      }
    }

    if (window.updateMapTiles && typeof window.updateMapTiles === 'function') {
      window.updateMapTiles();
      console.log('✅ Map tiles updated');
    }

    console.log('🗺️ Map dark mode:', isDarkMode);
  }

  loadColorScheme() {
    const mode = localStorage.getItem('color-scheme') || 'auto';
    this.setColorScheme(mode);
  }

  // Language
  changeLanguage(langCode) {
    this.currentLanguage = langCode;
    window.currentLanguage = langCode;

    localStorage.setItem('preferred_language', langCode);

    if (window.i18n) {
      window.i18n.setLanguage(langCode);
    }

    if (window.bookmarkSync && typeof window.bookmarkSync.syncSettings === 'function') {
      window.bookmarkSync.syncSettings({
        colorScheme: localStorage.getItem('color-scheme') || 'auto',
        language: langCode
      });
      console.log('✅ Language synced to cloud');
    }

    this.refreshUI();

    // ✅ Trigger Event für andere Komponenten
    document.dispatchEvent(new CustomEvent('languageChanged', {
      detail: { language: langCode }
    }));
  }

  refreshUI() {
    const searchBar = document.getElementById('search-bar');
    if (searchBar && window.i18n) {
      searchBar.placeholder = window.i18n.t('searchPlaceholder');
    }

    // ✅ NICHT mehr styleFilterManager - verhindert Map-Reload
    // if (window.styleFilterManager) {
    //   window.styleFilterManager.applyFilters();
    // }

    // ✅ Aktualisiere Settings-Popover Beschriftungen
    this.updateSettingsLabels();
  }

  // ✅ NEUE Methode: Aktualisiere Settings-Beschriftungen
  updateSettingsLabels() {
    if (!this.settingsPopover) return; // Popover nicht offen

    // Aktualisiere alle Text-Elemente in den Settings
    const headers = this.settingsPopover.querySelectorAll('.settings-header-content span');
    if (headers.length >= 3) {
      headers[0].textContent = this.t('language');
      headers[1].textContent = this.t('colorScheme');

      // Bookmark-Count beibehalten
      const bookmarkCount = window.bookmarkManager ? window.bookmarkManager.getCount() : 0;
      headers[2].textContent = `${bookmarkCount} ${this.t('bookmarks')}`;
    }

    // Aktualisiere Tooltips
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
  }

  loadLanguagePreference() {
    // ✅ WICHTIG: Sprache wurde bereits im constructor aus localStorage geladen
    // Diese Methode sollte NICHTS überschreiben wenn localStorage einen Wert hatte!

    const savedLang = localStorage.getItem('preferred_language');

    if (savedLang) {
      // ✅ localStorage hat Vorrang - NIEMALS überschreiben!
      // this.currentLanguage ist bereits korrekt (aus constructor)
      console.log(`✅ Language switcher using saved language: ${this.currentLanguage}`);
    } else {
      // ✅ KEIN savedLang - dann von i18n übernehmen (falls verfügbar)
      if (window.i18n && window.i18n.currentLang) {
        this.currentLanguage = window.i18n.currentLang;
        console.log(`✅ Language switcher synced with i18n: ${this.currentLanguage}`);
      } else {
        console.log(`✅ Language switcher using default: ${this.currentLanguage}`);
      }
    }
  }
}

// Initialize
window.languageSwitcher = new LanguageSwitcher();

// Debug
console.log('🔧 LanguageSwitcher initialized');
console.log('   - bookmarkSync:', !!window.bookmarkSync);
console.log('   - bookmarkManager:', !!window.bookmarkManager);
console.log('   - i18n:', !!window.i18n);
console.log('   - updateMapTiles:', !!window.updateMapTiles);