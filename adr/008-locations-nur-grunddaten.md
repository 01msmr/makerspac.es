# ADR-008: `locations.json` enthält nur Grunddaten

Status: akzeptiert

## Kontext
Ergänzungsdaten (Workshops, Events, SpaceAPI, Weekly) liegen in `loc-enrichment.json`. Reste in `locations.json`
erzwangen eine Vorrang-Regel („locations gewinnt“), die in Merge, Admin, Apply-Skripten und Doku Sonderfälle
(Sperren) erzeugte und irritierte. Datumsfelder waren uneinheitlich (`init`, `datacheck.latest`, …).

## Entscheidung
- `locations.json`: nur `name, ID, loc, style, link, dates`; `dates` nur `space.init` und `space.edited.latest` (YYYYMMDD; `space.init` = Gründung des Vereins/Trägers, nicht des Standorts; Platzhalter 20010000).
- `loc-enrichment.json`: nur `workshops, events, spaceapi, weekly`.
- Keine Vorrang-Regel mehr; `applyEnrichment` legt Enrichment-Felder einfach darüber. Strikte Validatoren (`tests/validate-locations.js`, `validate-enrichment.js`) lehnen Fremdfelder ab.
- `space.edited.latest` wird beim Merge eines Add/Edit-PRs und beim Übernehmen bestätigter Admin-Änderungen auf das Berliner Tagesdatum gesetzt; `/admin/` zeigt den alten Stand als `YYYY-MM-DD`.

## Folgen
Kartendaten bleiben identisch (nur `dates` in den Splits ändert sich). Neue Felder brauchen eine bewusste Validator-Erweiterung.
