// tools/build-changelog.js — erzeugt data/changes.json (Daten für den Reiter „new“) aus der Git-Historie.
// Läuft im Deploy nach „JSON-Splits generieren“ (fetch-depth: 0). Ohne Historie/Git bleibt die Liste leer.
//
// Usage: node tools/build-changelog.js [--out data/changes.json]

import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';
import { fileURLToPath, pathToFileURL } from 'url';
import { buildEntries } from './lib/changelog.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const git = (...args) => execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['pipe', 'pipe', 'pipe'] });
const berlinDay = iso => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Berlin' }).format(new Date(iso));

/** Datenstand eines Commits (oder null, wenn die Dateien dort fehlen) */
function snapshot(rev) {
  try {
    return {
      locations: JSON.parse(git('show', `${rev}:locations.json`)),
      enrichment: JSON.parse(git('show', `${rev}:loc-enrichment.json`)),
    };
  } catch { return null; }
}

export function buildFromGit() {
  let lines;
  try {
    lines = git('log', '--no-merges', '--reverse', '--format=%H%x09%cI', '--', 'locations.json', 'loc-enrichment.json').trim().split('\n').filter(Boolean);
  } catch (err) { console.warn(`⚠️  git log nicht verfügbar — changes.json bleibt leer: ${err.message.split('\n')[0]}`); return []; }
  const steps = [];
  for (const line of lines) {
    const [sha, iso] = line.split('\t');
    let parent;
    try { parent = git('rev-parse', `${sha}^`).trim(); } catch { continue; }   // Wurzel-Commit = Import, keine Änderung
    const prev = snapshot(parent), next = snapshot(sha);
    if (prev && next) steps.push({ date: berlinDay(iso), prev, next });
  }
  const known = new Set(JSON.parse(fs.readFileSync(path.join(ROOT, 'locations.json'), 'utf8')).map(l => l.ID));
  return buildEntries(steps, known);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const outArg = process.argv.indexOf('--out');
  const out = path.resolve(ROOT, outArg !== -1 ? process.argv[outArg + 1] : 'data/changes.json');
  const entries = buildFromGit();
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify({ v: 1, entries }));
  console.log(`✅ ${path.relative(ROOT, out)}: ${entries.length} Einträge`);
}
