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
