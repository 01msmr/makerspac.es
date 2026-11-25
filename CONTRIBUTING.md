# Contributing to makerspac.es

## Makerspace hinzufügen (einfachster Weg)

1. GitHub Issue öffnen: [➕ Makerspace hinzufügen](https://github.com/uli-hh/makerspac.es/issues/new?template=add-makerspace.yml)
2. Formular ausfüllen (Name, Koordinaten, Website sind Pflichtfelder)
3. Ein automatischer PR wird erstellt — nach Review wird er gemerged

**Nächste freie ID:** wird automatisch berechnet (`max(IDs) + 1`)

**Bestehenden Space korrigieren:** im Popover auf den **Stift** klicken (öffnet das Edit-Overlay, Space und Formular sind vorbefüllt; Link aus dem Admin: `/?edit=ID`). Mit einem Admin-Token (siehe unten, gleicher Browser) legt das Overlay das Korrektur-Issue **direkt per API** an, sonst öffnet sich der vorbefüllte GitHub-Issue-Tab.

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
| `spaces-lib.test.js` | Spaces-Reiter: Gruppieren, Warteschlange, Planung, Freitext-Analyse, 30-Minuten-Raster, Teil-Vorschläge |
| `weekly-remove.test.js` | Option „kein weekly“: Parser → Apply → Changelog |
| `reviewers.test.js` | Rollen, „in Bearbeitung“-Sperre, Prüfpfad |
| `apply-all.test.js` | gemeinsamer Apply-Lauf, Issues erst nach dem Push schließen |
| `status-adapters.test.js` · `status-freshness.test.js` | Status ohne SpaceAPI, Alters-Regel (24 h, nur „offen“), Sensor-Lebenszeichen, nicht öffentliches Gedächtnis |
| `popup-edit.test.js` · `edit-via-pat.test.js` | Stift im Popover, Hover-Karenz, Overlay-Direkt-Submit mit Token |
| `workflow-guards.test.js` · `load-path-guards.test.js` | Wächter für Workflows (Deploy/Concurrency/ref: main) und den Ladepfad (ADR-005) |

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
    "spaceapi": { "endpoint": "https://..." },    // optional: "adapter": "html-style" (Status ohne SpaceAPI, ADR-010)
    "weekly": { "weekday": 3, "time": 1900 },    // 0=So, 1=Mo ... 6=Sa; Uhrzeit im 30-Minuten-Raster (Admin); 9 = Platzhalter „unbekannt“
    "workshops": ["3d", "laser", "electronics"],
    "events": "https://..."
  }
}
```

**Gültige Workshop-Keys:** `3d`, `laser`, `electronics`, `wood`, `metal`, `textile`, `cnc`, `bio`, `vr` (vollständig: `workshop-types.js`)

**Treffen entfernen:** im Admin (Spaces-Reiter) im Wochentag-Dropdown **„kein weekly“** wählen → das Issue trägt `"weekly": null`, der Apply-Schritt löscht `weekly` (Gründung bleibt).

---

## Status ohne SpaceAPI und Alters-Regel

- **Quellen:** SpaceAPI-JSON, Klartext `0`/`1`, ThingSpeak, und der Adapter `html-style` (Statusseite mit `background:red/green`, Pilot: Fabulous St. Pauli) — `tools/lib/status-adapters.js`; konfiguriert über `spaceapi.adapter` in `loc-enrichment.json`.
- **Alters-Regel (global, `STATUS_MAX_AGE_HOURS` = 24 h):** ein „offen“ gilt nur, wenn der Sende-/Zeitstempel der Quelle (SpaceAPI `state.lastchange`, ThingSpeak `created_at`) jünger ist, sonst „unbekannt“; „geschlossen“ wird nie verworfen. Lebenszeichen: ein junger Anwesenheits-Sensor (`people_now_present`/`door_locked`). Ohne Zeitstempel merkt sich der Cron nur die letzten zwei Signaturen (nicht öffentlich, Actions-Cache). Ein unbekannter Status heißt überall „unknown“.
- Mailvorlage für die Anfrage an Spaces: [docs/spaceapi-anfrage.md](docs/spaceapi-anfrage.md); Hintergründe: [adr/010](adr/010-status-adapter-ohne-spaceapi.md).

---

## Vorschläge prüfen (`/admin/`)

**Reiter „Spaces“ (Standard):** ein Space = eine Karte mit allen Eigenschaften (Workshops, Kalender, SpaceAPI, Treffen/Gründung). Offene Vorschläge sind vorbelegt, jede Eigenschaft ist änderbar. Tasten: `y` übernehmen · `n` alles verwerfen · `ä` später (ans Ende) · `z` rückgängig (stellt auch Häkchen und Werte wieder her) · `←` `→` Bearbeiten-Auswahl (Alles / eine Eigenschaft). Das **Freitextfeld** (auch aus der Zwischenablage) erkennt Workshops, Treffen (nur 30-Minuten-Raster), Gründung, Kalender- und SpaceAPI-URLs. Treffen-Teilvorschläge zeigen den aktuellen Rest; geschrieben wird nur, was sich ändert. Name/Adresse/Link/Stil: Link „Stammdaten“ → Edit-Overlay. Details: [adr/009](adr/009-admin-space-als-review-einheit.md).

**Reiter je Art** (SpaceAPI, Workshops, Kalender, Weekly) bleiben dahinter bestehen:

Bot-Issues `SpaceAPI: …` (Label `data-update`) und `[Workshop-Daten] …` (Label `workshop-data`; Reiter „Workshops": Checkboxen mit dem Vorschlag, dazu Textfeld — Text einfügen hakt erkannte Typen an, „Website auslesen (Server)" liest die Website bzw. eine eingefügte URL serverseitig per GitHub-Workflow aus, ca. 30–60 s) sowie `Kalenderlink: …` (Reiter „Kalender", URL-Feld) und `Treffen-Daten: …` (Reiter „Weekly": ein Textfeld, z. B. `Di 19:00, 2015` = Weekly-Treffen und/oder Gründung; Weekday So–Sa, Gründung als Jahr, Jahr-Monat oder Datum) werden auf `makerspac.es/admin/` abgearbeitet (auch am Smartphone: Knöpfe unten statt Tasten, Website per „im Tab öffnen“). Am Ende einer Liste springt die Seite zum nächsten Reiter. Weitere Reiter (PRs, Neu, Änderung, Daten, Sonstige) erscheinen nur, wenn etwas offen ist, und verlinken auf GitHub. Die Spalte „Aktuell“ zeigt immer den aktuellen Stand von `main` (wie die Karte: `locations.json` Grunddaten + `loc-enrichment.json` Ergänzungen; dazu „Zuletzt bearbeitet“ aus `dates`) — oben steht „Daten: Uhrzeit · Commit"; sie aktualisiert sich bei Fokus, alle 2 Minuten, nach „Übernehmen" und per ↻; dabei wird auch die Liste der offenen Vorschläge abgeglichen (der Tab darf stundenlang offen bleiben: erledigte Issues verschwinden, und `y`/`n` schreibt nie auf ein inzwischen geschlossenes Issue). Wurde ein Vorschlag bei der Übernahme abgelehnt (ungültige Daten, toter Endpoint), kommt er in seinem Reiter zurück: rot markiert (⚠) mit dem Grund; nach `y` verschwindet die Markierung. Der Reiter „Probleme" zeigt ungelöste Workflow-Fehler (24 h) und Vorschläge, die seit über 2 h mit `ok` offen sind (nicht verlinkt, `noindex`):

1. Fine-grained PAT anlegen: nur Repo `01msmr/makerspac.es`, **Issues R/W** + **Actions R/W**, mit Ablauf; auf der Seite einfügen.
2. Je Vorschlag (`j`/`k` = Website/Endpoint rechts): `y` = ok (Label `ok`; geänderte Eingaben direkt im Formular — Endpoint bzw. Workshop-Checkboxen — werden dabei ins Issue übernommen) · `Esc` = Änderungen verwerfen · `n` = ablehnen (Issue schließen; auch `y` ohne angehakten Workshop-Typ schließt das Issue ohne Übernahme; bestehende Workshops bleiben dabei unverändert. Zum **Ersetzen oder Entfernen** bestehender Workshops die Auswahl „Bestehende Workshops ersetzen bzw. entfernen" ankreuzen (im Reiter „Kalender" ist es anders herum: ein **anderer** Vorschlag für ein Space mit vorhandenem Link ersetzt diesen standardmäßig — „Neuen Kalenderlink übernehmen" ist vorangehakt, Haken entfernen = bestehenden behalten; nur **Entfernen** ist eine eigene, ausdrückliche Auswahl) — mit keinem Typ angehakt werden sie entfernt, erst beim Übernehmen, bis dahin mit `z` rückgängig) · `ä` = später · `z` = letzte Aktion rückgängig (Label weg / Issue wieder offen / alter Text zurück; nicht mehr nach „Übernehmen"). Jede Aktion zeigt einen Toast (grün = ok, rot = abgelehnt/Fehler, gelb = angepasst/später); im Vergleich steht rot für „Aktuell", grün für den Vorschlag, gelb mit ⚠ für Verdächtiges (Name/Website/Koordinaten weichen ab, Confidence low)
3. Übernommen wird automatisch ab 10 `ok`-Vorschlägen oder 1 h nach dem letzten (Cron `auto-apply-spaceapi.yml`, auch bei geschlossenem Tab — GitHub führt Cron-Läufe aber nur unregelmäßig aus, daher im Zweifel **„Übernehmen“** drücken); „Übernehmen (N)" startet es sofort; „abmelden" löscht den Token aus dem Browser: → Workflow `apply-all-issues.yml` (alle Arten gemeinsam; früher je Art `apply-spaceapi-issues.yml` (`apply-ok`)) prüft die Endpoints live, schreibt `loc-enrichment.json`, 1 Commit + 1 Deploy.
4. Das Label `ok` wird beim ersten Setzen automatisch angelegt (sonst einmalig manuell).

### Weitere Prüfer einladen

1. Person als **Collaborator** hinzufügen (Settings → Collaborators): Rolle **Write** (darf auch „Übernehmen“ und sieht „Probleme“) oder **Triage** (entscheidet nur; übernommen wird automatisch per Cron — falls das Korrigieren am Issue-Body nicht geht, Write vergeben).
2. Die Person erstellt einen **Fine-grained PAT** nur für `01msmr/makerspac.es` (Issues: Read/Write; für „Übernehmen“ zusätzlich Actions: Read/Write) mit Ablauf und trägt ihn unter `/admin/` ein.
3. Kopfzeile zeigt „@login · Admin/Reviewer“; jede Entscheidung hinterlässt einen Kommentar „… — @login (Admin-Review)“, in „Spaces“ steht „in Bearbeitung von @x“ für Spaces, die jemand anderes gerade prüft.


## App zurücksetzen (Cache/Service Worker)

Zeigt ein Gerät nach einem Deploy noch den alten Stand: `https://makerspac.es/admin/reset.html` öffnen (auch als Lesezeichen/Homescreen-Icon; im Admin: „App zurücksetzen"). Die Seite meldet den Service Worker ab, leert alle Caches und die Daten-Zwischenspeicher und lädt neu — Admin-Token, Lesezeichen und Einstellungen bleiben erhalten (anders als „Websitedaten löschen" im System). Der „Veraltet"-Toast ruft sie über „Neu laden" auf.

## Deployment

Push auf `main` → GitHub Actions deployed automatisch auf www via FTPS.
Nur geänderte Dateien werden übertragen (Delta-Sync via `git diff`).

`status.json` ist nicht in git — wird alle 15 Minuten via separatem Workflow (`update-status.yml`, ausgelöst per cron-job.org) aktualisiert. Das Status-Gedächtnis (`status-memory.json`) liegt nur im Actions-Cache und wird weder committet noch hochgeladen.
