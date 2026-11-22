// tests/crawl-selection.test.js — Crawler schlagen nur NEUERE Änderungen vor (Inhalt, nicht Existenz von Issues)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { issueSpaceId, normalizeUrl, sameWorkshops, proposalFromIssue, decideProposal, loadMergedLocations } from '../tools/lib/crawl-selection.js';

const wsIssue = (number, types, createdAt, state = 'CLOSED') => ({ number, state, createdAt, body: `**ID:** 1\n\n\`\`\`json\n"workshops": ${JSON.stringify(types)}\n\`\`\`\n` });
const evIssue = (number, url, createdAt, state = 'CLOSED') => ({ number, state, createdAt, body: `**ID:** 1\n\n${url ? `\`\`\`json\n{\n  "events": "${url}"\n}\n\`\`\`\n` : '### Kein eigener Kalender gefunden\n'}` });
const ws = (found, integrated, issues) => decideProposal({ kind: 'workshops', found, integrated, issues });
const ev = (found, integrated, issues) => decideProposal({ kind: 'events', found, integrated, issues });

test('issueSpaceId / normalizeUrl / sameWorkshops', () => {
  assert.equal(issueSpaceId({ title: 'x', body: '**ID:** 128' }), 128);
  assert.equal(issueSpaceId({ title: '[Workshop-Daten] R (#128)', body: '' }), 128);
  assert.equal(normalizeUrl('https://www.X.de/Kalender/#top'), normalizeUrl('http://x.de/kalender'));
  assert.equal(sameWorkshops(['laser', '3d'], ['3d', 'laser']), true);
  assert.equal(sameWorkshops(['3d'], ['3d', 'laser']), false);
});

test('proposalFromIssue: liest den vorgeschlagenen Inhalt (Workshops / Kalender / „kein Fund“)', () => {
  assert.deepEqual(proposalFromIssue(wsIssue(1, ['3d', 'metal'], '2026-03-09'), 'workshops'), ['3d', 'metal']);
  assert.equal(proposalFromIssue(evIssue(2, 'https://www.x.de/e/', '2026-03-09'), 'events'), 'x.de/e');
  assert.equal(proposalFromIssue(evIssue(3, null, '2026-03-09'), 'events'), null);
});

test('Workshops: gleich wie integrierter Stand → kein Vorschlag', () => {
  const d = ws(['3d', 'laser'], ['laser', '3d'], []);
  assert.equal(d.action, 'skip'); assert.match(d.reason, /integrierten Stand/);
});

test('Workshops: gleich wie JÜNGSTER Vorschlag → kein Vorschlag (auch wenn integriert anders kuratiert wurde)', () => {
  const issues = [wsIssue(345, ['3d', 'laser', 'metal'], '2026-03-09', 'CLOSED')];
  const d = ws(['3d', 'laser', 'metal'], ['3d', 'laser'], issues);   // du hattest metal abgewählt, Website unverändert
  assert.equal(d.action, 'skip'); assert.match(d.reason, /#345/);
});

test('Workshops: JEDE Abweichung vom jüngsten Vorschlag ist eine neuere Änderung (hinzu, weg, anders)', () => {
  const issues = [wsIssue(10, ['3d', 'laser'], '2026-03-09')];
  assert.equal(ws(['3d', 'laser', 'wood'], [], issues).action, 'propose');   // etwas dazu
  assert.equal(ws(['3d'], [], issues).action, 'propose');                     // etwas weg
  assert.equal(ws(['3d', 'metal'], [], issues).action, 'propose');            // etwas anderes
});

test('Workshops: gleicht nur einem ÄLTEREN Vorschlag, nicht dem jüngsten → neuere Änderung', () => {
  const issues = [wsIssue(10, ['3d'], '2026-03-01'), wsIssue(20, ['3d', 'laser'], '2026-06-01')];
  const d = ws(['3d'], [], issues);   // Website ist zurückgewechselt
  assert.equal(d.action, 'propose'); assert.match(d.reason, /#20/);
});

test('Workshops: erster Vorschlag; offener älterer Vorschlag mit anderem Inhalt wird ersetzt, gleicher nicht dupliziert', () => {
  assert.deepEqual(ws(['3d'], [], []), { action: 'propose', reason: 'erster Vorschlag', supersede: [] });
  const open = [wsIssue(5, ['3d'], '2026-03-01', 'OPEN')];
  assert.deepEqual(ws(['3d', 'laser'], [], open).supersede, [5]);
  assert.equal(ws(['3d'], [], open).action, 'skip');    // offener Vorschlag hat denselben Inhalt → kein Duplikat
});

test('Kalender: URL-Vergleich normalisiert; kein Fund; Änderung', () => {
  assert.equal(ev('https://www.x.de/e/', 'http://x.de/e', []).action, 'skip');                 // == integriert
  assert.equal(ev('https://y.de/k', 'https://x.de/e', [evIssue(1, 'https://y.de/k/', '2026-03-01')]).action, 'skip'); // == jüngster Vorschlag
  assert.equal(ev('https://z.de/k', null, [evIssue(1, 'https://y.de/k', '2026-03-01')]).action, 'propose');           // neue URL
  assert.equal(ev(null, null, [evIssue(1, null, '2026-03-01')]).action, 'skip');                // wieder „kein Fund“
  assert.equal(ev(null, null, []).action, 'propose');                                           // erstes „kein Fund“
  assert.equal(ev('https://z.de/k', null, [evIssue(1, null, '2026-03-01')]).action, 'propose'); // jetzt ein Fund, vorher keiner
});

test('loadMergedLocations = Karten-Stand (Workshops aus loc-enrichment.json enthalten)', () => {
  const merged = loadMergedLocations(new URL('..', import.meta.url).pathname);
  const enrichment = JSON.parse(readFileSync(new URL('../loc-enrichment.json', import.meta.url), 'utf8'));
  const withWs = Object.entries(enrichment).filter(([, v]) => v.workshops?.length);
  assert.ok(withWs.length > 50);
  for (const [id, v] of withWs.slice(0, 20)) assert.deepEqual(merged.find(l => l.ID === Number(id)).workshops, v.workshops);
});

test('Wächter: Crawler entscheiden inhaltlich und nutzen den verschmolzenen Stand', () => {
  for (const f of ['workshop-crawler.js', 'calendar-crawler.js']) {
    const src = readFileSync(new URL(`../tools/${f}`, import.meta.url), 'utf8');
    assert.match(src, /from '\.\/lib\/crawl-selection\.js'/, `${f}: gemeinsame Logik fehlt`);
    assert.match(src, /decideProposal\(/, `${f}: keine inhaltliche Entscheidung`);
    assert.match(src, /loadMergedLocations\(/, `${f}: nicht der verschmolzene Stand`);
    assert.doesNotMatch(src, /JSON\.parse\(fs\.readFileSync\(locationsPath/, `${f}: liest wieder nur locations.json`);
  }
});
