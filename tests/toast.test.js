// tests/toast.test.js
// Tests für toast.js: ein Toast unter dem Logo, wiederverwendet, blendet nach 3 s aus
// Läuft mit: node --test tests/toast.test.js

import { test, mock, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

const makeEl = (tag) => {
  const classes = new Set();
  return {
    tag, style: {}, innerHTML: '', className: '', removed: false,
    classList: {
      add: (...c) => c.forEach(x => classes.add(x)),
      remove: (...c) => c.forEach(x => classes.delete(x)),
      contains: (c) => classes.has(c),
    },
    remove() { this.removed = true; body.children = body.children.filter(e => e !== this); },
  };
};
const logo = { getBoundingClientRect: () => ({ left: 16, bottom: 80 }) };
const body = { children: [], appendChild(el) { this.children.push(el); } };
global.requestAnimationFrame = (fn) => fn();
global.document = {
  body,
  createElement: makeEl,
  querySelector(sel) {
    if (sel === '.title-bar .title') return logo;
    if (sel === '.settings-hash-toast') return body.children.find(e => e.className.includes('settings-hash-toast')) ?? null;
    return null;
  },
};

const { showToast } = await import('../toast.js');

beforeEach(() => { body.children = []; });

test('1: Toast erscheint unter dem Logo (top = bottom+8, left = logo.left)', () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  showToast('Hallo');
  const t = body.children[0];
  assert.equal(t.innerHTML, 'Hallo');
  assert.equal(t.style.top, '88px');
  assert.equal(t.style.left, '16px');
  assert.ok(t.classList.contains('show'));
  mock.timers.reset();
});

test('2: zweiter Aufruf nutzt dasselbe Element und setzt den Text neu', () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  showToast('A');
  showToast('B');
  assert.equal(body.children.length, 1);
  assert.equal(body.children[0].innerHTML, 'B');
  mock.timers.reset();
});

test('3: blendet nach 3 s aus und wird nach der Animation entfernt', () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  showToast('C');
  const t = body.children[0];
  mock.timers.tick(3000);
  assert.ok(t.classList.contains('zoom-out'));
  assert.equal(t.classList.contains('show'), false);
  mock.timers.tick(300);
  assert.equal(t.removed, true);
  mock.timers.reset();
});
