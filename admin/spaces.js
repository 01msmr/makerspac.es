// admin/spaces.js — Reiter „Spaces“ der Review-Seite: ein Space = eine Karte mit allen Eigenschaften (adr/009).
// Läuft IM Admin (admin.js: Login/Token, Daten, Toasts, Übernehmen). Schreibt NUR Issues (Label/Body/Status/neu anlegen);
// Daten schreibt ausschließlich der Apply-Workflow (adr/006).
import { REPO, formatEditDate, detectFromText, looksLikeUrl, parseScanComment, problemReason, buildComparison } from './admin-lib.js';
import { WORKSHOP_TYPES } from '../workshop-types.js';
import {
  FIELDS, currentValue, proposalValue, displayValue, isEmptyValue, sameValue, isImportantEmpty, fillRates,
  groupBySpace, buildQueue, planDecision, lockedSpaces, spaceLock, analyzeFreeText, TIME_STEP_MINUTES, clampPaneWidth,
} from './spaces-lib.js';

const $ = id => document.getElementById(id);
const store = {
  get(k, d) { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* privater Modus */ } },
};

/** Vom Admin übergeben: { gh, toast, me: () => ({login, role, canApply})|null, audit(nr, typ), data: () => ({ locations: Map, enrichment }), bumpOk(delta), onChange } */
let ctx = null;
const gh = (...a) => ctx.gh(...a);
const toast = (...a) => ctx.toast(...a);
const me = () => ctx.me?.() ?? null;
const audit = (n, type) => ctx.audit?.(n, type);

const state = {
  rates: {}, bodies: {}, groups: new Map(), queue: [], current: null,
  mode: store.get('spaces-mode', 'all'), later: store.get('spaces-later', []),
  undo: [], busy: false, active: false, loaded: false, claimed: null,
};
Object.defineProperties(state, {
  locations: { get: () => ctx.data().locations },
  enrichment: { get: () => ctx.data().enrichment },
});

async function listIssues(label) {
  const all = [];
  for (let page = 1; page <= 5; page++) {
    const batch = await gh(`/repos/${REPO}/issues?labels=${label}&state=open&per_page=100&page=${page}`);
    all.push(...batch);
    if (batch.length < 100) break;
  }
  return all;
}
const msg = text => { $('sp-msg').textContent = text || ''; };

// ─── In Bearbeitung (Zuweisung) ───────────────────────────────────────────
// Wer einen Space öffnet, wird den offenen Vorschlägen als Bearbeiter zugewiesen; andere Prüfer sehen „in Bearbeitung von @x“
// und der Space rutscht in ihrer Warteschlange nach hinten. Verfällt nach 30 min ohne Änderung (Tab zu), siehe admin-lib lockOf.
function claim(id) {
  const m = me();
  if (!m || state.claimed?.id === id) return;
  const g = state.groups.get(id);
  if (!g || spaceLock(g, m.login)) return;   // andere bearbeiten ihn bereits → nicht mitzeichnen
  const numbers = Object.values(g.proposals).filter(p => !(p.assignees || []).includes(m.login)).map(p => p.number);
  state.claimed = { id, numbers };
  for (const n of numbers) gh(`/repos/${REPO}/issues/${n}/assignees`, { method: 'POST', body: { assignees: [m.login] } }).catch(() => { /* nur Zusatz */ });
}
function release() {
  const c = state.claimed, m = me();
  state.claimed = null;
  if (!c || !m) return;
  for (const n of c.numbers) gh(`/repos/${REPO}/issues/${n}/assignees`, { method: 'DELETE', body: { assignees: [m.login] } }).catch(() => { /* nur Zusatz */ });
}

// ─── Laden ───────────────────────────────────────────────────────────────
async function loadIssues() {
  const [upd, wsd, wkd] = await Promise.all([listIssues('data-update'), listIssues('workshop-data'), listIssues('weekly-data')]);
  const byKind = { workshops: wsd, calendar: upd, spaceapi: upd, weekly: wkd };
  state.bodies = {};
  for (const i of [...upd, ...wsd, ...wkd]) state.bodies[i.number] = i.body || '';
  state.groups = groupBySpace(byKind);
}

function rebuild(keepId = state.current) {
  state.queue = buildQueue(state.groups, state.later, state.mode, lockedSpaces(state.groups, me()?.login));
  state.current = state.queue.includes(keepId) ? keepId : (state.queue[0] ?? null);
}

/** Issues neu laden (Daten: locations/enrichment kommen vom Admin) und anzeigen */
async function reload({ quiet = false, rerender = true } = {}) {
  if (state.busy) return;
  state.busy = true;
  try {
    state.rates = fillRates([...state.locations.values()], state.enrichment);
    await loadIssues();
    state.loaded = true;
    rebuild();
  } catch (err) { toast(`Spaces laden fehlgeschlagen: ${err.message}`, 'no'); }
  finally { state.busy = false; }
  if (state.active && rerender) show();
  if (!quiet) ctx.onChange?.();
}

// ─── Bearbeiten-Auswahl (Radio) ──────────────────────────────────────────
function buildModeBar() {
  const bar = $('sp-mode');
  bar.querySelectorAll('label').forEach(l => l.remove());
  [{ key: 'all', label: 'Alles' }, ...FIELDS].forEach(f => {
    const label = document.createElement('label');
    const input = Object.assign(document.createElement('input'), { type: 'radio', name: 'sp-mode', value: f.key, checked: state.mode === f.key });
    input.addEventListener('change', () => setMode(f.key));
    label.append(input, ` ${f.label}`);
    label.title = 'Pfeiltasten ← →';
    bar.append(label);
  });
  bar.hidden = false;
}
/** ← / →: Alles ⇄ Workshops ⇄ Kalender ⇄ SpaceAPI ⇄ Wöchentliches Treffen ⇄ Gründung — ohne Umbruch (an den Enden passiert nichts) */
function stepMode(step) {
  const keys = ['all', ...FIELDS.map(f => f.key)];
  const next = keys.indexOf(state.mode) + step;
  if (next >= 0 && next < keys.length) setMode(keys[next]);
}
function setMode(mode) {
  state.mode = mode; store.set('spaces-mode', mode);
  const r = document.querySelector(`#sp-mode input[value="${mode}"]`); if (r) r.checked = true;
  rebuild(); show();
}

// ─── Anzeige ─────────────────────────────────────────────────────────────
const svgGlobe = () => {
  const ns = 'http://www.w3.org/2000/svg';
  const s = document.createElementNS(ns, 'svg'); s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('aria-hidden', 'true');
  for (const [tag, attrs] of [['circle', { cx: 12, cy: 12, r: 9 }], ['path', { d: 'M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18' }]]) {
    const e = document.createElementNS(ns, tag); for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v); s.append(e);
  }
  return s;
};
const isHttp = u => /^https?:\/\/\S+$/.test(u || '');

function spaceModel(id = state.current) {
  const loc = state.locations.get(id) ?? { ID: id, name: `ID ${id}` };
  const enr = state.enrichment[String(id)];
  const current = Object.fromEntries(FIELDS.map(f => [f.key, currentValue(f.key, loc, enr)]));
  const proposals = state.groups.get(id)?.proposals ?? {};
  const website = proposals.workshops?.website || proposals.calendar?.website || proposals.weekly?.website || loc.link?.url || '';
  return { id, loc, name: loc.name, website, proposals, current };
}

function renderSources(sp) {
  const box = $('sp-sources'); box.replaceChildren();
  const add = (content, url, title, guess) => {
    if (!isHttp(url)) return;
    const a = Object.assign(document.createElement('a'), { href: url, target: '_blank', rel: 'noopener noreferrer', title: `${title}${guess ? ' (vermutet)' : ''}: ${url} — im Seitenfenster öffnen`, className: `src${guess ? ' guess' : ''}` });
    a.addEventListener('click', e => { if (paneEnabled()) { e.preventDefault(); loadPane(url, title); } });
    if (typeof content === 'string') a.append(content); else a.append(content);
    box.append(a);
  };
  add(svgGlobe(), sp.loc.link?.url, 'Website', false);
  const cal = document.createElement('i'); cal.className = 'fas fa-calendar-day';
  add(cal, sp.current.calendar || sp.proposals.calendar?.events, 'Kalender', !sp.current.calendar);
  add('W', sp.proposals.weekly?.website, 'Wöchentliches Treffen (Quelle)', true);
  const door = document.createElement('i'); door.className = 'fas fa-door-open';
  add(door, sp.current.spaceapi || sp.proposals.spaceapi?.endpoint, 'SpaceAPI', !sp.current.spaceapi);
}

// ─── Belege & Prüfhinweise ───────────────────────────────────────────────
// Zeigt, WARUM ein Wert vorgeschlagen wurde (Fundstellen), warum ein Vorschlag zuvor nicht übernommen wurde (Bot-Kommentar)
// und den Live-Vergleich des SpaceAPI-Endpoints mit unseren Daten. Nur textContent; async-Teile prüfen, ob der Space noch aktuell ist.
const el = (tag, props = {}, ...kids) => { const e = Object.assign(document.createElement(tag), props); e.append(...kids); return e; };
const evBox = (title, ...kids) => { const d = el('details', { open: true }, el('summary', { textContent: title })); d.append(...kids); return d; };

function renderEvidence(sp) {
  const box = $('sp-evidence'); box.replaceChildren();
  const id = state.current, still = () => state.current === id;
  const { workshops: w, weekly, spaceapi, calendar } = sp.proposals;
  if (w?.rows?.length || w?.evidence) {
    const kids = [];
    if (w.rows.length) {
      const t = el('table', { className: 'ev-table' });
      for (const r of w.rows) { const tr = t.insertRow(); for (const v of [r.type, r.confidence, r.keywords]) tr.insertCell().textContent = v; }
      kids.push(t);
    }
    if (w.evidence) kids.push(el('blockquote', { textContent: w.evidence }));
    box.append(evBox('Workshops – Fundstellen', ...kids));
  }
  if (weekly?.evidence?.length) {
    box.append(evBox('Wöchentliches Treffen – Fundstellen', ...weekly.evidence.map(e => el('blockquote', { textContent: `${e.what === 'Gründung' ? 'Vereinsgründung' : e.what} ${e.value} (${e.confidence}): „${e.source}“` }))));
  }
  if (calendar?.confidence) box.append(evBox('Kalender', el('p', { textContent: `Confidence: ${calendar.confidence}` })));
  for (const [label, p] of [['Workshops', w], ['Kalender', calendar], ['SpaceAPI', spaceapi], ['Wöchentliches Treffen', weekly ?? sp.proposals.init]]) {
    if (!p?.problem) continue;
    const reason = el('span', { textContent: 'Grund wird geladen …' });
    box.append(el('div', { className: 'ev-problem' }, el('strong', { textContent: `⚠ ${label}: zuvor nicht übernommen` }), el('br'), reason));
    gh(`/repos/${REPO}/issues/${p.number}/comments?per_page=100`).then(cs => {
      if (still()) reason.textContent = problemReason(cs) || 'Kein Kommentar des Bots gefunden — siehe Issue auf GitHub.';
    }).catch(() => { if (still()) reason.textContent = 'Grund konnte nicht geladen werden.'; });
  }
  if (spaceapi?.endpoint) {
    const t = el('table', { className: 'ev-table' }), hint = el('p', { className: 'ev-hint', textContent: 'Endpoint wird geladen …' });
    const draw = data => {
      t.replaceChildren();
      for (const r of buildComparison(sp.loc, sp.current.spaceapi ? { endpoint: sp.current.spaceapi } : undefined, data, spaceapi.endpoint)) {
        const tr = t.insertRow(); if (r.warn) tr.className = 'warn';
        for (const v of [r.label, r.ours, r.proposed]) tr.insertCell().textContent = v;
      }
    };
    draw(null);
    box.append(evBox('SpaceAPI – Live-Vergleich', t, hint));
    fetch(spaceapi.endpoint, { signal: AbortSignal.timeout(8000) }).then(r => r.json()).then(data => {
      if (!still()) return;
      draw(data);
      hint.textContent = typeof data.space === 'string' ? '' : '⚠ Kein gültiges SpaceAPI-JSON (space fehlt)';
    }).catch(() => { if (still()) hint.textContent = 'Endpoint nicht direkt ladbar (CORS/Timeout/Fehler) — Link oben („Tür“-Symbol) prüfen.'; });
  }
}


// „kein weekly“ (wöchentliches Treffen entfernen) steht zuerst; „–“ = keine Info (nichts ändern) bleibt die Vorauswahl
const WEEKDAYS = [['none', 'kein weekly'], ['', '–'], ['1', 'Montag'], ['2', 'Dienstag'], ['3', 'Mittwoch'], ['4', 'Donnerstag'], ['5', 'Freitag'], ['6', 'Samstag'], ['0', 'Sonntag']];
const dayName = d => WEEKDAYS.find(([v]) => v === d)?.[1] ?? '–';
function currentText(key, v) {
  if (key === 'workshops') return v.length ? v.join(', ') : '';
  if (key === 'weekly') return v.day !== '' && v.time ? `${dayName(v.day)} ${v.time}` : '';
  return v;
}

function buildInputs(key, value) {
  const wrap = document.createElement('div');
  if (key === 'workshops') {
    wrap.className = 'ws-checks';
    for (const type of Object.keys(WORKSHOP_TYPES)) {
      const label = document.createElement('label');
      const cb = Object.assign(document.createElement('input'), { type: 'checkbox', value: type, checked: value.includes(type) });
      label.append(cb, type);
      wrap.append(label);
    }
  } else if (key === 'weekly') {
    wrap.className = 'weekly-in';
    const sel = document.createElement('select'); sel.dataset.f = 'day'; sel.ariaLabel = 'Wochentag';
    for (const [v, l] of WEEKDAYS) sel.append(Object.assign(document.createElement('option'), { value: v, textContent: l }));
    sel.value = value.day;
    // Auswahlliste statt <input type="time">: iOS und Android ignorieren `step` im Zeit-Picker (Minutenrad), eine Liste erzwingt das Raster überall
    const time = document.createElement('select'); time.dataset.f = 'time'; time.ariaLabel = 'Uhrzeit (30-Minuten-Raster)'; time.title = 'Nur volle und halbe Stunden (:00 / :30)';
    time.append(new Option('– Uhrzeit', ''));
    for (let m = 0; m < 24 * 60; m += TIME_STEP_MINUTES) time.append(new Option(`${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`));
    if (value.time && ![...time.options].some(o => o.value === value.time)) time.append(new Option(`${value.time} (außerhalb des Rasters)`, value.time));   // vorhandener Wert bleibt sichtbar; „übernehmen“ verlangt eine Korrektur
    time.value = value.time;
    const line1 = document.createElement('div'); line1.className = 'line'; line1.append(sel, time);
    wrap.append(line1);
  } else if (key === 'init') {
    wrap.className = 'weekly-in';
    const init = Object.assign(document.createElement('input'), { type: 'date', value, min: '1900-01-01', max: new Date().toISOString().slice(0, 10) }); init.dataset.f = 'init'; init.ariaLabel = 'Vereinsgründung';
    wrap.append(init);
  } else {
    const input = Object.assign(document.createElement('input'), { type: 'text', value });
    input.inputMode = 'url'; input.autocomplete = 'off'; input.spellcheck = false;
    wrap.append(input);
  }
  return wrap;
}

/** „kein weekly“: Uhrzeit leeren und sperren (sonst folgt die Sperre der Bearbeiten-Auswahl) */
function syncWeeklyTime(tr) {
  const day = tr.querySelector('[data-f="day"]'), time = tr.querySelector('[data-f="time"]');
  if (!day || !time) return;
  if (day.value === 'none') { time.value = ''; time.disabled = true; } else time.disabled = tr.dataset.off === 'true';
}

function readValue(tr) {
  const key = tr.dataset.key;
  if (key === 'workshops') return [...tr.querySelectorAll('.ws-checks input')].filter(b => b.checked).map(b => b.value);
  if (key === 'weekly') return { day: tr.querySelector('[data-f="day"]').value, time: tr.querySelector('[data-f="time"]').value };
  if (key === 'init') return tr.querySelector('[data-f="init"]').value;
  return tr.querySelector('input[type="text"]').value.trim();
}
function writeValue(tr, v) {
  const key = tr.dataset.key;
  if (key === 'workshops') tr.querySelectorAll('.ws-checks input').forEach(b => { b.checked = v.includes(b.value); });
  else if (key === 'weekly') { tr.querySelector('[data-f="day"]').value = v.day; tr.querySelector('[data-f="time"]').value = v.time; }
  else if (key === 'init') tr.querySelector('[data-f="init"]').value = v;
  else tr.querySelector('input[type="text"]').value = v;
}

/** Eindeutige Optik: genau die Eingaben, die vom aktuellen Stand abweichen, bekommen einen grünen Rahmen (Wochentag/Uhrzeit einzeln) */
function markChanged(tr, sp) {
  const key = tr.dataset.key, cur = sp.current[key], v = readValue(tr);
  const mark = (el, diff) => el?.classList.toggle('chg', diff);
  if (key === 'weekly') {
    for (const f of ['day', 'time']) mark(tr.querySelector(`[data-f="${f}"]`), v[f] !== cur[f]);
  } else if (key === 'init') {
    mark(tr.querySelector('[data-f="init"]'), v !== cur);
  } else if (key === 'workshops') {
    tr.querySelectorAll('.ws-checks label').forEach(l => mark(l, l.querySelector('input').checked !== cur.includes(l.querySelector('input').value)));
  } else {
    mark(tr.querySelector('input[type="text"]'), v !== cur);
  }
}

/** Zeile aktualisieren: geändert? Häkchen-Text, gelbe Lücke */
function updateRow(tr, sp) {
  const key = tr.dataset.key, hasProposal = tr.dataset.proposal === '1';
  if (key === 'weekly') syncWeeklyTime(tr);
  const value = readValue(tr), cb = tr.querySelector('.inc input'), label = tr.querySelector('.inc label'), txt = label.querySelector('span');
  const base = hasProposal ? displayValue(key, sp.proposals[key]) : sp.current[key];
  const changed = !sameValue(key, value, base);
  tr.classList.toggle('differs', changed || (hasProposal && !sameValue(key, displayValue(key, sp.proposals[key]), sp.current[key])));
  markChanged(tr, sp);
  if (hasProposal) {
    const removing = key === 'weekly' && value.day === 'none';
    txt.textContent = !cb.checked ? 'verwerfen' : removing ? 'Weekly wird entfernt' : (key === 'workshops' && !value.length ? 'nichts übernehmen' : 'übernehmen');
    label.classList.toggle('rej', !cb.checked || removing);
  } else {
    const diff = !sameValue(key, value, sp.current[key]);
    label.hidden = !diff;
    if (diff && !tr._wasDiff) cb.checked = true;   // neu angefangene Änderung: Häkchen automatisch an
    tr._wasDiff = diff;
    const removing = key === 'weekly' && value.day === 'none';
    txt.textContent = removing ? 'Weekly wird entfernt' : isEmptyValue(key, value) ? 'entfernen' : 'neu anlegen';
    label.classList.toggle('rej', removing);
    tr.classList.toggle('gap', !diff && isImportantEmpty(key, value, state.rates));
  }
}

function buildRow(f, sp, restore) {
  const tr = document.createElement('tr');
  tr.dataset.key = f.key;
  const p = sp.proposals[f.key];
  tr.dataset.proposal = p ? '1' : '0';
  tr.dataset.number = p ? String(p.number) : '';
  const th = Object.assign(document.createElement('th'), { textContent: f.label });
  const cur = document.createElement('td'); cur.className = 'cur';
  const ct = currentText(f.key, sp.current[f.key]);
  if (ct) cur.textContent = ct; else cur.append(Object.assign(document.createElement('span'), { className: 'none', textContent: '–' }));
  const inp = document.createElement('td'); inp.className = 'inp';
  const initial = restore?.[f.key]?.value ?? (p ? displayValue(f.key, p) : sp.current[f.key]);
  inp.append(buildInputs(f.key, initial));
  if (p) {
    const hint = document.createElement('small'); hint.className = 'row-hint';
    const a = Object.assign(document.createElement('a'), { href: p.url, target: '_blank', rel: 'noopener noreferrer', textContent: `Vorschlag #${p.number} ↗` });
    hint.append(a, p.confidence ? ` · ${p.confidence}` : '');
    inp.append(hint);
  }
  const inc = document.createElement('td'); inc.className = 'inc';
  const label = document.createElement('label');
  const cb = Object.assign(document.createElement('input'), { type: 'checkbox', checked: restore?.[f.key] ? restore[f.key].include : !!p });
  label.append(cb, Object.assign(document.createElement('span'), { textContent: '' }));
  inc.append(label);
  tr.append(th, cur, inp, inc);
  const off = state.mode !== 'all' && state.mode !== f.key;
  tr.dataset.off = String(off);
  tr.querySelectorAll('input, select, textarea, button').forEach(el => { el.disabled = off; });
  if (f.key === 'weekly') syncWeeklyTime(tr);
  tr.addEventListener('input', () => updateRow(tr, sp));
  tr.addEventListener('change', () => updateRow(tr, sp));
  if (!p) { tr._wasDiff = restore?.[f.key] ? true : false; label.hidden = true; }
  updateRow(tr, sp);
  return tr;
}

function show(restore = null) {
  const id = state.current;
  $('sp-act-z').hidden = state.undo.length === 0;
  const pos = state.queue.indexOf(id);
  $('counter').textContent = id == null ? '' : `${pos + 1} / ${state.queue.length}`;
  if (id == null) {
    $('sp-card').hidden = true; $('sp-done').hidden = false;
    $('sp-done').textContent = state.mode === 'all' ? 'Alles geprüft — keine offenen Vorschläge.' : `Keine offenen Vorschläge für „${FIELDS.find(f => f.key === state.mode)?.label}“.`;
    return;
  }
  $('sp-done').hidden = true; $('sp-card').hidden = false;
  if (state.claimed && state.claimed.id !== id) release();
  const sp = spaceModel(id);
  const a = $('sp-link'); a.textContent = `#${id} ${sp.name}`;
  if (isHttp(sp.website)) a.href = sp.website; else a.removeAttribute('href');
  $('sp-edit').href = `/?edit=${id}`;
  const l = sp.loc;
  $('sp-meta').textContent = [l.loc?.city, l.loc?.country, `Stand ${formatEditDate(l.dates?.['space.edited.latest'])}`].filter(Boolean).join(' · ');
  renderSources(sp);
  if (paneEnabled() && isHttp(sp.website)) loadPane(sp.website, 'Webseite');   // Standard: Webseite des Space im Seitenfenster
  renderEvidence(sp);
  $('sp-rows').replaceChildren(...FIELDS.map(f => buildRow(f, sp, restore)));
  $('sp-free').replaceChildren(buildFreeText(sp));
  msg('');
  const lock = spaceLock(state.groups.get(id), me()?.login);
  if (lock) msg(`⚠ @${lock.by} bearbeitet diesen Space gerade (seit ${lock.minutes} min) — abstimmen oder „später“ nehmen.`);
  else claim(id);
  window.scrollTo?.(0, 0);
}

// ─── Seitenfenster (Webseite zum Space) ──────────────────────────────────
// Links der Karte (ID + Name, Quell-Icons) öffnen die Seite in einem Seitenfenster rechts, nicht in einem neuen Tab. Auf Touch/schmalen
// Fenstern (< 1100 px) gibt es kein Seitenfenster: dort bleibt es ein neuer Tab. Trenner ziehbar (oder ← → bei Fokus), Breite wird gemerkt.
const paneEnabled = () => !window.matchMedia?.('(pointer: coarse), (max-width: 1099px)').matches;
let paneUrl = '';
function loadPane(url, title = '') {
  if (!isHttp(url)) return;
  paneUrl = url;
  $('sp-frame').src = url;
  $('sp-pane-title').textContent = `${title ? title + ': ' : ''}${url.replace(/^https?:\/\/(www\.)?/, '').slice(0, 60)}`;
  document.querySelectorAll('#sp-sources .src').forEach(a => a.setAttribute('aria-pressed', String(a.href === url)));
}
const setPaneWidth = px => { const w = clampPaneWidth(px, $('sp-layout').clientWidth); $('sp-layout').style.setProperty('--sp-pane-w', `${w}px`); store.set('spaces-pane-w', w); };
function initPane() {
  const saved = store.get('spaces-pane-w', 0);
  if (saved) $('sp-layout').style.setProperty('--sp-pane-w', `${clampPaneWidth(saved, $('sp-layout').clientWidth)}px`);
  const split = $('sp-split');
  split.addEventListener('pointerdown', e => {
    e.preventDefault(); split.setPointerCapture(e.pointerId); $('sp-layout').classList.add('dragging');
    const move = ev => { const box = $('sp-layout').getBoundingClientRect(); setPaneWidth(box.right - ev.clientX - split.offsetWidth / 2); };
    const up = () => { $('sp-layout').classList.remove('dragging'); split.removeEventListener('pointermove', move); split.removeEventListener('pointerup', up); split.removeEventListener('pointercancel', up); };
    split.addEventListener('pointermove', move); split.addEventListener('pointerup', up); split.addEventListener('pointercancel', up);
  });
  split.addEventListener('keydown', e => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault(); e.stopPropagation();
    setPaneWidth($('sp-pane').offsetWidth + (e.key === 'ArrowLeft' ? 24 : -24));
  });
  $('sp-pane-tab').addEventListener('click', () => { if (paneUrl) window.open(paneUrl, '_blank', 'noopener'); });
}

// ─── Freitext (alle Eigenschaften) ───────────────────────────────────────
// Text/URLs einfügen → beim Verlassen des Feldes ausgewertet: Workshops angehakt, Wöchentliches Treffen (30-min-Raster) + Gründung gesetzt, Kalender-/SpaceAPI-URL
// erkannt (spaces-lib analyzeFreeText). Eine einzelne Website-URL löst per Server-Scan die Workshop-Erkennung aus (braucht ein
// Workshop-Issue zum Kommentieren). Die Zwischenablage wird nur über den Knopf „Einfügen“ gelesen.
const SCAN_POLL_MS = 5000, SCAN_MAX_POLLS = 36;   // ≈ 3 min
const sleep = ms => new Promise(r => setTimeout(r, ms));

function setIndicator(box, stateName, text, chips = []) {
  box.dataset.state = stateName;
  box.replaceChildren(text);
  for (const t of chips) box.append(Object.assign(document.createElement('span'), { className: 'chip', textContent: t }));
}
const rowEl = key => $('sp-rows').querySelector(`tr[data-key="${key}"]`);
const rowOn = tr => !!tr && tr.dataset.off !== 'true';
/** Zeile neu bewerten (geändert? Häkchen-Text, Auto-Häkchen) */
const touch = tr => tr.dispatchEvent(new Event('change'));

function checkTypes(types) {
  const tr = rowEl('workshops');
  if (!rowOn(tr)) return false;
  let any = false;
  for (const box of tr.querySelectorAll('.ws-checks input')) if (types.includes(box.value) && !box.checked) { box.checked = true; any = true; }
  if (any) touch(tr);
  return types.length > 0;
}

/** Erkanntes in die Zeilen schreiben. onlyEmpty: nur leere Felder (Zwischenablage-Automatik), sonst überschreiben (bewusstes Einfügen/Tippen). */
function applyAnalysis(a, { onlyEmpty = false } = {}) {
  const done = [];
  if (a.workshops.length && checkTypes(a.workshops)) done.push(...a.workshops);   // jeder erkannte Workshop als eigene Pille (nur der Name)
  const wk = rowEl('weekly');
  if (rowOn(wk) && a.weekly) {
    const day = wk.querySelector('[data-f="day"]'), time = wk.querySelector('[data-f="time"]');
    if (!(onlyEmpty && (day.value || time.value))) { day.value = a.weekly.day; time.value = a.weekly.time; done.push(`Wöchentliches Treffen: ${dayName(a.weekly.day)} ${a.weekly.time}${a.weekly.confidence === 'medium' ? ' (unsicher)' : ''}`); touch(wk); }
  }
  const ini = rowEl('init');
  if (rowOn(ini) && a.init) {
    const init = ini.querySelector('[data-f="init"]');
    if (!(onlyEmpty && init.value)) { init.value = a.init.value; done.push(`Vereinsgründung: ${a.init.value}${a.init.confidence === 'medium' ? ' (unsicher)' : ''}`); touch(ini); }
  }
  for (const [key, label] of [['calendar', 'Kalender'], ['spaceapi', 'SpaceAPI']]) {
    const tr = rowEl(key), url = a[key];
    if (!url || !rowOn(tr)) continue;
    const input = tr.querySelector('input[type="text"]');
    if (onlyEmpty && input.value.trim()) continue;
    input.value = url; touch(tr); done.push(`${label}: ${url.length > 48 ? url.slice(0, 46) + '…' : url}`);
  }
  return done;
}

function buildFreeText(sp) {
  const wrap = document.createElement('div'); wrap.className = 'ws-free';
  const label = document.createElement('label'); label.textContent = 'Freitext — Text oder URLs einfügen; erkannt werden Workshops, wöchentliches Treffen, Vereinsgründung, Kalender, SpaceAPI';
  const area = document.createElement('textarea');
  area.rows = 3; area.spellcheck = false; area.id = `ws-free-${sp.id}`; label.htmlFor = area.id;
  const paste = document.createElement('button'); paste.type = 'button'; paste.textContent = 'Einfügen'; paste.className = 'paste-btn';
  paste.title = 'Zwischenablage ins Feld einfügen und auswerten';
  const grid = document.createElement('div'); grid.className = 'free-grid'; grid.append(area, paste);
  const detected = document.createElement('p'); detected.className = 'ws-detected'; detected.dataset.state = 'idle'; detected.setAttribute('role', 'status');
  const row = document.createElement('div'); row.className = 'scan-row';
  const btn = document.createElement('button'); btn.type = 'button'; btn.textContent = 'Website auslesen (Server)';
  const target = document.createElement('small'); target.className = 'scan-target';
  const issue = sp.proposals.workshops?.number;
  if (!issue) btn.title = 'Der Server-Scan kommentiert ein Workshop-Issue — für diesen Space gibt es keins (Text einfügen geht trotzdem).';
  row.append(btn, target);
  const hint = document.createElement('small'); hint.className = 'free-hint'; hint.textContent = 'Wird beim Verlassen des Feldes ausgewertet.';
  wrap.append(label, grid, hint, detected, row);

  const scanUrl = () => { const v = area.value.trim(); return looksLikeUrl(v) ? v : sp.website; };
  const refreshTarget = () => {
    const v = area.value.trim(), url = scanUrl();
    target.textContent = url ? `Scan-Ziel: ${url}${v && !looksLikeUrl(v) ? ' — der eingefügte Text wird dafür nicht verwendet (er wird direkt ausgewertet)' : ''}` : 'Kein Scan-Ziel: keine Website bekannt — URL einfügen.';
    btn.disabled = !issue || !url || !rowOn(rowEl('workshops'));
  };
  const evaluate = (source = '', opts = {}) => {
    refreshTarget();
    const v = area.value;
    if (!v.trim()) { setIndicator(detected, 'idle', ''); return; }
    const a = analyzeFreeText(v);
    const done = applyAnalysis(a, opts);
    const notes = a.notes.length ? ` · ${a.notes.join(' · ')}` : '';
    if (done.length) { setIndicator(detected, 'ok', `✓ Text${source} ausgewertet (${v.length} Zeichen) — übernommen:${notes}`, done); return; }
    if (looksLikeUrl(v.trim())) { setIndicator(detected, 'info', `URL erkannt${source} (kein Kalender/SpaceAPI) — mit „Website auslesen (Server)“ die Workshops serverseitig auslesen.`); return; }
    setIndicator(detected, 'none', `✓ Text${source} ausgewertet (${v.length} Zeichen) — nichts erkannt${notes}`);
  };
  // Der Inhalt wird erst beim VERLASSEN des Feldes ausgewertet (nie beim Tippen/Einfügen, nie automatisch aus der Zwischenablage).
  area.addEventListener('blur', () => evaluate());
  queueMicrotask(refreshTarget);

  // „Einfügen“: liest die Zwischenablage ausdrücklich per Klick, setzt den Text ins Feld und wertet ihn sofort aus
  paste.addEventListener('click', async () => {
    try {
      const t = (await navigator.clipboard.readText()).trim();
      if (!t) { setIndicator(detected, 'none', 'Die Zwischenablage ist leer.'); return; }
      area.value = area.value.trim() ? `${area.value.trimEnd()}\n${t}` : t;
      evaluate(' aus Zwischenablage');
    } catch { setIndicator(detected, 'error', 'Zwischenablage nicht lesbar (Berechtigung?) — Text im Feld mit Strg/Cmd+V einfügen und das Feld verlassen.'); }
  });

  btn.addEventListener('click', async () => {
    const url = scanUrl();
    if (!url || !issue) return;
    const scanId = [...crypto.getRandomValues(new Uint8Array(4))].map(b => b.toString(16).padStart(2, '0')).join('');
    btn.disabled = true; btn.textContent = 'Scan läuft …';
    const t0 = Date.now(), forSpace = sp.id;
    const timer = setInterval(() => setIndicator(detected, 'working', `⏳ Scan läuft für ${url} … ${Math.round((Date.now() - t0) / 1000)} s (meist 30–60 s)`), 1000);
    const alive = () => state.current === forSpace;
    try {
      await gh(`/repos/${REPO}/actions/workflows/scan-workshop-url.yml/dispatches`, { method: 'POST', body: { ref: 'main', inputs: { url, issue: String(issue), scan_id: scanId } } });
      for (let i = 0; i < SCAN_MAX_POLLS; i++) {
        await sleep(SCAN_POLL_MS);
        if (!alive()) return;
        const comments = await gh(`/repos/${REPO}/issues/${issue}/comments?per_page=100`);
        for (const c of comments) {
          const r = parseScanComment(c.body || '', scanId);
          if (!r) continue;
          gh(`/repos/${REPO}/issues/comments/${c.id}`, { method: 'DELETE' }).catch(() => { /* Kommentar bleibt, harmlos */ });
          if (r.error) { setIndicator(detected, 'error', `✗ Scan fehlgeschlagen: ${r.error}`); toast(`Scan fehlgeschlagen: ${r.error}`, 'no'); return; }
          checkTypes(r.types);
          toast(r.types.length ? `Scan: ${r.types.join(', ')} erkannt` : 'Scan: nichts erkannt', r.types.length ? 'ok' : 'warn');
          setIndicator(detected, r.types.length ? 'ok' : 'none', r.types.length ? `✓ Scan fertig (${r.pages} Seite(n), ${Math.round((Date.now() - t0) / 1000)} s) — ${r.types.length} erkannt und angehakt (bitte prüfen):` : `✓ Scan fertig (${r.pages} Seite(n)) — nichts erkannt`, r.types);
          return;
        }
      }
      setIndicator(detected, 'error', '✗ Scan hat nicht rechtzeitig geantwortet — Run unter GitHub → Actions → „Scan Workshop URL“ prüfen.');
    } catch (err) {
      setIndicator(detected, 'error', `✗ Fehler: ${err.message}`);
    } finally {
      clearInterval(timer); btn.textContent = 'Website auslesen (Server)'; refreshTarget();
    }
  });
  return wrap;
}

// ─── Entscheiden ─────────────────────────────────────────────────────────
function readRows() {
  return [...$('sp-rows').querySelectorAll('tr')].map(tr => ({
    key: tr.dataset.key, enabled: tr.dataset.off !== 'true',
    include: tr.querySelector('.inc input').checked && !(tr.dataset.proposal !== '1' && tr.querySelector('.inc label').hidden),
    value: readValue(tr),
  }));
}
const snapshot = () => Object.fromEntries(readRows().map(r => [r.key, { include: r.include, value: r.value }]));

async function execute(a) {
  const n = a.number;
  if (a.type === 'ok') {
    if (a.body) await gh(`/repos/${REPO}/issues/${n}`, { method: 'PATCH', body: { body: a.body } });
    await gh(`/repos/${REPO}/issues/${n}/labels`, { method: 'POST', body: { labels: ['ok'] } });
    audit(n, a.body ? 'adjust' : 'ok');
  } else if (a.type === 'reject') {
    await gh(`/repos/${REPO}/issues/${n}`, { method: 'PATCH', body: { state: 'closed', state_reason: 'not_planned' } });
    audit(n, 'reject');
  } else {
    const res = await gh(`/repos/${REPO}/issues`, { method: 'POST', body: { title: a.title, body: a.body, labels: a.labels } });
    a.createdNumber = res.number;
    audit(res.number, 'create');
  }
}

async function decide(kind) {
  if (state.busy || state.current == null) return;
  const sp = spaceModel();
  const stale = [...$('sp-rows').querySelectorAll('tr')].some(tr => tr.dataset.number !== String(sp.proposals[tr.dataset.key]?.number ?? ''));
  if (stale) { msg('Die Vorschläge zu diesem Space haben sich inzwischen geändert — bitte mit ↻ neu laden (Eingaben gehen dabei verloren).'); return; }
  let rows = readRows();
  if (kind === 'reject') rows = rows.map(r => ({ ...r, include: false }));
  const { actions, errors } = planDecision(sp, rows, state.bodies);
  if (errors.length) { msg(errors.join(' · ')); toast(errors[0], 'warn'); return; }
  if (!actions.length) { msg('Nichts zu entscheiden — „später“ nutzen oder die Bearbeiten-Auswahl ändern.'); return; }
  state.busy = true;
  const snap = snapshot(), done = [];
  try {
    for (const a of actions) { msg(`Schreibe ${a.key} …`); await execute(a); done.push(a); }
  } catch (err) {
    state.busy = false;
    if (done.length) state.undo.push({ spaceId: sp.id, form: snap, records: done });
    msg(`Fehler: ${err.message}`); toast(`Fehler: ${err.message}${done.length ? ` — ${done.length} Aktion(en) schon ausgeführt (Rückgängig möglich)` : ''}`, 'no');
    show(snap); return;
  }
  release();
  state.undo.push({ spaceId: sp.id, form: snap, records: done, name: sp.name });
  if (state.undo.length > 12) state.undo.shift();
  const g = state.groups.get(sp.id);
  for (const a of done) if (g && a.number) for (const k of Object.keys(g.proposals)) if (g.proposals[k].number === a.number) delete g.proposals[k];   // (altes kombiniertes Issue hängt an Weekly UND Gründung)
  ctx.bumpOk(done.filter(a => a.type !== 'reject').length);
  const count = t => done.filter(a => a.type === t).length;
  const next = state.queue[state.queue.indexOf(sp.id) + 1];
  state.busy = false;
  rebuild(next);
  toast(`${sp.name}: ${[count('ok') && `${count('ok')} übernommen`, count('create') && `${count('create')} neu`, count('reject') && `${count('reject')} verworfen`].filter(Boolean).join(', ')}`, 'ok', { withUndo: true, onUndo: undo });
  ctx.onChange?.();
  show();
}

function later() {
  if (state.current == null) return;
  release();
  state.later = [...state.later.filter(i => i !== state.current), state.current]; store.set('spaces-later', state.later);
  const next = state.queue[state.queue.indexOf(state.current) + 1];
  rebuild(next); show();
  toast('Space ans Ende der Warteschlange verschoben', 'info');
}

async function revert(rec) {
  const n = rec.number ?? rec.createdNumber;
  if (!n) return null;
  const issue = await gh(`/repos/${REPO}/issues/${n}`);
  audit(n, 'undo');
  if (rec.type === 'create') {
    if (issue.state === 'open') await gh(`/repos/${REPO}/issues/${n}`, { method: 'PATCH', body: { state: 'closed', state_reason: 'not_planned' } });
    return null;
  }
  if (rec.type === 'ok') {
    if (issue.state === 'closed') return `#${n} wurde schon übernommen`;
    try { await gh(`/repos/${REPO}/issues/${n}/labels/ok`, { method: 'DELETE' }); } catch (e) { if (e.status !== 404) throw e; }
    if (rec.prevBody !== undefined && rec.body) await gh(`/repos/${REPO}/issues/${n}`, { method: 'PATCH', body: { body: rec.prevBody } });
    return null;
  }
  if (issue.state === 'closed') {
    if (issue.state_reason === 'completed') return `#${n} wurde schon übernommen`;
    await gh(`/repos/${REPO}/issues/${n}`, { method: 'PATCH', body: { state: 'open' } });
  }
  return null;
}

/** Rückgängig: GitHub-Stand zurücksetzen und den Space MIT allen zuletzt gesetzten Häkchen/Werten wieder öffnen */
async function undo() {
  const entry = state.undo.pop();
  if (!entry || state.busy) return;
  state.busy = true;
  const warnings = [];
  try {
    for (const rec of [...entry.records].reverse()) { const w = await revert(rec); if (w) warnings.push(w); }
    await loadIssues();
  } catch (err) {
    state.busy = false; state.undo.push(entry);
    toast(`Rückgängig fehlgeschlagen: ${err.message}`, 'no'); return;
  }
  state.busy = false;
  ctx.bumpOk(-entry.records.filter(a => a.type !== 'reject').length);
  state.mode = 'all'; store.set('spaces-mode', 'all'); buildModeBar();
  state.queue = buildQueue(state.groups, state.later, 'all');
  if (!state.queue.includes(entry.spaceId)) state.queue.unshift(entry.spaceId);
  state.current = entry.spaceId;
  show(entry.form);
  toast(warnings.length ? `Rückgängig mit Hinweis: ${warnings.join('; ')}` : `${entry.name ?? '#' + entry.spaceId}: zurückgesetzt — Eingaben wiederhergestellt`, warnings.length ? 'warn' : 'info');
}


// ─── Aktivieren / Deaktivieren (Reiter) ─────────────────────────────────
function onKey(e) {
  if (!state.active || e.ctrlKey || e.metaKey || e.altKey) return;
  if (/^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName) || e.target.closest?.('#sp-split')) return;
  const k = e.key.toLowerCase();
  if (k === 'y') decide('ok');
  else if (k === 'n') decide('reject');
  else if (k === 'ä') later();
  else if (k === 'z') undo();
  else if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') stepMode(e.key === 'ArrowRight' ? 1 : -1);
  else return;
  e.preventDefault();
}
// Tasten: y/n/ä/z + ←/→ (Bearbeiten-Auswahl durchschalten). Niemals e l w a s d (Vivaldi-Direktkürzel) und keine Ziffern (Browser: Zoom/Tab-Wechsel)

/** Reiter geöffnet: Ansicht zeigen (beim ersten Mal Issues laden) */
export async function activate() {
  state.active = true;
  $('spaces-view').hidden = false;
  buildModeBar();
  if (!state.loaded) { $('sp-done').hidden = false; $('sp-done').textContent = 'Lade …'; $('sp-card').hidden = true; await reload({ quiet: true }); }
  else { rebuild(); show(); reload({ quiet: true, rerender: false }); }   // still nachladen: Formular bleibt, Pläne nutzen frische Bodys
  ctx.onChange?.();
}
export function deactivate() { state.active = false; release(); $('spaces-view').hidden = true; if (paneUrl) { $('sp-frame').src = 'about:blank'; paneUrl = ''; } }
/** Anzahl Spaces mit offenen Vorschlägen (Zähler am Reiter) */
export const openCount = () => buildQueue(state.groups, [], 'all').length;
export { reload };

export function initSpaces(context) {
  ctx = context;
  $('sp-act-y').addEventListener('click', () => decide('ok'));
  $('sp-act-n').addEventListener('click', () => decide('reject'));
  $('sp-act-l').addEventListener('click', later);
  $('sp-act-z').addEventListener('click', undo);
  document.addEventListener('keydown', onKey);
  initPane();
}
