// admin/spaces.js — Space-Review: ein Space = eine Karte mit allen Eigenschaften (adr/009).
// Schreibt NUR Issues (Label/Body/Status/neu anlegen); Daten schreibt ausschließlich der Apply-Workflow (adr/006).
import { REPO, formatEditDate } from './admin-lib.js';
import { applyCssColours } from '../colours.js';
import { WORKSHOP_TYPES } from '../workshop-types.js';
import {
  FIELDS, currentValue, proposalValue, isEmptyValue, sameValue, isImportantEmpty, fillRates,
  groupBySpace, buildQueue, planDecision,
} from './spaces-lib.js';

applyCssColours();
window.matchMedia?.('(prefers-color-scheme: dark)').addEventListener?.('change', applyCssColours);

const API = 'https://api.github.com';
const APPLY_WORKFLOW = 'apply-all-issues.yml';
const $ = id => document.getElementById(id);
const store = {
  get(k, d) { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* privater Modus */ } },
};

let token = '';
try { token = localStorage.getItem('admin-pat') || ''; } catch { /* privater Modus */ }

const state = {
  locations: new Map(), enrichment: {}, rates: {}, sha: '', dataAt: 0,
  bodies: {}, groups: new Map(), queue: [], current: null,
  mode: store.get('spaces-mode', 'all'), later: store.get('spaces-later', []),
  undo: [], okTotal: 0, busy: false, pending: null,
};

// ─── GitHub ──────────────────────────────────────────────────────────────
async function gh(path, { method = 'GET', body } = {}) {
  const res = await fetch(`${API}${path}`, {
    method, cache: 'no-store',
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 401) { logout(); throw new Error('Token ungültig oder abgelaufen'); }
  if (!res.ok) { const e = new Error(`GitHub ${res.status}: ${(await res.text()).slice(0, 160)}`); e.status = res.status; throw e; }
  return res.status === 204 ? null : res.json();
}
async function ghFile(file) {
  const res = await fetch(`${API}/repos/${REPO}/contents/${file}?ref=main`, { cache: 'no-store', headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github.raw+json' } });
  if (res.status === 401) { logout(); throw new Error('Token ungültig oder abgelaufen'); }
  if (!res.ok) throw new Error(`GitHub ${res.status} (${file})`);
  return JSON.parse(await res.text());
}
async function listIssues(label) {
  const all = [];
  for (let page = 1; page <= 5; page++) {
    const batch = await gh(`/repos/${REPO}/issues?labels=${label}&state=open&per_page=100&page=${page}`);
    all.push(...batch);
    if (batch.length < 100) break;
  }
  return all;
}

// ─── Toasts ──────────────────────────────────────────────────────────────
function toast(message, tone = 'info', { withUndo = false } = {}) {
  const box = $('toasts');
  const t = document.createElement('div');
  t.className = 'toast'; t.dataset.tone = tone;
  t.append(Object.assign(document.createElement('span'), { textContent: message }));
  if (withUndo) {
    const b = document.createElement('button');
    b.type = 'button'; b.textContent = 'Rückgängig';
    b.addEventListener('click', () => { t.remove(); undo(); });
    t.append(b);
  }
  box.append(t);
  while (box.children.length > 4) box.firstElementChild.remove();
  setTimeout(() => t.remove(), withUndo ? 9000 : 5000);
}
const msg = text => { $('sp-msg').textContent = text || ''; };

// ─── Laden ───────────────────────────────────────────────────────────────
async function loadIssues() {
  const [upd, wsd, wkd] = await Promise.all([listIssues('data-update'), listIssues('workshop-data'), listIssues('weekly-data')]);
  const byKind = { workshops: wsd, calendar: upd, spaceapi: upd, weekly: wkd };
  state.bodies = {};
  for (const i of [...upd, ...wsd, ...wkd]) state.bodies[i.number] = i.body || '';
  state.groups = groupBySpace(byKind);
  state.okTotal = [...state.groups.values()].reduce((n, g) => n + g.okCount, 0);
}

async function loadData() {
  const [branch, locs, enr] = await Promise.all([gh(`/repos/${REPO}/branches/main`), ghFile('locations.json'), ghFile('loc-enrichment.json')]);
  state.locations = new Map(locs.map(l => [l.ID, l]));
  state.enrichment = enr;
  state.rates = fillRates(locs, enr);
  state.sha = branch.commit.sha.slice(0, 7);
  state.dataAt = Date.now();
  $('data-stand').textContent = `Daten: ${new Date().toTimeString().slice(0, 8)} · ${state.sha}`;
}

function rebuild(keepId = state.current) {
  state.queue = buildQueue(state.groups, state.later, state.mode);
  state.current = state.queue.includes(keepId) ? keepId : (state.queue[0] ?? null);
}

async function refresh({ manual = false } = {}) {
  if (state.busy || !token) return;
  state.busy = true;
  try {
    await Promise.all([loadData(), loadIssues()]);
    rebuild();
    show();
    if (manual) toast('Daten und Liste sind aktuell', 'ok');
  } catch (err) { toast(`Aktualisieren fehlgeschlagen: ${err.message}`, 'no'); }
  finally { state.busy = false; }
}

async function start() {
  $('login').hidden = true;
  for (const id of ['refresh', 'sp-logout', 'sp-logout2']) $(id).hidden = false;
  buildModeBar();
  await refresh();
}

function logout() {
  token = '';
  try { localStorage.removeItem('admin-pat'); } catch { /* ignore */ }
  for (const id of ['card', 'done', 'refresh', 'sp-logout', 'sp-logout2', 'apply', 'mode']) $(id).hidden = true;
  $('counter').textContent = ''; $('data-stand').textContent = '';
  $('login').hidden = false;
}
$('sp-logout').addEventListener('click', logout);
$('sp-logout2').addEventListener('click', logout);
$('refresh').addEventListener('click', () => refresh({ manual: true }));

// ─── Bearbeiten-Auswahl (Radio) ──────────────────────────────────────────
function buildModeBar() {
  const bar = $('mode');
  bar.querySelectorAll('label').forEach(l => l.remove());
  [{ key: 'all', label: 'Alles' }, ...FIELDS].forEach(f => {
    const label = document.createElement('label');
    const input = Object.assign(document.createElement('input'), { type: 'radio', name: 'mode', value: f.key, checked: state.mode === f.key });
    input.addEventListener('change', () => setMode(f.key));
    label.append(input, ` ${f.label}`);
    label.title = 'Pfeiltasten ← →';
    bar.append(label);
  });
  bar.hidden = false;
}
/** ← / →: Alles ⇄ Workshops ⇄ Kalender ⇄ SpaceAPI ⇄ Treffen — ohne Umbruch (an den Enden passiert nichts) */
function stepMode(step) {
  const keys = ['all', ...FIELDS.map(f => f.key)];
  const next = keys.indexOf(state.mode) + step;
  if (next >= 0 && next < keys.length) setMode(keys[next]);
}
function setMode(mode) {
  state.mode = mode; store.set('spaces-mode', mode);
  const r = document.querySelector(`#mode input[value="${mode}"]`); if (r) r.checked = true;
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
    const a = Object.assign(document.createElement('a'), { href: url, target: '_blank', rel: 'noopener noreferrer', title: `${title}${guess ? ' (vermutet)' : ''}: ${url}`, className: `src${guess ? ' guess' : ''}` });
    if (typeof content === 'string') a.append(content); else a.append(content);
    box.append(a);
  };
  add(svgGlobe(), sp.loc.link?.url, 'Website', false);
  const cal = document.createElement('i'); cal.className = 'fas fa-calendar-day';
  add(cal, sp.current.calendar || sp.proposals.calendar?.events, 'Kalender', !sp.current.calendar);
  add('W', sp.proposals.weekly?.website, 'Treffen (Quelle)', true);
  const door = document.createElement('i'); door.className = 'fas fa-door-open';
  add(door, sp.current.spaceapi || sp.proposals.spaceapi?.endpoint, 'SpaceAPI', !sp.current.spaceapi);
}

const WEEKDAYS = [['', '–'], ['1', 'Montag'], ['2', 'Dienstag'], ['3', 'Mittwoch'], ['4', 'Donnerstag'], ['5', 'Freitag'], ['6', 'Samstag'], ['0', 'Sonntag']];
const dayName = d => WEEKDAYS.find(([v]) => v === d)?.[1] ?? '–';
function currentText(key, v) {
  if (key === 'workshops') return v.length ? v.join(', ') : '';
  if (key === 'weekly') return [v.day !== '' && v.time ? `${dayName(v.day)} ${v.time}` : '', v.init ? `gegr. ${v.init}` : ''].filter(Boolean).join(' · ');
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
    const time = Object.assign(document.createElement('input'), { type: 'time', value: value.time }); time.dataset.f = 'time'; time.ariaLabel = 'Uhrzeit';
    const init = Object.assign(document.createElement('input'), { type: 'date', value: value.init, min: '1900-01-01', max: new Date().toISOString().slice(0, 10) }); init.dataset.f = 'init'; init.ariaLabel = 'Gegründet';
    const lbl = document.createElement('small'); lbl.textContent = 'gegründet';
    wrap.append(sel, time, lbl, init);
  } else {
    const input = Object.assign(document.createElement('input'), { type: 'text', value, placeholder: key === 'spaceapi' ? 'https://… (SpaceAPI-Endpoint)' : 'https://… (Kalender-Link)' });
    input.inputMode = 'url'; input.autocomplete = 'off'; input.spellcheck = false;
    wrap.append(input);
  }
  return wrap;
}

function readValue(tr) {
  const key = tr.dataset.key;
  if (key === 'workshops') return [...tr.querySelectorAll('.ws-checks input')].filter(b => b.checked).map(b => b.value);
  if (key === 'weekly') return { day: tr.querySelector('[data-f="day"]').value, time: tr.querySelector('[data-f="time"]').value, init: tr.querySelector('[data-f="init"]').value };
  return tr.querySelector('input[type="text"]').value.trim();
}
function writeValue(tr, v) {
  const key = tr.dataset.key;
  if (key === 'workshops') tr.querySelectorAll('.ws-checks input').forEach(b => { b.checked = v.includes(b.value); });
  else if (key === 'weekly') { tr.querySelector('[data-f="day"]').value = v.day; tr.querySelector('[data-f="time"]').value = v.time; tr.querySelector('[data-f="init"]').value = v.init; }
  else tr.querySelector('input[type="text"]').value = v;
}

/** Zeile aktualisieren: geändert? Häkchen-Text, gelbe Lücke */
function updateRow(tr, sp) {
  const key = tr.dataset.key, hasProposal = tr.dataset.proposal === '1';
  const value = readValue(tr), cb = tr.querySelector('.inc input'), label = tr.querySelector('.inc label'), txt = label.querySelector('span');
  const base = hasProposal ? proposalValue(key, sp.proposals[key]) : sp.current[key];
  const changed = !sameValue(key, value, base);
  tr.classList.toggle('differs', changed || (hasProposal && !sameValue(key, proposalValue(key, sp.proposals[key]), sp.current[key])));
  if (hasProposal) {
    txt.textContent = cb.checked ? (key === 'workshops' && !value.length ? 'nichts übernehmen' : 'übernehmen') : 'verwerfen';
    label.classList.toggle('rej', !cb.checked);
  } else {
    const diff = !sameValue(key, value, sp.current[key]);
    label.hidden = !diff;
    if (diff && !tr._wasDiff) cb.checked = true;   // neu angefangene Änderung: Häkchen automatisch an
    tr._wasDiff = diff;
    txt.textContent = isEmptyValue(key, value) ? 'entfernen' : 'neu anlegen';
    tr.classList.toggle('gap', !diff && isImportantEmpty(key, value, state.rates));
  }
}

function buildRow(f, sp, restore) {
  const tr = document.createElement('tr');
  tr.dataset.key = f.key;
  const p = sp.proposals[f.key];
  tr.dataset.proposal = p ? '1' : '0';
  const th = Object.assign(document.createElement('th'), { textContent: f.label });
  const cur = document.createElement('td'); cur.className = 'cur';
  const ct = currentText(f.key, sp.current[f.key]);
  if (ct) cur.textContent = ct; else cur.append(Object.assign(document.createElement('span'), { className: 'none', textContent: '–' }));
  const inp = document.createElement('td'); inp.className = 'inp';
  const initial = restore?.[f.key]?.value ?? (p ? proposalValue(f.key, p) : sp.current[f.key]);
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
  tr.querySelectorAll('input, select').forEach(el => { el.disabled = off; });
  tr.addEventListener('input', () => updateRow(tr, sp));
  tr.addEventListener('change', () => updateRow(tr, sp));
  if (!p) { tr._wasDiff = restore?.[f.key] ? true : false; label.hidden = true; }
  updateRow(tr, sp);
  return tr;
}

function show(restore = null) {
  const id = state.current;
  const total = state.okTotal;
  $('apply').hidden = total === 0;
  $('apply').textContent = `Übernehmen (${total})`;
  $('apply').title = 'Übernimmt alle ok-Vorschläge aller Arten in einem Lauf (1 Commit, 1 Deploy). Automatisch bei 10 Vorschlägen oder 1 h ohne neuen ok-Vorschlag (Cron).';
  $('act-z').hidden = state.undo.length === 0;
  const pos = state.queue.indexOf(id);
  $('counter').textContent = id == null ? '' : `${pos + 1} / ${state.queue.length}`;
  if (id == null) {
    $('card').hidden = true; $('done').hidden = false;
    $('done').textContent = state.mode === 'all' ? 'Alles geprüft — keine offenen Vorschläge.' : `Keine offenen Vorschläge für „${FIELDS.find(f => f.key === state.mode)?.label}“.`;
    return;
  }
  $('done').hidden = true; $('card').hidden = false;
  const sp = spaceModel(id);
  const a = $('sp-id'); a.textContent = `#${id}`;
  if (isHttp(sp.website)) { a.href = sp.website; a.removeAttribute('aria-disabled'); } else a.removeAttribute('href');
  $('sp-name').textContent = sp.name;
  const l = sp.loc;
  $('sp-meta').textContent = [l.loc?.city, l.loc?.country, `Stand ${formatEditDate(l.dates?.['space.edited.latest'])}`].filter(Boolean).join(' · ');
  renderSources(sp);
  $('sp-rows').replaceChildren(...FIELDS.map(f => buildRow(f, sp, restore)));
  msg('');
  window.scrollTo?.(0, 0);
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
  } else if (a.type === 'reject') {
    await gh(`/repos/${REPO}/issues/${n}`, { method: 'PATCH', body: { state: 'closed', state_reason: 'not_planned' } });
  } else {
    const res = await gh(`/repos/${REPO}/issues`, { method: 'POST', body: { title: a.title, body: a.body, labels: a.labels } });
    a.createdNumber = res.number;
  }
}

async function decide(kind) {
  if (state.busy || state.current == null) return;
  const sp = spaceModel();
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
  state.undo.push({ spaceId: sp.id, form: snap, records: done, name: sp.name });
  if (state.undo.length > 12) state.undo.shift();
  const g = state.groups.get(sp.id);
  for (const a of done) if (g && a.number) delete g.proposals[a.key];
  state.okTotal += done.filter(a => a.type !== 'reject').length;
  const count = t => done.filter(a => a.type === t).length;
  const next = state.queue[state.queue.indexOf(sp.id) + 1];
  state.busy = false;
  rebuild(next);
  toast(`${sp.name}: ${[count('ok') && `${count('ok')} übernommen`, count('create') && `${count('create')} neu`, count('reject') && `${count('reject')} verworfen`].filter(Boolean).join(', ')}`, 'ok', { withUndo: true });
  show();
}

function later() {
  if (state.current == null) return;
  state.later = [...state.later.filter(i => i !== state.current), state.current]; store.set('spaces-later', state.later);
  const next = state.queue[state.queue.indexOf(state.current) + 1];
  rebuild(next); show();
  toast('Space ans Ende der Warteschlange verschoben', 'info');
}

async function revert(rec) {
  const n = rec.number ?? rec.createdNumber;
  if (!n) return null;
  const issue = await gh(`/repos/${REPO}/issues/${n}`);
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
  state.mode = 'all'; store.set('spaces-mode', 'all'); buildModeBar();
  state.queue = buildQueue(state.groups, state.later, 'all');
  if (!state.queue.includes(entry.spaceId)) state.queue.unshift(entry.spaceId);
  state.current = entry.spaceId;
  show(entry.form);
  toast(warnings.length ? `Rückgängig mit Hinweis: ${warnings.join('; ')}` : `${entry.name ?? '#' + entry.spaceId}: zurückgesetzt — Eingaben wiederhergestellt`, warnings.length ? 'warn' : 'info');
}

async function applyNow() {
  if (!state.okTotal || state.busy) return;
  state.busy = true;
  try {
    await gh(`/repos/${REPO}/actions/workflows/${APPLY_WORKFLOW}/dispatches`, { method: 'POST', body: { ref: 'main', inputs: { mode: 'apply' } } });
    const n = state.okTotal; state.okTotal = 0; state.undo = [];
    toast(`${n} Vorschlag/Vorschläge übernommen, Workflow gestartet`, 'ok');
    setTimeout(() => refresh(), 90000);
  } catch (err) { toast(`Fehler: ${err.message}`, 'no'); }
  finally { state.busy = false; show(); }
}

$('act-y').addEventListener('click', () => decide('ok'));
$('act-n').addEventListener('click', () => decide('reject'));
$('act-l').addEventListener('click', later);
$('act-z').addEventListener('click', undo);
$('apply').addEventListener('click', applyNow);

// Tasten: y/n/ä/z + ←/→ (Bearbeiten-Auswahl durchwechseln). Niemals e l w a s d (Vivaldi-Direktkürzel) und keine Ziffern (Browser: Zoom/Tab-Wechsel)
document.addEventListener('keydown', e => {
  if (e.ctrlKey || e.metaKey || e.altKey || !token) return;
  if (/^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName)) return;
  const k = e.key.toLowerCase();
  if (k === 'y') decide('ok');
  else if (k === 'n') decide('reject');
  else if (k === 'ä') later();
  else if (k === 'z') undo();
  else if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') stepMode(e.key === 'ArrowRight' ? 1 : -1);
  else return;
  e.preventDefault();
});

// Daten bleiben aktuell (Crawler/Apply laufen parallel)
const stale = () => Date.now() - state.dataAt;
document.addEventListener('visibilitychange', () => { if (!document.hidden && token && stale() > 60000) refresh(); });
setInterval(() => { if (!document.hidden && token && !state.busy && stale() > 180000) refresh(); }, 120000);

if (token) start(); else $('login').hidden = false;
