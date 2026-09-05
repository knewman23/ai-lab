/**
 * The greedy pass that keeps an HTML label overlay legible: where two labels would print over
 * each other, the one that matters less steps aside, and only gives up its place when there is
 * nowhere clear to step. It works on screen rectangles alone, so it knows nothing of cameras or
 * the DOM and can be read straight through in a test.
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

/** Where a label ended up: the pixel offset from the point it names, (0, 0) for most of them. */
export interface LabelPlacement {
  readonly dx: number;
  readonly dy: number;
}

/**
 * The places a label may sit, in the order they are tried: on its point, then above, below, left
 * and right of it. A step is the label's own extent along that axis — its height going up or
 * down, its width going sideways — which is the least that clears what it was sitting on and
 * near enough that it still reads as naming the same thing.
 */
const CANDIDATES: readonly LabelPlacement[] = [
  { dx: 0, dy: 0 },
  { dx: 0, dy: -1 },
  { dx: 0, dy: 1 },
  { dx: -1, dy: 0 },
  { dx: 1, dy: 0 },
];

/** True when the two rectangles share any area; touching edges are clear of each other. */
function overlaps(a: LabelBox, b: LabelBox): boolean {
  return a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
}

/** One step of `by` in pixels, each axis scaled by the box's own extent along it. */
function shift(box: LabelBox, by: LabelPlacement): LabelPlacement {
  return { dx: by.dx * (box.right - box.left), dy: by.dy * (box.bottom - box.top) };
}

/** `box` as it would sit once moved `by` pixels. */
function moved(box: LabelBox, by: LabelPlacement): LabelBox {
  return {
    ...box,
    left: box.left + by.dx,
    right: box.right + by.dx,
    top: box.top + by.dy,
    bottom: box.bottom + by.dy,
  };
}

/**
 * Where each label that can be drawn goes, keyed by id: every box in rank order takes the first
 * of its candidate places that no box already placed holds, and a box with no clear candidate is
 * left out rather than printed over its betters. Ties on rank fall to the order `boxes` arrive
 * in, so a still camera keeps the same labels in the same places frame after frame. A left-out
 * box reserves nothing, so a later label may still take the space it wanted.
 *
 * Quadratic in the number of labels and linear in the candidates; the overlays it serves carry a
 * few dozen labels, and the whole pass is a handful of number comparisons each.
 */
export function declutter(boxes: readonly LabelBox[]): ReadonlyMap<string, LabelPlacement> {
  const kept: LabelBox[] = [];
  const places = new Map<string, LabelPlacement>();
  for (const box of [...boxes].sort((a, b) => a.rank - b.rank)) {
    for (const candidate of CANDIDATES) {
      const by = shift(box, candidate);
      const at = moved(box, by);
      if (kept.some((placed) => overlaps(at, placed))) continue;
      kept.push(at);
      places.set(box.id, by);
      break;
    }
  }
  return places;
}
