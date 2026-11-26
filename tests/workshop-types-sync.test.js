// Wächter: Quelle aller Workshop-Typen ist workshop-types.js (WORKSHOP_TYPES, inkl. englischem Formular-Label).
// Daraus erzeugt `npm run sync:forms` .github/workshop-labels.json (gelesen von den PR-Workflows) und die Checkboxen der
// Issue-Vorlage. Dieser Test schlägt an, wenn nach einer Ergänzung/Umbenennung nicht neu erzeugt wurde oder ein Typ an einer
// der übrigen, von Hand gepflegten Stellen (lang.json, Stichwörter, Typedef) fehlt.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { WORKSHOP_TYPES } from '../workshop-types.js';
import { WORKSHOP_KEYWORDS } from '../workshop-keywords.js';
import { renderLabelsJson, renderTemplate, LABELS_FILE, TEMPLATE_FILE } from '../tools/sync-workshop-forms.js';

const read = f => readFileSync(new URL('../' + f, import.meta.url), 'utf-8');
const KEYS = Object.keys(WORKSHOP_TYPES);
const LANGS = ['de', 'en', 'fr', 'it', 'nl', 'da', 'uk'];
const HINT = ' — bitte "npm run sync:forms" ausführen und die Dateien mit committen';

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

test('jeder Typ hat ein eindeutiges englisches Formular-Label', () => {
  const labels = Object.values(WORKSHOP_TYPES).map(t => t.label);
  for (const [k, t] of Object.entries(WORKSHOP_TYPES)) assert.ok(t.label?.trim(), `label für ${k}`);
  assert.equal(new Set(labels).size, labels.length, 'Labels doppelt');
  // „[X] Label“ wird per Teilstring gesucht: ein Label darf nicht Präfix eines anderen sein
  for (const a of labels) for (const b of labels) if (a !== b) assert.ok(!b.startsWith(a), `"${a}" ist Präfix von "${b}"`);
});

test('erzeugte Dateien sind aktuell: workshop-labels.json und Checkboxen der Issue-Vorlage', () => {
  assert.equal(read(LABELS_FILE), renderLabelsJson(), `${LABELS_FILE} veraltet${HINT}`);
  assert.equal(read(TEMPLATE_FILE), renderTemplate(read(TEMPLATE_FILE)), `${TEMPLATE_FILE} veraltet${HINT}`);
});

test('Workflows und Formular lesen die Typen aus der gemeinsamen Quelle (keine eigene Label-Liste)', () => {
  for (const f of ['.github/workflows/add-makerspace-pr.yml', '.github/workflows/update-makerspace-pr.yml']) {
    const text = read(f);
    assert.match(text, /JSON\.parse\(fs\.readFileSync\('\.github\/workshop-labels\.json'/, `${f} liest workshop-labels.json`);
    assert.ok(!/"Screen printing"\s*:/.test(text), `${f}: keine eingebaute Label-Liste mehr`);
  }
  assert.match(read('add-space-form.js'), /Object\.entries\(WORKSHOP_TYPES\)/, 'add-space-form.js leitet die Liste aus WORKSHOP_TYPES ab');
});
