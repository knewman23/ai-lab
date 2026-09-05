/**
 * The §7 readout table: for the focused stage, its equation and the current numbers for the
 * selected query. Every number here is read out of `forward`'s result — criterion §1.2 — so a
 * stage that wants a quantity gets it added to `Forward` rather than recomputed in the panel.
 */

import type { HeadPass } from "../../core/math/transformer";
import { VOCAB } from "../../core/math/transformer";
import { fmt } from "../../ui/readout";
import {
  BLEND,
  LAST_POSITION,
  PROJECTION,
  SCORE_BLEND,
  SINGLE_KEY,
  WEIGHT_BLEND,
} from "./explanation";
import type { Derived, GptState, HeadKey, StageKey } from "./state";

export type ReadoutRow = readonly [key: string, text: string];

export interface StageReadout {
  readonly tex: string;
  readonly rows: readonly ReadoutRow[];
  /** The caveat under the rows: what the numbers are not. Empty when the stage has none. */
  readonly note: string;
}

const TEX: Readonly<Record<StageKey, string>> = {
  all: "\\mathrm{Attention}(Q,K,V) = \\mathrm{softmax}\\!\\left(QK^{\\top}/\\sqrt{d}\\right)V",
  embed: "x_p = e_{t_p} + \\mathrm{pe}(p)",
  scores: "s_{ij} = (q_i \\cdot k_j)/\\sqrt{d}",
  softmax: "a_i = \\mathrm{softmax}(s_i)",
  weighted: "o_i = \\sum_j a_{ij} v_j",
  residual: "x'_i = x_i + o_i",
  mlp: "x''_i = x'_i + W_2 \\tanh(W_1 x'_i + b_1) + b_2",
  logits: "p = \\mathrm{softmax}(x''_{\\mathrm{last}} \\cdot E / T)",
};

const HEAD_INDICES: Readonly<Record<HeadKey, readonly number[]>> = {
  head1: [0],
  head2: [1],
  both: [0, 1],
};

function pick<T>(items: ArrayLike<T>, i: number, what: string): T {
  const item = items[i];
  if (item === undefined) throw new Error(`gpt readouts: no ${what} at ${i}`);
  return item;
}

const vec = (v: ArrayLike<number>): string =>
  `(${fmt(pick(v, 0, "component"))}, ${fmt(pick(v, 1, "component"))})`;

const nums = (v: ArrayLike<number>): string => Array.from(v, (n) => fmt(n)).join(", ");

/** A causal row holds `i + 1` entries; the keys it cannot see are absent, and read as "—". */
const masked = (row: Float64Array, width: number): string =>
  Array.from({ length: width }, (_, j) => (j < row.length ? fmt(pick(row, j, "score")) : "—")) //
    .join(", ");

const heads = (s: GptState, d: Derived): { n: number; head: HeadPass }[] =>
  HEAD_INDICES[s.head].map((n) => ({ n, head: pick(d.pass.heads, n, "head") }));

const weightRow = (head: HeadPass, s: GptState): Float64Array =>
  pick(head.weights, s.query, "weight row");

/** Vocabulary indices by descending probability, which both the logit rows and the top-3 use. */
const ranked = (d: Derived): number[] =>
  Array.from(d.probabilities.keys()).sort(
    (a, b) => pick(d.probabilities, b, "probability") - pick(d.probabilities, a, "probability"),
  );

/** `0.6 a¹ + 0.32 a²`: each key's real contribution to `attnOut`, which sums to 0.92, not 1. */
function blend(s: GptState, d: Derived): Float64Array {
  const a1 = weightRow(pick(d.pass.heads, 0, "head"), s);
  const a2 = weightRow(pick(d.pass.heads, 1, "head"), s);
  return Float64Array.from(a1, (w, j) => BLEND[0] * w + BLEND[1] * pick(a2, j, "weight"));
}

function weightRows(s: GptState, d: Derived): ReadoutRow[] {
  const selected = heads(s, d);
  const rows = selected.map(({ n, head }): ReadoutRow => [
    `Head ${n + 1} weights`,
    nums(weightRow(head, s)),
  ]);
  if (s.head === "both") return [...rows, ["Blend", nums(blend(s, d))]];
  const { head } = pick(selected, 0, "head");
  return [...rows, ["Sum", fmt(weightRow(head, s).reduce((a, b) => a + b, 0))]];
}

function weightedRows(s: GptState, d: Derived): ReadoutRow[] {
  const rows = heads(s, d).flatMap(({ n, head }): ReadoutRow[] => {
    const terms = Array.from(
      weightRow(head, s),
      (w, j) => `${fmt(w)} × ${vec(pick(head.v, j, "value"))}`,
    );
    return [
      [`Head ${n + 1} terms`, terms.join(" + ")],
      [`Head ${n + 1} total`, vec(pick(head.out, s.query, "head output"))],
    ];
  });
  if (s.head !== "both") return rows;
  return [...rows, ["attnOut", vec(pick(d.pass.attnOut, s.query, "attnOut"))]];
}

/** The three likeliest next words, "the 0.7892, sat 0.1306, cat 0.0414". */
const topTokens = (d: Derived): string =>
  ranked(d)
    .slice(0, 3)
    .map((v) => `${pick(VOCAB, v, "word")} ${fmt(pick(d.probabilities, v, "probability"))}`)
    .join(", ");

const ROWS: Readonly<Record<StageKey, (s: GptState, d: Derived) => ReadoutRow[]>> = {
  all: (s, d) => [...weightRows(s, d), ["Next token", topTokens(d)]],
  embed: (s, d) => {
    const token = pick(d.sequence, s.query, "token");
    const word = pick(VOCAB, token, "word");
    return [
      ["Embedding", `${word} ${vec(pick(s.embeddings, token, "embedding"))}`],
      [`pe(${s.query})`, vec(pick(d.pass.pe, s.query, "pe"))],
      [`x(${s.query})`, vec(pick(d.pass.x, s.query, "x"))],
    ];
  },
  scores: (s, d) =>
    heads(s, d).map(({ n, head }) => [
      `Head ${n + 1} scores`,
      masked(pick(head.scores, s.query, "score row"), d.sequence.length),
    ]),
  softmax: weightRows,
  weighted: weightedRows,
  residual: (s, d) => [
    [`x(${s.query})`, vec(pick(d.pass.x, s.query, "x"))],
    ["attnOut", vec(pick(d.pass.attnOut, s.query, "attnOut"))],
    [`x'(${s.query})`, vec(pick(d.pass.xResid, s.query, "xResid"))],
  ],
  mlp: (s, d) => [
    ["tanh(W₁x' + b₁)", nums(pick(d.pass.mlpHidden, s.query, "hidden"))],
    ["W₂h + b₂", vec(pick(d.pass.mlpOut, s.query, "mlpOut"))],
    [`x''(${s.query})`, vec(pick(d.pass.xFinal, s.query, "xFinal"))],
  ],
  logits: (_s, d) =>
    ranked(d).map((v) => [
      pick(VOCAB, v, "word"),
      `logit ${fmt(pick(d.pass.logits, v, "logit"))} → p ${fmt(pick(d.probabilities, v, "probability"))}`,
    ]),
};

/** The blend caveat when both heads are shown, plus the single-key one at query 0. */
function note(s: GptState, d: Derived, blended: string): string {
  const single = weightRow(pick(d.pass.heads, 0, "head"), s).length === 1;
  return [s.head === "both" ? blended : "", single ? SINGLE_KEY : ""]
    .filter((part) => part !== "")
    .join(" ");
}

const NOTES: Readonly<Record<StageKey, (s: GptState, d: Derived) => string>> = {
  all: (s, d) => note(s, d, WEIGHT_BLEND),
  embed: () => "",
  scores: (s, d) => note(s, d, SCORE_BLEND),
  softmax: (s, d) => note(s, d, WEIGHT_BLEND),
  weighted: (s, d) => note(s, d, PROJECTION),
  residual: () => "",
  mlp: () => "",
  logits: () => LAST_POSITION,
};

/** The equation, numbers and caveat for the focused stage at the selected query. */
export function stageReadout(s: GptState, d: Derived): StageReadout {
  return { tex: TEX[s.stage], rows: ROWS[s.stage](s, d), note: NOTES[s.stage](s, d) };
}
