// admin/admin-lib.js — pure Funktionen der Review-Seite (kein DOM, kein fetch → testbar)

import { WORKSHOP_TYPES } from '../workshop-types.js';
import { WEEKDAY_NAMES } from '../date-utils.js';
import { detectTypesLoose } from '../workshop-keywords.js';

export const REPO = '01msmr/makerspac.es';
export const OK_LABEL = 'ok';

/** YYYYMMDD (Zahl) → „YYYY-MM-DD“, sonst „–“ */
export function formatEditDate(n) {
  const s = String(n ?? '');
  return /^\d{8}$/.test(s) ? `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6)}` : '–';
}
const editedRow = loc => ({ label: 'Zuletzt bearbeitet', ours: formatEditDate(loc?.dates?.['space.edited.latest']), proposed: '–', differs: false });
/** Logins der zugewiesenen Prüfer eines Issues (REST-Objekt) */
export const assigneesOf = issue => (issue?.assignees || []).map(a => a?.login).filter(Boolean);

export const PROBLEM_LABEL = 'problem'; // gesetzt von den Apply-Skripten, wenn ein Vorschlag nicht übernommen werden konnte

// Gleiche Regexe wie parseIssue() in tools/apply-spaceapi-issues.js
const RE_ID = /\*\*ID:\*\*\s*(\d+)/;
const RE_JSON = /```json\s*(\{[\s\S]*?\})\s*```/;

/** @returns {{ number:number, title:string, spaceId:number, endpoint:string, ok:boolean, url:string } | null} */
export function parseIssue(issue) {
  if (!issue?.title?.startsWith('SpaceAPI:') || issue.pull_request) return null;
  const body = issue.body || '';
  const id = body.match(RE_ID);
  const js = body.match(RE_JSON);
  if (!id || !js) return null;
  let endpoint;
  try { endpoint = JSON.parse(js[1]).spaceapi?.endpoint; } catch { return null; }
  if (typeof endpoint !== 'string' || !endpoint.startsWith('http')) return null;
  return {
    number: issue.number, title: issue.title, spaceId: parseInt(id[1], 10), endpoint,
    ok: (issue.labels || []).some(l => (typeof l === 'string' ? l : l?.name) === OK_LABEL),
    problem: (issue.labels || []).some(l => (typeof l === 'string' ? l : l?.name) === PROBLEM_LABEL),
    url: issue.html_url, assignees: assigneesOf(issue),
    updated: Date.parse(issue.updated_at) || 0,
  };
}

export const AUTO_APPLY_COUNT = 10;          // so viele ok-Vorschläge → sofort übernehmen
export const AUTO_APPLY_IDLE_MS = 60 * 60 * 1000; // oder 1 h ohne neuen ok-Vorschlag

/**
 * Wann soll automatisch übernommen werden?
 * @param {number} okCount  Anzahl Issues mit Label ok
 * @param {number} lastOkAt Zeitpunkt (ms) des letzten neuen ok-Vorschlags
 * @param {number} now
 * @returns {number|null} null = nichts zu übernehmen, sonst Wartezeit in ms (0 = jetzt)
 */
export function autoApplyDelay(okCount, lastOkAt, now) {
  if (okCount <= 0) return null;
  if (okCount >= AUTO_APPLY_COUNT) return 0;
  return Math.max(0, lastOkAt + AUTO_APPLY_IDLE_MS - now);
}

/** Ersetzt spaceapi.endpoint im JSON-Block des Bodys; null wenn kein Block / ungültige URL. */
export function replaceEndpoint(body, endpoint) {
  if (!/^https?:\/\/\S+$/.test(endpoint)) return null;
  const m = body.match(RE_JSON);
  if (!m) return null;
  let obj;
  try { obj = JSON.parse(m[1]); } catch { return null; }
  obj.spaceapi = { ...(obj.spaceapi || {}), endpoint };
  return body.replace(RE_JSON, () => '```json\n' + JSON.stringify(obj, null, 2) + '\n```');
}

export function distanceMeters(lat1, lon1, lat2, lon2) {
  const rad = x => x * Math.PI / 180;
  const a = Math.sin(rad(lat2 - lat1) / 2) ** 2
    + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(rad(lon2 - lon1) / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.sqrt(a));
}

const host = u => { try { return new URL(u).hostname.replace(/^www\./, '').toLowerCase(); } catch { return ''; } };

/**
 * Vergleichszeilen „Aktuell“ vs. „Vorschlag“.
 * @param {object|undefined} loc      Eintrag aus locations.json
 * @param {object|undefined} current  loc-enrichment[ID].spaceapi
 * @param {object|null} data          live geladenes SpaceAPI-JSON (null = nicht ladbar)
 * @param {string} endpoint           vorgeschlagener Endpoint
 * @returns {{label:string, ours:string, proposed:string, differs:boolean}[]}
 */
export function buildComparison(loc, current, data, endpoint) {
  const dash = '–';
  const lat = data?.location?.lat, lon = data?.location?.lon;
  const dist = loc?.loc && typeof lat === 'number' && typeof lon === 'number'
    ? Math.round(distanceMeters(loc.loc.lat, loc.loc.long, lat, lon)) : null;
  const lc = data?.state?.lastchange;
  const rows = [
    { label: 'Name', ours: loc?.name ?? dash, proposed: data?.space ?? dash,
      differs: !!data && (loc?.name ?? '').toLowerCase() !== String(data.space ?? '').toLowerCase() },
    { label: 'Stadt', ours: loc?.loc?.city ?? dash, proposed: data?.location?.address ?? dash, differs: false },
    editedRow(loc),
    { label: 'Website', ours: loc?.link?.url ?? dash, proposed: data?.url ?? dash,
      differs: !!data?.url && host(data.url) !== host(loc?.link?.url ?? '') },
    { label: 'Koordinaten', ours: loc?.loc ? `${loc.loc.lat}, ${loc.loc.long}` : dash,
      proposed: lat != null ? `${lat}, ${lon}${dist != null ? ` (${dist} m)` : ''}` : dash,
      differs: dist != null && dist > 300 },
    { label: 'Endpoint', ours: current?.endpoint ?? dash, proposed: endpoint,
      differs: (current?.endpoint ?? '') !== endpoint },
    { label: 'Letzte Änderung', ours: dash,
      proposed: typeof lc === 'number' ? new Date(lc * 1000).toISOString().slice(0, 10) : dash, differs: false },
  ];
  // verdächtige Abweichungen (gelb) vs. normale Änderungen (rot→grün)
  return rows.map(r => ['Name', 'Website', 'Koordinaten'].includes(r.label) ? { ...r, warn: r.differs } : r);
}

// ─── Workshop-Daten ([Workshop-Daten]-Issues, Label workshop-data) ───────────

const RE_WORKSHOPS = /```json\s*"workshops":\s*(\[[^\]]*\])\s*```/s;
const RE_APPROVED = /- \[x\] Freigegeben/i;
const RE_REPLACE = /\*\*Modus:\*\*\s*ersetzen/i; // vom Admin geschrieben: bestehende Workshops ersetzen/entfernen (siehe tools/apply-workshop-issues.js)
const RE_WEBSITE = /\*\*Website:\*\*\s*(\S+)/;
const RE_ROW = /^\|\s*`([^`]+)`\s*\|\s*(.*?)\s*\|\s*\*\*(\w+)\*\*\s*\|\s*(.*?)\s*\|\s*$/;

/** @returns {{number:number,title:string,spaceId:number,workshops:string[],ok:boolean,url:string,updated:number,website:string,rows:object[],evidence:string}|null} */
export function parseWorkshopIssue(issue) {
  if (!issue?.title?.startsWith('[Workshop-Daten]') || issue.pull_request) return null;
  const body = issue.body || '';
  const id = body.match(RE_ID);
  const js = body.match(RE_WORKSHOPS);
  if (!id || !js) return null;
  let workshops;
  try { workshops = JSON.parse(js[1]); } catch { return null; }
  const replace = RE_REPLACE.test(body);
  if (!Array.isArray(workshops) || (workshops.length === 0 && !replace) || workshops.some(w => typeof w !== 'string')) return null;
  const rows = body.split('\n').map(l => l.match(RE_ROW)).filter(Boolean)
    .map(m => ({ type: m[1], keywords: m[2], confidence: m[3], sources: m[4] }));
  const ev = body.match(/### Evidenz\s*([\s\S]*?)(?=\n### |\n```|$)/);
  return {
    number: issue.number, title: issue.title, spaceId: parseInt(id[1], 10), workshops, replace,
    ok: RE_APPROVED.test(body) || (issue.labels || []).some(l => (typeof l === 'string' ? l : l?.name) === OK_LABEL),
    problem: (issue.labels || []).some(l => (typeof l === 'string' ? l : l?.name) === PROBLEM_LABEL),
    url: issue.html_url, assignees: assigneesOf(issue), updated: Date.parse(issue.updated_at) || 0,
    website: body.match(RE_WEBSITE)?.[1] ?? '', rows, evidence: ev ? ev[1].trim() : '',
  };
}

/** "3d, laser;wood" → {list, invalid}; list nur mit gültigen, eindeutigen Typen */
export function parseWorkshopList(text) {
  const parts = [...new Set(String(text).toLowerCase().split(/[\s,;]+/).filter(Boolean))];
  return { list: parts.filter(p => p in WORKSHOP_TYPES), invalid: parts.filter(p => !(p in WORKSHOP_TYPES)) };
}

/**
 * Freitext → Workshop-Typen: gültige Typ-Kürzel (z. B. "3d, laser"), Stichwörter ("Lasercutter", "Nähmaschine") UND lockere Begriffe ("HOLZ", "FABLAB").
 * @returns {string[]} eindeutig, in der Reihenfolge von WORKSHOP_TYPES
 */
export function detectFromText(text) {
  const found = new Set([...parseWorkshopList(text).list, ...detectTypesLoose(text)]);
  return Object.keys(WORKSHOP_TYPES).filter(t => found.has(t));
}

/**
 * Ersetzt die Workshop-Liste im JSON-Block; null wenn Liste ungültig oder Block fehlt.
 * replace=true: schreibt zusätzlich „**Modus:** ersetzen“ (bestehende Workshops ersetzen; leere Liste = entfernen),
 * replace=false entfernt die Zeile wieder. Eine leere Liste ist nur mit replace=true erlaubt.
 */
export function replaceWorkshops(body, list, replace = false) {
  if (!Array.isArray(list) || (list.length === 0 && !replace) || list.some(w => !(w in WORKSHOP_TYPES))) return null;
  if (!RE_WORKSHOPS.test(body)) return null;
  return setModeMarker(body.replace(RE_WORKSHOPS, () => '```json\n"workshops": ' + JSON.stringify(list) + '\n```'), replace);
}

/** Zeile „**Modus:** ersetzen“ direkt unter die ID-Zeile schreiben (replace=true) bzw. entfernen (false) — idempotent */
export function setModeMarker(body, replace) {
  const out = body.replace(/\n\*\*Modus:\*\*[^\n]*/gi, '');
  return replace ? out.replace(RE_ID, m => `${m}\n**Modus:** ersetzen`) : out;
}

/** Vergleichszeilen für Workshop-Vorschläge. */
export function buildWorkshopComparison(loc, currentWorkshops, proposed) {
  const dash = '–';
  const cur = Array.isArray(currentWorkshops) ? currentWorkshops : [];
  const same = cur.length === proposed.length && cur.every(w => proposed.includes(w));
  return [
    { label: 'Name', ours: loc?.name ?? dash, proposed: dash, differs: false },
    { label: 'Stadt', ours: loc?.loc?.city ?? dash, proposed: dash, differs: false },
    { label: 'Website', ours: loc?.link?.url ?? dash, proposed: dash, differs: false },
    editedRow(loc),
    { label: 'Workshops', ours: cur.length ? cur.join(', ') : dash, proposed: proposed.length ? proposed.join(', ') : '(entfernen)', differs: !same, warn: proposed.length === 0 && cur.length > 0 },
  ];
}

// ─── URL-Scan (Workflow scan-workshop-url.yml → Kommentar am Issue) ───────────

/** true, wenn der Text nur aus einer http(s)-URL besteht */
export function looksLikeUrl(text) {
  return /^https?:\/\/\S+$/i.test(String(text).trim());
}

/** Kommentar-Text, den der Scan-Workflow ans Issue schreibt (Marker + JSON-Block). */
export function buildScanComment(scanId, url, result) {
  const scan = result.error
    ? { id: scanId, url, error: String(result.error) }
    : { id: scanId, url, types: result.types, evidence: result.evidence ?? {}, pages: result.pages ?? 0 };
  return `<!-- scan:${scanId} -->\nURL-Scan: ${url}\n\n\`\`\`json\n${JSON.stringify({ scan }, null, 2)}\n\`\`\`\n`;
}

/** @returns {{types?:string[], evidence?:object, pages?:number, error?:string}|null} null = Kommentar gehört nicht zu scanId */
export function parseScanComment(body, scanId) {
  if (!String(body).includes(`<!-- scan:${scanId} -->`)) return null;
  const m = body.match(RE_JSON);
  if (!m) return { error: 'Scan-Ergebnis nicht lesbar' };
  try {
    const scan = JSON.parse(m[1]).scan;
    if (scan.error) return { error: scan.error };
    return { types: (scan.types || []).filter(t => t in WORKSHOP_TYPES), evidence: scan.evidence || {}, pages: scan.pages || 0 };
  } catch { return { error: 'Scan-Ergebnis nicht lesbar' }; }
}

// ─── Kalenderlink ("Kalenderlink:"-Issues, Label data-update) ───────────────

const RE_EVENTS = /```json\s*\{\s*"events":\s*"([^"]*)"\s*\}\s*```/s;
const RE_CONFIDENCE = /\|\s*(high|medium|low)\s*\|/i;

/** @returns {{number:number,title:string,spaceId:number,events:string,ok:boolean,url:string,updated:number,website:string,confidence:string}|null} */
export function parseCalendarIssue(issue) {
  if (!issue?.title?.startsWith('Kalenderlink:') || issue.pull_request) return null;
  const body = issue.body || '';
  const id = body.match(RE_ID);
  const ev = body.match(RE_EVENTS);
  const replace = RE_REPLACE.test(body);
  // leere URL ist nur im Modus „ersetzen“ gültig (= Kalenderlink entfernen); ohne Fund (null) → Listen-Reiter
  if (!id || !ev || (ev[1] === '' ? !replace : !/^https?:\/\//.test(ev[1]))) return null;
  return {
    number: issue.number, title: issue.title, spaceId: parseInt(id[1], 10), events: ev[1], replace,
    ok: (issue.labels || []).some(l => (typeof l === 'string' ? l : l?.name) === OK_LABEL),
    problem: (issue.labels || []).some(l => (typeof l === 'string' ? l : l?.name) === PROBLEM_LABEL),
    url: issue.html_url, assignees: assigneesOf(issue), updated: Date.parse(issue.updated_at) || 0,
    website: body.match(RE_WEBSITE)?.[1] ?? '', confidence: body.match(RE_CONFIDENCE)?.[1]?.toLowerCase() ?? '',
  };
}

/**
 * Ersetzt die events-URL im JSON-Block; null bei ungültiger URL / fehlendem Block.
 * replace=true: schreibt zusätzlich „**Modus:** ersetzen“ (vorhandenen Kalenderlink ersetzen; leere URL = entfernen),
 * replace=false entfernt die Zeile wieder. Eine leere URL ist nur mit replace=true erlaubt.
 */
export function replaceEvents(body, url, replace = false) {
  if (url === '' ? !replace : (!/^https?:\/\/\S+$/.test(url) || url.includes('"'))) return null;
  if (!RE_EVENTS.test(body)) return null;
  return setModeMarker(body.replace(RE_EVENTS, () => '```json\n{\n  "events": "' + url + '"\n}\n```'), replace);
}

export function buildCalendarComparison(loc, currentEvents, proposed, confidence) {
  const dash = '–';
  return [
    { label: 'Name', ours: loc?.name ?? dash, proposed: dash, differs: false },
    { label: 'Stadt', ours: loc?.loc?.city ?? dash, proposed: dash, differs: false },
    { label: 'Website', ours: loc?.link?.url ?? dash, proposed: dash, differs: false },
    editedRow(loc),
    { label: 'Kalender', ours: currentEvents || dash, proposed: proposed || '(entfernen)', differs: (currentEvents || '') !== (proposed || ''), warn: !proposed && !!currentEvents },
    { label: 'Confidence', ours: dash, proposed: confidence || dash, differs: confidence === 'low', warn: confidence === 'low' },
  ];
}

// ─── Treffen (Weekly + Gründung) ─────────────────────────────────────────

const WEEKDAY_SHORT = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];   // Index = Wochentag (0 = Sonntag, wie date-utils.js)
const RE_WEEKLY_BLOCK = /```json\s*(\{[\s\S]*?\})\s*```/;

/** 1900 → "19:00" */
export const formatTime = t => String(t).padStart(4, '0').replace(/(\d\d)(\d\d)/, '$1:$2');

/** 20150501 → "2015-05-01"; Platzhalter/leer → "–" (wie formatEditDate) */
export const formatInit = n => (n && n !== 20010000 ? formatEditDate(n) : '–');

/** Weekly als Text: "Di 19:00" (kein Wert / Platzhalter → "–") */
export function formatWeekly(w) {
  return w && w.weekday >= 0 && w.weekday <= 6 && w.time ? `${WEEKDAY_SHORT[w.weekday]} ${formatTime(w.time)}` : '–';
}

/** @returns {{number,title,spaceId,weekly?,init?,ok,problem,url,updated,website}|null} */
export function parseWeeklyIssue(issue) {
  if (!issue?.title?.startsWith('Treffen-Daten:') || issue.pull_request) return null;
  const body = issue.body || '';
  const id = body.match(RE_ID), js = body.match(RE_WEEKLY_BLOCK);
  if (!id || !js) return null;
  let v;
  try { v = JSON.parse(js[1]); } catch { return null; }
  const weekly = v.weekly && Number.isInteger(v.weekly.weekday) ? { weekday: v.weekly.weekday, time: v.weekly.time } : undefined;
  const init = Number.isInteger(v['space.init']) ? v['space.init'] : undefined;
  if (!weekly && init === undefined) return null;
  return {
    number: issue.number, title: issue.title, spaceId: parseInt(id[1], 10), weekly, init,
    ok: (issue.labels || []).some(l => (typeof l === 'string' ? l : l?.name) === OK_LABEL),
    problem: (issue.labels || []).some(l => (typeof l === 'string' ? l : l?.name) === PROBLEM_LABEL),
    url: issue.html_url, assignees: assigneesOf(issue), updated: Date.parse(issue.updated_at) || 0, website: body.match(RE_WEBSITE)?.[1] ?? '',
    evidence: weeklyEvidence(body),
  };
}

/** Zeilen der „Gefunden“-Tabelle (| Was | Wert | Confidence | Quelle |) → [{what, value, confidence, source}] */
export function weeklyEvidence(body) {
  return String(body).split('\n').map(l => l.match(/^\|\s*(Weekly|Gründung)\s*\|\s*(.*?)\s*\|\s*(high|medium|low)\s*\|\s*(.*?)\s*\|\s*$/))
    .filter(Boolean).map(m => ({ what: m[1], value: m[2], confidence: m[3], source: m[4] }));
}

/** Eingabefeld-Text des Vorschlags: "Di 19:00, 2015-05-01" */
export const weeklyText = p => [p.weekly ? formatWeekly(p.weekly) : '', p.init !== undefined ? formatInit(p.init) : ''].filter(x => x && x !== '–').join(', ');

/**
 * "Di 19:00, 2015" → {weekly?, init?}; null bei Unlesbarem. Wochentag: So/Mo/…/Sa bzw. ausgeschrieben;
 * Gründung: YYYY (→ YYYY0101), YYYY-MM (→ YYYYMM01), YYYY-MM-DD oder YYYYMMDD.
 */
export function parseWeeklyInput(text) {
  const out = {};
  for (const part of String(text).split(/[,;|]/).map(x => x.trim()).filter(Boolean)) {
    let m;
    if ((m = part.match(/^([A-Za-zäöü]{2,10})\.?\s+(\d{1,2})[:.](\d{2})$/))) {
      const w = WEEKDAY_SHORT.findIndex(d => d.toLowerCase() === m[1].toLowerCase().slice(0, 2)) ;
      const long = WEEKDAY_NAMES.findIndex(d => d.toLowerCase() === m[1].toLowerCase());
      const de = ['sonntag', 'montag', 'dienstag', 'mittwoch', 'donnerstag', 'freitag', 'samstag'].indexOf(m[1].toLowerCase());
      const weekday = de >= 0 ? de : long >= 0 ? long : (m[1].length === 2 ? w : -1);
      const h = parseInt(m[2], 10), min = parseInt(m[3], 10);
      if (weekday < 0 || h > 23 || min > 59) return null;
      out.weekly = { weekday, time: h * 100 + min };
    } else if ((m = part.match(/^((?:19|20)\d{2})(?:-?(\d{2}))?(?:-?(\d{2}))?$/))) {
      const mo = m[2] ? parseInt(m[2], 10) : 1, d = m[3] ? parseInt(m[3], 10) : 1;
      if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
      out.init = parseInt(m[1], 10) * 10000 + mo * 100 + d;
    } else return null;
  }
  return out.weekly || out.init !== undefined ? out : null;
}

/** Ersetzt den JSON-Block durch den geparsten Text; null bei ungültiger Eingabe / fehlendem Block. */
export function replaceWeekly(body, text) {
  const v = parseWeeklyInput(text);
  if (!v || !RE_WEEKLY_BLOCK.test(body)) return null;
  const block = {};
  if (v.weekly) block.weekly = v.weekly;
  if (v.init !== undefined) block['space.init'] = v.init;
  return body.replace(RE_WEEKLY_BLOCK, () => '```json\n' + JSON.stringify(block, null, 2) + '\n```');
}

export function buildWeeklyComparison(loc, current, p) {
  const dash = '–';
  const curW = formatWeekly(current?.weekly), curI = formatInit(current?.dates?.['space.init']);
  const propW = p.weekly ? formatWeekly(p.weekly) : dash, propI = p.init !== undefined ? formatInit(p.init) : dash;
  return [
    { label: 'Name', ours: loc?.name ?? dash, proposed: dash, differs: false },
    { label: 'Stadt', ours: loc?.loc?.city ?? dash, proposed: dash, differs: false },
    { label: 'Website', ours: loc?.link?.url ?? dash, proposed: dash, differs: false },
    editedRow(loc),
    { label: 'Treffen', ours: curW, proposed: propW, differs: !!p.weekly && curW !== propW },
    { label: 'Gründung', ours: curI, proposed: propI, differs: p.init !== undefined && curI !== propI },
  ];
}

// ─── Listen-Reiter (alles ohne eigenen Review-Ablauf; nur Anzeige + Link zu GitHub) ─

/** [Schlüssel, Reiter-Name, Überschrift] */
export const INBOX_GROUPS = [
  ['pr', 'PRs', 'Pull Requests'],
  ['add', 'Neu', 'Neuer Space (Formular)'],
  ['update', 'Änderung', 'Änderung an Space (Formular)'],
  ['calendar0', 'Kalender ohne Fund', 'Kalenderlink ohne gefundene URL'],
  ['data', 'Daten', 'Datenvorschläge (Weekly / Gründung)'],
  ['other', 'Sonstige', 'Sonstige Issues'],
];

const hasLabel = (item, name) => (item.labels || []).some(l => (typeof l === 'string' ? l : l?.name) === name);

/** Gruppe eines offenen Issues/PRs; null = hat einen eigenen Review-Reiter (SpaceAPI / Workshops / Kalender). */
export function classifyItem(item) {
  const title = item?.title || '';
  if (item.pull_request) return 'pr';
  if (title.startsWith('SpaceAPI:') || title.startsWith('[Workshop-Daten]')) return null;
  if (title.startsWith('Kalenderlink:')) return parseCalendarIssue(item) ? null : 'calendar0';
  if (title.startsWith('Treffen-Daten:')) return parseWeeklyIssue(item) ? null : 'data';
  if (title.startsWith('Datenvorschlag:')) return 'data';
  if (hasLabel(item, 'add-space')) return 'add';
  if (hasLabel(item, 'update-space')) return 'update';
  return 'other';
}

/** @returns {Record<string, object[]>} Gruppe → Einträge (leere fehlen); nur echte GitHub-Links */
export function groupInbox(items) {
  const out = {};
  for (const item of items) {
    const g = classifyItem(item);
    if (!g || !/^https:\/\/github\.com\//.test(item.html_url || '')) continue;
    (out[g] ??= []).push(item);
  }
  return out;
}

// ─── Probleme (nicht lösbar durch y/n: fehlgeschlagene Läufe, hängende ok-Issues, Grund zurückgekehrter Vorschläge) ───

const BAD_CONCLUSIONS = new Set(['failure', 'timed_out', 'startup_failure']);

/**
 * Ungelöste Workflow-Fehler: je Workflow zählt nur der NEUESTE abgeschlossene Lauf der letzten `hours` Stunden —
 * ein späterer grüner Lauf löst den Fehler auf. Bekanntes Rauschen (Bot-PR-Check, ADR-007) wird ausgeblendet.
 * @returns {{name:string,url:string,at:string,title:string,branch:string}[]}
 */
export function failedRuns(runs, now, hours = 24) {
  const since = now - hours * 3600e3;
  const latest = new Map();
  for (const r of runs) {
    if (r.status !== 'completed' || Date.parse(r.created_at) < since) continue;
    if (r.event === 'pull_request' && /^(update|add)-space-id-/.test(r.head_branch || '')) continue;
    const key = r.path || r.name;
    const cur = latest.get(key);
    if (!cur || Date.parse(r.created_at) > Date.parse(cur.created_at)) latest.set(key, r);
  }
  return [...latest.values()].filter(r => BAD_CONCLUSIONS.has(r.conclusion))
    .map(r => ({ name: r.name, url: r.html_url, at: r.created_at, title: r.display_title || '', branch: r.head_branch || '' }))
    .sort((a, b) => b.at.localeCompare(a.at));
}

/** Offene Issues mit Label ok, die seit über `hours` Stunden nicht übernommen wurden (Cron/Workflow hängt?) */
export function stuckOk(items, now, hours = 2) {
  return items.filter(i => !i.pull_request && hasLabel(i, OK_LABEL) && now - Date.parse(i.updated_at) > hours * 3600e3)
    .map(i => ({ number: i.number, title: i.title, url: i.html_url, hours: Math.floor((now - Date.parse(i.updated_at)) / 3600e3) }));
}

/** Grund, warum ein Vorschlag zurückkam: letzter Bot-Kommentar („Nicht übernommen …“ / „Endpoint nicht erreichbar …“) */
export function problemReason(comments) {
  const bot = (comments || []).filter(c => c.user?.type === 'Bot' || /\[bot\]$/.test(c.user?.login || ''));
  const hit = [...bot].reverse().find(c => /^(Nicht übernommen|Endpoint nicht erreichbar)/.test(c.body || ''));
  return hit ? hit.body.trim().slice(0, 600) : '';
}

// ─── Warteschlange aktuell halten (Tab lange offen) ──────────────────────────

/**
 * Warteschlange mit der frischen Issue-Liste abgleichen: Was inzwischen geschlossen/freigegeben wurde, fällt heraus;
 * bereits durchgegangene, noch offene Einträge („später“) kommen ans Ende; das aktuell angezeigte bleibt vorn.
 * @param {{number:number}[]} oldQueue
 * @param {number} idx            Position des aktuellen Eintrags in oldQueue
 * @param {{number:number}[]} fresh frische, noch nicht freigegebene Issues
 * @param {number|null} currentNumber angezeigtes Issue (null = keins angezeigt)
 * @returns {{queue: object[], gone: boolean}} gone = das angezeigte Issue ist nicht mehr offen/unfreigegeben
 */
export function mergeQueue(oldQueue, idx, fresh, currentNumber = null) {
  const seen = new Set(oldQueue.slice(0, idx).map(p => p.number));
  const cur = currentNumber == null ? undefined : fresh.find(p => p.number === currentNumber);
  const unseen = fresh.filter(p => !seen.has(p.number) && p.number !== currentNumber);
  const later = fresh.filter(p => seen.has(p.number));
  return { queue: [...(cur ? [cur] : []), ...unseen, ...later], gone: currentNumber != null && !cur };
}


// ─── Prüfer (Identität, Rolle, Sperre, Prüfpfad) ─────────────────────────────────

/**
 * Rolle aus den Rechten des angemeldeten Nutzers (GET /repos/{repo} → permissions):
 * Admin = Schreibrecht oder mehr (darf „Übernehmen“/Workflow starten); Reviewer = Triage/Lesen (ok, verwerfen, korrigieren;
 * übernommen wird dann automatisch durch den Cron).
 * @param {{admin?:boolean, maintain?:boolean, push?:boolean, triage?:boolean, pull?:boolean}|undefined} perms
 * @returns {{role:'admin'|'reviewer', canApply:boolean}}
 */
export function roleFromPermissions(perms) {
  const canApply = !!(perms?.admin || perms?.maintain || perms?.push);
  return { role: canApply ? 'admin' : 'reviewer', canApply };
}

export const LOCK_TTL_MS = 30 * 60 * 1000;   // „in Bearbeitung“ verfällt nach 30 min ohne Änderung (Tab zu, Rechner aus)

/**
 * Wer bearbeitet das Issue gerade? Zuweisung an einen ANDEREN Prüfer, jünger als LOCK_TTL_MS.
 * @param {{assignees?:string[], updated?:number}} p geparster Vorschlag
 * @returns {{by:string, minutes:number}|null}
 */
export function lockOf(p, me, now = Date.now(), ttl = LOCK_TTL_MS) {
  const other = (p?.assignees || []).find(a => a && a.toLowerCase() !== String(me || '').toLowerCase());
  if (!other || !p.updated || now - p.updated >= ttl) return null;
  return { by: other, minutes: Math.max(0, Math.round((now - p.updated) / 60000)) };
}

const AUDIT = { ok: '✓ ok (zur Übernahme freigegeben)', adjust: '✎ angepasst + ok', reject: '✗ verworfen', create: '➕ im Admin angelegt', undo: '↩ rückgängig gemacht', later: '' };
/** Kommentar für den Prüfpfad: „✓ ok … — @login (Admin-Review)“ */
export const auditComment = (login, type) => `${AUDIT[type] ?? type} — @${login} (Admin-Review)`;
