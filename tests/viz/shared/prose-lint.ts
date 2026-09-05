import { expect } from "vitest";

/**
 * The mechanical half of the prose rule (spec §8): a step says what to do and what will happen,
 * never what is on screen, because every control stays live and the scene may not look how the
 * step left it. This catches only the obvious phrasings — the rule itself is enforced in review.
 */
const ASSERTS_ON_SCREEN =
  /\b(you can see|as you can see|you'll see|you will see|notice that|note that|right now|at the moment|currently|on screen)\b/i;

export function expectStepProse(prose: string, where: string): void {
  expect(prose.trim(), `${where}: prose is empty`).not.toBe("");
  expect(prose.length, `${where}: prose is a fragment`).toBeGreaterThan(60);
  const offender = ASSERTS_ON_SCREEN.exec(prose);
  expect(offender?.[0], `${where}: prose asserts what is on screen`).toBeUndefined();
}
