// language-switcher.js - Enhanced mit Settings

class LanguageSwitcher {
  constructor() {
    this.currentLanguage = 'de';
    this.container = null;
    this.settingsPopover = null;
    this.init();
  }

  init() {
    this.createLanguagePill();
    this.loadLanguagePreference();
  }

  // ✅ HIER: Außerhalb von createLanguagePill()
  getFlagCode(langCode) {
    const flagMap = {
      'en': 'gb',  // English → Great Britain flag
      'da': 'dk',  // Danish → Denmark flag
      'uk': 'ua'   // Ukrainian → Ukraine flag
    };
    return flagMap[langCode] || langCode;
  }

  createLanguagePill() {
    // ✅ Warte bis Flag-Icons geladen sind
    if (!document.querySelector('link[href*="flag-icons"]')) {
      setTimeout(() => this.createLanguagePill(), 100);
      return;
    }

    // Erstelle Container
    this.container = document.createElement('div');
    this.container.className = 'language-switcher';

    // Erstelle Pill
    const pill = document.createElement('div');
    pill.className = 'language-pill';

    // Flag-Button
    const flagButton = document.createElement('button');
    flagButton.className = 'language-flag-button';
    flagButton.innerHTML = `<span class="fi fi-de"></span>`;
    flagButton.title = 'Sprache wechseln';
    flagButton.onclick = (e) => {
      e.stopPropagation();
      this.toggleLanguagePopover();
    };

    // Settings Gear Button
    const gearButton = document.createElement('button');
    gearButton.className = 'settings-gear-button';
    gearButton.innerHTML = '<i class="fas fa-gear"></i>';
    gearButton.title = 'Einstellungen';
    gearButton.onclick = (e) => {
      e.stopPropagation();
      this.toggleSettingsPopover();
    };

    pill.appendChild(flagButton);
    pill.appendChild(gearButton);
    this.container.appendChild(pill);

    // Füge in DOM ein
    document.body.appendChild(this.container);

    // Click außerhalb schließt Popovers
    document.addEventListener('click', (e) => {
      if (!this.container.contains(e.target)) {
        this.closeAllPopovers();
      }
    });
  }


  toggleLanguagePopover() {
    // Schließe Settings-Popover
    this.closeSettingsPopover();

    // Toggle Language-Popover
    const existingPopover = this.container.querySelector('.language-popover');
    if (existingPopover) {
      existingPopover.remove();
      return;
    }

    const popover = document.createElement('div');
    popover.className = 'language-popover';

    const languages = [
      { code: 'de', name: 'Deutsch' },
      { code: 'en', name: 'English' },
      { code: 'fr', name: 'Français' },
      { code: 'it', name: 'Italiano' },
      { code: 'nl', name: 'Nederlands' },
      { code: 'da', name: 'Dansk' },
      { code: 'uk', name: 'Українська' }
    ];

    languages.forEach(lang => {
      const item = document.createElement('div');
      item.className = 'language-popover-item';
      const flagCode = this.getFlagCode(lang.code); // ✅ flagCode definieren!
      item.innerHTML = `
    <span class="language-name">${lang.name}</span>
    <span class="fi fi-${flagCode} language-flag-popover"></span>
  `;

      if (lang.code === this.currentLanguage) {
        item.classList.add('active');
      }

      item.onclick = () => {
        this.changeLanguage(lang.code);
        popover.remove();
      };

      popover.appendChild(item);
    });


    this.container.appendChild(popover);
  }

  toggleSettingsPopover() {
    // Schließe Language-Popover
    this.closeLanguagePopover();

    // Toggle Settings-Popover
    if (this.settingsPopover) {
      this.closeSettingsPopover();
      return;
    }

    this.settingsPopover = document.createElement('div');
    this.settingsPopover.className = 'settings-popover';

    // Bookmark Sync Section (OHNE Header)
    const syncSection = document.createElement('div');
    syncSection.className = 'settings-section';

    // Sync-Optionen
    const bookmarkCount = window.bookmarkManager ? window.bookmarkManager.getCount() : 0;

    const syncOptions = [
      {
        icon: 'fas fa-bookmark',  // ✅ Bookmark-Icon statt Info-Icon
        label: `${bookmarkCount} ${window.i18n ? window.i18n.t('sync.favorites') : 'Favoriten'}`,
        action: null,
        className: 'settings-info'
      },
      {
        icon: 'fas fa-share-alt',
        label: window.i18n ? window.i18n.t('sync.export') : 'Teilen',
        action: () => {
          if (window.bookmarkSync) {
            window.bookmarkSync.showExportDialog();
            this.closeSettingsPopover();
          }
        }
      },
      {
        icon: 'fas fa-download',
        label: window.i18n ? window.i18n.t('sync.import') : 'Importieren',
        action: () => {
          if (window.bookmarkSync) {
            window.bookmarkSync.showImportDialog();
            this.closeSettingsPopover();
          }
        }
      },
      {
        icon: 'fas fa-trash',
        label: window.i18n ? window.i18n.t('sync.clearAll') : 'Alle löschen',
        action: () => {
          if (window.bookmarkSync) {
            window.bookmarkSync.clearAllBookmarks();
            this.closeSettingsPopover();
          }
        },
        className: 'settings-danger'
      }
    ];

    syncOptions.forEach(option => {
      const item = document.createElement('div');
      item.className = `settings-item ${option.className || ''}`;
      item.innerHTML = `
        <i class="${option.icon}"></i>
        <span>${option.label}</span>
      `;

      if (option.action) {
        item.style.cursor = 'pointer';
        item.onclick = option.action;
      }

      syncSection.appendChild(item);
    });

    this.settingsPopover.appendChild(syncSection);

    // Position berechnen
    const gearButton = this.container.querySelector('.settings-gear-button');
    const rect = gearButton.getBoundingClientRect();

    this.settingsPopover.style.position = 'fixed';
    this.settingsPopover.style.top = `${rect.bottom + 5}px`;
    this.settingsPopover.style.right = `${window.innerWidth - rect.right}px`;

    document.body.appendChild(this.settingsPopover);

    // Schließen bei Klick außerhalb
    setTimeout(() => {
      const closeHandler = (e) => {
        if (this.settingsPopover &&
          !this.settingsPopover.contains(e.target) &&
          !gearButton.contains(e.target)) {
          this.closeSettingsPopover();
          document.removeEventListener('click', closeHandler);
        }
      };
      document.addEventListener('click', closeHandler);
    }, 100);
  }

  closeLanguagePopover() {
    const popover = this.container.querySelector('.language-popover');
    if (popover) popover.remove();
  }

  closeSettingsPopover() {
    if (this.settingsPopover) {
      this.settingsPopover.remove();
      this.settingsPopover = null;
    }
  }

  closeAllPopovers() {
    this.closeLanguagePopover();
    this.closeSettingsPopover();
  }

  changeLanguage(langCode) {
    this.currentLanguage = langCode;
    window.currentLanguage = langCode;

    // Update Flag
    const flagButton = this.container.querySelector('.language-flag-button span');
    if (flagButton) {
      const flagCode = this.getFlagCode(langCode); // ✅ Mapping nutzen!
      flagButton.className = `fi fi-${flagCode}`;
    }

    // Save preference
    localStorage.setItem('preferred_language', langCode);

    // Update i18n
    if (window.i18n) {
      window.i18n.setLanguage(langCode);
    }

    // Refresh UI
    this.refreshUI();
  }

  refreshUI() {
    // Update search placeholder
    const searchBar = document.getElementById('search-bar');
    if (searchBar && window.i18n) {
      searchBar.placeholder = window.i18n.t('searchPlaceholder');
    }

    // Trigger filter update
    if (window.styleFilterManager) {
      window.styleFilterManager.applyFilters();
    }
  }

  loadLanguagePreference() {
    const saved = localStorage.getItem('preferred_language');
    if (saved) {
      this.changeLanguage(saved);
    }
  }
}

// Initialize
window.languageSwitcher = new LanguageSwitcher();