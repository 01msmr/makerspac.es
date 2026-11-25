import test from 'node:test';
import assert from 'node:assert/strict';
import { parseTime, extractWeeklyCandidates, pickWeekly, extractInit, weeklyDelta, deltaKey } from '../tools/lib/weekly-extract.js';
import { proposalFromIssue, decideProposal } from '../tools/lib/crawl-selection.js';

test('parseTime: Uhr/h/:mm/pm, keine nackten Zahlen', () => {
  assert.equal(parseTime('ab 19 Uhr'), 1900);
  assert.equal(parseTime('um 18:30'), 1830);
  assert.equal(parseTime('19.00 Uhr'), 1900);
  assert.equal(parseTime('7pm'), 1900);
  assert.equal(parseTime('12 am'), 0);
  assert.equal(parseTime('seit 2014 mit 12 Mitgliedern'), null);
  assert.equal(parseTime('25:00 Uhr'), null);
});

test('Weekly: „jeden Dienstag ab 19 Uhr“ → high, Sonntag=0, Kurzform nur mit Uhrzeit', () => {
  const t = 'Willkommen!\nOffener Abend: jeden Dienstag ab 19:00 Uhr.\nSo kommt ihr zu uns.';
  assert.deepEqual(pickWeekly(extractWeeklyCandidates(t)), { weekday: 2, time: 1900, confidence: 'high', source: 'Offener Abend: jeden Dienstag ab 19:00 Uhr.' });
  assert.equal(pickWeekly(extractWeeklyCandidates('Treffen: jeden Sonntag 11 Uhr')).weekday, 0);
  assert.equal(pickWeekly(extractWeeklyCandidates('Offenes Treffen Mi 18:30 Uhr')).weekday, 3);   // medium (ohne „jeden“)
  assert.equal(pickWeekly(extractWeeklyCandidates('Offenes Treffen Mi 18:30 Uhr')).confidence, 'medium');
  assert.equal(pickWeekly(extractWeeklyCandidates('Wir sind so offen für alles. Treffen sind nett.')), null);
  assert.equal(pickWeekly(extractWeeklyCandidates('Open night every Thursday at 7pm')).weekday, 4);
});

test('Weekly: mehrere verschiedene Termine → low, kein Vorschlag', () => {
  const r = pickWeekly(extractWeeklyCandidates('Offener Abend jeden Dienstag 19 Uhr\nStammtisch jeden Freitag 20 Uhr'));
  assert.equal(r.confidence, 'low');
  assert.deepEqual(weeklyDelta({}, { weekly: r }), {});
});

test('Gründung: gegründet/Gründung = high (Jahr → YYYY0101, Monat → YYYYMM01, Datum), seit = medium', () => {
  assert.equal(extractInit('Der Verein wurde 2014 gegründet.', 2026).date, 20140101);        // Jahr vor dem Verb
  assert.equal(extractInit('Der Verein wurde im Juli 2014 gegründet.', 2026).date, 20140701);
  assert.deepEqual(extractInit('Gegründet im Juli 2014 in Hamburg', 2026).date, 20140701);
  assert.equal(extractInit('Gründung: 2016', 2026).date, 20160101);
  assert.equal(extractInit('gegründet am 25.06.2016', 2026).date, 20160625);
  assert.equal(extractInit('Founded in 2012', 2026).confidence, 'high');
  const since = extractInit('Seit 2019 in neuen Räumen', 2026);
  assert.deepEqual([since.date, since.confidence], [20190101, 'medium']);
  assert.equal(extractInit('gegründet 2099', 2026), null);                                    // Zukunft
});

test('weeklyDelta: nur Platzhalter füllen, außer force; nur high', () => {
  const found = { weekly: { weekday: 2, time: 1900, confidence: 'high' }, init: { date: 20140101, confidence: 'high' } };
  assert.deepEqual(weeklyDelta({ weekly: { weekday: 9, time: 0 }, dates: { 'space.init': 20010000 } }, found), { weekly: { weekday: 2, time: 1900 }, 'space.init': 20140101 });
  assert.deepEqual(weeklyDelta({ weekly: { weekday: 3, time: 1800 }, dates: { 'space.init': 20120101 } }, found), {});
  assert.deepEqual(weeklyDelta({ weekly: { weekday: 3, time: 1800 }, dates: { 'space.init': 20120101 } }, found, { force: true }), { weekly: { weekday: 2, time: 1900 }, 'space.init': 20140101 });
  assert.deepEqual(weeklyDelta({}, { weekly: { weekday: 2, time: 1900, confidence: 'medium' } }), {});
});

test('Entscheidung: Issue-Inhalt wird als deltaKey gelesen; gleicher Fund → skip, anderer → propose + ersetzt offenes', () => {
  const body = d => `**ID:** 5\n\`\`\`json\n${JSON.stringify(d)}\n\`\`\``;
  const d1 = { weekly: { weekday: 2, time: 1900 } };
  assert.equal(proposalFromIssue({ body: body(d1) }, 'weekly'), '2:1900|-');
  const issues = [{ number: 7, state: 'OPEN', createdAt: '2026-01-01', body: body(d1) }];
  assert.equal(decideProposal({ kind: 'weekly', found: deltaKey(d1), issues }).action, 'skip');
  const r = decideProposal({ kind: 'weekly', found: deltaKey({ weekly: { weekday: 3, time: 1900 } }), issues });
  assert.deepEqual([r.action, r.supersede], ['propose', [7]]);
});

import { crawlSpace, buildIssue } from '../tools/weekly-crawler.js';

test('crawlSpace + buildIssue: Seitentexte → Fund → Issue mit JSON-Block, den proposalFromIssue wieder liest', async () => {
  const pages = { 'https://x.de': 'Hallo!\nOffener Abend: jeden Dienstag ab 19 Uhr.', 'https://x.de/about': 'Der Verein wurde im Mai 2015 gegründet.' };
  const found = await crawlSpace('https://x.de', async u => pages[u.replace(/\/$/, '')] ?? null);
  assert.deepEqual([found.weekly.weekday, found.weekly.time, found.init.date], [2, 1900, 20150501]);
  const space = { ID: 5, name: 'X', link: { url: 'https://x.de' }, weekly: { weekday: 9, time: 0 }, dates: { 'space.init': 20010000 } };
  const delta = weeklyDelta(space, found);
  const { title, body } = buildIssue(space, found, delta);
  assert.equal(title, 'Treffen-Daten: X');
  assert.equal(proposalFromIssue({ body }, 'weekly'), deltaKey(delta));
  assert.match(body, /\*\*ID:\*\* 5/);
});

import { parseIssue as parseWeekly, validateWeekly } from '../tools/apply-weekly-issues.js';
import { stampLocationsFile } from '../tools/lib/edit-stamp.js';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';

test('Apply: parseIssue liest weekly + space.init; ungültige Werte werden abgelehnt (Sonntag=0 ist gültig)', () => {
  const mk = d => ({ number: 9, title: 'Treffen-Daten: X', body: `**ID:** 5\n\`\`\`json\n${JSON.stringify(d)}\n\`\`\`` });
  const p = parseWeekly(mk({ weekly: { weekday: 0, time: 1100 }, 'space.init': 20150501 }));
  assert.deepEqual(p, { issueNumber: 9, spaceId: 5, weekly: { weekday: 0, time: 1100 }, init: 20150501 });
  assert.deepEqual(validateWeekly(p, {}, new Set([5])), []);
  assert.equal(validateWeekly({ ...p, weekly: { weekday: 7, time: 1100 } }, {}, new Set([5])).length, 1);
  assert.equal(validateWeekly({ ...p, init: 2015 }, {}, new Set([5])).length, 1);
  assert.equal(parseWeekly({ ...mk({}), title: 'Andere' }), null);
  assert.equal(parseWeekly(mk({})), null);
});

test('stampLocationsFile mit inits: space.init + space.edited.latest in einem Schreibvorgang', () => {
  const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'wk-')), 'locations.json');
  fs.writeFileSync(f, JSON.stringify([{ ID: 5, dates: { 'space.init': 20010000, 'space.edited.latest': 20200101 } }, { ID: 6, dates: {} }], null, 2));
  stampLocationsFile(f, [5], 20261122, { inits: new Map([[5, 20150501]]) });
  const out = JSON.parse(fs.readFileSync(f, 'utf8'));
  assert.deepEqual(out[0].dates, { 'space.init': 20150501, 'space.edited.latest': 20261122 });
  assert.deepEqual(out[1].dates, {});
});

test('Reale Fehlfunde: monatlich / „jeden dritten“ / Endzeit / Teilgruppe werden nicht als Weekly vorgeschlagen', () => {
  const none = t => assert.equal(pickWeekly(extractWeeklyCandidates(t))?.confidence === 'high', false, t);
  none('Jeden dritten Donnerstag um 19 Uhr findet unser Monatstreffen statt.');
  none('Open Treffen jeden 2. Mittwoch im Monat 19 Uhr');
  none('Offenes Treffen alle zwei Wochen dienstags 19:00');
  none('now Sunday Electronics Workshop 035 weekly until 20:00');
  none('in der Regel jeden Samstag ab 14Uhr trifft sich im OTELO das BLITZGNEIßER-Node, ein Team aus elektronikinteressierten Menschen');
});

test('Gute Funde bleiben: Bereich „18 bis 22 Uhr“ → Beginn, „weekly open friday starting from 19h“', () => {
  assert.equal(pickWeekly(extractWeeklyCandidates('Jeden Dienstag, 18:00 bis 22:00 Uhr')).time, 1800);
  assert.equal(pickWeekly(extractWeeklyCandidates('Offener Abend jeden Dienstag 18 bis 22 Uhr')).time, 1800);
  assert.deepEqual(parseTime('bis 20:00'), null);
  const f = pickWeekly(extractWeeklyCandidates('Weekly open friday starting from 19h at:'));
  assert.deepEqual([f.weekday, f.time, f.confidence], [5, 1900, 'high']);
  assert.equal(pickWeekly(extractWeeklyCandidates('Jeden Mittwoch (ausgenommen Feiertage): Open Lab mit einer kostenlosen Führung um 19 Uhr')).time, 1900);
});

import { weeklyHint, initHint } from '../tools/weekly-crawler.js';

test('Log-Hinweis: sicherer Fund bei vorhandenem Wert = „vorhanden, nicht überschrieben“', () => {
  const have = { weekly: { weekday: 3, time: 1700 }, dates: { 'space.init': 20120101 } };
  assert.match(weeklyHint(have, { confidence: 'high' }), /nicht überschrieben/);
  assert.match(initHint(have, { confidence: 'high' }), /nicht überschrieben/);
  assert.equal(weeklyHint(have, { confidence: 'medium' }), 'Weekly medium');
  assert.equal(weeklyHint({ weekly: { weekday: 9, time: 0 } }, { confidence: 'low', reason: 'mehrere verschiedene Termine' }), 'Weekly low (mehrere verschiedene Termine)');
});

test('extractInit: erstes Treffen / erster offener Tag / Umzug ist keine Vereinsgründung', () => {
  assert.equal(extractInit('Der erste offene Makertag hat am 13.10.2018 stattgefunden.', 2026), null);
  assert.equal(extractInit('Nach der Gründung fand das erste Treffen am 5.3.2019 statt.', 2026), null);
  assert.equal(extractInit('Seit dem Umzug 2020 gegründet in neuen Räumen', 2026), null);
  assert.equal(extractInit('First meeting founded 2019', 2026), null);
  // Vereinsgründung bleibt erkannt, auch wenn ein anderer Satz ein erstes Treffen nennt
  assert.equal(extractInit('Der erste offene Makertag war am 13.10.2018.\nDer Verein wurde am 1.9.2018 gegründet.', 2026).date, 20180901);
  assert.equal(extractInit('Gründung des Vereins: 2017', 2026).date, 20170101);
});
