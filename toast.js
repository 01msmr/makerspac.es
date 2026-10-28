// @ts-check
// toast.js — kurzer Info-Toast unter dem Logo (gelb/schwarz, Microtip-Optik)
// Leaf-Modul ohne Abhängigkeiten. Genutzt für Kopier-Bestätigungen und Info-Meldungen;
// Meldungen mit Schweregrad (Fehler/Warnung) laufen weiter über datasync.showNotification.

const TOAST_CLASS = 'settings-hash-toast';
const HIDE_AFTER_MS = 3000;
const FADE_MS = 300;

/**
 * Zeigt einen Toast unter dem Logo, linksbündig. Ein laufender Toast wird wiederverwendet.
 * @param {string} html
 */
export function showToast(html) {
  /** @type {(HTMLElement & { _hideTimer?: ReturnType<typeof setTimeout> })|null} */
  let toast = document.querySelector(`.${TOAST_CLASS}`);
  if (toast) {
    toast.classList.remove('show', 'zoom-out');
    clearTimeout(toast._hideTimer);
  } else {
    toast = document.createElement('div');
    toast.className = TOAST_CLASS;
    document.body.appendChild(toast);
  }

  const logo = document.querySelector('.title-bar .title');
  if (logo) {
    const rect = logo.getBoundingClientRect();
    toast.style.top = (rect.bottom + 8) + 'px';
    toast.style.left = rect.left + 'px';
  }

  toast.innerHTML = html;
  requestAnimationFrame(() => toast.classList.add('show'));

  toast._hideTimer = setTimeout(() => {
    toast.classList.remove('show');
    toast.classList.add('zoom-out');
    setTimeout(() => toast.remove(), FADE_MS);
  }, HIDE_AFTER_MS);
}
