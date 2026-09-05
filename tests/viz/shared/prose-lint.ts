import { expect } from "vitest";

/**
 * The mechanical half of the prose rule (spec §8): a step says what to do and what will happen,
 * never what is on screen, because every control stays live and the scene may not look how the
 * step left it. This catches only the obvious phrasings — the rule itself is enforced in review.
 */
/**
 * Play and Run are toggles whose label flips to Pause, and Step fires once per click, so "hold"
 * describes an interaction none of them has. The scenes' own hints say "press".
 */
const HOLDS_A_BUTTON = /\bhold(ing|s)? (?:the )?(?:play|run|step|pause)\b/i;

/** "the the arrow will follow it" — a word doubled by an edit. */
const REPEATS_A_WORD = /\b([a-z]{3,})\b[\s]+\1\b/i;

/**
 * "…and again to pause. second. On a round bowl…" — a sentence starting in lower case, which is
 * what a rewrite that lost its seam leaves behind. That exact string shipped once. Decimals are
 * excluded: a period before a digit is part of a number, not the end of a sentence.
 */
const LOWERCASE_SENTENCE = /[.!?]\s+[a-z]/;

const ASSERTS_ON_SCREEN =
  /\b(you can see|as you can see|you'll see|you will see|notice that|note that|right now|at the moment|currently|on screen)\b/i;

export function expectStepProse(prose: string, where: string): void {
  expect(prose.trim(), `${where}: prose is empty`).not.toBe("");
  expect(prose.length, `${where}: prose is a fragment`).toBeGreaterThan(60);
  const offender = ASSERTS_ON_SCREEN.exec(prose);
  expect(offender?.[0], `${where}: prose asserts what is on screen`).toBeUndefined();

  const held = HOLDS_A_BUTTON.exec(prose);
  expect(held?.[0], `${where}: these controls are pressed, not held`).toBeUndefined();

  const repeated = REPEATS_A_WORD.exec(prose);
  expect(repeated?.[0], `${where}: a word is repeated`).toBeUndefined();

  const lowercase = LOWERCASE_SENTENCE.exec(prose);
  expect(lowercase?.[0], `${where}: a sentence starts in lower case`).toBeUndefined();
}
