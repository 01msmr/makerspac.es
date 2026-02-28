// Service Worker – makerspac.es
// Strategie:
//   Cache-First  → Libs, Fonts, Icons, CSS (statische Assets)
//   SWR          → locations.json, status.json (Daten zeigen, im Hintergrund aktualisieren)
//   Network-First → HTML (immer aktuelle Version)

const VERSION = 'v8'; // bei Deployment erhöhen → alle Caches werden erneuert
const CACHE_STATIC = `ms-static-${VERSION}`;
const CACHE_DATA   = `ms-data-${VERSION}`;

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
  '/libs/maplibre-gl/maplibre-gl.css',
  '/libs/microtip.css',
  '/libs/flag-icons/css/flag-icons.min.css',
  '/libs/fontawesome/css/subset.min.css',
  // Libs JS
  '/libs/leaflet/leaflet.js',
  '/libs/leaflet-markercluster/leaflet.markercluster.js',
  '/libs/maplibre-gl/maplibre-gl.js',
  '/libs/maplibre-leaflet/leaflet-maplibre-gl.js',
  '/libs/qrcode.min.js',
  // App JS
  '/app-context.js',
  '/error-monitor.js',
  '/utils.js',
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
  '/search-header.js',
  '/nearby-header.js',
  '/embed.js',
  '/main.js',
  '/mobile-filter.js',
  '/map.js',
  '/routing.js',
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
];

// ─── Install: alle statischen Assets precachen ────────────────────────────────
// Einzelne cache.add() mit Catch statt cache.addAll() — ein 404 bricht nicht alles ab.
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_STATIC)
      .then(cache => Promise.all(
        STATIC_ASSETS.map(url =>
          cache.add(url).catch(() => console.warn(`SW: Precache miss – ${url}`))
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
          .filter(k => k !== CACHE_STATIC && k !== CACHE_DATA)
          .map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

// ─── Fetch: Strategie je nach URL ─────────────────────────────────────────────
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // Nur eigene Origin abfangen, keine Tile-URLs etc.
  if (url.origin !== self.location.origin) return;

  const path = url.pathname;

  // HTML → Network-First
  if (request.headers.get('accept')?.includes('text/html')) {
    event.respondWith(networkFirst(request, CACHE_STATIC));
    return;
  }

  // JSON-Daten → Stale-While-Revalidate
  // DATA_URLS: exakte Pfad-Matches; zusätzlich /data/spaces-*.json per Regex
  if (DATA_URLS.some(u => path.endsWith(u)) || /^\/data\/spaces-[a-z]+\.json$/.test(path)) {
    event.respondWith(staleWhileRevalidate(request, CACHE_DATA));
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

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);

  const fetchPromise = fetch(request).then(response => {
    if (response.ok) cache.put(request, response.clone());
    return response;
  }).catch(() => null);

  return cached ?? await fetchPromise;
}
