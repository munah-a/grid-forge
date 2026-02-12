// GridForge GIS - Coordinate Reference System Support
// proj4 definitions, CRS registry, and transform helpers

import proj4 from "proj4";

// ═══════════════════════════════════════════════════════════════════════════════
// REGISTER BUNDLED CRS DEFINITIONS
// ═══════════════════════════════════════════════════════════════════════════════

// EPSG:4326 (WGS84) and EPSG:3857 (Web Mercator) are built into proj4.
// Register UTM zones 1-60 North and South.
for (let z = 1; z <= 60; z++) {
  proj4.defs(`EPSG:${32600 + z}`, `+proj=utm +zone=${z} +datum=WGS84 +units=m +no_defs`);
  proj4.defs(`EPSG:${32700 + z}`, `+proj=utm +zone=${z} +south +datum=WGS84 +units=m +no_defs`);
}

// ═══════════════════════════════════════════════════════════════════════════════
// CRS REGISTRY — searchable list for the CRSPicker UI
// ═══════════════════════════════════════════════════════════════════════════════

export const CRS_REGISTRY = [
  { code: "LOCAL", name: "Local / Cartesian (No CRS)", group: "Local" },
  { code: "EPSG:4326", name: "WGS 84 (Geographic)", group: "Geographic" },
  { code: "EPSG:3857", name: "WGS 84 / Pseudo-Mercator", group: "Projected" },
];

// UTM North zones
for (let z = 1; z <= 60; z++) {
  CRS_REGISTRY.push({
    code: `EPSG:${32600 + z}`,
    name: `WGS 84 / UTM zone ${z}N`,
    group: "UTM North",
  });
}

// UTM South zones
for (let z = 1; z <= 60; z++) {
  CRS_REGISTRY.push({
    code: `EPSG:${32700 + z}`,
    name: `WGS 84 / UTM zone ${z}S`,
    group: "UTM South",
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// FETCH CRS DEFINITION (for codes not bundled)
// ═══════════════════════════════════════════════════════════════════════════════

export async function fetchCRSDefinition(epsgCode) {
  // Extract numeric code from "EPSG:XXXX"
  const numeric = epsgCode.replace(/^EPSG:/i, "");
  if (proj4.defs(`EPSG:${numeric}`)) return true; // already registered

  try {
    const resp = await fetch(`https://epsg.io/${numeric}.proj4`);
    if (!resp.ok) return false;
    const def = await resp.text();
    if (!def || !def.includes("+proj")) return false;
    proj4.defs(`EPSG:${numeric}`, def.trim());
    return true;
  } catch {
    return false;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// TRANSFORM HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Transform a single coordinate pair.
 * Returns [x, y]. No-op if either CRS is "LOCAL" or they are equal.
 */
export function transformCoord(x, y, sourceCRS, targetCRS) {
  if (sourceCRS === "LOCAL" || targetCRS === "LOCAL" || sourceCRS === targetCRS) {
    return [x, y];
  }
  try {
    return proj4(sourceCRS, targetCRS, [x, y]);
  } catch {
    return [x, y];
  }
}

/**
 * Transform an array of point objects { x, y, z, ... }.
 * Returns a new array with transformed x, y; preserves z, pointNo, desc, etc.
 * No-op if either CRS is "LOCAL" or they are equal.
 */
export function transformPoints(points, sourceCRS, targetCRS) {
  if (sourceCRS === "LOCAL" || targetCRS === "LOCAL" || sourceCRS === targetCRS) {
    return points;
  }
  const transformer = proj4(sourceCRS, targetCRS);
  return points.map(p => {
    try {
      const [nx, ny] = transformer.forward([p.x, p.y]);
      return { ...p, x: nx, y: ny };
    } catch {
      return p;
    }
  });
}

/**
 * Returns true for degree-based CRS (geographic).
 */
export function isGeographicCRS(crsCode) {
  if (crsCode === "LOCAL") return false;
  if (crsCode === "EPSG:4326") return true;
  // Check proj4 definition for +proj=longlat
  try {
    const def = proj4.defs(crsCode);
    if (def && def.projName === "longlat") return true;
  } catch {
    // not registered
  }
  return false;
}
