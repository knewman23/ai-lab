import { describe, expect, it } from "vitest";
import {
  ARROW_ENDPOINTS,
  ARROW_SEGMENTS,
  arrowSegments,
  FLOOR_AXES,
  WALL_AXES,
} from "../../../src/viz/gpt/arrow-head";
import type { Vec3 } from "../../../src/viz/shared/layer";

const CLOSED = { axes: WALL_AXES, head: "closed", maxBarb: Infinity } as const;
const OPEN = { axes: WALL_AXES, head: "open", maxBarb: Infinity } as const;

function length2(a: Vec3, b: Vec3, axes: readonly [0 | 1 | 2, 0 | 1 | 2]): number {
  return Math.hypot(b[axes[0]] - a[axes[0]], b[axes[1]] - a[axes[1]]);
}

describe("arrowSegments", () => {
  it("emits the shaft first, then the head", () => {
    const segments = arrowSegments([0, 0, 0], [1, 0, 0], { ...CLOSED, axes: [0, 1] });
    expect(segments[0]).toEqual([
      [0, 0, 0],
      [1, 0, 0],
    ]);
    // Both barbs hang off the tip, and the base joins them.
    expect(segments[1]![0]).toEqual([1, 0, 0]);
    expect(segments[2]![0]).toEqual([1, 0, 0]);
    expect(segments[3]).toEqual([segments[1]![1], segments[2]![1]]);
  });

  it("closes a stream state's head and leaves a delta's open", () => {
    // A closed head is a filled-looking triangle and marks one of the three stream states; an
    // open head is the two barbs alone and marks what a stage adds. They must never look alike.
    expect(arrowSegments([0, 0, 0], [0, 0, 1], CLOSED)).toHaveLength(4);
    expect(arrowSegments([0, 0, 0], [0, 0, 1], OPEN)).toHaveLength(3);
    expect(ARROW_SEGMENTS).toBe(4);
    expect(ARROW_ENDPOINTS).toBe(8);
  });

  it("draws in the plane it is given and holds the third axis where the tip is", () => {
    // The wall's (x, z), at a constant y: a column glyph standing on the wall.
    for (const p of arrowSegments([0, -0.02, 1], [0.5, -0.02, 1.3], CLOSED).flat()) {
      expect(p[1]).toBe(-0.02);
    }
    // The floor's (x, y), at a constant z: a step of the residual path.
    const floor = { axes: FLOOR_AXES, head: "closed", maxBarb: Infinity } as const;
    for (const p of arrowSegments([0, 0, 0.01], [0.5, 0.3, 0.01], floor).flat()) {
      expect(p[2]).toBe(0.01);
    }
  });

  it("draws the same arrow in either plane, once the axes are matched", () => {
    const wall = arrowSegments([0, 9, 0], [0.6, 9, 0.8], CLOSED);
    const floor = arrowSegments([0, 0, 9], [0.6, 0.8, 9], {
      axes: FLOOR_AXES,
      head: "closed",
      maxBarb: Infinity,
    });
    expect(wall).toHaveLength(floor.length);
    for (let i = 0; i < wall.length; i++) {
      for (const end of [0, 1] as const) {
        expect(wall[i]![end][0]).toBeCloseTo(floor[i]![end][0], 12);
        expect(wall[i]![end][2]).toBeCloseTo(floor[i]![end][1], 12);
      }
    }
  });

  it("sizes the barbs at 0.32 of the shaft, up to the cap", () => {
    const barb = (length: number, maxBarb: number): number => {
      const segments = arrowSegments([0, 0, 0], [length, 0, 0], {
        ...CLOSED,
        axes: [0, 1],
        maxBarb,
      });
      return length2(segments[1]![0], segments[1]![1], [0, 1]);
    };
    expect(barb(1, Infinity)).toBeCloseTo(0.32, 12);
    expect(barb(0.5, Infinity)).toBeCloseTo(0.16, 12);
    // The cap binds only past the length where the fraction reaches it.
    expect(barb(4, 0.18)).toBeCloseTo(0.18, 12);
    expect(barb(0.3, 0.18)).toBeCloseTo(0.32 * 0.3, 12);
  });

  it("sweeps each barb 0.42 radians off the shaft", () => {
    const [shaft, first, second] = arrowSegments([0, 0, 0], [1, 0, 0], { ...CLOSED, axes: [0, 1] });
    const tip = shaft![1];
    for (const barb of [first!, second!]) {
      const bx = barb[1][0] - tip[0];
      const by = barb[1][1] - tip[1];
      // Against the reversed shaft, which points back along -x from the tip.
      const angle = Math.acos(-bx / Math.hypot(bx, by));
      expect(angle).toBeCloseTo(0.42, 12);
    }
  });

  it("holds the third axis where the tip is, not where the arrow started", () => {
    // The two ends may sit at different heights; the head belongs with the tip, or a barb would
    // hang off the plane the arrow is drawn in.
    for (const p of arrowSegments([0, 1, 0], [1, 2, 0], CLOSED).slice(1).flat()) {
      expect(p[1]).toBe(2);
    }
  });

  it("opens the head backwards down the shaft, whichever way the arrow runs", () => {
    for (const to of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const) {
      const [shaft, first, second] = arrowSegments([0, 0, 0], [to[0], 0, to[1]], CLOSED);
      for (const barb of [first!, second!]) {
        const along = (barb[1][0] - shaft![1][0]) * to[0] + (barb[1][2] - shaft![1][2]) * to[1];
        expect(along).toBeLessThan(0);
      }
      // The two barbs sit on opposite sides of the shaft, never both on one.
      const cross = (p: Vec3): number => p[0] * to[1] - p[2] * to[0];
      expect(Math.sign(cross(first![1])) * Math.sign(cross(second![1]))).toBe(-1);
    }
  });

  it("draws nothing for a zero-length or non-finite arrow", () => {
    expect(arrowSegments([1, 2, 3], [1, 2, 3], CLOSED)).toEqual([]);
    expect(arrowSegments([1, 2, 3], [NaN, 2, 3], CLOSED)).toEqual([]);
    // Zero only in the plane that matters: movement off-plane alone is still no arrow.
    expect(arrowSegments([0, 0, 0], [0, 5, 0], CLOSED)).toEqual([]);
  });
});
