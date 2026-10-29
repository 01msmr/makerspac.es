// tests/category-filters.test.js
// Filter-Kategorien: Stil/Status/Wochentag sind Einzelauswahl, Werkstätten erlauben Mehrfachauswahl (ODER).
// Läuft mit: node --test tests/category-filters.test.js

// ─── Browser-Stubs (vor allen Imports setzen) ─────────────────────────────
const noop = () => {};
global.location = { hash: '', hostname: 'localhost', search: '' };
global.window = {
  innerWidth: 1024,
  location: global.location,
  matchMedia: () => ({ matches: false, addEventListener: noop, removeEventListener: noop }),
  addEventListener: noop,
  removeEventListener: noop,
};
global.document = {
  documentElement: { style: { setProperty: noop }, classList: { contains: () => false } },
  getElementById: () => null,
  querySelector: () => null,
  querySelectorAll: () => [],
  addEventListener: noop,
  removeEventListener: noop,
  dispatchEvent: noop,
  body: { appendChild: noop, classList: { contains: () => false } },
};
global.localStorage = { getItem: () => null, setItem: noop, removeItem: noop };
Object.defineProperty(global, 'navigator', { value: { languages: ['de-DE'], language: 'de-DE' }, writable: true });

// ─── Modul-Imports ────────────────────────────────────────────────────────
import { test, before } from 'node:test';
import assert from 'node:assert/strict';

let SearchHeader, CONFIG;
before(async () => {
  SearchHeader = (await import('../search-header.js')).SearchHeader;
  CONFIG = (await import('../config.js')).default;
});

/** SearchHeader mit einem echten Set als Filter-Zustand */
function createHeader() {
  const selected = new Set();
  const header = new SearchHeader({ json: [] });
  header.searchBar = { value: '', focus: noop };
  header.scrollToTop = noop;
  header.searchFilter = {
    setStyleFilter: (s, on) => (on ? selected.add(s) : selected.delete(s)),
    getSelectedStyles: () => [...selected],
    applyFilters: noop,
  };
  return { header, selected };
}

test('1: Werkstätten erlauben Mehrfachauswahl — eine zweite Auswahl entfernt die erste nicht', () => {
  const { header, selected } = createHeader();
  const [a, b] = CONFIG.filterCategories.workshops.options;
  header.selectCategoryOption('workshops', a);
  header.selectCategoryOption('workshops', b);
  assert.deepEqual([...selected].sort(), [a, b].sort());
});

test('2: Stil (und Status) bleiben Einzelauswahl', () => {
  const { header, selected } = createHeader();
  const [a, b] = CONFIG.filterCategories.style.options;
  header.selectCategoryOption('style', a);
  header.selectCategoryOption('style', b);
  assert.deepEqual([...selected], [b]);
});

test('3: deselectCategoryOption nimmt nur die eine Werkstatt weg', () => {
  const { header, selected } = createHeader();
  const [a, b] = CONFIG.filterCategories.workshops.options;
  header.selectCategoryOption('workshops', a);
  header.selectCategoryOption('workshops', b);
  header.deselectCategoryOption('workshops', a);
  assert.deepEqual([...selected], [b]);
});

test('4: getActiveFiltersForCategory liefert alle aktiven Werkstätten (in Optionsreihenfolge), bei Stil höchstens einen Wert', () => {
  const { header } = createHeader();
  const [w1, w2, w3] = CONFIG.filterCategories.workshops.options;
  header.selectCategoryOption('workshops', w3);
  header.selectCategoryOption('workshops', w1);
  assert.deepEqual(header.getActiveFiltersForCategory('workshops'), [w1, w3]);
  assert.deepEqual(header.getActiveFiltersForCategory('style'), []);
  const [s1] = CONFIG.filterCategories.style.options;
  header.selectCategoryOption('style', s1);
  assert.deepEqual(header.getActiveFiltersForCategory('style'), [s1]);
});

test('5: toggleCategoryOption: Mehrfachkategorie schaltet einzelne Werte um, Einzelkategorie wählt neu', () => {
  const { header, selected } = createHeader();
  const [a] = CONFIG.filterCategories.workshops.options;
  header.toggleCategoryOption('workshops', a);
  assert.ok(selected.has(a));
  header.toggleCategoryOption('workshops', a);
  assert.ok(!selected.has(a));
});
