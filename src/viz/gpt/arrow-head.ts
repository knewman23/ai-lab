/**
 * One arrow, drawn in whichever plane the caller works in. The scene draws arrows twice — the
 * column glyphs stand in the wall's (x, z), the residual path lies in the floor's (x, y) — and
 * the trig is the same both times, so it lives here once rather than in two copies under the
 * same export name. Pure: nothing here imports Three.js beyond the layer module's point types.
 */

import type { Segment, Vec3 } from "../shared/layer";

/** Which component of a `Vec3` an axis is. */
export type Axis = 0 | 1 | 2;

/** The two axes an arrow moves in; the third is held at the value `to` carries. */
export type ArrowAxes = readonly [Axis, Axis];

/** The wall's plane, where a token's 2-vector stands up as (x, z), and the floor's (x, y). */
export const WALL_AXES: ArrowAxes = [0, 2];
export const FLOOR_AXES: ArrowAxes = [0, 1];

/**
 * How an arrow's head is drawn. A `closed` head is a filled-looking triangle — its two barbs
 * joined at the base — and marks one of the three stream states; an `open` head is the two barbs
 * alone and marks a delta, what a stage *adds*. The two never look alike, which is the
 * distinction §1's "watch the vector get edited as it climbs" rests on.
 */
export type ArrowHead = "closed" | "open";

/** Barb length as a fraction of the shaft, and how far the barbs sweep off it. */
const HEAD_FRACTION = 0.32;
const HEAD_ANGLE = 0.42;

export interface ArrowOptions {
  readonly axes: ArrowAxes;
  readonly head: ArrowHead;
  /**
   * Longest a barb may grow, whatever the shaft. The column glyphs are already capped at
   * `GLYPH_MAX` and pass `Infinity`; the residual path is drawn at true length and caps here, or
   * a long step would grow a head the size of the step it is measuring.
   */
  readonly maxBarb: number;
}

/** Segments one arrow needs at most: shaft, two barbs, and the base a closed head adds. */
export const ARROW_SEGMENTS = 4;
/** Endpoints one arrow needs at most, for the layers that preallocate for it. */
export const ARROW_ENDPOINTS = ARROW_SEGMENTS * 2;

/**
 * The arrow from `from` to `to`, shaft first so a reader of the buffer can take segment 0 as the
 * arrow's whole reach. A zero-length arrow draws nothing rather than a degenerate spike, which
 * also catches a non-finite endpoint: that must never reach a buffer, where it would poison the
 * layer's bounding sphere and take the whole scene off screen.
 */
export function arrowSegments(from: Vec3, to: Vec3, opts: ArrowOptions): Segment[] {
  const [a, b] = opts.axes;
  const d0 = to[a] - from[a];
  const d1 = to[b] - from[b];
  const length = Math.hypot(d0, d1);
  if (!(length > 0)) return [];

  const u0 = d0 / length;
  const u1 = d1 / length;
  const barb = Math.min(opts.maxBarb, HEAD_FRACTION * length);
  const ends: Vec3[] = [];
  for (const sign of [1, -1]) {
    const c = Math.cos(sign * HEAD_ANGLE);
    const s = Math.sin(sign * HEAD_ANGLE);
    // The shaft direction reversed, then rotated off the shaft by the head angle. Always the
    // same turn for the same sign, so the two barbs never swap sides as the arrow turns.
    const end: [number, number, number] = [to[0], to[1], to[2]];
    end[a] = to[a] + barb * (-u0 * c + u1 * s);
    end[b] = to[b] + barb * (-u0 * s - u1 * c);
    ends.push(end);
  }

  const [first, second] = ends;
  if (first === undefined || second === undefined) {
    throw new Error("gpt arrow: a head needs both of its barbs");
  }
  const segments: Segment[] = [
    [from, to],
    [to, first],
    [to, second],
  ];
  if (opts.head === "closed") segments.push([first, second]);
  return segments;
}
