// tools/apply-calendar-issues.js
// Liest offene GitHub Issues mit Label "data-update" und Titel "Kalenderlink:*",
// parst die vorgeschlagene events-URL und traegt sie optional in locations.json ein.
//
// Usage:
//   node tools/apply-calendar-issues.js           # Dry-Run
//   node tools/apply-calendar-issues.js --apply   # Aenderungen anwenden + Issues schliessen
//   node tools/apply-calendar-issues.js --id 235  # Nur Issue fuer Space-ID 235

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// === CLI Args ===

const args = process.argv.slice(2);
const applyMode = args.includes('--apply');
const closeNulls = args.includes('--close-nulls');
const reportMode = args.includes('--report');
const idIndex = args.indexOf('--id');
const targetId = idIndex !== -1 ? parseInt(args[idIndex + 1], 10) : 0;

// === GitHub Issues laden ===

function fetchIssues() {
  const raw = execSync(
    'gh issue list --label data-update --state open --json number,title,body --limit 200',
    { cwd: path.join(__dirname, '..'), encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }
  );
  return JSON.parse(raw);
}

// === Issue-Body parsen ===

const RE_ID          = /\*\*ID:\*\*\s*(\d+)/;
const RE_WEBSITE     = /\*\*Website:\*\*\s*(https?:\/\/\S+)/;
const RE_EVENTS      = /```json\s*\{\s*"events":\s*"([^"]+)"\s*\}\s*```/s;
const RE_CONFIDENCE  = /\|\s*(high|medium|low)\s*\|/i;
const RE_ALTERNATIVES = /### (?:Weitere gefundene Links|Kein eigener Kalender.*)\n\|[^\n]+\n\|[^\n]+\n([\s\S]*?)(?:\n###|\n---|\n$)/;

function parseIssue(issue) {
  if (!issue.title.startsWith('Kalenderlink:')) return null;

  const idMatch     = issue.body.match(RE_ID);
  const eventsMatch = issue.body.match(RE_EVENTS);

  if (!idMatch) return null;     // Kein ID-Block — kaputtes Issue
  if (!eventsMatch) return null; // Kein JSON-Block — calendar_url war null

  return {
    issueNumber : issue.number,
    spaceId     : parseInt(idMatch[1], 10),
    eventsUrl   : eventsMatch[1],
  };
}

function parseIssueFullInfo(issue) {
  if (!issue.title.startsWith('Kalenderlink:')) return null;

  const idMatch         = issue.body.match(RE_ID);
  const websiteMatch    = issue.body.match(RE_WEBSITE);
  const eventsMatch     = issue.body.match(RE_EVENTS);
  const confidenceMatch = issue.body.match(RE_CONFIDENCE);
  const altMatch        = issue.body.match(RE_ALTERNATIVES);

  if (!idMatch) return null;

  const altCount = altMatch
    ? altMatch[1].trim().split('\n').filter(l => l.startsWith('|')).length
    : 0;

  return {
    issueNumber : issue.number,
    name        : issue.title.replace('Kalenderlink: ', ''),
    spaceId     : idMatch ? parseInt(idMatch[1], 10) : null,
    website     : websiteMatch ? websiteMatch[1] : '?',
    eventsUrl   : eventsMatch ? eventsMatch[1] : null,
    confidence  : confidenceMatch ? confidenceMatch[1].toLowerCase() : null,
    altCount,
  };
}

// === Issue schliessen ===

function closeIssue(number) {
  execSync(
    `gh issue close ${number} --comment "Angewendet auf locations.json"`,
    { cwd: path.join(__dirname, '..'), stdio: 'pipe' }
  );
}

// === Main ===

async function main() {
  console.log('=== Apply Calendar Issues ===');
  console.log(`Modus: ${applyMode ? 'APPLY (schreibt locations.json + schliesst Issues)' : 'Dry-Run (--apply zum Anwenden)'}${closeNulls ? ' + --close-nulls' : ''}`);
  if (targetId) console.log(`Filter: Space-ID ${targetId}`);
  console.log('');

  // 1. Issues laden
  let issues;
  try {
    issues = fetchIssues();
  } catch (err) {
    console.error('Fehler beim Laden der Issues (gh CLI verfuegbar?):', err.message);
    process.exit(1);
  }
  console.log(`${issues.length} offene data-update Issues gefunden\n`);

  // 2. Report
  if (reportMode) {
    const all = issues.map(parseIssueFullInfo).filter(Boolean);

    const noUrl       = all.filter(i => !i.eventsUrl);
    const lowConf     = all.filter(i => i.eventsUrl && i.confidence === 'low');
    const multiAlt    = all.filter(i => i.eventsUrl && i.confidence !== 'low' && i.altCount >= 3);

    const printGroup = (title, items) => {
      if (items.length === 0) return;
      console.log(`\n## ${title} (${items.length})\n`);
      for (const i of items) {
        const conf = i.confidence ? ` [${i.confidence}]` : '';
        const alts = i.altCount > 0 ? ` (${i.altCount} Alternativen)` : '';
        const url  = i.eventsUrl || '—';
        console.log(`  #${i.issueNumber} ${i.name}`);
        console.log(`    Website:  ${i.website}`);
        console.log(`    Vorschlag:${conf} ${url}${alts}`);
      }
    };

    printGroup('Kein Kalenderlink gefunden (null)', noUrl);
    printGroup('Niedrige Konfidenz', lowConf);
    printGroup('Mehrere Alternativen (unsicher)', multiAlt);

    console.log(`\n---\nGesamt Issues: ${all.length} | Kein URL: ${noUrl.length} | Low: ${lowConf.length} | Unsicher: ${multiAlt.length}`);
    return;
  }

  // Parsen (Apply-Modus)
  const kalenderIssues = issues.filter(i => i.title.startsWith('Kalenderlink:'));
  let parsed = kalenderIssues.map(parseIssue).filter(Boolean);

  if (targetId) {
    parsed = parsed.filter(p => p.spaceId === targetId);
  }

  // --close-nulls: Issues ohne JSON-Block schliessen
  if (closeNulls) {
    const nullIssues = kalenderIssues.filter(i => !RE_EVENTS.test(i.body));
    console.log(`${nullIssues.length} Issues ohne Kalenderlink-URL gefunden`);
    for (const issue of nullIssues) {
      try {
        execSync(
          `gh issue close ${issue.number} --comment "Kein Kalenderlink gefunden — automatisch geschlossen"`,
          { cwd: path.join(__dirname, '..'), stdio: 'pipe' }
        );
        console.log(`   #${issue.number} geschlossen: ${issue.title}`);
      } catch (err) {
        console.error(`   #${issue.number} Fehler: ${err.message}`);
      }
    }
    console.log('');
  }

  if (parsed.length === 0) {
    console.log('Keine passenden Issues gefunden.');
    return;
  }

  // 3. locations.json laden
  const locationsPath = path.join(__dirname, '..', 'locations.json');
  const locations = JSON.parse(fs.readFileSync(locationsPath, 'utf8'));
  const byId = new Map(locations.map(loc => [loc.ID, loc]));

  // 4. Jedes Issue auswerten
  const stats = { total: parsed.length, applied: 0, skipped_already_set: 0, skipped_not_found: 0, errors: 0 };
  const toApply = [];

  for (const { issueNumber, spaceId, eventsUrl } of parsed) {
    const loc = byId.get(spaceId);

    if (!loc) {
      console.log(`[#${issueNumber}] ID ${spaceId}: NICHT in locations.json gefunden — uebersprungen`);
      stats.skipped_not_found++;
      continue;
    }

    if (loc.events) {
      console.log(`[#${issueNumber}] ${loc.name} (ID ${spaceId}): events bereits gesetzt ("${loc.events}") — uebersprungen`);
      stats.skipped_already_set++;
      continue;
    }

    console.log(`[#${issueNumber}] ${loc.name} (ID ${spaceId})`);
    console.log(`   events: "${eventsUrl}"`);

    toApply.push({ loc, eventsUrl, issueNumber, name: loc.name, spaceId });
  }

  // 5. Zusammenfassung
  console.log('');
  console.log('='.repeat(50));
  console.log(`Zu aendern:          ${toApply.length}`);
  console.log(`Bereits gesetzt:     ${stats.skipped_already_set}`);
  console.log(`ID nicht gefunden:   ${stats.skipped_not_found}`);
  console.log('='.repeat(50));
  console.log('');

  if (toApply.length === 0) {
    console.log('Nichts zu tun.');
    return;
  }

  if (!applyMode) {
    console.log('Dry-Run — keine Aenderungen. Mit --apply ausfuehren um anzuwenden.');
    return;
  }

  // 6. Aenderungen anwenden
  console.log('Wende Aenderungen an...\n');

  for (const { loc, eventsUrl, issueNumber, name, spaceId } of toApply) {
    loc.events = eventsUrl;

    try {
      closeIssue(issueNumber);
      console.log(`[#${issueNumber}] ${name} (ID ${spaceId}): events gesetzt, Issue geschlossen`);
      stats.applied++;
    } catch (err) {
      console.error(`[#${issueNumber}] Fehler beim Schliessen: ${err.message}`);
      stats.errors++;
    }
  }

  // 7. locations.json einmal schreiben
  if (stats.applied > 0) {
    fs.writeFileSync(locationsPath, JSON.stringify(locations, null, 2) + '\n', 'utf8');
    console.log(`\nlocations.json aktualisiert (${stats.applied} Eintraege geaendert)`);
  }

  // 8. Abschlussbericht
  console.log('');
  console.log('='.repeat(50));
  console.log('ABSCHLUSSBERICHT');
  console.log('='.repeat(50));
  console.log(`Gesamt verarbeitet:  ${stats.total}`);
  console.log(`Angewendet:          ${stats.applied}`);
  console.log(`Bereits gesetzt:     ${stats.skipped_already_set}`);
  console.log(`ID nicht gefunden:   ${stats.skipped_not_found}`);
  console.log(`Fehler:              ${stats.errors}`);
}

main().catch(err => {
  console.error('Fataler Fehler:', err);
  process.exit(1);
});
