import { describe, expect, it } from "vitest";
import { axisSegments, outlineSegments, TICK } from "../../../src/viz/chain-rule/faces-geometry";
import { FACES, type Segment, type Vec3 } from "../../../src/viz/shared/layer";

const LIFT = FACES.front.lift;
const AXES = 3;

/** Splits a lifted endpoint into its on-face point and the lift applied to it. */
function unlift(p: Vec3): { point: Vec3; lift: Vec3 } {
  const lift = p.map((c) => (Math.abs(c - Math.round(c)) > 1e-9 ? c - Math.round(c) : 0)) as [
    number,
    number,
    number,
  ];
  return { point: [p[0] - lift[0], p[1] - lift[1], p[2] - lift[2]], lift };
}

/** The lift an edge on the box should carry: LIFT on each axis whose face it lies on. */
function expectedLift(a: Vec3, b: Vec3): Vec3 {
  return [
    a[0] === -3 && b[0] === -3 ? LIFT : 0,
    a[1] === 0 && b[1] === 0 ? LIFT : 0,
    a[2] === 0 && b[2] === 0 ? LIFT : 0,
  ];
}

describe("outlineSegments", () => {
  it("draws the nine edges on the three faces", () => {
    expect(outlineSegments()).toHaveLength(9);
  });

  it.each(outlineSegments().map((s, i): [number, Segment] => [i, s]))(
    "edge %i spans one full 6-unit box edge and is lifted off exactly the faces it lies on",
    (_i, [p, q]) => {
      const a = unlift(p);
      const b = unlift(q);
      const diffs = [0, 1, 2].filter((k) => a.point[k] !== b.point[k]);
      expect(diffs).toHaveLength(1);
      expect(Math.abs(a.point[diffs[0]!]! - b.point[diffs[0]!]!)).toBe(6);
      const want = expectedLift(a.point, b.point);
      expect(a.lift.map((c) => +c.toFixed(9))).toEqual(want);
      expect(b.lift.map((c) => +c.toFixed(9))).toEqual(want);
    },
  );
});

describe("axisSegments", () => {
  it("draws three axes and six ticks on each of the two x axes", () => {
    expect(axisSegments()).toHaveLength(AXES + 12);
  });

  it("places the three axes on their faces, lifted once each", () => {
    const [frontX, sideY, floorX] = axisSegments();
    expect(frontX).toEqual([
      [-3, LIFT, 3],
      [3, LIFT, 3],
    ]);
    expect(sideY).toEqual([
      [-3 + LIFT, 0, 3],
      [-3 + LIFT, 6, 3],
    ]);
    expect(floorX).toEqual([
      [-3, 3, LIFT],
      [3, 3, LIFT],
    ]);
  });

  it("keeps ticks off the origin and lifts front ticks by +y, floor ticks by +z", () => {
    const ticks = axisSegments().slice(AXES);
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
