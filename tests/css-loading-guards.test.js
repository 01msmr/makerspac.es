// tests/css-loading-guards.test.js
// Wächter für die CSS-Ladestrategie (index.html): blockierend nur, was der erste Paint braucht.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = f => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
const html = read('index.html');
const head = html.slice(0, html.indexOf('<noscript>'));
const headLinks = [...head.matchAll(/<link rel="stylesheet" href="([^"]+)"([^>]*)\/>/g)].map(m => ({ href: m[1], attrs: m[2] }));

test('1: blockierend sind nur die Dateien für den ersten Paint', () => {
  const blocking = headLinks.filter(l => !/media="print"/.test(l.attrs)).map(l => l.href).sort();
  assert.deepEqual(blocking, [
    'libs/fontawesome/css/subset.min.css', 'libs/leaflet/leaflet.css',
    'main-layout.css', 'main-responsive.css', 'search.css',
  ].sort());
});

test('2: jedes nachgeladene Stylesheet schaltet per onload auf media=all und hat ein noscript-Gegenstück', () => {
  const noscript = html.slice(html.indexOf('<noscript>'), html.indexOf('</noscript>'));
  for (const l of headLinks.filter(x => /media="print"/.test(x.attrs))) {
    assert.match(l.attrs, /onload="this\.media='all'"/, `${l.href}: onload fehlt`);
    assert.ok(noscript.includes(`href="${l.href}"`), `${l.href}: noscript-Fallback fehlt`);
  }
});

test('3: Skeleton-Regeln liegen in der blockierenden main-layout.css (nicht in main-components.css)', () => {
  const layout = read('main-layout.css'), components = read('main-components.css');
  for (const sel of ['.map-backdrop', '.loading-overlay-stack', '.loading-overlay-toast']) {
    assert.ok(layout.includes(sel + ' {') || layout.includes(sel + '.'), `${sel} fehlt in main-layout.css`);
    assert.ok(!components.includes('\n' + sel + ' {'), `${sel} darf nicht in main-components.css stehen`);
  }
});

test('4: map.js wartet vor dem UI-Aufbau auf window.__cssReady', () => {
  const map = read('map.js');
  assert.ok(map.indexOf('await window.__cssReady') > 0 && map.indexOf('await window.__cssReady') < map.indexOf('setupSearch();\n    setupStyleFilter'));
});
