import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CHANGES_TEXT, KIND_ORDER, changesText, changeLabel, changeSegments, groupChanges, rowLabel, monthLabel, dayLabel } from '../changes-panel.js';

test('alle Sprachen: Arten wie Englisch, Verb-Formen vollständig, Reiter „new“ = en', () => {
  const ref = CHANGES_TEXT.en;
  assert.equal(ref.tab, 'new');
  assert.deepEqual(Object.keys(ref.kinds).sort(), [...KIND_ORDER].sort(), 'KIND_ORDER = alle Arten');
  for (const [lang, tx] of Object.entries(CHANGES_TEXT)) {
    assert.deepEqual(Object.keys(tx.kinds).sort(), Object.keys(ref.kinds).sort(), `${lang}.kinds`);
    const forms = tx.ops.add ? [tx.ops] : Object.values(tx.ops);
    for (const f of forms) assert.deepEqual(Object.keys(f).sort(), ['add', 'change', 'remove'], `${lang}.ops`);
    for (const g of Object.values(tx.gender ?? {})) assert.ok(tx.ops[g], `${lang}: Genus ${g}`);
    if (!tx.ops.add) for (const g of ['m', 'mp']) assert.ok(tx.ops[g], `${lang}: Formen m/mp für Werkstatt-Zahlen`);
    assert.ok(tx.workshopForms.one && tx.workshopForms.other, `${lang}: workshopForms`);
    assert.ok(tx.more.other && tx.more.other.includes('{n}') && tx.more.other.includes('{w}'), `${lang}: more-Muster`);
    for (const v of [tx.tab, tx.intro, tx.empty, ...Object.values(tx.kinds)]) assert.ok(v && v.length > 0, lang);
  }
  assert.equal(changesText('xx'), CHANGES_TEXT.en, 'unbekannte Sprache → Englisch');
});

test('changeLabel: Art + Verb ohne Trennpunkt; neuer Space nur der Name der Art; Genus-Anpassung (fr/it)', () => {
  assert.equal(changeLabel({ k: 'workshops', o: 'add' }, 'de'), 'Werkstätten ergänzt');
  assert.equal(changeLabel({ k: 'address', o: 'change' }, 'de'), 'Adresse geändert');
  assert.equal(changeLabel({ k: 'workshops', o: 'change' }, 'en'), 'Workshops updated');
  assert.equal(changeLabel({ k: 'added' }, 'fr'), 'Nouvel espace');
  assert.equal(changeLabel({ k: 'weekly', o: 'add' }, 'fr'), 'Réunion hebdomadaire ajoutée');
  assert.equal(changeLabel({ k: 'workshops', o: 'add' }, 'fr'), 'Ateliers ajoutés');
  assert.equal(changeLabel({ k: 'events', o: 'add' }, 'fr'), 'Calendrier ajouté');
  assert.equal(changeLabel({ k: 'address', o: 'change' }, 'it'), 'Indirizzo modificato');
  assert.ok(!/·/.test(changeLabel({ k: 'weekly', o: 'add' }, 'de')));
});

test('groupChanges: Monat → Tag → Zeile; mehrere Änderungen am selben Tag je Space = eine Zeile in fester Reihenfolge', () => {
  const m = groupChanges([
    { d: '2026-11-23', id: 126, k: 'workshops', o: 'add' },
    { d: '2026-11-23', id: 126, k: 'weekly', o: 'add' },
    { d: '2026-11-23', id: 130, k: 'address', o: 'change' },
    { d: '2026-11-02', id: 5, k: 'added' },
    { d: '2026-10-30', id: 7, k: 'name', o: 'change' },
  ]);
  assert.deepEqual(m.map(x => [x.ym, x.days.map(d => [d.d, d.rows.length])]), [['2026-11', [['2026-11-23', 2], ['2026-11-02', 1]]], ['2026-10', [['2026-10-30', 1]]]]);
  const row = m[0].days[0].rows[0];
  assert.equal(row.id, 126);
  assert.equal(rowLabel(row, 'de'), 'Wöchentliches Treffen ergänzt, Werkstätten ergänzt');
  assert.equal(rowLabel(m[0].days[0].rows[1], 'de'), 'Adresse geändert');
});

test('Monats- und Tagesbezeichnung folgen der Sprache', () => {
  assert.match(monthLabel('2026-11', 'de'), /November 2026/);
  assert.equal(dayLabel('2026-11-22', 'de'), '22. November');
  assert.match(dayLabel('2026-11-22', 'en'), /November/);
  assert.doesNotMatch(dayLabel('2026-11-22', 'de'), /Nov\.$/);
  assert.equal(monthLabel('2026-11', 'zz-invalid-lang-tag-xxxxxxxxx'), '2026-11');
});

test('Werkstätten mit Anzahl: „3 Werkstätten ergänzt“, „1 Werkstatt entfernt“, Plural je Sprache, Genus fr/it', () => {
  const w = (n, o = 'add') => ({ k: 'workshops', o, n });
  assert.equal(changeLabel(w(3), 'de'), '3 Werkstätten ergänzt');
  assert.equal(changeLabel(w(1), 'de'), '1 Werkstatt ergänzt');
  assert.equal(changeLabel(w(1, 'remove'), 'de'), '1 Werkstatt entfernt');
  assert.equal(changeLabel(w(2), 'en'), '2 workshops added');
  assert.equal(changeLabel(w(1), 'fr'), '1 atelier ajouté');
  assert.equal(changeLabel(w(3), 'fr'), '3 ateliers ajoutés');
  assert.equal(changeLabel(w(1), 'it'), '1 laboratorio aggiunto');
  assert.equal(changeLabel(w(2), 'it'), '2 laboratori aggiunti');
  assert.equal(changeLabel(w(1), 'uk'), '1 майстерня додано');
  assert.equal(changeLabel(w(2), 'uk'), '2 майстерні додано');
  assert.equal(changeLabel(w(5), 'uk'), '5 майстерень додано');
  assert.equal(changeLabel({ k: 'workshops', o: 'add' }, 'de'), 'Werkstätten ergänzt', 'ohne Zahl (ältere Einträge) wie bisher');
});

test('Werkstätten zu bestehenden ergänzt: „2 weitere Werkstätten ergänzt“ (erstmals: „8 Werkstätten ergänzt“)', () => {
  const more = n => ({ k: 'workshops', o: 'add', n, more: 1 });
  assert.equal(changeLabel({ k: 'workshops', o: 'add', n: 8 }, 'de'), '8 Werkstätten ergänzt');
  assert.equal(changeLabel(more(2), 'de'), '2 weitere Werkstätten ergänzt');
  assert.equal(changeLabel(more(1), 'de'), '1 weitere Werkstatt ergänzt');
  assert.equal(changeLabel(more(2), 'en'), '2 more workshops added');
  assert.equal(changeLabel(more(1), 'fr'), '1 atelier supplémentaire ajouté');
  assert.equal(changeLabel(more(3), 'fr'), '3 ateliers supplémentaires ajoutés');
  assert.equal(changeLabel(more(2), 'nl'), '2 extra werkplaatsen toegevoegd');
  assert.equal(changeLabel(more(2), 'it'), '2 laboratori in più aggiunti');
  assert.equal(changeLabel(more(2), 'da'), '2 ekstra værksteder tilføjet');
  assert.equal(changeLabel(more(1), 'uk'), 'ще 1 майстерню додано');
  assert.equal(changeLabel(more(3), 'uk'), 'ще 3 майстерні додано');
  assert.equal(changeLabel({ k: 'workshops', o: 'remove', n: 2, more: 1 }, 'de'), '2 Werkstätten entfernt', 'Entfernen bleibt unverändert');
});

test('Position = Adresse: ältere Einträge mit k „position“ erscheinen als „Adresse geändert“, nicht doppelt', () => {
  const m = groupChanges([{ d: '2026-11-22', id: 118, k: 'address', o: 'change' }, { d: '2026-11-22', id: 118, k: 'position', o: 'change' }]);
  assert.equal(rowLabel(m[0].days[0].rows[0], 'de'), 'Adresse geändert');
  assert.ok(!Object.values(CHANGES_TEXT).some(tx => 'position' in tx.kinds), 'keine Sprache nennt „Position“ als Art');
});

test('changeSegments: „8 Werkstätten“ als ein nicht umbrechbares Stück (nobr), der Rest darf umbrechen', () => {
  const seg = (e, l = 'de') => changeSegments(e, l);
  assert.deepEqual(seg({ k: 'workshops', o: 'add', n: 8 }), [{ text: '8 Werkstätten', nowrap: true }, { text: ' ergänzt' }]);
  assert.deepEqual(seg({ k: 'workshops', o: 'add', n: 2, more: 1 }), [{ text: '2 weitere Werkstätten', nowrap: true }, { text: ' ergänzt' }]);
  assert.deepEqual(seg({ k: 'workshops', o: 'remove', n: 1 }), [{ text: '1 Werkstatt', nowrap: true }, { text: ' entfernt' }]);
  assert.deepEqual(seg({ k: 'weekly', o: 'add' }), [{ text: 'Wöchentliches Treffen', nowrap: false }, { text: ' ergänzt' }]);
  assert.deepEqual(seg({ k: 'added' }), [{ text: 'Neuer Space' }]);
  assert.equal(changeLabel({ k: 'workshops', o: 'add', n: 8 }, 'de'), '8 Werkstätten ergänzt', 'Label unverändert');
});
