# ADR-001: Vanilla JS — kein UI-Framework

**Status:** Akzeptiert
**Datum:** (vor Projektstart, retroaktiv dokumentiert)
**Kontext:** makerspac.es ist eine interaktive Karten-SPA

---

## Entscheidung

Kein JavaScript-Framework (kein React, Vue, Angular, Svelte).
Die gesamte UI-Logik ist in Vanilla JS (ES6-Module) geschrieben.

## Begründung

- **Keine Build-Pipeline nötig:** Direkt im Browser lauffähig, kein Webpack/Vite/Rollup
- **Minimale Ladezeit:** Kein Framework-Bundle (~0 KB Overhead)
- **Volle Kontrolle:** Leaflet, DOM, Events direkt zugänglich ohne Adapter-Layer
- **Hosting-Einfachheit:** Statische Dateien auf Netcup, kein Node-Server
- **Langlebigkeit:** Vanilla JS veraltet nicht, kein Upgrade-Zyklus

## Verworfene Alternativen

| Alternative | Abgelehnt weil |
|------------|---------------|
| React | Build-Step, JSX, Hydration-Overhead, Leaflet-Integration umständlich |
| Vue | Build-Step, Framework-Lock-in |
| Svelte | Kompilierungsschritt nötig |

## Konsequenzen

- Manuelle DOM-Manipulation (kein reaktives Binding)
- Cross-Modul-Kommunikation über `window.xxx` globals und `appContext`
- Kein automatisches Re-Rendering — UI-Updates explizit

---
*Unveränderlich. Neue Entscheidung → neues ADR.*
