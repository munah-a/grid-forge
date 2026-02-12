// GridForge GIS – Gridding Web Worker
// Runs all heavy interpolation + contour/hillshade off the main thread.

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

self.onmessage = (e) => {
  const {
    points, bounds, gs, boundaries, breaklines
  } = e.data;

  try {
    self.postMessage({ type: "progress", percent: 0, stage: "Preparing grid…" });

    const pad = gs.padding / 100;
    const dx = (bounds.xMax - bounds.xMin) * pad;
    const dy = (bounds.yMax - bounds.yMin) * pad;
    const nx = gs.resolution;
    const ny = Math.round(nx * ((bounds.yMax - bounds.yMin + 2 * dy) / (bounds.xMax - bounds.xMin + 2 * dx))) || nx;
    const gridX = Array.from({ length: nx }, (_, i) => bounds.xMin - dx + i * (bounds.xMax - bounds.xMin + 2 * dx) / (nx - 1));
    const gridY = Array.from({ length: ny }, (_, j) => bounds.yMin - dy + j * (bounds.yMax - bounds.yMin + 2 * dy) / (ny - 1));

    // Densify breaklines (type-aware) and merge with input points
    let inputPts = points;
    if (breaklines && breaklines.length > 0) {
      const cellSize = (gridX[1] - gridX[0]) || 1;
      let extra = [];
      for (const bl of breaklines) {
        const bType = bl.breaklineType || "standard";
        if (bType === "proximity") {
          extra = extra.concat(densifyProximityBreakline(bl.vertices, cellSize, points));
        } else if (bType === "wall") {
          extra = extra.concat(densifyWallBreakline(bl.vertices, cellSize));
        } else {
          extra = extra.concat(densifyBreakline(bl.vertices, cellSize));
        }
      }
      inputPts = [...points, ...extra];
    }

    self.postMessage({ type: "progress", percent: 10, stage: "Interpolating…" });

    // Run the selected algorithm
    let grid;
    const a = gs.algorithm;
    if (a === "idw") grid = idwInterpolation(inputPts, gridX, gridY, { power: gs.power, searchRadius: gs.searchRadius || Infinity, maxNeighbors: gs.maxNeighbors || 0 });
    else if (a === "natural") grid = naturalNeighborInterpolation(inputPts, gridX, gridY);
    else if (a === "mincurv") grid = minimumCurvature(inputPts, gridX, gridY, { tension: gs.tension, maxIterations: gs.maxIterations, convergence: gs.convergence, relaxation: gs.relaxation });
    else if (a === "kriging_ord") grid = krigingOrdinary(inputPts, gridX, gridY, { model: gs.variogramModel, sill: gs.sill || undefined, range: gs.range || undefined, nugget: gs.nugget, maxNeighbors: gs.maxNeighbors });
    else if (a === "kriging_uni") grid = krigingUniversal(inputPts, gridX, gridY, { model: gs.variogramModel, sill: gs.sill || undefined, range: gs.range || undefined, nugget: gs.nugget, maxNeighbors: gs.maxNeighbors, driftOrder: gs.driftOrder });
    else if (a === "kriging_sim") grid = krigingSimple(inputPts, gridX, gridY, { model: gs.variogramModel, sill: gs.sill || undefined, range: gs.range || undefined, nugget: gs.nugget, maxNeighbors: gs.maxNeighbors, knownMean: gs.knownMean || undefined });
    else if (a === "rbf") grid = rbfInterpolation(inputPts, gridX, gridY, { basis: gs.rbfBasis, shapeParam: gs.rbfShape, smoothing: gs.rbfSmoothing });
    else if (a === "tin") grid = tinInterpolation(inputPts, gridX, gridY, {
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

    self.postMessage({ type: "progress", percent: 70, stage: "Generating contours…" });

    // Contours
    const interval = gs.contourInterval || (stats.max - stats.min) / 10;
    const levels = generateContourLevels(stats.min, stats.max, interval);

    let contours;
    if (gs.contourMethod === "tin") {
      self.postMessage({ type: "progress", percent: 72, stage: "Triangulating for TIN contours…" });
      const tin = delaunayTriangulate(inputPts);
      self.postMessage({ type: "progress", percent: 80, stage: "Tracing TIN contours…" });
      contours = generateTINContours(tin, levels);
      if (gs.contourSmoothing > 0) contours = smoothContours(contours, gs.contourSmoothing);
    } else {
      contours = generateContours(grid, gridX, gridY, levels);
      if (gs.contourSmoothing > 0) contours = smoothContours(contours, gs.contourSmoothing);
    }
    const filledContours = generateFilledContours(grid, gridX, gridY, levels);

    self.postMessage({ type: "progress", percent: 85, stage: "Computing hillshade…" });

    // Hillshade
    const cellDx = nx > 1 ? gridX[1] - gridX[0] : 1;
    const cellDy = ny > 1 ? gridY[1] - gridY[0] : 1;
    const hillshade = computeHillshade(grid, nx, ny, cellDx, cellDy, gs.hillAzimuth, gs.hillAltitude, gs.hillZFactor);

    self.postMessage({ type: "progress", percent: 95, stage: "Finishing…" });

    // Convert Float64Array to a plain array for transfer (structured clone handles this)
    self.postMessage({
      type: "result",
      grid: Array.from(grid),
      gridX,
      gridY,
      nx,
      ny,
      stats: { ...stats, nx, ny, cells: nx * ny },
      contours,
      filledContours,
      hillshade: Array.from(hillshade),
      zMin: stats.min,
      zMax: stats.max,
    });
  } catch (err) {
    self.postMessage({ type: "error", message: err.message || String(err) });
  }
};
