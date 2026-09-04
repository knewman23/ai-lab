/**
 * One GPT block at `d_model = 2`: embed + position → two heads → residual → MLP → residual →
 * a weight-tied unembedding. Small enough that a token's vector is a point on a plane, so the
 * scene can draw every intermediate. Pure; the scene reads only what `forward` returns.
 *
 * The computation runs in `Vec2`, so the fixed widths are checked by the compiler; `forward`
 * converts to the `Float64Array`s its interface promises once, at the return.
 */

import { apply, type Mat2 } from "./matrix2";
import type { Vec2 } from "./numeric";

/** Vocabulary order fixes every index in `SEQUENCES` and every logit slot. */
export const VOCAB = ["the", "cat", "sat", "on", "mat", "dog", "ran", "fast"] as const;

/** One token's position in embedding space; eight of them, in vocabulary order. */
export type Embeddings = readonly Vec2[];

/** Five positions each, as vocabulary indices. */
export const SEQUENCES = {
  "cat-sat": [0, 1, 2, 3, 0],
  "dog-ran": [0, 5, 6, 3, 0],
  scrambled: [3, 0, 4, 2, 1],
} as const satisfies Record<string, readonly number[]>;

/** Eight points on a circle of radius `r` at k · 45°. */
function circle(r: number): Embeddings {
  return Array.from({ length: 8 }, (_, k) => {
    const angle = (k * Math.PI) / 4;
    return [r * Math.cos(angle), r * Math.sin(angle)] as const;
  });
}

/**
 * `tuned` groups the parts of speech; `collapsed` carries almost no information — its radius is
 * 0.1 rather than 0 so the eight floor points stay separately draggable; `spread` is maximally
 * distinguishable but semantically arbitrary.
 */
export const EMBEDDING_PRESETS = {
  tuned: [
    [0, 1.6],
    [1.4, 0.8],
    [-1.4, 0.6],
    [-0.6, -1.4],
    [1.2, -1],
    [1.6, 0.2],
    [-1.6, 0],
    [0.4, -1.6],
  ],
  collapsed: circle(0.1),
  spread: circle(1.8),
} as const satisfies Record<string, Embeddings>;

/** The MLP's hidden layer, and a 2×4 or 4×2 matrix stored row-major. */
export type Vec4 = readonly [number, number, number, number];
export type Mat2x4 = readonly [number, number, number, number, number, number, number, number];

function rotation(theta: number): Mat2 {
  const c = Math.cos(theta);
  const s = Math.sin(theta);
  return [c, -s, s, c];
}

const IDENTITY: Mat2 = [1, 0, 0, 1];

/**
 * The one frequency `d_model = 2` has room for: `pe(p) = PE_SCALE · (cos p, sin p)`. At 0.8 head
 * 1's positional bias is visible as a difference in arc thickness at the `collapsed` preset while
 * the `tuned` embeddings still outcompete it. Changing it is a spec revision, not an edit.
 */
export const PE_SCALE = 0.8;

/** Head 1 leans positional: `R(-1) · pe(p) = pe(p - 1)`. Head 2 leans content. */
export const W_Q: readonly [Mat2, Mat2] = [rotation(-1), IDENTITY];
export const W_K: readonly [Mat2, Mat2] = [IDENTITY, IDENTITY];
export const W_V: readonly [Mat2, Mat2] = [IDENTITY, [0.8, 0, 0, 0.8]];

/** 2×4 row-major over the concatenated head outputs: 0.6 · o¹ + 0.4 · o². */
export const W_O: Mat2x4 = [0.6, 0, 0.4, 0, 0, 0.6, 0, 0.4];

/** 4×2 row-major, then 2×4 row-major; chosen so the MLP is visible without dominating. */
export const W1: Mat2x4 = [1.2, 0.3, -0.4, 1.1, 0.9, -1, -1.1, -0.5];
export const b1: Vec4 = [0.1, -0.2, 0, 0.15];
export const W2: Mat2x4 = [0.25, -0.15, 0.3, 0.1, 0.1, 0.35, -0.2, 0.25];
export const b2: Vec2 = [0, 0];

/** One head's three projections, bundled so `attend` never indexes the parallel arrays above. */
interface HeadWeights {
  readonly wq: Mat2;
  readonly wk: Mat2;
  readonly wv: Mat2;
}

const HEADS: readonly [HeadWeights, HeadWeights] = [
  { wq: W_Q[0], wk: W_K[0], wv: W_V[0] },
  { wq: W_Q[1], wk: W_K[1], wv: W_V[1] },
];

export interface ForwardInput {
  readonly embeddings: Embeddings; // length 8
  readonly sequence: readonly number[]; // vocabulary indices
  readonly positional: boolean; // add pe(p) or not
  readonly causal: boolean; // mask j > i or not
}

export interface HeadPass {
  readonly q: readonly Float64Array[];
  readonly k: readonly Float64Array[];
  readonly v: readonly Float64Array[];
  /** Row `i` holds `i + 1` entries when causal and all of them otherwise: masked keys are absent. */
  readonly scores: readonly Float64Array[];
  readonly weights: readonly Float64Array[];
  readonly out: readonly Float64Array[];
}

export interface Forward {
  readonly x: readonly Float64Array[]; // after embed + position
  readonly pe: readonly Float64Array[]; // pe(p), or zeros when positional is false
  readonly heads: readonly HeadPass[];
  readonly attnOut: readonly Float64Array[]; // after W_O
  readonly xResid: readonly Float64Array[]; // x + attnOut
  readonly mlpHidden: readonly Float64Array[]; // the four tanh activations
  readonly mlpOut: readonly Float64Array[];
  readonly xFinal: readonly Float64Array[]; // xResid + mlpOut
  readonly logits: Float64Array; // length 8, from xFinal[last]
}

/** `attend`'s result before `forward` widens the 2-vectors to the interface's arrays. */
interface Head {
  readonly q: readonly Vec2[];
  readonly k: readonly Vec2[];
  readonly v: readonly Vec2[];
  readonly scores: readonly Float64Array[];
  readonly weights: readonly Float64Array[];
  readonly out: readonly Vec2[];
}

const add = (a: Vec2, b: Vec2): Vec2 => [a[0] + b[0], a[1] + b[1]];
const dot = (a: Vec2, b: Vec2): number => a[0] * b[0] + a[1] * b[1];

/** The numerically stable form, so a masked row of one entry gives exactly 1. */
function softmax(values: Float64Array): Float64Array {
  const max = values.reduce((a, b) => Math.max(a, b), -Infinity);
  const exponentials = Float64Array.from(values, (value) => Math.exp(value - max));
  const total = exponentials.reduce((a, b) => a + b, 0);
  return Float64Array.from(exponentials, (e) => e / total);
}

function attend(x: readonly Vec2[], head: HeadWeights, causal: boolean): Head {
  const q = x.map((v) => apply(head.wq, v));
  const k = x.map((v) => apply(head.wk, v));
  const v = x.map((u) => apply(head.wv, u));
  const scores: Float64Array[] = [];
  const weights: Float64Array[] = [];
  const out: Vec2[] = [];
  q.forEach((qi, i) => {
    const width = causal ? i + 1 : x.length;
    const row = Float64Array.from(k.slice(0, width), (kj) => dot(qi, kj) / Math.SQRT2);
    const a = softmax(row);
    scores.push(row);
    weights.push(a);
    out.push(
      v.slice(0, width).reduce<Vec2>(
        (sum, vj, j) => {
          const w = a[j] ?? 0;
          return [sum[0] + w * vj[0], sum[1] + w * vj[1]];
        },
        [0, 0],
      ),
    );
  });
  return { q, k, v, scores, weights, out };
}

/** `W_O` applied to the two heads' concatenated outputs. */
function projectHeads(o1: Vec2, o2: Vec2): Vec2 {
  return [
    W_O[0] * o1[0] + W_O[1] * o1[1] + W_O[2] * o2[0] + W_O[3] * o2[1],
    W_O[4] * o1[0] + W_O[5] * o1[1] + W_O[6] * o2[0] + W_O[7] * o2[1],
  ];
}

/** Both heads run over the same positions, so the index is in range by construction. */
function outAt(head: Head, i: number): Vec2 {
  const o = head.out[i];
  if (!o) throw new Error(`transformer: missing head output at ${i}`);
  return o;
}

const widen = (vectors: readonly (readonly number[])[]): Float64Array[] =>
  vectors.map((v) => Float64Array.from(v));

/** The whole block in one call: everything the scene draws comes out of here. */
export function forward(input: ForwardInput): Forward {
  const { embeddings, sequence, positional, causal } = input;

  const pe: Vec2[] = sequence.map((_, p) =>
    positional ? [PE_SCALE * Math.cos(p), PE_SCALE * Math.sin(p)] : [0, 0],
  );
  const x = sequence.map((token, p): Vec2 => {
    const e = embeddings[token];
    if (!e) throw new Error(`transformer: no embedding for token ${token}`);
    return add(e, pe[p] ?? [0, 0]);
  });

  const heads = [attend(x, HEADS[0], causal), attend(x, HEADS[1], causal)] as const;
  const attnOut = x.map((_, i) => projectHeads(outAt(heads[0], i), outAt(heads[1], i)));
  const xResid = x.map((v, i) => add(v, attnOut[i] ?? [0, 0]));

  const mlpHidden = xResid.map((v): Vec4 => [
    Math.tanh(W1[0] * v[0] + W1[1] * v[1] + b1[0]),
    Math.tanh(W1[2] * v[0] + W1[3] * v[1] + b1[1]),
    Math.tanh(W1[4] * v[0] + W1[5] * v[1] + b1[2]),
    Math.tanh(W1[6] * v[0] + W1[7] * v[1] + b1[3]),
  ]);
  const mlpOut = mlpHidden.map((h): Vec2 => [
    W2[0] * h[0] + W2[1] * h[1] + W2[2] * h[2] + W2[3] * h[3] + b2[0],
    W2[4] * h[0] + W2[5] * h[1] + W2[6] * h[2] + W2[7] * h[3] + b2[1],
  ]);
  const xFinal = xResid.map((v, i) => add(v, mlpOut[i] ?? [0, 0]));

  // Weight-tied unembedding: a logit is the final vector's dot product with a draggable point.
  const last = xFinal[xFinal.length - 1];
  if (!last) throw new Error("transformer: forward needs at least one position");
  const logits = Float64Array.from(embeddings, (e) => dot(last, e));

  return {
    x: widen(x),
    pe: widen(pe),
    heads: heads.map((head) => ({
      ...head, // scores and weights are already Float64Array rows of the mask's width
      q: widen(head.q),
      k: widen(head.k),
      v: widen(head.v),
      out: widen(head.out),
    })),
    attnOut: widen(attnOut),
    xResid: widen(xResid),
    mlpHidden: widen(mlpHidden),
    mlpOut: widen(mlpOut),
    xFinal: widen(xFinal),
    logits,
  };
}

/**
 * `softmax(logits / T)`. Separate from `forward` so the temperature slider costs one softmax
 * rather than a whole forward pass.
 */
export function probabilities(logits: Float64Array, t = 1): Float64Array {
  if (t <= 0) throw new Error(`transformer: probabilities needs T > 0, got ${t}`);
  return softmax(Float64Array.from(logits, (logit) => logit / t));
}
