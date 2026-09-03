import { describe, expect, it } from "vitest";
import type { Vec2 } from "../../../src/core/math/numeric";
import {
  apply,
  clipSegment,
  columns,
  det,
  eigen,
  fromColumns,
  lerpIdentity,
  trace,
  type Mat2,
} from "../../../src/core/math/matrix2";

const SQRT_HALF = Math.SQRT1_2;

/** Small deterministic LCG so random-matrix sampling is reproducible across runs. */
function makeLcg(seed: number): () => number {
  let state = seed >>> 0;
  return (): number => {
    state = (Math.imul(1103515245, state) + 12345) & 0x7fffffff;
    return state / 0x7fffffff;
  };
}

function magnitude(v: Vec2): number {
  return Math.hypot(v[0], v[1]);
}

describe("apply", () => {
  it("maps the four unit-square corners under a shear", () => {
    const shear: Mat2 = [1, 1, 0, 1];
    expect(apply(shear, [0, 0])).toEqual([0, 0]);
    expect(apply(shear, [1, 0])).toEqual([1, 0]);
    expect(apply(shear, [1, 1])).toEqual([2, 1]);
    expect(apply(shear, [0, 1])).toEqual([1, 1]);
  });
});

describe("det and trace", () => {
  it("computes det and trace of a shear", () => {
    const shear: Mat2 = [1, 1, 0, 1];
    expect(det(shear)).toBe(1);
    expect(trace(shear)).toBe(2);
  });

  it("computes det and trace of a scale", () => {
    const scale: Mat2 = [1, 0, 0, 2.5];
    expect(det(scale)).toBe(2.5);
    expect(trace(scale)).toBe(3.5);
  });
});

describe("lerpIdentity", () => {
  it("returns identity at t = 0", () => {
    const m: Mat2 = [2, 1, 0, 0.5];
    expect(lerpIdentity(m, 0)).toEqual([1, 0, 0, 1]);
  });

  it("returns the matrix itself at t = 1", () => {
    const m: Mat2 = [2, 1, 0, 0.5];
    expect(lerpIdentity(m, 1)).toEqual(m);
  });
});

describe("fromColumns and columns", () => {
  it("builds a matrix from two column vectors", () => {
    expect(fromColumns([1, 2], [3, 4])).toEqual([1, 3, 2, 4]);
  });

  it("round-trips through columns", () => {
    const u: Vec2 = [1, 2];
    const v: Vec2 = [3, 4];
    const m = fromColumns(u, v);
    expect(columns(m)).toEqual([
      [1, 2],
      [3, 4],
    ]);
  });
});

describe("eigen", () => {
  it("identity is uniform 1", () => {
    const result = eigen([1, 0, 0, 1]);
    expect(result).toEqual({ kind: "uniform", value: 1 });
  });

  it("scale [[2,0],[0,.5]] gives pairs [2, e1], [.5, e2] in that order", () => {
    const result = eigen([2, 0, 0, 0.5]);
    if (result.kind !== "real") throw new Error("expected real");
    expect(result.pairs.length).toBe(2);
    expect(result.pairs[0]?.value).toBeCloseTo(2, 10);
    expect(result.pairs[0]?.vector[0]).toBeCloseTo(1, 10);
    expect(result.pairs[0]?.vector[1]).toBeCloseTo(0, 10);
    expect(result.pairs[1]?.value).toBeCloseTo(0.5, 10);
    expect(result.pairs[1]?.vector[0]).toBeCloseTo(0, 10);
    expect(result.pairs[1]?.vector[1]).toBeCloseTo(1, 10);
  });

  it("shear [[1,1],[0,1]] gives one pair, lambda 1, vector e1", () => {
    const result = eigen([1, 1, 0, 1]);
    if (result.kind !== "real") throw new Error("expected real");
    expect(result.pairs.length).toBe(1);
    expect(result.pairs[0]?.value).toBeCloseTo(1, 10);
    expect(result.pairs[0]?.vector[0]).toBeCloseTo(1, 10);
    expect(result.pairs[0]?.vector[1]).toBeCloseTo(0, 10);
  });

  it("rotation 45 degrees is complex", () => {
    const result = eigen([SQRT_HALF, -SQRT_HALF, SQRT_HALF, SQRT_HALF]);
    expect(result).toEqual({ kind: "complex" });
  });

  it("reflection [[1,0],[0,-1]] gives [1, e1], [-1, e2]", () => {
    const result = eigen([1, 0, 0, -1]);
    if (result.kind !== "real") throw new Error("expected real");
    expect(result.pairs.length).toBe(2);
    expect(result.pairs[0]?.value).toBeCloseTo(1, 10);
    expect(result.pairs[0]?.vector[0]).toBeCloseTo(1, 10);
    expect(result.pairs[0]?.vector[1]).toBeCloseTo(0, 10);
    expect(result.pairs[1]?.value).toBeCloseTo(-1, 10);
    expect(result.pairs[1]?.vector[0]).toBeCloseTo(0, 10);
    expect(result.pairs[1]?.vector[1]).toBeCloseTo(1, 10);
  });

  it("symmetric [[2,1],[1,2]] gives [3, (1,1)/sqrt2], [1, (1,-1)/sqrt2]", () => {
    const result = eigen([2, 1, 1, 2]);
    if (result.kind !== "real") throw new Error("expected real");
    expect(result.pairs.length).toBe(2);
    expect(result.pairs[0]?.value).toBeCloseTo(3, 10);
    expect(result.pairs[0]?.vector[0]).toBeCloseTo(SQRT_HALF, 10);
    expect(result.pairs[0]?.vector[1]).toBeCloseTo(SQRT_HALF, 10);
    expect(result.pairs[1]?.value).toBeCloseTo(1, 10);
    expect(result.pairs[1]?.vector[0]).toBeCloseTo(SQRT_HALF, 10);
    expect(result.pairs[1]?.vector[1]).toBeCloseTo(-SQRT_HALF, 10);
  });

  it("projection [[1,0],[0,0]] gives [1, e1], [0, e2] and det 0", () => {
    const m: Mat2 = [1, 0, 0, 0];
    expect(det(m)).toBe(0);
    const result = eigen(m);
    if (result.kind !== "real") throw new Error("expected real");
    expect(result.pairs.length).toBe(2);
    expect(result.pairs[0]?.value).toBeCloseTo(1, 10);
    expect(result.pairs[0]?.vector[0]).toBeCloseTo(1, 10);
    expect(result.pairs[0]?.vector[1]).toBeCloseTo(0, 10);
    expect(result.pairs[1]?.value).toBeCloseTo(0, 10);
    expect(result.pairs[1]?.vector[0]).toBeCloseTo(0, 10);
    expect(result.pairs[1]?.vector[1]).toBeCloseTo(1, 10);
  });

  it("holds for 50 seeded random matrices with real distinct eigenvalues", () => {
    const rand = makeLcg(42);
    let checked = 0;
    let attempts = 0;
    while (checked < 50 && attempts < 5000) {
      attempts++;
      const a = rand() * 6 - 3;
      const b = rand() * 6 - 3;
      const c = rand() * 6 - 3;
      const d = rand() * 6 - 3;
      const m: Mat2 = [a, b, c, d];
      const tr = a + d;
      const dt = a * d - b * c;
      const disc = tr * tr - 4 * dt;
      if (disc <= 1e-3) continue;
      checked++;
      const result = eigen(m);
      if (result.kind !== "real") throw new Error(`expected real for matrix ${JSON.stringify(m)}`);
      for (const pair of result.pairs) {
        const mv = apply(m, pair.vector);
        const lv: Vec2 = [pair.value * pair.vector[0], pair.value * pair.vector[1]];
        const diff: Vec2 = [mv[0] - lv[0], mv[1] - lv[1]];
        expect(magnitude(diff)).toBeLessThan(1e-7);
        expect(Math.abs(magnitude(pair.vector) - 1)).toBeLessThan(1e-12);
      }
    }
    expect(checked).toBe(50);
  });
});

describe("clipSegment", () => {
  const bound = 3;

  it("returns unchanged when fully inside", () => {
    const p: Vec2 = [-1, -1];
    const q: Vec2 = [1, 1];
    expect(clipSegment(p, q, bound)).toEqual([p, q]);
  });

  it("returns null when fully outside", () => {
    const p: Vec2 = [10, 10];
    const q: Vec2 = [20, 20];
    expect(clipSegment(p, q, bound)).toBeNull();
  });

  it("clips a segment crossing one edge", () => {
    const p: Vec2 = [0, 0];
    const q: Vec2 = [10, 0];
    const result = clipSegment(p, q, bound);
    expect(result).not.toBeNull();
    const [rp, rq] = result as [Vec2, Vec2];
    expect(rp).toEqual([0, 0]);
    expect(rq[0]).toBeCloseTo(3, 10);
    expect(rq[1]).toBeCloseTo(0, 10);
  });

  it("clips a segment crossing two edges, both endpoints on the boundary", () => {
    const p: Vec2 = [-10, 0];
    const q: Vec2 = [10, 0];
    const result = clipSegment(p, q, bound);
    expect(result).not.toBeNull();
    const [rp, rq] = result as [Vec2, Vec2];
    expect(rp[0]).toBeCloseTo(-3, 10);
    expect(rp[1]).toBeCloseTo(0, 10);
    expect(rq[0]).toBeCloseTo(3, 10);
    expect(rq[1]).toBeCloseTo(0, 10);
  });

  it("returns a zero-length segment inside as is", () => {
    const p: Vec2 = [1, 1];
    expect(clipSegment(p, p, bound)).toEqual([p, p]);
  });
});
