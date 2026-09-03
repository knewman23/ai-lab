import { describe, expect, it } from "vitest";
import { contourLevels, marchingSquares } from "../../../src/core/math/contours";

describe("marchingSquares", () => {
  it("traces a vertical line for f = x on a 3x3 grid", () => {
    const nx = 3;
    const ny = 3;
    const grid = new Float32Array(nx * ny);
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        grid[j * nx + i] = i;
      }
    }
    const segments = marchingSquares(grid, nx, ny, 0.5);

    expect(segments.length).toBeGreaterThan(0);
    expect(segments.length % 4).toBe(0);

    let minY = Infinity;
    let maxY = -Infinity;
    for (let k = 0; k < segments.length; k += 2) {
      const x = segments[k]!;
      const y = segments[k + 1]!;
      expect(x).toBeCloseTo(0.5, 6);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
    expect(minY).toBeCloseTo(0, 6);
    expect(maxY).toBeCloseTo(2, 6);
  });

  it("returns an empty array for a constant grid", () => {
    const nx = 4;
    const ny = 4;
    const grid = new Float32Array(nx * ny).fill(5);
    const segments = marchingSquares(grid, nx, ny, 2.5);
    expect(segments.length).toBe(0);
  });

  it("produces a closed loop for x^2 + y^2 sampled on a fine grid", () => {
    const nx = 21;
    const ny = 21;
    const grid = new Float32Array(nx * ny);
    const toCoord = (idx: number): number => -2 + (idx / (nx - 1)) * 4;
    for (let j = 0; j < ny; j++) {
      const y = toCoord(j);
      for (let i = 0; i < nx; i++) {
        const x = toCoord(i);
        grid[j * nx + i] = x * x + y * y;
      }
    }
    const level = 1.1;
    const segments = marchingSquares(grid, nx, ny, level);
    expect(segments.length).toBeGreaterThan(0);
    expect(segments.length % 4).toBe(0);

    const key = (x: number, y: number): string =>
      `${Math.round(x * 1e6) / 1e6},${Math.round(y * 1e6) / 1e6}`;

    const counts = new Map<string, number>();
    for (let k = 0; k < segments.length; k += 4) {
      const p0 = key(segments[k]!, segments[k + 1]!);
      const p1 = key(segments[k + 2]!, segments[k + 3]!);
      counts.set(p0, (counts.get(p0) ?? 0) + 1);
      counts.set(p1, (counts.get(p1) ?? 0) + 1);
    }
    for (const count of counts.values()) {
      expect(count).toBe(2);
    }
  });

  it("returns an empty array when nx or ny is smaller than 2", () => {
    expect(marchingSquares(new Float32Array([1]), 1, 1, 0.5).length).toBe(0);
    expect(marchingSquares(new Float32Array([0, 1]), 2, 1, 0.5).length).toBe(0);
    expect(marchingSquares(new Float32Array([0, 1]), 1, 2, 0.5).length).toBe(0);
  });

  it("emits two segments for an ambiguous saddle cell", () => {
    // Cell corners: bottom-left=1, bottom-right=0, top-right=1, top-left=0.
    // This is a diagonal (saddle) case at level 0.5.
    const nx = 2;
    const ny = 2;
    const grid = new Float32Array(nx * ny);
    grid[0 * nx + 0] = 1; // (i=0, j=0) bottom-left
    grid[0 * nx + 1] = 0; // (i=1, j=0) bottom-right
    grid[1 * nx + 0] = 0; // (i=0, j=1) top-left
    grid[1 * nx + 1] = 1; // (i=1, j=1) top-right
    const segments = marchingSquares(grid, nx, ny, 0.5);
    expect(segments.length).toBe(8); // two segments x 4 numbers each
  });
});

describe("contourLevels", () => {
  it("returns count values evenly spaced strictly inside (min, max)", () => {
    const levels = contourLevels(0, 12, 12);
    expect(levels.length).toBe(12);
    for (const level of levels) {
      expect(level).toBeGreaterThan(0);
      expect(level).toBeLessThan(12);
    }
    for (let k = 1; k < levels.length; k++) {
      expect(levels[k]!).toBeGreaterThan(levels[k - 1]!);
    }
    const spacing = levels[1]! - levels[0]!;
    for (let k = 1; k < levels.length; k++) {
      expect(levels[k]! - levels[k - 1]!).toBeCloseTo(spacing, 6);
    }
  });

  it("defaults to 12 levels", () => {
    const levels = contourLevels(0, 1);
    expect(levels.length).toBe(12);
  });

  it("returns an empty array when count is 0", () => {
    expect(contourLevels(0, 1, 0)).toEqual([]);
  });
});
