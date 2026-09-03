import { describe, expect, it } from "vitest";
import { frameCorner } from "../../../src/viz/chain-rule/frame-corner";

describe("frameCorner", () => {
  it("targets the centre of the front wall, (0, 3, 3)", () => {
    const { target } = frameCorner();
    expect(target).toEqual([0, 3, 3]);
  });

  it("stands at target + 6.5 * (1.35, -1.6, 0.9)", () => {
    const { position } = frameCorner();
    expect(position[0]).toBeCloseTo(8.775, 6);
    expect(position[1]).toBeCloseTo(-7.4, 6);
    expect(position[2]).toBeCloseTo(8.85, 6);
  });

  it("looks in from the +x, -y, +z octant", () => {
    const { position, target } = frameCorner();
    expect(position[0]).toBeGreaterThan(0);
    expect(position[1]).toBeLessThan(0);
    expect(position[2]).toBeGreaterThan(target[2]);
  });
});
