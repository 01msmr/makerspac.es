// tools/push-keygen.js — erzeugt ein VAPID-Schlüsselpaar für Web Push (ohne Abhängigkeiten, nur node:crypto).
// Aufruf: node tools/push-keygen.js [Ausgabedatei-für-den-privaten-Schlüssel]
//   Öffentlicher Schlüssel → push-notify.js (PUSH_PUBLIC_KEY, darf im Repo stehen).
//   Privater Schlüssel    → NUR als GitHub-Secret VAPID_PRIVATE_KEY (nie committen, nie ausgeben, wenn eine Datei angegeben ist).
import { generateKeyPairSync } from 'node:crypto';
import { writeFileSync } from 'node:fs';

/** @returns {{publicKey: string, privateKey: string}} base64url, wie web-push sie erwartet (65-Byte-Punkt / 32-Byte-Skalar) */
export function generateVapidKeys() {
  const { publicKey, privateKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const pub = publicKey.export({ format: 'jwk' });
  const prv = privateKey.export({ format: 'jwk' });
  const raw = Buffer.concat([Buffer.from([4]), Buffer.from(pub.x, 'base64url'), Buffer.from(pub.y, 'base64url')]);
  return { publicKey: raw.toString('base64url'), privateKey: prv.d };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { publicKey, privateKey } = generateVapidKeys();
  const out = process.argv[2];
  console.log(`PUSH_PUBLIC_KEY=${publicKey}`);
  if (out) { writeFileSync(out, privateKey + '\n', { mode: 0o600 }); console.log(`VAPID_PRIVATE_KEY → ${out} (nicht ausgegeben)`); }
  else console.log(`VAPID_PRIVATE_KEY=${privateKey}`);
}
