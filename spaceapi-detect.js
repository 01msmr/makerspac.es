// DEBUG NEUER ANSATZ: Event-System in spaceapi-detect.js

class SimpleSpaceAPI {
  constructor() {
    this.statusCache = new Map();
    this.cacheDuration = 5 * 60 * 1000; // 🔄 Cache-Dauer: 5 Minuten
    this.requestTimeout = 5000; // ⚡ 5 Sekunden (schneller Timeout)
    this.listeners = []; // Event-Listener für Status-Updates

    console.log('🗄️ SpaceAPI Cache initialized with', this.cacheDuration / 1000 / 60, 'minutes cache duration');
    console.log('⏱️ Request timeout:', this.requestTimeout / 1000, 'seconds');
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

    // ⚡ BATCH PROCESSING: Lade APIs in Gruppen für bessere Performance
    const batchSize = 10; // 10 APIs gleichzeitig
    let completed = 0;

    for (let i = 0; i < locationsWithAPI.length; i += batchSize) {
      const batch = locationsWithAPI.slice(i, i + batchSize);
      const batchNumber = Math.floor(i / batchSize) + 1;
      const totalBatches = Math.ceil(locationsWithAPI.length / batchSize);

      console.log(`📦 Processing batch ${batchNumber}/${totalBatches} (${batch.length} APIs)...`);

      // Lade diese Batch parallel
      await Promise.all(batch.map(async (location) => {
        try {
          const isOpen = await this.fetchSpaceStatus(location.spaceapi.endpoint);
          location.isOpen = isOpen;

          // Feuer Event für Live-Update
          this.fireStatusUpdate(location);

          completed++;
          console.log(`📊 Progress: ${completed}/${locationsWithAPI.length} (${Math.round(completed / locationsWithAPI.length * 100)}%)`);

        } catch (error) {
          console.log("❌ SpaceAPI Error for", location.name, ":", error.message);
          location.isOpen = null;
          this.fireStatusUpdate(location);
          completed++;
        }
      }));

      console.log(`✅ Batch ${batchNumber}/${totalBatches} complete!`);
    }

    // WICHTIG: Nach dem Laden alle Werte loggen
    const trueCount = locations.filter(loc => loc.isOpen === true).length;
    const falseCount = locations.filter(loc => loc.isOpen === false).length;
    const nullCount = locations.filter(loc => loc.isOpen === null).length;
    const undefinedCount = locations.filter(loc => loc.isOpen === undefined).length;

    console.log('✅ enrichLocationData COMPLETE:');
    console.log(`   🟢 isOpen === true: ${trueCount}`);
    console.log(`   🔴 isOpen === false: ${falseCount}`);
    console.log(`   🟠 isOpen === null (error): ${nullCount}`);
    console.log(`   ⚪ isOpen === undefined (no API): ${undefinedCount}`);

    return locations;
  }

  async fetchSpaceStatus(apiEndpoint) {
    const cached = this.statusCache.get(apiEndpoint);

    if (cached && (Date.now() - cached.timestamp) < this.cacheDuration) {
      const ageMinutes = Math.round((Date.now() - cached.timestamp) / 1000 / 60);
      console.log(`💾 Using cached result for ${apiEndpoint} (age: ${ageMinutes}min):`, cached.data);
      return cached.data;
    }

    if (cached) {
      const ageMinutes = Math.round((Date.now() - cached.timestamp) / 1000 / 60);
      console.log(`🗑️ Cache expired for ${apiEndpoint} (age: ${ageMinutes}min), fetching fresh data...`);
    }

    // STRATEGIE: Erst direkt versuchen, dann mehrere Proxies
    let isOpen = await this.tryDirectFetch(apiEndpoint);

    if (isOpen === undefined) {
      // Direkter Zugriff hat nicht funktioniert, versuche Proxy
      console.log('🔄 Direct fetch failed, trying proxy for', apiEndpoint);
      isOpen = await this.tryProxyFetch(apiEndpoint);
    }

    if (isOpen !== null && isOpen !== undefined) {
      this.statusCache.set(apiEndpoint, {
        data: isOpen,
        timestamp: Date.now()
      });
      console.log(`💾 Cached result for ${apiEndpoint}:`, isOpen);
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

      const rawOpen = data.state?.open;
      // Manche Spaces liefern 0/1 statt false/true
      const isOpen = rawOpen === 1 || rawOpen === true ? true :
        rawOpen === 0 || rawOpen === false ? false : null;
      console.log('🎯 Extracted isOpen:', isOpen, '(raw:', rawOpen, typeof rawOpen, ')');

      return isOpen;

    } catch (error) {
      // CORS-Fehler oder Netzwerkfehler = undefined zurückgeben
      console.log('⚠️ Direct fetch error (will try proxy):', error.message);
      return undefined;
    }
  }

  async tryProxyFetch(apiEndpoint) {
    try {
      // Versuche corsproxy.io
      const url = `https://corsproxy.io/?${encodeURIComponent(apiEndpoint)}`;

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.requestTimeout);

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

      const rawOpen = data.state?.open;
      // Manche Spaces liefern 0/1 statt false/true
      const isOpen = rawOpen === 1 || rawOpen === true ? true :
        rawOpen === 0 || rawOpen === false ? false : null;
      console.log('🎯 Extracted isOpen:', isOpen, '(raw:', rawOpen, typeof rawOpen, ')');

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

  // 🆕 NEUE HILFSFUNKTIONEN FÜR CACHE-MANAGEMENT

  // Zeige Cache-Statistiken
  getCacheStats() {
    const stats = {
      total: this.statusCache.size,
      valid: 0,
      expired: 0,
      entries: []
    };

    this.statusCache.forEach((cached, endpoint) => {
      const age = Date.now() - cached.timestamp;
      const ageMinutes = Math.round(age / 1000 / 60);
      const isExpired = age >= this.cacheDuration;

      if (isExpired) {
        stats.expired++;
      } else {
        stats.valid++;
      }

      stats.entries.push({
        endpoint,
        isOpen: cached.data,
        ageMinutes,
        isExpired
      });
    });

    return stats;
  }

  // Zeige Cache-Info in Console
  logCacheInfo() {
    const stats = this.getCacheStats();
    console.log('📊 Cache Statistics:');
    console.log(`   Total entries: ${stats.total}`);
    console.log(`   Valid: ${stats.valid}`);
    console.log(`   Expired: ${stats.expired}`);
    console.log(`   Cache duration: ${this.cacheDuration / 1000 / 60} minutes`);

    if (stats.entries.length > 0) {
      console.log('\n📋 Cache Entries:');
      stats.entries.forEach(entry => {
        const status = entry.isExpired ? '🗑️ EXPIRED' : '✅ VALID';
        const openStatus = entry.isOpen === true ? '🟢 OPEN' :
          entry.isOpen === false ? '🔴 CLOSED' : '🟠 UNKNOWN';
        console.log(`   ${status} ${openStatus} ${entry.endpoint} (${entry.ageMinutes}min old)`);
      });
    }
  }

  // Lösche abgelaufene Cache-Einträge
  cleanExpiredCache() {
    let cleaned = 0;
    this.statusCache.forEach((cached, endpoint) => {
      if (Date.now() - cached.timestamp >= this.cacheDuration) {
        this.statusCache.delete(endpoint);
        cleaned++;
      }
    });
    console.log(`🧹 Cleaned ${cleaned} expired cache entries`);
    return cleaned;
  }

  // Lösche den gesamten Cache
  clearCache() {
    const size = this.statusCache.size;
    this.statusCache.clear();
    console.log(`🗑️ Cleared entire cache (${size} entries)`);
    return size;
  }
}

window.SimpleSpaceAPI = SimpleSpaceAPI;