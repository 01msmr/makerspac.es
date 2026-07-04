// tests/date-utils.test.js
// Testet date-utils.js — WEEKDAY_NAMES, todayWeekday, isWeeklyToday
// Läuft mit: node --test tests/date-utils.test.js

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { WEEKDAY_NAMES, todayWeekday, isWeeklyToday } from '../date-utils.js';

// ─── Tests ────────────────────────────────────────────────────────────────

test('WEEKDAY_NAMES: Sunday an Index 0, Länge 7', () => {
  assert.equal(WEEKDAY_NAMES.length, 7);
  assert.equal(WEEKDAY_NAMES[0], 'Sunday');
  assert.equal(WEEKDAY_NAMES[6], 'Saturday');
});

test('todayWeekday: liefert getDay() des übergebenen Datums', () => {
  // 2026-07-01 ist ein Mittwoch (getDay() === 3) in Europe/Berlin
  const wednesday = new Date('2026-07-01T12:00:00Z');
  assert.equal(todayWeekday(wednesday), 3);
});

test('isWeeklyToday: true wenn weekly.weekday === heutiger Tag', () => {
  // 2026-07-01 ist ein Mittwoch = 3
  const loc = { weekly: { weekday: 3, time: 1900 } };
  assert.equal(isWeeklyToday(loc, new Date('2026-07-01T12:00:00Z')), true);
});

test('isWeeklyToday: false bei weekday 9 (kein Wert)', () => {
  // weekday 9 ist der Platzhalter-Wert (> 6) → kein gültiger Tag
  const loc = { weekly: { weekday: 9, time: 1900 } };
  assert.equal(isWeeklyToday(loc, new Date('2026-07-01T12:00:00Z')), false);
});

test('isWeeklyToday: false ohne time', () => {
  const loc = { weekly: { weekday: 3 } };
  assert.equal(isWeeklyToday(loc, new Date('2026-07-01T12:00:00Z')), false);
});

test('isWeeklyToday: false ohne weekly', () => {
  const loc = {};
  assert.equal(isWeeklyToday(loc, new Date('2026-07-01T12:00:00Z')), false);
});

test('Grenzen: weekday 0 (Sonntag-Datum) → true', () => {
  // 2026-07-05 ist ein Sonntag (getDay() === 0)
  const loc = { weekly: { weekday: 0, time: 1000 } };
  assert.equal(isWeeklyToday(loc, new Date('2026-07-05T12:00:00Z')), true);
});

test('Grenzen: weekday 6 (Samstag-Datum) → true', () => {
  // 2026-07-04 ist ein Samstag (getDay() === 6)
  const loc = { weekly: { weekday: 6, time: 1000 } };
  assert.equal(isWeeklyToday(loc, new Date('2026-07-04T12:00:00Z')), true);
});
