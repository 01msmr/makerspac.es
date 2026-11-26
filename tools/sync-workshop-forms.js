// tools/sync-workshop-forms.js — erzeugt aus workshop-types.js (WORKSHOP_TYPES[].label) die Stellen, die kein Browser-Modul
// importieren können: `.github/workshop-labels.json` (Label → Schlüssel, gelesen von add-/update-makerspace-pr.yml) und die
// Checkbox-Liste „Workshop types“ in `.github/ISSUE_TEMPLATE/add-makerspace.yml` (statisches YAML).
//
//   npm run sync:forms           schreibt beide Dateien
//   node tools/sync-workshop-forms.js --check   Exit 1, wenn eine Datei veraltet ist (Test: tests/workshop-types-sync.test.js)
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { WORKSHOP_TYPES } from '../workshop-types.js';

const root = new URL('../', import.meta.url);
export const LABELS_FILE = '.github/workshop-labels.json';
export const TEMPLATE_FILE = '.github/ISSUE_TEMPLATE/add-makerspace.yml';
export const BEGIN = '        # BEGIN workshop-options (generiert aus workshop-types.js: npm run sync:forms — nicht von Hand ändern)';
export const END = '        # END workshop-options';

/** Inhalt von workshop-labels.json: { "Bike repair": "bike", … } in Reihenfolge von WORKSHOP_TYPES */
export function renderLabelsJson(types = WORKSHOP_TYPES) {
  return JSON.stringify(Object.fromEntries(Object.entries(types).map(([key, { label }]) => [label, key])), null, 2) + '\n';
}

/** Ersetzt den Block zwischen BEGIN/END in der Issue-Vorlage durch die Checkboxen aller Typen */
export function renderTemplate(text, types = WORKSHOP_TYPES) {
  const i = text.indexOf(BEGIN), j = text.indexOf(END);
  if (i < 0 || j < i) throw new Error(`${TEMPLATE_FILE}: Marker "BEGIN/END workshop-options" fehlen`);
  const boxes = Object.values(types).map(({ label }) => `        - label: "${label}"`).join('\n');
  return text.slice(0, i) + BEGIN + '\n' + boxes + '\n' + text.slice(j);
}

const read = f => (existsSync(new URL(f, root)) ? readFileSync(new URL(f, root), 'utf-8') : '');   // fehlende Datei = veraltet

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const next = { [LABELS_FILE]: renderLabelsJson(), [TEMPLATE_FILE]: renderTemplate(read(TEMPLATE_FILE)) };
  const stale = Object.keys(next).filter(f => read(f) !== next[f]);
  if (process.argv.includes('--check')) {
    if (stale.length) { console.error(`Veraltet: ${stale.join(', ')} — bitte "npm run sync:forms" ausführen.`); process.exit(1); }
    console.log('Workshop-Formulare sind aktuell.');
  } else {
    for (const f of stale) writeFileSync(new URL(f, root), next[f]);
    console.log(stale.length ? `Aktualisiert: ${stale.join(', ')}` : 'Nichts zu tun (bereits aktuell).');
  }
}
