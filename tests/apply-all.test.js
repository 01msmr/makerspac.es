// tests/apply-all.test.js — apply-all: gemeinsamer Lauf (1 Commit, 1 Deploy), Issues erst nach Push schließen
// Läuft mit: node --test tests/apply-all.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, readFileSync as rf, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { closeOrDefer, parseDeferred } from '../tools/lib/issue-close.js';
import { decideAll, APPLY_WORKFLOW } from '../tools/auto-apply-check.js';

const read = f => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
const NOW = Date.parse('2026-11-24T12:00:00Z');
const iss = (n, minutesAgo, title) => ({ number: n, title, updatedAt: new Date(NOW - minutesAgo * 60000).toISOString(), labels: [{ name: 'ok' }] });

test('1: closeOrDefer merkt nur vor, wenn DEFERRED_CLOSE_FILE gesetzt ist (kein gh-Aufruf)', () => {
  const file = path.join(mkdtempSync(path.join(tmpdir(), 'defer-')), 'c.jsonl');
  process.env.DEFERRED_CLOSE_FILE = file;
  try {
    closeOrDefer(5, 'a'); closeOrDefer(6, 'b'); closeOrDefer(5, 'a2');
    assert.deepEqual(parseDeferred(rf(file, 'utf8')), [{ number: 5, comment: 'a2' }, { number: 6, comment: 'b' }]);
  } finally { delete process.env.DEFERRED_CLOSE_FILE; }
});

test('2: parseDeferred ignoriert Leer- und defekte Zeilen', () => {
  assert.deepEqual(parseDeferred('\n{kaputt\n{"number":3,"comment":"x"}\n{"comment":"ohne nummer"}\n'), [{ number: 3, comment: 'x' }]);
  assert.deepEqual(parseDeferred(''), []);
});

test('3: decideAll zählt alle Arten zusammen (10 verteilt → sofort), fremde Titel nicht', () => {
  const issues = [
    ...Array.from({ length: 4 }, (_, i) => iss(i, 1, 'SpaceAPI: X')),
    ...Array.from({ length: 3 }, (_, i) => iss(10 + i, 1, '[Workshop-Daten] Y')),
    ...Array.from({ length: 2 }, (_, i) => iss(20 + i, 1, 'Kalenderlink: Z')),
    iss(30, 1, 'Treffen-Daten: W'),
    iss(40, 1, 'irgendwas anderes'),
  ];
  const r = decideAll(issues, NOW);
  assert.equal(r.count, 10);
  assert.equal(r.delay, 0);
  assert.equal(decideAll(issues.slice(0, 2), NOW).delay, 59 * 60000);
  assert.equal(decideAll([], NOW).delay, null);
  assert.equal(APPLY_WORKFLOW, 'apply-all-issues.yml');
});

test('4: Workflow: Arten mit continue-on-error, dann Validate → Commit → Deploy → Schließen → Fehlermeldung', () => {
  const t = read('.github/workflows/apply-all-issues.yml');
  const pos = s => { const i = t.indexOf(s); assert.ok(i >= 0, `fehlt: ${s}`); return i; };
  const order = ['name: SpaceAPI', 'name: Workshops', 'name: Kalender', 'name: Treffen', 'name: Validate', 'name: Commit data', 'name: Trigger Deploy', 'name: Issues schließen', 'name: Fehler einzelner Arten melden'];
  order.reduce((prev, s) => { const i = pos(s); assert.ok(i > prev, `Reihenfolge: ${s}`); return i; }, -1);
  assert.equal((t.match(/continue-on-error: true/g) || []).length, 4);
  assert.match(t, /group:\s*data-apply/);
  assert.match(t, /ref:\s*main/);
  assert.match(t, /DEFERRED_CLOSE_FILE=\$RUNNER_TEMP/);
  assert.match(t, /name: Issues schließen\s+if: \$\{\{ inputs\.mode == 'apply' && steps\.commit\.outcome == 'success' \}\}/);
  assert.match(t, /name: Fehler einzelner Arten melden\s+if: \$\{\{ always\(\)/);
});

test('5: Apply-Skripte schließen nie direkt, sondern über closeOrDefer', () => {
  for (const f of ['spaceapi', 'workshop', 'calendar', 'weekly']) {
    const s = read(`tools/apply-${f}-issues.js`);
    assert.match(s, /closeOrDefer/, `${f}: closeOrDefer fehlt`);
    assert.ok(!/gh\('issue', 'close'/.test(s) && !/gh issue close/.test(s), `${f}: direkter gh issue close`);
  }
});

test('6: Admin und Cron starten apply-all (nicht die Einzel-Workflows)', () => {
  const admin = read('admin/admin.js');
  assert.match(admin, /APPLY_WORKFLOW = 'apply-all-issues\.yml'/);
  assert.ok(!/k\.workflow|k\.mode/.test(admin));
  assert.ok(existsSync(new URL('../.github/workflows/apply-all-issues.yml', import.meta.url)));
});
