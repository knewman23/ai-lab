import { describe, expect, it } from "vitest";
import { columns, fromColumns } from "../../../src/core/math/matrix2";
import { PRESETS, PRESET_KEYS } from "../../../src/viz/matrix-transformation/presets";
import {
  derived,
  dragBasis,
  initialState,
  reset,
  setEntry,
  setPreset,
  setShow,
  setT,
} from "../../../src/viz/matrix-transformation/state";

describe("PRESETS", () => {
  it("has the documented keys in order", () => {
    expect(PRESET_KEYS).toEqual([
      "identity",
      "scale",
      "shear",
      "rotation",
      "reflection",
      "projection",
    ]);
  });

  it("has the exact documented titles and matrices", () => {
    expect(PRESETS.identity).toEqual({ title: "Identity", m: [1, 0, 0, 1] });
    expect(PRESETS.scale).toEqual({ title: "Scale", m: [2, 0, 0, 0.5] });
    expect(PRESETS.shear).toEqual({ title: "Shear", m: [1, 1, 0, 1] });
    expect(PRESETS.rotation.title).toBe("Rotation 45°");
    expect(PRESETS.rotation.m).toEqual([
      Math.SQRT1_2,
      -Math.SQRT1_2,
      Math.SQRT1_2,
      Math.SQRT1_2,
    ]);
    expect(PRESETS.reflection).toEqual({ title: "Reflection across x", m: [1, 0, 0, -1] });
    expect(PRESETS.projection).toEqual({ title: "Projection onto x", m: [1, 0, 0, 0] });
  });
});

describe("initialState", () => {
  it("matches the documented defaults", () => {
    const s = initialState();
    expect(s.m).toEqual([1, 0, 0, 1]);
    expect(s.t).toBe(1);
    expect(s.preset).toBe("identity");
    expect(s.show).toEqual({ grid: true, eigen: true, ghost: true });
  });
});

describe("setEntry", () => {
  it("sets the given entry and flips preset to custom", () => {
    const s = setEntry(initialState(), 1, 2);
    expect(s.m).toEqual([1, 2, 0, 1]);
    expect(s.preset).toBe("custom");
  });

  it("clamps values to [-3, 3]", () => {
    const s1 = setEntry(initialState(), 0, 10);
    expect(s1.m[0]).toBe(3);
    const s2 = setEntry(initialState(), 0, -10);
    expect(s2.m[0]).toBe(-3);
  });

  it("ignores non-finite values, returning the same state object", () => {
    const s0 = initialState();
    expect(setEntry(s0, 0, NaN)).toBe(s0);
    expect(setEntry(s0, 0, Infinity)).toBe(s0);
    expect(setEntry(s0, 0, -Infinity)).toBe(s0);
  });
});

describe("setPreset", () => {
  it("loads the preset matrix, sets t to 1, and sets preset key", () => {
    const s0 = setT(initialState(), 0.2);
    const s1 = setPreset(s0, "shear");
    expect(s1.m).toEqual(PRESETS.shear.m);
    expect(s1.t).toBe(1);
    expect(s1.preset).toBe("shear");
  });
});

describe("dragBasis", () => {
  it("replaces the given column, clamped to [-3, 3], and sets preset to custom", () => {
    const s = dragBasis(initialState(), 0, [4, 4]);
    expect(s.m).toEqual([3, 0, 3, 1]);
    expect(s.preset).toBe("custom");
  });

  it("clamps negative out-of-range components too", () => {
    const s = dragBasis(initialState(), 1, [-4, -4]);
    expect(s.m).toEqual([1, -3, 0, -3]);
  });

  it("round-trips through columns/fromColumns for the untouched column", () => {
    const s0 = initialState();
    const s1 = dragBasis(s0, 1, [2, -1]);
    const [c0, c1] = columns(s1.m);
    expect(c0).toEqual(columns(s0.m)[0]);
    expect(c1).toEqual([2, -1]);
    expect(fromColumns(c0, c1)).toEqual(s1.m);
  });
});

describe("setT", () => {
  it("clamps to [0, 1]", () => {
    expect(setT(initialState(), 2).t).toBe(1);
    expect(setT(initialState(), -1).t).toBe(0);
    expect(setT(initialState(), 0.5).t).toBe(0.5);
  });
});

describe("setShow", () => {
  it("changes only the given flag, returning a new object", () => {
    const s0 = initialState();
    const s1 = setShow(s0, "grid", false);
    expect(s1).not.toBe(s0);
    expect(s1.show).toEqual({ grid: false, eigen: true, ghost: true });
  });
});

describe("reset", () => {
  it("resets to identity, t 1, preset identity, and preserves show flags", () => {
    let s = setEntry(initialState(), 0, 2);
    s = setShow(s, "grid", false);
    s = setT(s, 0.3);
    const r = reset(s);
    expect(r.m).toEqual([1, 0, 0, 1]);
    expect(r.t).toBe(1);
    expect(r.preset).toBe("identity");
    expect(r.show).toEqual({ grid: false, eigen: true, ghost: true });
  });
});

describe("derived", () => {
  it("identity preset at t 1", () => {
    const s = setPreset(initialState(), "identity");
    const d = derived(s);
    expect(d.detMt).toBe(1);
    expect(d.detM).toBe(1);
    expect(d.traceM).toBe(2);
    expect(d.eigen.kind).toBe("uniform");
    expect(d.area).toBe(1);
    expect(d.orientation).toBe("preserved");
  });

  it("scale preset at t 1", () => {
    const s = setPreset(initialState(), "scale");
    const d = derived(s);
    expect(d.detMt).toBeCloseTo(1);
    expect(d.detM).toBeCloseTo(1);
    expect(d.traceM).toBeCloseTo(2.5);
    expect(d.eigen.kind).toBe("real");
    expect(d.area).toBeCloseTo(1);
    expect(d.orientation).toBe("preserved");
  });

  it("shear preset at t 1", () => {
    const s = setPreset(initialState(), "shear");
    const d = derived(s);
    expect(d.detMt).toBeCloseTo(1);
    expect(d.detM).toBeCloseTo(1);
    expect(d.traceM).toBeCloseTo(2);
    expect(d.eigen.kind).toBe("real");
    expect(d.area).toBeCloseTo(1);
    expect(d.orientation).toBe("preserved");
  });

  it("rotation preset at t 1 is complex-eigen and preserves orientation", () => {
    const s = setPreset(initialState(), "rotation");
    const d = derived(s);
    expect(d.detMt).toBeCloseTo(1);
    expect(d.detM).toBeCloseTo(1);
    expect(d.traceM).toBeCloseTo(Math.SQRT2);
    expect(d.eigen.kind).toBe("complex");
    expect(d.area).toBeCloseTo(1);
    expect(d.orientation).toBe("preserved");
  });

  it("reflection preset at t 1 reverses orientation", () => {
    const s = setPreset(initialState(), "reflection");
    const d = derived(s);
    expect(d.detMt).toBeCloseTo(-1);
    expect(d.detM).toBeCloseTo(-1);
    expect(d.traceM).toBeCloseTo(0);
    expect(d.eigen.kind).toBe("real");
    expect(d.area).toBeCloseTo(1);
    expect(d.orientation).toBe("reversed");
  });

  it("projection preset at t 1 collapses", () => {
    const s = setPreset(initialState(), "projection");
    const d = derived(s);
    expect(d.detMt).toBeCloseTo(0);
    expect(d.detM).toBeCloseTo(0);
    expect(d.traceM).toBeCloseTo(1);
    expect(d.eigen.kind).toBe("real");
    expect(d.area).toBeCloseTo(0);
    expect(d.orientation).toBe("collapsed");
  });

  it("reflection at t 0.5 collapses mt while detM stays -1", () => {
    const s = setT(setPreset(initialState(), "reflection"), 0.5);
    const d = derived(s);
    expect(d.detMt).toBeCloseTo(0);
    expect(d.detM).toBeCloseTo(-1);
    expect(d.orientation).toBe("collapsed");
  });
});
