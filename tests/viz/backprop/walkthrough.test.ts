// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { createBpPanel, type BpPanelHandlers } from "../../../src/viz/backprop/panel";
import { BP_STEPS } from "../../../src/viz/backprop/walkthrough";
import { derived, initialState, stepForward, type BpState } from "../../../src/viz/backprop/state";
import { describeScriptContract } from "../shared/walkthrough-contract";

function mountPanel() {
  const handlers: BpPanelHandlers = {
    onGraph: vi.fn(),
    onStep: vi.fn(),
    onPlay: vi.fn(),
    onResetPass: vi.fn(),
    onLeaf: vi.fn(),
    onReset: vi.fn(),
    onResetView: vi.fn(),
    onShow: vi.fn(),
  };
  return createBpPanel(document.createElement("div"), handlers);
}

describeScriptContract({
  name: "backprop graph",
  steps: BP_STEPS,
  initial: initialState,
  mountPanel,
});

function at(index: number): BpState {
  let state = initialState();
  for (let i = 0; i <= index; i += 1) {
    const step = BP_STEPS[i];
    if (step === undefined) throw new Error(`no step ${i}`);
    state = step.enter(state);
  }
  return state;
}

function value(values: Record<string, number>, id: string): number {
  const v = values[id];
  if (v === undefined) throw new Error(`no value for "${id}"`);
  return v;
}

describe("the backprop walkthrough's claims", () => {
  it("opens on the small graph with nothing evaluated yet", () => {
    const state = at(0);
    const d = derived(state);

    expect(state.graph).toBe("product-sum");
    expect(state.step).toBe(0);
    expect(d.phase).toBe("idle");
    expect(d.current).toBeNull();
  });

  it("evaluates the product before the sum that uses it, as step 2 says", () => {
    const d = derived(at(1));

    expect(d.current?.kind).toBe("forward");
    expect(d.current?.node).toBe("ab");
  });

  it("finishes the forward pass at the output, before any gradient exists", () => {
    const state = at(2);
    const d = derived(state);

    expect(d.phase).toBe("forward");
    expect(d.current?.node).toBe("d");
    // Every forward step taken, no backward one yet.
    expect(d.steps.slice(0, state.step).every((s) => s.kind === "forward")).toBe(true);
    expect(d.steps[state.step]?.kind).toBe("backward");
  });

  it("turns the pass around and starts the output's gradient at 1", () => {
    const state = at(3);
    const d = derived(state);

    expect(d.phase).toBe("backward");
    expect(d.current?.kind).toBe("backward");
    expect(value(d.grads, "d")).toBe(1);
  });

  it("gives each leaf of a·b + c the gradient the chain rule predicts", () => {
    const state = at(4);
    const d = derived(state);

    expect(d.done).toBe(true);
    expect(state.show.edgeDerivs).toBe(true);

    const a = value(d.values, "a");
    const b = value(d.values, "b");
    // d = a·b + c, so ∂d/∂a = b, ∂d/∂b = a, and adding passes 1 through to c.
    expect(value(d.grads, "a")).toBeCloseTo(b, 12);
    expect(value(d.grads, "b")).toBeCloseTo(a, 12);
    expect(value(d.grads, "c")).toBeCloseTo(1, 12);
  });

  it("accumulates the shared node's gradient from both of its consumers", () => {
    const state = at(5);
    const d = derived(state);

    expect(state.graph).toBe("shared-node");
    expect(d.done).toBe(true);

    // L = e·c + e, so ∂L/∂e = c + 1: one instalment from f, one from L itself.
    const c = value(d.values, "c");
    expect(value(d.grads, "e")).toBeCloseTo(c + 1, 12);
  });

  it("shows the shared node's gradient as a partial sum until both consumers have run", () => {
    const finished = at(5);
    const d = derived(finished);
    const backwardOf = (id: string): number =>
      d.steps.findIndex((s) => s.kind === "backward" && s.node === id);

    // Rewind to just after L, the first of e's two consumers, has handed its share back.
    // L = f + e, so that instalment is 1; the other, c, arrives when f runs.
    let partial: BpState = { ...finished, step: 0 };
    for (let i = 0; i <= backwardOf("L"); i += 1) partial = stepForward(partial);

    const partialGrads = derived(partial).grads;
    const c = value(d.values, "c");
    expect(value(partialGrads, "e")).toBeCloseTo(1, 12);
    expect(value(d.grads, "e")).toBeCloseTo(1 + c, 12);
    expect(backwardOf("f")).toBeGreaterThan(backwardOf("L"));
  });
});
