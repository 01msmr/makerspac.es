// Wächter: Ein Workshop-Typ steht an mehreren Stellen fest verdrahtet (Quelle ist workshop-types.js).
// Dieser Test schlägt an, wenn ein Typ an einer Stelle fehlt oder die englischen Formular-Labels auseinanderlaufen.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { WORKSHOP_TYPES } from '../workshop-types.js';
import { WORKSHOP_KEYWORDS } from '../workshop-keywords.js';

const read = f => readFileSync(new URL('../' + f, import.meta.url), 'utf-8');
const KEYS = Object.keys(WORKSHOP_TYPES);
const LANGS = ['de', 'en', 'fr', 'it', 'nl', 'da', 'uk'];

/** { Label → Schlüssel } aus einem Quelltext-Ausschnitt mit "Label": "key"-Paaren */
const pairs = (text) => Object.fromEntries([...text.matchAll(/"([^"]+)"\s*:\s*"([a-z0-9]+)"/g)].map(m => [m[1], m[2]]));

// Formular-Labels aus add-space-form.js: const WORKSHOPS = [['Label', 'key'], …]
const formPairs = () => {
  const block = read('add-space-form.js').match(/const WORKSHOPS = \[([\s\S]*?)\];/)[1];
  return Object.fromEntries([...block.matchAll(/\['([^']+)',\s*'([a-z0-9]+)'\]/g)].map(m => [m[1], m[2]]));
};

test('lang.json: jeder Workshop-Typ ist in allen 7 Sprachen übersetzt', () => {
  const ws = JSON.parse(read('lang.json')).workshops;
  for (const k of KEYS) for (const l of LANGS) assert.ok(ws[k]?.[l], `lang.json workshops.${k}.${l}`);
});

test('workshop-keywords.js und types.js kennen jeden Typ', () => {
  const typedef = read('types.js').match(/@typedef \{([^}]*)\} WorkshopType/)[1];
  for (const k of KEYS) {
    assert.ok(WORKSHOP_KEYWORDS[k]?.length, `Stichwörter für ${k}`);
    assert.ok(typedef.includes(`'${k}'`), `types.js WorkshopType enthält ${k}`);
  }
});

test('Add-/Update-Formular: Labels und Typen stimmen in Formular, Issue-Vorlage und beiden Workflows überein', () => {
  const form = formPairs();
  assert.deepEqual(Object.values(form).sort(), [...KEYS].sort(), 'add-space-form.js WORKSHOPS = alle Typen');

  const tpl = read('.github/ISSUE_TEMPLATE/add-makerspace.yml');
  const section = tpl.slice(tpl.indexOf('id: workshops'), tpl.indexOf('id: url'));
  const tplLabels = [...section.matchAll(/- label: "([^"]+)"/g)].map(m => m[1]);
  assert.deepEqual([...tplLabels].sort(), Object.keys(form).sort(), 'Issue-Vorlage: Checkbox-Labels = Formular-Labels');

  for (const f of ['.github/workflows/add-makerspace-pr.yml', '.github/workflows/update-makerspace-pr.yml']) {
    const text = read(f);
    const block = text.slice(text.indexOf('workshopLabelMap'), text.indexOf('};', text.indexOf('workshopLabelMap')));
    assert.deepEqual(pairs(block), form, `${f}: workshopLabelMap = Formular-Labels`);
  }
});
