// tests/push-subscribe-php.test.js — push/subscribe.php gegen den eingebauten PHP-Server (übersprungen, wenn php fehlt)
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, copyFileSync, readdirSync, readFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

const hasPhp = spawnSync('php', ['-v']).status === 0;
const SRC = new URL('../push/', import.meta.url).pathname;
const PORT = 18000 + Math.floor(Math.random() * 1000);
const base = `http://127.0.0.1:${PORT}/subscribe.php`;
let dir, server;

const EP = 'https://fcm.googleapis.com/fcm/send/abc123';
const KEYS = { p256dh: 'B'.repeat(87), auth: 'a'.repeat(22) };
const post = (body, headers = {}) => fetch(base, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: typeof body === 'string' ? body : JSON.stringify(body) });
const idOf = ep => createHash('sha256').update(ep).digest('hex');
const files = () => readdirSync(join(dir, 'data')).filter(f => f.endsWith('.json'));

before(async () => {
  if (!hasPhp) return;
  dir = mkdtempSync(join(tmpdir(), 'pushphp-'));
  copyFileSync(join(SRC, 'subscribe.php'), join(dir, 'subscribe.php'));
  mkdirSync(join(dir, 'data'));
  server = spawn('php', ['-S', `127.0.0.1:${PORT}`, '-t', dir], { stdio: 'ignore' });
  for (let i = 0; i < 50; i++) { try { await fetch(base); break; } catch { await new Promise(r => setTimeout(r, 100)); } }
});
after(() => { server?.kill(); if (dir) rmSync(dir, { recursive: true, force: true }); });

test('PHP: nur POST, fremde Origin und Nicht-Push-Endpoints werden abgelehnt', { skip: !hasPhp }, async () => {
  assert.equal((await fetch(base)).status, 405);
  assert.equal((await post({ endpoint: EP, keys: KEYS }, { Origin: 'https://evil.example' })).status, 403);
  assert.equal((await post('kein json')).status, 400);
  for (const bad of ['http://fcm.googleapis.com/x', 'https://evil.example/x', 'https://fcm.googleapis.com.evil.example/x', 'ftp://x', '']) {
    assert.equal((await post({ endpoint: bad, keys: KEYS })).status, 400, bad);
  }
  assert.equal((await post({ endpoint: EP, keys: { p256dh: 'zu kurz!', auth: 'x' } })).status, 400);
  assert.equal(files().length, 0);
});

test('PHP: anlegen → aktualisieren (created bleibt, Favoriten gefiltert/dedupliziert, Sprache geprüft) → abmelden', { skip: !hasPhp }, async () => {
  const r = await post({ endpoint: EP, keys: KEYS, favorites: [5, 5, 7, -1, 'x', 0, 1.5, 3], lang: 'de' }, { Origin: 'https://makerspac.es' });
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), { ok: true, subscribed: true, favorites: 3 });
  const file = join(dir, 'data', `${idOf(EP)}.json`);
  const first = JSON.parse(readFileSync(file, 'utf8'));
  assert.deepEqual(first.favorites, [5, 7, 3]);
  assert.equal(first.lang, 'de');
  assert.deepEqual(Object.keys(first).sort(), ['created', 'endpoint', 'favorites', 'keys', 'lang', 'updated']);
  await new Promise(r => setTimeout(r, 1100));
  assert.equal((await post({ endpoint: EP, keys: KEYS, favorites: [9], lang: 'xx' })).status, 200);
  const second = JSON.parse(readFileSync(file, 'utf8'));
  assert.deepEqual(second.favorites, [9]);
  assert.equal(second.lang, 'en', 'unbekannte Sprache → en');
  assert.equal(second.created, first.created);
  assert.notEqual(second.updated, first.updated);
  assert.deepEqual(files(), [`${idOf(EP)}.json`]);
  assert.equal((await post({ endpoint: EP, unsubscribe: true })).status, 200);
  assert.deepEqual(files(), []);
});

test('PHP: Merkliste (.sent.json) wird beim Abmelden mitgelöscht, beim Aktualisieren nie angefasst', { skip: !hasPhp }, async () => {
  await post({ endpoint: EP, keys: KEYS, favorites: [1], lang: 'de' });
  const sent = join(dir, 'data', `${idOf(EP)}.sent.json`);
  (await import('node:fs')).writeFileSync(sent, '{"1":"2026-07-01"}');
  await post({ endpoint: EP, keys: KEYS, favorites: [2], lang: 'de' });
  assert.equal(readFileSync(sent, 'utf8'), '{"1":"2026-07-01"}');
  await post({ endpoint: EP, unsubscribe: true });
  assert.deepEqual(files(), []);
});

test('Repo: Abo-Ordner per .htaccess gesperrt, Abo-Dateien nicht im Git (.gitignore)', () => {
  const ht = readFileSync(join(SRC, 'data/.htaccess'), 'utf8');
  assert.match(ht, /Require all denied/);
  assert.match(ht, /Deny from all/);
  assert.match(readFileSync(new URL('../.gitignore', import.meta.url), 'utf8'), /push\/data\/\*\.json/);
});

test('PHP: Laufzeitfehler (z. B. Ziel nicht schreibbar) → JSON {error:"internal", detail} ohne Pfade, nie eine leere 500-Seite', { skip: !hasPhp }, async () => {
  const ep = 'https://fcm.googleapis.com/fcm/send/kaputt';
  mkdirSync(join(dir, 'data', `${idOf(ep)}.json`));   // Ziel ist ein Ordner → rename() schlägt fehl
  const r = await post({ endpoint: ep, keys: KEYS, favorites: [1], lang: 'de' });
  assert.equal(r.status, 500);
  const j = await r.json();
  assert.equal(j.error, 'internal');
  assert.match(j.detail, /ErrorException/);
  assert.ok(!j.detail.includes(dir), 'keine Server-Pfade in der Antwort');
  rmSync(join(dir, 'data', `${idOf(ep)}.json`), { recursive: true });
  for (const f of readdirSync(join(dir, 'data'))) if (f.includes('.tmp')) rmSync(join(dir, 'data', f));
});
