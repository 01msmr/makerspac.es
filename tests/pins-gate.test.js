// tests/pins-gate.test.js — MapLibre erst NACH den Pins laden (Bandbreite zuerst für Daten/Marker)
import { test } from 'node:test';
import assert from 'node:assert/strict';

const handlers = {};
const appended = [];
global.window = { matchMedia: () => ({ matches: false }) };
global.document = {
  addEventListener: (type, fn) => { handlers[type] = fn; },
  createElement: tag => (tag === 'canvas' ? { getContext: () => ({}) } : { tag, onload: null, onerror: null }),
  head: { appendChild: el => appended.push(el) },
};
Object.defineProperty(global, 'navigator', { value: { userAgent: 'Mozilla/5.0' }, writable: true });

const { whenPinsShown, loadMaplibreAfterPins } = await import('../tile-loader.js');

test('1: whenPinsShown ist offen, bis das erste filterResultsChanged feuert', async () => {
  let resolved = false;
  whenPinsShown().then(() => { resolved = true; });
  await Promise.resolve();
  assert.equal(resolved, false);
  handlers.filterResultsChanged();
  await whenPinsShown();
  assert.equal(true, true);
});

test('2: loadMaplibreAfterPins lädt nichts, solange die Pins fehlen — und danach das Script', async () => {
  // Gate ist in Test 1 bereits geöffnet → zweites Modul-Exemplar mit geschlossenem Gate
  const fresh = await import('../tile-loader.js?fresh');
  appended.length = 0;
  const p = fresh.loadMaplibreAfterPins();
  await Promise.resolve(); await Promise.resolve();
  assert.equal(appended.length, 0, 'vor den Pins darf kein Element angehängt werden');
  handlers.filterResultsChanged();
  await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
  assert.ok(appended.some(el => el.src === '/libs/maplibre-gl/maplibre-gl.js'), 'nach den Pins wird MapLibre geladen');
  void p;
});

// ─── trimStyle: Natural-Earth-Relief nur bei weitem Herauszoomen laden ──────────────────────────
test('3: trimStyle begrenzt den Natural-Earth-Layer auf MapLibre-Zoom < 4, lässt andere Layer unberührt und mutiert die Eingabe nicht', async () => {
  const { trimStyle } = await import('../tile-loader.js');
  const style = {
    version: 8,
    sources: { ne2_shaded: { type: 'raster', maxzoom: 6 }, openmaptiles: { type: 'vector', url: 'x' } },
    layers: [
      { id: 'background', type: 'background' },
      { id: 'natural_earth', type: 'raster', source: 'ne2_shaded', maxzoom: 7 },
      { id: 'water', type: 'fill', source: 'openmaptiles', 'source-layer': 'water' },
    ],
  };
  const copy = JSON.parse(JSON.stringify(style));
  const out = trimStyle(style);
  assert.equal(out.layers.find(l => l.id === 'natural_earth').maxzoom, 4);
  assert.deepEqual(out.layers.find(l => l.id === 'water'), style.layers[2]);
  assert.deepEqual(style, copy, 'Eingabe darf nicht verändert werden');
});

test('4: trimStyle verkleinert einen schon engeren maxzoom nicht und ignoriert Stile ohne Relief', async () => {
  const { trimStyle } = await import('../tile-loader.js');
  const narrow = { sources: { ne2_shaded: { type: 'raster' } }, layers: [{ id: 'n', type: 'raster', source: 'ne2_shaded', maxzoom: 3 }] };
  assert.equal(trimStyle(narrow).layers[0].maxzoom, 3);
  const plain = { sources: {}, layers: [{ id: 'a', type: 'fill', source: 'x' }] };
  assert.deepEqual(trimStyle(plain), plain);
  assert.deepEqual(trimStyle({}), {});
});

// ─── splitSymbolLayers: Beschriftungen (Glyphen!) erst nach den ersten Kacheln nachladen ─────────────
test('5: splitSymbolLayers trennt Symbol-Layer ab und merkt sich die Einfügeposition (nächster Nicht-Symbol-Layer)', async () => {
  const { splitSymbolLayers } = await import('../tile-loader.js');
  const style = { version: 8, glyphs: 'g', layers: [
    { id: 'bg', type: 'background' },
    { id: 'water', type: 'fill' },
    { id: 'label_water', type: 'symbol' },
    { id: 'road', type: 'line' },
    { id: 'label_road', type: 'symbol' },
    { id: 'label_poi', type: 'symbol' },
    { id: 'boundary', type: 'line' },
    { id: 'label_place', type: 'symbol' },
  ] };
  const copy = JSON.parse(JSON.stringify(style));
  const { base, deferred } = splitSymbolLayers(style);
  assert.deepEqual(base.layers.map(l => l.id), ['bg', 'water', 'road', 'boundary']);
  assert.equal(base.glyphs, 'g', 'glyphs-URL bleibt (wird erst beim Nachladen benutzt)');
  assert.deepEqual(deferred.map(d => [d.layer.id, d.before]), [
    ['label_water', 'road'], ['label_road', 'boundary'], ['label_poi', 'boundary'], ['label_place', undefined],
  ]);
  assert.deepEqual(style, copy, 'Eingabe darf nicht verändert werden');
});

test('6: splitSymbolLayers lässt Stile ohne Symbol-Layer (oder ohne layers) unverändert', async () => {
  const { splitSymbolLayers } = await import('../tile-loader.js');
  const plain = { layers: [{ id: 'a', type: 'fill' }] };
  assert.deepEqual(splitSymbolLayers(plain), { base: plain, deferred: [] });
  assert.deepEqual(splitSymbolLayers({}), { base: {}, deferred: [] });
});
