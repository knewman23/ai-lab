import { describe, expect, it } from "vitest";
import {
  b1,
  b2,
  EMBEDDING_PRESETS,
  forward,
  PE_SCALE,
  SEQUENCES,
  W1,
  W2,
  W_K,
  W_O,
  W_Q,
  W_V,
  type Embeddings,
} from "../../../src/core/math/transformer";

/**
 * A second implementation of the whole block, written from the published weights rather than
 * from `forward`, and compared against it over every preset, sentence and toggle.
 *
 * The fixture in `transformer.test.ts` pins head 1 on two positions with basis embeddings, which
 * is a sharp check of attention and a blind spot everywhere else: W_O's mixing, the two residual
 * adds, the MLP and the tied unembedding are all downstream of it. A dropped residual add or a
 * transposed W2 row would leave every attention assertion green. This is the check that fails.
 *
 * It is deliberately naive — loops and explicit indices, no shared helpers with the source — so
 * that agreement is evidence rather than the same expression evaluated twice.
 *
 * What it does **not** cover: the weights themselves. The reference imports the same constants
 * the source does, so changing one changes both sides and this file stays green — a mutation run
 * confirmed that for W_O and W2. Those are pinned as literals by "constants match the spec" in
 * `transformer.test.ts`, which catches both. Structure here, values there.
 */

type V2 = [number, number];

const PRESET_KEYS = ["tuned", "collapsed", "spread"] as const;
const SEQUENCE_KEYS = ["cat-sat", "dog-ran", "scrambled"] as const;

function at<T>(items: ArrayLike<T>, i: number, what: string): T {
  const item = items[i];
  if (item === undefined) throw new Error(`${what}: nothing at index ${i}`);
  return item;
}

/** M · v for a row-major 2×2. */
function mul2(m: readonly number[], v: V2): V2 {
  return [
    at(m, 0, "matrix") * v[0] + at(m, 1, "matrix") * v[1],
    at(m, 2, "matrix") * v[0] + at(m, 3, "matrix") * v[1],
  ];
}

interface ReferenceHead {
  readonly weights: readonly number[][];
  readonly out: readonly V2[];
}

function attendReference(
  x: readonly V2[],
  wq: readonly number[],
  wk: readonly number[],
  wv: readonly number[],
  causal: boolean,
): ReferenceHead {
  const q = x.map((v) => mul2(wq, v));
  const k = x.map((v) => mul2(wk, v));
  const v = x.map((u) => mul2(wv, u));

  const weights: number[][] = [];
  const out: V2[] = [];
  for (let i = 0; i < x.length; i += 1) {
    const width = causal ? i + 1 : x.length;
    const qi = at(q, i, "query");

    const scores: number[] = [];
    for (let j = 0; j < width; j += 1) {
      const kj = at(k, j, "key");
      scores.push((qi[0] * kj[0] + qi[1] * kj[1]) / Math.sqrt(2));
    }

    const highest = Math.max(...scores);
    const exponentials = scores.map((s) => Math.exp(s - highest));
    const total = exponentials.reduce((a, b) => a + b, 0);
    const row = exponentials.map((e) => e / total);
    weights.push(row);

    let sum: V2 = [0, 0];
    for (let j = 0; j < width; j += 1) {
      const vj = at(v, j, "value");
      const w = at(row, j, "weight");
      sum = [sum[0] + w * vj[0], sum[1] + w * vj[1]];
    }
    out.push(sum);
  }
  return { weights, out };
}

function reference(
  embeddings: Embeddings,
  sequence: readonly number[],
  positional: boolean,
  causal: boolean,
): {
  readonly heads: readonly ReferenceHead[];
  readonly xFinal: readonly V2[];
  readonly logits: readonly number[];
} {
  // Embed, then add the one frequency d_model = 2 has room for.
  const x: V2[] = sequence.map((token, p) => {
    const e = at(embeddings, token, "embedding");
    return positional
      ? [e[0] + PE_SCALE * Math.cos(p), e[1] + PE_SCALE * Math.sin(p)]
      : [e[0], e[1]];
  });

  const head1 = attendReference(x, at(W_Q, 0, "W_Q"), at(W_K, 0, "W_K"), at(W_V, 0, "W_V"), causal);
  const head2 = attendReference(x, at(W_Q, 1, "W_Q"), at(W_K, 1, "W_K"), at(W_V, 1, "W_V"), causal);

  const xFinal: V2[] = [];
  for (let i = 0; i < x.length; i += 1) {
    const o1 = at(head1.out, i, "head 1 output");
    const o2 = at(head2.out, i, "head 2 output");

    // W_O over the concatenated head outputs.
    const attn: V2 = [
      W_O[0] * o1[0] + W_O[1] * o1[1] + W_O[2] * o2[0] + W_O[3] * o2[1],
      W_O[4] * o1[0] + W_O[5] * o1[1] + W_O[6] * o2[0] + W_O[7] * o2[1],
    ];

    // First residual add.
    const xi = at(x, i, "embedded token");
    const resid: V2 = [xi[0] + attn[0], xi[1] + attn[1]];

    // tanh(W1 r + b1), then W2 h + b2.
    const h = [
      Math.tanh(W1[0] * resid[0] + W1[1] * resid[1] + b1[0]),
      Math.tanh(W1[2] * resid[0] + W1[3] * resid[1] + b1[1]),
      Math.tanh(W1[4] * resid[0] + W1[5] * resid[1] + b1[2]),
      Math.tanh(W1[6] * resid[0] + W1[7] * resid[1] + b1[3]),
    ] as const;
    const mlp: V2 = [
      W2[0] * h[0] + W2[1] * h[1] + W2[2] * h[2] + W2[3] * h[3] + b2[0],
      W2[4] * h[0] + W2[5] * h[1] + W2[6] * h[2] + W2[7] * h[3] + b2[1],
    ];

    // Second residual add.
    xFinal.push([resid[0] + mlp[0], resid[1] + mlp[1]]);
  }

  // Weight tying: a logit is the last position's final vector dotted with a vocabulary point.
  const last = at(xFinal, xFinal.length - 1, "final vector");
  const logits = embeddings.map((e) => last[0] * e[0] + last[1] * e[1]);
  return { heads: [head1, head2], xFinal, logits };
}

describe("the block against an independent transcription", () => {
  const cases = PRESET_KEYS.flatMap((preset) =>
    SEQUENCE_KEYS.flatMap((sequence) =>
      [true, false].flatMap((positional) =>
        [true, false].map((causal) => ({ preset, sequence, positional, causal })),
      ),
    ),
  );

  it.each(cases)(
    "matches on $preset / $sequence (positional $positional, causal $causal)",
    ({ preset, sequence, positional, causal }) => {
      const embeddings = EMBEDDING_PRESETS[preset];
      const tokens = SEQUENCES[sequence];
      const got = forward({ embeddings, sequence: tokens, positional, causal });
      const want = reference(embeddings, tokens, positional, causal);

      // The residual stream leaving the block, which every stage above feeds.
      got.xFinal.forEach((v, i) => {
        const expected = at(want.xFinal, i, "reference final vector");
        expect(at(v, 0, "final x")).toBeCloseTo(expected[0], 12);
        expect(at(v, 1, "final y")).toBeCloseTo(expected[1], 12);
      });

      // The tied unembedding's output: the bars the scene draws.
      expect(got.logits.length).toBe(want.logits.length);
      got.logits.forEach((logit, i) => {
        expect(logit).toBeCloseTo(at(want.logits, i, "reference logit"), 12);
      });

      // Both attention rows, including the mask's shape.
      got.heads.forEach((head, h) => {
        const expected = at(want.heads, h, "reference head");
        expect(head.weights.length).toBe(expected.weights.length);
        head.weights.forEach((row, i) => {
          const expectedRow = at(expected.weights, i, "reference row");
          expect(row.length, `head ${h + 1} row ${i} width`).toBe(expectedRow.length);
          row.forEach((w, j) => {
            expect(w).toBeCloseTo(at(expectedRow, j, "reference weight"), 12);
          });
        });
      });
    },
  );

  it("would notice a dropped residual add", () => {
    // Guards the guard: the reference is only worth having if the comparison is sharp enough to
    // catch the class of error it exists for.
    const embeddings = EMBEDDING_PRESETS.tuned;
    const tokens = SEQUENCES["cat-sat"];
    const want = reference(embeddings, tokens, true, true);
    const got = forward({ embeddings, sequence: tokens, positional: true, causal: true });

    const withoutMlpResidual = at(got.xResid, got.xResid.length - 1, "residual stream");
    const withIt = at(want.xFinal, want.xFinal.length - 1, "reference final vector");
    expect(at(withoutMlpResidual, 0, "x")).not.toBeCloseTo(withIt[0], 6);
  });
});
