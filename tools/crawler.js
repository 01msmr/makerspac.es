// tools/crawler.js - Makerspace Website Crawler
// Crawlt Makerspace-Websites nach fehlenden Daten (Weekly Meeting, Gruendungsdatum)
// und erstellt GitHub Issues mit Vorschlaegen zur manuellen Pruefung.
//
// Usage:
//   node tools/crawler.js                        # Dry-Run (Default)
//   node tools/crawler.js --create-issues        # Issues erstellen
//   node tools/crawler.js --limit 5              # Nur 5 Spaces
//   node tools/crawler.js --id 42                # Nur Space mit ID 42

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// === Konfiguration ===

const TIMEOUT_MS = 30000;
const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 3000;
const DELAY_BETWEEN_FETCHES_MS = 500;
const DELAY_BETWEEN_API_CALLS_MS = 200;
const MAX_TEXT_LENGTH = 4000;
const CLAUDE_MODEL = 'claude-haiku-4-5-20251001';
const CLAUDE_API_URL = 'https://api.anthropic.com/v1/messages';
const ISSUE_LABEL = 'data-update';

// === CLI Args ===

const args = process.argv.slice(2);
const createIssues = args.includes('--create-issues');
const limitIndex = args.indexOf('--limit');
const limit = limitIndex !== -1 ? parseInt(args[limitIndex + 1], 10) : 0;
const idIndex = args.indexOf('--id');
const targetId = idIndex !== -1 ? parseInt(args[idIndex + 1], 10) : 0;

// === Helpers ===

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function fetchWithTimeout(url, timeout = TIMEOUT_MS) {
  return Promise.race([
    fetch(url, {
      headers: {
        'User-Agent': 'makerspaces-crawler/1.0 (https://makerspac.es; data enrichment)',
        'Accept': 'text/html,application/xhtml+xml',
      },
    }),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Timeout')), timeout)
    ),
  ]);
}

async function fetchWithRetry(url, retries = MAX_RETRIES) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const response = await fetchWithTimeout(url, TIMEOUT_MS);
      return response;
    } catch (error) {
      if (attempt < retries) {
        await sleep(RETRY_DELAY_MS);
      } else {
        throw error;
      }
    }
  }
}

// === HTML zu Text ===

function htmlToText(html) {
  let text = html;

  // Block-Elemente entfernen die keinen nuetzlichen Content haben
  text = text.replace(/<script[\s\S]*?<\/script>/gi, '');
  text = text.replace(/<style[\s\S]*?<\/style>/gi, '');
  text = text.replace(/<noscript[\s\S]*?<\/noscript>/gi, '');
  text = text.replace(/<svg[\s\S]*?<\/svg>/gi, '');

  // Block-Elemente durch Zeilenumbrueche ersetzen
  text = text.replace(/<\/(p|div|h[1-6]|li|tr|br|hr|blockquote|section|article|header|main)[\s>]/gi, '\n');
  text = text.replace(/<br\s*\/?>/gi, '\n');

  // Alle verbleibenden Tags entfernen
  text = text.replace(/<[^>]+>/g, ' ');

  // HTML-Entities decodieren
  text = text.replace(/&amp;/g, '&');
  text = text.replace(/&lt;/g, '<');
  text = text.replace(/&gt;/g, '>');
  text = text.replace(/&quot;/g, '"');
  text = text.replace(/&#39;/g, "'");
  text = text.replace(/&nbsp;/g, ' ');
  text = text.replace(/&#\d+;/g, '');
  text = text.replace(/&\w+;/g, '');

  // Whitespace normalisieren
  text = text.replace(/[ \t]+/g, ' ');
  text = text.replace(/\n\s*\n/g, '\n');
  text = text.trim();

  // Auf max. Laenge kuerzen
  if (text.length > MAX_TEXT_LENGTH) {
    text = text.substring(0, MAX_TEXT_LENGTH) + '\n[...]';
  }

  return text;
}

// === Claude API ===

async function analyzeWithClaude(spaceName, websiteText, apiKey) {
  const prompt = `Analysiere den folgenden Website-Text eines Makerspaces namens "${spaceName}".

Suche nach diesen Informationen:

1. **Regelmaessiges offenes Treffen / Open Lab / Offener Abend**: An welchem Wochentag findet es statt und um welche Uhrzeit?
   - Wochentag als Zahl im JavaScript getDay()-Format: 0=Sonntag, 1=Montag, 2=Dienstag, 3=Mittwoch, 4=Donnerstag, 5=Freitag, 6=Samstag
   - Uhrzeit im HHMM-Format (z.B. 1900 fuer 19:00 Uhr)

2. **Gruendungsjahr/-datum**: Wann wurde der Makerspace gegruendet?
   - Im YYYYMMDD-Format (z.B. 20150301 fuer 1. Maerz 2015)
   - Wenn nur das Jahr bekannt ist: YYYY0000 (z.B. 20150000)

Antworte NUR mit einem JSON-Objekt in diesem Format:
{
  "weekly_weekday": <0-6 oder null wenn nicht gefunden>,
  "weekly_time": <HHMM oder null wenn nicht gefunden>,
  "space_init": <YYYYMMDD oder null wenn nicht gefunden>,
  "weekly_confidence": "<high|medium|low>",
  "init_confidence": "<high|medium|low>",
  "weekly_source": "<kurzes Zitat von der Website>",
  "init_source": "<kurzes Zitat von der Website>"
}

Setze Felder auf null wenn die Information nicht auf der Website zu finden ist.

Website-Text:
${websiteText}`;

  const response = await fetch(CLAUDE_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: CLAUDE_MODEL,
      max_tokens: 300,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Claude API ${response.status}: ${errorText}`);
  }

  const data = await response.json();
  const text = data.content[0].text;

  // JSON aus der Antwort extrahieren
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error('Kein JSON in Claude-Antwort gefunden');
  }

  return JSON.parse(jsonMatch[0]);
}

// === GitHub Issue erstellen ===

function createGitHubIssue(space, findings) {
  const weekdayNames = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];

  let body = `## Datenvorschlag fuer: ${space.name}\n\n`;
  body += `**ID:** ${space.ID}\n`;
  body += `**Website:** ${space.link.url}\n\n`;

  body += `### Aktuelle Daten\n`;
  body += `| Feld | Wert |\n|------|------|\n`;
  body += `| Weekly Weekday | ${space.weekly.weekday} (${space.weekly.weekday === 0 ? 'nicht gesetzt' : weekdayNames[space.weekly.weekday]}) |\n`;
  body += `| Weekly Time | ${space.weekly.time || 'nicht gesetzt'} |\n`;
  body += `| Space Init | ${space.dates['space.init']} |\n\n`;

  body += `### Gefundene Daten\n`;
  body += `| Feld | Wert | Confidence | Quelle |\n|------|------|------------|--------|\n`;

  if (findings.weekly_weekday !== null) {
    const timeStr = findings.weekly_time ? String(findings.weekly_time).padStart(4, '0').replace(/(\d{2})(\d{2})/, '$1:$2') : '?';
    body += `| Weekly Meeting | ${weekdayNames[findings.weekly_weekday] || '?'} ${timeStr} | ${findings.weekly_confidence} | ${findings.weekly_source || '-'} |\n`;
  }

  if (findings.space_init !== null) {
    body += `| Gruendung | ${findings.space_init} | ${findings.init_confidence} | ${findings.init_source || '-'} |\n`;
  }

  body += `\n### Vorgeschlagene Werte\n`;
  body += `\`\`\`json\n`;

  const suggestion = {};
  if (findings.weekly_weekday !== null) {
    suggestion.weekly = {
      weekday: findings.weekly_weekday,
      time: findings.weekly_time || 0,
    };
  }
  if (findings.space_init !== null) {
    suggestion['dates.space.init'] = findings.space_init;
  }
  body += JSON.stringify(suggestion, null, 2);
  body += `\n\`\`\`\n`;

  body += `\n---\n*Automatisch generiert von tools/crawler.js*`;

  const title = `Datenvorschlag: ${space.name}`;

  try {
    execSync(
      `gh issue create --title "${title.replace(/"/g, '\\"')}" --body "${body.replace(/"/g, '\\"')}" --label "${ISSUE_LABEL}"`,
      { cwd: path.join(__dirname, '..'), stdio: 'pipe' }
    );
    return true;
  } catch (error) {
    console.error(`   Fehler beim Issue-Erstellen: ${error.message}`);
    return false;
  }
}

// === Main ===

async function main() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error('Fehler: ANTHROPIC_API_KEY Environment-Variable nicht gesetzt.');
    console.error('Usage: ANTHROPIC_API_KEY=sk-... node tools/crawler.js');
    process.exit(1);
  }

  console.log('=== Makerspace Website Crawler ===');
  console.log(`Modus: ${createIssues ? 'Issues erstellen' : 'Dry-Run (--create-issues zum Erstellen)'}`);
  if (limit) console.log(`Limit: ${limit} Spaces`);
  if (targetId) console.log(`Ziel-ID: ${targetId}`);
  console.log('');

  // locations.json laden
  const locationsPath = path.join(__dirname, '..', 'locations.json');
  const locations = JSON.parse(fs.readFileSync(locationsPath, 'utf8'));

  // Template (Index 0) ueberspringen, fehlende Daten filtern
  let spaces = locations.slice(1);

  if (targetId) {
    spaces = spaces.filter(s => s.ID === targetId);
    if (spaces.length === 0) {
      console.error(`Kein Space mit ID ${targetId} gefunden.`);
      process.exit(1);
    }
  } else {
    // Nur Spaces mit fehlenden Daten
    spaces = spaces.filter(s =>
      (s.weekly && s.weekly.weekday === 0 && s.weekly.time === 0) ||
      (s.dates && s.dates['space.init'] === 20010000)
    );
  }

  if (limit && limit < spaces.length) {
    spaces = spaces.slice(0, limit);
  }

  console.log(`${spaces.length} Spaces zu verarbeiten\n`);

  const stats = { total: spaces.length, fetched: 0, analyzed: 0, findings: 0, issues: 0, errors: 0 };
  const results = [];

  for (let i = 0; i < spaces.length; i++) {
    const space = spaces[i];
    const progress = `[${i + 1}/${spaces.length}]`;

    console.log(`${progress} ${space.name}`);
    console.log(`   URL: ${space.link.url}`);

    // 1. Website fetchen
    let websiteText;
    try {
      const response = await fetchWithRetry(space.link.url);
      if (!response.ok) {
        console.log(`   SKIP: HTTP ${response.status}`);
        stats.errors++;
        await sleep(DELAY_BETWEEN_FETCHES_MS);
        continue;
      }
      const html = await response.text();
      websiteText = htmlToText(html);

      if (websiteText.length < 50) {
        console.log(`   SKIP: Zu wenig Text (${websiteText.length} Zeichen)`);
        stats.errors++;
        await sleep(DELAY_BETWEEN_FETCHES_MS);
        continue;
      }

      stats.fetched++;
      console.log(`   Fetched: ${websiteText.length} Zeichen`);
    } catch (error) {
      console.log(`   SKIP: ${error.message}`);
      stats.errors++;
      await sleep(DELAY_BETWEEN_FETCHES_MS);
      continue;
    }

    await sleep(DELAY_BETWEEN_FETCHES_MS);

    // 2. Claude analysieren lassen
    let findings;
    try {
      findings = await analyzeWithClaude(space.name, websiteText, apiKey);
      stats.analyzed++;
    } catch (error) {
      console.log(`   API-Fehler: ${error.message}`);
      stats.errors++;
      await sleep(DELAY_BETWEEN_API_CALLS_MS);
      continue;
    }

    await sleep(DELAY_BETWEEN_API_CALLS_MS);

    // 3. Ergebnis pruefen
    const hasFindings = findings.weekly_weekday !== null || findings.space_init !== null;

    if (!hasFindings) {
      console.log(`   Keine relevanten Daten gefunden`);
      continue;
    }

    stats.findings++;
    results.push({ space, findings });

    // Ergebnis anzeigen
    const weekdayNames = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
    if (findings.weekly_weekday !== null) {
      const timeStr = findings.weekly_time ? String(findings.weekly_time).padStart(4, '0').replace(/(\d{2})(\d{2})/, '$1:$2') : '?';
      console.log(`   -> Meeting: ${weekdayNames[findings.weekly_weekday]} ${timeStr} (${findings.weekly_confidence})`);
      if (findings.weekly_source) console.log(`      "${findings.weekly_source}"`);
    }
    if (findings.space_init !== null) {
      console.log(`   -> Gruendung: ${findings.space_init} (${findings.init_confidence})`);
      if (findings.init_source) console.log(`      "${findings.init_source}"`);
    }

    // 4. Issue erstellen
    if (createIssues) {
      const ok = createGitHubIssue(space, findings);
      if (ok) {
        stats.issues++;
        console.log(`   Issue erstellt`);
      }
    }
  }

  // Zusammenfassung
  console.log('\n' + '='.repeat(50));
  console.log('ZUSAMMENFASSUNG');
  console.log('='.repeat(50));
  console.log(`Gesamt:      ${stats.total}`);
  console.log(`Gefetched:   ${stats.fetched}`);
  console.log(`Analysiert:  ${stats.analyzed}`);
  console.log(`Mit Daten:   ${stats.findings}`);
  console.log(`Issues:      ${stats.issues}`);
  console.log(`Fehler:      ${stats.errors}`);

  if (!createIssues && stats.findings > 0) {
    console.log(`\nMit --create-issues ausfuehren um ${stats.findings} Issues zu erstellen.`);
  }
}

main().catch(err => {
  console.error('Fataler Fehler:', err);
  process.exit(1);
});
