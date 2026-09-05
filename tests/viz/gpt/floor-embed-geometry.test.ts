import { describe, expect, it } from "vitest";
import {
  EMBEDDING_PRESETS,
  forward,
  probabilities,
  SEQUENCES,
  VOCAB,
} from "../../../src/core/math/transformer";
import {
  FLOOR_CENTRE,
  FLOOR_SIZE,
  likeliest,
  placements,
  POINT_RADIUS,
  pointPosition,
  raySegment,
} from "../../../src/viz/gpt/floor-embed-geometry";

const PASS = forward({
  embeddings: EMBEDDING_PRESETS.tuned,
  sequence: SEQUENCES["cat-sat"],
  positional: true,
  causal: true,
});
const PROBS = probabilities(PASS.logits, 1);

/** Whether a point sits on the floor's boundary: x = ±3, or y = 0 or −6. */
function onFloorEdge(x: number, y: number): boolean {
  return Math.abs(Math.abs(x) - 3) < 1e-9 || Math.abs(Math.abs(y + 3) - 3) < 1e-9;
}

describe("the floor rectangle", () => {
  it("spans x [-3, 3] and y [-6, 0]", () => {
    expect(FLOOR_SIZE).toEqual([6, 6]);
    expect(FLOOR_CENTRE).toEqual([0, -3]);
  });
});

describe("pointPosition", () => {
  it("stands a word on the floor at its embedding, at radius 0.09", () => {
    expect(POINT_RADIUS).toBe(0.09);
    // Hand-computed: floorFromEmbed((1.4, 0.8)) = (1.4 * 1.4, -3 + 1.4 * 0.8) = (1.96, -1.88).
    const [x, y, z] = pointPosition([1.4, 0.8]);
    expect(x).toBeCloseTo(1.96, 12);
    expect(y).toBeCloseTo(-1.88, 12);
    expect(z).toBe(0.09);
    // On the floor rather than buried in it, as the nn scene's points are.
    expect(pointPosition([0, 0])[2]).toBe(0.09);
  });

  it("keeps the domain corners inside the floor with a margin", () => {
    for (const corner of [
      [2, 2],
      [-2, -2],
    ] as const) {
      const [x, y] = pointPosition(corner);
      expect(Math.abs(x)).toBeLessThan(3);
      expect(y).toBeGreaterThan(-6);
      expect(y).toBeLessThan(0);
    }
  });
});

describe("raySegment", () => {
  it("leaves the embedding origin's floor point", () => {
    for (const e of EMBEDDING_PRESETS.tuned) {
      const ray = raySegment(e);
      expect(ray).not.toBeNull();
      // floorFromEmbed((0, 0)) = (0, -3).
      expect(ray![0][0]).toBeCloseTo(0, 12);
      expect(ray![0][1]).toBeCloseTo(-3, 12);
    }
  });

  it("stops at the first floor edge it reaches, not the far one", () => {
    for (const e of EMBEDDING_PRESETS.tuned) {
      const [, to] = raySegment(e)!;
      expect(onFloorEdge(to[0], to[1])).toBe(true);
      expect(Math.abs(to[0])).toBeLessThanOrEqual(3 + 1e-9);
      expect(to[1]).toBeGreaterThanOrEqual(-6 - 1e-9);
      expect(to[1]).toBeLessThanOrEqual(1e-9);
    }
  });

  it("passes through the word it belongs to", () => {
    // "cat" at (1.96, -1.88) leaves the centre along (1.96, 1.12) and so exits at x = 3.
    const [from, to] = raySegment([1.4, 0.8])!;
    expect(to[0]).toBeCloseTo(3, 9);
    expect(to[1]).toBeCloseTo(-3 + (1.12 * 3) / 1.96, 9);
    // Collinear with the word's own point, and past it rather than short of it.
    const cross = (to[0] - from[0]) * (-1.88 - from[1]) - (1.96 - from[0]) * (to[1] - from[1]);
    expect(cross).toBeCloseTo(0, 9);
    expect(Math.hypot(to[0] - from[0], to[1] - from[1])).toBeGreaterThan(
      Math.hypot(1.96 - from[0], -1.88 - from[1]),
    );
  });

  it("runs straight up to the wall for a word on the +y axis", () => {
    // "the" at (0, 1.6) sits directly above the origin: its ray leaves through y = 0.
    const [, to] = raySegment([0, 1.6])!;
    expect(to[0]).toBeCloseTo(0, 12);
    expect(to[1]).toBeCloseTo(0, 12);
  });

  it("draws nothing for a word on the origin", () => {
    // No direction to point along, so no degenerate spike — the column glyphs' rule.
    expect(raySegment([0, 0])).toBeNull();
    expect(raySegment([NaN, 0])).toBeNull();
  });
});

describe("likeliest", () => {
  it("is the argmax of the distribution", () => {
    // "the" wins on `cat-sat` at the tuned preset, at p = 0.789.
    expect(likeliest(PROBS)).toBe(0);
    expect(likeliest(Float64Array.from(VOCAB.map((_, v) => (v === 4 ? 1 : 0))))).toBe(4);
    // Ties keep the first word rather than drifting to the last.
    expect(likeliest(Float64Array.from(VOCAB.map(() => 0.125)))).toBe(0);
  });

  it("throws rather than defaulting on a row of the wrong size", () => {
    expect(() => likeliest(Float64Array.from([1, 0]))).toThrow(/2 probabilities for 8 words/);
  });
});

describe("placements", () => {
  it("places all eight words and marks exactly one winner", () => {
    const placed = placements(EMBEDDING_PRESETS.tuned, PROBS);
    expect(placed).toHaveLength(VOCAB.length);
    expect(placed.filter((p) => p.winner)).toHaveLength(1);
    expect(placed.findIndex((p) => p.winner)).toBe(likeliest(PROBS));
    for (let v = 0; v < placed.length; v++) {
      expect(placed[v]!.at).toEqual(pointPosition(EMBEDDING_PRESETS.tuned[v]!));
      expect(placed[v]!.ray).not.toBeNull();
    }
  });

  it("leaves a word on the origin without a ray but still places it", () => {
    const flattened = EMBEDDING_PRESETS.tuned.map((e, v) => (v === 2 ? ([0, 0] as const) : e));
    const placed = placements(flattened, PROBS);
    expect(placed[2]!.ray).toBeNull();
    expect(placed[2]!.at).toEqual([0, -3, 0.09]);
    expect(placed.filter((p) => p.ray !== null)).toHaveLength(VOCAB.length - 1);
  });

  it("throws rather than defaulting on a short preset", () => {
    expect(() => placements([[0, 0]], PROBS)).toThrow(/no embedding for word 1/);
  });
});
