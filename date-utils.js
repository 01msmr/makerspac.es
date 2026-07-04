// @ts-check
// date-utils.js — Weekday SSOT: WEEKDAY_NAMES, todayWeekday, isWeeklyToday
// Pure module — no imports, no browser dependencies.

/**
 * Day names indexed by Date.getDay() (0 = Sunday … 6 = Saturday).
 * Matches loc-enrichment.json convention (Sunday=0, 9=no value).
 * @type {readonly string[]}
 */
export const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/**
 * Returns the current weekday number (0 = Sunday … 6 = Saturday).
 * @param {Date} [now] - optional date (defaults to new Date())
 * @returns {number}
 */
export function todayWeekday(now = new Date()) {
  return now.getDay();
}

/**
 * Returns true if the location has a weekly meeting that occurs today.
 * Semantics: weekly must exist, weekly.time must be truthy,
 * weekly.weekday must be a number in 0–6, and must equal the current weekday.
 * weekday 9 (no-value placeholder) always returns false.
 *
 * @param {{ weekly?: { weekday?: number, time?: number } }} location
 * @param {Date} [now] - optional date for testing (defaults to new Date())
 * @returns {boolean}
 */
export function isWeeklyToday(location, now = new Date()) {
  const weekly = location?.weekly;
  return !!(
    weekly &&
    weekly.time &&
    typeof weekly.weekday === 'number' &&
    weekly.weekday <= 6 &&
    weekly.weekday === now.getDay()
  );
}
