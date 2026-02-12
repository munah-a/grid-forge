#!/usr/bin/env node
// GridForge – 5M grid-cell benchmark for all algorithms
// Usage: node bench.mjs

import { readFileSync } from "fs";
import { performance } from "perf_hooks";

import {
  idwInterpolation, naturalNeighborInterpolation, minimumCurvature,
  krigingOrdinary, krigingUniversal, krigingSimple,
  rbfInterpolation, tinInterpolation, nearestNeighborInterp,
  movingAverage, polynomialRegression, modifiedShepard, dataMetrics,
  computeGridStats,
} from "./src/engine.js";

// ── Parse data ──────────────────────────────────────────────────────────
const raw = readFileSync("docs/IS03_05.05.2025.txt", "utf8").trim().split("\n");
const points = [];
for (const line of raw) {
  const cols = line.split(",");
  const x = +cols[1], y = +cols[2], z = +cols[3];
  if (!isNaN(x) && !isNaN(y) && !isNaN(z)) points.push({ x, y, z });
}
console.log(`Points loaded: ${points.length}`);

// ── Build grid axes (≈5M cells) ─────────────────────────────────────────
let xMin = Infinity, xMax = -Infinity, yMin = Infinity, yMax = -Infinity;
for (const p of points) {
  if (p.x < xMin) xMin = p.x; if (p.x > xMax) xMax = p.x;
  if (p.y < yMin) yMin = p.y; if (p.y > yMax) yMax = p.y;
}
const pad = 0.02;
const dx = (xMax - xMin) * pad, dy = (yMax - yMin) * pad;
xMin -= dx; xMax += dx; yMin -= dy; yMax += dy;
const xRange = xMax - xMin, yRange = yMax - yMin;
const aspect = xRange / yRange;
const ny = Math.round(Math.sqrt(5_000_000 / aspect));
const nx = Math.round(ny * aspect);
const gridX = Array.from({ length: nx }, (_, i) => xMin + i * xRange / (nx - 1));
const gridY = Array.from({ length: ny }, (_, j) => yMin + j * yRange / (ny - 1));
console.log(`Grid: ${nx} × ${ny} = ${(nx * ny / 1e6).toFixed(2)}M cells\n`);

// ── Benchmark runner ────────────────────────────────────────────────────
const TIMEOUT_MS = 5 * 60 * 1000; // 5 min per algorithm

async function bench(name, fn) {
  process.stdout.write(`${name.padEnd(22)} ... `);
  const t0 = performance.now();
  try {
    const grid = fn();
    const elapsed = ((performance.now() - t0) / 1000).toFixed(2);
    const stats = computeGridStats(grid);
    const nanPct = ((stats.nullCount / (nx * ny)) * 100).toFixed(1);
    console.log(`${elapsed}s  | z: [${stats.min.toFixed(3)}, ${stats.max.toFixed(3)}]  mean=${stats.mean.toFixed(3)}  NaN=${nanPct}%`);
  } catch (err) {
    const elapsed = ((performance.now() - t0) / 1000).toFixed(2);
    console.log(`ERROR (${elapsed}s): ${err.message}`);
  }
}

// ── Run all algorithms ──────────────────────────────────────────────────
console.log("Algorithm              Time     Stats");
console.log("─".repeat(80));

await bench("IDW (p=2)", () =>
  idwInterpolation(points, gridX, gridY, { power: 2, maxNeighbors: 16 }));

await bench("IDW (p=3, sr=200)", () =>
  idwInterpolation(points, gridX, gridY, { power: 3, searchRadius: 200, maxNeighbors: 24 }));

await bench("Natural Neighbor", () =>
  naturalNeighborInterpolation(points, gridX, gridY));

await bench("Minimum Curvature", () =>
  minimumCurvature(points, gridX, gridY, { tension: 0.25, maxIterations: 100, convergence: 0.01 }));

await bench("Kriging Ordinary", () =>
  krigingOrdinary(points, gridX, gridY, { model: "spherical", maxNeighbors: 16 }));

await bench("Kriging Universal", () =>
  krigingUniversal(points, gridX, gridY, { model: "spherical", maxNeighbors: 16 }));

await bench("Kriging Simple", () =>
  krigingSimple(points, gridX, gridY, { model: "spherical", maxNeighbors: 16 }));

await bench("RBF (multiquadric)", () =>
  rbfInterpolation(points, gridX, gridY, { basis: "multiquadric", shapeParam: 1, smoothing: 0.01 }));

await bench("TIN", () =>
  tinInterpolation(points, gridX, gridY, {
    onProgress: (p) => { if (p < 0.01 || (p * 100) % 10 < 1.5) process.stdout.write(""); }
  }));

await bench("Nearest Neighbor", () =>
  nearestNeighborInterp(points, gridX, gridY, { searchRadius: Infinity }));

await bench("Moving Average", () =>
  movingAverage(points, gridX, gridY, { searchRadius: 100, minPoints: 1, weighted: true }));

await bench("Polynomial Reg (o=2)", () =>
  polynomialRegression(points, gridX, gridY, { order: 2 }));

await bench("Polynomial Reg (o=3)", () =>
  polynomialRegression(points, gridX, gridY, { order: 3 }));

await bench("Modified Shepard", () =>
  modifiedShepard(points, gridX, gridY, { power: 2, neighbors: 12 }));

await bench("Data Metrics (mean)", () =>
  dataMetrics(points, gridX, gridY, { metric: "mean" }));

console.log("\nDone.");
