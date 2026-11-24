// tools/lib/issue-close.js — Issue schließen, optional aufgeschoben (apply-all)
//
// Ohne DEFERRED_CLOSE_FILE: sofort per `gh issue close` (Einzel-Workflows, lokale Läufe).
// Mit DEFERRED_CLOSE_FILE (apply-all-issues.yml): nur vormerken (JSON-Zeile je Issue). Der Workflow schließt
// erst NACH Validierung + Push (tools/close-deferred.js) → ein Fehlschlag lässt die Issues offen statt Daten zu verlieren.

import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

/** @param {number|string} number @param {string} comment */
export function closeOrDefer(number, comment) {
  const file = process.env.DEFERRED_CLOSE_FILE;
  if (file) { fs.appendFileSync(file, JSON.stringify({ number: Number(number), comment }) + '\n'); return; }
  execFileSync('gh', ['issue', 'close', String(number), '--comment', comment], { cwd: ROOT, stdio: 'pipe' });
}

/** @param {string} text JSON-Zeilen @returns {{number:number, comment:string}[]} (je Issue nur der letzte Eintrag) */
export function parseDeferred(text) {
  const byNumber = new Map();
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    try { const e = JSON.parse(line); if (Number.isInteger(e.number)) byNumber.set(e.number, e); } catch { /* defekte Zeile ignorieren */ }
  }
  return [...byNumber.values()];
}
