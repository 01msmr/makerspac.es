// admin/admin.js — Review-Seite für „SpaceAPI:“-Issues. Schreibt NUR Issues (Label/Body/Status) und löst
// den Apply-Workflow aus; Daten schreibt ausschließlich der GitHub-Workflow (siehe adr/006).
import { REPO, OK_LABEL, parseIssue, replaceEndpoint, buildComparison, autoApplyDelay, AUTO_APPLY_COUNT } from './admin-lib.js';

const API = 'https://api.github.com';
const RAW = `https://raw.githubusercontent.com/${REPO}/main`;
const WORKFLOW = 'apply-spaceapi-issues.yml';
const $ = id => document.getElementById(id);

let token = '';
try { token = localStorage.getItem('admin-pat') || ''; } catch { /* privater Modus */ }

const state = { queue: [], idx: 0, okCount: 0, locations: new Map(), enrichment: {}, lastOkAt: 0, timer: null, busy: false, view: 'site', current: null, data: null };

async function gh(path, { method = 'GET', body } = {}) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 401) { logout(); throw new Error('Token ungültig oder abgelaufen'); }
  if (!res.ok) throw new Error(`GitHub ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res.status === 204 ? null : res.json();
}

const setStatus = msg => { $('status').textContent = msg || ''; };

// ─── Login ───────────────────────────────────────────────────────────────
function logout() {
  token = '';
  try { localStorage.removeItem('admin-pat'); } catch { /* ignore */ }
  for (const id of ['review', 'done', 'apply', 'logout']) $(id).hidden = true;
  $('counter').textContent = '';
  $('login').hidden = false;
}
$('logout').addEventListener('click', logout);
$('save-token').addEventListener('click', () => {
  token = $('token').value.trim();
  $('token').value = '';
  if (!token) return;
  try { localStorage.setItem('admin-pat', token); } catch { /* ignore */ }
  start();
});

// ─── Laden ───────────────────────────────────────────────────────────────
async function start() {
  $('login').hidden = true;
  $('logout').hidden = false;
  try {
    const issues = [];
    for (let page = 1; page <= 3; page++) {
      const batch = await gh(`/repos/${REPO}/issues?labels=data-update&state=open&per_page=100&page=${page}`);
      issues.push(...batch);
      if (batch.length < 100) break;
    }
    const parsed = issues.map(parseIssue).filter(Boolean);
    state.queue = parsed.filter(p => !p.ok);
    state.okCount = parsed.filter(p => p.ok).length;
    state.lastOkAt = Math.max(0, ...parsed.filter(p => p.ok).map(p => p.updated));
    state.idx = 0;
    const [locs, enr] = await Promise.all([
      fetch(`${RAW}/locations.json`).then(r => r.json()),
      fetch(`${RAW}/loc-enrichment.json`).then(r => r.json()),
    ]);
    state.locations = new Map(locs.map(l => [l.ID, l]));
    state.enrichment = enr;
  } catch (err) {
    $('done').hidden = false;
    $('done').textContent = `Fehler: ${err.message}`;
    return;
  }
  show();
}

// ─── Anzeige ─────────────────────────────────────────────────────────────
function updateBar() {
  const n = state.queue.length;
  const open = Math.max(0, n - state.idx);
  $('counter').textContent = open ? `${state.idx + 1} / ${n} · offen: ${open}` : '';
  const btn = $('apply');
  btn.hidden = state.okCount === 0;
  btn.textContent = `Übernehmen (${state.okCount})`;
  btn.title = `Wird automatisch gestartet bei ${AUTO_APPLY_COUNT} Vorschlägen oder 1 h ohne neuen ok-Vorschlag`;
  scheduleAutoApply();
}

async function show() {
  updateBar();
  $('edit').hidden = true;
  setStatus('');
  const p = state.queue[state.idx];
  if (!p) {
    $('review').hidden = true;
    $('done').hidden = false;
    $('done').textContent = state.okCount
      ? `Fertig — ${state.okCount} Vorschlag/Vorschläge mit „ok“ warten auf „Übernehmen“.`
      : 'Keine offenen Vorschläge.';
    return;
  }
  $('done').hidden = true;
  $('review').hidden = false;
  state.current = p;
  state.data = null;
  $('title').textContent = `#${p.number} · ID ${p.spaceId}`;
  const loc = state.locations.get(p.spaceId);
  const cur = state.enrichment[String(p.spaceId)]?.spaceapi;
  renderCompare(buildComparison(loc, cur, null, p.endpoint));
  $('hint').textContent = 'Endpoint wird geladen …';
  setView(loc?.link?.url ? 'site' : 'endpoint');

  // Live-Daten laden (CORS kann scheitern → Hinweis, Vergleich ohne Endpoint-Daten)
  try {
    const res = await fetch(p.endpoint, { signal: AbortSignal.timeout(8000) });
    const data = await res.json();
    if (state.current !== p) return;
    state.data = data;
    renderCompare(buildComparison(loc, cur, data, p.endpoint));
    $('hint').textContent = typeof data.space === 'string' ? '' : '⚠️ Kein gültiges SpaceAPI-JSON (space fehlt)';
  } catch {
    if (state.current === p) $('hint').textContent = 'Endpoint nicht direkt ladbar (CORS/Timeout/Fehler) — rechts „Endpoint“ bzw. „im Tab öffnen“ prüfen.';
  }
}

function renderCompare(rows) {
  const table = $('compare');
  table.replaceChildren();
  const head = table.insertRow();
  for (const t of ['', 'bei uns', 'Vorschlag']) { const th = document.createElement('th'); th.textContent = t; head.append(th); }
  for (const r of rows) {
    const tr = table.insertRow();
    tr.className = r.differs ? 'differs' : '';
    const th = document.createElement('th'); th.textContent = r.label;
    const a = tr.insertCell(); a.textContent = r.ours;
    const b = tr.insertCell(); b.textContent = r.proposed;
    tr.prepend(th);
  }
}

function setView(view) {
  state.view = view;
  const p = state.current;
  const loc = state.locations.get(p.spaceId);
  const url = view === 'site' ? loc?.link?.url : p.endpoint;
  $('frame').src = url && /^https?:/.test(url) ? url : 'about:blank';
  $('show-site').setAttribute('aria-pressed', String(view === 'site'));
  $('show-endpoint').setAttribute('aria-pressed', String(view === 'endpoint'));
}
$('show-site').addEventListener('click', () => setView('site'));
$('show-endpoint').addEventListener('click', () => setView('endpoint'));
$('open-tab').addEventListener('click', () => {
  const p = state.current;
  const url = state.view === 'site' ? state.locations.get(p.spaceId)?.link?.url : p.endpoint;
  if (url && /^https?:/.test(url)) window.open(url, '_blank', 'noopener');
});

// ─── Aktionen ────────────────────────────────────────────────────────────
function scheduleAutoApply() {
  clearTimeout(state.timer);
  const delay = autoApplyDelay(state.okCount, state.lastOkAt, Date.now());
  if (delay === null) return;
  state.timer = setTimeout(() => applyNow(true), Math.min(delay, 2 ** 31 - 1));
}

const addOk = n => gh(`/repos/${REPO}/issues/${n}/labels`, { method: 'POST', body: { labels: [OK_LABEL] } });

async function act(kind, value) {
  const p = state.current;
  if (!p || state.busy) return;
  state.busy = true;
  try {
    if (kind === 'y') { setStatus('Setze Label …'); await addOk(p.number); state.okCount++; state.lastOkAt = Date.now(); }
    else if (kind === 'a') {
      setStatus('Passe Issue an …');
      const issue = await gh(`/repos/${REPO}/issues/${p.number}`);
      const body = replaceEndpoint(issue.body || '', value);
      if (!body) throw new Error('Ungültige URL oder JSON-Block fehlt');
      await gh(`/repos/${REPO}/issues/${p.number}`, { method: 'PATCH', body: { body } });
      await addOk(p.number);
      state.okCount++;
      state.lastOkAt = Date.now();
    } else if (kind === 'n') {
      setStatus('Schließe Issue …');
      await gh(`/repos/${REPO}/issues/${p.number}`, { method: 'PATCH', body: { state: 'closed', state_reason: 'not_planned' } });
    }
    state.idx++;
    state.busy = false;
    show();
  } catch (err) {
    state.busy = false;
    setStatus(`Fehler: ${err.message}`);
  }
}

$('edit').addEventListener('submit', e => { e.preventDefault(); act('a', $('edit-url').value.trim()); });

document.addEventListener('keydown', e => {
  if (e.ctrlKey || e.metaKey || e.altKey || $('review').hidden) return;
  if (e.target instanceof HTMLInputElement) { if (e.key === 'Escape') { $('edit').hidden = true; e.target.blur(); } return; }
  switch (e.key.toLowerCase()) {
    case 'y': act('y'); break;
    case 'n': act('n'); break;
    case 's': state.idx++; show(); break;
    case 'a':
      e.preventDefault();
      $('edit').hidden = false;
      $('edit-url').value = state.current.endpoint;
      $('edit-url').focus();
      break;
  }
});

// ─── Übernehmen ──────────────────────────────────────────────────────────
async function applyNow(auto = false) {
  if (!state.okCount || state.busy) return;
  state.busy = true;
  const n = state.okCount;
  try {
    await gh(`/repos/${REPO}/actions/workflows/${WORKFLOW}/dispatches`, { method: 'POST', body: { ref: 'main', inputs: { mode: 'apply-ok', id: '0' } } });
    state.okCount = 0;
    state.busy = false;
    const link = document.createElement('a');
    link.href = `https://github.com/${REPO}/actions/workflows/${WORKFLOW}`;
    link.target = '_blank'; link.rel = 'noopener'; link.textContent = 'Run ansehen';
    $('status').replaceChildren(`${auto ? 'Automatisch' : ''} ${n} Vorschlag/Vorschläge übernommen — Workflow gestartet: `.trim() + ' ', link);
    updateBar();
    if (!state.queue[state.idx]) { $('review').hidden = true; $('done').hidden = false; $('done').replaceChildren($('status').cloneNode(true)); }
  } catch (err) {
    state.busy = false;
    setStatus(`Fehler: ${err.message}`);
  }
}
$('apply').addEventListener('click', () => applyNow(false));

if (token) start(); else $('login').hidden = false;
