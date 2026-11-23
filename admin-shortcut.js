// @ts-check
// admin-shortcut.js — „/admin“ im Suchfeld öffnet das Admin-Review in einem neuen Tab (Leaf, von search-header.js genutzt).
// Wie „/demo“ (demo-mode.js): sofort beim Tippen, ohne Enter. Wird der neue Tab vom Browser geblockt (Pop-up-Schutz,
// z. B. Safari bei Eingaben ohne Tastendruck), bleibt der Text im Feld stehen — ein Enter öffnet ihn dann (Tastendruck = Nutzeraktion).

export const ADMIN_URL = '/admin/';

/** @param {unknown} value Inhalt des Suchfelds */
export const isAdminCommand = value => /^\/admin\/?$/i.test(String(value ?? '').trim());

/**
 * Öffnet das Admin-Review in einem neuen Tab.
 * @param {Pick<Window, 'open'>} [win]
 * @returns {boolean} false = vom Browser geblockt
 */
export function openAdminTab(win = window) {
  const tab = win.open(ADMIN_URL, '_blank');
  if (!tab) return false;
  try { tab.opener = null; } catch { /* cross-origin nicht möglich — hier gleiche Origin, nur zur Sicherheit */ }
  return true;
}
