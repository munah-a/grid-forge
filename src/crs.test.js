// CRS transform tests — verify geographic detection and coordinate transforms

import { describe, it, expect } from "vitest";
import { isGeographicCRS, transformCoord } from "./crs.js";


describe("isGeographicCRS", () => {
  it("EPSG:4326 is geographic", () => {
    expect(isGeographicCRS("EPSG:4326")).toBe(true);
  });

  it("EPSG:32617 (UTM zone 17N) is not geographic", () => {
    expect(isGeographicCRS("EPSG:32617")).toBe(false);
  });

  it("EPSG:3857 (Web Mercator) is not geographic", () => {
    expect(isGeographicCRS("EPSG:3857")).toBe(false);
  });

  it("LOCAL is not geographic", () => {
    expect(isGeographicCRS("LOCAL")).toBe(false);
  });
});


describe("transformCoord", () => {
  it("no-op when source === target", () => {
    const [x, y] = transformCoord(100, 200, "EPSG:4326", "EPSG:4326");
    expect(x).toBe(100);
    expect(y).toBe(200);
  });

  it("no-op when source is LOCAL", () => {
    const [x, y] = transformCoord(100, 200, "LOCAL", "EPSG:4326");
    expect(x).toBe(100);
    expect(y).toBe(200);
  });

  it("no-op when target is LOCAL", () => {
    const [x, y] = transformCoord(100, 200, "EPSG:4326", "LOCAL");
    expect(x).toBe(100);
    expect(y).toBe(200);
  });

  it("round-trip EPSG:4326 → EPSG:32617 → EPSG:4326 is consistent", () => {
    const lon = -81.5, lat = 28.5; // a point in UTM zone 17N
    const [ux, uy] = transformCoord(lon, lat, "EPSG:4326", "EPSG:32617");
    // UTM coordinates should be in reasonable range
    expect(ux).toBeGreaterThan(100000);
    expect(ux).toBeLessThan(900000);
    expect(uy).toBeGreaterThan(0);

    // Round-trip back
    const [lon2, lat2] = transformCoord(ux, uy, "EPSG:32617", "EPSG:4326");
    expect(lon2).toBeCloseTo(lon, 6);
    expect(lat2).toBeCloseTo(lat, 6);
  });
});
