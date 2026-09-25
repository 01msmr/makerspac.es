// tools/spaceapi-directory-sync.js - SpaceAPI-Directory-Abgleich
// Vergleicht https://directory.spaceapi.io mit den Endpoints in loc-enrichment.json
// und erstellt GitHub Issues mit Vorschlaegen (neuer / geaenderter Endpoint) zur manuellen Pruefung.
// Uebernahme: tools/apply-spaceapi-issues.js
//
// Usage:
//   node tools/spaceapi-directory-sync.js                    # Dry-Run (Default)
//   node tools/spaceapi-directory-sync.js --create-issues    # Issues erstellen
//   node tools/spaceapi-directory-sync.js --limit 5          # Nur 5 Vorschlaege
//   node tools/spaceapi-directory-sync.js --id 42            # Nur Space mit ID 42

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath, pathToFileURL } from 'url';
import { parseIssue } from './apply-spaceapi-issues.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

// === Konfiguration ===

const DIRECTORY_URL = 'https://directory.spaceapi.io/';
const TIMEOUT_MS = 15000;
const CONCURRENCY = 20;
const MAX_MATCH_DISTANCE_M = 300;
const ISSUE_LABEL = 'data-update';
const TITLE_PREFIX = 'SpaceAPI:';

// === Matching (pure) ===

/** Vergleichbare Form einer URL: ohne Schema, www., Trailing-Slash; lowercase */
export function normalizeUrl(url) {
  return String(url).trim().toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/\/+$/, '');
}

function hostOf(url) {
  try { return new URL(url).hostname.toLowerCase().replace(/^www\./, ''); } catch { return null; }
}

function distanceMeters(lat1, lon1, lat2, lon2) {
  const rad = d => d * Math.PI / 180;
  const a = Math.sin(rad(lat2 - lat1) / 2) ** 2
    + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(rad(lon2 - lon1) / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.sqrt(a));
}

/**
 * Ordnet einen Directory-Eintrag einem unserer Spaces zu.
 * Reihenfolge: gleicher Endpoint → gleicher Website-Host → Koordinaten (≤ 300 m, eindeutig).
 * @param {{ endpoint: string, data: any }} entry
 * @returns {{ id: number, reason: 'endpoint'|'domain'|'location' } | null}
 */
export function matchSpace(entry, locations, enrichment) {
  const ep = normalizeUrl(entry.endpoint);
  const byEndpoint = locations.find(l => {
    const ours = enrichment[String(l.ID)]?.spaceapi?.endpoint;
    return ours && normalizeUrl(ours) === ep;
  });
  if (byEndpoint) return { id: byEndpoint.ID, reason: 'endpoint' };

  const host = entry.data?.url && hostOf(entry.data.url);
  if (host) {
    const byDomain = locations.filter(l => l.link?.url && hostOf(l.link.url) === host);
    if (byDomain.length === 1) return { id: byDomain[0].ID, reason: 'domain' };
  }

  const { lat, lon } = entry.data?.location || {};
  if (typeof lat === 'number' && typeof lon === 'number') {
    const near = locations.filter(l =>
      distanceMeters(lat, lon, l.loc.lat, l.loc.long) <= MAX_MATCH_DISTANCE_M);
    if (near.length === 1) return { id: near[0].ID, reason: 'location' };
  }
  return null;
}

function isValidSpaceApi(data) {
  return !!data && typeof data === 'object' && typeof data.space === 'string';
}

function openState(data) {
  const o = data.state?.open;
  if (o === true || o === 1) return true;
  if (o === false || o === 0) return false;
  return null;
}

/**
 * Leitet aus den geladenen Directory-Eintraegen Vorschlaege ab (max. einer pro Space).
 * Kein Vorschlag, wenn unser aktueller Endpoint selbst im Directory steht.
 * @param {{ endpoint: string, data: any }[]} entries - data = geparstes JSON oder null
 */
export function buildProposals(entries, locations, enrichment) {
  const dirEndpoints = new Set(entries.map(e => normalizeUrl(e.endpoint)));
  const byId = new Map();

  for (const entry of entries) {
    if (!isValidSpaceApi(entry.data)) continue;
    const m = matchSpace(entry, locations, enrichment);
    if (!m || m.reason === 'endpoint') continue;

    const current = enrichment[String(m.id)]?.spaceapi?.endpoint || null;
    if (current && dirEndpoints.has(normalizeUrl(current))) continue;

    const existing = byId.get(m.id);
    if (existing) { existing.alternatives.push(entry.endpoint); continue; }

    const loc = locations.find(l => l.ID === m.id);
    byId.set(m.id, {
      id: m.id, name: loc.name, current, proposed: entry.endpoint,
      reason: m.reason, open: openState(entry.data), alternatives: [],
    });
  }
  return [...byId.values()];
}

// === Issues ===

const REASON_TEXT = {
  domain: 'Website-Host im SpaceAPI-JSON = link.url',
  location: `Koordinaten im SpaceAPI-JSON ≤ ${MAX_MATCH_DISTANCE_M} m`,
};

export function buildIssueBody(p) {
  const status = p.open === true ? 'offen' : p.open === false ? 'geschlossen' : 'unbekannt (kein state.open)';
  let body = `## SpaceAPI-Vorschlag: ${p.name}\n\n`;
  body += `**ID:** ${p.id}\n`;
  body += `**Aktuell:** ${p.current || '– (kein Endpoint)'}\n`;
  body += `**Vorgeschlagen:** ${p.proposed}\n`;
  body += `**Match:** ${REASON_TEXT[p.reason] || p.reason}\n`;
  body += `**Live-Status:** ${status}\n\n`;
  if (p.alternatives.length) {
    body += `### Weitere Directory-Eintraege fuer diesen Space\n`;
    body += p.alternatives.map(a => `- ${a}`).join('\n') + '\n';
    body += `_Anderen Endpoint gewuenscht? JSON-Block unten anpassen._\n\n`;
  }
  body += `### Vorgeschlagener Wert\n`;
  body += '```json\n' + JSON.stringify({ spaceapi: { endpoint: p.proposed } }, null, 2) + '\n```\n';
  body += `\n---\n*Automatisch generiert von tools/spaceapi-directory-sync.js — Issue schliessen = ablehnen (wird nicht erneut vorgeschlagen)*`;
  return body;
}

/** true, wenn es fuer diesen Space + URL schon ein Issue gibt (offen oder geschlossen) */
export function isAlreadyProposed(issues, p) {
  return issues.some(issue => {
    const parsed = parseIssue(issue);
    return parsed?.spaceId === p.id && normalizeUrl(parsed.endpoint) === normalizeUrl(p.proposed);
  });
}

function fetchExistingIssues() {
  const raw = execSync(
    `gh issue list --label ${ISSUE_LABEL} --state all --search "${TITLE_PREFIX} in:title" --json number,title,body,state --limit 1000`,
    { cwd: ROOT, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] },
  );
  return JSON.parse(raw);
}

function createIssue(p) {
  const tmpFile = path.join(ROOT, `.issue-body-spaceapi-${p.id}.md`);
  try {
    fs.writeFileSync(tmpFile, buildIssueBody(p), 'utf8');
    const title = `${TITLE_PREFIX} ${p.name}`.replace(/"/g, '\\"');
    execSync(`gh issue create --title "${title}" --body-file "${tmpFile}" --label "${ISSUE_LABEL}"`,
      { cwd: ROOT, stdio: 'pipe' });
    return true;
  } catch (error) {
    console.error(`   Fehler beim Issue-Erstellen: ${error.message}`);
    return false;
  } finally {
    try { fs.unlinkSync(tmpFile); } catch { /* ignore */ }
  }
}

// === Fetch ===

async function fetchJson(url) {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!r.ok) return null;
    return JSON.parse(await r.text());
  } catch {
    return null;
  }
}

async function fetchDirectoryEntries() {
  const directory = await fetchJson(DIRECTORY_URL);
  if (!directory || typeof directory !== 'object') throw new Error(`Directory nicht ladbar: ${DIRECTORY_URL}`);
  const endpoints = Object.values(directory).filter(u => typeof u === 'string' && u.startsWith('http'));

  const entries = [];
  for (let i = 0; i < endpoints.length; i += CONCURRENCY) {
    const batch = endpoints.slice(i, i + CONCURRENCY);
    entries.push(...await Promise.all(batch.map(async endpoint => ({ endpoint, data: await fetchJson(endpoint) }))));
  }
  return entries;
}

// === Main ===

async function main() {
  const args = process.argv.slice(2);
  const createIssues = args.includes('--create-issues');
  const argNum = flag => { const i = args.indexOf(flag); return i !== -1 ? parseInt(args[i + 1], 10) : 0; };
  const limit = argNum('--limit');
  const targetId = argNum('--id');

  console.log('=== SpaceAPI Directory Sync ===');
  console.log(`Modus: ${createIssues ? 'Issues erstellen' : 'Dry-Run (--create-issues zum Erstellen)'}\n`);

  const locations = JSON.parse(fs.readFileSync(path.join(ROOT, 'locations.json'), 'utf8'))
    .filter(l => l.name !== 'TEMPLATE');
  const enrichment = JSON.parse(fs.readFileSync(path.join(ROOT, 'loc-enrichment.json'), 'utf8'));

  const entries = await fetchDirectoryEntries();
  const reachable = entries.filter(e => isValidSpaceApi(e.data)).length;
  console.log(`📡 Directory: ${entries.length} Endpoints, ${reachable} liefern gueltiges SpaceAPI-JSON\n`);

  let proposals = buildProposals(entries, locations, enrichment);
  if (targetId) proposals = proposals.filter(p => p.id === targetId);

  let existing = [];
  try {
    existing = fetchExistingIssues();
  } catch (err) {
    if (createIssues) { console.error('Fehler beim Laden der Issues (gh CLI verfuegbar?):', err.message); process.exit(1); }
    console.warn('⚠️ Bestehende Issues nicht ladbar — Dry-Run ohne Dedup\n');
  }
  const fresh = proposals.filter(p => !isAlreadyProposed(existing, p));
  const todo = limit ? fresh.slice(0, limit) : fresh;

  console.log(`🔎 ${proposals.length} Vorschlaege, davon ${proposals.length - fresh.length} bereits als Issue vorhanden\n`);
  let created = 0;
  for (const p of todo) {
    console.log(`${p.current ? '✏️  Geaendert' : '➕ Neu'}  ID ${p.id} ${p.name} [${p.reason}]`);
    if (p.current) console.log(`     aktuell:      ${p.current}`);
    console.log(`     vorgeschlagen: ${p.proposed}${p.alternatives.length ? `  (+${p.alternatives.length} Alternativen)` : ''}`);
    if (createIssues && createIssue(p)) created++;
  }
  if (createIssues) console.log(`\n✅ ${created} Issues erstellt`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(err => { console.error('❌', err.message); process.exit(1); });
}
