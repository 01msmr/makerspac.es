# ADR-010: Status-Adapter für Spaces ohne SpaceAPI

**Status:** Akzeptiert (Pilot)
**Datum:** 2026-11-25

---

## Kontext

Manche Spaces zeigen ihren Status nur auf einer eigenen Webseite (z. B. fablab-hamburg.org/sesame: farbige Seite, grün = jemand da, rot = niemand da). `fetch-spaceapi-status.js` (Cron) liest bisher SpaceAPI-JSON, Klartext `0`/`1` und ThingSpeak.

## Entscheidung

- Optionale Adapter in `tools/lib/status-adapters.js`, gewählt per `loc-enrichment.json` → `spaceapi.adapter` (zusätzlich zu `endpoint`; weiterhin der Schlüssel in `status.json`, daher keine Client-Änderung). Pilot: `html-style` für Fabulous St. Pauli (ID 43).
- **Nur offen/geschlossen:** grün/rot wird wie jeder andere Status als geöffnet/geschlossen gewertet — keine eigene Anwesenheits-Semantik, keine eigenen Beschriftungen. Nur der **aktuelle** Stand, kein Verlauf.
- **Alters-Regel für ALLE Status-Quellen** (SpaceAPI, ThingSpeak, Adapter): ein **„offen“** wird nur gewertet, wenn der Sende-/Zeitstempel der Quelle **jünger als 24 h** ist (`STATUS_MAX_AGE_HOURS`, eine globale Konstante, **nicht je Space**); sonst wird der gesendete Wert verworfen → **unbekannt**. **„Geschlossen“ wird nie verworfen** (lange geschlossen ist normal, lange offen nicht). Der Cron prüft bei jedem Lauf neu: ist der Zeitstempel wieder jünger als 24 h, gilt „offen“ wieder.
- Zeitstempel: SpaceAPI `state.lastchange`, ThingSpeak `created_at`, Hamburg-Datum („November 25 03:01“, Berliner Ortszeit, Jahr = aktuelles bzw. Vorjahr) — direkt geprüft, **ohne Gedächtnis**. Hinweis: `state.lastchange` ist der Zeitpunkt der letzten *Änderung*, kein Lebenszeichen. **Lebenszeichen:** ist es alt, aber ein SpaceAPI-**Sensor** (`sensors.*[].lastchange`, eindeutiger Unix-Zeitstempel) jünger als 24 h, lebt die Quelle und das „offen“ bleibt gültig (`rescuedBy: 'sensor'`, im Cron-Log vermerkt). Ohne Sensor-Zeitstempel erscheint ein ehrlich länger als 24 h durchgehend offener Space als „unbekannt". Eine Ausnahme-Markierung je Space gibt es bewusst nicht.
- **Beschriftung:** Ein unbekannter Status heißt überall „unknown“ (Tooltip `tooltips.spaceUnknown`, 7 Sprachen: „Status unbekannt“ …), nie „Status wird geladen“ (irreführend).
- **Gedächtnis nur wo unumgänglich:** ein „offen“ ohne jeden Zeitstempel (Klartext `0`/`1`, SpaceAPI ohne `lastchange`) → es werden nur die **letzten zwei Signaturen** (Last-Modified-Header, sonst Prüfsumme der Antwort) mit Erstsehen-Zeitpunkt gemerkt; unverändert seit > 24 h → unbekannt. Das Gedächtnis ist **nicht öffentlich**: `status-memory.json` liegt nur im Actions-Cache von `update-status.yml`, ist gitignored und kommt weder in `status.json` noch auf den Server. Wird ein Space geschlossen/unbekannt, wird sein Eintrag gelöscht.
- Der Adapter **rät nie**: Quelle unlesbar, Farbe weder rot noch grün, Stand zu alt → `status: null` (Grund in `status.json`-Lauf/Log, nicht im Client).
- Erkennung über den **Quelltext** (Style-Attribut), nicht über gerenderte Pixel.
- Ein später vorgeschlagener echter SpaceAPI-Endpoint ersetzt den Adapter (`applyProposal`); derselbe Endpoint behält ihn.

## Konsequenzen

- Anbieter-Seiten ändern sich → Adapter liefert „unbekannt“ statt Falschwerte; die Alters-Regel kann bei 24/7-offenen Spaces ein „unbekannt“ erzeugen; Überwachung (z. B. Eintrag unter „Probleme“) ist ein möglicher späterer Schritt.
- Weitere Adapter (`json`, `text`) nur nach Absprache.
