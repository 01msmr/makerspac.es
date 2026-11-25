// tests/spaces-lib.test.js — Logik der Space-Review-Seite (ADR-009)
// Läuft mit: node --test tests/spaces-lib.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  FIELDS, currentValue, proposalValue, isEmptyValue, sameValue, validateValue, weeklyTextOf,
  groupBySpace, buildQueue, fillRates, isImportantEmpty, newIssueBody, planDecision, undoStep,
} from '../admin/spaces-lib.js';
import { parseIssue, parseWorkshopIssue, parseCalendarIssue, parseWeeklyIssue } from '../admin/admin-lib.js';

const issue = (number, title, id, json, extra = '', labels = []) => ({
  number, title, labels: labels.map(name => ({ name })), updated_at: '2026-11-24T10:00:00Z', html_url: `https://x/${number}`,
  body: `**ID:** ${id}\n**Website:** https://site.example\n${extra}\n\n\`\`\`json\n${json}\n\`\`\``,
});
const ws = (n, id, list, labels) => issue(n, '[Workshop-Daten] A', id, `"workshops": ${JSON.stringify(list)}`, '', labels);
const cal = (n, id, url, labels) => issue(n, 'Kalenderlink: A', id, JSON.stringify({ events: url }), '', labels);
const api = (n, id, url, labels) => issue(n, 'SpaceAPI: A', id, JSON.stringify({ spaceapi: { endpoint: url } }), '', labels);
const wk = (n, id, w, init, labels) => issue(n, 'Treffen-Daten: A', id, JSON.stringify({ ...(w ? { weekly: w } : {}), ...(init ? { 'space.init': init } : {}) }), '', labels);

const loc = { ID: 7, name: 'Alpha', link: { url: 'https://alpha.example' }, dates: { 'space.init': 20150501 } };
const enr = { workshops: ['wood'], events: 'https://cal.example/a', spaceapi: { endpoint: 'https://api.example/a' }, weekly: { weekday: 2, time: 1900 } };

test('1: currentValue / proposalValue liefern dieselbe Form', () => {
  assert.deepEqual(currentValue('workshops', loc, enr), ['wood']);
  assert.equal(currentValue('calendar', loc, enr), 'https://cal.example/a');
  assert.equal(currentValue('spaceapi', loc, enr), 'https://api.example/a');
  assert.deepEqual(currentValue('weekly', loc, enr), { day: '2', time: '19:00', init: '2015-05-01' });
  assert.deepEqual(currentValue('weekly', { ID: 1, dates: { 'space.init': 20010000 } }, undefined), { day: '', time: '', init: '' });
  assert.deepEqual(proposalValue('weekly', parseWeeklyIssue(wk(1, 7, { weekday: 3, time: 1830 }, 20100203))), { day: '3', time: '18:30', init: '2010-02-03' });
  assert.deepEqual(proposalValue('workshops', parseWorkshopIssue(ws(2, 7, ['3d']))), ['3d']);
});

test('2: leer/gleich/validieren', () => {
  assert.ok(isEmptyValue('workshops', []) && isEmptyValue('calendar', '') && isEmptyValue('weekly', { day: '', time: '', init: '' }));
  assert.ok(sameValue('workshops', ['a', 'b'], ['b', 'a']) && !sameValue('workshops', ['a'], ['a', 'b']));
  assert.equal(validateValue('calendar', 'ftp://x'), 'Ungültige URL (http/https)');
  assert.equal(validateValue('calendar', ''), null);
  assert.equal(validateValue('weekly', { day: '2', time: '', init: '' }), 'Wochentag und Uhrzeit nur zusammen');
  assert.equal(validateValue('weekly', { day: '', time: '', init: '2999-01-01' }, '2026-11-24'), 'Gründungsdatum ungültig');
  assert.equal(validateValue('workshops', ['nope']), 'Unbekannter Workshop-Typ');
  assert.equal(weeklyTextOf({ day: '2', time: '19:00', init: '2015-05-01' }), 'Di 19:00, 2015-05-01');
});

test('3: groupBySpace bündelt je Space; ok-Issues zählen nicht als offen', () => {
  const g = groupBySpace({
    workshops: [ws(10, 7, ['3d']), ws(11, 8, ['wood'], ['ok'])],
    calendar: [cal(12, 7, 'https://c.example')],
    spaceapi: [api(13, 7, 'https://a.example'), api(14, 7, 'https://a2.example')],
    weekly: [],
  });
  assert.deepEqual(Object.keys(g.get(7).proposals).sort(), ['calendar', 'spaceapi', 'workshops']);
  assert.equal(g.get(7).proposals.spaceapi.number, 14);   // neuester
  assert.equal(g.get(8).okCount, 1);
  assert.deepEqual(g.get(8).proposals, {});
});

test('4: buildQueue — viele Vorschläge zuerst, später ans Ende, Modus filtert', () => {
  const g = groupBySpace({
    workshops: [ws(1, 3, ['3d']), ws(2, 1, ['3d']), ws(3, 2, ['3d'])],
    calendar: [cal(4, 2, 'https://c.example')],
    spaceapi: [], weekly: [],
  });
  assert.deepEqual(buildQueue(g), [2, 1, 3]);                   // 2 hat zwei Vorschläge
  assert.deepEqual(buildQueue(g, [2]), [1, 3, 2]);              // 2 später → ans Ende
  assert.deepEqual(buildQueue(g, [2, 1]), [3, 2, 1]);           // Reihenfolge des Verschiebens
  assert.deepEqual(buildQueue(g, [], 'calendar'), [2]);         // Modus: nur Spaces mit Kalender-Vorschlag
});

test('5: fillRates + isImportantEmpty (Schwelle 35 %)', () => {
  const locs = Array.from({ length: 10 }, (_, i) => ({ ID: i + 1 }));
  const e = {};
  for (let i = 1; i <= 5; i++) e[i] = { workshops: ['wood'] };     // 50 %
  for (let i = 1; i <= 2; i++) e[i].weekly = { weekday: 1, time: 1900 }; // 20 %
  const r = fillRates(locs, e);
  assert.equal(r.workshops, 0.5); assert.equal(r.weekly, 0.2);
  assert.ok(isImportantEmpty('workshops', [], r));
  assert.ok(!isImportantEmpty('weekly', { day: '', time: '', init: '' }, r));
  assert.ok(!isImportantEmpty('workshops', ['wood'], r));
});

test('6: neue Issues sind im Crawler-Format (Parser lesen sie zurück)', () => {
  const space = { id: 7, name: 'Alpha', website: 'https://alpha.example' };
  const mk = (key, v, replace, title, labels) => ({ number: 99, title, labels: labels.map(name => ({ name })), body: newIssueBody(key, space, v, replace), updated_at: '2026-11-24T00:00:00Z' });
  assert.equal(parseIssue(mk('spaceapi', 'https://api.example/x', false, 'SpaceAPI: Alpha', ['ok'])).endpoint, 'https://api.example/x');
  const c = parseCalendarIssue(mk('calendar', 'https://cal.example/y', true, 'Kalenderlink: Alpha', ['ok']));
  assert.equal(c.events, 'https://cal.example/y'); assert.equal(c.replace, true); assert.equal(c.ok, true);
  const w = parseWorkshopIssue(mk('workshops', ['wood', '3d'], false, '[Workshop-Daten] Alpha', ['ok']));
  assert.deepEqual(w.workshops, ['wood', '3d']); assert.equal(w.replace, false);
  const t = parseWeeklyIssue(mk('weekly', { day: '4', time: '19:00', init: '2012-03-04' }, false, 'Treffen-Daten: Alpha', ['ok']));
  assert.deepEqual(t.weekly, { weekday: 4, time: 1900 }); assert.equal(t.init, 20120304);
  assert.equal(parseWorkshopIssue(mk('workshops', [], true, '[Workshop-Daten] Alpha', [])).workshops.length, 0);
});

function space() {
  const issues = { workshops: [ws(10, 7, ['3d'])], calendar: [cal(11, 7, 'https://c.example/new')], spaceapi: [], weekly: [] };
  const g = groupBySpace(issues).get(7);
  const bodies = { 10: issues.workshops[0].body, 11: issues.calendar[0].body };
  const current = Object.fromEntries(FIELDS.map(f => [f.key, currentValue(f.key, loc, enr)]));
  return { sp: { id: 7, name: 'Alpha', website: 'https://alpha.example', proposals: g.proposals, current }, bodies };
}
const row = (key, value, over = {}) => ({ key, enabled: true, include: true, value, ...over });

test('7: planDecision — unverändert = ok, Häkchen aus = verwerfen, geändert = Body neu + ok', () => {
  const { sp, bodies } = space();
  let r = planDecision(sp, [row('workshops', ['3d']), row('calendar', 'https://c.example/new')], bodies);
  assert.deepEqual(r.actions.map(a => [a.type, a.key, a.body]), [['ok', 'workshops', undefined], ['ok', 'calendar', undefined]]);
  r = planDecision(sp, [row('workshops', ['3d'], { include: false }), row('calendar', 'https://c.example/new')], bodies);
  assert.deepEqual(r.actions.map(a => [a.type, a.number]), [['reject', 10], ['ok', 11]]);
  r = planDecision(sp, [row('workshops', ['3d', 'laser'])], bodies);
  assert.equal(r.actions[0].type, 'ok');
  assert.deepEqual(parseWorkshopIssue({ ...issueOf(10), body: r.actions[0].body }).workshops, ['3d', 'laser']);
  assert.match(r.actions[0].body, /\*\*Modus:\*\* ersetzen/);    // vorhandene Workshops (wood) → ersetzen
  assert.equal(r.actions[0].prevBody, bodies[10]);
});
function issueOf(n) { return { number: n, title: '[Workshop-Daten] A', labels: [], updated_at: '2026-11-24T00:00:00Z' }; }

test('8: planDecision — Eigenschaft ohne Vorschlag: neu anlegen nur bei Änderung; Radio-Leiste sperrt Zeilen', () => {
  const { sp, bodies } = space();
  let r = planDecision(sp, [row('spaceapi', 'https://api.example/a'), row('weekly', currentValue('weekly', loc, enr))], bodies);
  assert.deepEqual(r.actions, []);                                // unverändert → nichts
  r = planDecision(sp, [row('spaceapi', 'https://api.example/NEU')], bodies);
  assert.equal(r.actions[0].type, 'create');
  assert.deepEqual(r.actions[0].labels, ['data-update', 'ok']);
  assert.equal(r.actions[0].title, 'SpaceAPI: Alpha');
  r = planDecision(sp, [row('workshops', [], { enabled: false }), row('calendar', 'x', { enabled: false })], bodies);
  assert.deepEqual(r.actions, []);                                // gesperrte Zeilen unberührt
});

test('9: planDecision — Fehler statt Aktion bei ungültiger Eingabe; kein Typ ohne Bestand = verwerfen', () => {
  const { sp, bodies } = space();
  let r = planDecision(sp, [row('calendar', 'kaputt')], bodies);
  assert.equal(r.actions.length, 0); assert.match(r.errors[0], /Kalender: Ungültige URL/);
  r = planDecision({ ...sp, current: { ...sp.current, workshops: [] } }, [row('workshops', [])], bodies);
  assert.deepEqual(r.actions.map(a => a.type), ['reject']);
  r = planDecision(sp, [row('spaceapi', '')], bodies);
  assert.equal(r.actions.length, 0);                               // unverändert (leer = leer)
});

test('10: undoStep kehrt jede Aktion um', () => {
  assert.deepEqual(undoStep({ type: 'ok', number: 1, prevBody: 'b' }), { op: 'unok', number: 1, prevBody: 'b' });
  assert.deepEqual(undoStep({ type: 'reject', number: 2 }), { op: 'reopen', number: 2 });
  assert.deepEqual(undoStep({ type: 'create', createdNumber: 3 }), { op: 'close-created', number: 3 });
});

import { readFileSync, existsSync } from 'node:fs';
const read = f => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');

test('11: Tasten — nie e l w a s d (Vivaldi), keine Ziffern; y n ä z und ← →', () => {
  const js = read('admin/spaces.js');
  const keys = [...js.matchAll(/k === '(.)'/g)].map(m => m[1]).filter(k => /[a-zäöü]/.test(k));
  assert.deepEqual(keys.sort(), ['n', 'y', 'z', 'ä']);
  assert.ok(!keys.some(k => 'elwasd'.includes(k)));
  assert.ok(!/\/\^\[0-\d\]\$\//.test(js), 'keine Ziffern-Tasten (Zoom/Tab-Wechsel im Browser)');
  assert.match(js, /ArrowRight/); assert.match(js, /ArrowLeft/);
});

test('12: Reiter „Spaces“ ist der erste Reiter und Standard; externe Links nur mit rel=noopener', () => {
  const html = read('admin/index.html');
  assert.ok(html.indexOf('id="tab-spaces"') > 0 && html.indexOf('id="tab-spaces"') < html.indexOf('id="tab-spaceapi"'), 'Spaces vor SpaceAPI');
  assert.match(read('admin/admin.js'), /state\.tab = [^\n]*\n\s*showSpaces\(\);/);   // Start → Spaces (Standard)
  for (const [f, text] of [['admin/index.html', html], ['admin/spaces.js', read('admin/spaces.js')]]) {
    for (const m of text.matchAll(/target="_blank"[^>]*>/g)) assert.match(m[0], /noopener/, `${f}: ${m[0]}`);
  }
  assert.ok(!existsSync(new URL('../admin/spaces.html', import.meta.url)), 'keine eigene Seite mehr');
});

test('13: keine doppelten IDs in der Admin-Seite (Spaces-Ansicht teilt die Seite mit der Reiter-Ansicht)', () => {
  const ids = [...read('admin/index.html').matchAll(/\sid="([^"]+)"/g)].map(m => m[1]);
  const dup = ids.filter((id, i) => ids.indexOf(id) !== i);
  assert.deepEqual(dup, []);
});

test('14: Freitext liest die Zwischenablage bei Fokus/Verlassen, überschreibt aber keine eigenen Eingaben', () => {
  const js = read('admin/spaces.js');
  assert.match(js, /navigator\.clipboard\?\.readText/);
  assert.match(js, /area\.addEventListener\('focus', readClipboard\)/);
  assert.match(js, /area\.addEventListener\('blur'/);
  assert.match(js, /area\.value !== autoText/);   // nur leeres bzw. zuletzt automatisch gefülltes Feld
});

import { snapTime, classifyUrl, analyzeFreeText } from '../admin/spaces-lib.js';

test('15: Treffen-Uhrzeit nur im 30-Minuten-Raster (Validierung + Rundung)', () => {
  assert.equal(validateValue('weekly', { day: '2', time: '19:15', init: '' }), 'Uhrzeit nur im 30-Minuten-Raster (:00 oder :30)');
  assert.equal(validateValue('weekly', { day: '2', time: '19:00', init: '' }), null);
  assert.equal(validateValue('weekly', { day: '2', time: '19:30', init: '' }), null);
  assert.deepEqual(['19:15', '19:45', '19:20', '19:10', '23:50', '18:00'].map(snapTime), ['19:00', '19:30', '19:30', '19:00', '23:30', '18:00']);
  const sp = { id: 1, name: 'A', website: '', proposals: {}, current: { weekly: { day: '', time: '', init: '' } } };
  const r = planDecision(sp, [{ key: 'weekly', enabled: true, include: true, value: { day: '2', time: '19:15', init: '' } }]);
  assert.equal(r.actions.length, 0); assert.match(r.errors[0], /30-Minuten-Raster/);
});

test('16: classifyUrl — Kalender und SpaceAPI erkennen, normale Seiten nicht', () => {
  for (const u of ['https://x.example/a.ics', 'webcal://x.example/c', 'https://calendar.google.com/calendar/ical/abc/public/basic.ics', 'https://cloud.example/apps/calendar/p/xyz', 'https://x.example/termine/', 'https://www.meetup.com/foo/']) assert.equal(classifyUrl(u), 'calendar', u);
  for (const u of ['https://status.example/status.json', 'https://spacestatus.example.de', 'https://x.example/spaceapi.json']) assert.equal(classifyUrl(u), 'spaceapi', u);
  for (const u of ['https://makerspace.example/', 'https://x.example/ueber-uns']) assert.equal(classifyUrl(u), null, u);
});

test('17: analyzeFreeText — alles aus einem Text: Workshops, Treffen (gerastert), Gründung, Kalender, SpaceAPI', () => {
  const t = 'Wir sind ein Makerspace, gegründet 2015. Jeden Dienstag ab 19:15 Uhr offener Abend. Lasercutter, 3D-Drucker und Nähmaschine vorhanden.\nKalender: webcal://cloud.example/apps/calendar/p/abc und https://status.example/status.json';
  const a = analyzeFreeText(t, new Date('2026-11-25'));
  assert.deepEqual(a.workshops, ['3d', 'laser', 'textile']);
  assert.deepEqual([a.weekly.day, a.weekly.time], ['2', '19:00']);
  assert.match(a.notes[0], /19:15 → 19:00/);
  assert.equal(a.init.value, '2015-01-01');
  assert.equal(a.calendar, 'https://cloud.example/apps/calendar/p/abc');
  assert.equal(a.spaceapi, 'https://status.example/status.json');
});

test('18: analyzeFreeText — Kurzform, nur URL, leer, mehrdeutig', () => {
  const k = analyzeFreeText('Mi 18:30, 2012');
  assert.deepEqual([k.weekly.day, k.weekly.time, k.init.value], ['3', '18:30', '2012-01-01']);
  const u = analyzeFreeText('https://x.example/cal.ics');
  assert.equal(u.calendar, 'https://x.example/cal.ics'); assert.deepEqual(u.workshops, []); assert.equal(u.weekly, null);
  assert.deepEqual(analyzeFreeText('  '), { workshops: [], weekly: null, init: null, calendar: '', spaceapi: '', notes: [] });
  const m = analyzeFreeText('Jeden Montag 18:00 Uhr offener Abend. Jeden Freitag 20:00 Uhr offener Abend.');
  assert.equal(m.weekly, null); assert.match(m.notes[0], /Mehrere/);
  assert.equal(analyzeFreeText('Treffen jeden Donnerstag ab 18 Uhr, später vielleicht auch Dienstag').weekly?.day, '4');
});

test('19: Uhrzeit ist eine Auswahlliste im 30-Minuten-Raster (iOS/Android-Picker ignorieren step)', () => {
  const js = readFileSync(new URL('../admin/spaces.js', import.meta.url), 'utf8');
  assert.match(js, /time = document\.createElement\('select'\)/);
  assert.match(js, /m \+= TIME_STEP_MINUTES/);
  assert.ok(!/type: 'time'/.test(js), 'kein <input type="time"> mehr');
});

import { displayValue, weeklyWriteValue } from '../admin/spaces-lib.js';

test('20: Treffen-Vorschlag mit nur einem Teil — Anzeige mit aktuellem Rest, aber nur Geändertes wird geschrieben', () => {
  const cur = { day: '2', time: '19:00', init: '' };
  const onlyInit = parseWeeklyIssue(wk(7, 48, null, 19840101));
  assert.deepEqual(displayValue('weekly', onlyInit, cur), { day: '2', time: '19:00', init: '1984-01-01' });           // Rest = aktuell (nur Anzeige)
  const onlyWeekly = parseWeeklyIssue(wk(8, 48, { weekday: 3, time: 1830 }, undefined));
  assert.deepEqual(displayValue('weekly', onlyWeekly, { day: '', time: '', init: '2015-05-01' }), { day: '3', time: '18:30', init: '2015-05-01' });
  // Schreiben: nur Teile des Vorschlags bzw. geänderte; identische Bestandsdaten werden nie neu geschrieben
  assert.deepEqual(weeklyWriteValue({ day: '2', time: '19:00', init: '1984-01-01' }, onlyInit, cur), { day: '', time: '', init: '1984-01-01' });
  assert.deepEqual(weeklyWriteValue({ day: '2', time: '19:00', init: '1990-01-01' }, onlyInit, cur), { day: '', time: '', init: '1990-01-01' });   // Gründung bearbeitet
  assert.deepEqual(weeklyWriteValue({ day: '4', time: '19:30', init: '1984-01-01' }, onlyInit, cur), { day: '4', time: '19:30', init: '1984-01-01' });   // Termin bewusst geändert
  assert.deepEqual(weeklyWriteValue({ day: '3', time: '20:00', init: '' }, null, cur), { day: '3', time: '20:00', init: '' });                              // neues Issue: nur der geänderte Teil
});

test('21: planDecision — Vorschlag nur Gründung: unverändert = ok ohne Schreiben; Bearbeiten schreibt weekly NICHT mit; Leeren des Termins wird abgelehnt', () => {
  const issues = { weekly: [wk(11, 48, null, 19840101)], workshops: [], calendar: [], spaceapi: [] };
  const g = groupBySpace(issues).get(48);
  const bodies = { 11: issues.weekly[0].body };
  const cur = { weekly: { day: '2', time: '19:00', init: '' }, workshops: [], calendar: '', spaceapi: '' };
  const sp = { id: 48, name: 'CCC', website: '', proposals: g.proposals, current: cur };
  const same = { day: '2', time: '19:00', init: '1984-01-01' };
  let r = planDecision(sp, [{ key: 'weekly', enabled: true, include: true, value: same }], bodies);
  assert.deepEqual(r.actions.map(a => [a.type, a.body]), [['ok', undefined]]);                         // kein Neuschreiben
  r = planDecision(sp, [{ key: 'weekly', enabled: true, include: true, value: { ...same, init: '1990-02-03' } }], bodies);
  assert.equal(r.actions[0].type, 'ok');
  const written = parseWeeklyIssue({ ...wkIssue(11), body: r.actions[0].body });
  assert.equal(written.init, 19900203); assert.equal(written.weekly, undefined);                       // Termin nicht mitgeschrieben
  r = planDecision(sp, [{ key: 'weekly', enabled: true, include: true, value: { day: '', time: '', init: '1984-01-01' } }], bodies);
  assert.equal(r.actions.length, 0); assert.match(r.errors[0], /Entfernen nur bei Workshops\/Kalender/);   // Entfernen nie über die Karte
});
function wkIssue(n) { return { number: n, title: 'Treffen-Daten: A', labels: [], updated_at: '2026-11-25T00:00:00Z', html_url: 'x' }; }
