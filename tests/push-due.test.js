// tests/push-due.test.js — Push-Meldungen: Auswahl (3 Std. vorher, einmal pro Tag, Ruhezeit), Texte, Versandlauf mit Attrappe
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { dueSpaces, markSent, buildPayload, localParts, weeklyStartMinutes, tzForCountry, LEAD_MINUTES } from '../tools/lib/push-due.js';
import { run } from '../tools/send-push.js';

// 2026-07-01 ist ein Mittwoch (weekday 3); Sommerzeit: Berlin = UTC+2
const at = (hhmmBerlin, day = '2026-07-01') => new Date(`${day}T${hhmmBerlin}:00+02:00`);
const spaces = new Map([
  [1, { ID: 1, name: 'Abendlab', loc: { country: 'Germany' }, weekly: { weekday: 3, time: 1900 } }],
  [2, { ID: 2, name: 'Frühlab', loc: { country: 'Germany' }, weekly: { weekday: 3, time: 730 } }],
  [3, { ID: 3, name: 'Kyiv Hub', loc: { country: 'Ukraine' }, weekly: { weekday: 3, time: 1900 } }],
  [4, { ID: 4, name: 'Ohne Termin', loc: { country: 'Germany' } }],
  [5, { ID: 5, name: 'Platzhalter', loc: { country: 'Germany' }, weekly: { weekday: 9, time: 1900 } }],
  [6, { ID: 6, name: 'Altformat', loc: { country: 'Germany' }, weekly: { weekday: 3, time: 19 } }],
]);

test('weeklyStartMinutes: HHMM, Altformat „19“, ungültig → null', () => {
  assert.equal(weeklyStartMinutes(1900), 1140);
  assert.equal(weeklyStartMinutes(1330), 810);
  assert.equal(weeklyStartMinutes(19), 1140);
  assert.equal(weeklyStartMinutes(0), null);
  assert.equal(weeklyStartMinutes(2575), null);
  assert.equal(weeklyStartMinutes(undefined), null);
});

test('localParts: Ortszeit je Zeitzone (Datum, Wochentag, Minuten); Ukraine +1 h gegenüber Berlin', () => {
  const now = at('16:00');
  assert.deepEqual(localParts(now, 'Europe/Berlin'), { date: '2026-07-01', weekday: 3, minutes: 960 });
  assert.equal(localParts(now, 'Europe/Kyiv').minutes, 1020);
  assert.equal(tzForCountry('Ukraine'), 'Europe/Kyiv');
  assert.equal(tzForCountry('Germany'), 'Europe/Berlin');
});

test('dueSpaces: genau im Fenster der letzten 3 Std. vor Beginn', () => {
  assert.equal(LEAD_MINUTES, 180);
  assert.deepEqual(dueSpaces([1], spaces, {}, at('15:59')), [], 'noch > 3 Std. hin');
  assert.equal(dueSpaces([1], spaces, {}, at('16:00'))[0].inMinutes, 180, 'Grenze: genau 3 Std.');
  assert.equal(dueSpaces([1], spaces, {}, at('18:45'))[0].inMinutes, 15);
  assert.equal(dueSpaces([1], spaces, {}, at('19:00'))[0].inMinutes, 0, 'Beginn jetzt');
  assert.deepEqual(dueSpaces([1], spaces, {}, at('19:01')), [], 'schon begonnen');
});

test('dueSpaces: anderer Wochentag, kein Termin, Platzhalter 9, unbekannte ID → nichts; Altformat „19“ zählt', () => {
  assert.deepEqual(dueSpaces([1], spaces, {}, at('17:00', '2026-07-02')), []);
  assert.deepEqual(dueSpaces([4, 5, 99], spaces, {}, at('17:00')), []);
  assert.equal(dueSpaces([6], spaces, {}, at('17:00'))[0].id, 6);
});

test('dueSpaces: Zeitzone des Space — Kyiv-Termin 19:00 Ortszeit = 18:00 Berlin; 16:00 Berlin → noch 2 Std.', () => {
  const d = dueSpaces([3], spaces, {}, at('16:00'));
  assert.equal(d[0].inMinutes, 120);
});

test('dueSpaces: Ruhezeit — nichts vor 07:00 und ab 22:00; Termin 07:30 wird ab 07:00 gemeldet', () => {
  assert.deepEqual(dueSpaces([2], spaces, {}, at('04:30')), [], 'Termin 07:30, 3 Std. vorher = 04:30: Ruhezeit');
  assert.deepEqual(dueSpaces([2], spaces, {}, at('06:59')), []);
  assert.equal(dueSpaces([2], spaces, {}, at('07:00'))[0].inMinutes, 30);
});

test('dueSpaces: einmal pro Space und Tag (sent), anderer Tag zählt neu; Ergebnis nach Nähe sortiert', () => {
  const now = at('17:30');
  assert.deepEqual(dueSpaces([1], spaces, { 1: '2026-07-01' }, now), []);
  assert.equal(dueSpaces([1], spaces, { 1: '2026-06-24' }, now).length, 1);
  const two = dueSpaces([1, 6], spaces, {}, at('17:00'));
  assert.equal(two.length, 2);
  assert.ok(two[0].inMinutes <= two[1].inMinutes);
});

test('markSent: schreibt heutige Meldungen, entfernt alte Tage', () => {
  const next = markSent({ 7: '2026-06-24', 8: '2026-07-01' }, [{ id: 1, date: '2026-07-01' }], new Set(['2026-07-01']));
  assert.deepEqual(next, { 8: '2026-07-01', 1: '2026-07-01' });
});

test('buildPayload: „Mittwochs 19:00 Uhr, also heute hat <Space> sein Wochenmeeting.⏎Kommst Du auch?“ — je Sprache, Fallback en', () => {
  const due = { id: 1, name: 'Abendlab', weekday: 3, startMinutes: 1140, inMinutes: 120, date: 'x' };
  assert.deepEqual(buildPayload(due, 'de'), { title: 'makerspac.es', body: 'Mittwochs 19:00 Uhr, also heute hat Abendlab sein Wochenmeeting.\nKommst Du auch?', tag: 'space-1', url: '/#/1' });
  assert.equal(buildPayload(due, 'en').body, 'Wednesdays at 19:00, so today, Abendlab has its weekly meeting.\nAre you coming too?');
  assert.equal(buildPayload(due, 'xx').body, buildPayload(due, 'en').body);
  assert.equal(buildPayload({ ...due, weekday: 0, startMinutes: 485 }, 'de').body, 'Sonntags 08:05 Uhr, also heute hat Abendlab sein Wochenmeeting.\nKommst Du auch?');
  for (const l of ['fr', 'it', 'nl', 'da', 'uk']) {
    const b = buildPayload(due, l).body;
    assert.ok(b.includes('19:00') && b.includes('Abendlab') && b.includes('\n'), `${l}: Uhrzeit, Name, Zeilenumbruch vor der Frage`);
  }
  assert.ok(buildPayload(due, 'uk').body.startsWith('Щосереди'));
  assert.ok(buildPayload(due, 'fr').body.startsWith('Le mercredi'));
});

test('buildPayload: jeder der 7 Wochentage hat in jeder Sprache einen eigenen Text', () => {
  for (const l of ['de', 'en', 'fr', 'it', 'nl', 'da', 'uk']) {
    const bodies = new Set([0, 1, 2, 3, 4, 5, 6].map(weekday => buildPayload({ id: 1, name: 'X', weekday, startMinutes: 60, inMinutes: 5, date: 'd' }, l).body));
    assert.equal(bodies.size, 7, l);
  }
});

test('send-push run(): sendet fällige Meldungen, schreibt .sent.json + changed.txt, meldet 410 in gone.txt, sendet nicht doppelt', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'push-'));
  const spacesFile = join(dir, 'spaces.json');
  writeFileSync(spacesFile, JSON.stringify([...spaces.values()]));
  const sub = (endpoint, favorites) => JSON.stringify({ endpoint, keys: { p256dh: 'p', auth: 'a' }, favorites, lang: 'de' });
  writeFileSync(join(dir, 'aaa.json'), sub('https://fcm.googleapis.com/ok', [1]));
  writeFileSync(join(dir, 'bbb.json'), sub('https://fcm.googleapis.com/gone', [1]));
  writeFileSync(join(dir, 'ccc.json'), sub('https://fcm.googleapis.com/leer', [4]));
  const calls = [];
  const webpush = { sendNotification: async (s, body) => { calls.push([s.endpoint, JSON.parse(body)]); if (s.endpoint.endsWith('/gone')) throw Object.assign(new Error('x'), { statusCode: 410 }); } };
  const now = at('17:00');
  const r = await run({ dir, spacesFile, webpush, now });
  assert.deepEqual(r, { sent: 1, changed: 1, gone: 1 });
  assert.equal(calls.length, 2);
  assert.match(calls[0][1].body, /Abendlab/);
  assert.equal(readFileSync(join(dir, 'changed.txt'), 'utf8'), 'aaa.sent.json\n');
  assert.equal(readFileSync(join(dir, 'gone.txt'), 'utf8'), 'bbb\n');
  assert.deepEqual(JSON.parse(readFileSync(join(dir, 'aaa.sent.json'), 'utf8')), { 1: '2026-07-01' });
  assert.ok(!existsSync(join(dir, 'ccc.sent.json')));
  const r2 = await run({ dir, spacesFile, webpush: { sendNotification: async () => { throw new Error('darf nicht gesendet werden'); } }, now: at('17:15') });
  assert.equal(r2.sent, 0, 'zweiter Lauf: aaa ist schon gemeldet; Fehler anderer Abos (bbb) zählen nicht als gesendet');
});
