// tools/apply-workshop-issues.js
// Liest offene GitHub Issues mit Label "workshop-data" (freigegeben = Checkbox oder Label "ok"),
// parst die vorgeschlagenen Workshop-Typen und trägt sie in loc-enrichment.json ein.
//
// Usage:
//   node tools/apply-workshop-issues.js             # Dry-Run
//   node tools/apply-workshop-issues.js --apply     # Anwenden + Issues schließen
//   node tools/apply-workshop-issues.js --id 235    # Nur Issue für Space-ID 235

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath, pathToFileURL } from 'url';
import { execFileSync } from 'child_process';
import { validateProposal, rejectionComment } from '../tests/validate-enrichment.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

const args = process.argv.slice(2);
const applyMode = args.includes('--apply');
const idIndex = args.indexOf('--id');
const targetId = idIndex !== -1 ? parseInt(args[idIndex + 1], 10) : 0;

// === GitHub Issues laden ===

function fetchIssues() {
  const raw = execSync(
    'gh issue list --label workshop-data --state open --json number,title,body,labels --limit 500',
    { cwd: root, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }
  );
  return JSON.parse(raw);
}

// === Issue-Body parsen ===

const RE_ID        = /\*\*ID:\*\*\s*(\d+)/;
const RE_WORKSHOPS = /```json\s*"workshops":\s*(\[[^\]]*\])\s*```/s;
const RE_APPROVED  = /- \[x\] Freigegeben/i;

/** Freigegeben = Checkbox angehakt ODER Label "ok" (gesetzt von /admin/) */
export function isApproved(issue) {
  return RE_APPROVED.test(issue.body || '') || (issue.labels || []).some(l => (typeof l === 'string' ? l : l?.name) === 'ok');
}

export function parseIssue(issue) {
  if (!issue.title.startsWith('[Workshop-Daten]')) return null;
  if (!isApproved(issue)) return null;  // not approved yet

  const idMatch        = issue.body.match(RE_ID);
  const workshopsMatch = issue.body.match(RE_WORKSHOPS);

  if (!idMatch || !workshopsMatch) return null;

  let workshops;
  try {
    workshops = JSON.parse(workshopsMatch[1]);
  } catch {
    return null;
  }

  if (!Array.isArray(workshops) || workshops.length === 0) return null;

  return {
    issueNumber: issue.number,
    spaceId:     parseInt(idMatch[1], 10),
    workshops,
  };
}

function closeIssue(number) {
  execSync(
    `gh issue close ${number} --comment "Angewendet auf loc-enrichment.json"`,
    { cwd: root, stdio: 'pipe' }
  );
}

// === Main ===

async function main() {
  console.log('=== Apply Workshop Issues ===');
  console.log(`Modus: ${applyMode ? 'APPLY (schreibt loc-enrichment.json + schließt Issues)' : 'Dry-Run (--apply zum Anwenden)'}`);
  if (targetId) console.log(`Filter: Space-ID ${targetId}`);
  console.log('');

  let issues;
  try {
    issues = fetchIssues();
  } catch (err) {
    console.error('Fehler beim Laden der Issues (gh CLI verfügbar?):', err.message);
    process.exit(1);
  }
  console.log(`${issues.length} offene workshop-data Issues gefunden\n`);

  let parsed = issues.map(parseIssue).filter(Boolean);
  if (targetId) parsed = parsed.filter(p => p.spaceId === targetId);

  if (parsed.length === 0) {
    console.log('Keine passenden Issues gefunden.');
    return;
  }

  // loc-enrichment.json laden
  const enrichmentPath = path.join(root, 'loc-enrichment.json');
  const enrichment = fs.existsSync(enrichmentPath)
    ? JSON.parse(fs.readFileSync(enrichmentPath, 'utf8'))
    : {};

  const stats = { total: parsed.length, applied: 0, skipped: 0, errors: 0 };
  const toApply = [];

  for (const { issueNumber, spaceId, workshops } of parsed) {
    const id = String(spaceId);
    const existing = enrichment[id]?.workshops;

    if (existing?.length) {
      if (applyMode) {
        try {
          closeIssue(issueNumber);
          console.log(`[#${issueNumber}] ID ${spaceId}: bereits gesetzt (${existing.join(', ')}) — Issue geschlossen`);
        } catch (err) {
          console.error(`[#${issueNumber}] Fehler beim Schließen: ${err.message}`);
          stats.errors++;
        }
      } else {
        console.log(`[#${issueNumber}] ID ${spaceId}: workshops bereits gesetzt (${existing.join(', ')}) — würde Issue schließen`);
      }
      stats.skipped++;
      continue;
    }

    console.log(`[#${issueNumber}] ID ${spaceId}: ${workshops.join(', ')}`);
    toApply.push({ issueNumber, spaceId, workshops });
  }

  console.log('');
  console.log('='.repeat(50));
  console.log(`Zu ändern:       ${toApply.length}`);
  console.log(`Bereits gesetzt: ${stats.skipped}`);
  console.log('='.repeat(50));

  // Jeden Vorschlag isoliert prüfen BEVOR geschrieben/geschlossen wird — ungültige überspringen (Kommentar + ok-Label weg)
  const locationIds = new Set(JSON.parse(fs.readFileSync(path.join(root, 'locations.json'), 'utf8')).map(l => l.ID));
  for (const item of [...toApply]) {
    const invalid = validateProposal(enrichment, item.spaceId, 'workshops', item.workshops, locationIds);
    if (!invalid.length) continue;
    console.log(`❌ [#${item.issueNumber}] ID ${item.spaceId}: ${invalid.join('; ')} — übersprungen`);
    toApply.splice(toApply.indexOf(item), 1);
    stats.errors++;
    if (applyMode) {
      try {
        execFileSync('gh', ['issue', 'comment', String(item.issueNumber), '--body', rejectionComment(invalid)], { cwd: root, stdio: 'pipe' });
        execFileSync('gh', ['issue', 'edit', String(item.issueNumber), '--remove-label', 'ok'], { cwd: root, stdio: 'pipe' });
        execFileSync('gh', ['api', 'repos/{owner}/{repo}/issues/' + item.issueNumber + '/labels', '-X', 'POST', '-f', 'labels[]=problem'], { cwd: root, stdio: 'pipe' });
      } catch (err) { console.error(`   Kommentar/Label fehlgeschlagen: ${err.message}`); }
    }
  }

  if (toApply.length === 0 || !applyMode) {
    if (!applyMode) console.log('\nDry-Run — keine Änderungen. Mit --apply ausführen.');
    return;
  }

  console.log('\nWende Änderungen an…\n');

  for (const { issueNumber, spaceId, workshops } of toApply) {
    const id = String(spaceId);
    if (!enrichment[id]) enrichment[id] = {};
    enrichment[id].workshops = workshops;

    try {
      closeIssue(issueNumber);
      console.log(`[#${issueNumber}] ID ${spaceId}: gesetzt, Issue geschlossen`);
      stats.applied++;
    } catch (err) {
      console.error(`[#${issueNumber}] Fehler beim Schließen: ${err.message}`);
      stats.errors++;
    }
  }

  // Sortiert nach ID schreiben
  const sorted = Object.fromEntries(
    Object.entries(enrichment).sort((a, b) => Number(a[0]) - Number(b[0]))
  );
  fs.writeFileSync(enrichmentPath, JSON.stringify(sorted, null, 2) + '\n', 'utf8');
  console.log(`\nloc-enrichment.json aktualisiert (${stats.applied} Einträge)`);

  console.log('');
  console.log('='.repeat(50));
  console.log(`Angewendet: ${stats.applied} | Übersprungen: ${stats.skipped} | Fehler: ${stats.errors}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(err => {
    console.error('Fataler Fehler:', err);
    process.exit(1);
  });
}
