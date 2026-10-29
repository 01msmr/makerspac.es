// tests/load-path-guards.test.js — Ladepfad (ADR-005): modulepreload ⇄ Import-Graph von map.js ⇄ sw.js STATIC_ASSETS
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = f => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');

/** Alle statisch importierten lokalen Module ab `entry` (ohne den Einstieg selbst) */
function importGraph(entry, seen = new Set()) {
  for (const m of read(entry).matchAll(/^\s*import\s[^'"]*['"]\.\/([^'"]+)['"]/gm)) {
    if (!seen.has(m[1])) { seen.add(m[1]); importGraph(m[1], seen); }
  }
  return seen;
}

const preload = new Set([...read('index.html').matchAll(/rel="modulepreload" href="([^"]+)"/g)].map(m => m[1]));
const precache = new Set([...read('sw.js').matchAll(/'\/([^']+\.js)'/g)].map(m => m[1]));

test('1: jedes statisch importierte Modul von map.js steht in der modulepreload-Liste', () => {
  const missing = [...importGraph('map.js')].filter(f => !preload.has(f));
  assert.deepEqual(missing, [], `fehlt in index.html (modulepreload): ${missing}`);
});

test('2: jedes modulepreload-Modul wird vom Service Worker vorgecacht', () => {
  const missing = [...preload].filter(f => !precache.has(f));
  assert.deepEqual(missing, [], `fehlt in sw.js STATIC_ASSETS: ${missing}`);
});

test('3: selten gebrauchte Module (≈ 95 KB) liegen NICHT im statischen Import-Graph von map.js', () => {
  const graph = importGraph('map.js');
  for (const lazy of ['embed-overlay.js', 'add-space-form.js', 'demo-mode.js']) {
    assert.ok(!graph.has(lazy), `${lazy} darf nicht statisch importiert werden (erst bei Bedarf per import() laden)`);
    assert.ok(!preload.has(lazy), `${lazy} gehört nicht in die modulepreload-Liste`);
  }
});

test('4: jedes per import() nachgeladene Modul wird vom Service Worker vorgecacht', () => {
  const dynamic = new Set();
  for (const f of ['map.js', 'overlay-loader.js', 'tile-loader.js', 'data-preload.js']) {
    const code = read(f).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, ''); // JSDoc-Typen (import('./types.js')) ausnehmen
    for (const m of code.matchAll(/import\(\s*['"]\.\/([^'"]+)['"]\s*\)/g)) dynamic.add(m[1]);
  }
  assert.ok(dynamic.has('demo-mode.js') && dynamic.has('embed-overlay.js'), 'erwartete dynamische Imports fehlen');
  const missing = [...dynamic].filter(f => !precache.has(f));
  assert.deepEqual(missing, [], `fehlt in sw.js STATIC_ASSETS: ${missing}`);
});
