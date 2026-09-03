import { describe, expect, it } from "vitest";
import { FNS } from "../../../src/core/math/functions1d";
import {
  H_RANGE,
  MAX_ZOOM,
  derived,
  initialState,
  reset,
  resetZoom,
  setFn,
  setH,
  setShow,
  setX,
  zoomIn,
} from "../../../src/viz/derivative/state";

describe("derivative explorer state", () => {
  it("initialState defaults", () => {
    const s = initialState();
    expect(s.fn).toBe("square");
    expect(s.x).toBe(FNS.square.start);
    expect(s.h).toBe(1);
    expect(s.zoom).toBe(0);
    expect(s.show).toEqual({ tangent: true, secant: true, derivative: true });
  });

  it("setFn switches function, resets x to that function's start, keeps h, resets zoom", () => {
    const s0 = { ...initialState(), h: 0.5, zoom: 2 as const };
    const s = setFn(s0, "cubic");
    expect(s.fn).toBe("cubic");
    expect(s.x).toBe(FNS.cubic.start);
    expect(s.h).toBe(0.5);
    expect(s.zoom).toBe(0);
  });

  it("setX clamps to [-3, 3]", () => {
    const s = initialState();
    expect(setX(s, 10).x).toBe(3);
    expect(setX(s, -10).x).toBe(-3);
    expect(setX(s, 1).x).toBe(1);
  });

  it("setX snaps to singularAt within 0.02 (abs)", () => {
    const s = { ...initialState(), fn: "abs" as const };
    const snapped = setX(s, 0.019);
    expect(snapped.x).toBe(0);
    const snappedNeg = setX(s, -0.019);
    expect(snappedNeg.x).toBe(0);
  });

  it("setX does not snap at 0.021", () => {
    const s = { ...initialState(), fn: "abs" as const };
    const notSnapped = setX(s, 0.021);
    expect(notSnapped.x).toBe(0.021);
  });

  it("setX is a no-op (returns same object) when zoom > 0", () => {
    const s = { ...initialState(), zoom: 1 as const };
    expect(setX(s, 2)).toBe(s);
  });

  it("setH clamps to [1e-3, 2]", () => {
    const s = initialState();
    expect(setH(s, 10).h).toBe(H_RANGE[1]);
    expect(setH(s, -1).h).toBe(H_RANGE[0]);
    expect(setH(s, 0.5).h).toBe(0.5);
  });

  it("zoomIn increments and caps at MAX_ZOOM", () => {
    let s = initialState();
    s = zoomIn(s);
    expect(s.zoom).toBe(1);
    s = zoomIn(zoomIn(zoomIn(s)));
    expect(s.zoom).toBe(MAX_ZOOM);
  });

  it("resetZoom resets zoom to 0", () => {
    const s = { ...initialState(), zoom: 3 as const };
    expect(resetZoom(s).zoom).toBe(0);
  });

  it("setShow changes only that flag", () => {
    const s = initialState();
    const s2 = setShow(s, "secant", false);
    expect(s2.show).toEqual({ tangent: true, secant: false, derivative: true });
  });

  it("reset returns to start x, h 1, zoom 0, keeps show", () => {
    const s = {
      ...initialState(),
      x: 2.9,
      h: 0.2,
      zoom: 2 as const,
      show: { tangent: false, secant: true, derivative: true },
    };
    const s2 = reset(s);
    expect(s2.x).toBe(FNS.square.start);
    expect(s2.h).toBe(1);
    expect(s2.zoom).toBe(0);
    expect(s2.show).toEqual({ tangent: false, secant: true, derivative: true });
  });

  it("derived: square at 1.5, h 1", () => {
    const s = initialState();
    const d = derived(s);
    expect(d.fx).toBeCloseTo(2.25);
    expect(d.d).toEqual({ kind: "value", v: 3 });
    expect(d.hEff).toBe(1);
    expect(d.secant).toBeCloseTo(4);
    expect(d.gap).toBeCloseTo(1);
    expect(d.K).toBe(1);
    expect(d.window).toEqual([-3, 3]);
    expect(d.secantInWindow).toBe(true);
  });

  it("derived: square at x 2.5, h 1", () => {
    const s = setX(initialState(), 2.5);
    const d = derived(s);
    expect(d.hEff).toBeCloseTo(0.5);
    expect(d.secant).toBeCloseTo(5.5);
  });

  it("derived: square at x 3, h 1 -> hEff null, secant null, gap null", () => {
    const s = setX(initialState(), 3);
    const d = derived(s);
    expect(d.hEff).toBeNull();
    expect(d.secant).toBeNull();
    expect(d.gap).toBeNull();
  });

  it("derived: zoom 2 at x 1.5 -> K 16, window narrowed, secantInWindow false at h 1", () => {
    const s = { ...initialState(), zoom: 2 as const };
    const d = derived(s);
    expect(d.K).toBe(16);
    expect(d.window[0]).toBeCloseTo(1.3125);
    expect(d.window[1]).toBeCloseTo(1.6875);
    expect(d.secantInWindow).toBe(false);
  });

  it("derived: abs at 0 -> jump derivative, secant 1 at h 1, gap null", () => {
    const s = setX({ ...initialState(), fn: "abs" as const }, 0);
    const d = derived(s);
    expect(d.d).toEqual({ kind: "jump", left: -1, right: 1 });
    expect(d.secant).toBeCloseTo(1);
    expect(d.gap).toBeNull();
  });
});
