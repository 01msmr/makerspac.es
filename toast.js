// @ts-check
// toast.js — kurzer Info-Toast unter dem Logo (gelb/schwarz, Microtip-Optik)
// Leaf-Modul ohne Abhängigkeiten. Genutzt für Kopier-Bestätigungen und Info-Meldungen;
// Meldungen mit Schweregrad (Fehler/Warnung) laufen weiter über datasync.showNotification.

const TOAST_CLASS = 'settings-hash-toast';
const HIDE_AFTER_MS = 3000;
const FADE_MS = 300;

/** Mittiger, bleibender Toast (z. B. „Veraltet“) — eigene Instanz, damit ein kurzer Toast ihn nicht überschreibt */
let centerToast = null;

/**
 * Zeigt einen Toast. Standard: unter dem Logo, linksbündig, blendet nach 3 s aus; ein laufender Toast wird wiederverwendet.
 * Optionen: `center` (mittig auf der Seite), `sticky` (kein Ausblenden), `action` (Knopf, invertiert, optional mit führendem Symbol `icon`).
 * @param {string} html feste, eigene Texte (kein Nutzerinhalt)
 * @param {{ center?: boolean, sticky?: boolean, action?: { label: string, icon?: string, onClick: () => void } }} [opts]
 */
export function showToast(html, opts = {}) {
  const { center = false, sticky = false, action = null } = opts;
  /** @type {(HTMLElement & { _hideTimer?: ReturnType<typeof setTimeout> })|null} */
  let toast = center ? (centerToast?.isConnected ? centerToast : null) : document.querySelector(`.${TOAST_CLASS}:not(.${TOAST_CLASS}--center)`);
  if (toast) {
    toast.classList.remove('show', 'zoom-out');
    clearTimeout(toast._hideTimer);
  } else {
    toast = document.createElement('div');
    toast.className = TOAST_CLASS + (center ? ` ${TOAST_CLASS}--center` : '');
    document.body.appendChild(toast);
    if (center) centerToast = toast;
  }

  const logo = center ? null : document.querySelector('.title-bar .title');
  if (logo) {
    const rect = logo.getBoundingClientRect();
    toast.style.top = (rect.bottom + 8) + 'px';
    toast.style.left = rect.left + 'px';
  }

  toast.innerHTML = html;
  if (action) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'settings-confirm-yes';
    if (action.icon) btn.innerHTML = `<i class="${action.icon}" aria-hidden="true"></i> ${action.label}`;   // feste Texte/Klassen, kein Nutzerinhalt
    else btn.textContent = action.label;
    btn.addEventListener('click', action.onClick);
    toast.appendChild(btn);
    toast.classList.add(`${TOAST_CLASS}--active`);   // Knopf muss klickbar sein (sonst pointer-events: none)
  }
  requestAnimationFrame(() => toast.classList.add('show'));

  if (sticky) return;
  toast._hideTimer = setTimeout(() => {
    toast.classList.remove('show');
    toast.classList.add('zoom-out');
    setTimeout(() => toast.remove(), FADE_MS);
  }, HIDE_AFTER_MS);
}
