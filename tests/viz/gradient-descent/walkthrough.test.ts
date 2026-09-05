// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { createGdPanel, type GdPanelHandlers } from "../../../src/viz/gradient-descent/panel";
import { GD_STEPS, GD_WALKTHROUGH_TITLE } from "../../../src/viz/gradient-descent/walkthrough";
import { createWalkthrough } from "../../../src/viz/shared/walkthrough";
import {
  initialState,
  setOptimizer,
  setSurface,
  step,
  type GdState,
} from "../../../src/viz/gradient-descent/state";
import type { GdControlId } from "../../../src/viz/gradient-descent/panel";
import { expectStepProse } from "../shared/prose-lint";

/**
 * The fields compared for purity. `path` is excluded on purpose and by name: `step` pushes onto
 * the existing buffer, mutating it in place by design (state.ts:18-28), and it is documented as
 * outside the immutable diffing surface. Everything else must be untouched.
 */
const EXCLUDED_FROM_DIFFING_SURFACE = ["path"] as const;

function diffingSurface(s: GdState): Record<string, unknown> {
  const copy: Record<string, unknown> = { ...s };
  for (const key of EXCLUDED_FROM_DIFFING_SURFACE) delete copy[key];
  return copy;
}

function stepAt(index: number) {
  const found = GD_STEPS[index];
  if (found === undefined) throw new Error(`no step ${index}`);
  return found;
}

function stateBefore(index: number): GdState {
  let state = initialState();
  for (let i = 0; i < index; i += 1) state = stepAt(i).enter(state);
  return state;
}

function mountPanel() {
  const handlers: GdPanelHandlers = {
    onSurface: vi.fn(),
    onOptimizer: vi.fn(),
    onLr: vi.fn(),
    onStep: vi.fn(),
    onToggleRun: vi.fn(),
    onReset: vi.fn(),
    onResetView: vi.fn(),
    onShow: vi.fn(),
  };
  return createGdPanel(document.createElement("div"), handlers, { backend: "test" });
}

const INDICES = GD_STEPS.map((_, i) => i);

describe("the gradient descent walkthrough", () => {
  it("is between five and nine steps", () => {
    expect(GD_STEPS.length).toBeGreaterThanOrEqual(5);
    expect(GD_STEPS.length).toBeLessThanOrEqual(9);
  });

  it.each(INDICES)(
    "step %i's enter is deterministic over the diffing surface, path excluded",
    (index) => {
      const input = stateBefore(index);
      const before = diffingSurface(input);

      const first = stepAt(index).enter(input);
      const second = stepAt(index).enter(input);

      // Determinism, not idempotence: the stepping steps advance pos, steps and optState,
      // so enter(enter(s)) is expected to differ from enter(s).
      expect(diffingSurface(second)).toEqual(diffingSurface(first));
      expect(diffingSurface(input)).toEqual(before);
    },
  );

  it("does not claim idempotence for a stepping step", () => {
    const input = stateBefore(3);
    const once = stepAt(3).enter(input);
    const twice = stepAt(3).enter(once);

    expect(twice.steps).toBeGreaterThan(once.steps);
    expect(twice.pos).not.toEqual(once.pos);
  });

  it.each(INDICES)("step %i names a control the mounted panel really registers", (index) => {
    const panel = mountPanel();
    const focus = stepAt(index).focus;
    if (focus === undefined) return;

    const el = panel.controls[focus];
    expect(el).toBeInstanceOf(HTMLElement);
    expect(panel.el.contains(el)).toBe(true);
  });

  it.each(INDICES)("step %i's prose says what to do, not what is on screen", (index) => {
    expectStepProse(stepAt(index).prose, `gradient descent step ${index}`);
  });

  it("leaves the trail a viewer pressing Step that many times would leave", () => {
    const walkthrough = createWalkthrough<GdState, GdControlId>({
      title: GD_WALKTHROUGH_TITLE,
      steps: GD_STEPS,
      initial: initialState,
      apply: (s) => applied.push(s),
      focus: () => {},
    });
    const applied: GdState[] = [];

    // The bowl stepping step, replayed.
    walkthrough.goTo(3);
    const replayed = applied[applied.length - 1];
    if (replayed === undefined) throw new Error("nothing was applied");

    // The same run driven by calling step directly, from the state the step was entered from.
    let byHand = stateBefore(3);
    const presses = replayed.steps;
    for (let i = 0; i < presses; i += 1) byHand = step(byHand);

    expect(replayed.path.toArray()).toEqual(byHand.path.toArray());
    expect(replayed.pos).toEqual(byHand.pos);
    expect(presses).toBeGreaterThan(0);
  });

  it("rebuilds the trail per replay rather than growing one shared buffer", () => {
    const applied: GdState[] = [];
    const walkthrough = createWalkthrough<GdState, GdControlId>({
      title: GD_WALKTHROUGH_TITLE,
      steps: GD_STEPS,
      initial: initialState,
      apply: (s) => applied.push(s),
      focus: () => {},
    });

    walkthrough.goTo(3);
    const first = applied[applied.length - 1];
    walkthrough.goTo(3);
    const second = applied[applied.length - 1];
    if (first === undefined || second === undefined) throw new Error("nothing was applied");

    expect(second.path.toArray()).toEqual(first.path.toArray());
    expect(second.path).not.toBe(first.path);
  });

  it("pins the state at the ravine step", () => {
    const state = stepAt(4).enter(stateBefore(4));

    expect(state.surface).toBe("elongated");
    expect(state.optimizer).toBe("sgd");
    expect(state.lr).toBe(0.1);
    expect(state.steps).toBe(12);
    expect(state.status).toBe("ok");
    expect(state.running).toBe(false);
    // The narrow axis flips sign every step at this rate, which is what the prose claims.
    const ys = state.path.toArray().map(([, y]) => y);
    // Guard against a vacuous sign check: a run that had collapsed onto y = 0 would satisfy
    // "every sign is the negation of the last" while flipping nothing.
    expect(ys.every((y) => Math.abs(y) > 0.5)).toBe(true);
    const signs = ys.map((y) => Math.sign(y));
    expect(signs.slice(1).every((sign, i) => sign === -signs[i]!)).toBe(true);
  });

  it("pins the state at the Rosenbrock step, still inside the valley", () => {
    const state = stepAt(5).enter(stateBefore(5));

    expect(state.surface).toBe("rosenbrock");
    expect(state.optimizer).toBe("adam");
    expect(state.lr).toBe(0.001);
    expect(state.steps).toBe(40);
    expect(state.status).toBe("ok");
    // Adam on this surface runs along the valley floor rather than leaving the domain.
    expect(state.path.size).toBe(41);
  });

  it("switching to adam from the ravine step keeps the ball where SGD left it", () => {
    const ravine = stepAt(4).enter(stateBefore(4));
    const switched = setOptimizer(ravine, "adam");

    expect(switched.pos).toEqual(ravine.pos);
    expect(switched.steps).toBe(0);
    expect(setSurface(switched, "elongated").surface).toBe("elongated");
  });
});
