# Architektur — makerspac.es
*Living Documentation · bei Änderungen aktualisieren · Stand: 2026-03*

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

---

## Datei-Karte (Root)

### JavaScript

| Datei | Verantwortung | Exportiert / Globale |
|-------|--------------|----------------------|
| `map.js` | Einstiegspunkt, Bootstrap, AppContext-Lifecycle | `window.app`, `window.locationById`, `window.markerById`, `window.i18n` |
| `app-context.js` | Lifecycle-Phasen, Shared State | `appContext` (import) |
| `main.js` | Orchestrierung, Leaflet-Icons, Module verknüpfen | `initApp()`, `window.mobileFilterUI`, `window.nearbySpacesManager` |
| `config.js` | ICONS, COLOURS, SETTINGS, WORKSHOP_TYPES, COUNTRY_CODES, Helper (inkl. `zfill`) | `AppConfig`, `window.AppConfig` |
| `search-filter.js` | Filter-Logik (kein DOM) | `SearchFilter` class |
| `search-header.js` | Such-UI, Autocomplete, Pills, Dropdown, Item-Clicks | `SearchHeader`, `SearchPillsManager`, `AutocompleteManager` |
| `listing-core.js` | Item-Rendering, Hover-Effekte, Connection Line, SVG-Schweif | `ListingCore` class |
| `routing.js` | URL-Hash → Filter, Auto-Geolocation | `RoutingManager`, `window.routingManager` |
| `data-store.js` | Einstellungen (Sprache, Theme, Clustering) persistieren | `DataStore`, `window.languageSwitcher` |
| `bookmark-manager.js` | Favoriten (Add/Remove/Export) | `BookmarkManager`, `window.bookmarkManager` |
| `datasync.js` | ConsentManager, localStorage-Wrapper | `ConsentManager`, `window.consent` |
| `nearby-header.js` | Nearby-Popover (Rechtsklick), Radius-Slider | `NearbyHeader`, `window.nearbySpacesManager` |
| `mobile-filter.js` | Mobile Filter-Sheet, Chip-Bar | `MobileFilterUI`, `window.mobileFilterUI` |
| `i18n.js` | Übersetzungen, `t()`, `setLanguage()` | `I18n`, `window.i18n` |
| `zoom-manager.js` | Map-Zoom-Steuerung, Auto-Zoom | `ZoomManager`, `window.zoomManager` |
| `embed.js` | Embed-Karte (iframe-Standalone, lädt nur in embed.html) | `EmbedMapExtended`, `window.embedMap` |
| `embed-overlay.js` | In-page Overlay für Embed-Anleitung (initiiert in map.js) | `initEmbedOverlay()` |
| `popup-builder.js` | Gemeinsamer Popup-HTML-Builder (main map + embed) | `buildPopupHTML()` |
| `map-utils.js` | Sticky-Popup, clearStickyPopup, Marker-Lookup | `window.mapUtils` |
| `i18n-init.js` | I18n-Singleton erstellen | inline init |
| `sw.js` | Service Worker (Cache-First / SWR / Network-First) | — |

### CSS

| Datei | Verantwortung | Definiert CSS-Vars? |
|-------|--------------|---------------------|
| `main-layout.css` | Basis-Layout, `#map`, `.title-bar`, `.search-container` | **Ja — zentrale Vars** (`--space-hover`, `--dropdown-bg`, etc.) |
| `main-components.css` | Shared Components (Buttons, Badges, Microtip) | Nein |
| `main-responsive.css` | Responsive Overrides (`@media`) | Nein |
| `search.css` | Suchleiste, Dropdown, Filter-Pills, Counter | Nein |
| `listing-core.css` | Listing-Items, Hover-Animationen | Nein |
| `nearby.css` | Nearby-Popover, Radius-Slider, Cursor-Hint | Nein |
| `autocomplete.css` | Autocomplete-Vorschlagsliste | Nein |

---

## Datenschicht — Drei-Tier-Architektur

| Datei | Inhalt | Gepflegt durch | Im Git |
|-------|--------|---------------|--------|
| `locations.json` | Manuell kuratierte Kerndaten (Name, Adresse, Coords, Style, Link) | Mensch | ✅ |
| `loc-enrichment.json` | Crawler-pflegbare Felder (workshops, events, spaceapi, weekly, dates.space.init) | Crawler-Tools | ✅ |
| `status.json` | Live Open/Closed-Status | Cron (alle 15 Min) | ❌ |

**Merge-Regel:** `generate-map-splits.js` kombiniert beide JSON-Dateien zur Build-Zeit.
Echter Wert in `locations.json` gewinnt immer — `loc-enrichment.json` füllt nur Lücken/Platzhalter.

**Platzhalter-Erkennung:**
- `weekly.weekday === 9 && weekly.time === 0` → kein echter Wert
- `dates.space.init === 20010000` → kein echter Wert

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

### Media Queries

| Breakpoint | Dateien |
|-----------|---------|
| `@media (max-width: 767px)` | mobile-filter.js, search.css, main-responsive.css, nearby.css |
| `@media (max-width: 768px)` | nearby.css (Popover wird Sheet) |
| `@media (prefers-color-scheme: dark)` | main-layout.css, nearby.css, search.css |

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

### Connection Line (Dropdown ↔ Marker)
- Wird gezeichnet: `listingCore.createConnectionLine(item, marker, color)`
- Wird gelöscht: bei `zoomstart`, `mouseleave`, `closeDropdown`
- Wird neu gezeichnet: bei `zoomend` via `updateHoverSVGPosition()` — **nur wenn `currentHoverItem` gesetzt**
- Nach Item-Click: `listingCore.currentHoverItem = activeItem` setzen, damit Redraw nach flyTo funktioniert

### Zwei-Phasen Marker-Loading — `createMarkerForLocation` + `loadAndMergeFullData`
- **Stage 1**: `createMarkerForLocation()` fügt Marker ausschließlich in `allMarkers[]` ein — **nie direkt** in `clusterGroup`. Die clusterGroup wird allein durch `updateMarkers()` befüllt (nach `triggerFilterUpdate`).
- **Stage 2** (~800ms, Desktop): `loadAndMergeFullData()` awaitet `processNewLocations()` und ruft danach `triggerFilterUpdate()` — damit respektieren neue Marker aktive Filter (Country, Style etc.), bevor sie sichtbar werden.
- **Regel:** Kein Code darf `clusterGroup.addLayer(marker)` direkt aufrufen.

### `triggerFilterUpdate` — Country-Filter-Guard (search-header.js)
Wenn `_isOnLocationRoute = true` und kein Query/Pill aktiv → Fast-Path: nur `applyFilters()` (kein `filterByText`).
**Ausnahme:** `hasCountryFilter` überspringt den Fast-Path — `filterByText` muss laufen, damit `preFilteredLocations` aktuell bleibt.
`applyCountryFilter()` setzt zusätzlich `_isOnLocationRoute = false`.

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
     ├── node fetch-spaceapi-status.js  (SpaceAPI-Endpunkte abfragen)
     ├── curl FTPS → status.json hochladen
     └── kein git commit (status.json in .gitignore)
```

---

## Nächste freie Makerspace-ID
**278** (höchste vergebene: 277 · H3CKE)

---
*Aktualisieren bei: neuen Dateien, Umbenennung von Klassen/Methoden, neuen globalen Variablen, CSS-Breakpoint-Änderungen, Lifecycle-Änderungen.*
