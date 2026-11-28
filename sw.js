// Service Worker – makerspac.es
// Strategie:
//   Cache-First  → Libs, Fonts, Icons, CSS (statische Assets)
//   Netz zuerst  → Daten-JSON (markers/spaces-*/splits-manifest/locations): nach einem Deploy sofort frisch, Cache nur offline / bei Netz > 4 s
//   Network-First → HTML (immer aktuelle Version)

// Strategie-Update: status.json → Network-First (immer aktuell); Rest s.o.
const VERSION = 'v137'; // Deploy-Bot erhöht sie bei JEDEM Deploy mit geänderten App-Dateien → neues sw.js → Geräte installieren neu + „Veraltet“-Hinweis
const TILES_VERSION = 'v1'; // Kartenkacheln unabhängig von VERSION: ein Deploy löscht sie NICHT (nur bei geänderter Kachel-Strategie von Hand erhöhen)
const CACHE_STATIC = `ms-static-${VERSION}`;
const CACHE_DATA = `ms-data-${VERSION}`;
const CACHE_TILES = `ms-tiles-${TILES_VERSION}`;

const STATIC_ASSETS = [
  // HTML
  '/',
  '/index.html',
  // App CSS
  '/main-layout.css',
  '/main-components.css',
  '/main-responsive.css',
  '/listing-core.css',
  '/search.css',
  '/nearby.css',
  '/styles-autocomplete.css',
  // Libs CSS
  '/libs/leaflet/leaflet.css',
  '/libs/leaflet-markercluster/MarkerCluster.css',
  '/libs/leaflet-markercluster/MarkerCluster.Default.css',
  // maplibre-gl.css: lazy-loaded in tile-loader.js (vector mode only)
  // → not precached here; SW caches it on first fetch via cacheFirst fallback
  '/libs/microtip.css',
  '/libs/flag-icons/css/flag-icons.min.css',
  '/libs/fontawesome/css/subset.min.css',
  // Libs JS
  '/libs/leaflet/leaflet.js',
  '/libs/leaflet-markercluster/leaflet.markercluster.js',
  // maplibre-gl.js + leaflet-maplibre-gl.js: lazy-loaded in map.js (vector mode only)
  // → not precached here; SW caches them on first fetch via cacheFirst fallback
  '/libs/qrcode.min.js',
  // App JS
  '/tile-loader.js',
  '/data-preload.js',
  '/toast.js',
  '/date-utils.js',
  '/app-context.js',
  '/error-monitor.js',
  '/colours.js',
  '/workshop-types.js',
  '/filter-config.js',
  '/config.js',
  '/spaceapi-static.js',
  '/i18n.js',
  '/datasync.js',
  '/bookmark-manager.js',
  '/data-store.js',
  '/listing-core.js',
  '/zoom-manager.js',
  '/search-filter.js',
  '/search-pills.js',
  '/autocomplete-manager.js',
  '/search-header.js',
  '/admin-shortcut.js',
  '/nearby-header.js',
  '/embed.js',
  '/embed-loader.js',
  '/add-space-form.js',
  '/embed-overlay.js',
  '/changes-panel.js',
  '/update-notice.js',
  '/overlay-loader.js',
  '/main.js',
  '/mobile-filter.js',
  '/dropdown-pager.js',
  '/layout-mode.js',
  '/popup-builder.js',
  '/map.js',
  '/marker-manager.js',
  '/routing.js',
  '/demo-mode.js',
  '/push-notify.js',   // lazy (Einstellungen → Benachrichtigungen)
  // Fonts
  '/fonts/Roboto-SemiBold.woff2',
  // FA Fonts
  '/libs/fontawesome/webfonts/fa-solid-900.woff2',
  '/libs/fontawesome/webfonts/fa-regular-400.woff2',
  '/libs/fontawesome/webfonts/fa-brands-400.woff2',
];

const DATA_URLS = [
  '/locations.json',
  '/status.json',
  '/data/markers.json',
  '/data/splits-manifest.json',
  '/data/changes.json',
];

// ─── Install: alle statischen Assets precachen ────────────────────────────────
// Einzelne Requests mit Catch statt cache.addAll() — ein 404 bricht nicht alles ab.
// cache: 'reload' umgeht den HTTP-Cache: JS/CSS haben dort 48 h max-age (.htaccess); mit cache.add() holte ein neuer Service Worker
// sonst die ALTEN Dateien aus dem Browser-Cache in seinen frischen Cache → Änderungen blieben nach einem Deploy unsichtbar.
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_STATIC)
      .then(cache => Promise.all(
        STATIC_ASSETS.map(url =>
          fetch(new Request(url, { cache: 'reload' }))
            .then(res => { if (!res.ok) throw new Error(`HTTP ${res.status}`); return cache.put(url, res); })
            .catch(() => console.warn(`SW: Precache miss – ${url}`))
        )
      ))
      .then(() => self.skipWaiting())
  );
});

// ─── Activate: alte Cache-Versionen löschen ───────────────────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(k => k !== CACHE_STATIC && k !== CACHE_DATA && k !== CACHE_TILES)
          .map(k => caches.delete(k))
      )
    )
    // Kein clients.claim() — iOS Safari/PWA würde sonst bei SW-Update in einen Reload-Loop geraten.
    // Neue Navigationen (Reload, neuer Tab) nutzen automatisch den neuen SW.
  );
});

// ─── Fetch: Strategie je nach URL ─────────────────────────────────────────────
self.addEventListener('fetch', event => {
  const { request } = event;
  // Nur GET behandeln: POST & Co. (z. B. push/subscribe.php) gehen unverändert ans Netz. Ohne diese Zeile lief jede POST-Antwort in
  // cacheFirst() in cache.put(POST) → TypeError → Netzwerkfehler, obwohl der Server geantwortet hatte (Meldungs-Schalter blieb auf „aus“).
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  const path = url.pathname;

  // 1a. MapLibre Style-JSON → SWR (bleibt aktuell, Karte startet offline sofort)
  //     MapLibre Vector Tiles → Cache-First (ändert sich selten, Bandbreite schonen)
  if (url.hostname.includes('tiles.openfreemap.org')) {
    if (url.pathname.startsWith('/styles/')) {
      event.respondWith(staleWhileRevalidate(request, CACHE_TILES));
    } else {
      event.respondWith(cacheFirst(request, CACHE_TILES));
    }
    return;
  }

  // 1b. OSM Raster Tiles (Fallback für Low-Memory / kein WebGL) → Cache-First
  if (url.hostname === 'tile.openstreetmap.org') {
    event.respondWith(cacheFirst(request, CACHE_TILES));
    return;
  }

  // Nur eigene Origin abfangen (außer Tiles)
  if (url.origin !== self.location.origin) return;

  // Admin-Review (/admin/) nie cachen — immer frisch vom Netz
  if (path.startsWith('/admin/')) return;

  // Daten zuerst prüfen — VOR dem HTML-Test: Öffnet man eine Daten-URL direkt im Browser-Tab (Navigation, Accept: text/html),
  // darf sie nicht als HTML per SWR aus dem Cache kommen (zeigte den alten Stand).
  // status.json → Network-First: Live-Öffnungsstatus muss immer aktuell sein
  // (SWR würde erst den Cache zeigen); Cache nur als Offline-Fallback
  if (path.endsWith('/status.json')) {
    event.respondWith(networkFirst(request, CACHE_DATA));
    return;
  }

  // JSON-Daten → Netz zuerst (Stale-While-Revalidate zeigte nach einem Deploy erst beim 2. Laden die neuen Daten);
  // Cache nur als Rückfall (offline / Netz zu langsam). DATA_URLS: exakte Pfad-Matches; zusätzlich /data/spaces-*.json per Regex
  if (DATA_URLS.some(u => path.endsWith(u)) || /^\/data\/spaces-[a-z]+\.json$/.test(path)) {
    event.respondWith(networkFirstFresh(request, CACHE_DATA));
    return;
  }

  // HTML → Stale-While-Revalidate: Start sofort aus dem Cache (kein Warten auf langsames Netz).
  // Passt zu JS/CSS (cache-first, pro SW-VERSION neu vorgecacht) → HTML und Assets bleiben konsistent.
  if (request.headers.get('accept')?.includes('text/html')) {
    event.respondWith(staleWhileRevalidate(request, CACHE_STATIC));
    return;
  }

  // Alles andere (JS, CSS, Fonts, Bilder) → Cache-First
  event.respondWith(cacheFirst(request, CACHE_STATIC));
});

// ─── Strategien ───────────────────────────────────────────────────────────────

async function cacheFirst(request, cacheName) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) {
    const cache = await caches.open(cacheName);
    cache.put(request, response.clone());
  }
  return response;
}

async function networkFirst(request, cacheName) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    return caches.match(request);
  }
}

/**
 * Daten: immer beim Server nachfragen (cache: 'no-cache' umgeht auch den HTTP-Cache, ETag/304 hält es billig).
 * Gibt es schon eine Kopie, gilt das Netz höchstens `timeoutMs`; danach (oder offline/Fehler) kommt die Kopie, und die
 * frische Antwort aktualisiert den Cache trotzdem noch.
 */
async function networkFirstFresh(request, cacheName, timeoutMs = 4000) {
  const cache = await caches.open(cacheName);
  const fresh = fetch(request, { cache: 'no-cache' }).then(response => {
    if (response.ok) cache.put(request, response.clone());
    return response;
  });
  fresh.catch(() => {}); // Fehler nach einem Timeout nicht als unbehandelt melden
  const cached = await cache.match(request);
  if (!cached) return fresh;
  try {
    return await Promise.race([fresh, new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), timeoutMs))]);
  } catch {
    return cached;
  }
}

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);

  const fetchPromise = fetch(request).then(response => {
    if (response.ok) cache.put(request, response.clone());
    return response;
  }).catch(() => null);

  return cached ?? await fetchPromise;
}

// ─── Web Push: Favoriten, die bald öffnen (Versand: tools/send-push.js; Payload { title, body, tag, url }) ─────────
self.addEventListener('push', event => {
  let d = {};
  try { d = event.data ? event.data.json() : {}; } catch { d = { body: event.data ? event.data.text() : '' }; }
  event.waitUntil(self.registration.showNotification(d.title || 'makerspac.es', {
    body: d.body || '',
    tag: d.tag,                                   // gleicher Space = ersetzt statt zu stapeln
    icon: '/icons/android-chrome-192x192.png',
    badge: '/icons/favicon-32x32.png',
    data: { url: d.url || '/' },
  }));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  // Nur eigene Adressen öffnen (Payload kommt zwar von uns, aber nie blind navigieren)
  const target = new URL(event.notification.data?.url || '/', self.location.origin);
  const url = target.origin === self.location.origin ? target.href : self.location.origin + '/';
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
    const open = list.find(c => c.url.startsWith(self.location.origin));
    if (open) { open.navigate(url).catch(() => {}); return open.focus(); }
    return self.clients.openWindow(url);
  }));
});
