// DEBUG NEUER ANSATZ: Event-System in spaceapi-detect.js

class SimpleSpaceAPI {
  constructor() {
    this.statusCache = new Map();
    this.cacheDuration = 5 * 60 * 1000;
    this.requestTimeout = 3000;
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
      } else {
        location.isOpen = null;
      }
      return location;
    });

    return Promise.all(promises);
  }

  async fetchSpaceStatus(apiEndpoint) {
    const cached = this.statusCache.get(apiEndpoint);

    if (cached && (Date.now() - cached.timestamp) < this.cacheDuration) {
      console.log("💾 Using cached result for", apiEndpoint, ":", cached.data);
      return cached.data;
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.requestTimeout);

      const response = await fetch(apiEndpoint, {
        signal: controller.signal,
        headers: { 'Accept': 'application/json' }
      });

      clearTimeout(timeoutId);

      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const data = await response.json();
      console.log("🌐 Raw SpaceAPI response for", apiEndpoint, ":", data);

      const isOpen = data.state?.open;
      console.log("🎯 Extracted isOpen:", isOpen, "(type:", typeof isOpen, ")");

      this.statusCache.set(apiEndpoint, {
        data: isOpen,
        timestamp: Date.now()
      });

      return isOpen;

    } catch (error) {
      console.log("🚫 Fetch error for", apiEndpoint, ":", error.message);
      return null;
    }
  }

  getStatusIcon(location, icons) {
    console.log("🎨 getStatusIcon called for:", location.name);
    console.log("🎨 location.isOpen =", location.isOpen, "(type:", typeof location.isOpen, ")");
    console.log("🎨 Available icons:", Object.keys(icons || {}));

    // *** VERBESSERTER Icon-Check mit Fallbacks ***
    if (!icons) {
      console.error("❌ Icons object is undefined!");
      return null;
    }

    const isOpen = location.isOpen;

    if (isOpen === true) {
      console.log("🟢 Using GREEN icon for", location.name);
      return icons.greenIcon || icons.highlightIcon || icons.defaultIcon;
    } else if (isOpen === false) {
      console.log("🔴 Using RED icon for", location.name);
      return icons.redIcon || icons.highlightIcon || icons.defaultIcon;
    } else {
      console.log("🟠 Using ORANGE icon for", location.name, "(isOpen is", isOpen, ")");
      return icons.highlightIcon || icons.defaultIcon;
    }
  }
}

window.SimpleSpaceAPI = SimpleSpaceAPI;