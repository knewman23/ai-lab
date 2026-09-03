import { describe, expect, it } from "vitest";
import { DOMAIN, FN_KEYS, FNS, effectiveH, secantSlope } from "../../../src/core/math/functions1d";

/**
 * Fixed sample of 25 x values spread across the domain, none within 0.05 of 0 (where `abs` and
 * `sqrtabs` are not differentiable), so the finite-difference check below is reproducible.
 */
const SAMPLE_XS: readonly number[] = [
  -2.88, -2.64, -2.4, -2.16, -1.92, -1.68, -1.44, -1.2, -0.96, -0.72, -0.48, -0.24, 0.1, 0.24, 0.48,
  0.72, 0.96, 1.2, 1.44, 1.68, 1.92, 2.16, 2.4, 2.64, 2.88,
];

/** Central-difference approximation of a scalar function's derivative: (f(x+h) - f(x-h)) / 2h. */
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

  it("matches the spec's titles", () => {
    expect(FNS.square.title).toBe("x²");
    expect(FNS.cubic.title).toBe("x³ − 3x");
    expect(FNS.sine.title).toBe("sin x");
    expect(FNS.exp.title).toBe("eˣ⁄5");
    expect(FNS.abs.title).toBe("|x|");
    expect(FNS.sqrtabs.title).toBe("√|x|");
  });

  it("matches the spec's KaTeX strings for f", () => {
    expect(FNS.square.tex).toBe("x^2");
    expect(FNS.cubic.tex).toBe("x^3 - 3x");
    expect(FNS.sine.tex).toBe("\\sin x");
    expect(FNS.exp.tex).toBe("e^{x}/5");
    expect(FNS.abs.tex).toBe("|x|");
    expect(FNS.sqrtabs.tex).toBe("\\sqrt{|x|}");
  });

  it("matches the spec's KaTeX strings for f'", () => {
    expect(FNS.square.texPrime).toBe("2x");
    expect(FNS.cubic.texPrime).toBe("3x^2 - 3");
    expect(FNS.sine.texPrime).toBe("\\cos x");
    expect(FNS.exp.texPrime).toBe("e^{x}/5");
    expect(FNS.abs.texPrime).toBe("\\operatorname{sign}(x)");
    expect(FNS.sqrtabs.texPrime).toBe("\\frac{\\operatorname{sign}(x)}{2\\sqrt{|x|}}");
  });
});

describe("value derivatives vs finite differences", () => {
  for (const key of FN_KEYS) {
    it(`${key}: value derivative matches central differences at 25 fixed points`, () => {
      const fn = FNS[key];
      for (const x of SAMPLE_XS) {
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

  it("treats the 1e-9 threshold as the boundary between jump and value", () => {
    expect(FNS.abs.d(1e-12)).toEqual({ kind: "jump", left: -1, right: 1 });

    const beyond = FNS.abs.d(1e-6);
    expect(beyond.kind).toBe("value");
    if (beyond.kind === "value") expect(beyond.v).toBe(1);
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
