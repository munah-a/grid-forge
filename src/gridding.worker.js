// GridForge GIS – Gridding Web Worker
// Runs all heavy interpolation + contour/hillshade off the main thread.
// Supports split commands: "grid" (interpolation only), "contours" (contour generation only),
// or default (combined grid + contours for backward compatibility).

import {
  idwInterpolation, naturalNeighborInterpolation, minimumCurvature,
  krigingOrdinary, krigingUniversal, krigingSimple,
  rbfInterpolation, tinInterpolation, nearestNeighborInterp,
  movingAverage, polynomialRegression, modifiedShepard, dataMetrics,
  generateContours, generateFilledContours, smoothContours, generateContourLevels,
  computeHillshade, computeGridStats,
  densifyBreakline, densifyProximityBreakline, densifyWallBreakline, applyBoundaryMask,
  delaunayTriangulate, generateTINContours,
} from "./engine.js";
import { idwWebGL } from "./webgl.js";

/** Densify breaklines, merge with data points, and build CDT constraint edge indices.
 *  Wall breaklines skip constraint edges (their dual-point offset structure
 *  already enforces discontinuity via point density). */
function processBreaklines(breaklines, cellSize, dataPoints) {
  const extra = [];
  const constraintEdges = [];

  for (const bl of breaklines) {
    const bType = bl.breaklineType || "standard";
    const startIdx = dataPoints.length + extra.length;
    let blPts;
    if (bType === "proximity") {
      blPts = densifyProximityBreakline(bl.vertices, cellSize, dataPoints);
    } else if (bType === "wall") {
      blPts = densifyWallBreakline(bl.vertices, cellSize);
    } else {
      blPts = densifyBreakline(bl.vertices, cellSize);
    }
    extra.push(...blPts);

    // Build sequential constraint edges for standard and proximity breaklines
    // (wall breaklines use dual-offset points so sequential edges don't apply)
    if (bType !== "wall" && blPts.length >= 2) {
      for (let i = 0; i < blPts.length - 1; i++) {
        constraintEdges.push([startIdx + i, startIdx + i + 1]);
      }
    }
  }

  return { extra, constraintEdges };
}

function handleGrid(points, bounds, gs, boundaries, breaklines) {
  // Validate parameters
  if (!Number.isFinite(bounds.xMin) || !Number.isFinite(bounds.xMax) ||
    !Number.isFinite(bounds.yMin) || !Number.isFinite(bounds.yMax)) {
    self.postMessage({ type: "error", message: "Invalid bounds: all values must be finite numbers" });
    return;
  }
  if (!Number.isFinite(gs.resolution) || gs.resolution < 2 || gs.resolution > 4000) {
    self.postMessage({ type: "error", message: `Invalid resolution: ${gs.resolution}. Must be between 2 and 4000.` });
    return;
  }
  if (!Number.isFinite(gs.padding) || gs.padding < 0 || gs.padding > 500) {
    self.postMessage({ type: "error", message: `Invalid padding: ${gs.padding}. Must be between 0 and 500.` });
    return;
  }

  self.postMessage({ type: "progress", percent: 0, stage: "Preparing grid…" });

  const pad = gs.padding / 100;
  const dx = (bounds.xMax - bounds.xMin) * pad;
  const dy = (bounds.yMax - bounds.yMin) * pad;
  const nx = gs.resolution;
  const ny = Math.round(nx * ((bounds.yMax - bounds.yMin + 2 * dy) / (bounds.xMax - bounds.xMin + 2 * dx))) || nx;
  const gridX = Array.from({ length: nx }, (_, i) => bounds.xMin - dx + i * (bounds.xMax - bounds.xMin + 2 * dx) / (nx - 1));
  const gridY = Array.from({ length: ny }, (_, j) => bounds.yMin - dy + j * (bounds.yMax - bounds.yMin + 2 * dy) / (ny - 1));

  // Densify breaklines (type-aware), merge with input points, and build constraint edges.
  // For non-TIN algorithms, use finer densification (cellSize / 3) since they can't
  // enforce constraint edges and rely solely on point density along breaklines.
  let inputPts = points;
  let constraintEdges = null;
  if (breaklines && breaklines.length > 0) {
    const cellSize = (gridX[1] - gridX[0]) || 1;
    const useTIN = gs.algorithm === "tin";
    const densifySize = useTIN ? cellSize : cellSize / 3;
    const result = processBreaklines(breaklines, densifySize, points);
    inputPts = [...points, ...result.extra];
    if (useTIN && result.constraintEdges.length > 0) constraintEdges = result.constraintEdges;
  }

  self.postMessage({ type: "progress", percent: 10, stage: "Interpolating…" });

  // Run the selected algorithm
  let grid;
  let usedGPU = false;
  const a = gs.algorithm;
  if (a === "idw" && gs.useGPU) {
    self.postMessage({ type: "progress", percent: 12, stage: "Attempting GPU acceleration…" });
    try {
      grid = idwWebGL(inputPts, gridX, gridY, { power: gs.power, searchRadius: gs.searchRadius || Infinity });
    } catch (e) { grid = null; }
    if (grid) {
      usedGPU = true;
      self.postMessage({ type: "progress", percent: 55, stage: "GPU interpolation complete" });
    } else {
      self.postMessage({ type: "progress", percent: 12, stage: "GPU unavailable, using CPU…" });
    }
  }
  if (!grid && a === "idw") grid = idwInterpolation(inputPts, gridX, gridY, { power: gs.power, searchRadius: gs.searchRadius || Infinity, maxNeighbors: gs.maxNeighbors || 0 });
  else if (a === "natural") grid = naturalNeighborInterpolation(inputPts, gridX, gridY);
  else if (a === "mincurv") grid = minimumCurvature(inputPts, gridX, gridY, { tension: gs.tension, maxIterations: gs.maxIterations, convergence: gs.convergence, relaxation: gs.relaxation });
  else if (a === "kriging_ord") grid = krigingOrdinary(inputPts, gridX, gridY, { model: gs.variogramModel, sill: gs.sill || undefined, range: gs.range || undefined, nugget: gs.nugget, maxNeighbors: gs.maxNeighbors });
  else if (a === "kriging_uni") grid = krigingUniversal(inputPts, gridX, gridY, { model: gs.variogramModel, sill: gs.sill || undefined, range: gs.range || undefined, nugget: gs.nugget, maxNeighbors: gs.maxNeighbors, driftOrder: gs.driftOrder });
  else if (a === "kriging_sim") grid = krigingSimple(inputPts, gridX, gridY, { model: gs.variogramModel, sill: gs.sill || undefined, range: gs.range || undefined, nugget: gs.nugget, maxNeighbors: gs.maxNeighbors, knownMean: gs.knownMean || undefined });
  else if (a === "rbf") grid = rbfInterpolation(inputPts, gridX, gridY, { basis: gs.rbfBasis, shapeParam: gs.rbfShape, smoothing: gs.rbfSmoothing });
  else if (a === "tin") grid = tinInterpolation(inputPts, gridX, gridY, {
    constraintEdges,
    onProgress: (p) => self.postMessage({ type: "progress", percent: Math.round(10 + p * 50), stage: p < 0.7 ? "Triangulating…" : p < 0.8 ? "Indexing triangles…" : "Interpolating grid…" }),
  });
  else if (a === "nearest") grid = nearestNeighborInterp(inputPts, gridX, gridY, { searchRadius: gs.searchRadius || Infinity });
  else if (a === "moving_avg") grid = movingAverage(inputPts, gridX, gridY, { searchRadius: gs.searchRadius || undefined, minPoints: gs.minPoints, weighted: gs.weighted });
  else if (a === "poly_reg") grid = polynomialRegression(inputPts, gridX, gridY, { order: gs.polyOrder });
  else if (a === "mod_shepard") grid = modifiedShepard(inputPts, gridX, gridY, { power: gs.power, neighbors: gs.shepardNeighbors });
  else if (a === "data_metrics") grid = dataMetrics(inputPts, gridX, gridY, { metric: gs.dataMetric });
  else grid = idwInterpolation(inputPts, gridX, gridY, { power: gs.power });

  self.postMessage({ type: "progress", percent: 60, stage: "Applying masks…" });

  // Apply boundary masks
  if (boundaries && boundaries.length > 0) {
    applyBoundaryMask(grid, gridX, gridY, boundaries);
  }

  const stats = computeGridStats(grid);

  self.postMessage({ type: "progress", percent: 85, stage: "Computing hillshade…" });

  // Hillshade
  const cellDx = nx > 1 ? gridX[1] - gridX[0] : 1;
  const cellDy = ny > 1 ? gridY[1] - gridY[0] : 1;
  const hillshade = computeHillshade(grid, nx, ny, cellDx, cellDy, gs.hillAzimuth, gs.hillAltitude, gs.hillZFactor);

  self.postMessage({ type: "progress", percent: 95, stage: "Finishing…" });

  self.postMessage({
    type: "gridResult",
    grid: Array.from(grid),
    gridX,
    gridY,
    nx,
    ny,
    stats: { ...stats, nx, ny, cells: nx * ny },
    hillshade: Array.from(hillshade),
    zMin: stats.min,
    zMax: stats.max,
  });
}

function handleContours({ grid, gridX, gridY, nx, ny, stats, contourInterval, contourMethod, contourSmoothing, points, breaklines }) {
  self.postMessage({ type: "progress", percent: 0, stage: "Generating contours…" });

  const interval = contourInterval || (stats.max - stats.min) / 10;
  const levels = generateContourLevels(stats.min, stats.max, interval);

  let contours;
  if (contourMethod === "tin" && points && points.length > 0) {
    self.postMessage({ type: "progress", percent: 10, stage: "Preparing TIN points…" });

    // Merge densified breakline points with data points and build constraint edges
    let tinPts = points;
    let constraintEdges = null;
    if (breaklines && breaklines.length > 0) {
      const cellSize = gridX.length > 1 ? Math.abs(gridX[1] - gridX[0]) : 1;
      const result = processBreaklines(breaklines, cellSize, points);
      tinPts = [...points, ...result.extra];
      if (result.constraintEdges.length > 0) constraintEdges = result.constraintEdges;
    }

    self.postMessage({ type: "progress", percent: 20, stage: "Triangulating for TIN contours…" });
    const tin = delaunayTriangulate(tinPts, null, constraintEdges);
    self.postMessage({ type: "progress", percent: 50, stage: "Tracing TIN contours…" });
    contours = generateTINContours(tin, levels);
    if (contourSmoothing > 0) contours = smoothContours(contours, contourSmoothing);
  } else {
    self.postMessage({ type: "progress", percent: 30, stage: "Tracing grid contours…" });
    const gridArr = grid instanceof Float64Array ? grid : new Float64Array(grid);
    contours = generateContours(gridArr, gridX, gridY, levels);
    if (contourSmoothing > 0) contours = smoothContours(contours, contourSmoothing);
  }

  self.postMessage({ type: "progress", percent: 70, stage: "Generating filled contours…" });
  const gridArr = grid instanceof Float64Array ? grid : new Float64Array(grid);
  const filledContours = generateFilledContours(gridArr, gridX, gridY, levels);

  self.postMessage({ type: "progress", percent: 95, stage: "Finishing…" });

  self.postMessage({
    type: "contourResult",
    contours,
    filledContours,
  });
}

self.onmessage = (e) => {
  const data = e.data;
  const msgType = data.type || "default";

  try {
    if (msgType === "grid") {
      handleGrid(data.points, data.bounds, data.gs, data.boundaries, data.breaklines);
    } else if (msgType === "contours") {
      handleContours(data);
    } else {
      // Default: backward-compatible combined operation
      // Run grid first
      handleGrid(data.points, data.bounds, data.gs, data.boundaries, data.breaklines);
    }
  } catch (err) {
    self.postMessage({ type: "error", message: err.message || String(err) });
  }
};
