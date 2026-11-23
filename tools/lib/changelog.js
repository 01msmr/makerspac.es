// tools/lib/changelog.js — „new“-Reiter: Änderungsprotokoll aus der Git-Historie (pure Funktionen; Git-Zugriff in tools/build-changelog.js).
// Ein Eintrag = { d: 'YYYY-MM-DD', id, k, o }:
//   k: 'added' (neuer Space) | 'name' | 'address' (Straße/Nr./PLZ/Ort/Land; Koordinaten werden nicht genannt) | 'link' (Website) | 'style' (Zielgruppe)
//      | 'weekly' | 'workshops' | 'events' | 'spaceapi'
//   n: nur bei 'workshops' — Anzahl der ergänzten (o: 'add') bzw. entfernten (o: 'remove') Werkstatt-Typen
//   more: nur bei workshops/add — 1, wenn es schon Werkstätten gab (weitere ergänzt); fehlt, wenn erstmals Werkstätten erfasst wurden
//   o: 'add' | 'change' | 'remove' (bei k = 'added' nicht gesetzt)
// Reine Datumsstempel (`dates`) zählen nicht. Massenänderungen (Migrationen/Aufräumen) werden ausgelassen.

export const ENRICHMENT_KINDS = ['weekly', 'workshops', 'events', 'spaceapi'];
/** Grundangaben: Art → Auszug, der verglichen wird (genauer als „Angaben“: der Eintrag nennt, WAS sich geändert hat) */
export const INFO_KINDS = {
  name: l => l.name,
  // Nur die Adressfelder. Koordinaten werden nie genannt (Position = Adresse); eine reine Pin-Korrektur ist keine Adressänderung
  address: l => [l.loc?.street?.name, l.loc?.street?.number, l.loc?.street?.ext, l.loc?.plz, l.loc?.city, l.loc?.country],
  link: l => l.link,
  style: l => l.style,
};
export const BULK_LIMIT = 25;   // mehr betroffene Spaces in EINEM Commit → Wartung, kein Eintrag
export const MAX_ENTRIES = 400;

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const norm = (kind, v) => (kind === 'workshops' && Array.isArray(v) ? [...v].sort() : v);

/**
 * Unterschiede zwischen zwei Datenständen.
 * @param {{locations:object[], enrichment:Record<string,object>}} prev
 * @param {{locations:object[], enrichment:Record<string,object>}} next
 * @returns {{id:number,k:string,o?:string}[]}
 */
export function diffSpaces(prev, next) {
  const out = [];
  const before = new Map(prev.locations.map(l => [l.ID, l]));
  for (const loc of next.locations) {
    const old = before.get(loc.ID);
    if (!old) { out.push({ id: loc.ID, k: 'added' }); continue; }
    for (const [kind, pick] of Object.entries(INFO_KINDS)) if (!same(pick(old), pick(loc))) out.push({ id: loc.ID, k: kind, o: 'change' });
    for (const kind of ENRICHMENT_KINDS) {
      const a = norm(kind, prev.enrichment?.[String(loc.ID)]?.[kind]);
      const b = norm(kind, next.enrichment?.[String(loc.ID)]?.[kind]);
      if (kind === 'workshops') {   // „3 Werkstätten ergänzt“: Anzahl der neu hinzugekommenen bzw. entfernten Typen
        const was = new Set(a ?? []), now = new Set(b ?? []);
        const added = [...now].filter(w => !was.has(w)).length, removed = [...was].filter(w => !now.has(w)).length;
        if (added) out.push({ id: loc.ID, k: kind, o: 'add', n: added, ...(was.size ? { more: 1 } : {}) });
        if (removed) out.push({ id: loc.ID, k: kind, o: 'remove', n: removed });
        continue;
      }
      const hasA = a != null && !(Array.isArray(a) && a.length === 0), hasB = b != null && !(Array.isArray(b) && b.length === 0);
      if (!hasA && hasB) out.push({ id: loc.ID, k: kind, o: 'add' });
      else if (hasA && !hasB) out.push({ id: loc.ID, k: kind, o: 'remove' });
      else if (hasA && hasB && !same(a, b)) out.push({ id: loc.ID, k: kind, o: 'change' });
    }
  }
  return out;
}

/**
 * Baut die Eintragsliste aus Schnappschüssen (älteste zuerst).
 * @param {{date:string, prev:object, next:object}[]} steps
 * @param {Set<number>} [knownIds] nur Spaces, die es noch gibt
 * @returns {{d:string,id:number,k:string,o?:string}[]} neueste zuerst
 */
export function buildEntries(steps, knownIds) {
  const byKey = new Map();
  for (const { date, prev, next } of steps) {
    const diff = diffSpaces(prev, next);
    if (new Set(diff.filter(e => e.k !== 'added').map(e => e.id)).size > BULK_LIMIT) continue;   // Massenänderung
    for (const e of diff) {
      // Werkstätten: Ergänzen und Entfernen am selben Tag sind getrennte Angaben; Anzahlen am selben Tag addieren sich
      const key = `${date}|${e.id}|${e.k}${e.k === 'workshops' ? `|${e.o}` : ''}`;
      const old = byKey.get(key);
      if (old && e.k === 'workshops') byKey.set(key, { ...old, n: old.n + e.n });
      else byKey.set(key, old && e.o !== 'remove' ? old : { d: date, ...e });   // erste Art gewinnt, außer Entfernen
    }
  }
  let entries = [...byKey.values()];
  // Neuer Space am selben Tag: übrige Einträge (Ersteintragung von Weekly usw.) wären Rauschen
  const added = new Set(entries.filter(e => e.k === 'added').map(e => `${e.d}|${e.id}`));
  entries = entries.filter(e => e.k === 'added' || !added.has(`${e.d}|${e.id}`));
  if (knownIds) entries = entries.filter(e => knownIds.has(e.id));
  entries.sort((a, b) => b.d.localeCompare(a.d) || a.id - b.id || a.k.localeCompare(b.k));
  return entries.slice(0, MAX_ENTRIES);
}
