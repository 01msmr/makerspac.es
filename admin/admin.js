// admin/admin.js — Review-Seite für „SpaceAPI:“- und „[Workshop-Daten]“-Issues. Schreibt NUR Issues
// (Label/Body/Status) und löst die Apply-Workflows aus; Daten schreibt ausschließlich der GitHub-Workflow (adr/006).
import {
  REPO, OK_LABEL, AUTO_APPLY_COUNT, autoApplyDelay,
  parseIssue, replaceEndpoint, buildComparison,
  parseWorkshopIssue, replaceWorkshops, buildWorkshopComparison, detectFromText, looksLikeUrl, parseScanComment,
  parseCalendarIssue, replaceEvents, buildCalendarComparison, parseWeeklyIssue, replaceWeekly, buildWeeklyComparison, weeklyText, formatWeekly, formatTime, formatEditDate, INBOX_GROUPS, groupInbox,
  PROBLEM_LABEL, failedRuns, stuckOk, problemReason, mergeQueue,
} from './admin-lib.js';
import { WORKSHOP_TYPES } from '../workshop-types.js';
import { applyCssColours } from '../colours.js';
import { applyEnrichment, normalizeUrl } from '../enrichment-merge.js';

// Status-Farben (--space-open/-closed/-unknown) aus colours.js (SSOT), reagiert auf Dark Mode
applyCssColours();
window.matchMedia?.('(prefers-color-scheme: dark)').addEventListener?.('change', applyCssColours);

const API = 'https://api.github.com';
const $ = id => document.getElementById(id);

/**
 * Je Art: Quelle (Label), Parser, Apply-Workflow (+ Modus), Eingabeart.
 * edit 'url' = ein URL-Feld (urlOf/replaceUrl), 'workshops' = Checkboxen. Workshops: mode "apply" = alle freigegebenen (Label ok).
 */
const KINDS = {
  spaceapi: { label: 'SpaceAPI', query: 'data-update', parse: parseIssue, workflow: 'apply-spaceapi-issues.yml', mode: 'apply-ok',
    edit: 'url', urlOf: p => p.endpoint, replaceUrl: replaceEndpoint, viewLabel: 'Endpoint' },
  workshops: { label: 'Workshops', query: 'workshop-data', parse: parseWorkshopIssue, workflow: 'apply-workshop-issues.yml', mode: 'apply', edit: 'workshops' },
  calendar: { label: 'Kalender', query: 'data-update', parse: parseCalendarIssue, workflow: 'apply-calendar-issues.yml', mode: 'apply-ok',
    edit: 'url', urlOf: p => p.events, replaceUrl: replaceEvents, viewLabel: 'Kalender' },
  // Treffen: ein Textfeld „Di 19:00, 2015“ (Weekly + Gründung); kein Endpoint-Frame (kein urlOf)
  weekly: { label: 'Weekly', query: 'weekly-data', parse: parseWeeklyIssue, workflow: 'apply-weekly-issues.yml', mode: 'apply-ok',
    edit: 'url', textOf: weeklyText, replaceUrl: replaceWeekly },
};
for (const [name, k] of Object.entries(KINDS)) Object.assign(k, { name, queue: [], idx: 0, okCount: 0, lastOkAt: 0, timer: null });

let token = '';
try { token = localStorage.getItem('admin-pat') || ''; } catch { /* privater Modus */ }

const state = { live: null, dataSha: '', dataAt: 0, problems: { runs: [], stuck: [] }, undo: [], list: null, notice: '', inboxItems: [], tab: 'spaceapi', locations: new Map(), enrichment: {}, busy: false, view: 'site', current: null };
const cur = () => KINDS[state.tab];

async function gh(path, { method = 'GET', body } = {}) {
  const res = await fetch(`${API}${path}`, {
    method,
    cache: 'no-store',
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 401) { logout(); throw new Error('Token ungültig oder abgelaufen'); }
  if (!res.ok) throw new Error(`GitHub ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res.status === 204 ? null : res.json();
}

// ─── Toasts ──────────────────────────────────────────────────────────────
/** tone: ok (grün) · no (rot) · warn (gelb) · info. withUndo = Rückgängig-Knopf im Toast. */
function toast(message, tone = 'info', { withUndo = false } = {}) {
  const box = $('toasts');
  const t = document.createElement('div');
  t.className = 'toast';
  t.dataset.tone = tone;
  t.append(Object.assign(document.createElement('span'), { textContent: message }));
  if (withUndo) {
    const b = document.createElement('button');
    b.type = 'button'; b.textContent = 'Rückgängig';
    b.addEventListener('click', () => { t.remove(); undo(); });
    t.append(b);
  }
  box.append(t);
  while (box.children.length > 4) box.firstElementChild.remove();
  setTimeout(() => t.remove(), withUndo ? 8000 : 5000);
}

const setStatus = msg => { $('status').textContent = msg || ''; };
const websiteOf = p => state.locations.get(p.spaceId)?.link?.url || p.website || '';

// ─── Login ───────────────────────────────────────────────────────────────
function logout() {
  token = '';
  for (const k of Object.values(KINDS)) clearTimeout(k.timer);
  try { localStorage.removeItem('admin-pat'); } catch { /* ignore */ }
  for (const id of ['review', 'done', 'inbox', 'apply', 'logout', 'logout2', 'logout3', 'tabs', 'refresh']) $(id).hidden = true;
  $('data-stand').textContent = '';
  state.dataAt = 0;
  $('counter').textContent = '';
  $('login').hidden = false;
}
$('logout').addEventListener('click', logout);
$('logout2').addEventListener('click', logout);
$('logout3').addEventListener('click', logout);   // Touch im Review: Abmelden als letztes Element IM scrollbaren Inhalt, über der festen Aktionsleiste   // Touch: Abmelden steht am Seitenende (spart Platz oben)
$('login-form').addEventListener('submit', e => {
  e.preventDefault();
  token = $('token').value.trim();
  // Feld erst später leeren: Der Passwort-Manager liest den Wert beim Absenden/Ausblenden des Formulars
  setTimeout(() => { $('token').value = ''; }, 2000);
  if (!token) return;
  try { localStorage.setItem('admin-pat', token); } catch { /* ignore */ }
  start();
});

// ─── Aktueller Datenstand („Aktuell“-Spalte) ───────────────────────────────────
// Direkt über die GitHub-API (nicht raw.githubusercontent.com: dort bis zu ~5 min CDN-Cache) und dieselbe Verschmelzung
// wie die Karte (enrichment-merge.js: Grunddaten aus locations.json, Zusatzdaten aus loc-enrichment.json).
async function ghFile(file) {
  const res = await fetch(`${API}/repos/${REPO}/contents/${file}?ref=main`, {
    cache: 'no-store',
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github.raw+json' },
  });
  if (res.status === 401) { logout(); throw new Error('Token ungültig oder abgelaufen'); }
  if (!res.ok) throw new Error(`GitHub ${res.status} (${file})`);
  return JSON.parse(await res.text());
}

/** @returns {Promise<boolean>} true, wenn sich der Stand (Commit) geändert hat */
async function loadData() {
  const [branch, locs, enr] = await Promise.all([gh(`/repos/${REPO}/branches/main`), ghFile('locations.json'), ghFile('loc-enrichment.json')]);
  const sha = branch.commit.sha.slice(0, 7);
  const changed = sha !== state.dataSha;
  state.locations = new Map(locs.map(l => [l.ID, l]));
  state.enrichment = enr;
  state.dataSha = sha;
  state.dataAt = Date.now();
  $('data-stand').textContent = `Daten: ${new Date().toTimeString().slice(0, 8)} · ${sha}`;
  $('refresh').title = `Aktuellen Stand neu von GitHub laden — ${$('data-stand').textContent}`;
  return changed;
}

/** Aktueller (verschmolzener) Stand eines Space — genau das, was die Karte zeigt */
const effective = p => applyEnrichment(state.locations.get(p.spaceId) ?? {}, state.enrichment[String(p.spaceId)]);

/**
 * Warteschlangen mit GitHub abgleichen (der Tab kann stundenlang offen sein): inzwischen geschlossene/übernommene Issues
 * fallen heraus, „ok“-Zähler stimmen wieder. Ist das gerade angezeigte Issue weg, geht es mit Hinweis zum nächsten weiter.
 */
async function refreshQueues() {
  if (state.busy) return;
  let goneCurrent = null;
  for (const k of Object.values(KINDS)) {
    const parsed = await fetchKind(k);
    const showing = k === cur() && !state.list && state.current ? state.current.number : null;
    const { queue, gone } = mergeQueue(k.queue, k.idx, parsed.filter(p => !p.ok), showing);
    const okItems = parsed.filter(p => p.ok);
    k.queue = queue; k.idx = 0;
    k.okCount = okItems.length;
    k.lastOkAt = Math.max(k.lastOkAt, ...okItems.map(p => p.updated));
    if (gone) goneCurrent = showing;
  }
  await loadInbox().catch(() => {});
  await loadProblems().catch(() => {});
  if (goneCurrent != null) { toast(`#${goneCurrent} wurde inzwischen übernommen oder geschlossen — weiter mit dem nächsten`, 'warn'); show(); }
  else updateBar();
}

let refreshing = false;
async function refreshData(manual = false) {
  if (refreshing || !token || !state.dataAt) return;
  refreshing = true;
  try {
    const changed = await loadData();
    await refreshQueues();
    if (changed) { toast(`Daten aktualisiert (${state.dataSha})`, 'info'); refreshCompare(); }
    else if (manual) toast('Daten und Liste sind aktuell', 'ok');
  } catch (err) {
    if (manual) toast(`Aktualisieren fehlgeschlagen: ${err.message}`, 'no');
  } finally { refreshing = false; }
}
const staleMs = () => Date.now() - state.dataAt;
document.addEventListener('visibilitychange', () => { if (!document.hidden && staleMs() > 20000) refreshData(); });
window.addEventListener('focus', () => { if (staleMs() > 20000) refreshData(); });
setInterval(() => { if (!document.hidden && staleMs() > 110000) refreshData(); }, 120000);
$('refresh').addEventListener('click', () => refreshData(true));

// ─── Laden ───────────────────────────────────────────────────────────────
/** Frische Liste der offenen, parsebaren Issues einer Art */
async function fetchKind(k) {
  const issues = [];
  for (let page = 1; page <= 5; page++) {
    const batch = await gh(`/repos/${REPO}/issues?labels=${k.query}&state=open&per_page=100&page=${page}`);
    issues.push(...batch);
    if (batch.length < 100) break;
  }
  return issues.map(k.parse).filter(Boolean);
}

async function loadKind(k) {
  const parsed = await fetchKind(k);
  k.queue = parsed.filter(p => !p.ok);
  k.okCount = parsed.filter(p => p.ok).length;
  k.lastOkAt = Math.max(0, ...parsed.filter(p => p.ok).map(p => p.updated));
  k.idx = 0;
}

async function start() {
  $('login').hidden = true;
  for (const id of ['logout', 'logout2', 'logout3', 'tabs', 'refresh']) $(id).hidden = false;
  try {
    await Promise.all([
      loadKind(KINDS.spaceapi), loadKind(KINDS.workshops), loadKind(KINDS.calendar), loadKind(KINDS.weekly),
      loadInbox().catch(() => {}),
      loadData(),
    ]);
    await loadProblems().catch(() => { /* Probleme-Reiter bleibt leer */ });
  } catch (err) {
    $('done').hidden = false;
    $('done').textContent = `Fehler: ${err.message}`;
    return;
  }
  state.tab = Object.keys(KINDS).find(n => openCount(KINDS[n]) > 0) ?? 'spaceapi';
  show();
}

// Listen-Reiter (je Art einer, nur sichtbar wenn etwas offen ist) hinter den Review-Reitern anlegen
for (const [key, label] of INBOX_GROUPS) {
  const b = document.createElement('button');
  b.id = `tab-list-${key}`; b.dataset.list = key; b.hidden = true; b.textContent = label;
  $('tabs').append(b);
}

for (const btn of document.querySelectorAll('#tabs button')) {
  btn.addEventListener('click', () => {
    if (state.busy) return;
    if (btn.dataset.list) { showList(btn.dataset.list); return; }
    state.tab = btn.dataset.kind;
    show();
  });
}

$('tab-problems').addEventListener('click', () => { if (!state.busy) showProblems(); });

// ─── Listen-Reiter: offene PRs/Issues ohne eigenen Review-Ablauf (nur Anzeige + Link zu GitHub) ───
async function loadInbox() {
  const items = [];
  for (let page = 1; page <= 5; page++) {
    const batch = await gh(`/repos/${REPO}/issues?state=open&per_page=100&page=${page}`);
    items.push(...batch);
    if (batch.length < 100) break;
  }
  state.inboxItems = items;
}

function renderList(key) {
  const box = $('inbox');
  box.replaceChildren();
  const [, label, heading] = INBOX_GROUPS.find(g => g[0] === key);
  const list = groupInbox(state.inboxItems)[key] || [];
  const h = document.createElement('h2');
  h.textContent = `${heading} (${list.length})`;
  box.append(h);
  if (!list.length) { box.append('Nichts offen.'); return; }
  const ul = document.createElement('ul');
  for (const it of list) {
    const li = document.createElement('li');
    const a = document.createElement('a');
    a.href = it.html_url; a.target = '_blank'; a.rel = 'noopener';
    a.textContent = `#${it.number} ${it.title}`;
    const meta = document.createElement('span');
    meta.className = 'meta';
    meta.textContent = ` · ${it.user?.login ?? '?'} · ${(it.updated_at || '').slice(0, 10)}`;
    li.append(a, meta);
    ul.append(li);
  }
  box.append(ul);
}

async function showList(key) {
  state.list = key;
  $('review').hidden = true;
  $('done').hidden = true;
  $('inbox').hidden = false;
  $('inbox').textContent = 'Lade …';
  updateBar();
  try { await loadInbox(); } catch (err) { $('inbox').textContent = `Fehler: ${err.message}`; return; }
  renderList(key);
  updateBar();
}

// ─── Probleme-Reiter: fehlgeschlagene Läufe + hängende ok-Issues (Anzeige + Links) ───
const problemCount = () => state.problems.runs.length + state.problems.stuck.length;

async function loadProblems() {
  const since = new Date(Date.now() - 24 * 3600e3).toISOString();
  const data = await gh(`/repos/${REPO}/actions/runs?per_page=100&created=%3E${encodeURIComponent(since)}`);
  state.problems.runs = failedRuns(data.workflow_runs || [], Date.now());
  state.problems.stuck = stuckOk(state.inboxItems, Date.now());
}

function renderProblems() {
  const box = $('inbox');
  box.replaceChildren();
  const { runs, stuck } = state.problems;
  box.append(Object.assign(document.createElement('h2'), { textContent: `Probleme (${runs.length + stuck.length})` }));
  if (!runs.length && !stuck.length) { box.append('Alles in Ordnung — keine fehlgeschlagenen Läufe, keine hängenden Vorschläge.'); return; }
  const section = (title, hint, items, label) => {
    if (!items.length) return;
    box.append(Object.assign(document.createElement('h3'), { textContent: `${title} (${items.length})` }), Object.assign(document.createElement('p'), { className: 'hint', textContent: hint }));
    const ul = document.createElement('ul');
    for (const it of items) {
      const li = document.createElement('li');
      const a = Object.assign(document.createElement('a'), { href: it.url, target: '_blank', rel: 'noopener', textContent: label(it) });
      li.append(a);
      ul.append(li);
    }
    box.append(ul);
  };
  section('Fehlgeschlagene Läufe (24 h)', 'Der jeweils neueste Lauf des Workflows ist fehlgeschlagen; ein späterer grüner Lauf löst den Eintrag auf.', runs,
    r => `${r.name}${r.title && r.title !== r.name ? ` — ${r.title}` : r.branch ? ` — ${r.branch}` : ''} · ${r.at.replace('T', ' ').slice(0, 16)} UTC`);
  section('Seit über 2 h mit „ok“, aber noch offen', 'Wird normalerweise vom Auto-Apply-Cron (alle 15 Min) übernommen — hängt der Workflow? Unter „Übernehmen“ manuell starten oder Fehler im Actions-Log prüfen.', stuck,
    s => `#${s.number} ${s.title} · seit ${s.hours} h`);
}

async function showProblems() {
  state.list = 'problems';
  $('review').hidden = true;
  $('done').hidden = true;
  $('inbox').hidden = false;
  $('inbox').textContent = 'Lade …';
  updateBar();
  try { await loadInbox(); await loadProblems(); } catch (err) { $('inbox').textContent = `Fehler: ${err.message}`; return; }
  renderProblems();
  updateBar();
}

/** Grund anzeigen, warum ein Vorschlag zurückkam (letzter Bot-Kommentar) */
function showProblemReason(p) {
  const box = $('problem');
  box.hidden = !p.problem;
  box.replaceChildren();
  if (!p.problem) return;
  box.textContent = '⚠ Zuvor nicht übernommen — Grund wird geladen …';
  gh(`/repos/${REPO}/issues/${p.number}/comments?per_page=100`).then(cs => {
    if (state.current !== p) return;
    box.replaceChildren(Object.assign(document.createElement('strong'), { textContent: '⚠ Zuvor nicht übernommen' }), document.createElement('br'),
      problemReason(cs) || 'Kein Kommentar des Bots gefunden — siehe Issue auf GitHub.');
  }).catch(() => { if (state.current === p) box.textContent = '⚠ Zuvor nicht übernommen (Grund konnte nicht geladen werden).'; });
}

// ─── Anzeige ─────────────────────────────────────────────────────────────
const openCount = k => Math.max(0, k.queue.length - k.idx);

/** Reiter-Beschriftung: Name + kleines Zählerabzeichen (0 = ausgegraut, ohne Zahl); Warnabzeichen rot. Spart Platz gegenüber „Name (n)“. */
function setTab(b, label, n, warn = 0, showNumber = true) {
  b.replaceChildren(label);
  // Zahl nur am aktiven Reiter; bei den anderen genügt ein Punkt („hier ist etwas offen“); Probleme = roter Punkt (Zahl in der Liste)
  if (n) b.append(Object.assign(document.createElement('span'), { className: showNumber ? 'badge' : 'badge dot', textContent: showNumber ? String(n) : '' }));
  if (warn) b.append(Object.assign(document.createElement('span'), { className: 'badge warn dot', title: `${warn} mit Problem` }));
  b.dataset.empty = n ? '' : 'true';
  b.setAttribute('aria-label', `${label}, ${n} offen${warn ? `, ${warn} mit Problem` : ''}`);
}

function updateBar() {
  for (const [name, k] of Object.entries(KINDS)) {
    const b = $(`tab-${name}`);
    const pc = k.queue.slice(k.idx).filter(q => q.problem).length;
    setTab(b, k.label, openCount(k), pc, !state.list && name === state.tab);
    b.setAttribute('aria-pressed', String(!state.list && name === state.tab));
    scheduleAutoApply(k);
  }
  const groups = groupInbox(state.inboxItems);
  for (const [key, label] of INBOX_GROUPS) {
    const n = groups[key]?.length || 0;
    const b = $(`tab-list-${key}`);
    b.hidden = n === 0 && state.list !== key; // leere Listen-Reiter ausblenden
    setTab(b, label, n, 0, state.list === key);
    b.setAttribute('aria-pressed', String(state.list === key));
  }
  const np = problemCount();
  $('tab-problems').hidden = np === 0 && state.list !== 'problems'; // leer → ausgeblendet
  setTab($('tab-problems'), 'Probleme', np, 0, true);
  $('tab-problems').setAttribute('aria-pressed', String(state.list === 'problems'));
  updateUndoButton();
  const k = cur();
  $('counter').textContent = state.list ? '' : openCount(k) ? `${k.idx + 1} / ${k.queue.length} · offen: ${openCount(k)}` : '';
  const btn = $('apply');
  btn.hidden = k.okCount === 0 || !!state.list;
  btn.textContent = `Übernehmen (${k.okCount})`;
  btn.title = `Wird automatisch gestartet bei ${AUTO_APPLY_COUNT} Vorschlägen oder 1 h ohne neuen ok-Vorschlag`;
}

/** Nächster Review-Reiter (nach dem aktuellen, reihum) mit noch offenen Vorschlägen */
function nextTabWithItems() {
  const names = Object.keys(KINDS);
  const start = names.indexOf(state.tab);
  for (let i = 1; i < names.length; i++) {
    const n = names[(start + i) % names.length];
    if (openCount(KINDS[n]) > 0) return n;
  }
  return null;
}

async function show() {
  const k = cur();
  state.list = null;
  $('inbox').hidden = true;
  updateBar();
  $('extra').replaceChildren();
  setStatus(state.notice);
  state.notice = '';
  const p = k.queue[k.idx];
  if (!p) {
    const next = nextTabWithItems(); // Ende der Liste → weiter im nächsten Reiter
    if (next) { state.notice = `${k.label} fertig — weiter mit ${KINDS[next].label}.`; toast(state.notice, 'info'); state.tab = next; return show(); }
    $('review').hidden = true;
    $('done').hidden = false;
    $('done').textContent = k.okCount
      ? `${k.label}: fertig — ${k.okCount} Vorschlag/Vorschläge mit „ok“ warten auf „Übernehmen“.`
      : `${k.label}: keine offenen Vorschläge.`;
    return;
  }
  $('done').hidden = true;
  $('review').hidden = false;
  state.current = p;
  state.live = null;
  if (staleMs() > 60000) refreshData(); // „Aktuell“ soll immer der letzte Stand sein
  showProblemReason(p);
  fillEdit(p);
  const loc = state.locations.get(p.spaceId);
  // Titel = Link zur Website (neuer Tab, mit ↗); ohne gültige URL bleibt es reiner Text
  const titleText = `#${p.number} · ID ${p.spaceId}${loc ? ` · ${loc.name}` : ''}`;
  const site = websiteOf(p), siteOk = /^https?:/.test(site);
  $('open-site').textContent = siteOk ? `${titleText} ↗` : titleText;
  if (siteOk) $('open-site').href = site; else $('open-site').removeAttribute('href');
  $('show-endpoint').hidden = !k.urlOf;
  // Smartphone: Endpoint/Kalender als echter Link in neuem Tab (die Website ist der Titel) (auf Antippen — Browser blocken automatisch geöffnete Tabs)
  for (const [id, url, label] of [['open-endpoint', k.urlOf?.(p), `${k.viewLabel ?? 'Endpoint'} ↗`]]) {
    const a = $(id);
    a.hidden = !(url && /^https?:/.test(url));
    if (!a.hidden) { a.href = url; a.textContent = label; }
  }
  if (k.viewLabel) $('show-endpoint').textContent = k.viewLabel;
  $('hint').textContent = '';
  if (state.tab === 'spaceapi') await showSpaceApi(p, loc);
  else if (state.tab === 'workshops') showWorkshop(p, loc);
  else if (state.tab === 'weekly') showWeekly(p, loc);
  else showCalendar(p, loc);
}

async function showSpaceApi(p, loc) {
  const cur0 = effective(p).spaceapi;
  renderCompare(buildComparison(loc, cur0, null, p.endpoint));
  $('hint').textContent = 'Endpoint wird geladen …';
  setView(loc?.link?.url ? 'site' : 'endpoint');
  // Live-Daten laden (CORS kann scheitern → Hinweis, Vergleich ohne Endpoint-Daten)
  try {
    const res = await fetch(p.endpoint, { signal: AbortSignal.timeout(8000) });
    const data = await res.json();
    if (state.current !== p) return;
    state.live = data;
    renderCompare(buildComparison(loc, cur0, data, p.endpoint));
    $('hint').textContent = typeof data.space === 'string' ? '' : '⚠️ Kein gültiges SpaceAPI-JSON (space fehlt)';
  } catch {
    if (state.current === p) $('hint').textContent = 'Endpoint nicht direkt ladbar (CORS/Timeout/Fehler) — rechts „Endpoint“ bzw. „im Tab öffnen“ prüfen.';
  }
}

/** Hinweis zu einem bereits vorhandenen Kalenderlink (aus dem aktuellen, verschmolzenen Stand) */
function setCalendarHint(p, current) {
  const hint = $('hint');
  if (current) hint.textContent = 'Hinweis: aktuell ist schon ein Kalenderlink gesetzt. Ein anderer Vorschlag wird standardmäßig übernommen (ersetzt den bestehenden) — Haken entfernen = bestehenden behalten; „entfernen“ ist eine eigene Auswahl.';
  else hint.textContent = '';
}

function showWeekly(p, loc) {
  renderCompare(buildWeeklyComparison(loc, effective(p), p));
  setView('site');
  // Textstelle der Website, auf der der Fund beruht (nur textContent)
  for (const e of p.evidence ?? []) {
    const q = document.createElement('blockquote');
    q.textContent = `${e.what} ${e.value} (${e.confidence}): „${e.source}“`;
    $('extra').append(q);
  }
  $('hint').textContent = '';
}

function showCalendar(p, loc) {
  const current = effective(p).events;
  renderCompare(buildCalendarComparison(loc, current, p.events, p.confidence));
  setView('endpoint');
  setCalendarHint(p, current);
}

/** Hinweis zu bereits vorhandenen Workshops (aus dem aktuellen, verschmolzenen Stand) */
function setWorkshopHint(p, current) {
  const hint = $('hint');
  if (Array.isArray(current) && current.length) hint.textContent = 'Hinweis: aktuell sind schon Workshops gesetzt — ohne „ersetzen bzw. entfernen“ wird dieses Issue beim Übernehmen nur geschlossen; mit der Auswahl werden die bestehenden durch deine Auswahl ersetzt (oder entfernt).';
  else hint.textContent = '';
}

function showWorkshop(p, loc) {
  const current = effective(p).workshops;
  renderCompare(buildWorkshopComparison(loc, current, p.workshops));
  setView('site');
  setWorkshopHint(p, current);
  // Gefundene Typen mit Confidence + Evidenz (nur textContent)
  const extra = $('extra');
  if (p.rows.length) {
    const t = document.createElement('table');
    for (const r of p.rows) {
      const tr = t.insertRow();
      for (const v of [r.type, r.confidence, r.keywords]) tr.insertCell().textContent = v;
    }
    extra.append(t);
  }
  if (p.evidence) {
    const q = document.createElement('blockquote');
    q.textContent = p.evidence;
    extra.append(q);
  }
}

/** Nach einer Daten-Aktualisierung: Vergleich + Hinweise der aktuellen Issue neu berechnen (Eingaben bleiben unberührt) */
function refreshCompare() {
  const p = state.current;
  if (!p || state.list || $('review').hidden) return;
  const loc = state.locations.get(p.spaceId);
  const eff = effective(p);
  if (state.tab === 'spaceapi') renderCompare(buildComparison(loc, eff.spaceapi, state.live, p.endpoint));
  else if (state.tab === 'weekly') renderCompare(buildWeeklyComparison(loc, eff, p));
  else if (state.tab === 'workshops') {
    renderCompare(buildWorkshopComparison(loc, eff.workshops, p.workshops));
    setWorkshopHint(p, eff.workshops);
    updateReplaceOption(p);
    updateEmptyHint();
  } else {
    renderCompare(buildCalendarComparison(loc, eff.events, p.events, p.confidence));
    setCalendarHint(p, eff.events);
    updateReplaceOption(p);
    updateEmptyHint();
  }
}

function renderCompare(rows) {
  const table = $('compare');
  table.replaceChildren();
  const head = table.insertRow();
  for (const t of ['', 'Aktuell', 'Vorschlag']) { const th = document.createElement('th'); th.textContent = t; if (t === 'Aktuell') th.title = 'Aktueller Stand auf der Karte (main)'; head.append(th); }
  for (const r of rows) {
    const tr = table.insertRow();
    tr.className = r.warn ? 'warn' : r.differs ? 'differs' : '';
    tr.dataset.row = r.label;
    const th = document.createElement('th'); th.textContent = r.label;
    const a = tr.insertCell(); a.textContent = r.ours;
    const b = tr.insertCell(); b.textContent = r.proposed;
    tr.prepend(th);
  }
}

function viewUrl(view) {
  const p = state.current;
  return view === 'site' ? websiteOf(p) : cur().urlOf?.(p);
}

function setView(view) {
  state.view = view;
  const url = viewUrl(view);
  // Smartphone (≤767px, wie das CSS): Rahmen ist ausgeblendet → nicht laden (Datenvolumen); „im Tab öffnen“ nutzt viewUrl
  const phone = window.matchMedia?.('(max-width: 767px)').matches;
  $('frame').src = !phone && url && /^https?:/.test(url) ? url : 'about:blank';
  $('show-site').setAttribute('aria-pressed', String(view === 'site'));
  $('show-endpoint').setAttribute('aria-pressed', String(view === 'endpoint'));
}
$('show-site').addEventListener('click', () => setView('site'));
$('show-endpoint').addEventListener('click', () => setView('endpoint'));
$('open-tab').addEventListener('click', () => {
  const url = viewUrl(state.view);
  if (url && /^https?:/.test(url)) window.open(url, '_blank', 'noopener');
});

// ─── Aktionen ────────────────────────────────────────────────────────────
function scheduleAutoApply(k) {
  clearTimeout(k.timer);
  const delay = autoApplyDelay(k.okCount, k.lastOkAt, Date.now());
  if (delay === null) return;
  k.timer = setTimeout(() => applyNow(k, true), Math.min(delay, 2 ** 31 - 1));
}

const addOk = n => gh(`/repos/${REPO}/issues/${n}/labels`, { method: 'POST', body: { labels: [OK_LABEL] } });

/** Neuer Body für „anpassen“ — wirft bei ungültiger Eingabe. */
function adjustedBody(body, value, opts = {}) {
  if (cur().edit === 'url') {
    const nb = cur().replaceUrl(body, value, !!opts.replace); // replace: Kalender „ersetzen bzw. entfernen“
    if (!nb) throw new Error(cur().textOf ? 'Ungültige Eingabe (Beispiel: Di 19:00, 2015) oder JSON-Block fehlt' : 'Ungültige URL oder JSON-Block fehlt');
    return nb;
  }
  const nb = replaceWorkshops(body, value, !!opts.replace); // value = Array der angehakten Typen; replace = bestehende Workshops ersetzen/entfernen
  if (!nb) throw new Error('Mindestens ein Typ nötig oder JSON-Block fehlt');
  return nb;
}

async function act(action, value, opts = {}) {
  const k = cur();
  const p = state.current;
  if (!p || state.busy) return;
  state.busy = true;
  try {
    // Frischer Blick auf das Issue, bevor geschrieben wird (Tab kann veraltet sein: längst geschlossen/freigegeben)
    const live = await gh(`/repos/${REPO}/issues/${p.number}`);
    const staleReason = live.state !== 'open' ? 'inzwischen geschlossen' : (action !== 'n' && (live.labels || []).some(l => l.name === OK_LABEL)) ? 'schon freigegeben (ok)' : '';
    if (staleReason) {
      toast(`#${p.number} ist ${staleReason} — übersprungen`, 'warn');
      k.queue.splice(k.idx, 1);
      state.busy = false;
      show();
      return;
    }
    const entry = { kind: k.name, idx: k.idx, p, type: action };
    if (action === 'y') { setStatus('Setze Label …'); await addOk(p.number); k.okCount++; k.lastOkAt = Date.now(); toast(`✓ #${p.number} ok`, 'ok', { withUndo: true }); }
    else if (action === 'a') {
      setStatus('Passe Issue an …');
      entry.prevBody = live.body || '';
      const body = adjustedBody(entry.prevBody, value, opts);
      await gh(`/repos/${REPO}/issues/${p.number}`, { method: 'PATCH', body: { body } });
      await addOk(p.number);
      k.okCount++;
      k.lastOkAt = Date.now();
      toast(opts.replace ? (k.name === 'calendar' ? (value.length ? `⇄ #${p.number}: bestehender Kalenderlink wird beim Übernehmen ersetzt` : `🗑 #${p.number}: Kalenderlink wird beim Übernehmen ENTFERNT`) : (value.length ? `⇄ #${p.number}: bestehende Workshops werden beim Übernehmen ersetzt` : `🗑 #${p.number}: Workshops werden beim Übernehmen ENTFERNT`)) : `✎ #${p.number} angepasst + ok`, (k.name === 'calendar' ? !value : opts.replace) ? 'no' : 'warn', { withUndo: true });
    } else if (action === 'n') {
      setStatus('Schließe Issue …');
      await gh(`/repos/${REPO}/issues/${p.number}`, { method: 'PATCH', body: { state: 'closed', state_reason: 'not_planned' } });
      if (opts.noWorkshops) await gh(`/repos/${REPO}/issues/${p.number}/comments`, { method: 'POST', body: { body: 'Keine Werkstatt/Räume vorhanden — nichts übernommen (Admin-Review).' } });
      toast(opts.noWorkshops ? `✗ #${p.number} keine Werkstatt — geschlossen, nichts übernommen` : `✗ #${p.number} abgelehnt (geschlossen)`, 'no', { withUndo: true });
    }
    if (p.problem && action !== 'n') gh(`/repos/${REPO}/issues/${p.number}/labels/${PROBLEM_LABEL}`, { method: 'DELETE' }).catch(() => { /* Label schon weg */ });
    state.undo.push(entry);
    offerUndo();
    k.idx++;
    state.busy = false;
    show();
  } catch (err) {
    state.busy = false;
    setStatus(`Fehler: ${err.message}`);
    toast(`Fehler: ${err.message}`, 'no');
  }
}

function skip() {
  const k = cur();
  const p = state.current;
  if (!p) return;
  state.undo.push({ kind: k.name, idx: k.idx, p, type: 'l' });
  toast(`↷ #${p.number} später`, 'warn', { withUndo: true });
  k.idx++;
  show();
}

// Rückgängig-Knopf nur 9 s nach einer ok/ablehnen/anpassen-Aktion (Taste z und Toast bleiben unabhängig davon)
let undoTimer = null;
function updateUndoButton() { $('act-z').hidden = !(state.undoOffer && state.undo.length); }
function offerUndo() {
  state.undoOffer = true;
  clearTimeout(undoTimer);
  undoTimer = setTimeout(() => { state.undoOffer = false; updateUndoButton(); }, 9000);
  updateUndoButton();
}

/** Letzte Aktion rückgängig machen: y → Label weg · ä/b → Body zurück + Label weg · n → Issue wieder öffnen · l → zurück */
async function undo() {
  if (state.busy) return;
  const e = state.undo.pop();
  if (!e) return;
  state.undoOffer = false;
  state.busy = true;
  try {
    const k = KINDS[e.kind];
    if (e.type === 'y' || e.type === 'a') {
      if (e.type === 'a') await gh(`/repos/${REPO}/issues/${e.p.number}`, { method: 'PATCH', body: { body: e.prevBody } });
      await gh(`/repos/${REPO}/issues/${e.p.number}/labels/${OK_LABEL}`, { method: 'DELETE' });
      k.okCount = Math.max(0, k.okCount - 1);
    } else if (e.type === 'n') {
      await gh(`/repos/${REPO}/issues/${e.p.number}`, { method: 'PATCH', body: { state: 'open' } });
    }
    k.queue = k.queue.filter(q => q.number !== e.p.number);
    k.queue.unshift(e.p); // wieder vorn einreihen (Positionen können sich durch Aktualisierungen verschoben haben)
    k.idx = 0;
    state.tab = e.kind;
    state.busy = false;
    toast(`↶ Rückgängig: #${e.p.number}`, 'info');
    show();
  } catch (err) {
    state.undo.push(e); // nicht verloren geben
    state.busy = false;
    toast(`Rückgängig fehlgeschlagen: ${err.message}`, 'no');
  }
}

const checks = () => [...document.querySelectorAll('#edit-checks input')];

// Checkboxen einmalig aus WORKSHOP_TYPES erzeugen
for (const key of Object.keys(WORKSHOP_TYPES)) {
  const label = document.createElement('label');
  const box = document.createElement('input');
  box.type = 'checkbox'; box.value = key;
  box.addEventListener('change', () => { if (!box.checked) label.classList.remove('auto'); updateEmptyHint(); });
  label.append(box, key);
  $('edit-checks').append(label);
}

/** Eingabefelder (immer sichtbar) mit dem Vorschlag der aktuellen Issue füllen; verwirft alte Eingaben */
function fillEdit(p) {
  if ($('edit').contains(document.activeElement)) document.activeElement.blur(); // sonst schlucken Textfelder die Tasten y/n/l der nächsten Issue
  const isWs = cur().edit === 'workshops';
  const isWk = cur().name === 'weekly';   // native Eingabe (Auswahl/Uhrzeit/Datum) statt Textfeld
  $('edit-input').hidden = isWs || isWk;
  $('edit-input').disabled = isWs || isWk;
  $('edit-weekly').hidden = !isWk;
  $('edit-ws').hidden = !isWs;
  $('edit-free').value = '';
  setIndicator('idle', '');
  markAuto([]);
  updateScanTarget();
  if (isWs) {
    for (const box of checks()) box.checked = p.workshops.includes(box.value);
  } else if (isWk) {
    $('wk-day').value = p.weekly ? String(p.weekly.weekday) : '';
    $('wk-time').value = p.weekly?.time ? formatTime(p.weekly.time) : '';
    $('wk-init').max = new Date().toISOString().slice(0, 10);
    $('wk-init').value = p.init && p.init !== 20010000 ? formatEditDate(p.init) : '';
  } else {
    $('edit-input').type = cur().textOf ? 'text' : 'url';
    $('edit-input').value = (cur().textOf ?? cur().urlOf)(p);
  }
  $('edit-replace').checked = false;
  $('edit-remove').checked = false;
  $('replace-wrap').hidden = true; // frisch starten, damit der Standard („übernehmen“ vorangehakt) für jede Issue neu gesetzt wird
  $('edit-input').disabled = cur().edit === 'workshops' || isWk;
  updateReplaceOption(p);
  updateEmptyHint();
}

/** Aktuelle Eingabe: Endpoint (String) bzw. angehakte Workshop-Typen (Array) */
function editValue() {
  if (cur().name === 'weekly') {   // Text im selben Format wie weeklyText(p): „Di 19:00, 2015-05-01“ — so bleibt die übrige Kette unverändert
    const day = $('wk-day').value, time = $('wk-time').value, init = $('wk-init').value;
    return [day !== '' && time ? formatWeekly({ weekday: Number(day), time: Number(time.replace(':', '')) }) : '', init].filter(Boolean).join(', ');
  }
  return cur().edit === 'workshops' ? checks().filter(b => b.checked).map(b => b.value) : $('edit-input').value.trim();
}

function editChanged(p) {
  const v = editValue();
  return cur().edit === 'workshops' ? !(v.length === p.workshops.length && v.every(w => p.workshops.includes(w))) : v !== (cur().textOf ?? cur().urlOf)(p);
}

/** y / „Speichern + ok“: geänderte Eingabe in die Issue schreiben + ok, unveränderter Vorschlag nur ok */
const existingCalendar = p => !!effective(p).events;

function confirmOk() {
  const p = state.current;
  if (!p) return;
  // Workshops: kein Typ angehakt = Space hat (noch) keine Werkstatt → Issue schließen, nichts übernehmen (wie Spaces ohne Infos)
  if (cur().edit === 'workshops') {
    const v = editValue();
    const replace = $('edit-replace').checked && existingWorkshops(p).length > 0;
    if (replace) { act('a', v, { replace: true }); return; }  // bestehende ersetzen/entfernen (ausdrücklich gewählt)
    if (v.length === 0) { act('n', null, { noWorkshops: true }); return; }
  }
  if (cur().name === 'calendar') {
    if (!$('remove-wrap').hidden && $('edit-remove').checked) { act('a', '', { replace: true }); return; }            // ausdrücklich: entfernen
    if (!$('replace-wrap').hidden && $('edit-replace').checked) { act('a', $('edit-input').value.trim(), { replace: true }); return; } // Standard: neuen Link übernehmen
    if (existingCalendar(p)) { act('y'); return; }  // bestehenden behalten: nur freigeben (Apply schließt das Issue ohne Änderung)
  }
  if (editChanged(p)) act('a', editValue()); else act('y');
}

/** Statusanzeige unter dem Freitext: idle · info · ok (grün) · none (gelb) · working · error (rot) */
function setIndicator(stateName, text, types = []) {
  const box = $('edit-detected');
  box.dataset.state = stateName;
  box.replaceChildren(text);
  for (const t of types) box.append(Object.assign(document.createElement('span'), { className: 'chip', textContent: t }));
  if (stateName !== 'idle') box.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); // Ergebnis in den sichtbaren Bereich holen
}

/** „Bestehende ersetzen/entfernen“ nur anbieten, wenn Workshops da sind UND per loc-enrichment.json änderbar */
function updateReplaceOption(p) {
  const k = cur();
  let existing = [], text = '';
  if (k.edit === 'workshops') {
    existing = existingWorkshops(p);
    text = `Bestehende Workshops ersetzen bzw. entfernen (aktuell: ${existing.join(', ')})`;
  } else if (k.name === 'calendar') {
    // Kalender: ein ANDERER Link ist eine relevante Änderung → „übernehmen“ ist Standard; nur ENTFERNEN braucht eine eigene, ausdrückliche Wahl
    const e = effective(p).events;
    existing = e ? [e] : [];
    const url = $('edit-input').value.trim();
    const differs = !!url && normalizeUrl(url) !== normalizeUrl(e || '');
    const showReplace = existing.length > 0 && differs;
    const wasHidden = $('replace-wrap').hidden;
    $('replace-wrap').hidden = !showReplace;
    if (showReplace && wasHidden) $('edit-replace').checked = true; // Standard: neuen Link übernehmen
    $('replace-text').textContent = `Neuen Kalenderlink übernehmen — ersetzt den bestehenden (${e}). Haken entfernen = bestehenden behalten.`;
    const showRemove = existing.length > 0;
    $('remove-wrap').hidden = !showRemove;
    $('remove-text').textContent = `Bestehenden Kalenderlink entfernen (${e || '–'}) — es bleibt dann keiner stehen`;
    if (!showReplace) $('edit-replace').checked = false;
    if (!showRemove) $('edit-remove').checked = false;
    return;
  }
  $('remove-wrap').hidden = true;
  $('replace-wrap').hidden = existing.length === 0;
  $('replace-text').textContent = text;
  if ($('replace-wrap').hidden) $('edit-replace').checked = false;
}


const existingWorkshops = p => (p ? effective(p).workshops : null) || [];

/** Hinweis, wenn kein Workshop-Typ angehakt ist: y schließt das Issue ohne Übernahme */
function updateEmptyHint() {
  const box = $('empty-hint');
  const p = state.current;
  if (p && cur().name === 'calendar') {
    const old = effective(p).events;
    const url = $('edit-input').value.trim();
    const remove = !$('remove-wrap').hidden && $('edit-remove').checked;
    const replace = !$('replace-wrap').hidden && $('edit-replace').checked;
    const keep = !!old && !remove && !replace && !!url && normalizeUrl(url) !== normalizeUrl(old); // anderer Vorschlag, aber Haken entfernt
    $('edit-input').disabled = remove;          // beim Entfernen wird keine URL geschrieben
    $('edit-input').required = !remove;
    box.hidden = !(remove || replace || keep);
    if (box.hidden) return;
    box.dataset.tone = remove ? 'danger' : 'warn';
    box.replaceChildren(remove ? `Der bestehende Kalenderlink (${old}) wird beim Übernehmen ENTFERNT. Mit z rückgängig, solange noch nicht übernommen.`
      : replace ? `Der bestehende Kalenderlink (${old}) wird beim Übernehmen durch ${url} ersetzt. Haken entfernen = bestehenden behalten.`
      : `Der bestehende Kalenderlink (${old}) bleibt; der Vorschlag (${url}) wird verworfen — das Issue wird nur geschlossen.`);
    return;
  }
  $('edit-input').required = true;
  const isWs = cur().edit === 'workshops' && p;
  const existing = isWs ? existingWorkshops(p) : [];
  const replace = isWs && existing.length > 0 && $('edit-replace').checked;
  const zero = isWs && checks().every(b => !b.checked);
  box.hidden = !(isWs && (zero || replace));
  if (box.hidden) return;
  box.dataset.tone = replace ? 'danger' : 'warn';
  let text;
  if (replace && zero) text = `Alle bestehenden Workshops (${existing.join(', ')}) werden beim Übernehmen ENTFERNT. Mit z rückgängig, solange noch nicht übernommen.`;
  else if (replace) text = `Die bestehenden Workshops (${existing.join(', ')}) werden beim Übernehmen durch deine Auswahl ERSETZT.`;
  else if (existing.length) text = `Kein Typ angehakt: y schließt das Issue ohne Übernahme. Die bestehenden Workshops (${existing.join(', ')}) bleiben bestehen. Zum Entfernen oben „ersetzen bzw. entfernen“ ankreuzen.`;
  else text = 'Kein Typ angehakt: y schließt das Issue ohne Übernahme (der Space hat — wie bisher — keine Werkstatt-Angaben). Mit z wieder öffnen.';
  box.replaceChildren(text);
}

/** Automatisch angehakte Typen in der Checkbox-Liste hervorheben (grün + „✓ erkannt“) */
function markAuto(types) {
  for (const box of checks()) box.parentElement.classList.toggle('auto', types.includes(box.value) && box.checked);
  updateEmptyHint();
}

/** Zeigt, was „Website auslesen (Server)“ auslesen würde (URL im Feld, sonst die Website des Spaces) */
function scanTarget() {
  const free = $('edit-free').value.trim();
  return looksLikeUrl(free) ? free : websiteOf(state.current ?? {});
}

function updateScanTarget() {
  const free = $('edit-free').value.trim();
  const url = scanTarget();
  $('scan-target').textContent = url
    ? `Scan-Ziel: ${url}${free && !looksLikeUrl(free) ? ' — der eingefügte Text wird dafür nicht verwendet (er wird direkt ausgewertet)' : ''}`
    : 'Kein Scan-Ziel: keine Website bekannt — oben eine URL einfügen.';
}

// Freitext: wird sofort ausgewertet, erkannte Typen werden angehakt (bestehende Haken bleiben); gespeichert wird erst per Button
$('edit-free').addEventListener('input', () => {
  const v = $('edit-free').value;
  updateScanTarget();
  if (!v.trim()) { setIndicator('idle', ''); return; }
  if (looksLikeUrl(v)) { setIndicator('info', 'URL erkannt — mit „Website auslesen (Server)“ serverseitig auslesen.'); return; }
  const found = detectFromText(v);
  for (const box of checks()) if (found.includes(box.value)) box.checked = true;
  markAuto(found);
  setIndicator(found.length ? 'ok' : 'none', found.length ? `✓ Text ausgewertet (${v.length} Zeichen) — ${found.length} erkannt und angehakt:` : `✓ Text ausgewertet (${v.length} Zeichen) — nichts erkannt`, found);
});

// URL-Scan: Workflow scan-workshop-url.yml liest die Seite aus und kommentiert das Issue; wir holen den Kommentar (Polling) und löschen ihn wieder
const SCAN_POLL_MS = 5000;
const SCAN_MAX_POLLS = 36; // ≈ 3 min
const sleep = ms => new Promise(r => setTimeout(r, ms));

$('edit-scan').addEventListener('click', async () => {
  const p = state.current;
  const url = scanTarget();
  if (!url) { setIndicator('error', 'Keine URL vorhanden — oben eine URL einfügen.'); return; }
  const scanId = [...crypto.getRandomValues(new Uint8Array(4))].map(b => b.toString(16).padStart(2, '0')).join('');
  const btn = $('edit-scan');
  btn.disabled = true;
  btn.textContent = 'Scan läuft …';
  const t0 = Date.now();
  const tick = () => {
    if (state.current !== p) { clearInterval(timer); return; } // weitergegangen: Anzeige gehört nicht mehr dazu
    setIndicator('working', `⏳ Scan läuft für ${url} … ${Math.round((Date.now() - t0) / 1000)} s (meist 30–60 s)`);
  };
  const timer = setInterval(tick, 1000);
  tick();
  const done = (stateName, msg, types = []) => { if (state.current === p) setIndicator(stateName, msg, types); };
  try {
    await gh(`/repos/${REPO}/actions/workflows/scan-workshop-url.yml/dispatches`, { method: 'POST', body: { ref: 'main', inputs: { url, issue: String(p.number), scan_id: scanId } } });
    for (let i = 0; i < SCAN_MAX_POLLS; i++) {
      await sleep(SCAN_POLL_MS);
      if (state.current !== p) return; // weitergegangen
      const comments = await gh(`/repos/${REPO}/issues/${p.number}/comments?per_page=100`);
      for (const c of comments) {
        const r = parseScanComment(c.body || '', scanId);
        if (!r) continue;
        gh(`/repos/${REPO}/issues/comments/${c.id}`, { method: 'DELETE' }).catch(() => { /* Kommentar bleibt, harmlos */ });
        if (r.error) { done('error', `✗ Scan fehlgeschlagen: ${r.error}`); toast(`Scan fehlgeschlagen: ${r.error}`, 'no'); return; }
        if (state.current === p) { for (const box of checks()) if (r.types.includes(box.value)) box.checked = true; markAuto(r.types); }
        toast(r.types.length ? `Scan: ${r.types.join(', ')} erkannt` : 'Scan: nichts erkannt', r.types.length ? 'ok' : 'warn');
        done(r.types.length ? 'ok' : 'none', r.types.length ? `✓ Scan fertig (${r.pages} Seite(n), ${Math.round((Date.now() - t0) / 1000)} s) — ${r.types.length} erkannt und angehakt (bitte prüfen, dann „Speichern + ok“):` : `✓ Scan fertig (${r.pages} Seite(n)) — nichts erkannt.`, r.types);
        return;
      }
    }
    done('error', '✗ Scan hat nicht rechtzeitig geantwortet — Run unter GitHub → Actions → „Scan Workshop URL“ prüfen.');
  } catch (err) {
    done('error', `✗ Fehler: ${err.message}`);
  } finally {
    clearInterval(timer);
    btn.disabled = false;
    btn.textContent = 'Website auslesen (Server)';
  }
});

$('edit').addEventListener('submit', e => { e.preventDefault(); confirmOk(); });
$('edit-replace').addEventListener('change', () => { if ($('edit-replace').checked) $('edit-remove').checked = false; updateEmptyHint(); });
$('edit-remove').addEventListener('change', () => { if ($('edit-remove').checked) $('edit-replace').checked = false; updateEmptyHint(); });
$('edit-input').addEventListener('input', () => { if (state.current && cur().name === 'calendar') updateReplaceOption(state.current); updateEmptyHint(); });
$('act-y').addEventListener('click', confirmOk);
$('act-n').addEventListener('click', () => act('n'));
$('act-l').addEventListener('click', skip);
$('act-z').addEventListener('click', undo);

document.addEventListener('keydown', e => {
  if (e.ctrlKey || e.metaKey || e.altKey || $('review').hidden) return;
  // Tasten nur ignorieren, solange in ein Textfeld getippt wird (Checkboxen/Buttons lassen sie durch)
  if (e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement || (e.target instanceof HTMLInputElement && e.target.type !== 'checkbox')) {
    if (e.key === 'Escape') { fillEdit(state.current); e.target.blur(); } // Esc: Änderungen verwerfen
    return;
  }
  switch (e.key.toLowerCase()) {
    case 'y': confirmOk(); break;
    case 'n': act('n'); break;
    case 'ä': skip(); break;   // später (l/w/a/s/d sind durch die Vivaldi-Navigation belegt)
    case 'z': undo(); break;
    case 'escape': if (state.current) fillEdit(state.current); break; // Änderungen verwerfen (auch mit Fokus auf einer Checkbox)
    case 'j': setView('site'); break;
    case 'k': if (cur().urlOf) setView('endpoint'); break;
  }
});

// ─── Übernehmen ──────────────────────────────────────────────────────────
/** Startet den Apply-Workflow einer Art. @returns {Promise<{ok:boolean, link?:HTMLAnchorElement}>} */
async function applyNow(k, auto = false) {
  if (!k.okCount || state.busy) return { ok: false };
  state.busy = true;
  const n = k.okCount;
  try {
    await gh(`/repos/${REPO}/actions/workflows/${k.workflow}/dispatches`, { method: 'POST', body: { ref: 'main', inputs: { mode: k.mode, id: '0' } } });
    k.okCount = 0;
    state.undo = state.undo.filter(e => !(e.kind === k.name && (e.type === 'y' || e.type === 'a'))); // bereits übernommen → nicht mehr rückgängig
    state.busy = false;
    setTimeout(() => refreshData(), 45000); setTimeout(() => refreshData(), 120000); // Apply + Deploy brauchen ~1 min
    toast(`${auto ? 'Automatisch: ' : ''}${k.label} — ${n} Vorschlag/Vorschläge übernommen, Workflow gestartet`, 'ok');
    const link = document.createElement('a');
    link.href = `https://github.com/${REPO}/actions/workflows/${k.workflow}`;
    link.target = '_blank'; link.rel = 'noopener'; link.textContent = 'Run ansehen';
    $('status').replaceChildren(`${auto ? 'Automatisch: ' : ''}${k.label} — ${n} Vorschlag/Vorschläge übernommen, Workflow gestartet: `, link);
    updateBar();
    if (k === cur() && !k.queue[k.idx]) { $('review').hidden = true; $('done').hidden = false; $('done').replaceChildren($('status').cloneNode(true)); }
    return { ok: true };
  } catch (err) {
    state.busy = false;
    setStatus(`Fehler: ${err.message}`);
    toast(`Fehler: ${err.message}`, 'no');
    return { ok: false };
  }
}
$('apply').addEventListener('click', () => applyNow(cur(), false));

if (token) start(); else $('login').hidden = false;
