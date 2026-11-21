# ADR-006: Admin-Review ohne Backend

**Status:** Akzeptiert
**Datum:** 2026-11-21

---

## Kontext

Die wöchentlichen `SpaceAPI:`-Issues (Directory Sync) sollen schnell und von jedem Rechner aus geprüft werden können.

## Entscheidung

- Statische Seite `/admin/` (Vanilla, kein Build; ADR-001/002), `noindex`, `Disallow` in `robots.txt`, nicht verlinkt.
- Login = Fine-grained PAT im `localStorage` (nur dieses Repo, Issues R/W + Actions R/W, mit Ablauf). Kein Contents-Write.
- Die Seite ändert **nur Issues**: `y` = Label `ok`, `a` = Endpoint im JSON-Block des Bodys ersetzen + `ok`, `n` = schließen (`not_planned`).
- „Übernehmen“ = `workflow_dispatch` von `apply-spaceapi-issues.yml` mit `mode=apply-ok`: nur `ok`-Issues, Live-Check des Endpoints, ein Commit, ein Deploy. Der Workflow bleibt einziger Schreiber der Daten.
- `locations.json` / `loc-enrichment.json` kommen von `raw.githubusercontent.com` (nicht deployt, CORS-fähig).
- Service Worker fängt `/admin/` nicht ab.
- Gleiches Muster für `[Workshop-Daten]`-Issues (Reiter „Workshops"): `ok`-Label ersetzt die Checkbox „Freigegeben" (die Checkbox gilt weiter), „anpassen" ersetzt die Typ-Liste im JSON-Block. Apply: `apply-workshop-issues.yml` (`apply`).
- Auto-Übernehmen serverseitig: Cron `auto-apply-spaceapi.yml` (je Art ≥10 `ok`-Issues oder 1 h Ruhe). Apply-Workflows teilen `concurrency: data-apply` und deployen nur bei geänderter Datei.

## Verworfen

- Lokales CLI/Node-Server (Klon + Node + `gh` je Gerät nötig) · GitHub OAuth (Server für Client-Secret) · Contents-Write im Browser · Workflow je Label-Event (viele Commits/Deploys).

## Konsequenzen

- Ein geleakter PAT kann Issues ändern und Workflows starten, aber keine Dateien schreiben → kurzer Ablauf setzen.
- Preview per `<iframe>` scheitert bei Seiten mit `X-Frame-Options`/CSP → Fallback „im Tab öffnen“.
