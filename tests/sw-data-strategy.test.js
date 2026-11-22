import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

// Daten-JSON: Netz zuerst (frisch nach Deploy), Cache nur als Rückfall — sw.js ist kein Modul → vm-Kontext mit Stubs
function load({ fetchImpl, cached }) {
  const put = [], calls = [];
  const ctx = {
    self: { addEventListener() {}, location: { origin: 'https://x' } },
    caches: { open: async () => ({ match: async () => cached, put: (...a) => put.push(a) }) },
    fetch: (...a) => { calls.push(a); return fetchImpl(...a); }, URL, Promise, setTimeout,
  };
  vm.createContext(ctx);
  vm.runInContext(readFileSync(new URL('../sw.js', import.meta.url), 'utf8') + '\nthis.nf = networkFirstFresh;', ctx);
  return { nf: ctx.nf, put, calls };
}
const ok = body => ({ ok: true, body, clone() { return this; } });
const later = (ms, v) => () => new Promise(r => setTimeout(() => r(v), ms));

test('Cache vorhanden + Netz schnell → FRISCHE Antwort (nicht die Kopie), Cache wird aktualisiert, HTTP-Cache umgangen', async () => {
  const { nf, put, calls } = load({ fetchImpl: later(10, ok('neu')), cached: 'alt' });
  assert.equal((await nf('r', 'c')).body, 'neu');
  assert.equal(put.length, 1);
  assert.equal(calls[0][1].cache, 'no-cache');
});

test('Netz fehlt (offline) → Kopie aus dem Cache', async () => {
  const { nf } = load({ fetchImpl: () => Promise.reject(new Error('offline')), cached: 'alt' });
  assert.equal(await nf('r', 'c'), 'alt');
});

test('Netz zu langsam → Kopie nach Timeout, frische Antwort aktualisiert den Cache trotzdem', async () => {
  const { nf, put } = load({ fetchImpl: later(120, ok('neu')), cached: 'alt' });
  assert.equal(await nf('r', 'c', 30), 'alt');
  await new Promise(r => setTimeout(r, 160));
  assert.equal(put.length, 1);
});

test('Erster Besuch (kein Cache) → wartet auf das Netz', async () => {
  const { nf } = load({ fetchImpl: later(20, ok('neu')), cached: undefined });
  assert.equal((await nf('r', 'c')).body, 'neu');
});

test('sw.js: Daten-URLs laufen über networkFirstFresh; .htaccess: Daten-Splits no-cache + X-Accel-Expires (nginx-Stale-Eintrag ersetzen)', () => {
  const sw = readFileSync(new URL('../sw.js', import.meta.url), 'utf8');
  assert.match(sw, /DATA_URLS\.some[\s\S]{0,200}networkFirstFresh\(request, CACHE_DATA\)/);
  const ht = readFileSync(new URL('../.htaccess', import.meta.url), 'utf8');
  assert.match(ht, /spaces-\[a-z\]\+\|splits-manifest\)\\\.json\$"\>\s*\n\s*Header set Cache-Control "no-cache, must-revalidate"/);
  assert.match(ht, /Header set X-Accel-Expires "1"/);
});

// Navigation (Accept: text/html) auf eine Daten-URL = Aufruf im Browser-Tab → muss frisch kommen, nicht als „HTML“ per SWR
test('Fetch-Handler: Daten-URL als Navigation (Accept text/html) → networkFirstFresh, nicht HTML-SWR', async () => {
  let handler;
  const cacheStore = { match: async () => 'ALT', put() {} };
  const ctx = {
    self: { addEventListener: (type, fn) => { if (type === 'fetch') handler = fn; }, location: { origin: 'https://x' } },
    caches: { open: async () => cacheStore, match: async () => 'ALT' },
    fetch: async () => ({ ok: true, body: 'NEU', clone() { return this; } }), URL, Promise, setTimeout,
  };
  vm.createContext(ctx);
  vm.runInContext(readFileSync(new URL('../sw.js', import.meta.url), 'utf8'), ctx);
  const respond = async url => {
    let result;
    handler({ request: { url, headers: { get: () => 'text/html,application/xhtml+xml,*/*' } }, respondWith: p => { result = p; } });
    return result;
  };
  for (const path of ['/data/spaces-all.json', '/data/markers.json', '/data/splits-manifest.json', '/locations.json']) {
    assert.equal((await respond('https://x' + path)).body, 'NEU', path);
  }
  assert.equal(await respond('https://x/'), 'ALT', 'echte HTML-Seiten bleiben SWR (Cache zuerst)');
});
