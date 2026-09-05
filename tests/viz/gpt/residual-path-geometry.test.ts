import { describe, expect, it } from "vitest";
import {
  EMBEDDING_PRESETS,
  type Forward,
  forward,
  SEQUENCES,
} from "../../../src/core/math/transformer";
import { floorFromEmbed } from "../../../src/viz/gpt/layout";
import {
  pathDrawing,
  pathPoints,
  RING_ENDPOINTS,
  RING_SEGMENTS,
  ringSegments,
  STEP_ENDPOINTS,
  stepArrow,
  STEP_LABELS,
  STEPS,
} from "../../../src/viz/gpt/residual-path-geometry";
import type { Segment } from "../../../src/viz/shared/layer";

function pass(sentence: keyof typeof SEQUENCES, positional = true): Forward {
  return forward({
    embeddings: EMBEDDING_PRESETS.tuned,
    sequence: SEQUENCES[sentence],
    positional,
    causal: true,
  });
}

const CAT_SAT = pass("cat-sat");
const SCRAMBLED = pass("scrambled");
const LAST = SEQUENCES["cat-sat"].length - 1;

function length2([a, b]: Segment): number {
  return Math.hypot(b[0] - a[0], b[1] - a[1]);
}

/** The magnitude of one of a pass's 2-vectors. */
function magnitude(rows: readonly Float64Array[], i: number): number {
  const v = rows[i];
  if (v === undefined) throw new Error(`no vector at ${i}`);
  return Math.hypot(v[0]!, v[1]!);
}

describe("the steps", () => {
  it("are named in the order they are chained", () => {
    expect([...STEPS]).toEqual(["position", "attention", "mlp"]);
    expect([...STEP_LABELS]).toEqual(["+ position", "+ attention", "+ MLP"]);
    expect(STEP_LABELS).toHaveLength(STEPS.length);
  });
});

describe("pathPoints", () => {
  it("runs embedding → x → xResid → xFinal, on the floor", () => {
    const points = pathPoints(CAT_SAT, LAST);
    expect(points).toHaveLength(4);
    const x = CAT_SAT.x[LAST]!;
    const pe = CAT_SAT.pe[LAST]!;
    const expected = [
      floorFromEmbed([x[0]! - pe[0]!, x[1]! - pe[1]!]),
      floorFromEmbed([x[0]!, x[1]!]),
      floorFromEmbed([CAT_SAT.xResid[LAST]![0]!, CAT_SAT.xResid[LAST]![1]!]),
      floorFromEmbed([CAT_SAT.xFinal[LAST]![0]!, CAT_SAT.xFinal[LAST]![1]!]),
    ];
    for (let i = 0; i < expected.length; i++) {
      expect(points[i]![0]).toBeCloseTo(expected[i]![0], 12);
      expect(points[i]![1]).toBeCloseTo(expected[i]![1], 12);
      // On the floor plane, lifted only enough not to z-fight it.
      expect(points[i]![2]).toBeCloseTo(0.01, 12);
    }
  });

  it("takes the embedding as x − pe, so the first step is exactly the positional shift", () => {
    const points = pathPoints(CAT_SAT, LAST);
    const pe = CAT_SAT.pe[LAST]!;
    expect(length2([points[0]!, points[1]!])).toBeCloseTo(1.4 * Math.hypot(pe[0]!, pe[1]!), 9);
    // With the encoding off there is no shift at all, and the step collapses to a point.
    const flat = pathPoints(pass("cat-sat", false), LAST);
    expect(length2([flat[0]!, flat[1]!])).toBe(0);
  });

  it("draws the deltas at true relative length rather than normalising the pair", () => {
    const ratio = (f: Forward): number => {
      const p = pathPoints(f, LAST);
      return length2([p[2]!, p[3]!]) / length2([p[1]!, p[2]!]);
    };
    // |mlpOut| / |attnOut| at the last position: 0.46 on `cat-sat`, but 1.47 on `scrambled`,
    // where the MLP step legitimately outreaches attention. A normalised pair would report the
    // same number for both, and a long-then-short layout would report neither.
    expect(ratio(CAT_SAT)).toBeCloseTo(0.46, 2);
    expect(ratio(SCRAMBLED)).toBeCloseTo(1.47, 2);
    expect(ratio(SCRAMBLED)).toBeGreaterThan(1);
  });

  it("is the pass's own vectors at the floor's scale, unscaled otherwise", () => {
    const p = pathPoints(CAT_SAT, LAST);
    // The attention step *is* attnOut and the MLP step *is* mlpOut, at 1.4 floor units each.
    expect(length2([p[1]!, p[2]!])).toBeCloseTo(1.4 * magnitude(CAT_SAT.attnOut, LAST), 9);
    expect(length2([p[2]!, p[3]!])).toBeCloseTo(1.4 * magnitude(CAT_SAT.mlpOut, LAST), 9);
  });

  it("throws rather than defaulting when the pass has no such position", () => {
    expect(() => pathPoints(CAT_SAT, 9)).toThrow(/no x at position 9/);
    expect(() => pathPoints(CAT_SAT, -1)).toThrow(/position -1/);
  });
});

describe("stepArrow", () => {
  it("emits the shaft first, then a closed head", () => {
    const segments = stepArrow([0, 0, 0.01], [1, 0, 0.01]);
    expect(segments).toHaveLength(4);
    expect(segments[0]).toEqual([
      [0, 0, 0.01],
      [1, 0, 0.01],
    ]);
    expect(segments.length * 2).toBeLessThanOrEqual(STEP_ENDPOINTS);
    // Both barbs hang off the tip, behind it, and the base joins them.
    expect(segments[1]![0]).toEqual([1, 0, 0.01]);
    expect(segments[2]![0]).toEqual([1, 0, 0.01]);
    expect(segments[1]![1][0]).toBeLessThan(1);
    expect(segments[2]![1][0]).toBeLessThan(1);
    expect(segments[3]).toEqual([segments[1]![1], segments[2]![1]]);
  });

  it("caps the head so a long step does not grow a head the size of itself", () => {
    const barb = (length: number): number =>
      length2([
        stepArrow([0, 0, 0.01], [length, 0, 0.01])[1]![0],
        stepArrow([0, 0, 0.01], [length, 0, 0.01])[1]![1],
      ]);
    // A short step's head is a fraction of it; a long one's stops growing at 0.18.
    expect(barb(0.3)).toBeCloseTo(0.32 * 0.3, 9);
    expect(barb(4)).toBeCloseTo(0.18, 9);
  });

  it("draws nothing for a step of zero length or a non-finite one", () => {
    expect(stepArrow([1, 1, 0.01], [1, 1, 0.01])).toEqual([]);
    expect(stepArrow([1, 1, 0.01], [NaN, 1, 0.01])).toEqual([]);
  });

  it("points its head along the step, whichever way the step runs", () => {
    for (const to of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const) {
      const [shaft, barbA, barbB] = stepArrow([0, 0, 0.01], [to[0], to[1], 0.01]);
      // Both barbs fall on the near side of the tip: the head opens back down the shaft.
      for (const barb of [barbA!, barbB!]) {
        const along = (barb[1][0] - shaft![1][0]) * to[0] + (barb[1][1] - shaft![1][1]) * to[1];
        expect(along).toBeLessThan(0);
      }
    }
  });
});

describe("ringSegments", () => {
  it("is a closed ring of radius 0.14 about the point", () => {
    const ring = ringSegments([1, -2, 0.01]);
    expect(ring).toHaveLength(RING_SEGMENTS);
    expect(ring.length * 2).toBe(RING_ENDPOINTS);
    for (const [a] of ring) expect(Math.hypot(a[0] - 1, a[1] + 2)).toBeCloseTo(0.14, 12);
    // Hollow, and closed: the last segment returns to where the first began.
    expect(ring.at(-1)![1][0]).toBeCloseTo(ring[0]![0][0], 12);
    expect(ring.at(-1)![1][1]).toBeCloseTo(ring[0]![0][1], 12);
  });
});

describe("pathDrawing", () => {
  it("is one arrow per step plus the ring at xFinal", () => {
    const { arrows, ring } = pathDrawing(CAT_SAT, LAST);
    expect(arrows).toHaveLength(STEPS.length);
    const points = pathPoints(CAT_SAT, LAST);
    for (let s = 0; s < arrows.length; s++) {
      expect(arrows[s]![0]).toEqual([points[s], points[s + 1]]);
    }
    expect(ring).toEqual(ringSegments(points[3]!));
  });

  it("gives a zero-length step no segments at all", () => {
    const { arrows } = pathDrawing(pass("cat-sat", false), LAST);
    expect(arrows[0]).toEqual([]);
    expect(arrows[1]!.length).toBeGreaterThan(0);
  });
});
