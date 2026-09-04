import type { Graph } from "../../core/math/autograd";
import { createReadout, fmt } from "../../ui/readout";
import type { Derived } from "./state";

export interface BpReadouts {
  render(d: Derived): void;
  dispose(): void;
}

/** "<value>  ∂ <grad>"; each half is "—" until the pass has revealed it. */
function rowText(id: string, d: Derived): string {
  const value = d.revealed.values.has(id) ? fmt(d.values[id] ?? NaN) : "—";
  const grad = d.grads[id];
  return `${value}  ∂ ${grad === undefined ? "—" : fmt(grad)}`;
}

/** Appends the output row and one row per leaf to `section`; panel.ts rebuilds it when the graph changes. */
export function createBpReadouts(section: HTMLElement, graph: Graph): BpReadouts {
  const ids = [graph.output, ...graph.leaves.map((leaf) => leaf.id)];
  const readout = createReadout(ids);
  section.append(readout.el);

  return {
    render(d: Derived): void {
      for (const id of ids) readout.set(id, rowText(id, d));
    },
    dispose(): void {
      readout.el.remove();
    },
  };
}
