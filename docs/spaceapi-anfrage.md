# Vorlage: SpaceAPI-Anfrage an einen Space

Mailtext zum Anpassen (Platzhalter in `[…]`). Hintergrund und Regeln: [adr/010](../adr/010-status-adapter-ohne-spaceapi.md).

**Betreff:** Ihr Space auf makerspac.es – Live-Status per SpaceAPI

---

Hallo [Name / Team],

wir betreiben die Karte **makerspac.es** (Makerspaces, FabLabs und Hackerspaces in Europa mit Live-Status offen/geschlossen). [Space] ist dort bereits eingetragen, uns fehlt noch der aktuelle Status.

**Unsere Bitte:** Wenn Sie schon einen Status haben (z. B. eine Statusseite auf Ihrer Website), könnten Sie ihn zusätzlich als **SpaceAPI** bereitstellen? Das ist ein sehr kleines JSON, das viele Spaces nutzen (spaceapi.io). Es dauert meist weniger als eine Stunde und ist ohne Zusatzkosten möglich.

**Minimalbeispiel** (Datei, z. B. `https://[ihre-domain]/spaceapi.json`):

```json
{
  "api_compatibility": ["14"],
  "space": "[Name]",
  "logo": "https://[ihre-domain]/logo.png",
  "url": "https://[ihre-domain]/",
  "location": { "lat": 00.0000, "lon": 00.0000 },
  "contact": { "email": "[mail]" },
  "state": { "open": true, "lastchange": 1764034860 }
}
```

Wichtig sind `state.open` (`true`/`false`) und `state.lastchange` (Unix-Zeit der letzten Änderung). Die Datei sollte per HTTPS erreichbar sein und den Header `Access-Control-Allow-Origin: *` senden, dann können auch Browser sie direkt lesen. Die Schema-Version prüft der Validator auf spaceapi.io.

**Hinweis zur Anzeige:** Ein „offen“ zeigen wir nur, solange die Quelle jünger als 24 Stunden ist (`lastchange` oder ein aktueller Sensor wie `people_now_present`/`door_locked`); ein „geschlossen“ bleibt beliebig lange stehen. Wenn Ihr Space durchgehend geöffnet ist, nehmen Sie bitte einen Anwesenheits-Sensor mit aktuellem `lastchange` auf.

**Wenn das bei Ihnen schwierig ist:**

- *Nur statisches Hosting:* Das Skript, das heute den Status setzt, kann einfach eine kleine JSON-Datei neu schreiben, ein eigener Server ist nicht nötig.
- *Es gibt bereits eine eigene Statusseite* (z. B. eine farbige Seite „Aktuell jemand im Fab Lab?“): Dann lesen wir sie vorerst gerne direkt aus. Bitte antworten Sie kurz mit **„einverstanden“** und nennen Sie die Bedeutung (z. B. grün = offen, rot = geschlossen). Wir fragen sie höchstens alle 15 Minuten ab. Eine Änderung Ihrer Seite bitte kurz ankündigen, sonst zeigen wir „unbekannt“.
- *Datenschutz:* Es wird nur ein Wahr/Falsch-Wert ohne Namen oder Personenzahl übertragen.
- *Der Status wird nur von Hand gepflegt:* Dann genügen auch die Öffnungszeiten (wir zeigen sie als Termin, nicht als Live-Status).

Wir helfen gern beim Einrichten oder prüfen Ihre Datei vorab.

Viele Grüße
[Name], makerspac.es
