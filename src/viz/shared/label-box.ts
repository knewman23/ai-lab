/**
 * The one place the declutter pass touches the DOM: turning a label's span into the rectangle it
 * covers on screen. It lives apart from `declutter` so that pass stays pure, and apart from the
 * layer so the layer stays about spans and world points.
 */

import type { LabelBox } from "./declutter";

/** What a box is built from: the span to measure, its rank, and where its size is remembered. */
export interface Measured {
  readonly el: HTMLSpanElement;
  /** The rank the declutter pass places this label at; NaN when the layer does not declutter. */
  readonly rank: number;
  /** The drawn size, measured once per text and kind and NaN until then. */
  w: number;
  h: number;
}

/**
 * The screen rectangle a label covers when its point lands on (`px`, `py`), measuring the span
 * the first time it is asked and reusing that until the text or kind changes. Measuring costs a
 * layout, so it must not run per frame; the size of a span depends on its text, not its place.
 * The span must be showing: a hidden one has no size to read.
 */
export function boxOf(id: string, entry: Measured, px: number, py: number): LabelBox {
  if (Number.isNaN(entry.w)) {
    const rect = entry.el.getBoundingClientRect();
    entry.w = rect.width;
    entry.h = rect.height;
  }
  // `op` labels sit centred on their point; every other kind hangs above it.
  const above = entry.el.className === "op" ? entry.h / 2 : entry.h;
  return {
    id,
    rank: entry.rank,
    left: px - entry.w / 2,
    top: py - above,
    right: px + entry.w / 2,
    bottom: py - above + entry.h,
  };
}
