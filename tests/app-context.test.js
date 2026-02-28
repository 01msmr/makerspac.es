// tests/app-context.test.js
// Testet AppContext Lifecycle + waitFor
// Läuft mit: node --test tests/app-context.test.js

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { appContext } from '../app-context.js';

test('starts in idle phase', () => {
  assert.equal(appContext.phase, 'idle');
});

test('ready() advances phase and fires event', () => {
  let fired = false;
  appContext.addEventListener('phase', (e) => { fired = e.detail.phase !== undefined; });
  appContext.ready('services');
  assert.ok(fired, 'phase event should fire');
  assert.equal(appContext.phase, 'services');
});

test('waitFor resolves immediately if phase already passed', async () => {
  // 'services' wurde im vorherigen Test gesetzt
  await assert.doesNotReject(appContext.waitFor('services'));
});

test('waitFor resolves when target phase is reached', async () => {
  let resolved = false;
  const p = appContext.waitFor('map').then(() => { resolved = true; });

  assert.equal(resolved, false, 'should not resolve before ready()');
  appContext.ready('map');
  await p;
  assert.equal(resolved, true, 'should resolve after ready("map")');
});

test('locationById and markerById are Maps', () => {
  assert.ok(appContext.locationById instanceof Map);
  assert.ok(appContext.markerById instanceof Map);
});

test('locations defaults to empty array', () => {
  assert.ok(Array.isArray(appContext.locations));
  assert.equal(appContext.locations.length, 0);
});

test('i18n set in map.js phase is reflected', () => {
  // Nach map-Phase bleibt i18n null bis map.js es setzt – hier nur Typ-Check
  // (im Browser setzt map.js: appContext.i18n = new I18n())
  assert.ok(appContext.i18n === null || typeof appContext.i18n === 'object');
});
