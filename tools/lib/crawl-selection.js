// tools/lib/crawl-selection.js
// Gemeinsame Auswahl für die Crawler (Workshops / Kalender / Datenvorschlag): welche Spaces sollen geprüft werden?
// Regeln (Vorfall: Crawler schlugen bereits Umgesetztes erneut vor — 13 doppelte Kalender-Issues im März):
//  1. Der Ist-Stand ist der VERSCHMOLZENE (locations.json + loc-enrichment.json, wie die Karte: enrichment-merge.js) —
//     nicht nur locations.json.
//  2. Spaces, für die es schon ein Issue dieser Art gibt (offen ODER geschlossen = abgelehnt/erledigt), werden nicht erneut
//     vorgeschlagen. --force umgeht beides.

import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';
import { applyEnrichment } from '../../enrichment-merge.js';

const RE_BODY_ID = /\*\*ID:\*\*\s*(\d+)/;
const RE_TITLE_ID = /\(#(\d+)\)\s*$|\(ID:?\s*(\d+)\)/;

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

/** IDs, für die es schon ein Issue mit diesem Titel-Präfix gibt (jeder Zustand) */
export function existingIssueIds(issues, prefix) {
  const ids = new Set();
  for (const i of issues) {
    if (!(i.title || '').startsWith(prefix)) continue;
    const id = issueSpaceId(i);
    if (id != null) ids.add(id);
  }
  return ids;
}

/**
 * Lädt alle Issues (offen + geschlossen) mit Label per gh und liefert die belegten Space-IDs.
 * required=true (Issues werden angelegt): ohne gh-Zugriff Abbruch statt stiller Doppelter.
 */
export function loadExistingIssueIds({ label, prefix, required, root }) {
  try {
    const raw = execFileSync('gh', ['issue', 'list', '--label', label, '--state', 'all', '--json', 'number,title,body', '--limit', '2000'],
      { cwd: root, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
    return existingIssueIds(JSON.parse(raw), prefix);
  } catch (err) {
    if (required) throw new Error(`Vorhandene Issues konnten nicht geladen werden (gh verfügbar?) — Abbruch, um Doppelte zu vermeiden (--force überspringt die Prüfung): ${err.message}`);
    console.warn(`⚠️  Vorhandene Issues nicht geprüft (gh nicht verfügbar): ${err.message.split('\n')[0]}`);
    return new Set();
  }
}

/**
 * @param {object[]} spaces           verschmolzene Spaces
 * @param {{hasData:(s:object)=>boolean, existingIds:Set<number>}} opts
 * @returns {{selected:object[], skippedData:number, skippedIssue:number}}
 */
export function selectSpaces(spaces, { hasData, existingIds }) {
  let skippedData = 0, skippedIssue = 0;
  const selected = [];
  for (const s of spaces) {
    if (hasData(s)) { skippedData++; continue; }
    if (existingIds.has(s.ID)) { skippedIssue++; continue; }
    selected.push(s);
  }
  return { selected, skippedData, skippedIssue };
}
