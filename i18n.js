// i18n.js - Simple translation helper

class I18n {
  constructor() {
    this.translations = {};
    this.currentLang = 'en'; // Default
  }

  async load(url = './lang.json') {
    try {
      const response = await fetch(url);
      this.translations = await response.json();
      window.translations = this.translations; // ✅ Global verfügbar machen

      // ✅ ZUERST: Prüfe gespeicherte Sprache
      const savedLang = localStorage.getItem('preferred_language');
      const supportedLangs = ['de', 'en', 'fr', 'it', 'nl', 'da', 'uk'];

      if (savedLang && supportedLangs.includes(savedLang)) {
        // ✅ Gespeicherte Sprache hat Priorität
        this.currentLang = savedLang;
        window.currentLanguage = savedLang;
        console.log(`✅ Loaded saved language: ${savedLang}`);
      } else {
        // ✅ Fallback: Auto-detect browser language
        const browserLang = navigator.language.substring(0, 2);

        if (supportedLangs.includes(browserLang)) {
          this.currentLang = browserLang;
          window.currentLanguage = browserLang;
          console.log(`🌍 Detected browser language: ${browserLang}`);
        } else {
          this.currentLang = 'en'; // Fallback
          window.currentLanguage = 'en';
          console.log(`🌍 Browser language ${browserLang} not supported, using: en`);
        }
      }

      // ✅ Setze Search Placeholder direkt nach Laden
      const searchBar = document.getElementById('search-bar');
      if (searchBar && this.translations.searchPlaceholder) {
        searchBar.placeholder = this.translations.searchPlaceholder[this.currentLang] ||
          this.translations.searchPlaceholder['de'] ||
          'Search...';
        console.log('✅ Search placeholder set to:', searchBar.placeholder);
      }

      // ✅ Übersetze UI-Elemente
      this.translateUI();

      // Update language switcher tooltips
      if (window.languageSwitcher) {
        // window.languageSwitcher.updateTooltips(); // <--- ALTE ZEILE ENTFERNEN
        window.languageSwitcher.updateSettingsLabels(); // ✨ KORREKTUR: Neue Methode aufrufen
      }


    } catch (error) {
      console.error('Failed to load translations:', error);
      window.translations = {}; // ✅ Fallback
    }
  }

  setLanguage(lang) {
    if (['de', 'en', 'fr', 'it', 'nl', 'da', 'uk'].includes(lang)) {
      this.currentLang = lang;
      console.log(`🌍 Language changed to: ${lang}`);

      // ✅ Übersetze UI neu
      this.translateUI();
    }
  }

  // ✅ NEUE Methode: Übersetze UI-Elemente
  translateUI() {
    this.translateUserGuide();
    this.translateAddMakerspace();
    this.translateTitleTools();
  }

  translateUserGuide() {
    const userGuide = document.querySelector('.user-guide');
    if (!userGuide) return;

    userGuide.innerHTML = `
      <h2>⁉ ${this.t('userGuide.title')}</h2>
      <ol>
        <li><strong>${this.t('userGuide.shortcut')}:</strong> <br /> ${this.t('userGuide.shortcutText')}</li>
        <li><strong>${this.t('userGuide.filter')}</strong> <br /> ${this.t('userGuide.filterText')}</li>
        <li><strong>${this.t('userGuide.count')}</strong> <br /> ${this.t('userGuide.countText')}</li>
        <li><strong>${this.t('userGuide.autoZoom')}</strong> <br /> ${this.t('userGuide.autoZoomText')}</li>
        <li><strong>${this.t('userGuide.highlight')}</strong> <br /> ${this.t('userGuide.highlightText')}</li>
        <li><strong>${this.t('userGuide.scroll')}</strong> <br /> ${this.t('userGuide.scrollText')}</li>
      </ol>
    `;
  }

  translateAddMakerspace() {
    const addMakerspace = document.querySelector('.add-makerspace');
    if (!addMakerspace) return;

    // Nur Texte übersetzen, URLs bleiben im HTML
    const h2Title = addMakerspace.querySelector('h2');
    if (h2Title) h2Title.innerHTML = `+ ${this.t('addMakerspace.title')} 💛`;

    const btn1 = addMakerspace.querySelector('.btn-1');
    if (btn1) btn1.textContent = this.t('addMakerspace.byGoogleForms');

    const btn2 = addMakerspace.querySelector('.btn-2');
    if (btn2) btn2.textContent = this.t('addMakerspace.byGithub');

    const btn3 = addMakerspace.querySelector('.btn-3');
    if (btn3) btn3.textContent = this.t('addMakerspace.embed');
  }

  translateTitleTools() {
    const embedLink = document.querySelector('.tool-embed');
    if (embedLink) embedLink.title = this.t('addMakerspace.embed');

    const addLink = document.querySelector('.tool-add');
    if (addLink) addLink.title = this.t('addMakerspace.title');
  }

  getLanguage() {
    return this.currentLang;
  }

  getSupportedLanguages() {
    return ['de', 'en', 'fr', 'it', 'nl', 'da', 'uk'];
  }

  t(path) {
    // Navigate nested object: "filter.style" -> translations.filter.style
    const keys = path.split('.');
    let value = this.translations;

    for (const key of keys) {
      if (value && typeof value === 'object') {
        value = value[key];
      } else {
        return path; // Fallback to key if not found
      }
    }

    // Return translation for current language
    if (value && typeof value === 'object' && value[this.currentLang]) {
      return value[this.currentLang];
    }

    return path; // Fallback
  }
}

// Usage example:
// const i18n = new I18n();
// await i18n.load();
// console.log(i18n.t('filter.style')); // "Style" (if en)
// i18n.setLanguage('de');
// console.log(i18n.t('filter.style')); // "Stil"