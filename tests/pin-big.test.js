// tests/pin-big.test.js — Pin vergrößert sich animiert per Klasse (kein Icon-Tausch), Popup sofort, einheitlich für Pin-/Listen-Hover und Tap
// Läuft mit: node --test tests/pin-big.test.js
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const noop = () => {};
global.location = { hash: '', hostname: 'localhost', search: '' };
global.window = { innerWidth: 1024, location: global.location, matchMedia: () => ({ matches: false, addEventListener: noop, removeEventListener: noop }), addEventListener: noop, removeEventListener: noop };
global.document = { documentElement: { style: { setProperty: noop }, classList: { contains: () => false } }, getElementById: () => null, querySelector: () => null, querySelectorAll: () => [], addEventListener: noop, removeEventListener: noop, dispatchEvent: noop, body: { appendChild: noop, classList: { contains: () => false } } };
global.localStorage = { getItem: () => null, setItem: noop, removeItem: noop };
Object.defineProperty(global, 'navigator', { value: { languages: ['de-DE'], language: 'de-DE' }, writable: true });

let cfg, colours;
before(async () => { cfg = await import('../config.js'); colours = await import('../colours.js'); });
const read = f => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');

test('1: CSS: Skalierung um die Pin-Spitze, 0,15 s, Faktor und Ursprung = config.js; Spaces ohne SpaceAPI färben sich in die Hover-Farbe', () => {
  const css = read('main-layout.css');
  const { PIN_BIG_SCALE, PIN_GEOMETRY } = cfg;
  assert.match(css, new RegExp(`\\.ms-marker-icon \\.pin-body \\{ transform-box: view-box; transform-origin: ${PIN_GEOMETRY.TIP_X}px ${PIN_GEOMETRY.TIP_Y}px; transition: transform \\.15s ease-out; \\}`));
  assert.match(css, new RegExp(`\\.ms-marker-icon\\.pin-big \\.pin-body \\{ transform: scale\\(${PIN_BIG_SCALE}\\); \\}`));
  assert.match(css, /\.ms-marker-icon \.pin-fill \{ transition: fill \.15s ease-out; \}/);
  assert.match(css, /\.ms-marker-icon\.pin-big\.pin-nostatus \.pin-fill \{ fill: var\(--space-hover\); \}/);
  assert.match(css, /prefers-reduced-motion: reduce\) \{\s*\.ms-marker-icon \.pin-body, \.ms-marker-icon \.pin-fill \{ transition: none; \}/);
});

test('2: ein Ort entscheidet: syncPinBig (Hover am Pin ∨ Hover am Listeneintrag ∨ Popup offen), aus Zustand, Popup, add und setIcon aufgerufen', () => {
  const mm = read('marker-manager.js');
  assert.match(mm, /const big = !!\(st\.isHovering \|\| st\.isDropdownHovering \|\| marker\._popupShown\);/);
  assert.match(mm, /window\.markerStateManager\.onChange = \(id\) => syncPinBig\(getMarkerByLocationId\(id\)\);/);
  assert.match(read('map.js'), /this\.onChange\?\.\(locationId\);/);
  assert.match(mm, /marker\._popupShown = true;\s*syncPinBig\(marker\);/);
  assert.match(mm, /marker\._popupShown = false;\s*syncPinBig\(marker\);/);
  assert.match(mm, /marker\.on\('add', \(\) => syncPinBig\(marker\)\);/);
  // setIcon: gleiches Icon → nichts tun (Animation läuft weiter); sonst danach neu ableiten
  assert.match(mm, /if \(marker\.options\.icon === icon && marker\._icon\) return marker;/);
  assert.match(mm, /const r = rawSetIcon\(icon\);\s*syncPinBig\(marker\);/);
  // Re-Tap (Popup bleibt offen): kein Schrumpfen/Wachsen
  assert.match(mm, /if \(marker\._retainPopup\) \{[^}]*return;\s*\}\s*marker\._popupShown = false;/);
  // Embed: Pin groß, solange das Popup offen ist
  assert.match(read('embed.js'), /marker\._icon\?\.classList\.add\('pin-big'\)/);
  assert.match(read('embed.js'), /marker\.on\('popupclose', \(\) => marker\._icon\?\.classList\.remove\('pin-big'\)\);/);
});

test('3: kein Icon-Tausch und keine Schein-Skalierung mehr', () => {
  for (const f of ['marker-manager.js', 'listing-core.js', 'main.js', 'map.js']) {
    const src = read(f);
    assert.ok(!/hoverIcon|createHoverIcon|applyMarkerScale|isScaling|currentScale/.test(src), `${f}: Reste von Hover-Icon/Schein-Skalierung`);
  }
});

test('4: einheitliche Zeiten: Popup sofort (Pin- und Listen-Hover), Karenz 0,3 s', () => {
  const { settings } = cfg.default;
  assert.equal(settings.popupDelayMs, 0);
  assert.equal(settings.popupGraceMs, 300);
  assert.match(read('marker-manager.js'), /\}, AppConfig\.settings\.popupDelayMs\);/);   // Pin-Hover wie Listen-Hover
  assert.match(read('listing-core.js'), /\}, AppConfig\.settings\.popupDelayMs\);/);
});

test('5: Status → Icon: eine Funktion (colours.js statusIconKey) statt vier Kopien; highlightIcon = defaultIcon', () => {
  const { statusIconKey } = colours;
  assert.equal(statusIconKey({ isOpen: true }), 'greenIcon');
  assert.equal(statusIconKey({ isOpen: false, spaceapi: { endpoint: 'x' } }), 'redIcon');
  assert.equal(statusIconKey({ spaceapi: { endpoint: 'x' } }), 'unknownStatusIcon');
  assert.equal(statusIconKey({}), 'defaultIcon');
  assert.equal(statusIconKey(undefined), 'defaultIcon');
  assert.equal(cfg.default.statusIconKey, statusIconKey);
  for (const f of ['marker-manager.js', 'search-filter.js', 'spaceapi-static.js']) {
    assert.ok(!/icons\.(greenIcon|redIcon|unknownStatusIcon)/.test(read(f)), `${f}: eigene Status→Icon-Kette`);
  }
  assert.match(read('main.js'), /get highlightIcon\(\) \{ return this\.defaultIcon; \}/);
});
