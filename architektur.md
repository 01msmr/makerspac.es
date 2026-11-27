# Architektur — makerspac.es
*Living Documentation · bei Änderungen aktualisieren · Stand: 2026-07*

> **Visuelle Diagramme** (Modul-Abhängigkeiten, Datenfluss, Event Bus, Boot-Sequenz, Runtime-Flows):
> → **[architecture-diagram.md](architecture-diagram.md)**

---

## C4 Level 1 — System Context

```
┌─────────────┐         HTTPS           ┌──────────────────────┐
│   Benutzer  │ ──────────────────────▶ │   makerspac.es SPA   │
│  (Browser)  │ ◀────────────────────── │  (Statisches Hosting)│
└─────────────┘                         └──────────┬───────────┘
                                                   │
                   ┌───────────────────────────────┼──────────────────────┐
                   │                               │                      │
                   ▼                               ▼                      ▼
         ┌─────────────────┐          ┌────────────────────┐   ┌──────────────────┐
         │  SpaceAPI-      │          │  MapTile-Server    │   │  Netcup FTPS     │
         │  Endpunkte      │          │  (OpenStreetMap /  │   │  (Deploy-Target) │
         │  (Makerspaces)  │          │   MapLibre)        │   │                  │
         └─────────────────┘          └────────────────────┘   └──────────────────┘
```

---

## C4 Level 2 — Container

```
┌──────────────────────────── Browser ────────────────────────────────────────┐
│                                                                             │
│  ┌──────────────┐   lädt    ┌────────────────────────────────────────────┐  │
│  │  index.html  │ ────────▶ │  JavaScript ES-Module-Baum                 │  │
│  │  (Bootstrap) │           │  Einstieg: map.js                          │  │
│  └──────────────┘           └────────────────────────────────────────────┘  │
│                                          │                                  │
│  ┌──────────────┐                        │ fetch()                          │
│  │  CSS-Stack   │                        ▼                                  │
│  │  (7 Dateien) │           ┌────────────────────────┐                      │
│  └──────────────┘           │  Datenschicht (JSON)   │                      │
│                             │  data/spaces-{cc}.json │ ← Build aus          │
│  ┌──────────────┐           │  data/spaces-all.json  │   locations.json +   │
│  │  sw.js       │           │  status.json (live)    │   loc-enrichment.json│
│  │  (Service    │           │  lang.json (i18n)      │                      │
│  │   Worker)    │           └────────────────────────┘                      │
│  └──────────────┘                                                           │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Kein Backend, kein Build-Step, kein Framework.**

**Ladepfad (index.html, Begründung: [ADR-005](adr/005-ladepfad-ohne-bundler.md)):** `<link rel="modulepreload">` für den kompletten Import-Graph von `map.js` (flacht den Wasserfall ab — bei neuen/entfernten Imports die Liste mitpflegen) · früher Inline-Module-Script startet `preloadInitialData()` + `loadMaplibreIfNeeded()` vor `map.js` · MapLibre blockiert den Start nicht: `setupMap()` läuft sofort, `updateMapTiles()` zieht den Vector-Layer nach (Fehler → Raster-Fallback) · statisches Loading-Skeleton in index.html (`#loading-backdrop`/`#loading-stack`), samt Inline-Script zum Entfernen beim ersten `filterResultsChanged` (bewusst in index.html, versionsgleich auch bei altem gecachtem map.js) · Service-Worker-Registrierung erst nach `window.load`.

---

## Datei-Karte (Root)

### JavaScript

| Datei | Verantwortung | Exportiert / Globale |
|-------|--------------|----------------------|
| `map.js` | Einstiegspunkt, Bootstrap, AppContext-Lifecycle | `window.app`, `window.locationById`, `window.markerById`, `window.i18n` |
| `app-context.js` | Lifecycle-Phasen, Shared State | `appContext` (import) |
| `main.js` | Orchestrierung, Leaflet-Icons, Module verknüpfen | `initApp()`, `window.mobileFilterUI`, `window.nearbySpacesManager` |
| `tile-loader.js` | Tile-Mode-Erkennung, lazy MapLibre-Loader; genutzt von map.js + embed.js | `detectTileMode`, `getTileMode`, `loadMaplibreIfNeeded` (idempotent, memoisiert; früh aus index.html angestoßen, lädt auch Style-JSON per Preload), `MAPLIBRE_STYLE_URL` (export) |
| `data-preload.js` | Leaf-Modul: Länder-Erkennung aus URL-Hash, früher Preload von `markers.json`/`spaces-{cc}.json` + `lang.json` (aus index.html, vor map.js) | `detectCountryCodeFromURL`, `preloadInitialData`, `SLUG_TO_CODE` (export) |
| `admin/reset.html` + `admin/reset.js` | **„App zurücksetzen“:** meldet alle Service Worker ab, leert alle Caches und die Daten-Zwischenspeicher in `localStorage` (`ms-markers-cache`, `ms-split-*`) und leitet zurück (`?next=`, nur eigene Pfade). **Token, Lesezeichen, Einstellungen bleiben.** Liegt unter `/admin/` → kein Service Worker (auch keine alte Version) fängt die Seite ab, sie kommt immer frisch vom Server; per `robots.txt` gesperrt. Aufgerufen vom „Neu laden“-Knopf des „Veraltet“-Toasts und von „App zurücksetzen“ im Admin | `resetApp`, `safeNext`, `isDataCacheKey` |
| `update-notice.js` | „Veraltet“-Hinweis: erkennt per `index.html` (nach der SW-Registrierung, `import()`) eine neu installierte Service-Worker-Version bzw. fragt beim Zurückkehren zum Tab (`visibilitychange`) nach; zeigt über `toast.js` einen **mittigen, bleibenden Toast** „Veraltet · neue Version verfügbar · geöffnet vor 3 Std.“ mit Knopf „Neu laden“ (führt über `/admin/reset.html`: Service Worker + Caches leeren, dann neu laden; 7 Sprachen). Wartet, solange das Overlay (Formular) offen ist | `initUpdateNotice`, `formatAge`, `toastSubtitle` |
| `toast.js` | Leaf-Modul: Info-Toast unter dem Logo (Kopier-Bestätigungen, Auto-Land-Hinweis); Optionen `center` / `sticky` / `action` für mittige, bleibende Toasts mit Knopf; Meldungen mit Schweregrad bleiben bei `datasync.showNotification` | `showToast` (export) |
| `marker-manager.js` | Marker/Popup/Sticky/Connection-Line-Logik, aus map.js extrahiert | `initMarkerManager`, `createMarkerForLocation`, `clearStickyPopup`, `updateMarkerIconForLocation` u.a. (export) |
| `config.js` | ICONS, COLOURS, SETTINGS, WORKSHOP_TYPES, COUNTRY_CODES, Helper | `AppConfig`, `window.AppConfig` |
| `colours.js` | Farbdefinitionen, `isDarkMode()`, `applyCssColours()`, Dark-Mode-Helpers | `COLOURS`, `isDarkMode`, `applyCssColours` (export) |
| `types.js` | JSDoc-Typdefinitionen (MakerSpace, Pill, AppPhase, …) — kein Runtime-Export | `export {}` |
| `enrichment-merge.js` | SSOT der Verschmelzung `locations.json` + `loc-enrichment.json` (`locations.json` = Grunddaten, `loc-enrichment.json` ergänzt Workshops/Events/SpaceAPI/Weekly — keine Überschneidung, daher keine Vorrang-Regel) — von `generate-map-splits.js` (Karte), `/admin/` (Spalte „Aktuell“) genutzt; Crawler/Apply-Tools sollen denselben Stand sehen | `applyEnrichment` |
| `workshop-keywords.js` | Stichwörter je Workshop-Typ (SSOT, pure) — vom Crawler (`tools/workshop-crawler.js`) und von `/admin/` (Freitext → Typen) genutzt | `WORKSHOP_KEYWORDS`, `detectTypes` |
| `workshop-types.js` | Workshop-Typen (15, u. a. `repair` = Repair-Café/Reparatur-Treff, Icon `fa-screwdriver-wrench`), **SSOT inkl. englischem Formular-Label** (`label`), `getSortedWorkshops()`, Icons, Tooltip. **Neuer Typ:** Eintrag hier (`label`, `icon`) → `npm run sync:forms` (erzeugt `.github/workshop-labels.json` und die Checkboxen der Issue-Vorlage) → von Hand zusätzlich `types.js` (Typedef), `lang.json` (`workshops.<typ>`, 7 Sprachen), `workshop-keywords.js`. Formular `add-space-form.js` und die Workflows `add-/update-makerspace-pr.yml` lesen die Liste aus derselben Quelle (Formular: `WORKSHOP_TYPES`; Workflows: `workshop-labels.json`). Wächter: `tests/workshop-types-sync.test.js` (Teil von `validate:ci`) schlägt an, wenn erzeugte Dateien veraltet sind oder ein Typ fehlt. Networking ist bewusst **kein** Typ (Format statt Werkstatt, Stichwort zu unspezifisch) | `WORKSHOP_TYPES`, `getSortedWorkshops`, `getWorkshopIcon` (export) |
| `tools/sync-workshop-forms.js` | **Node.js** — erzeugt aus `WORKSHOP_TYPES` die Datei `.github/workshop-labels.json` (Label → Schlüssel, von den PR-Workflows gelesen; `.github/` wird nicht deployt) und den Block zwischen `# BEGIN/END workshop-options` in `.github/ISSUE_TEMPLATE/add-makerspace.yml` (statisches YAML, kann nichts importieren). `npm run sync:forms` schreibt, `--check` prüft nur | `renderLabelsJson`, `renderTemplate` (export) |
| `filter-config.js` | Filter-Kategorien, `IGNORED_STYLES_SET`, `FILTER_ORDER_SET`, `getStyleIcon`; Sonderwerte `WEEKLY_ANY` (`'weekly-any'`, „irgendein Wochentag“) und `STATUS_ANY` (`'status-any'`, Status-Filter „mit Status“ = offen **oder** geschlossen, d. h. SpaceAPI-Status vorhanden). Beide Werte leben in derselben Auswahlliste (`selectedStyles`) und müssen verschieden sein, sonst würde ein gemeinsames `'any'` beide Pillen aktivieren | exports |
| `libs/fontawesome/` | Font-Awesome-**Subset** (`css/subset.min.css` + `webfonts/fa-solid-900.woff2`, nur die benutzten Glyphen; Original in `originals-backup/`). Neues Icon: Glyphe per `fonttools` (`fontTools.subset`, Unicodes des aktuellen Subsets + neuer Codepoint, Quelle `originals-backup/fa-solid-900.woff2`, `flavor='woff2'`) neu erzeugen **und** die Regel `.fa-<name>{--fa:"\f…"}` (Codepoint aus `originals-backup/all.min.css`) in `subset.min.css` ergänzen | – |
| `date-utils.js` | Weekday-SSOT: `WEEKDAY_NAMES`, `todayWeekday`, `isWeeklyToday` (pure, keine Browser-Deps) | exports |
| `search-filter.js` | Filter-Logik (kein DOM) | `SearchFilter` class |
| `search-header.js` | Such-UI, Dropdown, Item-Clicks, Orchestrierung. Suchfeld-Befehle: `/admin` (Admin-Tab), `/demo` (Demo-Modus), **`/zoom`** (Zoom-Anzeige ein/aus; beim Tippen `/`…`/zoom` und beim Absenden bleibt die Suche unberührt — `isZoomCommandPrefix`, kein Filter, kein Auto-Zoom; Phone: Filter-Pane wird geschlossen, damit die Karte sichtbar ist; `syncZoomChip`/`renderMapTerms` zeigen den Chip „zoom“ solange die Anzeige an ist) | `SearchHeader` (export) |
| `admin-shortcut.js` | Leaf: „/admin“ (auch „/admin/“) im Suchfeld öffnet das Admin-Review **sofort beim Tippen** in einem neuen Tab (wie `/demo`, ohne Enter; `window.open`, `opener` wird gekappt); `search-header.js` leert das Suchfeld danach. Blockt der Pop-up-Schutz den Tab, bleibt der Text stehen und **Enter** öffnet ihn (Tastendruck = Nutzeraktion). Steht im `modulepreload` und im SW-Precache | `isAdminCommand`, `openAdminTab` |
| `search-pills.js` | Filter-Pills in der Suchleiste (Stadt, Land, Style). **Werkzeug-Pills** (`setToolPill`/`updateToolPillText`/`removeToolPill`, `data-type="tool"`, z. B. „zoom“): sehen aus wie Pills, sind aber keine Filter — nicht in `pills`, kein `onChange`, überstehen `clear()`, stehen immer hinter den Filter-Pills, Klick entfernt sie | `SearchPillsManager` (export) |
| `autocomplete-manager.js` | Autocomplete-Dropdown, Städte/PLZ-Vorschläge | `AutocompleteManager` (export) |
| `listing-core.js` | Item-Rendering, Hover-Effekte, Connection Line, SVG-Schweif | `ListingCore` class |
| `routing.js` | URL-Hash → Filter, Auto-Geolocation | `RoutingManager`, `window.routingManager` |
| `data-store.js` | Einstellungen (Sprache, Theme, Clustering) persistieren | `DataStore`, `window.languageSwitcher` |
| `bookmark-manager.js` | Favoriten (Add/Remove/Export) | `BookmarkManager`, `window.bookmarkManager` |
| `datasync.js` | ConsentManager, localStorage-Wrapper | `ConsentManager`, `window.consent` |
| `nearby-header.js` | Nearby: Desktop-Popover (Rechtsklick) · Phone-Layout ≤767px: Panel im .search-container + Treffer im Dropdown (`searchHeader._nearbyMode` unterdrückt Filter-Rendering), Radius-Slider | `NearbyHeader`, `window.nearbySpacesManager` |
| `overlay-loader.js` | Lazy-Loader für das „+“-Overlay (Add Space / Embed / About): `initOverlayTrigger()` (Klick auf „+“, Vorladen bei pointerdown/hover) und `openOverlayTab(tab, { editId })` (`editId`: Space direkt im Bearbeiten-Modus vorbelegt, z. B. vom Popup-Stift) (Einstellungs-Links); lädt `embed-overlay.js` (+ `add-space-form.js`, ≈ 70 KB) erst bei Bedarf **`/?overlay=changes`** (Link „Änderungen“ im Admin) öffnet das Overlay direkt auf dem Reiter „new“ (`openEditFromUrl`, Parameter wird entfernt). | `openOverlayTab`, `initOverlayTrigger` · **`openEditFromUrl()`**: `/?edit=ID` öffnet das Overlay im Bearbeiten-Modus für diesen Space (wartet auf die im Hintergrund nachgeladenen Details; aufgerufen aus `map.js` nach Phase `app`; Link „Eintrag bearbeiten“ im Admin-Reiter „Spaces“) |
| `layout-mode.js` | SSOT der Layout-Modi: `isTouch()` (= `'ontouchstart' in window`), `isMobileUI()`/`isTablet()`/`isPhone()` (Media-Queries wie im CSS, per Test mit dem CSS abgeglichen) und `gridSpec()` (Grid-Maße der Dropdown-Seiten: Phone 2×3 à 40px, Tablet 4×4 / 5×3 à 58px); Leaf, keine Abhängigkeiten | `isTouch`, `isMobileUI`, `isTablet`, `isPhone`, `gridSpec`, `currentGridSpec` |
| `dropdown-pager.js` | Seitenweises Blättern im Dropdown (Snap-Seiten, Ghost-Items, Ecken, laufende Nummern, Hoch/Runter 1×/2×/3×, Rand-Indikatoren, Mausrad) | `DropdownPager` (init aus `MobileFilterUI.init`) |
| `mobile-filter.js` | Mobile Filter-Sheet, Chip-Bar; setzt `--mobile-ui-height` und ruft danach `map.invalidateSize()` (rAF-koalesziert) — einziger Pfad, der die Kartengröße an die Bottom-UI-Höhe koppelt (auch bei visualViewport-Resize) | `MobileFilterUI`, `window.mobileFilterUI` |
| `i18n.js` | Übersetzungen, `t()`, `setLanguage()` | `I18n`, `window.i18n` |
| `zoom-manager.js` | Map-Zoom-Steuerung, Auto-Zoom; Desktop-Fit als Polygon-Fit: alle Pins einzeln in der Freifläche (Viewport minus Logo minus Search/Dropdown). **Zoom-Anzeige** (`/zoom` im Suchfeld oder Rechtsklick/Long-Press aufs Zahnrad): `#zoom-indicator` zeigt die Stufe (`formatZoom`: ganze Stufen ohne, sonst eine Nachkommastelle — auch am Desktop kann der Zoom nach Auto-Zoom gebrochen sein) **am Mauszeiger** (rechts unten) bzw. **am letzten Berührpunkt auf der Karte** (Touch: über dem Finger, bei Pinch die Mitte beider Finger; Kompatibilitäts-Mausereignisse nach Touch werden 800 ms ignoriert); Start in der Kartenmitte. Nur für die aktuelle Sitzung (nichts gespeichert: nach Neuladen aus). Änderungen als Event `zoomIndicatorChange` (`detail.active`); der Chip „zoom“ in der Suchleiste bzw. Phone-Karte zeigt nur den Zustand und schaltet aus (Zahl steht nicht im Chip: die Suchzeile ist nicht immer sichtbar). Beim Ausschalten `map.off('zoom zoomend', handler)` nur mit Handler (ohne würde Leaflet alle Listener dieser Events entfernen) | `ZoomManager`, `window.zoomManager`, `computePolygonFit()`, `findFitTranslation()`, `isZoomCommand()`, `isZoomCommandPrefix()`, `formatZoom()` |
| `embed.js` | Embed-Karte (iframe-Standalone, lädt nur in embed.html) | `EmbedMapExtended`, `window.embedMap` |
| `embed-overlay.js` | In-page Overlay für Embed-Anleitung (initiiert in map.js) | `initEmbedOverlay()` |
| `popup-builder.js` | Gemeinsamer Popup-HTML-Builder (main map + embed); `editable: true` (nur Hauptkarte) rendert in der Titelzeile (`.popup-title-row`, direkt hinter dem Namen-Link, vor dem Lesezeichen) den Stift `.popup-edit` | `buildPopupHTML()` |
| `demo-mode.js` | Attract-/Kiosk-Demo (DemoMode, OpenDemoMode, TodayDemoMode) | `DemoMode`, `OpenDemoMode`, `TodayDemoMode` (export) |
| `error-monitor.js` | Dev-Tool, Fehler-Overlay, globales Error-Logging | `errorMonitor` (export), `window.AppErrorMonitor` |
| `spaceapi-static.js` | SpaceAPI-Status-Verarbeitung | `StaticSpaceAPI` (export) |
| `add-space-form.js` | Add-Space-Formular (Geocoding, Autocomplete). **Submit:** mit Admin-Token (`localStorage['admin-pat']`, FGT/PAT aus `/admin/`; Issues-Write genügt) wird das Issue direkt per REST angelegt (`createIssueWithToken`), sonst öffnet sich der vorbefüllte GitHub-Issue-Tab; schlägt der Token-Weg fehl → Fallback auf den Tab | `handleSubmit`, `adminToken`, `createIssueWithToken`, `initStreetAutocomplete` u.a. (export) |
| `sw.js` | Service Worker: Cache-First (Libs/CSS/JS), SWR (HTML), **Netz zuerst mit Cache-Rückfall `networkFirstFresh`** für Daten-JSON (`markers`, `spaces-*`, `splits-manifest`, `locations`; Timeout 4 s, `cache: 'no-cache'`) und `status.json`. `.htaccess`: Daten-Splits `no-cache` (ETag/304) statt 10 Min. | `networkFirstFresh` |
| `fetch-spaceapi-status.js` | **Node.js** Cron-Script — SpaceAPI-Endpunkte abfragen → status.json | — |
| `generate-map-splits.js` | **Node.js** Build-Script — locations.json + loc-enrichment.json → data/*.json | — |
| `tools/spaceapi-directory-sync.js` | **Node.js** Cron-Script (wöchentlich) — directory.spaceapi.io mit loc-enrichment.json abgleichen → Issues `SpaceAPI: <Name>` (Label `data-update`) | `normalizeUrl`, `matchSpace`, `buildProposals`, `isAlreadyProposed`, `buildIssueBody` (export) |
| `tools/lib/crawl-original.js` | **Ursprünglicher Crawler-Fund (pure, Admin + Crawler):** ändert der Admin einen Vorschlag, merkt `markOriginal` den Originalblock einmalig als Zeile `**Crawler-Fund:** "…"` im Issue; `decideProposal` vergleicht neue Funde auch damit (`originalOf`) → derselbe Fund wird nach einer Änderung nicht erneut vorgeschlagen | `markOriginal`, `originalOf` |
| `tools/weekly-crawler.js` + `tools/lib/weekly-extract.js` | **Regelbasiert, ohne KI:** Weekly-Treffen (Wochentag 0=So…6=Sa, HHMM) und **Vereinsgründungsdatum** (nicht erstes Treffen/erster offener Tag/Umzug – `NOT_FOUNDING_RE`; „Eröffnung“ bleibt erlaubt; Jahr → YYYY0101) aus Website + Unterseiten; nur Konfidenz „high“ wird vorgeschlagen; füllt standardmäßig nur Platzhalter (`--force`: auch Abweichungen). Issues `Treffen-Daten: <Name>` (Label `weekly-data`), Entscheidung über `decideProposal` (kind `weekly`, `deltaKey`) | `crawlSpace`, `buildIssue`, `extractWeeklyCandidates`, `extractInit`, `weeklyDelta` |
| `tools/apply-weekly-issues.js` | `Treffen-Daten:`-Issues → `weekly` in loc-enrichment.json, `space.init` in locations.json (+ `space.edited.latest`); prüft jeden Vorschlag vorher (`validateWeekly`); Modi dry-run / apply / `--only-ok` | `parseIssue`, `validateWeekly` |
| `changes-panel.js` | Overlay-Reiter **„new“** (Leaf, lazy über `embed-overlay.js`): Texte in 7 Sprachen (en = „new“), `groupByMonth`, `renderChanges` — Einträge nach Monaten wie ein Blog; je Tag das Datum einmal, darunter eine je Tag nummerierte Liste, mehrere Änderungen an einem Space am selben Tag in EINER Zeile (Komma getrennt, z. B. „Wöchentliches Treffen ergänzt, 8 Werkstätten ergänzt“; Genus/Plural je Sprache); Klick auf den Space-Namen schließt das Overlay und öffnet den Space (`searchHeader.handleItemClick`). Am Smartphone steht der kurze Text (wie bei add/embed/about) | `renderChanges`, `groupByMonth`, `changeLabel` |
| `tools/build-changelog.js` + `tools/lib/changelog.js` | Erzeugt **`data/changes.json`** (Reiter „new“) bei jedem Deploy (`deploy.yml`, `fetch-depth: 0`) aus der Git-Historie von `locations.json`/`loc-enrichment.json`: neuer Space, Name, Adresse (nur Adressfelder; Koordinaten werden nie genannt), Website, Zielgruppe, Weekly, Workshops (mit Anzahl `n`), Kalender, SpaceAPI (hinzu/geändert/entfernt); Datumsstempel zählen nicht, Massenänderungen (> 25 Spaces je Commit) und der Import-Commit werden ausgelassen. Nur echte Änderungen ab Beginn der Historie (22.11.2026) | `diffSpaces`, `buildEntries`, `buildFromGit` |
| `tools/lib/edit-stamp.js` | Setzt `dates['space.edited.latest']` (Berliner Datum, YYYYMMDD); genutzt von allen drei Apply-Skripten und `.github/workflows/stamp-edit-date.yml` (stempelt beim Merge von `add-space-id-*`-PRs; Update-PRs stempelt `update-makerspace-pr.yml`) | `berlinToday`, `stampEntries`, `stampLocationsFile` |
| `tools/apply-calendar-issues.js` | **Node.js** — `Kalenderlink:`-Issues → `events` in loc-enrichment.json; füllt nur Lücken, außer das Issue trägt `**Modus:** ersetzen` (vom Admin): dann ersetzen bzw. bei leerer URL entfernen; stempelt `space.edited.latest` | `parseIssue` (export) |
| `tools/apply-workshop-issues.js` | **Node.js** — freigegebene (Checkbox oder Label `ok`) `[Workshop-Daten]`-Issues → `workshops` in loc-enrichment.json; füllt nur Lücken, außer das Issue trägt `**Modus:** ersetzen` (vom Admin): dann ersetzen/entfernen (leere Liste löscht den Schlüssel) | `parseIssue`, `isApproved` (export) |
| `tools/apply-spaceapi-issues.js` | **Node.js** — offene `SpaceAPI:`-Issues → `spaceapi.endpoint` in loc-enrichment.json, Issues schließen; `--only-ok` = nur Label `ok` + Live-Check des Endpoints (ungültig → Kommentar, Label entfernt) | `parseIssue`, `applyProposal`, `filterOk`, `isValidSpaceApi`, `checkEndpoint` (export) |
| `admin/index.html` + `admin.js` + `admin.css` | Review-Seite `/admin/` mit Review-Reitern **SpaceAPI**, **Workshops**, **Kalender** und Listen-Reitern (Pull Requests, Neu, Änderung, Daten, Kalender ohne Fund, Sonstige — nur Anzeige + Link, nur sichtbar wenn etwas offen ist); am Ende einer Liste springt die Seite zum nächsten Reiter mit offenen Vorschlägen; Toasts + Rückgängig-Stapel (`z`); **Spalte „Aktuell“ immer aktuell**: Daten direkt über die GitHub-API (nicht `raw.githubusercontent.com`, dort ~5 min CDN-Cache) mit derselben Verschmelzung wie die Karte; Aktualisierung bei Fokus, alle 2 min, nach „Übernehmen“ und per ↻ (Daten **und** Warteschlangen: `mergeQueue` — geschlossene/übernommene Issues fallen heraus, „später“ rückt ans Ende; `act()` prüft das Issue vor jedem Schreiben frisch), Anzeige „Daten: Uhrzeit · Commit“; **Probleme**: zurückgegebene Vorschläge (Label `problem`, gesetzt von den Apply-Skripten) erscheinen im eigenen Reiter mit rotem Grund-Kasten (letzter Bot-Kommentar), dazu ein Reiter „Probleme" (nur sichtbar wenn etwas offen ist) mit ungelösten Workflow-Fehlern der letzten 24 h und seit >2 h hängenden `ok`-Issues; Farben aus `colours.js` (`applyCssColours`), Hintergrund `--dropdown-alt-bg` (statisch, `noindex`, nicht verlinkt, SW fängt sie nicht ab): PAT im localStorage → GitHub-REST; Tasten y/a/n/s (j/k = Website/Endpoint) ändern nur Issues, „Übernehmen“ = `workflow_dispatch apply-ok` (ADR-006) | — |
| `tools/scan-workshop-url.js` | **Node.js** — liest eine URL mit dem Workshop-Crawler (`crawlSpace`, exportiert) aus und kommentiert das Issue mit den erkannten Typen (Workflow `scan-workshop-url.yml`, gestartet von `/admin/`; die Seite löscht den Kommentar wieder) | `summarize` (export) |
| `tests/validate-enrichment.js` | Schema-Prüfung von `loc-enrichment.json` (IDs, Workshop-Typen, URLs, weekly); `validateProposal` prüft einen Vorschlag isoliert (nur Fehler der eigenen ID) — von den Apply-Skripten **vor** dem Schreiben/Schließen genutzt; Teil von `npm run validate` | `validateEnrichment`, `validateAfterPatch`, `validateProposal`, `rejectionComment`, `isHttpUrl` |
| `.github/actions/validate-data/` | Composite-Action: `npm run validate:ci` (Daten + Unit-Tests), Log nach `$RUNNER_TEMP`; von `validate.yml`, `update-makerspace-pr.yml`, `add-makerspace-pr.yml` genutzt | — |
| `tools/lib/crawl-selection.js` | Gemeinsame Crawler-Logik: verschmolzener Ist-Stand (`enrichment-merge.js`) und **inhaltliche Entscheidung** `decideProposal` — ein Fund wird nur vorgeschlagen, wenn er vom integrierten Stand UND vom jüngsten früheren Vorschlag abweicht (jede Art von Änderung: dazu/weg/anders); offene ältere Vorschläge mit anderem Inhalt werden ersetzt. Genutzt von `workshop-crawler.js` und `calendar-crawler.js` | `loadMergedLocations`, `decideProposal`, `proposalFromIssue`, `loadSpaceIssues`, `closeSuperseded`, `normalizeUrl`, `sameWorkshops` |
| `tools/auto-apply-check.js` | **Node.js** Cron-Script (alle 15 Min, `auto-apply-spaceapi.yml`) — startet `apply-all-issues.yml` (alle Arten in einem Lauf) ab 10 `ok`-Issues (alle Arten zusammen) oder 1 h nach der letzten Änderung | `decide`, `decideAll` (export) |
| `tools/lib/status-adapters.js` | **Node.js (pure)** — Status für Spaces **ohne SpaceAPI** (ADR-010): Adapter `html-style` (Pilot Fabulous St. Pauli, ID 43: `<body style="…background:red/green">November 25 03:01</body>`). Gilt nur als **offen/geschlossen** (grün/rot), nur der aktuelle Stand, kein Verlauf. Konfiguration in `loc-enrichment.json`: `spaceapi: { endpoint, adapter }`; `fetch-spaceapi-status.js` (Cron) wählt den Parser nach `adapter`; Client unverändert. | `parseHtmlStyleStatus`, `adapterFor`, `parseChangeTime`, `STATUS_MAX_AGE_HOURS` |
| `tools/lib/status-freshness.js` | **Node.js (pure)** — **Alters-Regel für alle Status-Quellen** (ADR-010): ein „offen“ gilt nur, wenn der Sende-/Zeitstempel der Quelle jünger als `STATUS_MAX_AGE_HOURS` (**24 h, global, nicht je Space**) ist, sonst wird der Wert verworfen → unbekannt; „geschlossen“ wird nie verworfen. Zeitstempel: SpaceAPI `state.lastchange`, ThingSpeak `created_at`, Hamburg-Datum — **ohne Gedächtnis**; **Lebenszeichen:** ist `state.lastchange` alt, aber ein **Anwesenheits**-Sensor-`lastchange` (`sensors.people_now_present` / `door_locked`; Temperatur & Co. zählen nicht) jünger als 24 h, bleibt „offen“ gültig (`extractSensorTime`, `rescuedBy: 'sensor'`). Nur wo ein „offen“ gar keinen Zeitstempel liefert (unumgänglich): Gedächtnis der **letzten zwei Signaturen** (Last-Modified bzw. Prüfsumme) mit Erstsehen; unverändert > 24 h → unbekannt. Das Gedächtnis ist **nicht öffentlich** (`status-memory.json` nur im Actions-Cache von `update-status.yml`, gitignored, weder in `status.json` noch per FTP). Der Cron prüft bei jedem Lauf neu; ein wieder frischer Zeitstempel macht „offen“ wieder gültig. | `decideFreshness`, `extractSignalTime`, `applyOpenAgeRule`, `updateMemory` |
| `tools/lib/issue-close.js` · `tools/close-deferred.js` | **Node.js** — `closeOrDefer(nr, text)`: mit `DEFERRED_CLOSE_FILE` nur vormerken (JSON-Zeilen), sonst sofort `gh issue close`; `close-deferred.js` schließt die vorgemerkten Issues erst nach Validierung + Push (apply-all) | `closeOrDefer`, `parseDeferred` |
| `admin/admin-lib.js` | Pure Logik der Review-Seite (Issue parsen, Body-JSON ersetzen, Vergleichszeilen) | `parseIssue`, `replaceEndpoint`, `buildComparison`, `distanceMeters`, `autoApplyDelay`, `parseWorkshopIssue`, `parseWorkshopList`, `replaceWorkshops`, `buildWorkshopComparison`, `detectFromText`, `parseCalendarIssue`, `replaceEvents`, `buildCalendarComparison`, `classifyItem`, `groupInbox`, `parseScanComment` |
| `admin/spaces.js` · `spaces.css` · `spaces-lib.js` | **Reiter „Spaces“ (erster Reiter, Standard; ADR-009):** ein Space = eine Karte mit allen Eigenschaften (Workshops, Kalender, SpaceAPI, Treffen/Gründung), offene Vorschläge vorbelegt, jede Eigenschaft änderbar; Entscheidung pro Space (`y` übernehmen · `n` verwerfen · `ä` später · `z` rückgängig · `←` `→` Bearbeiten-Auswahl durchschalten, ohne Umbruch); Quell-Icons, gelbe Hervorhebung wichtiger leerer Felder (> 35 % gefüllt), Freitext (`analyzeFreeText`) wertet eingefügten Text/URLs sofort aus: Workshops, Treffen (nur 30-Minuten-Raster), Gründung, Kalender-/SpaceAPI-URL; einzelne Website-URL per Server-Scan. Läuft in `admin/index.html` (`#spaces-view` mit Seitenfenster `#sp-pane` + ziehbarem Trenner `#sp-split`: ID + Name und Quell-Icons öffnen dort die Webseite; Workshop-Typen als Raster, höchstens 3 Spalten; Login, Daten, Toasts, Übernehmen kommen von `admin.js`, Aufruf `initSpaces({ gh, toast, me, audit, data, bumpOk, onChange })`). Schreibt nur Issues (Body/Label/schließen/neu anlegen im Crawler-Format); Rückgängig stellt GitHub-Stand **und** Formular (Häkchen + Werte) wieder her. `spaces-lib.js` = reine Logik (`displayValue`/`weeklyWriteValue`: Teil-Vorschläge beim Treffen mit aktuellem Rest anzeigen, aber nur Geändertes schreiben; Wochentag `none` = „kein weekly“ → Issue `"weekly": null` → `applyWeeklyChanges` entfernt es; `groupBySpace`, `buildQueue`, `planDecision`, `newIssueBody`, `fillRates`, …), getestet in `tests/spaces-lib.test.js`. | `initSpaces`, `activate`, `planDecision` **Zeilen als Liste:** `show()` merkt die Eigenschaftszeilen in `state.rows` (key → `{tr, number}`); `readRows`, `rowEl` und der Stale-Check nutzen nur diese Liste, nie eine DOM-Abfrage nach `<tr>` (Beleg-Tabellen innerhalb der Zeilen haben eigene `<tr>`). **Feste Kopfzeile (Desktop):** `#bar` und `#sp-modebar` (Bearbeiten-Auswahl + Zähler/Prüfer/Stand/↻) bleiben beim Scrollen oben stehen; `trackStickyOffsets` (spaces.js) setzt `--bar-h`/`--sp-top`, das Seitenfenster klebt darunter. Phone: Leiste scrollt mit. (Der Scroll-Container ist `body`, nicht `window`.) **Kopfzeile im Spaces-Reiter:** Der Reiter-Knopf „Spaces“ ist dort ausgeblendet (nur als Rückweg aus Listen/Probleme sichtbar); Zähler („1 / 104“), Prüfer, Datenstand und ↻ stehen per `placeMeta` rechts in der zweiten Zeile (`#sp-modebar`/`#sp-meta-slot`), auf Phone darunter (Datenstand im Tooltip von ↻). Per `placeMeta` stehen der Titel „#ID Name“ (`#sp-title`, `#sp-link`) und **direkt dahinter** die Bearbeiten-Auswahl (`#sp-mode`) ganz links in der **ersten** Zeile von `#bar` (rechts Erledigt/Änderungen/…); die Meta-Angaben bleiben rechts in `#sp-modebar`; beide Zeilen bleiben beim Scrollen fest. Die Entscheider-Knöpfe (`.sp-actions`) kleben auf Desktop, Tablet und Phone unten (`position: sticky; bottom: 0`). **Weekly und Gründung sind getrennte Eigenschaften** (Zeilen „Wöchentliches Treffen“ und „Gründung“, je eigener Aktuell-Wert, eigenes Häkchen, eigene Bearbeiten-Radio-Option) mit **je eigenem Issue**: der Crawler legt `Treffen-Daten: <Name>` (nur `weekly`) und `Treffen-Daten: <Name> (Gründung)` (nur `space.init`) getrennt an und entscheidet je Eigenschaft (`decideProposal` kind `weekly`/`init`, `proposalFromIssue`). Alte kombinierte Issues werden beiden Zeilen zugeordnet und nur gemeinsam/unverändert entschieden (`planDecision`). **Belege & Prüfhinweise (`evidenceFor`):** direkt unter der Eingabe der jeweiligen Eigenschaft (in `#sp-rows`, Spalte „Eingabe“; dadurch zeigt jede Bearbeiten-Ansicht automatisch nur ihre eigenen Belege) – Fundstellen der Vorschläge (Workshops: Tabelle + Zitat, Treffen/Vereinsgründung: Zitate mit Confidence), Kalender-Confidence, „zuvor nicht übernommen“ (letzter Bot-Kommentar, Label `problem`) und der SpaceAPI-Live-Vergleich (Name/Website/Koordinaten, gelb ab > 300 m, „space fehlt“) – dieselben Infos wie die Alt-Reiter, damit diese entfallen können. Nur `textContent`. **Buttons** (`y`/`ä`/`n`) nutzen die Status-Farben `--space-open/-unknown/-closed` unverändert. **Weitere Prüfer (ADR-009):** `claim`/`release` weisen den offenen Vorschlägen den Bearbeiter zu (Sperre 30 min), `buildQueue(…, locked)` schiebt fremd bearbeitete Spaces ans Ende; Identität/Rolle (`loadMe`: `/user` + `permissions`) und Prüfpfad-Kommentare (`audit`) kommen von `admin.js`, Reviewer ohne Schreibrecht sehen weder „Übernehmen“ noch „Probleme“. |

### CSS

| Datei | Verantwortung | Definiert CSS-Vars? |
|-------|--------------|---------------------|
| `main-layout.css` | Basis-Layout, `#map`, `.title-bar`, `.search-container` | **Ja — zentrale Vars** (`--space-hover`, `--dropdown-bg`, etc.; Overlay add/embed/about: `--overlay-header-bg`, `--overlay-tab-bg`, `--overlay-tab-text`, `--overlay-tab-border`, `--overlay-intro-text`, `--overlay-sep` — Dark-Werte in `main-responsive.css`, drei Stellen: Media-Query + `[data-color-scheme]`) |
| `main-components.css` | Shared Components (Buttons, Badges, Microtip) | Nein |
| `main-responsive.css` | Responsive Overrides (`@media`) | Nein |
| `search.css` | Suchleiste, Dropdown, Filter-Pills, Counter | Nein |
| `listing-core.css` | Listing-Items, Hover-Animationen | Nein |
| `nearby.css` | Nearby-Popover, Radius-Slider, Cursor-Hint | Nein |
| `styles-autocomplete.css` | Autocomplete-Vorschlagsliste | Nein |

---

## Datenschicht — Drei-Tier-Architektur

| Datei | Inhalt | Gepflegt durch | Im Git |
|-------|--------|---------------|--------|
| `locations.json` | **Nur Grunddaten**: `name, ID, loc, style, link, dates` (`dates`: `space.init`, `space.edited.latest`, je YYYYMMDD; strikt validiert) | Mensch | ✅ |
| `loc-enrichment.json` | Crawler-pflegbare Felder (workshops, events, spaceapi, weekly) — keine Datumsfelder | Crawler-Tools | ✅ |
| `status.json` | Live Open/Closed-Status | Cron (alle 15 Min) | ❌ |

**Merge-Regel:** `generate-map-splits.js` kombiniert beide JSON-Dateien zur Build-Zeit.
Die Felder überschneiden sich nicht: `locations.json` enthält nur Grunddaten, `loc-enrichment.json` nur Ergänzungen (Validator lehnt Enrichment-Felder in `locations.json` ab, siehe ADR-008).

**Datumsfelder:** `dates.space.init` (**Gründung des Vereins bzw. Trägers**, nicht die Eröffnung eines Standorts; Platzhalter 20010000 = unbekannt) und `dates.space.edited.latest` (letzte Bearbeitung, Berliner Datum, kein Zeitanteil). Setzen: Update-/Add-Workflow beim PR, bestätigte Admin-Änderungen beim Übernehmen. `/admin/` zeigt den alten Stand als „Zuletzt bearbeitet“.

**Platzhalter-Erkennung:**
- `weekly.weekday === 9 && weekly.time === 0` → kein echter Wert
- `dates['space.init'] === 20010000` → kein echter Wert

**Workflow für neue Crawler-Daten:**
```
node tools/workshop-crawler.js --dry-json   → schreibt loc-enrichment.json
node generate-map-splits.js                 → baut data/ neu (Merge findet hier statt)
git add loc-enrichment.json && git commit       → Commit
git push                                    → Deploy (CI baut data/ automatisch neu)
```

---

## CSS-Konventionen

### CSS Custom Properties (alle in `main-layout.css` definiert)

| Variable | Bedeutung |
|----------|-----------|
| `--space-hover` | Primärfarbe Hover/Akzent (Grün) |
| `--space-closed` | Rot (geschlossen) |
| `--dropdown-bg` | Dropdown-Hintergrund |
| `--dropdown-border` | Dropdown-Rand |
| `--dropdown-hover-bg` | Hover-Zustand |
| `--text-color` | Haupttext |
| `--text-muted` | Gedimmter Text |
| `--shadow-color` | Box-Shadow-Farbe |
| `--nearby-title` | Nearby-Header-Hintergrund |
| `--font-family` | Roboto SemiBold |
| `--mobile-ui-height` | Per ResizeObserver in mobile-filter.js gesetzt |
| `--focus-color` | Fokus-Umrandung, aktive Pills, Autocomplete-Highlights |

### Media Queries

| Breakpoint | Dateien |
|-----------|---------|
| `@media (max-width: 767px)` | mobile-filter.js, search.css, main-responsive.css, nearby.css |
| `@media (max-width: 768px)` | nearby.css (Popover wird Sheet) |
| `@media (prefers-color-scheme: dark)` | main-responsive.css, main-components.css, search.css, nearby.css, listing-core.css, embed.css, styles-autocomplete.css — **nicht** main-layout.css (dessen `:root`-Vars sind fix) |

**Regel:** Alle Mobile-only CSS-Änderungen in `@media (max-width: 767px)`. JS-Touch-Guards: `'ontouchstart' in window`.

---

## Kritische Muster

### Mobile/Desktop-Branching (JS)
```javascript
// Touch-Erkennung (Phone + Tablet) — IMMER so, nie window.innerWidth:
if ('ontouchstart' in window) { ... }
```

### Leaflet-Events für Karten-Sync
```javascript
map.on('zoomstart movestart', () => listingCore.removeConnectionLine());
map.on('zoomend moveend',     () => listingCore.updateHoverSVGPosition());
```

### Phase-Barrier (auf Daten warten)
```javascript
await appContext.waitFor('data');  // Blockiert bis locations.json geladen
```

### window-Globals als Modul-Bus
Module kommunizieren über `window.xxx` (Legacy-kompatibel). Neue Querverbindungen bevorzugt über `appContext` oder direkte Instanz-Referenzen in `main.js`.

### Pin-Halo & Outline
- `createLeafletIcon` (config.js) zeichnet im Pin-SVG **vor** dem Pin einen Kreis `<circle class="pin-halo">` mit `<radialGradient>` (**fest 220 px**, unabhängig von der Pin-Größe `scale`: Radius in Pin-Einheiten = 110 / scale; zentriert auf dem Pin-Körper; eindeutige Gradient-ID je Pin `pin-halo-gN`; `pointer-events="none"`) und eine 1 px weiße Kontur (3-px-Weiß-Unterlage unter dem 1-px-Schwarzstrich). **Warum SVG statt CSS-`span`:** der frühere `span` mit `z-index:-1`, `rgb(var(…) / .66)` im Verlauf und `visibility`-Übergang war auf iOS-Safari nicht zu sehen (Marker haben `will-change: transform`) — der SVG-Kreis braucht nichts davon.
- **Pin-Transparenz** (`AppConfig.settings.pinOpacity` = 0,66) steckt als `<g opacity>` im SVG (`createLeafletIcon(color, scale, pinOpacity)`; App-Icons in `main.js` und der Hover-Pin `listing-core.js` `createHoverIcon` übergeben sie, der Embed nicht), **nicht** als `opacity`-Option am `L.marker`: sonst würde die Marker-Opacity den Halo mit abdunkeln (die Halo-Deckkraft würde mit 0,66 multipliziert) und kann ihn auf iOS-WebKit abschneiden. Der Hover-Pin (1,5-fach) hat denselben Halo wie die übrigen Pins.
- CSS (`main-layout.css`): Stopp-Farben `.pin-halo-in` (Deckkraft 80 %) / `.pin-halo-out` (0 %) in `--pin-halo-color` (hell `rgb(191,191,191)` = 25 % Schwarz, dunkel `rgb(64,64,64)` = 25 % Weiß). Sichtbar nur mit Klasse `.halo-on` am Karten-Container (Opacity-Übergang); Einblenden 0,8 s, Ausblenden 0,4 s; `prefers-reduced-motion` ohne Übergang.
- `marker-manager.js` (`initMarkerManager`) schaltet `.halo-on` bei `zoomend` anhand `AppConfig.settings.haloMinZoom` (14, wie `disableClusteringAtZoom`: ab da stehen alle Pins einzeln). Nur einzelne Pins haben einen Halo, Cluster (`marker-cluster`-Icons) nicht.

### Connection Line (Dropdown ↔ Marker)
- Wird gezeichnet: `listingCore.createConnectionLine(item, marker, color)`
- Wird gelöscht: bei `zoomstart`, `mouseleave`, `closeDropdown`
- Wird neu gezeichnet: bei `zoomend` via `updateHoverSVGPosition()` — **nur wenn `currentHoverItem` gesetzt**
- Nach Item-Click: `listingCore.currentHoverItem = activeItem` setzen, damit Redraw nach flyTo funktioniert

### Popup: Hover-Karenz und Bearbeiten-Stift
- **Popup-Pfeil:** `popupAnchor` in `createLeafletIcon` = `[0, −(Höhe + 0,5·scale − 1,1)]` (gerundet; Standard-Pin `[0, −40]`, Hover-Pin `[0, −62]`): Pfeil waagerecht exakt auf der Pin-Mitte, Spitze an der Pin-Oberkante (vorher `[1, −34]`: 1 px rechts, 6,4 px im Pin). Gespiegeltes Popup (unter dem Pin): `FLIP_GAP = 13,4` px in `marker-manager.js` (`adjustPopupPosition`) → Spitze genau an der Pin-Spitze (vorher 15 → 1,6 px Lücke). Die sichtbare Spitze des Leaflet-Pfeils liegt 12,9 px unter bzw. über der Oberkante des 20-px-Pfeil-Containers.
- **Navigations-Symbol** (`.popup-street-line.navigation-icon i::before`, vor der Adresse): folgt der gewählten Karten-App — OSM = Karte (`\f279`, Standard), Google Maps = Google-Logo (`\f1a0`), Apple Karten = Apple-Logo (`\f179`; Brands-Subset). `popup-builder.js` setzt `data-service` schon beim Aufbau (aus `consent.get('mapService')`, sonst `osm`), weil Leaflet den Inhalt bei `popup.update()` neu aufbaut und der `popupopen`-Handler den Wert sonst nur beim Öffnen setzt. Ohne/mit unbekanntem Wert gilt ebenfalls das Karten-Symbol (früher `\f5eb`, im Font-Subset nicht vorhanden → leeres Kästchen mit X).
- **Hover-Intent (Desktop):** Verlässt die Maus Listeneintrag (`listing-core.js` → `removeHoverEffects(location, { graceMs })`, `_schedulePopupGrace`/`_flushPopupGrace`) oder Pin (`marker-manager.js` mouseout, `graceMs`), bleibt ein offenes, nicht-stickies Popup `AppConfig.settings.popupGraceMs` (1100 ms) stehen; temporär entclusterte Marker werden erst danach entfernt. Betritt die Maus das Popup, macht `handlePopupEnter` es sticky und löscht `closeTimeout`. Ein Hover auf einen anderen Eintrag beendet die Karenz sofort.
- **Stift `.popup-edit`** (`fa-pen-to-square`, im FA-Subset vorhanden; Tooltip `tooltips.editSpace`, 7 Sprachen): in der Titelzeile direkt hinter dem Namen-Link (1. Zeile), der `gap` der Zeile (8 px) ist links und rechts zurückgenommen (`margin: 0 -8px`): der Stift sitzt am Namen, zum Lesezeichen bleibt genau 1 em (`.popup-edit + .popup-bookmark { margin-left: 1em }`). Klick (am Popup-Container delegiert, weil `popup.update()` den Inhalt neu aufbaut) → `openOverlayTab('addspace', { editId })` → Overlay im Bearbeiten-Modus, Space gewählt, Formular vorbelegt, kein Fokus im Suchfeld (keine Bildschirmtastatur). Touch: Trefferfläche 32 × 44 px (`pointer: coarse`) per Innenabstand + gegenläufigem Außenabstand — **nicht** per `::before`/`::after`, die gehören der Microtip-Sprechblase (eine eigene `::after`-Regel machte den Tooltip auf Touch leer). Embed (`embed.js`) bleibt ohne Stift.

### Zwei-Phasen Marker-Loading — `createMarkerForLocation` + `loadAndMergeFullData`
- **Stage 1**: `createMarkerForLocation()` fügt Marker ausschließlich in `allMarkers[]` ein — **nie direkt** in `clusterGroup`. Die clusterGroup wird allein durch `updateMarkers()` befüllt (nach `triggerFilterUpdate`).
- **Stage 2** (~800ms, Desktop): `loadAndMergeFullData()` awaitet `processNewLocations()` und ruft danach `triggerFilterUpdate()` — damit respektieren neue Marker aktive Filter (Country, Style etc.), bevor sie sichtbar werden.
- **Regel:** Kein Code darf `clusterGroup.addLayer(marker)` direkt aufrufen.

### `triggerFilterUpdate` — Country-Filter-Guard (search-header.js)
Wenn `_isOnLocationRoute = true` und kein Query/Pill aktiv → Fast-Path: nur `applyFilters()` (kein `filterByText`).
**Ausnahme:** `hasCountryFilter` überspringt den Fast-Path — `filterByText` muss laufen, damit `preFilteredLocations` aktuell bleibt.
`applyCountryFilter()` setzt zusätzlich `_isOnLocationRoute = false`.

### Phone-Suche (≤767px, 2026-10)
- Untere Leiste: Nav-Spalte **Hoch | Runter | Lupe** (`#search-open-btn`, je 40px) neben dem Grid mit **3 Zeilen × 40px**
  (Snap-Seite = 6 Items; Konstanten `PHONE_ROW_H`/`PHONE_ROWS` in `mobile-filter.js`, Tablet bleibt 58px/4×4 bzw. 3×5).
- Eingabezeile (`.search-input-row`) liegt **nur im geöffneten Filter-Pane** (ganz unten): `MobileFilterUI` verschiebt
  sie beim Öffnen ins Overlay und beim Schließen zurück in den Container (dort `display: none`). **Kein Auto-Fokus** —
  Tastatur erst beim Tippen ins Feld. Der Filter-Button links in der Zeile schließt das Pane.
- Chip-Leiste (`#mobile-active-filters`) steht über der Liste (Wrapper `.dropdown-main`), nicht über der Nav-Spalte.
- Kachel-Adresszeile (`.listing-city-line`): PLZ (`.loc-plz`) fällt weg, wenn PLZ + Stadt nicht passen (flex row-reverse +
  wrap); Status-Icon-Spalte 15px → Text beginnt auf der x-Position des Titeltexts.
- Filter-Pane (`.mf-overlay`, z-index 10001) liegt **über** der Liste (z-Achse), Unterkante = unterer Rand
  (Phone; Tablet: Oberkante der Eingabezeile, `MobileFilterUI._positionSheet()`). Es schließt nicht beim Tippen ins Feld;
  `resize` schließt nur bei Breitenänderung (Tastatur ändert nur die Höhe). Auto-Close-Timer ist bei offener Suche aus.
- Karten-Status (nur Phone): `#map-status` rechts unten direkt über der Attribution = schwarze Suchbegriff-Chips
  (`.map-term`: Suchtext + Stadt-Pills) vor dem Treffer-Zähler `#map-counter` (`SearchHeader.updateSearchCounter` /
  `renderMapTerms`). Tippen löscht die Suchbegriffe (`clearSearchTerms()`), nicht die Filter. Der Zähler in der
  Eingabezeile ist auf Phone ausgeblendet. Stadt-Vorschläge (`.autocomplete-container`) hängen im Pane absolut über der Zeile.
- Früher Klick-Handler für die Lupe inline in `index.html` (zeigt die Eingabezeile, bevor die Module geladen sind).
- Auto-Zoom (`zoom-manager.js`): `#map` endet bereits über der Bottom-UI → **kein** `--mobile-ui-height`-Padding in
  `fitBounds` (sonst doppelt abgezogen); oben bleibt die Pin-Höhe frei. Wächter: `tests/mobile-layout-guards.test.js`.

### Mobile-Layout-Invarianten (iOS-Streifen-Bug, 2026-10)
Auf dem Handy müssen immer gelten:
- `document.documentElement.scrollWidth === window.innerWidth` — die Seite darf **nie breiter als das Gerät** sein.
  Schon ein unsichtbarer Überhang (z.B. `::after` eines Microtip-Tooltips mit `opacity: 0`) lässt iOS WebKit
  (Safari **und** Vivaldi/Chrome auf iOS) die Seite skalieren/verschieben → absolut positionierte Karte schmaler als
  fixierte UI → schwarzer Body-Streifen rechts, besonders nach Tastatur auf/zu.
  Ursache damals: `.title-bar .tool-add::after` (~200px). Fix: im `@media (max-width: 767px)` ausgeblendet.
- `map.getSize()` entspricht der Box von `#map` — `#map` folgt `bottom: var(--mobile-ui-height)`;
  `mobile-filter.js updateMapBottom()` ist der **einzige** Pfad, der danach `map.invalidateSize()` auslöst.
- `#search-bar` hat auf Mobile ≥ 16px Schrift (sonst zoomt iOS beim Fokus).

Schnellprüfung (Konsole / Remote-Inspector am Gerät):
`[innerWidth, document.documentElement.scrollWidth, map.getSize().x, document.getElementById('map').offsetWidth]`
— alle vier gleich. Statische CI-Wächter: `tests/mobile-layout-guards.test.js`.
Test-Falle: der Service Worker liefert cache-first alte CSS/JS — beim Testen SW deregistrieren
(DevTools → Application) oder in CDP `Network.setBypassServiceWorker`.

### Brace-Depth-Check nach CSS-Änderungen
```bash
node -e "const fs=require('fs'),css=fs.readFileSync('search.css','utf8');let d=0;for(const c of css){if(c==='{')d++;else if(c==='}')d--;}console.log('depth:',d,d===0?'✅':'❌');"
```

---

## Deployment & CI/CD

```
git push main
     │
     ▼
.github/workflows/deploy.yml
     ├── git diff gegen Tag "last-deployed"  (nur geänderte Dateien)
     ├── curl FTPS → Netcup (hosting189417.ae8d9.netcup.net)
     └── Tag "last-deployed" aktualisieren

.github/workflows/update-status.yml  (cron */30 + cron-job.de alle 15 Min)
     ├── actions/cache/restore  status-memory.json  (nicht öffentlich; nur letzte zwei Signaturen je „offen“-Space ohne Zeitstempel)
     ├── node fetch-spaceapi-status.js  (SpaceAPI-/Adapter-Endpunkte abfragen; Alters-Regel: „offen“ nur < 24 h, „geschlossen“ bleibt; Sensor-Lebenszeichen — ADR-010)
     ├── actions/cache/save  status-memory.json
     ├── curl FTPS → status.json hochladen  (nur status.json; Gedächtnis/Zeitstempel nie öffentlich)
     └── kein git commit (status.json und status-memory.json in .gitignore)

.github/workflows/spaceapi-directory-sync.yml  (cron Mo 06:00 UTC)
     └── node tools/spaceapi-directory-sync.js --create-issues
         Match: gleicher Endpoint → Website-Host → Koordinaten ≤ 300 m (eindeutig)
         Dedup: kein Issue, wenn gleiche ID + URL schon als Issue existiert (auch geschlossen = abgelehnt)

.github/workflows/apply-spaceapi-issues.yml  (manuell)
     ├── node tools/apply-spaceapi-issues.js --apply  (offene SpaceAPI:-Issues → loc-enrichment.json)
     │   mode apply-ok: --apply --only-ok  (nur Label „ok“ aus /admin/, Live-Check; concurrency data-apply)
     ├── git commit + push
     └── gh workflow run deploy.yml  (GITHUB_TOKEN-Push triggert keinen Deploy)

.github/workflows/apply-all-issues.yml  (Admin „Übernehmen“ / Cron / manuell; mode dry-run | apply)
     ├── je Art ein Schritt (continue-on-error): apply-spaceapi (--apply --only-ok) · apply-workshop (--apply) · apply-calendar (--apply --only-ok) · apply-weekly (--apply --only-ok)
     │   Skripte schließen NICHT selbst: DEFERRED_CLOSE_FILE → closeOrDefer merkt nur vor
     ├── validate-data  →  EIN Commit  →  EIN gh workflow run deploy.yml
     ├── tools/close-deferred.js  (nur nach erfolgreichem Commit/Push; Fehler → Issues bleiben offen)
     └── Abschluss-Schritt schlägt fehl, wenn eine Art fehlgeschlagen ist (andere Arten wurden trotzdem übernommen)
     Die vier apply-*-issues.yml bleiben für manuelle Läufe / Notfälle.

.github/workflows/auto-apply-spaceapi.yml  (cron */15)
     └── node tools/auto-apply-check.js  (alle Arten zusammen ≥10 ok-Issues oder 1 h Ruhe → apply-all-issues.yml (apply) starten)

.github/workflows/update-makerspace-pr.yml / add-makerspace-pr.yml  (Label update-space / add-space am Formular-Issue)
     ├── Daten ändern → validate-data (npm run validate:ci) → erst dann schreiben
     ├── ungültig: nichts geschrieben, Kommentar mit Fehlern am Issue, Job rot
     └── update: direkter Commit nach main (kein PR) + `gh workflow run deploy.yml` (Bot-Pushes lösen KEINEN Deploy/CI aus); add: PR bleibt offen (Merge durch Mensch → stamp-edit-date.yml → Deploy)

.github/workflows/scan-workshop-url.yml  (workflow_dispatch aus /admin/: url + issue + scan_id)
     └── node tools/scan-workshop-url.js  → Kommentar `<!-- scan:ID -->` + JSON am Issue (Admin pollt, liest, löscht ihn)

.github/workflows/apply-workshop-issues.yml  (manuell / Cron-Auslöser / Admin)
     └── freigegeben = Checkbox „Freigegeben“ ODER Label ok; Deploy nur bei geänderter loc-enrichment.json
```

---

## Nächste freie Makerspace-ID
**278** (höchste vergebene: 277 · H3CKE)

---
*Aktualisieren bei: neuen Dateien, Umbenennung von Klassen/Methoden, neuen globalen Variablen, CSS-Breakpoint-Änderungen, Lifecycle-Änderungen.*
