// enrichment-merge.js — Single Source of Truth für die Verschmelzung von locations.json und loc-enrichment.json
// Genutzt von generate-map-splits.js (Karte), /admin/ („bei uns“) und den Crawler-/Apply-Tools — damit alle denselben
// „aktuellen Stand“ sehen. Pure, ohne Abhängigkeiten.

/**
 * Reichert einen Location-Eintrag mit Daten aus loc-enrichment.json an.
 * Regel: Echte Werte in locations.json gewinnen immer — enrichment füllt nur fehlende Felder.
 * @param {object} loc
 * @param {object|undefined} e  Eintrag aus loc-enrichment.json für diese ID
 * @returns {object}
 */
export function applyEnrichment(loc, e) {
  if (!e) return loc;

  const out = { ...loc };

  if (e.workshops?.length && (!loc.workshops || loc.workshops.length === 0)) {
    out.workshops = e.workshops;
  }
  if (e.events && !loc.events) {
    out.events = e.events;
  }
  if (e.spaceapi?.endpoint && !loc.spaceapi?.endpoint) {
    out.spaceapi = e.spaceapi;
  }
  if (e.weekly && !loc.weekly) {
    out.weekly = e.weekly;
  }
  if (e.dates?.['space.init'] && !loc.dates?.['space.init']) {
    out.dates = { ...loc.dates, 'space.init': e.dates['space.init'] };
  }

  return out;
}
