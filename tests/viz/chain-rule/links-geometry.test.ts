import { describe, expect, it } from "vitest";
import { COMPOSITIONS } from "../../../src/core/math/compositions";
import { facePoints, linkSegments } from "../../../src/viz/chain-rule/links-geometry";
import { derived, initialState, setComp, setDx, setX } from "../../../src/viz/chain-rule/state";
import type { Segment, Vec3 } from "../../../src/viz/shared/layer";

const LIFT = 0.01;

function near(v: Vec3, expected: readonly [number, number, number], digits = 9): void {
  expect(v[0]).toBeCloseTo(expected[0], digits);
  expect(v[1]).toBeCloseTo(expected[1], digits);
  expect(v[2]).toBeCloseTo(expected[2], digits);
}

/** The sin 3x preset at x = 0.4, Δx = 0.5: the scene's initial state. */
function sin3x() {
  const s = initialState();
  return { c: COMPOSITIONS.sin3x, x: s.x, d: derived(s) };
}

/** True when `v` lies on the named face's box (the free axes within the 6x6 square, the fixed axis at its lift). */
function onFace(v: Vec3, face: "front" | "side" | "floor"): boolean {
  const inRange = (t: number, lo: number, hi: number) => t >= lo - 1e-9 && t <= hi + 1e-9;
  switch (face) {
    case "front":
      return Math.abs(v[1] - LIFT) < 1e-9 && inRange(v[0], -3, 3) && inRange(v[2], 0, 6);
    case "side":
      return Math.abs(v[0] - (-3 + LIFT)) < 1e-9 && inRange(v[1], 0, 6) && inRange(v[2], 0, 6);
    case "floor":
      return Math.abs(v[2] - LIFT) < 1e-9 && inRange(v[0], -3, 3) && inRange(v[1], 0, 6);
  }
}

describe("facePoints", () => {
  it("lifts P, Q and R off their faces for sin 3x at x = 0.4", () => {
    const { c, x, d } = sin3x();
    const pts = facePoints(c, x, d);
    const u = 1.2;
    const y = Math.sin(u);
    near(pts.p, [0.4, LIFT, 3 + u / 3]);
    near(pts.q, [-3 + LIFT, 3 + 2.5 * y, 3 + u / 3]);
    near(pts.r, [0.4, 3 + 2.5 * y, LIFT]);
    expect(pts.primed).not.toBeNull();
    const u1 = 3 * 0.9;
    near(pts.primed!.p, [0.9, LIFT, 3 + u1 / 3]);
    near(pts.primed!.q, [-3 + LIFT, 3 + 2.5 * Math.sin(u1), 3 + u1 / 3]);
    near(pts.primed!.r, [0.9, 3 + 2.5 * Math.sin(u1), LIFT]);
  });

  it("has no primed points at the right edge of the domain", () => {
    const s = setX(initialState(), 3);
    const pts = facePoints(COMPOSITIONS.sin3x, s.x, derived(s));
    expect(pts.primed).toBeNull();
  });
});

describe("linkSegments connectors", () => {
  it("runs P around the walls to Q and down to R, and P down to R, closing on the floor", () => {
    const { c, x, d } = sin3x();
    const { p, q, r } = facePoints(c, x, d);
    const { connectors, primed } = linkSegments(c, x, d);
    expect(connectors).toHaveLength(6);
    const [toCorner, toQ, downSide, toR, downFront, floorToR] = connectors as [
      Segment,
      Segment,
      Segment,
      Segment,
      Segment,
      Segment,
    ];
    // P -> the wall corner at P's height, along -x on the front wall.
    near(toCorner[0], p);
    near(toCorner[1], [-3 + LIFT, LIFT, p[2]]);
    // Corner -> Q along +y on the side wall.
    near(toQ[1], q);
    // Q -> its foot on the floor, straight down the side wall.
    near(downSide[0], q);
    near(downSide[1], [q[0], q[1], LIFT]);
    // Foot -> R along +x on the floor.
    near(toR[1], r);
    // P -> its foot on the floor, straight down the front wall.
    near(downFront[0], p);
    near(downFront[1], [p[0], LIFT, LIFT]);
    // Foot -> R along +y on the floor.
    near(floorToR[1], r);
    // The two wall verticals share heights.
    expect(downSide[0][2]).toBeCloseTo(downFront[0][2], 12);
    expect(downSide[1][2]).toBeCloseTo(downFront[1][2], 12);

    // Six primed connectors, the same shape for P', Q', R'.
    const pr = facePoints(c, x, d).primed!;
    expect(primed).toHaveLength(6);
    near(primed[0]![0], pr.p);
    near(primed[1]![1], pr.q);
    near(primed[3]![1], pr.r);
    near(primed[5]![1], pr.r);
  });

  it("keeps every connector endpoint on a face", () => {
    const { c, x, d } = sin3x();
    const { connectors } = linkSegments(c, x, d);
    for (const [a, b] of connectors) {
      for (const v of [a, b]) {
        expect(onFace(v, "front") || onFace(v, "side") || onFace(v, "floor")).toBe(true);
      }
    }
  });
});

describe("linkSegments legs and secants", () => {
  it("draws two legs per face with the shared Δu and Δy legs coinciding", () => {
    const { c, x, d } = sin3x();
    const { p, q, r, primed } = facePoints(c, x, d);
    const { legs, secants } = linkSegments(c, x, d);
    expect(legs).toHaveLength(6);
    const [fh, fv, sv, sd, lx, ly] = legs as [Segment, Segment, Segment, Segment, Segment, Segment];
    // Front wall: P -> (x + Δx, u) -> P'.
    near(fh[0], p);
    near(fh[1], [primed!.p[0], LIFT, p[2]]);
    near(fv[1], primed!.p);
    // Side wall: Q -> (u + Δu, y) vertically -> Q' in depth.
    near(sv[0], q);
    near(sv[1], [q[0], q[1], primed!.q[2]]);
    near(sd[1], primed!.q);
    // Floor: R -> (x + Δx, y) -> R'.
    near(lx[0], r);
    near(lx[1], [primed!.r[0], r[1], LIFT]);
    near(ly[1], primed!.r);
    // The front-wall vertical leg and the side-wall vertical leg span the same heights (Δu).
    expect(fv[0][2]).toBeCloseTo(sv[0][2], 12);
    expect(fv[1][2]).toBeCloseTo(sv[1][2], 12);
    // The side-wall depth leg and the floor depth leg span the same depths (Δy).
    expect(sd[0][1]).toBeCloseTo(ly[0][1], 12);
    expect(sd[1][1]).toBeCloseTo(ly[1][1], 12);

    expect(secants).toHaveLength(3);
    const [front, side, floor] = secants as [Segment, Segment, Segment];
    for (const v of front) expect(onFace(v, "front")).toBe(true);
    for (const v of side) expect(onFace(v, "side")).toBe(true);
    for (const v of floor) expect(onFace(v, "floor")).toBe(true);
    // The front secant is the line through P and P': same slope in (X, Z).
    const slope = (primed!.p[2] - p[2]) / (primed!.p[0] - p[0]);
    expect((front[1][2] - front[0][2]) / (front[1][0] - front[0][0])).toBeCloseTo(slope, 9);
    expect(front[0][2] + slope * (p[0] - front[0][0])).toBeCloseTo(p[2], 9);
    // Clipped to the wall: at least one endpoint sits on the box edge.
    const onEdge = (v: Vec3) =>
      Math.abs(Math.abs(v[0]) - 3) < 1e-9 || Math.abs(v[2]) < 1e-9 || Math.abs(v[2] - 6) < 1e-9;
    expect(onEdge(front[0]) && onEdge(front[1])).toBe(true);
  });

  it("omits the side-wall secant when Δu vanishes, keeping its legs", () => {
    const s = setDx(setX(setComp(initialState(), "sincube"), Math.PI / 2 - 0.25), 0.5);
    const d = derived(s);
    expect(Math.abs(d.deltas!.du)).toBeLessThan(1e-9);
    expect(d.deltas!.dyDu).toBeNull();
    const { legs, secants } = linkSegments(COMPOSITIONS.sincube, s.x, d);
    expect(legs).toHaveLength(6);
    expect(secants).toHaveLength(2);
    for (const v of secants[0]!) expect(onFace(v, "front")).toBe(true);
    for (const v of secants[1]!) expect(onFace(v, "floor")).toBe(true);
  });

  it("has no primed connectors, legs or secants at the right edge, but keeps connectors and tangents", () => {
    const s = setX(initialState(), 3);
    const out = linkSegments(COMPOSITIONS.sin3x, s.x, derived(s));
    expect(out.primed).toHaveLength(0);
    expect(out.legs).toHaveLength(0);
    expect(out.secants).toHaveLength(0);
    expect(out.connectors).toHaveLength(6);
    expect(out.tangents).toHaveLength(3);
  });
});

describe("linkSegments tangents", () => {
  it("passes the front tangent through P with slope su * g'(x), and clips all three to their faces", () => {
    const { c, x, d } = sin3x();
    const { p, q, r } = facePoints(c, x, d);
    const { tangents } = linkSegments(c, x, d);
    expect(tangents).toHaveLength(3);
    const [front, side, floor] = tangents as [Segment, Segment, Segment];
    const slope = (front[1][2] - front[0][2]) / (front[1][0] - front[0][0]);
    expect(slope).toBeCloseTo(c.su * d.dg, 9);
    expect(front[0][2] + slope * (p[0] - front[0][0])).toBeCloseTo(p[2], 9);
    for (const v of front) expect(onFace(v, "front")).toBe(true);
    // Side wall: Y = Y_Q + sideSlope * (Z - Z_Q).
    const ds = (side[1][1] - side[0][1]) / (side[1][2] - side[0][2]);
    expect(ds).toBeCloseTo(d.sideSlope!, 9);
    expect(side[0][1] + ds * (q[2] - side[0][2])).toBeCloseTo(q[1], 9);
    for (const v of side) expect(onFace(v, "side")).toBe(true);
    // Floor: Y = Y_R + sy * dydx * (X - X_R).
    const df = (floor[1][1] - floor[0][1]) / (floor[1][0] - floor[0][0]);
    expect(df).toBeCloseTo(c.sy * d.dydx, 9);
    expect(floor[0][1] + df * (r[0] - floor[0][0])).toBeCloseTo(r[1], 9);
    for (const v of floor) expect(onFace(v, "floor")).toBe(true);
  });

  it("omits the side-wall tangent when sideSlope is null", () => {
    const { c, x, d } = sin3x();
    const { tangents } = linkSegments(c, x, { ...d, sideSlope: null });
    expect(tangents).toHaveLength(2);
    for (const v of tangents[0]!) expect(onFace(v, "front")).toBe(true);
    for (const v of tangents[1]!) expect(onFace(v, "floor")).toBe(true);
  });
});
