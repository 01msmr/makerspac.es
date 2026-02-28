// tests/i18n.test.js
// Testet I18n Übersetzungslogik
// Läuft mit: node --test tests/i18n.test.js

// ─── Browser-Stubs ────────────────────────────────────────────────────────
const noop = () => {};
global.window = {
  matchMedia: () => ({ matches: false }),
  languageSwitcher: null,
  consent: null,
  translations: null,
};
global.document = {
  getElementById: () => null,
  querySelector: () => null,
  querySelectorAll: () => [],
  addEventListener: noop,
};
global.localStorage = { getItem: () => null, setItem: noop, removeItem: noop };
Object.defineProperty(global, 'navigator', {
  value: { language: 'de-DE', languages: ['de-DE'] },
  writable: true,
});

// ─── Mock-Übersetzungen ───────────────────────────────────────────────────
const MOCK_TRANSLATIONS = {
  searchPlaceholder: { de: 'Suchen...', en: 'Search...' },
  filter: {
    style:    { de: 'Stil',   en: 'Style' },
    country:  { de: 'Land',   en: 'Country' },
  },
  userGuide: {
    title:        { de: 'Hilfe',     en: 'Help' },
    shortcut:     { de: 'Shortcut',  en: 'Shortcut' },
    shortcutText: { de: 'Text DE',   en: 'Text EN' },
    filter:       { de: 'Filter',    en: 'Filter' },
    filterText:   { de: 'FilterTxt', en: 'FilterTxt' },
    count:        { de: 'Anzahl',    en: 'Count' },
    countText:    { de: 'AnzahlTxt', en: 'CountTxt' },
    autoZoom:     { de: 'AutoZoom',  en: 'AutoZoom' },
    autoZoomText: { de: 'AZTxt',     en: 'AZTxt' },
    highlight:    { de: 'Markieren', en: 'Highlight' },
    highlightText:{ de: 'MarkTxt',   en: 'HighlightTxt' },
    scroll:       { de: 'Scrollen',  en: 'Scroll' },
    scrollText:   { de: 'ScrollTxt', en: 'ScrollTxt' },
  },
  addMakerspace: {
    title:        { de: 'Hinzufügen', en: 'Add' },
    byGoogleForms:{ de: 'Formular',   en: 'Form' },
    byGithub:     { de: 'GitHub',     en: 'GitHub' },
    embed:        { de: 'Einbetten',  en: 'Embed' },
  },
};

global.fetch = async () => ({
  ok: true,
  json: async () => MOCK_TRANSLATIONS,
});

// ─── Imports ──────────────────────────────────────────────────────────────
import { test, before } from 'node:test';
import assert from 'node:assert/strict';

let I18n;
before(async () => {
  const m = await import('../i18n.js');
  I18n = m.I18n;
});

// ─── Tests ────────────────────────────────────────────────────────────────

test('getSupportedLanguages: gibt 7 Codes zurück', () => {
  const i18n = new I18n();
  const langs = i18n.getSupportedLanguages();
  assert.equal(langs.length, 7);
  assert.ok(langs.includes('de'));
  assert.ok(langs.includes('en'));
  assert.ok(langs.includes('uk'));
});

test('getLanguage: Default ist "en" vor load()', () => {
  const i18n = new I18n();
  assert.equal(i18n.getLanguage(), 'en');
});

test('setLanguage / getLanguage: setzt unterstützte Sprache', () => {
  const i18n = new I18n();
  i18n.setLanguage('fr');
  assert.equal(i18n.getLanguage(), 'fr');
});

test('setLanguage: ignoriert unbekannte Sprachen', () => {
  const i18n = new I18n();
  i18n.setLanguage('xx');
  assert.equal(i18n.getLanguage(), 'en'); // bleibt beim Default
});

test('t(): gibt Schlüssel als Fallback zurück wenn keine Übersetzungen geladen', () => {
  const i18n = new I18n();
  // Keine load() → translations ist {}
  assert.equal(i18n.t('filter.style'), 'filter.style');
});

test('t(): gibt korrekte Übersetzung zurück nach load()', async () => {
  const i18n = new I18n();
  await i18n.load();
  i18n.setLanguage('de');
  assert.equal(i18n.t('filter.style'), 'Stil');
});

test('t(): Sprachfallback Englisch', async () => {
  const i18n = new I18n();
  await i18n.load();
  i18n.setLanguage('en');
  assert.equal(i18n.t('filter.country'), 'Country');
});

test('t(): nested path (searchPlaceholder)', async () => {
  const i18n = new I18n();
  await i18n.load();
  i18n.setLanguage('de');
  assert.equal(i18n.t('searchPlaceholder'), 'Suchen...');
});

test('load(): erkennt Browser-Sprache "de"', async () => {
  Object.defineProperty(global, 'navigator', {
    value: { language: 'de-DE', languages: ['de-DE'] },
    writable: true,
  });
  const i18n = new I18n();
  await i18n.load();
  assert.equal(i18n.getLanguage(), 'de');
});

test('load(): Fallback auf "en" bei unbekannter Browser-Sprache', async () => {
  Object.defineProperty(global, 'navigator', {
    value: { language: 'zh-CN', languages: ['zh-CN'] },
    writable: true,
  });
  const i18n = new I18n();
  await i18n.load();
  assert.equal(i18n.getLanguage(), 'en');
  // Browser-Sprache zurücksetzen
  Object.defineProperty(global, 'navigator', {
    value: { language: 'de-DE', languages: ['de-DE'] },
    writable: true,
  });
});

test('load(): gespeicherte Sprache aus localStorage hat Priorität', async () => {
  global.localStorage = { getItem: (key) => key === 'preferred_language' ? 'fr' : null, setItem: noop };
  const i18n = new I18n();
  await i18n.load();
  assert.equal(i18n.getLanguage(), 'fr');
  // Zurücksetzen
  global.localStorage = { getItem: () => null, setItem: noop };
});

test('t(): gibt Pfad zurück wenn Sprach-Key nicht existiert', async () => {
  const i18n = new I18n();
  await i18n.load();
  i18n.setLanguage('de');
  assert.equal(i18n.t('nonexistent.key'), 'nonexistent.key');
});
