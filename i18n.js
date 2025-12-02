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

      // ✨ Auto-detect browser language
      const browserLang = navigator.language.substring(0, 2);
      const supportedLangs = ['de', 'en', 'fr', 'it', 'nl', 'da', 'uk'];

      if (supportedLangs.includes(browserLang)) {
        this.currentLang = browserLang;
        window.currentLanguage = browserLang; // ✅ Global setzen
        console.log(`🌍 Detected browser language: ${browserLang}`);
      } else {
        this.currentLang = 'en'; // Fallback
        window.currentLanguage = 'en'; // ✅ Global setzen
        console.log(`🌍 Browser language ${browserLang} not supported, using: en`);
      }

      // ✅ Setze Search Placeholder direkt nach Laden
      const searchBar = document.getElementById('search-bar');
      if (searchBar && this.translations.searchPlaceholder) {
        searchBar.placeholder = this.translations.searchPlaceholder[this.currentLang] ||
          this.translations.searchPlaceholder['de'] ||
          'Search...';
        console.log('✅ Search placeholder set to:', searchBar.placeholder);
      }

      // Update language switcher tooltips
      if (window.languageSwitcher) {
        window.languageSwitcher.updateTooltips();
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
    }
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