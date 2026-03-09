// @ts-check
// workshop-types.js — Single Source of Truth für Workshop-Definitionen
// Übersetzungen: lang.json unter workshops.*

/** @typedef {import('./types.js').WorkshopType} WorkshopType */

/** @type {Record<string, { icon: string }>} */
export const WORKSHOP_TYPES = {
  '3d':          { icon: 'fas fa-cube' },        // digital fab
  'laser':       { icon: 'fas fa-explosion' },   // digital fab
  'cnc':         { icon: 'fas fa-gear' },         // digital fab
  'electronics': { icon: 'fas fa-microchip' },   // tech
  'coding':      { icon: 'fas fa-laptop-code' }, // tech
  'vr':          { icon: 'fas fa-vr-cardboard' },// tech
  'music':       { icon: 'fas fa-music' },        // creative studio
  'photo':       { icon: 'fas fa-camera' },       // creative studio
  'wood':        { icon: 'fas fa-hammer' },       // physical workshop
  'metal':       { icon: 'fas fa-gears' },        // physical workshop
  'bike':        { icon: 'fas fa-bicycle' },      // physical workshop
  'textile':     { icon: 'fas fa-scissors' },    // craft
  'screenprint': { icon: 'fas fa-shirt' },       // craft
  'ceramics':    { icon: 'fas fa-jar' },          // craft
};

/**
 * @param {string} key - Workshop-ID (z.B. '3d', 'laser')
 * @returns {string} FontAwesome-Klasse oder leerer String
 */
export function getWorkshopIcon(key) {
  return WORKSHOP_TYPES[key]?.icon || '';
}

/** Canonical key order, computed once */
const WORKSHOP_ORDER = Object.keys(WORKSHOP_TYPES);

/**
 * Filter to known workshops with icons, sorted by canonical WORKSHOP_TYPES order.
 * Single source of truth — use everywhere workshops are rendered.
 * @param {string[]} workshops
 * @returns {string[]}
 */
export function getSortedWorkshops(workshops) {
  return (workshops || [])
    .filter(w => WORKSHOP_TYPES[w])
    .sort((a, b) => WORKSHOP_ORDER.indexOf(a) - WORKSHOP_ORDER.indexOf(b));
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
