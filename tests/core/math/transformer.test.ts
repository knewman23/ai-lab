import { describe, expect, it } from "vitest";
import {
  b1,
  b2,
  EMBEDDING_PRESETS,
  forward,
  PE_SCALE,
  probabilities,
  SEQUENCES,
  VOCAB,
  W1,
  W2,
  W_K,
  W_O,
  W_Q,
  W_V,
  type Embeddings,
  type Forward,
} from "../../../src/core/math/transformer";

const PRESET_KEYS = ["tuned", "collapsed", "spread"] as const;
const SEQUENCE_KEYS = ["cat-sat", "dog-ran", "scrambled"] as const;

function dot(a: Float64Array, b: readonly [number, number]): number {
  return (a[0] ?? NaN) * b[0] + (a[1] ?? NaN) * b[1];
}

function run(
  preset: (typeof PRESET_KEYS)[number],
  sequence: (typeof SEQUENCE_KEYS)[number],
  positional = true,
  causal = true,
): Forward {
  return forward({
    embeddings: EMBEDDING_PRESETS[preset],
    sequence: SEQUENCES[sequence],
    positional,
    causal,
  });
}

function argmax(row: Float64Array): number {
  let best = 0;
  for (let i = 1; i < row.length; i++)
    if ((row[i] ?? -Infinity) > (row[best] ?? -Infinity)) best = i;
  return best;
}

function sum(row: Float64Array): number {
  return row.reduce((a, b) => a + b, 0);
}

describe("attention rows", () => {
  it("sums to 1 for both heads, every sequence, every preset", () => {
    for (const preset of PRESET_KEYS) {
      for (const sequence of SEQUENCE_KEYS) {
        for (const head of run(preset, sequence).heads) {
          for (const row of head.weights) expect(sum(row)).toBeCloseTo(1, 12);
        }
      }
    }
  });

  it("gives row i exactly i + 1 entries when causal", () => {
    for (const head of run("tuned", "cat-sat").heads) {
      head.weights.forEach((row, i) => expect(row.length).toBe(i + 1));
      head.scores.forEach((row, i) => expect(row.length).toBe(i + 1));
    }
  });

  it("gives every row five entries that still sum to 1 when the mask is off", () => {
    for (const head of run("tuned", "cat-sat", true, false).heads) {
      head.weights.forEach((row, i) => {
        expect(row.length).toBe(5);
        expect(sum(row)).toBeCloseTo(1, 12);
        expect(head.scores[i]?.length).toBe(5);
      });
    }
  });
});

describe("positional encoding", () => {
  it("makes the two `the` positions identical when off and different when on", () => {
    for (const head of run("tuned", "cat-sat", false).heads) {
      for (const field of ["q", "k", "v"] as const) {
        expect(Array.from(head[field][0] ?? [])).toEqual(Array.from(head[field][4] ?? []));
      }
    }
    for (const head of run("tuned", "cat-sat", true).heads) {
      for (const field of ["q", "k", "v"] as const) {
        expect(Array.from(head[field][0] ?? [])).not.toEqual(Array.from(head[field][4] ?? []));
      }
    }
  });
});

describe("weight tying", () => {
  it("makes logit v the dot product of the final vector with embedding v", () => {
    const pass = run("tuned", "cat-sat");
    const last = pass.xFinal[4];
    for (let v = 0; v < VOCAB.length; v++) {
      const embedding = EMBEDDING_PRESETS.tuned[v];
      if (!last || !embedding) throw new Error(`missing vocabulary entry ${v}`);
      expect(pass.logits[v]).toBeCloseTo(dot(last, embedding), 12);
    }
  });
});

describe("hand-computed fixture", () => {
  it("matches head 1 on two positions with basis embeddings and no positional encoding", () => {
    const embeddings: Embeddings = [
      [1, 0],
      [0, 1],
      [0, 0],
      [0, 0],
      [0, 0],
      [0, 0],
      [0, 0],
      [0, 0],
    ];
    const head = forward({ embeddings, sequence: [0, 1], positional: false, causal: true })
      .heads[0];
    if (!head) throw new Error("missing head 1");

    // W_Q = R(-1) and W_K = W_V = I, so q0 = (cos 1, −sin 1) and q1 = (sin 1, cos 1).
    const c = Math.cos(1);
    const s = Math.sin(1);
    expect(Array.from(head.q[0] ?? [])).toEqual([c, -s]);
    expect(Array.from(head.q[1] ?? [])).toEqual([s, c]);
    expect(Array.from(head.k[1] ?? [])).toEqual([0, 1]);
    expect(Array.from(head.v[1] ?? [])).toEqual([0, 1]);

    // Row 0 is one masked entry, so the stable softmax gives exactly 1.
    expect(head.scores[0]?.[0]).toBeCloseTo(c / Math.SQRT2, 12);
    expect(Array.from(head.weights[0] ?? [])).toEqual([1]);

    // Row 1 is softmax([sin 1, cos 1] / sqrt 2), and out_1 = w0·(1, 0) + w1·(0, 1).
    const e0 = Math.exp(s / Math.SQRT2);
    const e1 = Math.exp(c / Math.SQRT2);
    const w0 = e0 / (e0 + e1);
    const w1 = e1 / (e0 + e1);
    expect(head.scores[1]?.[0]).toBeCloseTo(s / Math.SQRT2, 12);
    expect(head.scores[1]?.[1]).toBeCloseTo(c / Math.SQRT2, 12);
    expect(head.weights[1]?.[0]).toBeCloseTo(w0, 12);
    expect(head.weights[1]?.[1]).toBeCloseTo(w1, 12);
    expect(head.out[0]?.[0]).toBeCloseTo(1, 12);
    expect(head.out[0]?.[1]).toBeCloseTo(0, 12);
    expect(head.out[1]?.[0]).toBeCloseTo(w0, 12);
    expect(head.out[1]?.[1]).toBeCloseTo(w1, 12);
  });
});

describe("collapsed preset", () => {
  it("peaks head 1's last row at the preceding position with positional encoding on", () => {
    for (const sequence of SEQUENCE_KEYS) {
      const row = run("collapsed", sequence).heads[0]?.weights[4];
      if (!row) throw new Error(`missing head 1 last row for ${sequence}`);
      expect(argmax(row)).toBe(3);
      const sorted = Array.from(row).sort((a, b) => b - a);
      expect((sorted[0] ?? 0) - (sorted[1] ?? 0)).toBeGreaterThanOrEqual(0.03);
    }
    const catSat = run("collapsed", "cat-sat").heads[0]?.weights[4];
    if (!catSat) throw new Error("missing cat-sat head 1 last row");
    [0.115, 0.144, 0.223, 0.29, 0.227].forEach((value, i) =>
      expect(catSat[i] ?? NaN).toBeCloseTo(value, 3),
    );
  });

  it("goes uniform in both heads with positional encoding off", () => {
    for (const sequence of SEQUENCE_KEYS) {
      for (const head of run("collapsed", sequence, false).heads) {
        head.weights.forEach((row, i) => {
          for (const weight of row) expect(Math.abs(weight - 1 / (i + 1))).toBeLessThan(0.01);
        });
      }
    }
  });
});

describe("tuned preset", () => {
  it("lets content beat position: head 1's last-row argmax is 1, 0, 0 and never 3", () => {
    const expected: Record<(typeof SEQUENCE_KEYS)[number], number> = {
      "cat-sat": 1,
      "dog-ran": 0,
      scrambled: 0,
    };
    for (const sequence of SEQUENCE_KEYS) {
      const row = run("tuned", sequence).heads[0]?.weights[4];
      if (!row) throw new Error(`missing head 1 last row for ${sequence}`);
      expect(argmax(row)).toBe(expected[sequence]);
      expect(argmax(row)).not.toBe(3);
    }
  });
});

describe("constants", () => {
  it("match the spec, so a screenshot-invalidating edit fails here first", () => {
    expect(PE_SCALE).toBe(0.8);
    // Head 1 leans positional (W_Q = R(−1)); head 2 leans content with a 0.8 value scale.
    expect(Array.from(W_Q[0] ?? [])).toEqual([Math.cos(1), Math.sin(1), -Math.sin(1), Math.cos(1)]);
    expect(Array.from(W_Q[1] ?? [])).toEqual([1, 0, 0, 1]);
    expect(Array.from(W_K[0] ?? [])).toEqual([1, 0, 0, 1]);
    expect(Array.from(W_K[1] ?? [])).toEqual([1, 0, 0, 1]);
    expect(Array.from(W_V[0] ?? [])).toEqual([1, 0, 0, 1]);
    expect(Array.from(W_V[1] ?? [])).toEqual([0.8, 0, 0, 0.8]);
    expect(Array.from(W_O)).toEqual([0.6, 0, 0.4, 0, 0, 0.6, 0, 0.4]);
    expect(Array.from(W1)).toEqual([1.2, 0.3, -0.4, 1.1, 0.9, -1, -1.1, -0.5]);
    expect(Array.from(b1)).toEqual([0.1, -0.2, 0, 0.15]);
    expect(Array.from(W2)).toEqual([0.25, -0.15, 0.3, 0.1, 0.1, 0.35, -0.2, 0.25]);
    expect(Array.from(b2)).toEqual([0, 0]);
  });

  it("keeps the vocabulary, sequences and presets the scene names", () => {
    expect(VOCAB).toEqual(["the", "cat", "sat", "on", "mat", "dog", "ran", "fast"]);
    expect(SEQUENCES["cat-sat"]).toEqual([0, 1, 2, 3, 0]);
    expect(SEQUENCES["dog-ran"]).toEqual([0, 5, 6, 3, 0]);
    expect(SEQUENCES.scrambled).toEqual([3, 0, 4, 2, 1]);
    for (const preset of PRESET_KEYS) expect(EMBEDDING_PRESETS[preset]).toHaveLength(8);
  });
});

describe("probabilities", () => {
  const logits = run("tuned", "cat-sat").logits;

  it("sums to 1 and preserves the logit order at every temperature", () => {
    for (const t of [0.2, 1, 3]) {
      const p = probabilities(logits, t);
      expect(sum(p)).toBeCloseTo(1, 12);
      const byLogit = [...logits.keys()].sort((a, b) => (logits[b] ?? 0) - (logits[a] ?? 0));
      const byProbability = [...p.keys()].sort((a, b) => (p[b] ?? 0) - (p[a] ?? 0));
      expect(byProbability).toEqual(byLogit);
    }
  });

  it("concentrates more mass on the argmax at a low temperature than a high one", () => {
    const top = argmax(logits);
    const cold = probabilities(logits, 0.2)[top] ?? 0;
    const warm = probabilities(logits, 1)[top] ?? 0;
    const hot = probabilities(logits, 3)[top] ?? 0;
    expect(cold).toBeGreaterThan(warm);
    expect(warm).toBeGreaterThan(hot);
  });
});

describe("determinism", () => {
  it("returns equal numbers for two calls on equal inputs", () => {
    const embeddings = (): Embeddings => EMBEDDING_PRESETS.tuned.map(([x, y]) => [x, y] as const);
    const plain = (f: Forward): unknown => ({
      x: f.x.map((v) => Array.from(v)),
      pe: f.pe.map((v) => Array.from(v)),
      heads: f.heads.map((h) => ({
        q: h.q.map((v) => Array.from(v)),
        k: h.k.map((v) => Array.from(v)),
        v: h.v.map((v) => Array.from(v)),
        scores: h.scores.map((v) => Array.from(v)),
        weights: h.weights.map((v) => Array.from(v)),
        out: h.out.map((v) => Array.from(v)),
      })),
      attnOut: f.attnOut.map((v) => Array.from(v)),
      xResid: f.xResid.map((v) => Array.from(v)),
      mlpHidden: f.mlpHidden.map((v) => Array.from(v)),
      mlpOut: f.mlpOut.map((v) => Array.from(v)),
      xFinal: f.xFinal.map((v) => Array.from(v)),
      logits: Array.from(f.logits),
    });
    const input = { sequence: [...SEQUENCES["cat-sat"]], positional: true, causal: true };
    expect(plain(forward({ ...input, embeddings: embeddings() }))).toEqual(
      plain(forward({ ...input, embeddings: embeddings() })),
    );
  });
});
