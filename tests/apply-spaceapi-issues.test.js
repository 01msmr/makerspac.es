// tests/apply-spaceapi-issues.test.js
// Testet Label-Filter (--only-ok) und Live-Check-Validierung des Apply-Skripts
// Läuft mit: node --test tests/apply-spaceapi-issues.test.js

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { filterOk, isValidSpaceApi, checkEndpoint } from '../tools/apply-spaceapi-issues.js';

const issue = (number, ...labels) => ({ number, labels: labels.map(name => ({ name })) });

test('filterOk: nur Issues mit Label "ok"', () => {
  const out = filterOk([issue(1, 'data-update'), issue(2, 'data-update', 'ok'), issue(3), { number: 4 }]);
  assert.deepEqual(out.map(i => i.number), [2]);
});

test('isValidSpaceApi: space muss nicht-leerer String sein', () => {
  assert.equal(isValidSpaceApi({ space: 'Hackspace' }), true);
  assert.equal(isValidSpaceApi({ space: '' }), false);
  assert.equal(isValidSpaceApi({ space: 42 }), false);
  assert.equal(isValidSpaceApi(null), false);
  assert.equal(isValidSpaceApi([]), false);
});

const res = (ok, body, status = 200) => async () => ({ ok, status, json: async () => body });

test('checkEndpoint: gueltiges SpaceAPI → ok', async () => {
  assert.deepEqual(await checkEndpoint('https://x', res(true, { space: 'X' })), { ok: true });
});

test('checkEndpoint: HTTP-Fehler → nicht ok', async () => {
  const r = await checkEndpoint('https://x', res(false, {}, 404));
  assert.equal(r.ok, false);
  assert.match(r.reason, /404/);
});

test('checkEndpoint: JSON ohne space → nicht ok', async () => {
  assert.equal((await checkEndpoint('https://x', res(true, { foo: 1 }))).ok, false);
});

test('checkEndpoint: Netzwerkfehler / ungueltiges JSON → nicht ok', async () => {
  assert.equal((await checkEndpoint('https://x', async () => { throw new Error('ECONNREFUSED'); })).ok, false);
  assert.equal((await checkEndpoint('https://x', async () => ({ ok: true, json: async () => { throw new SyntaxError('bad'); } }))).ok, false);
});
