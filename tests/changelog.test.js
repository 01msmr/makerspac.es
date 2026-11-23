import { test } from 'node:test';
import assert from 'node:assert/strict';
import { diffSpaces, buildEntries, BULK_LIMIT } from '../tools/lib/changelog.js';

const loc = (ID, extra = {}) => ({ ID, name: 'S' + ID, loc: { city: 'X' }, style: 'for all', link: { url: 'https://a.de' }, dates: { 'space.edited.latest': 20250101 }, ...extra });
const snap = (locations, enrichment = {}) => ({ locations, enrichment });

test('diffSpaces: neuer Space, geänderte Angaben, Enrichment hinzu/ändern/entfernen; Datumsstempel zählen nicht', () => {
  const prev = snap([loc(1), loc(2)], { 1: { workshops: ['3d', 'laser'], events: 'https://e.de' }, 2: { weekly: { weekday: 2, time: 1900 } } });
  const next = snap(
    [loc(1, { dates: { 'space.edited.latest': 20261122 } }), loc(2, { name: 'Neu' }), loc(3)],
    { 1: { workshops: ['laser', '3d'], events: 'https://e2.de', spaceapi: { endpoint: 'https://s.de' } }, 2: { weekly: { weekday: 3, time: 1900 } } },
  );
  const d = diffSpaces(prev, next);
  const has = (id, k, o) => d.some(e => e.id === id && e.k === k && e.o === o);
  assert.ok(has(3, 'added', undefined));
  assert.ok(has(2, 'name', 'change'));
  assert.ok(!d.some(e => e.id === 2 && ['address', 'link', 'style'].includes(e.k)), 'nur der Name hat sich geändert');
  assert.ok(has(2, 'weekly', 'change'));
  assert.ok(has(1, 'events', 'change'));
  assert.ok(has(1, 'spaceapi', 'add'));
  assert.ok(!d.some(e => e.id === 1 && (e.k === 'workshops' || e.k === 'name')), 'gleiche Workshops (andere Reihenfolge) und nur Datum → kein Eintrag');
});

test('diffSpaces: Entfernen und leere Workshop-Liste', () => {
  const prev = snap([loc(1)], { 1: { workshops: ['3d'], weekly: { weekday: 1, time: 1800 } } });
  const next = snap([loc(1)], { 1: { workshops: [] } });
  const d = diffSpaces(prev, next);
  assert.deepEqual(d.map(e => `${e.k}:${e.o}`).sort(), ['weekly:remove', 'workshops:remove']);
});

test('buildEntries: neueste zuerst, Duplikate am selben Tag zusammen, bei neuem Space nur „added“, unbekannte IDs raus', () => {
  const a = snap([loc(1)]);
  const b = snap([loc(1), loc(2)], { 2: { weekly: { weekday: 2, time: 1900 } } });
  const c = snap([loc(1), loc(2)], { 1: { events: 'https://e.de' }, 2: { weekly: { weekday: 2, time: 2000 } } });
  const e = buildEntries([{ date: '2026-11-20', prev: a, next: b }, { date: '2026-11-22', prev: b, next: c }, { date: '2026-11-22', prev: c, next: c }], new Set([1, 2]));
  assert.deepEqual(e.map(x => `${x.d} ${x.id} ${x.k}`), ['2026-11-22 1 events', '2026-11-22 2 weekly', '2026-11-20 2 added']);
  assert.equal(buildEntries([{ date: '2026-11-20', prev: a, next: b }], new Set([1])).length, 0, 'ID 2 existiert nicht mehr');
});

test('buildEntries: Massenänderung (mehr als BULK_LIMIT Spaces in einem Commit) wird ausgelassen', () => {
  const many = Array.from({ length: BULK_LIMIT + 1 }, (_, i) => loc(i + 1));
  const prev = snap(many), next = snap(many, Object.fromEntries(many.map(l => [l.ID, { workshops: ['3d'] }])));
  assert.deepEqual(buildEntries([{ date: '2026-11-22', prev, next }]), []);
});

test('diffSpaces: Adresse (inkl. Position), Website und Zielgruppe einzeln benannt', () => {
  const base = loc(1, { loc: { lat: 50, long: 6, plz: 52070, city: 'Aachen', street: { name: 'Alt', number: 1, ext: '' }, country: 'Germany' } });
  const kinds = next => diffSpaces(snap([base]), snap([next])).map(e => e.k).sort();
  assert.deepEqual(kinds({ ...base, loc: { ...base.loc, street: { name: 'Neu', number: 1, ext: '' } } }), ['address']);
  assert.deepEqual(kinds({ ...base, loc: { ...base.loc, city: 'Köln' } }), ['address']);
  assert.deepEqual(kinds({ ...base, loc: { ...base.loc, lat: 50.5, long: 6.2 } }), [], 'nur der Pin verschoben → kein Eintrag (Position wird nicht genannt)');
  assert.deepEqual(kinds({ ...base, loc: { ...base.loc, city: 'Köln', lat: 50.9, long: 7 } }), ['address'], 'Adresse + Position → nur EINE Angabe (Adresse)');
  assert.deepEqual(kinds({ ...base, link: { url: 'https://neu.de' } }), ['link']);
  assert.deepEqual(kinds({ ...base, style: 'for youth' }), ['style']);
  assert.deepEqual(kinds({ ...base, name: 'Neu', style: 'for youth' }), ['name', 'style']);
});

test('Werkstätten: Anzahl der ergänzten/entfernten Typen (n), Reihenfolge egal; am selben Tag addiert', () => {
  const a = snap([loc(1)], { 1: { workshops: ['3d'] } });
  const b = snap([loc(1)], { 1: { workshops: ['laser', '3d', 'wood'] } });
  assert.deepEqual(diffSpaces(a, b).filter(e => e.k === 'workshops'), [{ id: 1, k: 'workshops', o: 'add', n: 2, more: 1 }], 'zu bestehenden Werkstätten → more');
  assert.deepEqual(diffSpaces(snap([loc(1)]), b).filter(e => e.k === 'workshops'), [{ id: 1, k: 'workshops', o: 'add', n: 3 }]);
  const c = snap([loc(1)], { 1: { workshops: ['wood', 'cnc'] } });
  assert.deepEqual(diffSpaces(b, c).filter(e => e.k === 'workshops').map(e => `${e.o}:${e.n}`).sort(), ['add:1', 'remove:2']);
  assert.equal(diffSpaces(snap([loc(1)]), b).find(e => e.k === 'workshops').more, undefined, 'erstmals Werkstätten → kein more');
  const two = buildEntries([{ date: '2026-11-22', prev: snap([loc(1)]), next: a }, { date: '2026-11-22', prev: a, next: b }], new Set([1]));
  assert.deepEqual(two.filter(e => e.k === 'workshops').map(e => `${e.o}:${e.n}:${e.more ?? '-'}`), ['add:3:-'], 'erst Werkstätten, dann weitere am selben Tag → insgesamt erstmals ergänzt');
});
