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

**Lokal testen — Stolperfallen**

- `status.json` liegt nicht im Repo (`.gitignore`) → lokal `curl https://makerspac.es/status.json -o status.json`
  (sonst 404 und keine Live-Status-Pins). Wird nie committet.
- Der **Service Worker** liefert JS/CSS cache-first: nach Änderungen DevTools → Application → Service Workers →
  *Unregister* + Reload (oder „Bypass for network"). Sonst testest du alte Dateien.
- Mobile-Verhalten (Tastatur, Safe-Area, Standalone/PWA) lässt sich nicht emulieren — am echten Gerät prüfen
  (iOS: Safari Web Inspector; Android: `chrome://inspect`). Layout-Schnellprüfung: siehe
  [architektur.md → Mobile-Layout-Invarianten](architektur.md).

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
| `tile-loader.test.js` | Tile-Modus-Erkennung, MapLibre-Lader (idempotent) |
| `data-preload.test.js` | Länder-Erkennung aus Hash, Preload der Startdaten |
| `toast.test.js` | Info-Toast: Position, Wiederverwendung, Ausblenden |
| `mobile-layout-guards.test.js` | statische Wächter gegen den iOS-Streifen-Bug (Tooltip-Überhang, Map-Resize-Pfad) |
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
  "dates": { "space.init": 20240101, "space.edited.latest": 20250101 }
}
```

**Sortierung:** nach Land → PLZ → Name

`dates` kennt nur `space.init` (Gründung des **Vereins bzw. Trägers**, nicht eines Standorts) und `space.edited.latest` (YYYYMMDD; Platzhalter `20010000` für unbekannt). `spaceapi`, `weekly`, `workshops` und `events` gehören **nicht** in `locations.json` — sie liegen in `loc-enrichment.json`.

---

## loc-enrichment.json — Datenformat

Objekt, Schlüssel = Makerspace-ID als String. Alle Felder optional; `generate-map-splits.js` merged sie zur Build-Zeit, `fetch-spaceapi-status.js` liest die SpaceAPI-Endpoints von hier.

```jsonc
{
  "1": {
    "spaceapi": { "endpoint": "https://..." },
    "weekly": { "weekday": 3, "time": 1900 },    // 0=So, 1=Mo ... 6=Sa, 9=kein Treffen
    "workshops": ["3d", "laser", "electronics"],
    "events": "https://..."
  }
}
```

**Gültige Workshop-Keys:** `3d`, `laser`, `electronics`, `wood`, `metal`, `textile`, `cnc`, `bio`, `vr`

---

## Vorschläge prüfen (`/admin/`)

Bot-Issues `SpaceAPI: …` (Label `data-update`) und `[Workshop-Daten] …` (Label `workshop-data`; Reiter „Workshops": Checkboxen mit dem Vorschlag, dazu Textfeld — Text einfügen hakt erkannte Typen an, „Website auslesen (Server)" liest die Website bzw. eine eingefügte URL serverseitig per GitHub-Workflow aus, ca. 30–60 s) sowie `Kalenderlink: …` (Reiter „Kalender", URL-Feld) und `Treffen-Daten: …` (Reiter „Weekly": ein Textfeld, z. B. `Di 19:00, 2015` = Weekly-Treffen und/oder Gründung; Weekday So–Sa, Gründung als Jahr, Jahr-Monat oder Datum) werden auf `makerspac.es/admin/` abgearbeitet (auch am Smartphone: Knöpfe unten statt Tasten, Website per „im Tab öffnen“). Am Ende einer Liste springt die Seite zum nächsten Reiter. Weitere Reiter (PRs, Neu, Änderung, Daten, Sonstige) erscheinen nur, wenn etwas offen ist, und verlinken auf GitHub. Die Spalte „Aktuell“ zeigt immer den aktuellen Stand von `main` (wie die Karte: `locations.json` Grunddaten + `loc-enrichment.json` Ergänzungen; dazu „Zuletzt bearbeitet“ aus `dates`) — oben steht „Daten: Uhrzeit · Commit"; sie aktualisiert sich bei Fokus, alle 2 Minuten, nach „Übernehmen" und per ↻; dabei wird auch die Liste der offenen Vorschläge abgeglichen (der Tab darf stundenlang offen bleiben: erledigte Issues verschwinden, und `y`/`n` schreibt nie auf ein inzwischen geschlossenes Issue). Wurde ein Vorschlag bei der Übernahme abgelehnt (ungültige Daten, toter Endpoint), kommt er in seinem Reiter zurück: rot markiert (⚠) mit dem Grund; nach `y` verschwindet die Markierung. Der Reiter „Probleme" zeigt ungelöste Workflow-Fehler (24 h) und Vorschläge, die seit über 2 h mit `ok` offen sind (nicht verlinkt, `noindex`):

1. Fine-grained PAT anlegen: nur Repo `01msmr/makerspac.es`, **Issues R/W** + **Actions R/W**, mit Ablauf; auf der Seite einfügen. Die Anmeldung ist ein echtes Passwort-Formular: Der Passwort-Manager des Geräts (iCloud-Schlüsselbund, 1Password …) kann den Token speichern und füllt ihn automatisch ein — er überlebt dort auch „Websitedaten löschen“ (der Token im Browser selbst, `localStorage`, wird dabei gelöscht).
2. Je Vorschlag (`j`/`k` = Website/Endpoint rechts): `y` = ok (Label `ok`; geänderte Eingaben direkt im Formular — Endpoint bzw. Workshop-Checkboxen — werden dabei ins Issue übernommen) · `Esc` = Änderungen verwerfen · `n` = ablehnen (Issue schließen; auch `y` ohne angehakten Workshop-Typ schließt das Issue ohne Übernahme; bestehende Workshops bleiben dabei unverändert. Zum **Ersetzen oder Entfernen** bestehender Workshops die Auswahl „Bestehende Workshops ersetzen bzw. entfernen" ankreuzen (im Reiter „Kalender" ist es anders herum: ein **anderer** Vorschlag für ein Space mit vorhandenem Link ersetzt diesen standardmäßig — „Neuen Kalenderlink übernehmen" ist vorangehakt, Haken entfernen = bestehenden behalten; nur **Entfernen** ist eine eigene, ausdrückliche Auswahl) — mit keinem Typ angehakt werden sie entfernt, erst beim Übernehmen, bis dahin mit `z` rückgängig) · `ä` = später · `z` = letzte Aktion rückgängig (Label weg / Issue wieder offen / alter Text zurück; nicht mehr nach „Übernehmen"). Jede Aktion zeigt einen Toast (grün = ok, rot = abgelehnt/Fehler, gelb = angepasst/später); im Vergleich steht rot für „Aktuell", grün für den Vorschlag, gelb mit ⚠ für Verdächtiges (Name/Website/Koordinaten weichen ab, Confidence low)
3. Übernommen wird automatisch ab 10 `ok`-Vorschlägen oder 1 h nach dem letzten (Cron `auto-apply-spaceapi.yml`, auch bei geschlossenem Tab); „Übernehmen (N)" startet es sofort; „abmelden" löscht den Token aus dem Browser: → Workflow `apply-spaceapi-issues.yml` (`apply-ok`) prüft die Endpoints live, schreibt `loc-enrichment.json`, 1 Commit + 1 Deploy.
4. Das Label `ok` wird beim ersten Setzen automatisch angelegt (sonst einmalig manuell).

## Deployment

Push auf `main` → GitHub Actions deployed automatisch auf www via FTPS.
Nur geänderte Dateien werden übertragen (Delta-Sync via `git diff`).

`status.json` ist nicht in git — wird alle 15 Minuten via separatem Workflow aktualisiert.
