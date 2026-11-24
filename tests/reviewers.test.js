// tests/reviewers.test.js — weitere Prüfer: Rolle, „in Bearbeitung“-Sperre, Prüfpfad (ADR-009)
// Läuft mit: node --test tests/reviewers.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { roleFromPermissions, lockOf, LOCK_TTL_MS, auditComment, assigneesOf, parseCalendarIssue } from '../admin/admin-lib.js';
import { buildQueue, spaceLock, lockedSpaces, groupBySpace } from '../admin/spaces-lib.js';

const read = f => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
const NOW = Date.parse('2026-11-24T12:00:00Z');
const ago = min => NOW - min * 60000;

test('1: Rolle — Schreibrecht = Admin (darf Übernehmen), Triage/Lesen = Reviewer', () => {
  assert.deepEqual(roleFromPermissions({ admin: true }), { role: 'admin', canApply: true });
  assert.deepEqual(roleFromPermissions({ push: true, triage: true, pull: true }), { role: 'admin', canApply: true });
  assert.deepEqual(roleFromPermissions({ maintain: true }), { role: 'admin', canApply: true });
  assert.deepEqual(roleFromPermissions({ triage: true, pull: true }), { role: 'reviewer', canApply: false });
  assert.deepEqual(roleFromPermissions({ pull: true }), { role: 'reviewer', canApply: false });
  assert.deepEqual(roleFromPermissions(undefined), { role: 'reviewer', canApply: false });
});

test('2: lockOf — nur fremde, frische Zuweisung sperrt (eigene/alte nicht)', () => {
  assert.deepEqual(lockOf({ assignees: ['anna'], updated: ago(5) }, 'bob', NOW), { by: 'anna', minutes: 5 });
  assert.equal(lockOf({ assignees: ['anna'], updated: ago(5) }, 'ANNA', NOW), null);               // eigene (Groß/Klein egal)
  assert.equal(lockOf({ assignees: ['anna'], updated: NOW - LOCK_TTL_MS }, 'bob', NOW), null);     // abgelaufen
  assert.equal(lockOf({ assignees: [], updated: ago(1) }, 'bob', NOW), null);
  assert.deepEqual(lockOf({ assignees: ['bob', 'anna'], updated: ago(2) }, 'bob', NOW), { by: 'anna', minutes: 2 });
  assert.equal(lockOf(undefined, 'bob', NOW), null);
});

test('3: Prüfpfad-Text nennt Aktion und @login', () => {
  assert.equal(auditComment('anna', 'ok'), '✓ ok (zur Übernahme freigegeben) — @anna (Admin-Review)');
  assert.match(auditComment('anna', 'reject'), /^✗ verworfen — @anna/);
  assert.match(auditComment('anna', 'create'), /^➕ im Admin angelegt — @anna/);
  assert.match(auditComment('anna', 'undo'), /^↩ rückgängig gemacht — @anna/);
});

test('4: Parser liefern assignees (für die Sperre)', () => {
  const issue = { number: 1, title: 'Kalenderlink: A', labels: [], updated_at: '2026-11-24T10:00:00Z', html_url: 'x', assignees: [{ login: 'anna' }],
    body: '**ID:** 5\n\n```json\n{"events":"https://c.example"}\n```' };
  assert.deepEqual(parseCalendarIssue(issue).assignees, ['anna']);
  assert.deepEqual(assigneesOf({}), []);
});

function groups() {
  const mk = (n, id, login, min) => ({ number: n, title: 'Kalenderlink: A', labels: [], updated_at: new Date(ago(min)).toISOString(), html_url: 'x',
    assignees: login ? [{ login }] : [], body: `**ID:** ${id}\n\n\`\`\`json\n{"events":"https://c.example/${n}"}\n\`\`\`` });
  return groupBySpace({ workshops: [], spaceapi: [], weekly: [], calendar: [mk(1, 10, 'anna', 3), mk(2, 20, null, 3), mk(3, 30, 'bob', 3)] });
}

test('5: Warteschlange — von anderen bearbeitete Spaces ganz ans Ende, eigene nicht', () => {
  const g = groups();
  const locked = lockedSpaces(g, 'bob', NOW);
  assert.deepEqual([...locked], [10]);                       // 10: anna; 30: ich selbst (bob)
  assert.deepEqual(buildQueue(g, [], 'all', locked), [20, 30, 10]);
  assert.deepEqual(buildQueue(g, [30], 'all', locked), [20, 30, 10]);   // „später“ vor „gesperrt“
  assert.deepEqual(buildQueue(g, [], 'all'), [10, 20, 30]);            // ohne Sperre wie bisher
  assert.deepEqual(spaceLock(g.get(10), 'bob', NOW), { by: 'anna', minutes: 3 });
  assert.equal(spaceLock(g.get(20), 'bob', NOW), null);
});

test('6: Verdrahtung — Reviewer ohne Übernehmen/Probleme, Prüfpfad in Admin und Spaces, Zuweisung nur ohne fremde Sperre', () => {
  const admin = read('admin/admin.js'), spaces = read('admin/spaces.js');
  assert.match(admin, /if \(!canApply\(\)\) return;[^\n]*\n\s*const \{ count, last \}/);      // Auto-Timer
  assert.match(admin, /!n \|\| state\.busy \|\| !canApply\(\)/);                                  // applyNow
  assert.match(admin, /btn\.hidden = !canApply\(\)/);
  assert.match(admin, /\$\('tab-problems'\)\.hidden = !canApply\(\)/);
  for (const t of ["'ok'", "'adjust'", "'reject'", "'undo'"]) assert.ok(admin.includes(`audit(`) && admin.includes(t));
  assert.match(spaces, /audit\(res\.number, 'create'\)/);
  assert.match(spaces, /spaceLock\(g, m\.login\)\) return;/);                                   // claim nur ohne fremde Sperre
  assert.match(spaces, /deactivate\(\) \{ state\.active = false; release\(\)/);
  assert.match(admin, /async function loadMe\(\)[\s\S]*?gh\('\/user'\)[\s\S]*?gh\(`\/repos\/\$\{REPO\}`\)/);
});
