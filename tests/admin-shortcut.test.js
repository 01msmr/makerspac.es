import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isAdminCommand, openAdminTab, ADMIN_URL } from '../admin-shortcut.js';

test('isAdminCommand: „/admin“ (auch /admin/, Groß-/Kleinschreibung, Leerraum) — nichts anderes', () => {
  for (const ok of ['/admin', '/admin/', ' /admin ', '/ADMIN', '/Admin/']) assert.equal(isAdminCommand(ok), true, ok);
  for (const no of ['admin', '/administration', '/admin/x', 'x/admin', '/adm', '', '  ', null, undefined, 'Aachen']) assert.equal(isAdminCommand(no), false, String(no));
});

test('openAdminTab: window.open(/admin/, _blank), opener wird gekappt, true bei Erfolg', () => {
  const calls = [];
  const tab = { opener: 'main' };
  assert.equal(openAdminTab({ open: (...a) => { calls.push(a); return tab; } }), true);
  assert.deepEqual(calls, [[ADMIN_URL, '_blank']]);
  assert.equal(tab.opener, null);
});

test('openAdminTab: vom Browser geblockt (open liefert null) → false', () => {
  assert.equal(openAdminTab({ open: () => null }), false);
});
