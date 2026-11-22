// tools/apply-spaceapi-issues.js
// Liest offene GitHub Issues mit Label "data-update" und Titel "SpaceAPI:*"
// (erzeugt von tools/spaceapi-directory-sync.js) und traegt den Endpoint in loc-enrichment.json ein.
// Ablehnen = Issue vorher schliessen.
//
// Usage:
//   node tools/apply-spaceapi-issues.js           # Dry-Run
//   node tools/apply-spaceapi-issues.js --apply   # Aenderungen anwenden + Issues schliessen
//   node tools/apply-spaceapi-issues.js --id 235  # Nur Issue fuer Space-ID 235
//   node tools/apply-spaceapi-issues.js --only-ok # Nur Issues mit Label "ok" (Admin-Review) + Live-Check des Endpoints

import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';
import { fileURLToPath, pathToFileURL } from 'url';
import { validateProposal, rejectionComment } from '../tests/validate-enrichment.js';

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

// === Review-Label + Live-Check (pure / injizierbar) ===

export const OK_LABEL = 'ok';

/** Nur Issues, die das Label "ok" tragen (gh liefert labels als [{name}]). */
export function filterOk(issues) {
  return issues.filter(i => (i.labels || []).some(l => (typeof l === 'string' ? l : l?.name) === OK_LABEL));
}

/** @returns {boolean} true wenn das JSON wie ein SpaceAPI-Dokument aussieht (space ist nicht-leerer String) */
export function isValidSpaceApi(json) {
  return !!json && typeof json === 'object' && typeof json.space === 'string' && json.space.trim() !== '';
}

/** Ruft den Endpoint ab und prueft ihn. fetchImpl injizierbar fuer Tests. */
export async function checkEndpoint(url, fetchImpl = fetch) {
  try {
    const res = await fetchImpl(url, { signal: AbortSignal.timeout(8000), headers: { Accept: 'application/json' } });
    if (!res.ok) return { ok: false, reason: `HTTP ${res.status}` };
    const json = await res.json();
    return isValidSpaceApi(json) ? { ok: true } : { ok: false, reason: 'kein gueltiges SpaceAPI-JSON (space fehlt)' };
  } catch (err) {
    return { ok: false, reason: err?.name === 'TimeoutError' ? 'Timeout (8 s)' : (err?.message || 'Fehler') };
  }
}

/** Label „problem“ setzen (REST legt es beim ersten Mal an) — /admin/ zeigt zurückgegebene Vorschläge damit markiert + mit Grund */
const markProblem = n => gh('api', 'repos/{owner}/{repo}/issues/' + n + '/labels', '-X', 'POST', '-f', 'labels[]=problem');

const gh = (...args) => execFileSync('gh', args, { cwd: ROOT, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });

// === Main ===

async function main() {
  const args = process.argv.slice(2);
  const applyMode = args.includes('--apply');
  const onlyOk = args.includes('--only-ok');
  const idIndex = args.indexOf('--id');
  const targetId = idIndex !== -1 ? parseInt(args[idIndex + 1], 10) : 0;

  console.log('=== Apply SpaceAPI Issues ===');
  console.log(`Modus: ${applyMode ? 'APPLY (schreibt loc-enrichment.json + schliesst Issues)' : 'Dry-Run (--apply zum Anwenden)'}${onlyOk ? ' · nur Label "ok" + Live-Check' : ''}\n`);

  let issues;
  try {
    issues = JSON.parse(gh('issue', 'list', '--label', 'data-update', '--state', 'open',
      '--search', 'SpaceAPI: in:title', '--json', 'number,title,body,labels', '--limit', '200'));
  } catch (err) {
    console.error('Fehler beim Laden der Issues (gh CLI verfuegbar?):', err.message);
    process.exit(1);
  }

  if (onlyOk) issues = filterOk(issues);
  let parsed = issues.map(parseIssue).filter(Boolean);
  if (targetId) parsed = parsed.filter(p => p.spaceId === targetId);
  if (parsed.length === 0) { console.log(onlyOk ? 'Keine offenen SpaceAPI-Issues mit Label "ok".' : 'Keine offenen SpaceAPI-Issues.'); return; }

  const enrichmentPath = path.join(ROOT, 'loc-enrichment.json');
  const locations = JSON.parse(fs.readFileSync(path.join(ROOT, 'locations.json'), 'utf8'));
  const enrichment = JSON.parse(fs.readFileSync(enrichmentPath, 'utf8'));
  const knownIds = new Set(locations.map(l => l.ID));

  const applied = [];
  for (const p of parsed) {
    if (!knownIds.has(p.spaceId)) { console.log(`⚠️  #${p.issueNumber}: ID ${p.spaceId} nicht in locations.json — uebersprungen`); continue; }
    if (onlyOk) {
      const check = await checkEndpoint(p.endpoint);
      if (!check.ok) {
        console.log(`❌ #${p.issueNumber}: ${p.endpoint} — ${check.reason} — uebersprungen`);
        if (applyMode) {
          gh('issue', 'comment', String(p.issueNumber), '--body',
            `Endpoint nicht erreichbar / kein gueltiges SpaceAPI-JSON (${check.reason}). Nicht uebernommen, Label "${OK_LABEL}" entfernt.`);
          gh('issue', 'edit', String(p.issueNumber), '--remove-label', OK_LABEL);
          markProblem(p.issueNumber);
        }
        continue;
      }
    }
    // Vorschlag isoliert prüfen — ungültig: nicht übernehmen, kommentieren, ok-Label entfernen (taucht im Admin wieder auf)
    const invalid = validateProposal(enrichment, p.spaceId, 'spaceapi', { endpoint: p.endpoint }, knownIds);
    if (invalid.length) {
      console.log(`❌ #${p.issueNumber}: ${invalid.join('; ')} — uebersprungen`);
      if (applyMode) {
        try { gh('issue', 'comment', String(p.issueNumber), '--body', rejectionComment(invalid)); gh('issue', 'edit', String(p.issueNumber), '--remove-label', OK_LABEL); markProblem(p.issueNumber); } catch (err) { console.error(`   Kommentar/Label fehlgeschlagen: ${err.message}`); }
      }
      continue;
    }
    console.log(`#${p.issueNumber}  ID ${p.spaceId}: ${enrichment[String(p.spaceId)]?.spaceapi?.endpoint || '–'} → ${p.endpoint}`);
    applyProposal(enrichment, p.spaceId, p.endpoint);
    applied.push(p);
  }

  if (!applyMode) { console.log(`\nDry-Run: ${applied.length} wuerden angewendet.`); return; }

  fs.writeFileSync(enrichmentPath, JSON.stringify(enrichment, null, 2) + '\n');
  for (const p of applied) {
    gh('issue', 'close', String(p.issueNumber), '--comment', 'Angewendet auf loc-enrichment.json');
  }
  console.log(`\n✅ ${applied.length} Endpoints angewendet, Issues geschlossen`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(err => { console.error(err); process.exit(1); });
}
