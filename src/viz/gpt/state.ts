/**
 * The GPT scene's state and everything derived from it. Every control in the panel is a pure
 * setter here returning a new `GptState`, so nothing reaches into the scene's Three.js objects —
 * which is also what a later walkthrough mode needs.
 */

import type { Vec2 } from "../../core/math/numeric";
import type { Embeddings, Forward } from "../../core/math/transformer";
import { EMBEDDING_PRESETS, SEQUENCES, forward, probabilities } from "../../core/math/transformer";

export type SentenceKey = keyof typeof SEQUENCES;
export type PresetKey = keyof typeof EMBEDDING_PRESETS;
/** Which attention row the arcs draw: one head, or §6.4's blend of both. */
export type HeadKey = "head1" | "head2" | "both";
/** The focused stage: `all` leaves every band lit, the rest dim the others and expand one. */
export type StageKey =
  "all" | "embed" | "scores" | "softmax" | "weighted" | "residual" | "mlp" | "logits";

/** Bounds of the temperature slider, which is logarithmic between them. */
export const TEMPERATURE_RANGE: Vec2 = [0.2, 3];

export interface GptState {
  readonly sentence: SentenceKey;
  /** The preset the embeddings started from; `resetEmbeddings` returns to it after drags. */
  readonly preset: PresetKey;
  readonly embeddings: Embeddings;
  /** Sequence position whose attention row the arcs and readouts show. */
  readonly query: number;
  readonly head: HeadKey;
  readonly stage: StageKey;
  readonly temperature: number;
  readonly positional: boolean;
  readonly causal: boolean;
  readonly residualPath: boolean;
}

/**
 * Everything the scene reads at the current state. `pass` is the whole forward pass, so every
 * number on screen comes from the pure layer rather than being recomputed in the scene.
 */
export interface Derived {
  readonly sequence: readonly number[];
  readonly pass: Forward;
  /** `softmax(logits / T)`: separate from the pass, so the slider costs one softmax. */
  readonly probabilities: Float64Array;
}

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

/** `the cat sat on the` at the tuned preset, last token selected, both heads, every band lit. */
export function initialState(): GptState {
  return {
    sentence: "cat-sat",
    preset: "tuned",
    embeddings: EMBEDDING_PRESETS.tuned,
    query: SEQUENCES["cat-sat"].length - 1,
    head: "both",
    stage: "all",
    temperature: 1,
    positional: true,
    causal: true,
    residualPath: true,
  };
}

/** Switches sentence. The embeddings carry across: they are the scene's independent variable. */
export function setSentence(s: GptState, sentence: SentenceKey): GptState {
  return { ...s, sentence };
}

/** Switches preset, replacing all eight embeddings and discarding any drags. */
export function setPreset(s: GptState, preset: PresetKey): GptState {
  return { ...s, preset, embeddings: EMBEDDING_PRESETS[preset] };
}

/**
 * Moves one vocabulary word. `p` is expected to be in the embedding domain already —
 * `layout.embedFromFloor` clamps the drag, so this does not clamp a second time.
 */
export function setEmbedding(s: GptState, word: number, p: Vec2): GptState {
  if (s.embeddings[word] === undefined) throw new Error(`gpt state: no word ${word}`);
  return { ...s, embeddings: s.embeddings.map((e, v) => (v === word ? p : e)) };
}

/** Returns the current preset's positions after the words have been dragged. */
export function resetEmbeddings(s: GptState): GptState {
  return { ...s, embeddings: EMBEDDING_PRESETS[s.preset] };
}

/** Selects the query position. Throws rather than clamping: a click or select is in range or is a bug. */
export function setQuery(s: GptState, query: number): GptState {
  const length = SEQUENCES[s.sentence].length;
  if (!Number.isInteger(query) || query < 0 || query >= length) {
    throw new Error(`gpt state: query ${query} is outside 0..${length - 1}`);
  }
  return { ...s, query };
}

/** Selects which head's attention row the arcs draw. */
export function setHead(s: GptState, head: HeadKey): GptState {
  return { ...s, head };
}

/** Focuses one stage, dimming the other bands. */
export function setStage(s: GptState, stage: StageKey): GptState {
  return { ...s, stage };
}

/** Sets the softmax temperature, clamped to `TEMPERATURE_RANGE`. */
export function setTemperature(s: GptState, temperature: number): GptState {
  return { ...s, temperature: clamp(temperature, TEMPERATURE_RANGE[0], TEMPERATURE_RANGE[1]) };
}

/** Adds `pe(p)` to each token's embedding, or does not. */
export function setPositional(s: GptState, on: boolean): GptState {
  return { ...s, positional: on };
}

/** Masks keys after the query, or lets every token read every other one. */
export function setCausal(s: GptState, on: boolean): GptState {
  return { ...s, causal: on };
}

/** Shows the selected token's arrow chain on the floor, or hides it. */
export function setResidualPath(s: GptState, on: boolean): GptState {
  return { ...s, residualPath: on };
}

/**
 * The expensive half: the whole block, for everything in the state that `forward` takes as input.
 * Exported separately from `derived` so an assembler can recompute it only when one of those four
 * inputs changed and answer a temperature move with `probabilities(cached.logits, T)` alone.
 */
export function pass(s: GptState): Forward {
  return forward({
    embeddings: s.embeddings,
    sequence: SEQUENCES[s.sentence],
    positional: s.positional,
    causal: s.causal,
  });
}

/** Both halves together, for callers with nothing to memoise. Allocates on every call. */
export function derived(s: GptState): Derived {
  const forwardPass = pass(s);
  return {
    sequence: SEQUENCES[s.sentence],
    pass: forwardPass,
    probabilities: probabilities(forwardPass.logits, s.temperature),
  };
}
