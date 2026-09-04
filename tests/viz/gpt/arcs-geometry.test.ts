import { describe, expect, it } from "vitest";
import type { Vec3 } from "../../../src/viz/shared/layer";
import {
  ARC_BUFFER_FLOATS,
  ARC_LIFT,
  ARC_SEGMENTS,
  ARC_VERTICES,
  arcCentreLine,
  arcControl,
  arcHalfWidth,
  arcTriangles,
  crossSegments,
  MAX_ARCS,
  writeArcs,
} from "../../../src/viz/gpt/arcs-geometry";
import { BAND_Z, columnX } from "../../../src/viz/gpt/layout";

/** The y component of (b - a) x (c - a): the winding of one triangle about the wall's normal. */
function windingY(a: Vec3, b: Vec3, c: Vec3): number {
  const e1: Vec3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const e2: Vec3 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  return e1[2] * e2[0] - e1[0] * e2[2];
}

/** Every triangle of an arc as its three vertices, so winding can be checked one by one. */
function triangles(from: number, to: number, halfWidth: number): (readonly Vec3[])[] {
  const vertices = arcTriangles(from, to, halfWidth);
  const out: Vec3[][] = [];
  for (let n = 0; n < vertices.length; n += 3) {
    const [a, b, c] = vertices.slice(n, n + 3);
    if (a === undefined || b === undefined || c === undefined) {
      throw new Error(`arc triangle ${n / 3} is short`);
    }
    out.push([a, b, c]);
  }
  return out;
}

describe("arcCentreLine", () => {
  it("starts and ends exactly on the two columns' attention band points", () => {
    const line = arcCentreLine(1, 4);
    const first = line[0];
    const last = line[line.length - 1];
    if (first === undefined || last === undefined) throw new Error("the centre line is empty");
    expect(first[0]).toBe(columnX(1));
    expect(first[2]).toBe(BAND_Z.attention);
    expect(last[0]).toBe(columnX(4));
    expect(last[2]).toBe(BAND_Z.attention);
  });

  it("floats a fixed step in front of the wall along its whole length", () => {
    for (const point of arcCentreLine(0, 3)) {
      // The spec's −0.06, pinned here rather than read from the module it tests.
      expect(point[1]).toBe(-0.06);
    }
  });

  it("is sampled at twenty-four segments, so it has twenty-five stations", () => {
    expect(ARC_SEGMENTS).toBe(24);
    expect(arcCentreLine(0, 4)).toHaveLength(25);
  });

  it("bulges toward the control point rather than running straight between the columns", () => {
    const line = arcCentreLine(0, 4);
    const apex = line[12];
    if (apex === undefined) throw new Error("the centre line has no midpoint");
    expect(apex[2]).toBeGreaterThan(BAND_Z.attention);
    expect(apex[0]).toBeCloseTo((columnX(0) + columnX(4)) / 2, 9);
  });
});

describe("arcControl", () => {
  it("sits over the midpoint, lifted by 0.25 + 0.35 * |dx| above the attention band", () => {
    const control = arcControl(1, 4);
    const dx = Math.abs(columnX(4) - columnX(1));
    expect(control[0]).toBeCloseTo((columnX(1) + columnX(4)) / 2, 9);
    expect(control[2]).toBeCloseTo(BAND_Z.attention + 0.25 + 0.35 * dx, 9);
    expect(control[1]).toBe(ARC_LIFT);
  });

  it("lifts a longer reach higher, so overlapping arcs stay told apart", () => {
    const lift = (from: number, to: number): number => arcControl(from, to)[2];
    expect(lift(3, 4)).toBeLessThan(lift(2, 4));
    expect(lift(2, 4)).toBeLessThan(lift(0, 4));
  });

  it("lifts by the same amount whichever way the arc runs", () => {
    expect(arcControl(0, 3)[2]).toBeCloseTo(arcControl(3, 0)[2], 12);
  });

  it("still lifts a self-arc, whose two ends are the same column", () => {
    expect(arcControl(2, 2)[2]).toBeCloseTo(BAND_Z.attention + 0.25, 12);
  });
});

describe("arcHalfWidth", () => {
  it("is 0.010 + 0.075 * weight", () => {
    expect(arcHalfWidth(0)).toBeCloseTo(0.01, 12);
    expect(arcHalfWidth(1)).toBeCloseTo(0.085, 12);
    expect(arcHalfWidth(0.4)).toBeCloseTo(0.04, 12);
  });

  it("is positive at weight zero, so a key read faintly is still a visible ribbon", () => {
    expect(arcHalfWidth(0)).toBeGreaterThan(0);
  });

  it("grows with the weight", () => {
    const widths = [0, 0.2, 0.5, 0.9, 1].map(arcHalfWidth);
    for (let n = 1; n < widths.length; n++) {
      expect(widths[n]!).toBeGreaterThan(widths[n - 1]!);
    }
  });
});

describe("arcTriangles", () => {
  it("emits two triangles per segment, all of them in the wall's offset plane", () => {
    const vertices = arcTriangles(0, 3, 0.05);
    expect(vertices).toHaveLength(24 * 6);
    expect(vertices).toHaveLength(ARC_VERTICES);
    for (const vertex of vertices) expect(vertex[1]).toBe(ARC_LIFT);
  });

  it("winds every triangle the same way for a left-to-right arc", () => {
    const signs = triangles(0, 4, 0.05).map(([a, b, c]) => Math.sign(windingY(a!, b!, c!)));
    expect(signs).toHaveLength(48);
    expect(new Set(signs)).toEqual(new Set([1]));
  });

  it("winds a right-to-left arc the same way, never by negating a normal", () => {
    const signs = triangles(4, 0, 0.05).map(([a, b, c]) => Math.sign(windingY(a!, b!, c!)));
    expect(new Set(signs)).toEqual(new Set([1]));
  });

  it("winds a self-arc consistently too, though its tangent reverses at the apex", () => {
    const signs = triangles(2, 2, 0.05).map(([a, b, c]) => Math.sign(windingY(a!, b!, c!)));
    // The ribbon pinches to nothing where the tangent vanishes, so the fold contributes
    // zero-area triangles rather than back-wound ones. Nothing here is ever negative.
    expect(signs.filter((s) => s < 0)).toHaveLength(0);
    expect(signs.filter((s) => s > 0).length).toBeGreaterThan(40);
  });

  it("straddles the centre line by the half-width on both sides", () => {
    const halfWidth = 0.05;
    const line = arcCentreLine(0, 4);
    const vertices = arcTriangles(0, 4, halfWidth);
    for (const station of [0, line.length - 1]) {
      const point = line[station]!;
      const near = vertices.filter(
        (v) => Math.abs(Math.hypot(v[0] - point[0], v[2] - point[2]) - halfWidth) < 1e-9,
      );
      expect(near.length).toBeGreaterThan(0);
    }
  });

  it("produces no NaN, which would take the whole mesh off screen", () => {
    for (const from of [0, 2, 4]) {
      for (const vertex of arcTriangles(from, 2, 0.01)) {
        for (const c of vertex) expect(Number.isFinite(c)).toBe(true);
      }
    }
  });
});

describe("writeArcs", () => {
  it("preallocates five arcs' worth of floats, in whole vertices", () => {
    expect(MAX_ARCS).toBe(5);
    expect(ARC_BUFFER_FLOATS).toBe(5 * ARC_VERTICES * 3);
    // computeBoundingSphere reads the whole attribute; a ragged length returns NaN.
    expect(ARC_BUFFER_FLOATS % 3).toBe(0);
  });

  it("writes one arc per half-width, in key order, and reports the vertex count", () => {
    const out = new Float32Array(ARC_BUFFER_FLOATS);
    const count = writeArcs(out, 3, [0.02, 0.06]);
    expect(count).toBe(2 * ARC_VERTICES);
    for (const [j, halfWidth] of [
      [0, 0.02],
      [1, 0.06],
    ] as const) {
      const expected = arcTriangles(j, 3, halfWidth).flatMap((v) => [...v]);
      const start = j * ARC_VERTICES * 3;
      expect([...out.slice(start, start + ARC_VERTICES * 3)]).toEqual(
        expected.map((c) => Math.fround(c)),
      );
    }
  });

  it("collapses the unused tail to zero length rather than leaving the last frame there", () => {
    const out = new Float32Array(ARC_BUFFER_FLOATS);
    writeArcs(out, 4, [0.02, 0.03, 0.04, 0.05, 0.06]);
    const count = writeArcs(out, 1, [0.02, 0.03]);
    expect([...out.slice(count * 3)]).toEqual(new Array(ARC_BUFFER_FLOATS - count * 3).fill(0));
  });

  it("writes no vertices at all for a query with no visible keys", () => {
    const out = new Float32Array(ARC_BUFFER_FLOATS);
    expect(writeArcs(out, 0, [])).toBe(0);
    expect([...out]).toEqual(new Array(ARC_BUFFER_FLOATS).fill(0));
  });

  it("throws rather than overrunning its buffer when given more keys than columns", () => {
    const out = new Float32Array(ARC_BUFFER_FLOATS);
    expect(() => writeArcs(out, 4, new Array(6).fill(0.02))).toThrow(/arcs/);
  });
});

describe("crossSegments", () => {
  it("is two diagonals crossing at the masked column's attention band point", () => {
    const segments = crossSegments(4);
    expect(segments).toHaveLength(2);
    const points = segments.flatMap((s) => [...s]);
    const mean = (axis: 0 | 1 | 2): number =>
      points.reduce((sum, p) => sum + p[axis], 0) / points.length;
    expect(mean(0)).toBeCloseTo(columnX(4), 9);
    expect(mean(2)).toBeCloseTo(BAND_Z.attention, 9);
    for (const point of points) expect(point[1]).toBe(ARC_LIFT);
  });

  it("draws the two strokes across each other rather than along one line", () => {
    const [first, second] = crossSegments(2);
    if (first === undefined || second === undefined) throw new Error("a cross needs two strokes");
    const slope = (s: readonly Vec3[]): number => {
      const [a, b] = s;
      if (a === undefined || b === undefined) throw new Error("a stroke needs two ends");
      return (b[2] - a[2]) / (b[0] - a[0]);
    };
    expect(slope(first)).toBeCloseTo(-slope(second), 9);
  });
});
