/**
 * Where the GPT block is drawn. Z-up: the wall is the plane y = 0 and the floor is z = 0,
 * extending in −y in front of it, exactly as in the neural network scene. Pure — nothing here
 * imports Three.js, so the whole layout is unit-testable.
 */

import type { Vec2 } from "../../core/math/numeric";

/** Width (X extent) of the wall the pipeline is drawn on. */
export const WALL_W = 6;
/**
 * Height (Z extent). 5.2 rather than 4.6 because the tallest probability bar rises `GLYPH_MAX`
 * above the logits band at z = 4.2; that 4.75 plus the label pill must fit inside the wall.
 */
export const WALL_H = 5.2;
/** How solid the wall is drawn: a backdrop the pipeline reads against, not a surface of its own. */
export const WALL_OPACITY = 0.18;

/** X of each of the five token columns, in sequence order. The pitch is 1.2. */
export const COLUMN_X = [-2.4, -1.2, 0, 1.2, 2.4] as const;

/** The five stage bands the tokens climb, as Z on the wall. */
export const BAND_Z = {
  embed: 0.5,
  attention: 1.5,
  residual: 2.5,
  mlp: 3.4,
  logits: 4.2,
} as const;

/** Names a band; the stage-focus selector and the column glyphs both key off these. */
export type BandKey = keyof typeof BAND_Z;

/** X extent of the floor, and its Y extent running from the wall toward the camera. */
export const FLOOR_X: Vec2 = [-3, 3];
export const FLOOR_Y: Vec2 = [-6, 0];

/** The embedding domain a dragged word stays inside, on both axes. */
export const EMBED_DOMAIN: Vec2 = [-2, 2];

/** Scale from embedding units to floor units, and the floor Y that embedding y = 0 sits at. */
const FLOOR_SCALE = 1.4;
const FLOOR_CY = -3;

/** Longest an arrow glyph can be: under half the 1.2 column pitch, so it never reaches a neighbour. */
export const GLYPH_MAX = 0.55;
/** Magnitude at which the glyph reaches `tanh(1)`, which sets how the common range spreads out. */
const GLYPH_KNEE = 2;

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

/** X of token column `i`. Throws rather than defaulting: there are exactly five positions. */
export function columnX(i: number): number {
  const x = COLUMN_X[i];
  if (x === undefined) throw new Error(`gpt layout: no token column ${i}`);
  return x;
}

/**
 * An embedding → the point on the floor plane z = 0 that represents it. The domain `[-2, 2]²`
 * lands in x `[-2.8, 2.8]`, y `[-5.8, -0.2]`: inside the floor with a margin, so a dragged word
 * can reach the domain edge without leaving the floor.
 */
export function floorFromEmbed(e: Vec2): Vec2 {
  return [FLOOR_SCALE * e[0], FLOOR_CY + FLOOR_SCALE * e[1]];
}

/** The inverse, clamped to the embedding domain: a drag that runs off the floor stops at the edge. */
export function embedFromFloor(p: Vec2): Vec2 {
  const [lo, hi] = EMBED_DOMAIN;
  return [clamp(p[0] / FLOOR_SCALE, lo, hi), clamp((p[1] - FLOOR_CY) / FLOOR_SCALE, lo, hi)];
}

/**
 * How long a token's arrow glyph is drawn, from the magnitude of the vector it stands for.
 * Magnitudes across all presets, sentences and stages run from 0.02 to 5.63, so a linear scale
 * with a hard clamp would saturate on the `spread` preset and stop responding to drags. `tanh` is
 * monotone, stays under `GLYPH_MAX` over that whole range, and still separates it: 1.6 → 0.365,
 * 2.6 → 0.474, 5.6 → 0.546.
 */
export function glyphLength(magnitude: number): number {
  return GLYPH_MAX * Math.tanh(magnitude / GLYPH_KNEE);
}
