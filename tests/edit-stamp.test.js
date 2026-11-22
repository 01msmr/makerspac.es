import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { berlinToday, stampEntries, stampLocationsFile } from '../tools/lib/edit-stamp.js';

test('berlinToday: Berliner Datum als YYYYMMDD (Zeitzone, kein Zeitanteil)', () => {
  assert.equal(berlinToday(new Date('2026-11-22T12:00:00Z')), 20261122);
  assert.equal(berlinToday(new Date('2026-11-22T23:30:00Z')), 20261123);   // 00:30 in Berlin
});

test('stampEntries: nur genannte IDs, init bleibt, neuer Wert gewinnt', () => {
  const locs = [{ ID: 1, dates: { 'space.init': 20140701, 'space.edited.latest': 20200101 } }, { ID: 2, dates: { 'space.edited.latest': 20200101 } }];
  assert.equal(stampEntries(locs, [1], 20261122), 1);
  assert.deepEqual(locs[0].dates, { 'space.init': 20140701, 'space.edited.latest': 20261122 });
  assert.equal(locs[1].dates['space.edited.latest'], 20200101);
  assert.equal(stampEntries(locs, [1], 20261122), 0);                      // idempotent
});

test('stampLocationsFile: Format bleibt (Zeilenende wie vorher)', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'stamp-'));
  const f = path.join(dir, 'locations.json');
  const data = [{ ID: 5, dates: { 'space.edited.latest': 20200101 } }];
  for (const nl of ['', '\n']) {
    fs.writeFileSync(f, JSON.stringify(data, null, 2) + nl);
    assert.equal(stampLocationsFile(f, [5], 20261122), 1);
    const out = fs.readFileSync(f, 'utf8');
    assert.equal(out.endsWith('\n'), nl === '\n');
    assert.equal(JSON.parse(out)[0].dates['space.edited.latest'], 20261122);
  }
});
