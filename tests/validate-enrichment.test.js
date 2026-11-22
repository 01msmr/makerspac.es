// tests/validate-enrichment.test.js — Schema-Prüfung von loc-enrichment.json (+ echte Daten)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateEnrichment, isHttpUrl } from './validate-enrichment.js';

const IDS = new Set([1, 2, 3]);
const ok = e => validateEnrichment(e, IDS);

test('gültige Einträge → keine Fehler', () => {
  assert.deepEqual(ok({
    1: { workshops: ['3d', 'laser'], events: 'https://x.de/e', spaceapi: { endpoint: 'https://x.de/s' }, weekly: { weekday: 2, time: 2000 } },
    2: { weekly: { weekday: 9, time: 0 } },
  }), []);
});

test('Workshop-Tippfehler, Leerzeichen, Duplikate, leer', () => {
  assert.match(ok({ 1: { workshops: ['electromnics'] } })[0], /unbekannter Workshop-Typ "electromnics"/);
  assert.match(ok({ 1: { workshops: [' coding'] } })[0], /unbekannter Workshop-Typ " coding"/);
  assert.match(ok({ 1: { workshops: ['3d', '3d'] } })[0], /Duplikate/);
  assert.match(ok({ 1: { workshops: [] } })[0], /nicht-leeres Array/);
});

test('URLs: Leerzeichen, Schema, fehlender Endpoint', () => {
  assert.equal(isHttpUrl('https: //x.de'), false);
  assert.equal(isHttpUrl('ftp://x.de'), false);
  assert.equal(isHttpUrl('https://x.de/a b'), false);
  assert.equal(isHttpUrl('https://x.de/a'), true);
  assert.match(ok({ 1: { events: 'https: //x.de' } })[0], /"events"/);
  assert.match(ok({ 1: { spaceapi: {} } })[0], /spaceapi\.endpoint/);
});

test('weekly: Wochentag und HHMM', () => {
  assert.match(ok({ 1: { weekly: { weekday: 8, time: 1900 } } })[0], /weekday/);
  assert.match(ok({ 1: { weekly: { weekday: 2, time: 2460 } } })[0], /time/);
  assert.match(ok({ 1: { weekly: { weekday: 2, time: 1975 } } })[0], /time/);
});

test('unbekannte ID, unbekanntes Feld, falsche Struktur', () => {
  assert.match(ok({ 99: { events: 'https://x.de' } })[0], /nicht in locations\.json/);
  assert.match(ok({ 1: { foo: 1 } })[0], /unbekanntes Feld "foo"/);
  assert.match(ok({ abc: {} })[0], /keine Zahl/);
  assert.deepEqual(validateEnrichment([], IDS), ['Wurzel muss ein Objekt sein']);
});

test('echte loc-enrichment.json ist valide (Regression: Bots dürfen keine kaputten Daten schreiben)', () => {
  const root = new URL('../', import.meta.url);
  const enrichment = JSON.parse(readFileSync(new URL('loc-enrichment.json', root), 'utf8'));
  const ids = new Set(JSON.parse(readFileSync(new URL('locations.json', root), 'utf8')).map(l => l.ID));
  assert.deepEqual(validateEnrichment(enrichment, ids), []);
});

import { validateAfterPatch } from './validate-enrichment.js';

test('validateAfterPatch: prüft eine Kopie (Original bleibt unverändert) und findet ungültige Vorschläge', () => {
  const base = { 1: { workshops: ['3d'] } };
  assert.deepEqual(validateAfterPatch(base, [{ id: 2, field: 'events', value: 'https://x.de/e' }], IDS), []);
  assert.match(validateAfterPatch(base, [{ id: 2, field: 'events', value: 'https: //x.de' }], IDS)[0], /"events"/);
  assert.match(validateAfterPatch(base, [{ id: 99, field: 'workshops', value: ['3d'] }], IDS)[0], /nicht in locations\.json/);
  assert.deepEqual(base, { 1: { workshops: ['3d'] } });
});

import { validateProposal, rejectionComment } from './validate-enrichment.js';

test('validateProposal: nur Fehler der betroffenen ID blockieren (fremde Altfehler nicht)', () => {
  const base = { 1: { workshops: ['quatsch'] }, 2: {} }; // ID 1 ist bereits kaputt
  assert.deepEqual(validateProposal(base, 2, 'events', 'https://x.de/e', IDS), []);
  assert.match(validateProposal(base, 2, 'events', 'https: //x.de', IDS)[0], /^ID 2:/);
  assert.match(rejectionComment(['ID 2: x']), /Label `ok` wurde entfernt/);
});
