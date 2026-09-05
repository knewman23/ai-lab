/**
 * The greedy pass that keeps an HTML label overlay legible: where two labels would print over
 * each other, the one that matters less gives way. It works on screen rectangles alone, so it
 * knows nothing of cameras or the DOM and can be read straight through in a test.
 */

/** A label's screen rectangle in CSS pixels, with the rank that decides who gives way. */
export interface LabelBox {
  readonly id: string;
  /** Lower ranks are placed first and never give way to a higher one. */
  readonly rank: number;
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

/** True when the two rectangles share any area; touching edges are clear of each other. */
function overlaps(a: LabelBox, b: LabelBox): boolean {
  return a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
}

/**
 * The ids of the labels that can be drawn: each box in rank order takes the space it asks for
 * unless a box already placed holds part of it. Ties on rank fall to the order `boxes` arrive
 * in, so a still camera keeps the same labels frame after frame. A dropped box reserves
 * nothing, so a third label may still take the space the loser wanted.
 *
 * Quadratic in the number of labels; the overlays it serves carry a few dozen, and the whole
 * pass is a handful of number comparisons each.
 */
export function declutter(boxes: readonly LabelBox[]): ReadonlySet<string> {
  const kept: LabelBox[] = [];
  const ids = new Set<string>();
  for (const box of [...boxes].sort((a, b) => a.rank - b.rank)) {
    if (kept.some((placed) => overlaps(box, placed))) continue;
    kept.push(box);
    ids.add(box.id);
  }
  return ids;
}
