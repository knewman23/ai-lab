import { describe, expect, it, vi } from "vitest";
import { createWalkthrough, type Step } from "../../../src/viz/shared/walkthrough";

/**
 * A stand-in scene whose state has both an immutable field and a buffer that
 * `enter` pushes onto in place — the shape `gradient-descent` really has, so
 * the `initial` contract (spec §4) is exercised rather than assumed.
 */
interface FakeState {
  readonly value: number;
  readonly trail: number[];
}

type FakeControlId = "alpha" | "beta";

function makeInitial(): () => FakeState {
  return () => ({ value: 0, trail: [0] });
}

/** Each step advances `value`, so applying twice differs from applying once. */
function makeSteps(): readonly Step<FakeState, FakeControlId>[] {
  return [
    {
      prose: "Set the value to one.",
      enter: (s) => {
        s.trail.push(s.value + 1);
        return { ...s, value: s.value + 1 };
      },
      focus: "alpha",
    },
    {
      prose: "Double it.",
      enter: (s) => {
        s.trail.push(s.value * 2);
        return { ...s, value: s.value * 2 };
      },
    },
    {
      prose: "Add ten.",
      enter: (s) => {
        s.trail.push(s.value + 10);
        return { ...s, value: s.value + 10 };
      },
      focus: "beta",
    },
  ];
}

function harness(steps: readonly Step<FakeState, FakeControlId>[] = makeSteps()) {
  const applied: FakeState[] = [];
  const focused: (FakeControlId | undefined)[] = [];
  const initial = makeInitial();
  const walkthrough = createWalkthrough<FakeState, FakeControlId>({
    title: "Walk me through it",
    steps,
    initial,
    apply: (state) => applied.push(state),
    focus: (id) => focused.push(id),
  });
  return { walkthrough, applied, focused, initial, steps };
}

/** The definition of replay, folded independently of the engine. */
function fold(steps: readonly Step<FakeState, FakeControlId>[], upTo: number): FakeState {
  let state = makeInitial()();
  for (let i = 0; i <= upTo; i += 1) {
    state = steps[i]!.enter(state);
  }
  return state;
}

/** `undefined` is a real recorded focus value, so length is what must be checked. */
function lastFocus(focused: readonly (FakeControlId | undefined)[]): FakeControlId | undefined {
  if (focused.length === 0) {
    throw new Error("focus was never called");
  }
  return focused[focused.length - 1];
}

function last<T>(items: readonly T[]): T {
  const item = items[items.length - 1];
  if (item === undefined) {
    throw new Error("expected at least one recorded value");
  }
  return item;
}

describe("createWalkthrough", () => {
  it("exposes its title and length", () => {
    const { walkthrough } = harness();
    expect(walkthrough.title).toBe("Walk me through it");
    expect(walkthrough.length).toBe(3);
  });

  it("rejects a zero-step walkthrough at construction", () => {
    expect(() =>
      createWalkthrough<FakeState, FakeControlId>({
        title: "Empty",
        steps: [],
        initial: makeInitial(),
        apply: () => {},
        focus: () => {},
      }),
    ).toThrow(/at least one step/i);
  });

  it.each([0, 1, 2])("goTo(%i) applies the fold of enter over initial()", (index) => {
    const { walkthrough, applied, steps } = harness();
    walkthrough.goTo(index);
    expect(last(applied)).toEqual(fold(steps, index));
  });

  it("returns a StepView carrying the index, the total and the step's prose", () => {
    const { walkthrough, steps } = harness();
    expect(walkthrough.goTo(1)).toEqual({ index: 1, total: 3, prose: steps[1]!.prose });
  });

  it("applies the step's focus id, and clears it for a step that names none", () => {
    const { walkthrough, focused } = harness();
    walkthrough.goTo(0);
    expect(lastFocus(focused)).toBe("alpha");
    walkthrough.goTo(1);
    expect(lastFocus(focused)).toBeUndefined();
  });

  it("frames the step when it asks for one, and leaves the camera alone otherwise", () => {
    const frame = vi.fn();
    const framing = { position: [1, 2, 3], target: [0, 0, 0] } as const;
    const steps = makeSteps();
    const first = steps[0]!;
    const walkthrough = createWalkthrough<FakeState, FakeControlId>({
      title: "Framed",
      steps: [{ ...first, framing }, steps[1]!],
      initial: makeInitial(),
      apply: () => {},
      focus: () => {},
      frame,
    });

    walkthrough.goTo(0);
    expect(frame).toHaveBeenCalledWith(framing);
    frame.mockClear();
    walkthrough.goTo(1);
    expect(frame).not.toHaveBeenCalled();
  });

  it("goTo(2) after goTo(5) gives what goTo(2) gives from fresh", () => {
    const steps = [...makeSteps(), ...makeSteps()];
    const backwards = harness(steps);
    backwards.walkthrough.goTo(5);
    backwards.walkthrough.goTo(2);

    const fresh = harness(steps);
    fresh.walkthrough.goTo(2);

    expect(last(backwards.applied)).toEqual(last(fresh.applied));
  });

  it("calls initial() afresh per goTo, so a mutated buffer is not shared between replays", () => {
    const { walkthrough, applied } = harness();
    walkthrough.goTo(2);
    const first = last(applied);
    walkthrough.goTo(2);
    const second = last(applied);

    expect(second.trail).toEqual(first.trail);
    // A memoized `initial` would hand both replays the same buffer, and the
    // trail would have grown rather than been rebuilt.
    expect(second.trail).not.toBe(first.trail);
  });

  it("exit() restores the initial state and drops the focus outline", () => {
    const { walkthrough, applied, focused, initial } = harness();
    walkthrough.goTo(2);
    walkthrough.exit();

    expect(last(applied)).toEqual(initial());
    expect(lastFocus(focused)).toBeUndefined();
  });

  it.each([-1, 3, 1.5, Number.NaN])("throws a named error for the index %s", (index) => {
    const { walkthrough } = harness();
    expect(() => walkthrough.goTo(index)).toThrow(RangeError);
    expect(() => walkthrough.goTo(index)).toThrow(/step index/i);
  });

  it("reports the same length and index after the scene's state has been changed", () => {
    const { walkthrough, applied } = harness();
    walkthrough.goTo(1);
    // Stand-in for a viewer dragging something between steps.
    last(applied).trail.push(999);

    const view = walkthrough.goTo(1);
    expect(view.index).toBe(1);
    expect(view.total).toBe(3);
    expect(walkthrough.length).toBe(3);
    expect(last(applied).trail).toEqual(fold(makeSteps(), 1).trail);
  });
});
