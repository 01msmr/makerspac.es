// changes-panel.js — Reiter „new“ im Overlay: letzte Änderungen/Ergänzungen, nach Monaten gebündelt (wie ein Blog).
// Daten: data/changes.json (tools/build-changelog.js, bei jedem Deploy aus der Git-Historie). Leaf-Modul ohne Abhängigkeiten.

/** Texte je Sprache (Sprachen wie ABOUT in embed-overlay.js); Fallback en */
export const CHANGES_TEXT = {
  en: { tab: 'new', intro: 'Latest additions and changes to the map.', empty: 'No changes recorded yet.',
    kinds: { added: 'New space', info: 'Details', weekly: 'Weekly meeting', workshops: 'Workshops', events: 'Event calendar', spaceapi: 'Live status' },
    ops: { add: 'added', change: 'updated', remove: 'removed' } },
  de: { tab: 'neu', intro: 'Letzte Ergänzungen und Änderungen an der Karte.', empty: 'Noch keine Änderungen verzeichnet.',
    kinds: { added: 'Neuer Space', info: 'Angaben', weekly: 'Wöchentliches Treffen', workshops: 'Werkstätten', events: 'Kalender', spaceapi: 'Live-Status' },
    ops: { add: 'ergänzt', change: 'geändert', remove: 'entfernt' } },
  fr: { tab: 'nouveau', intro: 'Derniers ajouts et modifications de la carte.', empty: 'Aucune modification enregistrée.',
    kinds: { added: 'Nouvel espace', info: 'Informations', weekly: 'Réunion hebdomadaire', workshops: 'Ateliers', events: 'Calendrier', spaceapi: 'Statut en direct' },
    ops: { add: 'ajouté', change: 'modifié', remove: 'supprimé' } },
  nl: { tab: 'nieuw', intro: 'Laatste toevoegingen en wijzigingen op de kaart.', empty: 'Nog geen wijzigingen vastgelegd.',
    kinds: { added: 'Nieuwe space', info: 'Gegevens', weekly: 'Wekelijkse bijeenkomst', workshops: 'Werkplaatsen', events: 'Agenda', spaceapi: 'Live status' },
    ops: { add: 'toegevoegd', change: 'gewijzigd', remove: 'verwijderd' } },
  it: { tab: 'novità', intro: 'Ultime aggiunte e modifiche alla mappa.', empty: 'Nessuna modifica registrata.',
    kinds: { added: 'Nuovo spazio', info: 'Dati', weekly: 'Incontro settimanale', workshops: 'Laboratori', events: 'Calendario', spaceapi: 'Stato live' },
    ops: { add: 'aggiunto', change: 'modificato', remove: 'rimosso' } },
  da: { tab: 'nyt', intro: 'Seneste tilføjelser og ændringer på kortet.', empty: 'Ingen ændringer registreret endnu.',
    kinds: { added: 'Nyt space', info: 'Oplysninger', weekly: 'Ugentligt møde', workshops: 'Værksteder', events: 'Kalender', spaceapi: 'Live-status' },
    ops: { add: 'tilføjet', change: 'ændret', remove: 'fjernet' } },
  uk: { tab: 'нове', intro: 'Останні додавання та зміни на карті.', empty: 'Змін ще не зафіксовано.',
    kinds: { added: 'Новий простір', info: 'Дані', weekly: 'Щотижнева зустріч', workshops: 'Майстерні', events: 'Календар', spaceapi: 'Статус наживо' },
    ops: { add: 'додано', change: 'змінено', remove: 'видалено' } },
};

export const changesText = lang => CHANGES_TEXT[lang] || CHANGES_TEXT.en;

/** „Weekly meeting · added“; bei „added“ (neuer Space) nur der Name der Art */
export function changeLabel(entry, lang) {
  const tx = changesText(lang);
  const kind = tx.kinds[entry.k] ?? entry.k;
  return entry.o ? `${kind} · ${tx.ops[entry.o] ?? entry.o}` : kind;
}

/** Monatsüberschrift „November 2026“ (Sprache des Nutzers) */
export function monthLabel(ym, lang) {
  const [y, m] = ym.split('-').map(Number);
  try { return new Intl.DateTimeFormat(lang, { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(y, m - 1, 1))); }
  catch { return ym; }
}

/** Tag „22. Nov.“ */
export function dayLabel(d, lang) {
  const [y, m, day] = d.split('-').map(Number);
  try { return new Intl.DateTimeFormat(lang, { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(Date.UTC(y, m - 1, day))); }
  catch { return d; }
}

/** Einträge (neueste zuerst) → [{ ym:'2026-11', entries:[…] }] in derselben Reihenfolge */
export function groupByMonth(entries) {
  const groups = [];
  for (const e of entries) {
    const ym = e.d.slice(0, 7);
    let g = groups[groups.length - 1];
    if (!g || g.ym !== ym) { g = { ym, entries: [] }; groups.push(g); }
    g.entries.push(e);
  }
  return groups;
}

/**
 * Zeichnet die Liste in `container` (nur textContent/DOM-API, kein innerHTML).
 * @param {HTMLElement} container
 * @param {{d:string,id:number,k:string,o?:string}[]} entries
 * @param {{ lang:string, locationById: Map<number, any>, onOpen: (loc:any)=>void }} opts
 */
export function renderChanges(container, entries, { lang, locationById, onOpen }) {
  container.replaceChildren();
  const shown = entries.filter(e => locationById.has(e.id));
  if (!shown.length) {
    container.append(Object.assign(document.createElement('p'), { className: 'changes-empty', textContent: changesText(lang).empty }));
    return;
  }
  for (const g of groupByMonth(shown)) {
    container.append(Object.assign(document.createElement('h3'), { className: 'embed-h3 changes-month-title', textContent: monthLabel(g.ym, lang) }));
    const ul = document.createElement('ul');
    ul.className = 'changes-month';
    for (const e of g.entries) {
      const loc = locationById.get(e.id);
      const li = document.createElement('li');
      const time = Object.assign(document.createElement('time'), { dateTime: e.d, textContent: dayLabel(e.d, lang) });
      const btn = Object.assign(document.createElement('button'), { type: 'button', className: 'changes-space', textContent: loc.name });
      btn.addEventListener('click', () => onOpen(loc));
      const what = Object.assign(document.createElement('span'), { className: 'changes-what', textContent: changeLabel(e, lang) });
      li.append(time, btn, what);
      ul.append(li);
    }
    container.append(ul);
  }
}
