// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { createNnPanel, type NnPanelHandlers } from "../../../src/viz/nn/panel";
import { NN_STEPS } from "../../../src/viz/nn/walkthrough";
import {
  derived,
  initialState,
  setDataset,
  trainEpoch,
  type NnState,
} from "../../../src/viz/nn/state";
import { describeScriptContract } from "../shared/walkthrough-contract";

function mountPanel() {
  const handlers: NnPanelHandlers = {
    onDataset: vi.fn(),
    onStep: vi.fn(),
    onPlay: vi.fn(),
    onReset: vi.fn(),
    onLr: vi.fn(),
    onResetView: vi.fn(),
    onShow: vi.fn(),
  };
  return createNnPanel(document.createElement("div"), handlers);
}

describeScriptContract({
  name: "neural network",
  steps: NN_STEPS,
  initial: initialState,
  mountPanel,
});

function at(index: number): NnState {
  let state = initialState();
  for (let i = 0; i <= index; i += 1) {
    const step = NN_STEPS[i];
    if (step === undefined) throw new Error(`no step ${i}`);
    state = step.enter(state);
  }
  return state;
}

describe("the neural network walkthrough's claims", () => {
  it("never leaves the scene playing, so no step depends on wall-clock training", () => {
    // The trap: `epoch` advances on wall-clock time while `playing`, so a step that turned Play
    // on would be replayed from epoch 0 and the boundary would snap back mid-script.
    for (const [index] of NN_STEPS.entries()) {
      expect(at(index).playing, `step ${index} left the scene playing`).toBe(false);
    }
  });

  it("trains inside enter, so a replayed step arrives at the same epoch every time", () => {
    expect(at(0).epoch).toBe(0);
    expect(at(1).epoch).toBe(0);
    expect(at(2).epoch).toBe(60);
    expect(at(3).epoch).toBe(60);
    expect(at(4).epoch).toBe(60);
    expect(at(5).epoch).toBe(200);
  });

  it("opens untrained, at an accuracy no better than guessing", () => {
    const state = at(0);
    const d = derived(state);

    expect(state.dataset).toBe("xor");
    expect(state.epoch).toBe(0);
    expect(d.accuracy).toBeLessThan(0.6);
  });

  it("separates XOR by the sixtieth epoch, as the third step claims", () => {
    const untrained = derived(at(0));
    const trained = derived(at(2));

    expect(trained.accuracy).toBe(1);
    // "The loss falls by more than an order of magnitude on the way."
    expect(trained.loss).toBeLessThan(untrained.loss / 10);
  });

  it("reads the trained network at the probe rather than an untrained one", () => {
    const state = at(3);
    const d = derived(state);

    expect(state.probe).toEqual([1.2, 1.2]);
    expect(state.epoch).toBe(60);
    // The probe sits inside a cluster the trained network is confident about.
    expect(Math.abs(d.probeOutput)).toBeGreaterThan(0.5);
  });

  it("shows a chain of layer activations ending at the reported output", () => {
    const state = at(4);
    const d = derived(state);

    expect(state.show.weights).toBe(true);
    expect(d.probeActivations.length).toBeGreaterThanOrEqual(3);
    // The first entry is the raw input pair the probe was dragged to.
    expect([...(d.probeActivations[0] ?? [])]).toEqual([...state.probe]);
  });

  it("learns two moons too, and needs more epochs than XOR to do it", () => {
    const moons = at(5);
    const d = derived(moons);

    expect(moons.dataset).toBe("moons");
    expect(d.accuracy).toBe(1);
    expect(moons.epoch).toBeGreaterThan(at(2).epoch);

    // "It takes longer than XOR": at XOR's epoch count, moons has not got there yet.
    let early = setDataset(initialState(), "moons");
    for (let i = 0; i < at(2).epoch; i += 1) early = trainEpoch(early);
    expect(derived(early).accuracy).toBeLessThan(1);
  });
});
