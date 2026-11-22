// enrichment-merge.js — Single Source of Truth für die Verschmelzung von locations.json (Grunddaten) und loc-enrichment.json (Zusatzdaten)
// Genutzt von generate-map-splits.js (Karte), /admin/ („bei uns“) und den Crawler-/Apply-Tools — damit alle denselben
// „aktuellen Stand“ sehen (+ normalizeUrl für URL-Vergleiche). Pure, ohne Abhängigkeiten.

/**
 * Reichert einen Location-Eintrag mit den Zusatzdaten aus loc-enrichment.json an (workshops, events, spaceapi, weekly).
 * locations.json enthält nur Grunddaten; die Zusatzdaten stammen ausschließlich aus dem Enrichment.
 * @param {object} loc                Grunddaten (locations.json)
 * @param {object|undefined} e        Eintrag aus loc-enrichment.json für diese ID
 * @returns {object}
 */
export function applyEnrichment(loc, e) {
  if (!e) return loc;
  const out = { ...loc };
  if (e.workshops?.length) out.workshops = e.workshops;
  if (e.events) out.events = e.events;
  if (e.spaceapi?.endpoint) out.spaceapi = e.spaceapi;
  if (e.weekly) out.weekly = e.weekly;
  return out;
}

/** URL vergleichbar machen: Schema, „www.“, Fragment und Schluss-Slash ignorieren, Groß-/Kleinschreibung egal */
export function normalizeUrl(u) {
  return String(u).trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/#.*$/, '').replace(/\/+$/, '');
}
