// tools/auto-apply-check.js
// Läuft per Cron (auto-apply-spaceapi.yml): startet den Workflow apply-spaceapi-issues (Modus apply-ok),
// wenn ≥10 SpaceAPI-Issues das Label "ok" tragen ODER das letzte ok-Issue seit ≥1 h unverändert ist.
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
export function decide(issues, now = Date.now()) {
  const ok = issues.filter(i => i.title?.startsWith('SpaceAPI:')
    && (i.labels || []).some(l => (typeof l === 'string' ? l : l?.name) === 'ok'));
  const lastOkAt = Math.max(0, ...ok.map(i => Date.parse(i.updatedAt) || 0));
  return { count: ok.length, lastOkAt, delay: autoApplyDelay(ok.length, lastOkAt, now) };
}

const gh = (...args) => execFileSync('gh', args, { cwd: ROOT, encoding: 'utf8' });

function main() {
  const dryRun = process.argv.includes('--dry-run');
  const issues = JSON.parse(gh('issue', 'list', '--label', 'data-update', '--label', 'ok', '--state', 'open',
    '--json', 'number,title,updatedAt,labels', '--limit', '200'));
  const { count, lastOkAt, delay } = decide(issues);
  if (delay === null) { console.log('Keine ok-Issues — nichts zu tun.'); return; }
  const mins = Math.ceil(delay / 60000);
  console.log(`${count} ok-Issue(s), letzte Änderung ${new Date(lastOkAt).toISOString()}`);
  if (delay > 0) { console.log(`Noch ${mins} min Wartezeit (oder ab 10 Issues sofort).`); return; }
  if (dryRun) { console.log('Würde apply-ok starten.'); return; }
  gh('workflow', 'run', 'apply-spaceapi-issues.yml', '-f', 'mode=apply-ok', '-f', 'id=0');
  console.log('✅ apply-ok gestartet');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
