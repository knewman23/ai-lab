/**
 * Where a token column's line and its five arrow glyphs go. Pure — nothing here imports
 * Three.js beyond the layer module's plain point and segment types, so every arrowhead and
 * every band assignment is unit-testable without a renderer.
 */

import type { Vec2 } from "../../core/math/numeric";
import type { Forward } from "../../core/math/transformer";
import type { Segment, Vec3 } from "../shared/layer";
import { type ArrowHead, arrowSegments as arrow, WALL_AXES } from "./arrow-head";
import { BAND_Z, type BandKey, columnX, glyphLength } from "./layout";
import { vec2At } from "./pass-read";

/**
 * Toward the camera, which looks at the wall from −y, and further off it than the bands' 0.01
 * so a glyph crossing a band line reads as being in front of it. `shared/lift.ts` is no help:
 * its `FACES.front` lift points the other way, as `nn/layout.ts` notes.
 */
const LIFT = -0.02;

export type { ArrowHead } from "./arrow-head";

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

/** How this module names itself and its positions when a read fails. */
const READER = { owner: "gpt columns", slot: "column" } as const;

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
 * An arrow from `at` along `v`, drawn at `glyphLength(|v|)` so a big vector reads as big without
 * ever reaching the neighbouring column. The vector's y becomes the wall's z, so the glyph is the
 * embedding-space vector standing up on the wall. A zero vector has no direction to point in and
 * draws nothing rather than a degenerate spike.
 *
 * The length is already capped by `glyphLength`, so the head needs no cap of its own.
 */
export function arrowSegments(at: Vec3, v: Vec2, head: ArrowHead): Segment[] {
  const magnitude = Math.hypot(v[0], v[1]);
  const length = glyphLength(magnitude);
  // Also catches a NaN vector, which must not reach the buffer: it would poison the layer's
  // bounding sphere and take the whole column off screen.
  if (!(length > 0)) return [];
  const tip: Vec3 = [
    at[0] + (length * v[0]) / magnitude,
    at[1],
    at[2] + (length * v[1]) / magnitude,
  ];
  return arrow(at, tip, { axes: WALL_AXES, head, maxBarb: Infinity });
}

/**
 * Everything column `i` draws: its stem, then one glyph per band in `GLYPH_BANDS` order,
 * each from the vector the pass computed for that stage.
 */
export function columnSegments(f: Forward, i: number): Segment[] {
  const segments: Segment[] = [columnStem(i)];
  for (const { band, field, head } of GLYPH_BANDS) {
    segments.push(...arrowSegments(bandPoint(i, band), vec2At(f[field], i, field, READER), head));
  }
  return segments;
}
