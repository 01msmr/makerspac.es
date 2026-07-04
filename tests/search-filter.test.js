// tests/search-filter.test.js
// Testet SearchFilter Filterlogik
// Läuft mit: node --test tests/search-filter.test.js

// ─── Browser-Stubs (vor allen Imports setzen) ─────────────────────────────
const noop = () => {};
global.location = { hash: '', hostname: 'localhost' };
global.window = {
  innerWidth: 1024,
  location: global.location,
  matchMedia: () => ({ matches: false, addEventListener: noop, removeEventListener: noop }),
  addEventListener: noop,
  removeEventListener: noop,
};
global.document = {
  documentElement: { style: { setProperty: noop }, classList: { contains: () => false } },
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

// ─── Mock-Daten ───────────────────────────────────────────────────────────
const MOCK_LOCATIONS = [
  {
    ID: 1, name: 'Fablab Berlin', style: 'fablab',
    loc: { city: 'Berlin', country: 'Germany', plz: '10115', street: { name: 'Chausseestraße', number: '1' } },
    spaceapi: { endpoint: 'https://example.com/api1' }, isOpen: true
  },
  {
    ID: 2, name: 'Hackerspace München', style: 'hackerspace',
    loc: { city: 'München', country: 'Germany', plz: '80331' },
    weekly: { weekday: 3, time: 1900 }
  },
  {
    ID: 3, name: 'Makerspace Wien', style: 'makerspace',
    loc: { city: 'Wien', country: 'Austria', plz: '1010' },
    spaceapi: { endpoint: 'https://example.com/api2' }, isOpen: false
  },
  {
    ID: 4, name: 'Repair Café Zürich', style: 'repaircafe',
    loc: { city: 'Zürich', country: 'Switzerland', plz: '8001' }
  }
];

const MOCK_ICONS = { greenIcon: 'g', redIcon: 'r', unknownStatusIcon: 'u', highlightIcon: 'h' };

let SearchFilter;
before(async () => {
  const m = await import('../search-filter.js');
  SearchFilter = m.SearchFilter;
});

// ─── Tests ────────────────────────────────────────────────────────────────

test('filterByText: leere Query gibt alle zurück', () => {
  const sf = new SearchFilter(MOCK_LOCATIONS, [], MOCK_ICONS);
  assert.equal(sf.filterByText('').length, MOCK_LOCATIONS.length);
});

test('filterByText: Suche nach Stadtname', () => {
  const sf = new SearchFilter(MOCK_LOCATIONS, [], MOCK_ICONS);
  const result = sf.filterByText('berlin');
  assert.equal(result.length, 1);
  assert.equal(result[0].name, 'Fablab Berlin');
});

test('filterByText: Suche nach Land (case-insensitive)', () => {
  const sf = new SearchFilter(MOCK_LOCATIONS, [], MOCK_ICONS);
  const result = sf.filterByText('germany');
  assert.equal(result.length, 2);
  assert.ok(result.some(l => l.loc.city === 'Berlin'));
  assert.ok(result.some(l => l.loc.city === 'München'));
});

test('filterByText: Suche nach PLZ-Prefix', () => {
  const sf = new SearchFilter(MOCK_LOCATIONS, [], MOCK_ICONS);
  // PLZ '1010' (Wien) und '10115' (Berlin) starten beide mit '101'
  const result = sf.filterByText('101');
  assert.equal(result.length, 2);
  assert.ok(result.some(l => l.loc.city === 'Wien'));
  assert.ok(result.some(l => l.loc.city === 'Berlin'));
});

test('filterByText: ID-Suche setzt currentIdMatch', async () => {
  const { appContext } = await import('../app-context.js');
  MOCK_LOCATIONS.forEach(l => appContext.locationById.set(l.ID, l));

  const sf = new SearchFilter(MOCK_LOCATIONS, [], MOCK_ICONS);
  sf.filterByText('2');
  assert.equal(sf.currentIdMatch?.ID, 2);
});

test('filterByText: Namenssuche Wortanfang', () => {
  const sf = new SearchFilter(MOCK_LOCATIONS, [], MOCK_ICONS);
  const result = sf.filterByText('hack');
  assert.equal(result.length, 1);
  assert.equal(result[0].name, 'Hackerspace München');
});

test('filterByText: keine Treffer bei unbekanntem Begriff', () => {
  const sf = new SearchFilter(MOCK_LOCATIONS, [], MOCK_ICONS);
  const result = sf.filterByText('zzznonexistent');
  assert.equal(result.length, 0);
});

test('getUniqueCountries: Germany zuerst (2 Einträge)', () => {
  const sf = new SearchFilter(MOCK_LOCATIONS, [], MOCK_ICONS);
  const countries = sf.getUniqueCountries();
  assert.equal(countries[0], 'Germany');
  assert.ok(countries.includes('Austria'));
  assert.ok(countries.includes('Switzerland'));
});

test('hasActiveFilters: initial false, nach setStyleFilter true', () => {
  const sf = new SearchFilter(MOCK_LOCATIONS, [], MOCK_ICONS);
  assert.equal(sf.hasActiveFilters(), false);
  sf.setStyleFilter('hackerspace', true);
  assert.equal(sf.hasActiveFilters(), true);
  sf.setStyleFilter('hackerspace', false);
  assert.equal(sf.hasActiveFilters(), false);
});

test('clearAllStyleFilters: löscht alle Filter', () => {
  const sf = new SearchFilter(MOCK_LOCATIONS, [], MOCK_ICONS);
  sf.setStyleFilter('fablab', true);
  sf.setStyleFilter('hackerspace', true);
  sf.clearAllStyleFilters();
  assert.equal(sf.hasActiveFilters(), false);
});

test('getSelectedStyles: gibt aktive Styles zurück', () => {
  const sf = new SearchFilter(MOCK_LOCATIONS, [], MOCK_ICONS);
  sf.setStyleFilter('fablab', true);
  sf.setStyleFilter('makerspace', true);
  const styles = sf.getSelectedStyles();
  assert.ok(styles.includes('fablab'));
  assert.ok(styles.includes('makerspace'));
  assert.equal(styles.length, 2);
});

test('lastFilteredIds: initial null', () => {
  const sf = new SearchFilter(MOCK_LOCATIONS, [], MOCK_ICONS);
  assert.equal(sf.lastFilteredIds, null);
});

test('lastFilteredIds: nach Filterlauf Set der gefilterten IDs', () => {
  const sf = new SearchFilter(MOCK_LOCATIONS, [], MOCK_ICONS);
  const berlinOnly = MOCK_LOCATIONS.filter(l => l.loc.city === 'Berlin');
  sf.applyPreFilters(berlinOnly);
  assert.ok(sf.lastFilteredIds instanceof Set);
  const expectedIds = new Set(sf.lastFilteredLocations.map(l => l.ID));
  assert.deepEqual(sf.lastFilteredIds, expectedIds);
});

test('lastFilteredIds: leeres Ergebnis → leeres Set', () => {
  const sf = new SearchFilter(MOCK_LOCATIONS, [], MOCK_ICONS);
  sf.applyPreFilters([]);
  assert.ok(sf.lastFilteredIds instanceof Set);
  assert.equal(sf.lastFilteredIds.size, 0);
});
