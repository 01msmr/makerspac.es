// tests/mobile-layout-guards.test.js
// Statische Regressions-Wächter (CI-tauglich, ohne Browser) für zwei Fehler, die auf iOS als schwarzer
// Streifen rechts sichtbar wurden. Echter Layout-Beweis im Browser: `npm run check:layout`.
// Läuft mit: node --test tests/mobile-layout-guards.test.js

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = f => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');

/** Liefert den Inhalt des `@media (max-width: 767px)`-Blocks, der `needle` enthält (Klammern-Balancing). */
function mediaBlockContaining(css, needle) {
  const re = /@media\s*\(max-width:\s*767px\)\s*\{/g;
  let m;
  while ((m = re.exec(css))) {
    let depth = 1, i = re.lastIndex;
    while (i < css.length && depth > 0) { depth += css[i] === '{' ? 1 : css[i] === '}' ? -1 : 0; i++; }
    const block = css.slice(re.lastIndex, i - 1);
    if (block.includes(needle)) return block;
  }
  return null;
}

test('1: Microtip-Tooltip des "+" ist auf Mobile (≤767px) aus — sonst wird die Seite breiter als das Gerät', () => {
  const block = mediaBlockContaining(read('main-responsive.css'), '.title-bar .tool-add::after');
  assert.ok(block, 'Regel für .title-bar .tool-add::after fehlt im @media (max-width: 767px)-Block');
  assert.match(block, /\.title-bar \.tool-add::before,\s*\.title-bar \.tool-add::after\s*\{[^}]*display:\s*none/);
});

test('2: updateMapBottom() meldet die neue Containergröße an Leaflet (invalidateSize)', () => {
  const src = read('mobile-filter.js');
  const fn = src.match(/const updateMapBottom = \(\) => \{([\s\S]*?)\n      \};/);
  assert.ok(fn, 'updateMapBottom nicht gefunden');
  assert.match(fn[1], /--mobile-ui-height/);
  assert.match(fn[1], /invalidateSize\(\)/, 'nach dem Setzen von --mobile-ui-height muss map.invalidateSize() folgen');
});

test('3: der visualViewport-Handler nutzt denselben Pfad (kein zweiter, abweichender Resize-Weg)', () => {
  const src = read('mobile-filter.js');
  assert.match(src, /visualViewport\.addEventListener\('resize',\s*updateMapBottom\)/);
});

test('4: fitBounds zieht die Bottom-UI nicht doppelt ab (#map endet bereits über ihr, Leaflet-Größe = sichtbare Karte)', () => {
  for (const f of ['zoom-manager.js', 'map.js', 'nearby-header.js']) {
    const src = read(f);
    assert.doesNotMatch(src, /paddingBottomRight:\s*L\.point\(8,\s*8\s*\+\s*uiH\)/, `${f}: uiH-Padding verschiebt die Auswahl nach oben`);
  }
});
