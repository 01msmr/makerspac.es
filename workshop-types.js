// workshop-types.js — Single Source of Truth für Workshop-Definitionen
// Übersetzungen: lang.json unter workshops.*

/** @type {Record<string, { icon: string }>} */
export const WORKSHOP_TYPES = {
  '3d':          { icon: 'fas fa-cube' },
  'laser':       { icon: 'fas fa-explosion' },
  'electronics': { icon: 'fas fa-microchip' },
  'wood':        { icon: 'fas fa-hammer' },
  'metal':       { icon: 'fas fa-gears' },
  'textile':     { icon: 'fas fa-scissors' },
  'screenprint': { icon: 'fas fa-shirt' },
  'music':       { icon: 'fas fa-music' },
  'coding':      { icon: 'fas fa-laptop-code' },
  'vr':          { icon: 'fas fa-vr-cardboard' },
};

/**
 * @param {string} key - Workshop-ID (z.B. '3d', 'laser')
 * @returns {string} FontAwesome-Klasse oder leerer String
 */
export function getWorkshopIcon(key) {
  return WORKSHOP_TYPES[key]?.icon || '';
}

/**
 * @param {string[]} workshops - Array von Workshop-IDs
 * @returns {string} HTML-Tooltip-String
 */
export function getWorkshopsTooltip(workshops) {
  const count  = workshops.length;
  const header = window.i18n?.t('filter.workshops') || 'Werkstätten';
  const names  = workshops.map(w => window.i18n?.t('workshops.' + w) || w).join('&#10;');
  return `${count} ${header}&#10;–––––––––––––––––––&#10;${names}`;
}
