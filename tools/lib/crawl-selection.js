// tools/lib/crawl-selection.js
// Gemeinsame Auswahl für die Crawler (Workshops / Kalender / Datenvorschlag): welche Spaces sollen geprüft werden?
// Regeln (Vorfall: Crawler schlugen bereits Umgesetztes erneut vor — 13 doppelte Kalender-Issues im März):
//  1. Der Ist-Stand ist der VERSCHMOLZENE (locations.json + loc-enrichment.json, wie die Karte: enrichment-merge.js) —
//     nicht nur locations.json.
//  2. Entschieden wird nach INHALT, nicht nach der bloßen Existenz von Issues: Ein Fund wird nur dann NICHT vorgeschlagen,
//     wenn er dem integrierten Stand gleicht oder dem JÜNGSTEN früheren Vorschlag (Website unverändert seit dem letzten
//     Crawl, ob offen, übernommen oder abgelehnt). Jede andere Abweichung (Hinzufügen, Entfernen, Ändern) ist eine neuere
//     Änderung und wird vorgeschlagen; ältere offene Vorschläge mit anderem Inhalt werden dabei ersetzt.

import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';
import { applyEnrichment, normalizeUrl } from '../../enrichment-merge.js';
import { deltaKey } from './weekly-extract.js';
export { normalizeUrl }; // Re-Export: Single Source of Truth liegt in enrichment-merge.js

const RE_BODY_ID = /\*\*ID:\*\*\s*(\d+)/;
const RE_TITLE_ID = /\(#(\d+)\)\s*$|\(ID:?\s*(\d+)\)/;
const RE_WORKSHOPS = /```json\s*"workshops":\s*(\[[^\]]*\])\s*```/s;
const RE_WEEKLY = /```json\s*(\{[\s\S]*?\})\s*```/;
const RE_EVENTS = /```json\s*\{\s*"events":\s*"([^"]+)"\s*\}\s*```/s;

/** locations.json mit angewendetem Enrichment (== Karten-Daten) */
export function loadMergedLocations(root) {
  const locations = JSON.parse(fs.readFileSync(path.join(root, 'locations.json'), 'utf8'));
  const enrichmentPath = path.join(root, 'loc-enrichment.json');
  const enrichment = fs.existsSync(enrichmentPath) ? JSON.parse(fs.readFileSync(enrichmentPath, 'utf8')) : {};
  return locations.map(loc => applyEnrichment(loc, enrichment[String(loc.ID)]));
}

/** Space-ID eines Bot-Issues (Body „**ID:** N“ oder Titel „… (#N)“ / „… (ID N)“) */
export function issueSpaceId(issue) {
  const m = (issue.body || '').match(RE_BODY_ID) || (issue.title || '').match(RE_TITLE_ID);
  const id = m && (m[1] ?? m[2]);
  return id ? parseInt(id, 10) : null;
}


/** Gleicher Workshop-Inhalt (Reihenfolge egal) */
export function sameWorkshops(a, b) {
  const x = [...new Set(a)].sort(), y = [...new Set(b)].sort();
  return x.length === y.length && x.every((v, i) => v === y[i]);
}

/**
 * Inhalt, den ein vorhandenes Crawler-Issue vorschlägt.
 * workshops → string[] | null · events → normalisierte URL | null · weekly → deltaKey (String) | null (null = kein Fund / kein Block)
 */
export function proposalFromIssue(issue, kind) {
  const body = issue.body || '';
  if (kind === 'workshops') {
    const m = body.match(RE_WORKSHOPS);
    if (!m) return null;
    try { const v = JSON.parse(m[1]); return Array.isArray(v) ? v : null; } catch { return null; }
  }
  if (kind === 'weekly') {
    const m = body.match(RE_WEEKLY);
    if (!m) return null;
    try { const v = JSON.parse(m[1]); return v.weekly ? deltaKey({ weekly: v.weekly }) : null; } catch { return null; }   // nur der Weekly-Teil
  }
  if (kind === 'init') {
    const m = body.match(RE_WEEKLY);
    if (!m) return null;
    try { const v = JSON.parse(m[1]); return v['space.init'] != null ? deltaKey({ 'space.init': v['space.init'] }) : null; } catch { return null; }   // nur der Gründungs-Teil
  }
  const m = body.match(RE_EVENTS);
  return m ? normalizeUrl(m[1]) : null;
}

const sameProposal = (kind, a, b) => (kind === 'workshops'
  ? a != null && b != null && sameWorkshops(a, b)
  : a === b); // events: normalisierte URL; null === null = „beide ohne Fund“

/**
 * Entscheidet über einen Crawler-Fund anhand der INHALTE.
 *  - skip: Fund == integrierter Stand, oder == jüngster früherer Vorschlag (Website seit dem letzten Crawl unverändert)
 *  - propose: jede andere Abweichung = neuere Änderung; offene ältere Vorschläge mit anderem Inhalt werden ersetzt
 * @param {{kind:'workshops'|'events'|'weekly'|'init', found:string[]|string|null, integrated?:string[]|string|null, issues:{number:number,state:string,createdAt:string,body:string}[]}} a
 * @returns {{action:'skip'|'propose', reason:string, supersede:number[]}}
 */
export function decideProposal({ kind, found, integrated, issues }) {
  const foundC = kind === 'events' && found ? normalizeUrl(found) : (found ?? null);
  const hasIntegrated = kind === 'workshops' ? (integrated?.length > 0) : !!integrated;
  if (hasIntegrated) {
    const integratedC = kind === 'events' ? normalizeUrl(integrated) : integrated;
    if (foundC != null && sameProposal(kind, foundC, integratedC)) return { action: 'skip', reason: 'identisch mit dem integrierten Stand', supersede: [] };
  }
  const sorted = [...issues].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)) || b.number - a.number);
  const latest = sorted[0];
  if (latest && sameProposal(kind, proposalFromIssue(latest, kind), foundC)) {
    return { action: 'skip', reason: `identisch mit dem jüngsten Vorschlag #${latest.number} (${String(latest.state).toLowerCase()}) — Website seit dem letzten Crawl unverändert`, supersede: [] };
  }
  const supersede = sorted.filter(i => String(i.state).toUpperCase() === 'OPEN' && !sameProposal(kind, proposalFromIssue(i, kind), foundC)).map(i => i.number);
  return { action: 'propose', reason: latest ? `neuere Änderung gegenüber Vorschlag #${latest.number}` : 'erster Vorschlag', supersede };
}

/**
 * Lädt alle Issues (offen + geschlossen) mit Label per gh, gruppiert nach Space-ID.
 * required=true (Issues werden angelegt): ohne gh-Zugriff Abbruch statt stiller Doppelter.
 * @returns {Map<number, object[]>}
 */
export function loadSpaceIssues({ label, prefix, required, root }) {
  const bySpace = new Map();
  try {
    const raw = execFileSync('gh', ['issue', 'list', '--label', label, '--state', 'all', '--json', 'number,title,body,state,createdAt', '--limit', '2000'],
      { cwd: root, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
    for (const i of JSON.parse(raw)) {
      if (!(i.title || '').startsWith(prefix)) continue;
      const id = issueSpaceId(i);
      if (id == null) continue;
      if (!bySpace.has(id)) bySpace.set(id, []);
      bySpace.get(id).push(i);
    }
  } catch (err) {
    if (required) throw new Error(`Vorhandene Issues konnten nicht geladen werden (gh verfügbar?) — Abbruch, um Doppelte zu vermeiden: ${err.message}`);
    console.warn(`⚠️  Vorhandene Issues nicht geprüft (gh nicht verfügbar): ${err.message.split('\n')[0]}`);
  }
  return bySpace;
}

/** Ersetzte offene Vorschläge schließen (neuer Vorschlag mit abweichendem Inhalt) */
export function closeSuperseded(numbers, newNumber, root) {
  for (const n of numbers) {
    try {
      execFileSync('gh', ['issue', 'close', String(n), '--reason', 'not planned', '--comment', `Ersetzt durch #${newNumber}: neuere Crawler-Funde weichen von diesem Vorschlag ab.`], { cwd: root, stdio: 'pipe' });
    } catch (err) { console.error(`   Konnte #${n} nicht schließen: ${err.message.split('\n')[0]}`); }
  }
}
