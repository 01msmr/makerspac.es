// admin/admin-lib.js — pure Funktionen der Review-Seite (kein DOM, kein fetch → testbar)

import { WORKSHOP_TYPES } from '../workshop-types.js';
import { detectTypesLoose } from '../workshop-keywords.js';

export const REPO = '01msmr/makerspac.es';
export const OK_LABEL = 'ok';
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
    url: issue.html_url,
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
 * Vergleichszeilen „bei uns“ vs. „Vorschlag“.
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
  if (!Array.isArray(workshops) || workshops.length === 0 || workshops.some(w => typeof w !== 'string')) return null;
  const rows = body.split('\n').map(l => l.match(RE_ROW)).filter(Boolean)
    .map(m => ({ type: m[1], keywords: m[2], confidence: m[3], sources: m[4] }));
  const ev = body.match(/### Evidenz\s*([\s\S]*?)(?=\n### |\n```|$)/);
  return {
    number: issue.number, title: issue.title, spaceId: parseInt(id[1], 10), workshops,
    ok: RE_APPROVED.test(body) || (issue.labels || []).some(l => (typeof l === 'string' ? l : l?.name) === OK_LABEL),
    problem: (issue.labels || []).some(l => (typeof l === 'string' ? l : l?.name) === PROBLEM_LABEL),
    url: issue.html_url, updated: Date.parse(issue.updated_at) || 0,
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

/** Ersetzt die Workshop-Liste im JSON-Block; null wenn Liste leer/ungültig oder Block fehlt. */
export function replaceWorkshops(body, list) {
  if (!Array.isArray(list) || list.length === 0 || list.some(w => !(w in WORKSHOP_TYPES))) return null;
  if (!RE_WORKSHOPS.test(body)) return null;
  return body.replace(RE_WORKSHOPS, () => '```json\n"workshops": ' + JSON.stringify(list) + '\n```');
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
    { label: 'Workshops', ours: cur.length ? cur.join(', ') : dash, proposed: proposed.join(', '), differs: !same },
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

const RE_EVENTS = /```json\s*\{\s*"events":\s*"([^"]+)"\s*\}\s*```/s;
const RE_CONFIDENCE = /\|\s*(high|medium|low)\s*\|/i;

/** @returns {{number:number,title:string,spaceId:number,events:string,ok:boolean,url:string,updated:number,website:string,confidence:string}|null} */
export function parseCalendarIssue(issue) {
  if (!issue?.title?.startsWith('Kalenderlink:') || issue.pull_request) return null;
  const body = issue.body || '';
  const id = body.match(RE_ID);
  const ev = body.match(RE_EVENTS);
  if (!id || !ev || !/^https?:\/\//.test(ev[1])) return null; // ohne Fund (null) → Listen-Reiter
  return {
    number: issue.number, title: issue.title, spaceId: parseInt(id[1], 10), events: ev[1],
    ok: (issue.labels || []).some(l => (typeof l === 'string' ? l : l?.name) === OK_LABEL),
    problem: (issue.labels || []).some(l => (typeof l === 'string' ? l : l?.name) === PROBLEM_LABEL),
    url: issue.html_url, updated: Date.parse(issue.updated_at) || 0,
    website: body.match(RE_WEBSITE)?.[1] ?? '', confidence: body.match(RE_CONFIDENCE)?.[1]?.toLowerCase() ?? '',
  };
}

/** Ersetzt die events-URL im JSON-Block; null bei ungültiger URL / fehlendem Block. */
export function replaceEvents(body, url) {
  if (!/^https?:\/\/\S+$/.test(url) || url.includes('"')) return null;
  if (!RE_EVENTS.test(body)) return null;
  return body.replace(RE_EVENTS, () => '```json\n{\n  "events": "' + url + '"\n}\n```');
}

export function buildCalendarComparison(loc, currentEvents, proposed, confidence) {
  const dash = '–';
  return [
    { label: 'Name', ours: loc?.name ?? dash, proposed: dash, differs: false },
    { label: 'Stadt', ours: loc?.loc?.city ?? dash, proposed: dash, differs: false },
    { label: 'Website', ours: loc?.link?.url ?? dash, proposed: dash, differs: false },
    { label: 'Kalender', ours: currentEvents || dash, proposed, differs: (currentEvents || '') !== proposed },
    { label: 'Confidence', ours: dash, proposed: confidence || dash, differs: confidence === 'low', warn: confidence === 'low' },
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
