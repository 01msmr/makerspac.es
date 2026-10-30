// layout-mode.js — Single Source of Truth für die Layout-Modi (Leaf-Modul, keine Abhängigkeiten)
//
// Die Queries spiegeln die CSS-Breakpoints (search.css / main-layout.css) und müssen mit ihnen übereinstimmen.
// Touch-Erkennung per `'ontouchstart' in window` bleibt davon getrennt (siehe CLAUDE.md).

/** Phone + Tablet (+ schmale Desktop-Fenster): Mobile-UI mit Dropdown-Grid statt Desktop-Popover */
export const MOBILE_UI_QUERY = '(max-width: 1024px), (min-width: 768px) and (pointer: coarse)';
/** Tablet: Touch-Gerät ab 768px (Portrait + Landscape) */
export const TABLET_QUERY = '(min-width: 768px) and (pointer: coarse)';
/** Phone: `@media (max-width: 767px)` */
export const PHONE_QUERY = '(max-width: 767px)';

const matches = query => window.matchMedia(query).matches;

/** Touch-Gerät (Phone + Tablet). Projektregel: immer so erkennen, nie über die Breite (CLAUDE.md). */
export const isTouch = () => 'ontouchstart' in window;

export const isMobileUI = () => matches(MOBILE_UI_QUERY);
export const isTablet = () => matches(TABLET_QUERY);
export const isPhone = () => matches(PHONE_QUERY);

// Zeilenhöhen der Dropdown-Items (search.css) — Phone 40px, Tablet 58px
const PHONE_ROW_H = 40;
const TABLET_ROW_H = 58;

/**
 * Grid-Maße einer Dropdown-Seite (= ein Snap-Schritt).
 * Phone 2×3, Tablet Portrait 4×4, Tablet Landscape 5×3.
 * @param {{tablet: boolean, landscape: boolean}} mode
 * @returns {{cols: number, rowsPerPage: number, rowH: number, pageHeight: number}}
 */
export function gridSpec({ tablet, landscape }) {
  const [cols, rowsPerPage, rowH] = !tablet ? [2, 3, PHONE_ROW_H]
    : landscape ? [5, 3, TABLET_ROW_H]
    : [4, 4, TABLET_ROW_H];
  return { cols, rowsPerPage, rowH, pageHeight: rowsPerPage * rowH };
}

/** gridSpec für den aktuellen Viewport */
export function currentGridSpec() {
  const tablet = isTablet();
  return gridSpec({ tablet, landscape: tablet && matches('(orientation: landscape)') });
}
