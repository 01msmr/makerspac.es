// tests/layout-mode.test.js — Layout-Modus (Phone/Tablet/Mobile-UI) und Grid-Maße der Dropdown-Seiten
import { test } from 'node:test';
import assert from 'node:assert/strict';

let matching = new Set();
global.window = { matchMedia: q => ({ matches: matching.has(q) }) };
const { MOBILE_UI_QUERY, TABLET_QUERY, PHONE_QUERY, isMobileUI, isTablet, isPhone, gridSpec } = await import('../layout-mode.js');

test('1: isMobileUI/isTablet/isPhone folgen den Media-Queries', () => {
  matching = new Set();
  assert.deepEqual([isMobileUI(), isTablet(), isPhone()], [false, false, false]);
  matching = new Set([MOBILE_UI_QUERY, PHONE_QUERY]);
  assert.deepEqual([isMobileUI(), isTablet(), isPhone()], [true, false, true]);
  matching = new Set([MOBILE_UI_QUERY, TABLET_QUERY]);
  assert.deepEqual([isMobileUI(), isTablet(), isPhone()], [true, true, false]);
});

test('2: Phone = 2 Spalten × 3 Zeilen à 40px (Seite 120px)', () => {
  assert.deepEqual(gridSpec({ tablet: false, landscape: false }), { cols: 2, rowsPerPage: 3, rowH: 40, pageHeight: 120 });
});

test('3: Tablet Portrait = 4×4 à 58px, Landscape = 5×3 à 58px', () => {
  assert.deepEqual(gridSpec({ tablet: true, landscape: false }), { cols: 4, rowsPerPage: 4, rowH: 58, pageHeight: 232 });
  assert.deepEqual(gridSpec({ tablet: true, landscape: true }), { cols: 5, rowsPerPage: 3, rowH: 58, pageHeight: 174 });
});

test('4: Landscape ohne Tablet zählt nicht (Phone bleibt Phone)', () => {
  assert.equal(gridSpec({ tablet: false, landscape: true }).rowH, 40);
});

test('5: kein Modul überschattet importierte Layout-Funktionen mit einer lokalen Variable (TDZ-Fehler beim Pane-Öffnen)', async () => {
  const { readFileSync, readdirSync } = await import('node:fs');
  for (const f of readdirSync(new URL('..', import.meta.url)).filter(n => n.endsWith('.js'))) {
    const src = readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
    const imp = src.match(/import\s*\{([^}]*)\}\s*from\s*'\.\/layout-mode\.js'/);
    if (!imp) continue;
    for (const name of imp[1].split(',').map(n => n.trim()).filter(Boolean)) {
      assert.doesNotMatch(src, new RegExp(`\\b(const|let|var)\\s+${name}\\b`), `${f}: lokale Variable '${name}' überschattet den Import`);
    }
  }
});
