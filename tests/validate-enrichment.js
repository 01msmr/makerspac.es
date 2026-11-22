// tests/validate-enrichment.js
// Validiert loc-enrichment.json (die Datei, in die alle Bots/Apply-Workflows schreiben) — keine externen Abhängigkeiten.
// Läuft mit: node tests/validate-enrichment.js   (auch Teil von: npm run validate)

import { readFileSync } from 'fs';
import { fileURLToPath, pathToFileURL } from 'url';
import path from 'path';
import { WORKSHOP_TYPES } from '../workshop-types.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

const ALLOWED_FIELDS = new Set(['workshops', 'events', 'spaceapi', 'weekly', 'dates']);

/** true bei einer http(s)-URL ohne Leerzeichen (z. B. „https: //x“ ist ungültig) */
export function isHttpUrl(value) {
  if (typeof value !== 'string' || /\s/.test(value)) return false;
  try { const u = new URL(value); return u.protocol === 'http:' || u.protocol === 'https:'; } catch { return false; }
}

/**
 * @param {Record<string, any>} enrichment  Inhalt von loc-enrichment.json
 * @param {Set<number>} locationIds         IDs aus locations.json
 * @returns {string[]} Fehlermeldungen (leer = valide)
 */
export function validateEnrichment(enrichment, locationIds) {
  const errors = [];
  if (!enrichment || typeof enrichment !== 'object' || Array.isArray(enrichment)) return ['Wurzel muss ein Objekt sein'];

  for (const [id, entry] of Object.entries(enrichment)) {
    const at = `ID ${id}`;
    if (!/^\d+$/.test(id)) { errors.push(`${at}: Schlüssel ist keine Zahl`); continue; }
    if (!locationIds.has(Number(id))) errors.push(`${at}: nicht in locations.json vorhanden`);
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) { errors.push(`${at}: Eintrag muss ein Objekt sein`); continue; }

    for (const field of Object.keys(entry)) {
      if (!ALLOWED_FIELDS.has(field)) errors.push(`${at}: unbekanntes Feld "${field}"`);
    }

    if (entry.workshops !== undefined) {
      const w = entry.workshops;
      if (!Array.isArray(w) || w.length === 0) errors.push(`${at}: "workshops" muss ein nicht-leeres Array sein`);
      else {
        for (const k of w) if (!(k in WORKSHOP_TYPES)) errors.push(`${at}: unbekannter Workshop-Typ "${k}"`);
        if (new Set(w).size !== w.length) errors.push(`${at}: "workshops" enthält Duplikate`);
      }
    }

    if (entry.events !== undefined && !isHttpUrl(entry.events)) {
      errors.push(`${at}: "events" ist keine gültige http(s)-URL ("${entry.events}")`);
    }

    if (entry.spaceapi !== undefined) {
      const s = entry.spaceapi;
      if (!s || typeof s !== 'object' || !isHttpUrl(s.endpoint)) errors.push(`${at}: "spaceapi.endpoint" ist keine gültige http(s)-URL`);
    }

    if (entry.weekly !== undefined) {
      const { weekday, time } = entry.weekly ?? {};
      // weekday 1–7, 9 = Platzhalter (siehe architektur.md); time = HHMM
      if (!Number.isInteger(weekday) || !((weekday >= 1 && weekday <= 7) || weekday === 9)) errors.push(`${at}: "weekly.weekday" muss 1–7 (oder 9) sein`);
      if (!Number.isInteger(time) || time < 0 || time > 2359 || time % 100 > 59) errors.push(`${at}: "weekly.time" muss HHMM (0–2359) sein`);
    }

    if (entry.dates !== undefined && (typeof entry.dates !== 'object' || entry.dates === null || Array.isArray(entry.dates))) {
      errors.push(`${at}: "dates" muss ein Objekt sein`);
    }
  }
  return errors;
}

/**
 * Wendet Änderungen {id, field, value} auf eine KOPIE an und prüft das Ergebnis — vor dem Schreiben der Datei
 * und vor dem Schließen von Issues (sonst gehen Vorschläge verloren, wenn die Daten ungültig wären).
 * @returns {string[]} Fehlermeldungen
 */
export function validateAfterPatch(enrichment, patches, locationIds) {
  const preview = structuredClone(enrichment);
  for (const { id, field, value } of patches) (preview[String(id)] ??= {})[field] = value;
  return validateEnrichment(preview, locationIds);
}

/**
 * Prüft EINEN Vorschlag isoliert: nur Fehler, die diese ID betreffen (vorhandene Fehler anderer Spaces blockieren nicht).
 * @returns {string[]}
 */
export function validateProposal(enrichment, id, field, value, locationIds) {
  return validateAfterPatch(enrichment, [{ id, field, value }], locationIds).filter(e => e.startsWith(`ID ${id}:`));
}

/** Kommentar-Text, wenn ein Vorschlag nicht übernommen werden kann */
export function rejectionComment(errors) {
  return `Nicht übernommen — die Daten wären ungültig:\n\n${errors.map(e => `- ${e}`).join('\n')}\n\nDas Label \`ok\` wurde entfernt. Bitte im Admin-Review korrigieren oder ablehnen.`;
}

function main() {
  const enrichment = JSON.parse(readFileSync(path.join(ROOT, 'loc-enrichment.json'), 'utf8'));
  const locations = JSON.parse(readFileSync(path.join(ROOT, 'locations.json'), 'utf8'));
  const errors = validateEnrichment(enrichment, new Set(locations.map(l => l.ID)));
  if (errors.length) {
    console.error(`❌ loc-enrichment.json: ${errors.length} Fehler`);
    for (const e of errors) console.error('  - ' + e);
    process.exit(1);
  }
  console.log(`✅ loc-enrichment.json ist valide (${Object.keys(enrichment).length} Einträge geprüft)`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
