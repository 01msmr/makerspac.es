// tools/scan-workshop-url.js
// Liest eine URL (Startseite + typische Ausstattungs-Unterseiten) mit dem Workshop-Crawler aus und schreibt
// die erkannten Workshop-Typen als Kommentar ans Issue (von /admin/ per scan-workshop-url.yml gestartet;
// die Admin-Seite liest den Kommentar und löscht ihn wieder).
//
// Usage: node tools/scan-workshop-url.js --url https://example.org --issue 380 --scan-id ab12cd34 [--dry]

import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFileSync } from 'child_process';
import { pathToFileURL } from 'url';
import { crawlSpace } from './workshop-crawler.js';
import { WORKSHOP_TYPES } from '../workshop-types.js';
import { buildScanComment } from '../admin/admin-lib.js';

/** crawlSpace-Ergebnis → { types, evidence, pages } | { error } (Typen in Reihenfolge von WORKSHOP_TYPES) */
export function summarize(result) {
  if (result.error) return { error: result.error };
  const det = result.detections || {};
  const types = Object.keys(WORKSHOP_TYPES).filter(t => t in det);
  const evidence = Object.fromEntries(types.map(t => [t, { matches: det[t].matches.slice(0, 5), sources: det[t].sources.slice(0, 5) }]));
  return { types, evidence, pages: result.pagesChecked ?? 0 };
}

function arg(name) {
  const i = process.argv.indexOf(name);
  return i !== -1 ? process.argv[i + 1] : '';
}

async function main() {
  const url = arg('--url');
  const issue = parseInt(arg('--issue'), 10);
  const scanId = arg('--scan-id');
  const dry = process.argv.includes('--dry');
  if (!/^https?:\/\/\S+$/i.test(url) || !/^[A-Za-z0-9-]{4,40}$/.test(scanId) || (!dry && !issue)) {
    console.error('Ungültige Argumente (--url http(s)://…, --issue N, --scan-id [A-Za-z0-9-]{4,40})');
    process.exit(1);
  }
  console.log(`Scanne ${url} …`);
  const summary = summarize(await crawlSpace({ link: { url } }));
  const body = buildScanComment(scanId, url, summary);
  console.log(body);
  if (dry) return;
  const tmp = path.join(os.tmpdir(), `scan-${scanId}.md`);
  fs.writeFileSync(tmp, body, 'utf8');
  execFileSync('gh', ['issue', 'comment', String(issue), '--body-file', tmp], { stdio: 'inherit' });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(err => { console.error(err); process.exit(1); });
}
