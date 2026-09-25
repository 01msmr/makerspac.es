// tools/apply-spaceapi-issues.js
// Liest offene GitHub Issues mit Label "data-update" und Titel "SpaceAPI:*"
// (erzeugt von tools/spaceapi-directory-sync.js) und traegt den Endpoint in loc-enrichment.json ein.
// Ablehnen = Issue vorher schliessen.
//
// Usage:
//   node tools/apply-spaceapi-issues.js           # Dry-Run
//   node tools/apply-spaceapi-issues.js --apply   # Aenderungen anwenden + Issues schliessen
//   node tools/apply-spaceapi-issues.js --id 235  # Nur Issue fuer Space-ID 235

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath, pathToFileURL } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

// === Issue-Body parsen (pure) ===

const RE_ID       = /\*\*ID:\*\*\s*(\d+)/;
const RE_ENDPOINT = /```json\s*(\{[\s\S]*?\})\s*```/;

/** @returns {{ issueNumber: number, spaceId: number, endpoint: string } | null} */
export function parseIssue(issue) {
  if (!issue.title.startsWith('SpaceAPI:')) return null;
  const idMatch = issue.body.match(RE_ID);
  const jsonMatch = issue.body.match(RE_ENDPOINT);
  if (!idMatch || !jsonMatch) return null;
  let endpoint;
  try { endpoint = JSON.parse(jsonMatch[1]).spaceapi?.endpoint; } catch { return null; }
  if (typeof endpoint !== 'string' || !endpoint.startsWith('http')) return null;
  return { issueNumber: issue.number, spaceId: parseInt(idMatch[1], 10), endpoint };
}

/** Setzt spaceapi.endpoint fuer eine ID (mutiert enrichment) */
export function applyProposal(enrichment, id, endpoint) {
  (enrichment[String(id)] ??= {}).spaceapi = { endpoint };
}

// === Main ===

function main() {
  const args = process.argv.slice(2);
  const applyMode = args.includes('--apply');
  const idIndex = args.indexOf('--id');
  const targetId = idIndex !== -1 ? parseInt(args[idIndex + 1], 10) : 0;

  console.log('=== Apply SpaceAPI Issues ===');
  console.log(`Modus: ${applyMode ? 'APPLY (schreibt loc-enrichment.json + schliesst Issues)' : 'Dry-Run (--apply zum Anwenden)'}\n`);

  let issues;
  try {
    issues = JSON.parse(execSync(
      'gh issue list --label data-update --state open --search "SpaceAPI: in:title" --json number,title,body --limit 200',
      { cwd: ROOT, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] },
    ));
  } catch (err) {
    console.error('Fehler beim Laden der Issues (gh CLI verfuegbar?):', err.message);
    process.exit(1);
  }

  let parsed = issues.map(parseIssue).filter(Boolean);
  if (targetId) parsed = parsed.filter(p => p.spaceId === targetId);
  if (parsed.length === 0) { console.log('Keine offenen SpaceAPI-Issues.'); return; }

  const enrichmentPath = path.join(ROOT, 'loc-enrichment.json');
  const locations = JSON.parse(fs.readFileSync(path.join(ROOT, 'locations.json'), 'utf8'));
  const enrichment = JSON.parse(fs.readFileSync(enrichmentPath, 'utf8'));
  const knownIds = new Set(locations.map(l => l.ID));

  const applied = [];
  for (const p of parsed) {
    if (!knownIds.has(p.spaceId)) { console.log(`⚠️  #${p.issueNumber}: ID ${p.spaceId} nicht in locations.json — uebersprungen`); continue; }
    console.log(`#${p.issueNumber}  ID ${p.spaceId}: ${enrichment[String(p.spaceId)]?.spaceapi?.endpoint || '–'} → ${p.endpoint}`);
    applyProposal(enrichment, p.spaceId, p.endpoint);
    applied.push(p);
  }

  if (!applyMode) { console.log(`\nDry-Run: ${applied.length} wuerden angewendet.`); return; }

  fs.writeFileSync(enrichmentPath, JSON.stringify(enrichment, null, 2) + '\n');
  for (const p of applied) {
    execSync(`gh issue close ${p.issueNumber} --comment "Angewendet auf loc-enrichment.json"`, { cwd: ROOT, stdio: 'pipe' });
  }
  console.log(`\n✅ ${applied.length} Endpoints angewendet, Issues geschlossen`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
