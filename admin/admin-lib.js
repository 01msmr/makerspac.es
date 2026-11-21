// admin/admin-lib.js — pure Funktionen der Review-Seite (kein DOM, kein fetch → testbar)

import { WORKSHOP_TYPES } from '../workshop-types.js';
import { detectTypes } from '../workshop-keywords.js';

export const REPO = '01msmr/makerspac.es';
export const OK_LABEL = 'ok';

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
  return [
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
 * Freitext → Workshop-Typen: gültige Typ-Kürzel (z. B. "3d, laser") UND Stichwörter ("Lasercutter", "Nähmaschine").
 * @returns {string[]} eindeutig, in der Reihenfolge von WORKSHOP_TYPES
 */
export function detectFromText(text) {
  const found = new Set([...parseWorkshopList(text).list, ...detectTypes(text)]);
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
