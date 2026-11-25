// tests/weekly-remove.test.js — Option „kein weekly“: Treffen entfernen (Admin → Issue → Apply → Changelog)
// Läuft mit: node --test tests/weekly-remove.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseWeeklyIssue, parseWeeklyInput, replaceWeekly, weeklyText } from '../admin/admin-lib.js';
import { parseIssue as applyParse, applyWeeklyChanges, validateWeekly } from '../tools/apply-weekly-issues.js';
import { validateValue, weeklyTextOf, proposalValue, displayValue, planDecision, groupBySpace } from '../admin/spaces-lib.js';
import { diffSpaces } from '../tools/lib/changelog.js';

const issue = (json, extra = {}) => ({ number: 5, title: 'Treffen-Daten: A', labels: [], updated_at: '2026-11-25T00:00:00Z', html_url: 'x', body: `**ID:** 48\n**Website:** https://x.example\n\n\`\`\`json\n${json}\n\`\`\``, ...extra });

test('1: Admin-Parser — "weekly": null ist ein gültiger Vorschlag (Treffen entfernen); Text „kein Weekly“', () => {
  const p = parseWeeklyIssue(issue('{"weekly": null}'));
  assert.equal(p.weekly, null);
  assert.equal(weeklyText(p), 'kein Weekly');
  assert.deepEqual(parseWeeklyInput('kein weekly'), { weekly: null });
  assert.deepEqual(parseWeeklyInput('kein weekly mehr'), { weekly: null });   // älterer Wortlaut bleibt lesbar
  assert.deepEqual(parseWeeklyInput('Kein Weekly, 2015'), { weekly: null, init: 20150101 });
  assert.equal(parseWeeklyInput('irgendwas'), null);
  const body = replaceWeekly(issue('{}').body, 'kein Weekly');
  assert.equal(parseWeeklyIssue({ ...issue('{}'), body }).weekly, null);
  assert.equal(parseWeeklyIssue(issue('{}')), null);   // leerer Block bleibt ungültig
});

test('2: Apply — weekly: null entfernt das Treffen; leerer Eintrag verschwindet; Vorschläge ohne weekly lassen es unberührt', () => {
  assert.equal(applyParse(issue('{"weekly": null}')).weekly, null);
  const enr = { 48: { events: 'https://e.example', weekly: { weekday: 2, time: 1900 } }, 50: { weekly: { weekday: 1, time: 1800 } }, 51: { weekly: { weekday: 3, time: 2000 } } };
  applyWeeklyChanges(enr, [{ issueNumber: 1, spaceId: 48, weekly: null }, { issueNumber: 2, spaceId: 50, weekly: null }, { issueNumber: 3, spaceId: 51, init: 19840101 }]);
  assert.deepEqual(enr[48], { events: 'https://e.example' });                // nur weekly weg
  assert.equal(enr[50], undefined);                                           // war der einzige Inhalt
  assert.deepEqual(enr[51], { weekly: { weekday: 3, time: 2000 } });          // Gründung-only: weekly bleibt
  const set = {}; applyWeeklyChanges(set, [{ issueNumber: 4, spaceId: 60, weekly: { weekday: 4, time: 1830 } }]);
  assert.deepEqual(set[60], { weekly: { weekday: 4, time: 1830 } });
  assert.deepEqual(validateWeekly({ issueNumber: 1, spaceId: 48, weekly: null }, enr, new Set([48])), []);   // Entfernen braucht keine Terminprüfung
});

test('3: Spaces — Formwert „none“, Validierung, Text', () => {
  assert.equal(validateValue('weekly', { day: 'none', time: '', init: '' }), null);
  assert.equal(validateValue('weekly', { day: 'none', time: '', init: '2999-01-01' }, '2026-11-25'), 'Gründungsdatum ungültig');
  assert.equal(weeklyTextOf({ day: 'none', time: '', init: '' }), 'kein Weekly');
  const p = parseWeeklyIssue(issue('{"weekly": null}'));
  assert.deepEqual(proposalValue('weekly', p), { day: 'none', time: '', init: '' });
  assert.deepEqual(displayValue('weekly', p, { day: '2', time: '19:00', init: '2015-05-01' }), { day: 'none', time: '', init: '2015-05-01' });
});

function sp(proposals, cur) { return { id: 48, name: 'CCC', website: '', proposals, current: { weekly: cur, workshops: [], calendar: '', spaceapi: '' } }; }

test('4: planDecision — „kein weekly“: neues Issue nur mit weekly: null; ohne vorhandenes Treffen nichts zu tun; Vorschlag unverändert = ok', () => {
  const cur = { day: '2', time: '19:00', init: '1984-01-01' };
  let r = planDecision(sp({}, cur), [{ key: 'weekly', enabled: true, include: true, value: { day: 'none', time: '', init: '1984-01-01' } }]);
  assert.equal(r.errors.length, 0); assert.equal(r.actions[0].type, 'create');
  const created = parseWeeklyIssue({ ...issue('{}'), body: r.actions[0].body });
  assert.equal(created.weekly, null); assert.equal(created.init, undefined);                     // Gründung (unverändert) nicht mitgeschrieben
  r = planDecision(sp({}, { day: '', time: '', init: '' }), [{ key: 'weekly', enabled: true, include: true, value: { day: 'none', time: '', init: '' } }]);
  assert.deepEqual(r.actions, []);                                                                // nichts zu entfernen
  const g = groupBySpace({ weekly: [issue('{"weekly": null}')], workshops: [], calendar: [], spaceapi: [] }).get(48);
  r = planDecision(sp(g.proposals, cur), [{ key: 'weekly', enabled: true, include: true, value: { day: 'none', time: '', init: '1984-01-01' } }], { 5: issue('{"weekly": null}').body });
  assert.deepEqual(r.actions.map(a => [a.type, a.body]), [['ok', undefined]]);                   // Vorschlag „entfernen“ übernehmen = nur ok
});

test('5: Changelog — entferntes Treffen erscheint als „entfernt“', () => {
  const locs = [{ ID: 48, name: 'CCC' }];
  const d = diffSpaces({ locations: locs, enrichment: { 48: { weekly: { weekday: 2, time: 1900 } } } }, { locations: locs, enrichment: {} });
  assert.deepEqual(d, [{ id: 48, k: 'weekly', o: 'remove' }]);
});
