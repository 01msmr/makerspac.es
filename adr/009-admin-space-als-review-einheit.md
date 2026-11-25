# ADR-009: Admin-Review — der Space ist die Einheit

**Status:** Akzeptiert
**Datum:** 2026-11-24

---

## Kontext

Der Admin (ADR-006) prüft je Art (SpaceAPI, Workshops, Kalender, Treffen) ein Issue nach dem anderen. Beim Prüfen fällt oft auf, dass am selben Space noch mehr veraltet ist oder fehlt — das lässt sich im Reiter der gerade offenen Art nicht korrigieren, und mehrere Vorschläge zu einem Space müssen einzeln in mehreren Reitern entschieden werden.

## Entscheidung

- Neuer Reiter **„Spaces“** — erster Reiter und Standard der Admin-Seite (`/admin/`, kein eigenes HTML; `spaces.js` läuft im Admin und nutzt dessen Login, Daten, Toasts und „Übernehmen“): ein Space = eine Karte mit **allen** Eigenschaften (Workshops, Kalender, SpaceAPI, Treffen/Gründung). Offene Vorschläge sind vorbelegt, jede Eigenschaft ist änderbar, auch leere.
- **Entscheidung pro Space** (`y` übernehmen · `n` verwerfen · `ä` später · `z` zurück); je Eigenschaft ein Häkchen „übernehmen / verwerfen“.
- **Radio-Leiste „Bearbeiten“** (Alles | eine Eigenschaft) begrenzt die Bearbeitung; die Warteschlange zeigt dann nur Spaces mit Vorschlag für diese Eigenschaft. Verhindert Fehlbedienung bei Reihenprüfungen.
- **Später** schiebt den Space ans Ende der Warteschlange (lokal, `localStorage`).
- **Schreiben nur über Issues** (wie ADR-006, PAT ohne Contents-Write): Vorschlag vorhanden → Body anpassen + Label `ok`; Verwerfen → Issue schließen (`not_planned`); Eigenschaft ohne Vorschlag, aber im Admin eingegeben → **neues Issue** im selben Format wie die Crawler-Issues (+ `ok`). Übernommen wird wie bisher durch `apply-all-issues.yml` (1 Commit, 1 Deploy). Kein neuer Workflow, kein neues Datenformat.
- **Rückgängig** macht die GitHub-Änderungen rückgängig (Label/Body/Status; neu angelegte Issues werden geschlossen) und öffnet den Space wieder **mit allen zuletzt gesetzten Häkchen und Werten** — ein einzelnes Detail lässt sich ändern, ohne alle Entscheidungen neu zu treffen. Bereits übernommene Issues lassen sich nicht zurücksetzen (Hinweis).
- **Hilfen:** Quell-Icons (Website, Kalender, W = Treffen-Quelle, Tür = SpaceAPI; nur vorhandene/vermutete Links, vermutete gestrichelt), ID-Link öffnet die gefundene Infoseite, leere „wichtige“ Eigenschaften sind hervorgehoben (Eigenschaft bei > 35 % der Spaces gefüllt). Tasten: `y` `n` `ä` `z` und `←` `→` (Bearbeiten-Auswahl durchschalten, ohne Umbruch); **nie** `e` `l` `w` `a` `s` `d` (Vivaldi-Direktkürzel) und keine Ziffern (Browser: Zoom/Tab-Wechsel).
- **Teil-Vorschläge beim Treffen:** Enthält ein Vorschlag nur einen Teil (z. B. nur die Gründung), werden die übrigen Teile in der Karte mit dem **aktuellen Wert vorbelegt** (nur Anzeige, `displayValue`); nur die Eingaben, die sich vom aktuellen Stand unterscheiden, sind grün gerahmt. **Geschrieben wird nur, was der Vorschlag enthält oder was du änderst** (`weeklyWriteValue`) — bestehende Daten werden nie mit identischen Werten neu geschrieben. Entfernen eines vorhandenen Treffens/einer Gründung durch Leeren der Felder wird abgelehnt (`removesExisting`). **Ausdrückliches Entfernen:** Die Wochentag-Auswahl beginnt mit **„kein weekly“**, danach „–“ (keine Info, Vorauswahl), dann Montag … Sonntag; gewählt wird (Uhrzeit wird geleert/gesperrt, Ergebnis-Label rot „Weekly wird entfernt“). Das Issue trägt dann `"weekly": null`; `tools/apply-weekly-issues.js` löscht den Schlüssel `weekly` im Enrichment (ein dadurch leerer Eintrag verschwindet), die Gründung bleibt unberührt; der Changelog zeigt „entfernt“. Hat der Space kein Treffen, ist die Option wirkungslos.
- **Keine Beispieltexte in Inhaltsfeldern:** Eingabefelder für Inhalte (Freitext, URLs, Koordinaten, Uhrzeit, Name/Link im Add-/Edit-Overlay) haben keine Platzhalter mit Beispielwerten, die wie Daten wirken (höchstens das neutrale „https://“).
- **Weekly und Gründung getrennt:** zwei Zeilen („Wöchentliches Treffen“, „Gründung“) mit eigenem Aktuell-Wert und Häkchen **und je eigenem Issue** (Crawler: `Treffen-Daten: <Name>` bzw. `… (Gründung)`, beide Label `weekly-data`; der Vergleich neuer Funde läuft je Eigenschaft). Dadurch bedeutet „verwerfen“ einfach „Issue schließen“, und der Crawler schlägt Verworfenes nicht erneut vor. Alte kombinierte Issues (beides in einem) lassen sich nur gemeinsam und unverändert entscheiden.
- **Bearbeiten-Auswahl ≠ „Alles“:** Es wird nur der Inhaltsbereich der gewählten Eigenschaft gezeigt (Zeile samt ihren Belegen); die übrigen Zeilen sind ausgeblendet (nicht nur abgedunkelt). Fundstellen, „zuvor nicht übernommen“ und der SpaceAPI-Vergleich stehen **direkt unter dem jeweiligen Vorschlag** (`evidenceFor`), nicht gesammelt unter der Tabelle.
- **Seitenfenster:** Links der Karte (**ID + Name als ein Link**, Quell-Icons) öffnen die Webseite in einem **Seitenfenster rechts** (iframe, Standard: Webseite des Space), nicht in einem neuen Tab; „im Tab öffnen“ als Ausweg für Seiten, die sich nicht einbetten lassen. Ziehbarer **Trenner** (breiter Griff, 4 px dunkle Linie, auch ← → bei Fokus), Breite wird gemerkt (20–60 %, die Karte behält ≥ 640 px). Auf Touch und Fenstern < 1100 px gibt es kein Seitenfenster (neuer Tab).
- **Freitext** (oberhalb der Tabelle, auch aus der Zwischenablage): wird **erst beim Verlassen des Feldes** ausgewertet (nie beim Tippen/Einfügen, die Zwischenablage nur über den Knopf **„Einfügen“**, rechts in der Breite der „übernehmen“-Spalte) und erkennt in einem Zug Workshops, Treffen (Wochentag + Uhrzeit), Gründung sowie Kalender- und SpaceAPI-URLs (`analyzeFreeText`, nutzt die Crawler-Extraktion `tools/lib/weekly-extract.js`); überschreibt nur Zeilen, die in der Bearbeiten-Auswahl aktiv sind. **Treffen-Uhrzeit nur im 30-Minuten-Raster** (`:00`/`:30`; Eingabe `step`, Validierung, erkannte Zeiten werden gerundet und der Hinweis nennt es).
- Die Reiter SpaceAPI / Workshops / Kalender / Weekly bleiben dahinter unverändert bestehen. Beim Wechsel dorthin werden Warteschlangen und ok-Zähler abgeglichen.

## Eintrag bearbeiten (Name, Adresse, Link, Stil) — nicht im Admin

Der frühere Link „Eintrag bearbeiten“ im Kartenkopf ist entfallen (wenig nützlich, führt aus dem Review heraus). Korrekturen laufen weiter über den **Stift im Popup** der Karte bzw. `/?edit=ID` (Bearbeiten-Overlay); mit dem Admin-Token legt das Overlay das Korrektur-Issue direkt per REST an.

## Weitere Prüfer (nur FGT/PAT)

Jede Person bekommt Collaborator-Rechte am Repo und einen **eigenen Fine-grained PAT** (nur dieses Repo, Issues R/W; Admins zusätzlich Actions R/W). Kein Backend, kein OAuth.
- **Identität + Rolle:** `GET /user` und `GET /repos/{repo}` (→ `permissions` des Tokens). Schreibrecht (push/maintain/admin) = **Admin** (darf „Übernehmen“, sieht „Probleme“); Triage/Lesen = **Reviewer** (entscheidet, korrigiert, verwirft; übernommen wird automatisch durch den Cron ab 10 ok oder 1 h Ruhe). Chip „@login · Rolle“ in der Kopfzeile. Unbekannt (z. B. `/user` verweigert) → bisheriges Verhalten.
- **Prüfpfad:** Jede Entscheidung (ok, angepasst, verworfen, angelegt, rückgängig) schreibt einen Kommentar „✓ … — @login (Admin-Review)“ ans Issue (best effort), in „Spaces“ und in den Reitern.
- **„In Bearbeitung“:** Wer einen Space öffnet, wird dessen offenen Vorschlägen als Assignee zugewiesen und beim Weitergehen wieder entfernt. Andere Prüfer sehen die Zuweisung (frischer als 30 min), der Space rutscht in ihrer Warteschlange ans Ende, die Karte zeigt „@x bearbeitet diesen Space“; sie weisen sich dort nicht zusätzlich zu. Die Sperre verfällt nach 30 min ohne Änderung (Tab zu).
- Hinweis: Triage-Rechte können Labels/Status/Zuweisungen setzen; ob sie fremde Issue-Bodys ändern dürfen (korrigieren), hängt von den Repo-Rechten ab — andernfalls Write-Rolle vergeben.

## Später (nicht Teil dieser Entscheidung)

Vier-Augen-Prinzip für riskante Felder, Aufteilung nach Land/Region, gemeinsame Sperrliste verworfener Vorschläge im Crawler.

## Verworfen

- Direkt-Commit per Contents-Write-PAT (widerspricht ADR-006) · Reiter „Spaces“ in der bestehenden Seite (erbt deren Komplexität) · eigenes Backend.

## Konsequenzen

- Neue Issues aus dem Admin haben dieselbe Form wie Crawler-Issues → Apply-Skripte und Validierung (`validateProposal`) greifen unverändert.
- Zwei Review-Ansichten parallel (Spaces + Reiter je Art), bis „Spaces“ sich bewährt hat; die Ansichten teilen sich Daten, Token und Übernehmen-Knopf. Entscheidungen in „Spaces“ stellen die ok-Zähler der Arten nur näherungsweise ein (`bumpOk`); `refreshQueues()` korrigiert sie beim Wechsel/Aktualisieren.
