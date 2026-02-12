import { readFileSync } from "fs";
import { performance } from "perf_hooks";
import { buildSpatialIndex } from "./src/engine.js";

const raw = readFileSync("docs/IS03_05.05.2025.txt", "utf8").trim().split("\n");
const points = [];
for (const l of raw) { const c=l.split(","); const x=+c[1],y=+c[2],z=+c[3]; if(!isNaN(x)&&!isNaN(y)&&!isNaN(z)) points.push({x,y,z}); }
console.log(`Points: ${points.length}`);

const si = buildSpatialIndex(points);
console.log(`SpatialIndex cellSize=${si.cellSize.toFixed(2)}, cells=${si._cxRange}x${si._cyRange}=${si._cxRange*si._cyRange}`);

// Test findKNearestRaw speed — 100K calls
const outIdx = new Int32Array(16);
const outDist = new Float64Array(16);
const N = 100000;
let xMin=Infinity,xMax=-Infinity,yMin=Infinity,yMax=-Infinity;
for(const p of points){if(p.x<xMin)xMin=p.x;if(p.x>xMax)xMax=p.x;if(p.y<yMin)yMin=p.y;if(p.y>yMax)yMax=p.y;}
const pad=0.02,dx=(xMax-xMin)*pad,dy=(yMax-yMin)*pad;

console.log(`\nProfiling findKNearestRaw (k=16) — ${N} calls...`);
let t0 = performance.now();
for (let i = 0; i < N; i++) {
  const x = xMin - dx + Math.random() * (xMax - xMin + 2*dx);
  const y = yMin - dy + Math.random() * (yMax - yMin + 2*dy);
  si.findKNearestRaw(x, y, 16, outIdx, outDist);
}
let dt = performance.now() - t0;
console.log(`  ${dt.toFixed(0)}ms total, ${(dt/N*1000).toFixed(1)}μs/call`);
console.log(`  Projected for 5M calls: ${(dt/N*5e6/1000).toFixed(1)}s`);

console.log(`\nProfiling findKNearest (k=16, legacy) — ${N} calls...`);
t0 = performance.now();
for (let i = 0; i < N; i++) {
  const x = xMin - dx + Math.random() * (xMax - xMin + 2*dx);
  const y = yMin - dy + Math.random() * (yMax - yMin + 2*dy);
  si.findKNearest(x, y, 16);
}
dt = performance.now() - t0;
console.log(`  ${dt.toFixed(0)}ms total, ${(dt/N*1000).toFixed(1)}μs/call`);
console.log(`  Projected for 5M calls: ${(dt/N*5e6/1000).toFixed(1)}s`);

console.log(`\nProfiling findKNearestRaw (k=1) — ${N} calls...`);
const out1 = new Int32Array(1), outD1 = new Float64Array(1);
t0 = performance.now();
for (let i = 0; i < N; i++) {
  const x = xMin - dx + Math.random() * (xMax - xMin + 2*dx);
  const y = yMin - dy + Math.random() * (yMax - yMin + 2*dy);
  si.findKNearestRaw(x, y, 1, out1, outD1);
}
dt = performance.now() - t0;
console.log(`  ${dt.toFixed(0)}ms total, ${(dt/N*1000).toFixed(1)}μs/call`);
console.log(`  Projected for 5M calls: ${(dt/N*5e6/1000).toFixed(1)}s`);
