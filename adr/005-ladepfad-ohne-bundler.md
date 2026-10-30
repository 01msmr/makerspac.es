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
2. **Früher klassischer Inline-Script mit `import()`** (läuft sofort beim Parsen; ein Module-Script wäre deferred und startete erst nach CSS: gemessen ~5,7 s statt ~2,4 s bei Slow-4G) importiert nur dependency-freie Leaf-Module:
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

## Nachtrag 2026-10: selten gebrauchte Module per `import()`
Statt Dateien zu bündeln (Build-Schritt, siehe oben) werden Module, die nur auf Nutzeraktion oder in Sonderfällen
gebraucht werden, erst bei Bedarf geladen: das „+“-Overlay (`embed-overlay.js` + `add-space-form.js`, ≈ 70 KB roh) über
`overlay-loader.js` und `demo-mode.js` (≈ 26 KB) nach dem Start in Leerlaufzeit. Zusammen ≈ 95 KB (≈ 25 KB gzip) weniger im
kritischen Pfad. Sie bleiben im Service-Worker-Precache und fehlen in `modulepreload`.

## Nachtrag 2026-10: Karten-Kacheln — Pins zuerst, Kacheln danach
Gemessen im gedrosselten Test (200 KB/s, 150 ms, CPU 4×; lokaler Server unkomprimiert, absolute Zeiten daher zu hoch):
Erste Vektor-Kachel sichtbar nach ≈ 12,8 s statt ≈ 26 s. Maßnahmen (alle in `tile-loader.js` / `map.js`, ohne Build-Schritt):
1. **Pins zuerst:** MapLibre + Stil laden erst nach dem ersten `filterResultsChanged` (`loadMaplibreAfterPins`), damit Daten und
   Marker die Bandbreite zuerst bekommen.
2. **Relief begrenzen (`trimStyle`):** der OpenFreeMap-Stil legt ein Natural-Earth-PNG-Relief (je 130–190 KB) unter die Karte, im
   Start-Ausschnitt ≈ 15 Kacheln ≈ 2 MB bei 10 % Deckkraft → nur noch bei MapLibre-Zoom < 4 (**MapLibre-Zoom = Leaflet-Zoom − 1**).
3. **Beschriftungen nachreichen (`splitSymbolLayers`):** die 25 Symbol-Layer fehlen im ersten Stil (spart ≈ 1,2 MB Glyphen-PBFs) und
   werden nach dem ersten `idle` per `addLayer` ergänzt.
4. **Optik:** `#map` zeigt `--map-placeholder` (Hintergrundfarbe des Stils, Dark: gefiltert).
Bewusst verworfen (kein messbarer Gewinn bzw. Fehlerquelle): Service-Worker-Registrierung erst nach den Kacheln (`maptilesready`) und
ein Einblenden der GL-Ebene (`.tiles-ready` — blieb die Karte unsichtbar, wenn das Ereignis nie kam).
Die Vektor-Kacheln selbst (Drittanbieter, bereits komprimiert) lassen sich clientseitig nicht verkleinern.
