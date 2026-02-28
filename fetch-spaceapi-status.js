// scripts/fetch-spaceapi-status.js - OPTIMIERT + liest aus locations.json
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ✨ KEINE DOPPELTE PFLEGE MEHR!
// SpaceAPI Endpoints werden direkt aus locations.json gelesen

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
    const { status: isOpen, message } = parseOpenStatus(text);

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
      error: null
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

// ✨ NEU: Lade SpaceAPI Endpoints aus locations.json
function loadSpaceAPIsFromLocations() {
  try {
    // Lade locations.json (vom Script-Verzeichnis aus gesehen)
    const locationsPath = path.join(__dirname, 'locations.json');

    if (!fs.existsSync(locationsPath)) {
      console.error('❌ Error: locations.json not found at:', locationsPath);
      console.error('💡 Make sure locations.json exists in the root directory');
      process.exit(1);
    }

    const locationsData = fs.readFileSync(locationsPath, 'utf8');
    const locations = JSON.parse(locationsData);

    // Extrahiere alle Locations mit SpaceAPI UND nicht-leerem Endpoint (TEMPLATE ausschließen)
    const spacesWithAPI = locations.filter(loc =>
      loc.name !== 'TEMPLATE' &&
      loc.spaceapi &&
      loc.spaceapi.endpoint &&
      loc.spaceapi.endpoint.trim() !== '' // ✨ Filtere auch leere Strings!
    );

    console.log(`📂 Loaded locations.json: ${locations.length} total locations`);
    console.log(`🔌 Found ${spacesWithAPI.length} locations with SpaceAPI\n`);

    if (spacesWithAPI.length === 0) {
      console.warn('⚠️ Warning: No spaces with SpaceAPI found in locations.json');
    }

    // Mappe auf unser Format
    return spacesWithAPI.map(loc => ({
      name: loc.name,
      endpoint: loc.spaceapi.endpoint
    }));

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

  // ✨ Lade Endpoints aus locations.json
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

  // Ergebnis
  const output = {
    stats,
    spaces: results
  };

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