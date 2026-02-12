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
  if (!/^\d{4,6}$/.test(numeric)) return false; // validate format
  if (proj4.defs(`EPSG:${numeric}`)) return true; // already registered

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 5000);
  try {
    const resp = await fetch(`https://epsg.io/${numeric}.proj4`, { signal: controller.signal });
    if (!resp.ok) return false;
    const def = await resp.text();
    if (!def || !def.includes("+proj")) return false;
    proj4.defs(`EPSG:${numeric}`, def.trim());
    return true;
  } catch {
    return false;
  } finally {
    clearTimeout(timeoutId);
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

// ═══════════════════════════════════════════════════════════════════════════════
// CRS AUTO-DETECTION (CRS-05)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Detect CRS from a .prj (WKT) file content.
 * Attempts to identify EPSG code from the WKT name, AUTHORITY,
 * or falls back to registering as a custom CRS.
 * Returns the EPSG code string (e.g. "EPSG:4326") or null.
 */
export function detectCRSFromPrj(prjText) {
  if (!prjText || typeof prjText !== "string") return null;
  const text = prjText.trim();

  // Try to extract AUTHORITY["EPSG","XXXX"]
  const authMatch = text.match(/AUTHORITY\s*\[\s*"EPSG"\s*,\s*"(\d+)"\s*\]/i);
  if (authMatch) {
    const code = `EPSG:${authMatch[1]}`;
    // Try to register if not already known
    if (!proj4.defs(code)) {
      try { proj4.defs(code, text); } catch { /* ignore */ }
    }
    return code;
  }

  // Try common name patterns
  const nameMatch = text.match(/GEOGCS\s*\[\s*"([^"]+)"/i) || text.match(/PROJCS\s*\[\s*"([^"]+)"/i);
  if (nameMatch) {
    const name = nameMatch[1].toUpperCase();
    if (name.includes("WGS") && name.includes("84")) {
      if (name.includes("UTM")) {
        const utmMatch = name.match(/ZONE\s*(\d+)\s*(N|S)?/i);
        if (utmMatch) {
          const zone = parseInt(utmMatch[1]);
          const south = (utmMatch[2] || "N").toUpperCase() === "S";
          return `EPSG:${south ? 32700 + zone : 32600 + zone}`;
        }
      }
      if (name.includes("PSEUDO") || name.includes("MERCATOR") || name.includes("3857")) return "EPSG:3857";
      return "EPSG:4326";
    }
  }

  // Fall back: register as custom CRS if it looks like a proj4 or WKT definition
  if (text.startsWith("+proj") || text.startsWith("GEOGCS") || text.startsWith("PROJCS")) {
    const customCode = "CUSTOM:PRJ";
    try {
      proj4.defs(customCode, text);
      return customCode;
    } catch { /* ignore */ }
  }

  return null;
}

/**
 * Detect CRS from a GeoJSON object's "crs" property.
 * Returns EPSG code string or null.
 */
export function detectCRSFromGeoJSON(geojson) {
  if (!geojson) return null;
  const obj = typeof geojson === "string" ? JSON.parse(geojson) : geojson;
  if (obj.crs) {
    // GeoJSON CRS member (deprecated but common)
    if (obj.crs.type === "name" && obj.crs.properties?.name) {
      const name = obj.crs.properties.name;
      // Common formats: "urn:ogc:def:crs:EPSG::4326" or "EPSG:4326"
      const epsgMatch = name.match(/EPSG[^0-9]*(\d+)$/i);
      if (epsgMatch) return `EPSG:${epsgMatch[1]}`;
    }
    if (obj.crs.type === "EPSG" && obj.crs.properties?.code) {
      return `EPSG:${obj.crs.properties.code}`;
    }
  }
  // Default: GeoJSON spec mandates WGS84 if no CRS specified
  return "EPSG:4326";
}

/**
 * Register a custom CRS from a Proj4 string.
 * @param {string} code - EPSG code or custom identifier
 * @param {string} proj4String - Proj4 definition string
 * @returns {boolean} true if successfully registered
 */
export function registerProj4String(code, proj4String) {
  try {
    proj4.defs(code, proj4String);
    return true;
  } catch {
    return false;
  }
}
