import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isDataCacheKey, safeNext, resetApp } from '../admin/reset.js';

const fakeStorage = init => {
  const m = new Map(Object.entries(init));
  return { get length() { return m.size; }, key: i => [...m.keys()][i], removeItem: k => m.delete(k), getItem: k => m.get(k) ?? null, _keys: () => [...m.keys()].sort() };
};

test('safeNext: nur Pfade dieser Seite', () => {
  assert.equal(safeNext('/admin/'), '/admin/');
  assert.equal(safeNext('/'), '/');
  assert.equal(safeNext('/#/germany'), '/#/germany');
  for (const bad of ['//evil.com', 'https://evil.com', 'javascript:alert(1)', '\\evil', null, undefined, 'admin/', '/\\evil']) assert.equal(safeNext(bad), '/', String(bad));
});

test('isDataCacheKey: nur Daten-Zwischenspeicher', () => {
  assert.ok(isDataCacheKey('ms-markers-cache') && isDataCacheKey('ms-split-de'));
  for (const k of ['admin-pat', 'makerspace_bookmarks', 'color-scheme', 'preferred_language']) assert.equal(isDataCacheKey(k), false, k);
});

test('resetApp: Service Worker abmelden, Caches löschen, Daten-Zwischenspeicher entfernen — Token/Lesezeichen/Einstellungen bleiben', async () => {
  const regs = [{ unregister: async () => true }, { unregister: async () => true }];
  const deleted = [];
  const storage = fakeStorage({ 'admin-pat': 'github_pat_x', makerspace_bookmarks: '[1,2]', 'color-scheme': 'dark', 'ms-markers-cache': '[...]', 'ms-split-de': '[...]', 'ms-split-at': '[...]' });
  const r = await resetApp({
    serviceWorker: { getRegistrations: async () => regs },
    cacheStorage: { keys: async () => ['ms-static-v1', 'ms-data-v1'], delete: async k => { deleted.push(k); return true; } },
    storage,
  });
  assert.deepEqual([r.unregistered, r.cachesDeleted, r.keysRemoved.sort()], [2, 2, ['ms-markers-cache', 'ms-split-at', 'ms-split-de']]);
  assert.deepEqual(deleted, ['ms-static-v1', 'ms-data-v1']);
  assert.deepEqual(storage._keys(), ['admin-pat', 'color-scheme', 'makerspace_bookmarks']);
});

test('resetApp: fehlende APIs (kein Service Worker / keine Caches) sind kein Fehler', async () => {
  assert.deepEqual(await resetApp({}), { unregistered: 0, cachesDeleted: 0, keysRemoved: [] });
});
