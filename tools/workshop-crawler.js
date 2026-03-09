// tools/workshop-crawler.js - Makerspace Workshop Crawler
// Crawlt Makerspace-Websites nach vorhandenen Werkstätten/Equipment.
//
// Kein API-Aufruf — rein keywordbasiert, mit Evidenz-Sammlung.
//
// Usage:
//   node tools/workshop-crawler.js --research          # Analyse + unbekannte Typen
//   node tools/workshop-crawler.js --research --limit 20
//   node tools/workshop-crawler.js --dry-json          # JSON-Diff in workshop-suggestions.json
//   node tools/workshop-crawler.js --create-issues     # GitHub Issues erstellen
//   node tools/workshop-crawler.js --limit 5           # Nur N Spaces
//   node tools/workshop-crawler.js --id 42             # Nur Space mit ID 42
//   node tools/workshop-crawler.js --force             # Auch Spaces mit vorhandenen workshops

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

// Enrichment-Datei
const ENRICHMENT_FILE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'enrichment.json');

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// === Konfiguration ===

const TIMEOUT_MS = 15000;
const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 2000;
const DELAY_BETWEEN_SPACES_MS = 800;
const DELAY_BETWEEN_SUBPAGES_MS = 300;
const ISSUE_LABEL = 'workshop-data';

// Sub-Seiten die häufig Equipment/Ausstattung listen
const EQUIPMENT_PATHS = [
  '/ausstattung', '/equipment', '/maschinen', '/werkzeuge', '/werkstatt',
  '/tools', '/geraete', '/infrastruktur', '/technik', '/hardware',
  '/mitmachen', '/about', '/ueber-uns', '/ueber', '/about-us',
  '/raeume', '/raum', '/spaces', '/facilities',
];

// Bekannte Workshop-Typen (bereits in workshop-types.js definiert)
const WORKSHOP_KEYWORDS = {
  '3d': [
    '3d-drucker', '3d drucker', '3d-druck', '3d druck', '3d printer', '3d printing',
    'fdm drucker', 'fdm-drucker', 'resin drucker', 'sla drucker', 'dlp drucker',
    'filamentdrucker', 'filament drucker', 'additive fertigung',
    'prusa', 'bambulab', 'bambu lab', 'ultimaker', 'creality',
  ],
  'laser': [
    'lasercutter', 'laser cutter', 'lasergravur', 'laser gravur',
    'lasergravierer', 'laser engraver', 'co2-laser', 'co2 laser',
    'laserschneider', 'laser schneider', 'laseranlage', 'laser anlage',
    'trotec', 'epilog laser', 'full spectrum',
  ],
  'electronics': [
    'lötstation', 'loetstation', 'löten', 'loeten', 'lötkolben', 'loetkolben',
    'lötplatz', 'loetplatz', 'elektronikwerkstatt', 'elektronik werkstatt',
    'elektroniklabor', 'elektronik labor', 'lötbereich',
    'oszilloskop', 'oszi', 'multimeter', 'pcb fräse', 'platinenfräse',
    'reflow ofen', 'heißluftlötstation',
  ],
  'coding': [
    'programmierworkshop', 'programmier-workshop', 'hackathon',
    'coding workshop', 'software workshop', 'coding space', 'hack space',
    'code & coffee', 'code and coffee', 'linux workshop', 'python workshop',
    'maker education', 'stem workshop',
  ],
  'vr': [
    'vr-brille', 'vr brille', 'virtual reality', 'vr-headset', 'vr headset',
    'vr-raum', 'vr raum', 'oculus', 'meta quest', 'htc vive', 'valve index',
    'augmented reality', 'mixed reality',
  ],
  'music': [
    'musikstudio', 'musik studio', 'recording studio', 'aufnahmestudio',
    'aufnahme studio', 'tonstudio', 'ton studio', 'synthesizer',
    'midi studio', 'musikproduktion', 'musik produktion',
    'proberaum', 'probe raum', 'drum machine', 'modular synth',
  ],
  'wood': [
    'holzwerkstatt', 'holz werkstatt', 'tischkreissäge', 'tischkreissaege',
    'drechselbank', 'oberfräse', 'oberfraese',
    'bandsäge', 'bandsaege', 'holzbearbeitung', 'holzfräse', 'holzfraese',
    'tischfräse', 'kreissäge', 'stichsäge',
    'woodworking', 'carpentry', 'wood shop', 'woodshop',
  ],
  'metal': [
    'schweißen', 'schweissen', 'schweißgerät', 'schweissgeraet',
    'mig/mag', 'mig-schweißen', 'tig-schweißen', 'wig-schweißen',
    'drehbank', 'metallwerkstatt', 'metall werkstatt',
    'plasmaschneider', 'plasma schneider', 'metallbearbeitung',
    'metallfräse', 'metall fräse', 'cnc drehen',
    'schlosser', 'schmieden', 'schmied',
  ],
  'textile': [
    'nähmaschine', 'naehmaschine', 'nähen', 'naehen', 'stickmaschine',
    'sticken', 'textilwerkstatt', 'textil werkstatt', 'nähwerkstatt',
    'naehwerkstatt', 'webmaschine', 'stricken', 'schneidern',
    'silhouette', 'cricut', 'vinylcutter',
  ],
  'screenprint': [
    'siebdruck', 'siebdruckanlage', 'siebdruck-anlage', 'siebdruck anlage',
    'screen print', 'screenprint', 'siebdruckwerkstatt',
    'risographie', 'riso druck',
  ],
  'cnc': [
    'cnc-fräse', 'cnc fräse', 'cnc-router', 'cnc router',
    'cnc maschine', 'cnc-maschine', 'cnc milling', 'portalfräse',
    'computergesteuertes fräsen', 'cnc gravieren', 'cnc-gravur',
  ],
  'ceramics': [
    'töpferei', 'toepferei', 'töpfern', 'toepfern', 'keramikwerkstatt',
    'brennofen', 'töpferofen', 'töpferscheibe', 'glasur',
    'ceramics', 'pottery', 'kiln', 'keramik werkstatt',
  ],
  'photo': [
    'fotostudio', 'foto studio', 'fotolabor', 'foto labor',
    'dunkelkammer', 'darkroom', 'analoge fotografie',
    'filmentwicklung', 'fotoentwicklung', 'lichtstudio',
    'blitzanlage', 'studiobeleuchtung', 'greenscreen', 'green screen',
    'podcaststudio', 'podcast studio',
  ],
  'bike': [
    'fahrradwerkstatt', 'fahrrad werkstatt', 'fahrrad reparatur',
    'velowerkstatt', 'velo werkstatt', 'fahrrad selbsthilfe',
    'bike repair', 'bike workshop', 'fahrrad selbst reparieren',
  ],
};

// Kandidaten für noch nicht erfasste Workshop-Typen
// Format: 'label' → { keywords: [...], suggestedId: 'id', description: '...' }
const RESEARCH_CANDIDATES = {
  'casting/molding': {
    suggestedId: 'casting',
    description: 'Gießen, Vakuumguss, Silikonformen',
    keywords: [
      'gießen', 'giessen', 'gussformen', 'vakuumguss', 'vakuum guss',
      'silikonformen', 'silikon formen', 'casting', 'molding', 'moulding',
      'resin casting', 'epoxidharz', 'metallguss',
    ],
  },
  'food lab': {
    suggestedId: 'food',
    description: 'Foodlab, Küche, Kochen',
    keywords: [
      'foodlab', 'food lab', 'küchenstudio', 'küche', 'kochen',
      'food hacking', 'food workshop', 'fermentation',
      'gemeinschaftsküche', 'lehrküche',
    ],
  },
  'glass': {
    suggestedId: 'glass',
    description: 'Glaswerkstatt, Glasschneiden, Glasblase',
    keywords: [
      'glaswerkstatt', 'glas werkstatt', 'glasschneiden', 'glas schneiden',
      'glasblase', 'glasblasen', 'glaskünstler', 'glaskunst',
      'glassblowing', 'glass cutting', 'stained glass',
    ],
  },
  'leather': {
    suggestedId: 'leather',
    description: 'Lederwerkstatt, Lederbearbeitung',
    keywords: [
      'lederwerkstatt', 'leder werkstatt', 'lederbearbeitung',
      'leder verarbeitung', 'sattlerei', 'leder nähen',
      'leatherwork', 'leather craft',
    ],
  },
  'plotter/vinyl': {
    suggestedId: 'plotter',
    description: 'Schneideplotter, Folienschneider (über Textile hinaus)',
    keywords: [
      'schneideplotter', 'schneid plotter', 'folienschneider', 'folien schneider',
      'vinylplotter', 'vinyl plotter', 'plotter schneiden',
      'roland plotter', 'graphtec', 'cutting plotter',
    ],
  },
  'bio/chem lab': {
    suggestedId: 'biolab',
    description: 'Biohacking, Chemielabor, Biolabor',
    keywords: [
      'biolabor', 'bio labor', 'chemielabor', 'chemie labor',
      'biohacking', 'bio hacking', 'wetlab', 'wet lab',
      'mikroskop', 'mikrobiologie', 'pcr', 'dna',
    ],
  },
  'ham radio': {
    suggestedId: 'hamradio',
    description: 'Amateurfunk, Funkwerkstatt',
    keywords: [
      'amateurfunk', 'amateur funk', 'funkwerkstatt', 'funk werkstatt',
      'ham radio', 'amateur radio', 'cw morse', 'transceiver',
      'antennenbau', 'sdr', 'software defined radio',
    ],
  },
};

// Muster für "rohe" Equipmentbegriffe (für unbekannte Typen)
// Sucht nach deutschen Komposita mit Equipment-Suffixen
const EQUIPMENT_SUFFIX_PATTERNS = [
  /\b\w{4,}werkstatt\b/g,
  /\b\w{4,}maschine\b/g,
  /\b\w{4,}drucker\b/g,
  /\b\w{4,}fräse\b/g,
  /\b\w{4,}schneider\b/g,
  /\b\w{4,}anlage\b/g,
  /\b\w{4,}labor\b/g,
  /\b\w{4,}studio\b/g,
  /\b\w{4,}gerät\b/g,
  /\b\w{4,}ofen\b/g,
];

// === CLI Args ===

const args = process.argv.slice(2);
const researchMode = args.includes('--research');
const createIssues = args.includes('--create-issues');
const dryJson = args.includes('--dry-json');
const force = args.includes('--force');
const limitIndex = args.indexOf('--limit');
const limit = limitIndex !== -1 ? parseInt(args[limitIndex + 1], 10) : 0;
const idIndex = args.indexOf('--id');
const targetId = idIndex !== -1 ? parseInt(args[idIndex + 1], 10) : 0;

// === Helpers ===

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchWithTimeout(url, timeout = TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'makerspaces-crawler/1.0 (https://makerspac.es; data enrichment)',
        'Accept': 'text/html,application/xhtml+xml,*/*',
      },
      redirect: 'follow',
    });
    clearTimeout(timer);
    return response;
  } catch (err) {
    clearTimeout(timer);
    throw err;
  }
}

async function fetchWithRetry(url, retries = MAX_RETRIES) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await fetchWithTimeout(url);
    } catch (err) {
      if (attempt < retries) await sleep(RETRY_DELAY_MS);
      else throw err;
    }
  }
}

function htmlToText(html) {
  let text = html;
  text = text.replace(/<script[\s\S]*?<\/script>/gi, ' ');
  text = text.replace(/<style[\s\S]*?<\/style>/gi, ' ');
  text = text.replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ');
  text = text.replace(/<svg[\s\S]*?<\/svg>/gi, ' ');
  text = text.replace(/<\/(p|div|h[1-6]|li|tr|br|section|article)[\s>]/gi, '\n');
  text = text.replace(/<br\s*\/?>/gi, '\n');
  text = text.replace(/<[^>]+>/g, ' ');
  text = text.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
             .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ')
             .replace(/&#\d+;/g, '').replace(/&\w+;/g, '');
  text = text.replace(/[ \t]+/g, ' ').replace(/\n\s*\n/g, '\n').trim();
  return text;
}

// Keyword-Matching mit Evidenz-Sammlung
function detectWorkshops(text, sourceLabel) {
  const lower = text.toLowerCase();
  const results = {};

  for (const [type, keywords] of Object.entries(WORKSHOP_KEYWORDS)) {
    const matched = [];
    for (const kw of keywords) {
      if (lower.includes(kw)) matched.push(kw);
    }
    if (matched.length > 0) {
      const idx = lower.indexOf(matched[0]);
      const start = Math.max(0, idx - 60);
      const end = Math.min(text.length, idx + matched[0].length + 60);
      const snippet = text.slice(start, end).replace(/\n/g, ' ').trim();
      results[type] = {
        matches: matched,
        snippets: [`"…${snippet}…"`],
        sources: [sourceLabel],
      };
    }
  }
  return results;
}

// Research: Kandidaten für neue Typen matchen
function detectCandidates(text, sourceLabel) {
  const lower = text.toLowerCase();
  const results = {};

  for (const [label, def] of Object.entries(RESEARCH_CANDIDATES)) {
    const matched = def.keywords.filter(kw => lower.includes(kw));
    if (matched.length > 0) {
      results[label] = { matched, source: sourceLabel, suggestedId: def.suggestedId };
    }
  }
  return results;
}

// Research: Rohe Equipment-Komposita extrahieren (lowercase)
function extractEquipmentTerms(text) {
  const lower = text.toLowerCase();
  const terms = new Set();
  for (const pattern of EQUIPMENT_SUFFIX_PATTERNS) {
    const matches = lower.matchAll(pattern);
    for (const m of matches) {
      const term = m[0].trim();
      if (term.length > 6 && term.length < 40) terms.add(term);
    }
  }
  return [...terms];
}

function mergeDetections(acc, detected) {
  for (const [type, data] of Object.entries(detected)) {
    if (!acc[type]) {
      acc[type] = { matches: [], snippets: [], sources: [] };
    }
    for (const m of data.matches) {
      if (!acc[type].matches.includes(m)) acc[type].matches.push(m);
    }
    acc[type].snippets.push(...data.snippets.slice(0, 1));
    for (const s of data.sources) {
      if (!acc[type].sources.includes(s)) acc[type].sources.push(s);
    }
  }
}

function calcConfidence(data) {
  const fromEquipment = data.sources.some(s => s !== 'homepage');
  if (data.matches.length >= 2 || fromEquipment) return 'high';
  return 'medium';
}

function buildIssueBody(space, detection) {
  const types = Object.keys(detection).sort();

  let body = `## Workshop-Daten für: ${space.name}\n\n`;
  body += `**ID:** ${space.ID}\n`;
  body += `**Website:** ${space.link.url}\n`;
  if (space.workshops && space.workshops.length > 0) {
    body += `**Aktuell:** \`${space.workshops.join(', ')}\`\n`;
  }
  body += '\n';

  body += `### Gefundene Workshop-Typen\n\n`;
  body += `| Typ | Keywords | Confidence | Quelle(n) |\n`;
  body += `|-----|----------|------------|----------|\n`;
  for (const type of types) {
    const d = detection[type];
    const conf = calcConfidence(d);
    body += `| \`${type}\` | ${d.matches.slice(0, 3).join(', ')} | **${conf}** | ${d.sources.join(', ')} |\n`;
  }

  body += '\n### Evidenz\n\n';
  for (const type of types) {
    const d = detection[type];
    if (d.snippets.length > 0) body += `**${type}:** ${d.snippets[0]}\n\n`;
  }

  body += `### Vorgeschlagene Änderung in locations.json\n\n`;
  body += '```json\n';
  body += `"workshops": ${JSON.stringify(types)}\n`;
  body += '```\n\n';
  body += `Bitte prüfen und ggf. anpassen bevor der Wert übernommen wird.\n\n`;
  body += `---\n*Automatisch generiert von tools/workshop-crawler.js*`;
  return body;
}

function createGitHubIssue(space, detection) {
  const title = `[Workshop-Daten] ${space.name} (#${space.ID})`;
  const body = buildIssueBody(space, detection);
  const tmpFile = path.join(__dirname, '.issue-body-tmp.md');
  fs.writeFileSync(tmpFile, body, 'utf8');
  try {
    execSync(
      `gh issue create --title "${title.replace(/"/g, '\\"')}" --body-file "${tmpFile}" --label "${ISSUE_LABEL}"`,
      { cwd: path.join(__dirname, '..'), stdio: 'pipe' }
    );
    fs.unlinkSync(tmpFile);
    return true;
  } catch (err) {
    fs.unlinkSync(tmpFile);
    console.error(`   Fehler: ${err.message}`);
    return false;
  }
}

// === Crawl one space ===

async function crawlSpace(space) {
  const allDetections = {};
  const allCandidates = {};   // research only
  const allRawTerms = [];     // research only
  let pagesChecked = 0;

  // 1. Homepage
  let res;
  try {
    res = await fetchWithRetry(space.link.url);
  } catch (err) {
    return { error: err.message };
  }
  if (!res.ok) return { error: `HTTP ${res.status}` };

  const homepageHtml = await res.text();
  const homepageText = htmlToText(homepageHtml);
  pagesChecked++;

  mergeDetections(allDetections, detectWorkshops(homepageText, 'homepage'));
  if (researchMode) {
    const cands = detectCandidates(homepageText, 'homepage');
    for (const [k, v] of Object.entries(cands)) {
      if (!allCandidates[k]) allCandidates[k] = v;
    }
    allRawTerms.push(...extractEquipmentTerms(homepageText));
  }

  // 2. Basis-URL
  let baseUrl;
  try {
    const u = new URL(space.link.url);
    baseUrl = `${u.protocol}//${u.host}`;
  } catch {
    baseUrl = space.link.url.replace(/\/$/, '');
  }

  // 3. Sub-Seiten
  for (const p of EQUIPMENT_PATHS) {
    await sleep(DELAY_BETWEEN_SUBPAGES_MS);
    try {
      const r = await fetchWithTimeout(baseUrl + p, 8000);
      if (r.ok) {
        const html = await r.text();
        const text = htmlToText(html);
        if (text.length > 200) {
          pagesChecked++;
          mergeDetections(allDetections, detectWorkshops(text, p));
          if (researchMode) {
            const cands = detectCandidates(text, p);
            for (const [k, v] of Object.entries(cands)) {
              if (!allCandidates[k]) allCandidates[k] = v;
              else if (!allCandidates[k].sources) allCandidates[k].sources = [v.source];
              else allCandidates[k].sources.push(v.source);
            }
            allRawTerms.push(...extractEquipmentTerms(text));
          }
        }
      }
    } catch { /* silent */ }
  }

  return { detections: allDetections, candidates: allCandidates, rawTerms: allRawTerms, pagesChecked };
}

// === Main ===

async function main() {
  const mode = researchMode ? 'Research' : createIssues ? 'Issues erstellen' : dryJson ? 'JSON-Diff' : 'Dry-Run';
  console.log('=== Makerspace Workshop Crawler ===');
  console.log(`Modus: ${mode}`);
  if (force) console.log('--force aktiv');
  if (limit) console.log(`Limit: ${limit}`);
  if (targetId) console.log(`Ziel-ID: ${targetId}`);
  console.log('');

  const locationsPath = path.join(__dirname, '..', 'locations.json');
  const locations = JSON.parse(fs.readFileSync(locationsPath, 'utf8'));

  let spaces = locations;
  if (targetId) {
    spaces = spaces.filter(s => s.ID === targetId);
    if (!spaces.length) { console.error(`ID ${targetId} nicht gefunden.`); process.exit(1); }
  } else if (!force) {
    spaces = spaces.filter(s => !s.workshops || s.workshops.length === 0);
  }
  if (limit && limit < spaces.length) spaces = spaces.slice(0, limit);

  console.log(`${spaces.length} Spaces zu prüfen\n`);

  const stats = { total: spaces.length, fetched: 0, detected: 0, issues: 0, errors: 0 };
  const jsonDiff = [];

  // Research accumulators
  const candidateFreq = {};   // label → count of spaces that matched
  const rawTermFreq = {};     // term → count

  for (let i = 0; i < spaces.length; i++) {
    const space = spaces[i];
    process.stdout.write(`[${i + 1}/${spaces.length}] ${space.name} … `);

    const result = await crawlSpace(space);

    if (result.error) {
      console.log(`SKIP: ${result.error}`);
      stats.errors++;
      await sleep(DELAY_BETWEEN_SPACES_MS);
      continue;
    }

    stats.fetched++;
    const { detections, candidates, rawTerms, pagesChecked } = result;
    const foundTypes = Object.keys(detections);

    if (foundTypes.length === 0) {
      console.log(`keine Treffer (${pagesChecked} Seiten)`);
    } else {
      stats.detected++;
      const summary = foundTypes.map(t => `${t}(${calcConfidence(detections[t])})`).join(', ');
      console.log(`${summary} [${pagesChecked} Seiten]`);

      jsonDiff.push({
        id: space.ID,
        name: space.name,
        url: space.link.url,
        current: space.workshops || [],
        suggested: foundTypes.sort(),
        confidence: Object.fromEntries(foundTypes.map(t => [t, calcConfidence(detections[t])])),
      });
    }

    // Research: Kandidaten akkumulieren
    if (researchMode) {
      const seenLabels = new Set();
      for (const [label] of Object.entries(candidates)) {
        if (!seenLabels.has(label)) {
          candidateFreq[label] = (candidateFreq[label] || 0) + 1;
          seenLabels.add(label);
        }
      }
      for (const term of rawTerms) {
        rawTermFreq[term] = (rawTermFreq[term] || 0) + 1;
      }
    }

    // Issues erstellen
    if (createIssues && foundTypes.length > 0) {
      const ok = createGitHubIssue(space, detections);
      if (ok) { stats.issues++; console.log(`   → Issue erstellt`); }
    }

    await sleep(DELAY_BETWEEN_SPACES_MS);
  }

  // === Zusammenfassung ===
  console.log('\n' + '='.repeat(60));
  console.log('ZUSAMMENFASSUNG');
  console.log('='.repeat(60));
  console.log(`Gesamt:       ${stats.total}`);
  console.log(`Gefetched:    ${stats.fetched}`);
  console.log(`Mit Befunden: ${stats.detected}`);
  if (createIssues) console.log(`Issues:       ${stats.issues}`);
  console.log(`Fehler:       ${stats.errors}`);

  // === Research-Report ===
  if (researchMode) {
    console.log('\n' + '='.repeat(60));
    console.log('KANDIDATEN FÜR NEUE WORKSHOP-TYPEN');
    console.log('='.repeat(60));
    console.log('(Anzahl Spaces, in denen Keywords gefunden wurden)\n');

    const sortedCandidates = Object.entries(candidateFreq)
      .sort((a, b) => b[1] - a[1]);

    if (sortedCandidates.length === 0) {
      console.log('Keine neuen Kandidaten gefunden.');
    } else {
      for (const [label, count] of sortedCandidates) {
        const def = RESEARCH_CANDIDATES[label];
        console.log(`  ${count.toString().padStart(3)}x  ${label}`);
        console.log(`         → id: "${def.suggestedId}"  (${def.description})`);
      }
    }

    console.log('\n' + '='.repeat(60));
    console.log('HÄUFIGE EQUIPMENT-BEGRIFFE (unklassifiziert, ≥3 Spaces)');
    console.log('='.repeat(60));

    const sortedTerms = Object.entries(rawTermFreq)
      .filter(([, n]) => n >= 3)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 50);

    if (sortedTerms.length === 0) {
      console.log('Keine häufigen Begriffe (evtl. --limit erhöhen).');
    } else {
      for (const [term, count] of sortedTerms) {
        console.log(`  ${count.toString().padStart(3)}x  ${term}`);
      }
    }

    console.log('\nNächste Schritte:');
    console.log('  1. Neue Typen nach Bedarf in workshop-types.js + WORKSHOP_KEYWORDS ergänzen');
    console.log('  2. node tools/workshop-crawler.js --dry-json     (Vorschau)');
    console.log('  3. node tools/workshop-crawler.js --create-issues');
  }

  if (dryJson) {
    // enrichment.json aktualisieren (nur workshops, nur Lücken füllen)
    const enrichment = fs.existsSync(ENRICHMENT_FILE)
      ? JSON.parse(fs.readFileSync(ENRICHMENT_FILE, 'utf8'))
      : {};

    let written = 0;
    for (const diff of jsonDiff) {
      const id = String(diff.id);
      if (!enrichment[id]) enrichment[id] = {};
      // Nur setzen wenn noch nicht vorhanden (bestehende Daten nicht überschreiben)
      if (!enrichment[id].workshops?.length) {
        enrichment[id].workshops = diff.suggested;
        written++;
      }
    }

    // Sortiert nach ID
    const sorted = Object.fromEntries(
      Object.entries(enrichment).sort((a, b) => Number(a[0]) - Number(b[0]))
    );
    fs.writeFileSync(ENRICHMENT_FILE, JSON.stringify(sorted, null, 2) + '\n', 'utf8');
    console.log(`\n✅ enrichment.json: ${written} neue Workshop-Einträge geschrieben (Vorschau, keine Issues)`);
  } else if (!researchMode && !createIssues && stats.detected > 0) {
    console.log(`\nMit --dry-json (nur Datei) oder --create-issues (Issues erstellen) fortfahren.`);
  }
}

main().catch(err => {
  console.error('Fataler Fehler:', err);
  process.exit(1);
});
