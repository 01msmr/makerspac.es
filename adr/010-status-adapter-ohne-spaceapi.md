# ADR-010: Status-Adapter für Spaces ohne SpaceAPI

**Status:** Akzeptiert (Pilot)
**Datum:** 2026-11-25

---

## Kontext

Manche Spaces zeigen ihren Status nur auf einer eigenen Webseite (z. B. fablab-hamburg.org/sesame: farbige Seite, grün = jemand da, rot = niemand da). `fetch-spaceapi-status.js` (Cron) liest bisher SpaceAPI-JSON, Klartext `0`/`1` und ThingSpeak.

## Entscheidung

- Optionale Adapter in `tools/lib/status-adapters.js`, gewählt per `loc-enrichment.json` → `spaceapi.adapter` (zusätzlich zu `endpoint`; weiterhin der Schlüssel in `status.json`, daher keine Client-Änderung). Pilot: `html-style` für Fabulous St. Pauli (ID 43).
- **Nur offen/geschlossen:** grün/rot wird wie jeder andere Status als geöffnet/geschlossen gewertet — keine eigene Anwesenheits-Semantik, keine eigenen Beschriftungen. Nur der **aktuelle** Stand, kein Verlauf.
- Der Zeitpunkt der letzten Änderung („November 25 03:01“, Berliner Ortszeit, Jahr = aktuelles bzw. Vorjahr) wird **nur** genutzt, um einen **zu alten Stand als „unbekannt“** zu werten — mit **einer globalen Grenze** (`STATUS_MAX_AGE_HOURS`, nicht je Space; 48 h). Zeitpunkt nicht lesbar → unbekannt.
- Der Adapter **rät nie**: Quelle unlesbar, Farbe weder rot noch grün, Stand zu alt → `status: null` (Grund in `status.json`-Lauf/Log, nicht im Client).
- Erkennung über den **Quelltext** (Style-Attribut), nicht über gerenderte Pixel.
- Ein später vorgeschlagener echter SpaceAPI-Endpoint ersetzt den Adapter (`applyProposal`); derselbe Endpoint behält ihn.

## Konsequenzen

- Anbieter-Seiten ändern sich → Adapter liefert „unbekannt“ statt Falschwerte; Überwachung (z. B. Eintrag unter „Probleme“) ist ein möglicher späterer Schritt.
- Weitere Adapter (`json`, `text`) nur nach Absprache.
