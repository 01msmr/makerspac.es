// spaceapi-static.js - Lädt Status aus statischer JSON

class StaticSpaceAPI {
  constructor() {
    this.statusData = null;
    this.listeners = [];
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
    console.log('📄 Loading static SpaceAPI status...');
    
    try {
      // Lade status.json
      const response = await fetch('./status.json?' + Date.now()); // Cache-Buster
      this.statusData = await response.json();
      
      console.log('✅ Loaded status from:', this.statusData.stats.lastUpdate);
      console.log('📊 Stats:', this.statusData.stats);
      
      // Mappe Status auf Locations
      locations.forEach(location => {
        if (location.spaceapi?.endpoint) {
          // Finde den Space in den Status-Daten
          const spaceData = this.statusData.spaces.find(
            s => s.endpoint === location.spaceapi.endpoint
          );
          
          if (spaceData) {
            location.isOpen = spaceData.status;
            
            // Feuer Event für Live-Update
            this.fireStatusUpdate(location);
          }
        }
      });
      
      // Statistiken
      const openCount = locations.filter(loc => loc.isOpen === true).length;
      const closedCount = locations.filter(loc => loc.isOpen === false).length;
      const nullCount = locations.filter(loc => loc.isOpen === null).length;
      
      console.log('✅ Status applied to locations:');
      console.log(`   🟢 Open: ${openCount}`);
      console.log(`   🔴 Closed: ${closedCount}`);
      console.log(`   🟠 Unknown: ${nullCount}`);
      
      return locations;
      
    } catch (error) {
      console.error('❌ Error loading status.json:', error);
      return locations;
    }
  }

  // Cache-Management (Dummy für Kompatibilität)
  getCacheStats() {
    return {
      total: this.statusData?.spaces?.length || 0,
      lastUpdate: this.statusData?.stats?.lastUpdate
    };
  }

  logCacheInfo() {
    console.log('📊 Static Status Info:');
    console.log('   Last Update:', this.statusData?.stats?.lastUpdate);
    console.log('   Open:', this.statusData?.stats?.open);
    console.log('   Closed:', this.statusData?.stats?.closed);
    console.log('   Unknown:', this.statusData?.stats?.unknown);
  }
}

window.StaticSpaceAPI = StaticSpaceAPI;