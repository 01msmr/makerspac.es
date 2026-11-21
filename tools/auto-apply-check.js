// tools/auto-apply-check.js
// Läuft per Cron (auto-apply-spaceapi.yml): startet je Art (SpaceAPI / Workshops / Kalender) den Apply-Workflow,
// wenn ≥10 Issues das Label "ok" tragen ODER das letzte ok-Issue seit ≥1 h unverändert ist.
// Regel identisch zur Admin-Seite (autoApplyDelay in admin/admin-lib.js).
//
// Usage: node tools/auto-apply-check.js           # prüfen + ggf. Workflow starten
//        node tools/auto-apply-check.js --dry-run # nur anzeigen

import path from 'path';
import { execFileSync } from 'child_process';
import { fileURLToPath, pathToFileURL } from 'url';
import { autoApplyDelay } from '../admin/admin-lib.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

/** @returns {{ count: number, lastOkAt: number, delay: number|null }} */
export function decide(issues, now = Date.now(), prefix = 'SpaceAPI:') {
  const ok = issues.filter(i => i.title?.startsWith(prefix)
    && (i.labels || []).some(l => (typeof l === 'string' ? l : l?.name) === 'ok'));
  const lastOkAt = Math.max(0, ...ok.map(i => Date.parse(i.updatedAt) || 0));
  return { count: ok.length, lastOkAt, delay: autoApplyDelay(ok.length, lastOkAt, now) };
}

const gh = (...args) => execFileSync('gh', args, { cwd: ROOT, encoding: 'utf8' });

/** Pro Art: Titel-Präfix, Workflow und dessen Modus (Workshops: apply = nur freigegebene Issues) */
const KINDS = [
  { name: 'SpaceAPI', prefix: 'SpaceAPI:', workflow: 'apply-spaceapi-issues.yml', mode: 'apply-ok' },
  { name: 'Workshops', prefix: '[Workshop-Daten]', workflow: 'apply-workshop-issues.yml', mode: 'apply' },
  { name: 'Kalender', prefix: 'Kalenderlink:', workflow: 'apply-calendar-issues.yml', mode: 'apply-ok' },
];

function main() {
  const dryRun = process.argv.includes('--dry-run');
  const issues = JSON.parse(gh('issue', 'list', '--label', 'ok', '--state', 'open',
    '--json', 'number,title,updatedAt,labels', '--limit', '500'));
  for (const k of KINDS) {
    const { count, lastOkAt, delay } = decide(issues, Date.now(), k.prefix);
    if (delay === null) { console.log(`${k.name}: keine ok-Issues.`); continue; }
    console.log(`${k.name}: ${count} ok-Issue(s), letzte Änderung ${new Date(lastOkAt).toISOString()}`);
    if (delay > 0) { console.log(`  noch ${Math.ceil(delay / 60000)} min Wartezeit (oder ab 10 Issues sofort).`); continue; }
    if (dryRun) { console.log(`  würde ${k.workflow} (${k.mode}) starten.`); continue; }
    gh('workflow', 'run', k.workflow, '-f', `mode=${k.mode}`, '-f', 'id=0');
    console.log(`  ✅ ${k.workflow} gestartet`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
