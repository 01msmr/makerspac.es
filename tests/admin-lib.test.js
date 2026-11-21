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
