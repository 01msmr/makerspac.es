// tests/crawl-selection.test.js — gemeinsame Auswahl der Crawler (keine erneuten Vorschläge für Umgesetztes)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { issueSpaceId, existingIssueIds, selectSpaces, loadMergedLocations } from '../tools/lib/crawl-selection.js';

test('issueSpaceId: Body-ID, Titel-ID, nichts', () => {
  assert.equal(issueSpaceId({ title: 'x', body: '**ID:** 128\n' }), 128);
  assert.equal(issueSpaceId({ title: '[Workshop-Daten] RoboScope (#128)', body: '' }), 128);
  assert.equal(issueSpaceId({ title: 'Update: X (ID 133)', body: '' }), 133);
  assert.equal(issueSpaceId({ title: 'irgendwas', body: 'kein Bezug' }), null);
});

test('existingIssueIds: nur Issues mit passendem Titel-Präfix, jeder Zustand', () => {
  const issues = [
    { title: '[Workshop-Daten] A (#1)', body: '', state: 'CLOSED' },
    { title: '[Workshop-Daten] B (#2)', body: '', state: 'OPEN' },
    { title: 'Kalenderlink: C', body: '**ID:** 3' },
    { title: '[Workshop-Daten] ohne ID', body: '' },
  ];
  assert.deepEqual([...existingIssueIds(issues, '[Workshop-Daten]')].sort(), [1, 2]);
  assert.deepEqual([...existingIssueIds(issues, 'Kalenderlink:')], [3]);
});

test('selectSpaces: Daten vorhanden / Issue vorhanden → übersprungen, Rest gewählt', () => {
  const spaces = [{ ID: 1, workshops: ['3d'] }, { ID: 2 }, { ID: 3 }, { ID: 4, workshops: [] }];
  const r = selectSpaces(spaces, { hasData: s => s.workshops?.length > 0, existingIds: new Set([3]) });
  assert.deepEqual(r.selected.map(s => s.ID), [2, 4]);
  assert.deepEqual([r.skippedData, r.skippedIssue], [1, 1]);
});

test('loadMergedLocations = Karten-Stand: Workshops aus loc-enrichment.json sind enthalten', () => {
  const merged = loadMergedLocations(new URL('..', import.meta.url).pathname);
  const enrichment = JSON.parse(readFileSync(new URL('../loc-enrichment.json', import.meta.url), 'utf8'));
  const withWs = Object.entries(enrichment).filter(([, v]) => v.workshops?.length);
  assert.ok(withWs.length > 50);
  for (const [id, v] of withWs.slice(0, 20)) assert.deepEqual(merged.find(l => l.ID === Number(id)).workshops, v.workshops);
});

test('Wächter: Workshop- und Kalender-Crawler nutzen die gemeinsame Auswahl (kein Rückfall auf nur locations.json)', () => {
  for (const f of ['workshop-crawler.js', 'calendar-crawler.js']) {
    const src = readFileSync(new URL(`../tools/${f}`, import.meta.url), 'utf8');
    assert.match(src, /from '\.\/lib\/crawl-selection\.js'/, `${f}: gemeinsame Auswahl fehlt`);
    assert.match(src, /selectSpaces\(/, `${f}: selectSpaces fehlt`);
    assert.doesNotMatch(src, /JSON\.parse\(fs\.readFileSync\(locationsPath/, `${f}: liest wieder nur locations.json`);
  }
});
