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

test('sw.js: Daten-URLs laufen über networkFirstFresh; .htaccess: Daten-Splits no-cache', () => {
  const sw = readFileSync(new URL('../sw.js', import.meta.url), 'utf8');
  assert.match(sw, /DATA_URLS\.some[\s\S]{0,200}networkFirstFresh\(request, CACHE_DATA\)/);
  const ht = readFileSync(new URL('../.htaccess', import.meta.url), 'utf8');
  assert.match(ht, /spaces-\[a-z\]\+\|splits-manifest\)\\\.json\$"\>\s*\n\s*Header set Cache-Control "no-cache, must-revalidate"/);
});
