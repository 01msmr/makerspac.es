// @ts-check
// data-preload.js — Länder-Erkennung aus dem URL-Hash + frühes Preload der Startdaten
// Leaf-Modul ohne Abhängigkeiten: wird von index.html (Inline-Module, parallel zum restlichen
// Modul-Graph) und von map.js genutzt, damit die Datenfetches beim Parsen starten statt erst
// nach Auswertung von map.js.

// URL-Slug → ISO-Code (stimmt mit routing.js normalizeSlug + config.js COUNTRY_CODES überein)
export const SLUG_TO_CODE = /** @type {Record<string, string>} */ ({
  'germany': 'de', 'austria': 'at', 'switzerland': 'ch',
  'france': 'fr', 'netherlands': 'nl', 'belgium': 'be',
  'italy': 'it', 'spain': 'es', 'ukraine': 'ua',
  'denmark': 'dk', 'luxembourg': 'lu',
});

/**
 * Erkennt den ISO-Länder-Code aus dem URL-Hash.
 * '#/germany' → 'de', '#/germany/berlin/1,2' → 'de', '#/for-all' → null
 * @param {string} [hash]
 * @returns {string|null}
 */
export function detectCountryCodeFromURL(hash = window.location.hash) {
  if (!hash?.startsWith('#/')) return null;
  const firstSegment = hash.slice(2).split('/')[0].split('+')[0];
  return SLUG_TO_CODE[firstSegment] ?? null;
}

/** @param {string} href */
function preloadFetch(href) {
  if (document.querySelector(`link[rel="preload"][href="${href}"]`)) return;
  const l = document.createElement('link');
  l.rel = 'preload'; l.as = 'fetch'; l.crossOrigin = 'anonymous'; l.href = href;
  document.head.appendChild(l);
}

/**
 * Stößt die Startdaten an (Länder-Split bzw. markers.json + lang.json), bevor map.js läuft.
 * @param {string} [hash]
 */
export function preloadInitialData(hash = window.location.hash) {
  const code = detectCountryCodeFromURL(hash);
  preloadFetch(code ? `data/spaces-${code}.json` : 'data/markers.json');
  preloadFetch('lang.json');
}
