# ADR-009: Admin-Review — der Space ist die Einheit

**Status:** Akzeptiert
**Datum:** 2026-11-24

---

## Kontext

Der Admin (ADR-006) prüft je Art (SpaceAPI, Workshops, Kalender, Treffen) ein Issue nach dem anderen. Beim Prüfen fällt oft auf, dass am selben Space noch mehr veraltet ist oder fehlt — das lässt sich im Reiter der gerade offenen Art nicht korrigieren, und mehrere Vorschläge zu einem Space müssen einzeln in mehreren Reitern entschieden werden.

## Entscheidung

- Neuer Reiter **„Spaces“** — erster Reiter und Standard der Admin-Seite (`/admin/`, kein eigenes HTML; `spaces.js` läuft im Admin und nutzt dessen Login, Daten, Toasts und „Übernehmen“): ein Space = eine Karte mit **allen** Eigenschaften (Workshops, Kalender, SpaceAPI, Treffen/Gründung). Offene Vorschläge sind vorbelegt, jede Eigenschaft ist änderbar, auch leere.
- **Entscheidung pro Space** (`y` übernehmen · `n` alles verwerfen · `ä` später · `z` rückgängig); je Eigenschaft ein Häkchen „übernehmen / verwerfen“.
- **Radio-Leiste „Bearbeiten“** (Alles | eine Eigenschaft) begrenzt die Bearbeitung; die Warteschlange zeigt dann nur Spaces mit Vorschlag für diese Eigenschaft. Verhindert Fehlbedienung bei Reihenprüfungen.
- **Später** schiebt den Space ans Ende der Warteschlange (lokal, `localStorage`).
- **Schreiben nur über Issues** (wie ADR-006, PAT ohne Contents-Write): Vorschlag vorhanden → Body anpassen + Label `ok`; Verwerfen → Issue schließen (`not_planned`); Eigenschaft ohne Vorschlag, aber im Admin eingegeben → **neues Issue** im selben Format wie die Crawler-Issues (+ `ok`). Übernommen wird wie bisher durch `apply-all-issues.yml` (1 Commit, 1 Deploy). Kein neuer Workflow, kein neues Datenformat.
- **Rückgängig** macht die GitHub-Änderungen rückgängig (Label/Body/Status; neu angelegte Issues werden geschlossen) und öffnet den Space wieder **mit allen zuletzt gesetzten Häkchen und Werten** — ein einzelnes Detail lässt sich ändern, ohne alle Entscheidungen neu zu treffen. Bereits übernommene Issues lassen sich nicht zurücksetzen (Hinweis).
- **Hilfen:** Quell-Icons (Website, Kalender, W = Treffen-Quelle, Tür = SpaceAPI; nur vorhandene/vermutete Links, vermutete gestrichelt), ID-Link öffnet die gefundene Infoseite, leere „wichtige“ Eigenschaften sind hervorgehoben (Eigenschaft bei > 35 % der Spaces gefüllt). Tasten: `y` `n` `ä` `z` und `←` `→` (Bearbeiten-Auswahl durchschalten, ohne Umbruch); **nie** `e` `l` `w` `a` `s` `d` (Vivaldi-Direktkürzel) und keine Ziffern (Browser: Zoom/Tab-Wechsel).
- Die Reiter SpaceAPI / Workshops / Kalender / Weekly bleiben dahinter unverändert bestehen. Beim Wechsel dorthin werden Warteschlangen und ok-Zähler abgeglichen.

## Später (nicht Teil dieser Entscheidung)

Adresse/Name/Link/Stil bearbeiten (neue Art `space-edit` + Apply-Skript), Prüfer-Identität/Rollen (Kommentar „✓ @login“, Sperre „in Bearbeitung“), gemeinsame Sperrliste verworfener Vorschläge im Crawler.

## Verworfen

- Direkt-Commit per Contents-Write-PAT (widerspricht ADR-006) · Reiter „Spaces“ in der bestehenden Seite (erbt deren Komplexität) · eigenes Backend.

## Konsequenzen

- Neue Issues aus dem Admin haben dieselbe Form wie Crawler-Issues → Apply-Skripte und Validierung (`validateProposal`) greifen unverändert.
- Zwei Review-Ansichten parallel (Spaces + Reiter je Art), bis „Spaces“ sich bewährt hat; die Ansichten teilen sich Daten, Token und Übernehmen-Knopf. Entscheidungen in „Spaces“ stellen die ok-Zähler der Arten nur näherungsweise ein (`bumpOk`); `refreshQueues()` korrigiert sie beim Wechsel/Aktualisieren.
