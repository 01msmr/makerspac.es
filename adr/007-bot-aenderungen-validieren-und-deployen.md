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
6. **Crawler schlagen nur NEUERE Änderungen vor — nach Inhalt, nicht nach der Existenz von Issues:** `tools/lib/crawl-selection.js`. Ist-Stand ist der verschmolzene (wie die Karte; vorher las nur `locations.json`, in der 0 Workshops stehen, die 91 umgesetzten lagen im Enrichment). Ein Fund wird übersprungen, wenn er dem integrierten Stand gleicht oder dem JÜNGSTEN früheren Vorschlag (Website seit dem letzten Crawl unverändert, ob offen, übernommen oder abgelehnt); jede andere Abweichung (hinzu, weg, anders) ist eine neuere Änderung und wird vorgeschlagen, offene ältere Vorschläge mit anderem Inhalt werden dabei geschlossen („Ersetzt durch #N“). Ohne `gh`-Zugriff bricht das Anlegen von Issues ab, statt Doppelte zu riskieren. (Die frühere Vorrang-Regel „locations.json gewinnt“ ist mit ADR-008 entfallen.)

## Verworfen

- Nur auf den PR-Check vertrauen (läuft für Bot-PRs nicht zuverlässig; Ursache nicht bestätigt).
- Ganzer Lauf bricht bei einem ungültigen Vorschlag ab (Label `ok` bliebe, der Cron würde ewig neu starten).
- Personal Access Token für Bot-Merges (löst CI/Deploy aus, aber Secret-Verwaltung und breitere Rechte).

## Konsequenzen

- Update-Änderungen aus dem Formular werden **direkt nach `main` committet** (kein Bot-PR mehr, Nachtrag 2026-11-22): Der PR-Check lief bei sofort gemergten Bot-PRs ohne Jobs (roter Haken, vermutlich wegen des Merges in derselben Sekunde); die Prüfung passiert ohnehin vorher im Workflow. Nachweis: Commit + Kommentar am Issue; Zurückdrehen per Revert. Add-PRs bleiben PRs (Mensch mergt).
- Alle Datei-Schreiber (Update/Add/Apply) checken `main` zum Ausführungszeitpunkt aus (`ref: main`); sonst arbeitet ein in der Concurrency-Gruppe wartender Lauf auf veraltetem Stand und kollidiert.
- Neue Datei-Schreiber müssen die Wächter-Regeln erfüllen oder begründet in `NO_DEPLOY_NEEDED` stehen.
