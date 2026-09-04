/**
 * Where a token column's line and its five arrow glyphs go. Pure — nothing here imports
 * Three.js beyond the layer module's plain point and segment types, so every arrowhead and
 * every band assignment is unit-testable without a renderer.
 */

import type { Vec2 } from "../../core/math/numeric";
import type { Forward } from "../../core/math/transformer";
import type { Segment, Vec3 } from "../shared/layer";
import { BAND_Z, type BandKey, columnX, glyphLength } from "./layout";

/**
 * Toward the camera, which looks at the wall from −y, and further off it than the bands' 0.01
 * so a glyph crossing a band line reads as being in front of it. `shared/lift.ts` is no help:
 * its `FACES.front` lift points the other way, as `nn/layout.ts` notes.
 */
const LIFT = -0.02;

/**
 * How an arrow's head is drawn. A `closed` head is a filled-looking triangle — its two barbs
 * joined at the base — and marks one of the three stream states; an `open` head is the two
 * barbs alone and marks a delta, what a stage *adds*. The two never look alike, which is the
 * distinction §1's "watch the vector get edited as it climbs" rests on.
 */
export type ArrowHead = "closed" | "open";

/** Which `Forward` fields a column reads; §5.3's table names one per band. */
type GlyphField = "x" | "attnOut" | "xResid" | "mlpOut" | "xFinal";

export interface GlyphBand {
  readonly band: BandKey;
  readonly field: GlyphField;
  readonly head: ArrowHead;
}

/** §5.3's five-row table: three running-stream states and the two deltas between them. */
export const GLYPH_BANDS = [
  { band: "embed", field: "x", head: "closed" },
  { band: "attention", field: "attnOut", head: "open" },
  { band: "residual", field: "xResid", head: "closed" },
  { band: "mlp", field: "mlpOut", head: "open" },
  { band: "logits", field: "xFinal", head: "closed" },
] as const satisfies readonly GlyphBand[];

/** Barb length as a fraction of the shaft, and how far the barbs sweep off it. */
const HEAD_FRACTION = 0.32;
const HEAD_ANGLE = 0.42;

/** Endpoints one column can need: the stem, plus five glyphs of four segments each. */
export const COLUMN_ENDPOINTS = 2 + GLYPH_BANDS.length * 8;

/** The vertical line of column `i`, from the embed band up to the MLP band. */
export function columnStem(i: number): Segment {
  const x = columnX(i);
  return [
    [x, LIFT, BAND_Z.embed],
    [x, LIFT, BAND_Z.mlp],
  ];
}

/** Where column `i` meets `band`: the point a glyph starts from. */
export function bandPoint(i: number, band: BandKey): Vec3 {
  return [columnX(i), LIFT, BAND_Z[band]];
}

/**
 * An arrow from `at` along `v`, drawn at `glyphLength(|v|)` so a big vector reads as big
 * without ever reaching the neighbouring column. The vector's y becomes the wall's z, so the
 * glyph is the embedding-space vector standing up on the wall. A zero vector has no direction
 * to point in and draws nothing rather than a degenerate spike.
 */
export function arrowSegments(at: Vec3, v: Vec2, head: ArrowHead): Segment[] {
  const magnitude = Math.hypot(v[0], v[1]);
  const length = glyphLength(magnitude);
  // Also catches a NaN vector, which must not reach the buffer: it would poison the layer's
  // bounding sphere and take the whole column off screen.
  if (!(length > 0)) return [];

  const ux = v[0] / magnitude;
  const uz = v[1] / magnitude;
  const tip: Vec3 = [at[0] + length * ux, at[1], at[2] + length * uz];

  const barb = length * HEAD_FRACTION;
  const ends: Vec3[] = [];
  for (const sign of [1, -1]) {
    const c = Math.cos(sign * HEAD_ANGLE);
    const s = Math.sin(sign * HEAD_ANGLE);
    // The shaft direction reversed, then rotated off the shaft by the head angle.
    ends.push([tip[0] + barb * (-ux * c + uz * s), tip[1], tip[2] + barb * (-ux * s - uz * c)]);
  }

  const [first, second] = ends;
  if (first === undefined || second === undefined) {
    throw new Error("gpt columns: an arrowhead needs both of its barbs");
  }
  const segments: Segment[] = [
    [at, tip],
    [tip, first],
    [tip, second],
  ];
  if (head === "closed") segments.push([first, second]);
  return segments;
}

/** Reads one 2-vector out of a pass. Throws rather than defaulting: a short row is a bug. */
function vectorAt(rows: readonly Float64Array[], i: number, field: GlyphField): Vec2 {
  const row = rows[i];
  if (row === undefined) throw new Error(`gpt columns: no ${field} vector at column ${i}`);
  const [a, b] = row;
  if (a === undefined || b === undefined) {
    throw new Error(`gpt columns: ${field} at column ${i} is not a 2-vector`);
  }
  return [a, b];
}

/**
 * Everything column `i` draws: its stem, then one glyph per band in `GLYPH_BANDS` order,
 * each from the vector the pass computed for that stage.
 */
export function columnSegments(f: Forward, i: number): Segment[] {
  const segments: Segment[] = [columnStem(i)];
  for (const { band, field, head } of GLYPH_BANDS) {
    segments.push(...arrowSegments(bandPoint(i, band), vectorAt(f[field], i, field), head));
  }
  return segments;
}
