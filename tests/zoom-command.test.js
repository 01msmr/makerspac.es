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

let isZoomCommand, formatZoom;
before(async () => { ({ isZoomCommand, formatZoom } = await import('../zoom-manager.js')); });
const read = f => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');

test('1: isZoomCommand — nur „/zoom“ (Groß-/Kleinschreibung und Leerzeichen egal)', () => {
  for (const v of ['/zoom', '/ZOOM', '  /zoom  ']) assert.equal(isZoomCommand(v), true, v);
  for (const v of ['zoom', '/zoomen', '/zoom 5', 'Berlin', '', null, undefined]) assert.equal(isZoomCommand(v), false, String(v));
});

test('2: formatZoom — ganze Stufen ohne, stufenloser Touch-Zoom mit einer Nachkommastelle', () => {
  assert.equal(formatZoom(14), '14');
  assert.equal(formatZoom(14.6), '14.6');
  assert.equal(formatZoom(13.04), '13');
  assert.equal(formatZoom(15.5), '15.5');
});

test('3: Suchfeld: /zoom schaltet die Anzeige um, löscht nur den Befehl (Filter bleiben)', () => {
  const sh = read('search-header.js');
  assert.match(sh, /isZoomCommand\(this\.searchBar\.value\)/);
  assert.match(sh, /toggleZoomIndicator\(\)/);
  const block = sh.slice(sh.indexOf('isZoomCommand(this.searchBar.value)'), sh.indexOf('this.handleSearchInput();', sh.indexOf('isZoomCommand(this.searchBar.value)')));
  assert.ok(!block.includes('clearSearch'), 'darf Pills/Filter nicht löschen (kein clearSearch)');
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

test('6: ZoomManager: Zeiger-Kreis nur ohne Touch, Event + Merken, off() nur mit Handler', () => {
  const zm = read('zoom-manager.js');
  assert.match(zm, /if \(!isTouch\(\)\) \{\s*this\._createZoomIndicator\(\)/);
  assert.match(zm, /new CustomEvent\('zoomIndicatorChange'/);
  assert.match(zm, /ms-zoom-indicator/);
  assert.match(zm, /if \(this\._updateZoomIndicator\) this\.map\.off\('zoomend'/);
});
