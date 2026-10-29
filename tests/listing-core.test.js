// tests/listing-core.test.js
// updateMeetingTooltipPositions(): alle Layout-Reads vor den Writes (kein Layout-Thrashing), nur geänderte Attribute schreiben
// Läuft mit: node --test tests/listing-core.test.js

global.window = { matchMedia: () => ({ matches: false, addEventListener() {} }), addEventListener() {}, location: { hash: '' } };
global.document = { documentElement: { style: { setProperty() {}, getPropertyValue: () => '' }, getAttribute: () => null }, addEventListener() {}, getElementById: () => null, querySelector: () => null, querySelectorAll: () => [] };
global.location = { hash: '', search: '', hostname: 'localhost' };
global.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
Object.defineProperty(global, 'navigator', { value: { language: 'de-DE', languages: ['de-DE'] }, writable: true });

import { test } from 'node:test';
import assert from 'node:assert/strict';
const { ListingCore } = await import('../listing-core.js'); // erst nach den Browser-Stubs (Imports greifen auf document zu)

function setup(tops, initial = {}) {
  const log = [];
  const els = tops.map((top, i) => ({
    attrs: { 'data-microtip-position': initial[i] },
    getBoundingClientRect() { log.push('read'); return { top }; },
    getAttribute(k) { return this.attrs[k]; },
    setAttribute(k, v) { log.push('write'); this.attrs[k] = v; },
  }));
  const container = { getBoundingClientRect: () => ({ top: 0, height: 100 }), querySelectorAll: () => els };
  return { log, els, container };
}
const run = container => ListingCore.prototype.updateMeetingTooltipPositions.call(null, container);

test('1: Elemente in der unteren Hälfte → top-left, obere Hälfte → bottom-left', () => {
  const { els, container } = setup([10, 49, 51, 90]);
  run(container);
  assert.deepEqual(els.map(e => e.attrs['data-microtip-position']), ['bottom-left', 'bottom-left', 'top-left', 'top-left']);
});

test('2: alle Reads kommen vor dem ersten Write (kein Layout-Thrashing)', () => {
  const { log, container } = setup([10, 60, 20, 80, 30]);
  run(container);
  const firstWrite = log.indexOf('write');
  assert.ok(firstWrite > 0);
  assert.ok(!log.slice(firstWrite).includes('read'), 'nach dem ersten Write darf nicht mehr gelesen werden');
});

test('3: unveränderte Positionen werden nicht neu geschrieben', () => {
  const { log, container } = setup([10, 60], { 0: 'bottom-left', 1: 'top-left' });
  run(container);
  assert.equal(log.filter(x => x === 'write').length, 0);
});

test('4: initMeetingTooltipObserver mehrfach aufgerufen (jeder Dropdown-Rebuild) → genau EIN Scroll-Listener', () => {
  const active = new Set();
  const container = {
    addEventListener(type, fn) { if (type === 'scroll') active.add(fn); },
    removeEventListener(type, fn) { if (type === 'scroll') active.delete(fn); },
    getBoundingClientRect: () => ({ top: 0, height: 100 }),
    querySelectorAll: () => [],
  };
  const lc = Object.create(ListingCore.prototype);
  for (let i = 0; i < 5; i++) lc.initMeetingTooltipObserver(container);
  assert.equal(active.size, 1, `Scroll-Listener summieren sich auf: ${active.size}`);
});

test('5: der verbleibende Scroll-Listener aktualisiert die Tooltip-Positionen', () => {
  const { els, container } = setup([10, 90]);
  let handler;
  container.addEventListener = (type, fn) => { if (type === 'scroll') handler = fn; };
  container.removeEventListener = () => {};
  const lc = Object.create(ListingCore.prototype);
  lc.initMeetingTooltipObserver(container);
  els.forEach(e => { e.attrs['data-microtip-position'] = undefined; });
  handler();
  assert.deepEqual(els.map(e => e.attrs['data-microtip-position']), ['bottom-left', 'top-left']);
});
