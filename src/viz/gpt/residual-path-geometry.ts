/**
 * The shape of the selected token's journey across the floor: embedding → x → xResid → xFinal,
 * as three chained arrows with a ring on the end. Pure — nothing here imports Three.js beyond
 * the layer module's plain point and segment types, so the one thing this module must never do
 * — normalise the two deltas against each other — can be asserted directly.
 */

import type { Vec2 } from "../../core/math/numeric";
import type { Forward } from "../../core/math/transformer";
import type { Segment, Vec3 } from "../shared/layer";
import { floorFromEmbed } from "./layout";

/** The three steps, in the order they are chained. */
export type StepKey = "position" | "attention" | "mlp";

export const STEPS = ["position", "attention", "mlp"] as const satisfies readonly StepKey[];

/** The short label each step carries, in `STEPS` order; §5.7's wording. */
export const STEP_LABELS = ["+ position", "+ attention", "+ MLP"] as const;

/** Lift toward +z, the camera side of the floor, so the plane does not z-fight the path. */
export const PATH_LIFT = 0.01;

/**
 * Arrowhead barbs: a fraction of the shaft, but never longer than `HEAD_MAX`. Unlike the wall
 * glyphs, these arrows are drawn at true length and a long one would otherwise grow a head the
 * size of the step it is measuring.
 */
const HEAD_FRACTION = 0.32;
const HEAD_MAX = 0.18;
const HEAD_ANGLE = 0.42;

/** The ring that marks `xFinal`, and how many segments it is drawn in. */
export const RING_RADIUS = 0.14;
export const RING_SEGMENTS = 24;

/** Endpoints one step can need: shaft, two barbs, and the base joining them. */
export const STEP_ENDPOINTS = 8;
/** Endpoints the ring needs: a closed polyline of `RING_SEGMENTS` segments. */
export const RING_ENDPOINTS = RING_SEGMENTS * 2;

/** Reads one 2-vector out of a pass. Throws rather than defaulting: a short row is a bug. */
function vectorAt(rows: readonly Float64Array[], i: number, field: string): Vec2 {
  const row = rows[i];
  if (row === undefined) throw new Error(`gpt residual path: no ${field} at position ${i}`);
  const [a, b] = row;
  if (a === undefined || b === undefined) {
    throw new Error(`gpt residual path: ${field} at position ${i} is not a 2-vector`);
  }
  return [a, b];
}

/**
 * The four floor points the chain runs through: the token's embedding, then the stream after
 * position, after attention and after the MLP. The embedding is `x − pe`, so every number here
 * comes from the forward pass rather than from a second reading of the state.
 *
 * The points are the stages themselves, at the floor's own scale: nothing is normalised, so the
 * arrows between them come out at **true relative length**. The attention step is usually the
 * longer of the last two, but `|mlpOut| / |attnOut|` runs from 0.07 to 1.47 across the presets
 * and sentences, so on `scrambled` the MLP step legitimately exceeds it. That is data, not a
 * layout failure, and forcing a long-then-short pair here would be a lie about it.
 */
export function pathPoints(f: Forward, query: number): Vec3[] {
  const x = vectorAt(f.x, query, "x");
  const pe = vectorAt(f.pe, query, "pe");
  const stages: Vec2[] = [
    [x[0] - pe[0], x[1] - pe[1]],
    x,
    vectorAt(f.xResid, query, "xResid"),
    vectorAt(f.xFinal, query, "xFinal"),
  ];
  return stages.map((e) => {
    const [px, py] = floorFromEmbed(e);
    return [px, py, PATH_LIFT];
  });
}

/**
 * One arrow on the floor, shaft first so a reader of the buffer can take segment 0 as the step's
 * whole reach. A step of zero length draws nothing rather than a degenerate spike — which is
 * what the position step does whenever positional encoding is switched off.
 */
export function arrowSegments(from: Vec3, to: Vec3): Segment[] {
  const dx = to[0] - from[0];
  const dy = to[1] - from[1];
  const length = Math.hypot(dx, dy);
  // Also catches a NaN step, which must not reach the buffer: it would poison the layer's
  // bounding sphere and take the whole floor off screen.
  if (!(length > 0)) return [];

  const ux = dx / length;
  const uy = dy / length;
  const barb = Math.min(HEAD_MAX, HEAD_FRACTION * length);
  const ends: Vec3[] = [];
  for (const sign of [1, -1]) {
    const c = Math.cos(sign * HEAD_ANGLE);
    const s = Math.sin(sign * HEAD_ANGLE);
    // The shaft direction reversed, then rotated off the shaft by the head angle.
    ends.push([to[0] + barb * (-ux * c + uy * s), to[1] + barb * (-ux * s - uy * c), PATH_LIFT]);
  }
  const [first, second] = ends;
  if (first === undefined || second === undefined) {
    throw new Error("gpt residual path: an arrowhead needs both of its barbs");
  }
  return [
    [from, to],
    [to, first],
    [to, second],
    [first, second],
  ];
}

/** The hollow ring marking where the token ended up, as a closed polyline. */
export function ringSegments(at: Vec3): Segment[] {
  const point = (s: number): Vec3 => {
    const angle = (2 * Math.PI * s) / RING_SEGMENTS;
    return [
      at[0] + RING_RADIUS * Math.cos(angle),
      at[1] + RING_RADIUS * Math.sin(angle),
      PATH_LIFT,
    ];
  };
  const segments: Segment[] = [];
  for (let s = 0; s < RING_SEGMENTS; s++) segments.push([point(s), point(s + 1)]);
  return segments;
}

/** Everything the path draws: one arrow per step, in `STEPS` order, and the ring on the end. */
export interface PathDrawing {
  readonly arrows: readonly Segment[][];
  readonly ring: Segment[];
}

/** The whole chain from one pass, walked once. */
export function pathDrawing(f: Forward, query: number): PathDrawing {
  const points = pathPoints(f, query);
  const arrows = STEPS.map((_, s) => {
    const from = points[s];
    const to = points[s + 1];
    if (from === undefined || to === undefined) {
      throw new Error(`gpt residual path: the chain has no step ${s}`);
    }
    return arrowSegments(from, to);
  });
  const end = points[STEPS.length];
  if (end === undefined) throw new Error("gpt residual path: the chain has no end point");
  return { arrows, ring: ringSegments(end) };
}
