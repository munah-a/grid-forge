// GridForge GIS – Plot Engine
// Professional plotting system with page layout, coordinate grids, patterns, and export.

// ═══════════════════════════════════════════════════════════════════════════════
// PAGE SIZES (mm)
// ═══════════════════════════════════════════════════════════════════════════════
export const PAGE_SIZES = {
    A0: { w: 841, h: 1189, label: "A0 (841×1189 mm)" },
    A1: { w: 594, h: 841, label: "A1 (594×841 mm)" },
    A2: { w: 420, h: 594, label: "A2 (420×594 mm)" },
    A3: { w: 297, h: 420, label: "A3 (297×420 mm)" },
    A4: { w: 210, h: 297, label: "A4 (210×297 mm)" },
    Letter: { w: 216, h: 279, label: "Letter (8.5×11 in)" },
    Legal: { w: 216, h: 356, label: "Legal (8.5×14 in)" },
    Tabloid: { w: 279, h: 432, label: "Tabloid (11×17 in)" },
};

export const SCALES = [
    { value: 0, label: "Fit to Page" },
    { value: 100, label: "1:100" },
    { value: 250, label: "1:250" },
    { value: 500, label: "1:500" },
    { value: 1000, label: "1:1000" },
    { value: 2000, label: "1:2000" },
    { value: 5000, label: "1:5000" },
    { value: 10000, label: "1:10,000" },
    { value: 25000, label: "1:25,000" },
    { value: 50000, label: "1:50,000" },
];

export const GRID_STYLES = [
    { value: "solid", label: "Solid" },
    { value: "dashed", label: "Dashed" },
    { value: "dotted", label: "Dotted" },
    { value: "cross", label: "Cross Ticks" },
];

export const GRID_WEIGHTS = [
    { value: 0.25, label: "Thin" },
    { value: 0.5, label: "Normal" },
    { value: 1.0, label: "Heavy" },
];

// ═══════════════════════════════════════════════════════════════════════════════
// INDUSTRY STANDARD HATCH PATTERNS
// ═══════════════════════════════════════════════════════════════════════════════

/** Create a pattern canvas for B&W elevation fill.
 *  Returns a CanvasPattern for use with ctx.fillStyle. */
function createPatternCanvas(draw, size = 16) {
    const c = document.createElement("canvas");
    c.width = size; c.height = size;
    const pc = c.getContext("2d");
    pc.fillStyle = "#fff";
    pc.fillRect(0, 0, size, size);
    pc.strokeStyle = "#000";
    pc.fillStyle = "#000";
    draw(pc, size);
    return c;
}

export const HATCH_PATTERNS = {
    solid_black: { label: "Solid Black", draw: (c, s) => { c.fillRect(0, 0, s, s); } },
    horizontal: { label: "Horizontal Lines", draw: (c, s) => { c.lineWidth = 1; c.beginPath(); c.moveTo(0, s / 2); c.lineTo(s, s / 2); c.stroke(); } },
    vertical: { label: "Vertical Lines", draw: (c, s) => { c.lineWidth = 1; c.beginPath(); c.moveTo(s / 2, 0); c.lineTo(s / 2, s); c.stroke(); } },
    diagonal_right: { label: "Diagonal (45°)", draw: (c, s) => { c.lineWidth = 1; c.beginPath(); c.moveTo(0, s); c.lineTo(s, 0); c.moveTo(-s / 2, s / 2); c.lineTo(s / 2, -s / 2); c.moveTo(s / 2, s + s / 2); c.lineTo(s + s / 2, s / 2); c.stroke(); } },
    diagonal_left: { label: "Diagonal (135°)", draw: (c, s) => { c.lineWidth = 1; c.beginPath(); c.moveTo(0, 0); c.lineTo(s, s); c.moveTo(-s / 2, s / 2); c.lineTo(s / 2, s + s / 2); c.moveTo(s / 2, -s / 2); c.lineTo(s + s / 2, s / 2); c.stroke(); } },
    crosshatch: { label: "Cross-hatch", draw: (c, s) => { c.lineWidth = 0.8; c.beginPath(); c.moveTo(0, s / 2); c.lineTo(s, s / 2); c.moveTo(s / 2, 0); c.lineTo(s / 2, s); c.stroke(); } },
    diamond: { label: "Diamond Hatch", draw: (c, s) => { c.lineWidth = 0.8; c.beginPath(); c.moveTo(0, s); c.lineTo(s, 0); c.moveTo(0, 0); c.lineTo(s, s); c.stroke(); } },
    dots_fine: { label: "Dots (Fine)", size: 8, draw: (c, s) => { c.beginPath(); c.arc(s / 2, s / 2, 1, 0, Math.PI * 2); c.fill(); } },
    dots_medium: { label: "Dots (Medium)", size: 12, draw: (c, s) => { c.beginPath(); c.arc(s / 2, s / 2, 1.5, 0, Math.PI * 2); c.fill(); } },
    dots_coarse: { label: "Dots (Coarse)", size: 16, draw: (c, s) => { c.beginPath(); c.arc(s / 2, s / 2, 2, 0, Math.PI * 2); c.fill(); } },
    stipple: {
        label: "Stipple", size: 16, draw: (c, s) => {
            const rng = (seed) => { let x = Math.sin(seed) * 10000; return x - Math.floor(x); };
            for (let i = 0; i < 8; i++) { c.beginPath(); c.arc(rng(i * 7) * s, rng(i * 13 + 5) * s, 0.8, 0, Math.PI * 2); c.fill(); }
        }
    },
    horizontal_dense: { label: "Horizontal (Dense)", size: 8, draw: (c, s) => { c.lineWidth = 0.8; c.beginPath(); c.moveTo(0, s / 2); c.lineTo(s, s / 2); c.stroke(); } },
    brick: {
        label: "Brick", size: 20, draw: (c, s) => {
            c.lineWidth = 0.8;
            c.beginPath(); c.moveTo(0, s / 2); c.lineTo(s, s / 2); c.moveTo(0, s); c.lineTo(s, s);
            c.moveTo(s / 2, 0); c.lineTo(s / 2, s / 2); c.moveTo(0, s / 2); c.lineTo(0, s); c.moveTo(s, s / 2); c.lineTo(s, s);
            c.stroke();
        }
    },
    gravel: {
        label: "Gravel", size: 20, draw: (c, s) => {
            c.lineWidth = 0.7;
            const shapes = [[3, 4, 4, 3], [10, 3, 5, 4], [14, 8, 3, 3], [6, 12, 5, 3], [2, 16, 3, 3], [13, 15, 4, 3]];
            for (const [x, y, w, h] of shapes) { c.beginPath(); c.ellipse(x, y, w / 2, h / 2, 0, 0, Math.PI * 2); c.stroke(); }
        }
    },
    sand: {
        label: "Sand", size: 16, draw: (c, s) => {
            const rng = (seed) => { let x = Math.sin(seed) * 10000; return x - Math.floor(x); };
            for (let i = 0; i < 14; i++) { c.fillRect(rng(i * 3) * s, rng(i * 7 + 2) * s, 0.6, 0.6); }
        }
    },
};

// Default pattern assignment for elevation bands (low to high)
const DEFAULT_BW_PATTERNS = [
    "dots_fine", "horizontal", "diagonal_right", "dots_medium",
    "crosshatch", "vertical", "diamond", "diagonal_left",
    "dots_coarse", "horizontal_dense", "stipple", "brick",
    "gravel", "sand", "solid_black",
];

/** Build CanvasPattern objects for all hatch patterns */
export function buildPatternCache(ctx) {
    const cache = {};
    for (const [key, pat] of Object.entries(HATCH_PATTERNS)) {
        const canvas = createPatternCanvas(pat.draw, pat.size || 16);
        cache[key] = ctx.createPattern(canvas, "repeat");
    }
    return cache;
}

// ═══════════════════════════════════════════════════════════════════════════════
// DEFAULT PLOT SETTINGS
// ═══════════════════════════════════════════════════════════════════════════════

export function defaultPlotSettings() {
    return {
        // Page
        pageSize: "A3",
        orientation: "landscape",
        marginTop: 15,
        marginBottom: 15,
        marginLeft: 15,
        marginRight: 15,
        // Scale
        scale: 0, // 0 = fit to page
        // Coordinate Grid
        gridEnabled: true,
        gridSpacing: 0, // 0 = auto
        gridStyle: "solid",
        gridWeight: 0.5,
        gridColor: "#888888",
        gridLabelEnabled: true,
        gridLabelSize: 8,
        gridLabelPlacement: "all", // all, top-left, bottom-right
        gridLabelFormat: "decimal", // decimal, dms
        gridMinorEnabled: false,
        gridMinorDivisions: 5,
        // Content layers
        showRaster: true,
        showContours: true,
        showPoints: true,
        showBoundaries: true,
        showBreaklines: true,
        // Contour style
        contourMajorWeight: 0.8,
        contourMinorWeight: 0.3,
        contourMajorColor: "#000000",
        contourMinorColor: "#555555",
        contourLabels: true,
        contourLabelSize: 7,
        // Point style
        pointSize: 3,
        pointColor: "#000000",
        pointLabels: true,
        pointLabelSize: 7,
        // Style mode
        mode: "color", // color, bw
        // Title block
        titleEnabled: true,
        projectName: "Untitled Project",
        author: "",
        notes: "",
        dateStr: new Date().toLocaleDateString(),
        // Legend
        legendEnabled: true,
        legendPosition: "bottom-left", // bottom-left, bottom-right, top-left, top-right
        // North arrow
        northArrow: true,
        northArrowStyle: "simple", // simple, fancy
        // DPI for export
        dpi: 300,
    };
}

// ═══════════════════════════════════════════════════════════════════════════════
// PLOT LAYOUT CALCULATOR
// ═══════════════════════════════════════════════════════════════════════════════

/** Calculate plot layout dimensions.
 *  Returns pixel positions and scale for a given page, margins, and map bounds. */
export function computePlotLayout(ps, bounds, dpiOverride) {
    const dpi = dpiOverride || ps.dpi || 300;
    const mmToPx = dpi / 25.4;

    // Paper size in mm
    const paper = PAGE_SIZES[ps.pageSize] || PAGE_SIZES.A3;
    let paperW = paper.w, paperH = paper.h;
    if (ps.orientation === "landscape") { paperW = paper.h; paperH = paper.w; }

    // Total page in pixels
    const pageWpx = Math.round(paperW * mmToPx);
    const pageHpx = Math.round(paperH * mmToPx);

    // Map area (inside margins)
    const ml = ps.marginLeft * mmToPx, mr = ps.marginRight * mmToPx;
    const mt = ps.marginTop * mmToPx, mb = ps.marginBottom * mmToPx;

    // Title block height (mm) — reserve 30mm at bottom if enabled
    const tbH = ps.titleEnabled ? 30 * mmToPx : 0;

    const mapWpx = pageWpx - ml - mr;
    const mapHpx = pageHpx - mt - mb - tbH;

    if (mapWpx <= 0 || mapHpx <= 0) return null;

    // Map bounds
    const bw = (bounds.xMax - bounds.xMin) || 1;
    const bh = (bounds.yMax - bounds.yMin) || 1;

    // Scale calculation
    let mapScale;
    if (ps.scale > 0) {
        // Fixed scale: 1mm on paper = ps.scale mm in real world
        mapScale = mmToPx / ps.scale; // pixels per map unit (assuming map units are meters)
    } else {
        // Fit to page
        const scaleX = mapWpx / bw;
        const scaleY = mapHpx / bh;
        mapScale = Math.min(scaleX, scaleY) * 0.95; // 5% breathing room
    }

    // Centering offset
    const mapRealW = bw * mapScale, mapRealH = bh * mapScale;
    const ox = ml + (mapWpx - mapRealW) / 2;
    const oy = mt + (mapHpx - mapRealH) / 2;

    // Effective scale for display
    const effectiveScale = Math.round(mmToPx / mapScale);

    return {
        pageWpx, pageHpx, mmToPx, dpi,
        mapX: ox, mapY: oy, mapW: mapRealW, mapH: mapRealH,
        mapScale,
        marginLeft: ml, marginRight: mr, marginTop: mt, marginBottom: mb,
        titleBlockY: pageHpx - mb - tbH, titleBlockH: tbH,
        effectiveScale,
        bounds,
    };
}

// ═══════════════════════════════════════════════════════════════════════════════
// GRID LINE SPACING (auto-calculate nice intervals)
// ═══════════════════════════════════════════════════════════════════════════════

function niceGridInterval(range, targetLines) {
    const rough = range / targetLines;
    const pow10 = Math.pow(10, Math.floor(Math.log10(rough)));
    const frac = rough / pow10;
    let nice;
    if (frac <= 1.5) nice = 1;
    else if (frac <= 3.5) nice = 2;
    else if (frac <= 7.5) nice = 5;
    else nice = 10;
    return nice * pow10;
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN PLOT RENDERER
// ═══════════════════════════════════════════════════════════════════════════════

/** Render the full plot to a canvas context.
 *  @param {CanvasRenderingContext2D} ctx
 *  @param {Object} ps - plot settings
 *  @param {Object} data - { points, gridData, gridX, gridY, contours, bounds, boundaries, breaklines, colorRamp, effectiveZRange }
 */
export function renderPlot(ctx, ps, data, layout) {
    const { pageWpx, pageHpx, mapX, mapY, mapW, mapH, mapScale, mmToPx, bounds } = layout;

    // ── White page background ──────────────────────────────────────────
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, pageWpx, pageHpx);

    // ── Clip to map area ───────────────────────────────────────────────
    ctx.save();
    ctx.beginPath();
    ctx.rect(mapX, mapY, mapW, mapH);
    ctx.clip();

    // ── World-to-pixel transform helpers ───────────────────────────────
    const wx = (x) => mapX + (x - bounds.xMin) * mapScale;
    const wy = (y) => mapY + mapH - (y - bounds.yMin) * mapScale; // Y flipped

    // ── Raster layer ───────────────────────────────────────────────────
    if (ps.showRaster && data.gridData && data.gridX && data.gridY) {
        renderRasterLayer(ctx, ps, data, wx, wy, mapScale, layout);
    }

    // ── Filled contours (not in B&W — use patterns instead) ────────────
    if (ps.showRaster && ps.mode === "bw" && data.gridData && data.gridX && data.gridY) {
        renderBWPatternFill(ctx, ps, data, wx, wy, mapScale, layout);
    }

    // ── Boundaries ─────────────────────────────────────────────────────
    if (ps.showBoundaries && data.boundaries) {
        renderBoundaries(ctx, data.boundaries, wx, wy, ps);
    }

    // ── Breaklines ─────────────────────────────────────────────────────
    if (ps.showBreaklines && data.breaklines) {
        renderBreaklines(ctx, data.breaklines, wx, wy, ps);
    }

    // ── Contour lines ──────────────────────────────────────────────────
    if (ps.showContours && data.contours) {
        renderContourLayer(ctx, ps, data, wx, wy, layout);
    }

    // ── Points ─────────────────────────────────────────────────────────
    if (ps.showPoints && data.points) {
        renderPointLayer(ctx, ps, data.points, wx, wy, layout);
    }

    ctx.restore(); // un-clip

    // ── Coordinate grid ────────────────────────────────────────────────
    if (ps.gridEnabled) {
        renderCoordinateGrid(ctx, ps, layout);
    }

    // ── Plot frame ─────────────────────────────────────────────────────
    renderPlotFrame(ctx, layout);

    // ── Title block ────────────────────────────────────────────────────
    if (ps.titleEnabled) {
        renderTitleBlock(ctx, ps, layout);
    }

    // ── Legend ──────────────────────────────────────────────────────────
    if (ps.legendEnabled) {
        renderLegend(ctx, ps, data, layout);
    }

    // ── North arrow ────────────────────────────────────────────────────
    if (ps.northArrow) {
        renderNorthArrow(ctx, ps, layout);
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// CONTENT LAYER RENDERERS
// ═══════════════════════════════════════════════════════════════════════════════

function renderRasterLayer(ctx, ps, data, wx, wy, mapScale, layout) {
    if (ps.mode === "bw") return; // B&W uses pattern fill instead
    const { gridData, gridX, gridY, colorRamp, effectiveZRange } = data;
    const { zMin, zMax, range } = effectiveZRange;
    const nx = gridX.length, ny = gridY.length;
    const grid = gridData.grid || gridData;

    // Draw each cell as a colored rectangle
    for (let j = 0; j < ny - 1; j++) {
        for (let i = 0; i < nx - 1; i++) {
            const v = grid[j * nx + i];
            if (isNaN(v)) continue;
            const t = Math.max(0, Math.min(1, (v - zMin) / range));
            const [r, g, b] = getColorComponentsLocal(t, colorRamp);
            ctx.fillStyle = `rgb(${r},${g},${b})`;
            const px = wx(gridX[i]);
            const py = wy(gridY[j + 1]); // +1 because Y is flipped
            const pw = (gridX[i + 1] - gridX[i]) * mapScale;
            const ph = (gridY[j + 1] - gridY[j]) * mapScale;
            ctx.fillRect(px, py, Math.ceil(pw) + 1, Math.ceil(ph) + 1);
        }
    }
}

function renderBWPatternFill(ctx, ps, data, wx, wy, mapScale, layout) {
    const { gridData, gridX, gridY, effectiveZRange } = data;
    const { zMin, zMax, range } = effectiveZRange;
    const nx = gridX.length, ny = gridY.length;
    const grid = gridData.grid || gridData;
    const numBands = Math.min(DEFAULT_BW_PATTERNS.length, 10);
    const patternCache = buildPatternCache(ctx);

    for (let j = 0; j < ny - 1; j++) {
        for (let i = 0; i < nx - 1; i++) {
            const v = grid[j * nx + i];
            if (isNaN(v)) continue;
            const t = Math.max(0, Math.min(1, (v - zMin) / range));
            const bandIdx = Math.min(numBands - 1, Math.floor(t * numBands));
            const patKey = DEFAULT_BW_PATTERNS[bandIdx];
            const pat = patternCache[patKey];
            if (pat) ctx.fillStyle = pat;
            else ctx.fillStyle = "#ccc";
            const px = wx(gridX[i]);
            const py = wy(gridY[j + 1]);
            const pw = (gridX[i + 1] - gridX[i]) * mapScale;
            const ph = (gridY[j + 1] - gridY[j]) * mapScale;
            ctx.fillRect(px, py, Math.ceil(pw) + 1, Math.ceil(ph) + 1);
        }
    }
}

function renderContourLayer(ctx, ps, data, wx, wy, layout) {
    const { contours, effectiveZRange } = data;
    const { zMin, range } = effectiveZRange;
    const interval = data.contourInterval || 10;
    const majorEvery = data.majorInterval || 5;
    const { mmToPx } = layout;

    for (const contour of contours) {
        const isMajor = Math.abs(contour.level % (interval * majorEvery)) < interval * 0.01;
        ctx.strokeStyle = ps.mode === "bw" ? "#000" : (isMajor ? ps.contourMajorColor : ps.contourMinorColor);
        ctx.lineWidth = (isMajor ? ps.contourMajorWeight : ps.contourMinorWeight) * mmToPx * 0.3;
        ctx.lineJoin = "round";
        ctx.lineCap = "round";

        const polylines = contour.polylines || [];
        for (const pl of polylines) {
            const pts = pl.points || pl;
            if (pts.length < 2) continue;
            ctx.beginPath();
            ctx.moveTo(wx(pts[0][0]), wy(pts[0][1]));
            for (let i = 1; i < pts.length; i++) {
                ctx.lineTo(wx(pts[i][0]), wy(pts[i][1]));
            }
            if (pl.closed) ctx.closePath();
            ctx.stroke();
        }

        // Contour labels
        if (ps.contourLabels && isMajor) {
            ctx.font = `${ps.contourLabelSize * mmToPx * 0.35}px 'JetBrains Mono', monospace`;
            ctx.fillStyle = ps.mode === "bw" ? "#000" : ps.contourMajorColor;
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            for (const pl of polylines) {
                const pts = pl.points || pl;
                if (pts.length < 10) continue;
                const mid = Math.floor(pts.length / 2);
                const px = wx(pts[mid][0]), py = wy(pts[mid][1]);
                const labelText = contour.level % 1 === 0 ? String(contour.level) : contour.level.toFixed(1);
                // Draw background to break the contour line
                const tw = ctx.measureText(labelText).width + 4;
                ctx.fillStyle = "#ffffff";
                ctx.fillRect(px - tw / 2, py - ps.contourLabelSize * mmToPx * 0.2, tw, ps.contourLabelSize * mmToPx * 0.4);
                ctx.fillStyle = ps.mode === "bw" ? "#000" : ps.contourMajorColor;
                ctx.fillText(labelText, px, py);
            }
        }
    }
}

function renderPointLayer(ctx, ps, points, wx, wy, layout) {
    const { mmToPx } = layout;
    const r = ps.pointSize * mmToPx * 0.15;
    ctx.fillStyle = ps.mode === "bw" ? "#000" : ps.pointColor;

    for (const p of points) {
        const px = wx(p.x), py = wy(p.y);
        // Cross symbol (industry standard survey point)
        ctx.lineWidth = r * 0.4;
        ctx.strokeStyle = ctx.fillStyle;
        ctx.beginPath();
        ctx.moveTo(px - r, py); ctx.lineTo(px + r, py);
        ctx.moveTo(px, py - r); ctx.lineTo(px, py + r);
        ctx.stroke();
        // Dot center
        ctx.beginPath();
        ctx.arc(px, py, r * 0.3, 0, Math.PI * 2);
        ctx.fill();
    }

    // Labels
    if (ps.pointLabels) {
        ctx.font = `${ps.pointLabelSize * mmToPx * 0.35}px 'DM Sans', sans-serif`;
        ctx.fillStyle = ps.mode === "bw" ? "#000" : ps.pointColor;
        ctx.textAlign = "left";
        ctx.textBaseline = "bottom";
        const maxLabels = 2000;
        let count = 0;
        for (const p of points) {
            if (count++ > maxLabels) break;
            const px = wx(p.x) + r + 2, py = wy(p.y) - 2;
            const label = p.z !== undefined ? p.z.toFixed(2) : "";
            if (label) ctx.fillText(label, px, py);
        }
    }
}

function renderBoundaries(ctx, boundaries, wx, wy, ps) {
    for (const b of boundaries) {
        if (!b.vertices || b.vertices.length < 2) continue;
        ctx.strokeStyle = ps.mode === "bw" ? "#000" : "#ff6600";
        ctx.lineWidth = 1.5;
        ctx.setLineDash([6, 3]);
        ctx.beginPath();
        ctx.moveTo(wx(b.vertices[0][0]), wy(b.vertices[0][1]));
        for (let i = 1; i < b.vertices.length; i++) {
            ctx.lineTo(wx(b.vertices[i][0]), wy(b.vertices[i][1]));
        }
        ctx.closePath();
        ctx.stroke();
        ctx.setLineDash([]);
    }
}

function renderBreaklines(ctx, breaklines, wx, wy, ps) {
    for (const bl of breaklines) {
        if (!bl.vertices || bl.vertices.length < 2) continue;
        const bType = bl.breaklineType || "standard";
        ctx.strokeStyle = ps.mode === "bw" ? "#000" : bType === "proximity" ? "#fbbf24" : bType === "wall" ? "#f472b6" : "#00ccff";
        ctx.lineWidth = 1.2;
        ctx.setLineDash(bType === "proximity" ? [8, 4] : [4, 2]);
        ctx.beginPath();
        ctx.moveTo(wx(bl.vertices[0][0]), wy(bl.vertices[0][1]));
        for (let i = 1; i < bl.vertices.length; i++) {
            ctx.lineTo(wx(bl.vertices[i][0]), wy(bl.vertices[i][1]));
        }
        ctx.stroke();
        ctx.setLineDash([]);
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// COORDINATE GRID
// ═══════════════════════════════════════════════════════════════════════════════

function renderCoordinateGrid(ctx, ps, layout) {
    const { mapX, mapY, mapW, mapH, mapScale, bounds, mmToPx } = layout;

    // Calculate spacing
    const bw = bounds.xMax - bounds.xMin;
    const bh = bounds.yMax - bounds.yMin;
    const spacing = ps.gridSpacing > 0 ? ps.gridSpacing : niceGridInterval(Math.max(bw, bh), 8);

    // Grid line styling
    const gridColor = ps.mode === "bw" ? "#888" : ps.gridColor;

    // Calculate start/end tick values
    const xStart = Math.ceil(bounds.xMin / spacing) * spacing;
    const xEnd = Math.floor(bounds.xMax / spacing) * spacing;
    const yStart = Math.ceil(bounds.yMin / spacing) * spacing;
    const yEnd = Math.floor(bounds.yMax / spacing) * spacing;

    const wx = (x) => mapX + (x - bounds.xMin) * mapScale;
    const wy = (y) => mapY + mapH - (y - bounds.yMin) * mapScale;

    ctx.strokeStyle = gridColor;
    ctx.lineWidth = ps.gridWeight * mmToPx * 0.3;
    ctx.globalAlpha = 0.5;

    const tickLen = 6 * mmToPx * 0.3;

    // Set dash pattern
    if (ps.gridStyle === "dashed") ctx.setLineDash([6, 4]);
    else if (ps.gridStyle === "dotted") ctx.setLineDash([1, 3]);
    else ctx.setLineDash([]);

    // Minor grid lines
    if (ps.gridMinorEnabled && ps.gridMinorDivisions > 1) {
        const minorSpacing = spacing / ps.gridMinorDivisions;
        ctx.globalAlpha = 0.2;
        ctx.lineWidth = ps.gridWeight * mmToPx * 0.15;
        for (let x = Math.ceil(bounds.xMin / minorSpacing) * minorSpacing; x <= bounds.xMax; x += minorSpacing) {
            const px = wx(x);
            if (px < mapX || px > mapX + mapW) continue;
            if (ps.gridStyle === "cross") {
                for (let y = yStart; y <= yEnd; y += spacing) {
                    const py = wy(y);
                    ctx.beginPath(); ctx.moveTo(px - tickLen * 0.4, py); ctx.lineTo(px + tickLen * 0.4, py); ctx.stroke();
                }
            } else {
                ctx.beginPath(); ctx.moveTo(px, mapY); ctx.lineTo(px, mapY + mapH); ctx.stroke();
            }
        }
        for (let y = Math.ceil(bounds.yMin / minorSpacing) * minorSpacing; y <= bounds.yMax; y += minorSpacing) {
            const py = wy(y);
            if (py < mapY || py > mapY + mapH) continue;
            if (ps.gridStyle !== "cross") {
                ctx.beginPath(); ctx.moveTo(mapX, py); ctx.lineTo(mapX + mapW, py); ctx.stroke();
            }
        }
    }

    // Major grid lines
    ctx.globalAlpha = 0.5;
    ctx.lineWidth = ps.gridWeight * mmToPx * 0.3;

    // Vertical grid lines (X)
    for (let x = xStart; x <= xEnd; x += spacing) {
        const px = wx(x);
        if (px < mapX || px > mapX + mapW) continue;
        if (ps.gridStyle === "cross") {
            // Draw small crosses at each intersection
            for (let y = yStart; y <= yEnd; y += spacing) {
                const py = wy(y);
                ctx.beginPath(); ctx.moveTo(px - tickLen, py); ctx.lineTo(px + tickLen, py); ctx.stroke();
                ctx.beginPath(); ctx.moveTo(px, py - tickLen); ctx.lineTo(px, py + tickLen); ctx.stroke();
            }
        } else {
            ctx.beginPath(); ctx.moveTo(px, mapY); ctx.lineTo(px, mapY + mapH); ctx.stroke();
        }
    }

    // Horizontal grid lines (Y)
    if (ps.gridStyle !== "cross") {
        for (let y = yStart; y <= yEnd; y += spacing) {
            const py = wy(y);
            if (py < mapY || py > mapY + mapH) continue;
            ctx.beginPath(); ctx.moveTo(mapX, py); ctx.lineTo(mapX + mapW, py); ctx.stroke();
        }
    }

    ctx.globalAlpha = 1;
    ctx.setLineDash([]);

    // ── Grid labels ────────────────────────────────────────────────────
    if (ps.gridLabelEnabled) {
        const fontSize = ps.gridLabelSize * mmToPx * 0.35;
        ctx.font = `${fontSize}px 'JetBrains Mono', monospace`;
        ctx.fillStyle = ps.mode === "bw" ? "#000" : "#333";
        const pad = 4;

        const formatLabel = (v) => {
            if (ps.gridLabelFormat === "dms") {
                const deg = Math.floor(Math.abs(v));
                const minF = (Math.abs(v) - deg) * 60;
                const min = Math.floor(minF);
                const sec = ((minF - min) * 60).toFixed(1);
                return `${v < 0 ? "-" : ""}${deg}°${min}'${sec}"`;
            }
            if (Math.abs(v) >= 10000) return v.toFixed(0);
            if (Math.abs(v) >= 100) return v.toFixed(1);
            return v.toFixed(2);
        };

        const showTop = ps.gridLabelPlacement === "all" || ps.gridLabelPlacement === "top-left";
        const showBottom = ps.gridLabelPlacement === "all" || ps.gridLabelPlacement === "bottom-right";
        const showLeft = ps.gridLabelPlacement === "all" || ps.gridLabelPlacement === "top-left";
        const showRight = ps.gridLabelPlacement === "all" || ps.gridLabelPlacement === "bottom-right";

        // X labels (top and/or bottom of map)
        ctx.textAlign = "center";
        for (let x = xStart; x <= xEnd; x += spacing) {
            const px = wx(x);
            if (px < mapX || px > mapX + mapW) continue;
            const label = formatLabel(x);
            if (showTop) { ctx.textBaseline = "bottom"; ctx.fillText(label, px, mapY - pad); }
            if (showBottom) { ctx.textBaseline = "top"; ctx.fillText(label, px, mapY + mapH + pad); }
        }

        // Y labels (left and/or right of map)
        for (let y = yStart; y <= yEnd; y += spacing) {
            const py = wy(y);
            if (py < mapY || py > mapY + mapH) continue;
            const label = formatLabel(y);
            if (showLeft) { ctx.textAlign = "right"; ctx.textBaseline = "middle"; ctx.fillText(label, mapX - pad, py); }
            if (showRight) { ctx.textAlign = "left"; ctx.textBaseline = "middle"; ctx.fillText(label, mapX + mapW + pad, py); }
        }
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// PLOT FRAME & TITLE BLOCK
// ═══════════════════════════════════════════════════════════════════════════════

function renderPlotFrame(ctx, layout) {
    const { mapX, mapY, mapW, mapH, mmToPx } = layout;
    ctx.strokeStyle = "#000";
    ctx.lineWidth = 1.5 * mmToPx * 0.3;
    ctx.strokeRect(mapX, mapY, mapW, mapH);
    // Outer neatline
    const off = 2 * mmToPx * 0.3;
    ctx.lineWidth = 0.5 * mmToPx * 0.3;
    ctx.strokeRect(mapX - off, mapY - off, mapW + 2 * off, mapH + 2 * off);
}

function renderTitleBlock(ctx, ps, layout) {
    const { mapX, mapY, mapW, mapH, titleBlockY, titleBlockH, mmToPx, effectiveScale } = layout;
    if (titleBlockH <= 0) return;

    const tbX = mapX;
    const tbY = titleBlockY;
    const tbW = mapW;
    const tbH = titleBlockH;

    // Background
    ctx.fillStyle = "#fff";
    ctx.fillRect(tbX, tbY, tbW, tbH);
    ctx.strokeStyle = "#000";
    ctx.lineWidth = 1.5 * mmToPx * 0.3;
    ctx.strokeRect(tbX, tbY, tbW, tbH);

    // Dividers
    const col1 = tbW * 0.4;
    const col2 = tbW * 0.7;
    ctx.lineWidth = 0.5 * mmToPx * 0.3;
    ctx.beginPath(); ctx.moveTo(tbX + col1, tbY); ctx.lineTo(tbX + col1, tbY + tbH); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(tbX + col2, tbY); ctx.lineTo(tbX + col2, tbY + tbH); ctx.stroke();
    // Horizontal divider at mid
    ctx.beginPath(); ctx.moveTo(tbX, tbY + tbH / 2); ctx.lineTo(tbX + col1, tbY + tbH / 2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(tbX + col2, tbY + tbH / 2); ctx.lineTo(tbX + tbW, tbY + tbH / 2); ctx.stroke();

    ctx.fillStyle = "#000";
    const pad = 4 * mmToPx * 0.3;
    const f1 = 10 * mmToPx * 0.35;
    const f2 = 7 * mmToPx * 0.35;
    const f3 = 6 * mmToPx * 0.35;

    // Column 1: Project name + Author
    ctx.font = `bold ${f1}px 'DM Sans', sans-serif`;
    ctx.textAlign = "left"; ctx.textBaseline = "top";
    ctx.fillText(ps.projectName || "Untitled", tbX + pad, tbY + pad);
    ctx.font = `${f3}px 'DM Sans', sans-serif`;
    ctx.fillStyle = "#666";
    ctx.fillText(ps.author || "", tbX + pad, tbY + tbH / 2 + pad);

    // Column 2: Notes
    ctx.fillStyle = "#000";
    ctx.font = `${f3}px 'DM Sans', sans-serif`;
    const noteLines = (ps.notes || "").split("\n").slice(0, 3);
    for (let i = 0; i < noteLines.length; i++) {
        ctx.fillText(noteLines[i], tbX + col1 + pad, tbY + pad + i * (f3 + 2));
    }

    // Column 3: Scale + Date
    ctx.font = `bold ${f2}px 'JetBrains Mono', monospace`;
    ctx.fillStyle = "#000";
    ctx.textAlign = "left";
    ctx.fillText(`Scale 1:${effectiveScale.toLocaleString()}`, tbX + col2 + pad, tbY + pad);
    ctx.font = `${f3}px 'DM Sans', sans-serif`;
    ctx.fillStyle = "#666";
    ctx.fillText(ps.dateStr || "", tbX + col2 + pad, tbY + tbH / 2 + pad);

    // Scale bar
    renderScaleBar(ctx, layout, tbX + col2 + pad, tbY + pad + f2 + 4 * mmToPx * 0.3, (tbW - col2) - 2 * pad);

    // GridForge branding
    ctx.font = `${f3 * 0.8}px 'DM Sans', sans-serif`;
    ctx.fillStyle = "#aaa";
    ctx.textAlign = "right";
    ctx.textBaseline = "bottom";
    ctx.fillText("GridForge GIS", tbX + tbW - pad, tbY + tbH - pad * 0.5);
}

// ═══════════════════════════════════════════════════════════════════════════════
// SCALE BAR
// ═══════════════════════════════════════════════════════════════════════════════

function renderScaleBar(ctx, layout, x, y, maxWidth) {
    const { mapScale, mmToPx } = layout;
    // Determine a nice scale bar length (in map units)
    const maxMapDist = maxWidth / mapScale;
    const nice = niceGridInterval(maxMapDist, 4);
    const barPx = nice * mapScale;
    const barH = 3 * mmToPx * 0.3;
    const divisions = 4;
    const divW = barPx / divisions;

    for (let i = 0; i < divisions; i++) {
        ctx.fillStyle = i % 2 === 0 ? "#000" : "#fff";
        ctx.fillRect(x + i * divW, y, divW, barH);
    }
    ctx.strokeStyle = "#000";
    ctx.lineWidth = 0.5 * mmToPx * 0.3;
    ctx.strokeRect(x, y, barPx, barH);

    // Labels
    ctx.font = `${5.5 * mmToPx * 0.35}px 'JetBrains Mono', monospace`;
    ctx.fillStyle = "#000";
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    const labelY = y + barH + 2;
    ctx.fillText("0", x, labelY);
    ctx.fillText(formatDistance(nice), x + barPx, labelY);
}

function formatDistance(d) {
    if (d >= 1000) return `${(d / 1000).toFixed(d >= 10000 ? 0 : 1)} km`;
    if (d >= 1) return `${d.toFixed(d >= 100 ? 0 : 1)} m`;
    return `${(d * 100).toFixed(0)} cm`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// LEGEND
// ═══════════════════════════════════════════════════════════════════════════════

function renderLegend(ctx, ps, data, layout) {
    const { mapX, mapY, mapW, mapH, mmToPx } = layout;
    const { effectiveZRange, colorRamp } = data;
    if (!effectiveZRange) return;
    const { zMin, zMax } = effectiveZRange;

    const legW = 18 * mmToPx * 0.35;
    const legH = Math.min(mapH * 0.4, 60 * mmToPx * 0.35);
    const pad = 6 * mmToPx * 0.35;

    // Position
    let lx, ly;
    if (ps.legendPosition === "top-left") { lx = mapX + pad; ly = mapY + pad; }
    else if (ps.legendPosition === "top-right") { lx = mapX + mapW - legW - pad * 3; ly = mapY + pad; }
    else if (ps.legendPosition === "bottom-right") { lx = mapX + mapW - legW - pad * 3; ly = mapY + mapH - legH - pad; }
    else { lx = mapX + pad; ly = mapY + mapH - legH - pad; }

    // Background
    ctx.fillStyle = "rgba(255,255,255,0.9)";
    ctx.fillRect(lx - pad, ly - pad, legW + pad * 4, legH + pad * 3);
    ctx.strokeStyle = "#000";
    ctx.lineWidth = 0.5 * mmToPx * 0.3;
    ctx.strokeRect(lx - pad, ly - pad, legW + pad * 4, legH + pad * 3);

    // Color/pattern ramp
    const numSteps = 20;
    const stepH = legH / numSteps;
    if (ps.mode === "bw") {
        const patternCache = buildPatternCache(ctx);
        const numBands = Math.min(DEFAULT_BW_PATTERNS.length, 10);
        for (let i = 0; i < numSteps; i++) {
            const t = 1 - i / numSteps;
            const bandIdx = Math.min(numBands - 1, Math.floor(t * numBands));
            const patKey = DEFAULT_BW_PATTERNS[bandIdx];
            ctx.fillStyle = patternCache[patKey] || "#ccc";
            ctx.fillRect(lx, ly + i * stepH, legW, stepH + 1);
        }
    } else {
        for (let i = 0; i < numSteps; i++) {
            const t = 1 - i / numSteps;
            const [r, g, b] = getColorComponentsLocal(t, colorRamp);
            ctx.fillStyle = `rgb(${r},${g},${b})`;
            ctx.fillRect(lx, ly + i * stepH, legW, stepH + 1);
        }
    }
    ctx.strokeStyle = "#000";
    ctx.strokeRect(lx, ly, legW, legH);

    // Labels
    ctx.font = `${5.5 * mmToPx * 0.35}px 'JetBrains Mono', monospace`;
    ctx.fillStyle = "#000";
    ctx.textAlign = "left"; ctx.textBaseline = "middle";
    ctx.fillText(zMax.toFixed(1), lx + legW + 3, ly + 4);
    ctx.fillText(((zMin + zMax) / 2).toFixed(1), lx + legW + 3, ly + legH / 2);
    ctx.fillText(zMin.toFixed(1), lx + legW + 3, ly + legH - 4);
}

// ═══════════════════════════════════════════════════════════════════════════════
// NORTH ARROW
// ═══════════════════════════════════════════════════════════════════════════════

function renderNorthArrow(ctx, ps, layout) {
    const { mapX, mapY, mapW, mmToPx } = layout;
    const cx = mapX + mapW - 12 * mmToPx * 0.35;
    const cy = mapY + 16 * mmToPx * 0.35;
    const r = 8 * mmToPx * 0.35;

    // Circle
    ctx.beginPath(); ctx.arc(cx, cy, r + 2, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(255,255,255,0.9)"; ctx.fill();
    ctx.strokeStyle = "#000"; ctx.lineWidth = 0.5 * mmToPx * 0.3; ctx.stroke();

    // North triangle
    ctx.beginPath();
    ctx.moveTo(cx, cy - r); ctx.lineTo(cx - r * 0.4, cy); ctx.lineTo(cx + r * 0.4, cy); ctx.closePath();
    ctx.fillStyle = "#000"; ctx.fill();

    // South triangle (outline)
    ctx.beginPath();
    ctx.moveTo(cx, cy + r); ctx.lineTo(cx - r * 0.4, cy); ctx.lineTo(cx + r * 0.4, cy); ctx.closePath();
    ctx.strokeStyle = "#000"; ctx.stroke();

    // N label
    ctx.font = `bold ${6 * mmToPx * 0.35}px 'DM Sans', sans-serif`;
    ctx.fillStyle = "#000"; ctx.textAlign = "center"; ctx.textBaseline = "bottom";
    ctx.fillText("N", cx, cy - r - 2);
}

// ═══════════════════════════════════════════════════════════════════════════════
// COLOR HELPER (duplicate to avoid import dependency)
// ═══════════════════════════════════════════════════════════════════════════════

const BASIC_RAMPS = {
    viridis: ["#440154", "#482777", "#3e4989", "#31688e", "#26828e", "#1f9e89", "#35b779", "#6ece58", "#b5de2b", "#fde725"],
    terrain: ["#333399", "#0099cc", "#33cc33", "#99cc00", "#cccc00", "#cc9900", "#cc6600", "#cc3300", "#990000"],
};

function hexToRgb(hex) {
    const v = parseInt(hex.slice(1), 16);
    return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

function getColorComponentsLocal(t, rampName) {
    // Try to use global COLOR_RAMPS if available (imported via data)
    let ramp;
    try { ramp = window.__GF_COLOR_RAMPS?.[rampName]; } catch (_) { }
    if (!ramp) ramp = BASIC_RAMPS[rampName] || BASIC_RAMPS.viridis;
    const n = ramp.length - 1;
    const idx = t * n;
    const lo = Math.floor(idx), hi = Math.min(lo + 1, n);
    const frac = idx - lo;
    const [r1, g1, b1] = hexToRgb(ramp[lo]);
    const [r2, g2, b2] = hexToRgb(ramp[hi]);
    return [
        Math.round(r1 + (r2 - r1) * frac),
        Math.round(g1 + (g2 - g1) * frac),
        Math.round(b1 + (b2 - b1) * frac),
    ];
}

// ═══════════════════════════════════════════════════════════════════════════════
// EXPORT HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

/** Create a high-DPI plot canvas, render the plot, and return the canvas.
 *  @returns {HTMLCanvasElement} */
export function createPlotCanvas(ps, data) {
    const bounds = data.bounds;
    if (!bounds) return null;
    const layout = computePlotLayout(ps, bounds);
    if (!layout) return null;

    const canvas = document.createElement("canvas");
    canvas.width = layout.pageWpx;
    canvas.height = layout.pageHpx;
    const ctx = canvas.getContext("2d");

    // Pass color ramp data to the renderer
    try { window.__GF_COLOR_RAMPS = data.allColorRamps; } catch (_) { }

    renderPlot(ctx, ps, data, layout);
    return canvas;
}

/** Export the plot as a PNG download */
export function exportPlotPNG(ps, data, filename) {
    const canvas = createPlotCanvas(ps, data);
    if (!canvas) return;
    canvas.toBlob((blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url; a.download = filename || "plot.png";
        a.click();
        URL.revokeObjectURL(url);
    }, "image/png");
}

/** Open browser print dialog with the plot */
export function printPlot(ps, data) {
    const canvas = createPlotCanvas(ps, data);
    if (!canvas) return;
    const win = window.open("", "_blank");
    if (!win) return;
    const paper = PAGE_SIZES[ps.pageSize] || PAGE_SIZES.A3;
    let pw = paper.w, ph = paper.h;
    if (ps.orientation === "landscape") { pw = paper.h; ph = paper.w; }
    win.document.write(`
    <!DOCTYPE html><html><head><title>GridForge Plot</title>
    <style>
      @page { size: ${pw}mm ${ph}mm; margin: 0; }
      body { margin: 0; display: flex; justify-content: center; align-items: center; }
      img { width: ${pw}mm; height: ${ph}mm; }
      @media print { body { margin: 0; } }
    </style></head><body>
    <img src="${canvas.toDataURL("image/png")}" />
    </body></html>
  `);
    win.document.close();
    setTimeout(() => win.print(), 500);
}
