// Coordinate transform tests — verify Y-flipped (north-up) world↔screen conversions
// These test the pure math formulas used in App.jsx's rendering pipeline.

import { describe, it, expect } from "vitest";

// ── Helpers: extract the transform formulas from App.jsx as pure functions ────

/** World → Screen X:  worldX * scale + vx */
const worldToScreenX = (worldX, vx, scale) => worldX * scale + vx;

/** World → Screen Y:  vy - worldY * scale  (Y-flipped: higher world Y → smaller screen Y) */
const worldToScreenY = (worldY, vy, scale) => vy - worldY * scale;

/** Screen → World X:  (screenX - vx) / scale */
const screenToWorldX = (screenX, vx, scale) => (screenX - vx) / scale;

/** Screen → World Y:  (vy - screenY) / scale */
const screenToWorldY = (screenY, vy, scale) => (vy - screenY) / scale;

/**
 * fitView — computes view state to center data in viewport.
 * From App.jsx line 544-549.
 */
function fitView(w, h, xMin, xMax, yMin, yMax) {
  const dW = (xMax - xMin) || 1;
  const dH = (yMax - yMin) || 1;
  const scale = Math.min(w / (dW * 1.2), h / (dH * 1.2));
  return {
    x: w / 2 - (xMin + dW / 2) * scale,
    y: h / 2 + (yMin + dH / 2) * scale,
    scale,
  };
}

/**
 * Zoom with pivot — keeps the world point under cursor fixed.
 * From App.jsx line 631-632.
 */
function zoomAtPoint(mx, my, prevX, prevY, prevScale, newScale) {
  return {
    scale: newScale,
    x: mx - (mx - prevX) * (newScale / prevScale),
    y: my - (my - prevY) * (newScale / prevScale),
  };
}

/**
 * Pan — drag offsets applied directly.
 * From App.jsx line 2522.
 */
function pan(startViewX, startViewY, deltaScreenX, deltaScreenY) {
  return { x: startViewX + deltaScreenX, y: startViewY + deltaScreenY };
}


describe("World ↔ Screen transforms", () => {
  const vx = 100, vy = 500, scale = 2;

  it("World→Screen Y: north (higher Y) → smaller screen Y (top)", () => {
    const northY = 200, southY = 100;
    const screenNorth = worldToScreenY(northY, vy, scale);
    const screenSouth = worldToScreenY(southY, vy, scale);
    expect(screenNorth).toBeLessThan(screenSouth);
    expect(screenNorth).toBe(vy - northY * scale); // 500 - 400 = 100
    expect(screenSouth).toBe(vy - southY * scale); // 500 - 200 = 300
  });

  it("World→Screen X: positive right, unchanged convention", () => {
    expect(worldToScreenX(50, vx, scale)).toBe(50 * 2 + 100); // 200
    expect(worldToScreenX(0, vx, scale)).toBe(vx);
  });

  it("Screen→World Y: inverse of World→Screen Y", () => {
    const screenY = 100;
    expect(screenToWorldY(screenY, vy, scale)).toBe((vy - screenY) / scale); // (500-100)/2 = 200
  });

  it("Screen→World X: inverse of World→Screen X", () => {
    const screenX = 200;
    expect(screenToWorldX(screenX, vx, scale)).toBe((screenX - vx) / scale); // (200-100)/2 = 50
  });

  it("Round-trip: world→screen→world is identity", () => {
    const wx = 42.5, wy = 137.8;
    const sx = worldToScreenX(wx, vx, scale);
    const sy = worldToScreenY(wy, vy, scale);
    expect(screenToWorldX(sx, vx, scale)).toBeCloseTo(wx, 10);
    expect(screenToWorldY(sy, vy, scale)).toBeCloseTo(wy, 10);
  });

  it("Round-trip: screen→world→screen is identity", () => {
    const sx = 300, sy = 250;
    const wx = screenToWorldX(sx, vx, scale);
    const wy = screenToWorldY(sy, vy, scale);
    expect(worldToScreenX(wx, vx, scale)).toBeCloseTo(sx, 10);
    expect(worldToScreenY(wy, vy, scale)).toBeCloseTo(sy, 10);
  });
});


describe("fitView", () => {
  it("centers data in viewport with correct Y formula", () => {
    const w = 800, h = 600;
    const v = fitView(w, h, 100, 200, 50, 150);
    // Data center: (150, 100)
    const dataCenterX = 150, dataCenterY = 100;
    const screenCX = worldToScreenX(dataCenterX, v.x, v.scale);
    const screenCY = worldToScreenY(dataCenterY, v.y, v.scale);
    expect(screenCX).toBeCloseTo(w / 2, 5);
    expect(screenCY).toBeCloseTo(h / 2, 5);
  });

  it("scale is based on 1.2× padded bounds", () => {
    const w = 600, h = 400;
    const v = fitView(w, h, 0, 100, 0, 100);
    expect(v.scale).toBeCloseTo(Math.min(600 / 120, 400 / 120), 10);
  });

  it("handles degenerate (zero-size) bounds", () => {
    const v = fitView(800, 600, 50, 50, 50, 50);
    expect(v.scale).toBeGreaterThan(0);
    expect(Number.isFinite(v.x)).toBe(true);
    expect(Number.isFinite(v.y)).toBe(true);
  });
});


describe("Zoom with pivot", () => {
  it("keeps world point under cursor unchanged after zoom", () => {
    const prevX = 100, prevY = 500, prevScale = 2;
    const mx = 300, my = 200; // cursor on screen
    const newScale = 4;

    // World point under cursor before zoom
    const wxBefore = screenToWorldX(mx, prevX, prevScale);
    const wyBefore = screenToWorldY(my, prevY, prevScale);

    const nv = zoomAtPoint(mx, my, prevX, prevY, prevScale, newScale);

    // World point under cursor after zoom
    const wxAfter = screenToWorldX(mx, nv.x, nv.scale);
    const wyAfter = screenToWorldY(my, nv.y, nv.scale);

    expect(wxAfter).toBeCloseTo(wxBefore, 10);
    expect(wyAfter).toBeCloseTo(wyBefore, 10);
  });

  it("scale updates correctly", () => {
    const nv = zoomAtPoint(0, 0, 100, 200, 2, 4);
    expect(nv.scale).toBe(4);
  });
});


describe("Pan", () => {
  it("drag direction: screen delta applied directly", () => {
    const result = pan(100, 200, 50, -30);
    expect(result.x).toBe(150);
    expect(result.y).toBe(170);
  });

  it("dragging right increases view.x (shifts world left)", () => {
    const result = pan(0, 0, 100, 0);
    expect(result.x).toBe(100);
  });

  it("dragging down increases view.y (shifts world up = south in north-up)", () => {
    const result = pan(0, 0, 0, 100);
    expect(result.y).toBe(100);
  });
});


describe("Grid Y range (viewport coverage)", () => {
  it("screen top→world and screen bottom→world cover full viewport", () => {
    const vx = 100, vy = 500, scale = 2, w = 800, h = 600;
    // From App.jsx line 1321-1322 (geographic mode):
    // worldXmin = -vx/scale, worldXmax = (w-vx)/scale
    // worldYmin = (vy-h)/scale, worldYmax = vy/scale
    const worldYmin = (vy - h) / scale; // (500-600)/2 = -50
    const worldYmax = vy / scale;        // 500/2 = 250

    // Verify these map back to screen edges
    const screenTop = worldToScreenY(worldYmax, vy, scale);
    const screenBot = worldToScreenY(worldYmin, vy, scale);
    expect(screenTop).toBeCloseTo(0, 10);
    expect(screenBot).toBeCloseTo(h, 10);
  });
});


describe("Tile sTop/sBot ordering", () => {
  it("sN < sS when north > south (north at top of screen)", () => {
    const vy = 500, scale = 2;
    const nth = 80, sth = 40; // nth > sth in world coords
    // From App.jsx line 1415-1416:
    const sN = vy - nth * scale; // 500 - 160 = 340
    const sS = vy - sth * scale; // 500 - 80 = 420
    expect(sN).toBeLessThan(sS); // north pixel < south pixel = north on top
  });
});
