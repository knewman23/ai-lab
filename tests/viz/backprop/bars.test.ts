import { BoxGeometry, Mesh, MeshBasicMaterial } from "three";
import { describe, expect, it, vi } from "vitest";
import { backward, forward, revealed, starts } from "../../../src/core/math/autograd";
import { GRAPHS } from "../../../src/core/math/graphs";
import { createThemeColors } from "../../../src/core/theme";
import { createBars } from "../../../src/viz/backprop/bars";
import { barTransform, EASE_MS, ease, Eased } from "../../../src/viz/backprop/bars-geometry";
import { layoutGraph } from "../../../src/viz/backprop/layout";

const neuron = GRAPHS.neuron;
const layout = layoutGraph(neuron);
const values = forward(neuron, starts(neuron));
const noGrads = {};
const allGrads = backward(neuron, values);
const leavesOnly = revealed(neuron, 0);
const everything = revealed(neuron, 10);
const SHOW = { values: true, grads: true } as const;

describe("barTransform", () => {
  it("scales values by 0.3 and gradients by 1.5, clamped to 3", () => {
    expect(barTransform("value", 2, true).length).toBeCloseTo(0.6);
    expect(barTransform("value", 40, true).length).toBe(3);
    expect(barTransform("grad", -1.5, true).length).toBeCloseTo(2.25);
    expect(barTransform("grad", -33, true).length).toBe(3);
  });

  it("puts positive bars toward -y and negative bars toward +y", () => {
    expect(barTransform("value", 2, true).centreY).toBeCloseTo(-0.3);
    expect(barTransform("grad", -1.5, true).centreY).toBeCloseTo(1.125);
    expect(barTransform("value", 0, true).centreY).toBe(0);
  });

  it("is visible exactly when revealed", () => {
    expect(barTransform("value", 2, true).visible).toBe(true);
    expect(barTransform("value", 2, false).visible).toBe(false);
  });
});

describe("ease", () => {
  it("is 1 - (1 - t)^3", () => {
    expect(ease(0)).toBe(0);
    expect(ease(1)).toBe(1);
    expect(ease(0.5)).toBeCloseTo(0.875);
  });
});

describe("Eased", () => {
  it("moves toward the target over EASE_MS and reports when it stops", () => {
    expect(EASE_MS).toBe(300);
    const e = new Eased(false);
    e.set(3);
    expect(e.advance(150)).toBe(true);
    expect(e.value).toBeCloseTo(2.625);
    expect(e.advance(150)).toBe(false);
    expect(e.value).toBe(3);
  });

  it("jumps when set instantly", () => {
    const e = new Eased(false);
    e.set(1, { instant: true });
    expect(e.value).toBe(1);
    expect(e.advance(16)).toBe(false);
  });

  it("settles immediately when the target is already the value", () => {
    const e = new Eased(false);
    e.set(0);
    expect(e.moving).toBe(false);
    expect(e.advance(16)).toBe(false);
  });

  it("treats every set as instant under reduced motion", () => {
    const e = new Eased(true);
    e.set(2);
    expect(e.value).toBe(2);
    expect(e.advance(16)).toBe(false);
  });
});

function make(reducedMotion = true) {
  const theme = createThemeColors(() => "#1f4ed8");
  return { bars: createBars(theme, reducedMotion), theme };
}

describe("createBars", () => {
  it("places x1's value bar at X - 0.12 scaled to 0.3 * |value|", () => {
    const { bars } = make();
    bars.set(neuron, layout, values, noGrads, leavesOnly, SHOW, "step");
    const bar = bars.bars.get("x1")!.value;
    expect(bar.visible).toBe(true);
    expect(bar.position.x).toBeCloseTo(layout.x1![0] - 0.12);
    expect(bar.position.y).toBeCloseTo(-0.3);
    expect(bar.position.z).toBeCloseTo(layout.x1![1]);
    expect(bar.scale.y).toBeCloseTo(0.6);
    bars.dispose();
  });

  it("hides a grad bar while its gradient is unknown and shows it once it lands", () => {
    const { bars } = make();
    bars.set(neuron, layout, values, noGrads, leavesOnly, SHOW, "step");
    expect(bars.bars.get("x1")!.grad.visible).toBe(false);
    bars.set(neuron, layout, values, allGrads, everything, SHOW, "step");
    const grad = bars.bars.get("x1")!.grad;
    expect(grad.visible).toBe(true);
    expect(grad.position.x).toBeCloseTo(layout.x1![0] + 0.12);
    expect(grad.scale.y).toBeCloseTo(2.25);
    expect(grad.position.y).toBeCloseTo(1.125);
    bars.dispose();
  });

  it("hides every value bar when show.values is off", () => {
    const { bars } = make();
    bars.set(neuron, layout, values, allGrads, everything, { values: false, grads: true }, "step");
    for (const pair of bars.bars.values()) {
      expect(pair.value.visible).toBe(false);
      expect(pair.grad.visible).toBe(true);
    }
    bars.dispose();
  });

  it("colours value bars --soft and grad bars --accent", () => {
    const { bars, theme } = make();
    bars.set(neuron, layout, values, noGrads, leavesOnly, SHOW, "step");
    const pair = bars.bars.get("x1")!;
    expect((pair.value.material as MeshBasicMaterial).color.equals(theme.soft)).toBe(true);
    expect((pair.grad.material as MeshBasicMaterial).color.equals(theme.accent)).toBe(true);
    bars.dispose();
  });

  it("recolours on theme change", () => {
    const { bars, theme } = make();
    bars.set(neuron, layout, values, noGrads, leavesOnly, SHOW, "step");
    theme.soft.set("#123456");
    theme.accent.set("#abcdef");
    theme.dispatchEvent(new Event("change"));
    const pair = bars.bars.get("x1")!;
    expect((pair.value.material as MeshBasicMaterial).color.getHexString()).toBe("123456");
    expect((pair.grad.material as MeshBasicMaterial).color.getHexString()).toBe("abcdef");
    bars.dispose();
  });

  it("eases on a step and jumps on an edit", () => {
    const { bars } = make(false);
    bars.set(neuron, layout, values, noGrads, leavesOnly, SHOW, "step");
    const bar = bars.bars.get("x1")!.value;
    expect(bar.scale.y).toBe(0);
    expect(bars.update(150)).toBe(true);
    expect(bar.scale.y).toBeCloseTo(0.6 * 0.875);
    expect(bar.position.y).toBeCloseTo(-(0.6 * 0.875) / 2);
    expect(bars.update(150)).toBe(false);
    expect(bar.scale.y).toBeCloseTo(0.6);
    // A changed, already-revealed bar eases on a step (an accumulating gradient)...
    bars.set(neuron, layout, { ...values, x1: 3 }, noGrads, leavesOnly, SHOW, "step");
    expect(bar.scale.y).toBeCloseTo(0.6);
    expect(bars.update(300)).toBe(false);
    expect(bar.scale.y).toBeCloseTo(0.9);
    // ...and jumps on a leaf edit.
    bars.set(neuron, layout, { ...values, x1: 4 }, noGrads, leavesOnly, SHOW, "edit");
    expect(bar.scale.y).toBeCloseTo(1.2);
    expect(bars.update(16)).toBe(false);
    bars.dispose();
  });

  it("has an invisible 0.4 x 6.4 x 0.4 hit box per leaf, in leaf order", () => {
    const { bars } = make();
    bars.set(neuron, layout, values, noGrads, leavesOnly, SHOW, "step");
    expect(bars.leafIds).toEqual(["x1", "w1", "x2", "w2", "b"]);
    expect(bars.hitTargets).toHaveLength(5);
    bars.hitTargets.forEach((hit, i) => {
      const id = bars.leafIds[i]!;
      expect(hit.visible).toBe(true);
      expect((hit.material as MeshBasicMaterial).visible).toBe(false);
      const box = hit.geometry as BoxGeometry;
      expect(box.parameters.width).toBe(0.4);
      expect(box.parameters.height).toBe(6.4);
      expect(box.parameters.depth).toBe(0.4);
      expect(hit.position.x).toBeCloseTo(layout[id]![0] - 0.12);
      expect(hit.position.y).toBe(0);
      expect(hit.position.z).toBeCloseTo(layout[id]![1]);
    });
    bars.dispose();
  });

  it("rebuilds for another graph and returns false from update when nothing moves", () => {
    const { bars } = make();
    bars.set(neuron, layout, values, noGrads, leavesOnly, SHOW, "step");
    const g = GRAPHS["product-sum"];
    const pos = layoutGraph(g);
    bars.set(g, pos, forward(g, starts(g)), {}, revealed(g, 0), SHOW, "step");
    expect(bars.bars.size).toBe(5);
    expect(bars.leafIds).toEqual(["a", "b", "c"]);
    // 10 bars plus the fixed pool of 5 hit boxes.
    expect(bars.group.children.filter((o) => o instanceof Mesh)).toHaveLength(15);
    expect(bars.update(16)).toBe(false);
    bars.dispose();
  });

  it("keeps the hit box pool's identity across a graph switch, hiding unused boxes", () => {
    const { bars } = make();
    bars.set(neuron, layout, values, noGrads, leavesOnly, SHOW, "step");
    const targets = bars.hitTargets;
    const leafIds = bars.leafIds;
    const meshes = [...targets];
    const g = GRAPHS["product-sum"];
    const pos = layoutGraph(g);
    bars.set(g, pos, forward(g, starts(g)), {}, revealed(g, 0), SHOW, "step");
    expect(bars.hitTargets).toBe(targets);
    expect(bars.leafIds).toBe(leafIds);
    expect(targets).toHaveLength(5);
    targets.forEach((hit, i) => expect(hit).toBe(meshes[i]));
    expect(targets.map((hit) => hit.visible)).toEqual([true, true, true, false, false]);
    expect(targets[0]!.position.x).toBeCloseTo(pos.a![0] - 0.12);
    expect(targets[0]!.position.z).toBeCloseTo(pos.a![1]);
    bars.dispose();
  });

  it("dispose releases geometries and materials and drops the theme listener", () => {
    const { bars, theme } = make();
    bars.set(neuron, layout, values, noGrads, leavesOnly, SHOW, "step");
    const remove = vi.spyOn(theme, "removeEventListener");
    const pair = bars.bars.get("x1")!;
    const spies = [
      vi.spyOn(pair.value.geometry, "dispose"),
      vi.spyOn(pair.value.material as MeshBasicMaterial, "dispose"),
      vi.spyOn(pair.grad.material as MeshBasicMaterial, "dispose"),
      vi.spyOn(bars.hitTargets[0]!.geometry, "dispose"),
      vi.spyOn(bars.hitTargets[0]!.material as MeshBasicMaterial, "dispose"),
    ];
    bars.dispose();
    for (const spy of spies) expect(spy).toHaveBeenCalledTimes(1);
    expect(remove).toHaveBeenCalledWith("change", expect.any(Function));
    expect(bars.group.children).toHaveLength(0);
  });
});
