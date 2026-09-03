import { FACE } from "../../core/math/compositions";
import { clipSegment } from "../../core/math/matrix2";
import type { Vec2 } from "../../core/math/numeric";
import type { Face, Segment } from "../shared/layer";
import { faceToWorld } from "../shared/lift";

/** Half-extents of every face box, in centred face-local coordinates. */
const BOUND: readonly [number, number] = [FACE / 2, FACE / 2];
/** Far enough along a unit direction to leave the face box from any interior point. */
const FAR = 20;
/** Below this a direction has no length. */
const EPS = 1e-12;

/**
 * The line through (a0, b0) with direction (da, db), extended and clipped to
 * the centred box with half-extents `bound`. Null when the direction is
 * degenerate or not finite, or the line misses the box.
 */
export function extendAndClip(
  a0: number,
  b0: number,
  da: number,
  db: number,
  bound: readonly [number, number],
): readonly [Vec2, Vec2] | null {
  const len = Math.hypot(da, db);
  if (!Number.isFinite(len) || len < EPS || !Number.isFinite(a0) || !Number.isFinite(b0)) {
    return null;
  }
  const ua = (FAR * da) / len;
  const ub = (FAR * db) / len;
  return clipSegment([a0 - ua, b0 - ub], [a0 + ua, b0 + ub], bound);
}

/** The clipped line through face-local `at` along `dir`, lifted onto `face`; null when there is none. */
export function faceLine(face: Face, at: Vec2, dir: Vec2): Segment | null {
  const clipped = extendAndClip(at[0], at[1], dir[0], dir[1], BOUND);
  return clipped === null
    ? null
    : [
        faceToWorld(face, clipped[0][0], clipped[0][1]),
        faceToWorld(face, clipped[1][0], clipped[1][1]),
      ];
}

/** Appends `line` to `out` when it exists. */
export function push(out: Segment[], line: Segment | null): void {
  if (line !== null) out.push(line);
}
