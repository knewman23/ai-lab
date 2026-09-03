import type { Composition } from "../../core/math/compositions";
import { FACE } from "../../core/math/compositions";
import type { Vec2 } from "../../core/math/numeric";
import { type Face, FACES, type Segment, type Vec3 } from "../shared/layer";
import { LIFT_FLOOR, LIFT_FRONT, LIFT_SIDE, faceToWorld } from "../shared/lift";
import { faceLine, push } from "./links-lines";
import type { Derived } from "./state";

export { extendAndClip } from "./links-lines";

/** The three marked points, one per face, as lifted world coordinates. */
export interface FacePoints {
  readonly p: Vec3;
  readonly q: Vec3;
  readonly r: Vec3;
}

/** Everything `links.ts` draws, grouped by layer. */
export interface LinkSegments {
  readonly connectors: Segment[];
  /** The connectors of P′, Q′, R′; empty when there is no Δx step. */
  readonly primed: Segment[];
  readonly legs: Segment[];
  readonly secants: Segment[];
  readonly tangents: Segment[];
}

/** Centred face-local (a, b) of the front wall point (x, u): a = x, b = su·u. */
function front(c: Composition, x: number, u: number): Vec2 {
  return [x, c.su * u];
}
/** Centred face-local (a, b) of the side wall point (u, y): a = sy·y in depth, b = su·u in height. */
function side(c: Composition, u: number, y: number): Vec2 {
  return [c.sy * y, c.su * u];
}
/** Centred face-local (a, b) of the floor point (x, y): a = x, b = sy·y. */
function floor(c: Composition, x: number, y: number): Vec2 {
  return [x, c.sy * y];
}

/** Face-local (a, b) lifted onto its face in the world. */
function lift(face: Face, ab: Vec2): Vec3 {
  return faceToWorld(face, ab[0], ab[1]);
}

/** P, Q, R for (x, u, y), each lifted off its face. */
function points(c: Composition, x: number, u: number, y: number): FacePoints {
  return {
    p: lift(FACES.front, front(c, x, u)),
    q: lift(FACES.side, side(c, u, y)),
    r: lift(FACES.floor, floor(c, x, y)),
  };
}

/**
 * P = (x, g(x)) on the front wall, Q = (u, f(u)) on the side wall and
 * R = (x, f(g(x))) on the floor, plus the same three at x + Δx when a step
 * exists. Placed with `faceToWorld`, so they sit exactly on the curves.
 */
export function facePoints(
  c: Composition,
  x: number,
  d: Derived,
): FacePoints & { readonly primed: FacePoints | null } {
  const primed =
    d.dxEff === null || d.deltas === null
      ? null
      : points(c, x + d.dxEff, d.u + d.deltas.du, d.y + d.deltas.dy);
  return { ...points(c, x, d.u, d.y), primed };
}

/**
 * The six connectors of one triple: P along −x to the wall corner at its
 * height, then along +y on the side wall to Q; Q straight down the side wall
 * to the floor, then along +x to R; P straight down the front wall to the
 * floor, then along +y to R. Points on two faces carry both lifts.
 */
function connectorsOf({ p, q, r }: FacePoints): Segment[] {
  const corner: Vec3 = [-FACE / 2 + LIFT_SIDE[0], LIFT_FRONT[1], p[2]];
  const sideFoot: Vec3 = [q[0], q[1], LIFT_FLOOR[2]];
  const frontFoot: Vec3 = [p[0], LIFT_FRONT[1], LIFT_FLOOR[2]];
  return [
    [p, corner],
    [corner, q],
    [q, sideFoot],
    [sideFoot, r],
    [p, frontFoot],
    [frontFoot, r],
  ];
}

/**
 * Connectors, primed connectors, Δ-triangle legs, secants and tangents for
 * one state. Legs run horizontal-then-vertical on the front wall and floor
 * and vertical-then-depth on the side wall, so the Δu leg is shared between
 * the walls and the Δy leg between the side wall and the floor. Secants and
 * tangents are extended and clipped to their face; the side-wall secant needs
 * Δu ≠ 0 and the side-wall tangent a finite `sideSlope`.
 */
export function linkSegments(c: Composition, x: number, d: Derived): LinkSegments {
  const { u, y } = d;
  const pts = facePoints(c, x, d);
  const tangents: Segment[] = [];
  push(tangents, faceLine(FACES.front, front(c, x, u), [1, c.su * d.dg]));
  if (d.sideSlope !== null) {
    push(tangents, faceLine(FACES.side, side(c, u, y), [d.sideSlope, 1]));
  }
  push(tangents, faceLine(FACES.floor, floor(c, x, y), [1, c.sy * d.dydx]));

  const out: LinkSegments = {
    connectors: connectorsOf(pts),
    primed: [],
    legs: [],
    secants: [],
    tangents,
  };
  if (pts.primed === null || d.dxEff === null || d.deltas === null) return out;

  const { du, dy, dyDu } = d.deltas;
  const x1 = x + d.dxEff;
  const u1 = u + du;
  out.primed.push(...connectorsOf(pts.primed));

  const { p, q, r } = pts;
  const p1 = pts.primed.p;
  const q1 = pts.primed.q;
  const r1 = pts.primed.r;
  const frontCorner = lift(FACES.front, front(c, x1, u));
  const sideCorner = lift(FACES.side, side(c, u1, y));
  const floorCorner = lift(FACES.floor, floor(c, x1, y));
  out.legs.push(
    [p, frontCorner],
    [frontCorner, p1],
    [q, sideCorner],
    [sideCorner, q1],
    [r, floorCorner],
    [floorCorner, r1],
  );

  push(out.secants, faceLine(FACES.front, front(c, x, u), [d.dxEff, c.su * du]));
  if (dyDu !== null) {
    push(out.secants, faceLine(FACES.side, side(c, u, y), [c.sy * dy, c.su * du]));
  }
  push(out.secants, faceLine(FACES.floor, floor(c, x, y), [d.dxEff, c.sy * dy]));
  return out;
}
