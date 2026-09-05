/**
 * What the GPT panel's controls are: §6's option lists in §6's order, and the two typed wrappers
 * that let `panel.ts` be assembly. The key lists are written out rather than read off `SEQUENCES`
 * and `EMBEDDING_PRESETS`, so the order on screen is this file's decision, not an object's.
 */

import { SEQUENCES, VOCAB } from "../../core/math/transformer";
import { createSelect, type Select, type SelectOption } from "../../ui/select";
import { createToggle, type Toggle } from "../../ui/toggle";
import type { HeadKey, PresetKey, SentenceKey, StageKey } from "./state";

/** An option list whose values are one of a scene key union, so the panel needs no cast. */
type Options<K extends string> = readonly (SelectOption & { value: K })[];

const SENTENCE_KEYS: readonly SentenceKey[] = ["cat-sat", "dog-ran", "scrambled"];
const PRESET_KEYS: readonly PresetKey[] = ["tuned", "collapsed", "spread"];

/** The words of a sentence: they name it in the select and label its five query positions. */
export function words(key: SentenceKey): string[] {
  return SEQUENCES[key].map((token) => {
    const word = VOCAB[token];
    if (word === undefined) throw new Error(`gpt panel: no word ${token}`);
    return word;
  });
}

/** "0 the", "1 cat", …: the query positions, labelled with the sentence they belong to. */
export const queryTitles = (key: SentenceKey): string[] =>
  words(key).map((word, i) => `${i} ${word}`);

export const SENTENCE_OPTIONS: Options<SentenceKey> = SENTENCE_KEYS.map((value) => ({
  value,
  title: words(value).join(" "),
}));

export const PRESET_OPTIONS: Options<PresetKey> = PRESET_KEYS.map((value) => ({
  value,
  title: value,
}));

export const QUERY_OPTIONS: Options<string> = queryTitles("cat-sat").map((title, i) => ({
  value: String(i),
  title,
}));

export const HEAD_OPTIONS: Options<HeadKey> = [
  { value: "head1", title: "head 1" },
  { value: "head2", title: "head 2" },
  { value: "both", title: "both" },
];

export const STAGE_OPTIONS: Options<StageKey> = [
  { value: "all", title: "all" },
  { value: "embed", title: "embed + position" },
  { value: "scores", title: "scores" },
  { value: "softmax", title: "softmax" },
  { value: "weighted", title: "weighted sum" },
  { value: "residual", title: "+ residual" },
  { value: "mlp", title: "MLP" },
  { value: "logits", title: "logits" },
];

/** A `createSelect` whose `onChange` is typed by its options, and whose value is one of them. */
export function keyedSelect<K extends string>(
  label: string,
  options: Options<K>,
  value: K,
  fire: (key: K) => void,
): Select {
  return createSelect({ label, options, value, onChange: (v) => fire(v as K) });
}

export const labelledToggle = (
  label: string,
  checked: boolean,
  fire: (on: boolean) => void,
): Toggle => createToggle({ label, checked, onChange: fire });

/** Rewrites a select's option titles in place: the query labels change with the sentence. */
export function retitle(select: Select, titles: readonly string[]): void {
  const options = select.el.querySelectorAll("option");
  if (options.length !== titles.length) {
    throw new Error(`gpt panel: ${titles.length} titles for ${options.length} options`);
  }
  options.forEach((option, i) => {
    const title = titles[i];
    if (title === undefined) throw new Error(`gpt panel: no title ${i}`);
    option.textContent = title;
  });
}
