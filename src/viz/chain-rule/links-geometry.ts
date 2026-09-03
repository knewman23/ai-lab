import type { Composition } from "../../core/math/compositions";
import { extendAndClip } from "../../core/math/matrix2";
import type { Vec2 } from "../../core/math/numeric";
import { type Face, FACES, type Segment, type Vec3 } from "../shared/layer";
import { faceToWorld } from "../shared/lift";
import { BOUND, floorLocal, frontLocal, sideLocal } from "./display";
import type { Derived } from "./state";

/** P on the front wall, Q on the side wall and R on the floor, as lifted world coordinates. */
export interface MarkedPoints {
  readonly p: Vec3;
  readonly q: Vec3;
  readonly r: Vec3;
}

/** P, Q, R plus the same three at x + Δx; `primed` is null when there is no Δx step. */
export interface FacePoints extends MarkedPoints {
  readonly primed: MarkedPoints | null;
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

/** One Δx step, with the values at x + Δx; present only when the step exists. */
interface Step {
  readonly dx: number;
  readonly x1: number;
  readonly u1: number;
  readonly y1: number;
  readonly du: number;
  readonly dy: number;
  readonly dyDu: number | null;
}

/** Face-local (a, b) lifted onto its face in the world. */
function lift(face: Face, ab: Vec2): Vec3 {
  return faceToWorld(face, ab[0], ab[1]);
}

/** P, Q, R for (x, u, y), each lifted off its face. */
function points(c: Composition, x: number, u: number, y: number): MarkedPoints {
  return {
    p: lift(FACES.front, frontLocal(c, x, u)),
    q: lift(FACES.side, sideLocal(c, u, y)),
    r: lift(FACES.floor, floorLocal(c, x, y)),
  };
}

/** The Δx step of a derived state, or null at the domain's right edge. */
function stepOf(x: number, d: Derived): Step | null {
  if (d.dxEff === null || d.deltas === null) return null;
  const { du, dy, dyDu } = d.deltas;
  return { dx: d.dxEff, x1: x + d.dxEff, u1: d.u + du, y1: d.y + dy, du, dy, dyDu };
}

/**
 * P = (x, g(x)) on the front wall, Q = (u, f(u)) on the side wall and
 * R = (x, f(g(x))) on the floor, plus the same three at x + Δx when a step
 * exists. Placed with `faceToWorld`, so they sit exactly on the curves.
 */
export function facePoints(c: Composition, x: number, d: Derived): FacePoints {
  const step = stepOf(x, d);
  const primed = step === null ? null : points(c, step.x1, step.u1, step.y1);
  return { ...points(c, x, d.u, d.y), primed };
}

/**
 * The six connectors of one triple: P along −x to the wall corner at its
 * height, then along +y on the side wall to Q; Q straight down the side wall
 * to the floor, then along +x to R; P straight down the front wall to the
 * floor, then along +y to R. Points on two faces carry both lifts.
 */
function connectorsOf({ p, q, r }: MarkedPoints): Segment[] {
  const wallX = FACES.side.offset + FACES.side.lift;
  const wallY = FACES.front.offset + FACES.front.lift;
  const floorZ = FACES.floor.offset + FACES.floor.lift;
  const corner: Vec3 = [wallX, wallY, p[2]];
  const sideFoot: Vec3 = [q[0], q[1], floorZ];
  const frontFoot: Vec3 = [p[0], wallY, floorZ];
  return [
    [p, corner],
    [corner, q],
    [q, sideFoot],
    [sideFoot, r],
    [p, frontFoot],
    [frontFoot, r],
  ];
}

/** The clipped line through face-local `at` along `dir`, lifted onto `face`; null when there is none. */
function faceLine(face: Face, at: Vec2, dir: Vec2): Segment | null {
  const clipped = extendAndClip(at[0], at[1], dir[0], dir[1], BOUND);
  return clipped === null ? null : [lift(face, clipped[0]), lift(face, clipped[1])];
}

/** Appends `line` to `out` when it exists. */
function push(out: Segment[], line: Segment | null): void {
  if (line !== null) out.push(line);
}

/** The two legs per face of the Δ triangles: P → (x + Δx, u) → P′, Q → (u + Δu, y) → Q′, R → (x + Δx, y) → R′. */
function legsOf(
  c: Composition,
  d: Derived,
  s: Step,
  pts: MarkedPoints,
  primed: MarkedPoints,
): Segment[] {
  const frontCorner = lift(FACES.front, frontLocal(c, s.x1, d.u));
  const sideCorner = lift(FACES.side, sideLocal(c, s.u1, d.y));
  const floorCorner = lift(FACES.floor, floorLocal(c, s.x1, d.y));
  return [
    [pts.p, frontCorner],
    [frontCorner, primed.p],
    [pts.q, sideCorner],
    [sideCorner, primed.q],
    [pts.r, floorCorner],
    [floorCorner, primed.r],
  ];
}

/**
 * Connectors, primed connectors, Δ-triangle legs, secants and tangents for
 * one state. Legs run horizontal-then-vertical on the front wall and floor
 * and vertical-then-depth on the side wall, so the Δu leg is shared between
 * the walls and the Δy leg between the side wall and the floor. Secants and
 * tangents are extended and clipped to their face; the side-wall secant needs
 * Δu ≠ 0 and the side-wall tangent a finite `sideSlope`. Pass `pts` when
 * `facePoints` has already been computed for this state, so the drawn spheres
 * and the lines that meet them come from the same numbers.
 */
export function linkSegments(
  c: Composition,
  x: number,
  d: Derived,
  pts: FacePoints = facePoints(c, x, d),
): LinkSegments {
  const { u, y } = d;
  const step = stepOf(x, d);
  const atP = frontLocal(c, x, u);
  const atQ = sideLocal(c, u, y);
  const atR = floorLocal(c, x, y);

  const tangents: Segment[] = [];
  push(tangents, faceLine(FACES.front, atP, [1, c.su * d.dg]));
  if (d.sideSlope !== null) push(tangents, faceLine(FACES.side, atQ, [d.sideSlope, 1]));
  push(tangents, faceLine(FACES.floor, atR, [1, c.sy * d.dydx]));

  const out: LinkSegments = {
    connectors: connectorsOf(pts),
    primed: [],
    legs: [],
    secants: [],
    tangents,
  };
  if (step === null || pts.primed === null) return out;

  out.primed.push(...connectorsOf(pts.primed));
  out.legs.push(...legsOf(c, d, step, pts, pts.primed));
  push(out.secants, faceLine(FACES.front, atP, [step.dx, c.su * step.du]));
  if (step.dyDu !== null)
    push(out.secants, faceLine(FACES.side, atQ, [c.sy * step.dy, c.su * step.du]));
  push(out.secants, faceLine(FACES.floor, atR, [step.dx, c.sy * step.dy]));
  return out;
}
