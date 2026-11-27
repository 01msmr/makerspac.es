// tools/lib/push-due.js — welche Favoriten eines Abos sollen jetzt gemeldet werden? (pure, ohne Netz/Dateien — Versand: tools/send-push.js)
//
// Regel: Ein Favorit mit Wochentermin (weekly.weekday 0–6 + weekly.time als HHMM) wird gemeldet, wenn der Termin HEUTE (Ortszeit des
// Space) beginnt und in höchstens LEAD_MINUTES Minuten (3 Std.) ansteht — einmal pro Space und Tag und Abo. Nachts (vor 07:00 / ab 22:00
// Ortszeit) wird nichts gesendet; ein Termin um 07:30 wird dann ab 07:00 gemeldet.

export const LEAD_MINUTES = 180;
export const QUIET_BEFORE_HOUR = 7;
export const QUIET_FROM_HOUR = 22;

/** Zeitzone je Land (Daten-Feld loc.country, englisch); alles andere: Mitteleuropa */
const TZ = { Ukraine: 'Europe/Kyiv' };
export const tzForCountry = country => TZ[country] || 'Europe/Berlin';

const WEEKDAY_INDEX = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

/**
 * Ortszeit-Bestandteile eines Zeitpunkts in einer Zeitzone.
 * @param {Date} now @param {string} timeZone
 * @returns {{date: string, weekday: number, minutes: number}} date = YYYY-MM-DD, minutes = Minuten seit 00:00
 */
export function localParts(now, timeZone) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', weekday: 'short',
  }).formatToParts(now).map(x => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, weekday: WEEKDAY_INDEX[p.weekday], minutes: Number(p.hour) * 60 + Number(p.minute) };
}

/** weekly.time (HHMM, z. B. 1900; Altbestand „19“ = 19 Uhr) → Minuten seit 00:00, sonst null */
export function weeklyStartMinutes(time) {
  if (typeof time !== 'number' || !Number.isFinite(time) || time <= 0) return null;
  const h = time < 100 ? time : Math.floor(time / 100);
  const m = time < 100 ? 0 : time % 100;
  return h > 23 || m > 59 ? null : h * 60 + m;
}

/**
 * @typedef {{ID: number, name: string, loc?: {country?: string}, weekly?: {weekday?: number, time?: number}}} PushSpace
 * @typedef {{id: number, name: string, weekday: number, startMinutes: number, inMinutes: number, date: string}} DueSpace
 */

/**
 * @param {number[]} favorites Favoriten-IDs des Abos
 * @param {Map<number, PushSpace>} spacesById
 * @param {Record<string, string>} sent bisher gemeldet: Space-ID → Datum (Ortszeit) der letzten Meldung
 * @param {Date} now
 * @returns {DueSpace[]}
 */
export function dueSpaces(favorites, spacesById, sent, now) {
  const out = [];
  for (const id of favorites) {
    const s = spacesById.get(id);
    const w = s?.weekly;
    if (!s || !w || typeof w.weekday !== 'number' || w.weekday > 6) continue;
    const start = weeklyStartMinutes(w.time);
    if (start === null) continue;
    const t = localParts(now, tzForCountry(s.loc?.country));
    if (t.weekday !== w.weekday) continue;
    if (t.minutes < QUIET_BEFORE_HOUR * 60 || t.minutes >= QUIET_FROM_HOUR * 60) continue;
    const inMinutes = start - t.minutes;
    if (inMinutes < 0 || inMinutes > LEAD_MINUTES) continue;
    if (sent?.[id] === t.date) continue;
    out.push({ id, name: s.name, weekday: w.weekday, startMinutes: start, inMinutes, date: t.date });
  }
  return out.sort((a, b) => a.inMinutes - b.inMinutes);
}

/** „Gemeldet“-Merkliste fortschreiben und aufräumen (nur das heutige Datum je Space bleibt relevant; alte Einträge fliegen raus) */
export function markSent(sent, due, keepDates) {
  const next = {};
  for (const [id, date] of Object.entries(sent || {})) if (keepDates.has(date)) next[id] = date;
  for (const d of due) next[d.id] = d.date;
  return next;
}

// Meldungstext je Sprache: „Mittwochs 19:00 Uhr, also heute hat <Space> sein Wochenmeeting.⏎Kommst Du auch?“
// days = Wochentage ab Sonntag (Date.getDay()) in der Wendung „immer an diesem Tag“, am Satzanfang großgeschrieben.
const TEXT = {
  de: { days: ['Sonntags', 'Montags', 'Dienstags', 'Mittwochs', 'Donnerstags', 'Freitags', 'Samstags'],
        body: (t, d, n) => `${d} ${t} Uhr, also heute hat ${n} sein Wochenmeeting.\nKommst Du auch?` },
  en: { days: ['Sundays', 'Mondays', 'Tuesdays', 'Wednesdays', 'Thursdays', 'Fridays', 'Saturdays'],
        body: (t, d, n) => `${d} at ${t}, so today, ${n} has its weekly meeting.\nAre you coming too?` },
  fr: { days: ['Le dimanche', 'Le lundi', 'Le mardi', 'Le mercredi', 'Le jeudi', 'Le vendredi', 'Le samedi'],
        body: (t, d, n) => `${d} à ${t}, donc aujourd'hui, ${n} tient sa réunion hebdomadaire.\nTu viens aussi ?` },
  it: { days: ['La domenica', 'Il lunedì', 'Il martedì', 'Il mercoledì', 'Il giovedì', 'Il venerdì', 'Il sabato'],
        body: (t, d, n) => `${d} alle ${t}, quindi oggi, ${n} ha il suo incontro settimanale.\nVieni anche tu?` },
  nl: { days: ['Zondags', 'Maandags', 'Dinsdags', 'Woensdags', 'Donderdags', 'Vrijdags', 'Zaterdags'],
        body: (t, d, n) => `${d} om ${t} uur, dus vandaag, heeft ${n} zijn wekelijkse bijeenkomst.\nKom je ook?` },
  da: { days: ['Om søndagen', 'Om mandagen', 'Om tirsdagen', 'Om onsdagen', 'Om torsdagen', 'Om fredagen', 'Om lørdagen'],
        body: (t, d, n) => `${d} kl. ${t}, altså i dag, har ${n} sit ugentlige møde.\nKommer du også?` },
  uk: { days: ['Щонеділі', 'Щопонеділка', 'Щовівторка', 'Щосереди', 'Щочетверга', 'Щоп’ятниці', 'Щосуботи'],
        body: (t, d, n) => `${d} о ${t}, тобто сьогодні, у ${n} щотижнева зустріч.\nПрийдеш теж?` },
};

/** Meldung: Titel „makerspac.es“, Text s. o. (Sprache des Abos, Fallback en), Tag je Space, Link auf den Space */
export function buildPayload(due, lang) {
  const t = TEXT[lang] || TEXT.en;
  const hh = String(Math.floor(due.startMinutes / 60)).padStart(2, '0');
  const mm = String(due.startMinutes % 60).padStart(2, '0');
  return { title: 'makerspac.es', body: t.body(`${hh}:${mm}`, t.days[due.weekday], due.name), tag: `space-${due.id}`, url: `/#/${due.id}` };
}
