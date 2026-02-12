// GridForge GIS - Computational Engine
// All gridding algorithms, contour generation, utilities, and export functions

// ═══════════════════════════════════════════════════════════════════════════════
// COLOR RAMPS (20+)
// ═══════════════════════════════════════════════════════════════════════════════
export const COLOR_RAMPS = {
  viridis: ["#440154", "#482777", "#3e4989", "#31688e", "#26828e", "#1f9e89", "#35b779", "#6ece58", "#b5de2b", "#fde725"],
  terrain: ["#333399", "#0099cc", "#33cc33", "#99cc00", "#cccc00", "#cc9900", "#cc6600", "#cc3300", "#990000"],
  plasma: ["#0d0887", "#46039f", "#7201a8", "#9c179e", "#bd3786", "#d8576b", "#ed7953", "#fb9f3a", "#fdca26", "#f0f921"],
  inferno: ["#000004", "#1b0c41", "#4a0c6b", "#781c6d", "#a52c60", "#cf4446", "#ed6925", "#fb9b06", "#f7d13d", "#fcffa4"],
  ocean: ["#0a1628", "#0d2b45", "#0f4c75", "#1a759f", "#34a0a4", "#52b69a", "#76c893", "#99d98c", "#b5e48c", "#d9ed92"],
  hot: ["#000000", "#3b0000", "#7a0000", "#b80000", "#e63600", "#ff6d00", "#ff9e00", "#ffcf00", "#ffff30", "#ffffff"],
  magma: ["#000004", "#140e36", "#3b0f70", "#641a80", "#8c2981", "#b73779", "#de4968", "#f7735c", "#fca50a", "#fcffa4"],
  cividis: ["#00224e", "#123570", "#1f4d8e", "#2e6da0", "#458ab0", "#63a4ba", "#86bec2", "#afcfcb", "#d7e0d5", "#fdea45"],
  turbo: ["#30123b", "#4145ab", "#4675ed", "#39a2fc", "#1bcfd4", "#24ea83", "#72fe5e", "#c0ee33", "#f0c929", "#f99d1c", "#e4641e", "#b91a1b"],
  spectral: ["#9e0142", "#d53e4f", "#f46d43", "#fdae61", "#fee08b", "#ffffbf", "#e6f598", "#abdda4", "#66c2a5", "#3288bd", "#5e4fa2"],
  coolwarm: ["#3b4cc0", "#5977e3", "#7b9ff9", "#9ebeff", "#c0d4f5", "#dddcdc", "#f2cbb7", "#f0a98b", "#e27c62", "#c95040", "#b40426"],
  RdYlGn: ["#a50026", "#d73027", "#f46d43", "#fdae61", "#fee08b", "#ffffbf", "#d9ef8b", "#a6d96a", "#66bd63", "#1a9850", "#006837"],
  RdYlBu: ["#a50026", "#d73027", "#f46d43", "#fdae61", "#fee090", "#ffffbf", "#e0f3f8", "#abd9e9", "#74add1", "#4575b4", "#313695"],
  BrBG: ["#543005", "#8c510a", "#bf812d", "#dfc27d", "#f6e8c3", "#f5f5f5", "#c7eae5", "#80cdc1", "#35978f", "#01665e", "#003c30"],
  PiYG: ["#8e0152", "#c51b7d", "#de77ae", "#f1b6da", "#fde0ef", "#f7f7f7", "#d9f0d3", "#a1d76a", "#4d9221", "#276419"],
  cubehelix: ["#000000", "#1a1530", "#16355e", "#0d5f54", "#1c8235", "#539624", "#a09736", "#d9936b", "#e8a5b7", "#d6c6e1", "#ffffff"],
  rainbow: ["#ff0000", "#ff8800", "#ffff00", "#88ff00", "#00ff00", "#00ff88", "#00ffff", "#0088ff", "#0000ff", "#8800ff", "#ff00ff"],
  jet: ["#000080", "#0000ff", "#0080ff", "#00ffff", "#80ff80", "#ffff00", "#ff8000", "#ff0000", "#800000"],
  grayscale: ["#000000", "#1a1a1a", "#333333", "#4d4d4d", "#666666", "#808080", "#999999", "#b3b3b3", "#cccccc", "#e6e6e6", "#ffffff"],
  earth: ["#2a1a0a", "#4a3520", "#6b5030", "#8b7040", "#a89060", "#c4b080", "#d0c890", "#b8d068", "#80c050", "#40a040", "#208030"],
  bathymetry: ["#000033", "#000066", "#000099", "#0000cc", "#0033ff", "#0066ff", "#0099ff", "#00ccff", "#66ffff", "#ccffff"],
};

// ═══════════════════════════════════════════════════════════════════════════════
// MATH UTILITIES
// ═══════════════════════════════════════════════════════════════════════════════

function solveLinearSystem(A, b) {
  const n = A.length;
  const aug = A.map((row, i) => [...row, b[i]]);

  // Row scaling: divide each row by its max absolute value to improve conditioning
  for (let i = 0; i < n; i++) {
    let rowMax = 0;
    for (let j = 0; j <= n; j++) {
      const v = Math.abs(aug[i][j]);
      if (v > rowMax) rowMax = v;
    }
    if (rowMax > 1e-30) {
      const inv = 1 / rowMax;
      for (let j = 0; j <= n; j++) aug[i][j] *= inv;
    }
  }

  // Gaussian elimination with partial pivoting
  for (let col = 0; col < n; col++) {
    let maxRow = col, maxVal = Math.abs(aug[col][col]);
    for (let row = col + 1; row < n; row++) {
      const v = Math.abs(aug[row][col]);
      if (v > maxVal) { maxVal = v; maxRow = row; }
    }
    [aug[col], aug[maxRow]] = [aug[maxRow], aug[col]];
    if (maxVal < 1e-12) return null; // singular — return null instead of garbage
    for (let row = col + 1; row < n; row++) {
      const f = aug[row][col] / aug[col][col];
      for (let j = col; j <= n; j++) aug[row][j] -= f * aug[col][j];
    }
  }

  // Back-substitution
  const x = new Array(n).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    if (Math.abs(aug[i][i]) < 1e-12) return null; // singular
    x[i] = aug[i][n];
    for (let j = i + 1; j < n; j++) x[i] -= aug[i][j] * x[j];
    x[i] /= aug[i][i];
  }
  return x;
}

class SpatialIndex {
  constructor(points, cellSize) {
    this.cellSize = cellSize || 1;
    this.invCell = 1 / this.cellSize;
    this.points = points;
    this.n = points.length;

    // Pre-extract coordinates into flat typed arrays (avoids property lookups in hot loops)
    this._px = new Float64Array(this.n);
    this._py = new Float64Array(this.n);
    for (let i = 0; i < this.n; i++) { this._px[i] = points[i].x; this._py[i] = points[i].y; }

    // Compute cell coordinate bounds for flat-array storage
    let cxMin = Infinity, cxMax = -Infinity, cyMin = Infinity, cyMax = -Infinity;
    for (let i = 0; i < this.n; i++) {
      const cx = Math.floor(this._px[i] * this.invCell);
      const cy = Math.floor(this._py[i] * this.invCell);
      if (cx < cxMin) cxMin = cx; if (cx > cxMax) cxMax = cx;
      if (cy < cyMin) cyMin = cy; if (cy > cyMax) cyMax = cy;
    }
    if (this.n === 0) { cxMin = cxMax = cyMin = cyMax = 0; }
    this._cxMin = cxMin; this._cyMin = cyMin;
    this._cxRange = cxMax - cxMin + 1;
    this._cyRange = cyMax - cyMin + 1;

    // Build CSR (Compressed Sparse Row) flat cell storage for cache-friendly iteration
    const totalCells = this._cxRange * this._cyRange;
    const cellCount = new Int32Array(totalCells);
    for (let i = 0; i < this.n; i++) {
      const cx = Math.floor(this._px[i] * this.invCell) - cxMin;
      const cy = Math.floor(this._py[i] * this.invCell) - cyMin;
      cellCount[cy * this._cxRange + cx]++;
    }
    // Prefix-sum to get start offsets
    this._cellStart = new Int32Array(totalCells + 1);
    for (let c = 0; c < totalCells; c++) this._cellStart[c + 1] = this._cellStart[c] + cellCount[c];
    // Fill flat index array
    this._flatIdx = new Int32Array(this.n);
    const fillPos = new Int32Array(totalCells);
    for (let i = 0; i < this.n; i++) {
      const cx = Math.floor(this._px[i] * this.invCell) - cxMin;
      const cy = Math.floor(this._py[i] * this.invCell) - cyMin;
      const key = cy * this._cxRange + cx;
      this._flatIdx[this._cellStart[key] + fillPos[key]] = i;
      fillPos[key]++;
    }

    // Pre-allocate reusable scratch buffers (safe: single-threaded)
    this._bufIdx = new Int32Array(Math.max(this.n, 64));
    this._bufD2 = new Float64Array(Math.max(this.n, 64));
  }

  /** Find point indices within radius. Returns plain index array (legacy API). */
  findWithinRadius(x, y, radius) {
    const results = [];
    const cr = Math.ceil(radius * this.invCell);
    const cxBase = Math.floor(x * this.invCell), cyBase = Math.floor(y * this.invCell);
    const cxMin = this._cxMin, cyMin = this._cyMin, cxRange = this._cxRange;
    const cxLo = cxBase - cr < cxMin ? cxMin : cxBase - cr;
    const cxHi = cxBase + cr > cxMin + cxRange - 1 ? cxMin + cxRange - 1 : cxBase + cr;
    const cyLo = cyBase - cr < cyMin ? cyMin : cyBase - cr;
    const cyHi = cyBase + cr > cyMin + this._cyRange - 1 ? cyMin + this._cyRange - 1 : cyBase + cr;
    const r2 = radius * radius;
    const px = this._px, py = this._py;
    const cs = this._cellStart, fi = this._flatIdx;
    for (let cy = cyLo; cy <= cyHi; cy++) {
      const rowOff = (cy - cyMin) * cxRange;
      for (let cx = cxLo; cx <= cxHi; cx++) {
        const cellKey = rowOff + (cx - cxMin);
        const end = cs[cellKey + 1];
        for (let ci = cs[cellKey]; ci < end; ci++) {
          const idx = fi[ci];
          const ddx = px[idx] - x, ddy = py[idx] - y;
          if (ddx * ddx + ddy * ddy <= r2) results.push(idx);
        }
      }
    }
    return results;
  }

  /** Fill pre-allocated buffers with points within radius. Returns count. */
  findWithinRadiusRaw(x, y, radius, outIdx, outDist) {
    let count = 0;
    const cr = Math.ceil(radius * this.invCell);
    const cxBase = Math.floor(x * this.invCell), cyBase = Math.floor(y * this.invCell);
    const cxMin = this._cxMin, cyMin = this._cyMin, cxRange = this._cxRange;
    const cxLo = cxBase - cr < cxMin ? cxMin : cxBase - cr;
    const cxHi = cxBase + cr > cxMin + cxRange - 1 ? cxMin + cxRange - 1 : cxBase + cr;
    const cyLo = cyBase - cr < cyMin ? cyMin : cyBase - cr;
    const cyHi = cyBase + cr > cyMin + this._cyRange - 1 ? cyMin + this._cyRange - 1 : cyBase + cr;
    const r2 = radius * radius;
    const px = this._px, py = this._py;
    const cs = this._cellStart, fi = this._flatIdx;
    for (let cy = cyLo; cy <= cyHi; cy++) {
      const rowOff = (cy - cyMin) * cxRange;
      for (let cx = cxLo; cx <= cxHi; cx++) {
        const cellKey = rowOff + (cx - cxMin);
        const end = cs[cellKey + 1];
        for (let ci = cs[cellKey]; ci < end; ci++) {
          const idx = fi[ci];
          const ddx = px[idx] - x, ddy = py[idx] - y;
          const d2 = ddx * ddx + ddy * ddy;
          if (d2 <= r2) { outIdx[count] = idx; outDist[count] = Math.sqrt(d2); count++; }
        }
      }
    }
    return count;
  }

  /** K-nearest search returning [{idx,dist},...] (legacy API). */
  findKNearest(x, y, k) {
    const count = this.findKNearestRaw(x, y, k, this._bufIdx, this._bufD2);
    const result = new Array(count);
    for (let i = 0; i < count; i++) result[i] = { idx: this._bufIdx[i], dist: this._bufD2[i] };
    return result;
  }

  /** K-nearest search filling caller's typed arrays. Returns count (≤ k).
   *  outDist values are real (non-squared) distances, sorted ascending. */
  findKNearestRaw(x, y, k, outIdx, outDist) {
    const px = this._px, py = this._py;
    const cxRange = this._cxRange, cxMin = this._cxMin, cyMin = this._cyMin;
    const cxMaxB = cxMin + cxRange - 1, cyMaxB = cyMin + this._cyRange - 1;
    const cs = this._cellStart, fi = this._flatIdx;
    let radius = this.cellSize * 2;
    const cxBase = Math.floor(x * this.invCell), cyBase = Math.floor(y * this.invCell);

    // Use outIdx/outDist directly as a sorted top-k buffer (squared distances during collection)
    let hs = 0;         // heap size (≤ k)
    let maxD2 = Infinity; // distance threshold = outDist[k-1] once full

    for (let tries = 0; tries < 16; tries++) {
      hs = 0; maxD2 = Infinity;
      const cr = Math.ceil(radius * this.invCell);
      const cxLo = cxBase - cr < cxMin ? cxMin : cxBase - cr;
      const cxHi = cxBase + cr > cxMaxB ? cxMaxB : cxBase + cr;
      const cyLo = cyBase - cr < cyMin ? cyMin : cyBase - cr;
      const cyHi = cyBase + cr > cyMaxB ? cyMaxB : cyBase + cr;
      const r2 = radius * radius;
      for (let cy = cyLo; cy <= cyHi; cy++) {
        const rowOff = (cy - cyMin) * cxRange;
        for (let cx = cxLo; cx <= cxHi; cx++) {
          const cellKey = rowOff + (cx - cxMin);
          const end = cs[cellKey + 1];
          for (let ci = cs[cellKey]; ci < end; ci++) {
            const idx = fi[ci];
            const ddx = px[idx] - x, ddy = py[idx] - y;
            const d2 = ddx * ddx + ddy * ddy;
            if (d2 > r2 || (hs >= k && d2 >= maxD2)) continue;
            // Insert into sorted top-k buffer
            let pos = hs < k ? hs : k - 1;
            while (pos > 0 && outDist[pos - 1] > d2) {
              outDist[pos] = outDist[pos - 1]; outIdx[pos] = outIdx[pos - 1]; pos--;
            }
            outDist[pos] = d2; outIdx[pos] = idx;
            if (hs < k) { hs++; if (hs === k) maxD2 = outDist[k - 1]; }
            else maxD2 = outDist[k - 1];
          }
        }
      }
      if (hs >= k) break;
      radius *= 2;
    }
    // Fallback: brute-force all points
    if (hs < k && hs < this.n) {
      hs = 0; maxD2 = Infinity;
      for (let i = 0; i < this.n; i++) {
        const ddx = px[i] - x, ddy = py[i] - y;
        const d2 = ddx * ddx + ddy * ddy;
        if (hs >= k && d2 >= maxD2) continue;
        let pos = hs < k ? hs : k - 1;
        while (pos > 0 && outDist[pos - 1] > d2) {
          outDist[pos] = outDist[pos - 1]; outIdx[pos] = outIdx[pos - 1]; pos--;
        }
        outDist[pos] = d2; outIdx[pos] = i;
        if (hs < k) { hs++; if (hs === k) maxD2 = outDist[k - 1]; }
        else maxD2 = outDist[k - 1];
      }
    }
    // Convert squared distances to real distances
    for (let i = 0; i < hs; i++) outDist[i] = Math.sqrt(outDist[i]);
    return hs;
  }
}

export function buildSpatialIndex(points) {
  if (points.length === 0) return new SpatialIndex(points, 1);
  let xMin = Infinity, xMax = -Infinity, yMin = Infinity, yMax = -Infinity;
  for (const p of points) {
    if (p.x < xMin) xMin = p.x; if (p.x > xMax) xMax = p.x;
    if (p.y < yMin) yMin = p.y; if (p.y > yMax) yMax = p.y;
  }
  const extent = Math.max(xMax - xMin, yMax - yMin) || 1;
  const cellSize = extent / Math.min(Math.sqrt(points.length), 100);
  return new SpatialIndex(points, cellSize || 1);
}

function variogram(h, model, sill, range, nugget) {
  if (h === 0) return 0;
  const s = sill, r = range, n = nugget;
  switch (model) {
    case 'exponential': return n + s * (1 - Math.exp(-3 * h / r));
    case 'gaussian': return n + s * (1 - Math.exp(-3 * (h * h) / (r * r)));
    case 'linear': return n + s * Math.min(h / r, 1);
    case 'power': return n + s * Math.pow(h, 1.5) / Math.pow(r, 1.5);
    default: { // spherical
      if (h >= r) return n + s;
      const hr = h / r;
      return n + s * (1.5 * hr - 0.5 * hr * hr * hr);
    }
  }
}

function estimateVariogramParams(points) {
  const n = points.length;
  if (n < 2) return { sill: 0.01, range: 1, nugget: 1e-6 };

  // Compute z-variance from ALL points
  let zSum = 0, z2Sum = 0;
  for (let i = 0; i < n; i++) { zSum += points[i].z; z2Sum += points[i].z * points[i].z; }
  const mean = zSum / n;
  const variance = Math.max(z2Sum / n - mean * mean, 1e-10);

  // Sample pairs for empirical semivariogram (cap at ~50k pairs for speed)
  const maxSample = Math.min(n, 500);
  const step = n > maxSample ? Math.floor(n / maxSample) : 1;
  const sampleIdx = [];
  for (let i = 0; i < n; i += step) sampleIdx.push(i);
  const ns = sampleIdx.length;

  // Compute all pairwise distances and semivariances, find max distance
  let globalMaxDist = 0;
  const pairs = [];
  for (let i = 0; i < ns; i++) {
    const pi = sampleIdx[i];
    for (let j = i + 1; j < ns; j++) {
      const pj = sampleIdx[j];
      const dx = points[pi].x - points[pj].x, dy = points[pi].y - points[pj].y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const gamma = 0.5 * (points[pi].z - points[pj].z) ** 2;
      if (dist > globalMaxDist) globalMaxDist = dist;
      pairs.push({ dist, gamma });
    }
  }

  if (pairs.length === 0 || globalMaxDist < 1e-10) {
    return { sill: Math.max(variance, 0.01), range: 1, nugget: Math.max(variance * 0.01, 1e-6) };
  }

  // Bin pairs into ~15 distance bins up to half the max distance
  const maxLag = globalMaxDist * 0.5;
  const nBins = 15;
  const binWidth = maxLag / nBins;
  const binSum = new Float64Array(nBins);
  const binCount = new Int32Array(nBins);
  for (const p of pairs) {
    if (p.dist >= maxLag || p.dist < 1e-10) continue;
    const bi = Math.min(Math.floor(p.dist / binWidth), nBins - 1);
    binSum[bi] += p.gamma;
    binCount[bi]++;
  }

  // Find range = distance where gamma reaches ~95% of sill
  const target = variance * 0.95;
  let estRange = maxLag * 0.5; // default
  for (let bi = 0; bi < nBins; bi++) {
    if (binCount[bi] < 2) continue;
    const avgGamma = binSum[bi] / binCount[bi];
    if (avgGamma >= target) {
      estRange = (bi + 0.5) * binWidth;
      break;
    }
  }

  const sill = Math.max(variance, 0.01);
  const range = Math.max(estRange, binWidth);
  const nugget = Math.max(sill * 0.01, 1e-6);

  return { sill, range, nugget };
}

// ═══════════════════════════════════════════════════════════════════════════════
// PARSING
// ═══════════════════════════════════════════════════════════════════════════════

/** Parse CSV/TSV/delimited text. Returns ALL rows, no limits. */
export function parseCSV(text) {
  const delimiters = [",", "\t", ";", "|", " "];
  const firstLine = text.split("\n")[0];
  const delimiter = delimiters.reduce((best, d) =>
    (firstLine.split(d).length > firstLine.split(best).length) ? d : best, ",");
  const lines = text.trim().split("\n").filter(l => l.trim());
  const firstCols = lines[0].split(delimiter).map(h => h.trim().replace(/^["']|["']$/g, ""));

  // Detect if first row is a header or data
  // If most values are numeric, it's data (no header)
  const numericCount = firstCols.filter(v => v !== "" && !isNaN(+v)).length;
  const isHeaderless = numericCount > firstCols.length * 0.5;

  let headers, startIdx;
  if (isHeaderless) {
    // Generate synthetic headers for common survey data formats
    const n = firstCols.length;
    if (n === 3) {
      headers = ["X", "Y", "Z"];
    } else if (n === 4) {
      // Could be Point,X,Y,Z or X,Y,Z,Desc — check if col[0] looks like a point number
      const col0AllInt = lines.slice(0, Math.min(10, lines.length)).every(l => {
        const v = l.split(delimiter)[0]?.trim();
        return v && !isNaN(+v) && Number.isInteger(+v);
      });
      headers = col0AllInt ? ["PointNo", "X", "Y", "Z"] : ["X", "Y", "Z", "Desc"];
    } else if (n === 5) {
      headers = ["PointNo", "N", "E", "Z", "Desc"];
    } else if (n === 2) {
      headers = ["X", "Y"];
    } else {
      headers = firstCols.map((_, i) => `Col${i + 1}`);
    }
    startIdx = 0; // first line is data
  } else {
    headers = firstCols;
    startIdx = 1; // first line is header
  }

  const rows = [];
  for (let i = startIdx; i < lines.length; i++) {
    const vals = lines[i].split(delimiter).map(v => v.trim().replace(/^["']|["']$/g, ""));
    if (vals.length >= headers.length - 1) {
      const row = {};
      headers.forEach((h, j) => { row[h] = vals[j] !== undefined && vals[j] !== "" && !isNaN(+vals[j]) ? +vals[j] : (vals[j] || ""); });
      rows.push(row);
    }
  }
  return { headers, rows };
}

/** Parse GeoJSON text */
const BANNED_KEYS = new Set(["__proto__", "constructor", "prototype"]);
export function parseGeoJSON(text) {
  const gj = JSON.parse(text);
  const features = gj.features || (gj.type === "Feature" ? [gj] : []);
  const pts = features.filter(f => f.geometry?.type === "Point").map(f => {
    const props = {};
    if (f.properties) {
      for (const k of Object.keys(f.properties)) {
        if (!BANNED_KEYS.has(k)) props[k] = f.properties[k];
      }
    }
    return {
      x: f.geometry.coordinates[0], y: f.geometry.coordinates[1],
      z: f.geometry.coordinates[2] || f.properties?.z || f.properties?.elevation || f.properties?.Z || 0,
      ...props,
    };
  });
  const headers = pts.length > 0 ? Object.keys(pts[0]) : [];
  return { headers, rows: pts };
}

/** Auto-detect X/Y/Z/PointNo/Desc columns */
export function autoDetectColumns(headers) {
  const xP = [/^x$/i, /^lon/i, /^lng/i, /^east/i, /^e$/i, /^long/i, /^xcoor/i, /^xcoord/i];
  const yP = [/^y$/i, /^lat/i, /^north/i, /^n$/i, /^ycoor/i, /^ycoord/i];
  const zP = [/^z$/i, /^elev/i, /^height/i, /^alt/i, /^val/i, /^depth/i, /^zcoor/i, /^value/i];
  const pP = [/^point/i, /^pt$/i, /^id$/i, /^no$/i, /^num/i, /^pointno/i, /^point_no/i, /^fid$/i];
  const dP = [/^desc/i, /^code$/i, /^class/i, /^type$/i, /^comment/i, /^remark/i, /^label/i, /^name$/i];
  const find = (pats) => headers.find(h => pats.some(p => p.test(h))) || "";
  return { x: find(xP), y: find(yP), z: find(zP), pointNo: find(pP), desc: find(dP) };
}

// ═══════════════════════════════════════════════════════════════════════════════
// GRIDDING ALGORITHMS
// ═══════════════════════════════════════════════════════════════════════════════

/** Inverse Distance Weighting */
export function idwInterpolation(points, gridX, gridY, opts = {}) {
  const { power = 2, searchRadius = Infinity, maxNeighbors = 0 } = opts;
  const nx = gridX.length, ny = gridY.length;
  const grid = new Float64Array(nx * ny);
  const si = points.length > 200 ? buildSpatialIndex(points) : null;
  // Pre-extract z values for fast inner-loop access
  const pz = new Float64Array(points.length);
  for (let p = 0; p < points.length; p++) pz[p] = points[p].z;
  // Pre-allocate query buffers (reused every cell)
  const bufSize = si ? Math.max(maxNeighbors, points.length) : points.length;
  const nbIdx = new Int32Array(bufSize);
  const nbDist = new Float64Array(bufSize);
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      let wSum = 0, vSum = 0, exact = -1;
      let count = 0;
      if (si && maxNeighbors > 0) {
        count = si.findKNearestRaw(gridX[i], gridY[j], maxNeighbors, nbIdx, nbDist);
      } else if (si && searchRadius < Infinity) {
        count = si.findWithinRadiusRaw(gridX[i], gridY[j], searchRadius, nbIdx, nbDist);
      } else {
        // Brute force
        for (let p = 0; p < points.length; p++) {
          const dx = gridX[i] - points[p].x, dy = gridY[j] - points[p].y;
          nbIdx[count] = p; nbDist[count] = Math.sqrt(dx * dx + dy * dy); count++;
        }
      }
      for (let k = 0; k < count; k++) {
        const d = nbDist[k];
        if (d < 1e-10) { exact = nbIdx[k]; break; }
        if (d <= searchRadius) {
          const w = 1 / Math.pow(d, power);
          wSum += w; vSum += w * pz[nbIdx[k]];
        }
      }
      grid[j * nx + i] = exact >= 0 ? pz[exact] : (wSum > 0 ? vSum / wSum : NaN);
    }
  }
  return grid;
}

/** Natural Neighbor - Sibson weight approximation */
export function naturalNeighborInterpolation(points, gridX, gridY, opts = {}) {
  const nx = gridX.length, ny = gridY.length;
  const grid = new Float64Array(nx * ny);
  const si = buildSpatialIndex(points);
  const pz = new Float64Array(points.length);
  for (let p = 0; p < points.length; p++) pz[p] = points[p].z;
  const kMax = Math.min(points.length, 16);
  const nbIdx = new Int32Array(kMax);
  const nbDist = new Float64Array(kMax);
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const k = si.findKNearestRaw(gridX[i], gridY[j], kMax, nbIdx, nbDist);
      if (k === 0) { grid[j * nx + i] = NaN; continue; }
      if (nbDist[0] < 1e-10) { grid[j * nx + i] = pz[nbIdx[0]]; continue; }
      const dMax = nbDist[k - 1];
      const invDMax = 1 / dMax;
      let wSum = 0, vSum = 0;
      for (let m = 0; m < k; m++) {
        const w = Math.max(0, 1 / nbDist[m] - invDMax);
        const w2 = w * w;
        wSum += w2; vSum += w2 * pz[nbIdx[m]];
      }
      grid[j * nx + i] = wSum > 0 ? vSum / wSum : NaN;
    }
  }
  return grid;
}

/** Minimum Curvature (biharmonic spline relaxation) */
export function minimumCurvature(points, gridX, gridY, opts = {}) {
  const { tension = 0.25, maxIterations = 200, convergence = 0.001, relaxation = 1.0 } = opts;
  const nx = gridX.length, ny = gridY.length;
  const grid = idwInterpolation(points, gridX, gridY, { power: 2 });
  const dx = nx > 1 ? gridX[1] - gridX[0] : 1;
  const dy = ny > 1 ? gridY[1] - gridY[0] : 1;
  const known = new Uint8Array(nx * ny);
  for (const p of points) {
    const gi = Math.round((p.x - gridX[0]) / dx);
    const gj = Math.round((p.y - gridY[0]) / dy);
    if (gi >= 0 && gi < nx && gj >= 0 && gj < ny) { known[gj * nx + gi] = 1; grid[gj * nx + gi] = p.z; }
  }
  const t = tension * relaxation;
  for (let iter = 0; iter < maxIterations; iter++) {
    let maxChange = 0;
    for (let j = 2; j < ny - 2; j++) {
      for (let i = 2; i < nx - 2; i++) {
        const idx = j * nx + i;
        if (known[idx]) continue;
        const lap = (grid[idx - 1] + grid[idx + 1] + grid[(j - 1) * nx + i] + grid[(j + 1) * nx + i]) / 4;
        const bilap = (grid[(j - 2) * nx + i] + grid[(j + 2) * nx + i] + grid[j * nx + i - 2] + grid[j * nx + i + 2]
          + 2 * (grid[(j - 1) * nx + i - 1] + grid[(j - 1) * nx + i + 1] + grid[(j + 1) * nx + i - 1] + grid[(j + 1) * nx + i + 1])
          - 8 * (grid[idx - 1] + grid[idx + 1] + grid[(j - 1) * nx + i] + grid[(j + 1) * nx + i]) + 20 * grid[idx]) / 8;
        const newVal = grid[idx] + t * (lap - grid[idx]) - tension * 0.1 * bilap;
        const change = Math.abs(newVal - grid[idx]);
        if (change > maxChange) maxChange = change;
        grid[idx] = newVal;
      }
    }
    // Edges (simple Laplacian only)
    for (let j = 1; j < ny - 1; j++) {
      for (let i = 1; i < nx - 1; i++) {
        if (i >= 2 && i < nx - 2 && j >= 2 && j < ny - 2) continue;
        const idx = j * nx + i;
        if (known[idx]) continue;
        const avg = (grid[idx - 1] + grid[idx + 1] + grid[(j - 1) * nx + i] + grid[(j + 1) * nx + i]) / 4;
        grid[idx] = grid[idx] + t * (avg - grid[idx]);
      }
    }
    if (maxChange < convergence) break;
  }
  return grid;
}

/** Kriging Ordinary */
export function krigingOrdinary(points, gridX, gridY, opts = {}) {
  const { model = 'spherical', maxNeighbors = 16 } = opts;
  const vp = estimateVariogramParams(points);
  const sill = opts.sill ?? vp.sill, range = opts.range ?? vp.range, nugget = opts.nugget ?? vp.nugget;
  const nx = gridX.length, ny = gridY.length;
  const grid = new Float64Array(nx * ny);
  const si = buildSpatialIndex(points);
  const mn = Math.min(maxNeighbors, points.length);
  const _px = si._px, _py = si._py;
  const pz = new Float64Array(points.length);
  for (let p = 0; p < points.length; p++) pz[p] = points[p].z;
  const nbIdx = new Int32Array(mn);
  const nbDist = new Float64Array(mn);
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const k = si.findKNearestRaw(gridX[i], gridY[j], mn, nbIdx, nbDist);
      if (k === 0) { grid[j * nx + i] = NaN; continue; }
      if (nbDist[0] < 1e-10) { grid[j * nx + i] = pz[nbIdx[0]]; continue; }
      const K = Array.from({ length: k + 1 }, () => new Array(k + 1).fill(0));
      const kv = new Array(k + 1).fill(0);
      for (let a = 0; a < k; a++) {
        for (let b = 0; b < k; b++) {
          const h = Math.sqrt((_px[nbIdx[a]] - _px[nbIdx[b]]) ** 2 + (_py[nbIdx[a]] - _py[nbIdx[b]]) ** 2);
          K[a][b] = variogram(h, model, sill, range, nugget);
        }
        // Diagonal regularization: variogram(0)=0 makes diagonal zero; add nugget for stability
        if (K[a][a] < 1e-10) K[a][a] = Math.max(nugget, 1e-6);
        K[a][k] = 1; K[k][a] = 1;
        kv[a] = variogram(nbDist[a], model, sill, range, nugget);
      }
      kv[k] = 1;
      const w = solveLinearSystem(K, kv);
      // Validate weights: solver failure or unstable solution → IDW fallback
      let bad = !w;
      if (!bad) {
        let wSum = 0, wMax = 0;
        for (let a = 0; a < k; a++) { wSum += w[a]; const aw = Math.abs(w[a]); if (aw > wMax) wMax = aw; }
        if (Math.abs(wSum - 1) > 2 || wMax > 10) bad = true;
      }
      if (bad) {
        // IDW fallback
        let wSum = 0, vSum = 0;
        for (let a = 0; a < k; a++) {
          const wi = 1 / (nbDist[a] * nbDist[a]);
          wSum += wi; vSum += wi * pz[nbIdx[a]];
        }
        grid[j * nx + i] = wSum > 0 ? vSum / wSum : NaN;
        continue;
      }
      let val = 0;
      for (let a = 0; a < k; a++) val += w[a] * pz[nbIdx[a]];
      grid[j * nx + i] = isFinite(val) ? val : NaN;
    }
  }
  return grid;
}

/** Kriging Universal (with polynomial drift) */
export function krigingUniversal(points, gridX, gridY, opts = {}) {
  const { model = 'spherical', maxNeighbors = 16, driftOrder = 1 } = opts;
  const vp = estimateVariogramParams(points);
  const sill = opts.sill ?? vp.sill, range = opts.range ?? vp.range, nugget = opts.nugget ?? vp.nugget;
  const nx = gridX.length, ny = gridY.length;
  const grid = new Float64Array(nx * ny);
  const si = buildSpatialIndex(points);
  const mn = Math.min(maxNeighbors, points.length);
  const _px = si._px, _py = si._py;
  const pz = new Float64Array(points.length);
  for (let p = 0; p < points.length; p++) pz[p] = points[p].z;
  const nbIdx = new Int32Array(mn);
  const nbDist = new Float64Array(mn);
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const k = si.findKNearestRaw(gridX[i], gridY[j], mn, nbIdx, nbDist);
      if (k === 0) { grid[j * nx + i] = NaN; continue; }
      if (nbDist[0] < 1e-10) { grid[j * nx + i] = pz[nbIdx[0]]; continue; }

      // Local coordinate normalization to [0,1] for drift terms
      let lxMin = gridX[i], lxMax = gridX[i], lyMin = gridY[j], lyMax = gridY[j];
      for (let a = 0; a < k; a++) {
        const px = _px[nbIdx[a]], py = _py[nbIdx[a]];
        if (px < lxMin) lxMin = px; if (px > lxMax) lxMax = px;
        if (py < lyMin) lyMin = py; if (py > lyMax) lyMax = py;
      }
      const lxRange = lxMax - lxMin || 1, lyRange = lyMax - lyMin || 1;

      const m = driftOrder === 2 ? 3 : 2;
      const sz = k + 1 + m;
      const K = Array.from({ length: sz }, () => new Array(sz).fill(0));
      const kv = new Array(sz).fill(0);
      for (let a = 0; a < k; a++) {
        for (let b = 0; b < k; b++) {
          K[a][b] = variogram(Math.sqrt((_px[nbIdx[a]] - _px[nbIdx[b]]) ** 2 + (_py[nbIdx[a]] - _py[nbIdx[b]]) ** 2), model, sill, range, nugget);
        }
        // Diagonal regularization
        if (K[a][a] < 1e-10) K[a][a] = Math.max(nugget, 1e-6);
        K[a][k] = 1; K[k][a] = 1;
        // Normalized drift terms
        const nxa = (_px[nbIdx[a]] - lxMin) / lxRange;
        const nya = (_py[nbIdx[a]] - lyMin) / lyRange;
        K[a][k + 1] = nxa; K[k + 1][a] = nxa;
        K[a][k + 2] = nya; K[k + 2][a] = nya;
        kv[a] = variogram(nbDist[a], model, sill, range, nugget);
      }
      kv[k] = 1;
      kv[k + 1] = (gridX[i] - lxMin) / lxRange;
      kv[k + 2] = (gridY[j] - lyMin) / lyRange;
      const w = solveLinearSystem(K, kv);
      // Validate weights and output bounds
      let bad = !w;
      if (!bad) {
        let wSum = 0, wMax = 0;
        for (let a = 0; a < k; a++) { wSum += w[a]; const aw = Math.abs(w[a]); if (aw > wMax) wMax = aw; }
        if (Math.abs(wSum - 1) > 0.5 || wMax > 3) bad = true;
      }
      if (!bad) {
        let val = 0;
        for (let a = 0; a < k; a++) val += w[a] * pz[nbIdx[a]];
        if (isFinite(val)) {
          // Bounds check: prediction must be within local z-range + margin
          let zMin = pz[nbIdx[0]], zMax = pz[nbIdx[0]];
          for (let a = 1; a < k; a++) {
            const z = pz[nbIdx[a]];
            if (z < zMin) zMin = z; if (z > zMax) zMax = z;
          }
          const zMargin = Math.max((zMax - zMin) * 0.5, Math.abs(zMax - zMin) * 0.1 + 1);
          if (val >= zMin - zMargin && val <= zMax + zMargin) {
            grid[j * nx + i] = val;
            continue;
          }
        }
        bad = true;
      }
      if (bad) {
        let wSum = 0, vSum = 0;
        for (let a = 0; a < k; a++) {
          const wi = 1 / (nbDist[a] * nbDist[a]);
          wSum += wi; vSum += wi * pz[nbIdx[a]];
        }
        grid[j * nx + i] = wSum > 0 ? vSum / wSum : NaN;
      }
    }
  }
  return grid;
}

/** Kriging Simple (known mean) */
export function krigingSimple(points, gridX, gridY, opts = {}) {
  const { model = 'spherical', maxNeighbors = 16 } = opts;
  const vp = estimateVariogramParams(points);
  const sill = opts.sill ?? vp.sill, range = opts.range ?? vp.range, nugget = opts.nugget ?? vp.nugget;
  const knownMean = opts.knownMean ?? (points.reduce((s, p) => s + p.z, 0) / points.length);
  const nx = gridX.length, ny = gridY.length;
  const grid = new Float64Array(nx * ny);
  const si = buildSpatialIndex(points);
  const mn = Math.min(maxNeighbors, points.length);
  const _px = si._px, _py = si._py;
  const pz = new Float64Array(points.length);
  for (let p = 0; p < points.length; p++) pz[p] = points[p].z;
  const nbIdx = new Int32Array(mn);
  const nbDist = new Float64Array(mn);
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const k = si.findKNearestRaw(gridX[i], gridY[j], mn, nbIdx, nbDist);
      if (k === 0) { grid[j * nx + i] = knownMean; continue; }
      if (nbDist[0] < 1e-10) { grid[j * nx + i] = pz[nbIdx[0]]; continue; }
      const C = Array.from({ length: k }, () => new Array(k).fill(0));
      const cv = new Array(k).fill(0);
      for (let a = 0; a < k; a++) {
        for (let b = 0; b < k; b++) {
          const h = Math.sqrt((_px[nbIdx[a]] - _px[nbIdx[b]]) ** 2 + (_py[nbIdx[a]] - _py[nbIdx[b]]) ** 2);
          C[a][b] = (sill + nugget) - variogram(h, model, sill, range, nugget);
        }
        // Diagonal regularization: C(0) = sill+nugget - variogram(0) = sill+nugget
        // but if it's too small or zero, add epsilon
        if (C[a][a] < 1e-10) C[a][a] = Math.max(nugget, 1e-6);
        cv[a] = (sill + nugget) - variogram(nbDist[a], model, sill, range, nugget);
      }
      const w = solveLinearSystem(C, cv);
      // Validate weights
      let bad = !w;
      if (!bad) {
        let wMax = 0;
        for (let a = 0; a < k; a++) { const aw = Math.abs(w[a]); if (aw > wMax) wMax = aw; }
        if (wMax > 10) bad = true;
      }
      if (bad) {
        // IDW fallback
        let wSum = 0, vSum = 0;
        for (let a = 0; a < k; a++) {
          const wi = 1 / (nbDist[a] * nbDist[a]);
          wSum += wi; vSum += wi * pz[nbIdx[a]];
        }
        grid[j * nx + i] = wSum > 0 ? vSum / wSum : NaN;
        continue;
      }
      let val = knownMean;
      for (let a = 0; a < k; a++) val += w[a] * (pz[nbIdx[a]] - knownMean);
      grid[j * nx + i] = isFinite(val) ? val : NaN;
    }
  }
  return grid;
}

/** Radial Basis Function interpolation */
export function rbfInterpolation(points, gridX, gridY, opts = {}) {
  const { basis = 'multiquadric', shapeParam = 1, smoothing = 0 } = opts;
  const n = Math.min(points.length, 500); // limit for matrix solving
  const pts = points.length > n ? points.slice(0, n) : points;
  const nx = gridX.length, ny = gridY.length;
  const grid = new Float64Array(nx * ny);
  const eps = shapeParam;
  const rbfFn = (r) => {
    switch (basis) {
      case 'inverse_multiquadric': return 1 / Math.sqrt(r * r + eps * eps);
      case 'thin_plate_spline': return r < 1e-10 ? 0 : r * r * Math.log(r);
      case 'gaussian': return Math.exp(-((eps * r) ** 2));
      case 'cubic': return r * r * r;
      case 'quintic': return r ** 5;
      default: return Math.sqrt(r * r + eps * eps); // multiquadric
    }
  };
  // Build and solve RBF system
  const A = Array.from({ length: n }, () => new Array(n).fill(0));
  const bz = pts.map(p => p.z);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const r = Math.sqrt((pts[i].x - pts[j].x) ** 2 + (pts[i].y - pts[j].y) ** 2);
      A[i][j] = rbfFn(r);
    }
    A[i][i] += smoothing;
  }
  const weights = solveLinearSystem(A, bz);
  if (!weights) { grid.fill(NaN); return grid; }
  // Interpolate grid
  for (let jj = 0; jj < ny; jj++) {
    for (let ii = 0; ii < nx; ii++) {
      let val = 0;
      for (let k = 0; k < n; k++) {
        const r = Math.sqrt((gridX[ii] - pts[k].x) ** 2 + (gridY[jj] - pts[k].y) ** 2);
        val += weights[k] * rbfFn(r);
      }
      grid[jj * nx + ii] = isFinite(val) ? val : NaN;
    }
  }
  return grid;
}

/** TIN - Delaunay triangulation with linear interpolation.
 *  Uses delaunayTriangulate() (with optional CDT constraint support) for
 *  the triangulation step, then performs grid-accelerated barycentric interpolation.
 *  @param {Array} points - Array of {x, y, z} objects
 *  @param {number[]} gridX - X coordinates of grid columns
 *  @param {number[]} gridY - Y coordinates of grid rows
 *  @param {Object} [opts] - Options: onProgress, constraintEdges */
export function tinInterpolation(points, gridX, gridY, opts = {}) {
  const nx = gridX.length, ny = gridY.length;
  const grid = new Float64Array(nx * ny);
  const n = points.length;
  if (n < 3) { grid.fill(NaN); return grid; }

  const onProgress = opts.onProgress || null;
  const constraintEdges = opts.constraintEdges || null;

  // ── Triangulate using shared Bowyer-Watson + CDT ───────────────────────
  const tin = delaunayTriangulate(points,
    onProgress ? (p) => onProgress(p * 0.7) : null,
    constraintEdges
  );

  if (onProgress) onProgress(0.7);
  const { v0: fv0, v1: fv1, v2: fv2, count: numFinal, px: ptX, py: ptY, pz: ptZ } = tin;
  if (numFinal === 0) { grid.fill(NaN); return grid; }

  // ── Bounding box (for spatial grid cell sizing) ────────────────────────
  let xMin = Infinity, xMax = -Infinity, yMin = Infinity, yMax = -Infinity;
  for (let i = 0; i < n; i++) {
    if (ptX[i] < xMin) xMin = ptX[i]; if (ptX[i] > xMax) xMax = ptX[i];
    if (ptY[i] < yMin) yMin = ptY[i]; if (ptY[i] > yMax) yMax = ptY[i];
  }
  const dmax = Math.max(xMax - xMin, yMax - yMin) || 1;

  // ── Spatial grid for fast triangle lookup during interpolation ────────
  const cellSize = dmax / Math.min(Math.sqrt(numFinal), 100);
  const invCell = 1 / cellSize;
  const triGrid = new Map();
  for (let ti = 0; ti < numFinal; ti++) {
    const v0 = fv0[ti], v1 = fv1[ti], v2 = fv2[ti];
    const bxMin = Math.floor(Math.min(ptX[v0], ptX[v1], ptX[v2]) * invCell);
    const bxMax = Math.floor(Math.max(ptX[v0], ptX[v1], ptX[v2]) * invCell);
    const byMin = Math.floor(Math.min(ptY[v0], ptY[v1], ptY[v2]) * invCell);
    const byMax = Math.floor(Math.max(ptY[v0], ptY[v1], ptY[v2]) * invCell);
    for (let bj = byMin; bj <= byMax; bj++) {
      for (let bi = bxMin; bi <= bxMax; bi++) {
        const key = bi + bj * 100000;
        let bucket = triGrid.get(key);
        if (!bucket) { bucket = []; triGrid.set(key, bucket); }
        bucket.push(ti);
      }
    }
  }

  if (onProgress) onProgress(0.8);

  // ── Interpolate using barycentric coordinates with spatial lookup ──────
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const gx = gridX[i], gy = gridY[j];
      const bi = Math.floor(gx * invCell), bj = Math.floor(gy * invCell);
      const bucket = triGrid.get(bi + bj * 100000);
      let val = NaN;
      if (bucket) {
        for (let k = 0; k < bucket.length; k++) {
          const ti = bucket[k];
          const ax = ptX[fv0[ti]], ay = ptY[fv0[ti]];
          const bx = ptX[fv1[ti]], by = ptY[fv1[ti]];
          const cx = ptX[fv2[ti]], cy = ptY[fv2[ti]];
          const d = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy);
          if (Math.abs(d) < 1e-12) continue;
          const invD = 1 / d;
          const w1 = ((by - cy) * (gx - cx) + (cx - bx) * (gy - cy)) * invD;
          const w2 = ((cy - ay) * (gx - cx) + (ax - cx) * (gy - cy)) * invD;
          const w3 = 1 - w1 - w2;
          if (w1 >= -0.001 && w2 >= -0.001 && w3 >= -0.001) {
            val = ptZ[fv0[ti]] * w1 + ptZ[fv1[ti]] * w2 + ptZ[fv2[ti]] * w3;
            break;
          }
        }
      }
      grid[j * nx + i] = val;
    }
    if (onProgress && j % 10 === 0) onProgress(0.8 + 0.2 * j / ny);
  }

  return grid;
}

/** Nearest Neighbor interpolation */
export function nearestNeighborInterp(points, gridX, gridY, opts = {}) {
  const { searchRadius = Infinity } = opts;
  const nx = gridX.length, ny = gridY.length;
  const grid = new Float64Array(nx * ny);
  const si = buildSpatialIndex(points);
  const pz = new Float64Array(points.length);
  for (let p = 0; p < points.length; p++) pz[p] = points[p].z;
  const nbIdx = new Int32Array(1);
  const nbDist = new Float64Array(1);
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const k = si.findKNearestRaw(gridX[i], gridY[j], 1, nbIdx, nbDist);
      grid[j * nx + i] = (k > 0 && nbDist[0] <= searchRadius) ? pz[nbIdx[0]] : NaN;
    }
  }
  return grid;
}

/** Moving Average interpolation */
export function movingAverage(points, gridX, gridY, opts = {}) {
  const { minPoints = 1, weighted = true } = opts;
  const nx = gridX.length, ny = gridY.length;
  const grid = new Float64Array(nx * ny);
  let xMin = Infinity, xMax = -Infinity, yMin = Infinity, yMax = -Infinity;
  for (const p of points) {
    if (p.x < xMin) xMin = p.x; if (p.x > xMax) xMax = p.x;
    if (p.y < yMin) yMin = p.y; if (p.y > yMax) yMax = p.y;
  }
  const searchRadius = opts.searchRadius || Math.max(xMax - xMin, yMax - yMin) / 10;
  const si = buildSpatialIndex(points);
  const pz = new Float64Array(points.length);
  for (let p = 0; p < points.length; p++) pz[p] = points[p].z;
  const nbIdx = new Int32Array(points.length);
  const nbDist = new Float64Array(points.length);
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const count = si.findWithinRadiusRaw(gridX[i], gridY[j], searchRadius, nbIdx, nbDist);
      if (count < minPoints) { grid[j * nx + i] = NaN; continue; }
      if (weighted) {
        let wSum = 0, vSum = 0;
        for (let k = 0; k < count; k++) {
          const d = nbDist[k];
          const w = d < 1e-10 ? 1e10 : 1 / d;
          wSum += w; vSum += w * pz[nbIdx[k]];
        }
        grid[j * nx + i] = vSum / wSum;
      } else {
        let sum = 0;
        for (let k = 0; k < count; k++) sum += pz[nbIdx[k]];
        grid[j * nx + i] = sum / count;
      }
    }
  }
  return grid;
}

/** Polynomial Regression (global surface fit) */
export function polynomialRegression(points, gridX, gridY, opts = {}) {
  const { order = 2 } = opts;
  const nx = gridX.length, ny = gridY.length;
  const grid = new Float64Array(nx * ny);
  // Build polynomial terms
  function polyTerms(x, y, ord) {
    const terms = [1, x, y];
    if (ord >= 2) terms.push(x * x, x * y, y * y);
    if (ord >= 3) terms.push(x * x * x, x * x * y, x * y * y, y * y * y);
    if (ord >= 4) terms.push(x ** 4, x ** 3 * y, x ** 2 * y ** 2, x * y ** 3, y ** 4);
    return terms;
  }
  const m = polyTerms(0, 0, order).length;
  // Normal equations: (X^T X) beta = X^T z
  const XtX = Array.from({ length: m }, () => new Array(m).fill(0));
  const Xtz = new Array(m).fill(0);
  // Normalize coordinates for numerical stability
  let xMean = 0, yMean = 0, xStd = 0, yStd = 0;
  for (const p of points) { xMean += p.x; yMean += p.y; }
  xMean /= points.length; yMean /= points.length;
  for (const p of points) { xStd += (p.x - xMean) ** 2; yStd += (p.y - yMean) ** 2; }
  xStd = Math.sqrt(xStd / points.length) || 1; yStd = Math.sqrt(yStd / points.length) || 1;
  for (const p of points) {
    const t = polyTerms((p.x - xMean) / xStd, (p.y - yMean) / yStd, order);
    for (let i = 0; i < m; i++) {
      for (let j = 0; j < m; j++) XtX[i][j] += t[i] * t[j];
      Xtz[i] += t[i] * p.z;
    }
  }
  const beta = solveLinearSystem(XtX, Xtz);
  if (!beta) { grid.fill(NaN); return grid; }
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const t = polyTerms((gridX[i] - xMean) / xStd, (gridY[j] - yMean) / yStd, order);
      let val = 0;
      for (let k = 0; k < m; k++) val += beta[k] * t[k];
      grid[j * nx + i] = isFinite(val) ? val : NaN;
    }
  }
  return grid;
}

/** Modified Shepard's Method (local polynomial + distance weighting) */
export function modifiedShepard(points, gridX, gridY, opts = {}) {
  const { power = 2, neighbors = 12 } = opts;
  const nx = gridX.length, ny = gridY.length;
  const grid = new Float64Array(nx * ny);
  const si = buildSpatialIndex(points);
  const pz = new Float64Array(points.length);
  for (let p = 0; p < points.length; p++) pz[p] = points[p].z;
  const mn = Math.min(neighbors, points.length);
  const nbIdx = new Int32Array(mn);
  const nbDist = new Float64Array(mn);
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const k = si.findKNearestRaw(gridX[i], gridY[j], mn, nbIdx, nbDist);
      if (k === 0) { grid[j * nx + i] = NaN; continue; }
      if (nbDist[0] < 1e-10) { grid[j * nx + i] = pz[nbIdx[0]]; continue; }
      const rw = nbDist[k - 1];
      let wSum = 0, vSum = 0;
      for (let m = 0; m < k; m++) {
        const s = Math.max(0, (rw - nbDist[m]) / (rw * nbDist[m]));
        const w = Math.pow(s, power);
        wSum += w; vSum += w * pz[nbIdx[m]];
      }
      grid[j * nx + i] = wSum > 0 ? vSum / wSum : NaN;
    }
  }
  return grid;
}

/** Data Metrics (bin statistics) */
export function dataMetrics(points, gridX, gridY, opts = {}) {
  const { metric = 'mean' } = opts;
  const nx = gridX.length, ny = gridY.length;
  const grid = new Float64Array(nx * ny);
  grid.fill(NaN);
  const dx = nx > 1 ? gridX[1] - gridX[0] : 1;
  const dy = ny > 1 ? gridY[1] - gridY[0] : 1;
  const bins = Array.from({ length: nx * ny }, () => []);
  for (const p of points) {
    const i = Math.round((p.x - gridX[0]) / dx);
    const j = Math.round((p.y - gridY[0]) / dy);
    if (i >= 0 && i < nx && j >= 0 && j < ny) bins[j * nx + i].push(p.z);
  }
  for (let idx = 0; idx < nx * ny; idx++) {
    const b = bins[idx];
    if (b.length === 0) continue;
    switch (metric) {
      case 'count': grid[idx] = b.length; break;
      case 'sum': grid[idx] = b.reduce((s, v) => s + v, 0); break;
      case 'min': grid[idx] = Math.min(...b); break;
      case 'max': grid[idx] = Math.max(...b); break;
      case 'range': grid[idx] = Math.max(...b) - Math.min(...b); break;
      case 'median': { b.sort((a, c) => a - c); grid[idx] = b[Math.floor(b.length / 2)]; break; }
      case 'stddev': {
        const m = b.reduce((s, v) => s + v, 0) / b.length;
        grid[idx] = Math.sqrt(b.reduce((s, v) => s + (v - m) ** 2, 0) / b.length);
        break;
      }
      default: grid[idx] = b.reduce((s, v) => s + v, 0) / b.length; // mean
    }
  }
  return grid;
}

// ═══════════════════════════════════════════════════════════════════════════════
// CONTOUR GENERATION
// ═══════════════════════════════════════════════════════════════════════════════

/** Generate contour levels */
export function generateContourLevels(min, max, interval) {
  const levels = [];
  for (let v = Math.ceil(min / interval) * interval; v <= max; v += interval) levels.push(+v.toFixed(10));
  return levels;
}

/** Marching squares isoline generation */
export function generateContours(grid, gridX, gridY, levels) {
  const nx = gridX.length, ny = gridY.length;
  const contours = [];
  for (const level of levels) {
    const segments = [];
    for (let j = 0; j < ny - 1; j++) {
      for (let i = 0; i < nx - 1; i++) {
        const v = [grid[j * nx + i], grid[j * nx + i + 1], grid[(j + 1) * nx + i + 1], grid[(j + 1) * nx + i]];
        if (v.some(isNaN)) continue;
        const idx = (v[0] >= level ? 8 : 0) | (v[1] >= level ? 4 : 0) | (v[2] >= level ? 2 : 0) | (v[3] >= level ? 1 : 0);
        if (idx === 0 || idx === 15) continue;
        // Lerp with division-by-zero guard
        const lerp = (a, b, va, vb) => {
          const dv = vb - va;
          if (Math.abs(dv) < 1e-15) return (a + b) * 0.5;
          return (level - va) / dv * (b - a) + a;
        };
        const x0 = gridX[i], x1 = gridX[i + 1], y0 = gridY[j], y1 = gridY[j + 1];
        // Compute edge intersection points: top, right, bottom, left
        const top = ((idx & 12) === 4 || (idx & 12) === 8) ? [lerp(x0, x1, v[0], v[1]), y0] : null;
        const right = ((idx & 6) === 2 || (idx & 6) === 4) ? [x1, lerp(y0, y1, v[1], v[2])] : null;
        const bottom = ((idx & 3) === 1 || (idx & 3) === 2) ? [lerp(x0, x1, v[3], v[2]), y1] : null;
        const left = ((idx & 9) === 1 || (idx & 9) === 8) ? [x0, lerp(y0, y1, v[0], v[3])] : null;
        const edges = [];
        if (top) edges.push(top);
        if (right) edges.push(right);
        if (bottom) edges.push(bottom);
        if (left) edges.push(left);

        if (edges.length === 2) {
          segments.push([edges[0], edges[1]]);
        } else if (edges.length === 4) {
          // Saddle point disambiguation (cases 5 and 10)
          const center = (v[0] + v[1] + v[2] + v[3]) * 0.25;
          if (idx === 5) {
            // Case 5: corners 0,2 above → diagonal ambiguity
            if (center >= level) {
              // Connect top→right, bottom→left
              segments.push([top, right]);
              segments.push([bottom, left]);
            } else {
              // Connect top→left, bottom→right
              segments.push([top, left]);
              segments.push([bottom, right]);
            }
          } else if (idx === 10) {
            // Case 10: corners 1,3 above → diagonal ambiguity
            if (center >= level) {
              // Connect top→left, bottom→right
              segments.push([top, left]);
              segments.push([bottom, right]);
            } else {
              // Connect top→right, bottom→left
              segments.push([top, right]);
              segments.push([bottom, left]);
            }
          } else {
            // Other 4-edge cases (shouldn't happen in standard marching squares)
            segments.push([edges[0], edges[1]]);
            segments.push([edges[2], edges[3]]);
          }
        }
      }
    }
    if (segments.length > 0) {
      // Chain segments into polylines and also keep raw segments for backward compat
      const polylines = chainSegments(segments);
      contours.push({ level, polylines, segments });
    }
  }
  return contours;
}

/** Generate filled contour bands (cell-based) */
export function generateFilledContours(grid, gridX, gridY, levels) {
  const nx = gridX.length, ny = gridY.length;
  const bands = [];
  const allLevels = [-Infinity, ...levels, Infinity];
  const dx = nx > 1 ? gridX[1] - gridX[0] : 1;
  const dy = ny > 1 ? gridY[1] - gridY[0] : 1;
  for (let b = 0; b < allLevels.length - 1; b++) {
    const lo = allLevels[b], hi = allLevels[b + 1];
    const cells = [];
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        const v = grid[j * nx + i];
        if (isNaN(v)) continue;
        if (v >= lo && v < hi) {
          cells.push([gridX[i], gridY[j], dx, dy]);
        }
      }
    }
    if (cells.length > 0) bands.push({ levelMin: lo === -Infinity ? levels[0] - 1 : lo, levelMax: hi === Infinity ? levels[levels.length - 1] + 1 : hi, cells });
  }
  return bands;
}

/** Smooth contour segments using Chaikin's corner cutting */
export function smoothContours(contours, factor = 0.5) {
  const iterations = Math.round(factor * 4) || 1;
  return contours.map(c => {
    // Read from polylines (new format) or fall back to chaining segments (old data)
    let chains;
    if (c.polylines && c.polylines.length > 0) {
      chains = c.polylines;
    } else {
      chains = chainSegments(c.segments || []);
    }

    const smoothedPolylines = [];
    for (const chain of chains) {
      let pts = chain.points || chain; // handle both {points,closed} and raw arrays
      const closed = chain.closed || false;
      if (pts.length < 3) {
        smoothedPolylines.push({ points: pts, closed });
        continue;
      }

      for (let iter = 0; iter < iterations; iter++) {
        if (pts.length < 3) break;
        const np = [];
        const n = pts.length;
        if (closed) {
          // Closed loop: wrap around so the closure point is smooth
          for (let i = 0; i < n; i++) {
            const next = (i + 1) % n;
            np.push([pts[i][0] * 0.75 + pts[next][0] * 0.25, pts[i][1] * 0.75 + pts[next][1] * 0.25]);
            np.push([pts[i][0] * 0.25 + pts[next][0] * 0.75, pts[i][1] * 0.25 + pts[next][1] * 0.75]);
          }
        } else {
          // Open polyline
          for (let i = 0; i < n - 1; i++) {
            np.push([pts[i][0] * 0.75 + pts[i + 1][0] * 0.25, pts[i][1] * 0.75 + pts[i + 1][1] * 0.25]);
            np.push([pts[i][0] * 0.25 + pts[i + 1][0] * 0.75, pts[i][1] * 0.25 + pts[i + 1][1] * 0.75]);
          }
        }
        pts = np;
      }
      smoothedPolylines.push({ points: pts, closed });
    }

    // Derive segments from polylines for backward compat
    const segments = [];
    for (const pl of smoothedPolylines) {
      const pts = pl.points;
      const n = pts.length;
      if (pl.closed) {
        for (let i = 0; i < n; i++) segments.push([pts[i], pts[(i + 1) % n]]);
      } else {
        for (let i = 0; i < n - 1; i++) segments.push([pts[i], pts[i + 1]]);
      }
    }

    return { level: c.level, polylines: smoothedPolylines, segments };
  });
}

function chainSegments(segments) {
  if (segments.length === 0) return [];

  // Adaptive epsilon based on coordinate magnitude
  let maxCoord = 0;
  for (let i = 0; i < segments.length; i++) {
    const [p1, p2] = segments[i];
    const m = Math.max(Math.abs(p1[0]), Math.abs(p1[1]), Math.abs(p2[0]), Math.abs(p2[1]));
    if (m > maxCoord) maxCoord = m;
  }
  const eps = Math.max(1e-8, maxCoord * 1e-10);

  // Spatial hash: quantize endpoints to grid keys for O(1) lookup
  const invEps = 1 / eps;
  const quantize = (v) => Math.round(v * invEps);
  const makeKey = (p) => `${quantize(p[0])},${quantize(p[1])}`;

  // Map from spatial key → list of { segIdx, endpoint: 0|1 }
  const hashMap = new Map();
  const addToHash = (key, segIdx, endpoint) => {
    let bucket = hashMap.get(key);
    if (!bucket) { bucket = []; hashMap.set(key, bucket); }
    bucket.push({ segIdx, endpoint });
  };

  const used = new Uint8Array(segments.length);
  for (let i = 0; i < segments.length; i++) {
    addToHash(makeKey(segments[i][0]), i, 0);
    addToHash(makeKey(segments[i][1]), i, 1);
  }

  const removeFromHash = (key, segIdx) => {
    const bucket = hashMap.get(key);
    if (!bucket) return;
    for (let i = bucket.length - 1; i >= 0; i--) {
      if (bucket[i].segIdx === segIdx) { bucket.splice(i, 1); break; }
    }
    if (bucket.length === 0) hashMap.delete(key);
  };

  const findMatch = (pt) => {
    const key = makeKey(pt);
    const bucket = hashMap.get(key);
    if (!bucket || bucket.length === 0) return null;
    for (const entry of bucket) {
      if (!used[entry.segIdx]) return entry;
    }
    return null;
  };

  const polylines = [];
  for (let s = 0; s < segments.length; s++) {
    if (used[s]) continue;
    used[s] = 1;
    removeFromHash(makeKey(segments[s][0]), s);
    removeFromHash(makeKey(segments[s][1]), s);
    const chain = [segments[s][0], segments[s][1]];

    // Extend from end (forward)
    let extending = true;
    while (extending) {
      extending = false;
      const tail = chain[chain.length - 1];
      const match = findMatch(tail);
      if (match) {
        used[match.segIdx] = 1;
        removeFromHash(makeKey(segments[match.segIdx][0]), match.segIdx);
        removeFromHash(makeKey(segments[match.segIdx][1]), match.segIdx);
        // Append the other endpoint
        chain.push(match.endpoint === 0 ? segments[match.segIdx][1] : segments[match.segIdx][0]);
        extending = true;
      }
    }

    // Extend from start (backward)
    extending = true;
    while (extending) {
      extending = false;
      const head = chain[0];
      const match = findMatch(head);
      if (match) {
        used[match.segIdx] = 1;
        removeFromHash(makeKey(segments[match.segIdx][0]), match.segIdx);
        removeFromHash(makeKey(segments[match.segIdx][1]), match.segIdx);
        chain.unshift(match.endpoint === 0 ? segments[match.segIdx][1] : segments[match.segIdx][0]);
        extending = true;
      }
    }

    // Ring detection: if start ≈ end, mark closed and remove duplicate endpoint
    const first = chain[0], last = chain[chain.length - 1];
    const closed = chain.length > 2 &&
      Math.abs(first[0] - last[0]) < eps && Math.abs(first[1] - last[1]) < eps;
    if (closed) chain.pop();

    polylines.push({ points: chain, closed });
  }
  return polylines;
}

// ═══════════════════════════════════════════════════════════════════════════════
// HILLSHADE
// ═══════════════════════════════════════════════════════════════════════════════

/** Compute hillshade from grid */
export function computeHillshade(grid, nx, ny, dx, dy, azimuth = 315, altitude = 45, zFactor = 1) {
  const shade = new Float64Array(nx * ny);
  const az = (360 - azimuth + 90) * Math.PI / 180;
  const alt = altitude * Math.PI / 180;
  for (let j = 1; j < ny - 1; j++) {
    for (let i = 1; i < nx - 1; i++) {
      const dzdx = ((grid[j * nx + i + 1] - grid[j * nx + i - 1]) * zFactor) / (2 * dx);
      const dzdy = ((grid[(j + 1) * nx + i] - grid[(j - 1) * nx + i]) * zFactor) / (2 * dy);
      const slope = Math.atan(Math.sqrt(dzdx * dzdx + dzdy * dzdy));
      const aspect = Math.atan2(dzdy, -dzdx);
      let hs = Math.cos(az - aspect) * Math.sin(slope) * Math.cos(alt) + Math.sin(alt) * Math.cos(slope);
      shade[j * nx + i] = Math.max(0, Math.min(255, hs * 255));
    }
  }
  // Fill edges
  for (let i = 0; i < nx; i++) { shade[i] = shade[nx + i]; shade[(ny - 1) * nx + i] = shade[(ny - 2) * nx + i]; }
  for (let j = 0; j < ny; j++) { shade[j * nx] = shade[j * nx + 1]; shade[j * nx + nx - 1] = shade[j * nx + nx - 2]; }
  return shade;
}

// ═══════════════════════════════════════════════════════════════════════════════
// GRID OPERATIONS
// ═══════════════════════════════════════════════════════════════════════════════

/** Element-wise grid math */
export function gridMath(gridA, gridB, operation) {
  const result = new Float64Array(gridA.length);
  for (let i = 0; i < gridA.length; i++) {
    const a = gridA[i], b = gridB[i];
    switch (operation) {
      case 'add': result[i] = a + b; break;
      case 'subtract': result[i] = a - b; break;
      case 'multiply': result[i] = a * b; break;
      case 'divide': result[i] = b !== 0 ? a / b : NaN; break;
      default: result[i] = a;
    }
  }
  return result;
}

/** Compute grid statistics */
export function computeGridStats(grid) {
  let min = Infinity, max = -Infinity, sum = 0, sum2 = 0, count = 0, nullCount = 0;
  for (let i = 0; i < grid.length; i++) {
    if (isNaN(grid[i])) { nullCount++; continue; }
    if (grid[i] < min) min = grid[i];
    if (grid[i] > max) max = grid[i];
    sum += grid[i]; sum2 += grid[i] * grid[i]; count++;
  }
  const mean = count > 0 ? sum / count : 0;
  const stdDev = count > 0 ? Math.sqrt(sum2 / count - mean * mean) : 0;
  return { min, max, mean, stdDev, count, nullCount };
}

/** Bilinear resampling */
export function resampleGrid(grid, oldNx, oldNy, newNx, newNy) {
  const result = new Float64Array(newNx * newNy);
  for (let j = 0; j < newNy; j++) {
    for (let i = 0; i < newNx; i++) {
      const sx = i * (oldNx - 1) / (newNx - 1);
      const sy = j * (oldNy - 1) / (newNy - 1);
      const x0 = Math.floor(sx), y0 = Math.floor(sy);
      const x1 = Math.min(x0 + 1, oldNx - 1), y1 = Math.min(y0 + 1, oldNy - 1);
      const fx = sx - x0, fy = sy - y0;
      result[j * newNx + i] =
        grid[y0 * oldNx + x0] * (1 - fx) * (1 - fy) + grid[y0 * oldNx + x1] * fx * (1 - fy) +
        grid[y1 * oldNx + x0] * (1 - fx) * fy + grid[y1 * oldNx + x1] * fx * fy;
    }
  }
  return result;
}

// ═══════════════════════════════════════════════════════════════════════════════
// COLOR UTILITIES
// ═══════════════════════════════════════════════════════════════════════════════

function parseHex(hex) {
  return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
}

/** Get color components [r,g,b] from ramp at position t (0-1) */
export function getColorComponents(t, rampName = "viridis") {
  const ramp = COLOR_RAMPS[rampName] || COLOR_RAMPS.viridis;
  t = Math.max(0, Math.min(1, t));
  const idx = t * (ramp.length - 1);
  const lo = Math.floor(idx), hi = Math.min(lo + 1, ramp.length - 1);
  const f = idx - lo;
  const c1 = parseHex(ramp[lo]), c2 = parseHex(ramp[hi]);
  return [Math.round(c1[0] + f * (c2[0] - c1[0])), Math.round(c1[1] + f * (c2[1] - c1[1])), Math.round(c1[2] + f * (c2[2] - c1[2]))];
}

/** Get CSS color string from ramp */
export function getColorFromRamp(t, rampName = "viridis") {
  const [r, g, b] = getColorComponents(t, rampName);
  return `rgb(${r},${g},${b})`;
}

/** Build a pre-computed color lookup table (Uint8Array of steps*3 RGB values).
 *  Avoids hex parsing and interpolation during per-point rendering loops. */
export function buildColorLUT(rampName = "viridis", steps = 256) {
  const lut = new Uint8Array(steps * 3);
  for (let i = 0; i < steps; i++) {
    const t = i / (steps - 1);
    const [r, g, b] = getColorComponents(t, rampName);
    lut[i * 3] = r;
    lut[i * 3 + 1] = g;
    lut[i * 3 + 2] = b;
  }
  return lut;
}

// ═══════════════════════════════════════════════════════════════════════════════
// EXPORT FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════════

/** Export points as CSV */
export function pointsToCSV(points, headers) {
  const cols = headers || ['x', 'y', 'z'];
  const lines = [cols.join(',')];
  for (const p of points) lines.push(cols.map(c => p[c] ?? '').join(','));
  return lines.join('\n');
}

/** Export points as GeoJSON.
 *  Caller should pre-transform points to EPSG:4326 if needed (GeoJSON spec requires WGS84). */
export function pointsToGeoJSON(points) {
  return JSON.stringify({
    type: "FeatureCollection",
    features: points.map(p => ({
      type: "Feature",
      geometry: { type: "Point", coordinates: [p.x, p.y, p.z] },
      properties: { z: p.z },
    })),
  }, null, 2);
}

/** Export breaklines as CSV (one file per breakline, or combined with # separators) */
export function breaklinesToCSV(breaklines) {
  const lines = ["# name,type,x,y,z[,zBottom]"];
  for (const bl of breaklines) {
    const bType = bl.breaklineType || "standard";
    lines.push(`# ${bl.name} (${bType})`);
    for (const v of bl.vertices) {
      if (bType === "wall") lines.push(`${v[0]},${v[1]},${v[2] ?? 0},${v[3] ?? 0}`);
      else if (bType === "proximity") lines.push(`${v[0]},${v[1]}`);
      else lines.push(`${v[0]},${v[1]},${v[2] ?? 0}`);
    }
  }
  return lines.join('\n');
}

/** Export breaklines as GeoJSON LineString features */
export function breaklinesToGeoJSON(breaklines) {
  return JSON.stringify({
    type: "FeatureCollection",
    features: breaklines.filter(bl => bl.vertices && bl.vertices.length >= 2).map(bl => {
      const bType = bl.breaklineType || "standard";
      const coords = bl.vertices.map(v => bType === "wall" ? [v[0], v[1], v[2] ?? 0] : bType === "proximity" ? [v[0], v[1]] : [v[0], v[1], v[2] ?? 0]);
      return {
        type: "Feature",
        geometry: { type: "LineString", coordinates: coords },
        properties: { name: bl.name, breaklineType: bType },
      };
    }),
  }, null, 2);
}

/** Export contours as GeoJSON */
export function contoursToGeoJSON(contours) {
  const features = [];
  for (const c of contours) {
    // Use polylines directly when available, fall back to chaining segments
    const chains = (c.polylines && c.polylines.length > 0)
      ? c.polylines
      : chainSegments(c.segments || []);
    for (const chain of chains) {
      const pts = chain.points || chain; // handle both formats
      const coords = pts.map(p => [p[0], p[1]]);
      // Close the ring in GeoJSON if it's a closed polyline
      if (chain.closed && coords.length > 0) {
        coords.push(coords[0]);
      }
      features.push({
        type: "Feature",
        geometry: { type: "LineString", coordinates: coords },
        properties: { level: c.level },
      });
    }
  }
  return JSON.stringify({ type: "FeatureCollection", features }, null, 2);
}

/** Export grid as ESRI ASCII */
export function gridToASCII(grid, gridX, gridY, nx, ny) {
  const dx = nx > 1 ? gridX[1] - gridX[0] : 1;
  const lines = [
    `ncols ${nx}`, `nrows ${ny}`,
    `xllcorner ${gridX[0]}`, `yllcorner ${gridY[0]}`,
    `cellsize ${dx}`, `NODATA_value -9999`,
  ];
  for (let j = ny - 1; j >= 0; j--) {
    const row = [];
    for (let i = 0; i < nx; i++) {
      const v = grid[j * nx + i];
      row.push(isNaN(v) ? '-9999' : v.toFixed(4));
    }
    lines.push(row.join(' '));
  }
  return lines.join('\n');
}

/** Export interpolated grid nodes as X,Y,Z CSV (skips NaN cells) */
export function gridPointsToCSV(grid, gridX, gridY, nx, ny) {
  const rows = ["X,Y,Z"];
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const v = grid[j * nx + i];
      if (!isNaN(v)) rows.push(`${gridX[i]},${gridY[j]},${v.toFixed(4)}`);
    }
  }
  return rows.join('\n');
}

/** Export interpolated grid nodes as PNEZD for Civil 3D (PointNumber,Northing,Easting,Elevation,Description) */
export function gridPointsToPNEZD(grid, gridX, gridY, nx, ny) {
  const rows = [];
  let num = 1;
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const v = grid[j * nx + i];
      if (!isNaN(v)) rows.push(`${num++},${gridY[j].toFixed(4)},${gridX[i].toFixed(4)},${v.toFixed(4)},GRID`);
    }
  }
  return rows.join('\n');
}

/** Export raw input points as PNEZD for Civil 3D */
export function pointsToPNEZD(points) {
  const rows = [];
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    const num = p.pointNo != null ? p.pointNo : i + 1;
    const desc = p.desc || "";
    rows.push(`${num},${p.y.toFixed(4)},${p.x.toFixed(4)},${p.z.toFixed(4)},${desc}`);
  }
  return rows.join('\n');
}

/** Escape special XML characters */
function escapeXml(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

/** LandXML 1.2 TIN surface from regular grid topology (no Delaunay needed) */
export function gridToLandXML(grid, gridX, gridY, nx, ny, surfaceName) {
  const name = escapeXml(surfaceName || "GridSurface");
  const pnts = [];
  const faces = [];
  // Build point ID map: grid index -> 1-based ID (only valid cells)
  const idMap = new Int32Array(nx * ny).fill(-1);
  let nextId = 1;
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const idx = j * nx + i;
      if (!isNaN(grid[idx])) {
        idMap[idx] = nextId++;
        pnts.push(`<P id="${idMap[idx]}">${gridY[j].toFixed(4)} ${gridX[i].toFixed(4)} ${grid[idx].toFixed(4)}</P>`);
      }
    }
  }
  // Build faces: each cell split into 2 triangles
  for (let j = 0; j < ny - 1; j++) {
    for (let i = 0; i < nx - 1; i++) {
      const bl = j * nx + i, br = bl + 1;
      const tl = (j + 1) * nx + i, tr = tl + 1;
      if (idMap[bl] < 0 || idMap[br] < 0 || idMap[tl] < 0 || idMap[tr] < 0) continue;
      faces.push(`<F>${idMap[bl]} ${idMap[br]} ${idMap[tl]}</F>`);
      faces.push(`<F>${idMap[br]} ${idMap[tr]} ${idMap[tl]}</F>`);
    }
  }
  return `<?xml version="1.0" encoding="UTF-8"?>
<LandXML version="1.2" xmlns="http://www.landxml.org/schema/LandXML-1.2">
  <Units><Metric areaUnit="squareMeter" linearUnit="meter" volumeUnit="cubicMeter"/></Units>
  <Application name="GridForge GIS" version="1.0.0"/>
  <Surfaces>
    <Surface name="${name}">
      <Definition surfType="TIN">
        <Pnts>${pnts.join('')}</Pnts>
        <Faces>${faces.join('')}</Faces>
      </Definition>
    </Surface>
  </Surfaces>
</LandXML>`;
}

/** LandXML 1.2 TIN surface from delaunayTriangulate() result */
export function tinToLandXML(tin, surfaceName) {
  const name = escapeXml(surfaceName || "TINSurface");
  // Collect referenced point indices and re-index to 1-based
  const usedSet = new Set();
  for (let i = 0; i < tin.count; i++) {
    usedSet.add(tin.v0[i]);
    usedSet.add(tin.v1[i]);
    usedSet.add(tin.v2[i]);
  }
  const reindex = new Map();
  const pnts = [];
  let nextId = 1;
  for (const idx of usedSet) {
    reindex.set(idx, nextId);
    pnts.push(`<P id="${nextId}">${tin.py[idx].toFixed(4)} ${tin.px[idx].toFixed(4)} ${tin.pz[idx].toFixed(4)}</P>`);
    nextId++;
  }
  const faces = [];
  for (let i = 0; i < tin.count; i++) {
    faces.push(`<F>${reindex.get(tin.v0[i])} ${reindex.get(tin.v1[i])} ${reindex.get(tin.v2[i])}</F>`);
  }
  return `<?xml version="1.0" encoding="UTF-8"?>
<LandXML version="1.2" xmlns="http://www.landxml.org/schema/LandXML-1.2">
  <Units><Metric areaUnit="squareMeter" linearUnit="meter" volumeUnit="cubicMeter"/></Units>
  <Application name="GridForge GIS" version="1.0.0"/>
  <Surfaces>
    <Surface name="${name}">
      <Definition surfType="TIN">
        <Pnts>${pnts.join('')}</Pnts>
        <Faces>${faces.join('')}</Faces>
      </Definition>
    </Surface>
  </Surfaces>
</LandXML>`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// PROJECT SERIALIZATION
// ═══════════════════════════════════════════════════════════════════════════════

/** Serialize project state to JSON */
export function serializeProject(state) {
  const s = { ...state };
  // Convert Float64Arrays to regular arrays for JSON
  if (s.gridData?.grid) s.gridData = { ...s.gridData, grid: Array.from(s.gridData.grid) };
  if (s.hillshadeData) s.hillshadeData = Array.from(s.hillshadeData);
  return JSON.stringify(s);
}

/** Deserialize project JSON back to state */
const MAX_GRID_CELLS = 25_000_000;
export function deserializeProject(json) {
  const s = JSON.parse(json);
  if (typeof s !== "object" || s === null || Array.isArray(s)) {
    throw new Error("Invalid project file: expected an object");
  }
  if (s.gridData?.grid) {
    if (!Array.isArray(s.gridData.grid)) throw new Error("Invalid project file: grid must be an array");
    if (s.gridData.grid.length > MAX_GRID_CELLS) throw new Error(`Grid too large: ${s.gridData.grid.length} cells exceeds ${MAX_GRID_CELLS} limit`);
    s.gridData.grid = new Float64Array(s.gridData.grid);
  }
  if (s.hillshadeData) {
    if (!Array.isArray(s.hillshadeData)) throw new Error("Invalid project file: hillshadeData must be an array");
    if (s.hillshadeData.length > MAX_GRID_CELLS) throw new Error(`Hillshade too large: ${s.hillshadeData.length} cells exceeds ${MAX_GRID_CELLS} limit`);
    s.hillshadeData = new Float64Array(s.hillshadeData);
  }
  return s;
}

// ═══════════════════════════════════════════════════════════════════════════════
// MEASUREMENT TOOLS
// ═══════════════════════════════════════════════════════════════════════════════

/** Euclidean distance */
export function measureDistance(x1, y1, x2, y2) {
  return Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
}

/** Total polyline length */
export function measurePolylineLength(pts) {
  let len = 0;
  for (let i = 1; i < pts.length; i++) len += measureDistance(pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1]);
  return len;
}

/** Polygon area (Shoelace formula) */
export function measurePolygonArea(pts) {
  let area = 0;
  for (let i = 0; i < pts.length; i++) {
    const j = (i + 1) % pts.length;
    area += pts[i][0] * pts[j][1] - pts[j][0] * pts[i][1];
  }
  return Math.abs(area) / 2;
}

// ═══════════════════════════════════════════════════════════════════════════════
// 3D PROJECTION
// ═══════════════════════════════════════════════════════════════════════════════

/** Project 3D point to 2D screen coordinates */
export function project3D(x, y, z, angleX = 30, angleZ = 45, scale = 1, cx = 0, cy = 0, cz = 0) {
  const ax = angleX * Math.PI / 180, az = angleZ * Math.PI / 180;
  const dx = x - cx, dy = y - cy, dz = (z - cz) * scale;
  // Rotate around Z axis
  const rx = dx * Math.cos(az) - dy * Math.sin(az);
  const ry = dx * Math.sin(az) + dy * Math.cos(az);
  // Rotate around X axis (tilt)
  const ry2 = ry * Math.cos(ax) - dz * Math.sin(ax);
  const rz = ry * Math.sin(ax) + dz * Math.cos(ax);
  return { sx: rx, sy: -ry2, depth: rz };
}

/** Generate sample data for demo */
export function generateSampleData(count = 500) {
  const points = [];
  for (let i = 0; i < count; i++) {
    const x = Math.random() * 1000;
    const y = Math.random() * 1000;
    const z = 50 * Math.sin(x / 150) * Math.cos(y / 200) + 30 * Math.sin((x + y) / 100) + Math.random() * 10 + 100;
    points.push({ x: +x.toFixed(2), y: +y.toFixed(2), z: +z.toFixed(2) });
  }
  return points;
}

// ═══════════════════════════════════════════════════════════════════════════════
// BOUNDARIES & BREAKLINES
// ═══════════════════════════════════════════════════════════════════════════════

/** Point-in-polygon test using ray casting */
export function pointInPolygon(x, y, polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i][0], yi = polygon[i][1];
    const xj = polygon[j][0], yj = polygon[j][1];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

/** Densify a breakline into points at given max spacing.
 *  Caps each segment to 500 subdivisions to prevent memory explosion on very long segments. */
export function densifyBreakline(vertices, maxSpacing) {
  const result = [];
  for (let i = 0; i < vertices.length; i++) {
    result.push({ x: vertices[i][0], y: vertices[i][1], z: vertices[i][2] });
    if (i < vertices.length - 1) {
      const dx = vertices[i + 1][0] - vertices[i][0];
      const dy = vertices[i + 1][1] - vertices[i][1];
      const dz = vertices[i + 1][2] - vertices[i][2];
      const segLen = Math.sqrt(dx * dx + dy * dy);
      const nSeg = Math.min(500, Math.ceil(segLen / maxSpacing));
      for (let s = 1; s < nSeg; s++) {
        const t = s / nSeg;
        result.push({
          x: vertices[i][0] + dx * t,
          y: vertices[i][1] + dy * t,
          z: vertices[i][2] + dz * t,
        });
      }
    }
  }
  return result;
}

/** Densify a proximity breakline — 2D vertices get Z from nearest data points.
 *  Falls back to z=0 when no data points are available. */
export function densifyProximityBreakline(vertices, maxSpacing, dataPoints) {
  let getZ;
  if (dataPoints.length === 0) {
    getZ = () => 0;
  } else {
    const si = buildSpatialIndex(dataPoints);
    getZ = (x, y) => {
      const nbs = si.findKNearest(x, y, 1);
      return nbs.length > 0 ? dataPoints[nbs[0].idx].z : 0;
    };
  }
  const result = [];
  for (let i = 0; i < vertices.length; i++) {
    const [vx, vy] = vertices[i];
    result.push({ x: vx, y: vy, z: getZ(vx, vy) });
    if (i < vertices.length - 1) {
      const [nx, ny] = vertices[i + 1];
      const dx = nx - vx, dy = ny - vy;
      const segLen = Math.sqrt(dx * dx + dy * dy);
      const nSeg = Math.min(500, Math.ceil(segLen / maxSpacing));
      for (let s = 1; s < nSeg; s++) {
        const t = s / nSeg;
        const mx = vx + dx * t, my = vy + dy * t;
        result.push({ x: mx, y: my, z: getZ(mx, my) });
      }
    }
  }
  return result;
}

/** Densify a wall breakline — dual Z values create vertical discontinuity */
export function densifyWallBreakline(vertices, maxSpacing) {
  const offset = maxSpacing * 0.1;
  const result = [];
  for (let i = 0; i < vertices.length; i++) {
    const [vx, vy, zTop, zBottom] = vertices[i];
    // Compute perpendicular direction from segment
    let perpX = 0, perpY = 1;
    if (i < vertices.length - 1) {
      const dx = vertices[i + 1][0] - vx, dy = vertices[i + 1][1] - vy;
      const len = Math.sqrt(dx * dx + dy * dy) || 1;
      perpX = -dy / len; perpY = dx / len;
    } else if (i > 0) {
      const dx = vx - vertices[i - 1][0], dy = vy - vertices[i - 1][1];
      const len = Math.sqrt(dx * dx + dy * dy) || 1;
      perpX = -dy / len; perpY = dx / len;
    }
    result.push({ x: vx + perpX * offset, y: vy + perpY * offset, z: zTop });
    result.push({ x: vx - perpX * offset, y: vy - perpY * offset, z: zBottom });
    if (i < vertices.length - 1) {
      const [nx, ny, nzTop, nzBottom] = vertices[i + 1];
      const dx = nx - vx, dy = ny - vy;
      const segLen = Math.sqrt(dx * dx + dy * dy);
      const nSeg = Math.min(500, Math.ceil(segLen / maxSpacing));
      const segDx = dx, segDy = dy;
      const segLen2 = Math.sqrt(segDx * segDx + segDy * segDy) || 1;
      const sPerpX = -segDy / segLen2, sPerpY = segDx / segLen2;
      for (let s = 1; s < nSeg; s++) {
        const t = s / nSeg;
        const mx = vx + dx * t, my = vy + dy * t;
        const mzTop = zTop + (nzTop - zTop) * t;
        const mzBottom = zBottom + (nzBottom - zBottom) * t;
        result.push({ x: mx + sPerpX * offset, y: my + sPerpY * offset, z: mzTop });
        result.push({ x: mx - sPerpX * offset, y: my - sPerpY * offset, z: mzBottom });
      }
    }
  }
  return result;
}

/** Apply boundary masks to a grid — outer boundaries clip outside, inner boundaries create holes */
export function applyBoundaryMask(grid, gridX, gridY, boundaries) {
  const nx = gridX.length, ny = gridY.length;
  const outers = boundaries.filter(b => b.type === "outer");
  const inners = boundaries.filter(b => b.type === "inner");
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const x = gridX[i], y = gridY[j];
      // If any outer boundaries exist, point must be inside at least one
      if (outers.length > 0) {
        let insideAny = false;
        for (const b of outers) {
          if (pointInPolygon(x, y, b.vertices)) { insideAny = true; break; }
        }
        if (!insideAny) { grid[j * nx + i] = NaN; continue; }
      }
      // If inside any inner boundary, mask it out (create hole)
      for (const b of inners) {
        if (pointInPolygon(x, y, b.vertices)) { grid[j * nx + i] = NaN; break; }
      }
    }
  }
  return grid;
}

// ═══════════════════════════════════════════════════════════════════════════════
// AUTO BOUNDARY GENERATION
// ═══════════════════════════════════════════════════════════════════════════════

/** Cross product of vectors OA and OB where O is origin */
function cross2D(ox, oy, ax, ay, bx, by) {
  return (ax - ox) * (by - oy) - (ay - oy) * (bx - ox);
}

/**
 * Compute the convex hull of a set of points.
 * Uses Andrew's monotone chain algorithm — O(n log n).
 * Returns [[x,y], [x,y], ...] in CCW order.
 */
export function computeConvexHull(points) {
  if (points.length < 3) return points.map(p => [p.x, p.y]);
  const pts = points.map(p => [p.x, p.y]);
  pts.sort((a, b) => a[0] - b[0] || a[1] - b[1]);

  // Build lower hull
  const lower = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross2D(lower[lower.length - 2][0], lower[lower.length - 2][1], lower[lower.length - 1][0], lower[lower.length - 1][1], p[0], p[1]) <= 0)
      lower.pop();
    lower.push(p);
  }
  // Build upper hull
  const upper = [];
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i];
    while (upper.length >= 2 && cross2D(upper[upper.length - 2][0], upper[upper.length - 2][1], upper[upper.length - 1][0], upper[upper.length - 1][1], p[0], p[1]) <= 0)
      upper.pop();
    upper.push(p);
  }
  // Remove last point of each half (it's the same as first of the other)
  lower.pop();
  upper.pop();
  return lower.concat(upper);
}

/**
 * Compute a concave hull of a set of points.
 * Starts from the convex hull, then iteratively "digs in" along long edges
 * by inserting the nearest interior point, creating a tighter boundary.
 * 
 * @param {Array} points - Array of {x, y} objects
 * @param {number} concavity - 0 = convex hull, 1 = tightest fit.
 *   Controls the threshold as a fraction of the mean edge length.
 * @returns {Array} [[x,y], ...] vertices in order
 */
export function computeConcaveHull(points, concavity = 0.5) {
  if (points.length < 3) return points.map(p => [p.x, p.y]);
  if (concavity <= 0) return computeConvexHull(points);

  const hull = computeConvexHull(points);
  if (hull.length < 3) return hull;

  // Build a set of hull point keys for quick lookup
  const hullSet = new Set(hull.map(v => `${v[0]},${v[1]}`));

  // Interior points (not on the convex hull)
  const interior = points.filter(p => !hullSet.has(`${p.x},${p.y}`));
  if (interior.length === 0) return hull;

  // Compute edge length threshold: shorter edges won't be split
  // concavity=1 → threshold = mean/4 (aggressive dig), concavity=0.5 → threshold = mean
  let totalEdgeLen = 0;
  for (let i = 0; i < hull.length; i++) {
    const j = (i + 1) % hull.length;
    const dx = hull[j][0] - hull[i][0], dy = hull[j][1] - hull[i][1];
    totalEdgeLen += Math.sqrt(dx * dx + dy * dy);
  }
  const meanEdge = totalEdgeLen / hull.length;
  const threshold = meanEdge * (1.2 - concavity);

  // Build spatial lookup for interior points
  const result = [...hull];
  const usedPts = new Set(hull.map(v => `${v[0]},${v[1]}`));
  let changed = true;
  let maxIter = points.length; // safety cap

  while (changed && maxIter-- > 0) {
    changed = false;
    for (let i = 0; i < result.length; i++) {
      const j = (i + 1) % result.length;
      const ex = result[j][0] - result[i][0], ey = result[j][1] - result[i][1];
      const edgeLen = Math.sqrt(ex * ex + ey * ey);
      if (edgeLen < threshold) continue;

      // Find nearest interior point to edge midpoint that is on the correct side
      const mx = (result[i][0] + result[j][0]) / 2;
      const my = (result[i][1] + result[j][1]) / 2;
      let bestDist = edgeLen * 0.8; // don't pick points farther than 80% of edge
      let bestPt = null;

      for (const p of interior) {
        const key = `${p.x},${p.y}`;
        if (usedPts.has(key)) continue;
        const dx = p.x - mx, dy = p.y - my;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d < bestDist) {
          // Ensure the point is on the interior side (negative cross product = right side = inward for CCW hull)
          const cp = cross2D(result[i][0], result[i][1], result[j][0], result[j][1], p.x, p.y);
          if (cp < 0) { // interior side for CCW hull
            bestDist = d;
            bestPt = p;
          }
        }
      }

      if (bestPt) {
        // Insert the point between i and j
        result.splice(i + 1, 0, [bestPt.x, bestPt.y]);
        usedPts.add(`${bestPt.x},${bestPt.y}`);
        changed = true;
        break; // restart scan since array changed
      }
    }
  }

  return result;
}

// ═══════════════════════════════════════════════════════════════════════════════
// DELAUNAY TRIANGULATION (standalone, reusable)
// ═══════════════════════════════════════════════════════════════════════════════

/** Bowyer-Watson Delaunay triangulation with optional constraint edge enforcement (CDT).
 *  @param {Array} points - Array of {x, y, z} objects
 *  @param {Function} [onProgress] - Optional callback(0..1)
 *  @param {Array} [constraintEdges] - Optional array of [indexA, indexB] pairs to enforce as edges
 *  @returns {{ v0: Int32Array, v1: Int32Array, v2: Int32Array, count: number,
 *             px: Float64Array, py: Float64Array, pz: Float64Array }} */
export function delaunayTriangulate(points, onProgress, constraintEdges) {
  const n = points.length;
  if (n < 3) return { v0: new Int32Array(0), v1: new Int32Array(0), v2: new Int32Array(0), count: 0, px: new Float64Array(0), py: new Float64Array(0), pz: new Float64Array(0) };

  // Bounding box
  let xMin = Infinity, xMax = -Infinity, yMin = Infinity, yMax = -Infinity;
  for (let i = 0; i < n; i++) {
    const p = points[i];
    if (p.x < xMin) xMin = p.x; if (p.x > xMax) xMax = p.x;
    if (p.y < yMin) yMin = p.y; if (p.y > yMax) yMax = p.y;
  }
  const dmax = Math.max(xMax - xMin, yMax - yMin) || 1;
  const midX = (xMin + xMax) / 2, midY = (yMin + yMax) / 2;

  // Flat coordinate arrays
  const ptX = new Float64Array(n + 3);
  const ptY = new Float64Array(n + 3);
  const ptZ = new Float64Array(n);
  for (let i = 0; i < n; i++) { ptX[i] = points[i].x; ptY[i] = points[i].y; ptZ[i] = points[i].z; }
  // Super-triangle
  ptX[n] = midX - 20 * dmax; ptY[n] = midY - dmax;
  ptX[n + 1] = midX; ptY[n + 1] = midY + 20 * dmax;
  ptX[n + 2] = midX + 20 * dmax; ptY[n + 2] = midY - dmax;

  // Spatial bin-sort for insertion locality
  const sortedIdx = new Int32Array(n);
  for (let i = 0; i < n; i++) sortedIdx[i] = i;
  const numBins = Math.max(1, Math.floor(Math.sqrt(n) * 0.5));
  const binW = (xMax - xMin) / numBins || 1;
  const binH = (yMax - yMin) / numBins || 1;
  const binKeys = new Int32Array(n);
  for (let i = 0; i < n; i++) {
    const bx = Math.min(numBins - 1, Math.floor((ptX[i] - xMin) / binW));
    const by = Math.min(numBins - 1, Math.floor((ptY[i] - yMin) / binH));
    binKeys[i] = by * numBins + (by & 1 ? numBins - 1 - bx : bx);
  }
  sortedIdx.sort((a, b) => binKeys[a] - binKeys[b]);

  // Triangle storage (flat typed arrays + cached circumcircles)
  const maxSlots = n * 6 + 10;
  const triV0 = new Int32Array(maxSlots);
  const triV1 = new Int32Array(maxSlots);
  const triV2 = new Int32Array(maxSlots);
  const triCX = new Float64Array(maxSlots);
  const triCY = new Float64Array(maxSlots);
  const triR2 = new Float64Array(maxSlots);
  const triAlive = new Uint8Array(maxSlots);
  let triCount = 0;
  const freeSlots = [];

  function addTri(v0, v1, v2) {
    const ti = freeSlots.length > 0 ? freeSlots.pop() : triCount++;
    triV0[ti] = v0; triV1[ti] = v1; triV2[ti] = v2;
    triAlive[ti] = 1;
    const ax = ptX[v0], ay = ptY[v0], bx = ptX[v1], by = ptY[v1], cx = ptX[v2], cy = ptY[v2];
    const D = 2 * (ax * (by - cy) + bx * (cy - ay) + cx * (ay - by));
    if (Math.abs(D) < 1e-12) {
      triCX[ti] = 0; triCY[ti] = 0; triR2[ti] = 1e30;
    } else {
      const a2 = ax * ax + ay * ay, b2 = bx * bx + by * by, c2 = cx * cx + cy * cy;
      const ux = (a2 * (by - cy) + b2 * (cy - ay) + c2 * (ay - by)) / D;
      const uy = (a2 * (cx - bx) + b2 * (ax - cx) + c2 * (bx - ax)) / D;
      triCX[ti] = ux; triCY[ti] = uy;
      triR2[ti] = (ax - ux) * (ax - ux) + (ay - uy) * (ay - uy);
    }
  }

  // Seed with super-triangle
  addTri(n, n + 1, n + 2);

  // Bowyer-Watson incremental insertion
  const badBuf = new Int32Array(maxSlots);
  const edgeBuf = new Int32Array(maxSlots * 2);
  const progressStep = Math.max(1, Math.floor(n / 50));

  for (let si = 0; si < n; si++) {
    const pi = sortedIdx[si];
    const ppx = ptX[pi], ppy = ptY[pi];

    let badCount = 0;
    for (let t = 0; t < triCount; t++) {
      if (!triAlive[t]) continue;
      const dx = ppx - triCX[t], dy = ppy - triCY[t];
      if (dx * dx + dy * dy <= triR2[t] + 1e-8) badBuf[badCount++] = t;
    }

    let edgeCount = 0;
    for (let bi = 0; bi < badCount; bi++) {
      const bt = badBuf[bi];
      const a0 = triV0[bt], a1 = triV1[bt], a2 = triV2[bt];
      for (let e = 0; e < 3; e++) {
        const e1 = e === 0 ? a0 : e === 1 ? a1 : a2;
        const e2 = e === 0 ? a1 : e === 1 ? a2 : a0;
        let shared = false;
        for (let bj = 0; bj < badCount; bj++) {
          if (bj === bi) continue;
          const bt2 = badBuf[bj];
          const w0 = triV0[bt2], w1 = triV1[bt2], w2 = triV2[bt2];
          if ((w0 === e1 && w1 === e2) || (w1 === e1 && w2 === e2) || (w2 === e1 && w0 === e2) ||
            (w0 === e2 && w1 === e1) || (w1 === e2 && w2 === e1) || (w2 === e2 && w0 === e1)) {
            shared = true; break;
          }
        }
        if (!shared) { edgeBuf[edgeCount++] = e1; edgeBuf[edgeCount++] = e2; }
      }
    }

    for (let bi = 0; bi < badCount; bi++) {
      triAlive[badBuf[bi]] = 0;
      freeSlots.push(badBuf[bi]);
    }

    for (let ei = 0; ei < edgeCount; ei += 2) addTri(pi, edgeBuf[ei], edgeBuf[ei + 1]);

    if (onProgress && si % progressStep === 0) onProgress(si / n);
  }

  // ── Enforce constraint edges (Sloan 1993 CDT algorithm) ─────────────
  if (constraintEdges && constraintEdges.length > 0) {
    // Build edge → triangle adjacency
    const ek = (a, b) => a < b ? a * 131071 + b : b * 131071 + a;
    const edgeAdj = new Map();

    for (let ti = 0; ti < triCount; ti++) {
      if (!triAlive[ti]) continue;
      const va = triV0[ti], vb = triV1[ti], vc = triV2[ti];
      const edges = [ek(va, vb), ek(vb, vc), ek(vc, va)];
      for (const key of edges) {
        let arr = edgeAdj.get(key);
        if (!arr) { arr = []; edgeAdj.set(key, arr); }
        arr.push(ti);
      }
    }

    function removeTriAdj(ti) {
      const va = triV0[ti], vb = triV1[ti], vc = triV2[ti];
      for (const key of [ek(va, vb), ek(vb, vc), ek(vc, va)]) {
        const arr = edgeAdj.get(key);
        if (arr) {
          const idx = arr.indexOf(ti);
          if (idx >= 0) arr.splice(idx, 1);
          if (arr.length === 0) edgeAdj.delete(key);
        }
      }
    }

    function addTriAdj(ti) {
      const va = triV0[ti], vb = triV1[ti], vc = triV2[ti];
      for (const key of [ek(va, vb), ek(vb, vc), ek(vc, va)]) {
        let arr = edgeAdj.get(key);
        if (!arr) { arr = []; edgeAdj.set(key, arr); }
        arr.push(ti);
      }
    }

    function oppositeVert(ti, ea, eb) {
      const a = triV0[ti], b = triV1[ti], c = triV2[ti];
      if (a !== ea && a !== eb) return a;
      if (b !== ea && b !== eb) return b;
      return c;
    }

    // Proper segment intersection test (excludes endpoints)
    function segsCross(ax, ay, bx, by, cx, cy, dx, dy) {
      const d1 = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
      const d2 = (bx - ax) * (dy - ay) - (by - ay) * (dx - ax);
      const d3 = (dx - cx) * (ay - cy) - (dy - cy) * (ax - cx);
      const d4 = (dx - cx) * (by - cy) - (dy - cy) * (bx - cx);
      return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) &&
             ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
    }

    function recomputeCircum(ti) {
      const ax = ptX[triV0[ti]], ay = ptY[triV0[ti]];
      const bx = ptX[triV1[ti]], by = ptY[triV1[ti]];
      const cx = ptX[triV2[ti]], cy = ptY[triV2[ti]];
      const D = 2 * (ax * (by - cy) + bx * (cy - ay) + cx * (ay - by));
      if (Math.abs(D) < 1e-12) {
        triCX[ti] = 0; triCY[ti] = 0; triR2[ti] = 1e30;
      } else {
        const a2 = ax * ax + ay * ay, b2 = bx * bx + by * by, c2 = cx * cx + cy * cy;
        triCX[ti] = (a2 * (by - cy) + b2 * (cy - ay) + c2 * (ay - by)) / D;
        triCY[ti] = (a2 * (cx - bx) + b2 * (ax - cx) + c2 * (bx - ax)) / D;
        triR2[ti] = (ax - triCX[ti]) * (ax - triCX[ti]) + (ay - triCY[ti]) * (ay - triCY[ti]);
      }
    }

    function flipEdge(ti1, ti2, ea, eb) {
      const p = oppositeVert(ti1, ea, eb);
      const q = oppositeVert(ti2, ea, eb);
      removeTriAdj(ti1);
      removeTriAdj(ti2);
      triV0[ti1] = p; triV1[ti1] = q; triV2[ti1] = ea;
      triV0[ti2] = p; triV1[ti2] = q; triV2[ti2] = eb;
      recomputeCircum(ti1);
      recomputeCircum(ti2);
      addTriAdj(ti1);
      addTriAdj(ti2);
      return [p, q];
    }

    const constrainedSet = new Set();

    for (const ce of constraintEdges) {
      const ca = ce[0], cb = ce[1];
      if (ca >= n || cb >= n || ca === cb) continue;
      const ckey = ek(ca, cb);
      if (edgeAdj.has(ckey) && edgeAdj.get(ckey).length > 0) {
        constrainedSet.add(ckey);
        continue;
      }

      // Collect all edges that cross constraint segment (ca, cb)
      const crossing = [];
      for (const [key, tris] of edgeAdj) {
        if (tris.length !== 2) continue;
        // Decode edge vertices from key
        let ea, eb;
        if (key > 0) {
          ea = Math.floor(key / 131071);
          eb = key - ea * 131071;
        } else continue;
        if (ea === ca || ea === cb || eb === ca || eb === cb) continue;
        if (segsCross(ptX[ca], ptY[ca], ptX[cb], ptY[cb], ptX[ea], ptY[ea], ptX[eb], ptY[eb])) {
          crossing.push([ea, eb]);
        }
      }

      // Iteratively flip crossing edges until constraint edge appears (Sloan algorithm)
      const newEdges = [];
      let maxIter = crossing.length * crossing.length + crossing.length + 10;
      while (crossing.length > 0 && maxIter-- > 0) {
        const edge = crossing.shift();
        const ea = edge[0], eb = edge[1];
        const ekey = ek(ea, eb);
        const eTris = edgeAdj.get(ekey);
        if (!eTris || eTris.length !== 2) continue;

        const ti1 = eTris[0], ti2 = eTris[1];
        const p = oppositeVert(ti1, ea, eb);
        const q = oppositeVert(ti2, ea, eb);

        // Convexity check: quad is convex iff diagonals p-q and ea-eb cross
        if (!segsCross(ptX[p], ptY[p], ptX[q], ptY[q], ptX[ea], ptY[ea], ptX[eb], ptY[eb])) {
          crossing.push(edge); // Non-convex, try again later
          continue;
        }

        const flipped = flipEdge(ti1, ti2, ea, eb);
        const fp = flipped[0], fq = flipped[1];
        const fkey = ek(fp, fq);

        if (fkey === ckey) {
          constrainedSet.add(ckey);
        } else if (segsCross(ptX[ca], ptY[ca], ptX[cb], ptY[cb], ptX[fp], ptY[fp], ptX[fq], ptY[fq])) {
          crossing.push([fp, fq]);
        } else {
          newEdges.push([fp, fq]);
        }
      }

      constrainedSet.add(ckey);

      // Restore Delaunay property for non-constraint new edges
      let changed = true;
      let passes = 0;
      while (changed && passes++ < 4) {
        changed = false;
        for (const ne of newEdges) {
          const neKey = ek(ne[0], ne[1]);
          if (constrainedSet.has(neKey)) continue;
          const neTris = edgeAdj.get(neKey);
          if (!neTris || neTris.length !== 2) continue;
          const ti1 = neTris[0], ti2 = neTris[1];
          const p = oppositeVert(ti1, ne[0], ne[1]);
          const q = oppositeVert(ti2, ne[0], ne[1]);
          // In-circumcircle test: if q is inside circumcircle of triangle (p, ne[0], ne[1]) → flip
          const dx = ptX[q] - triCX[ti1], dy = ptY[q] - triCY[ti1];
          if (dx * dx + dy * dy < triR2[ti1] - 1e-8) {
            if (segsCross(ptX[p], ptY[p], ptX[q], ptY[q], ptX[ne[0]], ptY[ne[0]], ptX[ne[1]], ptY[ne[1]])) {
              const flipped = flipEdge(ti1, ti2, ne[0], ne[1]);
              ne[0] = flipped[0]; ne[1] = flipped[1];
              changed = true;
            }
          }
        }
      }
    }
  }

  // Collect final triangles (exclude super-triangle vertices)
  let numFinal = 0;
  for (let t = 0; t < triCount; t++) {
    if (triAlive[t] && triV0[t] < n && triV1[t] < n && triV2[t] < n) numFinal++;
  }
  const fv0 = new Int32Array(numFinal);
  const fv1 = new Int32Array(numFinal);
  const fv2 = new Int32Array(numFinal);
  let fi = 0;
  for (let t = 0; t < triCount; t++) {
    if (!triAlive[t]) continue;
    if (triV0[t] >= n || triV1[t] >= n || triV2[t] >= n) continue;
    fv0[fi] = triV0[t]; fv1[fi] = triV1[t]; fv2[fi] = triV2[t]; fi++;
  }

  if (onProgress) onProgress(1);
  return { v0: fv0, v1: fv1, v2: fv2, count: numFinal, px: ptX, py: ptY, pz: ptZ };
}

// ═══════════════════════════════════════════════════════════════════════════════
// TIN CONTOUR GENERATION
// ═══════════════════════════════════════════════════════════════════════════════

/** Generate contours by tracing isolines through a TIN (Delaunay triangulation).
 *  For each triangle, if a contour level crosses two of its three edges,
 *  we linearly interpolate the crossing points and emit a segment.
 *  Segments are then chained into polylines.
 *
 *  @param {Object} tin - Result from delaunayTriangulate()
 *  @param {number[]} levels - Contour levels to trace
 *  @returns {Array} contours in same format as generateContours: [{level, polylines, segments}]
 */
export function generateTINContours(tin, levels) {
  const { v0, v1, v2, count, px, py, pz } = tin;
  if (count === 0) return [];

  const contours = [];

  for (const level of levels) {
    const segments = [];

    for (let ti = 0; ti < count; ti++) {
      const i0 = v0[ti], i1 = v1[ti], i2 = v2[ti];
      const z0 = pz[i0], z1 = pz[i1], z2 = pz[i2];

      // Find edge crossings
      const crossings = [];

      // Edge 0-1
      if ((z0 < level && z1 >= level) || (z0 >= level && z1 < level)) {
        const t = (level - z0) / (z1 - z0);
        crossings.push([px[i0] + t * (px[i1] - px[i0]), py[i0] + t * (py[i1] - py[i0])]);
      }
      // Edge 1-2
      if ((z1 < level && z2 >= level) || (z1 >= level && z2 < level)) {
        const t = (level - z1) / (z2 - z1);
        crossings.push([px[i1] + t * (px[i2] - px[i1]), py[i1] + t * (py[i2] - py[i1])]);
      }
      // Edge 2-0
      if ((z2 < level && z0 >= level) || (z2 >= level && z0 < level)) {
        const t = (level - z2) / (z0 - z2);
        crossings.push([px[i2] + t * (px[i0] - px[i2]), py[i2] + t * (py[i0] - py[i2])]);
      }

      // Exactly on a vertex: handle gracefully
      if (crossings.length === 2) {
        segments.push([crossings[0], crossings[1]]);
      }
      // Edge case: level passes exactly through a vertex → may get 0 or 1 crossings
      // In that case we skip this triangle (adjacent triangles will handle it)
    }

    if (segments.length > 0) {
      const polylines = chainSegments(segments);
      contours.push({ level, polylines, segments });
    }
  }

  return contours;
}
