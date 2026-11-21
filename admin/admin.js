// admin/admin.js — Review-Seite für „SpaceAPI:“- und „[Workshop-Daten]“-Issues. Schreibt NUR Issues
// (Label/Body/Status) und löst die Apply-Workflows aus; Daten schreibt ausschließlich der GitHub-Workflow (adr/006).
import {
  REPO, OK_LABEL, AUTO_APPLY_COUNT, autoApplyDelay,
  parseIssue, replaceEndpoint, buildComparison,
  parseWorkshopIssue, replaceWorkshops, buildWorkshopComparison, detectFromText, looksLikeUrl, parseScanComment,
} from './admin-lib.js';
import { WORKSHOP_TYPES } from '../workshop-types.js';

const API = 'https://api.github.com';
const RAW = `https://raw.githubusercontent.com/${REPO}/main`;
const $ = id => document.getElementById(id);

/** Je Art: Quelle (Label), Parser, Apply-Workflow. Workshops: mode "apply" = alle freigegebenen (Label ok) übernehmen. */
const KINDS = {
  spaceapi: { label: 'SpaceAPI', query: 'data-update', parse: parseIssue, workflow: 'apply-spaceapi-issues.yml', mode: 'apply-ok' },
  workshops: { label: 'Workshops', query: 'workshop-data', parse: parseWorkshopIssue, workflow: 'apply-workshop-issues.yml', mode: 'apply' },
};
for (const k of Object.values(KINDS)) Object.assign(k, { queue: [], idx: 0, okCount: 0, lastOkAt: 0, timer: null });

let token = '';
try { token = localStorage.getItem('admin-pat') || ''; } catch { /* privater Modus */ }

const state = { tab: 'spaceapi', locations: new Map(), enrichment: {}, busy: false, view: 'site', current: null };
const cur = () => KINDS[state.tab];

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
const websiteOf = p => state.locations.get(p.spaceId)?.link?.url || p.website || '';

// ─── Login ───────────────────────────────────────────────────────────────
function logout() {
  token = '';
  for (const k of Object.values(KINDS)) clearTimeout(k.timer);
  try { localStorage.removeItem('admin-pat'); } catch { /* ignore */ }
  for (const id of ['review', 'done', 'apply', 'logout', 'finish', 'tabs']) $(id).hidden = true;
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
async function loadKind(k) {
  const issues = [];
  for (let page = 1; page <= 5; page++) {
    const batch = await gh(`/repos/${REPO}/issues?labels=${k.query}&state=open&per_page=100&page=${page}`);
    issues.push(...batch);
    if (batch.length < 100) break;
  }
  const parsed = issues.map(k.parse).filter(Boolean);
  k.queue = parsed.filter(p => !p.ok);
  k.okCount = parsed.filter(p => p.ok).length;
  k.lastOkAt = Math.max(0, ...parsed.filter(p => p.ok).map(p => p.updated));
  k.idx = 0;
}

async function start() {
  $('login').hidden = true;
  for (const id of ['logout', 'finish', 'tabs']) $(id).hidden = false;
  try {
    const [, , locs, enr] = await Promise.all([
      loadKind(KINDS.spaceapi), loadKind(KINDS.workshops),
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
  state.tab = KINDS.spaceapi.queue.length || !KINDS.workshops.queue.length ? 'spaceapi' : 'workshops';
  show();
}

for (const btn of document.querySelectorAll('#tabs button')) {
  btn.addEventListener('click', () => { if (!state.busy) { state.tab = btn.dataset.kind; show(); } });
}

// ─── Anzeige ─────────────────────────────────────────────────────────────
const openCount = k => Math.max(0, k.queue.length - k.idx);

function updateBar() {
  for (const [name, k] of Object.entries(KINDS)) {
    const b = $(`tab-${name}`);
    b.textContent = `${k.label} (${openCount(k)})`;
    b.setAttribute('aria-pressed', String(name === state.tab));
    scheduleAutoApply(k);
  }
  const k = cur();
  $('counter').textContent = openCount(k) ? `${k.idx + 1} / ${k.queue.length} · offen: ${openCount(k)}` : '';
  const btn = $('apply');
  btn.hidden = k.okCount === 0;
  btn.textContent = `Übernehmen (${k.okCount})`;
  btn.title = `Wird automatisch gestartet bei ${AUTO_APPLY_COUNT} Vorschlägen oder 1 h ohne neuen ok-Vorschlag`;
}

async function show() {
  const k = cur();
  updateBar();
  closeEdit();
  $('extra').replaceChildren();
  setStatus('');
  const p = k.queue[k.idx];
  if (!p) {
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
  const loc = state.locations.get(p.spaceId);
  $('title').textContent = `#${p.number} · ID ${p.spaceId}${loc ? ` · ${loc.name}` : ''}`;
  $('show-endpoint').hidden = state.tab !== 'spaceapi';
  $('hint').textContent = '';
  if (state.tab === 'spaceapi') await showSpaceApi(p, loc);
  else showWorkshop(p, loc);
}

async function showSpaceApi(p, loc) {
  const cur0 = state.enrichment[String(p.spaceId)]?.spaceapi;
  renderCompare(buildComparison(loc, cur0, null, p.endpoint));
  $('hint').textContent = 'Endpoint wird geladen …';
  setView(loc?.link?.url ? 'site' : 'endpoint');
  // Live-Daten laden (CORS kann scheitern → Hinweis, Vergleich ohne Endpoint-Daten)
  try {
    const res = await fetch(p.endpoint, { signal: AbortSignal.timeout(8000) });
    const data = await res.json();
    if (state.current !== p) return;
    renderCompare(buildComparison(loc, cur0, data, p.endpoint));
    $('hint').textContent = typeof data.space === 'string' ? '' : '⚠️ Kein gültiges SpaceAPI-JSON (space fehlt)';
  } catch {
    if (state.current === p) $('hint').textContent = 'Endpoint nicht direkt ladbar (CORS/Timeout/Fehler) — rechts „Endpoint“ bzw. „im Tab öffnen“ prüfen.';
  }
}

function showWorkshop(p, loc) {
  const current = state.enrichment[String(p.spaceId)]?.workshops;
  renderCompare(buildWorkshopComparison(loc, current, p.workshops));
  setView('site');
  if (Array.isArray(current) && current.length) $('hint').textContent = 'Hinweis: bei uns sind schon Workshops gesetzt — beim Übernehmen wird dieses Issue nur geschlossen.';
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

function viewUrl(view) {
  const p = state.current;
  return view === 'site' ? websiteOf(p) : p.endpoint;
}

function setView(view) {
  state.view = view;
  const url = viewUrl(view);
  $('frame').src = url && /^https?:/.test(url) ? url : 'about:blank';
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
function adjustedBody(body, value) {
  if (state.tab === 'spaceapi') {
    const nb = replaceEndpoint(body, value);
    if (!nb) throw new Error('Ungültige URL oder JSON-Block fehlt');
    return nb;
  }
  const nb = replaceWorkshops(body, value); // value = Array der angehakten Typen
  if (!nb) throw new Error('Mindestens ein Typ nötig oder JSON-Block fehlt');
  return nb;
}

async function act(action, value) {
  const k = cur();
  const p = state.current;
  if (!p || state.busy) return;
  state.busy = true;
  try {
    if (action === 'y') { setStatus('Setze Label …'); await addOk(p.number); k.okCount++; k.lastOkAt = Date.now(); }
    else if (action === 'a') {
      setStatus('Passe Issue an …');
      const issue = await gh(`/repos/${REPO}/issues/${p.number}`);
      const body = adjustedBody(issue.body || '', value);
      await gh(`/repos/${REPO}/issues/${p.number}`, { method: 'PATCH', body: { body } });
      await addOk(p.number);
      k.okCount++;
      k.lastOkAt = Date.now();
    } else if (action === 'n') {
      setStatus('Schließe Issue …');
      await gh(`/repos/${REPO}/issues/${p.number}`, { method: 'PATCH', body: { state: 'closed', state_reason: 'not_planned' } });
    }
    k.idx++;
    state.busy = false;
    show();
  } catch (err) {
    state.busy = false;
    setStatus(`Fehler: ${err.message}`);
  }
}

const checks = () => [...document.querySelectorAll('#edit-checks input')];

// Checkboxen einmalig aus WORKSHOP_TYPES erzeugen
for (const key of Object.keys(WORKSHOP_TYPES)) {
  const label = document.createElement('label');
  const box = document.createElement('input');
  box.type = 'checkbox'; box.value = key;
  label.append(box, key);
  $('edit-checks').append(label);
}

/** Bearbeiten-Formular schließen und zurücksetzen (Freitext/URL, Erkennungshinweis, Haken) */
function closeEdit() {
  $('edit').hidden = true;
  $('edit-free').value = '';
  $('edit-detected').textContent = '';
  $('edit-input').value = '';
  for (const box of checks()) box.checked = false;
}

function openEdit() {
  const p = state.current;
  const isWs = state.tab === 'workshops';
  $('edit-input').hidden = isWs;
  $('edit-input').disabled = isWs; // sonst blockiert „required“ das Absenden
  $('edit-ws').hidden = !isWs;
  $('hint').textContent = '';
  if (isWs) {
    for (const box of checks()) box.checked = p.workshops.includes(box.value);
    $('edit-free').value = '';
    $('edit-detected').textContent = '';
  } else {
    $('edit-input').type = 'url';
    $('edit-input').value = p.endpoint;
  }
  $('edit').hidden = false;
  (isWs ? $('edit-free') : $('edit-input')).focus();
}

// Freitext: erkannte Typen werden angehakt (bestehende Haken bleiben); gespeichert wird erst per Button
$('edit-free').addEventListener('input', () => {
  if (looksLikeUrl($('edit-free').value)) { $('edit-detected').textContent = 'URL erkannt — „Website scannen“ liest sie serverseitig aus.'; return; }
  const found = detectFromText($('edit-free').value);
  for (const box of checks()) if (found.includes(box.value)) box.checked = true;
  $('edit-detected').textContent = found.length ? `erkannt: ${found.join(', ')}` : '';
});

// URL-Scan: Workflow scan-workshop-url.yml liest die Seite aus und kommentiert das Issue; wir holen den Kommentar (Polling) und löschen ihn wieder
const SCAN_POLL_MS = 5000;
const SCAN_MAX_POLLS = 36; // ≈ 3 min
const sleep = ms => new Promise(r => setTimeout(r, ms));

$('edit-scan').addEventListener('click', async () => {
  const p = state.current;
  const free = $('edit-free').value.trim();
  const url = looksLikeUrl(free) ? free : websiteOf(p);
  const note = msg => { $('edit-detected').textContent = msg; };
  if (!url) { note('Keine URL vorhanden — oben eine URL einfügen.'); return; }
  const scanId = [...crypto.getRandomValues(new Uint8Array(4))].map(b => b.toString(16).padStart(2, '0')).join('');
  $('edit-scan').disabled = true;
  try {
    note(`Scan läuft für ${url} … (30–60 s)`);
    await gh(`/repos/${REPO}/actions/workflows/scan-workshop-url.yml/dispatches`, { method: 'POST', body: { ref: 'main', inputs: { url, issue: String(p.number), scan_id: scanId } } });
    for (let i = 0; i < SCAN_MAX_POLLS; i++) {
      await sleep(SCAN_POLL_MS);
      if (state.current !== p || $('edit').hidden) return; // weitergegangen / abgebrochen
      const comments = await gh(`/repos/${REPO}/issues/${p.number}/comments?per_page=100`);
      for (const c of comments) {
        const r = parseScanComment(c.body || '', scanId);
        if (!r) continue;
        gh(`/repos/${REPO}/issues/comments/${c.id}`, { method: 'DELETE' }).catch(() => { /* Kommentar bleibt, harmlos */ });
        if (r.error) { note(`Scan fehlgeschlagen: ${r.error}`); return; }
        for (const box of checks()) if (r.types.includes(box.value)) box.checked = true;
        note(r.types.length ? `Scan (${r.pages} Seite(n)): erkannt: ${r.types.join(', ')} — bitte prüfen, dann „Speichern + ok“.` : `Scan (${r.pages} Seite(n)): nichts erkannt.`);
        return;
      }
    }
    note('Scan hat nicht rechtzeitig geantwortet — Run unter GitHub → Actions → „Scan Workshop URL“ prüfen.');
  } catch (err) {
    note(`Fehler: ${err.message}`);
  } finally {
    $('edit-scan').disabled = false;
  }
});

$('edit').addEventListener('submit', e => {
  e.preventDefault();
  if (state.tab === 'workshops') act('a', checks().filter(b => b.checked).map(b => b.value));
  else act('a', $('edit-input').value.trim());
});

document.addEventListener('keydown', e => {
  if (e.ctrlKey || e.metaKey || e.altKey || $('review').hidden) return;
  if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) { if (e.key === 'Escape') { closeEdit(); e.target.blur(); } return; }
  switch (e.key.toLowerCase()) {
    case 'y': act('y'); break;
    case 'n': act('n'); break;
    case 'l': cur().idx++; show(); break;
    case 'j': setView('site'); break;
    case 'k': if (state.tab === 'spaceapi') setView('endpoint'); break;
    case 'b': e.preventDefault(); openEdit(); break;
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
    state.busy = false;
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
    return { ok: false };
  }
}
$('apply').addEventListener('click', () => applyNow(cur(), false));

// Sitzung beenden: alle ok-Vorschläge beider Arten übernehmen, dann abmelden (Token wird gelöscht)
$('finish').addEventListener('click', async () => {
  if (state.busy) return;
  const notes = [];
  for (const k of Object.values(KINDS)) {
    if (!k.okCount) continue;
    const r = await applyNow(k, false);
    if (!r.ok) return; // Start fehlgeschlagen → Fehlermeldung bleibt, Sitzung bleibt offen
    notes.push(...[...$('status').childNodes].map(n => n.cloneNode(true)), document.createElement('br'));
  }
  logout();
  $('done').hidden = false;
  $('done').replaceChildren('Sitzung beendet. ', ...notes);
});

if (token) start(); else $('login').hidden = false;
