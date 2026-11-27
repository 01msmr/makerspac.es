// tools/send-push.js — Web-Push-Versand (GitHub Actions, .github/workflows/send-push.yml).
//   node tools/send-push.js --dir <Ordner mit Abo-Dateien> --spaces data/spaces-all.json
// Liest <id>.json (Abos, vom Webspace geholt) und <id>.sent.json (bereits gemeldet), sendet fällige Meldungen (tools/lib/push-due.js)
// und schreibt <id>.sent.json neu. Ergebnislisten im Ordner: changed.txt (geänderte .sent.json), gone.txt (Abos, die der Push-Dienst
// als abgelaufen meldet: 404/410 → per FTPS löschen). Umgebung: VAPID_PRIVATE_KEY (Secret); öffentlicher Schlüssel aus push-notify.js.
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { dueSpaces, markSent, buildPayload } from './lib/push-due.js';
import { PUSH_PUBLIC_KEY } from '../push-notify.js';   // öffentlicher VAPID-Schlüssel: eine Quelle für Browser und Versand

const arg = (name, fallback) => { const i = process.argv.indexOf(`--${name}`); return i > 0 ? process.argv[i + 1] : fallback; };

/** @param {{sendNotification: Function, setVapidDetails: Function}} webpush */
export async function run({ dir, spacesFile, webpush, now = new Date() }) {
  const spaces = new Map(JSON.parse(readFileSync(spacesFile, 'utf8')).map(s => [s.ID, s]));
  const changed = [], gone = [];
  let sentCount = 0;
  for (const f of readdirSync(dir).filter(n => n.endsWith('.json') && !n.endsWith('.sent.json'))) {
    const id = f.slice(0, -5);
    let sub;
    try { sub = JSON.parse(readFileSync(join(dir, f), 'utf8')); } catch { continue; }
    if (!sub?.endpoint || !sub?.keys || !Array.isArray(sub.favorites)) continue;
    const sentFile = join(dir, `${id}.sent.json`);
    const sent = existsSync(sentFile) ? JSON.parse(readFileSync(sentFile, 'utf8')) : {};
    const due = dueSpaces(sub.favorites, spaces, sent, now);
    const done = [];
    for (const d of due) {
      try {
        await webpush.sendNotification({ endpoint: sub.endpoint, keys: sub.keys }, JSON.stringify(buildPayload(d, sub.lang)), { TTL: 3 * 3600, urgency: 'normal' });
        done.push(d); sentCount++;
      } catch (e) {
        if (e?.statusCode === 404 || e?.statusCode === 410) { gone.push(id); break; }   // Abo abgelaufen / widerrufen
        console.warn(`Push an ${id.slice(0, 8)} fehlgeschlagen: ${e?.statusCode || e?.message}`);
      }
    }
    if (done.length) {
      const keep = new Set(done.map(d => d.date));   // alte Tage aus der Merkliste entfernen
      writeFileSync(sentFile, JSON.stringify(markSent(sent, done, keep)));
      changed.push(`${id}.sent.json`);
    }
  }
  writeFileSync(join(dir, 'changed.txt'), changed.join('\n') + (changed.length ? '\n' : ''));
  writeFileSync(join(dir, 'gone.txt'), gone.join('\n') + (gone.length ? '\n' : ''));
  return { sent: sentCount, changed: changed.length, gone: gone.length };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { default: webpush } = await import('web-push');
  webpush.setVapidDetails('https://makerspac.es', PUSH_PUBLIC_KEY, process.env.VAPID_PRIVATE_KEY);
  const r = await run({ dir: arg('dir', 'push-work'), spacesFile: arg('spaces', 'data/spaces-all.json'), webpush });
  console.log(`Push: ${r.sent} gesendet, ${r.changed} Merklisten aktualisiert, ${r.gone} Abos abgelaufen`);
}
