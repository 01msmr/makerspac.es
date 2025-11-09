// spaceapi-static.js - Lädt Status aus statischer JSON (GitHub Actions generiert)

class StaticSpaceAPI {
  constructor() {
    this.statusData = null;
    this.listeners = [];
    console.log('📄 StaticSpaceAPI initialized');
  }

  // Event-Listener hinzufügen
  onStatusUpdate(callback) {
    this.listeners.push(callback);
  }

  // Event feuern
  fireStatusUpdate(location) {
    this.listeners.forEach(callback => {
      try {
        callback(location);
      } catch (error) {
        console.error("Status update callback error:", error);
      }
    });
  }

  // Lade Status aus statischer JSON
  async enrichLocationData(locations) {
    console.log('📄 Loading static SpaceAPI status from status.json...');

    try {
      // Lade status.json (mit Cache-Buster)
      const response = await fetch('./status.json?' + Date.now());

      if (!response.ok) {
        console.error('❌ Failed to load status.json:', response.status);
        return locations;
      }

      this.statusData = await response.json();

      console.log('✅ Loaded status from:', this.statusData.stats.lastUpdate);
      console.log('📊 Stats:', this.statusData.stats);

      // Mappe Status auf Locations
      let applied = 0;
      locations.forEach(location => {
        if (location.spaceapi?.endpoint) {
          // Finde den Space in den Status-Daten
          const spaceData = this.statusData.spaces.find(
            s => s.endpoint === location.spaceapi.endpoint
          );

          if (spaceData) {
            location.isOpen = spaceData.status;
            applied++;

            // Feuer Event für Live-Update
            this.fireStatusUpdate(location);
          } else {
            // Endpoint nicht in Status-Daten gefunden
            location.isOpen = null;
            console.log('⚠️ No status data for:', location.name);
          }
        }
      });

      // Statistiken
      const openCount = locations.filter(loc => loc.isOpen === true).length;
      const closedCount = locations.filter(loc => loc.isOpen === false).length;
      const nullCount = locations.filter(loc => loc.isOpen === null).length;
      const undefinedCount = locations.filter(loc => loc.isOpen === undefined).length;

      console.log('✅ Status applied to', applied, 'locations:');
      console.log(`   🟢 isOpen === true: ${openCount}`);
      console.log(`   🔴 isOpen === false: ${closedCount}`);
      console.log(`   🟠 isOpen === null: ${nullCount}`);
      console.log(`   ⚪ isOpen === undefined: ${undefinedCount}`);

      return locations;

    } catch (error) {
      console.error('❌ Error loading status.json:', error);
      console.log('ℹ️ Make sure status.json exists in the root directory');
      console.log('ℹ️ Run: node scripts/fetch-spaceapi-status.js');
      return locations;
    }
  }

  // ✨ WICHTIG: getStatusIcon Funktion (wie in spaceapi-detect.js)
  getStatusIcon(location, icons) {
    if (!icons) {
      console.error("⚠️ Icons object is undefined!");
      return null;
    }

    const isOpen = location.isOpen;

    if (isOpen === true) {
      // Space ist OFFEN
      return icons.greenIcon || icons.defaultIcon;
    } else if (isOpen === false) {
      // Space ist GESCHLOSSEN
      return icons.redIcon || icons.defaultIcon;
    } else if (location.spaceapi && location.spaceapi.endpoint) {
      // Hat SpaceAPI aber Status unbekannt - ORANGE
      return icons.unknownStatusIcon || icons.defaultIcon;
    } else {
      // Hat KEINE SpaceAPI - SCHWARZ/GRAU
      return icons.highlightIcon || icons.defaultIcon;
    }
  }

  // Cache-Management (für Kompatibilität mit existierendem Code)
  getCacheStats() {
    if (!this.statusData) {
      return {
        total: 0,
        lastUpdate: null,
        open: 0,
        closed: 0,
        unknown: 0
      };
    }

    return {
      total: this.statusData.spaces.length,
      lastUpdate: this.statusData.stats.lastUpdate,
      open: this.statusData.stats.open,
      closed: this.statusData.stats.closed,
      unknown: this.statusData.stats.unknown
    };
  }

  // Logging (für Debugging)
  logCacheInfo() {
    if (!this.statusData) {
      console.log('⚠️ No status data loaded yet');
      return;
    }

    console.log('📊 Static Status Info:');
    console.log('   Last Update:', new Date(this.statusData.stats.lastUpdate).toLocaleString());
    console.log('   🟢 Open:', this.statusData.stats.open);
    console.log('   🔴 Closed:', this.statusData.stats.closed);
    console.log('   🟠 Unknown:', this.statusData.stats.unknown);
    console.log('   📦 Total Spaces:', this.statusData.stats.total);
  }

  // Dummy-Funktionen für Kompatibilität
  cleanExpiredCache() {
    console.log('ℹ️ StaticSpaceAPI: Cache cleaning not needed (using static data)');
    return 0;
  }

  clearCache() {
    console.log('ℹ️ StaticSpaceAPI: Clearing status data');
    this.statusData = null;
    return 0;
  }
}

// Export für globalen Zugriff
window.StaticSpaceAPI = StaticSpaceAPI;