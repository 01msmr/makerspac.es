// filter-config.js — Filter-Kategorien, Style-Definitionen und Style-Helpers
// Importiert WORKSHOP_TYPES aus workshop-types.js

import { WORKSHOP_TYPES } from './workshop-types.js';

/** @type {Record<string, { icon: string, options: string[], iconOnly?: boolean }>} */
export const FILTER_CATEGORIES = {
  style: {
    icon: 'fas fa-people-group',
    options: ['for all', 'for youth', 'for students', 'commercial'],
  },
  doorState: {
    icon: 'fas fa-door-open',
    options: ['open', 'closed'],
  },
  weekly: {
    icon: 'fas fa-calendar-day',
    options: ['1', '2', '3', '4', '5', '6', '0'], // Mon–Son
  },
  country: {
    icon: 'fas fa-flag',
    options: [], // Wird dynamisch befüllt
  },
  bookmarks: {
    icon: 'fas fa-bookmark',
    options: ['bookmarked'],
    iconOnly: true,
  },
  workshops: {
    icon: 'fas fa-wrench',
    options: Object.keys(WORKSHOP_TYPES),
  },
};

/** Styles die nicht in Filtern angezeigt werden. */
export const IGNORED_STYLES = [
  'unknown',
  'STYLE_STYLE',
  'for students & youth',
  'for students // commercial',
];

/** Feste Anzeigereihenfolge für Style-Filter-Pills. */
export const FILTER_ORDER = [
  'for all', 'for youth', 'for students', 'commercial', 'open', 'closed',
];

/** Style-Icons (FontAwesome) – für Makerspace-Typen */
const STYLE_ICONS = {
  'for all':              'fas fa-people-group',
  'for students':         'fas fa-graduation-cap',
  'for youth':            'fas fa-child',
  'for students & youth': 'fas fa-graduation-cap',
  'commercial':           'fas fa-money-bill-wave',
};

/**
 * @param {string} style - Style-String (z.B. 'for all')
 * @returns {string} FontAwesome-Klasse oder leerer String
 */
export function getStyleIcon(style) {
  return STYLE_ICONS[style?.toLowerCase()] || '';
}
