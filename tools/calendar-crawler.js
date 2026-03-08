// tools/calendar-crawler.js - Makerspace Calendar Link Crawler
// Crawlt Makerspace-Websites nach Kalender-/Eventseiten
// und erstellt GitHub Issues mit Vorschlaegen zur manuellen Pruefung.
//
// Usage:
//   node tools/calendar-crawler.js                        # Dry-Run (Default)
//   node tools/calendar-crawler.js --create-issues        # Issues erstellen
//   node tools/calendar-crawler.js --limit 5              # Nur 5 Spaces
//   node tools/calendar-crawler.js --id 42                # Nur Space mit ID 42

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// === Konfiguration ===

const TIMEOUT_MS = 30000;
const PROBE_TIMEOUT_MS = 5000;
const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 3000;
const DELAY_BETWEEN_FETCHES_MS = 500;
const DELAY_BETWEEN_PROBES_MS = 100;
const DELAY_BETWEEN_API_CALLS_MS = 200;
const MAX_TEXT_LENGTH = 4000;
const MAX_CANDIDATE_LINKS = 20;
const CLAUDE_MODEL = 'claude-haiku-4-5-20251001';
const CLAUDE_API_URL = 'https://api.anthropic.com/v1/messages';
const ISSUE_LABEL = 'data-update';

const CALENDAR_KEYWORDS = [
  'calendar', 'events', 'termine', 'veranstaltungen', 'agenda',
  'kalender', 'treffen', 'workshop', 'workshops', 'programm',
];

const PROBE_PATHS = [
  '/events', '/calendar', '/termine', '/veranstaltungen',
  '/agenda', '/kalender', '/workshops', '/news', '/programm', '/treffen',
];

const EXTERNAL_CALENDAR_PATTERNS = [
  'calendar.google.com', 'eventbrite', 'meetup.com', 'fb.com/events',
  'facebook.com/events', 'pretix', '.ics',
];

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

function fetchWithTimeout(url, timeout = TIMEOUT_MS, method = 'GET') {
  return Promise.race([
    fetch(url, {
      method,
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

function htmlToText(html) {
  let text = html;

  text = text.replace(/<script[\s\S]*?<\/script>/gi, '');
  text = text.replace(/<style[\s\S]*?<\/style>/gi, '');
  text = text.replace(/<noscript[\s\S]*?<\/noscript>/gi, '');
  text = text.replace(/<svg[\s\S]*?<\/svg>/gi, '');

  text = text.replace(/<\/(p|div|h[1-6]|li|tr|br|hr|blockquote|section|article|header|main)[\s>]/gi, '\n');
  text = text.replace(/<br\s*\/?>/gi, '\n');

  text = text.replace(/<[^>]+>/g, ' ');

  text = text.replace(/&amp;/g, '&');
  text = text.replace(/&lt;/g, '<');
  text = text.replace(/&gt;/g, '>');
  text = text.replace(/&quot;/g, '"');
  text = text.replace(/&#39;/g, "'");
  text = text.replace(/&nbsp;/g, ' ');
  text = text.replace(/&#\d+;/g, '');
  text = text.replace(/&\w+;/g, '');

  text = text.replace(/[ \t]+/g, ' ');
  text = text.replace(/\n\s*\n/g, '\n');
  text = text.trim();

  if (text.length > MAX_TEXT_LENGTH) {
    text = text.substring(0, MAX_TEXT_LENGTH) + '\n[...]';
  }

  return text;
}

// === Link Extraction ===

function isExternalCalendar(url) {
  return EXTERNAL_CALENDAR_PATTERNS.some(p => url.includes(p));
}

function scoreLink(href, anchorText) {
  const combined = (href + ' ' + anchorText).toLowerCase();
  let score = 0;
  for (const kw of CALENDAR_KEYWORDS) {
    if (combined.includes(kw)) score++;
  }
  return score;
}

function extractCalendarLinks(html, baseUrl) {
  let base;
  try {
    base = new URL(baseUrl);
  } catch {
    return { internal: [], external: [] };
  }

  const linkRegex = /<a\s[^>]*href\s*=\s*["']?([^"'\s>]+)["']?[^>]*>([\s\S]*?)<\/a>/gi;
  const seen = new Set();
  const internal = [];
  const external = [];

  let match;
  while ((match = linkRegex.exec(html)) !== null) {
    const rawHref = match[1];
    const anchorText = match[2].replace(/<[^>]+>/g, '').trim();

    if (!rawHref || rawHref.startsWith('#') || rawHref.startsWith('javascript:') ||
        rawHref.startsWith('mailto:') || rawHref.startsWith('tel:')) {
      continue;
    }

    let resolved;
    try {
      resolved = new URL(rawHref, base).href;
    } catch {
      continue;
    }

    if (seen.has(resolved)) continue;
    seen.add(resolved);

    const score = scoreLink(rawHref, anchorText);

    if (isExternalCalendar(resolved)) {
      external.push({ url: resolved, score, anchorText });
      continue;
    }

    let resolvedHost;
    try {
      resolvedHost = new URL(resolved).hostname;
    } catch {
      continue;
    }

    if (resolvedHost !== base.hostname) continue;

    if (score > 0) {
      internal.push({ url: resolved, score, anchorText });
    }
  }

  internal.sort((a, b) => b.score - a.score);
  external.sort((a, b) => b.score - a.score);

  return {
    internal: internal.slice(0, MAX_CANDIDATE_LINKS).map(l => l.url),
    external: external.slice(0, 10).map(l => l.url),
  };
}

// === Common Path Probing ===

async function probeCommonPaths(baseUrl) {
  let origin;
  try {
    origin = new URL(baseUrl).origin;
  } catch {
    return [];
  }

  const found = [];
  for (const probePath of PROBE_PATHS) {
    const url = origin + probePath;
    try {
      const response = await fetchWithTimeout(url, PROBE_TIMEOUT_MS, 'HEAD');
      if (response.ok) {
        found.push(url);
      }
    } catch {
      // ignore
    }
    await sleep(DELAY_BETWEEN_PROBES_MS);
  }
  return found;
}

// === Claude API ===

async function findCalendarWithClaude(spaceName, candidateUrls, pageTextSnippet, apiKey) {
  const candidateList = candidateUrls.map((u, i) => `${i + 1}. ${u}`).join('\n');

  const prompt = `Du hilfst dabei, den Kalender- oder Veranstaltungslink eines Makerspaces zu finden.

Makerspace: "${spaceName}"

Kandidaten-URLs (aus der Website extrahiert oder durch Pfad-Probing gefunden):
${candidateList}

Erste 800 Zeichen des Website-Texts (nur zur Orientierung):
${pageTextSnippet.substring(0, 800)}

Aufgabe: Waehle aus den Kandidaten-URLs diejenige aus, die am wahrscheinlichsten die Kalender- oder Veranstaltungsseite des Makerspaces ist.

Regeln:
- Waehle NUR aus der obigen Liste — erfinde keine URLs
- Bevorzuge eigene Seiten (z.B. /termine, /events) gegenueber externen Diensten
- Externe Dienste (Google Calendar, Eventbrite, Meetup, etc.) kommen in "alternatives", nicht in "calendar_url"
- Wenn keine URL passt oder du unsicher bist: calendar_url = null
- Lieber null als eine falsche URL

Antworte NUR mit einem JSON-Objekt:
{
  "calendar_url": "<beste eigene URL oder null>",
  "confidence": "<high|medium|low>",
  "reason": "<max 100 Zeichen Begruendung>",
  "alternatives": ["<weitere gefundene URLs>"]
}`;

  const response = await fetch(CLAUDE_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: CLAUDE_MODEL,
      max_tokens: 250,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Claude API ${response.status}: ${errorText}`);
  }

  const data = await response.json();
  const text = data.content[0].text;

  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error('Kein JSON in Claude-Antwort gefunden');
  }

  return JSON.parse(jsonMatch[0]);
}

// === GitHub Issue erstellen ===

function detectExternalService(url) {
  if (url.includes('calendar.google.com')) return 'Google Calendar';
  if (url.includes('eventbrite')) return 'Eventbrite';
  if (url.includes('meetup.com')) return 'Meetup';
  if (url.includes('fb.com/events') || url.includes('facebook.com/events')) return 'Facebook Events';
  if (url.includes('pretix')) return 'pretix';
  if (url.includes('.ics')) return 'ICS-Feed';
  return null;
}

function createGitHubIssue(space, calendarUrl, confidence, reason, alternatives) {
  let body = `## Kalenderlink-Vorschlag: ${space.name}\n\n`;
  body += `**ID:** ${space.ID}\n`;
  body += `**Website:** ${space.link.url}\n\n`;

  if (calendarUrl) {
    body += `### Gefundener Kalenderlink\n`;
    body += `| URL | Confidence | Grund |\n|-----|------------|-------|\n`;
    body += `| ${calendarUrl} | ${confidence} | ${reason || '-'} |\n\n`;
  }

  if (alternatives && alternatives.length > 0) {
    const header = calendarUrl
      ? `### Weitere gefundene Links`
      : `### Kein eigener Kalender gefunden — externe Dienste`;
    body += `${header}\n`;
    body += `| URL | Dienst |\n|-----|--------|\n`;
    for (const alt of alternatives) {
      const service = detectExternalService(alt) || '-';
      body += `| ${alt} | ${service} |\n`;
    }
    body += '\n';
  }

  if (calendarUrl) {
    body += `### Vorgeschlagener Wert\n`;
    body += `\`\`\`json\n`;
    body += JSON.stringify({ events: calendarUrl }, null, 2);
    body += `\n\`\`\`\n`;
  }

  body += `\n---\n*Automatisch generiert von tools/calendar-crawler.js — bitte manuell pruefen*`;

  const title = `Kalenderlink: ${space.name}`;
  const tmpFile = path.join(__dirname, '..', `.issue-body-${space.ID}.md`);

  try {
    fs.writeFileSync(tmpFile, body, 'utf8');
    execSync(
      `gh issue create --title "${title.replace(/"/g, '\\"')}" --body-file "${tmpFile}" --label "${ISSUE_LABEL}"`,
      { cwd: path.join(__dirname, '..'), stdio: 'pipe' }
    );
    return true;
  } catch (error) {
    console.error(`   Fehler beim Issue-Erstellen: ${error.message}`);
    return false;
  } finally {
    try { fs.unlinkSync(tmpFile); } catch { /* ignore */ }
  }
}

// === Main ===

async function main() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error('Fehler: ANTHROPIC_API_KEY Environment-Variable nicht gesetzt.');
    console.error('Usage: ANTHROPIC_API_KEY=sk-... node tools/calendar-crawler.js');
    process.exit(1);
  }

  console.log('=== Makerspace Calendar Link Crawler ===');
  console.log(`Modus: ${createIssues ? 'Issues erstellen' : 'Dry-Run (--create-issues zum Erstellen)'}`);
  if (limit) console.log(`Limit: ${limit} Spaces`);
  if (targetId) console.log(`Ziel-ID: ${targetId}`);
  console.log('');

  const locationsPath = path.join(__dirname, '..', 'locations.json');
  const locations = JSON.parse(fs.readFileSync(locationsPath, 'utf8'));

  let spaces = locations.slice(1);

  if (targetId) {
    spaces = spaces.filter(s => s.ID === targetId);
    if (spaces.length === 0) {
      console.error(`Kein Space mit ID ${targetId} gefunden.`);
      process.exit(1);
    }
  } else {
    // Nur Spaces ohne events-Feld und mit Website
    spaces = spaces.filter(s => !s.events && s.link && s.link.url);
  }

  if (limit && limit < spaces.length) {
    spaces = spaces.slice(0, limit);
  }

  console.log(`${spaces.length} Spaces zu verarbeiten\n`);

  const stats = { total: spaces.length, fetched: 0, analyzed: 0, findings: 0, issues: 0, errors: 0 };

  for (let i = 0; i < spaces.length; i++) {
    const space = spaces[i];
    const progress = `[${i + 1}/${spaces.length}]`;

    console.log(`${progress} ${space.name}`);
    console.log(`   URL: ${space.link.url}`);

    // 1. Website fetchen (HTML fuer Link-Extraktion)
    let html;
    let pageText;
    try {
      const response = await fetchWithRetry(space.link.url);
      if (!response.ok) {
        console.log(`   SKIP: HTTP ${response.status}`);
        stats.errors++;
        await sleep(DELAY_BETWEEN_FETCHES_MS);
        continue;
      }
      html = await response.text();
      pageText = htmlToText(html);
      stats.fetched++;
      console.log(`   Fetched: ${html.length} Zeichen HTML`);
    } catch (error) {
      console.log(`   SKIP: ${error.message}`);
      stats.errors++;
      await sleep(DELAY_BETWEEN_FETCHES_MS);
      continue;
    }

    await sleep(DELAY_BETWEEN_FETCHES_MS);

    // 2. Links aus HTML extrahieren
    const { internal: internalLinks, external: externalLinks } = extractCalendarLinks(html, space.link.url);
    console.log(`   Links: ${internalLinks.length} intern, ${externalLinks.length} extern`);

    // 3. Bekannte Pfade proben
    const probedPaths = await probeCommonPaths(space.link.url);
    if (probedPaths.length > 0) {
      console.log(`   Probed: ${probedPaths.length} Pfade gefunden`);
    }

    // 4. Kandidaten zusammenfuehren und deduplizieren
    const allInternal = [...new Set([...internalLinks, ...probedPaths])];
    const allCandidates = [...allInternal, ...externalLinks];

    if (allCandidates.length === 0) {
      console.log(`   Keine Kandidaten gefunden — uebersprungen`);
      continue;
    }

    await sleep(DELAY_BETWEEN_FETCHES_MS);

    // 5. Claude entscheiden lassen
    let result;
    try {
      result = await findCalendarWithClaude(space.name, allCandidates, pageText, apiKey);
      stats.analyzed++;
    } catch (error) {
      console.log(`   API-Fehler: ${error.message}`);
      stats.errors++;
      await sleep(DELAY_BETWEEN_API_CALLS_MS);
      continue;
    }

    await sleep(DELAY_BETWEEN_API_CALLS_MS);

    // 6. Ergebnis pruefen
    const { calendar_url, confidence, reason, alternatives = [] } = result;

    if (!calendar_url && alternatives.length === 0) {
      console.log(`   Kein Kalenderlink gefunden`);
      continue;
    }

    stats.findings++;

    if (calendar_url) {
      console.log(`   -> Kalender: ${calendar_url} (${confidence})`);
      if (reason) console.log(`      "${reason}"`);
    } else {
      console.log(`   -> Nur externe Dienste gefunden`);
    }
    if (alternatives.length > 0) {
      console.log(`   -> Alternativen: ${alternatives.join(', ')}`);
    }

    // 7. Issue erstellen
    if (createIssues) {
      const ok = createGitHubIssue(space, calendar_url, confidence, reason, alternatives);
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
