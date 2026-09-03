import { describe, expect, it } from "vitest";
import { axisSegments, outlineSegments, TICK } from "../../../src/viz/chain-rule/faces-geometry";
import { FACES } from "../../../src/viz/shared/layer";

const LIFT = FACES.front.lift;

describe("outlineSegments", () => {
  it("draws the nine edges on the three faces", () => {
    expect(outlineSegments()).toHaveLength(9);
  });

  it("lifts an edge shared by two faces along both interior normals", () => {
    const [bottomFront] = outlineSegments();
    // The edge y = 0, z = 0 lies on the front wall (+y) and the floor (+z).
    expect(bottomFront![0]).toEqual([-3, LIFT, LIFT]);
    expect(bottomFront![1]).toEqual([3, LIFT, LIFT]);
  });

  it("lifts a single-face edge off that face only", () => {
    const top = outlineSegments()[3]!;
    expect(top[0]).toEqual([-3, LIFT, 6]);
    expect(top[1]).toEqual([3, LIFT, 6]);
  });
});

describe("axisSegments", () => {
  it("draws four axes and six ticks on each of the two x axes", () => {
    expect(axisSegments()).toHaveLength(4 + 12);
  });

  it("keeps ticks off the origin and lifts front ticks by +y, floor ticks by +z", () => {
    const ticks = axisSegments().slice(4);
    const xs = ticks.map(([a]) => a[0]);
    expect(xs).not.toContain(0);
    const frontTick = ticks.find(([a]) => a[0] === 1 && a[1] === LIFT)!;
    expect(frontTick[0][2]).toBeCloseTo(3 - TICK);
    expect(frontTick[1][2]).toBeCloseTo(3 + TICK);
    const floorTick = ticks.find(([a]) => a[0] === 1 && a[2] === LIFT)!;
    expect(floorTick[0][1]).toBeCloseTo(3 - TICK);
    expect(floorTick[1][1]).toBeCloseTo(3 + TICK);
  });
});
