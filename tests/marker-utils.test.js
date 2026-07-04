// tests/marker-utils.test.js
// Characterization-Tests für zfill (verschoben von map.js nach marker-manager.js).
// Läuft mit: node --test tests/marker-utils.test.js
//
// Diese Tests beschreiben das BESTEHENDE Verhalten von zfill (PLZ-Formatierung
// mit landesspezifischer Länge). Sie sichern die Semantik vor/während des
// map.js → marker-manager.js Splits ab (reine Code-Verschiebung).
//
// RED-Vorlauf: Vor der Extraktion existiert marker-manager.js noch nicht →
// der Import schlägt fehl → Tests rot. Nach der Extraktion grün.

// ─── Browser-Stubs (vor allen Imports setzen) ─────────────────────────────
// marker-manager.js importiert config.js / datasync.js / bookmark-manager.js,
// die auf Modul-Ebene window/document/localStorage berühren.
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

let zfill;
before(async () => {
  const m = await import('../marker-manager.js');
  zfill = m.zfill;
});

// ─── Bekannte Länder: Padding auf landesspezifische Länge ───────────────────
test('Germany: 5-stellig, führende Nullen', () => {
  assert.equal(zfill('123', 'Germany'), '00123');
});

test('Austria: 4-stellig', () => {
  assert.equal(zfill('12', 'Austria'), '0012');
});

test('Belgium: 4-stellig', () => {
  assert.equal(zfill('9', 'Belgium'), '0009');
});

test('Switzerland: 4-stellig', () => {
  assert.equal(zfill('80', 'Switzerland'), '0080');
});

test('USA: 5-stellig', () => {
  assert.equal(zfill('2', 'USA'), '00002');
});

test('Poland/Italy/Spain/France/Ukraine: 5-stellig', () => {
  assert.equal(zfill('1', 'Poland'), '00001');
  assert.equal(zfill('1', 'Italy'), '00001');
  assert.equal(zfill('1', 'Spain'), '00001');
  assert.equal(zfill('1', 'France'), '00001');
  assert.equal(zfill('1', 'Ukraine'), '00001');
});

test('Netherlands/Luxemburg: 4-stellig', () => {
  assert.equal(zfill('7', 'Netherlands'), '0007');
  assert.equal(zfill('7', 'Luxemburg'), '0007');
});

// ─── Unbekanntes Land: Passthrough (keine Padding-Länge bekannt) ────────────
test('unbekanntes Land → Passthrough (Länge unverändert)', () => {
  assert.equal(zfill('123', 'Narnia'), '123');
});

test('undefined Land → Passthrough', () => {
  assert.equal(zfill('42', undefined), '42');
});

test('Luxembourg (englische Schreibweise) NICHT in Map → Passthrough', () => {
  // Quirk: die Map nutzt die Schreibweise "Luxemburg", nicht "Luxembourg".
  assert.equal(zfill('12', 'Luxembourg'), '12');
});

// ─── Eingabe-Typen / Edge-Cases ─────────────────────────────────────────────
test('Zahl-Eingabe wird via String() konvertiert', () => {
  assert.equal(zfill(123, 'Germany'), '00123');
});

test('bereits lange PLZ wird nicht abgeschnitten', () => {
  assert.equal(zfill('123456', 'Germany'), '123456');
});

test('null-PLZ wird zu "null"-String (dokumentierter Quirk)', () => {
  // String(null) === 'null' (Länge 4) → padStart(5,'0') → '0null'
  assert.equal(zfill(null, 'Germany'), '0null');
});

test('leerer String bei unbekanntem Land → leerer String', () => {
  assert.equal(zfill('', 'Narnia'), '');
});
