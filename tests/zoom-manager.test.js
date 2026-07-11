// tests/zoom-manager.test.js
// Testet den Polygon-Fit: alle Pins der aktiven Auswahl müssen einzeln in der
// EINEN rechtwinkligen Freifläche liegen (Viewport minus Logo oben links minus
// Search/Dropdown oben rechts) — nicht nur die Bounding-Box in einem Teilrechteck.
// Läuft mit: node --test tests/zoom-manager.test.js

// ─── Browser-Stubs (vor allen Imports setzen) ─────────────────────────────
const noop = () => {};
global.location = { hash: '', hostname: 'localhost', search: '' };
global.window = {
  innerWidth: 1024,
  location: global.location,
  matchMedia: () => ({ matches: false, addEventListener: noop, removeEventListener: noop }),
  addEventListener: noop,
  removeEventListener: noop,
};
global.document = {
  documentElement: { style: { setProperty: noop }, classList: { contains: () => false } },
  getElementById: () => null,
  querySelector: () => null,
  querySelectorAll: () => [],
  addEventListener: noop,
  removeEventListener: noop,
  dispatchEvent: noop,
  body: { appendChild: noop, classList: { contains: () => false } },
};
global.localStorage = { getItem: () => null, setItem: noop, removeItem: noop };
Object.defineProperty(global, 'navigator', { value: { languages: ['de-DE'], language: 'de-DE' }, writable: true });

// ─── Modul-Imports ────────────────────────────────────────────────────────
import { test, before } from 'node:test';
import assert from 'node:assert/strict';

let computePolygonFit, findFitTranslation;
before(async () => {
  const m = await import('../zoom-manager.js');
  computePolygonFit = m.computePolygonFit;
  findFitTranslation = m.findFitTranslation;
});

// ─── Helfer ───────────────────────────────────────────────────────────────
const M = { top: 8, right: 8, bottom: 8, left: 8 };

/** Prüft, dass ein platzierter Punkt in der Freifläche liegt (Polygon-Check). */
function inFreeArea(p, mapW, mapH, leftUI, rightUI, m = M) {
  if (p.x < m.left || p.x > mapW - m.right) return false;
  if (p.y < m.top || p.y > mapH - m.bottom) return false;
  if (leftUI && p.x < leftUI.right && p.y < leftUI.bottom) return false;
  if (rightUI && p.x > rightUI.left && p.y < rightUI.bottom) return false;
  return true;
}

/** Wendet Fit-Ergebnis auf die Punkte an und prüft alle gegen das Polygon. */
function assertAllInFreeArea(pts, fit, mapW, mapH, leftUI, rightUI, m = M) {
  for (const p of pts) {
    const placed = { x: p.x * fit.scale + fit.tx, y: p.y * fit.scale + fit.ty };
    assert.ok(
      inFreeArea(placed, mapW, mapH, leftUI, rightUI, m),
      `Punkt (${p.x},${p.y}) → (${placed.x.toFixed(1)},${placed.y.toFixed(1)}) liegt außerhalb der Freifläche (scale=${fit.scale.toFixed(3)})`
    );
  }
}

// ─── Tests ────────────────────────────────────────────────────────────────

test('ohne UI-Flächen: voller Viewport-Fit, Punkte zentriert', () => {
  const pts = [{ x: 0, y: 0 }, { x: 100, y: 100 }];
  const fit = computePolygonFit(pts, 1000, 500, null, null, M);
  // sMax = min(984/100, 484/100) = 4.84
  assert.ok(Math.abs(fit.scale - 4.84) < 1e-9);
  assertAllInFreeArea(pts, fit, 1000, 500, null, null);
  // zentriert: Mitte der Punkte auf Viewport-Mitte
  const cx = (0 + 100) / 2 * fit.scale + fit.tx;
  assert.ok(Math.abs(cx - 500) < 1e-6);
});

test('breite Pin-Reihe: landet im Band unterhalb beider UI-Flächen', () => {
  const leftUI = { right: 300, bottom: 100 };
  const rightUI = { left: 700, bottom: 400 };
  const pts = [{ x: 0, y: 0 }, { x: 500, y: 0 }, { x: 1000, y: 0 }];
  const fit = computePolygonFit(pts, 1000, 800, leftUI, rightUI, M);
  assertAllInFreeArea(pts, fit, 1000, 800, leftUI, rightUI);
  // volle Breite nutzbar → Skala nur durch Breite begrenzt
  assert.ok(Math.abs(fit.scale - 984 / 1000) < 1e-9);
  // alle Punkte unterhalb der Dropdown-Unterkante
  assert.ok(pts.every(p => p.y * fit.scale + fit.ty >= rightUI.bottom));
});

test('EINE Form: diagonale Pins verteilen sich über die Polygon-Arme — höherer Zoom als jedes Teilrechteck', () => {
  // Logo links bis (300,300), Dropdown rechts ab x=700 bis y=300 → T-förmige Freifläche
  const leftUI = { right: 300, bottom: 300 };
  const rightUI = { left: 700, bottom: 300 };
  const mapW = 1000, mapH = 800;
  // Diagonale: Punkt A oben, Punkt B unten rechts
  const pts = [{ x: 0, y: 0 }, { x: 600, y: 700 }];
  const fit = computePolygonFit(pts, mapW, mapH, leftUI, rightUI, M);
  assertAllInFreeArea(pts, fit, mapW, mapH, leftUI, rightUI);

  // Bestes EINZELNES Teilrechteck (Bounding-Box-Ansatz):
  // Mittelspalte: 384×784 → scale 0.64 · Band unten: 984×484 → scale ≈ 0.69
  const bestSingleRectScale = Math.max(
    Math.min(384 / 600, 784 / 700),
    Math.min(984 / 600, 484 / 700)
  );
  // Polygon-Fit erreicht die volle Viewport-Schranke min(984/600, 784/700) ≈ 1.12:
  // A steht in der Mittelspalte, B im breiten Bereich darunter
  assert.ok(fit.scale > bestSingleRectScale + 0.3,
    `Polygon-Fit (${fit.scale.toFixed(3)}) muss deutlich über Einzelrechteck-Fit (${bestSingleRectScale.toFixed(3)}) liegen`);
  // Punkt A liegt in der Mittelspalte (zwischen Logo und Dropdown)
  const ax = pts[0].x * fit.scale + fit.tx;
  assert.ok(ax >= leftUI.right && ax <= rightUI.left);
});

test('passt nicht bei voller Größe: Binärsuche findet kleineren Maßstab, alle Pins im Polygon', () => {
  // Obere Hälfte komplett belegt (Rects überlappen) → nur unteres Band frei
  const leftUI = { right: 200, bottom: 200 };
  const rightUI = { left: 200, bottom: 200 };
  const mapW = 400, mapH = 400;
  const pts = [{ x: 0, y: 0 }, { x: 300, y: 300 }];
  const fit = computePolygonFit(pts, mapW, mapH, leftUI, rightUI, M);
  assertAllInFreeArea(pts, fit, mapW, mapH, leftUI, rightUI);
  // Band: 384 breit × 192 hoch → scale = 192/300 = 0.64
  assert.ok(Math.abs(fit.scale - 0.64) < 0.01);
});

test('maxScale wird respektiert (Max-Zoom-Kappung)', () => {
  const pts = [{ x: 0, y: 0 }, { x: 10, y: 10 }];
  const fit = computePolygonFit(pts, 1000, 800, null, null, { ...M, maxScale: 2 });
  assert.equal(fit.scale, 2);
  assertAllInFreeArea(pts, fit, 1000, 800, null, null);
});

test('findFitTranslation: unlösbar → null (Punkte breiter als Viewport)', () => {
  const pts = [{ x: 0, y: 0 }, { x: 2000, y: 0 }];
  assert.equal(findFitTranslation(pts, 1000, 800, null, null, M), null);
});
