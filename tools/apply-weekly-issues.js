// tools/apply-weekly-issues.js
// Übernimmt offene „Treffen-Daten:“-Issues (Label weekly-data): weekly → loc-enrichment.json, space.init → locations.json
// (+ space.edited.latest). Ablehnen = Issue vorher schließen.
//
// Usage:
//   node tools/apply-weekly-issues.js            # Dry-Run
//   node tools/apply-weekly-issues.js --apply    # anwenden + Issues schließen
//   node tools/apply-weekly-issues.js --only-ok  # nur Label "ok" (Admin-Review)
//   node tools/apply-weekly-issues.js --id 42    # nur Space 42

import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';
import { fileURLToPath, pathToFileURL } from 'url';
import { validateProposal, rejectionComment } from '../tests/validate-enrichment.js';
import { isValidDate } from '../tests/validate-locations.js';
import { stampLocationsFile } from './lib/edit-stamp.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const RE_ID = /\*\*ID:\*\*\s*(\d+)/;
const RE_JSON = /```json\s*(\{[\s\S]*?\})\s*```/;
export const TITLE_PREFIX = 'Treffen-Daten:';

/** @returns {{issueNumber:number, spaceId:number, weekly?:{weekday:number,time:number}, init?:number}|null} */
export function parseIssue(issue) {
  if (!(issue.title || '').startsWith(TITLE_PREFIX)) return null;
  const id = (issue.body || '').match(RE_ID), js = (issue.body || '').match(RE_JSON);
  if (!id || !js) return null;
  let v;
  try { v = JSON.parse(js[1]); } catch { return null; }
  const out = { issueNumber: issue.number, spaceId: parseInt(id[1], 10) };
  if (v.weekly) out.weekly = { weekday: v.weekly.weekday, time: v.weekly.time };
  if (v['space.init'] !== undefined) out.init = v['space.init'];
  return out.weekly || out.init !== undefined ? out : null;
}

/** Prüft einen Vorschlag isoliert; leeres Array = gültig. */
export function validateWeekly(p, enrichment, knownIds) {
  const errs = [];
  if (p.weekly) errs.push(...validateProposal(enrichment, p.spaceId, 'weekly', p.weekly, knownIds));
  if (p.init !== undefined && !isValidDate(p.init)) errs.push(`ID ${p.spaceId}: "space.init" ist kein gültiges Datum YYYYMMDD (${p.init})`);
  return errs;
}

const hasOk = i => (i.labels || []).some(l => (typeof l === 'string' ? l : l?.name) === 'ok');
const gh = (...a) => execFileSync('gh', a, { cwd: ROOT, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });

async function main() {
  const args = process.argv.slice(2);
  const applyMode = args.includes('--apply'), onlyOk = args.includes('--only-ok');
  const targetId = args.includes('--id') ? parseInt(args[args.indexOf('--id') + 1], 10) : 0;
  console.log('=== Apply Weekly Issues ===');
  console.log(`Modus: ${applyMode ? 'APPLY' : 'Dry-Run (--apply zum Anwenden)'}${onlyOk ? ' · nur Label "ok"' : ''}\n`);

  let issues;
  try { issues = JSON.parse(gh('issue', 'list', '--label', 'weekly-data', '--state', 'open', '--json', 'number,title,body,labels', '--limit', '200')); }
  catch (err) { console.error('Fehler beim Laden der Issues (gh CLI verfügbar?):', err.message); process.exit(1); }
  if (onlyOk) issues = issues.filter(hasOk);
  let parsed = issues.map(parseIssue).filter(Boolean);
  if (targetId) parsed = parsed.filter(p => p.spaceId === targetId);
  if (!parsed.length) { console.log('Keine passenden Issues.'); return; }

  const enrichmentPath = path.join(ROOT, 'loc-enrichment.json');
  const enrichment = JSON.parse(fs.readFileSync(enrichmentPath, 'utf8'));
  const locations = JSON.parse(fs.readFileSync(path.join(ROOT, 'locations.json'), 'utf8'));
  const knownIds = new Set(locations.map(l => l.ID));

  const applied = [];
  for (const p of parsed) {
    const invalid = knownIds.has(p.spaceId) ? validateWeekly(p, enrichment, knownIds) : [`ID ${p.spaceId} nicht in locations.json`];
    if (invalid.length) {
      console.log(`❌ #${p.issueNumber}: ${invalid.join('; ')} — übersprungen`);
      if (applyMode) {
        try {
          gh('issue', 'comment', String(p.issueNumber), '--body', rejectionComment(invalid));
          gh('issue', 'edit', String(p.issueNumber), '--remove-label', 'ok');
          gh('api', 'repos/{owner}/{repo}/issues/' + p.issueNumber + '/labels', '-X', 'POST', '-f', 'labels[]=problem');
        } catch (err) { console.error(`   Kommentar/Label fehlgeschlagen: ${err.message.split('\n')[0]}`); }
      }
      continue;
    }
    console.log(`#${p.issueNumber}  ID ${p.spaceId}: ${p.weekly ? `weekly ${p.weekly.weekday}/${p.weekly.time}` : ''} ${p.init !== undefined ? `init ${p.init}` : ''}`);
    applied.push(p);
  }
  if (!applyMode) { console.log(`\nDry-Run: ${applied.length} würden angewendet.`); return; }
  if (!applied.length) return;

  for (const p of applied) if (p.weekly) (enrichment[String(p.spaceId)] ??= {}).weekly = p.weekly;
  const sorted = Object.fromEntries(Object.entries(enrichment).sort((a, b) => Number(a[0]) - Number(b[0])));
  fs.writeFileSync(enrichmentPath, JSON.stringify(sorted, null, 2) + '\n');
  const inits = new Map(applied.filter(p => p.init !== undefined).map(p => [p.spaceId, p.init]));
  stampLocationsFile(path.join(ROOT, 'locations.json'), applied.map(p => p.spaceId), undefined, { inits });
  for (const p of applied) gh('issue', 'close', String(p.issueNumber), '--comment', 'Angewendet (loc-enrichment.json / locations.json)');
  console.log(`\n✅ ${applied.length} Vorschläge angewendet, Issues geschlossen`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(err => { console.error(err); process.exit(1); });
}
