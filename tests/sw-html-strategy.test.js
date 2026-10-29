import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

// sw.js ist kein Modul → in einem vm-Kontext mit Stubs laden
function load({ fetchImpl, cached }) {
  const put = [];
  const ctx = {
    self: { addEventListener() {}, location: { origin: 'https://x' } },
    caches: { open: async () => ({ match: async () => cached, put: (...a) => put.push(a) }) },
    fetch: fetchImpl, URL, Promise,
  };
  vm.createContext(ctx);
  vm.runInContext(readFileSync(new URL('../sw.js', import.meta.url), 'utf8') + '\nthis.swr = staleWhileRevalidate;', ctx);
  return { swr: ctx.swr, put };
}
const ok = body => ({ ok: true, body, clone() { return this; } });
const slow = (ms, v) => () => new Promise(r => setTimeout(() => r(v), ms));

test('cached + slow network → cached immediately, cache refreshed afterwards', async () => {
  const { swr, put } = load({ fetchImpl: slow(50, ok('net')), cached: 'cache' });
  assert.equal(await swr('r', 'c'), 'cache');
  await new Promise(r => setTimeout(r, 80));
  assert.equal(put.length, 1);
});

test('no cache (first open) → waits for network', async () => {
  const { swr } = load({ fetchImpl: slow(30, ok('net')), cached: undefined });
  assert.equal((await swr('r', 'c')).body, 'net');
});

test('HTML requests use staleWhileRevalidate', () => {
  const src = readFileSync(new URL('../sw.js', import.meta.url), 'utf8');
  assert.match(src, /text\/html'\)\) \{\s*\n[^\n]*\n?\s*event\.respondWith\(staleWhileRevalidate\(request, CACHE_STATIC\)\)/);
});
