import { describe, expect, it } from "vitest";
import { COMPOSITIONS } from "../../../src/core/math/compositions";
import {
  BOUND,
  floorLocal,
  frontLocal,
  HALF,
  sideLocal,
} from "../../../src/viz/chain-rule/display";

const c = COMPOSITIONS.sin3x; // su = 1/3, sy = 2.5

describe("display", () => {
  it("HALF and BOUND describe a 6-unit face", () => {
    expect(HALF).toBe(3);
    expect(BOUND).toEqual([3, 3]);
  });

  it("frontLocal is (x, su * u)", () => {
    const [a, b] = frontLocal(c, 0.4, 1.2);
    expect(a).toBe(0.4);
    expect(b).toBeCloseTo(0.4, 12);
  });

  it("sideLocal is (sy * y, su * u)", () => {
    const [a, b] = sideLocal(c, 1.2, 0.5);
    expect(a).toBeCloseTo(1.25, 12);
    expect(b).toBeCloseTo(0.4, 12);
  });

  it("floorLocal is (x, sy * y)", () => {
    const [a, b] = floorLocal(c, 0.4, 0.5);
    expect(a).toBe(0.4);
    expect(b).toBeCloseTo(1.25, 12);
  });
});
