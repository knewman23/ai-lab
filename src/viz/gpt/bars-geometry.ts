/**
 * Where the eight probability bars go and how tall each one is. Pure — nothing here imports
 * Three.js beyond the layer module's plain point and segment types, so every spec constant can
 * be asserted directly instead of through a float32 buffer read.
 */

import { VOCAB } from "../../core/math/transformer";
import type { Segment, Vec3 } from "../shared/layer";
import { BAND_Z, columnX, COLUMN_X } from "./layout";

/** How wide each bar is, and how far apart their centres sit. */
export const BAR_WIDTH = 0.28;
export const BAR_PITCH = 0.7;

/**
 * How far the tallest bar rises above the logits band. Its constraint is the wall's height, not
 * the columns': 4.2 + 0.55 = 4.75 must leave room for the label pill under `WALL_H` = 5.2, which
 * is why §4 sets `WALL_H` to 5.2 rather than 4.6. Numerically equal to `GLYPH_MAX` today, but
 * that constant answers a different question — how long an arrow may grow before it reaches the
 * neighbouring column — so narrowing the column pitch must not silently shorten the bars.
 */
export const BAR_MAX = 0.55;

/**
 * How far in front of the wall the bars float: past the band lines' 0.01 and the columns' 0.02,
 * so a bar standing on the logits band never z-fights the line it stands on.
 */
export const BAR_LIFT = -0.03;

/** Two triangles, three vertices each, per bar. */
export const VERTICES_PER_BAR = 6;

/** Floats the mesh preallocates. A multiple of 3, or `computeBoundingSphere` reads past it. */
export const BAR_BUFFER_FLOATS = VOCAB.length * VERTICES_PER_BAR * 3;

/** The token whose column the leader line leaves: the last one, whose logits these are. */
const LAST_COLUMN = COLUMN_X.length - 1;

/** Centre x of the bar for word `v`. Throws rather than defaulting: there are exactly eight. */
export function barX(v: number): number {
  if (!Number.isInteger(v) || v < 0 || v >= VOCAB.length) {
    throw new Error(`gpt bars: no bar ${v}; there are ${VOCAB.length} words`);
  }
  return (v - (VOCAB.length - 1) / 2) * BAR_PITCH;
}

/**
 * The largest probability in the row, which every bar is measured against. Throws rather than
 * defaulting: a distribution of the wrong length, or with no mass in it, is a bug upstream and
 * would silently draw eight bars of nothing.
 */
export function peak(probabilities: Float64Array): number {
  if (probabilities.length !== VOCAB.length) {
    throw new Error(`gpt bars: ${probabilities.length} probabilities for ${VOCAB.length} words`);
  }
  let max = 0;
  for (let v = 0; v < probabilities.length; v++) {
    const p = probabilities[v];
    if (p === undefined) throw new Error(`gpt bars: no probability ${v}`);
    if (p > max) max = p;
  }
  if (!(max > 0)) throw new Error("gpt bars: the distribution carries no mass");
  return max;
}

/**
 * How tall the bar for probability `p` stands: relative to the row's own peak, so the tallest
 * always fills the band whatever the temperature has done to the distribution.
 */
export function barHeight(p: number, max: number): number {
  return (BAR_MAX * p) / max;
}

/**
 * One bar as a triangle list: two triangles wound the same way in every bar, whatever the
 * heights are. Never wound per-bar from the height, and no normal is ever negated: WebGPU's
 * `DoubleSide` path already multiplies by `faceDirection`.
 */
export function barQuad(v: number, height: number): Vec3[] {
  const left = barX(v) - BAR_WIDTH / 2;
  const right = left + BAR_WIDTH;
  const base = BAND_Z.logits;
  const top = base + height;
  const corners: readonly (readonly [number, number])[] = [
    [left, base],
    [right, base],
    [left, top],
    [right, base],
    [right, top],
    [left, top],
  ];
  return corners.map(([x, z]) => [x, BAR_LIFT, z]);
}

/**
 * Writes the whole row into `out` and returns the vertex count the mesh should draw. Every bar
 * is written every time: the row is always eight wide, so nothing is left behind to collapse.
 */
export function writeBars(out: Float32Array, probabilities: Float64Array): number {
  const max = peak(probabilities);
  let n = 0;
  for (let v = 0; v < VOCAB.length; v++) {
    const p = probabilities[v];
    if (p === undefined) throw new Error(`gpt bars: no probability ${v}`);
    for (const vertex of barQuad(v, barHeight(p, max))) {
      out.set(vertex, n * 3);
      n++;
    }
  }
  return n;
}

/**
 * The leader line: up the last token's column from the top of its stem to the band the bars
 * stand on, so the row reads as belonging to that column rather than floating over all five.
 */
export function leaderSegment(): Segment {
  return [
    [columnX(LAST_COLUMN), BAR_LIFT, BAND_Z.mlp],
    [columnX(LAST_COLUMN), BAR_LIFT, BAND_Z.logits],
  ];
}
