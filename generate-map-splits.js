// generate-map-splits.js
// Erzeugt /data/spaces-{code}.json pro Land aus locations.json.
// Läuft in CI (deploy.yml) und lokal via: node generate-map-splits.js
//
// Ausgabe-Dateien (in .gitignore, werden bei jedem Deploy neu hochgeladen):
//   data/markers.json     → alle Spaces, nur Marker-Felder (Stage 1 – sofortiges Rendering)
//   data/spaces-de.json   → nur Deutschland, vollständige Daten (Stage 1 mit URL-Split)
//   data/spaces-at.json   → nur Österreich, vollständige Daten
//   data/spaces-all.json  → alle, vollständig (Stage 2 – Anreicherung)
//   data/splits-manifest.json → Metadaten

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Koordinaten auf 4 Dezimalstellen runden (~11 m Genauigkeit, ausreichend für Pins)
const round4 = n => Math.round(n * 1e4) / 1e4;

// Ländername → ISO-Code (muss mit COUNTRY_CODES in config.js übereinstimmen)
const COUNTRY_CODES = {
  'Germany':     'de',
  'Austria':     'at',
  'Switzerland': 'ch',
  'France':      'fr',
  'Netherlands': 'nl',
  'Belgium':     'be',
  'Italy':       'it',
  'Spain':       'es',
  'Ukraine':     'ua',
  'Denmark':     'dk',
  'Poland':      'pl',
  'Luxembourg':  'lu',
};

const PLACEHOLDER_WEEKDAY = 9;
const PLACEHOLDER_INIT    = 20010000;

// enrichment.json einlesen (optional — Defaults für crawler-pflegbare Felder)
const enrichmentPath = path.join(__dirname, 'enrichment.json');
const enrichment = existsSync(enrichmentPath)
  ? JSON.parse(readFileSync(enrichmentPath, 'utf8'))
  : {};

/**
 * Reichert einen Location-Eintrag mit Daten aus enrichment.json an.
 * Regel: Echte Werte in locations.json gewinnen immer — enrichment füllt nur Lücken/Platzhalter.
 * @param {object} loc
 * @returns {object}
 */
function applyEnrichment(loc) {
  const e = enrichment[String(loc.ID)];
  if (!e) return loc;

  const out = { ...loc };

  if (e.workshops?.length && (!loc.workshops || loc.workshops.length === 0)) {
    out.workshops = e.workshops;
  }
  if (e.events && !loc.events) {
    out.events = e.events;
  }
  if (e.spaceapi?.endpoint && !loc.spaceapi?.endpoint) {
    out.spaceapi = e.spaceapi;
  }
  if (e.weekly && (!loc.weekly || (loc.weekly.weekday === PLACEHOLDER_WEEKDAY && loc.weekly.time === 0))) {
    out.weekly = e.weekly;
  }
  if (e.dates?.['space.init'] && loc.dates?.['space.init'] === PLACEHOLDER_INIT) {
    out.dates = { ...loc.dates, 'space.init': e.dates['space.init'] };
  }

  return out;
}

// Locations laden + anreichern
const locationsPath = path.join(__dirname, 'locations.json');
const rawLocations  = JSON.parse(readFileSync(locationsPath, 'utf8'));
const locations     = rawLocations.map(applyEnrichment);

const enrichedCount = locations.filter((loc, i) => loc !== rawLocations[i]).length;
if (enrichedCount > 0) {
  console.log(`ℹ️  enrichment.json: ${enrichedCount} Spaces angereichert`);
}

// Output-Verzeichnis anlegen
const outDir = path.join(__dirname, 'data');
mkdirSync(outDir, { recursive: true });

// ── Stage-1: Minimale Marker-Datei (alle Spaces, nur Felder für Marker + Basis-Popup) ──────────
// Enthält: ID, name, style, loc (lat/long/city/country), spaceapi.endpoint
// Nicht enthalten: link, workshops, weekly, dates, loc.street, loc.plz
// → Popup zeigt sofort Name + Stadt, Link + Workshops werden nach Stage-2 Anreicherung ergänzt

const markers = locations.map(loc => {
  const entry = {
    ID:    loc.ID,
    name:  loc.name,
    style: loc.style || '',
    loc: {
      lat:     round4(loc.loc.lat),
      long:    round4(loc.loc.long),
      city:    loc.loc.city,
      country: loc.loc.country,
    },
  };
  if (loc.spaceapi?.endpoint) {
    entry.spaceapi = { endpoint: loc.spaceapi.endpoint };
  }
  return entry;
});

writeFileSync(path.join(outDir, 'markers.json'), JSON.stringify(markers));
console.log(`✅ data/markers.json         (${markers.length} Einträge, Stage-1)`);

// ── Stage-1 (URL-Split): Pro-Land-Splits mit vollständigen Daten ──────────────────────────────

const byCode = new Map();
let skipped = 0;

for (const loc of locations) {
  const country = loc.loc?.country;
  const code = COUNTRY_CODES[country];
  if (!code) { skipped++; continue; }
  if (!byCode.has(code)) byCode.set(code, []);
  byCode.get(code).push(loc);
}

for (const [code, spaces] of byCode) {
  const outPath = path.join(outDir, `spaces-${code}.json`);
  writeFileSync(outPath, JSON.stringify(spaces));
  console.log(`✅ data/spaces-${code}.json  (${spaces.length} Spaces)`);
}

// ── Stage-2: Vollständiger Datensatz (Anreicherung im Hintergrund) ───────────────────────────

writeFileSync(path.join(outDir, 'spaces-all.json'), JSON.stringify(locations));
console.log(`✅ data/spaces-all.json      (${locations.length} Spaces, Stage-2)`);

// ── Manifest ─────────────────────────────────────────────────────────────────────────────────

const manifest = {
  generated:  new Date().toISOString(),
  total:      locations.length,
  skipped,
  countries:  Object.fromEntries(
    [...byCode.entries()].map(([code, spaces]) => [code, spaces.length])
  ),
};
writeFileSync(path.join(outDir, 'splits-manifest.json'), JSON.stringify(manifest, null, 2));
console.log(`✅ data/splits-manifest.json (${byCode.size} Länder)`);

if (skipped > 0) {
  console.warn(`⚠️  ${skipped} Einträge ohne bekannten Länder-Code übersprungen`);
}
