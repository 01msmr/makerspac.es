// tests/validate-locations.test.js — locations.json enthält nur Grunddaten; dates vereinheitlicht
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateEntry, validateLocations, isValidDate } from './validate-locations.js';

const entry = (o = {}) => ({
  name: 'X', ID: 1, loc: { lat: 50, long: 8, city: 'Z', country: 'Germany', plz: 12345, street: { name: 'S', number: 1, ext: '' } },
  style: 'for all', link: { url: 'https://x.de', text: 'x.de' }, dates: { 'space.edited.latest': 20251115 }, ...o,
});
const errs = o => validateEntry(entry(o), 0);

test('gültiger Grunddaten-Eintrag (mit/ohne space.init, Platzhalter erlaubt)', () => {
  assert.deepEqual(errs(), []);
  assert.deepEqual(errs({ dates: { 'space.init': 20080523, 'space.edited.latest': 20251115 } }), []);
  assert.deepEqual(errs({ dates: { 'space.init': 20010000, 'space.edited.latest': 20251115 } }), []);   // 20010000 = unbekannt
});

test('isValidDate: echte Kalenderdaten, 8 Ziffern', () => {
  assert.equal(isValidDate(20240229), true);
  assert.equal(isValidDate(20230229), false);   // kein Schaltjahr
  assert.equal(isValidDate(201606025), false);  // 9 Ziffern (Altfehler ID 126)
  assert.equal(isValidDate('20251115'), false); // muss eine Zahl sein
});

test('Zusatzdaten in locations.json sind ein Fehler (gehören ins Enrichment)', () => {
  for (const f of ['workshops', 'events', 'spaceapi', 'weekly']) {
    assert.match(errs({ [f]: f === 'events' ? 'https://x.de' : {} })[0], new RegExp(`"${f}" gehört in loc-enrichment.json`));
  }
  assert.match(errs({ foo: 1 })[0], /unbekanntes Feld "foo"/);
});

test('dates: space.edited.latest ist Pflicht; veraltete/unbekannte Schlüssel werden beanstandet', () => {
  assert.match(errs({ dates: {} })[0], /space\.edited\.latest/);
  assert.match(errs({ dates: undefined })[0], /"dates" fehlt/);
  assert.match(errs({ dates: { 'space.edited.latest': 20251115, 'datacheck.latest': 20250101 } })[0], /"dates.datacheck.latest" ist veraltet — verwende "dates.space.edited.latest"/);
  assert.match(errs({ dates: { 'space.edited.latest': 20251115, init: 20080523 } })[0], /"dates.init" ist veraltet — verwende "dates.space.init"/);
  assert.match(errs({ dates: { 'space.edited.latest': 20251115, bar: 1 } })[0], /unbekannter Schlüssel "dates.bar"/);
  assert.match(errs({ dates: { 'space.edited.latest': 20251115, 'space.init': 201606025 } })[0], /dates\.space\.init/);
});

test('doppelte IDs werden gefunden; Nicht-Array ist ungültig', () => {
  assert.match(validateLocations([entry(), entry()])[0], /Doppelte ID 1/);
  assert.deepEqual(validateLocations('x'), ['locations.json ist kein Array']);
});

test('echte locations.json ist vollständig valide', () => {
  const locations = JSON.parse(readFileSync(new URL('../locations.json', import.meta.url), 'utf8'));
  const errors = validateLocations(locations);
  assert.deepEqual(errors, []);
});
