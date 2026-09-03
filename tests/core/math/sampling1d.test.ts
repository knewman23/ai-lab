import { describe, expect, it } from "vitest";
import { BAND, DOMAIN, FNS, Z0 } from "../../../src/core/math/functions1d";
import { curveSamples, primeSamples, zoomSamples } from "../../../src/core/math/sampling1d";

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
    for (const key of ["square", "cubic", "sine", "exp"] as const) {
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
  it("at K = 1 reproduces X over the domain and Z = scale * (f(x + X) - f(x))", () => {
    const fn = FNS.square;
    const x = 1.5;
    const n = 241;
    const { X, Z } = zoomSamples(fn, x, 1, n);

    expect(X[0]).toBeCloseTo(DOMAIN[0], 6);
    expect(X[n - 1]).toBeCloseTo(DOMAIN[1], 6);

    for (let i = 0; i < n; i++) {
      const xi = X[i] as number;
      const expected = fn.scale * (fn.f(x + xi) - fn.f(x));
      expect(Z[i]).toBeCloseTo(expected, 5);
    }
  });

  it("centers on the point at (0, 0) and stays within the domain span", () => {
    const fn = FNS.square;
    const x = 1.5;
    const n = 241;
    const { X, Z } = zoomSamples(fn, x, 4, n);

    expect(X[120]).toBeCloseTo(0, 9);
    expect(Z[120]).toBeCloseTo(0, 9);
    expect(X[0]).toBeGreaterThanOrEqual(-3 - 1e-6);
    expect(X[n - 1]).toBeLessThanOrEqual(3 + 1e-6);
  });

  it("converges to the tangent as K grows: max deviation falls at least 3x per zoom step", () => {
    const fn = FNS.square;
    const x = 1.5;
    const n = 241;

    function maxDev(K: number): number {
      const { X, Z } = zoomSamples(fn, x, K, n);
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
