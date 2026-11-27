// @ts-check
// push-notify.js — Web-Push-Abo der PWA: „Favoriten, die bald öffnen, melden“ (Einstellungen → Benachrichtigungen).
// Lazy (data-store.js per import()); keine Abhängigkeit zu anderen App-Modulen. Der Versand läuft serverseitig (tools/send-push.js, ADR-011).
//   Abo-Verwaltung: push/subscribe.php (Netcup) — speichert Endpoint, Schlüssel, Favoriten-IDs, Sprache; keine Namen/E-Mail.
//   Merker lokal: localStorage 'pushEnabled' = '1' (Favoriten-Änderungen werden dann nachgemeldet).
// Hinweis: Auf iOS gibt es Web Push nur für die auf den Homescreen installierte PWA (iOS ≥ 16.4) und die Erlaubnis nur per Tipp.

/** Öffentlicher VAPID-Schlüssel (darf im Repo stehen; Gegenstück VAPID_PRIVATE_KEY nur als GitHub-Secret). Leer = Funktion aus. */
export const PUSH_PUBLIC_KEY = 'BGE77y1HWRlynh9x53iVVV2oXRRASuLqs6FoybViKz7uyqqBTxWPZZC377j9yA0Apj9Nwqf184dhSZ-gQcSGgTk';
export const PUSH_ENDPOINT = '/push/subscribe.php';
const STORAGE_KEY = 'pushEnabled';
const SYNC_DELAY_MS = 2000;

/** base64url → Uint8Array (applicationServerKey) */
export function urlBase64ToUint8Array(b64) {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, c => c.charCodeAt(0));
}

/**
 * Zustand für die Anzeige:
 *  'unsupported' kein Web Push möglich · 'needs-install' iOS, aber nicht als PWA installiert · 'denied' Erlaubnis verweigert ·
 *  'off' möglich, aber nicht aktiv · 'on' aktiv
 * @returns {Promise<'unsupported'|'needs-install'|'denied'|'off'|'on'>}
 */
export async function pushState() {
  if (!PUSH_PUBLIC_KEY || !('serviceWorker' in navigator)) return 'unsupported';
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const standalone = window.matchMedia?.('(display-mode: standalone)').matches || /** @type {any} */ (navigator).standalone === true;
  if (ios && !standalone) return 'needs-install';
  if (!('PushManager' in window) || !('Notification' in window)) return 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = await reg?.pushManager.getSubscription();
    if (sub && localStorage.getItem(STORAGE_KEY) === '1') return 'on';
  } catch { /* privater Modus o. ä. */ }
  return 'off';
}

/** @returns {number[]} aktuelle Favoriten-IDs */
function favorites() {
  try { return (JSON.parse(localStorage.getItem('makerspace_bookmarks') || '[]') || []).map(Number).filter(n => Number.isInteger(n) && n > 0); }
  catch { return []; }
}

const currentLang = () => (window.i18n?.currentLang || localStorage.getItem('preferred_language') || navigator.language || 'en').slice(0, 2);

/** @param {object} body */
async function post(body) {
  const res = await fetch(PUSH_ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), keepalive: true });
  if (!res.ok) throw new Error(`push endpoint ${res.status}`);
}

/** Favoriten + Sprache zum Server schicken (nur bei aktivem Abo) */
export async function syncNow() {
  if (localStorage.getItem(STORAGE_KEY) !== '1') return;
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  if (!sub) return;
  const j = sub.toJSON();
  await post({ endpoint: j.endpoint, keys: j.keys, favorites: favorites(), lang: currentLang() });
}

/** Erlaubnis erfragen (nur aus einem Tipp heraus aufrufen), abonnieren, beim Server anmelden. @returns {Promise<boolean>} */
export async function enable() {
  const st = await pushState();
  if (st === 'unsupported' || st === 'needs-install' || st === 'denied') return false;
  if (await Notification.requestPermission() !== 'granted') return false;
  const reg = await navigator.serviceWorker.ready;
  const sub = (await reg.pushManager.getSubscription())
    || await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(PUSH_PUBLIC_KEY) });
  localStorage.setItem(STORAGE_KEY, '1');
  try { await syncNow(); } catch (e) { localStorage.removeItem(STORAGE_KEY); await sub.unsubscribe(); throw e; }   // ohne Server-Eintrag kein Abo
  return true;
}

/** Abo beim Browser und beim Server löschen */
export async function disable() {
  localStorage.removeItem(STORAGE_KEY);
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  if (!sub) return;
  const endpoint = sub.endpoint;
  await sub.unsubscribe();
  try { await post({ endpoint, unsubscribe: true }); } catch { /* Server räumt abgelaufene Abos selbst auf (410) */ }
}

let timer = 0;
/** Beim Start aufrufen, wenn aktiv: Favoriten-/Sprachänderungen verzögert nachmelden */
export function initSync() {
  if (localStorage.getItem(STORAGE_KEY) !== '1') return;
  const later = () => { clearTimeout(timer); timer = window.setTimeout(() => syncNow().catch(() => {}), SYNC_DELAY_MS); };
  window.addEventListener('bookmarksChanged', later);
  later();   // einmal pro Start: Server-Stand angleichen (z. B. Favoriten per QR importiert)
}
