// tests/search-header.test.js
// Testet SearchHeader.triggerFilterUpdate() / handleSearchInput():
// User-Eingaben in der Suchleiste müssen die Location-Route verlassen,
// sonst bleibt der stale Route-Pre-Filter nach dem Löschen des Suchbegriffs aktiv.
// Läuft mit: node --test tests/search-header.test.js

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
import { test, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

let SearchHeader;
before(async () => {
  const m = await import('../search-header.js');
  SearchHeader = m.SearchHeader;
});

// ─── Test-Setup ───────────────────────────────────────────────────────────
// Minimaler SearchHeader ohne init(): nur die Teile stubben, die
// triggerFilterUpdate / handleSearchInput / clearSearch brauchen.

/** @returns {{header: any, filterCalls: string[]}} */
function createHeader() {
  const filterCalls = [];
  const header = new SearchHeader({ json: [] });
  header.searchBar = { value: '', focus: noop };
  header.pillsManager = { getPillsArray: () => [], count: () => 0, clear: noop };
  header.searchFilter = {
    filterByText: (query, pills) => { filterCalls.push(`filterByText:${query}`); return []; },
    applyPreFilters: () => { filterCalls.push('applyPreFilters'); },
    applyFilters: () => { filterCalls.push('applyFilters'); },
  };
  return { header, filterCalls };
}

beforeEach(() => {
  global.window.routingManager = {
    _isOnLocationRoute: true,
    _activeCountryFilter: null,
    _isNavigating: false,
    resetRouteStateCalled: false,
    // Delegations-Stub — echte Logik wird in tests/routing.test.js getestet
    resetRouteState() {
      this.resetRouteStateCalled = true;
      this._activeCountryFilter = null;
      this._isOnLocationRoute = false;
    },
  };
});

// ─── Tests ────────────────────────────────────────────────────────────────

test('handleSearchInput: Löschen des Suchbegriffs verlässt die Location-Route und setzt den Filter zurück', () => {
  const { header, filterCalls } = createHeader();
  // Ausgangslage: Location-Route aktiv (Item-Klick / geteilte URL), Bar wurde geleert
  header.searchBar.value = '';

  header.handleSearchInput();

  assert.equal(window.routingManager._isOnLocationRoute, false,
    'User-Eingabe muss _isOnLocationRoute zurücksetzen');
  assert.deepEqual(filterCalls, ['filterByText:', 'applyPreFilters'],
    'Leere Suche muss den Pre-Filter neu setzen (alle Locations), nicht den stalen Route-Pre-Filter behalten');
});

test('triggerFilterUpdate: programmatischer Aufruf (SpaceAPI-Update) behält den Route-Pre-Filter', () => {
  const { header, filterCalls } = createHeader();
  // Location-Route aktiv, Bar leer (URL direkt geöffnet), kein User-Input
  header.searchBar.value = '';

  header.triggerFilterUpdate();

  assert.equal(window.routingManager._isOnLocationRoute, true,
    'Programmatischer Refresh darf die Route nicht verlassen');
  assert.deepEqual(filterCalls, ['applyFilters'],
    'Route-Pre-Filter muss erhalten bleiben (kein filterByText/applyPreFilters)');
});

test('clearSearch: verlässt die Location-Route via resetRouteState()', () => {
  const { header } = createHeader();
  header.searchBar.value = 'Fablab Berlin';

  header.clearSearch(false, false);

  assert.equal(window.routingManager.resetRouteStateCalled, true,
    'clearSearch muss an routingManager.resetRouteState() delegieren');
  assert.equal(window.routingManager._isOnLocationRoute, false);
  assert.equal(header.searchBar.value, '');
});

test('handleSearchInput: Tippen eines Suchbegriffs auf einer Location-Route nutzt die Text-Suche', () => {
  const { header, filterCalls } = createHeader();
  header.searchBar.value = 'ber';

  header.handleSearchInput();

  assert.equal(window.routingManager._isOnLocationRoute, false);
  assert.deepEqual(filterCalls, ['filterByText:ber', 'applyPreFilters']);
});
