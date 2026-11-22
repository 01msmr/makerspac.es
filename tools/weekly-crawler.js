// tools/weekly-crawler.js — Weekly-Treffen + Gründungsdatum auf Space-Websites finden (regelbasiert, ohne KI/API-Key).
// Ergebnis: GitHub Issues „Treffen-Daten: <Name>“ (Label weekly-data) mit JSON-Block, geprüft im /admin/ (Reiter „Weekly“).
// Entscheidung (neuer Fund ja/nein) wie bei den anderen Crawlern: tools/lib/crawl-selection.js (decideProposal, kind 'weekly').
//
// Usage:
//   node tools/weekly-crawler.js                    # Dry-Run (Default)
//   node tools/weekly-crawler.js --create-issues    # Issues erstellen
//   node tools/weekly-crawler.js --limit 5          # Nur N Spaces
//   node tools/weekly-crawler.js --id 42            # Nur Space mit ID 42
//   node tools/weekly-crawler.js --force            # Auch Spaces mit echten Werten (Abweichung = Vorschlag)

import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';
import { fileURLToPath, pathToFileURL } from 'url';
import { loadMergedLocations, loadSpaceIssues, decideProposal, closeSuperseded } from './lib/crawl-selection.js';
import { extractWeeklyCandidates, pickWeekly, extractInit, weeklyDelta, deltaKey, isWeeklyPlaceholder, isInitPlaceholder } from './lib/weekly-extract.js';
import { WEEKDAY_NAMES } from '../date-utils.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const TIMEOUT_MS = 15000;
const DELAY_MS = 600;
const MAX_TEXT = 30000;
export const ISSUE_LABEL = 'weekly-data';
export const TITLE_PREFIX = 'Treffen-Daten:';
// Unterseiten, auf denen Treffen/Gründung häufig stehen
const PATHS = ['/', '/treffen', '/termine', '/kontakt', '/contact', '/about', '/ueber-uns', '/ueber', '/mitmachen', '/verein', '/offener-abend', '/open-lab'];

const sleep = ms => new Promise(r => setTimeout(r, ms));

export function htmlToText(html) {
  return html
    .replace(/<(script|style|noscript|svg)[\s\S]*?<\/\1>/gi, '')
    .replace(/<\/(p|div|h[1-6]|li|tr|br|hr|blockquote|section|article|header|main)[\s>]/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ')
    .replace(/&#\d+;|&\w+;/g, '')
    .replace(/[ \t]+/g, ' ').replace(/\n\s*\n/g, '\n').trim()
    .slice(0, MAX_TEXT);
}

async function fetchText(url) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS), headers: { 'User-Agent': 'makerspaces-crawler/1.0 (https://makerspac.es; data enrichment)', Accept: 'text/html' } });
    if (!res.ok || !(res.headers.get('content-type') || '').includes('html')) return null;
    return htmlToText(await res.text());
  } catch { return null; }
}

/** Website + Unterseiten lesen und auswerten → { weekly, init, pages } */
export async function crawlSpace(baseUrl, fetchImpl = fetchText) {
  const base = new URL(baseUrl);
  const candidates = [];
  let initFound = null, pages = 0;
  for (const p of PATHS) {
    const url = new URL(p, base.origin + (base.pathname.endsWith('/') ? base.pathname : base.pathname + '/')).href;
    const text = await fetchImpl(p === '/' ? baseUrl : url);
    if (!text) continue;
    pages++;
    candidates.push(...extractWeeklyCandidates(text).map(c => ({ ...c, page: url })));
    const i = extractInit(text);
    if (i && (!initFound || (i.confidence === 'high' && initFound.confidence !== 'high'))) initFound = { ...i, page: url };
    if (fetchImpl === fetchText) await sleep(DELAY_MS);
  }
  return { weekly: pickWeekly(candidates), init: initFound, pages };
}

/** Log-Hinweis: sicherer Fund bei vorhandenem Wert heißt „vorhanden, nicht überschrieben“, nicht „unsicher“ (pure) */
export function weeklyHint(space, w) {
  if (w.confidence === 'high' && !isWeeklyPlaceholder(space.weekly)) return `Weekly gefunden (${w.confidence}), bei uns vorhanden — nicht überschrieben (--force)`;
  return `Weekly ${w.confidence}${w.reason ? ` (${w.reason})` : ''}`;
}
export function initHint(space, i) {
  if (i.confidence === 'high' && !isInitPlaceholder(space.dates?.['space.init'])) return `Gründung gefunden (${i.confidence}), bei uns vorhanden — nicht überschrieben (--force)`;
  return `Gründung ${i.confidence}`;
}

const fmtTime = t => String(t).padStart(4, '0').replace(/(\d\d)(\d\d)/, '$1:$2');

/** Issue-Text (pure): enthält den JSON-Block, den Admin + Apply-Skript lesen */
export function buildIssue(space, found, delta, supersedes = []) {
  let body = `## Treffen-Vorschlag: ${space.name}\n\n**ID:** ${space.ID}\n**Website:** ${space.link.url}\n`;
  if (supersedes.length) body += `**Ersetzt:** ${supersedes.map(n => '#' + n).join(', ')}\n`;
  body += '\n### Gefunden\n| Was | Wert | Confidence | Quelle |\n|-----|------|------------|--------|\n';
  if (delta.weekly) body += `| Weekly | ${WEEKDAY_NAMES[delta.weekly.weekday]} ${fmtTime(delta.weekly.time)} | ${found.weekly.confidence} | ${found.weekly.source.replace(/\|/g, '/')} |\n`;
  if (delta['space.init']) body += `| Gründung | ${delta['space.init']} | ${found.init.confidence} | ${found.init.source.replace(/\|/g, '/')} |\n`;
  body += `\n### Vorgeschlagener Wert\n\`\`\`json\n${JSON.stringify(delta, null, 2)}\n\`\`\`\n`;
  body += '\n---\n*Automatisch generiert von tools/weekly-crawler.js — bitte manuell prüfen*';
  return { title: `${TITLE_PREFIX} ${space.name}`, body };
}

function createIssue(title, body) {
  const tmp = path.join(ROOT, `.issue-body-weekly.md`);
  try {
    fs.writeFileSync(tmp, body, 'utf8');
    const out = execFileSync('gh', ['issue', 'create', '--title', title, '--body-file', tmp, '--label', ISSUE_LABEL], { cwd: ROOT, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
    const m = out.match(/issues\/(\d+)/);
    return m ? Number(m[1]) : true;
  } catch (err) { console.error(`   Fehler beim Issue-Erstellen: ${err.message.split('\n')[0]}`); return false; }
  finally { try { fs.unlinkSync(tmp); } catch { /* ignore */ } }
}

async function main() {
  const args = process.argv.slice(2);
  const createIssues = args.includes('--create-issues'), force = args.includes('--force');
  const limit = args.includes('--limit') ? parseInt(args[args.indexOf('--limit') + 1], 10) : 0;
  const targetId = args.includes('--id') ? parseInt(args[args.indexOf('--id') + 1], 10) : 0;

  console.log('=== Makerspace Weekly/Gründung Crawler ===');
  console.log(`Modus: ${createIssues ? 'Issues erstellen' : 'Dry-Run (--create-issues zum Erstellen)'}${force ? ' · --force' : ''}\n`);

  let spaces = loadMergedLocations(ROOT).filter(s => s.link?.url);
  if (targetId) spaces = spaces.filter(s => s.ID === targetId);
  // Standard: nur Spaces mit Platzhalter bei Weekly oder Gründung
  else if (!force) spaces = spaces.filter(s => isWeeklyPlaceholder(s.weekly) || isInitPlaceholder(s.dates?.['space.init']));
  if (limit) spaces = spaces.slice(0, limit);
  const issuesBySpace = loadSpaceIssues({ label: ISSUE_LABEL, prefix: TITLE_PREFIX, required: createIssues, root: ROOT });
  console.log(`${spaces.length} Spaces zu verarbeiten\n`);

  const stats = { total: spaces.length, found: 0, unchanged: 0, issues: 0, weak: 0, none: 0 };
  for (const [i, space] of spaces.entries()) {
    console.log(`[${i + 1}/${spaces.length}] ${space.name}  ${space.link.url}`);
    let found;
    try { found = await crawlSpace(space.link.url); } catch (err) { console.log(`   SKIP: ${err.message}`); continue; }
    const delta = weeklyDelta(space, found, { force });
    const key = deltaKey(delta);
    if (!key) {
      const hint = [found.weekly && weeklyHint(space, found.weekly), found.init && initHint(space, found.init)].filter(Boolean).join(', ');
      if (hint) { stats.weak++; console.log(`   kein Vorschlag — nur unsicher: ${hint}`); } else { stats.none++; console.log('   nichts gefunden'); }
      continue;
    }
    stats.found++;
    const d = decideProposal({ kind: 'weekly', found: key, integrated: null, issues: issuesBySpace.get(space.ID) || [] });
    console.log(`   -> ${JSON.stringify(delta)}`);
    if (d.action === 'skip') { stats.unchanged++; console.log(`   kein Vorschlag: ${d.reason}`); continue; }
    if (!createIssues) { console.log(`   würde vorschlagen (${d.reason}${d.supersede.length ? `, ersetzt ${d.supersede.map(n => '#' + n).join(', ')}` : ''})`); continue; }
    const { title, body } = buildIssue(space, found, delta, d.supersede);
    const n = createIssue(title, body);
    if (n) { stats.issues++; console.log(`   Issue ${typeof n === 'number' ? '#' + n + ' ' : ''}erstellt`); if (typeof n === 'number') closeSuperseded(d.supersede, n, ROOT); }
  }
  console.log(`\n${'='.repeat(50)}\nGesamt ${stats.total} · mit Vorschlag ${stats.found} · unverändert ${stats.unchanged} · nur unsicher ${stats.weak} · nichts ${stats.none} · Issues ${stats.issues}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(err => { console.error('Fataler Fehler:', err); process.exit(1); });
}
