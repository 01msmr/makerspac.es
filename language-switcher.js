// language-switcher.js - Language selector with flag icons

class LanguageSwitcher {
  constructor(i18n) {
    this.i18n = i18n;
    this.container = null;
    this.popover = null;
    this.isOpen = false;

    this.languageNames = {
      'de': 'Deutsch',
      'en': 'English',
      'fr': 'Français',
      'it': 'Italiano',
      'nl': 'Nederlands',
      'da': 'Dansk',
      'uk': 'Українська'
    };

    this.flagCodes = {
      'de': 'de',
      'en': 'gb', // UK flag for English
      'fr': 'fr',
      'it': 'it',
      'nl': 'nl',
      'da': 'dk',
      'uk': 'ua'
    };
  }

  async init() {
    // ✨ Warte darauf, dass i18n Übersetzungen geladen hat
    if (!this.i18n.translations || Object.keys(this.i18n.translations).length === 0) {
      await this.i18n.load();
    }

    this.createLanguageButton();
    this.setupEventListeners();

    // ✨ Übersetze UI-Elemente beim ersten Laden
    this.translateUIElements();
  }

  createLanguageButton() {
    // Create container left of searchbar
    this.container = document.createElement('div');
    this.container.id = 'language-switcher';
    this.container.className = 'language-switcher';

    const currentLang = this.i18n.getLanguage();
    const flagCode = this.flagCodes[currentLang];

    this.container.innerHTML = `
      <div class="language-button" title="${this.i18n.t('tooltips.changeLanguage')}">
        <span class="fi fi-${flagCode} language-flag"></span>
      </div>
    `;

    // Insert before search container
    const searchContainer = document.querySelector('.search-container');
    if (searchContainer) {
      searchContainer.parentNode.insertBefore(this.container, searchContainer);
    }
  }

  setupEventListeners() {
    const button = this.container.querySelector('.language-button');

    button.addEventListener('click', (e) => {
      e.stopPropagation();
      this.togglePopover();
    });

    // Close on outside click
    document.addEventListener('click', (e) => {
      if (this.isOpen && !this.container.contains(e.target) && (!this.popover || !this.popover.contains(e.target))) {
        this.closePopover();
      }
    });
  }

  togglePopover() {
    if (this.isOpen) {
      this.closePopover();
    } else {
      this.openPopover();
    }
  }

  openPopover() {
    this.closePopover(); // Remove existing if any

    this.popover = document.createElement('div');
    this.popover.className = 'language-popover';

    const languages = this.i18n.getSupportedLanguages();
    const currentLang = this.i18n.getLanguage();

    languages.forEach(lang => {
      const item = document.createElement('div');
      item.className = 'language-popover-item';
      if (lang === currentLang) {
        item.classList.add('active');
      }

      const flagCode = this.flagCodes[lang];
      const langName = this.languageNames[lang];

      // ✨ Name LINKS, Flagge RECHTS
      item.innerHTML = `
        <span class="language-name">${langName}</span>
        <span class="fi fi-${flagCode} language-flag-popover"></span>
      `;

      item.addEventListener('click', (e) => {
        e.stopPropagation();
        this.selectLanguage(lang);
      });

      this.popover.appendChild(item);
    });

    // ✨ Füge Popover zum Container hinzu (statt body) für CSS positioning
    this.container.appendChild(this.popover);

    this.isOpen = true;
  }

  closePopover() {
    if (this.popover) {
      this.popover.remove();
      this.popover = null;
    }
    this.isOpen = false;
  }

  selectLanguage(lang) {
    this.i18n.setLanguage(lang);
    this.updateButton();
    this.closePopover();

    // Trigger UI refresh
    this.refreshUI();
  }

  updateButton() {
    const currentLang = this.i18n.getLanguage();
    const flagCode = this.flagCodes[currentLang];
    const button = this.container.querySelector('.language-button');

    button.innerHTML = `<span class="fi fi-${flagCode} language-flag"></span>`;
    // ✨ Aktualisiere auch den Tooltip
    button.setAttribute('title', this.i18n.t('tooltips.changeLanguage'));
  }

  refreshUI() {
    // ✨ Lade Filter-Section komplett neu
    if (window.searchManager) {
      // Entferne alte Filter-Section
      const oldFilterSection = document.querySelector('.active-filters-section');
      if (oldFilterSection) {
        oldFilterSection.remove();
      }

      // Erstelle neue Filter-Section mit aktualisierten Übersetzungen
      window.searchManager.createActiveFiltersSection();

      // Wende Filter erneut an (behält Auswahl bei)
      if (window.searchManager.styleFilterManager) {
        window.searchManager.styleFilterManager.applyFilters();
      }
    }

    // ✨ Übersetze UI-Elemente
    this.translateUIElements();
  }

  translateUIElements() {
    this.translateUserGuide();
    this.translateAddMakerspace();
    this.translateSearchPlaceholder();
  }

  translateUserGuide() {
    const userGuide = document.querySelector('.user-guide');
    if (!userGuide) return;

    userGuide.innerHTML = `
      <h2>${this.i18n.t('userGuide.title')}</h2>
      <ol>
        <li><strong>${this.i18n.t('userGuide.shortcut')}</strong> <br /> ${this.i18n.t('userGuide.shortcutDesc')}</li>
        <li><strong>${this.i18n.t('userGuide.filter')}</strong> <br /> ${this.i18n.t('userGuide.filterDesc')}</li>
        <li><strong>${this.i18n.t('userGuide.count')}</strong> <br /> ${this.i18n.t('userGuide.countDesc')}</li>
        <li><strong>${this.i18n.t('userGuide.autoZoom')}</strong> <br /> ${this.i18n.t('userGuide.autoZoomDesc')}</li>
        <li><strong>${this.i18n.t('userGuide.highlight')}</strong> <br /> ${this.i18n.t('userGuide.highlightDesc')}</li>
        <li><strong>${this.i18n.t('userGuide.scroll')}</strong> <br /> ${this.i18n.t('userGuide.scrollDesc')}</li>
      </ol>
    `;
  }

  translateAddMakerspace() {
    const addMakerspace = document.querySelector('.add-makerspace');
    if (!addMakerspace) return;

    addMakerspace.innerHTML = `
      <h2>${this.i18n.t('addMakerspace.title')}</h2>
      <br />
      <ul>
        <li><a href="https://forms.gle/NMDpikBPqGuSeXy3A" target="_blank" class="btn-primary">${this.i18n.t('addMakerspace.googleForms')}</a></li>
        <li><a href="https://github.com/01msmr/makerspac.es/blob/main/add-makerspace.md" target="_blank" class="btn-secondary">${this.i18n.t('addMakerspace.githubPR')}</a></li>
      </ul>
    `;
  }

  translateSearchPlaceholder() {
    const searchBar = document.getElementById('search-bar');
    if (!searchBar) return;

    searchBar.placeholder = this.i18n.t('searchPlaceholder');
  }
}

// Auto-initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', async () => {
    if (window.i18n) {
      window.languageSwitcher = new LanguageSwitcher(window.i18n);
      await window.languageSwitcher.init();
    }
  });
} else {
  if (window.i18n) {
    window.languageSwitcher = new LanguageSwitcher(window.i18n);
    window.languageSwitcher.init();
  }
}