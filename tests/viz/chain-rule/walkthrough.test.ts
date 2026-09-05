// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { createChainPanel, type ChainPanelHandlers } from "../../../src/viz/chain-rule/panel";
import { CHAIN_STEPS } from "../../../src/viz/chain-rule/walkthrough";
import { derived, initialState, type ChainState } from "../../../src/viz/chain-rule/state";
import { describeScriptContract } from "../shared/walkthrough-contract";
import { COMPOSITIONS } from "../../../src/core/math/compositions";
import { floorLocal, frontLocal, sideLocal } from "../../../src/viz/chain-rule/display";

function mountPanel() {
  const handlers: ChainPanelHandlers = {
    onComp: vi.fn(),
    onDx: vi.fn(),
    onReset: vi.fn(),
    onResetView: vi.fn(),
    onShow: vi.fn(),
  };
  return createChainPanel(document.createElement("div"), handlers);
}

describeScriptContract({
  name: "chain rule graph",
  steps: CHAIN_STEPS,
  initial: initialState,
  mountPanel,
});

function at(index: number): ChainState {
  let state = initialState();
  for (let i = 0; i <= index; i += 1) {
    const step = CHAIN_STEPS[i];
    if (step === undefined) throw new Error(`no step ${i}`);
    state = step.enter(state);
  }
  return state;
}

describe("the chain rule walkthrough's claims", () => {
  it("pins which graph each face carries, as the first step describes", () => {
    const comp = COMPOSITIONS.sin3x;
    // "the right-hand wall carries u as a function of x": the front face plots x across and
    // scaled u up. The camera's home view puts that wall on the right (frame-corner.ts).
    expect(frontLocal(comp, 1.5, 0.4)).toEqual([1.5, comp.su * 0.4]);
    // "the left-hand wall carries y as a function of u".
    expect(sideLocal(comp, 0.4, -0.7)).toEqual([comp.sy * -0.7, comp.su * 0.4]);
    // "the floor carries the composition y(x) directly".
    expect(floorLocal(comp, 1.5, -0.7)).toEqual([1.5, comp.sy * -0.7]);
  });

  it("shows both triangles and the shared leg by the fourth step", () => {
    const state = at(3);

    expect(state.show.connectors).toBe(true);
    expect(state.show.triangles).toBe(true);
    expect(state.show.secants).toBe(true);
    expect(state.dx).toBe(1);
  });

  it("multiplies the two finite-difference ratios into the third, exactly", () => {
    const d = derived(at(3));
    const deltas = d.deltas;
    if (deltas === null || deltas.dyDu === null) throw new Error("expected both ratios");

    // The claim the step makes: the product is the third ratio for any step size, not only
    // in the limit. Compared against the scene's own Δy/Δx rather than a recomputed one.
    expect(deltas.duDx * deltas.dyDu).toBeCloseTo(deltas.dyDx, 12);
  });

  it("names a composition whose inner ratio has somewhere to converge to", () => {
    const narrowState = at(4);
    // The point of the switch: on sin 3x the inner function is a straight line, so Δu/Δx is
    // exactly du/dx at every step size and shrinking Δx demonstrates nothing on the floor.
    const straight = derived({ ...narrowState, comp: "sin3x", dx: 1 });
    if (straight.deltas === null) throw new Error("expected deltas");
    expect(straight.deltas.duDx).toBeCloseTo(straight.dg, 12);

    expect(narrowState.comp).toBe("sinsq");
  });

  it("closes the gap between each ratio and its derivative as the step shrinks", () => {
    const narrowState = at(4);
    const wideState = { ...narrowState, dx: 1 };
    const wide = derived(wideState);
    const narrow = derived(narrowState);
    if (wide.deltas === null || narrow.deltas === null) throw new Error("expected deltas");

    expect(narrowState.dx).toBeLessThan(wideState.dx);
    // Both gaps are non-trivial to start with, so the shrinking is doing the work.
    expect(Math.abs(wide.deltas.duDx - wide.dg)).toBeGreaterThan(0.1);
    expect(Math.abs(narrow.deltas.duDx - narrow.dg)).toBeLessThan(
      Math.abs(wide.deltas.duDx - wide.dg),
    );
    expect(Math.abs(narrow.deltas.dyDx - narrow.dydx)).toBeLessThan(
      Math.abs(wide.deltas.dyDx - wide.dydx),
    );
  });

  it("ends with the tangents drawn at a step small enough for them to mean something", () => {
    const state = at(5);
    const d = derived(state);
    if (d.deltas === null) throw new Error("expected deltas");

    expect(state.show.tangents).toBe(true);
    expect(state.comp).toBe("sinsq");
    expect(state.dx).toBe(0.02);
    // dy/dx = dy/du · du/dx, the statement the step ends on, in the scene's own numbers.
    expect(d.df * d.dg).toBeCloseTo(d.dydx, 12);
  });
});
