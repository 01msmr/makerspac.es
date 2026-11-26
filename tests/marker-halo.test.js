// tests/marker-halo.test.js — Pin-Halo (165 px, 66 % → 0 %, ab Zoom 13, 0,8 s Einblenden) und 1-px-Außenrand am Pin
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

let createLeafletIcon, AppConfig;
before(async () => { const m = await import('../config.js'); createLeafletIcon = m.createLeafletIcon; AppConfig = m.default; });
const read = f => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');

test('1: Pin — Halo 165 px (relativ zur Pin-Größe) zentriert auf dem Pin-Körper, 1 px weißer Rand direkt im SVG, schwarzer Rand bleibt', () => {
  const icon = createLeafletIcon('#0e9000');
  assert.match(icon.html, /<span class="pin-halo" style="width:165px;height:165px;left:-70px;top:-70px"><\/span>/);   // Mitte = (12,5 | 12,5)
  assert.match(icon.html, /<path fill="#fff" stroke="#fff" stroke-width="3"/);                                       // 1 px außerhalb des 1-px-Randes
  assert.match(icon.html, /<path fill="#0e9000" stroke="#000" stroke-width="1"/);
  assert.ok(icon.html.indexOf('pin-halo') < icon.html.indexOf('<svg'), 'Halo liegt im DOM vor dem Pin');
  assert.deepEqual(icon.iconSize, [25, 41]);
  // Halo relativ zur Pin-Größe: Durchmesser = 165 px × scale (Hover-Pin 1,5 → 247,5 px, Embed-Ziel 1,2 → 198 px), stets auf dem Pin-Körper zentriert
  const big = createLeafletIcon('#f00', 1.5);
  assert.match(big.html, /width:247.5px;height:247.5px;left:-105px;top:-105px/);
  const target = createLeafletIcon('#f00', 1.2);
  assert.match(target.html, /width:198px;height:198px;left:-84px;top:-84px/);
  for (const sc of [1, 1.2, 1.5, 2]) {
    const m = createLeafletIcon('#000', sc).html.match(/width:([\d.]+)px;height:\1px;left:(-?[\d.]+)px/);
    const [w, left] = [Number(m[1]), Number(m[2])];
    assert.ok(Math.abs(w / Math.round(25 * sc) - 6.6) < 0.2, `Halo/Pin-Breite ≈ 6,6 bei scale ${sc}`);
    assert.ok(Math.abs(left + w / 2 - 12.5 * sc) < 0.01, `Halo-Mitte auf dem Pin-Körper bei scale ${sc}`);
  }
});

test('2: CSS — Mitte 66 %, außen 0 %, linear; erst mit .halo-on; Einblenden 0,8 s; Light hellgrau / Dark dunkel', () => {
  const css = read('main-layout.css');
  assert.match(css, /radial-gradient\(circle closest-side, rgb\(var\(--pin-halo-rgb\) \/ \.66\) 0%, rgb\(var\(--pin-halo-rgb\) \/ 0\) 100%\)/);
  assert.match(css, /\.ms-marker-icon \.pin-halo \{[^}]*opacity: 0;[^}]*visibility: hidden;/);
  assert.match(css, /\.halo-on \.ms-marker-icon \.pin-halo \{[^}]*opacity: 1;[^}]*transition: opacity \.8s ease-out/);
  assert.match(css, /:root \{ --pin-halo-rgb: 191 191 191; \}/);
  assert.match(css, /prefers-color-scheme: dark\) \{ :root \{ --pin-halo-rgb: 64 64 64; \} \}/);
  assert.match(css, /prefers-reduced-motion: reduce\) \{[^}]*transition: none/);
});

test('3: Zoom-Schwelle 13 — Klasse .halo-on wird im Marker-Manager am Karten-Container gesetzt', () => {
  assert.equal(AppConfig.settings.haloMinZoom, 13);
  const mm = read('marker-manager.js');
  assert.match(mm, /classList\.toggle\('halo-on', map\.getZoom\(\) >= AppConfig\.settings\.haloMinZoom\)/);
  assert.match(mm, /map\.on\('zoomend', syncHalo\)/);
});
