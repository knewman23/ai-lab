/**
 * Where the vocabulary points stand on the floor and which way their unembedding rays run.
 * Pure — nothing here imports Three.js beyond the layer module's plain point and segment types,
 * so the ray directions can be asserted directly instead of through a float32 buffer read.
 */

import type { Vec2 } from "../../core/math/numeric";
import { type Embeddings, VOCAB } from "../../core/math/transformer";
import type { Segment, Vec3 } from "../shared/layer";
import { FLOOR_X, FLOOR_Y, floorFromEmbed } from "./layout";

/** Radius of a vocabulary point, which is also how far it stands off the floor so it rests on it. */
export const POINT_RADIUS = 0.09;

/** Lift the rays toward +z, the camera side of the floor, so the plane does not z-fight them. */
export const RAY_LIFT = 0.005;

/** The point every unembedding ray leaves from: the embedding origin, on the floor. */
const ORIGIN = floorFromEmbed([0, 0]);

/** Centre and size of the floor rectangle, from the extents `layout.ts` owns. */
export const FLOOR_SIZE: Vec2 = [FLOOR_X[1] - FLOOR_X[0], FLOOR_Y[1] - FLOOR_Y[0]];
export const FLOOR_CENTRE: Vec2 = [(FLOOR_X[0] + FLOOR_X[1]) / 2, (FLOOR_Y[0] + FLOOR_Y[1]) / 2];

/** Where word `v`'s sphere sits: on the floor at its embedding, standing on it rather than in it. */
export function pointPosition(e: Vec2): Vec3 {
  const [x, y] = floorFromEmbed(e);
  return [x, y, POINT_RADIUS];
}

/**
 * The ray for one word: from the embedding origin through the word's point and on to whichever
 * floor edge it reaches first. This is the direction the tied unembedding scores that word
 * along, so its length carries no meaning and running it to the edge says so.
 *
 * A word sitting exactly on the origin has no direction to point along and draws nothing rather
 * than a degenerate spike — the same rule the column glyphs use for a zero vector.
 */
export function raySegment(e: Vec2): Segment | null {
  const [x, y] = floorFromEmbed(e);
  const dx = x - ORIGIN[0];
  const dy = y - ORIGIN[1];
  // Also catches a NaN embedding, which must not reach the buffer: it would poison the layer's
  // bounding sphere and take the whole floor off screen.
  if (!(Math.hypot(dx, dy) > 0)) return null;
  // How far along (dx, dy) each pair of edges is; the nearer one is where the ray leaves.
  const tx = dx === 0 ? Infinity : ((dx > 0 ? FLOOR_X[1] : FLOOR_X[0]) - ORIGIN[0]) / dx;
  const ty = dy === 0 ? Infinity : ((dy > 0 ? FLOOR_Y[1] : FLOOR_Y[0]) - ORIGIN[1]) / dy;
  const t = Math.min(tx, ty);
  const from: Vec3 = [ORIGIN[0], ORIGIN[1], RAY_LIFT];
  return [from, [ORIGIN[0] + t * dx, ORIGIN[1] + t * dy, RAY_LIFT]];
}

/** The word the distribution favours: the one whose ray is drawn in `--accent`. */
export function likeliest(probabilities: Float64Array): number {
  if (probabilities.length !== VOCAB.length) {
    throw new Error(`gpt floor: ${probabilities.length} probabilities for ${VOCAB.length} words`);
  }
  let best = 0;
  for (let v = 1; v < probabilities.length; v++) {
    const p = probabilities[v];
    const top = probabilities[best];
    if (p === undefined || top === undefined) throw new Error(`gpt floor: no probability ${v}`);
    if (p > top) best = v;
  }
  return best;
}

/** One word's place and ray, in vocabulary order. */
export interface WordPlacement {
  readonly at: Vec3;
  /** Null for a word on the origin, which has no direction to point along. */
  readonly ray: Segment | null;
  /** True for the single word the distribution favours, whose ray is the accent one. */
  readonly winner: boolean;
}

/** Where all eight words go. Throws rather than defaulting: a short preset is a bug, not a blank. */
export function placements(embeddings: Embeddings, probabilities: Float64Array): WordPlacement[] {
  const best = likeliest(probabilities);
  return VOCAB.map((_, v) => {
    const e = embeddings[v];
    if (e === undefined) throw new Error(`gpt floor: no embedding for word ${v}`);
    return { at: pointPosition(e), ray: raySegment(e), winner: v === best };
  });
}
