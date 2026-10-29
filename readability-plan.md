# Plan: Lesbarkeit & Struktur (Stand 2026-10, noch nicht umgesetzt)

Ziel: Code, der für Menschen **und** KI schnell zu erfassen ist — kleine Module mit einer Aufgabe, eine Quelle pro
Regel, wenig Duplikate. Reihenfolge = Nutzen/Risiko. Jeder Schritt: Test zuerst (Logik), danach im Emulator
**öffnen/schließen/erneut öffnen** prüfen (nicht nur das Offensichtliche — ein verdeckter Import brach schon das Pane).

## Schon erledigt
`layout-mode.js` (Media-Queries als SSOT), `dropdown-pager.js` aus `mobile-filter.js` (996 → 650 Zeilen), 14 tote
Funktionen entfernt, Lazy-Loading (`overlay-loader.js`, Demo), Wächter-Tests (`load-path-guards`, Shadowing in `layout-mode`).

## 1. Breakpoint-Prüfungen vereinheitlichen (klein, Tests anpassen)
`window.innerWidth <= 767` / `> 767` → `isPhone()` aus `layout-mode.js` (11 Stellen):
`listing-core.js:32`, `nearby-header.js:710`, `marker-manager.js:531`, `search-filter.js:306,367`, `map.js:670`,
`search-header.js:237,255,366,976,1158,1182`.
- Tests stubben bisher `window.innerWidth` → stattdessen `matchMedia` stubben (Helper in den Tests).
- Achtung `search-header.js:976`: `innerWidth <= 767 || 'ontouchstart' in window` ist **Touch**-Erkennung (CLAUDE.md-Regel),
  nicht Layout — dort `'ontouchstart' in window` belassen, `isPhone()` nur für Layout.

## 2. `nearby-header.js` (1321 Zeilen) aufteilen
Eine Klasse mit vier Aufgaben. Schnitt entlang der Methoden:
- **Popover Desktop** (`showPopover`, `positionPopover`, `setupPopoverDrag/Resize`, Slider) → `nearby-popover.js`
- **Phone-Panel** (`showMobileNearby`, `updateMobileNearby`, `_renderMobileList`, `_fitMobileToCircle`) → `nearby-mobile.js`
- **Suchkreis** (`drawSearchCircle`, `setupCircleDrag`) → `nearby-circle.js`
- Rest (Daten, Geocoding, Radius) bleibt in `NearbyHeader` als Orchestrierung.
Vorher: Charakterisierungs-Tests für Radius-/Distanzlogik; danach Emulator: Rechtsklick/Long-Press, Radius ändern, Drag.

## 3. `search-header.js` (1231 Zeilen) entschlacken
- `initializeEventListeners` (95 Zeilen) in benannte `_bind…`-Methoden zerlegen.
- Kategorie-Pills/Popover (`createCategoryPill`, `createActiveFiltersSection`, `selectCategoryOption`, …) → `category-filter-ui.js`
  (nutzt `isMultiSelect`/`getActiveFiltersForCategory`).
- `handleItemClick` (91 Zeilen): Desktop-/Touch-Pfad trennen.

## 4. Lange Funktionen
`listing-core.setupItemListeners` (144), `mobile-filter.renderSection` (133), `mobile-filter.init` (≈ 60 nach Pager),
`zoom-manager.setupAutoZoom` (86): je in kleine, benannte Schritte teilen (kein Verhaltenswechsel).

## 5. Kleinkram
- `nearby-header.js`: Klasse um 2 Leerzeichen zu weit eingerückt, `const CONFIG = AppConfig` Alias.
- `.search-container`-Regeln in `search.css` (1500+ Zeilen) nach Verantwortung gliedern (Kommentar-Register oben).
- `architektur.md`/`CLAUDE.md` nach jedem Schnitt aktualisieren (Modulliste, Abhängigkeiten, `sw.js` + `modulepreload`).

## Nicht tun
Bündeln/Build-Step (ADR-002/005) oder Dateien aus Prinzip zusammenlegen — Nutzen gering, kostet SSOT/Lesbarkeit.
