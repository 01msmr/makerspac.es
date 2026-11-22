// tests/admin-lib.test.js — pure Logik der Admin-Review-Seite
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseIssue, replaceEndpoint, buildComparison, distanceMeters } from '../admin/admin-lib.js';
import { parseIssue as applyParse } from '../tools/apply-spaceapi-issues.js';

const body = ep => `**ID:** 37\n\n\`\`\`json\n{"spaceapi":{"endpoint":"${ep}"}}\n\`\`\`\n`;
const issue = (ep, labels = []) => ({ number: 478, title: 'SpaceAPI: Hackspace', body: body(ep), labels: labels.map(name => ({ name })) });

test('parseIssue: wie Apply-Skript, plus ok-Flag', () => {
  const p = parseIssue(issue('https://a.de/', ['data-update', 'ok']));
  assert.equal(p.spaceId, 37); assert.equal(p.endpoint, 'https://a.de/'); assert.equal(p.ok, true);
  assert.equal(applyParse(issue('https://a.de/')).endpoint, p.endpoint);
});

test('parseIssue: fremde Titel, PRs, kaputter Body → null', () => {
  assert.equal(parseIssue({ ...issue('https://a.de'), title: 'Kalenderlink: x' }), null);
  assert.equal(parseIssue({ ...issue('https://a.de'), pull_request: {} }), null);
  assert.equal(parseIssue({ ...issue('https://a.de'), body: 'nix' }), null);
});

test('replaceEndpoint: Roundtrip bleibt für parseIssue lesbar', () => {
  const nb = replaceEndpoint(body('https://alt.de'), 'https://neu.de/status');
  assert.equal(parseIssue({ ...issue('x'), body: nb }).endpoint, 'https://neu.de/status');
  assert.equal(applyParse({ ...issue('x'), body: nb }).endpoint, 'https://neu.de/status');
  assert.match(nb, /\*\*ID:\*\* 37/);
});

test('replaceEndpoint: ungültige URL / kein Block → null', () => {
  assert.equal(replaceEndpoint(body('https://a.de'), 'javascript:alert(1)'), null);
  assert.equal(replaceEndpoint('kein block', 'https://a.de'), null);
});

test('buildComparison markiert Abweichungen', () => {
  const loc = { name: 'Hackspace', link: { url: 'https://hack-hro.de' }, loc: { lat: 54.0, long: 12.0, city: 'Rostock' } };
  const data = { space: 'Hackspace', url: 'https://www.hack-hro.de/', location: { lat: 54.0, lon: 12.0 }, state: { lastchange: 0 } };
  const rows = Object.fromEntries(buildComparison(loc, undefined, data, 'https://e.de').map(r => [r.label, r]));
  assert.equal(rows.Name.differs, false);
  assert.equal(rows.Website.differs, false);
  assert.equal(rows.Koordinaten.differs, false);
  assert.equal(rows.Endpoint.differs, true);
  const far = buildComparison(loc, undefined, { ...data, location: { lat: 55, lon: 12 } }, 'x')[3];
  assert.equal(far.differs, true);
});

test('buildComparison ohne Live-Daten wirft nicht', () => {
  assert.equal(buildComparison(undefined, undefined, null, 'https://e.de').length, 6);
});

test('distanceMeters ~111 km pro Breitengrad', () => {
  assert.ok(Math.abs(distanceMeters(0, 0, 1, 0) - 111195) < 200);
});

import { autoApplyDelay, AUTO_APPLY_COUNT, AUTO_APPLY_IDLE_MS } from '../admin/admin-lib.js';

test('autoApplyDelay: nichts zu tun → null', () => {
  assert.equal(autoApplyDelay(0, 0, 1000), null);
});

test('autoApplyDelay: ab 10 ok-Vorschlägen sofort', () => {
  assert.equal(autoApplyDelay(AUTO_APPLY_COUNT, 5000, 5000), 0);
  assert.equal(autoApplyDelay(AUTO_APPLY_COUNT + 3, 5000, 5000), 0);
});

test('autoApplyDelay: sonst 1 h nach dem letzten ok-Vorschlag', () => {
  assert.equal(autoApplyDelay(3, 1000, 1000), AUTO_APPLY_IDLE_MS);
  assert.equal(autoApplyDelay(3, 1000, 1000 + 600000), AUTO_APPLY_IDLE_MS - 600000);
  assert.equal(autoApplyDelay(3, 1000, 1000 + AUTO_APPLY_IDLE_MS + 5), 0);
});

import { parseWorkshopIssue, parseWorkshopList, replaceWorkshops, buildWorkshopComparison } from '../admin/admin-lib.js';
import { parseIssue as parseWorkshopForApply, isApproved } from '../tools/apply-workshop-issues.js';

const WBODY = (ws, checked = ' ') => `## Workshop-Daten für: X\n\n**ID:** 122\n**Website:** https://x.de\n\n### Gefundene Workshop-Typen\n\n| Typ | Keywords | Confidence | Quelle(n) |\n|-----|----------|------------|----------|\n| \`3d\` | 3d-druck | **high** | homepage |\n\n### Evidenz\n\n**3d:** "…Drucker…"\n\n### Vorgeschlagene Änderung in locations.json\n\n\`\`\`json\n"workshops": ${JSON.stringify(ws)}\n\`\`\`\n\n- [${checked}] Freigegeben zur Integration\n`;
const wissue = (ws, labels = [], checked) => ({ number: 380, title: '[Workshop-Daten] X (#122)', body: WBODY(ws, checked), labels: labels.map(name => ({ name })) });

test('parseWorkshopIssue: ID, Typen, Website, Tabelle, Evidenz', () => {
  const p = parseWorkshopIssue(wissue(['3d', 'laser']));
  assert.equal(p.spaceId, 122); assert.deepEqual(p.workshops, ['3d', 'laser']);
  assert.equal(p.website, 'https://x.de'); assert.equal(p.ok, false);
  assert.deepEqual(p.rows[0], { type: '3d', keywords: '3d-druck', confidence: 'high', sources: 'homepage' });
  assert.match(p.evidence, /Drucker/);
});

test('parseWorkshopIssue: ok per Label oder Checkbox; fremde Titel/leer → null', () => {
  assert.equal(parseWorkshopIssue(wissue(['3d'], ['ok'])).ok, true);
  assert.equal(parseWorkshopIssue(wissue(['3d'], [], 'x')).ok, true);
  assert.equal(parseWorkshopIssue({ ...wissue(['3d']), title: 'SpaceAPI: x' }), null);
  assert.equal(parseWorkshopIssue(wissue([])), null);
});

test('parseWorkshopList: gültige Typen, Duplikate raus, Unbekannte gemeldet', () => {
  assert.deepEqual(parseWorkshopList('3D, laser;wood  3d'), { list: ['3d', 'laser', 'wood'], invalid: [] });
  assert.deepEqual(parseWorkshopList('3d, foo').invalid, ['foo']);
});

test('replaceWorkshops: Roundtrip lesbar für Admin- und Apply-Parser', () => {
  const nb = replaceWorkshops(WBODY(['3d']), ['wood', 'metal']);
  assert.deepEqual(parseWorkshopIssue({ ...wissue(['3d']), body: nb }).workshops, ['wood', 'metal']);
  assert.deepEqual(parseWorkshopForApply({ ...wissue(['3d'], ['ok']), body: nb }).workshops, ['wood', 'metal']);
  assert.equal(replaceWorkshops(WBODY(['3d']), []), null);
  assert.equal(replaceWorkshops(WBODY(['3d']), ['quatsch']), null);
});

test('Apply-Skript: Label ok gilt als freigegeben, sonst nur Checkbox', () => {
  assert.equal(isApproved(wissue(['3d'], ['ok'])), true);
  assert.equal(isApproved(wissue(['3d'], [], 'x')), true);
  assert.equal(isApproved(wissue(['3d'])), false);
  assert.equal(parseWorkshopForApply(wissue(['3d'])), null);
});

test('buildWorkshopComparison markiert Abweichung', () => {
  const rows = buildWorkshopComparison({ name: 'X' }, ['3d'], ['3d', 'laser']);
  assert.equal(rows.find(r => r.label === 'Workshops').differs, true);
  assert.equal(buildWorkshopComparison({ name: 'X' }, ['laser', '3d'], ['3d', 'laser']).find(r => r.label === 'Workshops').differs, false);
});

import { detectFromText } from '../admin/admin-lib.js';
import { detectTypes, WORKSHOP_KEYWORDS } from '../workshop-keywords.js';
import { WORKSHOP_TYPES } from '../workshop-types.js';

test('detectFromText: Kürzel und Stichwörter, Reihenfolge wie WORKSHOP_TYPES', () => {
  assert.deepEqual(detectFromText('Wir haben einen Lasercutter und eine Nähmaschine'), ['laser', 'textile']);
  assert.deepEqual(detectFromText('wood, 3d'), ['3d', 'wood']);
  assert.deepEqual(detectFromText('Lötstation + Tonstudio, cnc'), ['cnc', 'electronics', 'music']);
  assert.deepEqual(detectFromText('nichts Passendes hier'), []);
});

test('workshop-keywords: jeder Typ aus workshop-types.js hat Stichwörter', () => {
  for (const t of Object.keys(WORKSHOP_TYPES)) assert.ok(WORKSHOP_KEYWORDS[t]?.length, `Stichwörter für ${t}`);
  assert.deepEqual(detectTypes('SIEBDRUCK'), ['screenprint']);
});

import { looksLikeUrl, buildScanComment, parseScanComment } from '../admin/admin-lib.js';
import { summarize } from '../tools/scan-workshop-url.js';

test('looksLikeUrl: nur einzelne http(s)-URL', () => {
  assert.equal(looksLikeUrl(' https://a.de/x '), true);
  assert.equal(looksLikeUrl('http://a.de'), true);
  assert.equal(looksLikeUrl('Lasercutter bei https://a.de'), false);
  assert.equal(looksLikeUrl('javascript:alert(1)'), false);
});

test('Scan-Kommentar: Roundtrip, fremde scanId → null, unbekannte Typen gefiltert', () => {
  const body = buildScanComment('ab12cd34', 'https://a.de', { types: ['laser', 'quatsch', 'wood'], evidence: { laser: { matches: ['lasercutter'], sources: ['homepage'] } }, pages: 3 });
  assert.deepEqual(parseScanComment(body, 'ab12cd34'), { types: ['laser', 'wood'], evidence: { laser: { matches: ['lasercutter'], sources: ['homepage'] } }, pages: 3 });
  assert.equal(parseScanComment(body, 'ffff0000'), null);
  assert.deepEqual(parseScanComment(buildScanComment('ab12cd34', 'https://a.de', { error: 'HTTP 404' }), 'ab12cd34'), { error: 'HTTP 404' });
});

test('summarize: Reihenfolge wie WORKSHOP_TYPES, Fehler durchgereicht', () => {
  const det = { wood: { matches: ['holzwerkstatt'], sources: ['homepage'] }, '3d': { matches: ['3d-druck'], sources: ['/raum'] } };
  assert.deepEqual(summarize({ detections: det, pagesChecked: 2 }).types, ['3d', 'wood']);
  assert.deepEqual(summarize({ error: 'HTTP 500' }), { error: 'HTTP 500' });
});

import { parseCalendarIssue, replaceEvents, buildCalendarComparison, classifyItem, groupInbox } from '../admin/admin-lib.js';

const CBODY = (url, conf = 'high') => `## Kalenderlink-Vorschlag: X\n\n**ID:** 235\n**Website:** https://x.de\n\n| URL | Confidence | Grund |\n|-----|------------|-------|\n| ${url} | ${conf} | Allgemeine Seite |\n\n### Vorgeschlagener Wert\n\`\`\`json\n{\n  "events": "${url}"\n}\n\`\`\`\n`;
const cissue = (url, labels = []) => ({ number: 235, title: 'Kalenderlink: X', body: CBODY(url), labels: labels.map(name => ({ name })), html_url: 'https://github.com/o/r/issues/235' });

test('parseCalendarIssue: ID, events-URL, Confidence, ok-Label', () => {
  const p = parseCalendarIssue(cissue('https://x.de/events/', ['data-update', 'ok']));
  assert.equal(p.spaceId, 235); assert.equal(p.events, 'https://x.de/events/'); assert.equal(p.confidence, 'high'); assert.equal(p.ok, true);
  assert.equal(parseCalendarIssue({ ...cissue('https://x.de'), body: '**ID:** 1\nkein Block' }), null);
  assert.equal(parseCalendarIssue({ ...cissue('https://x.de'), title: 'SpaceAPI: x' }), null);
});

test('replaceEvents: Roundtrip, ungültige URL → null', () => {
  const nb = replaceEvents(CBODY('https://alt.de'), 'https://neu.de/kalender');
  assert.equal(parseCalendarIssue({ ...cissue('x'), body: nb }).events, 'https://neu.de/kalender');
  assert.equal(replaceEvents(CBODY('https://alt.de'), 'javascript:alert(1)'), null);
  assert.equal(replaceEvents(CBODY('https://alt.de'), 'https://a.de/"x'), null);
});

test('buildCalendarComparison: Abweichung + niedrige Confidence markiert', () => {
  const rows = Object.fromEntries(buildCalendarComparison({ name: 'X' }, undefined, 'https://x.de/e', 'low').map(r => [r.label, r]));
  assert.equal(rows.Kalender.differs, true); assert.equal(rows.Confidence.differs, true);
});

test('classifyItem/groupInbox: eigene Reiter ausgenommen, Rest nach Art', () => {
  const gh = (o) => ({ number: 1, html_url: 'https://github.com/o/r/issues/1', labels: [], ...o });
  assert.equal(classifyItem(gh({ title: 'SpaceAPI: X' })), null);
  assert.equal(classifyItem(gh({ title: '[Workshop-Daten] X' })), null);
  assert.equal(classifyItem(cissue('https://x.de')), null);
  assert.equal(classifyItem(gh({ title: 'Kalenderlink: X', body: '**ID:** 1\nkein Fund' })), 'calendar0');
  assert.equal(classifyItem(gh({ title: 'Datenvorschlag: X' })), 'data');
  assert.equal(classifyItem(gh({ title: 'Neuer Space', labels: [{ name: 'add-space' }] })), 'add');
  assert.equal(classifyItem(gh({ title: 'Änderung', labels: [{ name: 'update-space' }] })), 'update');
  assert.equal(classifyItem(gh({ title: 'PR', pull_request: {} })), 'pr');
  assert.equal(classifyItem(gh({ title: 'Irgendwas' })), 'other');
  const g = groupInbox([gh({ title: 'PR', pull_request: {} }), gh({ title: 'x', html_url: 'https://evil.example/x' }), gh({ title: 'SpaceAPI: y' })]);
  assert.deepEqual(Object.keys(g), ['pr']); // fremde Links und eigene Reiter fallen raus
});

import { detectTypesLoose } from '../workshop-keywords.js';
import { readFileSync } from 'node:fs';

test('detectFromText: Überschriften-Text (Hobbyhimmel-Stil) wird erkannt', () => {
  const text = 'Werkbereichen: [HOLZ](https://x.de/holz) • [METALL](https://x.de/metall) • ELEKTRONIK• [FABLAB](https://x.de/fablab) • [KREATIV](https://x.de/kreativ) • FAHRRAD';
  assert.deepEqual(detectFromText(text), ['electronics', 'wood', 'metal', 'bike']); // FABLAB allein leitet nichts ab
  assert.deepEqual(detectFromText('FABLAB'), []);
});

test('lockere Stichwörter gelten nicht für den Crawler (detectTypes bleibt streng)', () => {
  assert.deepEqual(detectTypes('HOLZ • METALL'), []);
  assert.deepEqual(detectTypesLoose('HOLZ • METALL'), ['wood', 'metal']);
  assert.deepEqual(detectTypesLoose('nichts Passendes'), []);
});

test('detectFromText: CCC-Mannheim-Liste (RepRap, Carvera, ESP8266, WS2812 …)', () => {
  const text = '* [CNC-Fräse](https://x.de/CNC-Fr%C3%A4se)\n* [RepRap](https://x.de/RepRap)\n* [Fräse - Carvera Air (Makera)](https://x.de/Carvera)\n* [Raumuhr basierend auf ESP8266 und WS2812](https://x.de/ws2812-clock)\n* [LED-Strip](https://x.de/LED-Strip)\n* [Platinenfräse](https://x.de/Platinenfr%C3%A4se)';
  assert.deepEqual(detectFromText(text), ['3d', 'cnc', 'electronics', 'metal']);
});

test('RepRap ist streng erkannt (auch für den Crawler), Carvera/ESP8266 nur locker', () => {
  assert.deepEqual(detectTypes('RepRap'), ['3d']);
  assert.deepEqual(detectTypes('Carvera ESP8266'), []);
  assert.deepEqual(detectTypesLoose('Carvera ESP8266'), ['electronics', 'metal', 'cnc']);
});

test('detectFromText: "Code"-Liste (Jabberoid, Time Machine for Android …) → coding; ganzes Wort, kein Teilstring', () => {
  const text = '"Code"\n\n* [Jabberoid](https://x.de/wiki/Jabberoid)\n* [Time_Machine_for_Android](https://x.de/wiki/Time_Machine_for_Android)\n* [Facepalm](https://x.de/wiki/Facepalm)';
  assert.deepEqual(detectFromText(text), ['coding']);
  assert.deepEqual(detectFromText('Unicode und Barcode-Leser'), []); // Teilstring ≠ Wort
  assert.deepEqual(detectFromText('QR-Code lesen'), ['coding']);       // Wort mit Bindestrich zählt (locker, bitte prüfen)
});

import { failedRuns, stuckOk, problemReason, PROBLEM_LABEL } from '../admin/admin-lib.js';

const NOW = Date.parse('2026-11-22T14:00:00Z');
const run = (o) => ({ status: 'completed', event: 'workflow_dispatch', head_branch: 'main', display_title: 't', html_url: 'https://github.com/o/r/actions/runs/1', created_at: '2026-11-22T12:00:00Z', path: '.github/workflows/a.yml', name: 'A', conclusion: 'success', ...o });

test('failedRuns: nur der neueste Lauf je Workflow zählt, späterer grüner Lauf löst auf', () => {
  const runs = [
    run({ name: 'Apply', path: 'apply.yml', conclusion: 'failure', created_at: '2026-11-22T10:00:00Z' }),
    run({ name: 'Apply', path: 'apply.yml', conclusion: 'success', created_at: '2026-11-22T11:00:00Z' }),   // gelöst
    run({ name: 'Deploy', path: 'deploy.yml', conclusion: 'failure', created_at: '2026-11-22T12:00:00Z' }), // offen
    run({ name: 'Scan', path: 'scan.yml', conclusion: 'failure', created_at: '2026-11-20T12:00:00Z' }),     // zu alt
    run({ name: 'Run', path: 'run.yml', status: 'in_progress', conclusion: null }),                          // läuft noch
  ];
  assert.deepEqual(failedRuns(runs, NOW).map(r => r.name), ['Deploy']);
});

test('failedRuns: Bot-PR-Check (bekanntes Rauschen) wird ausgeblendet, normale PR-Checks nicht', () => {
  const runs = [
    run({ name: 'Validate', path: 'v.yml', event: 'pull_request', head_branch: 'update-space-id-133', conclusion: 'failure' }),
    run({ name: 'Validate2', path: 'v2.yml', event: 'pull_request', head_branch: 'feat/x', conclusion: 'failure' }),
  ];
  assert.deepEqual(failedRuns(runs, NOW).map(r => r.name), ['Validate2']);
});

test('stuckOk: ok-Label, offen, älter als 2 h; keine PRs, keine frischen', () => {
  const issue = (n, labels, updated, extra = {}) => ({ number: n, title: 'T' + n, html_url: 'https://github.com/o/r/issues/' + n, labels: labels.map(name => ({ name })), updated_at: updated, ...extra });
  const items = [
    issue(1, ['ok'], '2026-11-22T10:00:00Z'),            // 4 h → hängt
    issue(2, ['ok'], '2026-11-22T13:30:00Z'),            // frisch
    issue(3, ['data-update'], '2026-11-22T09:00:00Z'),   // kein ok
    issue(4, ['ok'], '2026-11-22T09:00:00Z', { pull_request: {} }),
  ];
  assert.deepEqual(stuckOk(items, NOW).map(s => [s.number, s.hours]), [[1, 4]]);
});

test('problemReason: letzter Bot-Kommentar mit bekanntem Anfang; Menschen-Kommentare zählen nicht', () => {
  const c = (body, login, type = 'User') => ({ body, user: { login, type } });
  const comments = [
    c('Endpoint nicht erreichbar / kein gueltiges SpaceAPI-JSON (HTTP 404).', 'github-actions[bot]', 'Bot'),
    c('Nicht übernommen — die Daten wären ungültig:\n\n- ID 5: "events" ist keine gültige http(s)-URL', 'github-actions[bot]', 'Bot'),
    c('Nicht übernommen — ich bin ein Mensch', '01msmr'),
  ];
  assert.match(problemReason(comments), /ID 5/);
  assert.equal(problemReason([c('hallo', 'github-actions[bot]', 'Bot')]), '');
  assert.equal(problemReason(undefined), '');
});

test('Parser setzen das problem-Flag aus dem Label', () => {
  const body = '**ID:** 7\n\n```json\n{"spaceapi":{"endpoint":"https://x.de/s"}}\n```';
  const base = { number: 1, title: 'SpaceAPI: X', body };
  assert.equal(parseIssue({ ...base, labels: [{ name: PROBLEM_LABEL }] }).problem, true);
  assert.equal(parseIssue({ ...base, labels: [] }).problem, false);
});

test('replaceWorkshops: Modus „ersetzen“ — leere Liste (entfernen) nur mit Modus, Marker idempotent und rücknehmbar', () => {
  const body = WBODY(['3d']);
  assert.equal(replaceWorkshops(body, []), null);                      // leer ohne Modus: ungültig
  const rm = replaceWorkshops(body, [], true);
  assert.match(rm, /\*\*ID:\*\* 122\n\*\*Modus:\*\* ersetzen/);
  assert.match(rm, /"workshops": \[\]/);
  const p = parseWorkshopIssue({ ...wissue(['3d']), body: rm });
  assert.deepEqual(p.workshops, []); assert.equal(p.replace, true);   // Admin liest „entfernen“ wieder ein
  assert.equal(replaceWorkshops(rm, ['wood'], true).match(/Modus/g).length, 1);          // kein Doppel-Marker
  assert.doesNotMatch(replaceWorkshops(rm, ['wood'], false), /Modus/);                   // zurück auf „nur Lücken füllen“
  assert.equal(parseWorkshopIssue({ ...wissue(['3d']), body: WBODY([]) }), null);        // leer ohne Modus bleibt ungültig
});

test('buildWorkshopComparison: Entfernen wird als solches angezeigt und gelb markiert', () => {
  const row = buildWorkshopComparison({ name: 'X' }, ['wood'], []).find(r => r.label === 'Workshops');
  assert.equal(row.proposed, '(entfernen)'); assert.equal(row.differs, true); assert.equal(row.warn, true);
});

test('Apply-Skript: Modus „ersetzen“ erlaubt leere Liste (entfernen), sonst nicht', () => {
  const body = WBODY([]);
  assert.equal(parseWorkshopForApply({ ...wissue([], ['ok']), body }), null);
  const rm = parseWorkshopForApply({ ...wissue([], ['ok']), body: replaceWorkshops(WBODY(['3d']), [], true) });
  assert.deepEqual([rm.workshops, rm.replace, rm.spaceId], [[], true, 122]);
  const rep = parseWorkshopForApply({ ...wissue(['3d'], ['ok']), body: replaceWorkshops(WBODY(['3d']), ['wood', 'metal'], true) });
  assert.deepEqual([rep.workshops, rep.replace], [['wood', 'metal'], true]);
  assert.equal(parseWorkshopForApply({ ...wissue(['3d'], ['ok']) }).replace, false); // normaler Vorschlag: Lücken füllen
});

import { mergeQueue } from '../admin/admin-lib.js';

test('mergeQueue: Geschlossenes fällt raus, Aktuelles bleibt vorn, „später“ kommt ans Ende', () => {
  const q = n => ({ number: n });
  const old = [q(1), q(2), q(3), q(4)];           // 1 erledigt, 2 übersprungen, 3 angezeigt, 4 offen
  const fresh = [q(2), q(3), q(4), q(5)];         // 1 ist weg (übernommen), 5 ist neu
  const r = mergeQueue(old, 2, fresh, 3);
  assert.deepEqual(r.queue.map(p => p.number), [3, 4, 5, 2]);
  assert.equal(r.gone, false);
});

test('mergeQueue: angezeigtes Issue inzwischen geschlossen → gone, Rest nachrücken', () => {
  const q = n => ({ number: n });
  const r = mergeQueue([q(10), q(11), q(12)], 0, [q(11), q(12)], 10);
  assert.deepEqual(r.queue.map(p => p.number), [11, 12]);
  assert.equal(r.gone, true);
  assert.equal(mergeQueue([], 0, [q(1)], null).gone, false);   // nichts angezeigt → nichts „weg“
});
