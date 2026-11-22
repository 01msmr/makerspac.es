// tests/enrichment-merge.test.js — SSOT der Verschmelzung locations.json + loc-enrichment.json
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { applyEnrichment } from '../enrichment-merge.js';

test('Enrichment füllt nur Lücken, locations.json gewinnt', () => {
  const loc = { ID: 1, workshops: ['wood'], events: undefined };
  const e = { workshops: ['3d'], events: 'https://x.de/e', spaceapi: { endpoint: 'https://x.de/s' }, weekly: { weekday: 2, time: 1900 } };
  const out = applyEnrichment(loc, e);
  assert.deepEqual(out.workshops, ['wood']);               // locations.json gewinnt
  assert.equal(out.events, 'https://x.de/e');              // Lücke gefüllt
  assert.equal(out.spaceapi.endpoint, 'https://x.de/s');
  assert.deepEqual(out.weekly, { weekday: 2, time: 1900 });
  assert.deepEqual(loc.workshops, ['wood']);               // Original unverändert
});

test('ohne Enrichment-Eintrag oder mit leeren Workshops bleibt alles beim Alten', () => {
  const loc = { ID: 2 };
  assert.equal(applyEnrichment(loc, undefined), loc);
  assert.equal(applyEnrichment(loc, { workshops: [] }).workshops, undefined);
});

test('Karte (generate-map-splits.js) nutzt dieselbe Funktion — kein zweiter Merge-Code', () => {
  const src = readFileSync(new URL('../generate-map-splits.js', import.meta.url), 'utf8');
  assert.match(src, /from '\.\/enrichment-merge\.js'/);
  assert.doesNotMatch(src, /function applyEnrichment/);
});
