// tests/tile-loader.test.js
// Tests für tile-loader.js: detectTileMode() und loadMaplibreIfNeeded()
// Läuft mit: node --test tests/tile-loader.test.js

// ─── Browser-Stubs (vor allen Imports setzen) ─────────────────────────────

let appendedElements = [];
let webglContextFactory = (_type) => null;

const makeCanvas = () => ({
  getContext(type) { return webglContextFactory(type); }
});

global.document = {
  createElement(tag) {
    if (tag === 'canvas') return makeCanvas();
    const el = { tag, src: undefined, href: undefined, rel: undefined, onload: null, onerror: null };
    return el;
  },
  head: {
    appendChild(el) { appendedElements.push(el); }
  }
};

Object.defineProperty(global, 'navigator', {
  value: { userAgent: 'Mozilla/5.0', deviceMemory: undefined },
  writable: true
});

// ─── Modul-Imports ────────────────────────────────────────────────────────
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectTileMode, loadMaplibreIfNeeded, _resetTileModeForTest } from '../tile-loader.js';

// ─── Hilfsfunktionen ─────────────────────────────────────────────────────

function setNavigator(ua, deviceMemory) {
  global.navigator = { userAgent: ua, deviceMemory };
}

function resetAll() {
  appendedElements = [];
  webglContextFactory = (_type) => null;
  _resetTileModeForTest();
}

// ─── Tests: detectTileMode() ───────────────────────────────────────────────

test('1: non-iOS + deviceMemory 2 → raster', () => {
  setNavigator('Mozilla/5.0 (Linux; Android 10; SM-G960F)', 2);
  assert.equal(detectTileMode(), 'raster');
});

test('2: non-iOS + webgl2 und webgl beide null → raster', () => {
  setNavigator('Mozilla/5.0 (Linux; Android 10; SM-G960F)', undefined);
  webglContextFactory = (_type) => null;
  assert.equal(detectTileMode(), 'raster');
});

test('3: non-iOS + webgl verfügbar → vector', () => {
  setNavigator('Mozilla/5.0 (Linux; Android 10; SM-G960F)', undefined);
  webglContextFactory = (type) => {
    if (type === 'webgl2') return null;
    if (type === 'webgl') return {}; // WebGL 1 vorhanden
    return null;
  };
  assert.equal(detectTileMode(), 'vector');
});

test('4: iPhone OS 14_5 → raster', () => {
  setNavigator('Mozilla/5.0 (iPhone; CPU iPhone OS 14_5 like Mac OS X) AppleWebKit/605.1.15', undefined);
  assert.equal(detectTileMode(), 'raster');
});

test('5: iPhone OS 16_2 + webgl2 null → raster', () => {
  setNavigator('Mozilla/5.0 (iPhone; CPU iPhone OS 16_2 like Mac OS X) AppleWebKit/605.1.15', undefined);
  webglContextFactory = (_type) => null;
  assert.equal(detectTileMode(), 'raster');
});

test('6: iPhone OS 16_2 + webgl2 vorhanden → vector + loseContext aufgerufen', () => {
  setNavigator('Mozilla/5.0 (iPhone; CPU iPhone OS 16_2 like Mac OS X) AppleWebKit/605.1.15', undefined);
  let loseContextCalled = false;
  webglContextFactory = (type) => {
    if (type === 'webgl2') {
      return {
        getExtension(name) {
          if (name === 'WEBGL_lose_context') {
            return {
              loseContext() { loseContextCalled = true; }
            };
          }
          return null;
        }
      };
    }
    return null;
  };
  const result = detectTileMode();
  assert.equal(result, 'vector', 'Ergebnis soll vector sein');
  assert.ok(loseContextCalled, 'loseContext() muss aufgerufen worden sein (Regression-Guard: GPU-Überhitzung)');
});

// ─── Tests: loadMaplibreIfNeeded() ────────────────────────────────────────

test('7: raster mode → keine document.head.appendChild-Aufrufe', async () => {
  resetAll();
  setNavigator('Mozilla/5.0 (Linux; Android 10; SM-G960F)', 2); // deviceMemory 2 → raster
  webglContextFactory = (_type) => null;

  await loadMaplibreIfNeeded();
  assert.equal(appendedElements.length, 0, 'im raster-Modus darf kein Element angehängt werden');
});

test('8: vector mode → lädt JS sequenziell + CSS, Promise wartet auf alle onload', async () => {
  resetAll();
  setNavigator('Mozilla/5.0 (Linux; Android 10; SM-G960F)', undefined);
  webglContextFactory = (type) => {
    if (type === 'webgl2') return {}; // WebGL2 vorhanden → vector
    return null;
  };

  const loadPromise = loadMaplibreIfNeeded();

  // CSS-Link und erstes JS-Script müssen sofort angehängt sein (parallel gestartet)
  assert.ok(appendedElements.length >= 2, 'CSS und erstes JS müssen sofort angehängt sein');

  const jsEl1 = appendedElements.find(el => el.src === '/libs/maplibre-gl/maplibre-gl.js');
  const cssEl = appendedElements.find(el => el.href === '/libs/maplibre-gl/maplibre-gl.css');
  assert.ok(jsEl1, 'maplibre-gl.js muss angehängt sein');
  assert.ok(cssEl, 'maplibre-gl.css muss angehängt sein');
  assert.equal(cssEl.rel, 'stylesheet', 'CSS-Link muss rel=stylesheet haben');

  // zweites JS-Script noch NICHT angehängt (sequenziell nach erstem onload)
  const hasSecondJS = appendedElements.some(el => el.src === '/libs/maplibre-leaflet/leaflet-maplibre-gl.js');
  assert.equal(hasSecondJS, false, 'leaflet-maplibre-gl.js darf noch nicht angehängt sein');

  // Erstes JS loaded → zweites JS wird in nächstem Microtask angehängt
  jsEl1.onload();
  await Promise.resolve();

  const jsEl2 = appendedElements.find(el => el.src === '/libs/maplibre-leaflet/leaflet-maplibre-gl.js');
  assert.ok(jsEl2, 'leaflet-maplibre-gl.js muss nach erstem onload angehängt sein');

  // Gesamt-Promise noch nicht resolved
  let resolved = false;
  loadPromise.then(() => { resolved = true; });
  await Promise.resolve();
  assert.equal(resolved, false, 'Promise darf nicht resolved sein, bevor alle onloads gefeuert haben');

  // Restliche onloads abfeuern
  jsEl2.onload();
  if (cssEl.onload) cssEl.onload();

  await loadPromise;
  assert.equal(resolved, true, 'Promise muss nach allen onloads resolved sein');
});
