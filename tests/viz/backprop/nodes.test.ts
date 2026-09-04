import { Mesh, MeshStandardMaterial, SphereGeometry } from "three";
import { describe, expect, it, vi } from "vitest";
import { revealed } from "../../../src/core/math/autograd";
import { GRAPHS } from "../../../src/core/math/graphs";
import { createThemeColors } from "../../../src/core/theme";
import { layoutGraph, wallPoint } from "../../../src/viz/backprop/layout";
import { createNodes } from "../../../src/viz/backprop/nodes";

const neuron = GRAPHS.neuron;
const layout = layoutGraph(neuron);

function make() {
  const theme = createThemeColors(() => "#1f4ed8");
  return { nodes: createNodes(theme), theme };
}

function material(mesh: Mesh): MeshStandardMaterial {
  return mesh.material as MeshStandardMaterial;
}

describe("createNodes", () => {
  it("places one sphere per node at its wall point, in node order", () => {
    const { nodes } = make();
    nodes.set(neuron, layout, revealed(neuron, 0).values);
    expect(nodes.meshes.size).toBe(10);
    for (const node of neuron.nodes) {
      const mesh = nodes.meshes.get(node.id)!;
      expect(mesh.position.toArray()).toEqual(wallPoint(layout, node.id));
      expect(mesh.renderOrder).toBe(10);
    }
    nodes.dispose();
  });

  it("styles leaves --ink r 0.16, ops --soft r 0.14, output --accent r 0.16", () => {
    const { nodes, theme } = make();
    nodes.set(neuron, layout, revealed(neuron, 0).values);
    const radius = (id: string) =>
      (nodes.meshes.get(id)!.geometry as SphereGeometry).parameters.radius;
    const colour = (id: string) => material(nodes.meshes.get(id)!).color;
    expect(radius("x1")).toBe(0.16);
    expect(colour("x1").equals(theme.ink)).toBe(true);
    expect(radius("sum")).toBe(0.14);
    expect(colour("sum").equals(theme.soft)).toBe(true);
    expect(radius("o")).toBe(0.16);
    expect(colour("o").equals(theme.accent)).toBe(true);
    expect(material(nodes.meshes.get("o")!).roughness).toBe(0.5);
    expect(material(nodes.meshes.get("o")!).transparent).toBe(true);
    nodes.dispose();
  });

  it("dims nodes whose value is not yet revealed", () => {
    const { nodes } = make();
    nodes.set(neuron, layout, revealed(neuron, 0).values);
    expect(material(nodes.meshes.get("x1")!).opacity).toBe(1);
    expect(material(nodes.meshes.get("sum")!).opacity).toBe(0.35);
    nodes.set(neuron, layout, revealed(neuron, 3).values);
    expect(material(nodes.meshes.get("sum")!).opacity).toBe(1);
    expect(material(nodes.meshes.get("n")!).opacity).toBe(0.35);
    nodes.dispose();
  });

  it("recolours on theme change", () => {
    const { nodes, theme } = make();
    nodes.set(neuron, layout, revealed(neuron, 0).values);
    theme.ink.set("#123456");
    theme.dispatchEvent(new Event("change"));
    expect(material(nodes.meshes.get("x1")!).color.getHexString()).toBe("123456");
    nodes.dispose();
  });

  it("rebuilds for another graph and disposes the old materials", () => {
    const { nodes } = make();
    nodes.set(neuron, layout, revealed(neuron, 0).values);
    const old = [...nodes.meshes.values()].map((m) => vi.spyOn(material(m), "dispose"));
    const g = GRAPHS["product-sum"];
    nodes.set(g, layoutGraph(g), revealed(g, 0).values);
    expect(nodes.meshes.size).toBe(5);
    expect(nodes.group.children).toHaveLength(5);
    for (const spy of old) expect(spy).toHaveBeenCalledTimes(1);
    nodes.dispose();
  });

  it("dispose releases geometries and materials and drops the theme listener", () => {
    const { nodes, theme } = make();
    nodes.set(neuron, layout, revealed(neuron, 0).values);
    const remove = vi.spyOn(theme, "removeEventListener");
    const geometries = new Set([...nodes.meshes.values()].map((m) => m.geometry));
    const spies = [
      ...[...geometries].map((g) => vi.spyOn(g, "dispose")),
      ...[...nodes.meshes.values()].map((m) => vi.spyOn(material(m), "dispose")),
    ];
    nodes.dispose();
    for (const spy of spies) expect(spy).toHaveBeenCalledTimes(1);
    expect(remove).toHaveBeenCalledWith("change", expect.any(Function));
    expect(nodes.group.children).toHaveLength(0);
  });
});
