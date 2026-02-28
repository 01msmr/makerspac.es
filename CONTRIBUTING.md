# Contributing to makerspac.es

## Makerspace hinzufügen (einfachster Weg)

1. GitHub Issue öffnen: [➕ Makerspace hinzufügen](https://github.com/uli-hh/makerspac.es/issues/new?template=add-makerspace.yml)
2. Formular ausfüllen (Name, Koordinaten, Website sind Pflichtfelder)
3. Ein automatischer PR wird erstellt — nach Review wird er gemerged

**Nächste freie ID:** wird automatisch berechnet (`max(IDs) + 1`)

---

## Lokale Entwicklung

Das Projekt braucht **kein Build-Tool**. Einfach einen lokalen HTTP-Server starten:

```bash
# Option A
npx serve .

# Option B
python3 -m http.server 8080

# Option C (VS Code Extension)
Live Server Extension
```

Dann: `http://localhost:8080`

---

## Tests

```bash
# Unit-Tests (Node.js built-in test runner)
npm test

# locations.json validieren
npm run validate

# Beides zusammen
npm run test:all
```

Tests liegen in [tests/](tests/):

| Datei | Was wird getestet |
|-------|-------------------|
| `app-context.test.js` | AppContext Lifecycle, waitFor, Phasen |
| `search-filter.test.js` | Suchlogik, Filter, Länder |
| `i18n.test.js` | Übersetzungen, Spracherkennung, Fallbacks |
| `routing.test.js` | Slug-Generierung, URL-Routing-Logik |
| `validate-locations.js` | JSON-Schema-Check für alle Makerspace-Einträge |

---

## Code-Konventionen

- **ES Module** (`import`/`export`), kein CommonJS
- **Kein Build-Tool**, kein TypeScript, keine externen Laufzeit-Abhängigkeiten
- **Mobile-First**: CSS-Änderungen die nur Mobile betreffen → in `@media (max-width: 767px)` einschließen
- **JS Mobile-Guards**: `if (window.innerWidth > 767) return;`
- CSS-Klammern nach jeder größeren Änderung prüfen (siehe unten)
- Neue Browser-APIs mit Feature-Detection absichern

### CSS-Sicherheitscheck

Nach CSS-Änderungen im `@media`-Block prüfen ob die Klammern korrekt sind:

```bash
node -e "
  const fs = require('fs');
  const css = fs.readFileSync('search.css', 'utf8');
  let d = 0;
  for (const c of css) { if (c === '{') d++; else if (c === '}') d--; }
  console.log('depth:', d, d === 0 ? '✅' : '❌ FEHLER');
"
```

---

## locations.json — Datenformat

```jsonc
{
  "name": "Toolbox Bodensee",          // Pflicht
  "ID": 278,                            // Pflicht, einmalig, nächste freie: max+1
  "loc": {
    "lat": 47.7126816,                  // Pflicht, Dezimalgrad
    "long": 9.3995537,                  // Pflicht, Dezimalgrad
    "plz": 88213,                       // Empfohlen
    "city": "Ravensburg",               // Pflicht
    "street": { "name": "...", "number": "...", "ext": "" },
    "country": "Germany"                // Pflicht, englischer Name
  },
  "style": "for all",                   // Pflicht: "for all" | "for youth" | "for students" | "commercial"
  "link": { "url": "https://...", "text": "toolbox-bodensee.de" },
  "spaceapi": { "endpoint": "https://..." },   // Optional
  "dates": { "space.init": 20240101, "datacheck.latest": 20250101 },
  "weekly": { "weekday": 3, "time": 1900 },    // 0=So, 1=Mo ... 6=Sa, 9=kein Treffen
  "workshops": ["3d", "laser", "electronics"]  // Optional
}
```

**Gültige Workshop-Keys:** `3d`, `laser`, `electronics`, `wood`, `metal`, `textile`, `cnc`, `bio`, `vr`

**Sortierung:** nach Land → PLZ → Name

---

## Deployment

Push auf `main` → GitHub Actions deployed automatisch auf www via FTPS.
Nur geänderte Dateien werden übertragen (Delta-Sync via `git diff`).

`status.json` ist nicht in git — wird alle 15 Minuten via separatem Workflow aktualisiert.
