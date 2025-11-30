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

      // ✨ Auto-detect browser language
      const browserLang = navigator.language.substring(0, 2);
      const supportedLangs = ['de', 'en', 'fr'];

      if (supportedLangs.includes(browserLang)) {
        this.currentLang = browserLang;
        console.log(`🌍 Detected browser language: ${browserLang}`);
      } else {
        this.currentLang = 'en'; // Fallback
        console.log(`🌍 Browser language ${browserLang} not supported, using: en`);
      }
    } catch (error) {
      console.error('Failed to load translations:', error);
    }
  }

  setLanguage(lang) {
    if (['de', 'en', 'fr'].includes(lang)) {
      this.currentLang = lang;
      console.log(`🌍 Language changed to: ${lang}`);
    }
  }

  getLanguage() {
    return this.currentLang;
  }

  getSupportedLanguages() {
    return ['de', 'en', 'fr'];
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