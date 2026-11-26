// workshop-keywords.js — Stichwörter je Workshop-Typ (Single Source of Truth)
// Genutzt von tools/workshop-crawler.js (Node) und admin/admin-lib.js (Freitext → Typen). Pure, kein DOM.
// Neue Typen: zuerst in workshop-types.js anlegen, dann hier Stichwörter ergänzen.

/** @type {Record<string, string[]>} */
export const WORKSHOP_KEYWORDS = {
  '3d': [
    '3d-drucker', '3d drucker', '3d-druck', '3d druck', '3d printer', '3d printing',
    'fdm drucker', 'fdm-drucker', 'resin drucker', 'sla drucker', 'dlp drucker',
    'filamentdrucker', 'filament drucker', 'additive fertigung',
    'prusa', 'bambulab', 'bambu lab', 'ultimaker', 'creality', 'reprap',
  ],
  'laser': [
    'lasercutter', 'laser cutter', 'lasergravur', 'laser gravur',
    'lasergravierer', 'laser engraver', 'co2-laser', 'co2 laser',
    'laserschneider', 'laser schneider', 'laseranlage', 'laser anlage',
    'trotec', 'epilog laser', 'full spectrum',
  ],
  'electronics': [
    'lötstation', 'loetstation', 'löten', 'loeten', 'lötkolben', 'loetkolben',
    'lötplatz', 'loetplatz', 'elektronikwerkstatt', 'elektronik werkstatt',
    'elektroniklabor', 'elektronik labor', 'lötbereich',
    'oszilloskop', 'oszi', 'multimeter', 'pcb fräse', 'platinenfräse',
    'reflow ofen', 'heißluftlötstation',
  ],
  'coding': [
    'programmierworkshop', 'programmier-workshop', 'hackathon',
    'coding workshop', 'software workshop', 'coding space', 'hack space',
    'code & coffee', 'code and coffee', 'linux workshop', 'python workshop',
    'maker education', 'stem workshop',
  ],
  'vr': [
    'vr-brille', 'vr brille', 'virtual reality', 'vr-headset', 'vr headset',
    'vr-raum', 'vr raum', 'oculus', 'meta quest', 'htc vive', 'valve index',
    'augmented reality', 'mixed reality',
  ],
  'music': [
    'musikstudio', 'musik studio', 'recording studio', 'aufnahmestudio',
    'aufnahme studio', 'tonstudio', 'ton studio', 'synthesizer',
    'midi studio', 'musikproduktion', 'musik produktion',
    'proberaum', 'probe raum', 'drum machine', 'modular synth',
  ],
  'wood': [
    'holzwerkstatt', 'holz werkstatt', 'tischkreissäge', 'tischkreissaege',
    'drechselbank', 'oberfräse', 'oberfraese',
    'bandsäge', 'bandsaege', 'holzbearbeitung', 'holzfräse', 'holzfraese',
    'tischfräse', 'kreissäge', 'stichsäge',
    'woodworking', 'carpentry', 'wood shop', 'woodshop',
  ],
  'metal': [
    'schweißen', 'schweissen', 'schweißgerät', 'schweissgeraet',
    'mig/mag', 'mig-schweißen', 'tig-schweißen', 'wig-schweißen',
    'drehbank', 'metallwerkstatt', 'metall werkstatt',
    'plasmaschneider', 'plasma schneider', 'metallbearbeitung',
    'metallfräse', 'metall fräse', 'cnc drehen',
    'schlosser', 'schmieden', 'schmied',
  ],
  'textile': [
    'nähmaschine', 'naehmaschine', 'nähen', 'naehen', 'stickmaschine',
    'sticken', 'textilwerkstatt', 'textil werkstatt', 'nähwerkstatt',
    'naehwerkstatt', 'webmaschine', 'stricken', 'schneidern',
    'silhouette', 'cricut', 'vinylcutter',
  ],
  'screenprint': [
    'siebdruck', 'siebdruckanlage', 'siebdruck-anlage', 'siebdruck anlage',
    'screen print', 'screenprint', 'siebdruckwerkstatt',
    'risographie', 'riso druck',
  ],
  'cnc': [
    'cnc-fräse', 'cnc fräse', 'cnc-router', 'cnc router',
    'cnc maschine', 'cnc-maschine', 'cnc milling', 'portalfräse',
    'computergesteuertes fräsen', 'cnc gravieren', 'cnc-gravur',
  ],
  'ceramics': [
    'töpferei', 'toepferei', 'töpfern', 'toepfern', 'keramikwerkstatt',
    'brennofen', 'töpferofen', 'töpferscheibe', 'glasur',
    'ceramics', 'pottery', 'kiln', 'keramik werkstatt',
  ],
  'photo': [
    'fotostudio', 'foto studio', 'fotolabor', 'foto labor',
    'dunkelkammer', 'darkroom', 'analoge fotografie',
    'filmentwicklung', 'fotoentwicklung', 'lichtstudio',
    'blitzanlage', 'studiobeleuchtung', 'greenscreen', 'green screen',
    'podcaststudio', 'podcast studio',
  ],
  'bike': [
    'fahrradwerkstatt', 'fahrrad werkstatt', 'fahrrad reparatur',
    'velowerkstatt', 'velo werkstatt', 'fahrrad selbsthilfe',
    'bike repair', 'bike workshop', 'fahrrad selbst reparieren',
  ],
  // Bewusst nur eindeutige Begriffe (Repair-Café/Reparatur-Treff/-Werkstatt), kein bloßes „Reparatur“ (Fahrrad-Reparatur gehört zu 'bike')
  'repair': [
    'repair café', 'repair cafe', 'repair-café', 'repair-cafe', 'repaircafé', 'repaircafe',
    'reparaturcafé', 'reparaturcafe', 'reparatur-café', 'reparatur café', 'reparatur-cafe', 'reparatur cafe',
    'reparaturtreff', 'reparatur-treff', 'reparatur treff', 'repair treff', 'repair-treff',
    'reparaturwerkstatt', 'reparatur-werkstatt', 'reparatur werkstatt', 'repair workshop',
  ],
};

/**
 * Erkennt Workshop-Typen in einem Freitext (Teilstring-Treffer, Groß-/Kleinschreibung egal).
 * @param {string} text
 * @returns {string[]} Typen in der Reihenfolge von WORKSHOP_KEYWORDS
 */
export function detectTypes(text) {
  const lower = String(text).toLowerCase();
  return Object.keys(WORKSHOP_KEYWORDS).filter(type => WORKSHOP_KEYWORDS[type].some(kw => lower.includes(kw)));
}

/**
 * Bewusst KEIN „fablab": Ein FabLab hat typischerweise digitale Fertigung (Laser, 3D-Druck, CNC), aber das ist nicht garantiert —
 * ohne genannte Geräte wird nichts abgeleitet (der „Website scannen"-Knopf liest die konkreten Geräte aus).
 * Lockere Stichwörter NUR für bewusst eingefügten Text (Admin-Freitext), z. B. Überschriften wie
 * „HOLZ • METALL • ELEKTRONIK • FABLAB • FAHRRAD". Nicht fürs Crawlen fremder Websites verwenden (zu viele Fehlalarme).
 * @type {Record<string, string[]>}
 */
export const WORKSHOP_LOOSE_KEYWORDS = {
  '3d':          ['3d'],
  'laser':       ['laser'],
  'cnc':         ['cnc', 'fräse', 'fraese', 'carvera', 'makera'],
  'electronics': ['elektronik', 'electronics', 'esp8266', 'esp32', 'arduino', 'raspberry pi', 'mikrocontroller', 'microcontroller', 'ws2812', 'led-strip', 'led strip', 'sensor', 'platine'],
  'wood':        ['holz', 'wood'],
  'metal':       ['metall', 'metal', 'carvera'], // Carvera = Desktop-CNC, fräst u. a. Aluminium (Annahme, bitte prüfen)
  'bike':        ['fahrrad', 'bike', 'velo'],
  'textile':     ['textil', 'nähen', 'naehen'],
  'screenprint': ['siebdruck'],
  'ceramics':    ['keramik', 'töpfer', 'toepfer'],
  'repair':      ['repair', 'reparatur', 'reparier'],
};

/**
 * Lockere GANZE Wörter (nicht Teil eines längeren Worts) — für kurze Begriffe wie „Code", die als Teilstring zu viele
 * Fehlalarme gäben („Unicode", „Barcode"). Nur für eingefügten Text im Admin.
 * @type {Record<string, string[]>}
 */
export const WORKSHOP_LOOSE_WORDS = {
  'coding': ['code', 'coding', 'programmieren', 'programmierung', 'software', 'github', 'gitlab', 'python', 'javascript'],
};

const wordRe = kw => new RegExp(`(?<![\\p{L}\\p{N}])${kw}(?![\\p{L}\\p{N}])`, 'iu');

/** Wie detectTypes, zusätzlich mit lockeren Stichwörtern und ganzen Wörtern (nur für eingefügten Text). */
export function detectTypesLoose(text) {
  const lower = String(text).toLowerCase();
  const strict = new Set(detectTypes(text));
  const loose = Object.keys(WORKSHOP_LOOSE_KEYWORDS).filter(t => WORKSHOP_LOOSE_KEYWORDS[t].some(kw => lower.includes(kw)));
  const words = Object.keys(WORKSHOP_LOOSE_WORDS).filter(t => WORKSHOP_LOOSE_WORDS[t].some(kw => wordRe(kw).test(String(text))));
  return Object.keys(WORKSHOP_KEYWORDS).filter(t => strict.has(t) || loose.includes(t) || words.includes(t));
}
