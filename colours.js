// colours.js — Farbdefinitionen und Dark-Mode-Helpers
// Importiert von config.js; kann auch direkt importiert werden.

export const COLOURS = {
  // Standard
  default:      '#2c2c2c',
  highlight:    '#2c2c2c',

  // SpaceAPI Status
  open:         '#0e9000',
  closed:       '#DD0000',
  unknown:      '#f67b00',

  // Hover/Interaktiv
  hoverLight:   '#0000ff',
  hoverDark:    '#2288ee',

  // Dark Mode
  darkModeDefault: '#666666',
  darkOpen:     '#00bb00',
  darkClosed:   '#ff5555',
  darkUnknown:  '#ffaa00',

  // Feature-spezifisch
  nearbyTitle:  'rgba(111, 233, 166, 0.66)',
};

/** @returns {boolean} */
export function isDarkMode() {
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches || false;
}

/** @returns {string} Hex-Farbcode */
export function getDefaultIconColor() {
  return isDarkMode() ? COLOURS.darkModeDefault : COLOURS.default;
}

/** @returns {string} Hex-Farbcode */
export function getHoverColor() {
  return isDarkMode() ? COLOURS.hoverDark : COLOURS.hoverLight;
}

/**
 * @param {{ spaceapi?: { endpoint?: string }, isOpen?: boolean|null }} location
 * @returns {string} Hex-Farbcode
 */
export function getDynamicSpaceColor(location) {
  if (location?.spaceapi?.endpoint) {
    if (location.isOpen === true)  return COLOURS.open;
    if (location.isOpen === false) return COLOURS.closed;
    return COLOURS.unknown;
  }
  return getHoverColor();
}

/** Setzt CSS-Variablen aus COLOURS (Single Source of Truth). */
export function applyCssColours() {
  const root = document.documentElement;
  const dark = isDarkMode();
  root.style.setProperty('--space-hover',   dark ? COLOURS.hoverDark   : COLOURS.hoverLight);
  root.style.setProperty('--space-open',    dark ? COLOURS.darkOpen    : COLOURS.open);
  root.style.setProperty('--space-closed',  dark ? COLOURS.darkClosed  : COLOURS.closed);
  root.style.setProperty('--space-unknown', dark ? COLOURS.darkUnknown : COLOURS.unknown);
  root.style.setProperty('--nearby-title',  COLOURS.nearbyTitle);
}
