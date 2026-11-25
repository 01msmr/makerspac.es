// tests/edit-via-pat.test.js — Bearbeiten-Overlay: Direkt-Submit mit Admin-Token, ?edit=ID, Link aus dem Admin
// Läuft mit: node --test tests/edit-via-pat.test.js
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const noop = () => {};
global.location = { hash: '', hostname: 'localhost', search: '', href: 'https://makerspac.es/?edit=7#x', pathname: '/' };
global.window = {
  innerWidth: 1024, location: global.location, i18n: { t: k => k, currentLang: 'de' },
  matchMedia: () => ({ matches: false, addEventListener: noop, removeEventListener: noop }),
  addEventListener: noop, removeEventListener: noop,
};
global.document = {
  documentElement: { style: { setProperty: noop }, classList: { contains: () => false } },
  getElementById: () => null, querySelector: () => null, querySelectorAll: () => [],
  addEventListener: noop, removeEventListener: noop, dispatchEvent: noop,
  body: { appendChild: noop, classList: { contains: () => false } },
};
const store = new Map();
global.localStorage = { getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, v), removeItem: k => store.delete(k) };
Object.defineProperty(global, 'navigator', { value: { languages: ['de-DE'], language: 'de-DE' }, writable: true });

let form;
before(async () => { form = await import('../add-space-form.js'); });
const read = f => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');

test('1: adminToken liest nur den Schlüssel admin-pat (leer ohne Token / bei gesperrtem Speicher)', () => {
  assert.equal(form.adminToken(), '');
  store.set('admin-pat', 'github_pat_X');
  assert.equal(form.adminToken(), 'github_pat_X');
  const real = global.localStorage;
  global.localStorage = { getItem() { throw new Error('denied'); } };
  assert.equal(form.adminToken(), '');
  global.localStorage = real;
});

test('2: createIssueWithToken — POST an api.github.com, nur Titel + Body, Token nur im Header', async () => {
  let seen;
  const fetchImpl = async (url, opts) => { seen = { url, opts }; return { ok: true, json: async () => ({ number: 42, html_url: 'https://github.com/01msmr/makerspac.es/issues/42' }) }; };
  const issue = await form.createIssueWithToken('tok', 'update makerspace: A (ID 7)', 'body', fetchImpl);
  assert.equal(issue.number, 42);
  assert.equal(seen.url, 'https://api.github.com/repos/01msmr/makerspac.es/issues');
  assert.equal(seen.opts.method, 'POST');
  assert.equal(seen.opts.headers.Authorization, 'Bearer tok');
  assert.deepEqual(JSON.parse(seen.opts.body), { title: 'update makerspace: A (ID 7)', body: 'body' });
  assert.ok(!seen.opts.body.includes('tok'));
});

test('3: createIssueWithToken — Fehlerstatus und unerwartete Antwort werfen (→ Fallback auf GitHub-Tab)', async () => {
  await assert.rejects(form.createIssueWithToken('t', 'x', 'y', async () => ({ ok: false, status: 401 })), /GitHub 401/);
  await assert.rejects(form.createIssueWithToken('t', 'x', 'y', async () => ({ ok: true, json: async () => ({ number: 1, html_url: 'https://evil.example/x' }) })), /unerwartete Antwort/);
});

test('4: Verdrahtung — Fallback bleibt, ?edit=ID öffnet das Overlay', () => {
  assert.match(read('add-space-form.js'), /const token = adminToken\(\);\s*if \(token\)[\s\S]*?const url_gh = /);   // Token-Pfad vor dem GitHub-Tab-Fallback
  assert.match(read('map.js'), /waitFor\('app'\)\.then\(openEditFromUrl\)/);
  assert.match(read('overlay-loader.js'), /openOverlayTab\('addspace', \{ editId: id \}\)/);
  assert.match(read('overlay-loader.js'), /locationById\?\.get\(id\)\?\.link/);   // wartet auf die nachgeladenen Details
  assert.ok(!read('admin/index.html').includes('sp-edit'), 'Link „Eintrag bearbeiten“ steht nicht mehr im Admin (Stift im Popup genügt)');
});
