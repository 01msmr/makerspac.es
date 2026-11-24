// admin/spaces-lib.js — reine Logik der Space-Review-Seite (ADR-009); kein DOM, kein Netz → testbar mit node --test
//
// Formwerte je Eigenschaft: workshops = string[] · calendar/spaceapi = string (leer = keine) ·
// weekly = { day: ''|'0'..'6', time: ''|'HH:MM', init: ''|'YYYY-MM-DD' }

import {
  parseIssue, parseWorkshopIssue, parseCalendarIssue, parseWeeklyIssue,
  replaceEndpoint, replaceWorkshops, replaceEvents, replaceWeekly,
  formatWeekly, formatTime, formatEditDate, lockOf,
} from './admin-lib.js';
import { WORKSHOP_TYPES } from '../workshop-types.js';
import { applyEnrichment } from '../enrichment-merge.js';

export const PLACEHOLDER_INIT = 20010000;     // „keine Gründung bekannt“ in locations.json
export const IMPORTANT_THRESHOLD = 0.35;       // Eigenschaft bei mehr als 35 % der Spaces gefüllt → leer wird hervorgehoben

/** Eigenschaften in Anzeigereihenfolge; key = Art (Kind) */
export const FIELDS = [
  { key: 'workshops', label: 'Workshops', parse: parseWorkshopIssue, title: '[Workshop-Daten]', labels: ['workshop-data'], query: 'workshop-data' },
  { key: 'calendar', label: 'Kalender', parse: parseCalendarIssue, title: 'Kalenderlink:', labels: ['data-update'], query: 'data-update' },
  { key: 'spaceapi', label: 'SpaceAPI', parse: parseIssue, title: 'SpaceAPI:', labels: ['data-update'], query: 'data-update' },
  { key: 'weekly', label: 'Treffen', parse: parseWeeklyIssue, title: 'Treffen-Daten:', labels: ['weekly-data'], query: 'weekly-data' },
];
export const FIELD = Object.fromEntries(FIELDS.map(f => [f.key, f]));

const ymd = n => (n && n !== PLACEHOLDER_INIT ? formatEditDate(n) : '');
const emptyWeekly = () => ({ day: '', time: '', init: '' });

/** Formwert aus dem aktuellen Stand (locations.json + loc-enrichment.json, verschmolzen wie die Karte) */
export function currentValue(key, loc, enr) {
  const m = applyEnrichment(loc ?? {}, enr);
  switch (key) {
    case 'workshops': return [...(m.workshops ?? [])];
    case 'calendar': return m.events ?? '';
    case 'spaceapi': return m.spaceapi?.endpoint ?? '';
    case 'weekly': return {
      day: m.weekly && m.weekly.time ? String(m.weekly.weekday) : '',
      time: m.weekly && m.weekly.time ? formatTime(m.weekly.time) : '',
      init: ymd(loc?.dates?.['space.init']),
    };
    default: return null;
  }
}

/** Formwert aus einem geparsten Vorschlag */
export function proposalValue(key, p) {
  switch (key) {
    case 'workshops': return [...p.workshops];
    case 'calendar': return p.events;
    case 'spaceapi': return p.endpoint;
    case 'weekly': return {
      day: p.weekly ? String(p.weekly.weekday) : '',
      time: p.weekly?.time ? formatTime(p.weekly.time) : '',
      init: p.init !== undefined ? ymd(p.init) : '',
    };
    default: return null;
  }
}

export const isEmptyValue = (key, v) => key === 'workshops' ? !v.length : key === 'weekly' ? !v.day && !v.time && !v.init : !v;

export function sameValue(key, a, b) {
  if (key === 'workshops') return a.length === b.length && a.every(w => b.includes(w));
  if (key === 'weekly') return a.day === b.day && a.time === b.time && a.init === b.init;
  return a === b;
}

/** @returns {string|null} Fehlertext oder null */
export function validateValue(key, v, today = new Date().toISOString().slice(0, 10)) {
  if (key === 'workshops') return v.every(w => w in WORKSHOP_TYPES) ? null : 'Unbekannter Workshop-Typ';
  if (key === 'calendar' || key === 'spaceapi') return !v || (/^https?:\/\/\S+$/.test(v) && !v.includes('"')) ? null : 'Ungültige URL (http/https)';
  if (key === 'weekly') {
    if (!!v.day !== !!v.time) return 'Wochentag und Uhrzeit nur zusammen';
    if (v.init && (!/^\d{4}-\d{2}-\d{2}$/.test(v.init) || v.init < '1900-01-01' || v.init > today)) return 'Gründungsdatum ungültig';
    return null;
  }
  return null;
}

/** Text im Format von parseWeeklyInput: „Di 19:00, 2015-05-01“ */
export function weeklyTextOf(v) {
  const wk = v.day !== '' && v.time ? formatWeekly({ weekday: Number(v.day), time: Number(v.time.replace(':', '')) }) : '';
  return [wk, v.init].filter(Boolean).join(', ');
}

// ─── Gruppieren + Warteschlange ──────────────────────────────────────────

/**
 * Offene Issues (REST-Objekte) je Art → Map spaceId → { spaceId, proposals: {kind: parsed}, okCount }.
 * Nur Vorschläge ohne „ok“ gelten als offen (ok = wartet auf Übernehmen); je Art zählt der neueste.
 */
export function groupBySpace(issuesByKind) {
  const map = new Map();
  for (const f of FIELDS) {
    const parsed = (issuesByKind[f.key] ?? []).map(f.parse).filter(Boolean);
    for (const p of parsed) {
      const g = map.get(p.spaceId) ?? { spaceId: p.spaceId, proposals: {}, okCount: 0 };
      if (p.ok) g.okCount++;
      else if (!g.proposals[f.key] || p.number > g.proposals[f.key].number) g.proposals[f.key] = p;
      map.set(p.spaceId, g);
    }
  }
  return map;
}

/**
 * Reihenfolge der Spaces: mit offenen Vorschlägen (in `mode`: nur Spaces mit Vorschlag für diese Eigenschaft),
 * viele Vorschläge zuerst, dann nach ID; „später“ verschobene danach (in der Reihenfolge des Verschiebens);
 * ganz am Ende Spaces, die gerade ein anderer Prüfer bearbeitet (`locked`).
 * @param {Map} groups @param {string[]} later spaceIds, älteste zuerst @param {string} mode 'all' | Eigenschaft
 * @param {Set<number>} [locked] spaceIds in Bearbeitung durch andere
 */
export function buildQueue(groups, later = [], mode = 'all', locked = new Set()) {
  const open = [...groups.values()].filter(g => (mode === 'all' ? Object.keys(g.proposals).length : g.proposals[mode]));
  const rank = id => later.indexOf(id);
  const free = open.filter(g => !locked.has(g.spaceId));
  const fresh = free.filter(g => rank(g.spaceId) < 0).sort((a, b) => Object.keys(b.proposals).length - Object.keys(a.proposals).length || a.spaceId - b.spaceId);
  const late = free.filter(g => rank(g.spaceId) >= 0).sort((a, b) => rank(a.spaceId) - rank(b.spaceId));
  const busy = open.filter(g => locked.has(g.spaceId)).sort((a, b) => a.spaceId - b.spaceId);
  return [...fresh, ...late, ...busy].map(g => g.spaceId);
}

/** Bearbeitet ein anderer Prüfer diesen Space? (irgendein offener Vorschlag zugewiesen + frisch) @returns {{by:string, minutes:number}|null} */
export function spaceLock(group, me, now = Date.now()) {
  for (const p of Object.values(group?.proposals ?? {})) { const l = lockOf(p, me, now); if (l) return l; }
  return null;
}

/** spaceIds, die gerade ein anderer Prüfer bearbeitet */
export function lockedSpaces(groups, me, now = Date.now()) {
  return new Set([...groups.values()].filter(g => spaceLock(g, me, now)).map(g => g.spaceId));
}

/** Anteil der Spaces mit gefülltem Feld je Eigenschaft (aus loc-enrichment.json + locations.json) */
export function fillRates(locations, enrichment) {
  const n = locations.length || 1;
  const c = { workshops: 0, calendar: 0, spaceapi: 0, weekly: 0 };
  for (const l of locations) {
    const e = enrichment[String(l.ID)] ?? {};
    if (e.workshops?.length) c.workshops++;
    if (e.events) c.calendar++;
    if (e.spaceapi?.endpoint) c.spaceapi++;
    if (e.weekly?.time) c.weekly++;
  }
  return Object.fromEntries(Object.entries(c).map(([k, v]) => [k, v / n]));
}

/** leere Eigenschaft hervorheben? nur wenn sie bei vielen Spaces gefüllt ist (statistisch „wichtig“) */
export const isImportantEmpty = (key, value, rates) => isEmptyValue(key, value) && (rates[key] ?? 0) > IMPORTANT_THRESHOLD;

// ─── Entscheidung → GitHub-Aktionen ────────────────────────────────────────

/** Body eines neuen Issues im selben Format wie die Crawler-Issues (Apply-Skripte + Parser greifen unverändert) */
export function newIssueBody(key, space, value, replace) {
  const head = `**ID:** ${space.id}\n**Website:** ${space.website || '–'}\n\n_Im Admin (Space-Review) angelegt._\n\n`;
  const block = o => '```json\n' + o + '\n```';
  if (key === 'spaceapi') return replaceEndpoint(head + block('{}'), value);
  if (key === 'calendar') return replaceEvents(head + block('{"events": ""}'), value, replace);
  if (key === 'workshops') return replaceWorkshops(head + block('"workshops": []'), value, replace);
  if (key === 'weekly') return replaceWeekly(head + block('{}'), weeklyTextOf(value));
  return null;
}

/** Body eines bestehenden Vorschlags mit geänderter Eingabe; null = ungültig */
export function editedBody(key, body, value, replace) {
  if (key === 'spaceapi') return replaceEndpoint(body, value);
  if (key === 'calendar') return replaceEvents(body, value, replace);
  if (key === 'workshops') return replaceWorkshops(body, value, replace);
  if (key === 'weekly') return replaceWeekly(body, weeklyTextOf(value));
  return null;
}

/**
 * Plan für die Entscheidung eines Space.
 * @param {{id:number,name:string,website:string,proposals:object,current:object}} space  current = Formwerte je Art
 * @param {{key:string, enabled:boolean, include:boolean, value:any}[]} rows  enabled=false (Radio-Leiste) → unberührt
 * @param {Record<string,string>} bodies Bodys der offenen Issues (nach Nummer) — für „geändert?“ und Undo
 * @returns {{actions: object[], errors: string[]}}
 *   action: {type:'ok'|'reject'|'create', key, number?, body?, title?, labels?, prevBody?}
 */
export function planDecision(space, rows, bodies = {}) {
  const actions = [], errors = [];
  for (const r of rows) {
    if (!r.enabled) continue;
    const f = FIELD[r.key], p = space.proposals[r.key], cur = space.current[r.key];
    const err = validateValue(r.key, r.value);
    if (p) {
      if (!r.include) { actions.push({ type: 'reject', key: r.key, number: p.number }); continue; }
      if (err) { errors.push(`${f.label}: ${err}`); continue; }
      if (r.key === 'workshops' && !r.value.length && isEmptyValue('workshops', cur)) {   // kein Typ + nichts vorhanden → nichts zu übernehmen
        actions.push({ type: 'reject', key: r.key, number: p.number }); continue;
      }
      const changed = !sameValue(r.key, r.value, proposalValue(r.key, p));
      const replace = !isEmptyValue(r.key, cur);
      if (!changed) { actions.push({ type: 'ok', key: r.key, number: p.number }); continue; }
      const body = editedBody(r.key, bodies[p.number] ?? '', r.value, replace);
      if (!body) { errors.push(`${f.label}: Eingabe konnte nicht in das Issue geschrieben werden`); continue; }
      actions.push({ type: 'ok', key: r.key, number: p.number, body, prevBody: bodies[p.number] ?? '' });
    } else if (r.include && !sameValue(r.key, r.value, cur)) {
      if (err) { errors.push(`${f.label}: ${err}`); continue; }
      if (isEmptyValue(r.key, r.value) && r.key !== 'workshops' && r.key !== 'calendar') { errors.push(`${f.label}: Entfernen nur bei Workshops/Kalender`); continue; }
      const replace = !isEmptyValue(r.key, cur);
      const body = newIssueBody(r.key, space, r.value, replace);
      if (!body) { errors.push(`${f.label}: neues Issue konnte nicht erzeugt werden`); continue; }
      actions.push({ type: 'create', key: r.key, title: `${f.title} ${space.name}`, body, labels: [...f.labels, 'ok'] });
    }
  }
  return { actions, errors };
}

/** Umkehraktion für Rückgängig (GitHub-Seite) */
export function undoStep(a) {
  if (a.type === 'ok') return { op: 'unok', number: a.number, prevBody: a.prevBody };
  if (a.type === 'reject') return { op: 'reopen', number: a.number };
  return { op: 'close-created', number: a.createdNumber };
}
