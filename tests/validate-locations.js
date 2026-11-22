// tests/validate-locations.js
// Validiert locations.json gegen ein definiertes Schema (keine externen Abhängigkeiten).
// locations.json enthält NUR Grunddaten (ID, name, loc, style, link, dates); Zusatzdaten (Workshops, Kalender, SpaceAPI,
// Weekly) gehören in loc-enrichment.json und sind hier ein Fehler (siehe adr/008).
// Läuft mit: node tests/validate-locations.js
// Oder als Teil von: npm run validate

import { readFileSync } from 'fs';
import { fileURLToPath, pathToFileURL } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const locationsPath = path.join(__dirname, '..', 'locations.json');

// ─── Erlaubte Werte ───────────────────────────────────────────────────────

const VALID_STYLES = new Set([
  'for all', 'for youth', 'for students', 'commercial',
  // Übergangs-Werte (akzeptiert, aber deprecated)
  'for students & youth', 'for students // commercial', 'unknown',
]);

// Erlaubte Top-Level-Felder (alles andere gehört ins Enrichment bzw. ist unbekannt)
const ALLOWED_FIELDS = new Set(['name', 'ID', 'loc', 'style', 'link', 'dates']);
const ENRICHMENT_FIELDS = new Set(['workshops', 'events', 'spaceapi', 'weekly']);
// dates: space.init (Gründung, optional, 20010000 = unbekannt) · space.edited.latest (zuletzt bearbeitet, Pflicht), beide YYYYMMDD
const PLACEHOLDER_INIT = 20010000;
const LEGACY_DATE_KEYS = { 'datacheck.latest': 'space.edited.latest', init: 'space.init' };

/** YYYYMMDD als echtes Datum (ganze Zahl, 8 Ziffern) */
export function isValidDate(n) {
  if (!Number.isInteger(n) || String(n).length !== 8) return false;
  const s = String(n), y = +s.slice(0, 4), m = +s.slice(4, 6), d = +s.slice(6);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

// Grobe Bounding Box für Europa + Ukraine
const LAT_MIN = 34, LAT_MAX = 72;
const LONG_MIN = -11, LONG_MAX = 45;

// ─── Validator ────────────────────────────────────────────────────────────

export function validateEntry(entry, index) {
  const errors = [];
  const loc = `[${index}] "${entry?.name ?? '(no name)'}" (ID: ${entry?.ID ?? '?'})`;

  // name
  if (typeof entry.name !== 'string' || !entry.name.trim()) {
    errors.push(`${loc}: "name" fehlt oder ist kein String`);
  }

  // ID
  if (!Number.isInteger(entry.ID) || entry.ID <= 0) {
    errors.push(`${loc}: "ID" muss eine positive ganze Zahl sein (ist: ${JSON.stringify(entry.ID)})`);
  }

  // loc
  if (!entry.loc || typeof entry.loc !== 'object') {
    errors.push(`${loc}: "loc" fehlt oder ist kein Objekt`);
  } else {
    const { lat, long, city, country, plz } = entry.loc;

    if (typeof lat !== 'number' || isNaN(lat)) {
      errors.push(`${loc}: "loc.lat" muss eine Zahl sein (ist: ${JSON.stringify(lat)})`);
    } else if (lat < LAT_MIN || lat > LAT_MAX) {
      errors.push(`${loc}: "loc.lat" außerhalb des gültigen Bereichs [${LAT_MIN}, ${LAT_MAX}] (ist: ${lat})`);
    }

    if (typeof long !== 'number' || isNaN(long)) {
      errors.push(`${loc}: "loc.long" muss eine Zahl sein (ist: ${JSON.stringify(long)})`);
    } else if (long < LONG_MIN || long > LONG_MAX) {
      errors.push(`${loc}: "loc.long" außerhalb des gültigen Bereichs [${LONG_MIN}, ${LONG_MAX}] (ist: ${long})`);
    }

    if (typeof city !== 'string' || !city.trim() || city === 'CITY_CITY') {
      errors.push(`${loc}: "loc.city" fehlt, ist leer oder ist ein Platzhalter`);
    }

    if (typeof country !== 'string' || !country.trim() || country === 'COUNTRY_COUNTRY') {
      errors.push(`${loc}: "loc.country" fehlt, ist leer oder ist ein Platzhalter`);
    }

    if (plz !== undefined && plz !== null && typeof plz !== 'number' && typeof plz !== 'string') {
      errors.push(`${loc}: "loc.plz" muss eine Zahl oder ein String sein (ist: ${JSON.stringify(plz)})`);
    }
  }

  // style
  if (typeof entry.style !== 'string' || !entry.style.trim()) {
    errors.push(`${loc}: "style" fehlt oder ist kein String`);
  } else if (!VALID_STYLES.has(entry.style)) {
    errors.push(`${loc}: "style" hat ungültigen Wert "${entry.style}"`);
  }

  // link (optional, aber wenn vorhanden muss url ein String sein)
  if (entry.link !== undefined) {
    if (typeof entry.link !== 'object' || entry.link === null) {
      errors.push(`${loc}: "link" muss ein Objekt sein`);
    } else if (entry.link.url && typeof entry.link.url !== 'string') {
      errors.push(`${loc}: "link.url" muss ein String sein`);
    }
  }

  // dates: space.edited.latest (Pflicht) · space.init (optional) — nur diese beiden Schlüssel
  if (!entry.dates || typeof entry.dates !== 'object' || Array.isArray(entry.dates)) {
    errors.push(`${loc}: "dates" fehlt oder ist kein Objekt`);
  } else {
    const d = entry.dates;
    if (!isValidDate(d['space.edited.latest'])) {
      errors.push(`${loc}: "dates.space.edited.latest" fehlt oder ist kein gültiges Datum YYYYMMDD (ist: ${JSON.stringify(d['space.edited.latest'])})`);
    }
    if (d['space.init'] !== undefined && d['space.init'] !== PLACEHOLDER_INIT && !isValidDate(d['space.init'])) {
      errors.push(`${loc}: "dates.space.init" ist kein gültiges Datum YYYYMMDD (ist: ${JSON.stringify(d['space.init'])}; ${PLACEHOLDER_INIT} = unbekannt)`);
    }
    for (const k of Object.keys(d)) {
      if (k === 'space.init' || k === 'space.edited.latest') continue;
      errors.push(LEGACY_DATE_KEYS[k]
        ? `${loc}: "dates.${k}" ist veraltet — verwende "dates.${LEGACY_DATE_KEYS[k]}"`
        : `${loc}: unbekannter Schlüssel "dates.${k}"`);
    }
  }

  // Zusatzdaten gehören ins Enrichment, unbekannte Felder sind Fehler
  for (const k of Object.keys(entry)) {
    if (ALLOWED_FIELDS.has(k)) continue;
    errors.push(ENRICHMENT_FIELDS.has(k)
      ? `${loc}: "${k}" gehört in loc-enrichment.json (locations.json enthält nur Grunddaten)`
      : `${loc}: unbekanntes Feld "${k}"`);
  }

  return errors;
}

/** @returns {string[]} alle Fehler (leer = valide) */
export function validateLocations(locations) {
  if (!Array.isArray(locations)) return ['locations.json ist kein Array'];
  const allErrors = [];
  // Eindeutigkeit der IDs prüfen
  const idMap = new Map();
  for (let i = 0; i < locations.length; i++) {
    const id = locations[i]?.ID;
    if (id !== undefined) {
      if (idMap.has(id)) allErrors.push(`[${i}] Doppelte ID ${id} (erste Verwendung bei Index ${idMap.get(id)})`);
      else idMap.set(id, i);
    }
  }
  // Jedes Entry validieren
  for (let i = 0; i < locations.length; i++) allErrors.push(...validateEntry(locations[i], i));
  return allErrors;
}

// ─── Hauptlogik (nur bei direktem Aufruf) ─────────────────────────────────

function main() {
  let locations;
  try {
    locations = JSON.parse(readFileSync(locationsPath, 'utf8'));
  } catch (e) {
    console.error(`❌ locations.json konnte nicht gelesen werden: ${e.message}`);
    process.exit(1);
  }
  const allErrors = validateLocations(locations);
  if (allErrors.length === 0) {
    console.log(`✅ locations.json ist valide (${locations.length} Einträge geprüft)`);
    process.exit(0);
  }
  console.error(`❌ ${allErrors.length} Fehler in locations.json gefunden:\n`);
  allErrors.forEach(e => console.error(`  • ${e}`));
  process.exit(1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
