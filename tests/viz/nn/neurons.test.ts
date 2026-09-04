import type { Mesh, MeshStandardMaterial, SphereGeometry } from "three";
import { describe, expect, it, vi } from "vitest";
import { DOMAIN } from "../../../src/core/math/datasets";
import { SIZES } from "../../../src/core/math/mlp";
import { createThemeColors } from "../../../src/core/theme";
import { neuronPosition } from "../../../src/viz/nn/layout";
import { createNeurons } from "../../../src/viz/nn/neurons";

const ACTIVATIONS: readonly number[][] = [
  [0.5, -0.5],
  [1, 0, -1, 0.25],
  [0.2, -0.2, 0.9, -0.9],
  [0.8],
];

function make() {
  const theme = createThemeColors(() => "#1f4ed8");
  const neurons = createNeurons(theme);
  neurons.set(ACTIVATIONS);
  return { neurons, theme };
}

/**
 * Layer-major (l, i) pairs in creation order, with the activation at each already
 * scaled the way `set` scales it: layer 0 arrives in the probe domain [−3, 3].
 */
function cells(): readonly { l: number; i: number; a: number }[] {
  const out: { l: number; i: number; a: number }[] = [];
  for (let l = 0; l < SIZES.length; l++) {
    for (let i = 0; i < SIZES[l]!; i++) {
      const raw = ACTIVATIONS[l]![i]!;
      out.push({ l, i, a: l === 0 ? raw / DOMAIN[1] : raw });
    }
  }
  return out;
}

function materialOf(mesh: Mesh): MeshStandardMaterial {
  return mesh.material as MeshStandardMaterial;
}

describe("createNeurons", () => {
  it("is one mesh per neuron, at the layout point lifted off the wall", () => {
    const { neurons } = make();
    expect(neurons.meshes).toHaveLength(11);
    cells().forEach(({ l, i }, n) => {
      const [x, z] = neuronPosition(l, i);
      expect(neurons.meshes[n]!.position.toArray()).toEqual([x, -0.01, z]);
    });
    neurons.dispose();
  });

  it("shares one unit-radius geometry, drawn above the flat layers", () => {
    const { neurons } = make();
    for (const mesh of neurons.meshes) {
      expect((mesh.geometry as SphereGeometry).parameters.radius).toBe(1);
      expect(mesh.renderOrder).toBe(10);
      expect(materialOf(mesh).roughness).toBe(0.5);
    }
    neurons.dispose();
  });

  it("scales each unit sphere to the radius its activation asks for", () => {
    const { neurons } = make();
    cells().forEach(({ a }, n) => {
      const r = 0.08 + 0.14 * Math.abs(a);
      const { x, y, z } = neurons.meshes[n]!.scale;
      expect(x).toBeCloseTo(r, 9);
      expect(y).toBeCloseTo(r, 9);
      expect(z).toBeCloseTo(r, 9);
    });
    neurons.dispose();
  });

  it("scales the input layer from the probe domain before sizing it", () => {
    const { neurons } = make();
    neurons.set([[3, -3], ...ACTIVATIONS.slice(1)]);
    expect(neurons.meshes[0]!.scale.x).toBeCloseTo(0.22, 9);
    expect(neurons.meshes[1]!.scale.x).toBeCloseTo(0.22, 9);
    neurons.set([[1.5, 0], ...ACTIVATIONS.slice(1)]);
    expect(neurons.meshes[0]!.scale.x).toBeCloseTo(0.15, 9);
    expect(neurons.meshes[1]!.scale.x).toBeCloseTo(0.08, 9);
    neurons.dispose();
  });

  it("colours positive activations ink and negative accent, with two shared materials", () => {
    const { neurons, theme } = make();
    const materials = new Set(neurons.meshes.map(materialOf));
    expect(materials.size).toBe(2);
    const positive = materialOf(neurons.meshes[0]!);
    const negative = materialOf(neurons.meshes[1]!);
    expect(positive.color.equals(theme.ink)).toBe(true);
    expect(negative.color.equals(theme.accent)).toBe(true);
    cells().forEach(({ a }, n) => {
      expect(materialOf(neurons.meshes[n]!)).toBe(a < 0 ? negative : positive);
    });
    neurons.dispose();
  });

  it("recolours both materials when the theme changes", () => {
    const { neurons, theme } = make();
    theme.ink.setHex(0x123456);
    theme.accent.setHex(0x654321);
    theme.dispatchEvent(new Event("change"));
    expect(materialOf(neurons.meshes[0]!).color.equals(theme.ink)).toBe(true);
    expect(materialOf(neurons.meshes[1]!).color.equals(theme.accent)).toBe(true);
    neurons.dispose();
  });

  it("dispose releases the shared geometry, both materials and the theme listener", () => {
    const { neurons, theme } = make();
    const remove = vi.spyOn(theme, "removeEventListener");
    const geometries = new Set(neurons.meshes.map((mesh) => mesh.geometry));
    const materials = new Set(neurons.meshes.map(materialOf));
    expect(geometries.size).toBe(1);
    const spies = [
      ...[...geometries].map((g) => vi.spyOn(g, "dispose")),
      ...[...materials].map((m) => vi.spyOn(m, "dispose")),
    ];
    neurons.dispose();
    for (const spy of spies) expect(spy).toHaveBeenCalledTimes(1);
    expect(remove).toHaveBeenCalledWith("change", expect.any(Function));
  });
});
