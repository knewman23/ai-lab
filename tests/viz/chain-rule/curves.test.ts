import { describe, expect, it, vi } from "vitest";
import { COMPOSITIONS } from "../../../src/core/math/compositions";
import { createThemeColors } from "../../../src/core/theme";
import { createCurves, type Curves } from "../../../src/viz/chain-rule/curves";
import type { Layer } from "../../../src/viz/shared/layer";

/** The live vertices of a layer as [x, y, z] triples. */
function drawn(layer: Layer): number[][] {
  const { count } = layer.geometry.drawRange;
  const out: number[][] = [];
  for (let i = 0; i < count; i++) {
    out.push([layer.positions[i * 3]!, layer.positions[i * 3 + 1]!, layer.positions[i * 3 + 2]!]);
  }
  return out;
}

function make(): { curves: Curves; theme: ReturnType<typeof createThemeColors> } {
  const theme = createThemeColors(() => "#1f4ed8");
  return { curves: createCurves(theme), theme };
}

describe("createCurves", () => {
  it("draws u = g(x) on the front wall as 240 segments in the plane y = lift", () => {
    const { curves } = make();
    curves.setComposition(COMPOSITIONS.sin3x);
    const front = drawn(curves.layers.front);
    expect(front).toHaveLength(480);
    // First vertex: x = -3, u = -9, Z = 3 + (1/3)(-9) = 0.
    expect(front[0]![0]).toBeCloseTo(-3, 5);
    expect(front[0]![1]).toBeCloseTo(0.01, 5);
    expect(front[0]![2]).toBeCloseTo(0, 5);
    for (const v of front) expect(v[1]).toBeCloseTo(0.01, 5);
    curves.dispose();
  });

  it("draws y = f(g(x)) on the floor in the plane z = lift, spanning x in [-3, 3]", () => {
    const { curves } = make();
    curves.setComposition(COMPOSITIONS.sin3x);
    const floor = drawn(curves.layers.floor);
    expect(floor.length).toBeGreaterThan(0);
    for (const v of floor) expect(v[2]).toBeCloseTo(0.01, 5);
    const xs = floor.map((v) => v[0]!);
    expect(Math.min(...xs)).toBeCloseTo(-3, 5);
    expect(Math.max(...xs)).toBeCloseTo(3, 5);
    curves.dispose();
  });

  it("draws y = f(u) on the side wall with depth Y = 3 + sy*f(u) and height Z = 3 + su*u", () => {
    const { curves } = make();
    const c = COMPOSITIONS.sin3x;
    curves.setComposition(c);
    const side = drawn(curves.layers.side);
    expect(side.length).toBeGreaterThan(0);
    for (const v of side) expect(v[0]).toBeCloseTo(-3 + 0.01, 5);
    for (const v of [side[0]!, side[side.length >> 1]!, side[side.length - 1]!]) {
      const u = (v[2]! - 3) / c.su;
      expect(v[1]).toBeCloseTo(3 + c.sy * Math.sin(u), 4);
    }
    curves.dispose();
  });

  it("drops the undefined half of sqrt on the side wall", () => {
    const { curves } = make();
    curves.setComposition(COMPOSITIONS.sqrtq);
    const side = drawn(curves.layers.side);
    // 121 of the 241 samples have u >= 0, so 120 segments survive.
    expect(side).toHaveLength(240);
    for (const v of side) expect(v[2]).toBeGreaterThanOrEqual(3 - 1e-6);
    curves.dispose();
  });

  it("clips the side curve to the wall", () => {
    const { curves } = make();
    curves.setComposition(COMPOSITIONS.gauss);
    const side = drawn(curves.layers.side);
    expect(side.length).toBeGreaterThan(0);
    const ys = side.map((v) => v[1]!);
    for (const y of ys) expect(y).toBeLessThanOrEqual(6 + 1e-6);
    // e^u leaves the wall above u ~ 0.18, so the clip actually bit.
    expect(Math.max(...ys)).toBeCloseTo(6, 5);
    curves.dispose();
  });

  it("dispose releases the three layers and drops the theme listener", () => {
    const { curves, theme } = make();
    const remove = vi.spyOn(theme, "removeEventListener");
    const geometries = (["front", "side", "floor"] as const).map((k) =>
      vi.spyOn(curves.layers[k].geometry, "dispose"),
    );
    const materials = (["front", "side", "floor"] as const).map((k) =>
      vi.spyOn(curves.layers[k].material, "dispose"),
    );
    curves.dispose();
    for (const spy of [...geometries, ...materials]) expect(spy).toHaveBeenCalledTimes(1);
    expect(remove).toHaveBeenCalledWith("change", expect.any(Function));
  });
});
