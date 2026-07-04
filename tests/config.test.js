// tests/config.test.js
// Characterization-Tests für AppConfig.escapeHtml (config.js ~Z.178)
// Läuft mit: node --test tests/config.test.js
//
// Hinweis: Diese Tests sind Characterization-Tests (beschreiben bestehenden Code).
// Sie werden sofort grün sein — kein TDD-Verstoß, da kein neues Verhalten eingeführt wird.
// Zweck: Absichern der escapeHtml-Semantik vor dem Ersetzen von embed-overlay.js esc().

// ─── Browser-Stubs (vor allen Imports setzen) ─────────────────────────────
const noop = () => {};
global.location = { hash: '', hostname: 'localhost' };
global.window = {
  innerWidth: 1024,
  location: global.location,
  matchMedia: () => ({ matches: false, addEventListener: noop, removeEventListener: noop }),
  addEventListener: noop,
  removeEventListener: noop,
  i18n: null,
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

let AppConfig;
before(async () => {
  const m = await import('../config.js');
  AppConfig = m.default;
});

// ─── Tests ────────────────────────────────────────────────────────────────

test('escapeHtml: escaped &', () => {
  assert.equal(AppConfig.escapeHtml('a & b'), 'a &amp; b');
});

test('escapeHtml: escaped <', () => {
  assert.equal(AppConfig.escapeHtml('<script>'), '&lt;script&gt;');
});

test('escapeHtml: escaped >', () => {
  assert.equal(AppConfig.escapeHtml('1 > 0'), '1 &gt; 0');
});

test('escapeHtml: escaped " (auch Anführungszeichen in Attributen sicher)', () => {
  assert.equal(AppConfig.escapeHtml('"value"'), '&quot;value&quot;');
});

test('escapeHtml: null → leerer String', () => {
  assert.equal(AppConfig.escapeHtml(null), '');
});

test('escapeHtml: undefined → leerer String', () => {
  assert.equal(AppConfig.escapeHtml(undefined), '');
});
