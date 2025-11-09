// scripts/fetch-spaceapi-status.js
const fs = require('fs');

// Liste aller SpaceAPI Endpoints
const SPACE_APIS = [
  { name: 'Toolbox Bodensee', endpoint: 'https://toolbox-bodensee.de/toolboxbodensee.json' },
  { name: 'c3d2', endpoint: 'https://www.c3d2.de/spaceapi.json' },
  { name: 'c-base', endpoint: 'https://www.c-base.org/status.json' },
  { name: 'Metalab', endpoint: 'https://metalab.at/status.json' },
  { name: 'CCC Hamburg', endpoint: 'https://spaceapi.hamburg.ccc.de' },
  { name: 'Stratum 0', endpoint: 'https://status.stratum0.org/status.json' },
  { name: 'Chaosdorf', endpoint: 'https://chaosdorf.de/space_api.json' },
  { name: 'Chaospott', endpoint: 'https://status.chaospott.de/status.json' },
  { name: 'CCC Frankfurt', endpoint: 'https://status.ccc-ffm.de/spaceapi.json' },
  { name: 'RaumZeitLabor', endpoint: 'https://raumzeitlabor.de/api/spaceapi.json' },
  { name: 'Entropia', endpoint: 'http://club.entropia.de/spaceapi' },
  { name: 'Binary Kitchen', endpoint: 'https://www.binary-kitchen.de/spaceapi.php' },
  { name: 'hacKNology', endpoint: 'https://www.hacknology.de/spaceapi/status.json' },
  { name: 'CCC Mannheim', endpoint: 'https://www.ccc-mannheim.de/spaceapi/spaceapi.json' },
  { name: 'Temporärhaus', endpoint: 'https://spaceapi.temporaerhaus.de/spaceapi.json' },
  { name: 'Bytespeicher', endpoint: 'https://status.bytespeicher.org/status.json' },
  { name: 'Chaostreff Backnang', endpoint: 'https://spaceapi.ctbk.de' },
  { name: 'flipdot', endpoint: 'https://api.flipdot.org' },
  { name: 'Hackerspace Bielefeld', endpoint: 'https://hackerspace-bielefeld.de/status.json' },
  { name: 'Makerspace Gütersloh', endpoint: 'https://makerspace-gt.de/space-api/space-api.json' },
  { name: '/dev/tal', endpoint: 'https://devtal.de/api' },
  { name: 'fnordeingang', endpoint: 'https://status.fnordeingang.de/spaceapi.json' },
  { name: 'CCC Cologne', endpoint: 'https://api.koeln.ccc.de' },
  { name: 'CCC Aachen', endpoint: 'https://status.aachen.ccc.de/spaceapi' },
  { name: 'CCC Darmstadt', endpoint: 'https://api.chaos-darmstadt.de' },
  { name: 'Attraktor', endpoint: 'http://blog.attraktor.org/spaceapi/spaceapi.json' },
  { name: 'CCC Flensburg', endpoint: 'https://api.chaostreff-flensburg.de' },
  { name: 'Afra Berlin', endpoint: 'https://spaceapi.afra-berlin.de/v1/status.json' },
  { name: 'Chaostreff Chemnitz', endpoint: 'https://chaoschemnitz.de/chch.json' },
  { name: 'Turmlabor', endpoint: 'http://www.turmlabor.de/spaces.api' },
  { name: 'hacksaar', endpoint: 'http://spaceapi.hacksaar.de/status.json' },
  { name: '/usr/space', endpoint: 'https://www.usrspace.at/spaceapi.json' },
  { name: 'Chaostreff Bern', endpoint: 'https://www.chaosbern.ch/spaceapi.json' },
  { name: 'Bastli', endpoint: 'https://bastli.ch/hackspace_api.php' }
];

// Timeout Helper
function fetchWithTimeout(url, timeout = 10000) {
  return Promise.race([
    fetch(url),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Timeout')), timeout)
    )
  ]);
}

// Fetch einen einzelnen Space Status
async function fetchSpaceStatus(space) {
  try {
    console.log(`📡 Fetching: ${space.name}`);

    const response = await fetchWithTimeout(space.endpoint, 10000);

    if (!response.ok) {
      console.log(`❌ ${space.name}: HTTP ${response.status}`);
      return { ...space, status: null, error: `HTTP ${response.status}` };
    }

    const data = await response.json();
    const isOpen = data.state?.open;

    console.log(`✅ ${space.name}: ${isOpen === true ? 'OPEN' : isOpen === false ? 'CLOSED' : 'UNKNOWN'}`);

    return {
      ...space,
      status: isOpen,
      lastUpdate: new Date().toISOString(),
      error: null
    };

  } catch (error) {
    console.log(`❌ ${space.name}: ${error.message}`);
    return {
      ...space,
      status: null,
      error: error.message,
      lastUpdate: new Date().toISOString()
    };
  }
}

// Main Function
async function main() {
  console.log('🚀 Starting SpaceAPI status fetch...\n');

  // Fetch alle Spaces parallel
  const results = await Promise.all(
    SPACE_APIS.map(space => fetchSpaceStatus(space))
  );

  // Statistiken
  const stats = {
    total: results.length,
    open: results.filter(r => r.status === true).length,
    closed: results.filter(r => r.status === false).length,
    unknown: results.filter(r => r.status === null).length,
    lastUpdate: new Date().toISOString()
  };

  // Ergebnis
  const output = {
    stats,
    spaces: results
  };

  // Schreibe JSON File
  fs.writeFileSync('status.json', JSON.stringify(output, null, 2));

  console.log('\n📊 Statistics:');
  console.log(`   Total: ${stats.total}`);
  console.log(`   🟢 Open: ${stats.open}`);
  console.log(`   🔴 Closed: ${stats.closed}`);
  console.log(`   🟠 Unknown: ${stats.unknown}`);
  console.log('\n✅ status.json created!');
}

// Run
main().catch(console.error);