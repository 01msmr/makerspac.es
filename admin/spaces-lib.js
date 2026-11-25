// admin/spaces-lib.js — reine Logik der Space-Review-Seite (ADR-009); kein DOM, kein Netz → testbar mit node --test
//
// Formwerte je Eigenschaft: workshops = string[] · calendar/spaceapi = string (leer = keine) ·
// weekly = { day: ''|'0'..'6', time: ''|'HH:MM', init: ''|'YYYY-MM-DD' }

import {
  parseIssue, parseWorkshopIssue, parseCalendarIssue, parseWeeklyIssue,
  replaceEndpoint, replaceWorkshops, replaceEvents, replaceWeekly,
  formatWeekly, formatTime, formatEditDate, lockOf, detectFromText, parseWeeklyInput, looksLikeUrl,
} from './admin-lib.js';
import { WORKSHOP_TYPES } from '../workshop-types.js';
import { extractWeeklyCandidates, pickWeekly, extractInit, isInitPlaceholder } from '../tools/lib/weekly-extract.js';
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
      day: p.weekly === null ? 'none' : (p.weekly ? String(p.weekly.weekday) : ''),   // 'none' = „kein weekly“
      time: p.weekly?.time ? formatTime(p.weekly.time) : '',
      init: p.init !== undefined ? ymd(p.init) : '',
    };
    default: return null;
  }
}

/**
 * Formwert zur ANZEIGE eines Vorschlags. Beim Treffen enthält ein Vorschlag oft nur einen Teil (z. B. nur die Gründung):
 * die fehlenden Teile werden mit dem aktuellen Wert vorbelegt, damit nichts wie „entfernen“ aussieht. Nur Anzeige — geschrieben wird
 * ausschließlich, was der Vorschlag enthält oder was du änderst (siehe weeklyWriteValue).
 */
export function displayValue(key, p, current) {
  const v = proposalValue(key, p);
  if (key !== 'weekly') return v;
  const hasWk = p.weekly !== undefined, hasInit = p.init !== undefined;
  return { day: hasWk ? v.day : current.day, time: hasWk ? v.time : current.time, init: hasInit ? v.init : current.init };
}

/**
 * Welche Teile eines Treffen-Werts in das Issue geschrieben werden: nur die, die der Vorschlag schon enthält oder die du gegenüber
 * dem aktuellen Stand geändert hast. Bestehende Daten werden nie mit identischen Werten neu geschrieben.
 * @param {{day:string,time:string,init:string}} value @param {object|null} p Vorschlag (null = neues Issue) @param {{day:string,time:string,init:string}} current
 */
export function weeklyWriteValue(value, p, current) {
  const hasWk = p?.weekly !== undefined, hasInit = p?.init !== undefined;
  const wk = hasWk || value.day !== current.day || value.time !== current.time;
  const init = hasInit || value.init !== current.init;
  return { day: wk ? value.day : '', time: wk ? value.time : '', init: init ? value.init : '' };
}

/** Würde der Wert einen vorhandenen Teil entfernen? (Treffen: Termin ODER Gründung geleert; sonst: Wert geleert) */
export function removesExisting(key, value, current) {
  if (key === 'weekly') return !!((current.day || current.time) && !value.day && !value.time) || !!(current.init && !value.init);
  return !isEmptyValue(key, current) && isEmptyValue(key, value);
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
    if (v.day === 'none') return v.init && (!/^\d{4}-\d{2}-\d{2}$/.test(v.init) || v.init < '1900-01-01' || v.init > today) ? 'Gründungsdatum ungültig' : null;   // „kein weekly“: keine Uhrzeit nötig
    if (!!v.day !== !!v.time) return 'Wochentag und Uhrzeit nur zusammen';
    if (v.time && !/^\d{2}:(00|30)$/.test(v.time)) return 'Uhrzeit nur im 30-Minuten-Raster (:00 oder :30)';
    if (v.init && (!/^\d{4}-\d{2}-\d{2}$/.test(v.init) || v.init < '1900-01-01' || v.init > today)) return 'Gründungsdatum ungültig';
    return null;
  }
  return null;
}

/** Text im Format von parseWeeklyInput: „Di 19:00, 2015-05-01“ */
export function weeklyTextOf(v) {
  const wk = v.day === 'none' ? 'kein Weekly' : (v.day !== '' && v.time ? formatWeekly({ weekday: Number(v.day), time: Number(v.time.replace(':', '')) }) : '');
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
  for (let r of rows) {
    if (!r.enabled) continue;
    // „kein weekly“ ohne vorhandenes Treffen ist nichts zu tun
    if (r.key === 'weekly' && r.value.day === 'none' && !(space.current.weekly.day || space.current.weekly.time)) r = { ...r, value: { ...r.value, day: '', time: '' } };
    const f = FIELD[r.key], p = space.proposals[r.key], cur = space.current[r.key];
    const err = validateValue(r.key, r.value);
    if (p) {
      if (!r.include) { actions.push({ type: 'reject', key: r.key, number: p.number }); continue; }
      if (err) { errors.push(`${f.label}: ${err}`); continue; }
      if (r.key === 'workshops' && !r.value.length && isEmptyValue('workshops', cur)) {   // kein Typ + nichts vorhanden → nichts zu übernehmen
        actions.push({ type: 'reject', key: r.key, number: p.number }); continue;
      }
      const changed = !sameValue(r.key, r.value, displayValue(r.key, p, cur));
      const replace = !isEmptyValue(r.key, cur);
      if (!changed) { actions.push({ type: 'ok', key: r.key, number: p.number }); continue; }
      if (r.key !== 'workshops' && r.key !== 'calendar' && removesExisting(r.key, r.value, cur)) { errors.push(`${f.label}: Entfernen nur bei Workshops/Kalender`); continue; }
      const body = editedBody(r.key, bodies[p.number] ?? '', r.key === 'weekly' ? weeklyWriteValue(r.value, p, cur) : r.value, replace);
      if (!body) { errors.push(`${f.label}: Eingabe konnte nicht in das Issue geschrieben werden`); continue; }
      actions.push({ type: 'ok', key: r.key, number: p.number, body, prevBody: bodies[p.number] ?? '' });
    } else if (r.include && !sameValue(r.key, r.value, cur)) {
      if (err) { errors.push(`${f.label}: ${err}`); continue; }
      if (r.key !== 'workshops' && r.key !== 'calendar' && removesExisting(r.key, r.value, cur)) { errors.push(`${f.label}: Entfernen nur bei Workshops/Kalender`); continue; }
      const replace = !isEmptyValue(r.key, cur);
      const body = newIssueBody(r.key, space, r.key === 'weekly' ? weeklyWriteValue(r.value, null, cur) : r.value, replace);
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

// ─── Freitext → alle Eigenschaften ────────────────────────────────────────

export const TIME_STEP_MINUTES = 30;   // Treffen-Uhrzeit nur im 30-Minuten-Raster

/** „19:15“ → nächstes Raster („19:00“); bei Gleichstand der frühere Wert („19:45“ → „19:30“). */
export function snapTime(hhmm) {
  const m = String(hhmm).match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return '';
  const total = Math.min(23 * 60 + 30, Math.round((parseInt(m[1], 10) * 60 + parseInt(m[2], 10) - 0.01) / TIME_STEP_MINUTES) * TIME_STEP_MINUTES);
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

const CAL_RE = /(?:\.ics(?:[?#]|$)|^webcal:|calendar\.google\.com|\/apps\/calendar\/|\/public-calendars\/|meetup\.com\/|eventbrite\.|pretix|\/(?:calendar|kalender|termine|events)(?:[/?#]|$))/i;
const API_RE = /(?:spaceapi|\/status\.json(?:[?#]|$)|spacestatus\.)/i;

/** @returns {'calendar'|'spaceapi'|null} */
export function classifyUrl(u) {
  if (API_RE.test(u)) return 'spaceapi';
  if (CAL_RE.test(u)) return 'calendar';
  return null;
}

/**
 * Freitext (Zwischenablage, Website-Text, einzelne URLs) → erkannte Eigenschaften.
 * Workshops (Typen + Stichwörter), Treffen (Wochentag + Uhrzeit, 30-min-Raster), Gründung, Kalender-/SpaceAPI-URLs.
 * @returns {{workshops:string[], weekly:{day:string,time:string,confidence:string,source:string}|null,
 *   init:{value:string,confidence:string,source:string}|null, calendar:string, spaceapi:string, notes:string[]}}
 */
export function analyzeFreeText(text, now = new Date()) {
  const t = String(text ?? '');
  const out = { workshops: [], weekly: null, init: null, calendar: '', spaceapi: '', notes: [] };
  if (!t.trim()) return out;
  // URLs herauslösen (und aus dem Text für die Wort-Erkennung entfernen: „…/termine/“ ist kein Wochentag)
  const urls = [...t.matchAll(/(?:https?|webcal):\/\/[^\s<>"')\]]+/gi)].map(m => m[0].replace(/[.,;]+$/, ''));
  const prose = t.replace(/(?:https?|webcal):\/\/[^\s<>"')\]]+/gi, ' ');
  for (const u of urls) {
    const kind = classifyUrl(u), https = u.replace(/^webcal:/i, 'https:');
    if (kind === 'calendar' && !out.calendar) out.calendar = https;
    else if (kind === 'spaceapi' && !out.spaceapi) out.spaceapi = https;
  }
  if (looksLikeUrl(t.trim())) return out;   // nur eine URL → kein Text auszuwerten
  out.workshops = detectFromText(prose);
  // Treffen: Satzsuche (wie der Crawler); kurze Eingaben wie „Di 19:00, 2015“ zusätzlich direkt
  const picked = pickWeekly(extractWeeklyCandidates(prose));
  let weekday = picked?.weekday, time = picked?.time, conf = picked?.confidence, source = picked?.source;
  const direct = prose.trim().length <= 60 ? parseWeeklyInput(prose.trim()) : null;
  if (weekday === undefined && direct?.weekly) { weekday = direct.weekly.weekday; time = direct.weekly.time; conf = 'high'; source = prose.trim(); }
  if (weekday !== undefined && time) {
    const raw = formatTime(time), snapped = snapTime(raw);
    if (snapped !== raw) out.notes.push(`Uhrzeit ${raw} → ${snapped} (30-Minuten-Raster)`);
    out.weekly = { day: String(weekday), time: snapped, confidence: conf ?? 'medium', source };
  } else if (picked?.confidence === 'low') out.notes.push('Mehrere verschiedene Termine im Text — nicht übernommen');
  // Gründung
  const found = extractInit(prose, now.getFullYear()) ?? (direct?.init !== undefined ? { date: direct.init, confidence: 'high', source: prose.trim() } : null);
  if (found && !isInitPlaceholder(found.date)) out.init = { value: ymd(found.date), confidence: found.confidence, source: found.source };
  return out;
}

/** Breite des Seitenfensters (px) klemmen: 20 % … 60 % der Gesamtbreite, die Karte links behält mindestens `minMain` px (+ Trenner) */
export function clampPaneWidth(px, total, min = 0.2, max = 0.6, minMain = 640) {
  if (!Number.isFinite(px) || !Number.isFinite(total) || total <= 0) return Math.round((total || 1000) * 0.45);
  const upper = Math.max(total * min, Math.min(total * max, total - minMain - 30));
  return Math.round(Math.min(upper, Math.max(total * min, px)));
}
