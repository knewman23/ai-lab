import type { Graph, Values } from "../../core/math/autograd";
import { createSlider, type Slider } from "../../ui/slider";
import type { ControlInfo } from "../../ui/info";

export interface LeafSliders {
  /** Moves each slider to `leaves` without firing `onLeaf`. */
  render(leaves: Values): void;
  /** Removes the sliders from the section. */
  dispose(): void;
}

/** Appends one linear slider per leaf of `graph` to `section`; panel.ts rebuilds it when the graph changes. */
export function createLeafSliders(
  section: HTMLElement,
  graph: Graph,
  onLeaf: (id: string, v: number) => void,
  /** Shared by every leaf: they are all the same kind of thing, a given input. */
  info?: ControlInfo,
): LeafSliders {
  const sliders = new Map<string, Slider>();
  for (const leaf of graph.leaves) {
    const slider = createSlider({
      label: leaf.id,
      min: leaf.range[0],
      max: leaf.range[1],
      step: 0.01,
      value: leaf.start,
      onChange: (v) => onLeaf(leaf.id, v),
      info,
    });
    sliders.set(leaf.id, slider);
    section.append(slider.el);
  }

  return {
    render(leaves: Values): void {
      for (const [id, slider] of sliders) {
        const v = leaves[id];
        if (v !== undefined && slider.value !== v) slider.value = v;
      }
    },
    dispose(): void {
      for (const slider of sliders.values()) slider.el.remove();
      sliders.clear();
    },
  };
}
