// tests/auto-apply-check.test.js — Entscheidungslogik des Auto-Apply-Crons
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decide } from '../tools/auto-apply-check.js';

const NOW = Date.parse('2026-11-21T12:00:00Z');
const iss = (n, minutesAgo, ok = true, title = 'SpaceAPI: X') => ({
  number: n, title, updatedAt: new Date(NOW - minutesAgo * 60000).toISOString(), labels: ok ? [{ name: 'ok' }] : [],
});

test('keine ok-Issues → null', () => {
  assert.equal(decide([iss(1, 500, false)], NOW).delay, null);
});

test('weniger als 10 und jünger als 1 h → wartet', () => {
  const r = decide([iss(1, 90), iss(2, 20)], NOW);
  assert.equal(r.count, 2);
  assert.equal(r.delay, 40 * 60000);
});

test('älter als 1 h seit letzter Änderung → sofort', () => {
  assert.equal(decide([iss(1, 200), iss(2, 61)], NOW).delay, 0);
});

test('10 ok-Issues → sofort, auch wenn frisch', () => {
  assert.equal(decide(Array.from({ length: 10 }, (_, i) => iss(i, 1)), NOW).delay, 0);
});

test('fremde Titel zählen nicht', () => {
  assert.equal(decide([iss(1, 500, true, 'Kalenderlink: X')], NOW).delay, null);
});
