// changes-panel.js — Reiter „new“ im Overlay: letzte Änderungen/Ergänzungen, nach Monaten gebündelt (wie ein Blog).
// Je Tag steht das Datum einmal, darunter eine fortlaufend nummerierte Liste (Nummern je Tag); mehrere Änderungen am selben Tag
// an einem Space stehen unter EINER Nummer, durch Komma getrennt („Wöchentliches Treffen ergänzt, Werkstätten ergänzt“).
// Daten: data/changes.json (tools/build-changelog.js, bei jedem Deploy aus der Git-Historie). Leaf-Modul ohne Abhängigkeiten.

/**
 * Texte je Sprache (Sprachen wie ABOUT in embed-overlay.js); Fallback en.
 * `more` = Muster „2 weitere Werkstätten“ (zu schon vorhandenen Werkstätten ergänzt; optional `forms` für andere Wortform).
 * `ops` = Verb-Formen; bei Sprachen mit Genus/Numerus (fr, it) nach Form `m | f | mp` getrennt, `gender` ordnet die Art zu.
 */
export const CHANGES_TEXT = {
  en: { tab: 'new', intro: 'Latest additions and changes to the map.', empty: 'No changes recorded yet.',
    workshopForms: { one: 'workshop', other: 'workshops' },
    more: { other: '{n} more {w}' },
    kinds: { added: 'New space', name: 'Name', address: 'Address', link: 'Website', style: 'Audience', weekly: 'Weekly meeting', workshops: 'Workshops', events: 'Event calendar', spaceapi: 'Live status' },
    ops: { add: 'added', change: 'updated', remove: 'removed' } },
  de: { tab: 'neu', intro: 'Letzte Ergänzungen und Änderungen an der Karte.', empty: 'Noch keine Änderungen verzeichnet.',
    workshopForms: { one: 'Werkstatt', other: 'Werkstätten' },
    more: { other: '{n} weitere {w}' },
    kinds: { added: 'Neuer Space', name: 'Name', address: 'Adresse', link: 'Website', style: 'Zielgruppe', weekly: 'Wöchentliches Treffen', workshops: 'Werkstätten', events: 'Kalender', spaceapi: 'Live-Status' },
    ops: { add: 'ergänzt', change: 'geändert', remove: 'entfernt' } },
  fr: { tab: 'nouveau', intro: 'Derniers ajouts et modifications de la carte.', empty: 'Aucune modification enregistrée.',
    workshopForms: { one: 'atelier', other: 'ateliers' },
    more: { one: '{n} {w} supplémentaire', other: '{n} {w} supplémentaires' },
    kinds: { added: 'Nouvel espace', name: 'Nom', address: 'Adresse', link: 'Site web', style: 'Public', weekly: 'Réunion hebdomadaire', workshops: 'Ateliers', events: 'Calendrier', spaceapi: 'Statut en direct' },
    gender: { address: 'f', weekly: 'f', workshops: 'mp' },
    ops: { m: { add: 'ajouté', change: 'modifié', remove: 'supprimé' }, f: { add: 'ajoutée', change: 'modifiée', remove: 'supprimée' }, mp: { add: 'ajoutés', change: 'modifiés', remove: 'supprimés' } } },
  nl: { tab: 'nieuw', intro: 'Laatste toevoegingen en wijzigingen op de kaart.', empty: 'Nog geen wijzigingen vastgelegd.',
    workshopForms: { one: 'werkplaats', other: 'werkplaatsen' },
    more: { other: '{n} extra {w}' },
    kinds: { added: 'Nieuwe space', name: 'Naam', address: 'Adres', link: 'Website', style: 'Doelgroep', weekly: 'Wekelijkse bijeenkomst', workshops: 'Werkplaatsen', events: 'Agenda', spaceapi: 'Live status' },
    ops: { add: 'toegevoegd', change: 'gewijzigd', remove: 'verwijderd' } },
  it: { tab: 'novità', intro: 'Ultime aggiunte e modifiche alla mappa.', empty: 'Nessuna modifica registrata.',
    workshopForms: { one: 'laboratorio', other: 'laboratori' },
    more: { other: '{n} {w} in più' },
    kinds: { added: 'Nuovo spazio', name: 'Nome', address: 'Indirizzo', link: 'Sito web', style: 'Pubblico', weekly: 'Incontro settimanale', workshops: 'Laboratori', events: 'Calendario', spaceapi: 'Stato live' },
    gender: { workshops: 'mp' },
    ops: { m: { add: 'aggiunto', change: 'modificato', remove: 'rimosso' }, f: { add: 'aggiunta', change: 'modificata', remove: 'rimossa' }, mp: { add: 'aggiunti', change: 'modificati', remove: 'rimossi' } } },
  da: { tab: 'nyt', intro: 'Seneste tilføjelser og ændringer på kortet.', empty: 'Ingen ændringer registreret endnu.',
    workshopForms: { one: 'værksted', other: 'værksteder' },
    more: { other: '{n} ekstra {w}' },
    kinds: { added: 'Nyt space', name: 'Navn', address: 'Adresse', link: 'Hjemmeside', style: 'Målgruppe', weekly: 'Ugentligt møde', workshops: 'Værksteder', events: 'Kalender', spaceapi: 'Live-status' },
    ops: { add: 'tilføjet', change: 'ændret', remove: 'fjernet' } },
  uk: { tab: 'нове', intro: 'Останні додавання та зміни на карті.', empty: 'Змін ще не зафіксовано.',
    workshopForms: { one: 'майстерня', few: 'майстерні', many: 'майстерень', other: 'майстерні' },
    more: { one: 'ще {n} {w}', other: 'ще {n} {w}', forms: { one: 'майстерню' } },
    kinds: { added: 'Новий простір', name: 'Назва', address: 'Адреса', link: 'Вебсайт', style: 'Аудиторія', weekly: 'Щотижнева зустріч', workshops: 'Майстерні', events: 'Календар', spaceapi: 'Статус наживо' },
    ops: { add: 'додано', change: 'змінено', remove: 'видалено' } },
};

/** Reihenfolge der Änderungen an einem Space innerhalb einer Zeile */
export const KIND_ORDER = ['added', 'name', 'address', 'link', 'style', 'weekly', 'workshops', 'events', 'spaceapi'];

export const changesText = lang => CHANGES_TEXT[lang] || CHANGES_TEXT.en;

/**
 * Eine Angabe als Textstücke: Bei Werkstatt-Zahlen steht „8 Werkstätten“ in einem Stück (`nowrap` → <span class="nowrap">, kein Umbruch
 * zwischen Zahl und Wort); der Rest („ergänzt“) darf umbrechen.
 * @returns {{ text: string, nowrap?: boolean }[]}
 */
export function changeSegments(entry, lang) {
  const tx = changesText(lang);
  let kind = tx.kinds[entry.k] ?? entry.k;
  let gender = tx.gender?.[entry.k] ?? 'm';
  let counted = false;
  if (entry.k === 'workshops' && entry.n) {   // „3 Werkstätten ergänzt“ / „1 Werkstatt entfernt“
    let cat = 'other';
    try { cat = new Intl.PluralRules(lang).select(entry.n); } catch { /* unbekannte Sprache */ }
    const noun = tx.workshopForms[cat] ?? tx.workshopForms.other;
    kind = `${entry.n} ${noun}`;
    if (entry.more && entry.o === 'add') {   // zu schon vorhandenen Werkstätten: „2 weitere Werkstätten“
      const tpl = tx.more[cat] ?? tx.more.other;
      kind = tpl.replace('{n}', entry.n).replace('{w}', tx.more.forms?.[cat] ?? noun);
    }
    gender = cat === 'one' ? 'm' : 'mp';
    counted = true;
  }
  if (!entry.o) return [{ text: kind }];
  const ops = tx.ops.add ? tx.ops : tx.ops[gender];
  return [{ text: kind, nowrap: counted }, { text: ` ${ops[entry.o] ?? entry.o}` }];
}

/** „Werkstätten ergänzt“ (ohne Trennpunkt); neuer Space nur „Neuer Space“ */
export const changeLabel = (entry, lang) => changeSegments(entry, lang).map(s => s.text).join('');

/** Monatsüberschrift „November 2026“ (Sprache des Nutzers) */
export function monthLabel(ym, lang) {
  const [y, m] = ym.split('-').map(Number);
  try { return new Intl.DateTimeFormat(lang, { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(y, m - 1, 1))); }
  catch { return ym; }
}

/** Tag mit vollem Monatsnamen: „22. November“ */
export function dayLabel(d, lang) {
  const [y, m, day] = d.split('-').map(Number);
  try { return new Intl.DateTimeFormat(lang, { day: 'numeric', month: 'long', timeZone: 'UTC' }).format(new Date(Date.UTC(y, m - 1, day))); }
  catch { return d; }
}

/**
 * Einträge (neueste zuerst) → Monate → Tage → Zeilen. Mehrere Einträge desselben Spaces am selben Tag werden EINE Zeile
 * (`items` nach KIND_ORDER); die Zeilen eines Tages behalten die Reihenfolge der Einträge (nach Space-ID).
 * @returns {{ ym:string, days:{ d:string, rows:{ id:number, items:any[] }[] }[] }[]}
 */
export function groupChanges(entries) {
  const months = [];
  for (const raw of entries) {
    const e = raw.k === 'position' ? { ...raw, k: 'address' } : raw;   // ältere changes.json: Position = Adresse
    const ym = e.d.slice(0, 7);
    let m = months[months.length - 1];
    if (!m || m.ym !== ym) { m = { ym, days: [] }; months.push(m); }
    let day = m.days[m.days.length - 1];
    if (!day || day.d !== e.d) { day = { d: e.d, rows: [] }; m.days.push(day); }
    let row = day.rows.find(r => r.id === e.id);
    if (!row) { row = { id: e.id, items: [] }; day.rows.push(row); }
    if (!row.items.some(i => i.k === e.k && i.o === e.o)) row.items.push(e);   // „Adresse geändert“ nicht doppelt
  }
  for (const m of months) for (const day of m.days) for (const row of day.rows) {
    row.items.sort((a, b) => KIND_ORDER.indexOf(a.k) - KIND_ORDER.indexOf(b.k));
  }
  return months;
}

/** Alle Änderungen einer Zeile, durch Komma getrennt */
export const rowLabel = (row, lang) => row.items.map(e => changeLabel(e, lang)).join(', ');

/**
 * Zeichnet die Liste in `container` (nur textContent/DOM-API, kein innerHTML).
 * @param {HTMLElement} container
 * @param {{d:string,id:number,k:string,o?:string,n?:number,more?:number}[]} entries
 * @param {{ lang:string, locationById: Map<number, any>, onOpen: (loc:any)=>void }} opts
 */
export function renderChanges(container, entries, { lang, locationById, onOpen }) {
  container.replaceChildren();
  const shown = entries.filter(e => locationById.has(e.id));
  if (!shown.length) {
    container.append(Object.assign(document.createElement('p'), { className: 'changes-empty', textContent: changesText(lang).empty }));
    return;
  }
  for (const month of groupChanges(shown)) {
    container.append(Object.assign(document.createElement('h3'), { className: 'embed-h3 changes-month-title', textContent: monthLabel(month.ym, lang) }));
    for (const day of month.days) {
      // Je Tag eine Gruppe: nur das Tagesdatum bleibt (sticky) unter der Reiterleiste stehen, bis die Gruppe endet — dann
      // übernimmt das nächste Datum. „22. Nov.“ nennt den Monat mit, die Monatsüberschrift scrollt normal weg.
      const group = document.createElement('div');
      group.className = 'changes-day-group';
      container.append(group);
      group.append(Object.assign(document.createElement('time'), { className: 'changes-day', dateTime: day.d, textContent: dayLabel(day.d, lang) }));
      const ol = document.createElement('ol');
      ol.className = 'changes-list-day';
      for (const row of day.rows) {
        const loc = locationById.get(row.id);
        const li = document.createElement('li');
        const btn = Object.assign(document.createElement('button'), { type: 'button', className: 'changes-space' });
        // Tür-Symbol (geöffnet) wie im Space-Popover, dann der Name
        const door = Object.assign(document.createElement('i'), { className: 'fas fa-door-open changes-space-icon' });
        door.setAttribute('aria-hidden', 'true');
        btn.append(door, loc.name);
        btn.addEventListener('click', () => onOpen(loc));
        const what = Object.assign(document.createElement('span'), { className: 'changes-what' });
        row.items.forEach((item, i) => {
          if (i) what.append(', ');
          for (const seg of changeSegments(item, lang)) {
            if (seg.nowrap) what.append(Object.assign(document.createElement('span'), { className: 'nowrap', textContent: seg.text }));   // „8 Werkstätten“ nicht trennen
            else what.append(seg.text);
          }
        });
        li.append(btn, what);
        ol.append(li);
      }
      group.append(ol);
    }
  }
}
