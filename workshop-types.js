// @ts-check
// workshop-types.js — Single Source of Truth für Workshop-Definitionen
// Übersetzungen: lang.json unter workshops.*

/** @typedef {import('./types.js').WorkshopType} WorkshopType */

/** `label` = englischer Name in Add-/Update-Formular, GitHub-Issue-Vorlage und den PR-Workflows (Übersetzungen der Oberfläche: lang.json).
 *  Aus dieser Liste werden `.github/workshop-labels.json` und die Checkboxen in `.github/ISSUE_TEMPLATE/add-makerspace.yml`
 *  erzeugt: nach jeder Änderung `npm run sync:forms` (der Test tests/workshop-types-sync.test.js schlägt sonst an).
 * @type {Record<string, { label: string, icon: string }>} */
export const WORKSHOP_TYPES = {
  '3d':          { label: '3D printing', icon: 'fas fa-cube' },        // digital fab
  'laser':       { label: 'laser cutting', icon: 'fas fa-explosion' },   // digital fab
  'cnc':         { label: 'CNC', icon: 'fas fa-gear' },         // digital fab
  'electronics': { label: 'electronics', icon: 'fas fa-microchip' },   // tech
  'coding':      { label: 'coding', icon: 'fas fa-laptop-code' }, // tech
  'vr':          { label: 'VR', icon: 'fas fa-vr-cardboard' },// tech
  'music':       { label: 'music', icon: 'fas fa-music' },        // creative studio
  'photo':       { label: 'photography', icon: 'fas fa-camera' },       // creative studio
  'wood':        { label: 'woodworking', icon: 'fas fa-hammer' },       // physical workshop
  'metal':       { label: 'metalworking', icon: 'fas fa-gears' },        // physical workshop
  'bike':        { label: 'bike repair', icon: 'fas fa-bicycle' },      // physical workshop
  'repair':      { label: 'repair café', icon: 'fas fa-screwdriver-wrench' }, // physical workshop (Repair-Café, Reparatur-Treff)
  'textile':     { label: 'textile', icon: 'fas fa-scissors' },    // craft
  'screenprint': { label: 'screen printing', icon: 'fas fa-shirt' },       // craft
  'ceramics':    { label: 'ceramics', icon: 'fas fa-jar' },          // craft
};

/**
 * @param {string} key - Workshop-ID (z.B. '3d', 'laser')
 * @returns {string} FontAwesome-Klasse oder leerer String
 */
export function getWorkshopIcon(key) {
  return WORKSHOP_TYPES[key]?.icon || '';
}

/** Canonical key order + O(1) index lookup */
const WORKSHOP_ORDER = Object.keys(WORKSHOP_TYPES);
const WORKSHOP_ORDER_MAP = new Map(WORKSHOP_ORDER.map((w, i) => [w, i]));

/**
 * Filter to known workshops with icons, sorted by canonical WORKSHOP_TYPES order.
 * Single source of truth — use everywhere workshops are rendered.
 * @param {string[]} workshops
 * @returns {string[]}
 */
export function getSortedWorkshops(workshops) {
  return (workshops || [])
    .filter(w => WORKSHOP_TYPES[w])
    .sort((a, b) => WORKSHOP_ORDER_MAP.get(a) - WORKSHOP_ORDER_MAP.get(b));
}

/**
 * @param {WorkshopType[]} workshops - Array von Workshop-IDs
 * @returns {string} HTML-Tooltip-String
 */
export function getWorkshopsTooltip(workshops) {
  const count  = workshops.length;
  const header = window.i18n?.t('filter.workshops') || 'Werkstätten';
  const names  = workshops.map(w => window.i18n?.t('workshops.' + w) || w).join('&#10;');
  return `${count} ${header}&#10;–––––––––––––––––––&#10;${names}`;
}
