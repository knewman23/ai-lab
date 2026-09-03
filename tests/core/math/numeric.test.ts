import { describe, expect, it } from "vitest";
import { centralDifference, isFinitePoint, magnitude } from "../../../src/core/math/numeric";

describe("centralDifference", () => {
  it("matches the analytic gradient of x^2 + 3xy at (1, 2)", () => {
    const f = (x: number, y: number): number => x * x + 3 * x * y;
    const [fx, fy] = centralDifference(f, 1, 2);
    expect(fx).toBeCloseTo(8, 6);
    expect(fy).toBeCloseTo(3, 6);
  });
});

describe("isFinitePoint", () => {
  it("is false when a component is NaN", () => {
    expect(isFinitePoint([NaN, 0])).toBe(false);
  });

  it("is false when a component is +Infinity", () => {
    expect(isFinitePoint([0, Infinity])).toBe(false);
  });

  it("is false when a component is -Infinity", () => {
    expect(isFinitePoint([-Infinity, 0])).toBe(false);
  });

  it("is true for finite components", () => {
    expect(isFinitePoint([1, 2])).toBe(true);
  });
});

describe("magnitude", () => {
  it("computes the euclidean norm", () => {
    expect(magnitude([3, 4])).toBe(5);
  });
});
