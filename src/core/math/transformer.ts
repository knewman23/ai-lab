/**
 * One GPT block at `d_model = 2`: embed + position → two heads → residual → MLP → residual →
 * a weight-tied unembedding. Small enough that a token's vector is a point on a plane, so the
 * scene can draw every intermediate. Pure; the scene reads only what `forward` returns.
 */

/** Vocabulary order fixes every index in `SEQUENCES` and every logit slot. */
export const VOCAB = ["the", "cat", "sat", "on", "mat", "dog", "ran", "fast"] as const;

/** One token's position in embedding space; eight of them, in vocabulary order. */
export type Embeddings = readonly (readonly [number, number])[];

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

/** A 2×2 matrix, row-major. */
export type Matrix2 = readonly [number, number, number, number];

function rotation(theta: number): Matrix2 {
  const c = Math.cos(theta);
  const s = Math.sin(theta);
  return [c, -s, s, c];
}

const IDENTITY: Matrix2 = [1, 0, 0, 1];

/**
 * The one frequency `d_model = 2` has room for: `pe(p) = PE_SCALE · (cos p, sin p)`. At 0.8 head
 * 1's positional bias is visible as a difference in arc thickness at the `collapsed` preset while
 * the `tuned` embeddings still outcompete it. Changing it is a spec revision, not an edit.
 */
export const PE_SCALE = 0.8;

/** Head 1 leans positional: `R(-1) · pe(p) = pe(p - 1)`. Head 2 leans content. */
export const W_Q: readonly Matrix2[] = [rotation(-1), IDENTITY];
export const W_K: readonly Matrix2[] = [IDENTITY, IDENTITY];
export const W_V: readonly Matrix2[] = [IDENTITY, [0.8, 0, 0, 0.8]];

/** 2×4 row-major: 0.6 · o¹ + 0.4 · o². */
export const W_O: readonly number[] = [0.6, 0, 0.4, 0, 0, 0.6, 0, 0.4];

/** 4×2 row-major, then 2×4 row-major; chosen so the MLP is visible without dominating. */
export const W1: readonly number[] = [1.2, 0.3, -0.4, 1.1, 0.9, -1, -1.1, -0.5];
export const b1: readonly number[] = [0.1, -0.2, 0, 0.15];
export const W2: readonly number[] = [0.25, -0.15, 0.3, 0.1, 0.1, 0.35, -0.2, 0.25];
export const b2: readonly number[] = [0, 0];

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

const at = (v: Float64Array, i: number): number => v[i] ?? 0;
const cell = (m: readonly number[], i: number): number => m[i] ?? 0;

/** `M · v` for a row-major 2×2. */
function apply2(m: Matrix2, v: Float64Array): Float64Array {
  return Float64Array.of(m[0] * at(v, 0) + m[1] * at(v, 1), m[2] * at(v, 0) + m[3] * at(v, 1));
}

/** The numerically stable form, so a masked row of one entry gives exactly 1. */
function softmax(values: Float64Array): Float64Array {
  let max = -Infinity;
  for (const value of values) max = Math.max(max, value);
  const out = new Float64Array(values.length);
  let total = 0;
  for (let i = 0; i < out.length; i++) {
    const e = Math.exp(at(values, i) - max);
    out[i] = e;
    total += e;
  }
  for (let i = 0; i < out.length; i++) out[i] = at(out, i) / total;
  return out;
}

function attend(x: readonly Float64Array[], head: number, causal: boolean): HeadPass {
  const wq = W_Q[head] ?? IDENTITY;
  const wk = W_K[head] ?? IDENTITY;
  const wv = W_V[head] ?? IDENTITY;
  const q = x.map((v) => apply2(wq, v));
  const k = x.map((v) => apply2(wk, v));
  const v = x.map((u) => apply2(wv, u));
  const scores: Float64Array[] = [];
  const weights: Float64Array[] = [];
  const out: Float64Array[] = [];
  for (let i = 0; i < x.length; i++) {
    const width = causal ? i + 1 : x.length;
    const row = new Float64Array(width);
    for (let j = 0; j < width; j++) {
      const qi = q[i];
      const kj = k[j];
      if (!qi || !kj) throw new Error(`transformer: missing q/k at ${i},${j}`);
      row[j] = (at(qi, 0) * at(kj, 0) + at(qi, 1) * at(kj, 1)) / Math.SQRT2;
    }
    const a = softmax(row);
    const o = new Float64Array(2);
    for (let j = 0; j < width; j++) {
      const vj = v[j];
      if (!vj) throw new Error(`transformer: missing v at ${j}`);
      o[0] = at(o, 0) + at(a, j) * at(vj, 0);
      o[1] = at(o, 1) + at(a, j) * at(vj, 1);
    }
    scores.push(row);
    weights.push(a);
    out.push(o);
  }
  return { q, k, v, scores, weights, out };
}

/** The whole block in one call: everything the scene draws comes out of here. */
export function forward(input: ForwardInput): Forward {
  const { embeddings, sequence, positional, causal } = input;
  const pe = sequence.map((_, p) =>
    positional
      ? Float64Array.of(PE_SCALE * Math.cos(p), PE_SCALE * Math.sin(p))
      : new Float64Array(2),
  );
  const x = sequence.map((token, p) => {
    const e = embeddings[token];
    const offset = pe[p];
    if (!e || !offset) throw new Error(`transformer: no embedding for token ${token}`);
    return Float64Array.of(e[0] + at(offset, 0), e[1] + at(offset, 1));
  });

  const heads = W_Q.map((_, h) => attend(x, h, causal));
  const attnOut = x.map((_, i) => {
    const concat = heads.flatMap((head) => {
      const o = head.out[i];
      if (!o) throw new Error(`transformer: missing head output at ${i}`);
      return [at(o, 0), at(o, 1)];
    });
    const project = (r: number): number =>
      concat.reduce((total, value, n) => total + cell(W_O, r * concat.length + n) * value, 0);
    return Float64Array.of(project(0), project(1));
  });
  const xResid = x.map((v, i) => {
    const a = attnOut[i];
    if (!a) throw new Error(`transformer: missing attention output at ${i}`);
    return Float64Array.of(at(v, 0) + at(a, 0), at(v, 1) + at(a, 1));
  });

  const mlpHidden = xResid.map((v) => {
    const h = new Float64Array(b1.length);
    for (let n = 0; n < h.length; n++) {
      h[n] = Math.tanh(cell(W1, 2 * n) * at(v, 0) + cell(W1, 2 * n + 1) * at(v, 1) + cell(b1, n));
    }
    return h;
  });
  const mlpOut = mlpHidden.map((h) => {
    const m = new Float64Array(b2.length);
    for (let r = 0; r < m.length; r++) {
      let total = cell(b2, r);
      for (let n = 0; n < h.length; n++) total += cell(W2, r * h.length + n) * at(h, n);
      m[r] = total;
    }
    return m;
  });
  const xFinal = xResid.map((v, i) => {
    const m = mlpOut[i];
    if (!m) throw new Error(`transformer: missing MLP output at ${i}`);
    return Float64Array.of(at(v, 0) + at(m, 0), at(v, 1) + at(m, 1));
  });

  // Weight-tied unembedding: a logit is the final vector's dot product with a draggable point.
  const last = xFinal[xFinal.length - 1];
  const logits = new Float64Array(embeddings.length);
  for (let v = 0; v < embeddings.length; v++) {
    const e = embeddings[v];
    if (!last || !e) throw new Error(`transformer: cannot unembed ${v}`);
    logits[v] = at(last, 0) * e[0] + at(last, 1) * e[1];
  }

  return { x, pe, heads, attnOut, xResid, mlpHidden, mlpOut, xFinal, logits };
}

/**
 * `softmax(logits / T)`. Separate from `forward` so the temperature slider costs one softmax
 * rather than a whole forward pass.
 */
export function probabilities(logits: Float64Array, t = 1): Float64Array {
  const scaled = new Float64Array(logits.length);
  for (let i = 0; i < scaled.length; i++) scaled[i] = at(logits, i) / t;
  return softmax(scaled);
}
