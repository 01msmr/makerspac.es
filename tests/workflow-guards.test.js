// tests/workflow-guards.test.js — Wächter für Workflows, die Daten ändern
// Hintergrund (Vorfall 2026-11-22): Bot-Merges per GITHUB_TOKEN lösen weder CI noch Deploy aus. Der Update-Workflow
// mergte ungeprüft und deployte nicht, der PR-Check lief gar nicht (0 Jobs), die Rückmeldung behauptete „Deploy läuft“.
// Diese Regeln sorgen dafür, dass das bei neuen/geänderten Workflows nicht wieder passiert.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, existsSync } from 'node:fs';

const ROOT = new URL('../', import.meta.url);
const read = rel => readFileSync(new URL(rel, ROOT), 'utf8');
const workflows = readdirSync(new URL('.github/workflows/', ROOT)).filter(f => f.endsWith('.yml'))
  .map(f => ({ name: f, text: read(`.github/workflows/${f}`) }));

/** Workflows, die bewusst ohne Deploy-Dispatch nach git push/merge auskommen (mit Begründung) */
const NO_DEPLOY_NEEDED = {
  'deploy.yml': 'ist der Deploy selbst (pusht nur Tag/SW-Bump mit [skip ci])',
  'generate-sitemap.yml': 'pusht sitemap.xml mit [skip ci]; sitemap.xml wird bewusst nicht von deploy.yml hochgeladen',
};
const VALIDATE_ACTION = './.github/actions/validate-data';

test('Workflows, die nach main pushen/mergen, starten den Deploy explizit (Bot-Pushes lösen keinen aus)', () => {
  for (const { name, text } of workflows) {
    if (!/git push|gh pr merge/.test(text) || name in NO_DEPLOY_NEEDED) continue;
    assert.match(text, /workflow run deploy\.yml/, `${name}: pusht/mergt, startet aber keinen Deploy`);
  }
});

test('Workflows mit Deploy-Dispatch haben actions: write', () => {
  for (const { name, text } of workflows) {
    if (/workflow run deploy\.yml/.test(text)) assert.match(text, /actions:\s*write/, `${name}: gh workflow run braucht actions: write`);
  }
});

test('Workflows, die per PR/Merge Daten ändern, validieren vorher (CI-Check für Bot-PRs läuft nicht zuverlässig)', () => {
  for (const { name, text } of workflows) {
    if (!/gh pr merge|create-pull-request/.test(text)) continue;
    assert.ok(text.includes(VALIDATE_ACTION), `${name}: erstellt/mergt PRs ohne ${VALIDATE_ACTION}`);
  }
});

test('Validate-Action wird erst nach actions/checkout verwendet', () => {
  for (const { name, text } of workflows) {
    const use = text.indexOf(VALIDATE_ACTION);
    if (use === -1) continue;
    const checkout = text.indexOf('actions/checkout');
    assert.ok(checkout !== -1 && checkout < use, `${name}: ${VALIDATE_ACTION} braucht vorher actions/checkout`);
  }
});

test('Apply-Skripte prüfen loc-enrichment.json vor dem Schreiben/Schließen', () => {
  const tools = readdirSync(new URL('tools/', ROOT)).filter(f => /^apply-.*\.js$/.test(f));
  assert.ok(tools.length >= 3);
  for (const f of tools) {
    assert.match(read(`tools/${f}`), /validate(Enrichment|AfterPatch|Proposal)/, `tools/${f}: keine Validierung vor dem Schreiben`);
  }
});

test('CI (validate.yml) nutzt die gemeinsame Prüfung und npm run validate:ci deckt alles ab', () => {
  assert.ok(existsSync(new URL('.github/actions/validate-data/action.yml', ROOT)));
  assert.ok(workflows.find(w => w.name === 'validate.yml').text.includes(VALIDATE_ACTION));
  const ci = JSON.parse(read('package.json')).scripts['validate:ci'];
  for (const part of ['npm run validate', 'validate-enrichment.test.js', 'workflow-guards.test.js']) assert.ok(ci.includes(part), `validate:ci fehlt: ${part}`);
  assert.ok(JSON.parse(read('package.json')).scripts.validate.includes('validate-enrichment.js'));
});

test('Feedback-Texte versprechen keinen Deploy, den der Workflow nicht startet', () => {
  for (const { name, text } of workflows) {
    if (/Deploy (läuft|wurde gestartet)/.test(text)) assert.match(text, /workflow run deploy\.yml/, `${name}: Rückmeldung nennt Deploy, startet aber keinen`);
  }
});

test('Workflows der Concurrency-Gruppe data-apply holen main zum Ausführungszeitpunkt (Vorfall: veralteter Checkout → Merge-Konflikt)', () => {
  // Ohne `ref: main` gilt der Commit beim AUSLÖSEN. Wartet der Lauf in der Gruppe, schreibt er sonst auf Basis eines
  // älteren Stands und der PR/Push kollidiert mit dem Lauf davor (update-space-id-103, 2026-11-22).
  for (const { name, text } of workflows) {
    if (!/group:\s*data-apply/.test(text)) continue;
    assert.match(text, /actions\/checkout@v4\s*\n\s*with:\s*\n\s*ref:\s*main/, `${name}: actions/checkout braucht "with: ref: main"`);
  }
});

test('Update-Workflow wartet auf den PR-Check, bevor er mergt (sofortiger Merge ließ den Check ohne Jobs abbrechen)', () => {
  const t = workflows.find(w => w.name === 'update-makerspace-pr.yml').text;
  const wait = t.indexOf('Auf PR-Check warten'), merge = t.indexOf('gh pr merge');
  assert.ok(wait !== -1 && merge !== -1 && wait < merge, 'Wartestep muss vor gh pr merge stehen');
  assert.match(t, /check-runs/);
});
