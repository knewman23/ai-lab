import { describe, expect, it } from "vitest";
import type { Step } from "../../../src/viz/shared/walkthrough";
import { expectStepProse } from "./prose-lint";

export interface ScriptContract<S, C extends string> {
  /** The scene's name, used in test titles. */
  readonly name: string;
  readonly steps: readonly Step<S, C>[];
  readonly initial: () => S;
  /** A really-mounted panel: the registry is read from it, never restated here. */
  readonly mountPanel: () => {
    readonly el: HTMLElement;
    readonly controls: Readonly<Record<C, HTMLElement>>;
  };
  /**
   * State fields deliberately outside the scene's diffing surface, named rather than skipped.
   * Only gradient descent has any (`path`, per its state.ts:18-28).
   */
  readonly excluded?: readonly string[];
}

/**
 * What every scene's script must satisfy, run over every one of its steps: determinism over the
 * diffing surface, a focus id that resolves against a really-mounted panel, and prose that says
 * what to do rather than what is on screen.
 *
 * Determinism is not idempotence: `enter(enter(s))` may legitimately differ from `enter(s)` for
 * any step that advances an optimizer or trains an epoch, so it is never asserted.
 */
export function describeScriptContract<S, C extends string>(contract: ScriptContract<S, C>): void {
  const { name, steps, initial, mountPanel } = contract;
  const excluded = contract.excluded ?? [];
  const indices = steps.map((_, i) => i);

  const surface = (state: S): Record<string, unknown> => {
    const copy: Record<string, unknown> = { ...(state as Record<string, unknown>) };
    for (const key of excluded) delete copy[key];
    return copy;
  };

  const stepAt = (index: number): Step<S, C> => {
    const step = steps[index];
    if (step === undefined) throw new Error(`${name}: no step ${index}`);
    return step;
  };

  const stateBefore = (index: number): S => {
    let state = initial();
    for (let i = 0; i < index; i += 1) state = stepAt(i).enter(state);
    return state;
  };

  describe(`${name}'s walkthrough script`, () => {
    it("is between five and nine steps", () => {
      expect(steps.length).toBeGreaterThanOrEqual(5);
      expect(steps.length).toBeLessThanOrEqual(9);
    });

    it.each(indices)("step %i's enter is deterministic over the diffing surface", (index) => {
      const input = stateBefore(index);
      const before = surface(input);

      const first = stepAt(index).enter(input);
      const second = stepAt(index).enter(input);

      expect(surface(second)).toEqual(surface(first));
      // Asserted against the prior state's own fields, not against a new object having come
      // back: the latter agrees with itself and passes on a mutating reducer.
      expect(surface(input)).toEqual(before);
    });

    it.each(indices)("step %i names a control the mounted panel really registers", (index) => {
      const focus = stepAt(index).focus;
      if (focus === undefined) return;
      const panel = mountPanel();

      const el = panel.controls[focus];
      expect(el).toBeInstanceOf(HTMLElement);
      expect(panel.el.contains(el)).toBe(true);
    });

    it.each(indices)("step %i's prose says what to do, not what is on screen", (index) => {
      expectStepProse(stepAt(index).prose, `${name} step ${index}`);
    });

    it("moves the scene on at least three of its steps", () => {
      const changed = indices.filter((index) => {
        const input = stateBefore(index);
        return (
          JSON.stringify(surface(stepAt(index).enter(input))) !== JSON.stringify(surface(input))
        );
      });
      expect(changed.length).toBeGreaterThanOrEqual(3);
    });
  });
}
