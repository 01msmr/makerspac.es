// tests/validate-locations.js
// Validiert locations.json gegen ein definiertes Schema (keine externen Abhängigkeiten)
// Läuft mit: node tests/validate-locations.js
// Oder als Teil von: npm run validate

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
import { WORKSHOP_TYPES } from '../workshop-types.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const locationsPath = path.join(__dirname, '..', 'locations.json');

// ─── Erlaubte Werte ───────────────────────────────────────────────────────

const VALID_STYLES = new Set([
  'for all', 'for youth', 'for students', 'commercial',
  // Übergangs-Werte (akzeptiert, aber deprecated)
  'for students & youth', 'for students // commercial', 'unknown',
]);

// Direkt aus workshop-types.js — bleibt automatisch synchron
const VALID_WORKSHOPS = new Set(Object.keys(WORKSHOP_TYPES));

// Grobe Bounding Box für Europa + Ukraine
const LAT_MIN = 34, LAT_MAX = 72;
const LONG_MIN = -11, LONG_MAX = 45;

// ─── Validator ────────────────────────────────────────────────────────────

function validateEntry(entry, index) {
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

  // spaceapi (optional)
  if (entry.spaceapi !== undefined) {
    const ep = entry.spaceapi?.endpoint;
    if (typeof ep !== 'string') {
      errors.push(`${loc}: "spaceapi.endpoint" fehlt oder ist kein String`);
    } else if (ep !== '' && !ep.startsWith('http')) {
      // Leerer String "" wird als "kein SpaceAPI" akzeptiert (Altdaten)
      errors.push(`${loc}: "spaceapi.endpoint" ist keine gültige URL ("${ep}")`);
    }
  }

  // workshops (optional, aber wenn vorhanden muss es ein Array gültiger Keys sein)
  if (entry.workshops !== undefined) {
    if (!Array.isArray(entry.workshops)) {
      errors.push(`${loc}: "workshops" muss ein Array sein`);
    } else {
      for (const w of entry.workshops) {
        if (!VALID_WORKSHOPS.has(w)) {
          errors.push(`${loc}: "workshops" enthält ungültigen Wert "${w}"`);
        }
      }
    }
  }

  // weekly (optional)
  if (entry.weekly !== undefined) {
    const { weekday, time } = entry.weekly;
    if (weekday !== undefined && !Number.isInteger(weekday)) {
      errors.push(`${loc}: "weekly.weekday" muss eine ganze Zahl sein (ist: ${JSON.stringify(weekday)})`);
    }
    if (weekday !== undefined && (weekday < 0 || weekday > 9)) {
      errors.push(`${loc}: "weekly.weekday" muss zwischen 0–6 (Wochentag) oder 9 (kein Treffen) liegen`);
    }
    if (time !== undefined && !Number.isInteger(time)) {
      errors.push(`${loc}: "weekly.time" muss eine ganze Zahl sein (HHMM-Format, ist: ${JSON.stringify(time)})`);
    }
  }

  return errors;
}

// ─── Hauptlogik ───────────────────────────────────────────────────────────

let locations;
try {
  locations = JSON.parse(readFileSync(locationsPath, 'utf8'));
} catch (e) {
  console.error(`❌ locations.json konnte nicht gelesen werden: ${e.message}`);
  process.exit(1);
}

if (!Array.isArray(locations)) {
  console.error('❌ locations.json ist kein Array');
  process.exit(1);
}

const allErrors = [];

// Eindeutigkeit der IDs prüfen
const idMap = new Map();
for (let i = 0; i < locations.length; i++) {
  const id = locations[i]?.ID;
  if (id !== undefined) {
    if (idMap.has(id)) {
      allErrors.push(`[${i}] Doppelte ID ${id} (erste Verwendung bei Index ${idMap.get(id)})`);
    } else {
      idMap.set(id, i);
    }
  }
}

// Jedes Entry validieren
for (let i = 0; i < locations.length; i++) {
  const errors = validateEntry(locations[i], i);
  allErrors.push(...errors);
}

// ─── Ergebnis ─────────────────────────────────────────────────────────────

if (allErrors.length === 0) {
  console.log(`✅ locations.json ist valide (${locations.length} Einträge geprüft)`);
  process.exit(0);
} else {
  console.error(`❌ ${allErrors.length} Fehler in locations.json gefunden:\n`);
  allErrors.forEach(e => console.error(`  • ${e}`));
  process.exit(1);
}
