import { describe, expect, it } from "vitest";
import {
  EMBEDDING_PRESETS,
  forward,
  probabilities,
  SEQUENCES,
  VOCAB,
} from "../../../src/core/math/transformer";
import {
  BAR_BUFFER_FLOATS,
  barHeight,
  barQuad,
  barX,
  leaderSegment,
  peak,
  VERTICES_PER_BAR,
  writeBars,
} from "../../../src/viz/gpt/bars-geometry";
import { COLUMN_X, WALL_H, WALL_W } from "../../../src/viz/gpt/layout";

const PASS = forward({
  embeddings: EMBEDDING_PRESETS.tuned,
  sequence: SEQUENCES["cat-sat"],
  positional: true,
  causal: true,
});
const PROBS = probabilities(PASS.logits, 1);

/** The x and z extent of one bar's quad. */
function extent(v: number, height: number) {
  const quad = barQuad(v, height);
  const xs = quad.map((p) => p[0]);
  const zs = quad.map((p) => p[2]);
  return {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minZ: Math.min(...zs),
    maxZ: Math.max(...zs),
  };
}

describe("barX", () => {
  it("spaces the eight bars evenly and keeps the row inside the wall", () => {
    const pitch = barX(1) - barX(0);
    for (let v = 1; v < VOCAB.length; v++) expect(barX(v) - barX(v - 1)).toBeCloseTo(pitch, 9);
    // Wider than a bar, so neighbours never touch, and clear of both wall edges.
    expect(pitch).toBeGreaterThan(0.28);
    expect(barX(0) - 0.28 / 2).toBeGreaterThan(-WALL_W / 2);
    expect(barX(VOCAB.length - 1) + 0.28 / 2).toBeLessThan(WALL_W / 2);
    // Centred on the wall: the row reads as one block rather than drifting to a side.
    expect(barX(0) + barX(VOCAB.length - 1)).toBeCloseTo(0, 9);
  });

  it("throws rather than defaulting outside the vocabulary", () => {
    expect(() => barX(VOCAB.length)).toThrow(/no bar 8/);
    expect(() => barX(-1)).toThrow(/no bar -1/);
    expect(() => barX(1.5)).toThrow(/no bar 1.5/);
  });
});

describe("peak", () => {
  it("is the largest probability in the row", () => {
    expect(peak(PROBS)).toBeCloseTo(Math.max(...PROBS), 12);
  });

  it("throws rather than defaulting on a row of the wrong size or with no mass", () => {
    expect(() => peak(Float64Array.from([1, 0]))).toThrow(/2 probabilities for 8 words/);
    expect(() => peak(Float64Array.from(VOCAB.map(() => 0)))).toThrow(/no mass/);
  });
});

describe("barHeight", () => {
  it("is 0.55 * p / max(p), so the tallest bar always fills the band", () => {
    const max = Math.max(...PROBS);
    expect(barHeight(max, max)).toBeCloseTo(0.55, 9);
    // On `cat-sat` at the tuned preset "the" wins at p = 0.789 and "cat" trails at 0.041.
    expect(barHeight(PROBS[1]!, max)).toBeCloseTo((0.55 * 0.0414) / 0.7892, 3);
    // A flat distribution puts every bar at the ceiling; a peaky one keeps only its winner there.
    expect(barHeight(0.125, 0.125)).toBeCloseTo(0.55, 9);
    expect(barHeight(0.5, 1)).toBeCloseTo(0.275, 9);
  });
});

describe("barQuad", () => {
  it("is 0.28 wide, centred on its bar, standing on the logits band", () => {
    for (let v = 0; v < VOCAB.length; v++) {
      const box = extent(v, 0.3);
      expect(box.maxX - box.minX).toBeCloseTo(0.28, 9);
      expect((box.minX + box.maxX) / 2).toBeCloseTo(barX(v), 9);
      expect(box.minZ).toBeCloseTo(4.2, 9);
      expect(box.maxZ).toBeCloseTo(4.5, 9);
    }
  });

  it("keeps the tallest bar inside the wall with room for the label pill", () => {
    // 4.2 + 0.55 = 4.75, under the wall's 5.2.
    expect(extent(0, 0.55).maxZ).toBeCloseTo(4.75, 9);
    expect(4.75).toBeLessThan(WALL_H);
  });

  it("floats in front of the wall, past the bands' and the columns' lifts", () => {
    for (const p of barQuad(3, 0.4)) {
      expect(p[1]).toBeLessThan(-0.02);
      expect(p[1]).toBeGreaterThan(-0.06);
    }
  });

  it("winds every triangle the same way, whatever the height", () => {
    // Signed area in the wall's (x, z) plane. Positive for every triangle of every bar, so no
    // face is emitted back-wound — WebGPU's DoubleSide path multiplies the normal by
    // faceDirection, and a flipped face would light itself inside out.
    const area = (v: number, height: number, t: 0 | 1): number => {
      const q = barQuad(v, height);
      const [a, b, c] = [q[t * 3]!, q[t * 3 + 1]!, q[t * 3 + 2]!];
      return (b[0] - a[0]) * (c[2] - a[2]) - (c[0] - a[0]) * (b[2] - a[2]);
    };
    for (const height of [0.05, 0.55]) {
      for (let v = 0; v < VOCAB.length; v++) {
        expect(area(v, height, 0)).toBeGreaterThan(0);
        expect(area(v, height, 1)).toBeGreaterThan(0);
      }
    }
    // The two triangles cover the quad between them: their areas sum to twice 0.28 * height.
    expect(area(0, 0.5, 0) + area(0, 0.5, 1)).toBeCloseTo(2 * 0.28 * 0.5, 9);
  });
});

describe("writeBars", () => {
  it("fills the buffer with one quad per word, in vocabulary order", () => {
    const out = new Float32Array(BAR_BUFFER_FLOATS);
    const count = writeBars(out, PROBS);
    expect(count).toBe(VOCAB.length * VERTICES_PER_BAR);
    expect(count * 3).toBe(BAR_BUFFER_FLOATS);

    const max = peak(PROBS);
    for (let v = 0; v < VOCAB.length; v++) {
      const expected = barQuad(v, barHeight(PROBS[v]!, max));
      for (let i = 0; i < expected.length; i++) {
        const at = (v * VERTICES_PER_BAR + i) * 3;
        expect(out[at]).toBeCloseTo(expected[i]![0], 5);
        expect(out[at + 1]).toBeCloseTo(expected[i]![1], 5);
        expect(out[at + 2]).toBeCloseTo(expected[i]![2], 5);
      }
    }
  });

  it("rescales to the new peak rather than leaving the old row behind", () => {
    const out = new Float32Array(BAR_BUFFER_FLOATS);
    writeBars(out, PROBS);
    const uniform = Float64Array.from(VOCAB.map(() => 1 / VOCAB.length));
    writeBars(out, uniform);
    for (let v = 0; v < VOCAB.length; v++) {
      const zs: number[] = [];
      for (let i = 0; i < VERTICES_PER_BAR; i++) zs.push(out[(v * VERTICES_PER_BAR + i) * 3 + 2]!);
      expect(Math.max(...zs) - Math.min(...zs)).toBeCloseTo(0.55, 5);
    }
  });
});

describe("leaderSegment", () => {
  it("runs up the last token's column from its stem to the logits band", () => {
    const [from, to] = leaderSegment();
    expect(from[0]).toBeCloseTo(COLUMN_X[4], 9);
    expect(to[0]).toBeCloseTo(COLUMN_X[4], 9);
    expect(from[2]).toBeCloseTo(3.4, 9);
    expect(to[2]).toBeCloseTo(4.2, 9);
    expect(from[1]).toBe(to[1]);
  });
});
