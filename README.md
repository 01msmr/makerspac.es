# makerspac.es

Interactive map of makerspaces, fablabs, hackerspaces and repair cafés — primarily in the DACH region and EU.

**Live:** [makerspac.es](https://makerspac.es)

Programmed and curated by Ulrich Maasmeier & AI.

## Features

- **Karte + Liste** mit Suche, Filtern (Stil, Status, Wochentag, Workshops), Nearby-Popover, Lesezeichen, 7 Sprachen
- **Live-Status** offen/geschlossen: SpaceAPI-Endpoints (Cron → `status.json`), dazu Adapter für Spaces ohne SpaceAPI; ein „offen“ gilt nur, wenn sein Zeitstempel jünger als 24 h ist (sonst „unbekannt“), „geschlossen“ bleibt — siehe [adr/010](adr/010-status-adapter-ohne-spaceapi.md)
- **Bearbeiten** direkt im Popover (Stift → Edit-Overlay, vorbefüllt); mit Admin-Token wird das Korrektur-Issue direkt angelegt
- **Reiter „new“**: letzte Änderungen nach Monaten (aus der Git-Historie, `data/changes.json`)
- **Admin-Review** (`/admin/`, statisch, nur Fine-grained PAT): Reiter **Spaces** (ein Space = eine Karte mit allen Eigenschaften, Freitext-Erkennung, Rückgängig mit Formularzustand) plus Reiter je Art; mehrere Prüfer mit Rollen, Prüfpfad und „in Bearbeitung“ — [adr/006](adr/006-admin-review-ohne-backend.md), [adr/009](adr/009-admin-space-als-review-einheit.md)
- **Daten-Pipeline** mit Crawlern (Workshops, Kalender, Weekly/Gründung, SpaceAPI-Directory) → Issues → Admin-Review → `apply-all-issues.yml` (1 Validierung, 1 Commit, 1 Deploy) — [adr/007](adr/007-bot-aenderungen-validieren-und-deployen.md)

---

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│  index.html  (entry, loads all CSS + map.js as ES Module)    │
└─────────────────────────┬────────────────────────────────────┘
                           │
                    ┌──────▼──────┐
                    │   map.js    │  Lifecycle-Orchestrator
                    │             │  AppContext: idle→services→map→data→app
                    └──────┬──────┘
          ┌────────────────┼────────────────────┐
          │                │                    │
   ┌──────▼──────┐  ┌──────▼──────┐  ┌─────────▼────────┐
   │   main.js   │  │  routing.js │  │  error-monitor.js │
   │ (init UI)   │  │ (URL hash)  │  │  (global catch)   │
   └──────┬──────┘  └─────────────┘  └──────────────────┘
          │
   ┌──────┼──────────────────────────┐
   │      │                          │
┌──▼──────▼───┐  ┌───────────────┐  ┌▼──────────────┐
│search-header│  │ nearby-header │  │  mobile-filter │
│(search + UI)│  │  (geolocation)│  │  (filter chips)│
└──────┬──────┘  └───────────────┘  └────────────────┘
       │
┌──────▼──────────────────────────────────┐
│              listing-core.js            │
│  (item rendering, SVG connectors, kbd)  │
└─────────────────────────────────────────┘
```

### Lifecycle Phases (AppContext)

| Phase      | Was passiert |
|------------|-------------|
| `idle`     | Modul-Start |
| `services` | i18n, BookmarkSync, ErrorMonitor initialisiert |
| `map`      | Leaflet-Karte geladen, Marker gesetzt |
| `data`     | locations.json geladen, `locationById`-Map befüllt |
| `app`      | Such- und Filter-UI bereit |

### Key Files

| Datei | Zweck |
|-------|-------|
| `map.js` | Entry Point, initialisiert alle Services |
| `config.js` | Zentrale Konfiguration (Farben, Workshop-Typen, Filter, Settings) |
| `locations.json` | Makerspace-Kerndaten: Name, Adresse, Coords, Style, Link (278 Einträge) |
| `loc-enrichment.json` | Ergänzungen pro ID: SpaceAPI-Endpoint (optional `adapter`), weekly, workshops, events |
| `data/*.json` | Build-Output von `generate-map-splits.js` (beide Dateien gemerged, nicht in git) |
| `status.json` | Status je Endpoint (generiert, nicht in git; Cron `update-status.yml`) |
| `admin/` | Review-Seite (statisch): `index.html`, `admin.js`, `spaces.js`, `spaces-lib.js`, `admin-lib.js`, CSS — ADR-006/009 |
| `tools/` | Crawler, Apply-Skripte, Status-Adapter (`tools/lib/status-adapters.js`, `status-freshness.js`), Changelog-Bau |
| `.github/workflows/` | Deploy, Status, Crawler, Apply (`apply-all-issues.yml`), Validierung |
| `architektur.md` · `adr/` | Vollständige Referenz und Designentscheidungen (ADR-001 …) |
| `lang.json` | Übersetzungen (de, en, fr, it, nl, da, uk) |
| `sw.js` | Service Worker (Cache-First Assets, SWR Data) |

### Data Flow

```
locations.json + loc-enrichment.json ──► generate-map-splits.js ──► data/*.json
data/*.json    ──► map.js ──► Leaflet-Marker + appContext.locationById
loc-enrichment.json (spaceapi.endpoint [+ adapter]) ──► fetch-spaceapi-status.js (Cron) ──► status.json
        └─ Alters-Regel: „offen“ nur bei Zeitstempel < 24 h (tools/lib/status-freshness.js), Gedächtnis nur im Actions-Cache
status.json    ──► StaticSpaceAPI ──► isOpen-Flag pro Space
Crawler ──► GitHub Issues ──► /admin/ (Spaces-Reiter, ok/verwerfen/korrigieren) ──► apply-all-issues.yml ──► Commit + Deploy
lang.json      ──► I18n.load() ──► i18n.t('key') überall nutzbar
```

### Design-Prinzipien

- **Zero dependencies**: kein Build-Tool, kein Framework, reine ES Module
- **Mobile-First**: CSS `@media (max-width: 767px)`; Touch-Erkennung über `layout-mode.js` (`'ontouchstart' in window`), nie über `window.innerWidth`
- **Offline-First**: Service Worker mit Cache-First-Strategie für Assets
- **Progressive**: PWA-fähig (Manifest, Icons, Offline-Fallback)

---

## Development

```bash
# Tests ausführen
npm test

# locations.json validieren
npm run validate

# Alles zusammen
npm run test:all

# Daten prüfen (locations.json + loc-enrichment.json) bzw. wie die CI (+ Unit-Tests + Wächter)
npm run validate
npm run validate:ci

# Karten-Splits erzeugen (data/*.json, nicht in git)
npm run generate

# Lokaler Dev-Server (beliebig, z.B.)
npx serve .
# oder
python3 -m http.server 8080
```

---

## Data

Map data from [OpenStreetMap](https://www.openstreetmap.org),
map rendering via [Leaflet.js](https://leafletjs.com) + [MapLibre GL](https://maplibre.org).

Real-time status via [SpaceAPI](https://spaceapi.io) (plus Adapter für Spaces ohne SpaceAPI, siehe [adr/010](adr/010-status-adapter-ohne-spaceapi.md)).
Spaces mit eigener Statusseite bitten wir gern um einen kleinen SpaceAPI-Endpoint (JSON mit `state.open`, HTTPS, `Access-Control-Allow-Origin: *`) — Mailvorlage: [docs/spaceapi-anfrage.md](docs/spaceapi-anfrage.md).

---

## Contributing

→ Siehe [CONTRIBUTING.md](CONTRIBUTING.md)
