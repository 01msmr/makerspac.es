// admin/admin-lib.js — pure Funktionen der Review-Seite (kein DOM, kein fetch → testbar)

export const REPO = '01msmr/makerspac.es';
export const OK_LABEL = 'ok';

// Gleiche Regexe wie parseIssue() in tools/apply-spaceapi-issues.js
const RE_ID = /\*\*ID:\*\*\s*(\d+)/;
const RE_JSON = /```json\s*(\{[\s\S]*?\})\s*```/;

/** @returns {{ number:number, title:string, spaceId:number, endpoint:string, ok:boolean, url:string } | null} */
export function parseIssue(issue) {
  if (!issue?.title?.startsWith('SpaceAPI:') || issue.pull_request) return null;
  const body = issue.body || '';
  const id = body.match(RE_ID);
  const js = body.match(RE_JSON);
  if (!id || !js) return null;
  let endpoint;
  try { endpoint = JSON.parse(js[1]).spaceapi?.endpoint; } catch { return null; }
  if (typeof endpoint !== 'string' || !endpoint.startsWith('http')) return null;
  return {
    number: issue.number, title: issue.title, spaceId: parseInt(id[1], 10), endpoint,
    ok: (issue.labels || []).some(l => (typeof l === 'string' ? l : l?.name) === OK_LABEL),
    url: issue.html_url,
  };
}

/** Ersetzt spaceapi.endpoint im JSON-Block des Bodys; null wenn kein Block / ungültige URL. */
export function replaceEndpoint(body, endpoint) {
  if (!/^https?:\/\/\S+$/.test(endpoint)) return null;
  const m = body.match(RE_JSON);
  if (!m) return null;
  let obj;
  try { obj = JSON.parse(m[1]); } catch { return null; }
  obj.spaceapi = { ...(obj.spaceapi || {}), endpoint };
  return body.replace(RE_JSON, () => '```json\n' + JSON.stringify(obj, null, 2) + '\n```');
}

export function distanceMeters(lat1, lon1, lat2, lon2) {
  const rad = x => x * Math.PI / 180;
  const a = Math.sin(rad(lat2 - lat1) / 2) ** 2
    + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(rad(lon2 - lon1) / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.sqrt(a));
}

const host = u => { try { return new URL(u).hostname.replace(/^www\./, '').toLowerCase(); } catch { return ''; } };

/**
 * Vergleichszeilen „bei uns“ vs. „Vorschlag“.
 * @param {object|undefined} loc      Eintrag aus locations.json
 * @param {object|undefined} current  loc-enrichment[ID].spaceapi
 * @param {object|null} data          live geladenes SpaceAPI-JSON (null = nicht ladbar)
 * @param {string} endpoint           vorgeschlagener Endpoint
 * @returns {{label:string, ours:string, proposed:string, differs:boolean}[]}
 */
export function buildComparison(loc, current, data, endpoint) {
  const dash = '–';
  const lat = data?.location?.lat, lon = data?.location?.lon;
  const dist = loc?.loc && typeof lat === 'number' && typeof lon === 'number'
    ? Math.round(distanceMeters(loc.loc.lat, loc.loc.long, lat, lon)) : null;
  const lc = data?.state?.lastchange;
  return [
    { label: 'Name', ours: loc?.name ?? dash, proposed: data?.space ?? dash,
      differs: !!data && (loc?.name ?? '').toLowerCase() !== String(data.space ?? '').toLowerCase() },
    { label: 'Stadt', ours: loc?.loc?.city ?? dash, proposed: data?.location?.address ?? dash, differs: false },
    { label: 'Website', ours: loc?.link?.url ?? dash, proposed: data?.url ?? dash,
      differs: !!data?.url && host(data.url) !== host(loc?.link?.url ?? '') },
    { label: 'Koordinaten', ours: loc?.loc ? `${loc.loc.lat}, ${loc.loc.long}` : dash,
      proposed: lat != null ? `${lat}, ${lon}${dist != null ? ` (${dist} m)` : ''}` : dash,
      differs: dist != null && dist > 300 },
    { label: 'Endpoint', ours: current?.endpoint ?? dash, proposed: endpoint,
      differs: (current?.endpoint ?? '') !== endpoint },
    { label: 'Letzte Änderung', ours: dash,
      proposed: typeof lc === 'number' ? new Date(lc * 1000).toISOString().slice(0, 10) : dash, differs: false },
  ];
}
