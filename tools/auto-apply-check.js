// tools/auto-apply-check.js
// Läuft per Cron (auto-apply-spaceapi.yml): startet apply-all-issues.yml (alle Arten in einem Lauf),
// wenn ≥10 Issues (alle Arten zusammen) das Label "ok" tragen ODER das letzte ok-Issue seit ≥1 h unverändert ist.
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

/** Titel-Präfix je Art; alle Arten werden gemeinsam übernommen (apply-all-issues.yml: 1 Commit, 1 Deploy) */
export const KINDS = [
  { name: 'SpaceAPI', prefix: 'SpaceAPI:' },
  { name: 'Workshops', prefix: '[Workshop-Daten]' },
  { name: 'Kalender', prefix: 'Kalenderlink:' },
  { name: 'Treffen', prefix: 'Treffen-Daten:' },
];
export const APPLY_WORKFLOW = 'apply-all-issues.yml';

/** Entscheidung über ALLE Arten zusammen: Summe der ok-Issues, jüngste Änderung. */
export function decideAll(issues, now = Date.now(), kinds = KINDS) {
  const per = kinds.map(k => ({ name: k.name, ...decide(issues, now, k.prefix) }));
  const count = per.reduce((n, r) => n + r.count, 0);
  const lastOkAt = Math.max(0, ...per.map(r => r.lastOkAt));
  return { count, lastOkAt, delay: autoApplyDelay(count, lastOkAt, now), per };
}

function main() {
  const dryRun = process.argv.includes('--dry-run');
  const issues = JSON.parse(gh('issue', 'list', '--label', 'ok', '--state', 'open',
    '--json', 'number,title,updatedAt,labels', '--limit', '500'));
  const { count, lastOkAt, delay, per } = decideAll(issues);
  for (const r of per) console.log(`${r.name}: ${r.count} ok-Issue(s)`);
  if (delay === null) { console.log('Keine ok-Issues.'); return; }
  console.log(`Gesamt ${count} ok-Issue(s), letzte Änderung ${new Date(lastOkAt).toISOString()}`);
  if (delay > 0) { console.log(`noch ${Math.ceil(delay / 60000)} min Wartezeit (oder ab 10 Issues sofort).`); return; }
  if (dryRun) { console.log(`würde ${APPLY_WORKFLOW} (apply) starten.`); return; }
  gh('workflow', 'run', APPLY_WORKFLOW, '-f', 'mode=apply');
  console.log(`✅ ${APPLY_WORKFLOW} gestartet`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
