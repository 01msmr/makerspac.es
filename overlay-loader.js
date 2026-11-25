// overlay-loader.js — lädt das "+"-Overlay (Add Space / Embed / About) erst bei Bedarf (Leaf, ≈ 70 KB gespart)
//
// embed-overlay.js importiert add-space-form.js und die About-Texte in 7 Sprachen; beides wird nur nach Tipp auf
// "+" oder auf die Einstellungs-Links gebraucht. Deshalb steht es nicht im Import-Graph von map.js / modulepreload.

let overlayModule = null;
const loadOverlay = () => (overlayModule ??= import('./embed-overlay.js'));

/** Öffnet das Overlay auf dem gewünschten Tab ('addspace' | 'embed' | 'about' | 'changes'); `editId`: Space direkt zum Bearbeiten wählen */
export async function openOverlayTab(tab, opts) {
  (await loadOverlay()).openOverlayTab(tab, opts);
}

/** `/?edit=ID` (Link aus dem Admin, Reiter „Spaces“): Overlay direkt im Bearbeiten-Modus für diesen Space; Parameter wird entfernt */
export async function openEditFromUrl() {
  const url = new URL(location.href);
  // `/?overlay=changes` (Link „Änderungen“ aus dem Admin): Overlay direkt auf dem Reiter „new“; Parameter wird entfernt
  if (url.searchParams.get('overlay') === 'changes') {
    url.searchParams.delete('overlay');
    history.replaceState(null, '', url.pathname + url.search + url.hash);
    openOverlayTab('changes');
    return;
  }
  const id = Number(url.searchParams.get('edit'));
  if (!url.searchParams.has('edit')) return;
  url.searchParams.delete('edit');
  history.replaceState(null, '', url.pathname + url.search + url.hash);
  if (!Number.isInteger(id) || id <= 0) return;
  // Die Karte lädt Link/Straße usw. erst im Hintergrund nach (spaces-all.json, in-place) — das Formular liest sie beim Öffnen
  for (let i = 0; i < 40 && !window.locationById?.get(id)?.link; i++) await new Promise(r => setTimeout(r, 250));
  openOverlayTab('addspace', { editId: id });
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
