import { test } from 'node:test';
import assert from 'node:assert/strict';
import { UPDATE_TEXT, updateText, formatAge, toastSubtitle } from '../update-notice.js';

test('alle Sprachen haben dieselben Schlüssel wie Englisch, Fallback en', () => {
  for (const [lang, tx] of Object.entries(UPDATE_TEXT)) {
    assert.deepEqual(Object.keys(tx).sort(), Object.keys(UPDATE_TEXT.en).sort(), lang);
    assert.ok(Object.values(tx).every(v => v.length > 0), lang);
  }
  assert.equal(updateText('xx'), UPDATE_TEXT.en);
});

test('formatAge: unter einer Minute leer, sonst Minuten/Stunden/Tage in der Sprache', () => {
  assert.equal(formatAge(30_000, 'de'), '');
  assert.match(formatAge(5 * 60_000, 'de'), /5/);
  assert.match(formatAge(3 * 3600_000, 'de'), /3/);
  assert.match(formatAge(2 * 86400_000, 'en'), /2/);
  assert.notEqual(formatAge(3 * 3600_000, 'de'), formatAge(3 * 3600_000, 'en'));
});

test('toastSubtitle: Hinweis, mit Tab-Alter wenn ≥ 1 Minute', () => {
  assert.equal(toastSubtitle(10_000, 'de'), 'neue Version verfügbar');
  assert.match(toastSubtitle(2 * 3600_000, 'de'), /^neue Version verfügbar · geöffnet .*2/);
});
