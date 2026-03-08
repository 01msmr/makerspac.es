# JSDoc + @ts-check Migration

Ziel: Typ-Sicherheit und bessere IDE/KI-Unterstützung ohne Build-Step.

## Warum dieser Ansatz

- Kein Compiler, kein `dist/`-Ordner, kein CI-Umbau
- Browser lädt weiterhin direkte `.js`-Dateien
- VS Code und Claude Code verstehen JSDoc-Typen vollständig
- Inkrementell: eine Datei nach der anderen, jederzeit abbrechbar

---

## Migration vollständig ✅

Alle JS-Dateien mit bedeutender Logik haben `// @ts-check`.
Zentrale Datentypen sind in `types.js` definiert und projektübergreifend importiert.

| Datei | Was annotiert wurde |
|-------|---------------------|
| `types.js` | Zentrale Typdefinitionen: `MakerSpace`, `MakerSpaceAddress`, `SpaceApiStatusEntry`, `MarkerState`, `SpaceStyle`, `WorkshopType`, `AppPhase`, `Pill` |
| `app-context.js` | `locations: MakerSpace[]`, `locationById/markerById: Map`, `map: LeafletMap`, `clusterGroup: LeafletLayerGroup`, `waitFor/ready` mit `AppPhase` |
| `workshop-types.js` | `WORKSHOP_TYPES`, `getWorkshopIcon`, `getWorkshopsTooltip` |
| `colours.js` | `getDynamicSpaceColor` mit `Pick<MakerSpace>` |
| `filter-config.js` | `FILTER_CATEGORIES`, `getStyleIcon` |
| `config.js` | `@ts-check` (Imports aus Sub-Modulen bereits typisiert) |
| `search-filter.js` | Alle Methoden: `MakerSpace[]`/`Pill[]` auf `filterByText`, `applyPreFilters`, `updateMarkers`, `onResultsChange` |
| `listing-core.js` | `CreateItemOptions`, `SetupItemListenersOptions` Typedefs; alle Methoden mit `MakerSpace`/`LeafletMarker`/`LeafletDivIcon` |
| `search-header.js` | Alle `import('./app-context.js').Pill/Location` → `Pill`/`MakerSpace` |
| `nearby-header.js` | `ClickLocation` typedef, `init()` mit `LeafletMap`/`ListingCore` |
| `@types/leaflet` | Installiert als devDependency |
| `map.js` | `createMarkerForLocation`, `_buildPopupHTML`, `zfill`, `getLocationById`, `getMarkerByLocationId`, `updateMarkerIconForLocation`, alle `_apply*`-Handler |

---

## Verbleibende optionale Schritte

### Option A — `jsconfig.json` ✅ umgesetzt

`jsconfig.json` liegt im Projektroot. `checkJs: false` damit VS Code keine roten
Unterstreichungen für `window.*`-Globals zeigt — die `// @ts-check` Direktiven in
den einzelnen Dateien überschreiben das lokal wo es tatsächlich Sinn ergibt.

### Option B — CI-Typ-Check ❌ nicht sinnvoll

Getestet mit `tsc --noEmit --allowJs --checkJs *.js` → ~200 Fehler aus zwei
strukturellen Problemen:
- `window.i18n`, `window.mapUtils` etc. sind TypeScript unbekannt (würde `declare global {}` erfordern)
- Leaflet wird als UMD-Global (`L.marker()`) genutzt, `@types/leaflet` erwartet ES-Imports

Beides sind echte Architektur-Grenzen, keine JSDoc-Fehler. Ein failing CI-Gate
wäre nutzlos ohne vorherige Behebung dieser Grundprobleme.

---

## Checkliste für neue Dateien

- [ ] `// @ts-check` als erste Zeile
- [ ] Typedef-Imports: `/** @typedef {import('./types.js').MakerSpace} MakerSpace */`
- [ ] `@param` und `@returns` auf öffentliche Methoden
- [ ] Leaflet-Typen: `import('leaflet').Marker` statt `any` wo möglich
- [ ] Kein neues Laufzeit-Verhalten (nur Kommentare)
