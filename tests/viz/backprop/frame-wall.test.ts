import { describe, expect, it } from "vitest";
import { frameWall } from "../../../src/viz/backprop/frame-wall";

describe("frameWall", () => {
  it("targets the centre of the wall, (0, 0, 3)", () => {
    const { target } = frameWall();
    expect(target).toEqual([0, 0, 3]);
  });

  it("stands at target + 12 * (0.55, -1.05, 0.5)", () => {
    const { position } = frameWall();
    expect(position[0]).toBeCloseTo(6.6, 6);
    expect(position[1]).toBeCloseTo(-12.6, 6);
    expect(position[2]).toBeCloseTo(9, 6);
  });

  it("looks at the wall from the +x, -y, +z octant", () => {
    const { position, target } = frameWall();
    expect(position[0]).toBeGreaterThan(0);
    expect(position[1]).toBeLessThan(0);
    expect(position[2]).toBeGreaterThan(target[2]);
  });
});
