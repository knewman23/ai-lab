import { describe, expect, it } from "vitest";
import { centralDifference } from "../../../src/core/math/numeric";
import { SURFACE_KEYS, SURFACES, clampToDomain, isInDomain } from "../../../src/core/math/surfaces";

/** Small deterministic LCG so domain sampling is reproducible across runs. */
function makeLcg(seed: number): () => number {
  let state = seed >>> 0;
  return (): number => {
    state = (Math.imul(1103515245, state) + 12345) & 0x7fffffff;
    return state / 0x7fffffff;
  };
}

describe("SURFACE_KEYS and SURFACES table", () => {
  it("matches the spec table exactly for every key", () => {
    expect(SURFACE_KEYS).toEqual(["bowl", "elongated", "saddle", "himmelblau", "rosenbrock"]);

    expect(SURFACES.bowl.domain).toEqual({ x: [-3, 3], y: [-3, 3] });
    expect(SURFACES.bowl.scale).toBeCloseTo(1 / 6, 10);
    expect(SURFACES.bowl.start).toEqual([2.5, 2]);

    expect(SURFACES.elongated.domain).toEqual({ x: [-3, 3], y: [-3, 3] });
    expect(SURFACES.elongated.scale).toBeCloseTo(1 / 30, 10);
    expect(SURFACES.elongated.start).toEqual([2.5, 1.5]);

    expect(SURFACES.saddle.domain).toEqual({ x: [-3, 3], y: [-3, 3] });
    expect(SURFACES.saddle.scale).toBeCloseTo(1 / 6, 10);
    expect(SURFACES.saddle.start).toEqual([2.5, 0.05]);

    expect(SURFACES.himmelblau.domain).toEqual({ x: [-5, 5], y: [-5, 5] });
    expect(SURFACES.himmelblau.scale).toBeCloseTo(1 / 300, 10);
    expect(SURFACES.himmelblau.start).toEqual([0, 0]);

    expect(SURFACES.rosenbrock.domain).toEqual({ x: [-2, 2], y: [-1, 3] });
    expect(SURFACES.rosenbrock.scale).toBeCloseTo(1 / 800, 10);
    expect(SURFACES.rosenbrock.start).toEqual([-1.5, 2.5]);
  });

  it("gives each surface its per-surface default learning rate, within the slider range", () => {
    expect(SURFACES.bowl.defaultLr).toBe(0.1);
    expect(SURFACES.elongated.defaultLr).toBe(0.1);
    expect(SURFACES.saddle.defaultLr).toBe(0.1);
    expect(SURFACES.himmelblau.defaultLr).toBe(0.01);
    expect(SURFACES.rosenbrock.defaultLr).toBe(0.001);

    for (const key of SURFACE_KEYS) {
      const { defaultLr } = SURFACES[key];
      expect(defaultLr).toBeGreaterThanOrEqual(1e-3);
      expect(defaultLr).toBeLessThanOrEqual(1);
    }
  });

  it("gives every surface a title and hint", () => {
    for (const key of SURFACE_KEYS) {
      const surface = SURFACES[key];
      expect(surface.key).toBe(key);
      expect(surface.title.length).toBeGreaterThan(0);
      expect(surface.hint.length).toBeGreaterThan(0);
    }
  });
});

describe("spot values", () => {
  it("bowl.f(1, 2) === 5", () => {
    expect(SURFACES.bowl.f(1, 2)).toBe(5);
  });

  it("saddle.grad(1, 1) is [2, -2]", () => {
    expect(SURFACES.saddle.grad(1, 1)).toEqual([2, -2]);
  });

  it("rosenbrock.f(1, 1) === 0", () => {
    expect(SURFACES.rosenbrock.f(1, 1)).toBe(0);
  });

  it("himmelblau.f(3, 2) is approximately 0", () => {
    expect(SURFACES.himmelblau.f(3, 2)).toBeCloseTo(0, 6);
  });
});

describe("analytic gradient vs finite differences", () => {
  for (const key of SURFACE_KEYS) {
    it(`${key}: grad matches centralDifference at 25 seeded points in the domain`, () => {
      const surface = SURFACES[key];
      const rand = makeLcg(key.length * 7919 + 17);
      const { x: xr, y: yr } = surface.domain;

      for (let i = 0; i < 25; i++) {
        const x = xr[0] + rand() * (xr[1] - xr[0]);
        const y = yr[0] + rand() * (yr[1] - yr[0]);

        const [gx, gy] = surface.grad(x, y);
        const [fx, fy] = centralDifference((px, py) => surface.f(px, py), x, y);

        const tol = (expected: number): number => Math.max(Math.abs(expected) * 1e-4, 1e-6);
        expect(Math.abs(gx - fx)).toBeLessThanOrEqual(tol(fx));
        expect(Math.abs(gy - fy)).toBeLessThanOrEqual(tol(fy));
      }
    });
  }
});

describe("isInDomain", () => {
  it("is true at the domain corners", () => {
    const surface = SURFACES.bowl;
    expect(isInDomain(surface, [-3, -3])).toBe(true);
    expect(isInDomain(surface, [3, 3])).toBe(true);
    expect(isInDomain(surface, [-3, 3])).toBe(true);
    expect(isInDomain(surface, [3, -3])).toBe(true);
  });

  it("is false just outside the domain", () => {
    const surface = SURFACES.bowl;
    expect(isInDomain(surface, [3.0001, 0])).toBe(false);
    expect(isInDomain(surface, [0, -3.0001])).toBe(false);
  });
});

describe("clampToDomain", () => {
  it("returns corners unchanged", () => {
    const surface = SURFACES.bowl;
    expect(clampToDomain(surface, [-3, -3])).toEqual([-3, -3]);
    expect(clampToDomain(surface, [3, 3])).toEqual([3, 3]);
  });

  it("clamps a point outside on both axes to the nearest corner", () => {
    const surface = SURFACES.bowl;
    expect(clampToDomain(surface, [10, -10])).toEqual([3, -3]);
    expect(clampToDomain(surface, [-10, 10])).toEqual([-3, 3]);
  });
});
