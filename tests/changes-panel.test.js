import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CHANGES_TEXT, changesText, changeLabel, groupByMonth, monthLabel, dayLabel } from '../changes-panel.js';

test('alle Sprachen haben dieselben Schlüssel wie Englisch (Reiter „new“ = en)', () => {
  const ref = CHANGES_TEXT.en;
  assert.equal(ref.tab, 'new');
  for (const [lang, tx] of Object.entries(CHANGES_TEXT)) {
    assert.deepEqual(Object.keys(tx).sort(), Object.keys(ref).sort(), lang);
    assert.deepEqual(Object.keys(tx.kinds).sort(), Object.keys(ref.kinds).sort(), `${lang}.kinds`);
    assert.deepEqual(Object.keys(tx.ops).sort(), Object.keys(ref.ops).sort(), `${lang}.ops`);
    for (const v of [tx.tab, tx.intro, tx.empty, ...Object.values(tx.kinds), ...Object.values(tx.ops)]) assert.ok(v && v.length > 0, lang);
  }
  assert.equal(changesText('xx'), CHANGES_TEXT.en, 'unbekannte Sprache → Englisch');
});

test('changeLabel: Art · Vorgang; neuer Space ohne Vorgang', () => {
  assert.equal(changeLabel({ k: 'weekly', o: 'add' }, 'de'), 'Wöchentliches Treffen · ergänzt');
  assert.equal(changeLabel({ k: 'workshops', o: 'change' }, 'en'), 'Workshops · updated');
  assert.equal(changeLabel({ k: 'added' }, 'fr'), 'Nouvel espace');
});

test('groupByMonth: Monate in Reihenfolge der Einträge (neueste zuerst), Einträge bleiben zusammen', () => {
  const g = groupByMonth([{ d: '2026-11-23' }, { d: '2026-11-02' }, { d: '2026-10-30' }, { d: '2026-10-01' }, { d: '2026-09-15' }]);
  assert.deepEqual(g.map(x => [x.ym, x.entries.length]), [['2026-11', 2], ['2026-10', 2], ['2026-09', 1]]);
});

test('Monats- und Tagesbezeichnung folgen der Sprache', () => {
  assert.match(monthLabel('2026-11', 'de'), /November 2026/);
  assert.match(monthLabel('2026-11', 'en'), /November 2026/);
  assert.match(dayLabel('2026-11-22', 'de'), /22\./);
  assert.equal(monthLabel('2026-11', 'zz-invalid-lang-tag-xxxxxxxxx'), '2026-11');
});
