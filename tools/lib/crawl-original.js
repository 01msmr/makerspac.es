// tools/lib/crawl-original.js — „ursprünglicher Crawler-Fund“ eines Vorschlags merken (pure; läuft im Admin UND in den Crawlern)
//
// Ändert der Admin einen Vorschlag (andere Uhrzeit, anderer Workshop …), wird der JSON-Block des Issues überschrieben. Damit der
// Crawler seinen ursprünglichen Fund danach nicht erneut vorschlägt, steht der Originalblock einmalig als Zeile
//   **Crawler-Fund:** "<ursprünglicher JSON-Block als String>"
// im Issue. decideProposal (crawl-selection.js) vergleicht den Fund auch mit diesem Original (originalOf).

const RE_BLOCK = /```json\s*([\s\S]*?)\s*```/;
const RE_MARK = /\n*\*\*Crawler-Fund:\*\*\s*("(?:[^"\\]|\\.)*")[ \t]*$/m;

/** Body mit Marker für den Originalblock aus `origBody` (nur beim ersten Ändern; bestehender Marker bleibt). */
export function markOriginal(body, origBody) {
  if (RE_MARK.test(body)) return body;
  const m = String(origBody ?? '').match(RE_BLOCK);
  if (!m) return body;
  return `${body.trimEnd()}\n\n**Crawler-Fund:** ${JSON.stringify(m[1])}\n`;
}

/** @returns {string|null} synthetischer Body mit dem ursprünglichen JSON-Block (lesbar für proposalFromIssue), sonst null */
export function originalOf(body) {
  const m = String(body ?? '').match(RE_MARK);
  if (!m) return null;
  try { return '```json\n' + JSON.parse(m[1]) + '\n```'; } catch { return null; }
}
