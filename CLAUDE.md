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
const isMobile = window.innerWidth <= 767 || ('ontouchstart' in window);
```
- CSS-Breakpoint: `@media (max-width: 767px)`
- Niemals Mobile-CSS außerhalb dieses Blocks schreiben

### CSS-Integrität nach Änderungen prüfen
```bash
node -e "const fs=require('fs'),css=fs.readFileSync('search.css','utf8');let d=0;for(const c of css){if(c==='{')d++;else if(c==='}')d--;}console.log('depth:',d,d===0?'✅':'❌');"
```
Gilt für jede CSS-Datei mit `@media`-Blöcken.

### CSS Custom Properties
Alle Variablen (`--space-hover`, `--dropdown-bg`, etc.) sind in `main-layout.css` definiert.
Niemals hardcodierte Farben einführen — immer CSS-Var verwenden.

### Lifecycle-Phasen (AppContext)
`idle → services → map → data → app`
Neue Module müssen auf die passende Phase warten: `await appContext.waitFor('phase')`.

### Connection Line nach Item-Click
Nach `flyTo()` redrawn `updateHoverSVGPosition()` die Linie — **nur wenn `listingCore.currentHoverItem` gesetzt**.
Bei Item-Clicks im Desktop-Modus: `listingCore.currentHoverItem = activeItem` setzen.

---

## Projektstruktur auf einen Blick

```
map.js          → Einstieg, Bootstrap, AppContext-Lifecycle
main.js         → Orchestrierung, Module verknüpfen
app-context.js  → Shared State, Phase-Barrieren
config.js       → Zentrale Config (Icons, Farben, Settings)
search-filter.js → Filter-Logik (kein DOM)
search-header.js → Such-UI, Dropdown, Pills, Item-Clicks
listing-core.js  → Item-Rendering, Hover, Connection Line
mobile-filter.js → Mobile Filter-Sheet
nearby.js        → Nearby-Popover (Rechtsklick)
routing.js       → URL-Hash → Filter
```

CSS-Variablen: `main-layout.css` · Mobile: `search.css`, `main-responsive.css`
Vollständige Referenz: **`architektur.md`** · Designentscheidungen: **`adr/`**

---

## Deployment

- Push auf `main` → GitHub Actions → FTPS → Netcup
- `status.json` wird per Cron aktualisiert, nicht per git
- Nächste freie Makerspace-ID: **278**
