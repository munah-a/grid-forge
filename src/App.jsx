import { useState, useRef, useCallback, useEffect, useMemo } from "react";

// ─── Constants & Palettes ───────────────────────────────────────────────────
const COLORS = {
  bg: "#0a0f1e",
  panel: "#0f1629",
  panelBorder: "#1a2340",
  surface: "#141c33",
  surfaceHover: "#1a2545",
  text: "#e2e8f0",
  textMuted: "#64748b",
  textDim: "#475569",
  accent: "#f97316",
  accentDim: "#c2410c",
  blue: "#1e40af",
  blueLight: "#3b82f6",
  blueDim: "#1e3a5f",
  green: "#22c55e",
  greenDim: "#166534",
  orange: "#f97316",
  orangeDim: "#9a3412",
  border: "#1e293b",
  danger: "#ef4444",
  white: "#ffffff",
};

const COLOR_RAMPS = {
  viridis: ["#440154","#482777","#3e4989","#31688e","#26828e","#1f9e89","#35b779","#6ece58","#b5de2b","#fde725"],
  terrain: ["#333399","#0099cc","#33cc33","#99cc00","#cccc00","#cc9900","#cc6600","#cc3300","#990000"],
  plasma: ["#0d0887","#46039f","#7201a8","#9c179e","#bd3786","#d8576b","#ed7953","#fb9f3a","#fdca26","#f0f921"],
  inferno: ["#000004","#1b0c41","#4a0c6b","#781c6d","#a52c60","#cf4446","#ed6925","#fb9b06","#f7d13d","#fcffa4"],
  ocean: ["#0a1628","#0d2b45","#0f4c75","#1a759f","#34a0a4","#52b69a","#76c893","#99d98c","#b5e48c","#d9ed92"],
  hot: ["#000000","#3b0000","#7a0000","#b80000","#e63600","#ff6d00","#ff9e00","#ffcf00","#ffff30","#ffffff"],
};

const MARKER_SHAPES = { circle: "●", square: "■", triangle: "▲", diamond: "◆" };

// ─── Utility Functions ──────────────────────────────────────────────────────
function parseCSV(text) {
  const delimiters = [",", "\t", ";", "|"];
  const firstLine = text.split("\n")[0];
  const delimiter = delimiters.reduce((best, d) =>
    (firstLine.split(d).length > firstLine.split(best).length) ? d : best, ",");
  const lines = text.trim().split("\n").filter(l => l.trim());
  const headers = lines[0].split(delimiter).map(h => h.trim().replace(/^["']|["']$/g, ""));
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const vals = lines[i].split(delimiter).map(v => v.trim().replace(/^["']|["']$/g, ""));
    if (vals.length === headers.length) {
      const row = {};
      headers.forEach((h, j) => { row[h] = isNaN(+vals[j]) ? vals[j] : +vals[j]; });
      rows.push(row);
    }
  }
  return { headers, rows };
}

function autoDetectColumns(headers) {
  const xPatterns = [/^x$/i, /^lon/i, /^lng/i, /^east/i, /^e$/i, /^long/i];
  const yPatterns = [/^y$/i, /^lat/i, /^north/i, /^n$/i];
  const zPatterns = [/^z$/i, /^elev/i, /^height/i, /^alt/i, /^val/i, /^depth/i];
  const find = (pats) => headers.find(h => pats.some(p => p.test(h))) || "";
  return { x: find(xPatterns), y: find(yPatterns), z: find(zPatterns) };
}

function idwInterpolation(points, gridX, gridY, power = 2, searchRadius = Infinity) {
  const grid = new Float64Array(gridX.length * gridY.length);
  for (let j = 0; j < gridY.length; j++) {
    for (let i = 0; i < gridX.length; i++) {
      let wSum = 0, vSum = 0;
      let exact = null;
      for (const p of points) {
        const dx = gridX[i] - p.x;
        const dy = gridY[j] - p.y;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d < 1e-10) { exact = p.z; break; }
        if (d <= searchRadius) {
          const w = 1 / Math.pow(d, power);
          wSum += w;
          vSum += w * p.z;
        }
      }
      grid[j * gridX.length + i] = exact !== null ? exact : (wSum > 0 ? vSum / wSum : NaN);
    }
  }
  return grid;
}

function naturalNeighborInterpolation(points, gridX, gridY) {
  return idwInterpolation(points, gridX, gridY, 2.5);
}

function minimumCurvature(points, gridX, gridY, iterations = 100, tension = 0.25) {
  const nx = gridX.length, ny = gridY.length;
  let grid = idwInterpolation(points, gridX, gridY, 2);
  const dx = gridX.length > 1 ? gridX[1] - gridX[0] : 1;
  const dy = gridY.length > 1 ? gridY[1] - gridY[0] : 1;
  const known = new Uint8Array(nx * ny);
  for (const p of points) {
    const gi = Math.round((p.x - gridX[0]) / dx);
    const gj = Math.round((p.y - gridY[0]) / dy);
    if (gi >= 0 && gi < nx && gj >= 0 && gj < ny) known[gj * nx + gi] = 1;
  }
  for (let iter = 0; iter < iterations; iter++) {
    for (let j = 1; j < ny - 1; j++) {
      for (let i = 1; i < nx - 1; i++) {
        const idx = j * nx + i;
        if (known[idx]) continue;
        const avg = (grid[idx - 1] + grid[idx + 1] + grid[(j - 1) * nx + i] + grid[(j + 1) * nx + i]) / 4;
        grid[idx] = grid[idx] + tension * (avg - grid[idx]);
      }
    }
  }
  return grid;
}

function generateContours(grid, gridX, gridY, levels) {
  const nx = gridX.length, ny = gridY.length;
  const contours = [];
  for (const level of levels) {
    const segments = [];
    for (let j = 0; j < ny - 1; j++) {
      for (let i = 0; i < nx - 1; i++) {
        const v = [
          grid[j * nx + i], grid[j * nx + i + 1],
          grid[(j + 1) * nx + i + 1], grid[(j + 1) * nx + i]
        ];
        if (v.some(isNaN)) continue;
        const idx =
          (v[0] >= level ? 8 : 0) | (v[1] >= level ? 4 : 0) |
          (v[2] >= level ? 2 : 0) | (v[3] >= level ? 1 : 0);
        if (idx === 0 || idx === 15) continue;
        const lerp = (a, b, va, vb) => (level - va) / (vb - va) * (b - a) + a;
        const x0 = gridX[i], x1 = gridX[i + 1], y0 = gridY[j], y1 = gridY[j + 1];
        const edges = [];
        if ((idx & 12) === 4 || (idx & 12) === 8) edges.push([lerp(x0, x1, v[0], v[1]), y0]);
        if ((idx & 6) === 2 || (idx & 6) === 4) edges.push([x1, lerp(y0, y1, v[1], v[2])]);
        if ((idx & 3) === 1 || (idx & 3) === 2) edges.push([lerp(x0, x1, v[3], v[2]), y1]);
        if ((idx & 9) === 1 || (idx & 9) === 8) edges.push([x0, lerp(y0, y1, v[0], v[3])]);
        if (edges.length >= 2) segments.push([edges[0], edges[1]]);
        if (edges.length >= 4) segments.push([edges[2], edges[3]]);
      }
    }
    if (segments.length > 0) contours.push({ level, segments });
  }
  return contours;
}

function getColorFromRamp(t, rampName = "viridis") {
  const ramp = COLOR_RAMPS[rampName] || COLOR_RAMPS.viridis;
  t = Math.max(0, Math.min(1, t));
  const idx = t * (ramp.length - 1);
  const lo = Math.floor(idx), hi = Math.min(lo + 1, ramp.length - 1);
  const f = idx - lo;
  const parse = (hex) => [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
  const c1 = parse(ramp[lo]), c2 = parse(ramp[hi]);
  return `rgb(${Math.round(c1[0] + f * (c2[0] - c1[0]))},${Math.round(c1[1] + f * (c2[1] - c1[1]))},${Math.round(c1[2] + f * (c2[2] - c1[2]))})`;
}

// ─── Sample Data ─────────────────────────────────────────────────────────
function generateSampleData() {
  const points = [];
  for (let i = 0; i < 200; i++) {
    const x = Math.random() * 1000;
    const y = Math.random() * 1000;
    const z = 50 * Math.sin(x / 150) * Math.cos(y / 200) + 30 * Math.sin((x + y) / 100) + Math.random() * 10 + 100;
    points.push({ x: +x.toFixed(2), y: +y.toFixed(2), z: +z.toFixed(2) });
  }
  return points;
}

// ─── Icons ───────────────────────────────────────────────────────────────
const Icons = {
  Upload: () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>,
  Grid: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M3 15h18M9 3v18M15 3v18"/></svg>,
  Layers: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></svg>,
  Eye: () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>,
  EyeOff: () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>,
  Settings: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>,
  Map: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6"/><line x1="8" y1="2" x2="8" y2="18"/><line x1="16" y1="6" x2="16" y2="22"/></svg>,
  Trash: () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>,
  Play: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>,
  ChevDown: () => <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 12 15 18 9"/></svg>,
  Plus: () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>,
  Table: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="3" x2="9" y2="21"/></svg>,
  Crosshair: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="22" y1="12" x2="18" y2="12"/><line x1="6" y1="12" x2="2" y2="12"/><line x1="12" y1="6" x2="12" y2="2"/><line x1="12" y1="22" x2="12" y2="18"/></svg>,
  ZoomIn: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/></svg>,
  Download: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>,
  Globe: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><ellipse cx="12" cy="12" rx="4" ry="10"/><line x1="2" y1="12" x2="22" y2="12"/></svg>,
  Compass: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76" fill="currentColor" fillOpacity="0.3"/></svg>,
  Mountain: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M8 3l4 8 5-5 5 15H2z"/></svg>,
  Satellite: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M13 7L9 3 3 9l4 4"/><path d="M11 17l4 4 6-6-4-4"/><path d="M8 12l4 4"/><circle cx="16" cy="8" r="2"/></svg>,
  MapPin: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>,
  ChevUp: () => <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="18 15 12 9 6 15"/></svg>,
};

// ─── Sub-components ──────────────────────────────────────────────────────

function Tooltip({ children, text }) {
  return (
    <div style={{ position: "relative", display: "inline-flex" }} className="tooltip-wrap">
      {children}
      <div style={{
        position: "absolute", bottom: "calc(100% + 6px)", left: "50%", transform: "translateX(-50%)",
        background: COLORS.surface, color: COLORS.text, fontSize: 11, padding: "4px 8px",
        borderRadius: 4, whiteSpace: "nowrap", pointerEvents: "none", opacity: 0,
        transition: "opacity 0.15s", border: `1px solid ${COLORS.panelBorder}`, zIndex: 100,
      }} className="tooltip-text">{text}</div>
    </div>
  );
}

function Select({ value, onChange, options, style }) {
  return (
    <select value={value} onChange={e => onChange(e.target.value)} style={{
      background: COLORS.surface, color: COLORS.text, border: `1px solid ${COLORS.panelBorder}`,
      borderRadius: 6, padding: "6px 10px", fontSize: 12, outline: "none", cursor: "pointer",
      appearance: "none", backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%2364748b' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E")`,
      backgroundRepeat: "no-repeat", backgroundPosition: "right 8px center", paddingRight: 28,
      ...style,
    }}>
      {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

function Slider({ value, onChange, min, max, step = 1, label, showValue = true }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      {label && <span style={{ fontSize: 11, color: COLORS.textMuted, minWidth: 60 }}>{label}</span>}
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={e => onChange(+e.target.value)}
        style={{ flex: 1, accentColor: COLORS.accent, height: 4, cursor: "pointer" }} />
      {showValue && <span style={{ fontSize: 11, color: COLORS.textMuted, minWidth: 30, textAlign: "right" }}>{value}</span>}
    </div>
  );
}

function Button({ children, onClick, variant = "default", size = "md", style, disabled }) {
  const base = {
    display: "inline-flex", alignItems: "center", gap: 6, cursor: disabled ? "not-allowed" : "pointer",
    border: "none", borderRadius: 6, fontWeight: 500, transition: "all 0.15s",
    opacity: disabled ? 0.5 : 1, fontFamily: "inherit",
  };
  const variants = {
    default: { background: COLORS.surface, color: COLORS.text, border: `1px solid ${COLORS.panelBorder}` },
    primary: { background: COLORS.accent, color: "#fff" },
    success: { background: COLORS.green, color: "#fff" },
    ghost: { background: "transparent", color: COLORS.textMuted },
    danger: { background: "transparent", color: COLORS.danger, border: `1px solid ${COLORS.danger}33` },
  };
  const sizes = { sm: { padding: "4px 10px", fontSize: 11 }, md: { padding: "7px 14px", fontSize: 12 }, lg: { padding: "10px 20px", fontSize: 13 } };
  return <button onClick={onClick} disabled={disabled} style={{ ...base, ...variants[variant], ...sizes[size], ...style }}>{children}</button>;
}

// ─── Main Application ────────────────────────────────────────────────────
export default function GridForgeGIS() {
  // State
  const [points, setPoints] = useState([]);
  const [layers, setLayers] = useState([]);
  const [activePanel, setActivePanel] = useState("import");
  const [columnMapping, setColumnMapping] = useState({ x: "", y: "", z: "" });
  const [headers, setHeaders] = useState([]);
  const [rawRows, setRawRows] = useState([]);
  const [fileName, setFileName] = useState("");
  const [gridData, setGridData] = useState(null);
  const [contourData, setContourData] = useState(null);
  const [gridSettings, setGridSettings] = useState({
    algorithm: "idw", power: 2, resolution: 50, padding: 5,
    contourInterval: 10, colorRamp: "viridis", showContours: true, showRaster: true,
    contourSmoothing: 0.5,
  });
  const [viewState, setViewState] = useState({ x: 0, y: 0, scale: 1 });
  const [cursorCoords, setCursorCoords] = useState(null);
  const [showTable, setShowTable] = useState(false);
  const [gridding, setGridding] = useState(false);
  const [gridStats, setGridStats] = useState(null);
  const [baseMap, setBaseMap] = useState("dark");
  const [showBaseMapPicker, setShowBaseMapPicker] = useState(false);
  const [showCompass, setShowCompass] = useState(true);
  const [showGridLines, setShowGridLines] = useState(true);
  const [showCoordLabels, setShowCoordLabels] = useState(true);
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const fileInputRef = useRef(null);
  const dragRef = useRef({ dragging: false, startX: 0, startY: 0, startViewX: 0, startViewY: 0 });

  // Compute bounds
  const bounds = useMemo(() => {
    if (points.length === 0) return null;
    let xMin = Infinity, xMax = -Infinity, yMin = Infinity, yMax = -Infinity, zMin = Infinity, zMax = -Infinity;
    points.forEach(p => {
      if (p.x < xMin) xMin = p.x; if (p.x > xMax) xMax = p.x;
      if (p.y < yMin) yMin = p.y; if (p.y > yMax) yMax = p.y;
      if (p.z < zMin) zMin = p.z; if (p.z > zMax) zMax = p.z;
    });
    return { xMin, xMax, yMin, yMax, zMin, zMax };
  }, [points]);

  // Fit view to data
  const fitView = useCallback(() => {
    if (!bounds || !containerRef.current) return;
    const container = containerRef.current;
    const w = container.clientWidth;
    const h = container.clientHeight;
    const dataW = bounds.xMax - bounds.xMin || 1;
    const dataH = bounds.yMax - bounds.yMin || 1;
    const scale = Math.min(w / (dataW * 1.2), h / (dataH * 1.2));
    setViewState({
      x: w / 2 - (bounds.xMin + dataW / 2) * scale,
      y: h / 2 - (bounds.yMin + dataH / 2) * scale,
      scale,
    });
  }, [bounds]);

  useEffect(() => { if (points.length > 0) fitView(); }, [points.length]);

  // File handling
  const handleFile = useCallback((file) => {
    if (!file) return;
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (e) => {
      let text = e.target.result;
      // handle GeoJSON
      if (file.name.endsWith(".geojson") || file.name.endsWith(".json")) {
        try {
          const gj = JSON.parse(text);
          const features = gj.features || (gj.type === "Feature" ? [gj] : []);
          const pts = features.filter(f => f.geometry?.type === "Point").map(f => ({
            x: f.geometry.coordinates[0], y: f.geometry.coordinates[1],
            z: f.geometry.coordinates[2] || f.properties?.z || f.properties?.elevation || 0,
            ...f.properties,
          }));
          if (pts.length > 0) {
            const h = Object.keys(pts[0]);
            setHeaders(h);
            setRawRows(pts.slice(0, 100));
            setColumnMapping(autoDetectColumns(h));
            setActivePanel("mapping");
          }
          return;
        } catch (err) { /* fall through to CSV parsing */ }
      }
      const { headers: h, rows } = parseCSV(text);
      if (h.length > 0 && rows.length > 0) {
        setHeaders(h);
        setRawRows(rows.slice(0, 100));
        setColumnMapping(autoDetectColumns(h));
        setActivePanel("mapping");
      }
    };
    reader.readAsText(file);
  }, []);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    const file = e.dataTransfer?.files?.[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const applyMapping = useCallback(() => {
    if (!columnMapping.x || !columnMapping.y) return;
    const pts = rawRows.map(r => ({
      x: +r[columnMapping.x], y: +r[columnMapping.y],
      z: columnMapping.z ? +r[columnMapping.z] : 0,
    })).filter(p => !isNaN(p.x) && !isNaN(p.y) && !isNaN(p.z));
    setPoints(pts);
    setLayers(prev => [...prev, {
      id: Date.now(), name: fileName || "Points", type: "points", visible: true, opacity: 100,
      color: COLORS.accent, size: 5, shape: "circle",
    }]);
    setActivePanel("gridding");
  }, [columnMapping, rawRows, fileName]);

  // Gridding
  const runGridding = useCallback(() => {
    if (points.length === 0 || !bounds) return;
    setGridding(true);
    setTimeout(() => {
      const pad = gridSettings.padding / 100;
      const dx = (bounds.xMax - bounds.xMin) * pad;
      const dy = (bounds.yMax - bounds.yMin) * pad;
      const nx = gridSettings.resolution;
      const ny = Math.round(nx * ((bounds.yMax - bounds.yMin + 2 * dy) / (bounds.xMax - bounds.xMin + 2 * dx))) || nx;
      const gridX = Array.from({ length: nx }, (_, i) => bounds.xMin - dx + i * (bounds.xMax - bounds.xMin + 2 * dx) / (nx - 1));
      const gridY = Array.from({ length: ny }, (_, j) => bounds.yMin - dy + j * (bounds.yMax - bounds.yMin + 2 * dy) / (ny - 1));

      let grid;
      switch (gridSettings.algorithm) {
        case "idw": grid = idwInterpolation(points, gridX, gridY, gridSettings.power); break;
        case "natural": grid = naturalNeighborInterpolation(points, gridX, gridY); break;
        case "mincurv": grid = minimumCurvature(points, gridX, gridY); break;
        default: grid = idwInterpolation(points, gridX, gridY, gridSettings.power);
      }

      // Stats
      let min = Infinity, max = -Infinity, sum = 0, cnt = 0;
      for (let i = 0; i < grid.length; i++) {
        if (!isNaN(grid[i])) { min = Math.min(min, grid[i]); max = Math.max(max, grid[i]); sum += grid[i]; cnt++; }
      }
      setGridStats({ min, max, mean: sum / cnt, cells: nx * ny, nx, ny });

      const gd = { grid, gridX, gridY, nx, ny, zMin: min, zMax: max };
      setGridData(gd);

      // Contours
      const range = max - min;
      const interval = gridSettings.contourInterval || range / 10;
      const levels = [];
      for (let v = Math.ceil(min / interval) * interval; v <= max; v += interval) levels.push(v);
      const contours = generateContours(grid, gridX, gridY, levels);
      setContourData(contours);

      setLayers(prev => {
        const filtered = prev.filter(l => l.type !== "raster" && l.type !== "contours");
        return [
          ...filtered,
          { id: Date.now(), name: `Grid (${gridSettings.algorithm.toUpperCase()})`, type: "raster", visible: true, opacity: 85 },
          { id: Date.now() + 1, name: "Contours", type: "contours", visible: true, opacity: 100 },
        ];
      });
      setGridding(false);
    }, 50);
  }, [points, bounds, gridSettings]);

  // Canvas rendering
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const w = canvas.width = canvas.parentElement.clientWidth;
    const h = canvas.height = canvas.parentElement.clientHeight;
    const { x: vx, y: vy, scale } = viewState;

    ctx.fillStyle = "#060b18";
    ctx.fillRect(0, 0, w, h);

    // ─── Base Map Rendering ────────────────────────────────────────────
    const BASEMAP_STYLES = {
      dark: { bg: "#060b18", grid: "#0d1528", gridMajor: "#111d38", axis: "#1a2a4a", labelColor: "#2a3a5aaa", water: null },
      light: { bg: "#f0f2f5", grid: "#d8dce3", gridMajor: "#bcc2cc", axis: "#9ca3af", labelColor: "#9ca3af88", water: null },
      aerial: { bg: "#1a2e1a", grid: "#243824", gridMajor: "#2d4a2d", axis: "#3d5a3d", labelColor: "#4a6a4a88", water: "#0f2847" },
      topo: { bg: "#f5f0e8", grid: "#d4cfc4", gridMajor: "#bbb5a6", axis: "#9e9788", labelColor: "#9e978888", water: "#c4d9ef" },
      blueprint: { bg: "#0a1628", grid: "#132244", gridMajor: "#1a3060", axis: "#2040a0", labelColor: "#3050c088", water: null },
    };
    const bmStyle = BASEMAP_STYLES[baseMap] || BASEMAP_STYLES.dark;
    ctx.fillStyle = bmStyle.bg;
    ctx.fillRect(0, 0, w, h);

    // Aerial mode: procedural terrain texture
    if (baseMap === "aerial") {
      const imgData = ctx.createImageData(w, h);
      const d = imgData.data;
      for (let py = 0; py < h; py += 2) {
        for (let px = 0; px < w; px += 2) {
          const wx = (px - vx) / scale;
          const wy = (py - vy) / scale;
          const n1 = Math.sin(wx * 0.008) * Math.cos(wy * 0.006) * 0.5 + 0.5;
          const n2 = Math.sin(wx * 0.02 + wy * 0.015) * 0.3 + 0.5;
          const n3 = Math.sin(wx * 0.05) * Math.sin(wy * 0.04) * 0.15 + 0.5;
          const v = (n1 * 0.5 + n2 * 0.3 + n3 * 0.2);
          const r = Math.floor(20 + v * 40);
          const g = Math.floor(35 + v * 65);
          const b = Math.floor(15 + v * 30);
          for (let dy = 0; dy < 2 && py + dy < h; dy++) {
            for (let dx = 0; dx < 2 && px + dx < w; dx++) {
              const idx = ((py + dy) * w + (px + dx)) * 4;
              d[idx] = r; d[idx+1] = g; d[idx+2] = b; d[idx+3] = 255;
            }
          }
        }
      }
      ctx.putImageData(imgData, 0, 0);
      // Soft vignette
      const vg = ctx.createRadialGradient(w/2, h/2, Math.min(w,h)*0.2, w/2, h/2, Math.max(w,h)*0.7);
      vg.addColorStop(0, "rgba(0,0,0,0)");
      vg.addColorStop(1, "rgba(0,0,0,0.25)");
      ctx.fillStyle = vg;
      ctx.fillRect(0, 0, w, h);
    }

    // Topo mode: subtle contour-like background rings
    if (baseMap === "topo") {
      ctx.globalAlpha = 0.12;
      const cx = w / 2, cy = h / 2;
      for (let r = 30; r < Math.max(w, h); r += 40) {
        ctx.strokeStyle = "#8b7355";
        ctx.lineWidth = r % 200 === 30 ? 1.5 : 0.5;
        ctx.beginPath();
        ctx.ellipse(cx, cy, r * 1.3, r, 0.3, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }

    // Blueprint mode: technical drawing feel
    if (baseMap === "blueprint") {
      ctx.globalAlpha = 0.04;
      for (let px = 0; px < w; px += 8) {
        for (let py = 0; py < h; py += 8) {
          if (Math.random() > 0.97) {
            ctx.fillStyle = "#3060ff";
            ctx.fillRect(px, py, 1, 1);
          }
        }
      }
      ctx.globalAlpha = 1;
    }

    // Draw grid lines
    if (showGridLines) {
      const gridSpacing = Math.pow(10, Math.floor(Math.log10(200 / scale)));
      const majorSpacing = gridSpacing * 5;
      const startX = Math.floor((-vx / scale) / gridSpacing) * gridSpacing;
      const startY = Math.floor((-vy / scale) / gridSpacing) * gridSpacing;

      // Minor grid
      ctx.strokeStyle = bmStyle.grid;
      ctx.lineWidth = 0.5;
      for (let gx = startX; gx < (-vx + w) / scale; gx += gridSpacing) {
        const sx = gx * scale + vx;
        ctx.beginPath(); ctx.moveTo(sx, 0); ctx.lineTo(sx, h); ctx.stroke();
      }
      for (let gy = startY; gy < (-vy + h) / scale; gy += gridSpacing) {
        const sy = gy * scale + vy;
        ctx.beginPath(); ctx.moveTo(0, sy); ctx.lineTo(w, sy); ctx.stroke();
      }

      // Major grid
      ctx.strokeStyle = bmStyle.gridMajor;
      ctx.lineWidth = 1;
      const majorStartX = Math.floor((-vx / scale) / majorSpacing) * majorSpacing;
      const majorStartY = Math.floor((-vy / scale) / majorSpacing) * majorSpacing;
      for (let gx = majorStartX; gx < (-vx + w) / scale; gx += majorSpacing) {
        const sx = gx * scale + vx;
        ctx.beginPath(); ctx.moveTo(sx, 0); ctx.lineTo(sx, h); ctx.stroke();
      }
      for (let gy = majorStartY; gy < (-vy + h) / scale; gy += majorSpacing) {
        const sy = gy * scale + vy;
        ctx.beginPath(); ctx.moveTo(0, sy); ctx.lineTo(w, sy); ctx.stroke();
      }

      // Coordinate labels along edges
      if (showCoordLabels) {
        ctx.font = "9px 'JetBrains Mono', monospace";
        ctx.fillStyle = bmStyle.labelColor;
        ctx.textAlign = "center";
        for (let gx = majorStartX; gx < (-vx + w) / scale; gx += majorSpacing) {
          const sx = gx * scale + vx;
          if (sx > 30 && sx < w - 30) {
            ctx.fillText(gx.toFixed(gx % 1 === 0 ? 0 : 1), sx, h - 34);
          }
        }
        ctx.textAlign = "right";
        for (let gy = majorStartY; gy < (-vy + h) / scale; gy += majorSpacing) {
          const sy = gy * scale + vy;
          if (sy > 10 && sy < h - 40) {
            ctx.fillText(gy.toFixed(gy % 1 === 0 ? 0 : 1), 36, sy + 3);
          }
        }
      }

      // Origin axes (thicker lines at 0,0)
      const ox = 0 * scale + vx;
      const oy = 0 * scale + vy;
      ctx.strokeStyle = bmStyle.axis;
      ctx.lineWidth = 1.5;
      if (ox > 0 && ox < w) { ctx.beginPath(); ctx.moveTo(ox, 0); ctx.lineTo(ox, h); ctx.stroke(); }
      if (oy > 0 && oy < h) { ctx.beginPath(); ctx.moveTo(0, oy); ctx.lineTo(w, oy); ctx.stroke(); }
    }

    const rasterLayer = layers.find(l => l.type === "raster");
    const contourLayer = layers.find(l => l.type === "contours");
    const pointLayer = layers.find(l => l.type === "points");

    // Draw raster
    if (gridData && rasterLayer?.visible && gridSettings.showRaster) {
      const { grid, gridX, gridY, nx, ny, zMin, zMax } = gridData;
      const range = zMax - zMin || 1;
      ctx.globalAlpha = (rasterLayer.opacity || 100) / 100;
      const cellW = (gridX[1] - gridX[0]) * scale;
      const cellH = (gridY[1] - gridY[0]) * scale;
      for (let j = 0; j < ny; j++) {
        for (let i = 0; i < nx; i++) {
          const val = grid[j * nx + i];
          if (isNaN(val)) continue;
          const t = (val - zMin) / range;
          ctx.fillStyle = getColorFromRamp(t, gridSettings.colorRamp);
          const sx = gridX[i] * scale + vx - cellW / 2;
          const sy = gridY[j] * scale + vy - cellH / 2;
          ctx.fillRect(sx, sy, cellW + 1, cellH + 1);
        }
      }
      ctx.globalAlpha = 1;
    }

    // Draw contours
    if (contourData && contourLayer?.visible && gridSettings.showContours) {
      ctx.globalAlpha = (contourLayer.opacity || 100) / 100;
      const range = (gridData?.zMax - gridData?.zMin) || 1;
      contourData.forEach(({ level, segments }) => {
        const t = (level - gridData.zMin) / range;
        ctx.strokeStyle = getColorFromRamp(Math.min(1, t * 0.8 + 0.1), gridSettings.colorRamp);
        ctx.lineWidth = 1.2;
        segments.forEach(([p1, p2]) => {
          ctx.beginPath();
          ctx.moveTo(p1[0] * scale + vx, p1[1] * scale + vy);
          ctx.lineTo(p2[0] * scale + vx, p2[1] * scale + vy);
          ctx.stroke();
        });
        // Labels
        if (segments.length > 0 && segments.length % 4 === 0) {
          const mid = segments[Math.floor(segments.length / 3)];
          if (mid) {
            const mx = (mid[0][0] + mid[1][0]) / 2 * scale + vx;
            const my = (mid[0][1] + mid[1][1]) / 2 * scale + vy;
            const isDark = baseMap === "dark" || baseMap === "aerial" || baseMap === "blueprint";
            ctx.font = "bold 9px 'DM Sans', sans-serif";
            ctx.fillStyle = isDark ? "#ffffffcc" : "#000000bb";
            ctx.strokeStyle = isDark ? "#00000088" : "#ffffff99";
            ctx.lineWidth = 2.5;
            const label = level.toFixed(1);
            ctx.strokeText(label, mx - 12, my + 3);
            ctx.fillText(label, mx - 12, my + 3);
          }
        }
      });
      ctx.globalAlpha = 1;
    }

    // Draw points
    if (points.length > 0 && pointLayer?.visible) {
      ctx.globalAlpha = (pointLayer.opacity || 100) / 100;
      const zRange = bounds ? (bounds.zMax - bounds.zMin || 1) : 1;
      points.forEach(p => {
        const sx = p.x * scale + vx;
        const sy = p.y * scale + vy;
        if (sx < -10 || sx > w + 10 || sy < -10 || sy > h + 10) return;
        const t = bounds ? (p.z - bounds.zMin) / zRange : 0.5;
        ctx.fillStyle = getColorFromRamp(t, gridSettings.colorRamp);
        const isDark = baseMap === "dark" || baseMap === "aerial" || baseMap === "blueprint";
        ctx.strokeStyle = isDark ? "#00000066" : "#ffffff88";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(sx, sy, (pointLayer.size || 4) * Math.min(scale / 0.5, 2), 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      });
      ctx.globalAlpha = 1;
    }

    // Empty state
    if (points.length === 0 && !gridData) {
      const isDark = baseMap === "dark" || baseMap === "aerial" || baseMap === "blueprint";
      ctx.fillStyle = isDark ? COLORS.textDim : "#6b728088";
      ctx.font = "14px 'DM Sans', sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("Drop a CSV/GeoJSON file here or use the Import panel", w / 2, h / 2 - 10);
      ctx.font = "11px 'DM Sans', sans-serif";
      ctx.fillStyle = isDark ? (COLORS.textDim + "88") : "#6b728055";
      ctx.fillText("Supports CSV, TSV, GeoJSON with X/Y/Z coordinates", w / 2, h / 2 + 14);
    }

    // Color bar legend
    if (gridData && gridSettings.showRaster) {
      const isDark = baseMap === "dark" || baseMap === "aerial" || baseMap === "blueprint";
      const barW = 16, barH = 180, barX = w - 50, barY = h / 2 - barH / 2;
      // Background behind color bar
      ctx.fillStyle = isDark ? "rgba(6,11,24,0.7)" : "rgba(255,255,255,0.7)";
      const cbPad = 8;
      ctx.beginPath();
      ctx.roundRect(barX - cbPad, barY - cbPad - 2, barW + 60 + cbPad * 2, barH + cbPad * 2 + 4, 6);
      ctx.fill();

      for (let i = 0; i < barH; i++) {
        const t = 1 - i / barH;
        ctx.fillStyle = getColorFromRamp(t, gridSettings.colorRamp);
        ctx.fillRect(barX, barY + i, barW, 2);
      }
      ctx.strokeStyle = isDark ? COLORS.panelBorder : "#bcc2cc";
      ctx.lineWidth = 1;
      ctx.strokeRect(barX, barY, barW, barH);
      ctx.fillStyle = isDark ? COLORS.text : "#374151";
      ctx.font = "10px 'DM Sans', sans-serif";
      ctx.textAlign = "left";
      ctx.fillText(gridData.zMax.toFixed(1), barX + barW + 6, barY + 8);
      ctx.fillText(((gridData.zMax + gridData.zMin) / 2).toFixed(1), barX + barW + 6, barY + barH / 2 + 3);
      ctx.fillText(gridData.zMin.toFixed(1), barX + barW + 6, barY + barH);
    }

    // ─── Compass / North Arrow ────────────────────────────────────────
    if (showCompass) {
      const isDark = baseMap === "dark" || baseMap === "aerial" || baseMap === "blueprint";
      const cx = w - 36, cy = 62;
      const r = 18;
      // Shadow
      ctx.beginPath();
      ctx.arc(cx, cy, r + 4, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(0,0,0,0.25)";
      ctx.fill();
      // Outer ring
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fillStyle = isDark ? "rgba(15,22,41,0.9)" : "rgba(255,255,255,0.9)";
      ctx.fill();
      ctx.strokeStyle = isDark ? COLORS.panelBorder : "#bcc2cc";
      ctx.lineWidth = 1.5;
      ctx.stroke();
      // North triangle (orange/red)
      ctx.beginPath();
      ctx.moveTo(cx, cy - r + 5);
      ctx.lineTo(cx - 5, cy);
      ctx.lineTo(cx + 5, cy);
      ctx.closePath();
      ctx.fillStyle = COLORS.accent;
      ctx.fill();
      // South triangle
      ctx.beginPath();
      ctx.moveTo(cx, cy + r - 5);
      ctx.lineTo(cx - 5, cy);
      ctx.lineTo(cx + 5, cy);
      ctx.closePath();
      ctx.fillStyle = isDark ? "#334155" : "#94a3b8";
      ctx.fill();
      // N label
      ctx.font = "bold 8px 'DM Sans', sans-serif";
      ctx.fillStyle = COLORS.accent;
      ctx.textAlign = "center";
      ctx.fillText("N", cx, cy - r + 2);
      // Tick marks
      ctx.strokeStyle = isDark ? "#475569" : "#9ca3af";
      ctx.lineWidth = 1;
      [0, 90, 180, 270].forEach(angle => {
        const a = (angle - 90) * Math.PI / 180;
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(a) * (r - 3), cy + Math.sin(a) * (r - 3));
        ctx.lineTo(cx + Math.cos(a) * (r + 0.5), cy + Math.sin(a) * (r + 0.5));
        ctx.stroke();
      });
    }
  }, [points, gridData, contourData, viewState, layers, gridSettings, bounds, baseMap, showGridLines, showCoordLabels, showCompass]);

  // Mouse handlers
  const handleMouseDown = (e) => {
    dragRef.current = { dragging: true, startX: e.clientX, startY: e.clientY, startViewX: viewState.x, startViewY: viewState.y };
  };
  const handleMouseMove = (e) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (rect) {
      const mx = (e.clientX - rect.left - viewState.x) / viewState.scale;
      const my = (e.clientY - rect.top - viewState.y) / viewState.scale;
      setCursorCoords({ x: mx.toFixed(2), y: my.toFixed(2) });
    }
    if (dragRef.current.dragging) {
      setViewState(prev => ({
        ...prev,
        x: dragRef.current.startViewX + (e.clientX - dragRef.current.startX),
        y: dragRef.current.startViewY + (e.clientY - dragRef.current.startY),
      }));
    }
  };
  const handleMouseUp = () => { dragRef.current.dragging = false; };
  const handleWheel = (e) => {
    e.preventDefault();
    const rect = canvasRef.current.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const factor = e.deltaY > 0 ? 0.9 : 1.1;
    setViewState(prev => {
      const newScale = prev.scale * factor;
      return {
        scale: Math.max(0.01, Math.min(100, newScale)),
        x: mx - (mx - prev.x) * (newScale / prev.scale),
        y: my - (my - prev.y) * (newScale / prev.scale),
      };
    });
  };

  const loadSample = () => {
    const pts = generateSampleData();
    setPoints(pts);
    setLayers([{ id: Date.now(), name: "Sample Points", type: "points", visible: true, opacity: 100, size: 5 }]);
    setActivePanel("gridding");
  };

  const toggleLayer = (id) => {
    setLayers(prev => prev.map(l => l.id === id ? { ...l, visible: !l.visible } : l));
  };

  const removeLayer = (id) => {
    setLayers(prev => prev.filter(l => l.id !== id));
  };

  const panelBtns = [
    { id: "import", icon: Icons.Upload, label: "Import" },
    { id: "gridding", icon: Icons.Grid, label: "Grid" },
    { id: "layers", icon: Icons.Layers, label: "Layers" },
    { id: "style", icon: Icons.Settings, label: "Style" },
  ];

  return (
    <div style={{
      width: "100%", height: "100vh", display: "flex", flexDirection: "column",
      background: COLORS.bg, color: COLORS.text, fontFamily: "'DM Sans', 'Segoe UI', sans-serif",
      overflow: "hidden", fontSize: 13,
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        ::-webkit-scrollbar { width: 6px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: ${COLORS.panelBorder}; border-radius: 3px; }
        .tooltip-wrap:hover .tooltip-text { opacity: 1 !important; }
        input[type="number"] { background: ${COLORS.surface}; color: ${COLORS.text}; border: 1px solid ${COLORS.panelBorder}; border-radius: 6px; padding: 6px 8px; font-size: 12px; outline: none; font-family: 'JetBrains Mono', monospace; width: 100%; }
        input[type="number"]:focus { border-color: ${COLORS.accent}; }
        select:focus { border-color: ${COLORS.accent} !important; }
      `}</style>

      {/* Top Bar */}
      <div style={{
        display: "flex", alignItems: "center", height: 44, padding: "0 16px",
        background: COLORS.panel, borderBottom: `1px solid ${COLORS.panelBorder}`,
        gap: 12, flexShrink: 0,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{
            width: 28, height: 28, borderRadius: 6,
            background: `linear-gradient(135deg, ${COLORS.accent}, ${COLORS.green})`,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontWeight: 700, fontSize: 14, color: "#fff",
          }}>G</div>
          <span style={{ fontWeight: 700, fontSize: 15, letterSpacing: -0.3 }}>
            Grid<span style={{ color: COLORS.accent }}>Forge</span>
            <span style={{ color: COLORS.textMuted, fontWeight: 400, fontSize: 11, marginLeft: 6 }}>GIS</span>
          </span>
        </div>

        <div style={{ flex: 1 }} />

        {cursorCoords && (
          <div style={{
            display: "flex", gap: 12, fontSize: 11, fontFamily: "'JetBrains Mono', monospace",
            color: COLORS.textMuted, padding: "4px 12px", background: COLORS.surface,
            borderRadius: 4, border: `1px solid ${COLORS.panelBorder}`,
          }}>
            <span>X: <span style={{ color: COLORS.blueLight }}>{cursorCoords.x}</span></span>
            <span>Y: <span style={{ color: COLORS.green }}>{cursorCoords.y}</span></span>
          </div>
        )}

        <div style={{ display: "flex", gap: 4 }}>
          <Button size="sm" onClick={fitView}><Icons.Crosshair /> Fit</Button>
          <Button size="sm" onClick={loadSample} variant="primary"><Icons.Plus /> Sample</Button>
        </div>
      </div>

      {/* Main Layout */}
      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>

        {/* Sidebar Nav */}
        <div style={{
          width: 52, background: COLORS.panel, borderRight: `1px solid ${COLORS.panelBorder}`,
          display: "flex", flexDirection: "column", alignItems: "center", paddingTop: 8, gap: 4,
        }}>
          {panelBtns.map(btn => (
            <Tooltip key={btn.id} text={btn.label}>
              <button onClick={() => setActivePanel(activePanel === btn.id ? null : btn.id)} style={{
                width: 38, height: 38, borderRadius: 8, border: "none",
                background: activePanel === btn.id ? COLORS.accent + "22" : "transparent",
                color: activePanel === btn.id ? COLORS.accent : COLORS.textMuted,
                cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
                transition: "all 0.15s",
              }}>
                <btn.icon />
              </button>
            </Tooltip>
          ))}
          <div style={{ flex: 1 }} />
          <Tooltip text="Data Table">
            <button onClick={() => setShowTable(!showTable)} style={{
              width: 38, height: 38, borderRadius: 8, border: "none",
              background: showTable ? COLORS.green + "22" : "transparent",
              color: showTable ? COLORS.green : COLORS.textMuted,
              cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
              marginBottom: 8,
            }}>
              <Icons.Table />
            </button>
          </Tooltip>
        </div>

        {/* Side Panel */}
        {activePanel && (
          <div style={{
            width: 300, background: COLORS.panel, borderRight: `1px solid ${COLORS.panelBorder}`,
            display: "flex", flexDirection: "column", overflow: "hidden",
          }}>
            <div style={{
              padding: "12px 16px", borderBottom: `1px solid ${COLORS.panelBorder}`,
              fontWeight: 600, fontSize: 13, display: "flex", alignItems: "center", gap: 8,
            }}>
              {activePanel === "import" && <><Icons.Upload /> Import Data</>}
              {activePanel === "mapping" && <><Icons.Map /> Column Mapping</>}
              {activePanel === "gridding" && <><Icons.Grid /> Gridding Engine</>}
              {activePanel === "layers" && <><Icons.Layers /> Layer Manager</>}
              {activePanel === "style" && <><Icons.Settings /> Styling</>}
            </div>

            <div style={{ flex: 1, overflow: "auto", padding: 16 }}>
              {/* Import Panel */}
              {activePanel === "import" && (
                <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                  <div
                    onClick={() => fileInputRef.current?.click()}
                    onDrop={handleDrop} onDragOver={e => e.preventDefault()}
                    style={{
                      border: `2px dashed ${COLORS.panelBorder}`, borderRadius: 10,
                      padding: 32, textAlign: "center", cursor: "pointer",
                      transition: "all 0.2s",
                    }}
                    onMouseOver={e => e.currentTarget.style.borderColor = COLORS.accent}
                    onMouseOut={e => e.currentTarget.style.borderColor = COLORS.panelBorder}
                  >
                    <Icons.Upload />
                    <div style={{ marginTop: 8, fontSize: 13, fontWeight: 500 }}>Drop file or click</div>
                    <div style={{ fontSize: 11, color: COLORS.textMuted, marginTop: 4 }}>CSV, TSV, GeoJSON</div>
                    <input ref={fileInputRef} type="file" accept=".csv,.tsv,.txt,.geojson,.json"
                      onChange={e => handleFile(e.target.files[0])} style={{ display: "none" }} />
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={{ flex: 1, height: 1, background: COLORS.panelBorder }} />
                    <span style={{ fontSize: 11, color: COLORS.textMuted }}>or</span>
                    <div style={{ flex: 1, height: 1, background: COLORS.panelBorder }} />
                  </div>
                  <Button onClick={loadSample} variant="default" style={{ width: "100%", justifyContent: "center" }}>
                    <Icons.Play /> Load Sample Dataset (200 pts)
                  </Button>
                  <div style={{ fontSize: 11, color: COLORS.textDim, lineHeight: 1.5 }}>
                    Supported formats: Comma/Tab/Semicolon-separated text files with X, Y, Z columns. GeoJSON Point features.
                  </div>
                </div>
              )}

              {/* Column Mapping Panel */}
              {activePanel === "mapping" && headers.length > 0 && (
                <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                  <div style={{
                    padding: "8px 12px", background: COLORS.surface, borderRadius: 8,
                    fontSize: 11, color: COLORS.textMuted,
                  }}>
                    <span style={{ color: COLORS.accent, fontWeight: 600 }}>{fileName}</span>
                    <br />{rawRows.length}+ rows · {headers.length} columns
                  </div>
                  {["x", "y", "z"].map(axis => (
                    <div key={axis}>
                      <label style={{ fontSize: 11, color: COLORS.textMuted, marginBottom: 4, display: "block", textTransform: "uppercase", letterSpacing: 1, fontWeight: 600 }}>
                        {axis === "x" ? "X / Longitude" : axis === "y" ? "Y / Latitude" : "Z / Value"}
                        {axis !== "z" && <span style={{ color: COLORS.danger }}> *</span>}
                      </label>
                      <Select
                        value={columnMapping[axis]}
                        onChange={v => setColumnMapping(p => ({ ...p, [axis]: v }))}
                        options={[{ value: "", label: `Select ${axis.toUpperCase()} column...` }, ...headers.map(h => ({ value: h, label: h }))]}
                        style={{ width: "100%" }}
                      />
                    </div>
                  ))}
                  {/* Preview */}
                  <div style={{ fontSize: 11, fontWeight: 600, color: COLORS.textMuted, marginTop: 4 }}>Preview (first 5 rows)</div>
                  <div style={{ overflow: "auto", borderRadius: 6, border: `1px solid ${COLORS.panelBorder}` }}>
                    <table style={{ width: "100%", fontSize: 10, borderCollapse: "collapse", fontFamily: "'JetBrains Mono', monospace" }}>
                      <thead>
                        <tr>
                          {["X", "Y", "Z"].map(h => (
                            <th key={h} style={{ padding: "6px 8px", background: COLORS.surface, textAlign: "left", borderBottom: `1px solid ${COLORS.panelBorder}`, color: COLORS.accent }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {rawRows.slice(0, 5).map((row, i) => (
                          <tr key={i}>
                            <td style={{ padding: "4px 8px", borderBottom: `1px solid ${COLORS.panelBorder}11` }}>{columnMapping.x ? row[columnMapping.x] : "—"}</td>
                            <td style={{ padding: "4px 8px", borderBottom: `1px solid ${COLORS.panelBorder}11` }}>{columnMapping.y ? row[columnMapping.y] : "—"}</td>
                            <td style={{ padding: "4px 8px", borderBottom: `1px solid ${COLORS.panelBorder}11` }}>{columnMapping.z ? row[columnMapping.z] : "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <Button onClick={applyMapping} variant="success" style={{ width: "100%", justifyContent: "center" }}
                    disabled={!columnMapping.x || !columnMapping.y}>
                    <Icons.Play /> Apply & Visualize
                  </Button>
                </div>
              )}

              {/* Gridding Panel */}
              {activePanel === "gridding" && (
                <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                  {points.length > 0 && (
                    <div style={{
                      padding: "8px 12px", background: COLORS.surface, borderRadius: 8,
                      fontSize: 11, display: "flex", justifyContent: "space-between",
                    }}>
                      <span style={{ color: COLORS.textMuted }}>Points loaded</span>
                      <span style={{ color: COLORS.green, fontWeight: 600 }}>{points.length.toLocaleString()}</span>
                    </div>
                  )}

                  <div>
                    <label style={{ fontSize: 11, color: COLORS.textMuted, marginBottom: 4, display: "block", fontWeight: 600 }}>Algorithm</label>
                    <Select value={gridSettings.algorithm}
                      onChange={v => setGridSettings(p => ({ ...p, algorithm: v }))}
                      options={[
                        { value: "idw", label: "Inverse Distance Weighting" },
                        { value: "natural", label: "Natural Neighbor" },
                        { value: "mincurv", label: "Minimum Curvature" },
                      ]} style={{ width: "100%" }} />
                  </div>

                  {gridSettings.algorithm === "idw" && (
                    <Slider label="Power" value={gridSettings.power} onChange={v => setGridSettings(p => ({ ...p, power: v }))} min={1} max={6} step={0.5} />
                  )}

                  <Slider label="Resolution" value={gridSettings.resolution} onChange={v => setGridSettings(p => ({ ...p, resolution: v }))} min={10} max={200} step={5} />
                  <Slider label="Padding %" value={gridSettings.padding} onChange={v => setGridSettings(p => ({ ...p, padding: v }))} min={0} max={25} step={1} />

                  <div style={{ borderTop: `1px solid ${COLORS.panelBorder}`, paddingTop: 12 }}>
                    <label style={{ fontSize: 11, color: COLORS.textMuted, marginBottom: 4, display: "block", fontWeight: 600 }}>Contour Interval</label>
                    <input type="number" value={gridSettings.contourInterval}
                      onChange={e => setGridSettings(p => ({ ...p, contourInterval: +e.target.value }))} />
                  </div>

                  <div>
                    <label style={{ fontSize: 11, color: COLORS.textMuted, marginBottom: 4, display: "block", fontWeight: 600 }}>Color Ramp</label>
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      {Object.keys(COLOR_RAMPS).map(name => (
                        <div key={name} onClick={() => setGridSettings(p => ({ ...p, colorRamp: name }))}
                          style={{
                            display: "flex", alignItems: "center", gap: 8, padding: "6px 8px",
                            borderRadius: 6, cursor: "pointer",
                            background: gridSettings.colorRamp === name ? COLORS.accent + "22" : "transparent",
                            border: gridSettings.colorRamp === name ? `1px solid ${COLORS.accent}44` : "1px solid transparent",
                          }}>
                          <div style={{
                            width: 120, height: 14, borderRadius: 3,
                            background: `linear-gradient(90deg, ${COLOR_RAMPS[name].join(",")})`,
                          }} />
                          <span style={{ fontSize: 11, color: gridSettings.colorRamp === name ? COLORS.accent : COLORS.textMuted, textTransform: "capitalize" }}>{name}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <Button onClick={runGridding} variant="primary" disabled={points.length === 0 || gridding}
                    style={{ width: "100%", justifyContent: "center", padding: "10px 14px" }}>
                    {gridding ? "Computing..." : <><Icons.Play /> Generate Grid & Contours</>}
                  </Button>

                  {gridStats && (
                    <div style={{
                      padding: 12, background: COLORS.surface, borderRadius: 8,
                      fontSize: 11, display: "flex", flexDirection: "column", gap: 4,
                      fontFamily: "'JetBrains Mono', monospace",
                    }}>
                      <div style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, color: COLORS.textMuted, marginBottom: 4 }}>Grid Statistics</div>
                      <div style={{ display: "flex", justifyContent: "space-between" }}>
                        <span style={{ color: COLORS.textMuted }}>Dimensions</span>
                        <span>{gridStats.nx} × {gridStats.ny}</span>
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between" }}>
                        <span style={{ color: COLORS.textMuted }}>Cells</span>
                        <span>{gridStats.cells.toLocaleString()}</span>
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between" }}>
                        <span style={{ color: COLORS.textMuted }}>Z Range</span>
                        <span style={{ color: COLORS.blueLight }}>{gridStats.min.toFixed(2)}</span>
                        <span style={{ color: COLORS.textDim }}>→</span>
                        <span style={{ color: COLORS.accent }}>{gridStats.max.toFixed(2)}</span>
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between" }}>
                        <span style={{ color: COLORS.textMuted }}>Mean</span>
                        <span style={{ color: COLORS.green }}>{gridStats.mean.toFixed(2)}</span>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Layers Panel */}
              {activePanel === "layers" && (
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  {layers.length === 0 && (
                    <div style={{ textAlign: "center", color: COLORS.textDim, fontSize: 12, padding: 24 }}>
                      No layers yet. Import data to begin.
                    </div>
                  )}
                  {layers.map(layer => (
                    <div key={layer.id} style={{
                      display: "flex", alignItems: "center", gap: 8, padding: "8px 10px",
                      background: COLORS.surface, borderRadius: 8,
                      border: `1px solid ${COLORS.panelBorder}`,
                    }}>
                      <button onClick={() => toggleLayer(layer.id)} style={{
                        background: "none", border: "none", color: layer.visible ? COLORS.green : COLORS.textDim,
                        cursor: "pointer", display: "flex", alignItems: "center",
                      }}>
                        {layer.visible ? <Icons.Eye /> : <Icons.EyeOff />}
                      </button>
                      <div style={{
                        width: 12, height: 12, borderRadius: 3,
                        background: layer.type === "points" ? COLORS.accent :
                          layer.type === "raster" ? `linear-gradient(135deg, ${COLORS.blueLight}, ${COLORS.green})` :
                          COLORS.green,
                      }} />
                      <span style={{ flex: 1, fontSize: 12, fontWeight: 500 }}>{layer.name}</span>
                      <span style={{ fontSize: 9, color: COLORS.textDim, textTransform: "uppercase" }}>{layer.type}</span>
                      <button onClick={() => removeLayer(layer.id)} style={{
                        background: "none", border: "none", color: COLORS.textDim,
                        cursor: "pointer", display: "flex", alignItems: "center",
                      }}>
                        <Icons.Trash />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Style Panel */}
              {activePanel === "style" && (
                <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                  <div>
                    <label style={{ fontSize: 11, color: COLORS.textMuted, marginBottom: 4, display: "block", fontWeight: 600 }}>Display Options</label>
                    {[
                      { key: "showRaster", label: "Show Raster" },
                      { key: "showContours", label: "Show Contours" },
                    ].map(opt => (
                      <label key={opt.key} style={{
                        display: "flex", alignItems: "center", gap: 8, padding: "6px 0",
                        cursor: "pointer", fontSize: 12,
                      }}>
                        <input type="checkbox" checked={gridSettings[opt.key]}
                          onChange={() => setGridSettings(p => ({ ...p, [opt.key]: !p[opt.key] }))}
                          style={{ accentColor: COLORS.accent }} />
                        {opt.label}
                      </label>
                    ))}
                  </div>
                  {layers.filter(l => l.type === "points").map(layer => (
                    <div key={layer.id}>
                      <label style={{ fontSize: 11, color: COLORS.textMuted, marginBottom: 4, display: "block", fontWeight: 600 }}>Point Size</label>
                      <Slider value={layer.size || 5} onChange={v => setLayers(prev => prev.map(l => l.id === layer.id ? { ...l, size: v } : l))} min={1} max={15} />
                    </div>
                  ))}
                  {layers.filter(l => l.type === "raster").map(layer => (
                    <div key={layer.id}>
                      <label style={{ fontSize: 11, color: COLORS.textMuted, marginBottom: 4, display: "block", fontWeight: 600 }}>Raster Opacity</label>
                      <Slider value={layer.opacity} onChange={v => setLayers(prev => prev.map(l => l.id === layer.id ? { ...l, opacity: v } : l))} min={0} max={100} label="%" />
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Map Canvas */}
        <div ref={containerRef} style={{ flex: 1, position: "relative", overflow: "hidden" }}
          onDrop={handleDrop} onDragOver={e => e.preventDefault()}>
          <canvas ref={canvasRef}
            onMouseDown={handleMouseDown} onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp} onMouseLeave={handleMouseUp}
            onWheel={handleWheel}
            style={{ width: "100%", height: "100%", cursor: dragRef.current.dragging ? "grabbing" : "crosshair" }}
          />

          {/* Map toolbar overlay - top right */}
          <div style={{
            position: "absolute", top: 12, right: 12, display: "flex", flexDirection: "column", gap: 4, zIndex: 10,
          }}>
            <button onClick={() => setViewState(p => ({ ...p, scale: p.scale * 1.3 }))} style={{
              width: 32, height: 32, borderRadius: 6, border: `1px solid ${COLORS.panelBorder}`,
              background: COLORS.panel + "dd", color: COLORS.text, cursor: "pointer", backdropFilter: "blur(8px)",
              display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16,
            }}>+</button>
            <button onClick={() => setViewState(p => ({ ...p, scale: p.scale * 0.7 }))} style={{
              width: 32, height: 32, borderRadius: 6, border: `1px solid ${COLORS.panelBorder}`,
              background: COLORS.panel + "dd", color: COLORS.text, cursor: "pointer", backdropFilter: "blur(8px)",
              display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16,
            }}>−</button>
            <button onClick={fitView} style={{
              width: 32, height: 32, borderRadius: 6, border: `1px solid ${COLORS.panelBorder}`,
              background: COLORS.panel + "dd", color: COLORS.text, cursor: "pointer", backdropFilter: "blur(8px)",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}><Icons.Crosshair /></button>
            <div style={{ height: 4 }} />
            <button onClick={() => setShowCompass(p => !p)} style={{
              width: 32, height: 32, borderRadius: 6, border: `1px solid ${showCompass ? COLORS.accent + "55" : COLORS.panelBorder}`,
              background: showCompass ? COLORS.accent + "18" : COLORS.panel + "dd", 
              color: showCompass ? COLORS.accent : COLORS.textMuted, cursor: "pointer", backdropFilter: "blur(8px)",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}><Icons.Compass /></button>
          </div>

          {/* Basemap Picker - bottom left */}
          <div style={{ position: "absolute", bottom: 38, left: 12, zIndex: 10 }}>
            {/* Collapsed toggle */}
            <button onClick={() => setShowBaseMapPicker(p => !p)} style={{
              display: "flex", alignItems: "center", gap: 6, padding: "6px 12px 6px 8px",
              borderRadius: showBaseMapPicker ? "8px 8px 0 0" : 8, 
              border: `1px solid ${COLORS.panelBorder}`,
              borderBottom: showBaseMapPicker ? "none" : `1px solid ${COLORS.panelBorder}`,
              background: COLORS.panel + "ee", color: COLORS.text, cursor: "pointer",
              fontSize: 11, fontWeight: 500, backdropFilter: "blur(8px)",
              transition: "all 0.15s",
            }}>
              <Icons.Globe />
              <span style={{ textTransform: "capitalize" }}>{baseMap}</span>
              <span style={{ transform: showBaseMapPicker ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.2s", display: "flex" }}>
                <Icons.ChevUp />
              </span>
            </button>

            {/* Expanded picker panel */}
            {showBaseMapPicker && (
              <div style={{
                background: COLORS.panel + "f5", border: `1px solid ${COLORS.panelBorder}`,
                borderTop: "none", borderRadius: "0 8px 8px 8px", padding: 10,
                backdropFilter: "blur(12px)", minWidth: 280,
              }}>
                {/* Basemap grid */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 6, marginBottom: 10 }}>
                  {[
                    { id: "dark", label: "Dark", colors: ["#060b18", "#0d1528", "#1a2340"] },
                    { id: "light", label: "Light", colors: ["#f0f2f5", "#d8dce3", "#bcc2cc"] },
                    { id: "aerial", label: "Aerial", colors: ["#1a3820", "#2a5230", "#1a3a1a"] },
                    { id: "topo", label: "Topo", colors: ["#f5f0e8", "#d4cfc4", "#8b7355"] },
                    { id: "blueprint", label: "Blueprint", colors: ["#0a1628", "#132244", "#2040a0"] },
                  ].map(bm => (
                    <button key={bm.id} onClick={() => { setBaseMap(bm.id); }}
                      style={{
                        display: "flex", flexDirection: "column", alignItems: "center", gap: 4,
                        cursor: "pointer", border: `2px solid ${baseMap === bm.id ? COLORS.accent : "transparent"}`,
                        borderRadius: 8, padding: 3, background: "transparent",
                        transition: "all 0.15s",
                      }}>
                      <div style={{
                        width: 44, height: 32, borderRadius: 4, overflow: "hidden",
                        position: "relative",
                        background: `linear-gradient(135deg, ${bm.colors[0]}, ${bm.colors[1]}, ${bm.colors[2]})`,
                        boxShadow: baseMap === bm.id ? `0 0 8px ${COLORS.accent}44` : "none",
                      }}>
                        {/* Mini grid pattern */}
                        <svg width="44" height="32" style={{ position: "absolute", top: 0, left: 0, opacity: 0.3 }}>
                          <line x1="11" y1="0" x2="11" y2="32" stroke={bm.id === "dark" || bm.id === "blueprint" ? "#fff" : "#000"} strokeWidth="0.5" opacity="0.2"/>
                          <line x1="22" y1="0" x2="22" y2="32" stroke={bm.id === "dark" || bm.id === "blueprint" ? "#fff" : "#000"} strokeWidth="0.5" opacity="0.2"/>
                          <line x1="33" y1="0" x2="33" y2="32" stroke={bm.id === "dark" || bm.id === "blueprint" ? "#fff" : "#000"} strokeWidth="0.5" opacity="0.2"/>
                          <line x1="0" y1="10" x2="44" y2="10" stroke={bm.id === "dark" || bm.id === "blueprint" ? "#fff" : "#000"} strokeWidth="0.5" opacity="0.2"/>
                          <line x1="0" y1="21" x2="44" y2="21" stroke={bm.id === "dark" || bm.id === "blueprint" ? "#fff" : "#000"} strokeWidth="0.5" opacity="0.2"/>
                        </svg>
                        {bm.id === "aerial" && (
                          <svg width="44" height="32" style={{ position: "absolute", top: 0, left: 0, opacity: 0.3 }}>
                            <circle cx="28" cy="14" r="6" fill="#2a6a2a" />
                            <circle cx="14" cy="22" r="4" fill="#3a7a3a" />
                          </svg>
                        )}
                        {bm.id === "topo" && (
                          <svg width="44" height="32" style={{ position: "absolute", top: 0, left: 0, opacity: 0.35 }}>
                            <ellipse cx="22" cy="16" rx="16" ry="10" fill="none" stroke="#8b7355" strokeWidth="0.8"/>
                            <ellipse cx="22" cy="16" rx="10" ry="6" fill="none" stroke="#8b7355" strokeWidth="0.8"/>
                            <ellipse cx="22" cy="16" rx="4" ry="2.5" fill="none" stroke="#8b7355" strokeWidth="0.8"/>
                          </svg>
                        )}
                      </div>
                      <span style={{ fontSize: 9, color: baseMap === bm.id ? COLORS.accent : COLORS.textMuted, fontWeight: baseMap === bm.id ? 600 : 400 }}>
                        {bm.label}
                      </span>
                    </button>
                  ))}
                </div>

                {/* Map overlay toggles */}
                <div style={{ borderTop: `1px solid ${COLORS.panelBorder}`, paddingTop: 8, display: "flex", flexDirection: "column", gap: 2 }}>
                  <span style={{ fontSize: 9, color: COLORS.textDim, textTransform: "uppercase", letterSpacing: 1, marginBottom: 2, fontWeight: 600 }}>Overlays</span>
                  {[
                    { key: "showGridLines", label: "Grid Lines", state: showGridLines, set: setShowGridLines },
                    { key: "showCoordLabels", label: "Coordinate Labels", state: showCoordLabels, set: setShowCoordLabels },
                    { key: "showCompass", label: "Compass / North Arrow", state: showCompass, set: setShowCompass },
                  ].map(toggle => (
                    <label key={toggle.key} style={{
                      display: "flex", alignItems: "center", gap: 8, padding: "4px 2px",
                      cursor: "pointer", fontSize: 11, color: COLORS.text,
                    }}>
                      <div onClick={() => toggle.set(p => !p)} style={{
                        width: 28, height: 16, borderRadius: 8, position: "relative",
                        background: toggle.state ? COLORS.accent : COLORS.surface,
                        border: `1px solid ${toggle.state ? COLORS.accent : COLORS.panelBorder}`,
                        transition: "all 0.15s", cursor: "pointer",
                      }}>
                        <div style={{
                          width: 12, height: 12, borderRadius: 6, background: "#fff",
                          position: "absolute", top: 1, left: toggle.state ? 14 : 1,
                          transition: "left 0.15s", boxShadow: "0 1px 2px rgba(0,0,0,0.3)",
                        }} />
                      </div>
                      <span>{toggle.label}</span>
                    </label>
                  ))}
                </div>

                {/* Scale indicator */}
                <div style={{ borderTop: `1px solid ${COLORS.panelBorder}`, paddingTop: 8, marginTop: 6 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={{
                      width: 60, height: 4, background: COLORS.accent, borderRadius: 2,
                      position: "relative",
                    }}>
                      <div style={{ position: "absolute", left: 0, top: -2, bottom: -2, width: 2, background: COLORS.accent }} />
                      <div style={{ position: "absolute", right: 0, top: -2, bottom: -2, width: 2, background: COLORS.accent }} />
                    </div>
                    <span style={{ fontSize: 9, color: COLORS.textMuted, fontFamily: "'JetBrains Mono', monospace" }}>
                      {(60 / viewState.scale).toFixed(viewState.scale > 1 ? 1 : 0)} units
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Status Bar */}
          <div style={{
            position: "absolute", bottom: 0, left: 0, right: 0, height: 28,
            background: COLORS.panel + "ee", borderTop: `1px solid ${COLORS.panelBorder}`,
            display: "flex", alignItems: "center", padding: "0 12px", gap: 16,
            fontSize: 10, fontFamily: "'JetBrains Mono', monospace", color: COLORS.textMuted,
          }}>
            <span>Points: <span style={{ color: COLORS.accent }}>{points.length}</span></span>
            <span>Layers: <span style={{ color: COLORS.blueLight }}>{layers.length}</span></span>
            <span>Scale: <span style={{ color: COLORS.green }}>{viewState.scale.toFixed(3)}</span></span>
            {gridStats && <span>Grid: <span style={{ color: COLORS.accent }}>{gridStats.nx}×{gridStats.ny}</span></span>}
            <div style={{ flex: 1 }} />
            <span>CRS: WGS84 / EPSG:4326</span>
          </div>
        </div>
      </div>

      {/* Data Table Drawer */}
      {showTable && points.length > 0 && (
        <div style={{
          height: 200, background: COLORS.panel, borderTop: `1px solid ${COLORS.panelBorder}`,
          overflow: "auto", flexShrink: 0,
        }}>
          <table style={{
            width: "100%", fontSize: 11, borderCollapse: "collapse",
            fontFamily: "'JetBrains Mono', monospace",
          }}>
            <thead>
              <tr>
                <th style={{ padding: "6px 12px", background: COLORS.surface, position: "sticky", top: 0, textAlign: "left", borderBottom: `1px solid ${COLORS.panelBorder}`, color: COLORS.accent, fontWeight: 600 }}>#</th>
                <th style={{ padding: "6px 12px", background: COLORS.surface, position: "sticky", top: 0, textAlign: "right", borderBottom: `1px solid ${COLORS.panelBorder}`, color: COLORS.blueLight }}>X</th>
                <th style={{ padding: "6px 12px", background: COLORS.surface, position: "sticky", top: 0, textAlign: "right", borderBottom: `1px solid ${COLORS.panelBorder}`, color: COLORS.green }}>Y</th>
                <th style={{ padding: "6px 12px", background: COLORS.surface, position: "sticky", top: 0, textAlign: "right", borderBottom: `1px solid ${COLORS.panelBorder}`, color: COLORS.accent }}>Z</th>
              </tr>
            </thead>
            <tbody>
              {points.slice(0, 100).map((p, i) => (
                <tr key={i} style={{ borderBottom: `1px solid ${COLORS.panelBorder}11` }}>
                  <td style={{ padding: "4px 12px", color: COLORS.textDim }}>{i + 1}</td>
                  <td style={{ padding: "4px 12px", textAlign: "right" }}>{p.x}</td>
                  <td style={{ padding: "4px 12px", textAlign: "right" }}>{p.y}</td>
                  <td style={{ padding: "4px 12px", textAlign: "right" }}>{p.z}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
