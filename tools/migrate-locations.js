// tools/migrate-locations.js
// Einmalige Migration: entfernt enrichable Felder aus locations.json.
// Voraussetzung: tools/generate-enrichment.js wurde bereits ausgeführt.
//
// Felder die entfernt werden: workshops, events, spaceapi, weekly
// Felder die bleiben: ID, name, loc, style, link, dates
//
// Usage: node tools/migrate-locations.js

import { readFileSync, writeFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const locPath = path.join(root, 'locations.json');

const STRIP = ['workshops', 'events', 'spaceapi', 'weekly'];

const locs = JSON.parse(readFileSync(locPath, 'utf8'));

const stripped = locs.map(loc => {
  const out = {};
  for (const [k, v] of Object.entries(loc)) {
    if (!STRIP.includes(k)) out[k] = v;
  }
  return out;
});

writeFileSync(locPath, JSON.stringify(stripped, null, 2) + '\n', 'utf8');

console.log('Stripped from locations.json:', STRIP.join(', '));
console.log('Entries processed:', stripped.length);
