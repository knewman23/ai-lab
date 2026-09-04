import { describe, expect, it } from "vitest";
import { frameGpt } from "../../../src/viz/gpt/frame-gpt";
import { FLOOR_Y, WALL_H, WALL_W } from "../../../src/viz/gpt/layout";

describe("frameGpt", () => {
  it("targets a point between the wall's centre and the floor's near edge", () => {
    const { target } = frameGpt();
    expect(target[0]).toBe(0);
    expect(target[1]).toBeGreaterThan(FLOOR_Y[0]);
    expect(target[1]).toBeLessThan(0);
    expect(target[2]).toBeGreaterThan(0);
    expect(target[2]).toBeLessThan(WALL_H / 2);
  });

  it("stands in the -y, +z octant, slightly off-axis in x", () => {
    const { position, target } = frameGpt();
    expect(position[1]).toBeLessThan(target[1]);
    expect(position[2]).toBeGreaterThan(target[2]);
    expect(position[0]).not.toBe(0);
    // Near-frontal: further out in -y than it is off to the side, so the wall stays legible.
    expect(Math.abs(position[0] - target[0])).toBeLessThan(Math.abs(position[1] - target[1]) / 2);
  });

  it("stands back beyond the floor's near edge, far enough for both surfaces to fit", () => {
    const { position, target } = frameGpt();
    // Behind the whole floor, so nothing the scene draws is between the camera and the target.
    expect(position[1]).toBeLessThan(FLOOR_Y[0]);
    const distance = Math.hypot(
      position[0] - target[0],
      position[1] - target[1],
      position[2] - target[2],
    );
    expect(distance).toBeGreaterThan(Math.max(WALL_W, WALL_H, FLOOR_Y[1] - FLOOR_Y[0]));
  });
});
