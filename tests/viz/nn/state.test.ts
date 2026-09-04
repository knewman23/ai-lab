import { describe, expect, it } from "vitest";
import { DATASETS, DOMAIN } from "../../../src/core/math/datasets";
import { SIZES, initParams } from "../../../src/core/math/mlp";
import {
  EPOCH_MS,
  LR_RANGE,
  derived,
  initialState,
  reset,
  setDataset,
  setLr,
  setPlaying,
  setProbe,
  setShow,
  trainEpoch,
} from "../../../src/viz/nn/state";
import type { NnState } from "../../../src/viz/nn/state";

/** A snapshot deep enough to catch a reducer mutating the state it was handed. */
function snapshot(s: NnState): string {
  return JSON.stringify({
    ...s,
    params: {
      weights: s.params.weights.map((w) => [...w]),
      biases: s.params.biases.map((b) => [...b]),
    },
  });
}

describe("nn scene state", () => {
  it("initialState defaults to xor at its start seed", () => {
    const s = initialState();
    expect(s.dataset).toBe("xor");
    expect(s.seed).toBe(DATASETS.xor.startSeed);
    expect(s.params).toEqual(initParams(DATASETS.xor.startSeed));
    expect(s.epoch).toBe(0);
    expect(s.lr).toBe(0.1);
    expect(s.playing).toBe(false);
    expect(s.probe).toEqual([0, 0]);
    expect(s.show).toEqual({ weights: true, data: true, boundary: true });
    expect(EPOCH_MS).toBe(100);
    expect(LR_RANGE).toEqual([0.001, 0.5]);
  });

  it("setDataset takes the new dataset's start seed and restarts training", () => {
    const s0 = { ...trainEpoch(initialState()), playing: true };
    const before = snapshot(s0);
    const s = setDataset(s0, "moons");
    expect(s.dataset).toBe("moons");
    expect(s.seed).toBe(DATASETS.moons.startSeed);
    expect(s.params).toEqual(initParams(DATASETS.moons.startSeed));
    expect(s.epoch).toBe(0);
    expect(s.playing).toBe(false);
    expect(snapshot(s0)).toBe(before);
  });

  it("trainEpoch advances the epoch and moves the parameters without mutating the old ones", () => {
    const s0 = initialState();
    const before = snapshot(s0);
    const s = trainEpoch(s0);
    expect(s.epoch).toBe(1);
    expect(s.seed).toBe(s0.seed);
    expect(s.params).not.toEqual(s0.params);
    expect(s.params.weights.map((w) => w.length)).toEqual([8, 16, 4]);
    expect(snapshot(s0)).toBe(before);
  });

  it("setLr clamps to LR_RANGE", () => {
    const s = initialState();
    expect(setLr(s, 1).lr).toBe(0.5);
    expect(setLr(s, 0).lr).toBe(0.001);
    expect(setLr(s, 0.25).lr).toBe(0.25);
    expect(s.lr).toBe(0.1);
  });

  it("setProbe clamps both coordinates to the domain", () => {
    const s = initialState();
    expect(setProbe(s, [9, -9]).probe).toEqual([DOMAIN[1], DOMAIN[0]]);
    expect(setProbe(s, [1.5, -2]).probe).toEqual([1.5, -2]);
    expect(s.probe).toEqual([0, 0]);
  });

  it("setPlaying starts and stops autoplay", () => {
    const s = initialState();
    expect(setPlaying(s, true).playing).toBe(true);
    expect(setPlaying(setPlaying(s, true), false).playing).toBe(false);
    expect(s.playing).toBe(false);
  });

  it("setShow changes only the named flag", () => {
    const s = initialState();
    const off = setShow(s, "boundary", false);
    expect(off.show).toEqual({ weights: true, data: true, boundary: false });
    expect(s.show.boundary).toBe(true);
  });

  it("reset advances the seed and keeps lr, probe and toggles", () => {
    const s0 = setShow(
      setProbe(setLr({ ...trainEpoch(initialState()), playing: true }, 0.3), [1, 2]),
      "data",
      false,
    );
    const before = snapshot(s0);
    const s = reset(s0);
    expect(s.seed).toBe(s0.seed + 1);
    expect(s.params).toEqual(initParams(s0.seed + 1));
    expect(s.epoch).toBe(0);
    expect(s.playing).toBe(false);
    expect(s.lr).toBe(0.3);
    expect(s.probe).toEqual([1, 2]);
    expect(s.show).toEqual(s0.show);
    expect(snapshot(s0)).toBe(before);
  });

  it("derived reports the dataset, loss, accuracy and the probe's activations", () => {
    const s = setProbe(initialState(), [1.5, 1.5]);
    const d = derived(s);
    expect(d.dataset).toBe(DATASETS.xor);
    expect(d.loss).toBeGreaterThan(0);
    expect(d.accuracy).toBeGreaterThanOrEqual(0);
    expect(d.accuracy).toBeLessThanOrEqual(1);
    expect(d.probeActivations).toHaveLength(SIZES.length);
    expect([...(d.probeActivations[0] ?? [])]).toEqual([1.5, 1.5]);
    expect(d.probeOutput).toBe(d.probeActivations[3]?.[0]);
    expect(Math.abs(d.probeOutput)).toBeLessThanOrEqual(1);
  });

  it("derived leaves the boundary grid to the assembler", () => {
    expect(derived(initialState())).not.toHaveProperty("boundaryGrid");
  });

  it("training lowers the loss on xor", () => {
    let s = initialState();
    const first = derived(s).loss;
    for (let i = 0; i < 20; i++) s = trainEpoch(s);
    expect(derived(s).loss).toBeLessThan(first);
    expect(s.epoch).toBe(20);
  });
});
