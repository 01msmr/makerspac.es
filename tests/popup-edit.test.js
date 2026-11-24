// tests/popup-edit.test.js — Stift „Eintrag bearbeiten“ im Popup + Hover-Karenz (Quell-Wächter)
// Läuft mit: node --test tests/popup-edit.test.js
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
global.document = {
  documentElement: { style: { setProperty: noop }, classList: { contains: () => false } },
  getElementById: () => null, querySelector: () => null, querySelectorAll: () => [],
  addEventListener: noop, removeEventListener: noop, dispatchEvent: noop,
  body: { appendChild: noop, classList: { contains: () => false } },
};
global.localStorage = { getItem: () => null, setItem: noop, removeItem: noop };
Object.defineProperty(global, 'navigator', { value: { languages: ['de-DE'], language: 'de-DE' }, writable: true });

let buildPopupHTML;
before(async () => { ({ buildPopupHTML } = await import('../popup-builder.js')); });

const base = { ID: 7, name: 'X', link: { url: 'https://x.y', text: 'x.y' }, loc: { street: {}, country: 'Germany' }, style: 'for all' };
const read = f => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');

test('1: ohne editable (Embed) kein Stift', () => {
  assert.ok(!buildPopupHTML(base).includes('popup-edit'));
});

test('2: editable: Stift in der Meta-Zeile, auch ohne Weekly/Events', () => {
  const html = buildPopupHTML(base, { editable: true });
  assert.match(html, /<div><\/div><div class="popup-meta-row"><button[^>]*class="popup-edit"[^>]*data-id="7"/);
});

test('3: editable mit Weekly: Weekly-Zelle bleibt vor dem Stift', () => {
  const html = buildPopupHTML({ ...base, weekly: { weekday: 2, time: 1700 } }, { editable: true });
  assert.ok(html.indexOf('popup-weekly') < html.indexOf('popup-edit'));
  assert.equal((html.match(/popup-meta-row/g) || []).length, 1);
});

test('4: Tooltip-Text in allen 7 Sprachen vorhanden', () => {
  const t = JSON.parse(read('lang.json')).tooltips.editSpace;
  for (const l of ['de', 'en', 'fr', 'it', 'nl', 'da', 'uk']) assert.ok(t[l], `fehlt: ${l}`);
});

test('5: Hover-Karenz an Listeneintrag und Pin; Popup-Betreten macht sticky', () => {
  assert.match(read('config.js'), /popupGraceMs:\s*\d+/);
  assert.match(read('listing-core.js'), /removeHoverEffects\(location, \{ graceMs: AppConfig\.settings\.popupGraceMs \}\)/);
  assert.match(read('marker-manager.js'), /\}, graceMs\);/);
  assert.match(read('marker-manager.js'), /popupElement\.addEventListener\('mouseenter', handlePopupEnter\)/);
});

test('6: Stift öffnet das Overlay im Bearbeiten-Modus für die Space-ID', () => {
  assert.match(read('marker-manager.js'), /openOverlayTab\('addspace', \{ editId: location\.ID \}\)/);
  assert.match(read('embed-overlay.js'), /selectSpace\(editLoc\);\s*prefillAndEdit\(\)/);
});
