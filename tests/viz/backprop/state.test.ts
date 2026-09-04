import { describe, expect, it } from "vitest";
import { backward, forward, passSteps, starts } from "../../../src/core/math/autograd";
import { GRAPHS } from "../../../src/core/math/graphs";
import {
  STEP_MS,
  derived,
  initialState,
  reset,
  resetPass,
  setGraph,
  setLeaf,
  setPlaying,
  setShow,
  stepForward,
} from "../../../src/viz/backprop/state";
import type { BpState } from "../../../src/viz/backprop/state";

function stepN(s: BpState, n: number): BpState {
  let out = s;
  for (let i = 0; i < n; i++) out = stepForward(out);
  return out;
}

describe("backprop scene state", () => {
  it("initialState defaults", () => {
    const s = initialState();
    expect(s.graph).toBe("neuron");
    expect(s.leaves).toEqual(starts(GRAPHS.neuron));
    expect(s.step).toBe(0);
    expect(s.playing).toBe(false);
    expect(s.show).toEqual({ values: true, grads: true, edgeDerivs: true });
    expect(STEP_MS).toBe(700);
  });

  it("setGraph resets leaves to the new graph's starts, step 0, playing false", () => {
    const s0 = { ...stepN(initialState(), 3), playing: true };
    const s = setGraph(s0, "shared-node");
    expect(s.graph).toBe("shared-node");
    expect(s.leaves).toEqual(starts(GRAPHS["shared-node"]));
    expect(s.step).toBe(0);
    expect(s.playing).toBe(false);
    expect(s0.graph).toBe("neuron");
    expect(s0.step).toBe(3);
  });

  it("setLeaf clamps to the leaf's range and keeps step", () => {
    const s = stepN(initialState(), 2);
    expect(setLeaf(s, "x1", 10).leaves.x1).toBe(4);
    expect(setLeaf(s, "x1", -10).leaves.x1).toBe(-4);
    expect(setLeaf(s, "b", 20).leaves.b).toBe(8);
    expect(setLeaf(s, "w2", 0.5).leaves.w2).toBe(0.5);
    expect(setLeaf(s, "w2", 0.5).step).toBe(2);
    expect(setLeaf(s, "w2", 0.5).leaves.x1).toBe(2);
    expect(s.leaves.x1).toBe(2);
  });

  it("stepForward increments to the pass length, then stops and clears playing", () => {
    const len = passSteps(GRAPHS.neuron).length;
    expect(len).toBe(10);
    const s = { ...initialState(), playing: true };
    expect(stepForward(s).step).toBe(1);
    expect(stepForward(s).playing).toBe(true);
    const end = stepN(s, len);
    expect(end.step).toBe(len);
    expect(end.playing).toBe(false);
    const past = stepForward(end);
    expect(past.step).toBe(len);
    expect(past.playing).toBe(false);
  });

  it("resetPass returns to step 0 and stops playing, keeping leaves", () => {
    const s = { ...setLeaf(stepN(initialState(), 4), "x2", 1), playing: true };
    const r = resetPass(s);
    expect(r.step).toBe(0);
    expect(r.playing).toBe(false);
    expect(r.leaves.x2).toBe(1);
  });

  it("setPlaying toggles, and is a no-op when the pass is done", () => {
    const s = initialState();
    expect(setPlaying(s, true).playing).toBe(true);
    expect(setPlaying(setPlaying(s, true), false).playing).toBe(false);
    const done = stepN(s, 10);
    expect(setPlaying(done, true).playing).toBe(false);
    expect(setPlaying(done, true)).toEqual(done);
  });

  it("setShow changes only that flag", () => {
    const s = initialState();
    const s2 = setShow(s, "grads", false);
    expect(s2.show).toEqual({ values: true, grads: false, edgeDerivs: true });
    expect(setShow(s2, "edgeDerivs", false).show).toEqual({
      values: true,
      grads: false,
      edgeDerivs: false,
    });
    expect(s.show.grads).toBe(true);
  });

  it("reset returns leaves to starts, step 0, playing false; show and graph kept", () => {
    const show = { values: false, grads: true, edgeDerivs: false };
    const s = {
      ...setLeaf(stepN(setGraph(initialState(), "product-sum"), 3), "a", 5),
      playing: true,
      show,
    };
    const r = reset(s);
    expect(r.graph).toBe("product-sum");
    expect(r.leaves).toEqual(starts(GRAPHS["product-sum"]));
    expect(r.step).toBe(0);
    expect(r.playing).toBe(false);
    expect(r.show).toEqual(show);
  });

  it("derived at the initial state: forward values, no grads, idle", () => {
    const s = initialState();
    const d = derived(s);
    expect(d.graph).toBe(GRAPHS.neuron);
    expect(d.values).toEqual(forward(GRAPHS.neuron, s.leaves));
    expect(d.grads).toEqual({});
    expect(d.steps).toHaveLength(10);
    expect(d.current).toBeNull();
    expect(d.phase).toBe("idle");
    expect(d.done).toBe(false);
    expect(d.revealed.backwardSteps).toBe(0);
    expect([...d.revealed.values].sort()).toEqual(["b", "w1", "w2", "x1", "x2"]);
  });

  it("derived mid-pass: forward after 3 steps, backward after 6", () => {
    const d3 = derived(stepN(initialState(), 3));
    expect(d3.phase).toBe("forward");
    expect(d3.current).toEqual(d3.steps[2]);
    expect(d3.grads).toEqual({});
    const d6 = derived(stepN(initialState(), 6));
    expect(d6.phase).toBe("backward");
    expect(d6.current).toEqual(d6.steps[5]);
    expect(Object.keys(d6.grads).sort()).toEqual(["n", "o"]);
    expect(d6.grads.o).toBe(1);
    expect(d6.done).toBe(false);
  });

  it("derived after the full pass: done, grads equal backward", () => {
    const s = stepN(initialState(), 10);
    const d = derived(s);
    expect(d.done).toBe(true);
    expect(d.phase).toBe("done");
    expect(d.current).toEqual(d.steps[9]);
    expect(d.grads).toEqual(backward(GRAPHS.neuron, d.values));
  });
});
