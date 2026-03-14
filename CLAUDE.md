# CLAUDE.md — Verpflichtungen für Claude Code

## Pflichtlektüre vor Dateiänderungen

**Immer zuerst `architektur.md` lesen**, bevor du:
- eine neue Datei erstellst
- eine bestehende Klasse oder Funktion umbenennst
- Abhängigkeiten zwischen Modulen änderst
- CSS-Variablen oder Breakpoints anpasst

## Pflicht nach strukturellen Änderungen

`architektur.md` aktualisieren wenn:
- eine neue JS-Datei / Klasse / globale Variable hinzukommt
- eine Datei umbenannt oder gelöscht wird
- sich Abhängigkeiten zwischen Modulen ändern
- ein neuer CSS-Breakpoint oder eine neue CSS-Variable eingeführt wird
- sich der Lifecycle (AppContext-Phasen) ändert

ADR anlegen (`adr/NNN-titel.md`) wenn eine **grundlegende Designentscheidung** getroffen wird
(Framework-Wahl, Build-Step, Kommunikationsmuster, etc.).

---

## Kritische Muster — immer beachten

### Mobile/Desktop-Branching
```javascript
// Touch-Erkennung (Phone + Tablet) — IMMER so, nie window.innerWidth:
if ('ontouchstart' in window) { ... }

// CSS-Breakpoint für Layout:
// @media (max-width: 767px)

// Tablet-Guard (Touch ≥ 768px abdecken):
window.matchMedia('(max-width: 1024px), (min-width: 768px) and (pointer: coarse)')
```
- Niemals `window.innerWidth <= 767` für Touch-Detection — Tablets (768–1024px) werden nicht erkannt
- Niemals Mobile-CSS außerhalb von `@media (max-width: 767px)` schreiben

### Farben — Single Source of Truth
`colours.js` definiert alle Status-/Marker-Farben (`COLOURS`).
`applyCssColours()` setzt daraus CSS-Vars (`--space-open`, `--space-closed`, `--space-hover`, `--space-unknown`, `--nearby-title`) — reagiert auf Dark Mode.

UI-Farben (`--bg-color`, `--dropdown-bg`, `--text-color`, etc.) sind in `main-layout.css` `:root` definiert (CSS-only, Dark Mode via `@media`).

**Regel:** Niemals Hex-Farben in JS hardcoden — immer `AppConfig.colours.*` verwenden.
Niemals Hex-Farben in CSS hardcoden wenn eine passende CSS-Var existiert.

### CSS-Dateien — kein Bundle
Der Browser lädt CSS-Dateien direkt (einzelne `<link>`-Tags in `index.html`).
Kein Build-Schritt nötig.

### Lifecycle-Phasen (AppContext)
`idle → services → map → data → app`
Neue Module müssen auf die passende Phase warten: `await appContext.waitFor('phase')`.

### Connection Line nach Item-Click
Nach `flyTo()` redrawn `updateHoverSVGPosition()` die Linie — **nur wenn `listingCore.currentHoverItem` gesetzt**.
Bei Item-Clicks im Desktop-Modus: `listingCore.currentHoverItem = activeItem` setzen.

### Dropdown — auf Touch-Geräten ABSOLUT NIEMALS schließen
Auf Mobile + Tablet ist das `#suggestions-dropdown` das primäre Listing-UI. Es wird **niemals** geschlossen.
- `closeDropdown()` in `search-header.js` enthält eine harte Guard: `if ('ontouchstart' in window) return;`
- Dieser Guard darf **niemals** entfernt oder umgangen werden
- `mobile-filter.js`: `close()` darf **nicht** `bar-focused` entfernen — das würde den Dropdown ausblenden
- Kein Modul darf `bar-focused` von `.search-container` entfernen außer dem Such-Header selbst
- Der Filter-Pane (`mf-overlay`) liegt im Y-Bereich oberhalb der Search-Input-Row; der Dropdown bleibt darunter sichtbar

### Mobile Filter-Pane — Z-Index-Hierarchie
```
.search-container          z-index: 1001   (inkl. Dropdown)
.mf-overlay (Filter-Pane)  z-index: 10001  (über search-container → überlagert Dropdown)
```
- Filter-Pane `bottom` = `window.innerHeight - searchInputRow.getBoundingClientRect().top`
- Filter-Pane wird an `document.body` gehängt (nicht in search-container)
- Tabellen-Borders: CSS Grid `gap:1px; padding:1px; background:black` auf `.mf-sections-track`
- Kürzere Spalten: Ghost-Cells (`.mf-ghost-cell`) mit `background: var(--dropdown-bg)` füllen den Track auf

### ZoomManager — `_isAutoZooming` / `_userMoved`
```
_userMoved = true   → gesetzt bei dragstart / zoomstart (wenn !_isAutoZooming)
_userMoved = false  → gesetzt bei filterResultsChanged, reZoom-Button-Click, resetUserMoved()
_isAutoZooming      → true während executeZoom() + executeThreeFrameZoom() (Desktop)
                       und setupAutoZoom() Mobile-Pfad
```
- `_isAutoZooming = true` verhindert, dass Leaflet's `zoomstart` `_userMoved` setzt
- **Desktop-Rezoom-Button** (`#desktop-rezoom-btn`): zeigt wenn `_userMoved && previousZoomBounds`
  - Klick: ruft `searchHeader.reZoom()` → `zoomManager.setupAutoZoom()` direkt (kein Debounce, keine Guards)
  - `filterResultsChanged`-Event setzt `_userMoved = false` und versteckt Button sofort

### Search-Filter — State & Events
- `searchFilter.lastFilteredLocations` — letztes Filter-Ergebnis (alle gefilterten Locations)
- `searchFilter.lastLocationsForZoom` — letztes Zoom-Ziel (kann Subset sein, z.B. einzelner ID-Match)
- `document.dispatchEvent(new Event('filterResultsChanged'))` — feuert nach jedem `_notifyResultsChange()`
- Dropdown-Cap: `CONFIG.settings.maxListItems` (20) — nur 20 Items werden gerendert

### Marker-Updates — Diff + Batch
`updateMarkers()` in `search-filter.js`:
- Diff-basiert: vergleicht `_visibleMarkerIds` (Set) mit neuen Locations → nur Deltas ändern
- Batch: `clusterGroup.addLayers([...])` / `removeLayers([...])` statt Einzel-Calls

---

## Projektstruktur auf einen Blick

```
map.js              → Einstieg, Bootstrap, AppContext-Lifecycle, Marker-Setup
main.js             → Orchestrierung, Module verknüpfen
app-context.js      → Shared State, Phase-Barrieren

config.js           → Zentrale Config (assembliert aus Sub-Modulen)
colours.js          → Farbdefinitionen, applyCssColours(), Dark-Mode-Helpers
filter-config.js    → Filter-Kategorien, IGNORED_STYLES_SET, FILTER_ORDER_SET
workshop-types.js   → Workshop-Definitionen, WORKSHOP_ORDER_MAP, getSortedWorkshops()
types.js            → JSDoc-Typen (MakerSpace, Pill, AppPhase, …)

search-filter.js    → Filter-Logik (kein DOM), updateMarkers(), lastFilteredLocations
search-header.js    → Such-UI, Dropdown, Pills, Item-Clicks, reZoom()
listing-core.js     → Item-Rendering, Hover, Connection Line, i18n-Cache
mobile-filter.js    → Mobile Filter-Sheet
nearby-header.js    → Nearby-Popover (Rechtsklick / Long-Press)
routing.js          → URL-Hash → Filter, _cityCountMap, _styleCountMap
zoom-manager.js     → Auto-Zoom, Three-Frame-Zoom, _isAutoZooming/_userMoved

data-store.js       → Settings-Popover, Language-Switcher, Rezoom-Button (Desktop)
datasync.js         → QR-Code-Sync, ConsentManager, Bookmarks-Sync
bookmark-manager.js → Bookmark-State, debounced saveBookmarks()
spaceapi-static.js  → SpaceAPI-Status-Verarbeitung
popup-builder.js    → Leaflet-Popup HTML
i18n.js             → Internationalisierung
embed.js            → Embed-Modus (iframe)
embed-overlay.js    → Embed-Overlay UI
error-monitor.js    → Dev-Tool, Fehler-Overlay
sw.js               → Service Worker (Cache-First / SWR)
```

CSS-Vars: `main-layout.css` · Komponenten: `main-components.css` · Responsive: `main-responsive.css`
Mobile/Search: `search.css` · Listing: `listing-core.css` · Nearby: `nearby.css`
Vollständige Referenz: **`architektur.md`** · Designentscheidungen: **`adr/`**

---

## Deployment

- Push auf `main` → GitHub Actions → FTPS → Netcup
- `status.json` wird per Cron aktualisiert, nicht per git
- Nächste freie Makerspace-ID: **278**
