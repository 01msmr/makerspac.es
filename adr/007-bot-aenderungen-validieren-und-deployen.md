# ADR-007: Bot-Änderungen — vor dem Schreiben validieren, Deploy explizit starten

**Status:** Akzeptiert
**Datum:** 2026-11-22

---

## Kontext

Vorfall: Der Workflow `update-makerspace-pr.yml` (Formular-Issue → PR) mergte automatisch per `GITHUB_TOKEN`.

- Der PR-Check „Validate & Test" lief nicht (0 Jobs, Abbruch nach 2 s — bei allen 4 bisherigen Bot-PRs); gemergt wurde trotzdem, ungeprüft.
- Merges/Pushes mit `GITHUB_TOKEN` lösen keine Workflows aus: kein Deploy. Die Rückmeldung im Issue behauptete trotzdem „der Deploy läuft bereits". Änderungen (Weekly, Kalender) blieben unveröffentlicht.
- `loc-enrichment.json`, die Datei, in die alle Bots schreiben, wurde nirgends geprüft; 7 Fehler lagen bereits in den Daten (Tippfehler bei Workshop-Typen, Duplikate, Leerzeichen in einer URL).

## Entscheidung

1. **Validierung dort, wo geschrieben wird**, nicht in einem nachgelagerten CI-Lauf: Composite-Action `.github/actions/validate-data` (`npm run validate:ci`) vor PR/Merge in den Update-/Add-Workflows; die Apply-Skripte prüfen **jeden Vorschlag isoliert** (`validateProposal`, nur Fehler der eigenen ID) vor dem Schreiben und Schließen. Ungültige Vorschläge werden übersprungen: Kommentar am Issue, Label `ok` entfernt, Label `problem` gesetzt — sie tauchen im Admin-Review in ihrem Reiter wieder auf (rot, mit dem Grund aus dem Kommentar), der Rest läuft durch. Der Admin-Reiter „Probleme" zeigt zusätzlich ungelöste Workflow-Fehler und hängende `ok`-Issues (Dinge ohne Ja/Nein-Entscheidung zu einem einzelnen Issue).
2. **Neuer Validator** `tests/validate-enrichment.js` (Teil von `npm run validate` und CI).
3. **Deploy explizit:** Jeder Workflow, der nach `main` schreibt/mergt, startet `deploy.yml` selbst (`actions: write`); Rückmeldungen dürfen nur Zugesagtes nennen.
4. **Wächter-Test** `tests/workflow-guards.test.js` erzwingt 1–3 für bestehende und neue Workflows (mit begründeter Ausnahmeliste).
5. `concurrency: data-apply` für alle Datei-Schreiber.
6. **Crawler schlagen nichts Umgesetztes erneut vor:** `tools/lib/crawl-selection.js` — Ist-Stand ist der verschmolzene (wie die Karte, `enrichment-merge.js`; vorher las nur `locations.json`, in der 0 Workshops stehen, die 91 umgesetzten lagen im Enrichment) und Spaces mit vorhandenem Issue (offen oder geschlossen) werden übersprungen; ohne `gh`-Zugriff bricht das Anlegen von Issues ab, statt Doppelte zu riskieren. Apply-Skripte schließen Vorschläge, die an fest in `locations.json` stehenden Werten (haben Vorrang) scheitern würden.

## Verworfen

- Nur auf den PR-Check vertrauen (läuft für Bot-PRs nicht zuverlässig; Ursache nicht bestätigt).
- Ganzer Lauf bricht bei einem ungültigen Vorschlag ab (Label `ok` bliebe, der Cron würde ewig neu starten).
- Personal Access Token für Bot-Merges (löst CI/Deploy aus, aber Secret-Verwaltung und breitere Rechte).

## Konsequenzen

- Der rote PR-Check bei Bot-PRs bleibt vorerst kosmetisch (Ursache offen); die echte Prüfung passiert im Workflow.
- Neue Datei-Schreiber müssen die Wächter-Regeln erfüllen oder begründet in `NO_DEPLOY_NEEDED` stehen.
