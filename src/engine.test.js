// Engine function tests — verify measurement, sampling, contouring, and parsing

import { describe, it, expect } from "vitest";
import {
  measureDistance,
  measurePolylineLength,
  measurePolygonArea,
  measureBearing,
  sampleGridZ,
  pointInPolygon,
  generateContourLevels,
  computeGridStats,
  parseCSV,
  autoDetectColumns,
} from "./engine.js";


describe("measureDistance", () => {
  it("returns 5 for a 3-4-5 triangle", () => {
    expect(measureDistance(0, 0, 3, 4)).toBe(5);
  });

  it("returns 0 for same point", () => {
    expect(measureDistance(7, 7, 7, 7)).toBe(0);
  });

  it("handles negative coordinates", () => {
    expect(measureDistance(-1, -1, 2, 3)).toBe(5);
  });
});


describe("measurePolylineLength", () => {
  it("sums segment lengths", () => {
    const pts = [[0, 0], [3, 0], [3, 4]];
    expect(measurePolylineLength(pts)).toBe(7); // 3 + 4
  });

  it("returns 0 for single point", () => {
    expect(measurePolylineLength([[5, 5]])).toBe(0);
  });

  it("returns 0 for empty array", () => {
    expect(measurePolylineLength([])).toBe(0);
  });
});


describe("measurePolygonArea", () => {
  it("computes area of a unit square", () => {
    const square = [[0, 0], [1, 0], [1, 1], [0, 1]];
    expect(measurePolygonArea(square)).toBeCloseTo(1, 10);
  });

  it("computes area of a 3-4-5 right triangle", () => {
    const tri = [[0, 0], [3, 0], [0, 4]];
    expect(measurePolygonArea(tri)).toBeCloseTo(6, 10);
  });

  it("computes area of a rectangle", () => {
    const rect = [[0, 0], [10, 0], [10, 5], [0, 5]];
    expect(measurePolygonArea(rect)).toBeCloseTo(50, 10);
  });

  it("returns positive area regardless of winding order", () => {
    const cw = [[0, 0], [0, 1], [1, 1], [1, 0]];
    const ccw = [[0, 0], [1, 0], [1, 1], [0, 1]];
    expect(measurePolygonArea(cw)).toBeCloseTo(1, 10);
    expect(measurePolygonArea(ccw)).toBeCloseTo(1, 10);
  });
});


describe("measureBearing", () => {
  // measureBearing uses atan2(dx, dy): 0°=N means +dy direction
  it("due north (positive dy) = 0°", () => {
    expect(measureBearing(0, 0, 0, 10)).toBeCloseTo(0, 5);
  });

  it("due east (positive dx) = 90°", () => {
    expect(measureBearing(0, 0, 10, 0)).toBeCloseTo(90, 5);
  });

  it("due south (negative dy) = 180°", () => {
    expect(measureBearing(0, 0, 0, -10)).toBeCloseTo(180, 5);
  });

  it("due west (negative dx) = 270°", () => {
    expect(measureBearing(0, 0, -10, 0)).toBeCloseTo(270, 5);
  });
});


describe("sampleGridZ", () => {
  // 3×3 grid with Z = row * 10 + col
  // gridY[0]=0, gridY[1]=1, gridY[2]=2, gridX[0]=0, gridX[1]=1, gridX[2]=2
  const nx = 3, ny = 3;
  const gridX = [0, 1, 2];
  const gridY = [0, 1, 2];
  // grid[row * nx + col]: row 0: [0,1,2], row 1: [10,11,12], row 2: [20,21,22]
  const grid = new Float64Array([0, 1, 2, 10, 11, 12, 20, 21, 22]);

  it("returns exact value at grid node", () => {
    expect(sampleGridZ(grid, gridX, gridY, nx, ny, 0, 0)).toBe(0);
    expect(sampleGridZ(grid, gridX, gridY, nx, ny, 1, 1)).toBe(11);
    expect(sampleGridZ(grid, gridX, gridY, nx, ny, 2, 2)).toBe(22);
  });

  it("interpolates at grid center", () => {
    // Center of the 4 cells around (0.5, 0.5): average of [0,1,10,11] = 5.5
    const z = sampleGridZ(grid, gridX, gridY, nx, ny, 0.5, 0.5);
    expect(z).toBeCloseTo(5.5, 5);
  });

  it("returns NaN outside grid", () => {
    expect(sampleGridZ(grid, gridX, gridY, nx, ny, -1, 0)).toBeNaN();
    expect(sampleGridZ(grid, gridX, gridY, nx, ny, 3, 0)).toBeNaN();
    expect(sampleGridZ(grid, gridX, gridY, nx, ny, 0, -1)).toBeNaN();
  });

  it("returns NaN when a surrounding cell is NaN", () => {
    const gridWithNaN = new Float64Array([NaN, 1, 2, 10, 11, 12, 20, 21, 22]);
    expect(sampleGridZ(gridWithNaN, gridX, gridY, nx, ny, 0.5, 0.5)).toBeNaN();
  });

  it("returns exact value at grid edges", () => {
    expect(sampleGridZ(grid, gridX, gridY, nx, ny, 2, 0)).toBe(2);
    expect(sampleGridZ(grid, gridX, gridY, nx, ny, 0, 2)).toBe(20);
  });
});


describe("pointInPolygon", () => {
  const square = [[0, 0], [10, 0], [10, 10], [0, 10]];

  it("returns true for point inside", () => {
    expect(pointInPolygon(5, 5, square)).toBe(true);
  });

  it("returns false for point outside", () => {
    expect(pointInPolygon(15, 5, square)).toBe(false);
    expect(pointInPolygon(-1, 5, square)).toBe(false);
  });

  it("works with triangle", () => {
    const tri = [[0, 0], [10, 0], [5, 10]];
    expect(pointInPolygon(5, 3, tri)).toBe(true);
    expect(pointInPolygon(0, 10, tri)).toBe(false);
  });
});


describe("generateContourLevels", () => {
  it("produces correct levels for simple range", () => {
    const levels = generateContourLevels(0, 100, 25);
    expect(levels).toEqual([0, 25, 50, 75, 100]);
  });

  it("starts at the first multiple of interval >= min", () => {
    const levels = generateContourLevels(3, 20, 5);
    expect(levels).toEqual([5, 10, 15, 20]);
  });

  it("includes min when it aligns with interval even if interval > range", () => {
    const levels = generateContourLevels(0, 5, 10);
    expect(levels).toEqual([0]); // ceil(0/10)*10 = 0, which is ≤ 5
  });

  it("returns empty array when first multiple exceeds max", () => {
    const levels = generateContourLevels(1, 5, 10);
    expect(levels).toEqual([]); // ceil(1/10)*10 = 10 > 5
  });

  it("handles negative ranges", () => {
    const levels = generateContourLevels(-10, 10, 5);
    expect(levels).toEqual([-10, -5, 0, 5, 10]);
  });
});


describe("computeGridStats", () => {
  it("computes min, max, mean, stdDev for known data", () => {
    const grid = new Float64Array([1, 2, 3, 4, 5]);
    const stats = computeGridStats(grid);
    expect(stats.min).toBe(1);
    expect(stats.max).toBe(5);
    expect(stats.mean).toBeCloseTo(3, 10);
    expect(stats.count).toBe(5);
    expect(stats.nullCount).toBe(0);
    // stddev = sqrt(mean(x^2) - mean(x)^2) = sqrt(11 - 9) = sqrt(2)
    expect(stats.stdDev).toBeCloseTo(Math.sqrt(2), 5);
  });

  it("handles NaN values", () => {
    const grid = new Float64Array([1, NaN, 3, NaN, 5]);
    const stats = computeGridStats(grid);
    expect(stats.min).toBe(1);
    expect(stats.max).toBe(5);
    expect(stats.count).toBe(3);
    expect(stats.nullCount).toBe(2);
    expect(stats.mean).toBeCloseTo(3, 10);
  });

  it("handles all-NaN grid", () => {
    const grid = new Float64Array([NaN, NaN]);
    const stats = computeGridStats(grid);
    expect(stats.count).toBe(0);
    expect(stats.nullCount).toBe(2);
    expect(stats.mean).toBe(0);
  });
});


describe("parseCSV", () => {
  it("parses basic CSV with headers", () => {
    const text = "X,Y,Z\n1,2,3\n4,5,6\n";
    const { headers, rows } = parseCSV(text);
    expect(headers).toEqual(["X", "Y", "Z"]);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({ X: 1, Y: 2, Z: 3 });
    expect(rows[1]).toEqual({ X: 4, Y: 5, Z: 6 });
  });

  it("parses tab-delimited data", () => {
    const text = "X\tY\tZ\n10\t20\t30\n";
    const { headers, rows } = parseCSV(text);
    expect(headers).toEqual(["X", "Y", "Z"]);
    expect(rows[0]).toEqual({ X: 10, Y: 20, Z: 30 });
  });

  it("auto-detects headerless 3-column numeric data", () => {
    const text = "1,2,3\n4,5,6\n";
    const { headers, rows } = parseCSV(text);
    expect(headers).toEqual(["X", "Y", "Z"]);
    expect(rows).toHaveLength(2);
  });
});


describe("autoDetectColumns", () => {
  it("recognizes x/y/z headers", () => {
    const result = autoDetectColumns(["X", "Y", "Z"]);
    expect(result.x).toBe("X");
    expect(result.y).toBe("Y");
    expect(result.z).toBe("Z");
  });

  it("recognizes lon/lat/elevation", () => {
    const result = autoDetectColumns(["Longitude", "Latitude", "Elevation"]);
    expect(result.x).toBe("Longitude");
    expect(result.y).toBe("Latitude");
    expect(result.z).toBe("Elevation");
  });

  it("recognizes easting/northing", () => {
    const result = autoDetectColumns(["Easting", "Northing", "Height", "PointNo", "Description"]);
    expect(result.x).toBe("Easting");
    expect(result.y).toBe("Northing");
    expect(result.z).toBe("Height");
    expect(result.pointNo).toBe("PointNo");
    expect(result.desc).toBe("Description");
  });

  it("returns empty strings for unrecognized headers", () => {
    const result = autoDetectColumns(["foo", "bar", "baz"]);
    expect(result.x).toBe("");
    expect(result.y).toBe("");
    expect(result.z).toBe("");
  });
});
