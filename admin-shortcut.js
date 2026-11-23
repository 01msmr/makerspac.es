// @ts-check
// admin-shortcut.js — „/admin“ im Suchfeld + Enter öffnet das Admin-Review in einem neuen Tab (Leaf, wird von search-header.js genutzt).
// Absichtlich per Enter (Tastendruck = Nutzeraktion): Browser blocken window.open aus reinen input-Ereignissen.

export const ADMIN_URL = '/admin/';

/** @param {unknown} value Inhalt des Suchfelds */
export const isAdminCommand = value => /^\/admin\/?$/i.test(String(value ?? '').trim());

/**
 * Öffnet das Admin-Review in einem neuen Tab (Anker-Klick statt window.open: dessen Rückgabewert ist mit noopener immer null).
 * @param {Pick<Document, 'createElement' | 'body'>} [doc]
 */
export function openAdminTab(doc = document) {
  const a = doc.createElement('a');
  a.href = ADMIN_URL;
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  a.hidden = true;
  doc.body.appendChild(a);   // angehängt klicken: Safari/Firefox ignorieren Klicks auf lose Anker
  a.click();
  a.remove();
}
