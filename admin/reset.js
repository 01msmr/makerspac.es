// admin/reset.js — „App zurücksetzen“: Service Worker abmelden, Caches und Daten-Zwischenspeicher leeren, zurück zur Seite.
// Liegt unter /admin/ — dort greift kein Service Worker (auch keine alte Version): die Seite kommt immer frisch vom Server.
// Bleibt erhalten: Admin-Token, Lesezeichen, Einstellungen (alles in localStorage außer den Daten-Zwischenspeichern).

/** localStorage-Schlüssel, die nur Daten-Zwischenspeicher sind (werden von map.js neu angelegt) */
export const isDataCacheKey = key => key === 'ms-markers-cache' || key.startsWith('ms-split-');

/** Rücksprung-Ziel: nur Pfade dieser Seite (kein //host, kein Schema) — sonst „/“ */
export function safeNext(raw) {
  if (typeof raw !== 'string' || !raw.startsWith('/') || raw.startsWith('//') || raw.includes('\\')) return '/';
  try {
    const u = new URL(raw, 'https://x.invalid');
    return u.origin === 'https://x.invalid' ? u.pathname + u.search + u.hash : '/';
  } catch { return '/'; }
}

/**
 * @param {{ serviceWorker?: { getRegistrations: () => Promise<{unregister: () => Promise<boolean>}[]> }, cacheStorage?: { keys: () => Promise<string[]>, delete: (k: string) => Promise<boolean> }, storage?: Storage }} env
 * @returns {Promise<{ unregistered: number, cachesDeleted: number, keysRemoved: string[] }>}
 */
export async function resetApp({ serviceWorker, cacheStorage, storage } = {}) {
  const result = { unregistered: 0, cachesDeleted: 0, keysRemoved: [] };
  if (serviceWorker) {
    for (const reg of await serviceWorker.getRegistrations()) if (await reg.unregister()) result.unregistered++;
  }
  if (cacheStorage) {
    for (const key of await cacheStorage.keys()) if (await cacheStorage.delete(key)) result.cachesDeleted++;
  }
  if (storage) {
    const keys = [];
    for (let i = 0; i < storage.length; i++) keys.push(storage.key(i));
    for (const key of keys) if (isDataCacheKey(key)) { storage.removeItem(key); result.keysRemoved.push(key); }
  }
  return result;
}
