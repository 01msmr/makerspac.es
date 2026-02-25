// spaceapi-static.js - Lädt Status aus statischer JSON (GitHub Actions generiert)

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

    try {
      // Lade status.json (mit Cache-Buster)
      const response = await fetch('./status.json?' + Date.now());

      if (!response.ok) {
        console.error('❌ Failed to load status.json:', response.status);
        return locations;
      }

      this.statusData = await response.json();


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
            location.statusMessage = spaceData.message || null;
            applied++;

            // Feuer Event für Live-Update
            this.fireStatusUpdate(location);
          } else {
            // Endpoint nicht in Status-Daten gefunden
            location.isOpen = null;
          }
        }
      });

      // Statistiken
      const openCount = locations.filter(loc => loc.isOpen === true).length;
      const closedCount = locations.filter(loc => loc.isOpen === false).length;
      const nullCount = locations.filter(loc => loc.isOpen === null).length;
      const undefinedCount = locations.filter(loc => loc.isOpen === undefined).length;


      return locations;

    } catch (error) {
      console.error('❌ Error loading status.json:', error);
      return locations;
    }
  }

  // Status-Icon basierend auf isOpen-Wert
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
      return;
    }

  }

  // Dummy-Funktionen für Kompatibilität
  cleanExpiredCache() {
    return 0;
  }

  clearCache() {
    this.statusData = null;
    return 0;
  }
}

// Export für globalen Zugriff
window.StaticSpaceAPI = StaticSpaceAPI;