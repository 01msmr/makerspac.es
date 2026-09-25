// tests/spaceapi-directory-sync.test.js
// Testet Matching/Diff-Logik des SpaceAPI-Directory-Sync + Issue-Roundtrip mit dem Apply-Script
// Läuft mit: node --test tests/spaceapi-directory-sync.test.js

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeUrl, matchSpace, buildProposals, isAlreadyProposed, buildIssueBody,
} from '../tools/spaceapi-directory-sync.js';
import { parseIssue, applyProposal } from '../tools/apply-spaceapi-issues.js';

const loc = (ID, name, url, lat, long) => ({ ID, name, link: { url, text: '' }, loc: { lat, long } });

const LOCATIONS = [
  loc(1, 'Toolbox Bodensee', 'https://toolbox-bodensee.de', 47.712, 9.399),
  loc(2, 'Metalab', 'https://metalab.at', 48.2084, 16.3764),
  loc(3, 'Neighbour A', 'https://a.example', 50.0, 8.0),
  loc(4, 'Neighbour B', 'https://b.example', 50.0005, 8.0005),   // ~70 m von A
];

// ─── normalizeUrl ────────────────────────────────────────────────────────

test('normalizeUrl ignoriert Schema, www, Trailing-Slash und Groß-/Kleinschreibung', () => {
  assert.equal(normalizeUrl('https://www.C3D2.de/spaceapi.json/'), normalizeUrl('http://c3d2.de/spaceapi.json'));
});

test('normalizeUrl unterscheidet verschiedene Pfade', () => {
  assert.notEqual(normalizeUrl('https://x.de/a.json'), normalizeUrl('https://x.de/b.json'));
});

// ─── matchSpace ──────────────────────────────────────────────────────────

test('matchSpace: gleicher Endpoint gewinnt', () => {
  const enrichment = { 2: { spaceapi: { endpoint: 'https://metalab.at/status.json' } } };
  const entry = { endpoint: 'https://metalab.at/status.json', data: {} };
  assert.deepEqual(matchSpace(entry, LOCATIONS, enrichment), { id: 2, reason: 'endpoint' });
});

test('matchSpace: Website-Host aus SpaceAPI-JSON == link.url-Host', () => {
  const entry = { endpoint: 'https://metalab-spaceapi.melina.jetzt/v15', data: { url: 'https://www.metalab.at/' } };
  assert.deepEqual(matchSpace(entry, LOCATIONS, {}), { id: 2, reason: 'domain' });
});

test('matchSpace: Koordinaten innerhalb 300 m', () => {
  const entry = { endpoint: 'https://spacestatus.example', data: { url: 'https://other.example', location: { lat: 47.7125, lon: 9.3995 } } };
  assert.deepEqual(matchSpace(entry, LOCATIONS, {}), { id: 1, reason: 'location' });
});

test('matchSpace: Koordinaten weiter als 300 m → kein Match', () => {
  const entry = { endpoint: 'https://far.example', data: { location: { lat: 47.73, lon: 9.399 } } };
  assert.equal(matchSpace(entry, LOCATIONS, {}), null);
});

test('matchSpace: mehrere Spaces innerhalb 300 m → mehrdeutig, kein Match', () => {
  const entry = { endpoint: 'https://ab.example', data: { location: { lat: 50.0002, lon: 8.0002 } } };
  assert.equal(matchSpace(entry, LOCATIONS, {}), null);
});

// ─── buildProposals ──────────────────────────────────────────────────────

const valid = (endpoint, data) => ({ endpoint, data: { space: 'x', state: { open: false }, ...data } });

test('buildProposals: neuer Endpoint für Space ohne spaceapi', () => {
  const dir = [valid('https://spacestatus.toolbox-bodensee.de', { url: 'https://toolbox-bodensee.de' })];
  const [p] = buildProposals(dir, LOCATIONS, {});
  assert.equal(p.id, 1);
  assert.equal(p.current, null);
  assert.equal(p.proposed, 'https://spacestatus.toolbox-bodensee.de');
  assert.equal(p.reason, 'domain');
  assert.equal(p.open, false);
});

test('buildProposals: geänderter Endpoint', () => {
  const enrichment = { 2: { spaceapi: { endpoint: 'https://metalab.at/status.json' } } };
  const dir = [valid('https://metalab-spaceapi.melina.jetzt/v15', { url: 'https://metalab.at' })];
  const [p] = buildProposals(dir, LOCATIONS, enrichment);
  assert.equal(p.current, 'https://metalab.at/status.json');
  assert.equal(p.proposed, 'https://metalab-spaceapi.melina.jetzt/v15');
});

test('buildProposals: kein Vorschlag, wenn unser Endpoint schon im Directory steht (auch mit www-Unterschied)', () => {
  const enrichment = { 2: { spaceapi: { endpoint: 'https://www.metalab.at/status.json' } } };
  const dir = [
    valid('https://metalab.at/status.json', { url: 'https://metalab.at' }),
    valid('https://metalab.at/room2.json', { url: 'https://metalab.at' }),   // zweiter Raum, gleicher Host
  ];
  assert.deepEqual(buildProposals(dir, LOCATIONS, enrichment), []);
});

test('buildProposals: ungültige Endpoints (kein SpaceAPI-JSON) werden ignoriert', () => {
  const dir = [{ endpoint: 'https://toolbox-bodensee.de/broken', data: null }];
  assert.deepEqual(buildProposals(dir, LOCATIONS, {}), []);
});

test('buildProposals: mehrere Kandidaten für einen Space → ein Vorschlag mit Alternativen', () => {
  const dir = [
    valid('https://toolbox-bodensee.de/a.json', { url: 'https://toolbox-bodensee.de' }),
    valid('https://toolbox-bodensee.de/b.json', { url: 'https://toolbox-bodensee.de' }),
  ];
  const proposals = buildProposals(dir, LOCATIONS, {});
  assert.equal(proposals.length, 1);
  assert.equal(proposals[0].proposed, 'https://toolbox-bodensee.de/a.json');
  assert.deepEqual(proposals[0].alternatives, ['https://toolbox-bodensee.de/b.json']);
});

test('buildProposals: Message-only-SpaceAPI (ohne state.open) ist gültig', () => {
  const dir = [{ endpoint: 'https://toolbox-bodensee.de/static.json', data: { space: 'x', url: 'https://toolbox-bodensee.de', state: { message: 'Mo 18 Uhr' } } }];
  const [p] = buildProposals(dir, LOCATIONS, {});
  assert.equal(p.open, null);
});

// ─── Issue-Dedup ─────────────────────────────────────────────────────────

test('isAlreadyProposed: offenes oder geschlossenes Issue mit gleicher ID + URL → true', () => {
  const p = { id: 2, name: 'Metalab', current: null, proposed: 'https://metalab-spaceapi.melina.jetzt/v15', reason: 'domain', open: true, alternatives: [] };
  const issues = [{ title: 'SpaceAPI: Metalab', body: buildIssueBody(p), state: 'CLOSED' }];
  assert.equal(isAlreadyProposed(issues, p), true);
});

test('isAlreadyProposed: gleiche ID, andere URL → false', () => {
  const old = { id: 2, name: 'Metalab', current: null, proposed: 'https://old.example/api', reason: 'domain', open: true, alternatives: [] };
  const issues = [{ title: 'SpaceAPI: Metalab', body: buildIssueBody(old), state: 'CLOSED' }];
  assert.equal(isAlreadyProposed(issues, { ...old, proposed: 'https://new.example/api' }), false);
});

test('isAlreadyProposed: ID 2 kollidiert nicht mit ID 234', () => {
  const p = { id: 234, name: 'X', current: null, proposed: 'https://x.example/api', reason: 'domain', open: true, alternatives: [] };
  const issues = [{ title: 'SpaceAPI: X', body: buildIssueBody(p), state: 'OPEN' }];
  assert.equal(isAlreadyProposed(issues, { ...p, id: 2 }), false);
});

// ─── Roundtrip Issue → Apply ─────────────────────────────────────────────

test('parseIssue liest ID und vorgeschlagene URL aus buildIssueBody', () => {
  const p = { id: 7, name: 'Werkraum', current: null, proposed: 'https://www.werkraum.space/spaceapi/current/', reason: 'location', open: false, alternatives: [] };
  assert.deepEqual(
    parseIssue({ number: 42, title: 'SpaceAPI: Werkraum', body: buildIssueBody(p) }),
    { issueNumber: 42, spaceId: 7, endpoint: 'https://www.werkraum.space/spaceapi/current/' },
  );
});

test('parseIssue ignoriert fremde data-update-Issues', () => {
  assert.equal(parseIssue({ number: 1, title: 'Kalenderlink: X', body: '**ID:** 3' }), null);
});

test('applyProposal setzt spaceapi.endpoint und erhält andere Felder', () => {
  const enrichment = { 7: { events: 'https://e.example' } };
  applyProposal(enrichment, 7, 'https://api.example');
  assert.deepEqual(enrichment[7], { events: 'https://e.example', spaceapi: { endpoint: 'https://api.example' } });
});

test('applyProposal legt Eintrag für neue ID an', () => {
  const enrichment = {};
  applyProposal(enrichment, 9, 'https://api.example');
  assert.deepEqual(enrichment[9], { spaceapi: { endpoint: 'https://api.example' } });
});
