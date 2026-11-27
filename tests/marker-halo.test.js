// tests/marker-halo.test.js — Pin-Halo (SVG-Kreis mit Radialverlauf, fest 220 px, 80 % → 0 %, ab Zoom 14, 0,8 s Einblenden) und 1-px-Außenrand am Pin
// Läuft mit: node --test tests/marker-halo.test.js
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const noop = () => {};
global.location = { hash: '', hostname: 'localhost', search: '' };
global.window = { innerWidth: 1024, location: global.location, matchMedia: () => ({ matches: false, addEventListener: noop, removeEventListener: noop }), addEventListener: noop, removeEventListener: noop };
global.document = { documentElement: { style: { setProperty: noop }, classList: { contains: () => false } }, getElementById: () => null, querySelector: () => null, querySelectorAll: () => [], addEventListener: noop, removeEventListener: noop, dispatchEvent: noop, body: { appendChild: noop, classList: { contains: () => false } } };
global.localStorage = { getItem: () => null, setItem: noop, removeItem: noop };
Object.defineProperty(global, 'navigator', { value: { languages: ['de-DE'], language: 'de-DE' }, writable: true });
global.L = { divIcon: o => o };

let createLeafletIcon, AppConfig, cfg;
before(async () => { const m = await import('../config.js'); cfg = m; createLeafletIcon = m.createLeafletIcon; AppConfig = m.default; });
const read = f => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');

test('1: Pin — Halo als Kreis mit Radialverlauf IM SVG, fest 220 px, zentriert auf dem Pin-Körper; 1 px weißer Rand, schwarzer Rand bleibt', () => {
  const icon = createLeafletIcon('#0e9000');
  // Kreis + Verlauf: Radius 110 (= 220 px / 2 bei scale 1), Mitte (12,5 | 12,5), Verlauf in Nutzerkoordinaten, ohne Maus-Treffer
  assert.match(icon.html, /<radialGradient id="(pin-halo-g\d+)" gradientUnits="userSpaceOnUse" cx="12.5" cy="12.5" r="110"><stop class="pin-halo-in" offset="0"\/><stop class="pin-halo-out" offset="1"\/><\/radialGradient>/);
  assert.match(icon.html, /<circle class="pin-halo" cx="12.5" cy="12.5" r="110" fill="url\(#pin-halo-g\d+\)" pointer-events="none"\/>/);
  assert.ok(!/<span/.test(icon.html), 'kein span mit z-index:-1 mehr (auf iOS-Safari nicht sichtbar)');
  assert.match(icon.html, /<path fill="#fff" stroke="#fff" stroke-width="3"/);                                       // 1 px außerhalb des 1-px-Randes
  assert.match(icon.html, /<path fill="#0e9000" stroke="#000" stroke-width="1"/);
  assert.ok(icon.html.indexOf('class="pin-halo"') < icon.html.indexOf('<path fill="#fff"'), 'Halo liegt im Quelltext vor dem Pin (= dahinter)');
  assert.deepEqual(icon.iconSize, [25, 41]);
  // Verlauf-IDs eindeutig je Pin
  const ids = new Set([createLeafletIcon('#000'), createLeafletIcon('#000'), createLeafletIcon('#000')].map(i => i.html.match(/id="(pin-halo-g\d+)"/)[1]));
  assert.equal(ids.size, 3);
  // Durchmesser fest 220 px, unabhängig von der Pin-Größe: Radius in Pin-Einheiten × scale = 110 px
  for (const sc of [1, 1.2, 1.5, 2]) {
    const r = Number(createLeafletIcon('#000', sc).html.match(/<circle class="pin-halo" cx="12.5" cy="12.5" r="([\d.]+)"/)[1]);
    assert.ok(Math.abs(r * sc - 110) < 0.01, `Halo-Durchmesser 220 px bei scale ${sc}`);
  }
});

test('1b: Pin-Transparenz als <g opacity> im SVG, der Halo liegt außerhalb der Deckkraft-Gruppe; Marker selbst bleibt deckend', () => {
  const po = AppConfig.settings.pinOpacity;
  assert.equal(po, 0.66);
  const html = createLeafletIcon('#f00', 1, po).html;
  const g = html.indexOf('<g opacity="0.66">');
  assert.ok(g > html.indexOf('class="pin-halo"'), 'Halo steht vor der Gruppe (nicht darin)');
  assert.ok(g > -1 && html.indexOf('</g>') > g && html.indexOf('</g>') < html.indexOf('</svg>'));
  assert.ok(!createLeafletIcon('#f00').html.includes('<g opacity'), 'ohne pinOpacity (Embed) keine Gruppe');
  // Marker-Element ohne opacity-Option (sonst würde der Halo mit abgedunkelt und von iOS-WebKit ggf. abgeschnitten)
  assert.match(read('marker-manager.js'), /L\.marker\(\[lat, lng\], \{ icon: icons\.defaultIcon \}\)/);
  assert.ok(!/L\.marker\(\[lat, lng\][^)]*opacity/.test(read('marker-manager.js')));
  // App-Icons und Hover-Pin tragen Pin-Transparenz UND Halo
  assert.match(read('main.js'), /createLeafletIcon\(CONFIG\.colours\.closed, 1, PO\)/);
  assert.match(read('main.js'), /hoverIcon: createLeafletIcon\(CONFIG\.getHoverColor\(\), 1\.5, PO\)/);
  assert.match(read('listing-core.js'), /createHoverIcon\(color\) \{[^}]*AppConfig\.createLeafletIcon\(color, 1\.5, AppConfig\.settings\.pinOpacity\)/);
});

test('1c: Popup-Pfeil im Stamm hergeleitet: Spitze fällt auf den Anker, Anker = Pin-Oberkante, gespiegelt = Pin-Spitze', () => {
  const { POPUP_GEOMETRY, POPUP_OFFSET, popupAnchorY, popupFlipGap } = cfg;
  // Herleitung aus Leaflet 1.9.4 + CSS: Spitze (gedrehtes 19-px-Quadrat) liegt 12,935 px unter der Oberkante des Pfeil-Containers
  const vertex = POPUP_GEOMETRY.TIP_MARGIN_TOP + POPUP_GEOMETRY.TIP_BOX / 2 * (1 + Math.SQRT2);
  assert.ok(Math.abs(vertex - 12.935) < 0.001);
  // popup offset.y so, dass Spitze = Anker (Rest nur die Pixel-Rundung): offset + (−20 −1 + 12,935) ≈ 0
  assert.deepEqual([...POPUP_OFFSET], [0, 8]);
  const rest = POPUP_OFFSET[1] - POPUP_GEOMETRY.MARGIN_BOTTOM + POPUP_GEOMETRY.TIP_CONTAINER_MARGIN_TOP + vertex;
  assert.ok(Math.abs(rest) < 0.1, `Spitze − Anker = ${rest}`);
  // Anker = sichtbare Pin-Oberkante (SVG-Oberkante − 0,5 × scale); waagerecht Pin-Mitte
  assert.deepEqual(createLeafletIcon('#000').popupAnchor, [0, -41]);        // −41,5 gerundet
  assert.deepEqual(createLeafletIcon('#000', 1.5).popupAnchor, [0, -63]);   // −(62 + 0,75)
  for (const sc of [1, 1.2, 1.5, 2]) {
    const pa = createLeafletIcon('#000', sc).popupAnchor;
    assert.equal(pa[0], 0, `x bei scale ${sc}`);
    assert.equal(pa[1], popupAnchorY(Math.round(41 * sc), sc));
  }
  // Gespiegelt: Abstand aus 20 (margin-top des Inhalts) − 6,065 (Spitze unter der Popup-Oberkante) − 0,5 × scale (Pin-Kontur)
  assert.ok(Math.abs(popupFlipGap(1) - 13.435) < 0.001);
  assert.ok(Math.abs(popupFlipGap(1.5) - 13.185) < 0.001);
  // Offset an JEDEM Popup dieser Pins (Hauptkarte und Embed), Abstand aus der Pin-Größe statt fester Zahl
  assert.match(read('marker-manager.js'), /closeButton: false, offset: POPUP_OFFSET \}\);/);
  assert.match(read('embed.js'), /closeButton: false, offset: POPUP_OFFSET \}\);/);
  assert.match(read('marker-manager.js'), /const FLIP_GAP = popupFlipGap\(pinHeight \/ 41\);/);
  assert.match(read('marker-manager.js'), /flipDy = markerScreenY - popupRect\.top \+ FLIP_GAP;/);
});

test('2: CSS — Mitte 80 %, außen 0 % (gleiche Farbe), linear; erst mit .halo-on; Einblenden 0,8 s; Light hellgrau / Dark dunkel', () => {
  const css = read('main-layout.css');
  assert.match(css, /\.pin-halo-in\s+\{ stop-color: var\(--pin-halo-color\); stop-opacity: \.8; \}/);
  assert.match(css, /\.pin-halo-out \{ stop-color: var\(--pin-halo-color\); stop-opacity: 0; \}/);
  assert.match(css, /\.ms-marker-icon \.pin-halo \{[^}]*opacity: 0;/);
  assert.match(css, /\.halo-on \.ms-marker-icon \.pin-halo \{[^}]*opacity: 1;[^}]*transition: opacity \.8s ease-out/);
  assert.match(css, /:root \{ --pin-halo-color: rgb\(191, 191, 191\); \}/);
  assert.match(css, /prefers-color-scheme: dark\) \{ :root \{ --pin-halo-color: rgb\(64, 64, 64\); \} \}/);
  assert.match(css, /prefers-reduced-motion: reduce\) \{[^}]*transition: none/);
  assert.ok(!/z-index:\s*-1/.test(css.slice(css.indexOf('Pin-Halo:'), css.indexOf('#map {'))), 'kein negativer z-index');
});

test('3: Zoom-Schwelle 14 — Klasse .halo-on wird im Marker-Manager am Karten-Container gesetzt', () => {
  assert.equal(AppConfig.settings.haloMinZoom, 14);
  const mm = read('marker-manager.js');
  assert.match(mm, /classList\.toggle\('halo-on', map\.getZoom\(\) >= AppConfig\.settings\.haloMinZoom\)/);
  assert.match(mm, /map\.on\('zoomend', syncHalo\)/);
});
