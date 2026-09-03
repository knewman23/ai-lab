import { describe, expect, it } from "vitest";
import {
  COMP_KEYS,
  COMPOSITIONS,
  DOMAIN,
  DX_RANGE,
  FACE,
  deltas,
  effectiveDx,
  evaluate,
  sideSlope,
} from "../../../src/core/math/compositions";

/** Fixed sample of 25 x values spread across the domain so the checks below are reproducible. */
const SAMPLE_XS: readonly number[] = [
  -2.88, -2.64, -2.4, -2.16, -1.92, -1.68, -1.44, -1.2, -0.96, -0.72, -0.48, -0.24, 0.1, 0.24, 0.48,
  0.72, 0.96, 1.2, 1.44, 1.68, 1.92, 2.16, 2.4, 2.64, 2.88,
];

/** Fixed (x, Δx) pairs; every x + Δx stays inside the domain. */
const SAMPLE_PAIRS: readonly (readonly [number, number])[] = [
  [-2.9, 0.001],
  [-2.7, 0.5],
  [-2.5, 2],
  [-2.2, 0.05],
  [-1.9, 1.3],
  [-1.6, 0.01],
  [-1.3, 0.8],
  [-1.1, 0.2],
  [-0.9, 1.7],
  [-0.7, 0.003],
  [-0.4, 0.6],
  [-0.2, 1],
  [0.05, 0.1],
  [0.3, 0.02],
  [0.5, 1.5],
  [0.7, 0.35],
  [0.9, 2],
  [1.1, 0.009],
  [1.3, 0.75],
  [1.6, 1.2],
  [1.9, 0.4],
  [2.2, 0.07],
  [2.5, 0.5],
  [2.7, 0.25],
  [2.95, 0.05],
];

/** Central-difference approximation of a scalar function's derivative: (f(x+h) - f(x-h)) / 2h. */
function centralDifference1d(f: (x: number) => number, x: number, h = 1e-5): number {
  return (f(x + h) - f(x - h)) / (2 * h);
}

describe("COMP_KEYS and COMPOSITIONS table", () => {
  it("orders keys as in the spec table", () => {
    expect(COMP_KEYS).toEqual(["sin3x", "sinsq", "gauss", "sqrtq", "sincube"]);
  });

  it("exposes the spec's constants", () => {
    expect(DOMAIN).toEqual([-3, 3]);
    expect(DX_RANGE).toEqual([1e-3, 2]);
    expect(FACE).toBe(6);
  });

  it("matches the spec table for su, sy, start", () => {
    expect(COMPOSITIONS.sin3x.su).toBeCloseTo(1 / 3, 10);
    expect(COMPOSITIONS.sin3x.sy).toBe(2.5);
    expect(COMPOSITIONS.sin3x.start).toBe(0.4);

    expect(COMPOSITIONS.sinsq.su).toBeCloseTo(1 / 3, 10);
    expect(COMPOSITIONS.sinsq.sy).toBe(2.5);
    expect(COMPOSITIONS.sinsq.start).toBe(1.2);

    expect(COMPOSITIONS.gauss.su).toBeCloseTo(2 / 3, 10);
    expect(COMPOSITIONS.gauss.sy).toBe(2.5);
    expect(COMPOSITIONS.gauss.start).toBe(1);

    expect(COMPOSITIONS.sqrtq.su).toBe(0.3);
    expect(COMPOSITIONS.sqrtq.sy).toBe(0.9);
    expect(COMPOSITIONS.sqrtq.start).toBe(1.5);

    expect(COMPOSITIONS.sincube.su).toBe(3);
    expect(COMPOSITIONS.sincube.sy).toBe(2.5);
    expect(COMPOSITIONS.sincube.start).toBe(0.8);
  });

  it("gives every composition its key and a non-empty hint", () => {
    for (const key of COMP_KEYS) {
      expect(COMPOSITIONS[key].key).toBe(key);
      expect(COMPOSITIONS[key].hint.length).toBeGreaterThan(0);
    }
  });

  it("matches the spec's titles", () => {
    expect(COMPOSITIONS.sin3x.title).toBe("sin 3x");
    expect(COMPOSITIONS.sinsq.title).toBe("sin x²");
    expect(COMPOSITIONS.gauss.title).toBe("e^(−x²/2)");
    expect(COMPOSITIONS.sqrtq.title).toBe("√(x²+1)");
    expect(COMPOSITIONS.sincube.title).toBe("sin³x");
  });

  it("matches the spec's KaTeX strings", () => {
    const c = COMPOSITIONS;
    expect([c.sin3x.tex, c.sin3x.texG, c.sin3x.texF, c.sin3x.texPrime]).toEqual([
      "\\sin 3x",
      "3x",
      "\\sin u",
      "\\cos(3x)\\cdot 3",
    ]);
    expect([c.sinsq.tex, c.sinsq.texG, c.sinsq.texF, c.sinsq.texPrime]).toEqual([
      "\\sin x^2",
      "x^2",
      "\\sin u",
      "\\cos(x^2)\\cdot 2x",
    ]);
    expect([c.gauss.tex, c.gauss.texG, c.gauss.texF, c.gauss.texPrime]).toEqual([
      "e^{-x^2/2}",
      "-x^2/2",
      "e^{u}",
      "e^{-x^2/2}\\cdot(-x)",
    ]);
    expect([c.sqrtq.tex, c.sqrtq.texG, c.sqrtq.texF, c.sqrtq.texPrime]).toEqual([
      "\\sqrt{x^2+1}",
      "x^2+1",
      "\\sqrt{u}",
      "\\frac{1}{2\\sqrt{x^2+1}}\\cdot 2x",
    ]);
    expect([c.sincube.tex, c.sincube.texG, c.sincube.texF, c.sincube.texPrime]).toEqual([
      "\\sin^3 x",
      "\\sin x",
      "u^3",
      "3\\sin^2 x\\cdot\\cos x",
    ]);
  });
});

describe("evaluate vs finite differences", () => {
  for (const key of COMP_KEYS) {
    it(`${key}: dydx matches a central difference of f(g(x)) at 25 fixed points`, () => {
      const c = COMPOSITIONS[key];
      for (const x of SAMPLE_XS) {
        const expected = centralDifference1d((t) => c.f(c.g(t)), x);
        const tol = Math.max(Math.abs(expected) * 1e-4, 1e-6);
        expect(Math.abs(evaluate(c, x).dydx - expected)).toBeLessThanOrEqual(tol);
      }
    });
  }
});

describe("effectiveDx", () => {
  it("clips dx so x + dx stays in the domain", () => {
    expect(effectiveDx(2.5, 1)).toBe(0.5);
  });

  it("returns null when the remaining room is below 1e-9", () => {
    expect(effectiveDx(3, 1)).toBeNull();
  });

  it("returns dx unchanged when there is room", () => {
    expect(effectiveDx(0, 1)).toBe(1);
  });
});

describe("deltas", () => {
  it("sin3x: duDx is exactly 3 for the linear inner function", () => {
    expect(deltas(COMPOSITIONS.sin3x, 0, 1e-3).duDx).toBeCloseTo(3, 9);
  });

  for (const key of COMP_KEYS) {
    it(`${key}: dyDx = dyDu * duDx wherever dyDu is defined`, () => {
      const c = COMPOSITIONS[key];
      for (const [x, dx] of SAMPLE_PAIRS) {
        const d = deltas(c, x, dx);
        if (d.dyDu === null) continue;
        const tol = 1e-9 * (Math.abs(d.dyDx) + 1);
        expect(Math.abs(d.dyDu * d.duDx - d.dyDx)).toBeLessThanOrEqual(tol);
      }
    });
  }

  it("sinsq: dyDu is null and dyDx is 0 when Δu = 0 (x = -Δx/2 on x²)", () => {
    const d = deltas(COMPOSITIONS.sinsq, -0.5, 1);
    expect(d.dyDu).toBeNull();
    expect(d.dyDx).toBe(0);
  });
});

describe("sideSlope", () => {
  it("sincube at u = 0: f' = 3u² = 0", () => {
    expect(sideSlope(COMPOSITIONS.sincube, 0)).toBe(0);
  });

  it("sqrtq at u = -1: f' undefined, so null", () => {
    expect(sideSlope(COMPOSITIONS.sqrtq, -1)).toBeNull();
  });

  it("sin3x at u = 0: sy * cos 0 / su = 7.5", () => {
    expect(sideSlope(COMPOSITIONS.sin3x, 0)).toBeCloseTo(7.5, 9);
  });
});

describe("display bounds on a 601-sample grid", () => {
  const n = 601;
  const xs: number[] = [];
  for (let i = 0; i < n; i++) {
    xs.push(DOMAIN[0] + (i / (n - 1)) * (DOMAIN[1] - DOMAIN[0]));
  }

  it("max |su * g| <= 3 + 1e-9 and max |sy * f(g)| <= 3 + 1e-9 for every composition", () => {
    for (const key of COMP_KEYS) {
      const c = COMPOSITIONS[key];
      let maxU = 0;
      let maxY = 0;
      for (const x of xs) {
        const u = c.g(x);
        maxU = Math.max(maxU, Math.abs(c.su * u));
        maxY = Math.max(maxY, Math.abs(c.sy * c.f(u)));
      }
      expect(maxU).toBeLessThanOrEqual(3 + 1e-9);
      expect(maxY).toBeLessThanOrEqual(3 + 1e-9);
    }
  });
});
