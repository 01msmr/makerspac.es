# ADR-006: Admin-Review ohne Backend

**Status:** Akzeptiert
**Datum:** 2026-11-21

---

## Kontext

Die wöchentlichen `SpaceAPI:`-Issues (Directory Sync) sollen schnell und von jedem Rechner aus geprüft werden können.

## Entscheidung

- Statische Seite `/admin/` (Vanilla, kein Build; ADR-001/002), `noindex`, `Disallow` in `robots.txt`, nicht verlinkt.
- Login = Fine-grained PAT im `localStorage` (nur dieses Repo, Issues R/W + Actions R/W, mit Ablauf). Kein Contents-Write.
- Die Seite ändert **nur Issues**: `y` = Label `ok`, geänderte Eingabe (Endpoint / Workshops / Kalender-URL) ersetzt dabei den JSON-Block des Bodys, `n` = schließen (`not_planned`).
- „Übernehmen“ = `workflow_dispatch` von `apply-spaceapi-issues.yml` mit `mode=apply-ok`: nur `ok`-Issues, Live-Check des Endpoints, ein Commit, ein Deploy. Der Workflow bleibt einziger Schreiber der Daten.
- `locations.json` / `loc-enrichment.json` kommen von `raw.githubusercontent.com` (nicht deployt, CORS-fähig).
- Service Worker fängt `/admin/` nicht ab.
- Gleiches Muster für `[Workshop-Daten]`-Issues (Reiter „Workshops"): `ok`-Label ersetzt die Checkbox „Freigegeben" (die Checkbox gilt weiter), „anpassen" ersetzt die Typ-Liste im JSON-Block. Apply: `apply-workshop-issues.yml` (`apply`).
- Auto-Übernehmen serverseitig: Cron `auto-apply-spaceapi.yml` (je Art ≥10 `ok`-Issues oder 1 h Ruhe). Apply-Workflows teilen `concurrency: data-apply` und deployen nur bei geänderter Datei.
- URL-Scan: Der Browser darf fremde Seiten nicht lesen (CORS) → `/admin/` startet `scan-workshop-url.yml`; der Workflow kommentiert das Issue mit den erkannten Typen, die Seite pollt, liest und löscht den Kommentar. Kein Drittanbieter-Proxy.
- Weitere Arten: Reiter „Kalender" (`Kalenderlink:`, `apply-calendar-issues.yml` Modus `apply-ok`) mit demselben Ablauf. Alles ohne eigenen Review-Ablauf (PRs, Formular-Issues `add-space`/`update-space`, `Datenvorschlag:`, Kalender ohne Fund, Sonstige) bekommt je einen **Listen-Reiter** (nur Anzeige + Link zu GitHub, nur sichtbar wenn etwas offen ist). Am Listenende springt die Seite zum nächsten Reiter mit offenen Vorschlägen.
- Bedienung: Toasts für jede Aktion, Rückgängig (`z`: Label entfernen / Issue wieder öffnen / alten Body zurückschreiben; verfällt für übernommene Issues). Farben: Status-Töne aus `colours.js` (`--space-open/-closed/-unknown`), Seitenhintergrund `--dropdown-alt-bg` — keine Hex-Werte im Admin-CSS.
- Workshops ersetzen/entfernen: `apply-workshop-issues.js` füllt sonst nur Lücken (vorhandene Workshops werden nie überschrieben). Der Admin schreibt bei ausdrücklicher Wahl („ersetzen bzw. entfernen") die Zeile `**Modus:** ersetzen` ins Issue; nur dann ersetzt der Apply bestehende Workshops, bei leerer Liste löscht er den Schlüssel `workshops` (kein leerer Marker). Ohne Modus bleibt alles beim Alten, auch bei `y` ohne Typ (Issue wird nur geschlossen). Derselbe Modus gilt für den **Kalenderlink** (`apply-calendar-issues.js`, Reiter „Kalender"): bestehenden Link ersetzen, leere URL = `events` entfernen; Links, die fest in `locations.json` stehen, werden nicht angeboten (Vorrang).

## Verworfen

- Lokales CLI/Node-Server (Klon + Node + `gh` je Gerät nötig) · GitHub OAuth (Server für Client-Secret) · Contents-Write im Browser · Workflow je Label-Event (viele Commits/Deploys).

## Konsequenzen

- Ein geleakter PAT kann Issues ändern und Workflows starten, aber keine Dateien schreiben → kurzer Ablauf setzen.
- Preview per `<iframe>` scheitert bei Seiten mit `X-Frame-Options`/CSP → Fallback „im Tab öffnen“.
