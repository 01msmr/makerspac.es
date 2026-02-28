# makerspac.es

Interactive map of makerspaces, fablabs, hackerspaces and repair cafés — primarily in the DACH region and EU.

**Live:** [makerspac.es](https://makerspac.es)

Programmed and curated by Ulrich Maasmeier & AI.

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
| `locations.json` | Makerspace-Daten (277+ Einträge) |
| `status.json` | SpaceAPI-Status (generiert, nicht in git) |
| `lang.json` | Übersetzungen (de, en, fr, it, nl, da, uk) |
| `sw.js` | Service Worker (Cache-First Assets, SWR Data) |

### Data Flow

```
locations.json ──► map.js ──► Leaflet-Marker + appContext.locationById
status.json    ──► StaticSpaceAPI ──► isOpen-Flag pro Space
lang.json      ──► I18n.load() ──► i18n.t('key') überall nutzbar
```

### Design-Prinzipien

- **Zero dependencies**: kein Build-Tool, kein Framework, reine ES Module
- **Mobile-First**: CSS `@media (max-width: 767px)`, JS-Guards mit `window.innerWidth`
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

# Lokaler Dev-Server (beliebig, z.B.)
npx serve .
# oder
python3 -m http.server 8080
```

---

## Data

Map data from [OpenStreetMap](https://www.openstreetmap.org),
map rendering via [Leaflet.js](https://leafletjs.com) + [MapLibre GL](https://maplibre.org).

Real-time status via [SpaceAPI](https://spaceapi.io).

---

## Contributing

→ Siehe [CONTRIBUTING.md](CONTRIBUTING.md)
