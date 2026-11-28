// tests/push-client.test.js — Web-Push im Client (push-notify.js, sw.js, Einstellungen, Übersetzungen, Icon-Subset, Versand-Workflow)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { urlBase64ToUint8Array, PUSH_PUBLIC_KEY, PUSH_ENDPOINT } from '../push-notify.js';

const read = f => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');

test('VAPID-Schlüssel: öffentlicher Schlüssel = 65-Byte-Punkt (0x04 …), base64url ohne Auffüllung', () => {
  const k = urlBase64ToUint8Array(PUSH_PUBLIC_KEY);
  assert.equal(k.length, 65);
  assert.equal(k[0], 4);
  assert.match(PUSH_PUBLIC_KEY, /^[A-Za-z0-9_-]+$/);
  assert.equal(PUSH_ENDPOINT, '/push/subscribe.php');
});

test('push-notify.js: keine Abhängigkeit zu App-Modulen (Leaf), im SW-Precache, Settings lädt es lazy per import()', () => {
  assert.ok(!/^\s*import\s/m.test(read('push-notify.js')), 'push-notify.js darf nichts importieren (wird auch vom Versand-Skript geladen)');
  assert.match(read('sw.js'), /'\/push-notify\.js'/);
  assert.match(read('data-store.js'), /import\('\.\/push-notify\.js'\)/);
  assert.ok(!/^\s*import\s[^\n]*push-notify/m.test(read('data-store.js')) && !/^\s*import\s[^\n]*push-notify/m.test(read('map.js')), 'nicht statisch importieren (nicht im Ladepfad der Karte)');
});

test('sw.js: push zeigt die Meldung (tag je Space), notificationclick öffnet nur eigene Adressen und fokussiert vorhandene Tabs', () => {
  const sw = read('sw.js');
  assert.match(sw, /addEventListener\('push'/);
  assert.match(sw, /showNotification\(/);
  assert.match(sw, /tag: d\.tag/);
  assert.match(sw, /addEventListener\('notificationclick'/);
  assert.match(sw, /target\.origin === self\.location\.origin/);
  assert.match(sw, /openWindow\(url\)/);
});

test('Übersetzungen: alle Schlüssel in allen 7 Sprachen', () => {
  const s = JSON.parse(read('lang.json')).settings;
  for (const k of ['notifications', 'notificationsOn', 'notificationsOff', 'notificationsInstall', 'notificationsDenied']) {
    for (const l of ['de', 'en', 'fr', 'it', 'nl', 'da', 'uk']) assert.ok(s[k]?.[l], `settings.${k}.${l}`);
  }
});

test('Icons: Glocke + durchgestrichene Glocke im Font-Awesome-Subset (CSS-Regel vorhanden)', () => {
  const css = read('libs/fontawesome/css/subset.min.css');
  assert.match(css, /\.fa-bell\{--fa:"\\f0f3"\}/);
  assert.match(css, /\.fa-bell-slash\{--fa:"\\f1f6"\}/);
});

test('Einstellungen: Zeile „Meldungen“ liegt vor „Gespeicherte Einstellungen“; updateSettingsLabels kennt beide (Index 5/6)', () => {
  const s = read('data-store.js');
  assert.ok(s.indexOf('this.createNotificationsSection();') < s.indexOf('// 5. SAVED SETTINGS SECTION'));
  assert.match(s, /headers\[5\]\.textContent = this\.t\('notifications'\)/);
  assert.match(s, /headers\[6\]\.textContent = this\.t\('savedSettings'\)/);
});

test('Workflow send-push.yml: nur mit Secret aktiv, alle 15 Min., schreibt nicht ins Repo, keine parallelen Läufe, web-push gepinnt', () => {
  const w = read('.github/workflows/send-push.yml');
  assert.match(w, /cron: '[\d,]+ \* \* \* \*'/);
  assert.match(w, /VAPID_PRIVATE_KEY: \$\{\{ secrets\.VAPID_PRIVATE_KEY \}\}/);
  assert.match(w, /steps\.cfg\.outputs\.on == 'true'/);
  assert.match(w, /contents: read/);
  assert.ok(!/git push|git commit/.test(w), 'schreibt nicht ins Repo');
  assert.match(w, /concurrency:\s*\n\s+group: send-push/);
  assert.match(w, /web-push@\d+\.\d+\.\d+/);
  assert.ok(!/VAPID_PRIVATE_KEY[=:]\s*[A-Za-z0-9_-]{40,}/.test(w), 'privater Schlüssel nie im Klartext');
});

test('privater VAPID-Schlüssel steht nirgends im Repo (nur der öffentliche in push-notify.js)', () => {
  const files = ['push-notify.js', 'sw.js', 'data-store.js', 'tools/send-push.js', 'tools/push-keygen.js', 'push/subscribe.php', '.github/workflows/send-push.yml'];
  for (const f of files) assert.ok(!/\bd["']?\s*[:=]\s*["'][A-Za-z0-9_-]{43}["']/.test(read(f)), f);
});

test('sw.js: nur GET wird abgefangen — ein POST (push/subscribe.php) wird nie in den Cache geschrieben (Regression: Schalter blieb auf „aus“)', async () => {
  const { default: vm } = await import('node:vm');
  const listeners = {}, puts = [];
  const ctx = {
    self: { addEventListener: (t, f) => { listeners[t] = f; }, location: { origin: 'https://x' } },
    caches: { open: async () => ({ put: (...a) => puts.push(a), match: async () => undefined }), match: async () => undefined },
    fetch: async () => ({ ok: true, clone() { return this; } }), URL, Promise, Request: class {},
  };
  vm.createContext(ctx);
  vm.runInContext(read('sw.js'), ctx);
  const run = (method, url, accept = '*/*') => {
    let handled = false;
    listeners.fetch({ request: { method, url, headers: { get: () => accept } }, respondWith: () => { handled = true; } });
    return handled;
  };
  assert.equal(run('POST', 'https://x/push/subscribe.php'), false, 'POST wird nicht abgefangen');
  assert.equal(run('PUT', 'https://x/anything'), false);
  assert.equal(run('GET', 'https://x/main-layout.css'), true, 'GET (statische Assets) bleibt im Cache-Pfad');
  assert.equal(puts.length, 0);
});

test('Einstellungen: Glocken-Tooltips gehen nach links und umbrechen (am rechten Rand nicht abgeschnitten); Fehlergrund wird angezeigt', () => {
  const s = read('data-store.js');
  assert.match(s, /data-push="on"[^`]*data-microtip-position="bottom-left" data-microtip-size="large"/);
  assert.match(s, /data-push="off"[^`]*data-microtip-position="bottom-left" data-microtip-size="large"/);
  assert.match(s, /this\.t\('notificationsError'\)/);
  for (const l of ['de', 'en', 'fr', 'it', 'nl', 'da', 'uk']) assert.ok(JSON.parse(read('lang.json')).settings.notificationsError[l], l);
});
