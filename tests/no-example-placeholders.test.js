// tests/no-example-placeholders.test.js — keine Beispielwerte als Platzhalter in Inhaltsfeldern (wirken wie echte Daten)
// Läuft mit: node --test tests/no-example-placeholders.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = f => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
const ALLOWED = new Set(['https://', 'github_pat_…']);   // neutrales Schema-Präfix bzw. Token-Format

test('1: Admin (Spaces + Reiter) und Add-/Edit-Overlay: Platzhalter nie mit Beispielwerten', () => {
  for (const f of ['admin/spaces.js', 'admin/index.html', 'embed-overlay.js']) {
    const src = read(f);
    for (const m of src.matchAll(/placeholder(?:=|\s*:\s*)(?:"([^"]*)"|'([^']*)')/g)) {
      const v = m[1] ?? m[2];
      if (v.startsWith('${t(') || v.includes('${')) continue;             // i18n-Hinweise (Name, Suche) — separat geprüft
      assert.ok(ALLOWED.has(v), `${f}: Platzhalter „${v}“`);
    }
    assert.ok(!/yourspace|47\.7126816|9\.3995537|gegründet 2015|Toolbox Bodensee/.test(src), `${f}: Beispielwert im Code`);
  }
});

test('2: i18n-Platzhalter: Lookup ohne Beispiel in 7 Sprachen, kein Adresszusatz-Beispiel', () => {
  const am = JSON.parse(read('lang.json')).addMakerspace;
  for (const l of ['de', 'en', 'fr', 'it', 'nl', 'da', 'uk']) { assert.ok(am.lookupPlaceholder[l], l); assert.ok(!/Toolbox|\d/.test(am.lookupPlaceholder[l]), `${l}: ${am.lookupPlaceholder[l]}`); }
  assert.equal(am.addressAdditionPlaceholder, undefined);
});

test('3: Link im Spaces-Reiter heißt „Eintrag bearbeiten“', () => {
  const html = read('admin/index.html');
  assert.match(html, /id="sp-edit"[^>]*title="Name, Adresse, Website, Zielgruppe[^"]*"[\s\S]*?Eintrag bearbeiten<\/a>/);
  assert.ok(!html.includes('Stammdaten'));
});
