import { describe, expect, it } from "vitest";
import { mulberry32 } from "../../../src/core/math/prng";

function firstThree(seed: number): number[] {
  const rand = mulberry32(seed);
  return [rand(), rand(), rand()];
}

describe("mulberry32", () => {
  it("is deterministic: the same seed gives the same three values", () => {
    expect(firstThree(1)).toEqual(firstThree(1));
  });

  it("yields the recorded stream for seed 1", () => {
    expect(firstThree(1)).toEqual([0.6270739405881613, 0.002735721180215478, 0.5274470399599522]);
  });

  it("yields values in [0, 1)", () => {
    const rand = mulberry32(7);
    for (let i = 0; i < 100; i++) {
      const v = rand();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it("gives different streams for different seeds", () => {
    expect(firstThree(1)).not.toEqual(firstThree(2));
  });
});
