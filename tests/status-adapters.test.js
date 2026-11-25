// tests/status-adapters.test.js — Status-Adapter „html-style“ (Pilot fablab-hamburg.org/sesame)
// Läuft mit: node --test tests/status-adapters.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseCssColor, classifyRedGreen, backgroundOf, parseChangeTime, bodyText, parseHtmlStyleStatus, adapterFor, STATUS_MAX_AGE_HOURS } from '../tools/lib/status-adapters.js';
import { applyProposal } from '../tools/apply-spaceapi-issues.js';
import { validateEnrichment } from './validate-enrichment.js';

// Originalseite https://www.fablab-hamburg.org/sesame (25.11.2026, Status rot)
const PAGE = '<!DOCTYPE html>\n<html>\n\t<head>\n\t\t<meta  http-equiv="content-type" content="text/html; charset=UTF-8"/>\n\t\t\t\t\t<meta http-equiv="refresh" content="1;">\n       \t\t\t <title>\n                Fab Lab Status\n        </title>\n</head>\n<body style="color:white;font-family: Helvetica, Arial, Geneva, sans-serif;background:red">November 25 03:01</body>\n</html>';
const NOW = Date.parse('2026-11-25T06:30:00Z');   // 07:30 Berlin → Änderung 03:01 Berlin = 4,5 h her
const page = (bg, text = 'November 25 03:01') => PAGE.replace('background:red', `background:${bg}`).replace('November 25 03:01', text);

test('1: Originalseite — rot = niemand da, aktuell', () => {
  assert.deepEqual(parseHtmlStyleStatus(PAGE, { now: NOW }), { status: false, ageHours: 4.5 });
  assert.equal(backgroundOf(PAGE), 'red');
  assert.equal(bodyText(PAGE).includes('November 25 03:01'), true);
});

test('2: grün = jemand da; Farbschreibweisen (Name, Hex, rgb)', () => {
  assert.equal(parseHtmlStyleStatus(page('green'), { now: NOW }).status, true);
  assert.equal(parseHtmlStyleStatus(page('#00c000'), { now: NOW }).status, true);
  assert.equal(parseHtmlStyleStatus(page('rgb(0, 160, 0)'), { now: NOW }).status, true);
  assert.equal(parseHtmlStyleStatus(page('#e63323'), { now: NOW }).status, false);
  assert.equal(parseHtmlStyleStatus(page('#f00'), { now: NOW }).status, false);
  assert.equal(parseHtmlStyleStatus(page('red !important'), { now: NOW }).status, false);
});

test('3: andere Farben/Grau/Orange/unbekannt → unbekannt, kein Raten', () => {
  for (const bg of ['orange', 'gray', '#888', 'yellow', 'blue', 'transparent', 'url(x.png)']) {
    const r = parseHtmlStyleStatus(page(bg), { now: NOW });
    assert.equal(r.status, null, bg); assert.ok(r.reason, bg);
  }
  assert.equal(classifyRedGreen([200, 150, 0]), null);
});

test('4: Zeitpunkt zu alt → unbekannt (globale Grenze); nur der aktuelle Stand zählt', () => {
  assert.equal(STATUS_MAX_AGE_HOURS, 48);
  const old = parseHtmlStyleStatus(PAGE, { now: Date.parse('2026-11-30T06:30:00Z') });   // 5 Tage später
  assert.equal(old.status, null); assert.match(old.reason, /zu alt/);
  assert.equal(parseHtmlStyleStatus(PAGE, { now: Date.parse('2026-11-30T06:30:00Z'), maxAgeHours: 240 }).status, false);
  assert.equal(parseHtmlStyleStatus(PAGE, { now: Date.parse('2026-11-27T01:30:00Z') }).status, false);    // 47,5 h < 48 h
});

test('5: Zeitpunkt nicht lesbar → unbekannt (Aktualität nicht prüfbar)', () => {
  const r = parseHtmlStyleStatus(page('red', 'gestern'), { now: NOW });
  assert.equal(r.status, null); assert.match(r.reason, /Zeitpunkt/);
  assert.equal(parseHtmlStyleStatus('<html><body>kaputt</body></html>', { now: NOW }).status, null);
  assert.equal(parseHtmlStyleStatus('', { now: NOW }).status, null);
});

test('6: parseChangeTime — Berlin-Ortszeit (Sommer/Winter), Jahr = aktuelles bzw. Vorjahr, deutsche Schreibweise', () => {
  assert.equal(new Date(parseChangeTime('November 25 03:01', NOW)).toISOString(), '2026-11-25T02:01:00.000Z');            // MEZ = UTC+1
  assert.equal(new Date(parseChangeTime('July 3 22:10', Date.parse('2026-07-03T21:00:00Z'))).toISOString(), '2026-07-03T20:10:00.000Z');   // MESZ = UTC+2
  assert.equal(new Date(parseChangeTime('December 31 23:00', Date.parse('2027-01-01T05:00:00Z'))).toISOString(), '2026-12-31T22:00:00.000Z'); // Jahreswechsel → Vorjahr
  assert.equal(new Date(parseChangeTime('25. November 03:01', NOW)).toISOString(), '2026-11-25T02:01:00.000Z');
  assert.equal(parseChangeTime('Foo 99 99:99', NOW), null);
});

test('7: adapterFor + Daten: Fabulous St. Pauli nutzt den Adapter, Validierung kennt die Felder', () => {
  assert.equal(adapterFor('html-style'), parseHtmlStyleStatus);
  assert.equal(adapterFor('unbekannt'), null);
  const enr = JSON.parse(readFileSync(new URL('../loc-enrichment.json', import.meta.url), 'utf8'));
  assert.deepEqual(enr['43'].spaceapi, { endpoint: 'https://www.fablab-hamburg.org/sesame', adapter: 'html-style' });
  const ids = new Set([43]);
  assert.deepEqual(validateEnrichment({ 43: { spaceapi: { endpoint: 'https://x.example/s', adapter: 'html-style' } } }, ids), []);
  assert.match(validateEnrichment({ 43: { spaceapi: { endpoint: 'https://x.example/s', adapter: 'foo' } } }, ids)[0], /adapter/);
  assert.match(validateEnrichment({ 43: { spaceapi: { endpoint: 'https://x.example/s', kind: 'presence' } } }, ids)[0], /unbekannte Felder/);   // keine eigene Anwesenheits-Semantik: nur offen/geschlossen
  assert.match(validateEnrichment({ 43: { spaceapi: { endpoint: 'https://x.example/s', maxAgeHours: 48 } } }, ids)[0], /unbekannte Felder/);   // Alter-Grenze ist global, nicht je Space
  assert.match(validateEnrichment({ 43: { spaceapi: { endpoint: 'https://x.example/s', foo: 1 } } }, ids)[0], /unbekannte Felder/);
});

test('8: applyProposal — gleicher Endpoint behält den Adapter, neuer Endpoint (echte SpaceAPI) ersetzt ihn', () => {
  const api = { endpoint: 'https://www.fablab-hamburg.org/sesame', adapter: 'html-style' };
  const a = { 43: { spaceapi: { ...api } } }; applyProposal(a, 43, api.endpoint);
  assert.deepEqual(a[43].spaceapi, api);
  const b = { 43: { spaceapi: { ...api } } }; applyProposal(b, 43, 'https://spaceapi.example/s.json');
  assert.deepEqual(b[43].spaceapi, { endpoint: 'https://spaceapi.example/s.json' });
});
