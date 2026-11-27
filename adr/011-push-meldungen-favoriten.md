# ADR-011: Push-Meldungen für Favoriten ohne eigenen Server

**Status:** Akzeptiert
**Datum:** 2026-11-27

---

## Kontext

PWA-Nutzer sollen eine Meldung bekommen, wenn ein Favorit (Space mit Wochentermin) bald öffnet. Die Seite ist statisch (Netcup-Webspace per FTPS, kein Backend, keine Datenbank). Web Push braucht: ein Abo im Browser, einen Ort, an dem Abos liegen, und einen Sender mit dem privaten VAPID-Schlüssel.

## Entscheidung

- **Abos:** `push/subscribe.php` (PHP auf dem Netcup-Webspace) legt je Abo eine Datei `push/data/<sha256(endpoint)>.json` an: Endpoint, Schlüssel, Favoriten-IDs, Sprache, Zeitstempel. Kein Konto, kein Name, keine E-Mail. Nur Endpoints echter Push-Dienste (fcm, mozilla, apple, windows), nur eigene Origin, Größenlimits. `push/data/` ist per `.htaccess` gesperrt und gitignored.
- **Sender:** GitHub-Actions-Cron (`send-push.yml`, alle 15 Min.) holt die Dateien per FTPS (gleiche Secrets wie der Deploy), wählt fällige Meldungen (`tools/lib/push-due.js`, pure + getestet), sendet mit `web-push` und schreibt die „schon gemeldet“-Liste `<id>.sent.json` zurück. Abgelaufene Abos (404/410) werden gelöscht. Der Workflow schreibt nie ins Repo (kein Deploy nötig) und tut ohne `VAPID_PRIVATE_KEY` nichts.
- **Regel:** Wochentermin heute, Beginn in ≤ 3 Std. (Ortszeit des Spaces, Ukraine eigene Zeitzone), einmal je Space und Tag und Abo, nie vor 07:00 / ab 22:00 Ortszeit.
- **Client:** `push-notify.js` (Leaf, lazy), Schalter in den Einstellungen („Meldungen: Favoriten“), Erlaubnis nur per Tipp; Favoriten-Änderungen werden verzögert nachgemeldet. `sw.js` zeigt die Meldung und öffnet beim Tippen `/#/<id>`.
- **Schlüssel:** öffentlicher VAPID-Schlüssel in `push-notify.js` (eine Quelle für Browser und Sender), privater nur als GitHub-Secret `VAPID_PRIVATE_KEY`; Erzeugung `node tools/push-keygen.js`.
- **iOS:** Web Push nur in der auf den Homescreen installierten PWA (iOS ≥ 16.4); sonst zeigt die Zeile einen Hinweis.

## Konsequenzen

- Die Favoriten liegen (bei aktiver Meldung) zusätzlich auf dem Server — nur mit ausdrücklichem Einschalten; Ausschalten löscht Abo und Datei.
- Keine Zustellgarantie (Browser-/OS-Drosselung); GitHub-Cron kann Läufe verzögern; die Meldung kann bis zu ~15 Min. nach dem Fenster-Beginn kommen.
- PHP-Skript und Abo-Dateien liegen außerhalb von Git; ein Deploy überschreibt `push/data/` nicht (nur `.htaccess` und `subscribe.php`).
- Nur Wochentermine (`weekly`); Live-Status „offen“ löst keine Meldung aus.
