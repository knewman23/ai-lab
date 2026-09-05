import type { StepView, WalkthroughInstance } from "../types";
import type { Framing } from "./framing";

/**
 * One numbered step of a scene's walkthrough.
 *
 * `enter` is built from the scene's own exported setters and must be pure with
 * respect to that scene's diffing surface: calling it twice on the same input
 * gives equal results, and the input's diffed fields are unchanged afterwards.
 * That is determinism, not idempotence — a step that advances an optimizer or
 * trains an epoch legitimately gives `enter(enter(s)) !== enter(s)`.
 *
 * `focus` is the scene's own control-id union rather than an open string, so a
 * step naming a control the panel does not register fails to compile.
 */
export interface Step<S, C extends string> {
  readonly prose: string;
  readonly enter: (state: S) => S;
  readonly focus?: C;
  readonly framing?: Framing;
}

export interface WalkthroughOptions<S, C extends string> {
  /** Names the start control, e.g. "Walk me through it". */
  readonly title: string;
  readonly steps: readonly Step<S, C>[];
  /**
   * The scene's initial state. **Must allocate on every call**: `goTo` folds
   * from it, and a step that pushes onto a buffer in place (as gradient
   * descent's `step` does, by design) would otherwise share one buffer across
   * every replay and grow the trail instead of rebuilding it.
   */
  readonly initial: () => S;
  readonly apply: (state: S) => void;
  readonly focus: (id: C | undefined) => void;
  readonly frame?: (framing: Framing) => void;
}

/**
 * The replay engine behind walkthrough mode. `goTo(i)` folds steps 0…i over a
 * freshly allocated initial state rather than stepping forward from wherever
 * the scene happens to be, which is what makes a cold-loaded deep link, Back
 * and Next all land on the same state.
 */
export function createWalkthrough<S, C extends string>(
  opts: WalkthroughOptions<S, C>,
): WalkthroughInstance {
  const { title, steps, initial, apply, focus, frame } = opts;
  if (steps.length === 0) {
    throw new RangeError("a walkthrough needs at least one step");
  }

  function stepAt(index: number): Step<S, C> {
    const step = steps[index];
    if (step === undefined) {
      throw new RangeError(
        `walkthrough step index ${index} is outside 0…${steps.length - 1} for "${title}"`,
      );
    }
    return step;
  }

  return {
    title,
    length: steps.length,

    goTo(index: number): StepView {
      if (!Number.isInteger(index)) {
        throw new RangeError(`walkthrough step index ${index} is not an integer for "${title}"`);
      }
      const step = stepAt(index);

      let state = initial();
      for (let i = 0; i <= index; i += 1) {
        state = stepAt(i).enter(state);
      }

      apply(state);
      focus(step.focus);
      if (step.framing && frame) frame(step.framing);

      return { index, total: steps.length, prose: step.prose };
    },

    exit(): void {
      apply(initial());
      focus(undefined);
    },
  };
}
