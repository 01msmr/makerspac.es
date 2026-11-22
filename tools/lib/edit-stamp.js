// tools/lib/edit-stamp.js — setzt dates['space.edited.latest'] (YYYYMMDD, Berliner Datum, ohne Zeit).
// SSOT für Apply-Skripte und stamp-edit-date.yml (ADR-008).
import fs from 'fs';

/** Heutiges Datum in Berlin als YYYYMMDD (Zahl). */
export function berlinToday(now = new Date()) {
  return parseInt(new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Berlin' }).format(now).replace(/-/g, ''), 10);
}

/** Setzt space.edited.latest für die IDs (mutiert locations); gibt die Anzahl geänderter Einträge zurück. */
export function stampEntries(locations, ids, today = berlinToday()) {
  const set = new Set([...ids].map(Number));
  let n = 0;
  for (const loc of locations) {
    if (!set.has(loc.ID) || loc.dates?.['space.edited.latest'] === today) continue;
    loc.dates = { ...loc.dates, 'space.edited.latest': today };
    n++;
  }
  return n;
}

/** Liest/schreibt locations.json im vorhandenen Format (2 Spaces, Zeilenende wie vorher). Optional `inits`: Map id → space.init. */
export function stampLocationsFile(file, ids, today = berlinToday(), { inits } = {}) {
  const raw = fs.readFileSync(file, 'utf8');
  const locations = JSON.parse(raw);
  // optional: space.init je ID setzen (Map id → YYYYMMDD) — gleiche Datei, ein Schreibvorgang
  for (const loc of locations) if (inits?.has(loc.ID)) loc.dates = { ...loc.dates, 'space.init': inits.get(loc.ID) };
  let n = stampEntries(locations, [...ids, ...(inits?.keys() ?? [])], today);
  if (inits?.size && !n) n = inits.size;
  if (n) fs.writeFileSync(file, JSON.stringify(locations, null, 2) + (raw.endsWith('\n') ? '\n' : ''), 'utf8');
  return n;
}
