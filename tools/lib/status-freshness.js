// tools/lib/status-freshness.js — Alters-Regel für Status-Quellen (pure; getestet). Siehe ADR-010.
//
// Regel (global, nicht je Space): ein „offen“ gilt nur, wenn der Sende-/Zeitstempel der Quelle jünger als STATUS_MAX_AGE_HOURS ist
// (24 h); sonst wird der gesendete Wert verworfen → unbekannt. „Geschlossen“ wird nie verworfen (lange geschlossen ist normal).
// Der Cron prüft bei jedem Lauf neu: ist der Zeitstempel wieder jünger als 24 h, gilt „offen“ wieder.
//
// 1) Quelle liefert einen absoluten Zeitstempel (SpaceAPI state.lastchange, ThingSpeak created_at, Hamburg-Datum) → direkt prüfen, OHNE Gedächtnis.
// 2) Nur wo das unumgänglich ist (offen, aber KEIN Zeitstempel): Gedächtnis = die letzten ZWEI Signaturen mit Erstsehen-Zeitpunkt
//    (Last-Modified-Header bzw. Prüfsumme des Inhalts). Unverändert seit > 24 h → unbekannt. Das Gedächtnis ist NICHT öffentlich
//    (Actions-Cache, nie in status.json oder im Repo).

import { createHash } from 'node:crypto';
import { STATUS_MAX_AGE_HOURS } from './status-adapters.js';

const HOUR = 3600e3;

/**
 * Absoluter Zeitstempel der Quelle (UTC-ms) oder null: SpaceAPI `state.lastchange` (Unix-Sekunden), ThingSpeak `created_at` (ISO).
 * Unplausibles (vor 2001, > 1 Tag in der Zukunft) → null.
 */
export function extractSignalTime(text, now = Date.now()) {
  let data;
  try { data = JSON.parse(String(text).trim()); } catch { return null; }
  let ms = null;
  const lc = data?.state?.lastchange;
  if (lc !== undefined && lc !== null && lc !== '' && Number.isFinite(Number(lc))) { const n = Number(lc); ms = n > 1e12 ? n : n * 1000; }
  else if (typeof data?.created_at === 'string') { const t = Date.parse(data.created_at); if (Number.isFinite(t)) ms = t; }
  if (ms === null || ms < Date.parse('2001-01-01T00:00:00Z') || ms > now + 24 * HOUR) return null;
  return ms;
}

/** „Offen“ mit zu altem Zeitstempel → unbekannt; alles andere unverändert */
export function applyOpenAgeRule(status, signalMs, now = Date.now(), maxAgeHours = STATUS_MAX_AGE_HOURS) {
  if (status !== true || signalMs === null || signalMs === undefined) return { status };
  const ageHours = Math.round((now - signalMs) / HOUR * 10) / 10;
  return ageHours > maxAgeHours ? { status: null, reason: `offen, Zeitstempel zu alt (${Math.round(ageHours)} h > ${maxAgeHours} h)` } : { status, ageHours };
}

/** Signatur ohne absoluten Zeitstempel: Last-Modified-Header, sonst Prüfsumme des Inhalts */
export function signatureOf(text, lastModified = '') {
  return lastModified ? `lm:${lastModified}` : `body:${createHash('sha1').update(String(text)).digest('hex').slice(0, 16)}`;
}

/**
 * Gedächtnis eines Space: nur die letzten zwei Signaturen (jeweils mit Erstsehen-Zeitpunkt).
 * @param {{last:{sig:string,seenAt:number}, prev:{sig:string,seenAt:number}|null}|undefined} entry
 * @returns {{last:{sig:string,seenAt:number}, prev:{sig:string,seenAt:number}|null}}
 */
export function updateMemory(entry, sig, now = Date.now()) {
  if (!entry?.last) return { last: { sig, seenAt: now }, prev: null };
  if (entry.last.sig === sig) return entry;   // unverändert: Erstsehen bleibt
  return { last: { sig, seenAt: now }, prev: entry.last };
}

/** „Offen“ ohne Zeitstempel, Signatur seit > 24 h unverändert → unbekannt */
export function applyMemoryRule(status, entry, now = Date.now(), maxAgeHours = STATUS_MAX_AGE_HOURS) {
  if (status !== true || !entry?.last) return { status };
  const hours = Math.round((now - entry.last.seenAt) / HOUR * 10) / 10;
  return hours > maxAgeHours ? { status: null, reason: `offen, Antwort seit ${Math.round(hours)} h unverändert (> ${maxAgeHours} h)` } : { status, ageHours: hours };
}

/**
 * Ganze Entscheidung für eine Quelle.
 * @param {{status:boolean|null, text:string, lastModified?:string, adapterUsed?:boolean}} src  status = bereits geparster Wert
 * @param {Record<string, object>} memory  Gedächtnis aller Spaces (wird für `key` fortgeschrieben, nur wo unumgänglich)
 * @returns {{status:boolean|null, reason?:string}}
 */
export function decideFreshness({ status, text, lastModified = '', signalMs = undefined }, memory, key, now = Date.now()) {
  if (status !== true) { delete memory[key]; return { status }; }              // nur „offen“ wird geprüft; kein Gedächtnis nötig
  const signal = signalMs !== undefined ? signalMs : extractSignalTime(text, now);
  if (signal !== null) { delete memory[key]; return applyOpenAgeRule(status, signal, now); }   // absoluter Zeitstempel → ohne Gedächtnis
  memory[key] = updateMemory(memory[key], signatureOf(text, lastModified), now);               // unumgänglich: Gedächtnis (2 Signaturen)
  return applyMemoryRule(status, memory[key], now);
}
