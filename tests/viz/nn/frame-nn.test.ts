import { describe, expect, it } from "vitest";
import { frameNn } from "../../../src/viz/nn/frame-nn";

describe("frameNn", () => {
  it("targets (0, -1.5, 2.5), between the floor and the centre of the wall", () => {
    const { target } = frameNn();
    expect(target).toEqual([0, -1.5, 2.5]);
  });

  it("stands at target + 12 * (0.8, -1.1, 0.7)", () => {
    const { position } = frameNn();
    expect(position[0]).toBeCloseTo(9.6, 6);
    expect(position[1]).toBeCloseTo(-14.7, 6);
    expect(position[2]).toBeCloseTo(10.9, 6);
  });

  it("looks at the wall from the +x, -y, +z octant", () => {
    const { position, target } = frameNn();
    expect(position[0]).toBeGreaterThan(0);
    expect(position[1]).toBeLessThan(target[1]);
    expect(position[2]).toBeGreaterThan(target[2]);
  });
});
