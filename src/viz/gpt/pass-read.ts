/**
 * Reading a 2-vector out of a forward pass. Both the column glyphs and the residual path do it,
 * and both must throw rather than default: `d_model` is 2 and every stage returns one vector per
 * position, so a missing or short row is a bug upstream, not a blank to draw around.
 */

import type { Vec2 } from "../../core/math/numeric";

/** Who is reading and what it calls a position, so the message names the caller's own world. */
export interface PassReader {
  /** The module, for the error prefix: "gpt columns", "gpt residual path". */
  readonly owner: string;
  /** What that module calls an index: "column", "position". */
  readonly slot: string;
}

/** One stage's 2-vector at `i`. Throws, naming the invariant, rather than defaulting. */
export function vec2At(
  rows: readonly Float64Array[],
  i: number,
  field: string,
  reader: PassReader,
): Vec2 {
  const row = rows[i];
  if (row === undefined) {
    throw new Error(`${reader.owner}: no ${field} at ${reader.slot} ${i}`);
  }
  const [a, b] = row;
  if (a === undefined || b === undefined) {
    throw new Error(`${reader.owner}: ${field} at ${reader.slot} ${i} is not a 2-vector`);
  }
  return [a, b];
}
