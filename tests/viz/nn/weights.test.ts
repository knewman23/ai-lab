import type { Mesh, MeshStandardMaterial } from "three";
import { describe, expect, it, vi } from "vitest";
import { initParams, SIZES } from "../../../src/core/math/mlp";
import { createThemeColors } from "../../../src/core/theme";
import { neuronPosition } from "../../../src/viz/nn/layout";
import { createWeights } from "../../../src/viz/nn/weights";

const TOKENS: Readonly<Record<string, string>> = {
  "--ink": "#112233",
  "--accent": "#aa2244",
};

const PARAMS = initParams(1);
/** The strut lift: struts sit 0.08 toward −y so a full-thickness one clears the wall. */
const LIFT = -0.08;

/** Every strut in creation order: layer, then output index, then input index. */
function cells(): readonly { l: number; o: number; i: number; w: number }[] {
  const out: { l: number; o: number; i: number; w: number }[] = [];
  for (let l = 0; l + 1 < SIZES.length; l++) {
    const inputs = SIZES[l]!;
    for (let o = 0; o < SIZES[l + 1]!; o++) {
      for (let i = 0; i < inputs; i++) {
        out.push({ l, o, i, w: PARAMS.weights[l]![o * inputs + i]! });
      }
    }
  }
  return out;
}

function endpoints(l: number, o: number, i: number): readonly [number[], number[]] {
  const [ax, az] = neuronPosition(l, i);
  const [bx, bz] = neuronPosition(l + 1, o);
  return [
    [ax, LIFT, az],
    [bx, LIFT, bz],
  ];
}

function make() {
  const theme = createThemeColors((token) => TOKENS[token] ?? "#010203");
  const weights = createWeights(theme);
  weights.set(PARAMS);
  return { weights, theme };
}

function materialOf(mesh: Mesh): MeshStandardMaterial {
  return mesh.material as MeshStandardMaterial;
}

describe("createWeights", () => {
  it("is one strut per weight: 8 + 16 + 4", () => {
    const { weights } = make();
    expect(weights.struts).toHaveLength(28);
    weights.dispose();
  });

  it("places each strut at the midpoint of its two neurons, spanning them", () => {
    const { weights } = make();
    cells().forEach(({ l, o, i, w }, n) => {
      const [a, b] = endpoints(l, o, i);
      const strut = weights.struts[n]!;
      expect(strut.position.x).toBeCloseTo((a[0]! + b[0]!) / 2, 9);
      expect(strut.position.y).toBeCloseTo(LIFT, 9);
      expect(strut.position.z).toBeCloseTo((a[2]! + b[2]!) / 2, 9);

      const length = Math.hypot(b[0]! - a[0]!, b[1]! - a[1]!, b[2]! - a[2]!);
      const t = 0.02 + 0.12 * Math.min(1, Math.abs(w) / 3);
      expect(strut.scale.y).toBeCloseTo(length, 9);
      expect(strut.scale.x).toBeCloseTo(t, 9);
      expect(strut.scale.z).toBeCloseTo(t, 9);
    });
    weights.dispose();
  });

  it("colours positive weights ink and negative accent, with two shared materials", () => {
    const { weights, theme } = make();
    const materials = new Set(weights.struts.map(materialOf));
    expect(materials.size).toBe(2);
    cells().forEach(({ w }, n) => {
      const colour = materialOf(weights.struts[n]!).color;
      expect(colour.equals(w < 0 ? theme.accent : theme.ink)).toBe(true);
    });
    weights.dispose();
  });

  it("setShow toggles the group", () => {
    const { weights } = make();
    weights.setShow(false);
    expect(weights.group.visible).toBe(false);
    weights.setShow(true);
    expect(weights.group.visible).toBe(true);
    weights.dispose();
  });

  it("recolours both materials when the theme changes", () => {
    const { weights, theme } = make();
    theme.ink.setHex(0x123456);
    theme.accent.setHex(0x654321);
    theme.dispatchEvent(new Event("change"));
    const materials = [...new Set(weights.struts.map(materialOf))];
    expect(materials.some((m) => m.color.equals(theme.ink))).toBe(true);
    expect(materials.some((m) => m.color.equals(theme.accent))).toBe(true);
    weights.dispose();
  });

  it("dispose releases one geometry, both materials and the theme listener", () => {
    const { weights, theme } = make();
    const remove = vi.spyOn(theme, "removeEventListener");
    const geometries = new Set(weights.struts.map((mesh) => mesh.geometry));
    const materials = new Set(weights.struts.map(materialOf));
    expect(geometries.size).toBe(1);
    expect(materials.size).toBe(2);
    const spies = [
      ...[...geometries].map((g) => vi.spyOn(g, "dispose")),
      ...[...materials].map((m) => vi.spyOn(m, "dispose")),
    ];
    weights.dispose();
    for (const spy of spies) expect(spy).toHaveBeenCalledTimes(1);
    expect(remove).toHaveBeenCalledWith("change", expect.any(Function));
  });
});
