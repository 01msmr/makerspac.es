// tests/zoom-command.test.js — „/zoom“ im Suchfeld: Zoom-Anzeige + Pseudo-Suchbegriff-Chip (Desktop, Tablet, Phone)
// Läuft mit: node --test tests/zoom-command.test.js
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const noop = () => {};
global.location = { hash: '', hostname: 'localhost', search: '' };
global.window = {
  innerWidth: 1024, location: global.location,
  matchMedia: () => ({ matches: false, addEventListener: noop, removeEventListener: noop }),
  addEventListener: noop, removeEventListener: noop,
  i18n: { t: k => `[${k}]` },
};
global.localStorage = { getItem: () => null, setItem: noop, removeItem: noop };
Object.defineProperty(global, 'navigator', { value: { languages: ['de-DE'], language: 'de-DE' }, writable: true });
global.document = {
  documentElement: { style: { setProperty: noop }, classList: { contains: () => false } },
  getElementById: () => null, querySelector: () => null, querySelectorAll: () => [],
  addEventListener: noop, removeEventListener: noop, dispatchEvent: noop,
  body: { appendChild: noop, classList: { contains: () => false } },
};

let isZoomCommand, isZoomCommandPrefix, formatZoom;
before(async () => { ({ isZoomCommand, isZoomCommandPrefix, formatZoom } = await import('../zoom-manager.js')); });
const read = f => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');

test('1: isZoomCommand — nur „/zoom“ (Groß-/Kleinschreibung und Leerzeichen egal)', () => {
  for (const v of ['/zoom', '/ZOOM', '  /zoom  ']) assert.equal(isZoomCommand(v), true, v);
  for (const v of ['zoom', '/zoomen', '/zoom 5', 'Berlin', '', null, undefined]) assert.equal(isZoomCommand(v), false, String(v));
});

test('1b: isZoomCommandPrefix — „/“ bis „/zoom“ (beim Tippen darf die Suche nicht anspringen)', () => {
  for (const v of ['/', '/z', '/zo', '/zoo', '/zoom', '/ZOO']) assert.equal(isZoomCommandPrefix(v), true, v);
  for (const v of ['', 'z', '/zx', '/zoomm', '/a', 'Berlin', null]) assert.equal(isZoomCommandPrefix(v), false, String(v));
});

test('2: formatZoom — ganze Stufen ohne, stufenloser Touch-Zoom mit einer Nachkommastelle', () => {
  assert.equal(formatZoom(14), '14');
  assert.equal(formatZoom(14.6), '14.6');
  assert.equal(formatZoom(13.04), '13');
  assert.equal(formatZoom(15.5), '15.5');
});

test('3: Suchfeld: /zoom schaltet die Anzeige um; Tippen und Absenden lassen Suche, Filter und Auto-Zoom unberührt', () => {
  const sh = read('search-header.js');
  assert.match(sh, /isZoomCommand\(value\)/);
  assert.match(sh, /toggleZoomIndicator\(\)/);
  const from = sh.indexOf('const value = this.searchBar.value;');
  const block = sh.slice(from, sh.indexOf('this.handleSearchInput();', from));
  assert.ok(!block.includes('clearSearch'), 'darf Pills/Filter nicht löschen (kein clearSearch)');
  assert.match(block, /if \(isZoomCommandPrefix\(value\)\) return;/);   // beim Tippen: keine Suche → kein Auto-Zoom
  assert.ok(!/isZoomCommand\(value\)\) \{[^}]*handleSearchInput/.test(block), 'nach dem Befehl keine neue Suche (sonst springt die Karte auf die Gesamtansicht)');
  assert.match(block, /isPhone\(\)\) window\.mobileFilterUI\?\.close\?\.\(\)/);   // Phone: Pane zu, damit die Karte sichtbar ist
});

test('4: Chip: Desktop/Tablet als Werkzeug-Pill, Phone zusätzlich als antippbarer Karten-Chip', () => {
  const sh = read('search-header.js');
  assert.match(sh, /setToolPill\('tool-zoom'/);
  assert.match(sh, /removeToolPill\('tool-zoom'\)/);
  assert.match(sh, /addEventListener\('zoomIndicatorChange'/);
  assert.match(sh, /map-term map-term-tool/);
  assert.match(read('search.css'), /\.map-term-tool \{[^}]*pointer-events: auto/);
});

test('5: Werkzeug-Pills sind keine Filter: eigene Map, kein onChange, überstehen clear()', () => {
  const sp = read('search-pills.js');
  assert.match(sp, /this\.toolPills = new Map\(\)/);
  const setTool = sp.slice(sp.indexOf('setToolPill('), sp.indexOf('updateToolPillText('));
  assert.ok(!setTool.includes('onChangeCallback'), 'setToolPill löst kein onChange aus');
  const from = sp.indexOf('  clear() {');
  const clear = sp.slice(from, sp.indexOf('\n  }\n', from));
  assert.ok(!clear.includes('toolPills'), 'clear() lässt Werkzeug-Pills stehen');
});

test('6: ZoomManager: Zahl am Mauszeiger (Desktop) bzw. letzten Berührpunkt (Touch), nur für die Sitzung', () => {
  const zm = read('zoom-manager.js');
  assert.match(zm, /addEventListener\('mousemove', this\._moveZoomIndicator\)/);
  assert.match(zm, /addEventListener\('touchstart', this\._touchZoomIndicator/);
  assert.match(zm, /addEventListener\('touchmove', this\._touchZoomIndicator/);
  assert.match(zm, /Date\.now\(\) - this\._lastTouchTime < 800/);   // Kompatibilitäts-Mausereignisse nach Touch ignorieren
  assert.match(zm, /new CustomEvent\('zoomIndicatorChange'/);
  assert.ok(!/localStorage/.test(zm), 'nicht gespeichert: gilt nur für die aktuelle Sitzung');
  assert.match(zm, /if \(this\._updateZoomIndicator\) this\.map\.off\('zoom zoomend'/);   // off() nur mit Handler
  assert.match(read('main-components.css'), /#zoom-indicator\[data-pointer="touch"\] \{\s*transform: translate\(-50%, calc\(-100% - 36px\)\)/);
});

test('7: Chip heißt „zoom“ (die Zahl steht am Zeiger), Suchzeile nicht nötig', () => {
  const sh = read('search-header.js');
  assert.match(sh, /setToolPill\('tool-zoom', 'zoom'/);
  assert.match(sh, /chip\.textContent = 'zoom'/);
  assert.ok(!sh.includes('updateZoomChipText'), 'kein Live-Text im Chip');
});
