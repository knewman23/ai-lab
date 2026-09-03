import { describe, expect, it } from "vitest";
import {
  BAND,
  DOMAIN,
  FN_KEYS,
  FNS,
  Z0,
  curveSamples,
  effectiveH,
  primeSamples,
  secantSlope,
  zoomSamples,
} from "../../../src/core/math/functions1d";

/** Small deterministic LCG so domain sampling is reproducible across runs. */
function makeLcg(seed: number): () => number {
  let state = seed >>> 0;
  return (): number => {
    state = (Math.imul(1103515245, state) + 12345) & 0x7fffffff;
    return state / 0x7fffffff;
  };
}

/** Central-difference approximation of a scalar function's derivative. */
function centralDifference1d(f: (x: number) => number, x: number, h = 1e-5): number {
  return (f(x + h) - f(x - h)) / (2 * h);
}

describe("FN_KEYS and FNS table", () => {
  it("orders keys as in the spec table", () => {
    expect(FN_KEYS).toEqual(["square", "cubic", "sine", "exp", "abs", "sqrtabs"]);
  });

  it("matches the spec table for scale, primeScale, start, singularAt", () => {
    expect(FNS.square.scale).toBeCloseTo(1 / 3, 10);
    expect(FNS.square.primeScale).toBeCloseTo(1 / 2.4, 10);
    expect(FNS.square.start).toBe(1.5);
    expect(FNS.square.singularAt).toBeNull();

    expect(FNS.cubic.scale).toBeCloseTo(1 / 6, 10);
    expect(FNS.cubic.primeScale).toBeCloseTo(1 / 9.6, 10);
    expect(FNS.cubic.start).toBe(0.8);
    expect(FNS.cubic.singularAt).toBeNull();

    expect(FNS.sine.scale).toBeCloseTo(2, 10);
    expect(FNS.sine.primeScale).toBeCloseTo(2, 10);
    expect(FNS.sine.start).toBe(1);
    expect(FNS.sine.singularAt).toBeNull();

    expect(FNS.exp.scale).toBeCloseTo(0.59, 10);
    expect(FNS.exp.primeScale).toBeCloseTo(0.59, 10);
    expect(FNS.exp.start).toBe(1);
    expect(FNS.exp.singularAt).toBeNull();

    expect(FNS.abs.scale).toBeCloseTo(1, 10);
    expect(FNS.abs.primeScale).toBeCloseTo(2, 10);
    expect(FNS.abs.start).toBe(1.2);
    expect(FNS.abs.singularAt).toBe(0);

    expect(FNS.sqrtabs.scale).toBeCloseTo(1.5, 10);
    expect(FNS.sqrtabs.primeScale).toBeCloseTo(1, 10);
    expect(FNS.sqrtabs.start).toBe(1);
    expect(FNS.sqrtabs.singularAt).toBe(0);
  });

  it("gives every function a key, title, tex, texPrime and hint", () => {
    for (const key of FN_KEYS) {
      const fn = FNS[key];
      expect(fn.key).toBe(key);
      expect(fn.title.length).toBeGreaterThan(0);
      expect(fn.tex.length).toBeGreaterThan(0);
      expect(fn.texPrime.length).toBeGreaterThan(0);
      expect(fn.hint.length).toBeGreaterThan(0);
    }
  });
});

describe("value derivatives vs finite differences", () => {
  for (const key of FN_KEYS) {
    it(`${key}: value derivative matches central differences at 25 seeded points`, () => {
      const fn = FNS[key];
      const rand = makeLcg(key.length * 7919 + 17);
      let count = 0;
      while (count < 25) {
        const x = DOMAIN[0] + rand() * (DOMAIN[1] - DOMAIN[0]);
        if (Math.abs(x) <= 0.05) continue;
        count++;

        const d = fn.d(x);
        expect(d.kind).toBe("value");
        if (d.kind !== "value") continue;

        const expected = centralDifference1d(fn.f, x);
        const tol = Math.max(Math.abs(expected) * 1e-4, 1e-6);
        expect(Math.abs(d.v - expected)).toBeLessThanOrEqual(tol);
      }
    });
  }
});

describe("non-differentiable points", () => {
  it("abs.d(0) is a jump from -1 to 1", () => {
    expect(FNS.abs.d(0)).toEqual({ kind: "jump", left: -1, right: 1 });
  });

  it("sqrtabs.d(0) is vertical", () => {
    expect(FNS.sqrtabs.d(0)).toEqual({ kind: "vertical" });
  });

  it("abs.d away from 0 is a value with sign(x)", () => {
    const right = FNS.abs.d(0.5);
    expect(right.kind).toBe("value");
    if (right.kind === "value") expect(right.v).toBe(1);

    const left = FNS.abs.d(-0.5);
    expect(left.kind).toBe("value");
    if (left.kind === "value") expect(left.v).toBe(-1);
  });
});

describe("secantSlope", () => {
  it("secantSlope(square, 1, h) approaches 2 + h", () => {
    for (const h of [1, 0.1, 0.001]) {
      expect(secantSlope(FNS.square, 1, h)).toBeCloseTo(2 + h, 9);
    }
  });
});

describe("effectiveH", () => {
  it("clips h so x + h stays in the domain", () => {
    expect(effectiveH(2.5, 1)).toBe(0.5);
  });

  it("returns null when the remaining room is below 1e-9", () => {
    expect(effectiveH(3, 1)).toBeNull();
  });

  it("returns h unchanged when there is room", () => {
    expect(effectiveH(0, 1)).toBe(1);
  });
});

describe("band properties on a 601-sample grid", () => {
  const n = 601;
  const xs: number[] = [];
  for (let i = 0; i < n; i++) {
    xs.push(DOMAIN[0] + (i / (n - 1)) * (DOMAIN[1] - DOMAIN[0]));
  }

  it("max |scale * f| <= 3 + 1e-9 for every function", () => {
    for (const key of FN_KEYS) {
      const fn = FNS[key];
      let max = 0;
      for (const x of xs) {
        max = Math.max(max, Math.abs(fn.scale * fn.f(x)));
      }
      expect(max).toBeLessThanOrEqual(3 + 1e-9);
    }
  });

  it("max |primeScale * f'| <= 2.5 + 1e-9 for every function except sqrtabs", () => {
    for (const key of FN_KEYS) {
      if (key === "sqrtabs") continue;
      const fn = FNS[key];
      let max = 0;
      for (const x of xs) {
        if (fn.singularAt !== null && Math.abs(x - fn.singularAt) < 1e-9) continue;
        const d = fn.d(x);
        if (d.kind !== "value") continue;
        max = Math.max(max, Math.abs(fn.primeScale * d.v));
      }
      expect(max).toBeLessThanOrEqual(2.5 + 1e-9);
    }
  });
});

describe("curveSamples", () => {
  it("returns 241 evenly spaced X over the domain and Z = scale * f(X)", () => {
    const fn = FNS.square;
    const { X, Z } = curveSamples(fn, 241);
    expect(X.length).toBe(241);
    expect(Z.length).toBe(241);
    expect(X[0]).toBeCloseTo(DOMAIN[0], 9);
    expect(X[240]).toBeCloseTo(DOMAIN[1], 9);
    expect(X[120]).toBeCloseTo(0, 9);

    for (let i = 0; i < 241; i++) {
      expect(Z[i]).toBeCloseTo(fn.scale * fn.f(X[i] as number), 5);
    }
  });
});

describe("primeSamples", () => {
  it("returns a single run for functions with no singularity", () => {
    for (const key of FN_KEYS) {
      if (FNS[key].singularAt !== null) continue;
      const fn = FNS[key];
      const runs = primeSamples(fn, 241);
      expect(runs.length).toBe(1);
      const { X, Z } = runs[0] as { X: Float32Array; Z: Float32Array };
      for (let i = 0; i < X.length; i++) {
        const d = fn.d(X[i] as number);
        expect(d.kind).toBe("value");
        if (d.kind !== "value") continue;
        const expectedZ = Math.max(BAND[0], Math.min(BAND[1], Z0 + fn.primeScale * d.v));
        expect(Z[i]).toBeCloseTo(expectedZ, 5);
      }
    }
  });

  it("splits into two runs at the singularity for abs and sqrtabs, omitting the singular sample", () => {
    for (const key of ["abs", "sqrtabs"] as const) {
      const fn = FNS[key];
      const runs = primeSamples(fn, 241);
      expect(runs.length).toBe(2);
      for (const run of runs) {
        for (const x of run.X) {
          expect(Math.abs(x - (fn.singularAt ?? 0))).toBeGreaterThan(1e-9);
        }
      }
    }
  });
});

describe("zoomSamples", () => {
  it("centers on the point and converges to the tangent as K grows", () => {
    const fn = FNS.square;
    const x = 1.5;
    const n = 241;

    function maxDev(K: number): number {
      const { X, Z } = zoomSamples(fn, x, K, n);
      expect(X[120]).toBeCloseTo(0, 9);
      expect(Z[120]).toBeCloseTo(0, 9);
      expect(X[0]).toBeGreaterThanOrEqual(-3 - 1e-6);
      expect(X[n - 1]).toBeLessThanOrEqual(3 + 1e-6);

      const d = fn.d(x);
      expect(d.kind).toBe("value");
      const slope = d.kind === "value" ? fn.scale * d.v : 0;

      let max = 0;
      for (let i = 0; i < n; i++) {
        max = Math.max(max, Math.abs((Z[i] as number) - slope * (X[i] as number)));
      }
      return max;
    }

    const dev4 = maxDev(4);
    const dev16 = maxDev(16);
    const dev64 = maxDev(64);

    expect(dev4).toBeGreaterThan(3 * dev16);
    expect(dev16).toBeGreaterThan(3 * dev64);
  });
});
