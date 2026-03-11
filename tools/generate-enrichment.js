// tools/generate-enrichment.js
// Einmalige Migration: extrahiert bestehende enrichable Felder aus locations.json
// und erzeugt loc-enrichment.json als neue Single-Source-of-Truth für crawler-pflegbare Daten.
//
// Führt keine Daten-Löschungen in locations.json durch — nur additiv.
//
// Usage:
//   node tools/generate-enrichment.js

import { readFileSync, writeFileSync, existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

const locationsPath = path.join(root, 'locations.json');
const enrichmentPath = path.join(root, 'loc-enrichment.json');

const PLACEHOLDER_WEEKDAY = 9;
const PLACEHOLDER_INIT    = 20010000;

const locations = JSON.parse(readFileSync(locationsPath, 'utf8'));

// Bestehende loc-enrichment.json einlesen falls vorhanden (merge, nicht überschreiben)
const existing = existsSync(enrichmentPath)
  ? JSON.parse(readFileSync(enrichmentPath, 'utf8'))
  : {};

let added = 0;
let skipped = 0;

for (const loc of locations) {
  const id = String(loc.ID);
  const entry = existing[id] || {};
  let changed = false;

  // workshops
  if (loc.workshops?.length && !entry.workshops?.length) {
    entry.workshops = loc.workshops;
    changed = true;
  }

  // events
  if (loc.events && !entry.events) {
    entry.events = loc.events;
    changed = true;
  }

  // spaceapi
  if (loc.spaceapi?.endpoint && !entry.spaceapi?.endpoint) {
    entry.spaceapi = { endpoint: loc.spaceapi.endpoint };
    changed = true;
  }

  // weekly (nur wenn nicht Platzhalter)
  const w = loc.weekly;
  if (w && !(w.weekday === PLACEHOLDER_WEEKDAY && w.time === 0) && !entry.weekly) {
    entry.weekly = { weekday: w.weekday, time: w.time };
    changed = true;
  }

  // dates.space.init (nur wenn nicht Platzhalter)
  const init = loc.dates?.['space.init'];
  if (init && init !== PLACEHOLDER_INIT && !entry.dates?.['space.init']) {
    entry.dates = { 'space.init': init };
    changed = true;
  }

  if (Object.keys(entry).length > 0) {
    existing[id] = entry;
    if (changed) added++;
  } else {
    skipped++;
  }
}

// Sortiert nach ID für lesbare Diffs
const sorted = Object.fromEntries(
  Object.entries(existing).sort((a, b) => Number(a[0]) - Number(b[0]))
);

writeFileSync(enrichmentPath, JSON.stringify(sorted, null, 2) + '\n', 'utf8');

console.log(`✅ loc-enrichment.json geschrieben`);
console.log(`   Einträge gesamt: ${Object.keys(sorted).length}`);
console.log(`   Neu extrahiert:  ${added}`);
console.log(`   Ohne Daten:      ${skipped}`);
console.log('');
console.log('Felder in loc-enrichment.json:');
const fieldCounts = {};
for (const entry of Object.values(sorted)) {
  for (const k of Object.keys(entry)) {
    fieldCounts[k] = (fieldCounts[k] || 0) + 1;
  }
}
for (const [k, n] of Object.entries(fieldCounts)) {
  console.log(`   ${k.padEnd(12)} ${n} Spaces`);
}
