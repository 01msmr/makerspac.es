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
  assert.deepEqual(currentValue('weekly', loc, enr), { day: '2', time: '19:00' });
  assert.equal(currentValue('init', loc, enr), '2015-05-01');
  assert.deepEqual(currentValue('weekly', { ID: 1, dates: { 'space.init': 20010000 } }, undefined), { day: '', time: '' });
  assert.equal(currentValue('init', { ID: 1, dates: { 'space.init': 20010000 } }, undefined), '');
  assert.deepEqual(proposalValue('weekly', parseWeeklyIssue(wk(1, 7, { weekday: 3, time: 1830 }, 20100203))), { day: '3', time: '18:30' });
  assert.equal(proposalValue('init', parseWeeklyIssue(wk(1, 7, { weekday: 3, time: 1830 }, 20100203))), '2010-02-03');
  assert.deepEqual(proposalValue('workshops', parseWorkshopIssue(ws(2, 7, ['3d']))), ['3d']);
});

test('2: leer/gleich/validieren', () => {
  assert.ok(isEmptyValue('workshops', []) && isEmptyValue('calendar', '') && isEmptyValue('weekly', { day: '', time: '' }) && isEmptyValue('init', ''));
  assert.ok(sameValue('workshops', ['a', 'b'], ['b', 'a']) && !sameValue('workshops', ['a'], ['a', 'b']));
  assert.equal(validateValue('calendar', 'ftp://x'), 'Ungültige URL (http/https)');
  assert.equal(validateValue('calendar', ''), null);
  assert.equal(validateValue('weekly', { day: '2', time: '' }), 'Wochentag und Uhrzeit nur zusammen');
  assert.equal(validateValue('init', '2999-01-01', '2026-11-24'), 'Gründungsdatum ungültig');
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
  assert.ok(!isImportantEmpty('weekly', { day: '', time: '' }, r));
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

test('14: Freitext — Übernahme erst beim Verlassen des Feldes; Zwischenablage nur über den Knopf „Einfügen“', () => {
  const js = readFileSync(new URL('../admin/spaces.js', import.meta.url), 'utf8');
  const free = js.slice(js.indexOf('function buildFreeText'), js.indexOf('// ─── Entscheiden'));
  assert.match(free, /area\.addEventListener\('blur', \(\) => evaluate\(\)\)/);           // Auswertung beim Verlassen
  assert.ok(!/area\.addEventListener\('(input|paste|focus)'/.test(free), 'nicht beim Tippen/Einfügen/Fokussieren');
  assert.equal((free.match(/clipboard\.readText/g) || []).length, 1);                           // genau einmal: im Einfügen-Knopf
  assert.match(free, /paste\.addEventListener\('click'[\s\S]*?clipboard\.readText/);
  assert.match(free, /className = 'paste-btn'/);
});

test('22: Wochentag-Auswahl: „kein weekly“ zuerst, danach „–“ (keine Info, Standard), dann Mo…So', () => {
  const js = readFileSync(new URL('../admin/spaces.js', import.meta.url), 'utf8');
  const m = js.match(/const WEEKDAYS = (\[\[[^;]*\]\]);/)[1];
  const list = JSON.parse(m.replace(/'/g, '"'));
  assert.deepEqual(list.map(x => x[1]), ['kein weekly', '–', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag']);
  assert.equal(list[1][0], '');                                  // Standard (leer) = keine Info
});

test('23: Seitenfenster — Links öffnen dort statt im Tab; ID + Name sind EIN Link; Trenner breit + dunkel; Breite begrenzt', async () => {
  const { clampPaneWidth } = await import('../admin/spaces-lib.js');
  assert.equal(clampPaneWidth(10, 1000), 200); assert.equal(clampPaneWidth(5000, 2000), 1200); assert.equal(clampPaneWidth(450, 1000), 330);   // max 60 % bzw. Karte ≥ 640 px + Trenner
  assert.equal(clampPaneWidth(5000, 1500), 830); assert.equal(clampPaneWidth(900, 1200), 530);
  assert.equal(clampPaneWidth(NaN, 1000), 450);
  const js = readFileSync(new URL('../admin/spaces.js', import.meta.url), 'utf8'), css = readFileSync(new URL('../admin/spaces.css', import.meta.url), 'utf8'), html = readFileSync(new URL('../admin/index.html', import.meta.url), 'utf8');
  assert.match(js, /if \(paneEnabled\(\)\) \{ e\.preventDefault\(\); loadPane\(url, title\); \}/);
  assert.match(js, /\$\('sp-link'\)[\s\S]*?#\$\{id\} \$\{sp\.name\}/);
  assert.ok(!/id="sp-id"|id="sp-name"/.test(html));
  assert.match(html, /id="sp-split"[^>]*role="separator"[^>]*tabindex="0"/);
  assert.match(css, /#sp-split \{ flex: 0 0 18px;/);          // breiter Griff-Bereich
  assert.match(css, /#sp-split::before \{[^}]*width: 4px;/);   // breitere Trennlinie
  assert.match(css, /repeat\(auto-fill, minmax\(max\(7\.2rem, calc\(33\.33% - 1rem\)\), 1fr\)\)/); assert.match(css, /repeat\(2, minmax\(0, 1fr\)\)/);   // Workshop-Raster: höchstens 3 Spalten (Desktop), 2 (Phone)
  assert.match(js, /closest\?\.\('#sp-split'\)/);               // Pfeiltasten am Trenner schalten nicht die Bearbeiten-Auswahl
});


import { snapTime, classifyUrl, analyzeFreeText } from '../admin/spaces-lib.js';

test('15: Treffen-Uhrzeit nur im 30-Minuten-Raster (Validierung + Rundung)', () => {
  assert.equal(validateValue('weekly', { day: '2', time: '19:15' }), 'Uhrzeit nur im 30-Minuten-Raster (:00 oder :30)');
  assert.equal(validateValue('weekly', { day: '2', time: '19:00' }), null);
  assert.equal(validateValue('weekly', { day: '2', time: '19:30' }), null);
  assert.deepEqual(['19:15', '19:45', '19:20', '19:10', '23:50', '18:00'].map(snapTime), ['19:00', '19:30', '19:30', '19:00', '23:30', '18:00']);
  const sp = { id: 1, name: 'A', website: '', proposals: {}, current: { weekly: { day: '', time: '' } } };
  const r = planDecision(sp, [{ key: 'weekly', enabled: true, include: true, value: { day: '2', time: '19:15' } }]);
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

import { displayValue } from '../admin/spaces-lib.js';

test('20: Weekly und Gründung sind getrennte Eigenschaften mit je eigenem Issue', () => {
  const g = groupBySpace({ weekly: [wk(7, 48, { weekday: 3, time: 1830 }, null), wk(8, 48, null, 19840101)], workshops: [], calendar: [], spaceapi: [] }).get(48);
  assert.deepEqual([g.proposals.weekly.number, g.proposals.init.number], [7, 8]);
  assert.deepEqual(displayValue('weekly', g.proposals.weekly), { day: '3', time: '18:30' });
  assert.equal(displayValue('init', g.proposals.init), '1984-01-01');
  const onlyInit = groupBySpace({ weekly: [wk(9, 48, null, 19840101)], workshops: [], calendar: [], spaceapi: [] }).get(48);
  assert.deepEqual(Object.keys(onlyInit.proposals), ['init']);               // keine Weekly-Zeile mit Vorschlag
});

test('21: planDecision — Weekly und Gründung getrennt entscheiden (je ein Issue); neue Gründung = eigenes Issue', () => {
  const issues = { weekly: [wk(11, 48, { weekday: 3, time: 1830 }, null), wk(12, 48, null, 19840101)], workshops: [], calendar: [], spaceapi: [] };
  const g = groupBySpace(issues).get(48);
  const bodies = { 11: issues.weekly[0].body, 12: issues.weekly[1].body };
  const cur = { weekly: { day: '2', time: '19:00' }, init: '', workshops: [], calendar: '', spaceapi: '' };
  const sp = { id: 48, name: 'CCC', website: '', proposals: g.proposals, current: cur };
  const W = { day: '3', time: '18:30' }, I = '1984-01-01';
  const rows = (w, i) => [{ key: 'weekly', enabled: true, include: w, value: W }, { key: 'init', enabled: true, include: i, value: I }];
  let r = planDecision(sp, rows(true, false), bodies);
  assert.deepEqual(r.actions.map(a => [a.type, a.key, a.number, a.body]), [['ok', 'weekly', 11, undefined], ['reject', 'init', 12, undefined]]);
  r = planDecision(sp, rows(false, true), bodies);
  assert.deepEqual(r.actions.map(a => [a.type, a.number]), [['reject', 11], ['ok', 12]]);
  // Gründung bearbeitet → nur das Gründungs-Issue wird neu geschrieben
  r = planDecision(sp, [{ key: 'weekly', enabled: true, include: true, value: W }, { key: 'init', enabled: true, include: true, value: '1990-02-03' }], bodies);
  assert.equal(r.actions[0].body, undefined); assert.equal(parseWeeklyIssue({ ...wkIssue(12), body: r.actions[1].body }).init, 19900203);
  // Weekly-Leeren wird abgelehnt
  r = planDecision(sp, [{ key: 'weekly', enabled: true, include: true, value: { day: '', time: '' } }], bodies);
  assert.equal(r.actions.length, 0); assert.match(r.errors[0], /Entfernen nur bei Workshops\/Kalender/);
  // ohne Vorschlag: neue Gründung → neues Issue „… (Gründung)“ nur mit space.init
  r = planDecision({ ...sp, proposals: {} }, [{ key: 'init', enabled: true, include: true, value: '2001-05-06' }]);
  assert.equal(r.actions[0].type, 'create'); assert.equal(r.actions[0].title, 'Treffen-Daten: CCC (Gründung)');
  const c = parseWeeklyIssue({ ...wkIssue(0), body: r.actions[0].body });
  assert.equal(c.init, 20010506); assert.equal(c.weekly, undefined);
});

test('22: Altes kombiniertes Issue (weekly + space.init) — beide Zeilen nur gemeinsam und unverändert', () => {
  const issues = { weekly: [wk(21, 48, { weekday: 3, time: 1830 }, 19840101)], workshops: [], calendar: [], spaceapi: [] };
  const g = groupBySpace(issues).get(48);
  const cur = { weekly: { day: '', time: '' }, init: '', workshops: [], calendar: '', spaceapi: '' };
  const sp = { id: 48, name: 'CCC', website: '', proposals: g.proposals, current: cur };
  const W = { day: '3', time: '18:30' }, I = '1984-01-01';
  const rows = (w, i, iv = I) => [{ key: 'weekly', enabled: true, include: w, value: W }, { key: 'init', enabled: true, include: i, value: iv }];
  assert.deepEqual(planDecision(sp, rows(true, true), { 21: issues.weekly[0].body }).actions.map(a => [a.type, a.number]), [['ok', 21]]);
  assert.deepEqual(planDecision(sp, rows(false, false), {}).actions.map(a => [a.type, a.number]), [['reject', 21]]);
  assert.match(planDecision(sp, rows(true, false), {}).errors[0], /nur gemeinsam/);
  assert.match(planDecision(sp, rows(true, true, '1990-01-01'), {}).errors[0], /nur unverändert/);
});
function wkIssue(n) { return { number: n, title: 'Treffen-Daten: A', labels: [], updated_at: '2026-11-25T00:00:00Z', html_url: 'x' }; }

test('23: Ändern eines Vorschlags merkt den ursprünglichen Crawler-Fund im Issue (kein erneuter Vorschlag)', () => {
  const issues = { weekly: [wk(31, 48, { weekday: 3, time: 1830 }, null)], workshops: [], calendar: [], spaceapi: [] };
  const g = groupBySpace(issues).get(48);
  const sp = { id: 48, name: 'CCC', website: '', proposals: g.proposals, current: { weekly: { day: '', time: '' }, init: '', workshops: [], calendar: '', spaceapi: '' } };
  const r = planDecision(sp, [{ key: 'weekly', enabled: true, include: true, value: { day: '3', time: '19:00' } }], { 31: issues.weekly[0].body });
  assert.match(r.actions[0].body, /\*\*Crawler-Fund:\*\* "/);
  assert.equal(parseWeeklyIssue({ ...wkIssue(31), body: r.actions[0].body }).weekly.time, 1900);   // Parser liest den geänderten Block, nicht das Original
});

test('24: Eigenschaftszeilen nur über tr[data-key] lesen (Beleg-Tabellen innerhalb der Zeilen haben eigene <tr>)', () => {
  const js = read('admin/spaces.js');
  assert.ok(!/\$\('sp-rows'\)\.querySelectorAll\('tr'\)/.test(js), 'Stale-Check/readRows dürfen keine verschachtelten <tr> der Beleg-Tabellen erfassen');
  assert.match(js, /querySelectorAll\('tr\[data-key\]'\)\]\.some\(tr => tr\.dataset\.number/);
});

test('25: Bearbeiten-Leiste klebt unter der Kopfzeile; Seitenfenster klebt darunter (Offsets als CSS-Variablen)', () => {
  const css = read('admin/spaces.css'), js = read('admin/spaces.js');
  assert.match(css, /#sp-modebar \{ position: sticky; top: var\(--bar-h/);
  assert.match(css, /#sp-pane \{[^}]*top: var\(--sp-top/);
  assert.match(js, /setProperty\('--bar-h'/); assert.match(js, /setProperty\('--sp-top'/);
});

test('26: Vorschlagsbereich blass (5,4 %); verschachtelte Beleg-Tabellen erben keine rot/grün-Alt-Regeln', () => {
  const css = read('admin/spaces.css');
  assert.match(css, /#sp-rows tr\.differs td\.inp \{[^}]*color-mix\(in srgb, var\(--space-open\) 5\.4%, transparent\)/);
  assert.match(css, /#sp-rows \.inp \.ev-table td \{ background: transparent; box-shadow: none;/);
});

test('27: Workshops — hinzugefügt grün (.add), entfernt rot (.del)', () => {
  const css = read('admin/spaces.css'), js = read('admin/spaces.js');
  assert.match(js, /classList\.toggle\('add', box\.checked && !was\)/); assert.match(js, /classList\.toggle\('del', !box\.checked && was\)/);
  assert.match(css, /\.ws-checks label\.add \{[^}]*--space-open/); assert.match(css, /\.ws-checks label\.del \{[^}]*--space-closed/);
});

test('28: Auswertungsfeld — je erkanntem Element eine eigene Zeile (.det-line, Workshops als Pillen), mit vertikalem Abstand', () => {
  const js = read('admin/spaces.js'), css = read('admin/spaces.css');
  assert.match(js, /className: 'det-line'/); assert.match(js, /rows\.push\(\{ label: 'Workshops übernommen', chips: a\.workshops \}\)/);
  assert.match(js, /label: 'Vereinsgründung', chips: \[/); assert.match(js, /label: 'Wöchentliches Treffen', chips: \[/); assert.ok(!js.includes('setAutoHint'), 'keine Hinweise mehr in den Zeilen');
  assert.match(css, /\.ws-detected \.det-line \{ margin-top: 1\.1rem;/);
});

test('29: Entscheider-Knöpfe am Desktop breit (min-width) mit klarem Abstand (gap)', () => {
  assert.match(read('admin/spaces.css'), /@media \(min-width: 768px\) \{\s*\.sp-actions \{ gap: 1\.75rem; \}\s*\.sp-actions button \{ min-width: 12\.5rem;/);
});
