// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { createDxPanel, type DxPanelHandlers } from "../../../src/viz/derivative/panel";
import { DX_STEPS } from "../../../src/viz/derivative/walkthrough";
import { derived, initialState, type DxState } from "../../../src/viz/derivative/state";
import { describeScriptContract } from "../shared/walkthrough-contract";

function mountPanel() {
  const handlers: DxPanelHandlers = {
    onFn: vi.fn(),
    onH: vi.fn(),
    onZoomIn: vi.fn(),
    onResetZoom: vi.fn(),
    onReset: vi.fn(),
    onResetView: vi.fn(),
    onShow: vi.fn(),
  };
  return createDxPanel(document.createElement("div"), handlers);
}

describeScriptContract({
  name: "derivative & tangent",
  steps: DX_STEPS,
  initial: initialState,
  mountPanel,
});

function at(index: number): DxState {
  let state = initialState();
  for (let i = 0; i <= index; i += 1) {
    const step = DX_STEPS[i];
    if (step === undefined) throw new Error(`no step ${i}`);
    state = step.enter(state);
  }
  return state;
}

describe("the derivative walkthrough's claims", () => {
  it("puts the point where the slope is negative, as step 2 says", () => {
    const state = at(1);
    const d = derived(state);

    expect(state.fn).toBe("square");
    expect(state.x).toBe(-1.4);
    expect(d.d.kind).toBe("value");
    expect(d.d.kind === "value" && d.d.v).toBeLessThan(0);
  });

  it("widens the secant gap at the h step, so shrinking h has something to close", () => {
    const gapAtStep2 = derived(at(1)).gap;
    const gapAtStep3 = derived(at(2)).gap;
    if (gapAtStep2 === null || gapAtStep3 === null) throw new Error("expected a secant gap");

    expect(at(2).h).toBe(2);
    expect(Math.abs(gapAtStep3)).toBeGreaterThan(Math.abs(gapAtStep2));
  });

  it("lands on the cubic, whose slope really is zero where the curve levels off", () => {
    const state = at(3);
    expect(state.fn).toBe("cubic");
    expect(state.show.derivative).toBe(true);

    for (const x of [-1, 1]) {
      const d = derived({ ...state, x }).d;
      expect(d.kind === "value" && d.v).toBe(0);
    }
  });

  it("reports the corner of |x| as a jump between −1 and +1, and draws no tangent", () => {
    const state = at(4);
    const d = derived(state).d;

    expect(state.fn).toBe("abs");
    expect(state.x).toBe(0);
    expect(d).toEqual({ kind: "jump", left: -1, right: 1 });
  });

  it("zooms sixty-four times in and leaves the secant on the tangent", () => {
    const state = at(5);
    const d = derived(state);

    expect(state.zoom).toBe(3);
    expect(d.K).toBe(64);
    expect(d.window[1] - d.window[0]).toBeCloseTo(6 / 64, 10);
    expect(d.secantInWindow).toBe(true);
    if (d.gap === null) throw new Error("expected a secant gap");
    expect(Math.abs(d.gap)).toBeLessThan(0.01);
  });
});
