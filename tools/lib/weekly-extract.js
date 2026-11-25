// tools/lib/weekly-extract.js — Weekly-Treffen + Gründungsjahr aus Seitentext (rein regelbasiert, ohne KI, pure).
// Wochentag-Konvention wie date-utils.js: 0 = Sonntag … 6 = Samstag. Uhrzeit als HHMM.
// Nur Konfidenz 'high' wird vorgeschlagen; alles andere erscheint nur im Dry-Run-Bericht.

export const WEEKLY_PLACEHOLDER = { weekday: 9, time: 0 };
export const INIT_PLACEHOLDER = 20010000;

const DAYS = [
  [1, ['montag', 'monday']], [2, ['dienstag', 'tuesday']], [3, ['mittwoch', 'wednesday']],
  [4, ['donnerstag', 'thursday']], [5, ['freitag', 'friday']], [6, ['samstag', 'sonnabend', 'saturday']],
  [0, ['sonntag', 'sunday']],
];
const SHORT = { mo: 1, di: 2, mi: 3, do: 4, fr: 5, sa: 6, so: 0, mon: 1, tue: 2, tues: 2, wed: 3, thu: 4, thur: 4, thurs: 4, fri: 5, sat: 6, sun: 0 };

const DAY_RE = new RegExp(`\\b(${DAYS.flatMap(([, n]) => n).join('|')})s?\\b`, 'i');
// Kurzform nur, wenn direkt eine Uhrzeit folgt (sonst „so“, „do“, „mi“ als normale Wörter)
const SHORT_RE = new RegExp(`\\b(${Object.keys(SHORT).join('|')})\\b\\.?:?\\s*(?=(?:ab\\s+)?\\d{1,2}(?:[:.]\\d{2}|\\s*(?:uhr|h|pm|am)\\b))`, 'i');
const TIME_RE = /(?:\bab\s+|\bum\s+|\bfrom\s+|\bat\s+|\b)(\d{1,2})(?:[:.](\d{2}))?\s*(uhr|h|pm|am)?\b/gi;
const EVERY_RE = /\b(jeden|jede|jedes|every|each|wöchentlich|woechentlich|weekly|immer)\b/i;
// Nicht wöchentlich (monatlich, jeden 3. Donnerstag, alle zwei Wochen …) → kein Weekly-Treffen
const NOT_WEEKLY_RE = /\b(?:jeden|jede|jedes|every|each)\s+(?:(?:ersten|zweiten|dritten|vierten|letzten|1\.|2\.|3\.|4\.|other|first|second|third|fourth|last|2nd|3rd|4th|1st)\b|(?:zweite|zweiten|andere|other)\b)|\b(?:monatlich|monatliche\w*|monthly|vierzehntägig|14-tägig|zweiwöchentlich|biweekly|fortnightly|alle\s+(?:zwei|2|drei|3|vier|4)\s+wochen|every\s+(?:two|2|three|3|four|4)\s+weeks)\b/i;
// Teilgruppe/Kurs statt des Space-Treffens → höchstens „medium“
const SUBGROUP_RE = /\b(node|team|gruppe|arbeitsgruppe|projektgruppe|ag|workshop|kurs|course|class|training)\b/i;
const CONTEXT_RE = /\b(treffen|treff|offen\w*|open\s+\w+|stammtisch|plenum|öffnungszeit\w*|oeffnungszeit\w*|meeting|meetup|hours|abend|night|evening)\b/i;

/** Erste plausible Uhrzeit (HHMM) im Text nach dem Wochentag, sonst null. */
export function parseTime(s) {   // s = Satzteil; Vorlauf vor dem Treffer wird für „bis/until“ ausgewertet
  TIME_RE.lastIndex = 0;
  let m;
  while ((m = TIME_RE.exec(s))) {
    let h = parseInt(m[1], 10);
    const min = m[2] ? parseInt(m[2], 10) : 0;
    const unit = (m[3] || '').toLowerCase();
    const rest = s.slice(m.index + m[0].length);
    if (/(?:\bbis|\buntil|\btill|\bto|[-–])\s*$/i.test(s.slice(0, m.index))) continue;   // Endzeit („bis 20:00“) ist nicht der Beginn
    if (!m[2] && !unit && !/^\s*(?:bis|–|-|to|until|till)\s*\d/i.test(rest)) continue;       // nackte Zahl ohne Uhr/h/:mm — kein Zeitbezug (außer Bereichsbeginn „18 bis 22 Uhr“)
    if (unit === 'pm' && h < 12) h += 12;
    if (unit === 'am' && h === 12) h = 0;
    if (h > 23 || min > 59) continue;
    return h * 100 + min;
  }
  return null;
}

function dayIn(sentence) {
  const long = sentence.match(DAY_RE);
  if (long) { const w = long[1].toLowerCase(); return { idx: long.index, end: long.index + long[0].length, weekday: DAYS.find(([, n]) => n.includes(w))[0] }; }
  const short = sentence.match(SHORT_RE);
  if (short) return { idx: short.index, end: short.index + short[0].length, weekday: SHORT[short[1].toLowerCase()] };
  return null;
}

/**
 * @param {string} text Seitentext
 * @returns {{weekday:number,time:number,confidence:'high'|'medium',source:string}[]} Treffer je Satz/Zeile
 */
export function extractWeeklyCandidates(text) {
  const out = [];
  for (const raw of text.split(/\n|(?<=[.!?])\s+(?=[A-ZÄÖÜ])/)) {
    const s = raw.trim();
    if (!s || s.length > 300) continue;
    const d = dayIn(s);
    if (!d || !CONTEXT_RE.test(s) && !EVERY_RE.test(s) || NOT_WEEKLY_RE.test(s)) continue;
    const time = parseTime(s.slice(d.end)) ?? parseTime(s.slice(0, d.idx));
    if (time == null) continue;
    out.push({ weekday: d.weekday, time, confidence: EVERY_RE.test(s) && !SUBGROUP_RE.test(s) ? 'high' : 'medium', source: s });
  }
  return out;
}

/** Ein Ergebnis je Seite/Space: nur eindeutig, wenn alle high-Treffer dasselbe (Wochentag, Zeit) nennen. */
export function pickWeekly(candidates) {
  const high = candidates.filter(c => c.confidence === 'high');
  const keys = new Set(high.map(c => `${c.weekday}:${c.time}`));
  if (keys.size === 1) return { weekday: high[0].weekday, time: high[0].time, confidence: 'high', source: high[0].source };
  if (keys.size > 1) return { confidence: 'low', reason: 'mehrere verschiedene Termine', candidates: high.map(c => c.source) };
  const med = new Set(candidates.map(c => `${c.weekday}:${c.time}`));
  if (med.size === 1) return { weekday: candidates[0].weekday, time: candidates[0].time, confidence: 'medium', source: candidates[0].source };
  return null;
}

const MONTHS = { januar: 1, jan: 1, january: 1, februar: 2, feb: 2, february: 2, märz: 3, maerz: 3, march: 3, april: 4, mai: 5, may: 5, juni: 6, june: 6, juli: 7, july: 7, august: 8, aug: 8, september: 9, sep: 9, oktober: 10, october: 10, november: 11, nov: 11, dezember: 12, december: 12, dez: 12, dec: 12 };
const FOUND_RE = /\b(gegründet|gegruendet|gründung|gruendung|gründungsjahr|founded|established|est\.)\b[^.\n]{0,40}?(?:(\d{1,2})\.(\d{1,2})\.)?\s*(?:(\d{1,2})\.\s*)?([A-Za-zäöüÄÖÜ]{3,9}\s+)?((?:19|20)\d{2})\b/i;
const FOUND_BEFORE_RE = /(?:(\d{1,2})\.(\d{1,2})\.|(?:\b(?:im|in|am)\s+)?([A-Za-zäöüÄÖÜ]{3,9})\s+)?((?:19|20)\d{2})\b[^.\n]{0,30}?\b(?:gegründet|gegruendet|founded)\b/i;
const SINCE_RE = /\b(seit|since)\s+(?:(\w{3,9})\s+)?((?:19|20)\d{2})\b/i;

/**
 * Satz beschreibt ein erstes Treffen / einen ersten offenen Tag / einen Umzug – das Datum ist dann KEINE Vereinsgründung.
 * „Eröffnung“ zählt bewusst nicht dazu (kann die Gründungsbezeichnung sein).
 */
const NOT_FOUNDING_RE = /\b(erste[rnms]?|first)\b[^.\n]{0,40}\b(treffen|meeting|makertag|maker-?tag|offene[rnms]?\s+(?:tag|abend|werkstatt|treff)|open\s+(?:day|night|house|lab)|abend|stammtisch|termin|workshop|veranstaltung|event)\b|\b(umzug|umgezogen|moved|relocat\w*|neue[rnms]?\s+räume)\b/i;

/**
 * Vereins-/Community-Gründungsdatum (NICHT erstes Treffen, erster offener Tag, Umzug) als YYYYMMDD (nur Jahr → YYYY0101, Monat+Jahr → YYYYMM01).
 * high nur bei „gegründet/Gründung/founded/established“; „seit/since“ ist nur medium.
 * @returns {{date:number,confidence:'high'|'medium',source:string}|null}
 */
export function extractInit(text, thisYear = new Date().getFullYear()) {
  for (const raw of text.split('\n')) {
    const s = raw.trim();
    if (!s || s.length > 300 || NOT_FOUNDING_RE.test(s)) continue;
    const b = s.match(FOUND_BEFORE_RE);
    if (b) {
      const year = parseInt(b[4], 10);
      if (year > thisYear) continue;
      const mon = b[3] && MONTHS[b[3].toLowerCase()];
      const month = b[2] ? parseInt(b[2], 10) : (mon || 1), day = b[1] ? parseInt(b[1], 10) : 1;
      if (month >= 1 && month <= 12 && day >= 1 && day <= 31) return { date: year * 10000 + month * 100 + day, confidence: 'high', source: s };
    }
    const f = s.match(FOUND_RE);
    if (f) {
      const year = parseInt(f[6], 10);
      if (year > thisYear) continue;
      let month = 1, day = 1;
      if (f[2] && f[3]) { day = parseInt(f[2], 10); month = parseInt(f[3], 10); }
      else if (f[5] && MONTHS[f[5].trim().toLowerCase()]) { month = MONTHS[f[5].trim().toLowerCase()]; day = f[4] ? parseInt(f[4], 10) : 1; }
      if (month < 1 || month > 12 || day < 1 || day > 31) { month = 1; day = 1; }
      return { date: year * 10000 + month * 100 + day, confidence: 'high', source: s };
    }
  }
  for (const raw of text.split('\n')) {
    const m = NOT_FOUNDING_RE.test(raw) ? null : raw.match(SINCE_RE);
    if (m && parseInt(m[3], 10) <= thisYear) {
      const mon = m[2] && MONTHS[m[2].toLowerCase()];
      return { date: parseInt(m[3], 10) * 10000 + (mon || 1) * 100 + 1, confidence: 'medium', source: raw.trim() };
    }
  }
  return null;
}

export const isWeeklyPlaceholder = w => !w || (w.weekday === 9 && !w.time) || w.weekday === undefined;
export const isInitPlaceholder = n => !n || n === INIT_PLACEHOLDER;

/**
 * Nur das vorschlagen, was vom Ist-Stand abweicht (und bei force=false nur Platzhalter füllen).
 * @param {{weekly?:{weekday:number,time:number}, dates?:Record<string,number>}} loc verschmolzener Ist-Stand
 * @param {{weekly?:{weekday:number,time:number,confidence:string}|null, init?:{date:number,confidence:string}|null}} found
 * @returns {{weekly?:{weekday:number,time:number}, 'space.init'?:number}}
 */
export function weeklyDelta(loc, found, { force = false } = {}) {
  const delta = {};
  const w = found.weekly, i = found.init;
  if (w?.confidence === 'high' && w.weekday != null) {
    const cur = loc.weekly;
    if (isWeeklyPlaceholder(cur) ? true : force && (cur.weekday !== w.weekday || cur.time !== w.time)) delta.weekly = { weekday: w.weekday, time: w.time };
  }
  if (i?.confidence === 'high') {
    const cur = loc.dates?.['space.init'];
    if (isInitPlaceholder(cur) ? true : force && cur !== i.date) delta['space.init'] = i.date;
  }
  return delta;
}

/** Kanonischer Schlüssel für Vergleiche (Issue-Inhalt ↔ Fund). */
export function deltaKey(d) {
  if (!d || (!d.weekly && !d['space.init'])) return null;
  return `${d.weekly ? `${d.weekly.weekday}:${d.weekly.time}` : '-'}|${d['space.init'] ?? '-'}`;
}
