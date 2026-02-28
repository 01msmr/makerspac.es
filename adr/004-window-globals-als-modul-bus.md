# ADR-004: window.xxx globals als Modul-Kommunikationsbus

**Status:** Akzeptiert (Legacy-Muster, wird schrittweise durch appContext ersetzt)
**Datum:** (retroaktiv dokumentiert)

---

## Entscheidung

Module exponieren sich selbst über `window.xxx` (z.B. `window.bookmarkManager`,
`window.mobileFilterUI`), um Leaflet-Popup-HTML, inline Event-Handler
und andere Nicht-Modul-Kontexte erreichbar zu sein.

## Begründung

- **Leaflet-Popups:** Popup-HTML wird als String gerendert (`innerHTML`).
  Callbacks darin (`onclick="window.bookmarkManager.toggle(id)"`) brauchen globalen Zugriff.
- **Backward Compatibility:** Embed-Seiten und älterer Code referenzieren `window.app`
- **Kein Import möglich:** Leaflet-interne Callbacks sind kein ES-Modul-Kontext

## Aktuelle window.xxx Globals

| Global | Wer setzt es | Wer nutzt es |
|--------|-------------|-------------|
| `window.app` | map.js | Embed, Legacy |
| `window.bookmarkManager` | bookmark-manager.js | Popup-HTML, Leaflet-Callbacks |
| `window.i18n` | map.js | Popup-HTML, Legacy |
| `window.mapUtils` | map-utils.js | Popup-HTML, nearby.js |
| `window.mobileFilterUI` | main.js | mobile-filter.js, Debugging |
| `window.nearbySpacesManager` | main.js | nearby.js, map.js |
| `window.zoomManager` | main.js | search-header.js |
| `window.routingManager` | routing.js | search-header.js |
| `window.clusterGroup` | main.js | search-header.js, nearby.js |
| `window.map` | main.js | Leaflet-Callbacks, Debugging |
| `window.locationById` | map.js | Leaflet-Callbacks |
| `window.markerById` | map.js | Leaflet-Callbacks |
| `window.AppConfig` | config.js | Popup-HTML, inline Callbacks |

## Konsequenzen

- Neue Inter-Modul-Kommunikation: bevorzugt über `appContext` oder direkte Referenzen in `main.js`
- `window.xxx` für Leaflet-Popup-Callbacks weiterhin notwendig und OK
- Kein window.xxx für reine Business-Logik einführen

---
*Unveränderlich. Neue Entscheidung → neues ADR.*
