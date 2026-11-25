// tests/status-freshness.test.js — Alters-Regel für alle Status-Quellen (ADR-010): „offen“ nur < 24 h, „geschlossen“ bleibt
// Läuft mit: node --test tests/status-freshness.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PRESENCE_SENSORS, extractSignalTime, extractSensorTime, applyOpenAgeRule, signatureOf, updateMemory, applyMemoryRule, decideFreshness } from '../tools/lib/status-freshness.js';

const NOW = Date.parse('2026-11-25T12:00:00Z');
const H = 3600e3;
const api = (open, lastchangeMs) => JSON.stringify({ api_compatibility: ['14'], space: 'X', state: { open, ...(lastchangeMs !== undefined ? { lastchange: Math.floor(lastchangeMs / 1000) } : {}) } });

test('1: extractSignalTime — SpaceAPI lastchange (Sekunden/ms), ThingSpeak created_at; Unplausibles → null', () => {
  assert.equal(extractSignalTime(api(true, NOW - 5 * H), NOW), NOW - 5 * H);
  assert.equal(extractSignalTime(JSON.stringify({ state: { open: true, lastchange: (NOW - H) } }), NOW), NOW - H);   // ms
  assert.equal(extractSignalTime(JSON.stringify({ created_at: '2026-11-25T10:00:00Z', field1: '1' }), NOW), Date.parse('2026-11-25T10:00:00Z'));
  assert.equal(extractSignalTime(api(true), NOW), null);                                   // optionales Feld fehlt
  assert.equal(extractSignalTime(JSON.stringify({ state: { open: true, lastchange: 0 } }), NOW), null);   // 0 = kein Zeitpunkt
  assert.equal(extractSignalTime(api(true, NOW + 3 * 24 * H), NOW), null);                 // Zukunft
  assert.equal(extractSignalTime('1', NOW), null); assert.equal(extractSignalTime('kein json', NOW), null);
});

test('2: applyOpenAgeRule — nur offen und älter als 24 h → unbekannt; geschlossen nie', () => {
  assert.equal(applyOpenAgeRule(true, NOW - 23 * H, NOW).status, true);
  const old = applyOpenAgeRule(true, NOW - 25 * H, NOW);
  assert.equal(old.status, null); assert.match(old.reason, /25 h > 24 h/);
  assert.equal(applyOpenAgeRule(false, NOW - 500 * H, NOW).status, false);                 // lange geschlossen ist normal
  assert.equal(applyOpenAgeRule(null, NOW - 500 * H, NOW).status, null);
  assert.equal(applyOpenAgeRule(true, null, NOW).status, true);                             // ohne Zeitstempel hier nichts zu prüfen
});

test('3: Gedächtnis hält nur die letzten ZWEI Signaturen mit Erstsehen; unverändert → Erstsehen bleibt', () => {
  let e = updateMemory(undefined, 'a', NOW - 30 * H);
  assert.deepEqual(e, { last: { sig: 'a', seenAt: NOW - 30 * H }, prev: null });
  e = updateMemory(e, 'a', NOW - 10 * H);
  assert.equal(e.last.seenAt, NOW - 30 * H);                                                 // gleiche Signatur: Zeit bleibt
  e = updateMemory(e, 'b', NOW - 9 * H);
  assert.deepEqual(e, { last: { sig: 'b', seenAt: NOW - 9 * H }, prev: { sig: 'a', seenAt: NOW - 30 * H } });
  e = updateMemory(e, 'c', NOW - 1 * H);
  assert.deepEqual(Object.keys(e).sort(), ['last', 'prev']);
  assert.equal(e.prev.sig, 'b');                                                             // „a“ ist vergessen: nur letzte + vorletzte
});

test('4: decideFreshness — absoluter Zeitstempel: ohne Gedächtnis; kein Zeitstempel: Gedächtnis; geschlossen: nichts gemerkt', () => {
  const mem = {};
  // SpaceAPI mit lastchange: alt → unbekannt, kein Gedächtnis
  assert.equal(decideFreshness({ status: true, text: api(true, NOW - 30 * H) }, mem, 'u1', NOW).status, null);
  assert.deepEqual(mem, {});
  // SpaceAPI mit lastchange: frisch → offen
  assert.equal(decideFreshness({ status: true, text: api(true, NOW - 2 * H) }, mem, 'u1', NOW).status, true);
  // geschlossen bleibt, auch uralt, und es wird nichts gemerkt
  assert.equal(decideFreshness({ status: false, text: api(false, NOW - 900 * H) }, mem, 'u1', NOW).status, false);
  assert.deepEqual(mem, {});
  // offen ohne Zeitstempel: erster Lauf = offen (Erstsehen jetzt), nach 25 h unverändert = unbekannt, Änderung = wieder offen
  const body = '1';
  assert.equal(decideFreshness({ status: true, text: body }, mem, 'u2', NOW - 25 * H).status, true);
  assert.equal(decideFreshness({ status: true, text: body }, mem, 'u2', NOW).status, null);
  assert.match(decideFreshness({ status: true, text: body }, mem, 'u2', NOW).reason, /unverändert/);
  assert.equal(decideFreshness({ status: true, text: '1 ', lastModified: 'Wed, 25 Nov 2026 11:50:00 GMT' }, mem, 'u2', NOW).status, true);   // neue Signatur → wieder gültig
  assert.deepEqual(Object.keys(mem), ['u2']);
  // wird der Space geschlossen, verschwindet sein Gedächtnis
  decideFreshness({ status: false, text: '0' }, mem, 'u2', NOW);
  assert.deepEqual(mem, {});
});

test('5: signatureOf — Last-Modified bevorzugt, sonst Prüfsumme', () => {
  assert.equal(signatureOf('x', 'Wed, 1 Jan 2026'), 'lm:Wed, 1 Jan 2026');
  assert.match(signatureOf('abc'), /^body:[0-9a-f]{16}$/);
  assert.equal(signatureOf('abc'), signatureOf('abc')); assert.notEqual(signatureOf('abc'), signatureOf('abd'));
});

test('6: Gedächtnis ist NICHT öffentlich — nie in status.json, nie hochgeladen/committet; Cache im Workflow', () => {
  const fetchJs = readFileSync(new URL('../fetch-spaceapi-status.js', import.meta.url), 'utf8');
  const out = fetchJs.slice(fetchJs.indexOf('const output = {'), fetchJs.indexOf('// Gedächtnis fortschreiben'));
  assert.ok(!/MEMORY|seenAt|signal/i.test(out), 'status.json darf kein Gedächtnis/Zeitstempel enthalten');
  const wf = readFileSync(new URL('../.github/workflows/update-status.yml', import.meta.url), 'utf8');
  assert.match(wf, /actions\/cache\/restore@v4[\s\S]*?status-memory\.json/);
  assert.match(wf, /actions\/cache\/save@v4[\s\S]*?status-memory\.json/);
  assert.ok(!/-T status-memory|status-memory\.json"/.test(wf.split('FTP')[1] ?? ''), 'Gedächtnis wird nicht per FTP hochgeladen');
  assert.match(readFileSync(new URL('../.gitignore', import.meta.url), 'utf8'), /^status-memory\.json$/m);
});

const apiS = (stateMs, sensors) => JSON.stringify({ api_compatibility: ['14'], space: 'X', state: { open: true, ...(stateMs !== undefined ? { lastchange: Math.floor(stateMs / 1000) } : {}) }, sensors });

test('7: Sensor-Zeitstempel als Lebenszeichen — state.lastchange alt, Sensor < 24 h → „offen“ bleibt (rescuedBy: sensor)', () => {
  const sensors = { people_now_present: [{ value: 3, lastchange: Math.floor((NOW - 2 * H) / 1000) }], door_locked: [{ value: false, lastchange: Math.floor((NOW - 50 * H) / 1000) }], temperature: [{ value: 21, unit: '°C', lastchange: Math.floor((NOW - 1 * H) / 1000) }] };
  assert.equal(extractSensorTime(apiS(NOW - 90 * H, sensors), NOW), NOW - 2 * H);          // jüngster ANWESENHEITS-Sensor zählt (Temperatur nicht)
  const mem = {};
  const r = decideFreshness({ status: true, text: apiS(NOW - 90 * H, sensors) }, mem, 'k', NOW);
  assert.deepEqual(r, { status: true, rescuedBy: 'sensor' });
  assert.deepEqual(mem, {});                                                                  // ohne Gedächtnis
});

test('8: Sensor-Zeitstempel zählen nur, wenn eindeutig und frisch — sonst bleibt es bei unbekannt', () => {
  const mem = {};
  const oldSensors = { people_now_present: [{ value: 2, lastchange: Math.floor((NOW - 60 * H) / 1000) }] };
  assert.equal(decideFreshness({ status: true, text: apiS(NOW - 90 * H, oldSensors) }, mem, 'k', NOW).status, null);   // Sensor ebenfalls alt
  assert.equal(decideFreshness({ status: true, text: apiS(NOW - 90 * H, { people_now_present: [{ value: 1 }] }) }, mem, 'k', NOW).status, null);   // Sensor ohne Zeitstempel
  assert.equal(decideFreshness({ status: true, text: apiS(NOW - 90 * H, { people_now_present: [{ lastchange: 'gestern' }, { lastchange: 0 }, { lastchange: Math.floor((NOW + 5 * 24 * H) / 1000) }] }) }, mem, 'k', NOW).status, null);   // unplausibel
  assert.equal(extractSensorTime(apiS(NOW, undefined), NOW), null);
  assert.equal(extractSensorTime('1', NOW), null);
});

test('9: ohne state.lastchange: frischer Sensor genügt; alter Sensor allein → Gedächtnis-Pfad (kein Urteil nach Sensorzeit)', () => {
  const mem = {};
  const fresh = { door_locked: [{ value: true, lastchange: Math.floor((NOW - H) / 1000) }] };
  assert.deepEqual(decideFreshness({ status: true, text: apiS(undefined, fresh) }, mem, 'a', NOW), { status: true, rescuedBy: 'sensor' });
  const old = { people_now_present: [{ value: 1, lastchange: Math.floor((NOW - 80 * H) / 1000) }] };
  assert.equal(decideFreshness({ status: true, text: apiS(undefined, old) }, mem, 'b', NOW).status, true);      // erste Sicht → Gedächtnis angelegt
  assert.ok(mem.b);
});

test('10: Tooltip für unbekannten Status heißt „unknown“ (7 Sprachen), nie „wird geladen“', () => {
  const lang = JSON.parse(readFileSync(new URL('../lang.json', import.meta.url), 'utf8'));
  assert.equal(lang.tooltips.spaceStatusLoading, undefined);
  for (const l of ['de', 'en', 'fr', 'it', 'nl', 'da', 'uk']) {
    const txt = lang.tooltips.spaceUnknown[l];
    assert.ok(txt, `fehlt: ${l}`);
    assert.ok(!/laden|loading|charg|caricamento|geladen|indlæs|завантаж/i.test(txt), `${l}: ${txt}`);
  }
  for (const f of ['listing-core.js', 'popup-builder.js']) assert.ok(!readFileSync(new URL(`../${f}`, import.meta.url), 'utf8').includes('spaceStatusLoading'), f);
});

test('11: Temperatur & Co. sind KEIN Lebenszeichen für „offen“ (nur people_now_present / door_locked)', () => {
  const temp = { temperature: [{ value: 21, unit: '°C', lastchange: Math.floor((NOW - H) / 1000) }], humidity: [{ value: 40, unit: '%', lastchange: Math.floor((NOW - H) / 1000) }] };
  assert.equal(extractSensorTime(apiS(NOW - 90 * H, temp), NOW), null);
  assert.equal(decideFreshness({ status: true, text: apiS(NOW - 90 * H, temp) }, {}, 'k', NOW).status, null);   // alter Offen-Schalter, nur Temperatur lebt → unbekannt
  assert.deepEqual([...PRESENCE_SENSORS].sort(), ['door_locked', 'people_now_present']);
});
