// overlay-loader.js — lädt das "+"-Overlay (Add Space / Embed / About) erst bei Bedarf (Leaf, ≈ 70 KB gespart)
//
// embed-overlay.js importiert add-space-form.js und die About-Texte in 7 Sprachen; beides wird nur nach Tipp auf
// "+" oder auf die Einstellungs-Links gebraucht. Deshalb steht es nicht im Import-Graph von map.js / modulepreload.

let overlayModule = null;
const loadOverlay = () => (overlayModule ??= import('./embed-overlay.js'));

/** Öffnet das Overlay auf dem gewünschten Tab ('addspace' | 'embed' | 'about') */
export async function openOverlayTab(tab) {
  (await loadOverlay()).openOverlayTab(tab);
}

/** "+" im Logo: Overlay öffnen; Modul bei erster Absicht (pointerdown/hover) vorladen */
export function initOverlayTrigger() {
  const btn = document.querySelector('.tool-add');
  if (!btn) return;
  for (const type of ['pointerdown', 'mouseenter']) btn.addEventListener(type, loadOverlay, { passive: true, once: true });
  btn.addEventListener('click', e => {
    e.preventDefault();
    e.stopPropagation();
    openOverlayTab('addspace');
  });
}
