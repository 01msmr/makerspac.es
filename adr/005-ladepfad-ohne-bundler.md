# ADR-005: Ladepfad ohne Bundler — modulepreload, früher Start, entkoppelte Karte

**Status:** Akzeptiert
**Datum:** 2026-10-28

---

## Kontext

ADR-002 verbietet Bundler/Build-Step. Folge: `map.js` zieht ~28 ES-Module über drei Import-Ebenen —
der Browser entdeckt jede Ebene erst, wenn die vorige geladen und geparst ist (Wasserfall, auf dem Handy
≈ 1 Round-Trip pro Ebene). Zusätzlich blockierte `init()` den Kartenstart auf den Download von MapLibre
(763 KB), obwohl Marker, Liste und Suche ihn nicht brauchen. Messung im Waterfall: Daten-Fetch erst nach
~126 ms (localhost), Style-JSON nach ~165 ms, Tiles nach ~600 ms.

## Entscheidung

Der Ladepfad wird **ohne Build-Step** optimiert (ADR-002 bleibt gültig):

1. **`<link rel="modulepreload">`** in `index.html` für den kompletten Import-Graph von `map.js`
   (flacht den Wasserfall ab). Die Liste wird von Hand gepflegt und entspricht `sw.js` `STATIC_ASSETS`.
2. **Früher Inline-Module-Script** (vor `map.js`) importiert nur dependency-freie Leaf-Module:
   `data-preload.js` (Länder-Erkennung, Preload von `markers.json`/`spaces-{cc}.json`/`lang.json`) und
   `tile-loader.js` (`loadMaplibreIfNeeded()`, idempotent, preloadet zusätzlich das Style-JSON).
3. **Karte entkoppelt von MapLibre:** `setupMap()` läuft sofort; `updateMapTiles()` hängt den Vector-Layer an,
   sobald das Plugin geladen ist (Fehler → Raster-Fallback). Marker, Liste, Suche warten nicht darauf.
4. **Statisches Loading-Skeleton** in `index.html` samt Inline-Script zum Entfernen (Markup und Dismissal
   in derselben Datei → versionsgleich, auch wenn der Service Worker noch ein älteres `map.js` liefert).
5. **Service Worker** wird erst nach `window.load` registriert (Precache konkurriert nicht mit dem Erstladen).
6. **Suchleiste sofort nutzbar:** Desktop-Fokus per Inline-Script; `SearchHeader.init()` übernimmt vor Init
   getippten Text als normale Suche.

## Begründung

- Wirkt am Engpass (Round-Trips, serielle Abhängigkeit) statt an Dateigrößen; keine Toolchain.
- Leaf-Module als Einstieg → kein Zirkelrisiko, früh ausführbar, einzeln testbar (`tests/data-preload.test.js`,
  `tests/tile-loader.test.js`).

## Verworfene Alternativen

| Alternative | Abgelehnt weil |
|------------|---------------|
| Bundler (esbuild/Vite) | widerspricht ADR-002; Build-Schritt in CI |
| Raster-Tiles zuerst, Vector später | doppelte Tile-Requests, Flackern beim Wechsel |
| `lang.json` pro Sprache splitten | ~11 KB gzip Ersparnis (~50–100 ms auf 4G), aber async Sprachwechsel + Generator nötig |

## Konsequenzen

- **Neue/entfernte Imports in `map.js`-Graph → `modulepreload`-Liste in `index.html` und `sw.js` mitpflegen.**
- `loadMaplibreIfNeeded()` muss idempotent bleiben (wird aus `index.html` und `map.js` aufgerufen).
- Alles, was die Karte braucht, muss mit „noch kein Basis-Layer" funktionieren (Leaflet ohne Layer, `maxZoom` explizit).
- Bei `sw.js`-Änderungen/JS-CSS-Änderungen `VERSION` bumpen (JS/CSS sind cache-first).

---
*Unveränderlich. Neue Entscheidung → neues ADR.*
