import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isAdminCommand, openAdminTab, ADMIN_URL } from '../admin-shortcut.js';

test('isAdminCommand: „/admin“ (auch /admin/, Groß-/Kleinschreibung, Leerraum) — nichts anderes', () => {
  for (const ok of ['/admin', '/admin/', ' /admin ', '/ADMIN', '/Admin/']) assert.equal(isAdminCommand(ok), true, ok);
  for (const no of ['admin', '/administration', '/admin/x', 'x/admin', '/adm', '', '  ', null, undefined, 'Aachen']) assert.equal(isAdminCommand(no), false, String(no));
});

test('openAdminTab: Anker auf /admin/ mit target=_blank und noopener, wird geklickt', () => {
  let a, attached = false;
  openAdminTab({
    createElement: () => (a = { click() { this.clickedWhileAttached = attached; }, remove() { attached = false; } }),
    body: { appendChild: () => { attached = true; } },
  });
  assert.deepEqual([a.href, a.target, a.rel, a.clickedWhileAttached, attached], [ADMIN_URL, '_blank', 'noopener noreferrer', true, false], 'angehängt geklickt, danach entfernt');
});
