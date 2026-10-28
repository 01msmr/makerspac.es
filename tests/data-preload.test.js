// tests/data-preload.test.js
// Tests für data-preload.js: Länder-Erkennung aus dem URL-Hash + frühes Preload der Startdaten
// Läuft mit: node --test tests/data-preload.test.js

let appended = [];
global.document = {
  head: { appendChild(el) { appended.push(el); } },
  createElement() { return {}; },
  querySelector(sel) {
    const m = sel.match(/href="([^"]+)"/);
    return m ? (appended.find(el => el.rel === 'preload' && el.href === m[1]) ?? null) : null;
  },
};

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectCountryCodeFromURL, preloadInitialData } from '../data-preload.js';

test('1: Hash mit Länder-Slug → ISO-Code', () => {
  assert.equal(detectCountryCodeFromURL('#/germany'), 'de');
  assert.equal(detectCountryCodeFromURL('#/germany/berlin/1,2'), 'de');
  assert.equal(detectCountryCodeFromURL('#/austria+switzerland'), 'at');
});

test('2: kein Hash / unbekannter Slug / for-all → null', () => {
  assert.equal(detectCountryCodeFromURL(''), null);
  assert.equal(detectCountryCodeFromURL('#/for-all'), null);
  assert.equal(detectCountryCodeFromURL('#about'), null);
});

test('3: ohne Land → markers.json + lang.json werden vorgeladen', () => {
  appended = [];
  preloadInitialData('');
  const hrefs = appended.map(el => el.href).sort();
  assert.deepEqual(hrefs, ['data/markers.json', 'lang.json']);
  assert.ok(appended.every(el => el.rel === 'preload' && el.as === 'fetch' && el.crossOrigin === 'anonymous'));
});

test('4: mit Land → spaces-{cc}.json statt markers.json', () => {
  appended = [];
  preloadInitialData('#/germany');
  assert.deepEqual(appended.map(el => el.href).sort(), ['data/spaces-de.json', 'lang.json']);
});

test('5: bereits vorhandene Preload-Links werden nicht dupliziert', () => {
  appended = [];
  preloadInitialData('');
  preloadInitialData('');
  assert.equal(appended.length, 2);
});
