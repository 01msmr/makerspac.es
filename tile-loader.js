// @ts-check
// tile-loader.js — Tile-Mode-Erkennung und lazy MapLibre-Loader
// Shared zwischen map.js (index.html) und embed.js (embed.html)

/**
 * Detects whether this device should use raster tiles (OSM PNG) instead of
 * vector tiles (MapLibre GL / WebGL). First match wins.
 * @returns {'vector'|'raster'}
 */
export function detectTileMode() {
  const ua = navigator.userAgent;

  // ── Non-iOS path ──────────────────────────────────────────────────────────
  if (!/iPhone|iPad/i.test(ua)) {
    // Low RAM (Android/Chrome — not available on iOS)
    if (navigator.deviceMemory && navigator.deviceMemory <= 2) return 'raster';
    // WebGL unavailable (e.g. Raspberry Pi Chromium)
    try {
      const canvas = document.createElement('canvas');
      if (!canvas.getContext('webgl2') && !canvas.getContext('webgl')) return 'raster';
    } catch { return 'raster'; }
    return 'vector';
  }

  // ── iOS path ──────────────────────────────────────────────────────────────
  // iOS version < 15: no WebGL2 in Safari, older Metal backend → raster
  const iosVersion = parseInt(ua.match(/OS (\d+)_/)?.[1] ?? '0');
  if (iosVersion < 15) return 'raster';

  // iOS 15+: test WebGL2 as proxy for A12+ GPU (iPhone XR and newer).
  // A9/A10 devices (iPhone 6s–8) upgraded to iOS 15 return null for webgl2.
  // CRITICAL: loseContext() immediately — an abandoned WebGL context on iOS
  // keeps the GPU spinning → device heats up and crashes.
  try {
    const canvas = document.createElement('canvas');
    const gl2 = canvas.getContext('webgl2');
    if (!gl2) return 'raster';
    gl2.getExtension('WEBGL_lose_context')?.loseContext();
    return 'vector';
  } catch { return 'raster'; }
}

/** @type {'vector'|'raster'|null} */
let _tileMode = null;

/**
 * Lazily detects and caches the tile mode. Cached after first call so that
 * the module can be imported in Node.js without triggering DOM access.
 * @returns {'vector'|'raster'}
 */
export function getTileMode() {
  if (_tileMode === null) _tileMode = detectTileMode();
  return _tileMode;
}

/**
 * Dynamically loads maplibre-gl.js + leaflet-maplibre-gl.js + maplibre-gl.css
 * — only when vector mode is active. JS scripts are loaded sequentially (the
 * Leaflet plugin requires maplibre-gl global), CSS is loaded in parallel.
 * @param {('vector'|'raster')=} mode - Tile mode; defaults to getTileMode() for lazy detection.
 *        Pass explicitly to override (primarily for testing).
 * @returns {Promise<void>}
 */
export function loadMaplibreIfNeeded(mode = getTileMode()) {
  if (mode !== 'vector') return Promise.resolve();

  const loadScript = (/** @type {string} */ src) => new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.onload = resolve;
    s.onerror = reject;
    document.head.appendChild(s);
  });

  const loadCSS = (/** @type {string} */ href) => new Promise((resolve, reject) => {
    const l = document.createElement('link');
    l.rel = 'stylesheet';
    l.href = href;
    l.onload = resolve;
    l.onerror = reject;
    document.head.appendChild(l);
  });

  // CSS starts in parallel with the first JS script; second JS script is
  // sequential after the first (leaflet-maplibre-gl.js needs the maplibre global).
  const cssPromise = loadCSS('/libs/maplibre-gl/maplibre-gl.css');
  const jsPromise = loadScript('/libs/maplibre-gl/maplibre-gl.js')
    .then(() => loadScript('/libs/maplibre-leaflet/leaflet-maplibre-gl.js'));

  return Promise.all([jsPromise, cssPromise]).then(() => undefined);
}
