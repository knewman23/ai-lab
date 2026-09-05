/**
 * The shape of the selected token's journey across the floor: embedding → x → xResid → xFinal,
 * as three chained arrows with a ring on the end. Pure — nothing here imports Three.js beyond
 * the layer module's plain point and segment types, so the one thing this module must never do
 * — normalise the two deltas against each other — can be asserted directly.
 */

import type { Vec2 } from "../../core/math/numeric";
import type { Forward } from "../../core/math/transformer";
import type { Segment, Vec3 } from "../shared/layer";
import { ARROW_ENDPOINTS, arrowSegments, FLOOR_AXES } from "./arrow-head";
import { floorFromEmbed } from "./layout";
import { vec2At } from "./pass-read";

/** The three steps, in the order they are chained. */
export type StepKey = "position" | "attention" | "mlp";

export const STEPS = ["position", "attention", "mlp"] as const satisfies readonly StepKey[];

/** The short label each step carries, in `STEPS` order; §5.7's wording. */
export const STEP_LABELS = ["+ position", "+ attention", "+ MLP"] as const;

/** Lift toward +z, the camera side of the floor, so the plane does not z-fight the path. */
export const PATH_LIFT = 0.01;

/**
 * Longest a barb may grow. Unlike the wall glyphs, these arrows are drawn at true length, so
 * without a cap a long step would grow a head the size of the step it is measuring.
 */
const HEAD_MAX = 0.18;

/** The ring that marks `xFinal`, and how many segments it is drawn in. */
export const RING_RADIUS = 0.14;
export const RING_SEGMENTS = 24;

/** Endpoints one step can need: an arrow's shaft, two barbs, and the base joining them. */
export const STEP_ENDPOINTS = ARROW_ENDPOINTS;
/** Endpoints the ring needs: a closed polyline of `RING_SEGMENTS` segments. */
export const RING_ENDPOINTS = RING_SEGMENTS * 2;

/** How this module names itself and its positions when a read fails. */
const READER = { owner: "gpt residual path", slot: "position" } as const;

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
  const x = vec2At(f.x, query, "x", READER);
  const pe = vec2At(f.pe, query, "pe", READER);
  const stages: Vec2[] = [
    [x[0] - pe[0], x[1] - pe[1]],
    x,
    vec2At(f.xResid, query, "xResid", READER),
    vec2At(f.xFinal, query, "xFinal", READER),
  ];
  return stages.map((e) => {
    const [px, py] = floorFromEmbed(e);
    return [px, py, PATH_LIFT];
  });
}

/**
 * One step of the chain as an arrow on the floor: a closed head, capped so a long step does not
 * outgrow it, in the floor's (x, y) rather than the wall's (x, z).
 */
export function stepArrow(from: Vec3, to: Vec3): Segment[] {
  return arrowSegments(from, to, { axes: FLOOR_AXES, head: "closed", maxBarb: HEAD_MAX });
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
    return stepArrow(from, to);
  });
  const end = points[STEPS.length];
  if (end === undefined) throw new Error("gpt residual path: the chain has no end point");
  return { arrows, ring: ringSegments(end) };
}
