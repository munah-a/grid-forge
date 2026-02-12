import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import {
  COLOR_RAMPS, parseCSV, parseGeoJSON, autoDetectColumns,
  parseShapefile, parseGPX, parseLAS, parseExcel, parseASCIIGrid, parseSurferGrid,
  contoursToDXF, clipContoursToBoundary,
  idwInterpolation, naturalNeighborInterpolation, minimumCurvature,
  krigingOrdinary, krigingUniversal, krigingSimple,
  rbfInterpolation, tinInterpolation, nearestNeighborInterp,
  movingAverage, polynomialRegression, modifiedShepard, dataMetrics,
  generateContours, generateFilledContours, smoothContours, generateContourLevels,
  computeHillshade, computeGridStats, getColorFromRamp, getColorComponents,
  buildColorLUT,
  gridMath, resampleGrid,
  pointsToCSV, pointsToGeoJSON, contoursToGeoJSON, gridToASCII, breaklinesToCSV, breaklinesToGeoJSON,
  gridPointsToCSV, gridPointsToPNEZD, pointsToPNEZD, tinToLandXML, gridToLandXML,
  serializeProject, deserializeProject,
  measureDistance, measurePolylineLength, measurePolygonArea, measureBearing, sampleGridZ,
  project3D, generateSampleData,
  pointInPolygon, densifyBreakline, densifyProximityBreakline, densifyWallBreakline,
  buildSpatialIndex, applyBoundaryMask,
  computeConvexHull, computeConcaveHull, delaunayTriangulate,
} from "./engine.js";
import GriddingWorker from "./gridding.worker.js?worker";
import { CRS_REGISTRY, fetchCRSDefinition, transformPoints, transformCoord, isGeographicCRS, detectCRSFromPrj, detectCRSFromGeoJSON } from "./crs.js";
import { PAGE_SIZES, SCALES, GRID_STYLES, GRID_WEIGHTS, HATCH_PATTERNS, defaultPlotSettings, computePlotLayout, createPlotCanvas, exportPlotPNG, printPlot, renderPlot } from "./plotEngine.js";
import { buildMesh, exportMesh, findTriangleAt, findEdgeAt, findVertexAt, swapEdge, insertPoint, deletePoint, deleteTriangle, flattenTriangle, modifyVertexZ, lockTriangle, addBreakline, undoEdit, redoEdit, meshStats, getEdges, getTrianglesForRender, isConstrainedEdge, getSwapPreview, edgeKey } from "./tinEditor.js";
import { saveAllSettings, loadAllSettings, saveAutoSave, loadAutoSave, clearAutoSave, addRecentFile, getRecentFiles, saveGriddingPreset, getGriddingPresets, deleteGriddingPreset, exportSettingsJSON, importSettingsJSON } from "./storage.js";

const APP_VERSION = "1.0.0-rc.9";

// ─── Theme Colors ─────────────────────────────────────────────────────────────
const C = {
  bg: "#0a0f1e", panel: "#0f1629", panelBorder: "#1a2340", surface: "#141c33",
  surfaceHover: "#1a2545", text: "#e2e8f0", textMuted: "#8494a7", textDim: "#5a6d81",
  accent: "#f97316", accentDim: "#c2410c", blue: "#1e40af", blueLight: "#3b82f6",
  green: "#22c55e", greenDim: "#166534", danger: "#ef4444", white: "#ffffff",
};

const ALGORITHMS = [
  { value: "idw", label: "Inverse Distance Weighting (IDW)" },
  { value: "natural", label: "Natural Neighbor" },
  { value: "mincurv", label: "Minimum Curvature" },
  { value: "kriging_ord", label: "Kriging (Ordinary)" },
  { value: "kriging_uni", label: "Kriging (Universal)" },
  { value: "kriging_sim", label: "Kriging (Simple)" },
  { value: "rbf", label: "Radial Basis Functions (RBF)" },
  { value: "tin", label: "TIN Linear Interpolation" },
  { value: "nearest", label: "Nearest Neighbor" },
  { value: "moving_avg", label: "Moving Average" },
  { value: "poly_reg", label: "Polynomial Regression" },
  { value: "mod_shepard", label: "Modified Shepard's" },
  { value: "data_metrics", label: "Data Metrics (Binning)" },
];

const VARIOGRAM_MODELS = [
  { value: "spherical", label: "Spherical" }, { value: "exponential", label: "Exponential" },
  { value: "gaussian", label: "Gaussian" }, { value: "linear", label: "Linear" },
];
const RBF_BASIS = [
  { value: "multiquadric", label: "Multiquadric" }, { value: "inverse_multiquadric", label: "Inverse Multiquadric" },
  { value: "thin_plate_spline", label: "Thin Plate Spline" }, { value: "gaussian", label: "Gaussian" },
  { value: "cubic", label: "Cubic" }, { value: "quintic", label: "Quintic" },
];
const METRICS = ["mean", "median", "count", "min", "max", "range", "stddev", "sum"].map(m => ({ value: m, label: m.charAt(0).toUpperCase() + m.slice(1) }));

const STYLE_PRESETS = [
  { name: "Topographic", ramp: "terrain", showContours: true, showRaster: true, showFilled: false, showHillshade: true },
  { name: "Geological", ramp: "earth", showContours: true, showRaster: true, showFilled: false, showHillshade: true },
  { name: "Thermal", ramp: "hot", showContours: true, showRaster: true, showFilled: false, showHillshade: false },
  { name: "Ocean Floor", ramp: "bathymetry", showContours: true, showRaster: true, showFilled: false, showHillshade: true },
  { name: "Scientific", ramp: "viridis", showContours: true, showRaster: true, showFilled: false, showHillshade: false },
  { name: "Spectral", ramp: "spectral", showContours: false, showRaster: true, showFilled: false, showHillshade: false },
  { name: "Cool-Warm", ramp: "coolwarm", showContours: true, showRaster: true, showFilled: true, showHillshade: false },
  { name: "Grayscale", ramp: "grayscale", showContours: true, showRaster: true, showFilled: false, showHillshade: true },
  { name: "Plasma", ramp: "plasma", showContours: false, showRaster: true, showFilled: false, showHillshade: false },
  { name: "Rainbow", ramp: "rainbow", showContours: true, showRaster: true, showFilled: false, showHillshade: false },
];

// ─── Icons (SVG components) ──────────────────────────────────────────────────
const I = {
  Upload: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" /></svg>,
  Grid: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M3 9h18M3 15h18M9 3v18M15 3v18" /></svg>,
  Layers: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="12 2 2 7 12 12 22 7 12 2" /><polyline points="2 17 12 22 22 17" /><polyline points="2 12 12 17 22 12" /></svg>,
  Eye: () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>,
  EyeOff: () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" /><line x1="1" y1="1" x2="23" y2="23" /></svg>,
  Settings: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></svg>,
  Map: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6" /><line x1="8" y1="2" x2="8" y2="18" /><line x1="16" y1="6" x2="16" y2="22" /></svg>,
  Trash: () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>,
  Play: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3" /></svg>,
  Plus: () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>,
  Table: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2" /><line x1="3" y1="9" x2="21" y2="9" /><line x1="9" y1="3" x2="9" y2="21" /></svg>,
  Crosshair: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><line x1="22" y1="12" x2="18" y2="12" /><line x1="6" y1="12" x2="2" y2="12" /><line x1="12" y1="6" x2="12" y2="2" /><line x1="12" y1="22" x2="12" y2="18" /></svg>,
  Download: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>,
  Globe: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><ellipse cx="12" cy="12" rx="4" ry="10" /><line x1="2" y1="12" x2="22" y2="12" /></svg>,
  Compass: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76" fill="currentColor" fillOpacity="0.3" /></svg>,
  Mountain: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M8 3l4 8 5-5 5 15H2z" /></svg>,
  Columns: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="18" rx="1" /><rect x="14" y="3" width="7" height="18" rx="1" /></svg>,
  Ruler: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21.5 6.5l-4-4L3 17l4 4 14.5-14.5z" /><path d="M14 7l1 1M10 11l1 1M6 15l1 1" /></svg>,
  Save: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" /><polyline points="17 21 17 13 7 13 7 21" /><polyline points="7 3 7 8 15 8" /></svg>,
  Box3D: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2L2 7l10 5 10-5-10-5z" /><path d="M2 17l10 5 10-5" /><path d="M2 12l10 5 10-5" /></svg>,
  Copy: () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>,
  ChevUp: () => <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="18 15 12 9 6 15" /></svg>,
  ChevDown: () => <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 12 15 18 9" /></svg>,
  Filter: () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" /></svg>,
  Boundary: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="3 6 9 3 21 6 21 18 9 21 3 18" strokeDasharray="3 2" /><line x1="9" y1="3" x2="9" y2="21" /></svg>,
  Bug: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>,
  Undo: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="1 4 1 10 7 10" /><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" /></svg>,
  Redo: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="23 4 23 10 17 10" /><path d="M20.49 15a9 9 0 1 1-2.13-9.36L23 10" /></svg>,
  HelpCircle: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>,
  Edit: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>,
  Printer: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 6 2 18 2 18 9" /><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" /><rect x="6" y="14" width="12" height="8" /></svg>,
  Triangle: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 3L2 21h20L12 3z" /><circle cx="12" cy="3" r="1.5" fill="currentColor" /><circle cx="2" cy="21" r="1.5" fill="currentColor" /><circle cx="22" cy="21" r="1.5" fill="currentColor" /></svg>,
};

// ─── Sub-components ──────────────────────────────────────────────────────────
function Tooltip({ children, text }) {
  return (
    <div style={{ position: "relative", display: "inline-flex" }} className="tt-wrap">
      {children}
      <div style={{ position: "absolute", bottom: "calc(100% + 6px)", left: "50%", transform: "translateX(-50%)", background: C.surface, color: C.text, fontSize: 11, padding: "4px 8px", borderRadius: 4, whiteSpace: "nowrap", pointerEvents: "none", opacity: 0, transition: "opacity 0.15s", border: `1px solid ${C.panelBorder}`, zIndex: 100 }} className="tt-text">{text}</div>
    </div>
  );
}
function Sel({ value, onChange, options, style }) {
  return (
    <select value={value} onChange={e => onChange(e.target.value)} style={{ background: C.surface, color: C.text, border: `1px solid ${C.panelBorder}`, borderRadius: 6, padding: "6px 10px", fontSize: 12, outline: "none", cursor: "pointer", appearance: "none", backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%2364748b' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E")`, backgroundRepeat: "no-repeat", backgroundPosition: "right 8px center", paddingRight: 28, ...style }}>
      {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}
function Sld({ value, onChange, min, max, step = 1, label, showValue = true }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      {label && <span style={{ fontSize: 11, color: C.textMuted, minWidth: 70 }}>{label}</span>}
      <input type="range" min={min} max={max} step={step} value={value} onChange={e => onChange(+e.target.value)} style={{ flex: 1, accentColor: C.accent, height: 4, cursor: "pointer" }} />
      {showValue && <span style={{ fontSize: 11, color: C.textMuted, minWidth: 30, textAlign: "right" }}>{value}</span>}
    </div>
  );
}
function Btn({ children, onClick, variant = "default", size = "md", style, disabled, title, ...rest }) {
  const base = { display: "inline-flex", alignItems: "center", gap: 6, cursor: disabled ? "not-allowed" : "pointer", border: "none", borderRadius: 6, fontWeight: 500, transition: "all 0.15s", opacity: disabled ? 0.5 : 1, fontFamily: "inherit" };
  const variants = { default: { background: C.surface, color: C.text, border: `1px solid ${C.panelBorder}` }, primary: { background: C.accent, color: "#fff" }, success: { background: C.green, color: "#fff" }, ghost: { background: "transparent", color: C.textMuted }, danger: { background: "transparent", color: C.danger, border: `1px solid ${C.danger}33` } };
  const sizes = { sm: { padding: "4px 10px", fontSize: 11 }, md: { padding: "7px 14px", fontSize: 12 }, lg: { padding: "10px 20px", fontSize: 13 } };
  return <button onClick={onClick} disabled={disabled} title={title} style={{ ...base, ...variants[variant], ...sizes[size], ...style }} {...rest}>{children}</button>;
}
const Label = ({ children }) => <label style={{ fontSize: 11, color: C.textMuted, marginBottom: 4, display: "block", fontWeight: 600 }}>{children}</label>;
const Section = ({ children, title }) => <div style={{ marginBottom: 12 }}>{title && <Label>{title}</Label>}{children}</div>;
const StatRow = ({ label, value, color }) => <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11 }}><span style={{ color: C.textMuted }}>{label}</span><span style={{ color: color || C.text }}>{value}</span></div>;

function CRSPicker({ value, onChange, style }) {
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [customCode, setCustomCode] = useState("");
  const [fetching, setFetching] = useState(false);
  const filtered = useMemo(() => {
    if (!search) return CRS_REGISTRY.slice(0, 30);
    const q = search.toLowerCase();
    return CRS_REGISTRY.filter(c => c.code.toLowerCase().includes(q) || c.name.toLowerCase().includes(q) || c.group.toLowerCase().includes(q)).slice(0, 30);
  }, [search]);
  const current = CRS_REGISTRY.find(c => c.code === value);
  const handleCustom = async () => {
    if (!customCode) return;
    const code = customCode.toUpperCase().startsWith("EPSG:") ? customCode.toUpperCase() : `EPSG:${customCode}`;
    setFetching(true);
    const ok = await fetchCRSDefinition(code);
    setFetching(false);
    if (ok) { onChange(code); setOpen(false); setCustomCode(""); }
  };
  return (
    <div style={{ position: "relative", ...style }}>
      <div onClick={() => setOpen(!open)} style={{ background: C.surface, border: `1px solid ${C.panelBorder}`, borderRadius: 6, padding: "6px 10px", fontSize: 12, cursor: "pointer", color: C.text, display: "flex", alignItems: "center", gap: 6 }}>
        <I.Globe />
        <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {current ? `${current.code} — ${current.name}` : value}
        </span>
        <I.ChevDown />
      </div>
      {open && <div style={{ position: "absolute", top: "100%", left: 0, right: 0, zIndex: 200, background: C.panel, border: `1px solid ${C.panelBorder}`, borderRadius: "0 0 8px 8px", boxShadow: "0 8px 32px rgba(0,0,0,0.5)", maxHeight: 320, display: "flex", flexDirection: "column" }}>
        <div style={{ padding: 6 }}>
          <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search CRS..." autoFocus style={{ width: "100%", background: C.surface, color: C.text, border: `1px solid ${C.panelBorder}`, borderRadius: 4, padding: "5px 8px", fontSize: 11, outline: "none", fontFamily: "'DM Sans',sans-serif" }} />
        </div>
        <div style={{ flex: 1, overflow: "auto", maxHeight: 200 }}>
          {filtered.map(c => (
            <div key={c.code} onClick={() => { onChange(c.code); setOpen(false); setSearch(""); }} style={{ padding: "5px 10px", fontSize: 11, cursor: "pointer", background: c.code === value ? C.accent + "22" : "transparent", color: c.code === value ? C.accent : C.text, display: "flex", justifyContent: "space-between", alignItems: "center" }}
              onMouseOver={e => e.currentTarget.style.background = C.surfaceHover} onMouseOut={e => e.currentTarget.style.background = c.code === value ? C.accent + "22" : "transparent"}>
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.code} — {c.name}</span>
              <span style={{ fontSize: 9, color: C.textDim, flexShrink: 0, marginLeft: 6 }}>{c.group}</span>
            </div>
          ))}
        </div>
        <div style={{ borderTop: `1px solid ${C.panelBorder}`, padding: 6 }}>
          <div style={{ fontSize: 10, color: C.textDim, marginBottom: 4 }}>Custom EPSG code:</div>
          <div style={{ display: "flex", gap: 4 }}>
            <input type="text" value={customCode} onChange={e => setCustomCode(e.target.value)} placeholder="e.g. 2193" onKeyDown={e => { if (e.key === "Enter") handleCustom(); }} style={{ flex: 1, background: C.surface, color: C.text, border: `1px solid ${C.panelBorder}`, borderRadius: 4, padding: "4px 8px", fontSize: 11, outline: "none", fontFamily: "'JetBrains Mono',monospace" }} />
            <button onClick={handleCustom} disabled={fetching} style={{ background: C.accent, color: "#fff", border: "none", borderRadius: 4, padding: "4px 10px", fontSize: 10, cursor: "pointer", fontWeight: 600 }}>{fetching ? "..." : "Fetch"}</button>
          </div>
        </div>
      </div>}
    </div>
  );
}

// ─── Map Tile Helpers ────────────────────────────────────────────────────────
function lon2tileX(lon, z) { return ((lon + 180) / 360) * (1 << z); }
function lat2tileY(lat, z) {
  const r = lat * Math.PI / 180;
  return (1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * (1 << z);
}
function tileX2lon(x, z) { return x / (1 << z) * 360 - 180; }
function tileY2lat(y, z) {
  const n = Math.PI - 2 * Math.PI * y / (1 << z);
  return 180 / Math.PI * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
}

// ─── Basemap Styles ──────────────────────────────────────────────────────────
const BASEMAP_STYLES = {
  none: { bg: "#0a0f1e", grid: "#0d1528", gridMajor: "#111d38", axis: "#1a2a4a", label: "#2a3a5aaa" },
  osm: { bg: "#aad3df", grid: "#00000008", gridMajor: "#00000015", axis: "#00000022", label: "#00000033" },
  satellite: { bg: "#0a1a0a", grid: "#ffffff08", gridMajor: "#ffffff15", axis: "#ffffff22", label: "#ffffff33" },
};

// ═════════════════════════════════════════════════════════════════════════════
// MAIN APPLICATION
// ═════════════════════════════════════════════════════════════════════════════
export default function GridForgeGIS() {
  // ── Data State ─────────────────────────────────────────────────────────────
  const [points, setPoints] = useState([]);
  const [allRows, setAllRows] = useState([]);
  const [headers, setHeaders] = useState([]);
  const [fileName, setFileName] = useState("");
  const [columnMapping, setColumnMapping] = useState({ x: "", y: "", z: "", pointNo: "", desc: "" });
  const [hiddenDescs, setHiddenDescs] = useState(new Set()); // descriptions to hide
  // ── Grid State ─────────────────────────────────────────────────────────────
  const [gridData, setGridData] = useState(null);
  const [contourData, setContourData] = useState(null);
  const [filledContourData, setFilledContourData] = useState(null);
  const [hillshadeData, setHillshadeData] = useState(null);
  const [gridStats, setGridStats] = useState(null);
  const [gridding, setGridding] = useState(false);
  const [griddingProgress, setGriddingProgress] = useState(0);
  const [griddingStage, setGriddingStage] = useState("");
  // ── Layers ─────────────────────────────────────────────────────────────────
  const [layers, setLayers] = useState([]);
  const [expandedLayers, setExpandedLayers] = useState(new Set());
  const [contouring, setContouring] = useState(false);
  const [contouringProgress, setContouringProgress] = useState(0);
  const [contouringStage, setContouringStage] = useState("");
  // ── UI State ───────────────────────────────────────────────────────────────
  const [activePanel, setActivePanel] = useState("import");
  const [viewState, setViewState] = useState({ x: 0, y: 0, scale: 1 });
  // cursorCoords uses refs to avoid re-renders on every mouse move
  const [showTable, setShowTable] = useState(false);
  const [baseMap, setBaseMap] = useState("none");
  const [showBaseMapPicker, setShowBaseMapPicker] = useState(false);
  const [showCompass, setShowCompass] = useState(true);
  const [showGridLines, setShowGridLines] = useState(true);
  const [showCoordLabels, setShowCoordLabels] = useState(true);
  const [tableScroll, setTableScroll] = useState(0);
  const [tableSortCol, setTableSortCol] = useState(null);
  const [tableSortAsc, setTableSortAsc] = useState(true);
  // ── CRS State ───────────────────────────────────────────────────────────
  const [projectCRS, setProjectCRS] = useState("EPSG:32643"); // Default: UTM Zone 43N
  const [fileCRS, setFileCRS] = useState("LOCAL");
  const [showCRSPrompt, setShowCRSPrompt] = useState(false);
  const [pendingFileAfterCRS, setPendingFileAfterCRS] = useState(false);
  // ── Bug Report State ──────────────────────────────────────────────────────
  const [showBugReport, setShowBugReport] = useState(false);
  const [bugTitle, setBugTitle] = useState("");
  const [bugDesc, setBugDesc] = useState("");
  // ── Grid Settings ──────────────────────────────────────────────────────────
  const [gs, setGs] = useState({
    algorithm: "idw", power: 2, resolution: 50, padding: 5,
    // Hillshade generation params (computation, not display)
    hillAzimuth: 315, hillAltitude: 45, hillZFactor: 1,
    // Algorithm-specific
    searchRadius: 0, maxNeighbors: 16, tension: 0.25, maxIterations: 200,
    convergence: 0.001, relaxation: 1.0, variogramModel: "spherical",
    sill: 0, range: 0, nugget: 0, driftOrder: 1, knownMean: 0,
    rbfBasis: "multiquadric", rbfShape: 1, rbfSmoothing: 0,
    polyOrder: 2, shepardNeighbors: 12, dataMetric: "mean",
    minPoints: 1, weighted: true,
    useGPU: false,
    autoBoundaryConcavity: 0,
    targetCellSize: 0,
  });
  const updateGs = (k, v) => setGs(p => ({ ...p, [k]: v }));
  const updateLayerProp = (id, key, value) => setLayers(prev => prev.map(l => l.id === id ? { ...l, [key]: value } : l));
  // ── Phase 3 State ──────────────────────────────────────────────────────────
  const [plotSettings, setPlotSettings] = useState(defaultPlotSettings());
  const updatePs = (k, v) => setPlotSettings(p => ({ ...p, [k]: v }));
  const [showPlotPreview, setShowPlotPreview] = useState(false);
  const plotCanvasRef = useRef(null);
  const [viewMode, setViewMode] = useState("2d");
  const [view3D, setView3D] = useState({ angleX: 30, angleZ: 45, exaggeration: 2 });
  const [compMode, setCompMode] = useState(null); // null or { algos: [], results: [] }
  const [compGrid, setCompGrid] = useState(null); // comparison grid for grid math
  const [measureMode, setMeasureMode] = useState(null);
  const [measurePts, setMeasurePts] = useState([]);
  const [boundaries, setBoundaries] = useState([]);
  const [breaklines, setBreaklines] = useState([]);
  const [drawMode, setDrawMode] = useState(null); // null | "boundary_outer" | "boundary_inner" | "breakline_standard" | "breakline_proximity" | "breakline_wall"
  const [drawPts, setDrawPts] = useState([]);
  const [pendingZ, setPendingZ] = useState(null); // { x, y, wallMode?, zTop? } awaiting Z input
  const [zInputValue, setZInputValue] = useState("");
  const [zInputValue2, setZInputValue2] = useState(""); // wall breakline bottom Z
  const [editNodesMode, setEditNodesMode] = useState(false);
  const [snapEnabled, setSnapEnabled] = useState(true);
  const [isSnapped, setIsSnapped] = useState(false);
  const [selectedPts, setSelectedPts] = useState(new Set());
  const [selectionBox, setSelectionBox] = useState(null);
  const [editingLayer, setEditingLayer] = useState(null);
  const [editingCell, setEditingCell] = useState(null); // { row, col } or null
  const [tinMesh, setTinMesh] = useState(null);
  const [tinEditMode, setTinEditMode] = useState(null); // null | "select" | "swap" | "insert" | "delete_pt" | "delete_tri" | "flatten" | "modify_z" | "breakline" | "lock"
  const [tinSelection, setTinSelection] = useState(null); // { type: "triangle"|"edge"|"vertex", index, edgeVerts?, preview? }
  const [showTinMesh, setShowTinMesh] = useState(true);
  const [tinZInput, setTinZInput] = useState("");
  const [exporting, setExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const [exportStage, setExportStage] = useState("");
  // ── Persistence & Settings State ──────────────────────────────────────────
  const [recentFiles, setRecentFiles] = useState([]);
  const [griddingPresets, setGriddingPresets] = useState([]);
  const [presetName, setPresetName] = useState("");
  const [dragOverlay, setDragOverlay] = useState(false);
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [lassoPts, setLassoPts] = useState([]); // PNT-05: lasso polygon vertices [{x,y}]

  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const fileInputRef = useRef(null);
  const projectInputRef = useRef(null);
  const boundaryFileRef = useRef(null);
  const proxFileRef = useRef(null);
  const settingsFileRef = useRef(null);
  const dragRef = useRef({ dragging: false, startX: 0, startY: 0, startViewX: 0, startViewY: 0 });
  const lastMouseRef = useRef({ x: 0, y: 0 });
  const selRef = useRef({ selecting: false, sx: 0, sy: 0 });
  const nodeEditRef = useRef({ dragging: false, type: null, id: null, vertexIdx: -1 }); // type: 'boundary'|'breakline'
  const cursorCoordsRef = useRef(null);
  const coordsContainerRef = useRef(null);
  const coordsXRef = useRef(null);
  const coordsYRef = useRef(null);
  const coordsZRef = useRef(null);
  const coordsSecRef = useRef(null);
  const offscreenRef = useRef(null);
  const rafIdRef = useRef(null);
  const tileCacheRef = useRef(new Map());
  const tileLoadTimerRef = useRef(null);
  const workerRef = useRef(null);
  const pointSpriteCache = useRef(new Map());
  const snapPointRef = useRef(null); // { x, y, z, screenX, screenY }
  const autoSaveTimerRef = useRef(null);
  const [tileGen, setTileGen] = useState(0);

  // ── Cleanup timers and workers on unmount ──────────────────────────────
  useEffect(() => () => {
    if (tileLoadTimerRef.current) clearTimeout(tileLoadTimerRef.current);
    if (workerRef.current) { workerRef.current.terminate(); workerRef.current = null; }
    if (autoSaveTimerRef.current) clearInterval(autoSaveTimerRef.current);
  }, []);

  // ── Settings Persistence — Load on mount ───────────────────────────────
  useEffect(() => {
    (async () => {
      try {
        const settings = await loadAllSettings();
        if (settings.baseMap) setBaseMap(settings.baseMap);
        if (settings.projectCRS) setProjectCRS(settings.projectCRS);
        if (settings.showGridLines !== undefined) setShowGridLines(settings.showGridLines);
        if (settings.showCoordLabels !== undefined) setShowCoordLabels(settings.showCoordLabels);
        if (settings.showCompass !== undefined) setShowCompass(settings.showCompass);
        // Load recent files
        const recent = await getRecentFiles();
        setRecentFiles(recent);
        // Load gridding presets
        const presets = await getGriddingPresets();
        setGriddingPresets(presets);
        // Check for auto-save crash recovery
        const autoSave = await loadAutoSave();
        if (autoSave && autoSave.state) {
          const elapsed = Date.now() - autoSave.timestamp;
          if (elapsed < 24 * 60 * 60 * 1000) { // within 24 hours
            const ago = elapsed < 60000 ? 'just now' : elapsed < 3600000 ? `${Math.round(elapsed / 60000)} min ago` : `${Math.round(elapsed / 3600000)} hr ago`;
            if (confirm(`Recovered auto-save from ${ago}. Restore?`)) {
              try {
                const state = autoSave.state;
                if (state.points) setPoints(state.points);
                if (state.gridData) setGridData(state.gridData);
                if (state.layers) setLayers(state.layers);
                if (state.boundaries) setBoundaries(state.boundaries);
                if (state.breaklines) setBreaklines(state.breaklines);
                if (state.gs) setGs(prev => ({ ...prev, ...state.gs }));
                if (state.projectCRS) setProjectCRS(state.projectCRS);
              } catch { /* ignore corrupt auto-save */ }
            }
          }
          await clearAutoSave();
        }
        setSettingsLoaded(true);
      } catch { setSettingsLoaded(true); }
    })();
  }, []);

  // ── Auto-save every 60 seconds ──────────────────────────────────────────
  useEffect(() => {
    if (!settingsLoaded) return;
    autoSaveTimerRef.current = setInterval(() => {
      if (points.length > 0 || gridData) {
        saveAutoSave({ points, gridData, layers, boundaries, breaklines, gs, projectCRS });
      }
    }, 60000);
    return () => { if (autoSaveTimerRef.current) clearInterval(autoSaveTimerRef.current); };
  }, [settingsLoaded, points, gridData, layers, boundaries, breaklines, gs, projectCRS]);

  // ── Persist settings when they change ──────────────────────────────────
  useEffect(() => {
    if (!settingsLoaded) return;
    saveAllSettings({ baseMap, projectCRS, showGridLines, showCoordLabels, showCompass });
  }, [settingsLoaded, baseMap, projectCRS, showGridLines, showCoordLabels, showCompass]);

  // ── Undo / Redo ──────────────────────────────────────────────────────────
  const MAX_HISTORY = 50;
  const historyRef = useRef([]);
  const futureRef = useRef([]);
  const [undoVersion, setUndoVersion] = useState(0);

  const getSnapshot = () => ({ points, breaklines, boundaries, drawPts, layers, gridData, contourData, filledContourData, hillshadeData, gridStats });
  const restoreSnapshot = (snap) => {
    setPoints(snap.points); setBreaklines(snap.breaklines); setBoundaries(snap.boundaries);
    setDrawPts(snap.drawPts); setLayers(snap.layers); setGridData(snap.gridData);
    setContourData(snap.contourData); setFilledContourData(snap.filledContourData);
    setHillshadeData(snap.hillshadeData); setGridStats(snap.gridStats);
  };
  const pushHistory = () => {
    historyRef.current = [...historyRef.current.slice(-(MAX_HISTORY - 1)), getSnapshot()];
    futureRef.current = [];
    setUndoVersion(v => v + 1);
  };
  const undo = () => {
    if (historyRef.current.length === 0) return;
    futureRef.current = [...futureRef.current, getSnapshot()];
    const snap = historyRef.current[historyRef.current.length - 1];
    historyRef.current = historyRef.current.slice(0, -1);
    restoreSnapshot(snap);
    setUndoVersion(v => v + 1);
  };
  const redo = () => {
    if (futureRef.current.length === 0) return;
    historyRef.current = [...historyRef.current, getSnapshot()];
    const snap = futureRef.current[futureRef.current.length - 1];
    futureRef.current = futureRef.current.slice(0, -1);
    restoreSnapshot(snap);
    setUndoVersion(v => v + 1);
  };
  const canUndo = undoVersion >= 0 && historyRef.current.length > 0;
  const canRedo = undoVersion >= 0 && futureRef.current.length > 0;

  // ── Computed ────────────────────────────────────────────────────────────────
  const bounds = useMemo(() => {
    if (points.length === 0) return null;
    let xMin = Infinity, xMax = -Infinity, yMin = Infinity, yMax = -Infinity, zMin = Infinity, zMax = -Infinity;
    for (const p of points) {
      if (p.x < xMin) xMin = p.x; if (p.x > xMax) xMax = p.x;
      if (p.y < yMin) yMin = p.y; if (p.y > yMax) yMax = p.y;
      if (p.z < zMin) zMin = p.z; if (p.z > zMax) zMax = p.z;
    }
    return { xMin, xMax, yMin, yMax, zMin, zMax };
  }, [points]);

  // Unique descriptions for filter UI
  const uniqueDescs = useMemo(() => {
    const descs = new Set();
    for (const p of points) if (p.desc) descs.add(String(p.desc));
    return [...descs].sort();
  }, [points]);

  // Filtered points (excludes hidden descriptions)
  const filteredPoints = useMemo(() => {
    if (hiddenDescs.size === 0) return points;
    return points.filter(p => !hiddenDescs.has(String(p.desc || "")));
  }, [points, hiddenDescs]);

  // Filtered bounds
  const filteredBounds = useMemo(() => {
    if (hiddenDescs.size === 0) return bounds;
    if (filteredPoints.length === 0) return null;
    let xMin = Infinity, xMax = -Infinity, yMin = Infinity, yMax = -Infinity, zMin = Infinity, zMax = -Infinity;
    for (const p of filteredPoints) {
      if (p.x < xMin) xMin = p.x; if (p.x > xMax) xMax = p.x;
      if (p.y < yMin) yMin = p.y; if (p.y > yMax) yMax = p.y;
      if (p.z < zMin) zMin = p.z; if (p.z > zMax) zMax = p.z;
    }
    return { xMin, xMax, yMin, yMax, zMin, zMax };
  }, [filteredPoints, hiddenDescs, bounds]);

  const sortedPoints = useMemo(() => {
    if (!tableSortCol) return points;
    const sorted = [...points];
    const isStr = tableSortCol === "pointNo" || tableSortCol === "desc";
    sorted.sort((a, b) => {
      if (isStr) { const cmp = String(a[tableSortCol] || "").localeCompare(String(b[tableSortCol] || "")); return tableSortAsc ? cmp : -cmp; }
      return tableSortAsc ? (a[tableSortCol] - b[tableSortCol]) : (b[tableSortCol] - a[tableSortCol]);
    });
    return sorted;
  }, [points, tableSortCol, tableSortAsc]);

  const isDark = baseMap === "none" || baseMap === "satellite";

  const isGeographic = useMemo(() => isGeographicCRS(projectCRS), [projectCRS]);

  // Pre-computed color LUT for fast per-point rendering (avoids hex parsing)
  const rasterLayer = useMemo(() => layers.find(l => l.type === "raster"), [layers]);
  const activeColorRamp = rasterLayer?.colorRamp || "viridis";
  const colorLUT = useMemo(() => buildColorLUT(activeColorRamp, 256), [activeColorRamp]);

  // Effective Z range for color mapping (auto from grid, or user-defined)
  const effectiveZRange = useMemo(() => {
    const rampMode = rasterLayer?.rampMode || "auto";
    if (rampMode === "manual") {
      const lo = Number(rasterLayer?.rampMin ?? 0), hi = Number(rasterLayer?.rampMax ?? 100);
      return { zMin: lo, zMax: hi, range: (hi - lo) || 1 };
    }
    if (gridData) return { zMin: gridData.zMin, zMax: gridData.zMax, range: (gridData.zMax - gridData.zMin) || 1 };
    if (bounds) return { zMin: bounds.zMin, zMax: bounds.zMax, range: (bounds.zMax - bounds.zMin) || 1 };
    return { zMin: 0, zMax: 1, range: 1 };
  }, [rasterLayer?.rampMode, rasterLayer?.rampMin, rasterLayer?.rampMax, gridData, bounds]);

  const gridPreview = useMemo(() => {
    if (!bounds) return null;
    const pad = gs.padding / 100;
    const padX = (bounds.xMax - bounds.xMin) * pad;
    const padY = (bounds.yMax - bounds.yMin) * pad;
    const nx = gs.resolution;
    const totalW = bounds.xMax - bounds.xMin + 2 * padX;
    const totalH = bounds.yMax - bounds.yMin + 2 * padY;
    const ny = Math.round(nx * (totalH / totalW)) || nx;
    const dx = totalW / (nx - 1);
    const dy = totalH / (ny - 1);
    return { nx, ny, cells: nx * ny, dx, dy };
  }, [bounds, gs.resolution, gs.padding]);

  // ── Callbacks ──────────────────────────────────────────────────────────────
  const fitView = useCallback(() => {
    if (!bounds || !containerRef.current) return;
    const { clientWidth: w, clientHeight: h } = containerRef.current;
    const dW = bounds.xMax - bounds.xMin || 1, dH = bounds.yMax - bounds.yMin || 1;
    const scale = Math.min(w / (dW * 1.2), h / (dH * 1.2));
    setViewState({ x: w / 2 - (bounds.xMin + dW / 2) * scale, y: h / 2 - (bounds.yMin + dH / 2) * scale, scale });
  }, [bounds]);

  useEffect(() => { if (points.length > 0) fitView(); }, [points.length]);

  const deleteSelectedPoints = useCallback(() => {
    if (selectedPts.size === 0) return;
    pushHistory();
    setPoints(prev => prev.filter((_, i) => !selectedPts.has(i)));
    setSelectedPts(new Set());
  }, [selectedPts]);

  // ── Keyboard shortcuts: Escape to cancel draw, S to toggle snap, Delete to remove selected ─────────
  useEffect(() => {
    const handler = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "z" && !e.shiftKey) { e.preventDefault(); undo(); return; }
      if ((e.ctrlKey || e.metaKey) && (e.key === "y" || (e.key === "z" && e.shiftKey))) { e.preventDefault(); redo(); return; }
      if ((e.ctrlKey || e.metaKey) && e.key === "Z") { e.preventDefault(); redo(); return; }
      if (e.key === "Escape") {
        if (lassoPts.length > 0) { setLassoPts([]); return; }
        if (showCRSPrompt) { setShowCRSPrompt(false); return; }
        if (showBugReport) { setBugTitle(""); setBugDesc(""); setShowBugReport(false); return; }
        if (editNodesMode) { setEditNodesMode(false); return; }
        if (drawMode) { setDrawMode(null); setDrawPts([]); setPendingZ(null); setZInputValue(""); setZInputValue2(""); snapPointRef.current = null; setIsSnapped(false); }
      }
      if (e.key === "s" || e.key === "S") {
        if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA" || e.target.tagName === "SELECT") return;
        setSnapEnabled(p => !p);
      }
      if (e.key === "Delete") {
        if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;
        if (editNodesMode) {
          // Delete nearest vertex to cursor
          const { x: sx, y: sy } = lastMouseRef.current;
          const hitR = 12;
          let bestDist = hitR, bestHit = null;
          for (const b of boundaries) {
            for (let vi = 0; vi < b.vertices.length; vi++) {
              const px = b.vertices[vi][0] * viewState.scale + viewState.x;
              const py = b.vertices[vi][1] * viewState.scale + viewState.y;
              const d = Math.sqrt((px - sx) ** 2 + (py - sy) ** 2);
              if (d < bestDist) { bestDist = d; bestHit = { type: "boundary", id: b.id, vertexIdx: vi, count: b.vertices.length }; }
            }
          }
          for (const bl of breaklines) {
            for (let vi = 0; vi < bl.vertices.length; vi++) {
              const px = bl.vertices[vi][0] * viewState.scale + viewState.x;
              const py = bl.vertices[vi][1] * viewState.scale + viewState.y;
              const d = Math.sqrt((px - sx) ** 2 + (py - sy) ** 2);
              if (d < bestDist) { bestDist = d; bestHit = { type: "breakline", id: bl.id, vertexIdx: vi, count: bl.vertices.length }; }
            }
          }
          if (bestHit) {
            const minVerts = bestHit.type === "boundary" ? 3 : 2;
            if (bestHit.count > minVerts) {
              pushHistory();
              if (bestHit.type === "boundary") {
                setBoundaries(prev => prev.map(b => b.id !== bestHit.id ? b : { ...b, vertices: b.vertices.filter((_, i) => i !== bestHit.vertexIdx) }));
              } else {
                setBreaklines(prev => prev.map(bl => bl.id !== bestHit.id ? bl : { ...bl, vertices: bl.vertices.filter((_, i) => i !== bestHit.vertexIdx) }));
              }
            }
          }
          return;
        }
        deleteSelectedPoints();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [drawMode, deleteSelectedPoints, undo, redo, showCRSPrompt, showBugReport, editNodesMode, viewState, boundaries, breaklines, pushHistory]);

  // ── Wheel handler (non-passive to allow preventDefault) ─────────────────────
  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const onWheel = (e) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const mx = e.clientX - rect.left, my = e.clientY - rect.top;
      const factor = e.deltaY > 0 ? 0.9 : 1.1;
      setViewState(prev => {
        const ns = Math.max(0.001, Math.min(1000, prev.scale * factor));
        return { scale: ns, x: mx - (mx - prev.x) * (ns / prev.scale), y: my - (my - prev.y) * (ns / prev.scale) };
      });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  // ── Offscreen raster cache (ImageData-based) ───────────────────────────────
  useEffect(() => {
    if (!gridData) { offscreenRef.current = null; return; }
    const { grid, gridX, gridY, nx, ny } = gridData;
    if (nx < 2 || ny < 2) { offscreenRef.current = null; return; }
    const { zMin, zMax, range } = effectiveZRange;
    const oc = document.createElement('canvas');
    oc.width = nx; oc.height = ny;
    const octx = oc.getContext('2d');
    const rl = layers.find(l => l.type === "raster");
    const rampName = rl?.colorRamp || "viridis";
    const showFilled = rl?.showFilledContours || false;
    const showHill = rl?.showHillshade || false;
    const hillOp = rl?.hillOpacity ?? 50;
    // 1. Filled contours (below raster)
    if (filledContourData && showFilled) {
      const cW = gridX[1] - gridX[0], cH = gridY[1] - gridY[0];
      octx.globalAlpha = 0.7;
      for (const band of filledContourData) {
        const t = ((band.levelMin + band.levelMax) / 2 - zMin) / range;
        const [r, g, b] = getColorComponents(Math.max(0, Math.min(1, t)), rampName);
        octx.fillStyle = `rgb(${r},${g},${b})`;
        for (const [cx, cy] of band.cells) {
          const pi = Math.round((cx - gridX[0]) / cW);
          const pj = Math.round((cy - gridY[0]) / cH);
          if (pi >= 0 && pi < nx && pj >= 0 && pj < ny) octx.fillRect(pi, pj, 1, 1);
        }
      }
      octx.globalAlpha = 1;
    }
    // 2. Raster via single ImageData + putImageData
    {
      const rc = document.createElement('canvas');
      rc.width = nx; rc.height = ny;
      const rctx = rc.getContext('2d');
      const imgData = rctx.createImageData(nx, ny);
      const d = imgData.data;
      for (let j = 0; j < ny; j++) {
        for (let i = 0; i < nx; i++) {
          const val = grid[j * nx + i];
          const p = (j * nx + i) * 4;
          if (isNaN(val)) { d[p + 3] = 0; }
          else {
            const [r, g, b] = getColorComponents((val - zMin) / range, rampName);
            d[p] = r; d[p + 1] = g; d[p + 2] = b; d[p + 3] = 255;
          }
        }
      }
      rctx.putImageData(imgData, 0, 0);
      octx.drawImage(rc, 0, 0);
    }
    // 3. Hillshade overlay via ImageData
    if (hillshadeData && showHill) {
      const hc = document.createElement('canvas');
      hc.width = nx; hc.height = ny;
      const hctx = hc.getContext('2d');
      const hImg = hctx.createImageData(nx, ny);
      const hd = hImg.data;
      for (let j = 0; j < ny; j++) {
        for (let i = 0; i < nx; i++) {
          const v = hillshadeData[j * nx + i];
          const p = (j * nx + i) * 4;
          const c = v > 128 ? 255 : 0;
          hd[p] = c; hd[p + 1] = c; hd[p + 2] = c;
          hd[p + 3] = Math.round(Math.abs(v - 128) * (hillOp / 100));
        }
      }
      hctx.putImageData(hImg, 0, 0);
      octx.drawImage(hc, 0, 0);
    }
    offscreenRef.current = oc;
  }, [gridData, filledContourData, hillshadeData, layers, effectiveZRange]);

  const handleFile = useCallback((file) => {
    if (!file) return;
    const MAX_SIZE = 50 * 1024 * 1024; // 50MB
    const WARN_SIZE = 10 * 1024 * 1024; // 10MB
    if (file.size > MAX_SIZE) { alert(`File too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Maximum is 50 MB.`); return; }
    if (file.size > WARN_SIZE && !confirm(`File is ${(file.size / 1024 / 1024).toFixed(1)} MB. Large files may slow down the browser. Continue?`)) return;
    setFileName(file.name);
    const ext = file.name.split(".").pop().toLowerCase();

    // Track recent file
    addRecentFile({ name: file.name, size: file.size, type: ext }).then(() => getRecentFiles().then(setRecentFiles));

    // ── Raster import: ASCII Grid / Surfer Grid ────────────────────────
    if (ext === "asc") {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const gd = parseASCIIGrid(e.target.result);
          pushHistory();
          setGridData(gd);
          setGridStats(computeGridStats(gd.grid, gd.nx, gd.ny));
          setHillshadeData(new Float64Array(computeHillshade(gd.grid, gd.nx, gd.ny, gs.hillAzimuth, gs.hillAltitude, gd.gridX[1] - gd.gridX[0], gs.hillZFactor)));
          setLayers(prev => [...prev.filter(l => l.type !== "raster"), {
            id: Date.now(), name: file.name, type: "raster", visible: true, opacity: 85,
            colorRamp: "viridis", rampMode: "auto", rampMin: 0, rampMax: 100,
            showHillshade: false, hillOpacity: 50, showFilledContours: false,
          }]);
          setActivePanel("gridding");
        } catch (err) { alert("Failed to parse ASCII grid: " + err.message); }
      };
      reader.readAsText(file);
      return;
    }
    if (ext === "grd") {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const gd = parseSurferGrid(e.target.result);
          pushHistory();
          setGridData(gd);
          setGridStats(computeGridStats(gd.grid, gd.nx, gd.ny));
          setHillshadeData(new Float64Array(computeHillshade(gd.grid, gd.nx, gd.ny, gs.hillAzimuth, gs.hillAltitude, gd.gridX[1] - gd.gridX[0], gs.hillZFactor)));
          setLayers(prev => [...prev.filter(l => l.type !== "raster"), {
            id: Date.now(), name: file.name, type: "raster", visible: true, opacity: 85,
            colorRamp: "viridis", rampMode: "auto", rampMin: 0, rampMax: 100,
            showHillshade: false, hillOpacity: 50, showFilledContours: false,
          }]);
          setActivePanel("gridding");
        } catch (err) { alert("Failed to parse Surfer grid: " + err.message); }
      };
      reader.readAsText(file);
      return;
    }

    // ── Binary formats: Shapefile, LAS ─────────────────────────────────
    if (ext === "shp") {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const { headers: h, rows } = parseShapefile(e.target.result);
          processPointImport(h, rows, file.name);
        } catch (err) { alert("Failed to parse Shapefile: " + err.message); }
      };
      reader.readAsArrayBuffer(file);
      return;
    }
    if (ext === "las" || ext === "laz") {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const { headers: h, rows } = parseLAS(e.target.result);
          processPointImport(h, rows, file.name);
        } catch (err) { alert("Failed to parse LAS file: " + err.message); }
      };
      reader.readAsArrayBuffer(file);
      return;
    }
    if (ext === "xlsx" || ext === "xls") {
      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          const { headers: h, rows } = await parseExcel(e.target.result);
          processPointImport(h, rows, file.name);
        } catch (err) { alert("Failed to parse Excel file: " + err.message); }
      };
      reader.readAsArrayBuffer(file);
      return;
    }

    // ── Text formats: GPX, GeoJSON, CSV ────────────────────────────────
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target.result;
      let h, rows;

      if (ext === "gpx") {
        try { const r = parseGPX(text); h = r.headers; rows = r.rows; } catch { /* fall through */ }
      }
      if (!rows && (ext === "geojson" || ext === "json")) {
        try {
          const gj = JSON.parse(text);
          // Try CRS auto-detection from GeoJSON
          const detectedCRS = detectCRSFromGeoJSON(gj);
          if (detectedCRS) setFileCRS(detectedCRS);
          const r = parseGeoJSON(text); h = r.headers; rows = r.rows;
        } catch { /* fall through */ }
      }
      if (!rows) { const r = parseCSV(text); h = r.headers; rows = r.rows; }
      if (h && h.length > 0 && rows && rows.length > 0) {
        processPointImport(h, rows, file.name);
      }
    };
    reader.readAsText(file);
  }, [projectCRS, points.length, gs]);

  /** Common handler for all point-based imports after parsing */
  const processPointImport = useCallback((h, rows, name) => {
    setHeaders(h);
    setAllRows(rows);
    const detected = autoDetectColumns(h);
    setColumnMapping(detected);
    const hasLonLat = h.some(c => /^lon/i.test(c) || /^lng/i.test(c) || /^long/i.test(c));
    if (projectCRS === "LOCAL" && points.length === 0) {
      setFileCRS(hasLonLat ? "EPSG:4326" : "LOCAL");
      setPendingFileAfterCRS(true);
      setShowCRSPrompt(true);
    } else {
      setFileCRS(hasLonLat ? "EPSG:4326" : projectCRS);
      setActivePanel("mapping");
    }
  }, [projectCRS, points.length]);

  const handleDrop = useCallback((e) => {
    e.preventDefault(); e.stopPropagation();
    setDragOverlay(false);
    // Batch import: handle multiple files
    const files = e.dataTransfer?.files;
    if (files && files.length > 0) {
      for (let i = 0; i < files.length; i++) handleFile(files[i]);
    }
  }, [handleFile]);

  const handleDragOver = useCallback((e) => {
    e.preventDefault(); e.stopPropagation();
    setDragOverlay(true);
  }, []);

  const handleDragLeave = useCallback((e) => {
    e.preventDefault(); e.stopPropagation();
    setDragOverlay(false);
  }, []);

  const applyMapping = useCallback(() => {
    if (!columnMapping.x || !columnMapping.y) return;
    pushHistory();
    // Map ALL rows - no limit
    let pts = allRows.map(r => ({
      x: +r[columnMapping.x], y: +r[columnMapping.y],
      z: columnMapping.z ? +r[columnMapping.z] : 0,
      pointNo: columnMapping.pointNo ? (r[columnMapping.pointNo] || "") : "",
      desc: columnMapping.desc ? (r[columnMapping.desc] || "") : "",
    })).filter(p => Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z));
    // Transform coordinates if file CRS differs from project CRS
    if (fileCRS !== "LOCAL" && projectCRS !== "LOCAL" && fileCRS !== projectCRS) {
      pts = transformPoints(pts, fileCRS, projectCRS);
    }
    setPoints(pts);
    setLayers(prev => [...prev, {
      id: Date.now(), name: fileName || "Points", type: "points", visible: true, opacity: 100,
      size: 5, shape: "circle", color: C.accent, colorMode: "ramp",
      showPointNumbers: false, showPointLevels: false, showPointDescs: false, labelSize: 9,
      labelFont: "'DM Sans',sans-serif", labelHaloWidth: 2, labelHaloColor: "#000000",
      dashPattern: "solid", sizeByAttribute: false, sizeMin: 3, sizeMax: 12,
    }]);
    setActivePanel("gridding");
  }, [columnMapping, allRows, fileName, fileCRS, projectCRS]);

  const runGridOnly = useCallback((chainContours = false) => {
    const gridPts = filteredPoints;
    const gridBounds = filteredBounds;
    if (gridPts.length === 0 || !gridBounds) return;
    setGridding(true);
    setGriddingProgress(0);
    setGriddingStage("Starting…");
    const preGridSnapshot = getSnapshot();

    if (workerRef.current) { workerRef.current.terminate(); workerRef.current = null; }

    const worker = new GriddingWorker();
    workerRef.current = worker;

    worker.onmessage = (e) => {
      const msg = e.data;
      if (msg.type === "progress") {
        setGriddingProgress(msg.percent);
        setGriddingStage(msg.stage || "");
      } else if (msg.type === "gridResult") {
        historyRef.current = [...historyRef.current.slice(-(MAX_HISTORY - 1)), preGridSnapshot];
        futureRef.current = [];
        setUndoVersion(v => v + 1);
        const { grid: gridArr, gridX, gridY, nx, ny, stats, hillshade, zMin, zMax } = msg;
        const grid = new Float64Array(gridArr);
        const hillshadeArr = new Float64Array(hillshade);

        setGridStats(stats);
        setGridData({ grid, gridX, gridY, nx, ny, zMin, zMax });
        setHillshadeData(hillshadeArr);

        const a = gs.algorithm;
        setLayers(prev => {
          // Preserve existing raster layer styling if it exists
          const existingRaster = prev.find(l => l.type === "raster");
          const filtered = prev.filter(l => l.type !== "raster");
          const rasterProps = existingRaster ? { colorRamp: existingRaster.colorRamp, rampMode: existingRaster.rampMode, rampMin: existingRaster.rampMin, rampMax: existingRaster.rampMax, showHillshade: existingRaster.showHillshade, hillOpacity: existingRaster.hillOpacity, showFilledContours: existingRaster.showFilledContours } : {};
          return [...filtered,
          {
            id: existingRaster?.id || Date.now(), name: `Grid (${ALGORITHMS.find(al => al.value === a)?.label || a})`, type: "raster", visible: true, opacity: existingRaster?.opacity ?? 85,
            colorRamp: "viridis", rampMode: "auto", rampMin: 0, rampMax: 100,
            showHillshade: false, hillOpacity: 50, showFilledContours: false,
            ...rasterProps
          },
          ];
        });
        setGridding(false);
        setGriddingProgress(100);
        setGriddingStage("");
        workerRef.current = null;

        // Chain contour generation if requested
        if (chainContours) {
          // Use setTimeout to let state settle, then trigger contours
          setTimeout(() => {
            runContoursOnlyWithData({ grid, gridX, gridY, nx, ny, stats, zMin, zMax }, gridPts);
          }, 50);
        }
      } else if (msg.type === "error") {
        console.error("Gridding worker error:", msg.message);
        setGridding(false);
        setGriddingStage("Error: " + msg.message);
        workerRef.current = null;
      }
    };

    worker.onerror = (err) => {
      console.error("Worker error:", err);
      setGridding(false);
      setGriddingStage("Worker error");
      workerRef.current = null;
    };

    worker.postMessage({ type: "grid", points: gridPts, bounds: gridBounds, gs, boundaries, breaklines });
  }, [filteredPoints, filteredBounds, gs, boundaries, breaklines]);

  const runContoursOnlyWithData = useCallback((gd, pts) => {
    if (!gd) return;
    setContouring(true);
    setContouringProgress(0);
    setContouringStage("Starting contours…");

    if (workerRef.current) { workerRef.current.terminate(); workerRef.current = null; }

    const worker = new GriddingWorker();
    workerRef.current = worker;

    // Read contour params from contour layer if it exists
    const cl = layers.find(l => l.type === "contours");
    const contourInterval = cl?.contourInterval ?? 10;
    const contourMethod = cl?.contourMethod ?? "grid";
    const contourSmoothing = cl?.contourSmoothing ?? 0;

    worker.onmessage = (e) => {
      const msg = e.data;
      if (msg.type === "progress") {
        setContouringProgress(msg.percent);
        setContouringStage(msg.stage || "");
      } else if (msg.type === "contourResult") {
        setContourData(msg.contours);
        setFilledContourData(msg.filledContours);

        setLayers(prev => {
          const existingContour = prev.find(l => l.type === "contours");
          const filtered = prev.filter(l => l.type !== "contours");
          const contourProps = existingContour ? { contourInterval: existingContour.contourInterval, contourMethod: existingContour.contourMethod, contourSmoothing: existingContour.contourSmoothing, showLabels: existingContour.showLabels, labelSize: existingContour.labelSize, majorInterval: existingContour.majorInterval, lineWeight: existingContour.lineWeight } : {};
          return [...filtered,
          {
            id: existingContour?.id || Date.now() + 1, name: "Contours", type: "contours", visible: true, opacity: existingContour?.opacity ?? 100,
            contourInterval: 10, contourMethod: "grid", contourSmoothing: 0,
            showLabels: true, labelSize: 9, majorInterval: 5, lineWeight: 1,
            ...contourProps
          },
          ];
        });
        setContouring(false);
        setContouringProgress(100);
        setContouringStage("");
        workerRef.current = null;
      } else if (msg.type === "error") {
        console.error("Contour worker error:", msg.message);
        setContouring(false);
        setContouringStage("Error: " + msg.message);
        workerRef.current = null;
      }
    };

    worker.onerror = (err) => {
      console.error("Worker error:", err);
      setContouring(false);
      setContouringStage("Worker error");
      workerRef.current = null;
    };

    worker.postMessage({
      type: "contours",
      grid: Array.from(gd.grid),
      gridX: gd.gridX,
      gridY: gd.gridY,
      nx: gd.nx,
      ny: gd.ny,
      stats: gd.stats || { min: gd.zMin, max: gd.zMax },
      contourInterval,
      contourMethod,
      contourSmoothing,
      points: pts || filteredPoints,
      breaklines,
    });
  }, [layers, filteredPoints, breaklines]);

  const runContoursOnly = useCallback(() => {
    if (!gridData) return;
    const gd = { ...gridData, stats: gridStats || { min: gridData.zMin, max: gridData.zMax } };
    runContoursOnlyWithData(gd, filteredPoints);
  }, [gridData, gridStats, filteredPoints, runContoursOnlyWithData]);

  const runGridAndContours = useCallback(() => {
    runGridOnly(true);
  }, [runGridOnly]);

  // Keep backward compat alias
  const runGridding = runGridAndContours;

  // ── Export helpers ──────────────────────────────────────────────────────────
  const downloadFile = (content, name, type = "text/plain") => {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = name; a.click();
    URL.revokeObjectURL(url);
  };

  const exportPNG = () => {
    if (!canvasRef.current) return;
    const url = canvasRef.current.toDataURL("image/png");
    const a = document.createElement("a"); a.href = url; a.download = "gridforge-map.png"; a.click();
  };

  const saveProject = () => {
    const state = { points, gridData, contourData, filledContourData, hillshadeData, gridStats, layers, gs, viewState, baseMap, fileName, boundaries, breaklines, projectCRS };
    downloadFile(serializeProject(state), `${fileName || "project"}.gfproj`, "application/json");
  };

  const exportLandXMLTIN = (source) => {
    const base = fileName || "surface";
    if (source === "grid") {
      if (!gridData) return;
      const xml = gridToLandXML(gridData.grid, gridData.gridX, gridData.gridY, gridData.nx, gridData.ny, base);
      downloadFile(xml, `${base}-grid.xml`, "application/xml");
    } else if (source === "raw") {
      if (points.length < 3 || exporting) return;
      setExporting(true);
      setExportProgress(0);
      setExportStage("Starting…");
      const w = new Worker(new URL("./gridding.worker.js", import.meta.url), { type: "module" });
      w.onmessage = (e) => {
        const msg = e.data;
        if (msg.type === "progress") {
          setExportProgress(msg.percent);
          setExportStage(msg.stage || "");
        } else if (msg.type === "tinExportResult") {
          const xml = tinToLandXML(msg.tin, base);
          downloadFile(xml, `${base}-tin.xml`, "application/xml");
          setExporting(false);
          w.terminate();
        } else if (msg.type === "error") {
          alert("TIN export failed: " + msg.message);
          setExporting(false);
          w.terminate();
        }
      };
      w.postMessage({ type: "triangulateForExport", points, breaklines });
    }
  };

  const loadProject = (file) => {
    if (!file) return;
    const MAX_PROJECT_SIZE = 100 * 1024 * 1024; // 100MB
    if (file.size > MAX_PROJECT_SIZE) { alert(`Project file too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Maximum is 100 MB.`); return; }
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        pushHistory();
        const state = deserializeProject(e.target.result);
        if (state.points) setPoints(state.points);
        if (state.gridData) setGridData(state.gridData);
        if (state.contourData) setContourData(state.contourData);
        if (state.filledContourData) setFilledContourData(state.filledContourData);
        if (state.hillshadeData) setHillshadeData(state.hillshadeData);
        if (state.gridStats) setGridStats(state.gridStats);
        if (state.layers) {
          // Migrate old layer format: add per-layer styling properties if missing
          const migratedLayers = state.layers.map(l => {
            if (l.type === "raster" && l.colorRamp === undefined) {
              return { colorRamp: state.gs?.colorRamp || "viridis", rampMode: state.gs?.rampMode || "auto", rampMin: state.gs?.rampMin || 0, rampMax: state.gs?.rampMax || 100, showHillshade: state.gs?.showHillshade || false, hillOpacity: state.gs?.hillOpacity || 50, showFilledContours: state.gs?.showFilledContours || false, ...l };
            }
            if (l.type === "contours" && l.contourInterval === undefined) {
              return { contourInterval: state.gs?.contourInterval || 10, contourMethod: state.gs?.contourMethod || "grid", contourSmoothing: state.gs?.contourSmoothing || 0, showLabels: state.gs?.showContourLabels !== false, labelSize: state.gs?.contourLabelSize || 9, majorInterval: state.gs?.majorInterval || 5, lineWeight: 1, ...l };
            }
            if (l.type === "points" && l.showPointNumbers === undefined) {
              return { colorMode: "ramp", showPointNumbers: state.gs?.showPointNumbers || false, showPointLevels: state.gs?.showPointLevels || false, showPointDescs: state.gs?.showPointDescs || false, labelSize: state.gs?.pointLabelSize || 9, ...l };
            }
            return l;
          });
          setLayers(migratedLayers);
        }
        if (state.gs) {
          // Only keep computation params from loaded gs, discard display-only
          const { colorRamp, showRaster, rampMode, rampMin, rampMax, showContours, showContourLabels, contourLabelSize, majorInterval, contourInterval, contourSmoothing, contourMethod, showFilledContours, showHillshade, hillOpacity, showPointNumbers, showPointLevels, showPointDescs, pointLabelSize, ...computeGs } = state.gs;
          setGs(prev => ({ ...prev, ...computeGs }));
        }
        if (state.viewState) setViewState(state.viewState);
        if (state.baseMap) setBaseMap(state.baseMap);
        if (state.fileName) setFileName(state.fileName);
        if (state.boundaries) setBoundaries(state.boundaries);
        if (state.breaklines) setBreaklines((state.breaklines || []).map(bl => ({
          ...bl, breaklineType: bl.breaklineType || "standard",
        })));
        if (state.projectCRS) setProjectCRS(state.projectCRS);
      } catch (err) { console.error("Failed to load project:", err); }
    };
    reader.readAsText(file);
  };

  // ── Comparison mode ────────────────────────────────────────────────────────
  const runComparison = (algos) => {
    if (points.length === 0 || !bounds) return;
    setGridding(true);
    setTimeout(() => {
      const pad = gs.padding / 100;
      const dx = (bounds.xMax - bounds.xMin) * pad, dy = (bounds.yMax - bounds.yMin) * pad;
      const nx = Math.min(gs.resolution, 80); // lower res for comparison
      const ny = Math.round(nx * ((bounds.yMax - bounds.yMin + 2 * dy) / (bounds.xMax - bounds.xMin + 2 * dx))) || nx;
      const gridX = Array.from({ length: nx }, (_, i) => bounds.xMin - dx + i * (bounds.xMax - bounds.xMin + 2 * dx) / (nx - 1));
      const gridY = Array.from({ length: ny }, (_, j) => bounds.yMin - dy + j * (bounds.yMax - bounds.yMin + 2 * dy) / (ny - 1));
      const results = algos.map(a => {
        let grid;
        try {
          if (a === "idw") grid = idwInterpolation(points, gridX, gridY, { power: 2 });
          else if (a === "natural") grid = naturalNeighborInterpolation(points, gridX, gridY);
          else if (a === "mincurv") grid = minimumCurvature(points, gridX, gridY, {});
          else if (a === "kriging_ord") grid = krigingOrdinary(points, gridX, gridY, {});
          else if (a === "rbf") grid = rbfInterpolation(points, gridX, gridY, {});
          else if (a === "tin") grid = tinInterpolation(points, gridX, gridY);
          else if (a === "nearest") grid = nearestNeighborInterp(points, gridX, gridY, {});
          else if (a === "moving_avg") grid = movingAverage(points, gridX, gridY, {});
          else if (a === "poly_reg") grid = polynomialRegression(points, gridX, gridY, {});
          else if (a === "mod_shepard") grid = modifiedShepard(points, gridX, gridY, {});
          else grid = idwInterpolation(points, gridX, gridY, { power: 2 });
        } catch { grid = new Float64Array(nx * ny).fill(NaN); }
        const stats = computeGridStats(grid);
        return { algo: a, grid, gridX, gridY, nx, ny, stats, label: ALGORITHMS.find(al => al.value === a)?.label || a };
      });
      setCompMode({ algos, results });
      setGridding(false);
    }, 50);
  };

  // ── Canvas Rendering ───────────────────────────────────────────────────────
  useEffect(() => {
    if (rafIdRef.current) cancelAnimationFrame(rafIdRef.current);
    rafIdRef.current = requestAnimationFrame(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      const w = canvas.width = canvas.parentElement.clientWidth;
      const h = canvas.height = canvas.parentElement.clientHeight;
      const { x: vx, y: vy, scale } = viewState;
      const bm = BASEMAP_STYLES[baseMap] || BASEMAP_STYLES.none;

      ctx.fillStyle = bm.bg; ctx.fillRect(0, 0, w, h);

      // ── Comparison Mode ────────────────────────────────────────────────────
      if (compMode && compMode.results.length > 0) {
        const n = compMode.results.length;
        const cols = n <= 2 ? n : 2, rows = Math.ceil(n / cols);
        const cw = w / cols, ch = h / rows;
        compMode.results.forEach((r, idx) => {
          const cx = (idx % cols) * cw, cy = Math.floor(idx / cols) * ch;
          ctx.save(); ctx.beginPath(); ctx.rect(cx, cy, cw, ch); ctx.clip();
          ctx.fillStyle = bm.bg; ctx.fillRect(cx, cy, cw, ch);
          // Render mini raster
          const { grid, gridX, gridY, nx, ny, stats } = r;
          if (stats.count > 0) {
            const range = stats.max - stats.min || 1;
            const dw = (bounds.xMax - bounds.xMin) || 1, dh = (bounds.yMax - bounds.yMin) || 1;
            const sc = Math.min((cw - 20) / dw, (ch - 40) / dh) * 0.85;
            const ox = cx + cw / 2 - (bounds.xMin + dw / 2) * sc;
            const oy = cy + 20 + (ch - 40) / 2 - (bounds.yMin + dh / 2) * sc;
            const cellW = (gridX[1] - gridX[0]) * sc, cellH = (gridY[1] - gridY[0]) * sc;
            for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
              const v = grid[j * nx + i]; if (isNaN(v)) continue;
              ctx.fillStyle = getColorFromRamp((v - stats.min) / range, activeColorRamp);
              ctx.fillRect(gridX[i] * sc + ox - cellW / 2, gridY[j] * sc + oy - cellH / 2, cellW + 1, cellH + 1);
            }
          }
          // Label
          ctx.fillStyle = isDark ? "#ffffffdd" : "#000000cc"; ctx.font = "bold 12px 'DM Sans',sans-serif";
          ctx.textAlign = "center"; ctx.fillText(r.label, cx + cw / 2, cy + 16);
          ctx.font = "10px 'JetBrains Mono',monospace"; ctx.fillStyle = isDark ? "#ffffff88" : "#00000066";
          if (stats.count > 0) ctx.fillText(`min:${stats.min.toFixed(1)} max:${stats.max.toFixed(1)} mean:${stats.mean.toFixed(1)}`, cx + cw / 2, ch + cy - 8);
          // Border
          ctx.strokeStyle = C.panelBorder; ctx.lineWidth = 1; ctx.strokeRect(cx, cy, cw, ch);
          ctx.restore();
        });
        return; // Don't render normal view in comparison mode
      }

      // ── 3D View Mode ───────────────────────────────────────────────────────
      if (viewMode === "3d" && gridData) {
        ctx.fillStyle = bm.bg; ctx.fillRect(0, 0, w, h);
        const { grid, gridX, gridY, nx, ny, zMin, zMax } = gridData;
        const range = zMax - zMin || 1;
        const midX = (bounds.xMin + bounds.xMax) / 2;
        const midY = (bounds.yMin + bounds.yMax) / 2;
        const midZ = (zMin + zMax) / 2;
        const ext = Math.max(bounds.xMax - bounds.xMin, bounds.yMax - bounds.yMin) || 1;
        const sc = Math.min(w, h) / (ext * 1.8);
        // Collect quads with depth for painter's algorithm
        const quads = [];
        for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
          const corners = [[i, j], [i + 1, j], [i + 1, j + 1], [i, j + 1]].map(([ci, cj]) => {
            const val = grid[cj * nx + ci];
            const p = project3D(gridX[ci], gridY[cj], isNaN(val) ? midZ : val, view3D.angleX, view3D.angleZ, view3D.exaggeration, midX, midY, midZ);
            return { ...p, val };
          });
          const avgDepth = corners.reduce((s, c) => s + c.depth, 0) / 4;
          quads.push({ corners, avgDepth, avgVal: corners.reduce((s, c) => s + (isNaN(c.val) ? 0 : c.val), 0) / 4 });
        }
        quads.sort((a, b) => a.avgDepth - b.avgDepth);
        // Batch quads by quantized color to reduce canvas calls
        const depthRange = (quads[quads.length - 1]?.avgDepth - quads[0]?.avgDepth) || 1;
        const depthMin = quads[0]?.avgDepth || 0;
        const colorBatches = new Map();
        for (const q of quads) {
          const t = (q.avgVal - zMin) / range;
          const [cr, cg, cb] = getColorComponents(Math.max(0, Math.min(1, t)), activeColorRamp);
          const shade = 0.5 + 0.5 * (q.avgDepth - depthMin) / depthRange;
          const r = Math.round(cr * shade), g = Math.round(cg * shade), b = Math.round(cb * shade);
          const key = `${r},${g},${b}`;
          if (!colorBatches.has(key)) colorBatches.set(key, []);
          colorBatches.get(key).push(q);
        }
        for (const [color, batch] of colorBatches) {
          ctx.fillStyle = `rgb(${color})`;
          ctx.beginPath();
          for (const q of batch) {
            q.corners.forEach((c, ci) => { const px = w / 2 + c.sx * sc, py = h / 2 + c.sy * sc; ci === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py); });
            ctx.closePath();
          }
          ctx.fill();
        }
        // Single stroke pass for grid lines
        ctx.strokeStyle = `rgba(0,0,0,0.1)`; ctx.lineWidth = 0.3;
        ctx.beginPath();
        for (const q of quads) {
          q.corners.forEach((c, ci) => { const px = w / 2 + c.sx * sc, py = h / 2 + c.sy * sc; ci === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py); });
          ctx.closePath();
        }
        ctx.stroke();
        // 3D breaklines
        for (const bl of breaklines) {
          if (bl.visible === false || !bl.vertices || bl.vertices.length < 2) continue;
          const bType = bl.breaklineType || "standard";
          ctx.strokeStyle = bType === "proximity" ? "#fbbf24" : bType === "wall" ? "#f472b6" : "#00e5ff";
          ctx.lineWidth = 2; ctx.setLineDash(bType === "proximity" ? [6, 3] : []);
          ctx.beginPath();
          for (let vi = 0; vi < bl.vertices.length; vi++) {
            const v = bl.vertices[vi];
            const vz = v[2] != null ? v[2] : midZ;
            const p = project3D(v[0], v[1], vz, view3D.angleX, view3D.angleZ, view3D.exaggeration, midX, midY, midZ);
            const px = w / 2 + p.sx * sc, py = h / 2 + p.sy * sc;
            vi === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
          }
          ctx.stroke(); ctx.setLineDash([]);
        }
        // 3D info
        ctx.fillStyle = isDark ? "#ffffffaa" : "#000000aa"; ctx.font = "12px 'DM Sans',sans-serif"; ctx.textAlign = "left";
        ctx.fillText(`3D View — Angle: ${view3D.angleX}°/${view3D.angleZ}° — Exag: ${view3D.exaggeration}×`, 12, 24);
        return;
      }

      // ── Normal 2D Rendering ────────────────────────────────────────────────
      // Tile basemap (OSM / Satellite)
      if ((baseMap === "osm" || baseMap === "satellite") && projectCRS !== "LOCAL") {
        const tileUrlFn = baseMap === "osm"
          ? (tz, tx, ty) => `https://tile.openstreetmap.org/${tz}/${tx}/${ty}.png`
          : (tz, tx, ty) => `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${tz}/${ty}/${tx}`;

        let lonLo, lonHi, latLo, latHi, projectedMode = false;

        if (isGeographic) {
          // Geographic CRS (EPSG:4326): screen coords are lon/lat directly
          const lonMin = -vx / scale, lonMax = (w - vx) / scale;
          const latMin = -vy / scale, latMax = (h - vy) / scale;
          latLo = Math.max(-85.05, Math.min(latMin, latMax));
          latHi = Math.min(85.05, Math.max(latMin, latMax));
          lonLo = Math.max(-180, Math.min(lonMin, lonMax));
          lonHi = Math.min(180, Math.max(lonMin, lonMax));
        } else {
          // Projected CRS (e.g. UTM): transform screen corners to EPSG:4326
          projectedMode = true;
          const corners = [
            [-vx / scale, -vy / scale],
            [(w - vx) / scale, -vy / scale],
            [(w - vx) / scale, (h - vy) / scale],
            [-vx / scale, (h - vy) / scale],
          ];
          let minLon = 180, maxLon = -180, minLat = 90, maxLat = -90;
          for (const [cx, cy] of corners) {
            const [lon, lat] = transformCoord(cx, cy, projectCRS, "EPSG:4326");
            if (lon < minLon) minLon = lon;
            if (lon > maxLon) maxLon = lon;
            if (lat < minLat) minLat = lat;
            if (lat > maxLat) maxLat = lat;
          }
          lonLo = Math.max(-180, minLon);
          lonHi = Math.min(180, maxLon);
          latLo = Math.max(-85.05, minLat);
          latHi = Math.min(85.05, maxLat);
        }

        if (latLo < latHi && lonLo < lonHi) {
          // Compute ideal zoom, then clamp to provider max
          // OSM maxes at z19; ArcGIS World Imagery goes up to z23 in most areas
          const maxProviderZoom = baseMap === "satellite" ? 23 : 19;
          let idealZ;
          if (projectedMode) {
            const degreesPerPixel = (lonHi - lonLo) / w;
            idealZ = Math.round(Math.log2(360 / (degreesPerPixel * 256)));
          } else {
            idealZ = Math.round(Math.log2(360 * scale / 256));
          }
          // Clamp to provider range — tiles at tz will upscale when idealZ > maxProviderZoom
          const tz = Math.max(1, Math.min(maxProviderZoom, idealZ));
          const txMin = Math.max(0, Math.floor(lon2tileX(lonLo, tz)));
          const txMax = Math.min((1 << tz) - 1, Math.floor(lon2tileX(lonHi, tz)));
          const tyMin = Math.max(0, Math.floor(lat2tileY(latHi, tz)));
          const tyMax = Math.min((1 << tz) - 1, Math.floor(lat2tileY(latLo, tz)));
          const cache = tileCacheRef.current;
          let tc = 0;
          for (let tty = tyMin; tty <= tyMax && tc < 200; tty++) {
            for (let ttx = txMin; ttx <= txMax && tc < 200; ttx++) {
              tc++;
              const key = `${tz}/${ttx}/${tty}`;
              if (!cache.has(key)) {
                const img = new Image();
                if (baseMap === "osm") img.crossOrigin = "anonymous"; // ArcGIS: skip crossOrigin to avoid CORS failures
                img.src = tileUrlFn(tz, ttx, tty);
                const entry = { img, loaded: false, failed: false };
                cache.set(key, entry);
                img.onload = () => {
                  entry.loaded = true;
                  if (!tileLoadTimerRef.current) {
                    tileLoadTimerRef.current = setTimeout(() => {
                      tileLoadTimerRef.current = null;
                      setTileGen(g => g + 1);
                    }, 100);
                  }
                };
                img.onerror = () => {
                  entry.failed = true;
                  cache.delete(key); // Allow retry on next frame
                };
              }
              const tile = cache.get(key);
              if (tile?.loaded) {
                let sL, sR, sTop, sBot;
                if (projectedMode) {
                  // Transform tile corners from EPSG:4326 to project CRS, then to screen
                  const wst = tileX2lon(ttx, tz), est = tileX2lon(ttx + 1, tz);
                  const nth = tileY2lat(tty, tz), sth = tileY2lat(tty + 1, tz);
                  const [pxNW, pyNW] = transformCoord(wst, nth, "EPSG:4326", projectCRS);
                  const [pxSE, pySE] = transformCoord(est, sth, "EPSG:4326", projectCRS);
                  sL = pxNW * scale + vx;
                  sR = pxSE * scale + vx;
                  // In projected CRS (e.g. UTM): pyNW > pySE (northing)
                  // On screen: sN = pyNW*scale+vy > sS = pySE*scale+vy
                  // North = higher screen y = further DOWN; South = lower screen y = UP
                  const sN = pyNW * scale + vy, sS = pySE * scale + vy;
                  sTop = Math.min(sN, sS); // screen-top = south (smaller y)
                  sBot = Math.max(sN, sS); // screen-bottom = north (larger y)
                } else {
                  // Geographic: data coords are lon/lat
                  const wst = tileX2lon(ttx, tz), est = tileX2lon(ttx + 1, tz);
                  const nth = tileY2lat(tty, tz), sth = tileY2lat(tty + 1, tz);
                  sL = wst * scale + vx;
                  sR = est * scale + vx;
                  // nth > sth → sN > sS (north = further down on canvas)
                  const sN = nth * scale + vy, sS = sth * scale + vy;
                  sTop = sS; // south edge = smaller screen y = top
                  sBot = sN; // north edge = larger screen y = bottom
                }
                const sW = sR - sL, sH = sBot - sTop;
                if (sW > 0.5 && sH > 0.5) {
                  // Tile image row 0 = north, but on screen north = bottom (sBot).
                  // Flip vertically: translate to top, scale Y by -1, draw at -sH.
                  ctx.save();
                  ctx.translate(sL, sBot);
                  ctx.scale(1, -1);
                  ctx.drawImage(tile.img, 0, 0, sW, sH);
                  ctx.restore();
                }
              }
            }
          }
          if (cache.size > 500) {
            const keys = [...cache.keys()];
            for (let i = 0; i < keys.length - 400; i++) cache.delete(keys[i]);
          }
        }
      }

      // Show hint when basemap can't align (LOCAL CRS)
      if ((baseMap === "osm" || baseMap === "satellite") && projectCRS === "LOCAL") {
        ctx.fillStyle = isDark ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.08)";
        ctx.font = "12px 'DM Sans',sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("Define a CRS to align basemap tiles with your data", w / 2, 24);
        ctx.fillText("Your data uses local/Cartesian coordinates — basemap is decorative only", w / 2, 40);
      }

      // Grid lines
      if (showGridLines) {
        const gridSpacing = Math.pow(10, Math.floor(Math.log10(200 / scale)));
        const majorSpacing = gridSpacing * 5;
        const startX = Math.floor((-vx / scale) / gridSpacing) * gridSpacing;
        const startY = Math.floor((-vy / scale) / gridSpacing) * gridSpacing;
        ctx.strokeStyle = bm.grid; ctx.lineWidth = 0.5;
        for (let gx = startX; gx < (-vx + w) / scale; gx += gridSpacing) { const sx = gx * scale + vx; ctx.beginPath(); ctx.moveTo(sx, 0); ctx.lineTo(sx, h); ctx.stroke(); }
        for (let gy = startY; gy < (-vy + h) / scale; gy += gridSpacing) { const sy = gy * scale + vy; ctx.beginPath(); ctx.moveTo(0, sy); ctx.lineTo(w, sy); ctx.stroke(); }
        ctx.strokeStyle = bm.gridMajor; ctx.lineWidth = 1;
        const msx = Math.floor((-vx / scale) / majorSpacing) * majorSpacing;
        const msy = Math.floor((-vy / scale) / majorSpacing) * majorSpacing;
        for (let gx = msx; gx < (-vx + w) / scale; gx += majorSpacing) { const sx = gx * scale + vx; ctx.beginPath(); ctx.moveTo(sx, 0); ctx.lineTo(sx, h); ctx.stroke(); }
        for (let gy = msy; gy < (-vy + h) / scale; gy += majorSpacing) { const sy = gy * scale + vy; ctx.beginPath(); ctx.moveTo(0, sy); ctx.lineTo(w, sy); ctx.stroke(); }
        if (showCoordLabels) {
          ctx.font = "9px 'JetBrains Mono',monospace"; ctx.fillStyle = bm.label;
          ctx.textAlign = "center";
          for (let gx = msx; gx < (-vx + w) / scale; gx += majorSpacing) { const sx = gx * scale + vx; if (sx > 30 && sx < w - 30) ctx.fillText(gx.toFixed(gx % 1 === 0 ? 0 : 1), sx, h - 34); }
          ctx.textAlign = "right";
          for (let gy = msy; gy < (-vy + h) / scale; gy += majorSpacing) { const sy = gy * scale + vy; if (sy > 10 && sy < h - 40) ctx.fillText(gy.toFixed(gy % 1 === 0 ? 0 : 1), 36, sy + 3); }
        }
        const ox = 0 * scale + vx, oy = 0 * scale + vy;
        ctx.strokeStyle = bm.axis; ctx.lineWidth = 1.5;
        if (ox > 0 && ox < w) { ctx.beginPath(); ctx.moveTo(ox, 0); ctx.lineTo(ox, h); ctx.stroke(); }
        if (oy > 0 && oy < h) { ctx.beginPath(); ctx.moveTo(0, oy); ctx.lineTo(w, oy); ctx.stroke(); }
      }

      // ── Layer-order rendering ──────────────────────────────────────────
      for (const layer of layers) {
        if (!layer.visible) continue;
        ctx.globalAlpha = (layer.opacity || 100) / 100;

        if (layer.type === "raster" && offscreenRef.current && gridData) {
          const { gridX, gridY, nx, ny } = gridData;
          const cW = gridX[1] - gridX[0], cH = gridY[1] - gridY[0];
          const sx = (gridX[0] - cW / 2) * scale + vx;
          const sy = (gridY[0] - cH / 2) * scale + vy;
          ctx.imageSmoothingEnabled = false;
          ctx.drawImage(offscreenRef.current, sx, sy, nx * cW * scale, ny * cH * scale);
          ctx.imageSmoothingEnabled = true;
        } else if (layer.type === "contours" && contourData && gridData) {
          const range = effectiveZRange.range;
          const layerMajor = layer.majorInterval ?? 5;
          const layerShowLabels = layer.showLabels !== false;
          const layerLabelSize = layer.labelSize || 9;
          const layerLineWeight = layer.lineWeight || 1;

          // ── Label collision grid (screen-space occupancy) ──
          // Each cell is ~(labelSize*6) px; if occupied, skip that label
          const labelCellSize = Math.max(20, layerLabelSize * 6);
          const occupiedCells = layerShowLabels ? new Set() : null;
          const labelMargin = 12; // extra px padding around labels
          const repeatSpacing = Math.max(180, 300 - layerLabelSize * 5); // screen-px between repeated labels
          const minScreenLen = layerLabelSize * 5; // polyline must be at least this long on screen

          // Collect all label candidates first, then draw lines, then draw labels
          // (so labels are always on top of all contour lines)
          const labelQueue = [];

          contourData.forEach(({ level, polylines, segments }, ci) => {
            const t = (level - effectiveZRange.zMin) / range;
            const isMajor = layerMajor > 0 && (ci % layerMajor === 0);
            ctx.strokeStyle = getColorFromRamp(Math.min(1, t * 0.8 + 0.1), activeColorRamp);
            ctx.lineWidth = isMajor ? layerLineWeight * 2 : layerLineWeight;
            ctx.lineJoin = 'round';
            ctx.lineCap = 'round';
            // STY-02: Configurable dash pattern
            const dp = layer.dashPattern || 'solid';
            ctx.setLineDash(dp === 'dashed' ? [8, 4] : dp === 'dotted' ? [2, 3] : dp === 'dashdot' ? [8, 3, 2, 3] : []);

            if (polylines && polylines.length > 0) {
              ctx.beginPath();
              for (const pl of polylines) {
                const pts = pl.points;
                if (pts.length < 2) continue;
                ctx.moveTo(pts[0][0] * scale + vx, pts[0][1] * scale + vy);
                for (let k = 1; k < pts.length; k++) {
                  ctx.lineTo(pts[k][0] * scale + vx, pts[k][1] * scale + vy);
                }
                if (pl.closed) ctx.closePath();
              }
              ctx.stroke();

              // ── Robust label placement ──
              if (layerShowLabels && isMajor) {
                const lbl = level.toFixed(1);
                for (const pl of polylines) {
                  if (pl.points.length < 3) continue;
                  // Compute total arc length and screen-space points
                  const screenPts = pl.points.map(p => [p[0] * scale + vx, p[1] * scale + vy]);
                  let totalLen = 0;
                  const cumLen = [0];
                  for (let k = 1; k < screenPts.length; k++) {
                    const ddx = screenPts[k][0] - screenPts[k - 1][0];
                    const ddy = screenPts[k][1] - screenPts[k - 1][1];
                    totalLen += Math.sqrt(ddx * ddx + ddy * ddy);
                    cumLen.push(totalLen);
                  }
                  if (totalLen < minScreenLen) continue;

                  // Place labels at regular intervals along this polyline
                  // Start offset: 30% of repeat spacing (stagger across lines)
                  const startOffset = repeatSpacing * 0.3;
                  for (let targetDist = startOffset; targetDist < totalLen - minScreenLen * 0.3; targetDist += repeatSpacing) {
                    // Walk to targetDist
                    let seg = -1;
                    for (let k = 1; k < cumLen.length; k++) {
                      if (cumLen[k] >= targetDist) { seg = k - 1; break; }
                    }
                    if (seg < 0) continue;
                    const segLen = cumLen[seg + 1] - cumLen[seg];
                    if (segLen < 1e-6) continue;
                    const frac = (targetDist - cumLen[seg]) / segLen;
                    const lx = screenPts[seg][0] + frac * (screenPts[seg + 1][0] - screenPts[seg][0]);
                    const ly = screenPts[seg][1] + frac * (screenPts[seg + 1][1] - screenPts[seg][1]);

                    // Skip if off-screen
                    if (lx < -30 || lx > w + 30 || ly < -30 || ly > h + 30) continue;

                    // Compute angle from local segment direction
                    // Use a slightly wider window for smoother angle estimation
                    let ax, ay;
                    const lookback = Math.max(0, seg - 1);
                    const lookahead = Math.min(screenPts.length - 1, seg + 2);
                    ax = screenPts[lookahead][0] - screenPts[lookback][0];
                    ay = screenPts[lookahead][1] - screenPts[lookback][1];
                    let angle = Math.atan2(ay, ax);
                    // Keep readable (not upside-down)
                    if (angle > Math.PI / 2) angle -= Math.PI;
                    else if (angle < -Math.PI / 2) angle += Math.PI;

                    // Curvature check: skip placement on sharp bends
                    // Compute angle change between adjacent segments around this point
                    if (seg > 0 && seg + 1 < screenPts.length - 1) {
                      const a1 = Math.atan2(screenPts[seg][1] - screenPts[seg - 1][1], screenPts[seg][0] - screenPts[seg - 1][0]);
                      const a2 = Math.atan2(screenPts[seg + 1][1] - screenPts[seg][1], screenPts[seg + 1][0] - screenPts[seg][0]);
                      let da = Math.abs(a2 - a1);
                      if (da > Math.PI) da = 2 * Math.PI - da;
                      if (da > 0.8) continue; // skip if bend > ~45°
                    }

                    // Collision check: occupy a rectangular region
                    const lblW = lbl.length * layerLabelSize * 0.7 + labelMargin;
                    const lblH = layerLabelSize + labelMargin;
                    const cosA = Math.cos(angle), sinA = Math.sin(angle);
                    // Check 4 corners of the rotated label rect
                    let collides = false;
                    for (let cx = -lblW / 2; cx <= lblW / 2; cx += lblW) {
                      for (let cy = -lblH / 2; cy <= lblH / 2; cy += lblH) {
                        const rx = lx + cx * cosA - cy * sinA;
                        const ry = ly + cx * sinA + cy * cosA;
                        const cellKey = ((rx / labelCellSize) | 0) * 100003 + ((ry / labelCellSize) | 0);
                        if (occupiedCells.has(cellKey)) { collides = true; break; }
                      }
                      if (collides) break;
                    }
                    if (collides) continue;

                    // Mark cells as occupied
                    for (let cx = -lblW / 2; cx <= lblW / 2; cx += labelCellSize * 0.5) {
                      for (let cy = -lblH / 2; cy <= lblH / 2; cy += labelCellSize * 0.5) {
                        const rx = lx + cx * cosA - cy * sinA;
                        const ry = ly + cx * sinA + cy * cosA;
                        occupiedCells.add(((rx / labelCellSize) | 0) * 100003 + ((ry / labelCellSize) | 0));
                      }
                    }

                    labelQueue.push({ lbl, lx, ly, angle, size: layerLabelSize });
                  }
                }
              }
            } else if (segments && segments.length > 0) {
              // Legacy segment-based rendering
              ctx.beginPath();
              for (let si = 0; si < segments.length; si++) {
                const [p1, p2] = segments[si];
                ctx.moveTo(p1[0] * scale + vx, p1[1] * scale + vy);
                ctx.lineTo(p2[0] * scale + vx, p2[1] * scale + vy);
              }
              ctx.stroke();
              if (layerShowLabels && isMajor && segments.length > 3) {
                const mid = segments[Math.floor(segments.length * 0.4)];
                if (mid) {
                  const mx = (mid[0][0] + mid[1][0]) / 2 * scale + vx, my = (mid[0][1] + mid[1][1]) / 2 * scale + vy;
                  if (mx > -30 && mx < w + 30 && my > -30 && my < h + 30) {
                    const ddx = mid[1][0] - mid[0][0], ddy = mid[1][1] - mid[0][1];
                    let angle = Math.atan2(ddy * scale, ddx * scale);
                    if (angle > Math.PI / 2) angle -= Math.PI;
                    else if (angle < -Math.PI / 2) angle += Math.PI;
                    labelQueue.push({ lbl: level.toFixed(1), lx: mx, ly: my, angle, size: layerLabelSize });
                  }
                }
              }
            }
          });

          // ── Draw all contour labels in a single pass (on top of all lines) ──
          if (labelQueue.length > 0) {
            for (const { lbl, lx, ly, angle, size } of labelQueue) {
              ctx.save();
              ctx.translate(lx, ly);
              ctx.rotate(angle);
              ctx.font = `bold ${size}px 'DM Sans',sans-serif`;
              ctx.textAlign = 'center';
              ctx.textBaseline = 'middle';
              // Halo for readability
              ctx.strokeStyle = isDark ? "#000000cc" : "#ffffffdd";
              ctx.lineWidth = 3.5;
              ctx.lineJoin = 'round';
              ctx.strokeText(lbl, 0, 0);
              ctx.fillStyle = isDark ? "#ffffffdd" : "#000000cc";
              ctx.fillText(lbl, 0, 0);
              ctx.restore();
            }
          }
        } else if (layer.type === "points" && points.length > 0) {
          const zRange = effectiveZRange.range;
          const baseSz = (layer.size || 4) * Math.min(scale / 0.5, 2);
          const lut = colorLUT;
          const ptColorMode = layer.colorMode || "ramp";
          const fixedColor = layer.color || C.accent;
          const markerShape = layer.shape || "circle";
          const sizeByZ = layer.sizeByAttribute || false;
          const sizeMin = (layer.sizeMin || 3) * Math.min(scale / 0.5, 2);
          const sizeMax = (layer.sizeMax || 12) * Math.min(scale / 0.5, 2);
          const filterMin = layer.filterMin;
          const filterMax = layer.filterMax;
          const hasFilter = filterMin !== undefined && filterMax !== undefined && filterMin !== filterMax;

          const useLOD = points.length > 8000;
          const binSize = useLOD ? Math.max(4, Math.round(baseSz * 1.5)) : 0;
          const drawnBins = useLOD ? new Set() : null;

          const hasDescFilter = hiddenDescs.size > 0;

          // Helper to draw marker shape
          const drawMarker = (cx, cy, r) => {
            switch (markerShape) {
              case "square":
                ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
                return;
              case "triangle":
                ctx.beginPath();
                ctx.moveTo(cx, cy - r * 1.15);
                ctx.lineTo(cx - r, cy + r * 0.7);
                ctx.lineTo(cx + r, cy + r * 0.7);
                ctx.closePath(); ctx.fill();
                return;
              case "diamond":
                ctx.beginPath();
                ctx.moveTo(cx, cy - r * 1.2);
                ctx.lineTo(cx + r, cy);
                ctx.lineTo(cx, cy + r * 1.2);
                ctx.lineTo(cx - r, cy);
                ctx.closePath(); ctx.fill();
                return;
              case "cross":
                const t = Math.max(1, r * 0.35);
                ctx.fillRect(cx - r, cy - t, r * 2, t * 2);
                ctx.fillRect(cx - t, cy - r, t * 2, r * 2);
                return;
              default: // circle
                ctx.beginPath();
                ctx.arc(cx, cy, r, 0, 6.2832);
                ctx.fill();
            }
          };

          for (let pi = 0; pi < points.length; pi++) {
            if (selectedPts.has(pi)) continue;
            const p = points[pi];
            if (hasDescFilter && hiddenDescs.has(String(p.desc || ""))) continue;
            if (hasFilter && (p.z < filterMin || p.z > filterMax)) continue;
            const sx = p.x * scale + vx, sy = p.y * scale + vy;
            if (sx < -10 || sx > w + 10 || sy < -10 || sy > h + 10) continue;

            if (useLOD) {
              const bx = (sx / binSize) | 0, by = (sy / binSize) | 0;
              const binKey = bx * 100003 + by;
              if (drawnBins.has(binKey)) continue;
              drawnBins.add(binKey);
            }

            // Compute size
            const sz = sizeByZ && zRange > 0
              ? sizeMin + ((p.z - effectiveZRange.zMin) / zRange) * (sizeMax - sizeMin)
              : baseSz;

            if (ptColorMode === "fixed") {
              ctx.fillStyle = fixedColor;
            } else {
              const t = bounds ? (p.z - effectiveZRange.zMin) / zRange : 0.5;
              const ci = Math.max(0, Math.min(255, (t * 255) | 0));
              const r = lut[ci * 3], g = lut[ci * 3 + 1], b = lut[ci * 3 + 2];
              ctx.fillStyle = `rgb(${r},${g},${b})`;
            }
            drawMarker(sx, sy, sz);
          }

          if (selectedPts.size > 0) {
            ctx.fillStyle = "#ff0";
            ctx.strokeStyle = "#ff0";
            ctx.lineWidth = 2;
            for (const pi of selectedPts) {
              if (pi >= points.length) continue;
              const p = points[pi];
              const sx = p.x * scale + vx, sy = p.y * scale + vy;
              if (sx < -10 || sx > w + 10 || sy < -10 || sy > h + 10) continue;
              ctx.beginPath();
              ctx.arc(sx, sy, baseSz * 1.5, 0, 6.2832);
              ctx.fill();
              ctx.stroke();
            }
          }
          const showPtNums = layer.showPointNumbers || false;
          const showPtLvls = layer.showPointLevels || false;
          const showPtDescs = layer.showPointDescs || false;
          if (showPtNums || showPtLvls || showPtDescs) {
            const lblFont = layer.labelFont || "'JetBrains Mono',monospace";
            const lblSize = layer.labelSize || 9;
            const haloW = layer.labelHaloWidth || 3;
            const haloCol = layer.labelHaloColor || (isDark ? "#000000cc" : "#ffffffdd");
            ctx.font = `bold ${lblSize}px ${lblFont}`;
            ctx.textAlign = "center";
            let labelCount = 0;
            for (let pi = 0; pi < points.length && labelCount < 2000; pi++) {
              const p = points[pi];
              if (hasDescFilter && hiddenDescs.has(String(p.desc || ""))) continue;
              if (hasFilter && (p.z < filterMin || p.z > filterMax)) continue;
              const sx = p.x * scale + vx, sy = p.y * scale + vy;
              if (sx < -10 || sx > w + 10 || sy < -10 || sy > h + 10) continue;
              if (useLOD && drawnBins) {
                const bx = (sx / binSize) | 0, by = (sy / binSize) | 0;
                const binKey = bx * 100003 + by;
                if (!drawnBins.has(binKey)) continue;
              }
              const parts = [];
              if (showPtNums && p.pointNo) parts.push(String(p.pointNo));
              if (showPtLvls) parts.push(p.z.toFixed(1));
              if (showPtDescs && p.desc) parts.push(String(p.desc));
              if (parts.length === 0) continue;
              const label = parts.join(" ");
              const ly = sy - baseSz - 4;
              ctx.strokeStyle = haloCol;
              ctx.lineWidth = haloW;
              ctx.lineJoin = "round";
              ctx.strokeText(label, sx, ly);
              ctx.fillStyle = isDark ? "#ffffffdd" : "#000000cc";
              ctx.fillText(label, sx, ly);
              labelCount++;
            }
          }
        }
        ctx.globalAlpha = 1;
      }

      // Lasso polygon (PNT-05)
      if (lassoPts.length > 0) {
        ctx.save();
        ctx.strokeStyle = "#06b6d4"; ctx.lineWidth = 2; ctx.setLineDash([6, 4]);
        ctx.fillStyle = "rgba(6,182,212,0.08)";
        ctx.beginPath();
        lassoPts.forEach((lp, i) => {
          const sx = lp.x * scale + vx, sy = lp.y * scale + vy;
          i === 0 ? ctx.moveTo(sx, sy) : ctx.lineTo(sx, sy);
        });
        if (lassoPts.length > 2) { ctx.closePath(); ctx.fill(); }
        ctx.stroke();
        ctx.setLineDash([]);
        // Draw vertices
        ctx.fillStyle = "#06b6d4";
        for (const lp of lassoPts) {
          const sx = lp.x * scale + vx, sy = lp.y * scale + vy;
          ctx.beginPath(); ctx.arc(sx, sy, 4, 0, 6.2832); ctx.fill();
        }
        ctx.restore();
      }

      // Selection box
      if (selectionBox) {
        ctx.strokeStyle = "#ffff00"; ctx.lineWidth = 1.5; ctx.setLineDash([5, 3]);
        ctx.strokeRect(selectionBox.x1, selectionBox.y1, selectionBox.x2 - selectionBox.x1, selectionBox.y2 - selectionBox.y1);
        ctx.setLineDash([]);
      }

      // Measurement overlay
      if (measurePts.length > 0) {
        const haloText = (text, x, y, font, color) => {
          ctx.font = font; ctx.textAlign = "center"; ctx.textBaseline = "middle";
          ctx.strokeStyle = "#fff"; ctx.lineWidth = 3; ctx.lineJoin = "round";
          ctx.strokeText(text, x, y); ctx.fillStyle = color; ctx.fillText(text, x, y);
        };
        const formatBearing = (deg) => {
          const d = ((deg % 360) + 360) % 360;
          let prefix, suffix, val;
          if (d <= 90) { prefix = "N"; suffix = "E"; val = d; }
          else if (d <= 180) { prefix = "S"; suffix = "E"; val = 180 - d; }
          else if (d <= 270) { prefix = "S"; suffix = "W"; val = d - 180; }
          else { prefix = "N"; suffix = "W"; val = 360 - d; }
          return `${prefix}${val.toFixed(1)}\u00B0${suffix}`;
        };
        // Sample Z values if grid available
        const zVals = measurePts.map(([px, py]) => {
          if (!gridData) return NaN;
          const { grid: g, gridX: gx, gridY: gy, nx: gnx, ny: gny } = gridData;
          return sampleGridZ(g, gx, gy, gnx, gny, px, py);
        });
        // Draw lines
        ctx.strokeStyle = "#ff4444"; ctx.lineWidth = 2.5; ctx.setLineDash([8, 4]);
        ctx.beginPath();
        measurePts.forEach(([mx, my], mi) => {
          const sx = mx * scale + vx, sy = my * scale + vy;
          mi === 0 ? ctx.moveTo(sx, sy) : ctx.lineTo(sx, sy);
        });
        if (measureMode === "area" && measurePts.length > 2) ctx.closePath();
        ctx.stroke(); ctx.setLineDash([]);
        // Per-segment labels at midpoint
        let cumDist = 0;
        for (let i = 0; i < measurePts.length - 1; i++) {
          const [x1, y1] = measurePts[i], [x2, y2] = measurePts[i + 1];
          const dist = measureDistance(x1, y1, x2, y2);
          cumDist += dist;
          const bearing = measureBearing(x1, y1, x2, y2);
          const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
          const sx = mx * scale + vx, sy = my * scale + vy;
          let segLabel = `${dist.toFixed(2)}  ${formatBearing(bearing)}`;
          // Slope label when Z available
          const z1 = zVals[i], z2 = zVals[i + 1];
          if (!isNaN(z1) && !isNaN(z2) && dist > 0) {
            const slope = ((z2 - z1) / dist) * 100;
            segLabel += `  ${slope >= 0 ? "+" : ""}${slope.toFixed(1)}%`;
          }
          haloText(segLabel, sx, sy - 10, "bold 11px 'DM Sans',sans-serif", "#cc0000");
        }
        // Closing segment labels for area mode
        if (measureMode === "area" && measurePts.length > 2) {
          const [x1, y1] = measurePts[measurePts.length - 1], [x2, y2] = measurePts[0];
          const dist = measureDistance(x1, y1, x2, y2);
          const bearing = measureBearing(x1, y1, x2, y2);
          const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
          const sx = mx * scale + vx, sy = my * scale + vy;
          let segLabel = `${dist.toFixed(2)}  ${formatBearing(bearing)}`;
          const z1 = zVals[measurePts.length - 1], z2 = zVals[0];
          if (!isNaN(z1) && !isNaN(z2) && dist > 0) {
            const slope = ((z2 - z1) / dist) * 100;
            segLabel += `  ${slope >= 0 ? "+" : ""}${slope.toFixed(1)}%`;
          }
          haloText(segLabel, sx, sy - 10, "bold 11px 'DM Sans',sans-serif", "#cc0000");
        }
        // Numbered vertex markers with cumulative distance and elevation
        cumDist = 0;
        measurePts.forEach(([mx, my], mi) => {
          const sx = mx * scale + vx, sy = my * scale + vy;
          if (mi > 0) cumDist += measureDistance(measurePts[mi - 1][0], measurePts[mi - 1][1], mx, my);
          // White filled circle with red border
          ctx.beginPath(); ctx.arc(sx, sy, 8, 0, Math.PI * 2);
          ctx.fillStyle = "#fff"; ctx.fill();
          ctx.strokeStyle = "#ff4444"; ctx.lineWidth = 2; ctx.stroke();
          // Index number
          ctx.font = "bold 10px 'DM Sans',sans-serif"; ctx.fillStyle = "#ff4444";
          ctx.textAlign = "center"; ctx.textBaseline = "middle";
          ctx.fillText(String(mi + 1), sx, sy);
          // Cumulative distance label (below vertex)
          if (mi > 0) {
            haloText(`\u03A3 ${cumDist.toFixed(2)}`, sx, sy + 18, "10px 'DM Sans',sans-serif", "#333");
          }
          // Elevation label (above vertex)
          const z = zVals[mi];
          if (!isNaN(z)) {
            haloText(`Z: ${z.toFixed(2)}`, sx, sy - 18, "10px 'DM Sans',sans-serif", "#0066cc");
          }
        });
        // Area + perimeter summary label
        if (measureMode === "area" && measurePts.length > 2) {
          const area = measurePolygonArea(measurePts);
          const perim = measurePolylineLength(measurePts) + measureDistance(measurePts[measurePts.length - 1][0], measurePts[measurePts.length - 1][1], measurePts[0][0], measurePts[0][1]);
          const cx = measurePts.reduce((s, p) => s + p[0], 0) / measurePts.length;
          const cy = measurePts.reduce((s, p) => s + p[1], 0) / measurePts.length;
          haloText(`Area: ${area.toFixed(2)} sq units`, cx * scale + vx, cy * scale + vy - 8, "bold 12px 'DM Sans',sans-serif", "#ff4444");
          haloText(`Perim: ${perim.toFixed(2)} units`, cx * scale + vx, cy * scale + vy + 8, "11px 'DM Sans',sans-serif", "#ff4444");
        } else if (measurePts.length >= 2) {
          // Total distance at last point
          const last = measurePts[measurePts.length - 1];
          const totalDist = measurePolylineLength(measurePts);
          haloText(`Total: ${totalDist.toFixed(2)} units`, last[0] * scale + vx + 20, last[1] * scale + vy - 20, "bold 12px 'DM Sans',sans-serif", "#ff4444");
        }
      }

      // Boundaries
      for (const b of boundaries) {
        const verts = b.vertices;
        if (verts.length < 2) continue;
        ctx.save();
        ctx.setLineDash([8, 4]);
        ctx.lineWidth = 2;
        ctx.strokeStyle = b.type === "outer" ? "#f97316" : "#ef4444";
        ctx.fillStyle = b.type === "outer" ? "rgba(249,115,22,0.08)" : "rgba(239,68,68,0.12)";
        ctx.beginPath();
        verts.forEach(([bx, by], vi) => {
          const sx = bx * scale + vx, sy = by * scale + vy;
          vi === 0 ? ctx.moveTo(sx, sy) : ctx.lineTo(sx, sy);
        });
        ctx.closePath(); ctx.fill(); ctx.stroke();
        // Vertex markers
        ctx.setLineDash([]);
        ctx.fillStyle = b.type === "outer" ? "#f97316" : "#ef4444";
        const bVr = editNodesMode ? 5 : 3;
        for (const [bx, by] of verts) {
          const sx = bx * scale + vx, sy = by * scale + vy;
          ctx.fillRect(sx - bVr, sy - bVr, bVr * 2, bVr * 2);
        }
        // Edit mode: midpoint "+" markers on edges
        if (editNodesMode) {
          ctx.strokeStyle = b.type === "outer" ? "#f97316" : "#ef4444";
          ctx.lineWidth = 1.5;
          for (let i = 0; i < verts.length; i++) {
            const j = (i + 1) % verts.length;
            const mx = (verts[i][0] + verts[j][0]) / 2 * scale + vx;
            const my = (verts[i][1] + verts[j][1]) / 2 * scale + vy;
            ctx.beginPath(); ctx.moveTo(mx - 4, my); ctx.lineTo(mx + 4, my); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(mx, my - 4); ctx.lineTo(mx, my + 4); ctx.stroke();
          }
        }
        ctx.restore();
      }

      // Breaklines (type-aware rendering)
      for (const bl of breaklines) {
        if (bl.visible === false) continue;
        const verts = bl.vertices;
        if (verts.length < 2) continue;
        const bType = bl.breaklineType || "standard";
        ctx.save();
        if (bType === "proximity") {
          // Dashed yellow line
          ctx.strokeStyle = "#fbbf24"; ctx.lineWidth = 2.5; ctx.setLineDash([8, 4]);
          ctx.beginPath();
          verts.forEach(([bx, by], vi) => {
            const sx = bx * scale + vx, sy = by * scale + vy;
            vi === 0 ? ctx.moveTo(sx, sy) : ctx.lineTo(sx, sy);
          });
          ctx.stroke(); ctx.setLineDash([]);
          // Vertex markers
          ctx.fillStyle = "#fbbf24";
          const pVr = editNodesMode ? 5 : 4;
          for (const v of verts) {
            const sx = v[0] * scale + vx, sy = v[1] * scale + vy;
            ctx.fillRect(sx - pVr, sy - pVr, pVr * 2, pVr * 2);
          }
          // "PROX" label at midpoint
          if (verts.length >= 2) {
            const mi = Math.floor(verts.length / 2);
            const msx = verts[mi][0] * scale + vx, msy = verts[mi][1] * scale + vy;
            ctx.font = "bold 9px 'JetBrains Mono',monospace"; ctx.textAlign = "center";
            ctx.fillStyle = "#fbbf24"; ctx.fillText("PROX", msx, msy - 10);
          }
          // Edit mode: midpoint "+" markers
          if (editNodesMode) {
            ctx.strokeStyle = "#fbbf24"; ctx.lineWidth = 1.5;
            for (let i = 0; i < verts.length - 1; i++) {
              const emx = (verts[i][0] + verts[i + 1][0]) / 2 * scale + vx;
              const emy = (verts[i][1] + verts[i + 1][1]) / 2 * scale + vy;
              ctx.beginPath(); ctx.moveTo(emx - 4, emy); ctx.lineTo(emx + 4, emy); ctx.stroke();
              ctx.beginPath(); ctx.moveTo(emx, emy - 4); ctx.lineTo(emx, emy + 4); ctx.stroke();
            }
          }
        } else if (bType === "wall") {
          // Thick double magenta/pink line
          ctx.strokeStyle = "#f472b6"; ctx.lineWidth = 4;
          ctx.beginPath();
          verts.forEach(([bx, by], vi) => {
            const sx = bx * scale + vx, sy = by * scale + vy;
            vi === 0 ? ctx.moveTo(sx, sy) : ctx.lineTo(sx, sy);
          });
          ctx.stroke();
          ctx.strokeStyle = "#be185d"; ctx.lineWidth = 1.5;
          ctx.beginPath();
          verts.forEach(([bx, by], vi) => {
            const sx = bx * scale + vx, sy = by * scale + vy;
            vi === 0 ? ctx.moveTo(sx, sy) : ctx.lineTo(sx, sy);
          });
          ctx.stroke();
          // Vertex markers with dual Z labels
          ctx.fillStyle = "#f472b6";
          ctx.font = "bold 9px 'JetBrains Mono',monospace"; ctx.textAlign = "center";
          const wVr = editNodesMode ? 5 : 4;
          for (const v of verts) {
            const sx = v[0] * scale + vx, sy = v[1] * scale + vy;
            ctx.fillRect(sx - wVr, sy - wVr, wVr * 2, wVr * 2);
            if (v[2] !== undefined && v[3] !== undefined) {
              const label = `${v[2].toFixed(1)}/${v[3].toFixed(1)}`;
              ctx.fillStyle = isDark ? "#ffffffcc" : "#000000bb";
              ctx.strokeStyle = isDark ? "#000000aa" : "#ffffffaa"; ctx.lineWidth = 2;
              ctx.strokeText(label, sx, sy - 10); ctx.fillText(label, sx, sy - 10);
              ctx.fillStyle = "#f472b6"; ctx.lineWidth = 4;
            }
          }
          // Edit mode: midpoint "+" markers
          if (editNodesMode) {
            ctx.strokeStyle = "#f472b6"; ctx.lineWidth = 1.5;
            for (let i = 0; i < verts.length - 1; i++) {
              const emx = (verts[i][0] + verts[i + 1][0]) / 2 * scale + vx;
              const emy = (verts[i][1] + verts[i + 1][1]) / 2 * scale + vy;
              ctx.beginPath(); ctx.moveTo(emx - 4, emy); ctx.lineTo(emx + 4, emy); ctx.stroke();
              ctx.beginPath(); ctx.moveTo(emx, emy - 4); ctx.lineTo(emx, emy + 4); ctx.stroke();
            }
          }
        } else {
          // Standard: Solid cyan, Z labels (original)
          ctx.strokeStyle = "#00e5ff"; ctx.lineWidth = 2.5;
          ctx.beginPath();
          verts.forEach(([bx, by], vi) => {
            const sx = bx * scale + vx, sy = by * scale + vy;
            vi === 0 ? ctx.moveTo(sx, sy) : ctx.lineTo(sx, sy);
          });
          ctx.stroke();
          ctx.fillStyle = "#00e5ff";
          ctx.font = "bold 9px 'JetBrains Mono',monospace"; ctx.textAlign = "center";
          const sVr = editNodesMode ? 5 : 4;
          for (const [bx, by, bz] of verts) {
            const sx = bx * scale + vx, sy = by * scale + vy;
            ctx.fillRect(sx - sVr, sy - sVr, sVr * 2, sVr * 2);
            if (bz !== undefined) {
              ctx.fillStyle = isDark ? "#ffffffcc" : "#000000bb";
              ctx.strokeStyle = isDark ? "#000000aa" : "#ffffffaa"; ctx.lineWidth = 2;
              ctx.strokeText(bz.toFixed(1), sx, sy - 8); ctx.fillText(bz.toFixed(1), sx, sy - 8);
              ctx.fillStyle = "#00e5ff"; ctx.lineWidth = 2.5;
            }
          }
          // Edit mode: midpoint "+" markers
          if (editNodesMode) {
            ctx.strokeStyle = "#00e5ff"; ctx.lineWidth = 1.5;
            for (let i = 0; i < verts.length - 1; i++) {
              const emx = (verts[i][0] + verts[i + 1][0]) / 2 * scale + vx;
              const emy = (verts[i][1] + verts[i + 1][1]) / 2 * scale + vy;
              ctx.beginPath(); ctx.moveTo(emx - 4, emy); ctx.lineTo(emx + 4, emy); ctx.stroke();
              ctx.beginPath(); ctx.moveTo(emx, emy - 4); ctx.lineTo(emx, emy + 4); ctx.stroke();
            }
          }
        }
        ctx.restore();
      }

      // Drawing preview (in-progress boundary or breakline)
      // ── TIN Mesh Overlay ──────────────────────────────────────────────────
      if (tinMesh && showTinMesh) {
        ctx.save();
        ctx.globalAlpha = 0.35;
        // Draw filled triangles (Z-colored)
        const tris = getTrianglesForRender(tinMesh);
        const tinZMin = Math.min(...tinMesh.vertices.map(v => v.z));
        const tinZMax = Math.max(...tinMesh.vertices.map(v => v.z));
        const tinRange = tinZMax - tinZMin || 1;
        for (const tri of tris) {
          const avgZ = (tri.v0.z + tri.v1.z + tri.v2.z) / 3;
          const t = (avgZ - tinZMin) / tinRange;
          ctx.fillStyle = getColorFromRamp(Math.min(1, t * 0.8 + 0.1), activeColorRamp);
          ctx.beginPath();
          ctx.moveTo(tri.v0.x * scale + vx, tri.v0.y * scale + vy);
          ctx.lineTo(tri.v1.x * scale + vx, tri.v1.y * scale + vy);
          ctx.lineTo(tri.v2.x * scale + vx, tri.v2.y * scale + vy);
          ctx.closePath();
          if (tri.locked) { ctx.fillStyle = "rgba(255,200,0,0.15)"; }
          ctx.fill();
        }
        ctx.globalAlpha = 1;
        // Draw wireframe edges
        const edges = getEdges(tinMesh);
        ctx.lineWidth = 0.5;
        for (const [a, b] of edges) {
          const va = tinMesh.vertices[a], vb = tinMesh.vertices[b];
          const sx1 = va.x * scale + vx, sy1 = va.y * scale + vy;
          const sx2 = vb.x * scale + vx, sy2 = vb.y * scale + vy;
          // Skip off-screen edges
          if (sx1 < -50 && sx2 < -50) continue;
          if (sx1 > w + 50 && sx2 > w + 50) continue;
          if (sy1 < -50 && sy2 < -50) continue;
          if (sy1 > h + 50 && sy2 > h + 50) continue;
          ctx.strokeStyle = isConstrainedEdge(tinMesh, a, b) ? "#f97316" : (isDark ? "rgba(255,255,255,0.4)" : "rgba(0,0,0,0.35)");
          if (isConstrainedEdge(tinMesh, a, b)) ctx.lineWidth = 2;
          else ctx.lineWidth = 0.5;
          ctx.beginPath();
          ctx.moveTo(sx1, sy1);
          ctx.lineTo(sx2, sy2);
          ctx.stroke();
        }
        // Highlight selection
        if (tinSelection) {
          if (tinSelection.type === "triangle") {
            const t = tinMesh.triangles[tinSelection.index];
            if (t && t.alive) {
              const v0 = tinMesh.vertices[t.v0], v1 = tinMesh.vertices[t.v1], v2 = tinMesh.vertices[t.v2];
              ctx.fillStyle = "rgba(59,130,246,0.35)";
              ctx.strokeStyle = "#3b82f6"; ctx.lineWidth = 2;
              ctx.beginPath();
              ctx.moveTo(v0.x * scale + vx, v0.y * scale + vy);
              ctx.lineTo(v1.x * scale + vx, v1.y * scale + vy);
              ctx.lineTo(v2.x * scale + vx, v2.y * scale + vy);
              ctx.closePath(); ctx.fill(); ctx.stroke();
            }
          } else if (tinSelection.type === "edge" && tinSelection.edgeVerts) {
            const [ea, eb] = tinSelection.edgeVerts;
            const va = tinMesh.vertices[ea], vb = tinMesh.vertices[eb];
            ctx.strokeStyle = "#3b82f6"; ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.moveTo(va.x * scale + vx, va.y * scale + vy);
            ctx.lineTo(vb.x * scale + vx, vb.y * scale + vy);
            ctx.stroke();
            // Show swap preview
            if (tinSelection.preview) {
              const pv = tinSelection.preview;
              const na = tinMesh.vertices[pv.newEdge[0]], nb = tinMesh.vertices[pv.newEdge[1]];
              ctx.strokeStyle = "#22c55e"; ctx.lineWidth = 2; ctx.setLineDash([6, 3]);
              ctx.beginPath();
              ctx.moveTo(na.x * scale + vx, na.y * scale + vy);
              ctx.lineTo(nb.x * scale + vx, nb.y * scale + vy);
              ctx.stroke(); ctx.setLineDash([]);
            }
          } else if (tinSelection.type === "vertex") {
            const v = tinMesh.vertices[tinSelection.index];
            if (v) {
              ctx.fillStyle = "#3b82f6"; ctx.strokeStyle = "#fff"; ctx.lineWidth = 2;
              ctx.beginPath();
              ctx.arc(v.x * scale + vx, v.y * scale + vy, 6, 0, Math.PI * 2);
              ctx.fill(); ctx.stroke();
              // Show Z label
              ctx.font = "bold 11px 'JetBrains Mono',monospace";
              ctx.textAlign = "center";
              ctx.fillStyle = "#fff";
              ctx.strokeStyle = "#000"; ctx.lineWidth = 3;
              ctx.strokeText(`Z: ${v.z.toFixed(2)}`, v.x * scale + vx, v.y * scale + vy - 12);
              ctx.fillText(`Z: ${v.z.toFixed(2)}`, v.x * scale + vx, v.y * scale + vy - 12);
            }
          }
        }
        ctx.restore();
      }

      if (drawPts.length > 0 && drawMode) {
        ctx.save();
        const isBoundary = drawMode.startsWith("boundary");
        const previewColor = drawMode === "boundary_outer" ? "#f97316" : drawMode === "boundary_inner" ? "#ef4444"
          : drawMode === "breakline_proximity" ? "#fbbf24" : drawMode === "breakline_wall" ? "#f472b6" : "#00e5ff";
        ctx.strokeStyle = previewColor;
        ctx.lineWidth = 2;
        if (isBoundary) ctx.setLineDash([6, 4]);
        ctx.beginPath();
        drawPts.forEach((pt, pi) => {
          const sx = pt[0] * scale + vx, sy = pt[1] * scale + vy;
          pi === 0 ? ctx.moveTo(sx, sy) : ctx.lineTo(sx, sy);
        });
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = previewColor;
        for (const pt of drawPts) {
          const sx = pt[0] * scale + vx, sy = pt[1] * scale + vy;
          ctx.fillRect(sx - 3, sy - 3, 6, 6);
        }
        ctx.restore();
      }

      // Snap indicator (green dashed circle with crosshair)
      if (drawMode && snapPointRef.current) {
        const sp = snapPointRef.current;
        ctx.save();
        ctx.strokeStyle = "#22c55e"; ctx.lineWidth = 1.5; ctx.setLineDash([4, 3]);
        ctx.beginPath(); ctx.arc(sp.screenX, sp.screenY, 12, 0, Math.PI * 2); ctx.stroke();
        ctx.setLineDash([]);
        ctx.beginPath(); ctx.moveTo(sp.screenX - 6, sp.screenY); ctx.lineTo(sp.screenX + 6, sp.screenY); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(sp.screenX, sp.screenY - 6); ctx.lineTo(sp.screenX, sp.screenY + 6); ctx.stroke();
        ctx.restore();
      }

      // Empty state
      if (points.length === 0 && !gridData) {
        ctx.fillStyle = isDark ? C.textDim : "#6b728088"; ctx.font = "14px 'DM Sans',sans-serif"; ctx.textAlign = "center";
        ctx.fillText("Drop a file here or use the Import panel", w / 2, h / 2 - 10);
        ctx.font = "11px 'DM Sans',sans-serif"; ctx.fillStyle = isDark ? C.textDim + "88" : "#6b728055";
        ctx.fillText("Supports CSV, TSV, GeoJSON — No point limit", w / 2, h / 2 + 14);
      }

      // Color bar
      if (gridData && layers.some(l => l.type === "raster" && l.visible)) {
        const rampForBar = activeColorRamp;
        const barW = 16, barH = 180, barX = w - 50, barY = h / 2 - barH / 2;
        ctx.fillStyle = isDark ? "rgba(6,11,24,0.7)" : "rgba(255,255,255,0.7)";
        ctx.beginPath(); ctx.roundRect(barX - 8, barY - 10, barW + 68, barH + 20, 6); ctx.fill();
        for (let i = 0; i < barH; i++) { ctx.fillStyle = getColorFromRamp(1 - i / barH, rampForBar); ctx.fillRect(barX, barY + i, barW, 2); }
        ctx.strokeStyle = isDark ? C.panelBorder : "#bcc2cc"; ctx.lineWidth = 1; ctx.strokeRect(barX, barY, barW, barH);
        ctx.fillStyle = isDark ? C.text : "#374151"; ctx.font = "10px 'DM Sans',sans-serif"; ctx.textAlign = "left";
        ctx.fillText(gridData.zMax.toFixed(1), barX + barW + 6, barY + 8);
        ctx.fillText(((gridData.zMax + gridData.zMin) / 2).toFixed(1), barX + barW + 6, barY + barH / 2 + 3);
        ctx.fillText(gridData.zMin.toFixed(1), barX + barW + 6, barY + barH);
      }

      // Compass
      if (showCompass) {
        const cx = w - 80, cy = 60, r = 36;
        ctx.beginPath(); ctx.arc(cx, cy, r + 6, 0, Math.PI * 2); ctx.fillStyle = "rgba(0,0,0,0.25)"; ctx.fill();
        ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fillStyle = isDark ? "rgba(15,22,41,0.9)" : "rgba(255,255,255,0.9)"; ctx.fill();
        ctx.strokeStyle = isDark ? C.panelBorder : "#bcc2cc"; ctx.lineWidth = 2; ctx.stroke();
        ctx.beginPath(); ctx.moveTo(cx, cy + r - 10); ctx.lineTo(cx - 10, cy); ctx.lineTo(cx + 10, cy); ctx.closePath(); ctx.fillStyle = C.accent; ctx.fill();
        ctx.beginPath(); ctx.moveTo(cx, cy - r + 10); ctx.lineTo(cx - 10, cy); ctx.lineTo(cx + 10, cy); ctx.closePath(); ctx.fillStyle = isDark ? "#334155" : "#94a3b8"; ctx.fill();
        ctx.font = "bold 14px 'DM Sans',sans-serif"; ctx.fillStyle = C.accent; ctx.textAlign = "center"; ctx.fillText("N", cx, cy + r - 2);
      }
    }); // end requestAnimationFrame
    return () => { if (rafIdRef.current) cancelAnimationFrame(rafIdRef.current); };
  }, [points, gridData, contourData, filledContourData, hillshadeData, viewState, layers, bounds, baseMap, showGridLines, showCoordLabels, showCompass, viewMode, view3D, compMode, selectedPts, selectionBox, measurePts, measureMode, isDark, tileGen, boundaries, breaklines, drawPts, drawMode, isSnapped, projectCRS, isGeographic, editNodesMode, activeColorRamp, effectiveZRange, colorLUT, hiddenDescs, lassoPts]);

  // ── Snap helper ────────────────────────────────────────────────────────────
  const findSnapPoint = (screenX, screenY) => {
    if (points.length === 0) return null;
    let closest = null, closestDist = 20; // 20px threshold
    for (let i = 0; i < points.length; i++) {
      const p = points[i];
      const sx = p.x * viewState.scale + viewState.x;
      const sy = p.y * viewState.scale + viewState.y;
      const d = Math.sqrt((sx - screenX) ** 2 + (sy - screenY) ** 2);
      if (d < closestDist) { closest = { x: p.x, y: p.y, z: p.z, screenX: sx, screenY: sy }; closestDist = d; }
    }
    return closest;
  };

  // ── Edge hit detection for edit-nodes mode ───────────────────────────────
  const findNearestEdge = (screenX, screenY) => {
    const hitRadius = 8;
    let best = null, bestDist = hitRadius;
    const testEdge = (type, id, v0, v1, segIdx) => {
      const ax = v0[0] * viewState.scale + viewState.x, ay = v0[1] * viewState.scale + viewState.y;
      const bx = v1[0] * viewState.scale + viewState.x, by = v1[1] * viewState.scale + viewState.y;
      const dx = bx - ax, dy = by - ay;
      const lenSq = dx * dx + dy * dy;
      if (lenSq === 0) return;
      let t = ((screenX - ax) * dx + (screenY - ay) * dy) / lenSq;
      t = Math.max(0, Math.min(1, t));
      const px = ax + t * dx, py = ay + t * dy;
      const d = Math.sqrt((screenX - px) ** 2 + (screenY - py) ** 2);
      if (d < bestDist) { bestDist = d; best = { type, id, segmentIdx: segIdx, t }; }
    };
    for (const b of boundaries) {
      const v = b.vertices;
      for (let i = 0; i < v.length; i++) {
        const j = (i + 1) % v.length; // closed loop
        testEdge("boundary", b.id, v[i], v[j], i);
      }
    }
    for (const bl of breaklines) {
      const v = bl.vertices;
      for (let i = 0; i < v.length - 1; i++) {
        testEdge("breakline", bl.id, v[i], v[i + 1], i);
      }
    }
    return best;
  };

  // ── Mouse Handlers ─────────────────────────────────────────────────────────
  const handleMouseDown = (e) => {
    // Draw mode for boundaries/breaklines
    if (drawMode) {
      pushHistory();
      const rect = canvasRef.current.getBoundingClientRect();
      let mx = (e.clientX - rect.left - viewState.x) / viewState.scale;
      let my = (e.clientY - rect.top - viewState.y) / viewState.scale;
      const snap = snapEnabled ? snapPointRef.current : null;
      if (snap) { mx = snap.x; my = snap.y; }

      if (drawMode === "breakline_standard") {
        // Standard: snap → Z; else grid interp → Z; else prompt
        if (snap) {
          setDrawPts(prev => [...prev, [mx, my, snap.z]]);
        } else if (gridData) {
          const { grid, gridX, gridY, nx, ny } = gridData;
          const cellDx = gridX[1] - gridX[0], cellDy = gridY[1] - gridY[0];
          const gi = Math.round((mx - gridX[0]) / cellDx);
          const gj = Math.round((my - gridY[0]) / cellDy);
          if (gi >= 0 && gi < nx && gj >= 0 && gj < ny && !isNaN(grid[gj * nx + gi])) {
            setDrawPts(prev => [...prev, [mx, my, grid[gj * nx + gi]]]);
          } else {
            setPendingZ({ x: mx, y: my }); setZInputValue("");
          }
        } else {
          setPendingZ({ x: mx, y: my }); setZInputValue("");
        }
      } else if (drawMode === "breakline_proximity") {
        // Proximity: just 2D, no Z needed
        setDrawPts(prev => [...prev, [mx, my]]);
      } else if (drawMode === "breakline_wall") {
        // Wall: snap/grid → zTop, prompt zBottom; else prompt both
        if (snap) {
          setPendingZ({ x: mx, y: my, wallMode: "bottom_only", zTop: snap.z }); setZInputValue(""); setZInputValue2("");
        } else if (gridData) {
          const { grid, gridX, gridY, nx, ny } = gridData;
          const cellDx = gridX[1] - gridX[0], cellDy = gridY[1] - gridY[0];
          const gi = Math.round((mx - gridX[0]) / cellDx);
          const gj = Math.round((my - gridY[0]) / cellDy);
          if (gi >= 0 && gi < nx && gj >= 0 && gj < ny && !isNaN(grid[gj * nx + gi])) {
            setPendingZ({ x: mx, y: my, wallMode: "bottom_only", zTop: grid[gj * nx + gi] }); setZInputValue(""); setZInputValue2("");
          } else {
            setPendingZ({ x: mx, y: my, wallMode: "both" }); setZInputValue(""); setZInputValue2("");
          }
        } else {
          setPendingZ({ x: mx, y: my, wallMode: "both" }); setZInputValue(""); setZInputValue2("");
        }
      } else {
        // Boundary modes — just add XY vertex (with snap for precision)
        setDrawPts(prev => [...prev, [mx, my]]);
      }
      return;
    }
    if (measureMode) {
      const rect = canvasRef.current.getBoundingClientRect();
      const mx = (e.clientX - rect.left - viewState.x) / viewState.scale;
      const my = (e.clientY - rect.top - viewState.y) / viewState.scale;
      setMeasurePts(prev => [...prev, [mx, my]]);
      return;
    }
    // ── Node editing: click near a boundary/breakline vertex to start dragging ──
    if (!drawMode && !measureMode && !e.shiftKey) {
      const rect = canvasRef.current.getBoundingClientRect();
      const screenX = e.clientX - rect.left, screenY = e.clientY - rect.top;
      const hitRadius = 8; // pixels
      let bestDist = hitRadius, bestHit = null;
      // Check boundary vertices
      for (const b of boundaries) {
        for (let vi = 0; vi < b.vertices.length; vi++) {
          const sx = b.vertices[vi][0] * viewState.scale + viewState.x;
          const sy = b.vertices[vi][1] * viewState.scale + viewState.y;
          const d = Math.sqrt((sx - screenX) ** 2 + (sy - screenY) ** 2);
          if (d < bestDist) { bestDist = d; bestHit = { type: "boundary", id: b.id, vertexIdx: vi }; }
        }
      }
      // Check breakline vertices
      for (const bl of breaklines) {
        for (let vi = 0; vi < bl.vertices.length; vi++) {
          const sx = bl.vertices[vi][0] * viewState.scale + viewState.x;
          const sy = bl.vertices[vi][1] * viewState.scale + viewState.y;
          const d = Math.sqrt((sx - screenX) ** 2 + (sy - screenY) ** 2);
          if (d < bestDist) { bestDist = d; bestHit = { type: "breakline", id: bl.id, vertexIdx: vi }; }
        }
      }
      if (bestHit) {
        pushHistory();
        nodeEditRef.current = { dragging: true, ...bestHit };
        return;
      }
      // Edit Nodes mode: click on edge to insert vertex
      if (editNodesMode) {
        const edgeHit = findNearestEdge(screenX, screenY);
        if (edgeHit) {
          pushHistory();
          const mx = (e.clientX - canvasRef.current.getBoundingClientRect().left - viewState.x) / viewState.scale;
          const my = (e.clientY - canvasRef.current.getBoundingClientRect().top - viewState.y) / viewState.scale;
          if (edgeHit.type === "boundary") {
            setBoundaries(prev => prev.map(b => {
              if (b.id !== edgeHit.id) return b;
              const nv = [...b.vertices];
              const insertIdx = (edgeHit.segmentIdx + 1) % (nv.length + 1);
              nv.splice(edgeHit.segmentIdx + 1, 0, [mx, my]);
              return { ...b, vertices: nv };
            }));
          } else {
            setBreaklines(prev => prev.map(bl => {
              if (bl.id !== edgeHit.id) return bl;
              const nv = [...bl.vertices];
              const v0 = nv[edgeHit.segmentIdx], v1 = nv[edgeHit.segmentIdx + 1];
              const t = edgeHit.t;
              let newVert;
              const bType = bl.breaklineType || "standard";
              if (bType === "wall" && v0.length >= 4 && v1.length >= 4) {
                const zTop = v0[2] + t * (v1[2] - v0[2]);
                const zBot = v0[3] + t * (v1[3] - v0[3]);
                newVert = [mx, my, zTop, zBot];
              } else if (bType === "standard" && v0.length >= 3 && v1.length >= 3) {
                const z = v0[2] + t * (v1[2] - v0[2]);
                newVert = [mx, my, z];
              } else {
                newVert = [mx, my];
              }
              nv.splice(edgeHit.segmentIdx + 1, 0, newVert);
              return { ...bl, vertices: nv };
            }));
          }
          return;
        }
      }
    }
    // Alt+click: lasso polygon selection
    if (e.altKey && !drawMode && !tinEditMode) {
      const rect = canvasRef.current.getBoundingClientRect();
      const mx = (e.clientX - rect.left - viewState.x) / viewState.scale;
      const my = (e.clientY - rect.top - viewState.y) / viewState.scale;
      setLassoPts(prev => [...prev, { x: mx, y: my }]);
      return;
    }
    if (e.shiftKey) {
      selRef.current = { selecting: true, sx: e.clientX, sy: e.clientY };
      setSelectionBox({ x1: e.clientX - canvasRef.current.getBoundingClientRect().left, y1: e.clientY - canvasRef.current.getBoundingClientRect().top, x2: e.clientX - canvasRef.current.getBoundingClientRect().left, y2: e.clientY - canvasRef.current.getBoundingClientRect().top });
      return;
    }
    dragRef.current = { dragging: true, startX: e.clientX, startY: e.clientY, startViewX: viewState.x, startViewY: viewState.y };
  };
  const handleMouseMove = (e) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (rect) {
      lastMouseRef.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
      const mx = (e.clientX - rect.left - viewState.x) / viewState.scale;
      const my = (e.clientY - rect.top - viewState.y) / viewState.scale;
      cursorCoordsRef.current = { x: mx.toFixed(2), y: my.toFixed(2) };
      if (coordsContainerRef.current) coordsContainerRef.current.style.display = 'flex';
      if (coordsXRef.current) coordsXRef.current.textContent = mx.toFixed(2);
      if (coordsYRef.current) coordsYRef.current.textContent = my.toFixed(2);
      // Grid Z probe (integrates sampleGridZ)
      if (coordsZRef.current) {
        if (gridData) {
          const zVal = sampleGridZ(gridData.grid, gridData.gridX, gridData.gridY, gridData.nx, gridData.ny, mx, my);
          coordsZRef.current.textContent = isNaN(zVal) ? '—' : zVal.toFixed(2);
          coordsZRef.current.parentElement.style.display = '';
        } else {
          coordsZRef.current.parentElement.style.display = 'none';
        }
      }
      // Dual CRS display (CRS-06)
      if (coordsSecRef.current) {
        if (projectCRS && projectCRS !== 'LOCAL' && projectCRS !== 'EPSG:4326') {
          try {
            const [lon, lat] = transformCoord(mx, my, projectCRS, 'EPSG:4326');
            coordsSecRef.current.textContent = `${lat.toFixed(6)}°N, ${lon.toFixed(6)}°E`;
            coordsSecRef.current.parentElement.style.display = '';
          } catch { coordsSecRef.current.parentElement.style.display = 'none'; }
        } else if (projectCRS === 'EPSG:4326') {
          coordsSecRef.current.parentElement.style.display = 'none';
        } else {
          coordsSecRef.current.parentElement.style.display = 'none';
        }
      }
      // Snap-to-points during draw mode
      if (drawMode && snapEnabled) {
        const snap = findSnapPoint(e.clientX - rect.left, e.clientY - rect.top);
        snapPointRef.current = snap;
        const wasSnapped = isSnapped;
        if (!!snap !== wasSnapped) setIsSnapped(!!snap);
      } else if (snapPointRef.current) {
        snapPointRef.current = null;
        if (isSnapped) setIsSnapped(false);
      }
    }
    // Node editing drag
    if (nodeEditRef.current.dragging && rect) {
      const mx = (e.clientX - rect.left - viewState.x) / viewState.scale;
      const my = (e.clientY - rect.top - viewState.y) / viewState.scale;
      const { type, id, vertexIdx } = nodeEditRef.current;
      if (type === "boundary") {
        setBoundaries(prev => prev.map(b => {
          if (b.id !== id) return b;
          const nv = b.vertices.map((v, i) => i === vertexIdx ? [mx, my] : v);
          return { ...b, vertices: nv };
        }));
      } else if (type === "breakline") {
        setBreaklines(prev => prev.map(bl => {
          if (bl.id !== id) return bl;
          const nv = bl.vertices.map((v, i) => {
            if (i !== vertexIdx) return v;
            // Preserve z values for standard/wall breaklines
            return v.length >= 3 ? [mx, my, ...v.slice(2)] : [mx, my];
          });
          return { ...bl, vertices: nv };
        }));
      }
      return;
    }
    if (selRef.current.selecting && rect) {
      setSelectionBox(prev => prev ? { ...prev, x2: e.clientX - rect.left, y2: e.clientY - rect.top } : null);
      return;
    }
    if (dragRef.current.dragging) {
      setViewState(prev => ({ ...prev, x: dragRef.current.startViewX + (e.clientX - dragRef.current.startX), y: dragRef.current.startViewY + (e.clientY - dragRef.current.startY) }));
    }
  };
  const handleMouseUp = (e) => {
    // Finish node edit drag
    if (nodeEditRef.current.dragging) {
      nodeEditRef.current = { dragging: false, type: null, id: null, vertexIdx: -1 };
      return;
    }
    if (selRef.current.selecting && selectionBox) {
      const { x: vx, y: vy, scale: sc } = viewState;
      const x1 = Math.min(selectionBox.x1, selectionBox.x2), x2 = Math.max(selectionBox.x1, selectionBox.x2);
      const y1 = Math.min(selectionBox.y1, selectionBox.y2), y2 = Math.max(selectionBox.y1, selectionBox.y2);
      const sel = new Set();
      points.forEach((p, i) => {
        const sx = p.x * sc + vx, sy = p.y * sc + vy;
        if (sx >= x1 && sx <= x2 && sy >= y1 && sy <= y2) sel.add(i);
      });
      setSelectedPts(sel);
      setSelectionBox(null);
      selRef.current.selecting = false;
      return;
    }
    dragRef.current.dragging = false;
  };
  const handleCanvasClick = (e) => {
    // ── TIN editing mode ──
    if (tinEditMode && tinMesh) {
      const rect = canvasRef.current.getBoundingClientRect();
      const cx = e.clientX - rect.left, cy = e.clientY - rect.top;
      const worldX = (cx - viewState.x) / viewState.scale;
      const worldY = (cy - viewState.y) / viewState.scale;
      const tol = 10 / viewState.scale; // 10px tolerance in world coords

      if (tinEditMode === "select") {
        // Select triangle
        const ti = findTriangleAt(tinMesh, worldX, worldY);
        setTinSelection(ti >= 0 ? { type: "triangle", index: ti } : null);
      } else if (tinEditMode === "swap") {
        // Find and swap nearest edge
        const hit = findEdgeAt(tinMesh, worldX, worldY, tol);
        if (hit) {
          const [va, vb] = hit.edgeVerts;
          const preview = getSwapPreview(tinMesh, va, vb);
          if (tinSelection?.type === "edge" && tinSelection.edgeVerts[0] === va && tinSelection.edgeVerts[1] === vb) {
            // Second click: perform swap
            const clone = JSON.parse(JSON.stringify(tinMesh));
            clone.edgeToTri = new Map(Object.entries(JSON.parse(JSON.stringify(Object.fromEntries(tinMesh.edgeToTri)))));
            clone.constrainedEdges = new Set(tinMesh.constrainedEdges);
            clone.undoStack = [...tinMesh.undoStack]; clone.redoStack = [...tinMesh.redoStack];
            clone.vertToTri = tinMesh.vertToTri.map(a => [...a]);
            if (swapEdge(tinMesh, va, vb)) {
              setTinMesh({ ...tinMesh });
              setTinSelection(null);
            }
          } else {
            setTinSelection({ type: "edge", edgeVerts: [va, vb], preview });
          }
        } else { setTinSelection(null); }
      } else if (tinEditMode === "insert") {
        // Insert point at click location
        const z = tinMesh.vertices.length > 0
          ? tinMesh.vertices.reduce((s, v) => s + v.z, 0) / tinMesh.vertices.length : 0;
        const vi = insertPoint(tinMesh, worldX, worldY, z);
        if (vi >= 0) {
          setTinMesh({ ...tinMesh });
          setTinSelection({ type: "vertex", index: vi });
          setTinZInput(z.toFixed(2));
        }
      } else if (tinEditMode === "delete_pt") {
        const hit = findVertexAt(tinMesh, worldX, worldY, tol);
        if (hit && deletePoint(tinMesh, hit.vertIndex)) {
          setTinMesh({ ...tinMesh });
          setTinSelection(null);
        }
      } else if (tinEditMode === "delete_tri") {
        const ti = findTriangleAt(tinMesh, worldX, worldY);
        if (ti >= 0 && deleteTriangle(tinMesh, ti)) {
          setTinMesh({ ...tinMesh });
          setTinSelection(null);
        }
      } else if (tinEditMode === "flatten") {
        const ti = findTriangleAt(tinMesh, worldX, worldY);
        if (ti >= 0 && flattenTriangle(tinMesh, ti)) {
          setTinMesh({ ...tinMesh });
          setTinSelection({ type: "triangle", index: ti });
        }
      } else if (tinEditMode === "modify_z") {
        const hit = findVertexAt(tinMesh, worldX, worldY, tol);
        if (hit) {
          setTinSelection({ type: "vertex", index: hit.vertIndex });
          setTinZInput(tinMesh.vertices[hit.vertIndex].z.toFixed(2));
        }
      } else if (tinEditMode === "lock") {
        const ti = findTriangleAt(tinMesh, worldX, worldY);
        if (ti >= 0) {
          const t = tinMesh.triangles[ti];
          lockTriangle(tinMesh, ti, !t.locked);
          setTinMesh({ ...tinMesh });
          setTinSelection({ type: "triangle", index: ti });
        }
      } else if (tinEditMode === "breakline") {
        const hit = findVertexAt(tinMesh, worldX, worldY, tol);
        if (hit) {
          if (tinSelection?.type === "vertex" && tinSelection.index !== hit.vertIndex) {
            addBreakline(tinMesh, tinSelection.index, hit.vertIndex);
            setTinMesh({ ...tinMesh });
            setTinSelection(null);
          } else {
            setTinSelection({ type: "vertex", index: hit.vertIndex });
          }
        }
      }
      return;
    }

    if (points.length === 0) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const cx = e.clientX - rect.left, cy = e.clientY - rect.top;
    let closest = -1, closestDist = 20;
    points.forEach((p, i) => {
      const sx = p.x * viewState.scale + viewState.x, sy = p.y * viewState.scale + viewState.y;
      const d = Math.sqrt((sx - cx) ** 2 + (sy - cy) ** 2);
      if (d < closestDist) { closest = i; closestDist = d; }
    });
    if (closest >= 0) {
      if (e.ctrlKey) { setSelectedPts(prev => { const n = new Set(prev); n.has(closest) ? n.delete(closest) : n.add(closest); return n; }); }
      else { setSelectedPts(new Set([closest])); }
    } else { setSelectedPts(new Set()); }
  };

  const handleCanvasDblClick = (e) => {
    // PNT-05: Close lasso polygon and select points
    if (lassoPts.length >= 3) {
      e.preventDefault();
      const poly = lassoPts.map(lp => [lp.x, lp.y]);
      const sel = new Set();
      points.forEach((p, i) => {
        if (pointInPolygon([p.x, p.y], poly)) sel.add(i);
      });
      setSelectedPts(sel);
      setLassoPts([]);
      return;
    }
    if (!drawMode || drawPts.length < 2) return;
    e.preventDefault();
    // Remove duplicate consecutive vertices
    const cleaned = drawPts.filter((v, i) => i === 0 || v[0] !== drawPts[i - 1][0] || v[1] !== drawPts[i - 1][1]);
    if (cleaned.length < 2) { setDrawMode(null); setDrawPts([]); setPendingZ(null); setZInputValue(""); setZInputValue2(""); snapPointRef.current = null; setIsSnapped(false); return; }
    pushHistory();
    if (drawMode.startsWith("boundary")) {
      if (cleaned.length >= 3) {
        const type = drawMode === "boundary_outer" ? "outer" : "inner";
        setBoundaries(prev => [...prev, { id: Date.now(), name: `${type === "outer" ? "Outer" : "Inner"} Boundary ${prev.length + 1}`, type, vertices: cleaned }]);
      }
    } else if (drawMode.startsWith("breakline_")) {
      const bType = drawMode.replace("breakline_", "");
      setBreaklines(prev => [...prev, { id: Date.now(), name: `${bType.charAt(0).toUpperCase() + bType.slice(1)} Breakline ${prev.length + 1}`, breaklineType: bType, vertices: cleaned }]);
    }
    setDrawMode(null); setDrawPts([]); setPendingZ(null); setZInputValue(""); setZInputValue2("");
    snapPointRef.current = null; setIsSnapped(false);
  };

  const handleContextMenu = (e) => {
    if (!editNodesMode) return;
    e.preventDefault();
    const rect = canvasRef.current.getBoundingClientRect();
    const screenX = e.clientX - rect.left, screenY = e.clientY - rect.top;
    const hitRadius = 8;
    let bestDist = hitRadius, bestHit = null;
    for (const b of boundaries) {
      for (let vi = 0; vi < b.vertices.length; vi++) {
        const sx = b.vertices[vi][0] * viewState.scale + viewState.x;
        const sy = b.vertices[vi][1] * viewState.scale + viewState.y;
        const d = Math.sqrt((sx - screenX) ** 2 + (sy - screenY) ** 2);
        if (d < bestDist) { bestDist = d; bestHit = { type: "boundary", id: b.id, vertexIdx: vi, count: b.vertices.length }; }
      }
    }
    for (const bl of breaklines) {
      for (let vi = 0; vi < bl.vertices.length; vi++) {
        const sx = bl.vertices[vi][0] * viewState.scale + viewState.x;
        const sy = bl.vertices[vi][1] * viewState.scale + viewState.y;
        const d = Math.sqrt((sx - screenX) ** 2 + (sy - screenY) ** 2);
        if (d < bestDist) { bestDist = d; bestHit = { type: "breakline", id: bl.id, vertexIdx: vi, count: bl.vertices.length }; }
      }
    }
    if (!bestHit) return;
    const minVerts = bestHit.type === "boundary" ? 3 : 2;
    if (bestHit.count <= minVerts) return;
    pushHistory();
    if (bestHit.type === "boundary") {
      setBoundaries(prev => prev.map(b => {
        if (b.id !== bestHit.id) return b;
        return { ...b, vertices: b.vertices.filter((_, i) => i !== bestHit.vertexIdx) };
      }));
    } else {
      setBreaklines(prev => prev.map(bl => {
        if (bl.id !== bestHit.id) return bl;
        return { ...bl, vertices: bl.vertices.filter((_, i) => i !== bestHit.vertexIdx) };
      }));
    }
  };

  const finishBreaklineZ = () => {
    if (pendingZ) {
      const z = parseFloat(zInputValue);
      if (!isNaN(z)) {
        pushHistory();
        setDrawPts(prev => [...prev, [pendingZ.x, pendingZ.y, z]]);
      }
      setPendingZ(null); setZInputValue("");
    }
  };

  const finishWallZ = () => {
    if (!pendingZ) return;
    pushHistory();
    if (pendingZ.wallMode === "both") {
      const zTop = parseFloat(zInputValue);
      const zBottom = parseFloat(zInputValue2);
      if (!isNaN(zTop) && !isNaN(zBottom)) {
        if (zTop === zBottom) { alert("Wall breakline requires different Z Top and Z Bottom values."); return; }
        setDrawPts(prev => [...prev, [pendingZ.x, pendingZ.y, zTop, zBottom]]);
      }
    } else if (pendingZ.wallMode === "bottom_only") {
      const zBottom = parseFloat(zInputValue);
      if (!isNaN(zBottom)) {
        if (pendingZ.zTop === zBottom) { alert("Wall breakline requires different Z Top and Z Bottom values."); return; }
        setDrawPts(prev => [...prev, [pendingZ.x, pendingZ.y, pendingZ.zTop, zBottom]]);
      }
    }
    setPendingZ(null); setZInputValue(""); setZInputValue2("");
  };

  const importBoundaryFile = (file, forceType) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target.result.trim();
      const allLines = text.split("\n");
      // Check comment lines for type hints
      const commentLines = allLines.filter(l => l.trim().startsWith("#")).join(" ").toLowerCase();
      const hasProximityHint = commentLines.includes("proximity");
      const dataLines = allLines.filter(l => l.trim() && !l.trim().startsWith("#"));
      const verts = [];
      let maxCols = 0;
      for (const line of dataLines) {
        const parts = line.split(/[,\t\s]+/).map(Number).filter(n => !isNaN(n));
        if (parts.length >= 2) {
          verts.push(parts.slice(0, Math.min(parts.length, 4)));
          if (parts.length > maxCols) maxCols = parts.length;
        }
      }
      if (verts.length < 2) return;
      pushHistory();
      const fName = file.name.replace(/\.[^.]+$/, "");
      // Detect type: 4→wall, 3→standard, 2→boundary or proximity
      if (maxCols >= 4) {
        setBreaklines(prev => [...prev, { id: Date.now(), name: fName || "Imported Wall Breakline", breaklineType: "wall", vertices: verts.map(v => [v[0], v[1], v[2] || 0, v[3] || 0]) }]);
      } else if (maxCols >= 3) {
        setBreaklines(prev => [...prev, { id: Date.now(), name: fName || "Imported Breakline", breaklineType: "standard", vertices: verts.map(v => [v[0], v[1], v[2] || 0]) }]);
      } else if (forceType === "proximity" || hasProximityHint) {
        setBreaklines(prev => [...prev, { id: Date.now(), name: fName || "Imported Proximity Breakline", breaklineType: "proximity", vertices: verts.map(v => [v[0], v[1]]) }]);
      } else if (forceType === "boundary") {
        setBoundaries(prev => [...prev, { id: Date.now(), name: fName || "Imported Boundary", type: "outer", vertices: verts.map(v => [v[0], v[1]]) }]);
      } else {
        // Default: 2-col → boundary
        setBoundaries(prev => [...prev, { id: Date.now(), name: fName || "Imported Boundary", type: "outer", vertices: verts.map(v => [v[0], v[1]]) }]);
      }
    };
    reader.readAsText(file);
  };

  const downloadSampleBreakline = () => {
    const csv = [
      "# GridForge Breakline Sample File",
      "# Standard breakline (x,y,z): 3 columns",
      "# Proximity breakline (x,y): 2 columns — Z from nearest data at grid time",
      "# Wall breakline (x,y,zTop,zBottom): 4 columns — vertical discontinuity",
      "#",
      "# This sample is a standard 3D ridge breakline (x,y,z):",
      "x,y,z",
      "200,100,145.0",
      "300,200,152.5",
      "400,350,158.0",
      "500,500,163.5",
      "600,600,155.0",
      "700,700,148.0",
      "800,800,142.5",
    ].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "sample-breakline.csv"; a.click();
    URL.revokeObjectURL(url);
  };

  const loadSample = () => {
    pushHistory();
    const pts = generateSampleData(500);
    setPoints(pts);
    setAllRows(pts);
    setHeaders(["x", "y", "z"]);
    setLayers([{ id: Date.now(), name: "Sample Points (500)", type: "points", visible: true, opacity: 100, size: 5, shape: "circle", color: C.accent, colorMode: "ramp", showPointNumbers: false, showPointLevels: false, showPointDescs: false, labelSize: 9 }]);
    setActivePanel("gridding");
  };

  const toggleLayer = (id) => setLayers(prev => prev.map(l => l.id === id ? { ...l, visible: !l.visible } : l));
  const removeLayer = (id) => { pushHistory(); setLayers(prev => prev.filter(l => l.id !== id)); };
  const duplicateLayer = (id) => { pushHistory(); setLayers(prev => { const l = prev.find(x => x.id === id); return l ? [...prev, { ...l, id: Date.now(), name: l.name + " (copy)" }] : prev; }); };
  const renameLayer = (id, name) => setLayers(prev => prev.map(l => l.id === id ? { ...l, name } : l));
  const moveLayer = (id, dir) => { pushHistory(); setLayers(prev => { const i = prev.findIndex(l => l.id === id); if ((dir < 0 && i > 0) || (dir > 0 && i < prev.length - 1)) { const n = [...prev];[n[i], n[i + dir]] = [n[i + dir], n[i]]; return n; } return prev; }); };

  // ── Sidebar buttons ────────────────────────────────────────────────────────
  const panelBtns = [
    { id: "import", icon: I.Upload, label: "Import" }, { id: "gridding", icon: I.Grid, label: "Grid" },
    { id: "boundaries", icon: I.Boundary, label: "Bounds" },
    { id: "layers", icon: I.Layers, label: "Layers" },
    { id: "export", icon: I.Download, label: "Export" }, { id: "plot", icon: I.Printer, label: "Plot" },
    { id: "tin", icon: I.Triangle, label: "TIN" },
    { id: "compare", icon: I.Columns, label: "Compare" },
    { id: "measure", icon: I.Ruler, label: "Measure" }, { id: "help", icon: I.HelpCircle, label: "Help" },
  ];

  // Algorithm-specific parameter controls
  const algoParams = () => {
    const a = gs.algorithm;
    const items = [];
    if (["idw", "mod_shepard"].includes(a)) items.push(<Sld key="pow" label="Power" value={gs.power} onChange={v => updateGs("power", v)} min={1} max={6} step={0.5} />);
    if (["idw", "nearest", "moving_avg"].includes(a)) items.push(<Sld key="sr" label="Search R" value={gs.searchRadius} onChange={v => updateGs("searchRadius", v)} min={0} max={5000} step={10} />);
    if (["idw", "kriging_ord", "kriging_uni", "kriging_sim"].includes(a)) items.push(<Sld key="mn" label="Max Nbrs" value={gs.maxNeighbors} onChange={v => updateGs("maxNeighbors", v)} min={4} max={64} step={1} />);
    if (a === "mincurv") {
      items.push(<Sld key="ten" label="Tension" value={gs.tension} onChange={v => updateGs("tension", v)} min={0} max={1} step={0.05} />);
      items.push(<Sld key="it" label="Iterations" value={gs.maxIterations} onChange={v => updateGs("maxIterations", v)} min={10} max={1000} step={10} />);
    }
    if (["kriging_ord", "kriging_uni", "kriging_sim"].includes(a)) {
      items.push(<Section key="vm" title="Variogram Model"><Sel value={gs.variogramModel} onChange={v => updateGs("variogramModel", v)} options={VARIOGRAM_MODELS} style={{ width: "100%" }} /></Section>);
      items.push(<Sld key="nug" label="Nugget" value={gs.nugget} onChange={v => updateGs("nugget", v)} min={0} max={100} step={0.1} />);
    }
    if (a === "kriging_uni") items.push(<Sld key="do" label="Drift Order" value={gs.driftOrder} onChange={v => updateGs("driftOrder", v)} min={1} max={2} step={1} />);
    if (a === "rbf") {
      items.push(<Section key="rb" title="Basis Function"><Sel value={gs.rbfBasis} onChange={v => updateGs("rbfBasis", v)} options={RBF_BASIS} style={{ width: "100%" }} /></Section>);
      items.push(<Sld key="rs" label="Shape" value={gs.rbfShape} onChange={v => updateGs("rbfShape", v)} min={0.01} max={10} step={0.1} />);
      items.push(<Sld key="rsm" label="Smooth" value={gs.rbfSmoothing} onChange={v => updateGs("rbfSmoothing", v)} min={0} max={10} step={0.1} />);
    }
    if (a === "moving_avg") items.push(<Sld key="mp" label="Min Points" value={gs.minPoints} onChange={v => updateGs("minPoints", v)} min={1} max={20} step={1} />);
    if (a === "poly_reg") items.push(<Sld key="po" label="Order" value={gs.polyOrder} onChange={v => updateGs("polyOrder", v)} min={1} max={4} step={1} />);
    if (a === "mod_shepard") items.push(<Sld key="sn" label="Neighbors" value={gs.shepardNeighbors} onChange={v => updateGs("shepardNeighbors", v)} min={4} max={32} step={1} />);
    if (a === "data_metrics") items.push(<Section key="dm" title="Metric"><Sel value={gs.dataMetric} onChange={v => updateGs("dataMetric", v)} options={METRICS} style={{ width: "100%" }} /></Section>);
    // GRD-24: Sector search (for algorithms that use spatial lookup)
    if (["idw", "kriging_ord", "kriging_uni", "kriging_sim", "moving_avg", "mod_shepard"].includes(a)) {
      items.push(<Section key="ss" title="Sector Search"><Sel value={gs.sectorSearch || "none"} onChange={v => updateGs("sectorSearch", v)} options={[["none", "None"], ["quadrant", "Quadrant (4)"], ["octant", "Octant (8)"]]} style={{ width: "100%" }} /></Section>);
      if (gs.sectorSearch && gs.sectorSearch !== "none") {
        items.push(<Sld key="mps" label="Max Per Sector" value={gs.maxPerSector || 2} onChange={v => updateGs("maxPerSector", v)} min={1} max={8} step={1} />);
      }
    }
    // GRD-25: Anisotropy
    if (["idw", "kriging_ord", "kriging_uni", "kriging_sim", "rbf", "mod_shepard"].includes(a)) {
      items.push(<div key="aniso" style={{ borderTop: `1px solid ${C.panelBorder}`, paddingTop: 8 }}>
        <Label>Anisotropy</Label>
        <Sld label="Ratio" value={gs.anisoRatio || 1} onChange={v => updateGs("anisoRatio", v)} min={1} max={10} step={0.1} />
        {(gs.anisoRatio || 1) > 1 && <Sld label="Angle °" value={gs.anisoAngle || 0} onChange={v => updateGs("anisoAngle", v)} min={0} max={180} step={5} />}
      </div>);
    }
    return items;
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div style={{ width: "100%", height: "100vh", display: "flex", flexDirection: "column", background: C.bg, color: C.text, fontFamily: "'DM Sans','Segoe UI',sans-serif", overflow: "hidden", fontSize: 13 }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        ::-webkit-scrollbar { width: 6px; } ::-webkit-scrollbar-track { background: transparent; } ::-webkit-scrollbar-thumb { background: ${C.panelBorder}; border-radius: 3px; }
        .tt-wrap:hover .tt-text { opacity: 1 !important; }
        input[type="number"] { background:${C.surface};color:${C.text};border:1px solid ${C.panelBorder};border-radius:6px;padding:6px 8px;font-size:12px;outline:none;font-family:'JetBrains Mono',monospace;width:100%; }
        input[type="number"]:focus, select:focus { border-color: ${C.accent} !important; }
        *:focus-visible { outline: 2px solid ${C.accent}; outline-offset: 2px; }
        input:focus-visible, select:focus-visible, textarea:focus-visible { outline: none; border-color: ${C.accent} !important; }
      `}</style>

      {/* ─── Top Bar ──────────────────────────────────────────────────────── */}
      <div style={{ display: "flex", alignItems: "center", height: 44, padding: "0 16px", background: C.panel, borderBottom: `1px solid ${C.panelBorder}`, gap: 12, flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <img src={import.meta.env.BASE_URL + "icon.svg"} width="28" height="28" alt="Logo" style={{ borderRadius: 6 }} />
          <span style={{ fontWeight: 700, fontSize: 15, letterSpacing: -0.3 }}>Grid<span style={{ color: C.accent }}>Forge</span><span style={{ color: C.textMuted, fontWeight: 400, fontSize: 11, marginLeft: 6 }}>GIS</span><span style={{ fontSize: 9, color: C.accent, background: C.accent + "18", padding: "2px 6px", borderRadius: 4, marginLeft: 8, fontWeight: 600, letterSpacing: 0.3 }}>v{APP_VERSION}</span></span>
        </div>
        <div style={{ flex: 1 }} />
        <div ref={coordsContainerRef} style={{ display: "none", gap: 12, fontSize: 11, fontFamily: "'JetBrains Mono',monospace", color: C.textMuted, padding: "4px 12px", background: C.surface, borderRadius: 4, border: `1px solid ${C.panelBorder}` }}>
          <span>X: <span ref={coordsXRef} style={{ color: C.blueLight }}></span></span>
          <span>Y: <span ref={coordsYRef} style={{ color: C.green }}></span></span>
          <span style={{ display: 'none' }}>Z: <span ref={coordsZRef} style={{ color: C.accent }}></span></span>
          <span style={{ display: 'none', borderLeft: `1px solid ${C.panelBorder}`, paddingLeft: 8, fontSize: 10, color: C.textDim }}><span ref={coordsSecRef}></span></span>
        </div>
        <div style={{ display: "flex", gap: 4 }}>
          <Btn size="sm" onClick={undo} disabled={!canUndo} title="Undo (Ctrl+Z)"><I.Undo /></Btn>
          <Btn size="sm" onClick={redo} disabled={!canRedo} title="Redo (Ctrl+Shift+Z)"><I.Redo /></Btn>
          {viewMode === "2d" ? <Btn size="sm" onClick={() => setViewMode("3d")} title="3D View"><I.Box3D /> 3D</Btn> : <Btn size="sm" onClick={() => { setViewMode("2d"); setCompMode(null); }} variant="primary"><I.Map /> 2D</Btn>}
          <Btn size="sm" onClick={fitView}><I.Crosshair /> Fit</Btn>
          <Btn size="sm" onClick={() => setSnapEnabled(p => !p)} variant={snapEnabled ? "success" : "default"} title="Snap to points (S)">Snap</Btn>
          <Btn size="sm" onClick={loadSample} variant="primary"><I.Plus /> Sample</Btn>
          <Btn size="sm" onClick={() => setShowBugReport(true)} title="Report a Bug" aria-label="Report a Bug"><I.Bug /></Btn>
        </div>
      </div>

      {/* ─── Main Layout ──────────────────────────────────────────────────── */}
      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
        {/* Sidebar */}
        <div style={{ width: 52, background: C.panel, borderRight: `1px solid ${C.panelBorder}`, display: "flex", flexDirection: "column", alignItems: "center", paddingTop: 8, gap: 4 }}>
          {panelBtns.map(btn => (
            <Tooltip key={btn.id} text={btn.label}>
              <button aria-label={btn.label} onClick={() => setActivePanel(activePanel === btn.id ? null : btn.id)} style={{ width: 38, height: 38, borderRadius: 8, border: "none", background: activePanel === btn.id ? C.accent + "22" : "transparent", color: activePanel === btn.id ? C.accent : C.textMuted, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", transition: "all 0.15s" }}><btn.icon /></button>
            </Tooltip>
          ))}
          <div style={{ flex: 1 }} />
          <Tooltip text="Data Table"><button aria-label="Data Table" onClick={() => setShowTable(!showTable)} style={{ width: 38, height: 38, borderRadius: 8, border: "none", background: showTable ? C.green + "22" : "transparent", color: showTable ? C.green : C.textMuted, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 8 }}><I.Table /></button></Tooltip>
        </div>

        {/* ─── Side Panel ─────────────────────────────────────────────────── */}
        {activePanel && <div style={{ width: 320, background: C.panel, borderRight: `1px solid ${C.panelBorder}`, display: "flex", flexDirection: "column", overflow: "hidden" }}>
          <div style={{ padding: "12px 16px", borderBottom: `1px solid ${C.panelBorder}`, fontWeight: 600, fontSize: 13, display: "flex", alignItems: "center", gap: 8 }}>
            {activePanel === "import" && <><I.Upload /> Import Data</>}
            {activePanel === "mapping" && <><I.Map /> Column Mapping</>}
            {activePanel === "boundaries" && <><I.Boundary /> Boundaries &amp; Breaklines</>}
            {activePanel === "gridding" && <><I.Grid /> Gridding Engine</>}
            {activePanel === "layers" && <><I.Layers /> Layer Manager</>}
            {activePanel === "export" && <><I.Download /> Export</>}
            {activePanel === "compare" && <><I.Columns /> Algorithm Comparison</>}
            {activePanel === "measure" && <><I.Ruler /> Measure</>}
            {activePanel === "plot" && <><I.Printer /> Plot & Print</>}
            {activePanel === "help" && <><I.HelpCircle /> Help Guide</>}
          </div>
          <div style={{ flex: 1, overflow: "auto", padding: 16 }}>

            {/* ── Import Panel ──────────────────────────────────────────── */}
            {activePanel === "import" && <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div onClick={() => fileInputRef.current?.click()} onDrop={handleDrop} onDragOver={e => e.preventDefault()}
                style={{ border: `2px dashed ${C.panelBorder}`, borderRadius: 10, padding: 32, textAlign: "center", cursor: "pointer", transition: "all 0.2s" }}
                onMouseOver={e => e.currentTarget.style.borderColor = C.accent} onMouseOut={e => e.currentTarget.style.borderColor = C.panelBorder}>
                <I.Upload /><div style={{ marginTop: 8, fontSize: 13, fontWeight: 500 }}>Drop file or click to browse</div>
                <div style={{ fontSize: 11, color: C.textMuted, marginTop: 4 }}>CSV, TSV, TXT, XYZ, GeoJSON — No point limit</div>
                <input ref={fileInputRef} type="file" accept=".csv,.tsv,.txt,.xyz,.dat,.geojson,.json" onChange={e => handleFile(e.target.files[0])} style={{ display: "none" }} />
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ flex: 1, height: 1, background: C.panelBorder }} /><span style={{ fontSize: 11, color: C.textMuted }}>or</span><div style={{ flex: 1, height: 1, background: C.panelBorder }} />
              </div>
              <Btn onClick={loadSample} style={{ width: "100%", justifyContent: "center" }}><I.Play /> Load Sample Dataset (500 pts)</Btn>
              <div style={{ fontSize: 11, color: C.textDim, lineHeight: 1.5 }}>All common delimited formats supported. All rows are loaded — no limits on dataset size.</div>
            </div>}

            {/* ── Mapping Panel ─────────────────────────────────────────── */}
            {activePanel === "mapping" && headers.length > 0 && <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div style={{ padding: "8px 12px", background: C.surface, borderRadius: 8, fontSize: 11, color: C.textMuted }}>
                <span style={{ color: C.accent, fontWeight: 600 }}>{fileName}</span><br />{allRows.length.toLocaleString()} rows · {headers.length} columns
              </div>
              <div>
                <Label>Quick Template</Label>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                  {[
                    { label: "NEZ", cols: { y: 0, x: 1, z: 2 } },
                    { label: "ENZ", cols: { x: 0, y: 1, z: 2 } },
                    { label: "PENZ", cols: { pointNo: 0, x: 1, y: 2, z: 3 } },
                    { label: "PNEZ", cols: { pointNo: 0, y: 1, x: 2, z: 3 } },
                    { label: "PENZD", cols: { pointNo: 0, x: 1, y: 2, z: 3, desc: 4 } },
                    { label: "PNEZD", cols: { pointNo: 0, y: 1, x: 2, z: 3, desc: 4 } },
                  ].filter(t => {
                    const maxIdx = Math.max(...Object.values(t.cols));
                    return headers.length > maxIdx;
                  }).map(t => (
                    <Btn key={t.label} size="sm" onClick={() => {
                      const m = { x: "", y: "", z: "", pointNo: "", desc: "" };
                      for (const [field, idx] of Object.entries(t.cols)) m[field] = headers[idx];
                      setColumnMapping(m);
                    }} style={{ fontSize: 10, padding: "3px 8px" }}>{t.label}</Btn>
                  ))}
                </div>
              </div>
              {projectCRS !== "LOCAL" && <div>
                <Label>File CRS</Label>
                <CRSPicker value={fileCRS} onChange={setFileCRS} />
                {fileCRS !== "LOCAL" && projectCRS !== "LOCAL" && fileCRS !== projectCRS && <div style={{ fontSize: 11, color: C.green, marginTop: 4, padding: "4px 8px", background: C.green + "12", borderRadius: 4 }}>
                  Coordinates will be transformed: {fileCRS} → {projectCRS}
                </div>}
              </div>}
              {["x", "y", "z"].map(axis => <div key={axis}>
                <Label>{axis === "x" ? "X / Easting" : axis === "y" ? "Y / Northing" : "Z / Value"}{axis !== "z" && <span style={{ color: C.danger }}> *</span>}</Label>
                <Sel value={columnMapping[axis]} onChange={v => setColumnMapping(p => ({ ...p, [axis]: v }))} options={[{ value: "", label: `Select ${axis.toUpperCase()}...` }, ...headers.map(h => ({ value: h, label: h }))]} style={{ width: "100%" }} />
              </div>)}
              <div>
                <Label>Point No <span style={{ color: C.textDim, fontWeight: 400 }}>(optional)</span></Label>
                <Sel value={columnMapping.pointNo} onChange={v => setColumnMapping(p => ({ ...p, pointNo: v }))} options={[{ value: "", label: "Select Point No..." }, ...headers.map(h => ({ value: h, label: h }))]} style={{ width: "100%" }} />
              </div>
              <div>
                <Label>Description <span style={{ color: C.textDim, fontWeight: 400 }}>(optional)</span></Label>
                <Sel value={columnMapping.desc} onChange={v => setColumnMapping(p => ({ ...p, desc: v }))} options={[{ value: "", label: "Select Description..." }, ...headers.map(h => ({ value: h, label: h }))]} style={{ width: "100%" }} />
              </div>
              <Label>Preview (first 10 rows of {allRows.length.toLocaleString()})</Label>
              <div style={{ overflow: "auto", borderRadius: 6, border: `1px solid ${C.panelBorder}`, maxHeight: 200 }}>
                <table style={{ width: "100%", fontSize: 10, borderCollapse: "collapse", fontFamily: "'JetBrains Mono',monospace" }}>
                  <thead><tr>{["X", "Y", "Z", "PtNo", "Desc"].map(h => <th key={h} style={{ padding: "6px 8px", background: C.surface, textAlign: "left", borderBottom: `1px solid ${C.panelBorder}`, color: C.accent, position: "sticky", top: 0 }}>{h}</th>)}</tr></thead>
                  <tbody>{allRows.slice(0, 10).map((row, i) => <tr key={i}>
                    <td style={{ padding: "4px 8px" }}>{columnMapping.x ? row[columnMapping.x] : "—"}</td>
                    <td style={{ padding: "4px 8px" }}>{columnMapping.y ? row[columnMapping.y] : "—"}</td>
                    <td style={{ padding: "4px 8px" }}>{columnMapping.z ? row[columnMapping.z] : "—"}</td>
                    <td style={{ padding: "4px 8px" }}>{columnMapping.pointNo ? row[columnMapping.pointNo] : "—"}</td>
                    <td style={{ padding: "4px 8px" }}>{columnMapping.desc ? row[columnMapping.desc] : "—"}</td>
                  </tr>)}</tbody>
                </table>
              </div>
              <Btn onClick={applyMapping} variant="success" style={{ width: "100%", justifyContent: "center" }} disabled={!columnMapping.x || !columnMapping.y}><I.Play /> Apply & Visualize ({allRows.length.toLocaleString()} points)</Btn>
            </div>}

            {/* ── Boundaries Panel ─────────────────────────────────────── */}
            {activePanel === "boundaries" && <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <Section title="Boundaries">
                {boundaries.length === 0 && <div style={{ fontSize: 11, color: C.textDim, padding: "4px 0" }}>No boundaries defined.</div>}
                {boundaries.map(b => <div key={b.id} style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 8px", background: C.surface, borderRadius: 6, border: `1px solid ${C.panelBorder}` }}>
                  <div style={{ width: 8, height: 8, borderRadius: 2, background: b.type === "outer" ? "#f97316" : "#ef4444" }} />
                  <span style={{ flex: 1, fontSize: 11, fontWeight: 500 }}>{b.name}</span>
                  <span style={{ fontSize: 9, color: C.textDim, textTransform: "uppercase" }}>{b.type}</span>
                  <span style={{ fontSize: 9, color: C.textMuted }}>{b.vertices.length} pts</span>
                  <button onClick={() => { pushHistory(); setBoundaries(prev => prev.filter(x => x.id !== b.id)); }} style={{ background: "none", border: "none", color: C.textDim, cursor: "pointer", display: "flex", padding: 2 }} title="Delete"><I.Trash /></button>
                </div>)}
                <div style={{ display: "flex", gap: 6 }}>
                  <Btn size="sm" onClick={() => { setDrawMode("boundary_outer"); setDrawPts([]); setMeasureMode(null); setMeasurePts([]); setEditNodesMode(false); }} variant={drawMode === "boundary_outer" ? "primary" : "default"} style={{ flex: 1, justifyContent: "center" }}>Outer</Btn>
                  <Btn size="sm" onClick={() => { setDrawMode("boundary_inner"); setDrawPts([]); setMeasureMode(null); setMeasurePts([]); setEditNodesMode(false); }} variant={drawMode === "boundary_inner" ? "primary" : "default"} style={{ flex: 1, justifyContent: "center" }}>Inner</Btn>
                </div>
                <Btn size="sm" onClick={() => { setEditNodesMode(p => !p); setDrawMode(null); setDrawPts([]); setPendingZ(null); setMeasureMode(null); setMeasurePts([]); }} variant={editNodesMode ? "success" : "default"} style={{ width: "100%", justifyContent: "center" }}><I.Edit /> Edit Nodes</Btn>
                {editNodesMode && <div style={{ padding: 8, background: C.surface, borderRadius: 6, border: `1px solid ${C.green}44`, fontSize: 10, color: C.textMuted, lineHeight: 1.5 }}>
                  <span style={{ color: C.green, fontWeight: 600 }}>Edit Nodes active</span><br />
                  Click on an edge to add a vertex.<br />
                  Right-click or Delete key near a vertex to remove it.<br />
                  Drag vertices to reposition.<br />
                  Press Escape to exit.
                </div>}
                <div style={{ marginTop: 6, padding: 8, background: C.surface, borderRadius: 6, border: `1px solid ${C.panelBorder}` }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                    <span style={{ fontSize: 10, color: C.textMuted, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5 }}>Auto Generate</span>
                  </div>
                  <Sld label="Concavity" value={gs.autoBoundaryConcavity ?? 0} onChange={v => updateGs("autoBoundaryConcavity", v)} min={0} max={1} step={0.05} />
                  <div style={{ fontSize: 9, color: C.textDim, marginBottom: 6 }}>0 = convex hull, 1 = tightest fit</div>
                  <Btn size="sm" onClick={() => {
                    if (points.length < 3) return;
                    pushHistory();
                    const concavity = gs.autoBoundaryConcavity ?? 0;
                    const verts = concavity <= 0
                      ? computeConvexHull(points)
                      : computeConcaveHull(points, concavity);
                    if (verts.length >= 3) {
                      setBoundaries(prev => [...prev, {
                        id: Date.now(),
                        name: `Auto ${concavity <= 0 ? "Convex" : "Concave"} Boundary`,
                        type: "outer",
                        vertices: verts
                      }]);
                    }
                  }} disabled={points.length < 3} style={{ width: "100%", justifyContent: "center" }} variant="primary">
                    <I.Boundary /> Auto Boundary
                  </Btn>
                </div>
              </Section>
              <Section title="Breaklines">
                {breaklines.length === 0 && <div style={{ fontSize: 11, color: C.textDim, padding: "4px 0" }}>No breaklines defined.</div>}
                {breaklines.map(bl => {
                  const bType = bl.breaklineType || "standard";
                  const typeColor = bType === "proximity" ? "#fbbf24" : bType === "wall" ? "#f472b6" : "#00e5ff";
                  const isHidden = bl.visible === false;
                  return <div key={bl.id} style={{ display: "flex", flexDirection: "column", gap: 4, padding: "6px 8px", background: C.surface, borderRadius: 6, border: `1px solid ${C.panelBorder}`, opacity: isHidden ? 0.5 : 1 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <button onClick={() => setBreaklines(prev => prev.map(b => b.id === bl.id ? { ...b, visible: b.visible === false ? true : false } : b))} style={{ background: "none", border: "none", color: isHidden ? C.textDim : typeColor, cursor: "pointer", display: "flex", padding: 0, fontSize: 13 }} title={isHidden ? "Show" : "Hide"}>{isHidden ? "\u25CB" : "\u25CF"}</button>
                      <input value={bl.name} onChange={e => setBreaklines(prev => prev.map(b => b.id === bl.id ? { ...b, name: e.target.value } : b))} style={{ flex: 1, fontSize: 11, fontWeight: 500, background: "transparent", border: "none", borderBottom: `1px solid ${C.panelBorder}`, color: C.text, outline: "none", padding: "1px 2px", minWidth: 0 }} title="Click to rename" />
                      <span style={{ fontSize: 9, color: C.textMuted }}>{bl.vertices.length}</span>
                      <button onClick={() => { pushHistory(); setBreaklines(prev => prev.filter(x => x.id !== bl.id)); }} style={{ background: "none", border: "none", color: C.textDim, cursor: "pointer", display: "flex", padding: 2 }} title="Delete"><I.Trash /></button>
                    </div>
                    <div style={{ display: "flex", gap: 3 }}>
                      {["standard", "proximity", "wall"].map(t => {
                        const tc = t === "proximity" ? "#fbbf24" : t === "wall" ? "#f472b6" : "#00e5ff";
                        return <button key={t} onClick={() => { pushHistory(); setBreaklines(prev => prev.map(b => b.id === bl.id ? { ...b, breaklineType: t } : b)); }} style={{ flex: 1, fontSize: 8, textTransform: "uppercase", padding: "1px 0", background: bType === t ? tc + "22" : "transparent", border: bType === t ? `1px solid ${tc}55` : `1px solid ${C.panelBorder}`, borderRadius: 3, color: bType === t ? tc : C.textDim, cursor: "pointer", fontWeight: 600 }}>{t === "standard" ? "STD" : t === "proximity" ? "PROX" : "WALL"}</button>;
                      })}
                    </div>
                  </div>;
                })}
                <div style={{ display: "flex", gap: 4 }}>
                  <Btn size="sm" onClick={() => { setDrawMode("breakline_standard"); setDrawPts([]); setMeasureMode(null); setMeasurePts([]); setEditNodesMode(false); }} variant={drawMode === "breakline_standard" ? "primary" : "default"} style={{ flex: 1, justifyContent: "center", fontSize: 10 }}>Standard</Btn>
                  <Btn size="sm" onClick={() => { setDrawMode("breakline_proximity"); setDrawPts([]); setMeasureMode(null); setMeasurePts([]); setEditNodesMode(false); }} variant={drawMode === "breakline_proximity" ? "primary" : "default"} style={{ flex: 1, justifyContent: "center", fontSize: 10 }}>Proximity</Btn>
                  <Btn size="sm" onClick={() => { setDrawMode("breakline_wall"); setDrawPts([]); setMeasureMode(null); setMeasurePts([]); setEditNodesMode(false); }} variant={drawMode === "breakline_wall" ? "primary" : "default"} style={{ flex: 1, justifyContent: "center", fontSize: 10 }}>Wall</Btn>
                </div>
              </Section>
              <Section title="Import">
                <div style={{ display: "flex", gap: 6 }}>
                  <Btn size="sm" onClick={() => boundaryFileRef.current?.click()} style={{ flex: 1, justifyContent: "center" }}><I.Upload /> Import CSV</Btn>
                  <Btn size="sm" onClick={downloadSampleBreakline} style={{ flex: 1, justifyContent: "center" }}><I.Download /> Sample</Btn>
                </div>
                <input ref={boundaryFileRef} type="file" accept=".csv,.txt,.xyz,.dat" onChange={e => importBoundaryFile(e.target.files[0])} style={{ display: "none" }} />
                <input ref={proxFileRef} type="file" accept=".csv,.txt,.xyz,.dat" onChange={e => importBoundaryFile(e.target.files[0], "proximity")} style={{ display: "none" }} />
                <Btn size="sm" onClick={() => proxFileRef.current?.click()} style={{ width: "100%", justifyContent: "center", marginTop: 4, fontSize: 10 }}><I.Upload /> Import 2D as Proximity Breakline</Btn>
                <div style={{ fontSize: 10, color: C.textDim, marginTop: 4, lineHeight: 1.4 }}>Auto: 2 cols → boundary | 3 → standard | 4 → wall</div>
              </Section>
              {drawMode && <div style={{ padding: 10, background: C.surface, borderRadius: 8, border: `1px solid ${C.accent}44` }}>
                <div style={{ fontSize: 11, color: C.accent, fontWeight: 600, marginBottom: 4 }}>
                  Drawing: {drawMode === "boundary_outer" ? "Outer Boundary" : drawMode === "boundary_inner" ? "Inner Boundary"
                    : drawMode === "breakline_standard" ? "Standard Breakline" : drawMode === "breakline_proximity" ? "Proximity Breakline" : drawMode === "breakline_wall" ? "Wall Breakline" : drawMode}
                </div>
                <div style={{ fontSize: 10, color: C.textMuted, lineHeight: 1.4 }}>
                  Click to add vertices. Double-click to finish.
                  {drawMode === "breakline_standard" ? " Z from snap/grid or manual entry." : ""}
                  {drawMode === "breakline_proximity" ? " 2D only — Z derived from nearest data at grid time." : ""}
                  {drawMode === "breakline_wall" ? " Dual Z values (top/bottom) for vertical discontinuity." : ""}
                  {" "}Press Escape to cancel.
                </div>
                <div style={{ fontSize: 10, color: C.textMuted, marginTop: 4 }}>Vertices: {drawPts.length}</div>
                {/* Standard breakline Z prompt */}
                {pendingZ && !pendingZ.wallMode && <div style={{ marginTop: 6 }}>
                  <Label>Enter Z value</Label>
                  <div style={{ display: "flex", gap: 4 }}>
                    <input type="number" value={zInputValue} onChange={e => setZInputValue(e.target.value)} onKeyDown={e => { if (e.key === "Enter") finishBreaklineZ(); }} autoFocus style={{ flex: 1 }} />
                    <Btn size="sm" onClick={finishBreaklineZ} variant="primary">OK</Btn>
                  </div>
                </div>}
                {/* Wall breakline Z prompts */}
                {pendingZ && pendingZ.wallMode === "both" && <div style={{ marginTop: 6 }}>
                  <Label>Enter Z Top</Label>
                  <input type="number" value={zInputValue} onChange={e => setZInputValue(e.target.value)} autoFocus style={{ marginBottom: 4 }} />
                  <Label>Enter Z Bottom</Label>
                  <div style={{ display: "flex", gap: 4 }}>
                    <input type="number" value={zInputValue2} onChange={e => setZInputValue2(e.target.value)} onKeyDown={e => { if (e.key === "Enter") finishWallZ(); }} style={{ flex: 1 }} />
                    <Btn size="sm" onClick={finishWallZ} variant="primary">OK</Btn>
                  </div>
                </div>}
                {pendingZ && pendingZ.wallMode === "bottom_only" && <div style={{ marginTop: 6 }}>
                  <div style={{ fontSize: 10, color: C.textMuted, marginBottom: 4 }}>Z Top: <span style={{ color: C.accent }}>{pendingZ.zTop.toFixed(2)}</span> (from snap/grid)</div>
                  <Label>Enter Z Bottom</Label>
                  <div style={{ display: "flex", gap: 4 }}>
                    <input type="number" value={zInputValue} onChange={e => setZInputValue(e.target.value)} onKeyDown={e => { if (e.key === "Enter") finishWallZ(); }} autoFocus style={{ flex: 1 }} />
                    <Btn size="sm" onClick={finishWallZ} variant="primary">OK</Btn>
                  </div>
                </div>}
                <Btn size="sm" onClick={() => { setDrawMode(null); setDrawPts([]); setPendingZ(null); setZInputValue(""); setZInputValue2(""); snapPointRef.current = null; setIsSnapped(false); }} variant="ghost" style={{ width: "100%", justifyContent: "center", marginTop: 6 }}>Cancel</Btn>
              </div>}
            </div>}

            {/* ── Gridding Panel ────────────────────────────────────────── */}
            {activePanel === "gridding" && <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {points.length > 0 && <div style={{ padding: "8px 12px", background: C.surface, borderRadius: 8, fontSize: 11, display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: C.textMuted }}>Points loaded</span><span style={{ color: C.green, fontWeight: 600 }}>{points.length.toLocaleString()}</span>
              </div>}
              <Section title="Algorithm"><Sel value={gs.algorithm} onChange={v => updateGs("algorithm", v)} options={ALGORITHMS} style={{ width: "100%" }} /></Section>
              {algoParams()}
              <Sld label="Resolution" value={gs.resolution} onChange={v => updateGs("resolution", v)} min={10} max={500} step={5} />
              {bounds && <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ fontSize: 11, color: C.textMuted, minWidth: 70 }}>Cell size</span>
                <input type="number" value={gs.targetCellSize || ""} placeholder={gridPreview ? gridPreview.dx.toFixed(2) : ""} onChange={e => {
                  const cs = +e.target.value;
                  updateGs("targetCellSize", cs || 0);
                  if (cs > 0) {
                    const pad = gs.padding / 100;
                    const totalW = (bounds.xMax - bounds.xMin) * (1 + 2 * pad);
                    const nx = Math.max(10, Math.min(500, Math.round(totalW / cs) + 1));
                    updateGs("resolution", nx);
                  }
                }} style={{ flex: 1 }} />
              </div>}
              <Sld label="Padding %" value={gs.padding} onChange={v => updateGs("padding", v)} min={0} max={25} />
              {gridPreview && <div style={{ padding: "6px 10px", background: C.surface, borderRadius: 6, fontSize: 10, fontFamily: "'JetBrains Mono',monospace", display: "flex", flexDirection: "column", gap: 3 }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: C.textMuted }}>Grid size</span><span><span style={{ color: C.blueLight }}>{gridPreview.nx}</span> × <span style={{ color: C.green }}>{gridPreview.ny}</span> = <span style={{ color: C.accent }}>{gridPreview.cells.toLocaleString()}</span> cells</span></div>
                <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: C.textMuted }}>Cell size</span><span>dx: <span style={{ color: C.blueLight }}>{gridPreview.dx.toFixed(4)}</span>  dy: <span style={{ color: C.green }}>{gridPreview.dy.toFixed(4)}</span></span></div>
              </div>}
              <div style={{ borderTop: `1px solid ${C.panelBorder}`, paddingTop: 12 }}>
                <Label>Hillshade Generation</Label>
                <div style={{ paddingLeft: 0, display: "flex", flexDirection: "column", gap: 6 }}>
                  <Sld label="Azimuth" value={gs.hillAzimuth} onChange={v => updateGs("hillAzimuth", v)} min={0} max={360} step={5} />
                  <Sld label="Altitude" value={gs.hillAltitude} onChange={v => updateGs("hillAltitude", v)} min={0} max={90} step={5} />
                  <Sld label="Z Factor" value={gs.hillZFactor} onChange={v => updateGs("hillZFactor", v)} min={0.1} max={10} step={0.1} />
                </div>
              </div>
              {gs.algorithm === "idw" && <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, cursor: "pointer", marginBottom: 4, padding: "6px 10px", background: gs.useGPU ? C.accent + "12" : C.surface, borderRadius: 6, border: `1px solid ${gs.useGPU ? C.accent + "44" : C.panelBorder}` }}>
                <input type="checkbox" checked={gs.useGPU} onChange={() => updateGs("useGPU", !gs.useGPU)} style={{ accentColor: C.accent }} />
                <span>GPU Acceleration</span>
                <span style={{ fontSize: 9, color: C.accent, background: C.accent + "18", padding: "1px 6px", borderRadius: 3, marginLeft: "auto" }}>WebGL</span>
              </label>}
              <Btn onClick={runGridAndContours} variant="primary" disabled={points.length === 0 || gridding || contouring} style={{ width: "100%", justifyContent: "center", padding: "10px 14px" }}>
                {gridding ? `Computing… ${griddingProgress}%` : contouring ? `Contouring… ${contouringProgress}%` : "Generate Grid & Contours"}
              </Btn>
              <div style={{ display: "flex", gap: 6 }}>
                <Btn onClick={() => runGridOnly(false)} disabled={points.length === 0 || gridding || contouring} style={{ flex: 1, justifyContent: "center" }}>
                  {gridding ? "Gridding…" : "Grid Only"}
                </Btn>
                <Btn onClick={runContoursOnly} disabled={!gridData || gridding || contouring} style={{ flex: 1, justifyContent: "center" }}>
                  {contouring ? "Contouring…" : "Contours Only"}
                </Btn>
              </div>
              {(gridding || contouring) && <div style={{ marginTop: 6 }}>
                <div style={{ height: 6, borderRadius: 3, background: C.surface, overflow: "hidden" }}>
                  <div style={{ width: `${gridding ? griddingProgress : contouringProgress}%`, height: "100%", borderRadius: 3, background: `linear-gradient(90deg, ${C.accent}, ${C.green})`, transition: "width 0.3s ease" }} />
                </div>
                {(griddingStage || contouringStage) && <div style={{ fontSize: 10, color: C.textMuted, marginTop: 3, textAlign: "center" }}>{griddingStage || contouringStage}</div>}
              </div>}
              {gridStats && <div style={{ padding: 12, background: C.surface, borderRadius: 8, fontSize: 11, fontFamily: "'JetBrains Mono',monospace" }}>
                <div style={{ fontFamily: "'DM Sans',sans-serif", fontWeight: 600, color: C.textMuted, marginBottom: 6 }}>Grid Statistics</div>
                <StatRow label="Dimensions" value={`${gridStats.nx} × ${gridStats.ny}`} />
                <StatRow label="Cells" value={gridStats.cells.toLocaleString()} />
                <StatRow label="Min Z" value={gridStats.min.toFixed(2)} color={C.blueLight} />
                <StatRow label="Max Z" value={gridStats.max.toFixed(2)} color={C.accent} />
                <StatRow label="Mean" value={gridStats.mean.toFixed(2)} color={C.green} />
                <StatRow label="Std Dev" value={gridStats.stdDev.toFixed(2)} />
              </div>}
              {/* RST-07: Grid Math Operations */}
              {gridData && <div style={{ borderTop: `1px solid ${C.panelBorder}`, paddingTop: 12 }}>
                <Label>Grid Operations</Label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 4 }}>
                  <Sel value={gs.gridMathOp || 'subtract'} onChange={v => updateGs('gridMathOp', v)} options={[['add', 'Add (A + B)'], ['subtract', 'Subtract (A − B)'], ['multiply', 'Multiply (A × B)'], ['divide', 'Divide (A ÷ B)']]} style={{ width: '100%' }} />
                  <div style={{ fontSize: 10, color: C.textDim }}>A = current grid, B = comparison grid</div>
                  {compGrid && <Btn size="sm" onClick={() => {
                    const op = gs.gridMathOp || 'subtract';
                    const a = new Float64Array(gridData.grid);
                    const b = new Float64Array(compGrid.grid);
                    if (a.length !== b.length) { alert('Grids must have same dimensions'); return; }
                    const result = gridMath(a, b, op);
                    const stats = computeGridStats(result);
                    const rl = layers.find(l => l.type === 'raster');
                    setGridData(prev => ({ ...prev, grid: Array.from(result) }));
                    setGridStats({ ...stats, nx: gridData.nx, ny: gridData.ny, cells: gridData.nx * gridData.ny });
                  }} style={{ width: '100%', justifyContent: 'center' }} variant="primary">Run Grid Math</Btn>}
                  {!compGrid && <div style={{ fontSize: 10, color: C.textMuted, textAlign: 'center', padding: 6, background: C.surface, borderRadius: 6 }}>Load a comparison grid first (Compare panel)</div>}
                </div>
              </div>}
            </div>}

            {/* ── Layers Panel (expandable per-layer properties) ─────── */}
            {activePanel === "layers" && <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {layers.length === 0 && <div style={{ textAlign: "center", color: C.textDim, fontSize: 12, padding: 24 }}>No layers yet. Import data to begin.</div>}
              {/* Style Presets */}
              {layers.length > 0 && <Section title="Style Presets">
                <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                  {STYLE_PRESETS.map(p => <Btn key={p.name} size="sm" onClick={() => {
                    setLayers(prev => prev.map(l => {
                      if (l.type === "raster") return { ...l, colorRamp: p.ramp, showHillshade: p.showHillshade, showFilledContours: p.showFilled };
                      if (l.type === "contours") return { ...l, visible: p.showContours };
                      return l;
                    }));
                  }} style={{ justifyContent: "flex-start", fontSize: 10, padding: "3px 8px" }}>
                    <div style={{ width: 30, height: 8, borderRadius: 2, background: `linear-gradient(90deg,${(COLOR_RAMPS[p.ramp] || COLOR_RAMPS.viridis).join(",")})` }} />
                    {p.name}
                  </Btn>)}
                </div>
              </Section>}
              {layers.map(layer => {
                const isExpanded = expandedLayers.has(layer.id);
                return <div key={layer.id} style={{ background: C.surface, borderRadius: 8, border: `1px solid ${isExpanded ? C.accent + "44" : C.panelBorder}`, padding: 8 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <button onClick={() => toggleLayer(layer.id)} style={{ background: "none", border: "none", color: layer.visible ? C.green : C.textDim, cursor: "pointer", display: "flex" }}>{layer.visible ? <I.Eye /> : <I.EyeOff />}</button>
                    <div style={{ width: 10, height: 10, borderRadius: 3, background: layer.type === "points" ? C.accent : layer.type === "raster" ? `linear-gradient(135deg,${C.blueLight},${C.green})` : C.green }} />
                    {editingLayer === layer.id ?
                      <input autoFocus defaultValue={layer.name} onBlur={e => { renameLayer(layer.id, e.target.value); setEditingLayer(null); }} onKeyDown={e => { if (e.key === "Enter") { renameLayer(layer.id, e.target.value); setEditingLayer(null); } }} style={{ flex: 1, background: C.bg, border: `1px solid ${C.accent}`, borderRadius: 4, padding: "2px 6px", fontSize: 12, color: C.text, outline: "none" }} /> :
                      <span onDoubleClick={() => setEditingLayer(layer.id)} style={{ flex: 1, fontSize: 12, fontWeight: 500, cursor: "text" }}>{layer.name}</span>
                    }
                    <button onClick={() => setExpandedLayers(prev => { const n = new Set(prev); n.has(layer.id) ? n.delete(layer.id) : n.add(layer.id); return n; })} style={{ background: "none", border: "none", color: isExpanded ? C.accent : C.textDim, cursor: "pointer", display: "flex", padding: 2 }} title="Properties">{isExpanded ? <I.ChevUp /> : <I.ChevDown />}</button>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 6 }}>
                    <Sld value={layer.opacity} onChange={v => updateLayerProp(layer.id, "opacity", v)} min={0} max={100} label="" showValue={false} />
                    <span style={{ fontSize: 9, color: C.textDim, minWidth: 28 }}>{layer.opacity}%</span>
                    <button onClick={() => moveLayer(layer.id, -1)} style={{ background: "none", border: "none", color: C.textDim, cursor: "pointer", display: "flex", padding: 2 }} title="Move up"><I.ChevUp /></button>
                    <button onClick={() => moveLayer(layer.id, 1)} style={{ background: "none", border: "none", color: C.textDim, cursor: "pointer", display: "flex", padding: 2 }} title="Move down"><I.ChevDown /></button>
                    <button onClick={() => duplicateLayer(layer.id)} style={{ background: "none", border: "none", color: C.textDim, cursor: "pointer", display: "flex", padding: 2 }} title="Duplicate"><I.Copy /></button>
                    <button onClick={() => removeLayer(layer.id)} style={{ background: "none", border: "none", color: C.textDim, cursor: "pointer", display: "flex", padding: 2 }} title="Delete"><I.Trash /></button>
                  </div>
                  {/* ── Expanded Per-Layer Properties ── */}
                  {isExpanded && <div style={{ marginTop: 8, paddingTop: 8, borderTop: `1px solid ${C.panelBorder}`, display: "flex", flexDirection: "column", gap: 8 }}>
                    {/* LYR-01: Layer group assignment */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <Label style={{ flex: 'none', minWidth: 40 }}>Group</Label>
                      <input type="text" value={layer.group || ''} placeholder="(none)" onChange={e => updateLayerProp(layer.id, 'group', e.target.value)} style={{ flex: 1, background: C.surface, border: `1px solid ${C.panelBorder}`, borderRadius: 6, padding: '4px 8px', fontSize: 11, color: C.text, outline: 'none' }} />
                    </div>
                    <Sld label="Opacity" value={layer.opacity ?? 100} onChange={v => updateLayerProp(layer.id, "opacity", v)} min={0} max={100} />
                    {/* Raster layer properties */}
                    {layer.type === "raster" && <>
                      <Section title="Color Ramp">
                        <div style={{ display: "flex", flexDirection: "column", gap: 3, maxHeight: 160, overflow: "auto" }}>
                          {Object.keys(COLOR_RAMPS).map(name => <div key={name} onClick={() => updateLayerProp(layer.id, "colorRamp", name)} style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 6px", borderRadius: 5, cursor: "pointer", background: (layer.colorRamp || "viridis") === name ? C.accent + "22" : "transparent", border: (layer.colorRamp || "viridis") === name ? `1px solid ${C.accent}44` : "1px solid transparent" }}>
                            <div style={{ width: 80, height: 10, borderRadius: 3, background: `linear-gradient(90deg,${COLOR_RAMPS[name].join(",")})` }} />
                            <span style={{ fontSize: 10, color: (layer.colorRamp || "viridis") === name ? C.accent : C.textMuted, textTransform: "capitalize" }}>{name}</span>
                          </div>)}
                        </div>
                      </Section>
                      {/* RST-02/STY-04: Custom Gradient Editor */}
                      <Section title="Custom Gradient">
                        <div style={{ position: 'relative', height: 28, background: `linear-gradient(90deg, ${(layer.customStops || [{ pos: 0, color: '#0000ff' }, { pos: 0.5, color: '#00ff00' }, { pos: 1, color: '#ff0000' }]).sort((a, b) => a.pos - b.pos).map(s => `${s.color} ${s.pos * 100}%`).join(',')})`, borderRadius: 6, cursor: 'pointer', border: `1px solid ${C.panelBorder}` }}
                          onClick={e => {
                            const rect = e.currentTarget.getBoundingClientRect();
                            const pos = Math.max(0.01, Math.min(0.99, (e.clientX - rect.left) / rect.width));
                            const stops = [...(layer.customStops || [{ pos: 0, color: '#0000ff' }, { pos: 0.5, color: '#00ff00' }, { pos: 1, color: '#ff0000' }]), { pos: +pos.toFixed(2), color: '#ffffff' }];
                            updateLayerProp(layer.id, 'customStops', stops);
                          }}
                        >
                          {(layer.customStops || [{ pos: 0, color: '#0000ff' }, { pos: 0.5, color: '#00ff00' }, { pos: 1, color: '#ff0000' }]).map((stop, si) => (
                            <div key={si} style={{
                              position: 'absolute', left: `calc(${stop.pos * 100}% - 6px)`, top: -2, width: 12, height: 32,
                              borderRadius: 6, border: '2px solid white', background: stop.color, cursor: 'grab', boxShadow: '0 1px 3px rgba(0,0,0,0.4)'
                            }}
                              draggable="false"
                              onMouseDown={ev => {
                                ev.stopPropagation();
                                const rect = ev.currentTarget.parentElement.getBoundingClientRect();
                                const onMove = me => {
                                  const newPos = Math.max(0, Math.min(1, (me.clientX - rect.left) / rect.width));
                                  const stops = [...(layer.customStops || [{ pos: 0, color: '#0000ff' }, { pos: 0.5, color: '#00ff00' }, { pos: 1, color: '#ff0000' }])];
                                  stops[si] = { ...stops[si], pos: +newPos.toFixed(2) };
                                  updateLayerProp(layer.id, 'customStops', stops);
                                };
                                const onUp = () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); };
                                document.addEventListener('mousemove', onMove);
                                document.addEventListener('mouseup', onUp);
                              }}
                              onDoubleClick={ev => {
                                ev.stopPropagation();
                                const stops = (layer.customStops || [{ pos: 0, color: '#0000ff' }, { pos: 0.5, color: '#00ff00' }, { pos: 1, color: '#ff0000' }]).filter((_, i) => i !== si);
                                if (stops.length >= 2) updateLayerProp(layer.id, 'customStops', stops);
                              }}
                            />
                          ))}
                        </div>
                        <div style={{ display: 'flex', gap: 4, marginTop: 6, flexWrap: 'wrap' }}>
                          {(layer.customStops || [{ pos: 0, color: '#0000ff' }, { pos: 0.5, color: '#00ff00' }, { pos: 1, color: '#ff0000' }]).sort((a, b) => a.pos - b.pos).map((stop, si) => (
                            <input key={si} type="color" value={stop.color} onChange={e => {
                              const stops = [...(layer.customStops || [{ pos: 0, color: '#0000ff' }, { pos: 0.5, color: '#00ff00' }, { pos: 1, color: '#ff0000' }])];
                              const origIdx = stops.findIndex(s => s.pos === stop.pos && s.color === stop.color);
                              if (origIdx >= 0) stops[origIdx] = { ...stops[origIdx], color: e.target.value };
                              updateLayerProp(layer.id, 'customStops', stops);
                            }} style={{ width: 22, height: 18, border: 'none', cursor: 'pointer', padding: 0, borderRadius: 3 }} title={`${(stop.pos * 100).toFixed(0)}%`} />
                          ))}
                        </div>
                        <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                          <Btn size="sm" onClick={() => {
                            const stops = (layer.customStops || [{ pos: 0, color: '#0000ff' }, { pos: 0.5, color: '#00ff00' }, { pos: 1, color: '#ff0000' }]);
                            const colors = stops.sort((a, b) => a.pos - b.pos).map(s => s.color);
                            const customRamp = { custom: colors };
                            updateLayerProp(layer.id, 'colorRamp', 'custom');
                            // Store custom ramp in COLOR_RAMPS for rendering
                            COLOR_RAMPS.custom = colors;
                          }} style={{ flex: 1, justifyContent: 'center', fontSize: 10 }}>Apply Custom Gradient</Btn>
                        </div>
                        <div style={{ fontSize: 9, color: C.textDim, marginTop: 4 }}>Click to add stops. Drag to move. Double-click to remove.</div>
                      </Section>
                      <Section title="Color Range">
                        <div style={{ display: "flex", gap: 6, marginBottom: 6 }}>
                          {["auto", "manual"].map(m => (
                            <Btn key={m} size="sm" onClick={() => {
                              if (m === "manual" && (layer.rampMode || "auto") === "auto" && gridData) {
                                updateLayerProp(layer.id, "rampMin", +gridData.zMin.toFixed(2));
                                updateLayerProp(layer.id, "rampMax", +gridData.zMax.toFixed(2));
                              }
                              updateLayerProp(layer.id, "rampMode", m);
                            }} style={{ flex: 1, justifyContent: "center", fontSize: 10, background: (layer.rampMode || "auto") === m ? C.accent + "33" : C.surface, border: (layer.rampMode || "auto") === m ? `1px solid ${C.accent}` : `1px solid ${C.panelBorder}`, color: (layer.rampMode || "auto") === m ? C.accent : C.textMuted }}>
                              {m === "auto" ? "Auto" : "Manual"}
                            </Btn>
                          ))}
                        </div>
                        {(layer.rampMode || "auto") === "manual" && <div style={{ display: "flex", gap: 6 }}>
                          <div style={{ flex: 1 }}><Label>Min</Label><input type="number" value={layer.rampMin ?? 0} onChange={e => updateLayerProp(layer.id, "rampMin", +e.target.value)} step="any" style={{ width: "100%" }} /></div>
                          <div style={{ flex: 1 }}><Label>Max</Label><input type="number" value={layer.rampMax ?? 100} onChange={e => updateLayerProp(layer.id, "rampMax", +e.target.value)} step="any" style={{ width: "100%" }} /></div>
                        </div>}
                        <div style={{ fontSize: 10, color: C.textDim, marginTop: 4 }}>Range: {effectiveZRange.zMin.toFixed(2)} → {effectiveZRange.zMax.toFixed(2)}</div>
                      </Section>
                      <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, cursor: "pointer" }}>
                        <input type="checkbox" checked={layer.showFilledContours || false} onChange={() => updateLayerProp(layer.id, "showFilledContours", !layer.showFilledContours)} style={{ accentColor: C.accent }} /> Filled Contours
                      </label>
                      <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, cursor: "pointer" }}>
                        <input type="checkbox" checked={layer.showHillshade || false} onChange={() => updateLayerProp(layer.id, "showHillshade", !layer.showHillshade)} style={{ accentColor: C.accent }} /> Hillshade
                      </label>
                      {layer.showHillshade && <Sld label="Hill Opacity" value={layer.hillOpacity ?? 50} onChange={v => updateLayerProp(layer.id, "hillOpacity", v)} min={0} max={100} />}
                    </>}

                    {/* Contour layer properties */}
                    {layer.type === "contours" && <>
                      <div>
                        <Label>Contour Interval</Label>
                        <input type="number" value={layer.contourInterval ?? 10} onChange={e => updateLayerProp(layer.id, "contourInterval", +e.target.value)} />
                      </div>
                      <div style={{ display: "flex", gap: 6, marginBottom: 4 }}>
                        <Label style={{ marginRight: "auto", alignSelf: "center" }}>Method</Label>
                        {["grid", "tin"].map(m => (
                          <Btn key={m} size="sm" onClick={() => updateLayerProp(layer.id, "contourMethod", m)} style={{ flex: 1, justifyContent: "center", fontSize: 10, background: (layer.contourMethod || "grid") === m ? C.accent + "33" : C.surface, border: (layer.contourMethod || "grid") === m ? `1px solid ${C.accent}` : `1px solid ${C.panelBorder}`, color: (layer.contourMethod || "grid") === m ? C.accent : C.textMuted }}>
                            {m === "grid" ? "Grid" : "TIN"}
                          </Btn>
                        ))}
                      </div>
                      {breaklines.length > 0 && (layer.contourMethod || "grid") === "grid" && (
                        <div style={{ fontSize: 10, color: "#fbbf24", lineHeight: 1.3, padding: "3px 6px", background: "#fbbf2410", borderRadius: 4, marginBottom: 4 }}>
                          Breaklines present — use TIN method for contours that honor breakline constraints.
                        </div>
                      )}
                      <Sld label="Smoothing" value={layer.contourSmoothing ?? 0} onChange={v => updateLayerProp(layer.id, "contourSmoothing", v)} min={0} max={1} step={0.1} />
                      <Sld label="Line Weight" value={layer.lineWeight ?? 1} onChange={v => updateLayerProp(layer.id, "lineWeight", v)} min={0.5} max={5} step={0.5} />
                      {/* STY-02: Dash pattern selector */}
                      <Section title="Line Style">
                        <div style={{ display: 'flex', gap: 4 }}>
                          {[['solid', 'Solid'], ['dashed', 'Dashed'], ['dotted', 'Dotted'], ['dashdot', 'Dash-Dot']].map(([val, label]) => (
                            <Btn key={val} size="sm" onClick={() => updateLayerProp(layer.id, 'dashPattern', val)} style={{ flex: 1, justifyContent: 'center', fontSize: 9, background: (layer.dashPattern || 'solid') === val ? C.accent + '33' : C.surface, border: (layer.dashPattern || 'solid') === val ? `1px solid ${C.accent}` : `1px solid ${C.panelBorder}`, color: (layer.dashPattern || 'solid') === val ? C.accent : C.textMuted }}>
                              {label}
                            </Btn>
                          ))}
                        </div>
                      </Section>
                      <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, cursor: "pointer" }}>
                        <input type="checkbox" checked={layer.showLabels !== false} onChange={() => updateLayerProp(layer.id, "showLabels", !(layer.showLabels !== false))} style={{ accentColor: C.accent }} /> Labels
                      </label>
                      {(layer.showLabels !== false) && <Sld label="Label Size" value={layer.labelSize || 9} onChange={v => updateLayerProp(layer.id, "labelSize", v)} min={6} max={18} />}
                      <Sld label="Major Every" value={layer.majorInterval ?? 5} onChange={v => updateLayerProp(layer.id, "majorInterval", v)} min={1} max={20} />
                      <Btn size="sm" onClick={runContoursOnly} disabled={!gridData || contouring} variant="primary" style={{ width: "100%", justifyContent: "center" }}>
                        {contouring ? "Contouring…" : "Regenerate Contours"}
                      </Btn>
                    </>}

                    {/* Point layer properties */}
                    {layer.type === "points" && <>
                      <Sld label="Symbol Size" value={layer.size || 5} onChange={v => updateLayerProp(layer.id, "size", v)} min={1} max={20} />
                      <div style={{ display: "flex", gap: 6, marginBottom: 4 }}>
                        <Label style={{ marginRight: "auto", alignSelf: "center" }}>Shape</Label>
                        {["circle", "square", "triangle", "diamond", "cross"].map(s => (
                          <button key={s} onClick={() => updateLayerProp(layer.id, "shape", s)} style={{
                            width: 26, height: 26, border: `1px solid ${(layer.shape || "circle") === s ? C.accent : C.panelBorder}`,
                            background: (layer.shape || "circle") === s ? C.accent + "22" : C.surface, borderRadius: 4, cursor: "pointer",
                            display: "flex", alignItems: "center", justifyContent: "center", color: (layer.shape || "circle") === s ? C.accent : C.textDim, fontSize: 11
                          }} title={s}>
                            {s === "circle" ? "●" : s === "square" ? "■" : s === "triangle" ? "▲" : s === "diamond" ? "◆" : "✛"}
                          </button>
                        ))}
                      </div>
                      <div style={{ display: "flex", gap: 6, marginBottom: 4 }}>
                        <Label style={{ marginRight: "auto", alignSelf: "center" }}>Color</Label>
                        {["ramp", "fixed"].map(m => (
                          <Btn key={m} size="sm" onClick={() => updateLayerProp(layer.id, "colorMode", m)} style={{ flex: 1, justifyContent: "center", fontSize: 10, background: (layer.colorMode || "ramp") === m ? C.accent + "33" : C.surface, border: (layer.colorMode || "ramp") === m ? `1px solid ${C.accent}` : `1px solid ${C.panelBorder}`, color: (layer.colorMode || "ramp") === m ? C.accent : C.textMuted }}>
                            {m === "ramp" ? "Z-Ramp" : "Fixed"}
                          </Btn>
                        ))}
                      </div>
                      {(layer.colorMode || "ramp") === "fixed" && <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <Label>Color</Label>
                        <input type="color" value={layer.color || C.accent} onChange={e => updateLayerProp(layer.id, "color", e.target.value)} style={{ width: 32, height: 24, border: "none", cursor: "pointer" }} />
                      </div>}

                      {/* Proportional sizing */}
                      <div style={{ borderTop: `1px solid ${C.panelBorder}`, paddingTop: 8 }}>
                        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11, cursor: "pointer", marginBottom: 4 }}>
                          <input type="checkbox" checked={layer.sizeByAttribute || false} onChange={() => updateLayerProp(layer.id, "sizeByAttribute", !layer.sizeByAttribute)} style={{ accentColor: C.accent }} />
                          Proportional sizing (by Z)
                        </label>
                        {layer.sizeByAttribute && <>
                          <Sld label="Min Size" value={layer.sizeMin || 3} onChange={v => updateLayerProp(layer.id, "sizeMin", v)} min={1} max={10} />
                          <Sld label="Max Size" value={layer.sizeMax || 12} onChange={v => updateLayerProp(layer.id, "sizeMax", v)} min={5} max={30} />
                        </>}
                      </div>

                      {/* Z-Range Filter (PNT-06) */}
                      <div style={{ borderTop: `1px solid ${C.panelBorder}`, paddingTop: 8 }}>
                        <Label>Z-Range Filter</Label>
                        <div style={{ display: "flex", gap: 6 }}>
                          <div style={{ flex: 1 }}>
                            <label style={{ fontSize: 9, color: C.textDim }}>Min</label>
                            <input type="number" value={layer.filterMin ?? ""} onChange={e => updateLayerProp(layer.id, "filterMin", e.target.value === "" ? undefined : +e.target.value)} step="any" placeholder={bounds ? effectiveZRange.zMin.toFixed(1) : "—"} style={{ width: "100%", background: C.surface, color: C.text, border: `1px solid ${C.panelBorder}`, borderRadius: 4, padding: "3px 6px", fontSize: 11, outline: "none" }} />
                          </div>
                          <div style={{ flex: 1 }}>
                            <label style={{ fontSize: 9, color: C.textDim }}>Max</label>
                            <input type="number" value={layer.filterMax ?? ""} onChange={e => updateLayerProp(layer.id, "filterMax", e.target.value === "" ? undefined : +e.target.value)} step="any" placeholder={bounds ? effectiveZRange.zMax.toFixed(1) : "—"} style={{ width: "100%", background: C.surface, color: C.text, border: `1px solid ${C.panelBorder}`, borderRadius: 4, padding: "3px 6px", fontSize: 11, outline: "none" }} />
                          </div>
                        </div>
                        <Btn size="sm" onClick={() => { updateLayerProp(layer.id, "filterMin", undefined); updateLayerProp(layer.id, "filterMax", undefined); }} style={{ marginTop: 4, fontSize: 9, width: "100%", justifyContent: "center" }}>Reset Filter</Btn>
                      </div>

                      {/* Labels */}
                      <div style={{ borderTop: `1px solid ${C.panelBorder}`, paddingTop: 8 }}>
                        <Label>Labels</Label>
                        {[{ k: "showPointNumbers", l: "Point Numbers" }, { k: "showPointLevels", l: "Point Levels (Z)" }, { k: "showPointDescs", l: "Point Descriptions" }].map(o =>
                          <label key={o.k} style={{ display: "flex", alignItems: "center", gap: 8, padding: "3px 0", cursor: "pointer", fontSize: 11 }}>
                            <input type="checkbox" checked={layer[o.k] || false} onChange={() => updateLayerProp(layer.id, o.k, !layer[o.k])} style={{ accentColor: C.accent }} />{o.l}
                          </label>
                        )}
                        <Sld label="Label Size" value={layer.labelSize || 9} onChange={v => updateLayerProp(layer.id, "labelSize", v)} min={6} max={24} />
                        <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4 }}>
                          <Label style={{ flex: "none" }}>Halo</Label>
                          <input type="color" value={layer.labelHaloColor || "#000000"} onChange={e => updateLayerProp(layer.id, "labelHaloColor", e.target.value)} style={{ width: 24, height: 20, border: "none", cursor: "pointer" }} title="Halo color" />
                          <Sld label="" value={layer.labelHaloWidth || 3} onChange={v => updateLayerProp(layer.id, "labelHaloWidth", v)} min={0} max={8} step={0.5} showValue={false} />
                          <span style={{ fontSize: 9, color: C.textDim, minWidth: 20 }}>{layer.labelHaloWidth || 3}px</span>
                        </div>
                      </div>

                      {/* Description filter */}
                      {uniqueDescs.length > 0 && <div style={{ borderTop: `1px solid ${C.panelBorder}`, paddingTop: 8 }}>
                        <Label>Description Filter</Label>
                        <div style={{ display: "flex", gap: 4, marginBottom: 4 }}>
                          <Btn size="sm" onClick={() => setHiddenDescs(new Set())} style={{ flex: 1, justifyContent: "center", fontSize: 9 }}>All</Btn>
                          <Btn size="sm" onClick={() => setHiddenDescs(new Set(uniqueDescs))} style={{ flex: 1, justifyContent: "center", fontSize: 9 }}>None</Btn>
                        </div>
                        <div style={{ maxHeight: 140, overflow: "auto", display: "flex", flexDirection: "column", gap: 2 }}>
                          {uniqueDescs.map(d => (
                            <label key={d} style={{ display: "flex", alignItems: "center", gap: 6, padding: "2px 0", cursor: "pointer", fontSize: 10 }}>
                              <input type="checkbox" checked={!hiddenDescs.has(d)} onChange={() => {
                                setHiddenDescs(prev => { const next = new Set(prev); next.has(d) ? next.delete(d) : next.add(d); return next; });
                              }} style={{ accentColor: C.accent }} />
                              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d}</span>
                              <span style={{ fontSize: 9, color: C.textDim, marginLeft: "auto", flexShrink: 0 }}>{points.filter(p => String(p.desc) === d).length}</span>
                            </label>
                          ))}
                        </div>
                        <div style={{ fontSize: 10, color: C.textDim, marginTop: 4 }}>Showing {filteredPoints.length.toLocaleString()} / {points.length.toLocaleString()} points</div>
                      </div>}
                    </>}
                  </div>}
                </div>;
              })}
            </div>}


            {/* ── Export Panel ──────────────────────────────────────────── */}
            {activePanel === "export" && <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <Label>Export Data</Label>
              <Btn onClick={() => downloadFile(pointsToCSV(points), `${fileName || "survey"}-points.csv`)} disabled={points.length === 0} style={{ width: "100%", justifyContent: "center" }}><I.Download /> Points as CSV</Btn>
              <Btn onClick={() => {
                const exportPts = projectCRS !== "LOCAL" && projectCRS !== "EPSG:4326" ? transformPoints(points, projectCRS, "EPSG:4326") : points;
                downloadFile(pointsToGeoJSON(exportPts), `${fileName || "survey"}-points.geojson`);
              }} disabled={points.length === 0} style={{ width: "100%", justifyContent: "center" }}><I.Download /> Points as GeoJSON</Btn>
              <Btn onClick={() => downloadFile(contoursToGeoJSON(contourData || []), `${fileName || "survey"}-contours.geojson`)} disabled={!contourData} style={{ width: "100%", justifyContent: "center" }}><I.Download /> Contours as GeoJSON</Btn>
              <Btn onClick={() => downloadFile(contoursToDXF(contourData || []), `${fileName || "survey"}-contours.dxf`)} disabled={!contourData} style={{ width: "100%", justifyContent: "center" }}><I.Download /> Contours as DXF</Btn>
              <Btn onClick={() => { if (gridData) downloadFile(gridToASCII(gridData.grid, gridData.gridX, gridData.gridY, gridData.nx, gridData.ny), `${fileName || "survey"}-grid.asc`) }} disabled={!gridData} style={{ width: "100%", justifyContent: "center" }}><I.Download /> Grid as ASCII</Btn>
              <Btn onClick={() => downloadFile(breaklinesToCSV(breaklines), `${fileName || "survey"}-breaklines.csv`)} disabled={breaklines.length === 0} style={{ width: "100%", justifyContent: "center" }}><I.Download /> Breaklines as CSV</Btn>
              <Btn onClick={() => downloadFile(breaklinesToGeoJSON(breaklines), `${fileName || "survey"}-breaklines.geojson`)} disabled={breaklines.length === 0} style={{ width: "100%", justifyContent: "center" }}><I.Download /> Breaklines as GeoJSON</Btn>

              <div style={{ borderTop: `1px solid ${C.panelBorder}`, paddingTop: 12, marginTop: 4 }}>
                <Label>Civil 3D Export</Label>
                <div style={{ fontSize: 10, color: C.textDim, marginBottom: 6 }}>Formats compatible with Autodesk Civil 3D</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <Btn onClick={() => { if (gridData) downloadFile(gridPointsToCSV(gridData.grid, gridData.gridX, gridData.gridY, gridData.nx, gridData.ny), `${fileName || "surface"}-grid-points.csv`) }} disabled={!gridData} style={{ width: "100%", justifyContent: "center" }} title="X,Y,Z CSV of interpolated grid nodes"><I.Download /> Grid Points as CSV</Btn>
                  <Btn onClick={() => { if (gridData) downloadFile(gridPointsToPNEZD(gridData.grid, gridData.gridX, gridData.gridY, gridData.nx, gridData.ny), `${fileName || "surface"}-grid-pnezd.csv`) }} disabled={!gridData} style={{ width: "100%", justifyContent: "center" }} title="PointNumber,Northing,Easting,Elevation,Description — Civil 3D point import format"><I.Download /> Grid Points as PNEZD</Btn>
                  <Btn onClick={() => downloadFile(pointsToPNEZD(points), `${fileName || "surface"}-points-pnezd.csv`)} disabled={points.length === 0} style={{ width: "100%", justifyContent: "center" }} title="Raw survey points in PNEZD format for Civil 3D"><I.Download /> Points as PNEZD</Btn>
                  <Btn onClick={() => exportLandXMLTIN("raw")} disabled={points.length < 3 || exporting} style={{ width: "100%", justifyContent: "center" }} title="LandXML TIN surface from raw point triangulation (Delaunay with breakline constraints)"><I.Download /> TIN Surface (LandXML)</Btn>
                  <Btn onClick={() => exportLandXMLTIN("grid")} disabled={!gridData} style={{ width: "100%", justifyContent: "center" }} title="LandXML TIN surface from interpolated grid topology (instant, no triangulation needed)"><I.Download /> Grid Surface (LandXML)</Btn>
                  <Btn onClick={() => { if (gridData) downloadFile(gridToASCII(gridData.grid, gridData.gridX, gridData.gridY, gridData.nx, gridData.ny), `${fileName || "surface"}-dem.asc`) }} disabled={!gridData} style={{ width: "100%", justifyContent: "center" }} title="ESRI ASCII grid — import in Civil 3D via 'Add surface from DEM file'"><I.Download /> DEM for Civil 3D (.asc)</Btn>
                </div>
                {exporting && <div style={{ marginTop: 8, padding: 8, background: C.surface, borderRadius: 6 }}>
                  <div style={{ fontSize: 10, color: C.textMuted, marginBottom: 4 }}>{exportStage}</div>
                  <div style={{ width: "100%", height: 4, background: C.panelBorder, borderRadius: 2, overflow: "hidden" }}>
                    <div style={{ width: `${exportProgress}%`, height: "100%", background: C.accent, borderRadius: 2, transition: "width 0.3s" }} />
                  </div>
                  <div style={{ fontSize: 9, color: C.textDim, marginTop: 2, textAlign: "right" }}>{Math.round(exportProgress)}%</div>
                </div>}
              </div>

              <div style={{ borderTop: `1px solid ${C.panelBorder}`, paddingTop: 12, marginTop: 4 }}>
                <Label>Export Map</Label>
                <Btn onClick={exportPNG} style={{ width: "100%", justifyContent: "center" }}><I.Download /> Map as PNG</Btn>
              </div>
              <div style={{ borderTop: `1px solid ${C.panelBorder}`, paddingTop: 12, marginTop: 4 }}>
                <Label>Project</Label>
                <Btn onClick={saveProject} variant="primary" style={{ width: "100%", justifyContent: "center", marginBottom: 8 }}><I.Save /> Save Project</Btn>
                <Btn onClick={() => projectInputRef.current?.click()} style={{ width: "100%", justifyContent: "center" }}><I.Upload /> Load Project</Btn>
                <input ref={projectInputRef} type="file" accept=".gfproj,.json" onChange={e => loadProject(e.target.files[0])} style={{ display: "none" }} />
              </div>

              <div style={{ borderTop: `1px solid ${C.panelBorder}`, paddingTop: 12, marginTop: 4 }}>
                <Label>Settings</Label>
                <Btn onClick={async () => { const json = await exportSettingsJSON(); downloadFile(json, 'gridforge-settings.json'); }} style={{ width: "100%", justifyContent: "center", marginBottom: 6 }}><I.Download /> Export Settings</Btn>
                <Btn onClick={() => settingsFileRef.current?.click()} style={{ width: "100%", justifyContent: "center" }}><I.Upload /> Import Settings</Btn>
                <input ref={settingsFileRef} type="file" accept=".json" onChange={async (e) => {
                  const file = e.target.files[0]; if (!file) return;
                  const text = await file.text();
                  const ok = await importSettingsJSON(text);
                  if (ok) { const s = await loadAllSettings(); if (s.baseMap) setBaseMap(s.baseMap); if (s.projectCRS) setProjectCRS(s.projectCRS); alert('Settings imported!'); } else alert('Failed to import settings.');
                }} style={{ display: "none" }} />
              </div>

              {/* ── Gridding Presets ─────── */}
              <div style={{ borderTop: `1px solid ${C.panelBorder}`, paddingTop: 12, marginTop: 4 }}>
                <Label>Gridding Presets</Label>
                <div style={{ display: "flex", gap: 4, marginBottom: 6 }}>
                  <input type="text" value={presetName} onChange={e => setPresetName(e.target.value)} placeholder="Preset name…" style={{ flex: 1, background: C.surface, color: C.text, border: `1px solid ${C.panelBorder}`, borderRadius: 4, padding: "4px 8px", fontSize: 11, outline: "none" }} />
                  <Btn onClick={async () => { if (!presetName.trim()) return; await saveGriddingPreset(presetName.trim(), gs); setGriddingPresets(await getGriddingPresets()); setPresetName(""); }} disabled={!presetName.trim()} style={{ flexShrink: 0 }}><I.Save /></Btn>
                </div>
                {griddingPresets.map(p => (
                  <div key={p.name} style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 4 }}>
                    <Btn onClick={() => setGs(prev => ({ ...prev, ...p.params }))} style={{ flex: 1, fontSize: 10, justifyContent: "flex-start" }}>{p.name}</Btn>
                    <span onClick={async () => { await deleteGriddingPreset(p.name); setGriddingPresets(await getGriddingPresets()); }} style={{ cursor: "pointer", color: C.textDim, fontSize: 10 }}>✕</span>
                  </div>
                ))}
              </div>

              {/* ── Recent Files ─────── */}
              {recentFiles.length > 0 && <div style={{ borderTop: `1px solid ${C.panelBorder}`, paddingTop: 12, marginTop: 4 }}>
                <Label>Recent Files</Label>
                {recentFiles.slice(0, 10).map((rf, i) => (
                  <div key={i} style={{ fontSize: 10, color: C.textDim, padding: "2px 0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {rf.name} <span style={{ fontSize: 9, color: C.textMuted }}>({(rf.size / 1024).toFixed(0)} KB)</span>
                  </div>
                ))}
              </div>}
            </div>}

            {/* ── Compare Panel ─────────────────────────────────────────── */}
            {activePanel === "compare" && <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ fontSize: 11, color: C.textMuted, lineHeight: 1.5 }}>Select 2-4 algorithms and run them side-by-side on the current dataset.</div>
              {ALGORITHMS.filter(a => a.value !== "data_metrics").map(a => <label key={a.value} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, cursor: "pointer" }}>
                <input type="checkbox" checked={compMode?.algos?.includes(a.value) || false} onChange={e => {
                  const algos = compMode?.algos || [];
                  if (e.target.checked && algos.length < 4) setCompMode({ algos: [...algos, a.value], results: [] });
                  else if (!e.target.checked) setCompMode({ algos: algos.filter(x => x !== a.value), results: [] });
                }} style={{ accentColor: C.accent }} />{a.label}
              </label>)}
              <Btn onClick={() => { if (compMode?.algos?.length >= 2) runComparison(compMode.algos); }} variant="primary" disabled={!compMode || compMode.algos.length < 2 || points.length === 0 || gridding} style={{ width: "100%", justifyContent: "center" }}>
                {gridding ? "Computing..." : "Run Comparison"}
              </Btn>
              {compMode?.results?.length > 0 && <Btn onClick={() => setCompMode(null)} variant="ghost" style={{ width: "100%", justifyContent: "center" }}>Clear Comparison</Btn>}
            </div>}

            {/* ── Measure Panel ─────────────────────────────────────────── */}
            {activePanel === "measure" && <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ fontSize: 11, color: C.textMuted, lineHeight: 1.5 }}>Click on the map to place measurement points.</div>
              <div style={{ display: "flex", gap: 4 }}>
                <Btn onClick={() => { setMeasureMode("distance"); setMeasurePts([]); }} variant={measureMode === "distance" ? "primary" : "default"} style={{ flex: 1, justifyContent: "center" }}><I.Ruler /> Distance</Btn>
                <Btn onClick={() => { setMeasureMode("area"); setMeasurePts([]); }} variant={measureMode === "area" ? "primary" : "default"} style={{ flex: 1, justifyContent: "center" }}><I.Map /> Area</Btn>
              </div>
              <Btn onClick={() => { setMeasureMode("profile"); setMeasurePts([]); }} variant={measureMode === "profile" ? "primary" : "default"} style={{ width: "100%", justifyContent: "center" }}><I.Mountain /> Elevation Profile</Btn>
              <div style={{ display: "flex", gap: 4 }}>
                <Btn onClick={() => setMeasurePts(prev => prev.slice(0, -1))} variant="ghost" disabled={measurePts.length === 0} style={{ flex: 1, justifyContent: "center" }}><I.Undo /> Undo Point</Btn>
                <Btn onClick={() => { setMeasureMode(null); setMeasurePts([]); }} variant="ghost" style={{ flex: 1, justifyContent: "center" }}><I.Trash /> Clear</Btn>
              </div>
              {/* Detailed results table */}
              {measurePts.length >= 2 && (() => {
                const segs = [];
                let cumDist = 0;
                const zVals = measurePts.map(([px, py]) => {
                  if (!gridData) return NaN;
                  const { grid: g, gridX: gx, gridY: gy, nx: gnx, ny: gny } = gridData;
                  return sampleGridZ(g, gx, gy, gnx, gny, px, py);
                });
                for (let i = 0; i < measurePts.length - 1; i++) {
                  const [x1, y1] = measurePts[i], [x2, y2] = measurePts[i + 1];
                  const dist = measureDistance(x1, y1, x2, y2);
                  cumDist += dist;
                  const bearing = measureBearing(x1, y1, x2, y2);
                  const z1 = zVals[i], z2 = zVals[i + 1];
                  const slope = (!isNaN(z1) && !isNaN(z2) && dist > 0) ? ((z2 - z1) / dist) * 100 : NaN;
                  segs.push({ seg: i + 1, dist, cumDist, bearing, slope });
                }
                // Closing segment for area
                if (measureMode === "area" && measurePts.length > 2) {
                  const [x1, y1] = measurePts[measurePts.length - 1], [x2, y2] = measurePts[0];
                  const dist = measureDistance(x1, y1, x2, y2);
                  cumDist += dist;
                  const bearing = measureBearing(x1, y1, x2, y2);
                  const z1 = zVals[measurePts.length - 1], z2 = zVals[0];
                  const slope = (!isNaN(z1) && !isNaN(z2) && dist > 0) ? ((z2 - z1) / dist) * 100 : NaN;
                  segs.push({ seg: segs.length + 1, dist, cumDist, bearing, slope, closing: true });
                }
                const totalDist = cumDist;
                const area = (measureMode === "area" && measurePts.length > 2) ? measurePolygonArea(measurePts) : null;
                const formatBrg = (deg) => {
                  const d = ((deg % 360) + 360) % 360;
                  let p, s, v;
                  if (d <= 90) { p = "N"; s = "E"; v = d; }
                  else if (d <= 180) { p = "S"; s = "E"; v = 180 - d; }
                  else if (d <= 270) { p = "S"; s = "W"; v = d - 180; }
                  else { p = "N"; s = "W"; v = 360 - d; }
                  return `${p}${v.toFixed(1)}\u00B0${s}`;
                };
                const copyData = () => {
                  let text = "Seg\tDist\tCumulative\tBearing\tSlope\n";
                  segs.forEach(s => { text += `${s.seg}\t${s.dist.toFixed(3)}\t${s.cumDist.toFixed(3)}\t${formatBrg(s.bearing)}\t${isNaN(s.slope) ? "-" : s.slope.toFixed(2) + "%"}\n`; });
                  text += `\nTotal Distance: ${totalDist.toFixed(3)}\n`;
                  if (area !== null) text += `Area: ${area.toFixed(3)} sq units\nPerimeter: ${totalDist.toFixed(3)}\n`;
                  text += "\nVertices:\nPt\tX\tY\tZ\n";
                  measurePts.forEach(([px, py], i) => { text += `${i + 1}\t${px.toFixed(3)}\t${py.toFixed(3)}\t${isNaN(zVals[i]) ? "-" : zVals[i].toFixed(3)}\n`; });
                  navigator.clipboard.writeText(text);
                };
                return <div style={{ padding: 8, background: C.surface, borderRadius: 6, fontSize: 10, fontFamily: "'JetBrains Mono',monospace" }}>
                  {/* Summary */}
                  <div style={{ fontWeight: 700, marginBottom: 4, fontSize: 11, color: C.accent }}>
                    {area !== null ? `Area: ${area.toFixed(2)} sq units | Perim: ${totalDist.toFixed(2)}` : `Total: ${totalDist.toFixed(2)} units`}
                  </div>
                  {/* Segment table */}
                  <div style={{ overflowX: "auto" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 10 }}>
                      <thead><tr style={{ borderBottom: `1px solid ${C.border}` }}>
                        <th style={{ textAlign: "left", padding: "2px 4px" }}>Seg</th>
                        <th style={{ textAlign: "right", padding: "2px 4px" }}>Dist</th>
                        <th style={{ textAlign: "right", padding: "2px 4px" }}>Cum</th>
                        <th style={{ textAlign: "right", padding: "2px 4px" }}>Bearing</th>
                        <th style={{ textAlign: "right", padding: "2px 4px" }}>Slope</th>
                      </tr></thead>
                      <tbody>{segs.map(s => <tr key={s.seg} style={{ borderBottom: `1px solid ${C.border}22` }}>
                        <td style={{ padding: "2px 4px" }}>{s.closing ? `${s.seg}*` : s.seg}</td>
                        <td style={{ textAlign: "right", padding: "2px 4px" }}>{s.dist.toFixed(2)}</td>
                        <td style={{ textAlign: "right", padding: "2px 4px" }}>{s.cumDist.toFixed(2)}</td>
                        <td style={{ textAlign: "right", padding: "2px 4px" }}>{formatBrg(s.bearing)}</td>
                        <td style={{ textAlign: "right", padding: "2px 4px" }}>{isNaN(s.slope) ? "-" : `${s.slope >= 0 ? "+" : ""}${s.slope.toFixed(1)}%`}</td>
                      </tr>)}</tbody>
                    </table>
                  </div>
                  {/* Vertex coordinates */}
                  <div style={{ marginTop: 6, fontSize: 9, color: C.textMuted }}>
                    <div style={{ fontWeight: 600, marginBottom: 2 }}>Vertices:</div>
                    {measurePts.map(([px, py], i) => <div key={i}>
                      {i + 1}: ({px.toFixed(2)}, {py.toFixed(2)}){!isNaN(zVals[i]) ? ` Z=${zVals[i].toFixed(2)}` : ""}
                    </div>)}
                  </div>
                  <Btn onClick={copyData} variant="ghost" size="sm" style={{ width: "100%", justifyContent: "center", marginTop: 6 }}><I.Copy /> Copy to Clipboard</Btn>
                </div>;
              })()}
              {/* Profile mode elevation display */}
              {measureMode === "profile" && measurePts.length >= 1 && gridData && (() => {
                const zVals = measurePts.map(([px, py]) => {
                  const { grid: g, gridX: gx, gridY: gy, nx: gnx, ny: gny } = gridData;
                  return sampleGridZ(g, gx, gy, gnx, gny, px, py);
                });
                const validZ = zVals.filter(z => !isNaN(z));
                if (validZ.length === 0) return null;
                const zMin = Math.min(...validZ), zMax = Math.max(...validZ);
                return <div style={{ padding: 8, background: C.surface, borderRadius: 6, fontSize: 10, fontFamily: "'JetBrains Mono',monospace" }}>
                  <div style={{ fontWeight: 700, marginBottom: 4, fontSize: 11, color: C.accent }}>Elevation Profile</div>
                  <div style={{ marginBottom: 4 }}>Range: {zMin.toFixed(2)} - {zMax.toFixed(2)} ({(zMax - zMin).toFixed(2)} span)</div>
                  {measurePts.map(([px, py], i) => <div key={i} style={{ display: "flex", justifyContent: "space-between" }}>
                    <span>Pt {i + 1}</span>
                    <span style={{ color: isNaN(zVals[i]) ? C.textMuted : C.accent }}>{isNaN(zVals[i]) ? "N/A" : `Z=${zVals[i].toFixed(3)}`}</span>
                  </div>)}
                </div>;
              })()}
              {selectedPts.size > 0 && <div style={{ padding: 8, background: C.surface, borderRadius: 6, fontSize: 11 }}>
                <div style={{ fontWeight: 600, color: C.accent }}>{selectedPts.size} points selected</div>
                <div style={{ display: "flex", gap: 4, marginTop: 4 }}>
                  <Btn size="sm" onClick={() => setSelectedPts(new Set())} variant="ghost">Clear Selection</Btn>
                  <Btn size="sm" onClick={deleteSelectedPoints} variant="danger"><I.Trash /> Delete</Btn>
                </div>
              </div>}
            </div>}

            {/* ── TIN Editing Panel ──────────────────────────────────────── */}
            {activePanel === "tin" && <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <Section title="Build TIN">
                <Btn size="sm" variant="primary" style={{ width: "100%", justifyContent: "center" }} disabled={points.length < 3} onClick={() => {
                  const tin = delaunayTriangulate(filteredPoints);
                  const mesh = buildMesh(tin, filteredPoints.length);
                  setTinMesh(mesh);
                  setTinEditMode("select");
                  setTinSelection(null);
                  setShowTinMesh(true);
                }}><I.Triangle /> Build TIN from Points ({filteredPoints.length})</Btn>
              </Section>

              {tinMesh && <>
                <Section title="Mesh">
                  {(() => {
                    const s = meshStats(tinMesh); return (<>
                      <StatRow label="Vertices" value={s.vertices.toLocaleString()} />
                      <StatRow label="Triangles" value={s.triangles.toLocaleString()} />
                      <StatRow label="Locked" value={s.lockedTriangles} />
                      <StatRow label="Constrained edges" value={s.constrainedEdges} />
                    </>);
                  })()}
                </Section>

                <Section title="Display">
                  <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                    <label style={{ fontSize: 11, color: C.textMuted, display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
                      <input type="checkbox" checked={showTinMesh} onChange={e => setShowTinMesh(e.target.checked)} style={{ accentColor: C.accent }} />
                      Show mesh wireframe
                    </label>
                  </div>
                </Section>

                <Section title="Editing Tools">
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4 }}>
                    {[
                      { id: "select", label: "Select", icon: "◇" },
                      { id: "swap", label: "Swap Edge", icon: "⇄" },
                      { id: "insert", label: "Insert Pt", icon: "+" },
                      { id: "delete_pt", label: "Delete Pt", icon: "−" },
                      { id: "delete_tri", label: "Delete Tri", icon: "✕" },
                      { id: "flatten", label: "Flatten", icon: "▬" },
                      { id: "modify_z", label: "Modify Z", icon: "Z" },
                      { id: "lock", label: "Lock Tri", icon: "🔒" },
                      { id: "breakline", label: "Breakline", icon: "╱" },
                    ].map(tool => (
                      <Btn key={tool.id} size="sm" onClick={() => { setTinEditMode(tinEditMode === tool.id ? null : tool.id); setTinSelection(null); }}
                        style={{
                          justifyContent: "center", fontSize: 10, gap: 4,
                          background: tinEditMode === tool.id ? C.accent + "33" : C.surface,
                          border: tinEditMode === tool.id ? `1px solid ${C.accent}` : `1px solid ${C.panelBorder}`,
                          color: tinEditMode === tool.id ? C.accent : C.textMuted,
                        }}>
                        <span style={{ fontSize: 13 }}>{tool.icon}</span> {tool.label}
                      </Btn>
                    ))}
                  </div>
                  {tinEditMode && <div style={{ fontSize: 10, color: C.textMuted, marginTop: 6, padding: "4px 6px", background: C.surface, borderRadius: 4, lineHeight: 1.4 }}>
                    {tinEditMode === "select" && "Click a triangle to select it."}
                    {tinEditMode === "swap" && "Click an edge to preview flip. Click same edge again to confirm."}
                    {tinEditMode === "insert" && "Click inside a triangle to add a new vertex."}
                    {tinEditMode === "delete_pt" && "Click a vertex to remove it and re-triangulate."}
                    {tinEditMode === "delete_tri" && "Click a triangle to mark it as void."}
                    {tinEditMode === "flatten" && "Click a triangle to set all 3 vertices to average Z."}
                    {tinEditMode === "modify_z" && "Click a vertex, then enter new Z value below."}
                    {tinEditMode === "lock" && "Click a triangle to toggle lock (locked = cannot be modified)."}
                    {tinEditMode === "breakline" && "Click first vertex, then second vertex to force edge."}
                  </div>}
                </Section>

                {/* Modify Z input */}
                {tinEditMode === "modify_z" && tinSelection?.type === "vertex" && <Section title={`Vertex ${tinSelection.index} — Z Value`}>
                  <div style={{ display: "flex", gap: 4 }}>
                    <input type="number" value={tinZInput} onChange={e => setTinZInput(e.target.value)}
                      style={{ flex: 1, background: C.surface, color: C.text, border: `1px solid ${C.panelBorder}`, borderRadius: 4, padding: "5px 8px", fontSize: 12, outline: "none", fontFamily: "'JetBrains Mono',monospace" }}
                      onKeyDown={e => { if (e.key === "Enter") { const z = parseFloat(tinZInput); if (!isNaN(z)) { modifyVertexZ(tinMesh, tinSelection.index, z); setTinMesh({ ...tinMesh }); } } }}
                    />
                    <Btn size="sm" variant="primary" onClick={() => {
                      const z = parseFloat(tinZInput);
                      if (!isNaN(z)) { modifyVertexZ(tinMesh, tinSelection.index, z); setTinMesh({ ...tinMesh }); }
                    }}>Set</Btn>
                  </div>
                </Section>}

                <Section title="Undo / Redo">
                  <div style={{ display: "flex", gap: 4 }}>
                    <Btn size="sm" style={{ flex: 1, justifyContent: "center" }} disabled={!tinMesh.undoStack?.length} onClick={() => {
                      if (undoEdit(tinMesh)) { setTinMesh({ ...tinMesh }); setTinSelection(null); }
                    }}><I.Undo /> Undo</Btn>
                    <Btn size="sm" style={{ flex: 1, justifyContent: "center" }} disabled={!tinMesh.redoStack?.length} onClick={() => {
                      if (redoEdit(tinMesh)) { setTinMesh({ ...tinMesh }); setTinSelection(null); }
                    }}><I.Redo /> Redo</Btn>
                  </div>
                </Section>

                <Section title="Apply">
                  <Btn size="sm" variant="success" style={{ width: "100%", justifyContent: "center" }} onClick={() => {
                    // Export mesh back to points and re-grid
                    const exported = exportMesh(tinMesh);
                    const newPts = [];
                    for (let i = 0; i < exported.pz.length; i++) {
                      newPts.push({ x: exported.px[i], y: exported.py[i], z: exported.pz[i], pointNo: i + 1 });
                    }
                    setPoints(newPts);
                    setAllRows(newPts);
                    setHeaders(["x", "y", "z"]);
                  }}>Apply TIN edits to Points</Btn>
                  <div style={{ fontSize: 10, color: C.textMuted, marginTop: 4 }}>
                    Replaces point data with edited TIN vertices. Re-run gridding to update raster/contours.
                  </div>
                </Section>

                <Btn size="sm" variant="danger" style={{ width: "100%", justifyContent: "center", marginTop: 4 }} onClick={() => {
                  setTinMesh(null); setTinEditMode(null); setTinSelection(null);
                }}><I.Trash /> Clear TIN</Btn>
              </>}
            </div>}

            {/* ── Help Panel ──────────────────────────────────────────── */}
            {activePanel === "help" && <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {[
                {
                  title: "Getting Started", content: [
                    "1. Import Data — Click Import in the sidebar and drop a CSV, GeoJSON, or open a saved .gfproj file. Your point data (X, Y, Z) will appear on the canvas.",
                    "2. Column Mapping — After import, map your file columns to X (Easting), Y (Northing), Z (Elevation), and optional Number / Level / Description fields.",
                    "3. Set CRS — Choose a Coordinate Reference System if your data uses projected coordinates. This enables basemap alignment.",
                    "4. Run Gridding — Open the Grid panel, pick an algorithm, set resolution, and click Run. The interpolated surface renders on the canvas.",
                  ]
                },
                {
                  title: "Keyboard Shortcuts", content: [
                    "Ctrl + Z — Undo last action",
                    "Ctrl + Shift + Z — Redo",
                    "S — Toggle snap-to-point mode",
                    "Scroll wheel — Zoom in / out at cursor",
                    "Double-click — Place a point at cursor location",
                    "Click + drag — Pan the map",
                    "Shift + click-drag — Box select points",
                  ]
                },
                {
                  title: "Gridding Algorithms", content: [
                    "IDW — Inverse Distance Weighting. Fast, general-purpose interpolator. Nearby points have more influence.",
                    "Natural Neighbor — Smooth interpolation based on Voronoi tessellation. Good for scattered data.",
                    "Minimum Curvature — Generates the smoothest possible surface through data points. Common in geoscience.",
                    "Kriging (Ordinary / Universal / Simple) — Geostatistical methods that model spatial correlation via variograms.",
                    "RBF — Radial Basis Functions. Flexible exact interpolator with multiple kernel choices.",
                    "TIN — Triangulated Irregular Network. Linear interpolation within Delaunay triangles.",
                    "Nearest Neighbor — Assigns each cell the value of the closest data point.",
                    "Moving Average — Averages points within a search radius. Produces a smoothed surface.",
                    "Polynomial Regression — Fits a polynomial trend surface to the data.",
                    "Modified Shepard's — Enhanced IDW with local polynomial corrections.",
                    "Data Metrics — Bins data into grid cells and computes a statistic (mean, min, max, etc.).",
                  ]
                },
                {
                  title: "Map Controls", content: [
                    "Zoom +/− — Buttons at top-right, or scroll wheel",
                    "Fit View — Resets zoom to show all data points",
                    "Compass — Toggleable north indicator on the canvas",
                    "Basemap — Choose None, OSM, or Satellite imagery underlay",
                    "3D View — Switch to a perspective 3D view with tilt, rotation, and vertical exaggeration controls",
                  ]
                },
                {
                  title: "Export", content: [
                    "CSV — Export point data as comma-separated values",
                    "GeoJSON — Points or contour lines in GeoJSON format",
                    "Esri ASCII Grid — Standard .asc raster format for GIS software",
                    "Project File — Save the full project (.gfproj) including data, grid, and settings",
                  ]
                },
              ].map(section => (
                <div key={section.title}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: C.accent, marginBottom: 6 }}>{section.title}</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    {section.content.map((line, i) => (
                      <div key={i} style={{ fontSize: 11, color: C.textMuted, lineHeight: 1.5, paddingLeft: 4 }}>{line}</div>
                    ))}
                  </div>
                </div>
              ))}
            </div>}

            {/* ── Plot Panel ───────────────────────────────────────────── */}
            {activePanel === "plot" && <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <Section title="Page Setup">
                <Sel value={plotSettings.pageSize} onChange={v => updatePs("pageSize", v)} options={Object.entries(PAGE_SIZES).map(([k, v]) => ({ value: k, label: v.label }))} style={{ width: "100%", marginBottom: 6 }} />
                <div style={{ display: "flex", gap: 6, marginBottom: 6 }}>
                  {["portrait", "landscape"].map(o => (
                    <Btn key={o} size="sm" onClick={() => updatePs("orientation", o)} style={{ flex: 1, justifyContent: "center", fontSize: 10, background: plotSettings.orientation === o ? C.accent + "33" : C.surface, border: plotSettings.orientation === o ? `1px solid ${C.accent}` : `1px solid ${C.panelBorder}`, color: plotSettings.orientation === o ? C.accent : C.textMuted, textTransform: "capitalize" }}>{o}</Btn>
                  ))}
                </div>
                <Sel value={String(plotSettings.scale)} onChange={v => updatePs("scale", +v)} options={SCALES.map(s => ({ value: String(s.value), label: s.label }))} style={{ width: "100%", marginBottom: 6 }} />
                <Sld label="Margin (mm)" value={plotSettings.marginTop} onChange={v => { updatePs("marginTop", v); updatePs("marginBottom", v); updatePs("marginLeft", v); updatePs("marginRight", v); }} min={5} max={40} />
                <Sld label="DPI" value={plotSettings.dpi} onChange={v => updatePs("dpi", v)} min={72} max={600} step={1} />
              </Section>

              <Section title="Coordinate Grid">
                <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, cursor: "pointer", marginBottom: 6 }}>
                  <input type="checkbox" checked={plotSettings.gridEnabled} onChange={() => updatePs("gridEnabled", !plotSettings.gridEnabled)} style={{ accentColor: C.accent }} /> Show Grid Lines
                </label>
                {plotSettings.gridEnabled && <>
                  <div style={{ display: "flex", gap: 6, marginBottom: 6 }}>
                    <div style={{ flex: 1 }}><Label>Spacing</Label><input type="number" value={plotSettings.gridSpacing} onChange={e => updatePs("gridSpacing", +e.target.value)} placeholder="Auto" style={{ width: "100%", background: C.surface, color: C.text, border: `1px solid ${C.panelBorder}`, borderRadius: 4, padding: "4px 6px", fontSize: 11, outline: "none" }} /></div>
                  </div>
                  <Sel value={plotSettings.gridStyle} onChange={v => updatePs("gridStyle", v)} options={GRID_STYLES} style={{ width: "100%", marginBottom: 6 }} />
                  <Sel value={String(plotSettings.gridWeight)} onChange={v => updatePs("gridWeight", +v)} options={GRID_WEIGHTS.map(w => ({ value: String(w.value), label: w.label }))} style={{ width: "100%", marginBottom: 6 }} />
                  <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, cursor: "pointer", marginBottom: 6 }}>
                    <input type="checkbox" checked={plotSettings.gridLabelEnabled} onChange={() => updatePs("gridLabelEnabled", !plotSettings.gridLabelEnabled)} style={{ accentColor: C.accent }} /> Grid Labels
                  </label>
                  {plotSettings.gridLabelEnabled && <>
                    <Sld label="Label Size" value={plotSettings.gridLabelSize} onChange={v => updatePs("gridLabelSize", v)} min={5} max={14} />
                    <Sel value={plotSettings.gridLabelPlacement} onChange={v => updatePs("gridLabelPlacement", v)} options={[{ value: "all", label: "All Sides" }, { value: "top-left", label: "Top + Left" }, { value: "bottom-right", label: "Bottom + Right" }]} style={{ width: "100%", marginBottom: 6 }} />
                    <Sel value={plotSettings.gridLabelFormat} onChange={v => updatePs("gridLabelFormat", v)} options={[{ value: "decimal", label: "Decimal" }, { value: "dms", label: "Degrees/Min/Sec" }]} style={{ width: "100%" }} />
                  </>}
                  <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, cursor: "pointer", marginTop: 6 }}>
                    <input type="checkbox" checked={plotSettings.gridMinorEnabled} onChange={() => updatePs("gridMinorEnabled", !plotSettings.gridMinorEnabled)} style={{ accentColor: C.accent }} /> Minor Grid
                  </label>
                  {plotSettings.gridMinorEnabled && <Sld label="Divisions" value={plotSettings.gridMinorDivisions} onChange={v => updatePs("gridMinorDivisions", v)} min={2} max={10} />}
                </>}
              </Section>

              <Section title="Content Layers">
                {[["showRaster", "Raster Surface"], ["showContours", "Contour Lines"], ["showPoints", "Survey Points"], ["showBoundaries", "Boundaries"], ["showBreaklines", "Breaklines"]].map(([k, lb]) => (
                  <label key={k} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, cursor: "pointer", marginBottom: 4 }}>
                    <input type="checkbox" checked={plotSettings[k]} onChange={() => updatePs(k, !plotSettings[k])} style={{ accentColor: C.accent }} /> {lb}
                  </label>
                ))}
              </Section>

              <Section title="Contour Style">
                <Sld label="Major Wt" value={plotSettings.contourMajorWeight} onChange={v => updatePs("contourMajorWeight", v)} min={0.2} max={3} step={0.1} />
                <Sld label="Minor Wt" value={plotSettings.contourMinorWeight} onChange={v => updatePs("contourMinorWeight", v)} min={0.1} max={2} step={0.1} />
                <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, cursor: "pointer", marginBottom: 4 }}>
                  <input type="checkbox" checked={plotSettings.contourLabels} onChange={() => updatePs("contourLabels", !plotSettings.contourLabels)} style={{ accentColor: C.accent }} /> Contour Labels
                </label>
                {plotSettings.contourLabels && <Sld label="Label Size" value={plotSettings.contourLabelSize} onChange={v => updatePs("contourLabelSize", v)} min={4} max={12} />}
              </Section>

              <Section title="Point Style">
                <Sld label="Point Size" value={plotSettings.pointSize} onChange={v => updatePs("pointSize", v)} min={1} max={10} />
                <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, cursor: "pointer" }}>
                  <input type="checkbox" checked={plotSettings.pointLabels} onChange={() => updatePs("pointLabels", !plotSettings.pointLabels)} style={{ accentColor: C.accent }} /> Z Labels
                </label>
                {plotSettings.pointLabels && <Sld label="Label Size" value={plotSettings.pointLabelSize} onChange={v => updatePs("pointLabelSize", v)} min={4} max={12} />}
              </Section>

              <div style={{ borderTop: `1px solid ${C.panelBorder}`, paddingTop: 12 }}>
                <Label>Style Mode</Label>
                <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
                  {["color", "bw"].map(m => (
                    <Btn key={m} size="sm" onClick={() => updatePs("mode", m)} style={{ flex: 1, justifyContent: "center", fontSize: 10, background: plotSettings.mode === m ? C.accent + "33" : C.surface, border: plotSettings.mode === m ? `1px solid ${C.accent}` : `1px solid ${C.panelBorder}`, color: plotSettings.mode === m ? C.accent : C.textMuted }}>
                      {m === "color" ? "Color" : "B & W"}
                    </Btn>
                  ))}
                </div>
              </div>

              <Section title="Title Block">
                <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, cursor: "pointer", marginBottom: 6 }}>
                  <input type="checkbox" checked={plotSettings.titleEnabled} onChange={() => updatePs("titleEnabled", !plotSettings.titleEnabled)} style={{ accentColor: C.accent }} /> Show Title Block
                </label>
                {plotSettings.titleEnabled && <>
                  <Label>Project Name</Label>
                  <input value={plotSettings.projectName} onChange={e => updatePs("projectName", e.target.value)} style={{ width: "100%", background: C.surface, color: C.text, border: `1px solid ${C.panelBorder}`, borderRadius: 4, padding: "6px 8px", fontSize: 11, outline: "none", marginBottom: 6 }} />
                  <Label>Author</Label>
                  <input value={plotSettings.author} onChange={e => updatePs("author", e.target.value)} style={{ width: "100%", background: C.surface, color: C.text, border: `1px solid ${C.panelBorder}`, borderRadius: 4, padding: "6px 8px", fontSize: 11, outline: "none", marginBottom: 6 }} />
                  <Label>Notes</Label>
                  <textarea value={plotSettings.notes} onChange={e => updatePs("notes", e.target.value)} rows={2} style={{ width: "100%", background: C.surface, color: C.text, border: `1px solid ${C.panelBorder}`, borderRadius: 4, padding: "6px 8px", fontSize: 11, outline: "none", resize: "vertical" }} />
                </>}
              </Section>

              <div style={{ display: "flex", gap: 6 }}>
                <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, cursor: "pointer" }}>
                  <input type="checkbox" checked={plotSettings.legendEnabled} onChange={() => updatePs("legendEnabled", !plotSettings.legendEnabled)} style={{ accentColor: C.accent }} /> Legend
                </label>
                <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, cursor: "pointer" }}>
                  <input type="checkbox" checked={plotSettings.northArrow} onChange={() => updatePs("northArrow", !plotSettings.northArrow)} style={{ accentColor: C.accent }} /> North Arrow
                </label>
              </div>
              {plotSettings.legendEnabled && <Sel value={plotSettings.legendPosition} onChange={v => updatePs("legendPosition", v)} options={[{ value: "bottom-left", label: "Bottom Left" }, { value: "bottom-right", label: "Bottom Right" }, { value: "top-left", label: "Top Left" }, { value: "top-right", label: "Top Right" }]} style={{ width: "100%" }} />}

              <div style={{ borderTop: `1px solid ${C.panelBorder}`, paddingTop: 12, display: "flex", flexDirection: "column", gap: 8 }}>
                <Btn onClick={() => {
                  setShowPlotPreview(true);
                  setTimeout(() => {
                    const modal = document.getElementById("plot-preview-container");
                    if (!modal) return;
                    const canvas = modal.querySelector("canvas");
                    if (!canvas) return;
                    const rl = layers.find(l => l.type === "raster");
                    const cl = layers.find(l => l.type === "contours");
                    const zMin = gridData?.zMin ?? bounds?.zMin ?? 0;
                    const zMax = gridData?.zMax ?? bounds?.zMax ?? 100;
                    const pData = {
                      points, gridData: gridData?.grid, gridX: gridData?.gridX, gridY: gridData?.gridY,
                      contours: contourData, boundaries, breaklines,
                      colorRamp: rl?.colorRamp || "viridis", allColorRamps: COLOR_RAMPS,
                      effectiveZRange: { zMin, zMax, range: (zMax - zMin) || 1 },
                      contourInterval: cl?.contourInterval || 10, majorInterval: cl?.majorInterval || 5,
                    };
                    const b = bounds || { xMin: 0, yMin: 0, xMax: 100, yMax: 100 };
                    const layout = computePlotLayout(plotSettings, b, 96);
                    if (layout) {
                      canvas.width = layout.pageWpx;
                      canvas.height = layout.pageHpx;
                      const ctx = canvas.getContext("2d");
                      window.__GF_COLOR_RAMPS = COLOR_RAMPS;
                      renderPlot(ctx, plotSettings, pData, layout);
                    }
                  }, 100);
                }} variant="default" style={{ width: "100%", justifyContent: "center" }}><I.Eye /> Preview Plot</Btn>
                <Btn onClick={() => {
                  const rl = layers.find(l => l.type === "raster");
                  const cl = layers.find(l => l.type === "contours");
                  const zMin = gridData?.zMin ?? bounds?.zMin ?? 0;
                  const zMax = gridData?.zMax ?? bounds?.zMax ?? 100;
                  const pData = {
                    points, gridData: gridData?.grid, gridX: gridData?.gridX, gridY: gridData?.gridY,
                    contours: contourData, boundaries, breaklines, bounds: bounds || { xMin: 0, yMin: 0, xMax: 100, yMax: 100 },
                    colorRamp: rl?.colorRamp || "viridis", allColorRamps: COLOR_RAMPS,
                    effectiveZRange: { zMin, zMax, range: (zMax - zMin) || 1 },
                    contourInterval: cl?.contourInterval || 10, majorInterval: cl?.majorInterval || 5,
                  };
                  window.__GF_COLOR_RAMPS = COLOR_RAMPS;
                  exportPlotPNG(plotSettings, pData, `${plotSettings.projectName || "plot"}.png`);
                }} variant="primary" style={{ width: "100%", justifyContent: "center" }}><I.Download /> Export PNG</Btn>
                <Btn onClick={() => {
                  const rl = layers.find(l => l.type === "raster");
                  const cl = layers.find(l => l.type === "contours");
                  const zMin = gridData?.zMin ?? bounds?.zMin ?? 0;
                  const zMax = gridData?.zMax ?? bounds?.zMax ?? 100;
                  const pData = {
                    points, gridData: gridData?.grid, gridX: gridData?.gridX, gridY: gridData?.gridY,
                    contours: contourData, boundaries, breaklines, bounds: bounds || { xMin: 0, yMin: 0, xMax: 100, yMax: 100 },
                    colorRamp: rl?.colorRamp || "viridis", allColorRamps: COLOR_RAMPS,
                    effectiveZRange: { zMin, zMax, range: (zMax - zMin) || 1 },
                    contourInterval: cl?.contourInterval || 10, majorInterval: cl?.majorInterval || 5,
                  };
                  window.__GF_COLOR_RAMPS = COLOR_RAMPS;
                  printPlot(plotSettings, pData);
                }} variant="success" style={{ width: "100%", justifyContent: "center" }}><I.Printer /> Print</Btn>
              </div>
            </div>}
          </div>
        </div>}

        {/* ─── Map Canvas ─────────────────────────────────────────────────── */}
        <div ref={containerRef} style={{ flex: 1, position: "relative", overflow: "hidden" }} onDrop={handleDrop} onDragOver={e => e.preventDefault()}>
          <canvas ref={canvasRef} role="img" aria-label={`GIS map canvas. ${points.length} points loaded${gridData ? `, ${gridData.nx}×${gridData.ny} grid` : ""}. Mode: ${viewMode}`} onMouseDown={handleMouseDown} onMouseMove={handleMouseMove} onMouseUp={handleMouseUp} onMouseLeave={handleMouseUp} onClick={handleCanvasClick} onDoubleClick={handleCanvasDblClick} onContextMenu={handleContextMenu}
            style={{ width: "100%", height: "100%", cursor: editNodesMode ? "crosshair" : drawMode ? "crosshair" : measureMode ? "crosshair" : dragRef.current.dragging ? "grabbing" : "crosshair" }}>GIS map view</canvas>

          {/* Map toolbar */}
          <div style={{ position: "absolute", top: 12, right: 12, display: "flex", flexDirection: "column", gap: 4, zIndex: 10 }}>
            {[{ label: "+", fn: () => setViewState(p => ({ ...p, scale: p.scale * 1.3 })), tip: "Zoom In" }, { label: "−", fn: () => setViewState(p => ({ ...p, scale: p.scale * 0.7 })), tip: "Zoom Out" }, { label: null, fn: fitView, icon: I.Crosshair, tip: "Fit View" }].map((b, i) =>
              <button key={i} onClick={b.fn} title={b.tip} aria-label={b.tip} style={{ width: 32, height: 32, borderRadius: 6, border: `1px solid ${C.panelBorder}`, background: C.panel + "dd", color: C.text, cursor: "pointer", backdropFilter: "blur(8px)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16 }}>{b.icon ? <b.icon /> : b.label}</button>
            )}
            <div style={{ height: 4 }} />
            <button onClick={() => setShowCompass(p => !p)} title="Toggle Compass" aria-label="Toggle Compass" style={{ width: 32, height: 32, borderRadius: 6, border: `1px solid ${showCompass ? C.accent + "55" : C.panelBorder}`, background: showCompass ? C.accent + "18" : C.panel + "dd", color: showCompass ? C.accent : C.textMuted, cursor: "pointer", backdropFilter: "blur(8px)", display: "flex", alignItems: "center", justifyContent: "center" }}><I.Compass /></button>
          </div>

          {/* 3D controls */}
          {viewMode === "3d" && <div style={{ position: "absolute", bottom: 48, left: 12, display: "flex", flexDirection: "column", gap: 6, background: C.panel + "ee", padding: 12, borderRadius: 8, border: `1px solid ${C.panelBorder}`, zIndex: 10 }}>
            <span style={{ fontSize: 10, color: C.textMuted, fontWeight: 600 }}>3D VIEW</span>
            <Sld label="Tilt" value={view3D.angleX} onChange={v => setView3D(p => ({ ...p, angleX: v }))} min={5} max={85} step={1} />
            <Sld label="Rotate" value={view3D.angleZ} onChange={v => setView3D(p => ({ ...p, angleZ: v }))} min={0} max={360} step={1} />
            <Sld label="Z Exag" value={view3D.exaggeration} onChange={v => setView3D(p => ({ ...p, exaggeration: v }))} min={0.1} max={20} step={0.1} />
          </div>}

          {/* Basemap picker */}
          <div style={{ position: "absolute", bottom: 38, left: 12, zIndex: 10 }}>
            <button onClick={() => setShowBaseMapPicker(p => !p)} title="Base Map" style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 12px 6px 8px", borderRadius: showBaseMapPicker ? "8px 8px 0 0" : 8, border: `1px solid ${C.panelBorder}`, borderBottom: showBaseMapPicker ? "none" : `1px solid ${C.panelBorder}`, background: C.panel + "ee", color: C.text, cursor: "pointer", fontSize: 11, fontWeight: 500, backdropFilter: "blur(8px)" }}>
              <I.Globe /><span style={{ textTransform: "capitalize" }}>{baseMap}</span><span style={{ transform: showBaseMapPicker ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.2s", display: "flex" }}><I.ChevUp /></span>
            </button>
            {showBaseMapPicker && <div style={{ background: C.panel + "f5", border: `1px solid ${C.panelBorder}`, borderTop: "none", borderRadius: "0 8px 8px 8px", padding: 10, backdropFilter: "blur(12px)", minWidth: 280 }}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 6, marginBottom: 10 }}>
                {[{ id: "none", l: "None", c: ["#0a0f1e", "#0d1528", "#1a2340"] }, { id: "satellite", l: "Aerial", c: ["#1a3a1a", "#2a5230", "#1a2e1a"] }, { id: "osm", l: "OSM", c: ["#f0ead6", "#aad3df", "#c8d7a3"] }].map(bm =>
                  <button key={bm.id} onClick={() => setBaseMap(bm.id)} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, cursor: "pointer", border: `2px solid ${baseMap === bm.id ? C.accent : "transparent"}`, borderRadius: 8, padding: 3, background: "transparent" }}>
                    <div style={{ width: 44, height: 32, borderRadius: 4, background: `linear-gradient(135deg,${bm.c.join(",")})` }} />
                    <span style={{ fontSize: 9, color: baseMap === bm.id ? C.accent : C.textMuted, fontWeight: baseMap === bm.id ? 600 : 400 }}>{bm.l}</span>
                  </button>
                )}
              </div>
              <div style={{ borderTop: `1px solid ${C.panelBorder}`, paddingTop: 8, display: "flex", flexDirection: "column", gap: 2 }}>
                <span style={{ fontSize: 9, color: C.textDim, textTransform: "uppercase", letterSpacing: 1, marginBottom: 2, fontWeight: 600 }}>Overlays</span>
                {[{ s: showGridLines, set: setShowGridLines, l: "Grid Lines" }, { s: showCoordLabels, set: setShowCoordLabels, l: "Coord Labels" }, { s: showCompass, set: setShowCompass, l: "Compass" }].map(t =>
                  <label key={t.l} style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 2px", cursor: "pointer", fontSize: 11, color: C.text }}>
                    <div onClick={() => t.set(p => !p)} style={{ width: 28, height: 16, borderRadius: 8, position: "relative", background: t.s ? C.accent : C.surface, border: `1px solid ${t.s ? C.accent : C.panelBorder}`, transition: "all 0.15s", cursor: "pointer" }}>
                      <div style={{ width: 12, height: 12, borderRadius: 6, background: "#fff", position: "absolute", top: 1, left: t.s ? 14 : 1, transition: "left 0.15s", boxShadow: "0 1px 2px rgba(0,0,0,0.3)" }} />
                    </div><span>{t.l}</span>
                  </label>
                )}
              </div>
            </div>}
          </div>

          {/* Status Bar */}
          <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 28, background: C.panel + "ee", borderTop: `1px solid ${C.panelBorder}`, display: "flex", alignItems: "center", padding: "0 12px", gap: 16, fontSize: 10, fontFamily: "'JetBrains Mono',monospace", color: C.textMuted }}>
            <span>Points: <span style={{ color: C.accent }}>{points.length.toLocaleString()}</span></span>
            <span>Layers: <span style={{ color: C.blueLight }}>{layers.length}</span></span>
            <span>Scale: <span style={{ color: C.green }}>{viewState.scale.toFixed(3)}</span></span>
            {gridStats && <span>Grid: <span style={{ color: C.accent }}>{gridStats.nx}×{gridStats.ny}</span></span>}
            {selectedPts.size > 0 && <span>Selected: <span style={{ color: "#ffff00" }}>{selectedPts.size}</span></span>}
            {(boundaries.length > 0 || breaklines.length > 0) && <span>B/BL: <span style={{ color: "#f97316" }}>{boundaries.length}</span>/<span style={{ color: "#00e5ff" }}>{breaklines.length}</span></span>}
            <span onClick={() => setSnapEnabled(p => !p)} title="Toggle snap to points" style={{ color: snapEnabled ? C.green : C.textDim, fontWeight: 600, cursor: "pointer" }}>SNAP</span>
            <span onClick={() => { const pl = layers.find(l => l.type === "points"); if (pl) updateLayerProp(pl.id, "showPointNumbers", !pl.showPointNumbers); }} title="Show point numbers" style={{ color: (layers.find(l => l.type === "points")?.showPointNumbers) ? C.green : C.textDim, fontWeight: 600, cursor: "pointer" }}>PT#</span>
            <span onClick={() => { const pl = layers.find(l => l.type === "points"); if (pl) updateLayerProp(pl.id, "showPointLevels", !pl.showPointLevels); }} title="Show point levels" style={{ color: (layers.find(l => l.type === "points")?.showPointLevels) ? C.green : C.textDim, fontWeight: 600, cursor: "pointer" }}>LVL</span>
            <span onClick={() => { const pl = layers.find(l => l.type === "points"); if (pl) updateLayerProp(pl.id, "showPointDescs", !pl.showPointDescs); }} title="Show point descriptions" style={{ color: (layers.find(l => l.type === "points")?.showPointDescs) ? C.green : C.textDim, fontWeight: 600, cursor: "pointer" }}>DESC</span>
            {drawMode && <span style={{ color: C.accent }}>Drawing: {drawMode.replace(/_/g, " ")}</span>}
            {measureMode && <span style={{ color: C.accent }}>Tool: {measureMode}</span>}
            <div style={{ flex: 1 }} />
            {baseMap === "osm" && <span style={{ fontSize: 9 }}>© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener" style={{ color: C.textMuted, textDecoration: "none" }}>OpenStreetMap</a></span>}
            {baseMap === "satellite" && <span style={{ fontSize: 9, color: C.textDim }}>© Esri</span>}
            <span onClick={() => setShowCRSPrompt(true)} style={{ cursor: "pointer" }}>CRS: <span style={{ color: projectCRS === "LOCAL" ? C.textDim : C.blueLight }}>{projectCRS === "LOCAL" ? "Local" : projectCRS}</span></span>
          </div>
        </div>
      </div>

      {/* ─── Screen reader status announcements ─────────────────────────── */}
      <div role="status" aria-live="polite" style={{ position: "absolute", width: 1, height: 1, padding: 0, margin: -1, overflow: "hidden", clip: "rect(0,0,0,0)", whiteSpace: "nowrap", border: 0 }}>
        {gridding ? `Gridding in progress: ${griddingStage} ${griddingProgress}%` : contouring ? `Contouring in progress: ${contouringStage} ${contouringProgress}%` : griddingProgress === 100 ? "Gridding complete" : ""}
      </div>

      {/* ─── CRS Prompt Modal ──────────────────────────────────────────────── */}
      {showCRSPrompt && <div onClick={(e) => { if (e.target === e.currentTarget) setShowCRSPrompt(false); }} style={{ position: "fixed", inset: 0, zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)" }}>
        <div role="dialog" aria-modal="true" aria-label="Project CRS" style={{ background: C.panel, border: `1px solid ${C.panelBorder}`, borderRadius: 12, padding: 24, width: 420, maxHeight: "80vh", overflow: "auto", boxShadow: "0 16px 64px rgba(0,0,0,0.5)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
            <I.Globe /><span style={{ fontWeight: 700, fontSize: 15 }}>Project CRS</span>
          </div>
          <div style={{ fontSize: 12, color: C.textMuted, lineHeight: 1.6, marginBottom: 16 }}>
            Choose a Coordinate Reference System for your project. This determines how coordinates are interpreted and how basemap tiles align with your data.
          </div>
          <div style={{ marginBottom: 16 }}>
            <Label>Select CRS</Label>
            <CRSPicker value={projectCRS} onChange={setProjectCRS} />
          </div>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <Btn variant="ghost" onClick={() => {
              setProjectCRS("LOCAL");
              setShowCRSPrompt(false);
              if (pendingFileAfterCRS) { setPendingFileAfterCRS(false); setActivePanel("mapping"); }
            }}>Skip (Local/Cartesian)</Btn>
            <Btn variant="primary" onClick={() => {
              setShowCRSPrompt(false);
              // Auto-set fileCRS to detected or project CRS
              if (pendingFileAfterCRS) {
                setPendingFileAfterCRS(false);
                if (fileCRS === "LOCAL" && projectCRS !== "LOCAL") setFileCRS(projectCRS);
                setActivePanel("mapping");
              }
            }}>Confirm CRS</Btn>
          </div>
        </div>
      </div>}

      {/* ─── Bug Report Modal ──────────────────────────────────────────────── */}
      {showBugReport && <div onClick={(e) => { if (e.target === e.currentTarget) { setBugTitle(""); setBugDesc(""); setShowBugReport(false); } }} style={{ position: "fixed", inset: 0, zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)" }}>
        <div role="dialog" aria-modal="true" aria-label="Report a Bug" style={{ background: C.panel, border: `1px solid ${C.panelBorder}`, borderRadius: 12, padding: 24, width: 480, maxHeight: "80vh", overflow: "auto", boxShadow: "0 16px 64px rgba(0,0,0,0.5)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
            <I.Bug /><span style={{ fontWeight: 700, fontSize: 15 }}>Report a Bug</span>
          </div>
          <div style={{ fontSize: 12, color: C.textMuted, lineHeight: 1.6, marginBottom: 16 }}>
            Describe the issue you encountered. This will open a GitHub issue with your report.
          </div>
          <div style={{ marginBottom: 12 }}>
            <Label>Title *</Label>
            <input value={bugTitle} onChange={e => setBugTitle(e.target.value)} placeholder="Brief summary of the issue" style={{ width: "100%", padding: "8px 10px", background: C.surface, border: `1px solid ${C.panelBorder}`, borderRadius: 6, color: C.text, fontSize: 12, outline: "none", boxSizing: "border-box" }} />
          </div>
          <div style={{ marginBottom: 12 }}>
            <Label>Description</Label>
            <textarea value={bugDesc} onChange={e => setBugDesc(e.target.value)} placeholder="Steps to reproduce, what happened, what you expected..." rows={4} style={{ width: "100%", padding: "8px 10px", background: C.surface, border: `1px solid ${C.panelBorder}`, borderRadius: 6, color: C.text, fontSize: 12, outline: "none", resize: "vertical", fontFamily: "inherit", boxSizing: "border-box" }} />
          </div>
          <div style={{ marginBottom: 16, padding: 10, background: C.surface, borderRadius: 6, border: `1px solid ${C.panelBorder}`, fontSize: 11, color: C.textMuted, lineHeight: 1.8 }}>
            <div style={{ fontWeight: 600, color: C.text, marginBottom: 4, fontSize: 11 }}>Auto-captured context</div>
            <div>Browser: {navigator.userAgent.slice(0, 80)}...</div>
            <div>Points loaded: {points.length}</div>
            <div>Active panel: {activePanel || "none"}</div>
            <div>Project CRS: {projectCRS}</div>
            <div>Grid: {gridData ? "Yes" : "No"}</div>
            <div>Base Map: {baseMap}</div>
          </div>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <Btn variant="ghost" onClick={() => { setBugTitle(""); setBugDesc(""); setShowBugReport(false); }}>Cancel</Btn>
            <Btn variant="primary" disabled={!bugTitle.trim()} onClick={() => {
              const body = `## Description\n${bugDesc || "(No description provided)"}\n\n## Environment\n- Version: ${APP_VERSION}\n- Browser: ${navigator.userAgent.slice(0, 120)}\n- Points: ${points.length}\n- CRS: ${projectCRS}\n- Grid: ${gridData ? "Yes" : "No"}\n- Base Map: ${baseMap}\n- Panel: ${activePanel || "none"}`;
              const url = `https://github.com/munah-a/grid-forge/issues/new?title=${encodeURIComponent(bugTitle.trim())}&body=${encodeURIComponent(body)}&labels=bug`;
              window.open(url, "_blank");
              setBugTitle(""); setBugDesc(""); setShowBugReport(false);
            }}>Open GitHub Issue</Btn>
          </div>
        </div>
      </div>}

      {/* ─── Plot Preview Modal ────────────────────────────────────────────── */}
      {showPlotPreview && <div style={{ position: "fixed", inset: 0, zIndex: 9999, background: "rgba(0,0,0,0.85)", display: "flex", alignItems: "center", justifyContent: "center", overflow: "auto" }} onClick={() => setShowPlotPreview(false)}>
        <div id="plot-preview-container" style={{ position: "relative", maxWidth: "95vw", maxHeight: "95vh", overflow: "auto", background: "#fff", borderRadius: 8, boxShadow: "0 20px 60px rgba(0,0,0,0.5)" }} onClick={e => e.stopPropagation()}>
          <canvas ref={plotCanvasRef} style={{ display: "block", maxWidth: "100%", height: "auto" }} />
          <button onClick={() => setShowPlotPreview(false)} style={{ position: "absolute", top: 8, right: 8, width: 32, height: 32, borderRadius: 16, border: "none", background: "rgba(0,0,0,0.6)", color: "#fff", cursor: "pointer", fontSize: 18, display: "flex", alignItems: "center", justifyContent: "center" }}>×</button>
        </div>
      </div>}

      {/* ─── Data Table Drawer ─────────────────────────────────────────────── */}
      {showTable && points.length > 0 && <div style={{ height: 220, background: C.panel, borderTop: `1px solid ${C.panelBorder}`, display: "flex", flexDirection: "column", flexShrink: 0 }}>
        <div style={{ padding: "4px 12px", fontSize: 10, color: C.textMuted, borderBottom: `1px solid ${C.panelBorder}`, display: "flex", alignItems: "center", gap: 12 }}>
          <span>Showing all <b style={{ color: C.accent }}>{points.length.toLocaleString()}</b> points</span>
          {selectedPts.size > 0 && <span>| <b style={{ color: "#ffff00" }}>{selectedPts.size}</b> selected</span>}
          {selectedPts.size > 0 && <Btn size="sm" onClick={deleteSelectedPoints} variant="danger" style={{ padding: "2px 8px", fontSize: 10 }}><I.Trash /> Delete Selected</Btn>}
          <span style={{ fontSize: 9, color: C.textDim }}>Click to select | Ctrl+Click additive | Shift+Drag box | Dbl-click cell to edit</span>
        </div>
        <div style={{ display: "flex", borderBottom: `1px solid ${C.panelBorder}` }}>
          <table style={{ width: "100%", fontSize: 11, borderCollapse: "collapse", fontFamily: "'JetBrains Mono',monospace", tableLayout: "fixed" }}>
            <thead><tr>
              <th style={{ padding: "6px 12px", background: C.surface, textAlign: "left", color: C.accent, fontWeight: 600, width: 50 }}>#</th>
              {[{ col: "pointNo", label: "PtNo", color: C.textMuted, align: "left" }, { col: "x", label: "X", color: C.blueLight, align: "right" }, { col: "y", label: "Y", color: C.green, align: "right" }, { col: "z", label: "Z", color: C.accent, align: "right" }, { col: "desc", label: "Desc", color: C.textMuted, align: "left" }].map(c => <th key={c.col} onClick={() => { setTableSortCol(c.col); setTableSortAsc(tableSortCol === c.col ? !tableSortAsc : true); }} style={{ padding: "6px 12px", background: C.surface, textAlign: c.align, color: c.color, cursor: "pointer" }}>
                {c.label} {tableSortCol === c.col ? (tableSortAsc ? "▲" : "▼") : ""}
              </th>)}
            </tr></thead>
          </table>
        </div>
        <div style={{ flex: 1, overflow: "auto" }} onScroll={e => setTableScroll(e.target.scrollTop)}>
          {(() => {
            const ROW_H = 24;
            const totalH = sortedPoints.length * ROW_H;
            const startIdx = Math.max(0, Math.floor(tableScroll / ROW_H) - 5);
            const endIdx = Math.min(sortedPoints.length, startIdx + Math.ceil(180 / ROW_H) + 10);
            return (
              <div style={{ height: totalH, position: 'relative' }}>
                <table style={{ position: 'absolute', top: startIdx * ROW_H, width: '100%', fontSize: 11, borderCollapse: 'collapse', fontFamily: "'JetBrains Mono',monospace", tableLayout: "fixed" }}>
                  <tbody>
                    {sortedPoints.slice(startIdx, endIdx).map((p, i) => {
                      const idx = startIdx + i;
                      const mkCell = (col, align) => {
                        const isEditing = editingCell && editingCell.row === idx && editingCell.col === col;
                        if (isEditing) {
                          return <td key={col} style={{ padding: "1px 4px", textAlign: align }}><input autoFocus defaultValue={p[col] ?? ""} onBlur={e => {
                            const val = e.target.value;
                            pushHistory();
                            setPoints(prev => prev.map((pt, pi) => pi === idx ? { ...pt, [col]: (col === "x" || col === "y" || col === "z") ? (isNaN(parseFloat(val)) ? pt[col] : parseFloat(val)) : val } : pt));
                            setEditingCell(null);
                          }} onKeyDown={e => { if (e.key === "Enter") e.target.blur(); if (e.key === "Escape") setEditingCell(null); }} style={{ width: "100%", background: C.bg, border: `1px solid ${C.accent}`, borderRadius: 3, padding: "1px 4px", fontSize: 11, color: C.text, outline: "none", fontFamily: "'JetBrains Mono',monospace", textAlign: align }} /></td>;
                        }
                        return <td key={col} onDoubleClick={() => setEditingCell({ row: idx, col })} style={{ padding: "3px 12px", textAlign: align, cursor: "text" }}>{col === "x" || col === "y" || col === "z" ? p[col] : (p[col] || "")}</td>;
                      };
                      return <tr key={idx} style={{ height: ROW_H, borderBottom: `1px solid ${C.panelBorder}11`, background: selectedPts.has(idx) ? "rgba(255,255,0,0.1)" : "transparent" }}>
                        <td style={{ padding: "3px 12px", color: C.textDim, width: 50 }}>{idx + 1}</td>
                        {mkCell("pointNo", "left")}
                        {mkCell("x", "right")}
                        {mkCell("y", "right")}
                        {mkCell("z", "right")}
                        {mkCell("desc", "left")}
                      </tr>;
                    })}
                  </tbody>
                </table>
              </div>
            );
          })()}
        </div>
      </div>}
    </div>
  );
}
