import { SIZES } from "../../core/math/mlp";
import { fmt } from "../../ui/readout";
import type { LabelLayer } from "../shared/labels";
import { floorPoint, neuronWorld } from "./layout";
import type { Derived, NnState } from "./state";

/** How far above a column's top neuron (along +z) its name hangs. */
const COLUMN_LIFT = 0.45;
/** How far to the left (along −x) of an input neuron its coordinate name sits. */
const INPUT_DX = 0.45;
/** How far above the probe sphere (along +z) its output reads. */
const PROBE_LIFT = 0.35;

/** One name per layer, in `SIZES` order. */
const COLUMN_NAMES: readonly string[] = ["input", "hidden", "hidden", "output"];

/** The two input coordinates, beside the two neurons of layer 0. */
const INPUT_NAMES: readonly string[] = ["x₁", "x₂"];

/**
 * Writes every label the current state calls for into `labels`: each layer's name above its top
 * neuron, `x₁` and `x₂` beside the two input neurons, and the network's output at the probe.
 *
 * The label set never changes — only the probe's text and every label's world point move — so the
 * layer rewrites spans in place under stable ids (`col:`, `in:`, `probe`) and nothing is removed.
 */
export function syncLabels(labels: LabelLayer, state: NnState, d: Derived): void {
  for (let l = 0; l < SIZES.length; l++) {
    const name = COLUMN_NAMES[l];
    if (name === undefined) continue;
    const [x, y, z] = neuronWorld(l, 0);
    labels.set(`col:${l}`, name, [x, y, z + COLUMN_LIFT], "node");
  }

  INPUT_NAMES.forEach((name, i) => {
    const [x, y, z] = neuronWorld(0, i);
    labels.set(`in:${i}`, name, [x - INPUT_DX, y, z], "node");
  });

  const [px, py, pz] = floorPoint(state.probe);
  labels.set("probe", fmt(d.probeOutput), [px, py, pz + PROBE_LIFT], "value");
}
