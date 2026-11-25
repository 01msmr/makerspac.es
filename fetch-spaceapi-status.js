// scripts/fetch-spaceapi-status.js - OPTIMIERT + liest Endpoints aus loc-enrichment.json
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { adapterFor } from './tools/lib/status-adapters.js';
import { decideFreshness } from './tools/lib/status-freshness.js';
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ✨ KEINE DOPPELTE PFLEGE MEHR!
// SpaceAPI Endpoints werden aus loc-enrichment.json gelesen (spaceapi.endpoint, per ID), Namen aus locations.json

// Gedächtnis (NICHT öffentlich): nur die letzten zwei Signaturen je Space, nur wo ein „offen“ keinen Zeitstempel liefert.
// Liegt neben dem Skript, wird per Actions-Cache zwischen den Läufen gehalten (update-status.yml) und weder hochgeladen noch committet.
const MEMORY_FILE = process.env.STATUS_MEMORY_FILE || path.join(__dirname, 'status-memory.json');
let MEMORY = {};
try { MEMORY = JSON.parse(fs.readFileSync(MEMORY_FILE, 'utf8')); } catch { MEMORY = {}; }

// Konfiguration
const TIMEOUT_MS = 45000; // 45 Sekunden
const MAX_RETRIES = 3; // 3 Versuche
const RETRY_DELAY_MS = 5000; // 5 Sekunden zwischen Versuchen

// Helper: Parst SpaceAPI-JSON, Plaintext "0"/"1", ThingSpeak-JSON
// Gibt { status, message } zurück
function parseOpenStatus(text) {
  const trimmed = text.trim();
  if (trimmed === '0') return { status: false };
  if (trimmed === '1') return { status: true };
  try {
    const data = JSON.parse(trimmed);
    const rawOpen = data.state?.open;
    if (rawOpen !== undefined) {
      if (rawOpen === 1 || rawOpen === true) return { status: true };
      if (rawOpen === 0 || rawOpen === false) return { status: false };
    }
    if (data.field1 !== undefined) {
      if (data.field1 === '1' || data.field1 === 1 || data.field1 === true) return { status: true };
      if (data.field1 === '0' || data.field1 === 0 || data.field1 === false) return { status: false };
    }
    const message = (typeof data.state?.message === 'string' && data.state.message.trim()) || null;
    return { status: null, message };
  } catch (e) {}
  return { status: null };
}

// Helper: Sleep
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Helper: Fetch mit Timeout
function fetchWithTimeout(url, timeout = TIMEOUT_MS) {
  return Promise.race([
    fetch(url),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Timeout')), timeout)
    )
  ]);
}

// Fetch mit Retry-Logik
async function fetchWithRetry(url, retries = MAX_RETRIES) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const response = await fetchWithTimeout(url, TIMEOUT_MS);
      return response; // Erfolg!
    } catch (error) {
      console.log(`   ⚠️ Attempt ${attempt}/${retries} failed: ${error.message}`);

      if (attempt < retries) {
        console.log(`   ⏳ Waiting ${RETRY_DELAY_MS / 1000}s before retry...`);
        await sleep(RETRY_DELAY_MS);
      } else {
        throw error; // Alle Versuche fehlgeschlagen
      }
    }
  }
}

// Fetch einen einzelnen Space Status
async function fetchSpaceStatus(space) {
  try {
    console.log(`📡 Fetching: ${space.name}`);

    const response = await fetchWithRetry(space.endpoint);

    if (!response.ok) {
      console.log(`❌ ${space.name}: HTTP ${response.status}`);
      return {
        name: space.name,
        endpoint: space.endpoint,
        status: null,
        error: `HTTP ${response.status}`,
        lastUpdate: new Date().toISOString()
      };
    }

    const text = await response.text();
    // Spaces ohne SpaceAPI: Adapter aus loc-enrichment.json (spaceapi.adapter, z. B. „html-style“) — nur der aktuelle Stand,
    // zu alt/unlesbar → unbekannt (nie raten). Ohne Adapter: SpaceAPI/0-1/ThingSpeak wie bisher.
    const adapter = space.adapter && adapterFor(space.adapter);
    let isOpen, message = null, adapterError = null;
    if (adapter) {
      const r = adapter(text);   // Alter-Grenze: globale Konstante STATUS_MAX_AGE_HOURS (nicht je Space)
      isOpen = r.status;
      adapterError = r.reason || null;
    } else {
      ({ status: isOpen, message } = parseOpenStatus(text));
      // Alters-Regel (ADR-010): „offen“ nur, wenn der Sende-/Zeitstempel < 24 h alt ist; „geschlossen“ bleibt; Gedächtnis nur wo unumgänglich
      const fresh = decideFreshness({ status: isOpen, text, lastModified: response.headers.get('last-modified') || '' }, MEMORY, space.endpoint);
      if (fresh.status !== isOpen) { isOpen = fresh.status; adapterError = fresh.reason || null; }
    }

    const statusEmoji = isOpen === true ? '🟢 OPEN' :
      isOpen === false ? '🔴 CLOSED' :
        '🟠 UNKNOWN';
    console.log(`✅ ${space.name}: ${statusEmoji}${message ? ' – ' + message : ''}`);

    return {
      name: space.name,
      endpoint: space.endpoint,
      status: isOpen,
      ...(isOpen === null && message ? { message } : {}),
      lastUpdate: new Date().toISOString(),
      error: adapterError
    };

  } catch (error) {
    console.log(`❌ ${space.name}: ${error.message}`);
    return {
      name: space.name,
      endpoint: space.endpoint,
      status: null,
      error: error.message,
      lastUpdate: new Date().toISOString()
    };
  }
}

// Lade SpaceAPI Endpoints aus locations.json + loc-enrichment.json
function loadSpaceAPIsFromLocations() {
  try {
    const locationsPath = path.join(__dirname, 'locations.json');

    if (!fs.existsSync(locationsPath)) {
      console.error('❌ Error: locations.json not found at:', locationsPath);
      process.exit(1);
    }

    const locations = JSON.parse(fs.readFileSync(locationsPath, 'utf8'));

    // loc-enrichment.json laden (optional)
    const enrichmentPath = path.join(__dirname, 'loc-enrichment.json');
    const enrichment = fs.existsSync(enrichmentPath)
      ? JSON.parse(fs.readFileSync(enrichmentPath, 'utf8'))
      : {};

    // spaceapi-Endpoint pro Location aus enrichment holen (locations.json enthält keine Endpoints)
    const spacesWithAPI = locations
      .filter(loc => loc.name !== 'TEMPLATE')
      .map(loc => {
        const api = enrichment[String(loc.ID)]?.spaceapi;
        const endpoint = api?.endpoint || '';
        return endpoint.trim() ? { name: loc.name, endpoint: endpoint.trim(), adapter: api.adapter } : null;
      })
      .filter(Boolean);

    console.log(`📂 Loaded locations.json: ${locations.length} total locations`);
    console.log(`🔌 Found ${spacesWithAPI.length} locations with SpaceAPI\n`);

    if (spacesWithAPI.length === 0) {
      console.warn('⚠️ Warning: No spaces with SpaceAPI found');
    }

    return spacesWithAPI;

  } catch (error) {
    console.error('❌ Error loading locations.json:', error.message);
    if (error.code === 'ENOENT') {
      console.error('💡 Make sure locations.json exists in the root directory');
    } else if (error instanceof SyntaxError) {
      console.error('💡 locations.json contains invalid JSON');
    }
    process.exit(1);
  }
}

// Main Function
async function main() {
  console.log('🚀 Starting SpaceAPI status fetch...');
  console.log(`⚙️ Config: Timeout=${TIMEOUT_MS / 1000}s, Retries=${MAX_RETRIES}`);
  console.log('='.repeat(50) + '\n');

  // ✨ Lade Endpoints aus loc-enrichment.json (Namen aus locations.json)
  const SPACE_APIS = loadSpaceAPIsFromLocations();

  const startTime = Date.now();

  // Fetch alle Spaces parallel
  const results = await Promise.all(
    SPACE_APIS.map(space => fetchSpaceStatus(space))
  );

  const duration = ((Date.now() - startTime) / 1000).toFixed(1);

  // Statistiken
  const stats = {
    total: results.length,
    open: results.filter(r => r.status === true).length,
    closed: results.filter(r => r.status === false).length,
    unknown: results.filter(r => r.status === null).length,
    lastUpdate: new Date().toISOString(),
    duration: `${duration}s`
  };

  // Ergebnis — spaces als Map (endpoint → { status, name, message? }) für O(1)-Lookup
  const output = {
    stats,
    spaces: Object.fromEntries(
      results.map(r => [r.endpoint, {
        status: r.status,
        name:   r.name,
        ...(r.message ? { message: r.message } : {}),
      }])
    ),
  };

  // Gedächtnis fortschreiben (nur aktuelle Endpoints; nicht öffentlich, nie in status.json)
  const keep = new Set(SPACE_APIS.map(s => s.endpoint));
  for (const k of Object.keys(MEMORY)) if (!keep.has(k)) delete MEMORY[k];
  try { fs.writeFileSync(MEMORY_FILE, JSON.stringify(MEMORY)); } catch (e) { console.warn('⚠️ Gedächtnis nicht gespeichert:', e.message); }

  // Schreibe JSON File
  const outputPath = path.join(__dirname, 'status.json');
  fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));

  // Detaillierte Statistiken
  console.log('\n' + '='.repeat(50));
  console.log('📊 FINAL STATISTICS');
  console.log('='.repeat(50));
  console.log(`   Total Spaces: ${stats.total}`);
  console.log(`   🟢 Open: ${stats.open} (${(stats.open / stats.total * 100).toFixed(1)}%)`);
  console.log(`   🔴 Closed: ${stats.closed} (${(stats.closed / stats.total * 100).toFixed(1)}%)`);
  console.log(`   🟠 Unknown: ${stats.unknown} (${(stats.unknown / stats.total * 100).toFixed(1)}%)`);
  console.log(`   ⏱️ Duration: ${duration}s`);
  console.log(`   ✅ Success Rate: ${((stats.open + stats.closed) / stats.total * 100).toFixed(1)}%`);

  // Liste der fehlgeschlagenen APIs
  const failed = results.filter(r => r.status === null);
  if (failed.length > 0) {
    console.log('\n❌ Failed APIs:');
    failed.forEach(space => {
      console.log(`   - ${space.name}: ${space.error}`);
    });
  }

  console.log('\n✅ status.json created at:', outputPath);
}

// Run
main().catch(console.error);