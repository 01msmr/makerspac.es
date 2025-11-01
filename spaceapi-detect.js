// DEBUG NEUER ANSATZ: Event-System in spaceapi-detect.js

class SimpleSpaceAPI {
  constructor() {
    this.statusCache = new Map();
    this.cacheDuration = 5 * 60 * 1000;
    this.requestTimeout = 15000; // 3 Sekunden auf APIs warten
    this.listeners = []; // Event-Listener für Status-Updates
  }

  // Event-Listener hinzufügen
  onStatusUpdate(callback) {
    this.listeners.push(callback);
  }

  // Event feuern wenn Status geladen ist
  fireStatusUpdate(location) {
    this.listeners.forEach(callback => {
      try {
        callback(location);
      } catch (error) {
        console.error("Status update callback error:", error);
      }
    });
  }

  async enrichLocationData(locations) {
    console.log('🔍 Starting enrichLocationData for', locations.length, 'locations');

    const locationsWithAPI = locations.filter(loc => loc.spaceapi?.endpoint);
    console.log('📡 Found', locationsWithAPI.length, 'locations with SpaceAPI');

    const promises = locations.map(async (location) => {
      if (location.spaceapi?.endpoint) {
        try {
          console.log("🔍 Fetching SpaceAPI for:", location.name, "from", location.spaceapi.endpoint);
          const isOpen = await this.fetchSpaceStatus(location.spaceapi.endpoint);
          location.isOpen = isOpen;

          console.log("📊 SpaceAPI Result:", location.name, "isOpen =", isOpen, "(type:", typeof isOpen, ")");

          // *** FEUER EVENT wenn Status geladen ist ***
          this.fireStatusUpdate(location);

        } catch (error) {
          console.log("❌ SpaceAPI Error for", location.name, ":", error.message);
          location.isOpen = null;
          this.fireStatusUpdate(location); // Auch bei Fehler Event feuern
        }
      }
      // WICHTIG: Setze isOpen NICHT für Locations ohne SpaceAPI
      // So bleibt es undefined und wir können unterscheiden zwischen:
      // - undefined: keine SpaceAPI
      // - null: SpaceAPI vorhanden, aber Status konnte nicht abgerufen werden
      // - true/false: SpaceAPI vorhanden und Status bekannt

      return location;
    });

    const results = await Promise.all(promises);

    // WICHTIG: Nach dem Laden alle Werte loggen
    const trueCount = results.filter(loc => loc.isOpen === true).length;
    const falseCount = results.filter(loc => loc.isOpen === false).length;
    const nullCount = results.filter(loc => loc.isOpen === null).length;
    const undefinedCount = results.filter(loc => loc.isOpen === undefined).length;

    console.log('✅ enrichLocationData COMPLETE:');
    console.log(`   🟢 isOpen === true: ${trueCount}`);
    console.log(`   🔴 isOpen === false: ${falseCount}`);
    console.log(`   🟠 isOpen === null (error): ${nullCount}`);
    console.log(`   ⚪ isOpen === undefined (no API): ${undefinedCount}`);

    return results;
  }

  async fetchSpaceStatus(apiEndpoint) {
    const cached = this.statusCache.get(apiEndpoint);

    if (cached && (Date.now() - cached.timestamp) < this.cacheDuration) {
      console.log('💾 Using cached result for', apiEndpoint, ':', cached.data);
      return cached.data;
    }

    // STRATEGIE: Erst direkt versuchen, bei CORS-Fehler dann mit Proxy
    let isOpen = await this.tryDirectFetch(apiEndpoint);

    if (isOpen === undefined) {
      // Direkter Zugriff hat nicht funktioniert, versuche mit Proxy
      console.log('🔄 Trying with CORS proxy for', apiEndpoint);
      isOpen = await this.tryProxyFetch(apiEndpoint);
    }

    if (isOpen !== null && isOpen !== undefined) {
      this.statusCache.set(apiEndpoint, {
        data: isOpen,
        timestamp: Date.now()
      });
    }

    return isOpen;
  }

  async tryDirectFetch(apiEndpoint) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.requestTimeout);

      const response = await fetch(apiEndpoint, {
        signal: controller.signal,
        headers: {
          'Accept': 'application/json',
          'Cache-Control': 'no-cache'
        }
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        console.log('❌ Direct fetch failed:', response.status, 'for', apiEndpoint);
        return undefined; // Zeigt an: Mit Proxy versuchen
      }

      const data = await response.json();
      console.log('✅ Direct fetch SUCCESS for', apiEndpoint);
      console.log('🌐 Raw SpaceAPI response:', data);

      const isOpen = data.state?.open;
      console.log('🎯 Extracted isOpen:', isOpen, '(type:', typeof isOpen, ')');

      return isOpen;

    } catch (error) {
      // CORS-Fehler oder Netzwerkfehler = undefined zurückgeben
      console.log('⚠️ Direct fetch error (will try proxy):', error.message);
      return undefined;
    }
  }

  async tryProxyFetch(apiEndpoint) {
    try {
      // Verwende allorigins als Fallback
      const url = `https://api.allorigins.win/raw?url=${encodeURIComponent(apiEndpoint)}`;

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.requestTimeout * 2); // Doppelter Timeout für Proxy

      const response = await fetch(url, {
        signal: controller.signal,
        headers: { 'Accept': 'application/json' }
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        console.log('❌ Proxy fetch failed:', response.status);
        return null;
      }

      const data = await response.json();
      console.log('✅ Proxy fetch SUCCESS for', apiEndpoint);

      const isOpen = data.state?.open;
      console.log('🎯 Extracted isOpen:', isOpen, '(type:', typeof isOpen, ')');

      return isOpen;

    } catch (error) {
      console.log('🚫 Proxy fetch error for', apiEndpoint, ':', error.message);
      return null;
    }
  }

  getStatusIcon(location, icons) {
    console.log("🎨 getStatusIcon called for:", location.name);
    console.log("🎨 location.isOpen =", location.isOpen, "(type:", typeof location.isOpen, ")");
    console.log("🎨 location.spaceapi =", location.spaceapi);

    if (!icons) {
      console.error("⚠ Icons object is undefined!");
      return null;
    }

    const isOpen = location.isOpen;

    if (isOpen === true) {
      console.log("🟢 Using GREEN icon for", location.name);
      return icons.greenIcon || icons.defaultIcon;
    } else if (isOpen === false) {
      console.log("🔴 Using RED icon for", location.name);
      return icons.redIcon || icons.defaultIcon;
    } else if (location.spaceapi && location.spaceapi.endpoint) {
      // Hat SpaceAPI aber Status unbekannt - ORANGE
      console.log("🟠 Using ORANGE (unknownStatus) icon for", location.name);
      return icons.unknownStatusIcon || icons.defaultIcon;
    } else {
      // Hat KEINE SpaceAPI - SCHWARZ/GRAU
      console.log("⚫ Using BLACK/GREY (highlight) icon for", location.name);
      return icons.highlightIcon || icons.defaultIcon;
    }
  }
}

window.SimpleSpaceAPI = SimpleSpaceAPI;