// tools/close-deferred.js — schließt die von apply-all vorgemerkten Issues (nach erfolgreichem Push)
// Usage: node tools/close-deferred.js <datei> [--dry-run]
import fs from 'fs';
import { execFileSync } from 'child_process';
import { parseDeferred } from './lib/issue-close.js';

const [file, flag] = process.argv.slice(2);
if (!file || !fs.existsSync(file)) { console.log('Keine vorgemerkten Issues.'); process.exit(0); }
const items = parseDeferred(fs.readFileSync(file, 'utf8'));
let failed = 0;
for (const { number, comment } of items) {
  if (flag === '--dry-run') { console.log(`würde #${number} schließen: ${comment}`); continue; }
  try { execFileSync('gh', ['issue', 'close', String(number), '--comment', comment], { stdio: 'pipe' }); console.log(`✅ #${number} geschlossen`); }
  catch (err) { failed++; console.error(`⚠️  #${number}: ${err.message.split('\n')[0]}`); }
}
console.log(`${items.length - failed}/${items.length} Issues geschlossen.`);
// Schließen schlägt nie den Lauf fehl: die Daten sind bereits veröffentlicht, offene Issues werden beim nächsten Lauf als erledigt erkannt.
