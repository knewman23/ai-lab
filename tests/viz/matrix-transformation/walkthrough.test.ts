// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { createMtPanel, type MtPanelHandlers } from "../../../src/viz/matrix-transformation/panel";
import { MT_STEPS } from "../../../src/viz/matrix-transformation/walkthrough";
import { derived, initialState, type MtState } from "../../../src/viz/matrix-transformation/state";
import { describeScriptContract } from "../shared/walkthrough-contract";

function mountPanel() {
  const handlers: MtPanelHandlers = {
    onPreset: vi.fn(),
    onEntry: vi.fn(),
    onT: vi.fn(),
    onReset: vi.fn(),
    onResetView: vi.fn(),
    onShow: vi.fn(),
  };
  return createMtPanel(document.createElement("div"), handlers);
}

describeScriptContract({
  name: "matrix transformation",
  steps: MT_STEPS,
  initial: initialState,
  mountPanel,
});

function at(index: number): MtState {
  let state = initialState();
  for (let i = 0; i <= index; i += 1) {
    const step = MT_STEPS[i];
    if (step === undefined) throw new Error(`no step ${i}`);
    state = step.enter(state);
  }
  return state;
}

describe("the matrix transformation walkthrough's claims", () => {
  it("starts on the identity, which leaves the unit square alone", () => {
    const state = at(0);
    const d = derived(state);

    expect(state.preset).toBe("identity");
    expect(d.detM).toBe(1);
    expect(d.area).toBe(1);
    expect(d.orientation).toBe("preserved");
  });

  it("rewrites the first column when the basis vector is dragged", () => {
    const before = at(0);
    const state = at(1);

    expect(state.preset).toBe("custom");
    // The claim: dragging moves one column and leaves the other where it was.
    expect([state.m[0], state.m[2]]).toEqual([1.6, 0.9]);
    expect([state.m[1], state.m[3]]).toEqual([before.m[1], before.m[3]]);
  });

  it("keeps the determinant equal to the signed area of the dragged square", () => {
    const d = derived(at(2));

    expect(at(2).show.ghost).toBe(true);
    expect(d.area).toBeCloseTo(Math.abs(d.detM), 12);
    expect(d.detM).toBeGreaterThan(0);
  });

  it("reflects with determinant −1: the area survives and the orientation does not", () => {
    const d = derived(at(3));

    expect(at(3).preset).toBe("reflection");
    expect(d.detM).toBe(-1);
    expect(d.area).toBe(1);
    expect(d.orientation).toBe("reversed");
  });

  it("names the eigenvalues the scale step claims, 2 and 0.5", () => {
    const state = at(4);
    const d = derived(state);

    expect(state.show.eigen).toBe(true);
    if (d.eigen.kind !== "real") throw new Error(`expected real eigenvalues, got ${d.eigen.kind}`);
    expect([...d.eigen.pairs].map((p) => p.value).sort((a, b) => b - a)).toEqual([2, 0.5]);
  });

  it("ends on a rotation with no real eigenvector and an unchanged area", () => {
    const state = at(5);
    const d = derived(state);

    expect(state.preset).toBe("rotation");
    expect(d.eigen.kind).toBe("complex");
    expect(d.detM).toBeCloseTo(1, 12);
    expect(d.orientation).toBe("preserved");
  });
});
