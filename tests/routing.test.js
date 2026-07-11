// tests/routing.test.js
// Testet RoutingManager: Slug-Logik, Länder/Städte-Extraktion, Route-Generierung
// Läuft mit: node --test tests/routing.test.js

// ─── Browser-Stubs (vor allen Imports) ────────────────────────────────────
const noop = () => {};
global.location  = { hash: '', hostname: 'localhost' };
global.window = {
  location:       global.location,
  history:        { pushState: noop, replaceState: noop },
  addEventListener:    noop,
  removeEventListener: noop,
  innerWidth:     1024,
  matchMedia:     () => ({ matches: false, addEventListener: noop }),
};
global.document = {
  createElement:      () => ({ style: {}, classList: { add: noop }, remove: noop }),
  getElementById:     () => null,
  querySelector:      () => null,
  querySelectorAll:   () => [],
  addEventListener:   noop,
  body:               { appendChild: noop, classList: { contains: () => false } },
  documentElement:    { style: { setProperty: noop }, classList: { contains: () => false } },
};
global.localStorage = { getItem: () => null, setItem: noop, removeItem: noop };
Object.defineProperty(global, 'navigator', {
  value: { languages: ['de-DE'], language: 'de-DE' },
  writable: true,
});
global.requestAnimationFrame = (fn) => setTimeout(fn, 0);

// ─── Mock-Daten ───────────────────────────────────────────────────────────
const MOCK_LOCATIONS = [
  { ID: 1, name: 'Fablab Berlin',        loc: { city: 'Berlin',  country: 'Germany',     plz: 10115 } },
  { ID: 2, name: 'Hackerspace Berlin',   loc: { city: 'Berlin',  country: 'Germany',     plz: 10245 } },
  { ID: 3, name: 'Makerspace München',   loc: { city: 'München', country: 'Germany',     plz: 80331 } },
  { ID: 4, name: 'Metalab Wien',         loc: { city: 'Wien',    country: 'Austria',     plz: 1010  } },
  { ID: 5, name: 'Happylab Wien',        loc: { city: 'Wien',    country: 'Austria',     plz: 1020  } },
  { ID: 6, name: 'Makerspace Zürich',    loc: { city: 'Zürich',  country: 'Switzerland', plz: 8001  } },
  // Sentinel-Werte (werden gefiltert)
  { ID: 7, name: 'TEMPLATE', loc: { city: 'CITY_CITY', country: 'COUNTRY_COUNTRY', plz: 0 } },
];

// ─── Imports ──────────────────────────────────────────────────────────────
import { test, before } from 'node:test';
import assert from 'node:assert/strict';

let RoutingManager;
let rm;

before(async () => {
  const m = await import('../routing.js');
  RoutingManager = m.RoutingManager;
  // styleFilterManager=null, searchManager=null → werden durch appContext ersetzt
  // json=MOCK_LOCATIONS → wird verwendet statt appContext.locations
  rm = new RoutingManager(null, null, MOCK_LOCATIONS);
});

// ─── normalizeSlug ────────────────────────────────────────────────────────

test('normalizeSlug: Leerzeichen → Bindestrich', () => {
  assert.equal(rm.normalizeSlug('for all'), 'for-all');
});

test('normalizeSlug: Großschreibung → Kleinschreibung', () => {
  assert.equal(rm.normalizeSlug('Germany'), 'germany');
});

test('normalizeSlug: Umlaute ä ö ü ß', () => {
  assert.equal(rm.normalizeSlug('München'), 'muenchen');
  assert.equal(rm.normalizeSlug('Zürich'),  'zuerich');
  assert.equal(rm.normalizeSlug('Österreich'), 'oesterreich');
  assert.equal(rm.normalizeSlug('Straße'),  'strasse');
});

test('normalizeSlug: Sonderzeichen werden entfernt', () => {
  // é→e via NFD, '&' und '.' werden entfernt
  assert.equal(rm.normalizeSlug('Café & Co.'), 'cafe--co');
});

test('normalizeSlug: führende/nachfolgende Leerzeichen', () => {
  assert.equal(rm.normalizeSlug('  Berlin  '), 'berlin');
});

// ─── countryToSlug / cityToSlug ───────────────────────────────────────────

test('countryToSlug: Germany → germany', () => {
  assert.equal(rm.countryToSlug('Germany'), 'germany');
});

test('countryToSlug: Switzerland → switzerland', () => {
  assert.equal(rm.countryToSlug('Switzerland'), 'switzerland');
});

test('cityToSlug: Wien → vienna (via Übersetzungs-Map)', () => {
  assert.equal(rm.cityToSlug('Wien'), 'vienna');
});

test('cityToSlug: München → munich', () => {
  assert.equal(rm.cityToSlug('München'), 'munich');
});

test('cityToSlug: Berlin → berlin (kein Mapping nötig)', () => {
  assert.equal(rm.cityToSlug('Berlin'), 'berlin');
});

test('cityToSlug: Zürich → zurich', () => {
  assert.equal(rm.cityToSlug('Zürich'), 'zurich');
});

// ─── _findAllCountries ────────────────────────────────────────────────────

test('_findAllCountries: findet 3 eindeutige Länder', () => {
  const countries = rm._findAllCountries();
  assert.equal(countries.length, 3);
  assert.ok(countries.includes('Germany'));
  assert.ok(countries.includes('Austria'));
  assert.ok(countries.includes('Switzerland'));
});

test('_findAllCountries: COUNTRY_COUNTRY wird gefiltert', () => {
  const countries = rm._findAllCountries();
  assert.ok(!countries.includes('COUNTRY_COUNTRY'));
});

test('_findAllCountries: alphabetisch sortiert', () => {
  const countries = rm._findAllCountries();
  const sorted = [...countries].sort();
  assert.deepEqual(countries, sorted);
});

// ─── _findCitiesWithMultipleSpaces ────────────────────────────────────────

test('_findCitiesWithMultipleSpaces: Berlin und Wien haben ≥2 Spaces', () => {
  const cities = rm._findCitiesWithMultipleSpaces();
  assert.ok(cities.has('Berlin'));
  assert.ok(cities.has('Wien'));
});

test('_findCitiesWithMultipleSpaces: Zürich hat nur 1 Space → nicht enthalten', () => {
  const cities = rm._findCitiesWithMultipleSpaces();
  assert.ok(!cities.has('Zürich'));
});

test('_findCitiesWithMultipleSpaces: CITY_CITY wird gefiltert', () => {
  const cities = rm._findCitiesWithMultipleSpaces();
  assert.ok(!cities.has('CITY_CITY'));
});

test('_findCitiesWithMultipleSpaces: korrekte Zählung', () => {
  const cities = rm._findCitiesWithMultipleSpaces();
  assert.equal(cities.get('Berlin'), 2);
  assert.equal(cities.get('Wien'), 2);
});

// ─── findCountryBySlug ────────────────────────────────────────────────────

test('findCountryBySlug: germany → Germany', () => {
  assert.equal(rm.findCountryBySlug('germany'), 'Germany');
});

test('findCountryBySlug: austria → Austria', () => {
  assert.equal(rm.findCountryBySlug('austria'), 'Austria');
});

test('findCountryBySlug: unbekannter Slug → null', () => {
  assert.equal(rm.findCountryBySlug('xyzland'), null);
});

// ─── _createRoutes ────────────────────────────────────────────────────────

test('_createRoutes: enthält alle Länder als Routen', () => {
  rm._ensureDataLoaded();
  const routes = rm._routes;
  assert.ok(routes['germany']?.type === 'country');
  assert.ok(routes['austria']?.type === 'country');
  assert.ok(routes['switzerland']?.type === 'country');
});

test('_createRoutes: enthält Style-Routen', () => {
  rm._ensureDataLoaded();
  const routes = rm._routes;
  assert.ok(routes['for-all']?.type === 'style');
  assert.ok(routes['commercial']?.type === 'style');
});

// ─── _setHash / resetRouteState ───────────────────────────────────────────

test('_setHash: setzt _isNavigating VOR der Hash-Änderung', () => {
  rm._isNavigating = false;
  rm._setHash('#/germany');
  assert.equal(rm._isNavigating, true);
  assert.equal(window.location.hash, '#/germany');
});

test('resetRouteState: verlässt Country- und Location-Route und leert den Hash', () => {
  rm._activeCountryFilter = 'Germany';
  rm._isOnLocationRoute = true;
  window.location.hash = '#/germany';

  rm.resetRouteState();

  assert.equal(rm._activeCountryFilter, null);
  assert.equal(rm._isOnLocationRoute, false);
  assert.equal(window.location.hash, '');
  assert.equal(rm._isNavigating, true,
    'hashchange-Handler muss für den eigenen Hash-Clear unterdrückt werden');
});
