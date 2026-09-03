import { describe, expect, it } from "vitest";
import { COMPOSITIONS, DX_RANGE, deltas, sideSlope } from "../../../src/core/math/compositions";
import {
  DX_DEFAULT,
  derived,
  initialState,
  reset,
  setComp,
  setDx,
  setShow,
  setX,
} from "../../../src/viz/chain-rule/state";

describe("chain rule scene state", () => {
  it("initialState defaults", () => {
    const s = initialState();
    expect(s.comp).toBe("sin3x");
    expect(s.x).toBe(0.4);
    expect(s.dx).toBe(0.5);
    expect(DX_DEFAULT).toBe(0.5);
    expect(s.show).toEqual({ triangles: true, secants: true, tangents: false, connectors: true });
  });

  it("setComp switches composition, resets x to its start, keeps dx", () => {
    const s0 = { ...initialState(), x: 2, dx: 0.2 };
    const s = setComp(s0, "gauss");
    expect(s.comp).toBe("gauss");
    expect(s.x).toBe(COMPOSITIONS.gauss.start);
    expect(s.dx).toBe(0.2);
    expect(s).not.toBe(s0);
    expect(s0.comp).toBe("sin3x");
  });

  it("setX clamps to [-3, 3]", () => {
    const s = initialState();
    expect(setX(s, 10).x).toBe(3);
    expect(setX(s, -10).x).toBe(-3);
    expect(setX(s, 1).x).toBe(1);
    expect(s.x).toBe(0.4);
  });

  it("setDx clamps to DX_RANGE", () => {
    const s = initialState();
    expect(setDx(s, 10).dx).toBe(DX_RANGE[1]);
    expect(setDx(s, -1).dx).toBe(DX_RANGE[0]);
    expect(setDx(s, 0.25).dx).toBe(0.25);
  });

  it("setShow changes only that flag", () => {
    const s = initialState();
    const s2 = setShow(s, "tangents", true);
    expect(s2.show).toEqual({ triangles: true, secants: true, tangents: true, connectors: true });
    const s3 = setShow(s2, "connectors", false);
    expect(s3.show).toEqual({ triangles: true, secants: true, tangents: true, connectors: false });
    expect(s.show.tangents).toBe(false);
  });

  it("reset returns to start x and dx 0.5, keeps show and comp", () => {
    const show = { triangles: false, secants: true, tangents: true, connectors: false };
    const s = { ...setComp(initialState(), "sinsq"), x: 2.9, dx: 0.1, show };
    const s2 = reset(s);
    expect(s2.comp).toBe("sinsq");
    expect(s2.x).toBe(COMPOSITIONS.sinsq.start);
    expect(s2.dx).toBe(0.5);
    expect(s2.show).toEqual(show);
  });

  it("derived at the default state agrees with the math helpers", () => {
    const d = derived(initialState());
    const c = COMPOSITIONS.sin3x;
    expect(d.comp).toBe(c);
    expect(d.u).toBeCloseTo(1.2);
    expect(d.y).toBeCloseTo(Math.sin(1.2));
    expect(d.dg).toBe(3);
    expect(d.df).toBeCloseTo(Math.cos(1.2));
    expect(d.dydx).toBeCloseTo(3 * Math.cos(1.2));
    expect(d.dxEff).toBe(0.5);
    expect(d.deltas).toEqual(deltas(c, 0.4, 0.5));
    expect(d.sideSlope).toBe(sideSlope(c, d.u));
    expect(d.sideSlope).toBeCloseTo(sideSlope(c, 1.2) as number);
    expect(d.showPrimed).toBe(true);
  });

  it("derived at x = 3: dxEff and deltas null, showPrimed false", () => {
    const d = derived(setX(initialState(), 3));
    expect(d.dxEff).toBeNull();
    expect(d.deltas).toBeNull();
    expect(d.showPrimed).toBe(false);
    expect(d.u).toBeCloseTo(9);
  });

  it("derived: showPrimed false with triangles and secants both off", () => {
    const s = setShow(setShow(initialState(), "triangles", false), "secants", false);
    const d = derived(s);
    expect(d.dxEff).toBe(0.5);
    expect(d.showPrimed).toBe(false);
    expect(derived(setShow(s, "secants", true)).showPrimed).toBe(true);
  });
});
