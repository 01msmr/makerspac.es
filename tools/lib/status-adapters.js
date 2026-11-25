// tools/lib/status-adapters.js — Status-Adapter für Spaces OHNE SpaceAPI (pure, ohne Abhängigkeiten; getestet)
//
// Pilot „html-style“ (Fabulous St. Pauli / fablab-hamburg.org/sesame): die Statusseite ist
//   <body style="…;background:red">November 25 03:01</body>
// → Zustand steckt im Style-Attribut (red/green, auch Hex/rgb), der Text ist der Zeitpunkt der letzten Änderung.
// Es zählt NUR der aktuelle Stand (keine Historie). Der Zeitpunkt dient allein dazu, zu alte Stände als „unbekannt“ zu werten.
// Der Adapter rät nie: Nicht lesbar/zu alt/mehrdeutig → status null + reason.

export const DEFAULT_MAX_AGE_HOURS = 72;
export const ADAPTERS = ['html-style'];

// ─── Farbe ──────────────────────────────────────────────────────────────

const NAMED = {
  red: [255, 0, 0], crimson: [220, 20, 60], darkred: [139, 0, 0], firebrick: [178, 34, 34], tomato: [255, 99, 71], orangered: [255, 69, 0],
  green: [0, 128, 0], lime: [0, 255, 0], limegreen: [50, 205, 50], darkgreen: [0, 100, 0], forestgreen: [34, 139, 34], seagreen: [46, 139, 87], lightgreen: [144, 238, 144],
};

/** CSS-Farbe → [r,g,b] oder null (Name, #rgb, #rrggbb, rgb()/rgba()) */
export function parseCssColor(value) {
  const v = String(value).trim().toLowerCase().replace(/\s*!important$/, '');
  if (NAMED[v]) return NAMED[v];
  let m = v.match(/^#([0-9a-f]{3})$/);
  if (m) return [...m[1]].map(c => parseInt(c + c, 16));
  m = v.match(/^#([0-9a-f]{6})(?:[0-9a-f]{2})?$/);
  if (m) return [0, 2, 4].map(i => parseInt(m[1].slice(i, i + 2), 16));
  m = v.match(/^rgba?\(\s*(\d{1,3})\s*[, ]\s*(\d{1,3})\s*[, ]\s*(\d{1,3})/);
  if (m) return [m[1], m[2], m[3]].map(Number).filter(n => n <= 255).length === 3 ? [m[1], m[2], m[3]].map(Number) : null;
  return null;
}

/** [r,g,b] → true (grün = da/offen) · false (rot) · null (andere Farben/Grau/Orange: nicht raten) */
export function classifyRedGreen([r, g, b]) {
  if (g >= r + 50 && g >= b + 50) return true;
  if (r >= g + 70 && r >= b + 70 && g < 120) return false;
  return null;
}

/** Hintergrundfarbe aus dem Style-Attribut des <body> (sonst des ersten Elements mit background) */
export function backgroundOf(html) {
  const tags = [...String(html).matchAll(/<(body|div|td|table|p|span|html)\b[^>]*\bstyle\s*=\s*(?:"([^"]*)"|'([^']*)')/gi)];
  const ordered = [...tags.filter(t => t[1].toLowerCase() === 'body'), ...tags.filter(t => t[1].toLowerCase() !== 'body')];
  for (const t of ordered) {
    const style = t[2] ?? t[3] ?? '';
    const m = style.match(/(?:^|;)\s*background(?:-color)?\s*:\s*([^;]+)/i);
    if (m) return m[1].trim().replace(/^(?:url\([^)]*\)\s*)/i, '');
  }
  return null;
}

// ─── Zeitpunkt „November 25 03:01“ ───────────────────────────────────────

const MONTHS = {
  january: 1, jan: 1, januar: 1, february: 2, feb: 2, februar: 2, march: 3, mar: 3, märz: 3, maerz: 3, mär: 3, april: 4, apr: 4,
  may: 5, mai: 5, june: 6, jun: 6, juni: 6, july: 7, jul: 7, juli: 7, august: 8, aug: 8, september: 9, sep: 9, sept: 9,
  october: 10, oct: 10, oktober: 10, okt: 10, november: 11, nov: 11, december: 12, dec: 12, dezember: 12, dez: 12,
};

/** Berlin-Ortszeit → UTC-ms (Sommer-/Winterzeit über Intl) */
export function berlinToUtc(y, mo, d, h, mi) {
  const guess = Date.UTC(y, mo - 1, d, h, mi);
  const fmt = new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/Berlin', hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric' });
  const at = ms => { const p = Object.fromEntries(fmt.formatToParts(new Date(ms)).map(x => [x.type, Number(x.value)])); return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute) - ms; };
  let ms = guess - at(guess);
  ms = guess - at(ms);
  return ms;
}

const berlinYear = ms => Number(new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/Berlin', year: 'numeric' }).format(new Date(ms)));

/** „November 25 03:01“ / „25. November 03:01“ → UTC-ms (Jahr: das aktuelle, bzw. das Vorjahr, wenn sonst in der Zukunft) oder null */
export function parseChangeTime(text, now = Date.now()) {
  const t = String(text).replace(/\s+/g, ' ').trim();
  let m = t.match(/^([A-Za-zäöüÄÖÜ]{3,9})\.? (\d{1,2})(?:st|nd|rd|th)?,? (?:um |at )?(\d{1,2}):(\d{2})\b/);
  let mon, day;
  if (m) { mon = MONTHS[m[1].toLowerCase()]; day = Number(m[2]); }
  else {
    m = t.match(/^(\d{1,2})\.? ([A-Za-zäöüÄÖÜ]{3,9})\.?,? (?:um |at )?(\d{1,2}):(\d{2})\b/);
    if (!m) return null;
    mon = MONTHS[m[2].toLowerCase()]; day = Number(m[1]);
    m = [m[0], m[2], m[1], m[3], m[4]];
  }
  const h = Number(m[3]), mi = Number(m[4]);
  if (!mon || day < 1 || day > 31 || h > 23 || mi > 59) return null;
  const year = berlinYear(now);
  let ms = berlinToUtc(year, mon, day, h, mi);
  if (ms > now + 6 * 3600e3) ms = berlinToUtc(year - 1, mon, day, h, mi);   // Zukunft = Vorjahr
  return ms;
}

/** Sichtbarer Text des <body> (Tags entfernt) */
export function bodyText(html) {
  const m = String(html).match(/<body\b[^>]*>([\s\S]*?)(?:<\/body>|$)/i);
  return (m ? m[1] : String(html)).replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
}

// ─── Adapter ────────────────────────────────────────────────────────────

/**
 * @param {string} html
 * @param {{now?:number, maxAgeHours?:number}} [opts]
 * @returns {{status: boolean|null, reason?: string, ageHours?: number}}
 */
export function parseHtmlStyleStatus(html, { now = Date.now(), maxAgeHours = DEFAULT_MAX_AGE_HOURS } = {}) {
  const bg = backgroundOf(html);
  if (!bg) return { status: null, reason: 'kein background im Style-Attribut' };
  const rgb = parseCssColor(bg);
  if (!rgb) return { status: null, reason: `Farbe nicht lesbar („${bg.slice(0, 30)}“)` };
  const status = classifyRedGreen(rgb);
  if (status === null) return { status: null, reason: `Farbe weder rot noch grün („${bg.slice(0, 30)}“)` };
  const changed = parseChangeTime(bodyText(html), now);
  if (changed === null) return { status: null, reason: 'Zeitpunkt der letzten Änderung nicht lesbar — Aktualität unbekannt' };
  const ageHours = Math.round((now - changed) / 3600e3 * 10) / 10;
  if (ageHours > maxAgeHours) return { status: null, reason: `Stand zu alt (${Math.round(ageHours)} h > ${maxAgeHours} h)`, ageHours };
  return { status, ageHours };
}

/** @param {string} adapter @returns {(text:string, opts?:object) => {status:boolean|null, reason?:string}} */
export function adapterFor(adapter) {
  if (adapter === 'html-style') return parseHtmlStyleStatus;
  return null;
}
