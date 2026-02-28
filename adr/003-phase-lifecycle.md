# ADR-003: Phase-basierter Lifecycle via AppContext

**Status:** Akzeptiert
**Datum:** (retroaktiv dokumentiert)

---

## Entscheidung

Die Anwendung durchläuft definierte Lifecycle-Phasen (`idle → services → map → data → app`),
koordiniert durch `app-context.js` (AppContext extends EventTarget).
Module warten per `await appContext.waitFor('phase')` auf Voraussetzungen.

## Begründung

- **Vermeidet Race Conditions:** Kein Modul greift auf `locations.json`-Daten zu, bevor sie geladen sind
- **Explizite Abhängigkeiten:** Jedes Modul deklariert, welche Phase es braucht
- **Keine globalen Callbacks-Spaghetti:** Kein `window.onload` + manuelle Flags
- **Testbarkeit:** Phasen einzeln mockbar in Unit-Tests

## Verworfene Alternativen

| Alternative | Abgelehnt weil |
|------------|---------------|
| `window.onload` + Flags | Race Conditions, unübersichtlich |
| Promise-Chaining in map.js | Alles in einer Datei, schwer erweiterbar |
| Event Bus (custom) | Mehr Boilerplate als EventTarget |

## Phasen-Übersicht

```
idle      → AppContext erstellt, noch kein Modul bereit
services  → i18n, ConsentManager, BookmarkManager, DataStore bereit
map       → Leaflet-Karte initialisiert, Cluster-Group bereit
data      → locations.json + status.json geladen und angereichert
app       → Alle UI-Module (SearchHeader, MobileFilterUI, etc.) bereit
```

## Konsequenzen

- Alle neuen Module müssen auf die richtige Phase warten
- `appContext` ist das einzige Modul ohne Up-Dependencies (Safe Leaf)
- `window.xxx` globals sind weiterhin nötig für Leaflet-Popup-Callbacks
  (Leaflet kennt das Modul-System nicht)

---
*Unveränderlich. Neue Entscheidung → neues ADR.*
