// @ts-check
// update-notice.js — „Veraltet“-Hinweis, wenn im Hintergrund eine neue Version (Service Worker) bereitsteht.
// Nutzt den vorhandenen Toast (toast.js, Optik wie die anderen Toasts): mittig, bleibt stehen, zeigt wie lange der Tab offen ist, Knopf „Neu laden“.
// Wird aus index.html nach der SW-Registrierung per import() geladen (nicht im Ladepfad der Karte).

import { showToast } from './toast.js';

/** Texte je Sprache; Fallback en */
export const UPDATE_TEXT = {
  en: { outdated: 'Outdated', hint: 'new version available', opened: 'opened', reload: 'Reload' },
  de: { outdated: 'Veraltet', hint: 'neue Version verfügbar', opened: 'geöffnet', reload: 'Neu laden' },
  fr: { outdated: 'Obsolète', hint: 'nouvelle version disponible', opened: 'ouvert', reload: 'Recharger' },
  nl: { outdated: 'Verouderd', hint: 'nieuwe versie beschikbaar', opened: 'geopend', reload: 'Herladen' },
  it: { outdated: 'Obsoleta', hint: 'nuova versione disponibile', opened: 'aperta', reload: 'Ricarica' },
  da: { outdated: 'Forældet', hint: 'ny version tilgængelig', opened: 'åbnet', reload: 'Genindlæs' },
  uk: { outdated: 'Застаріло', hint: 'доступна нова версія', opened: 'відкрито', reload: 'Оновити' },
};

/** @param {string} [lang] */
export const updateText = lang => UPDATE_TEXT[/** @type {keyof typeof UPDATE_TEXT} */ (lang)] || UPDATE_TEXT.en;

/**
 * Alter des Tabs als Text („vor 3 Std.“); unter einer Minute leer.
 * @param {number} ms
 * @param {string} [lang]
 */
export function formatAge(ms, lang = 'en') {
  const min = Math.floor(ms / 60000);
  if (min < 1) return '';
  const [value, unit] = min < 60 ? [min, 'minute'] : min < 1440 ? [Math.floor(min / 60), 'hour'] : [Math.floor(min / 1440), 'day'];
  try { return new Intl.RelativeTimeFormat(lang, { numeric: 'always', style: 'short' }).format(-value, /** @type {Intl.RelativeTimeFormatUnit} */ (unit)); }
  catch { return `${value} ${unit}`; }
}

/** Untertitel: „neue Version verfügbar · geöffnet vor 3 Std.“ */
export function toastSubtitle(ms, lang) {
  const tx = updateText(lang);
  const age = formatAge(ms, lang);
  return age ? `${tx.hint} · ${tx.opened} ${age}` : tx.hint;
}

/**
 * @param {ServiceWorkerRegistration} reg
 */
export function initUpdateNotice(reg) {
  if (window !== window.top || !('serviceWorker' in navigator)) return;   // nicht im Embed-iframe
  const openedAt = Date.now() - performance.now();
  let shown = false;

  const show = () => {
    if (shown) return;
    // Läuft gerade das Overlay (z. B. Formular „add makerspace“), erst danach anzeigen — Neuladen würde die Eingabe verwerfen
    if (document.querySelector('.embed-overlay')) { setTimeout(show, 2000); return; }
    shown = true;
    const lang = window.i18n?.currentLang || (navigator.language || 'en').slice(0, 2);
    const tx = updateText(lang);
    showToast(`<strong>${tx.outdated}</strong><span>${toastSubtitle(Date.now() - openedAt, lang)}</span>`, {
      center: true, sticky: true, action: { label: tx.reload, icon: 'fas fa-rotate', onClick: () => location.reload() },
    });
  };

  /** @param {ServiceWorker|null} worker */
  const watch = worker => worker?.addEventListener('statechange', () => {
    if (worker.state === 'installed' && navigator.serviceWorker.controller) show();   // neue Version fertig geladen, alte läuft noch
  });
  if (reg.waiting && navigator.serviceWorker.controller) show();
  watch(reg.installing);
  reg.addEventListener('updatefound', () => watch(reg.installing));
  // Lange offener Tab: beim Zurückkehren einmal nach einer neuen Version fragen
  document.addEventListener('visibilitychange', () => { if (!document.hidden) reg.update().catch(() => {}); });
}
