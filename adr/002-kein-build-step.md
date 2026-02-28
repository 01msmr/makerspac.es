# ADR-002: Kein Build-Step / kein Bundler

**Status:** Akzeptiert
**Datum:** (retroaktiv dokumentiert)

---

## Entscheidung

Keine Transpilierung, kein Bundling, kein Minifier im Entwicklungs-Workflow.
Produktiv-Dateien sind identisch mit Quell-Dateien.

## Begründung

- **Direkte Deployment-Fähigkeit:** `git push` → FTPS-Upload der Rohdateien
- **Null Toolchain-Aufwand:** Kein npm-Build vor Deploy, kein CI-Build-Job
- **Debugbarkeit:** Source-Maps unnötig, da Source = Deployed
- **Komprimierung:** Brotli/gzip via `.htaccess` auf Apache — kein Bundler-Minifier nötig
- **Browser-Support:** Moderne Browser-ES6-Module reichen für Zielgruppe

## Verworfene Alternativen

| Alternative | Abgelehnt weil |
|------------|---------------|
| Vite / Webpack | Build-Schritt in CI, separate dist/, mehr Komplexität |
| esbuild | Immer noch Build-Step nötig |
| Parcel | Automatisch, aber undurchsichtig |

## Konsequenzen

- JS-Dateien im Root sind direkt ausgeliefert (kein `/dist`)
- Keine Tree-Shaking-Optimierung (akzeptiert)
- `import`-Pfade sind relative Dateinamen, keine NPM-Pakete
- Libraries liegen unter `/libs/` als lokale Kopien, nicht via CDN

---
*Unveränderlich. Neue Entscheidung → neues ADR.*
