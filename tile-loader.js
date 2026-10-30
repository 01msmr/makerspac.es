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

/** Vector-Style (SSOT für map.js + embed.js + Preload). */
export const MAPLIBRE_STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty';

/** @type {Promise<void>|null} */
// ── Stil-Optimierung ────────────────────────────────────────────────────────
// Der OpenFreeMap-Stil „liberty“ legt ein Natural-Earth-Relief (PNG-Kacheln, je ≈ 130–190 KB!) unter die Karte, das bei
// Zoom ≥ 6 nur noch 10 % Deckkraft hat. Im Start-Ausschnitt wären das ≈ 15 Kacheln ≈ 2 MB für kaum sichtbare Pixel.
// Der Layer wird deshalb auf Zoom < RELIEF_MAX_ZOOM begrenzt; beim weiten Herauszoomen lädt er wie gewohnt.
// ACHTUNG: MapLibre-Zoom = Leaflet-Zoom − 1 (512-px-Kacheln); der Start-Ausschnitt liegt bei MapLibre-Zoom ≈ 4,8.
const RELIEF_SOURCE = 'ne2_shaded';
const RELIEF_MAX_ZOOM = 4;

/**
 * Begrenzt den Relief-Layer des Stils auf Zoom < RELIEF_MAX_ZOOM (rein, mutiert die Eingabe nicht).
 * @param {any} style MapLibre-Stil (JSON)
 * @returns {any}
 */
export function trimStyle(style) {
  if (!Array.isArray(style?.layers)) return style;
  return {
    ...style,
    layers: style.layers.map(layer => layer.source === RELIEF_SOURCE
      ? { ...layer, maxzoom: Math.min(layer.maxzoom ?? RELIEF_MAX_ZOOM, RELIEF_MAX_ZOOM) }
      : layer),
  };
}

/**
 * Trennt die Symbol-Layer (Beschriftungen, Icons) vom Rest des Stils. Ohne Symbol-Layer lädt MapLibre weder die
 * Glyphen-PBFs (im Start-Ausschnitt ≈ 23 Dateien ≈ 1,2 MB, nötig für Namen in vielen Schriften) noch zeichnet es
 * Text: Straßen, Wasser und Flächen erscheinen sofort. Die Symbol-Layer werden danach mit addLayer nachgereicht.
 * `before` = erster folgende Nicht-Symbol-Layer (Einfügeposition), undefined = ganz oben. Rein, mutiert nichts.
 * @param {any} style
 * @returns {{base: any, deferred: {layer: any, before: string|undefined}[]}}
 */
export function splitSymbolLayers(style) {
  if (!Array.isArray(style?.layers) || !style.layers.some(l => l.type === 'symbol')) return { base: style, deferred: [] };
  const { layers } = style;
  const deferred = layers.flatMap((layer, i) => layer.type !== 'symbol' ? [] : [{
    layer,
    before: layers.slice(i + 1).find(l => l.type !== 'symbol')?.id,
  }]);
  return { base: { ...style, layers: layers.filter(l => l.type !== 'symbol') }, deferred };
}

/** Lädt den (per <link rel=preload> schon angeforderten) Stil und wendet trimStyle an */
export const loadTrimmedStyle = () => fetch(MAPLIBRE_STYLE_URL)
  .then(r => { if (!r.ok) throw new Error(`Stil ${r.status}`); return r.json(); })
  .then(trimStyle);

// ── Pins zuerst ─────────────────────────────────────────────────────────────
// MapLibre (≈ 190 KB br) + Style konkurrieren sonst mit Daten und Modulen um die Bandbreite. Die Pins (Marker) sind
// der eigentliche Inhalt; die Kacheln dürfen nachziehen. Gate = erstes filterResultsChanged (dasselbe Ereignis,
// das das Loading-Skeleton beendet).
let resolvePinsShown;
const pinsShown = new Promise(resolve => { resolvePinsShown = resolve; });
if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
  document.addEventListener('filterResultsChanged', () => resolvePinsShown(), { once: true });
} else {
  resolvePinsShown(); // keine DOM-Umgebung (Tests/Worker): nicht blockieren
}

/** Resolved, sobald die ersten Treffer/Pins angezeigt wurden */
export const whenPinsShown = () => pinsShown;

/** Wie loadMaplibreIfNeeded(), aber erst nachdem die Pins angezeigt wurden */
export const loadMaplibreAfterPins = () => pinsShown.then(() => loadMaplibreIfNeeded());

let _maplibrePromise = null;

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
  // Idempotent: index.html stößt das Laden früh an (parallel zum Modul-Graph),
  // map.js init() ruft später erneut auf und bekommt dasselbe Promise.
  if (_maplibrePromise) return _maplibrePromise;

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
  // Style-JSON parallel zum MapLibre-JS holen statt erst nach dessen Ausführung
  // (spart die Wartezeit der Kette style → tilejson/sprites → tiles).
  const pre = document.createElement('link');
  pre.rel = 'preload'; pre.as = 'fetch'; pre.crossOrigin = 'anonymous'; pre.href = MAPLIBRE_STYLE_URL;
  document.head.appendChild(pre);

  // Plugin (10 KB) parallel vorladen statt erst nach Ausführung von maplibre-gl.js zu laden (spart 1 RTT)
  const prePlugin = document.createElement('link');
  prePlugin.rel = 'preload'; prePlugin.as = 'script'; prePlugin.href = '/libs/maplibre-leaflet/leaflet-maplibre-gl.js';
  document.head.appendChild(prePlugin);

  const cssPromise = loadCSS('/libs/maplibre-gl/maplibre-gl.css');
  // Das Plugin erweitert L → bei frühem Start (vor den defer-Libs) bis DOMContentLoaded warten
  const pluginSrc = '/libs/maplibre-leaflet/leaflet-maplibre-gl.js';
  const jsPromise = loadScript('/libs/maplibre-gl/maplibre-gl.js').then(() =>
    document.readyState === 'loading'
      ? new Promise(r => document.addEventListener('DOMContentLoaded', r, { once: true })).then(() => loadScript(pluginSrc))
      : loadScript(pluginSrc));

  _maplibrePromise = Promise.all([jsPromise, cssPromise]).then(() => undefined);
  return _maplibrePromise;
}
