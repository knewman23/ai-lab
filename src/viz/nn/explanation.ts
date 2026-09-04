import { createEquation } from "../../ui/equation";
import { fmt, proseNum } from "../../ui/readout";
import type { Derived, NnState } from "./state";

/**
 * The three rules the scene shows, in the order they are applied: a layer's activation, the loss it
 * is scored by, and the gradient step that changes the weights. None of them depends on the state,
 * so they are rendered once; the learning rate lives in the prose below them, not in the update.
 */
const EQUATION_TEX: readonly string[] = [
  "a^{(l)} = \\tanh(W^{(l)} a^{(l-1)} + b^{(l)})",
  "L = \\frac{1}{N}\\sum_i (\\hat y_i - y_i)^2",
  "W \\leftarrow W - \\eta\\, \\partial L/\\partial W",
];

/** "Epoch <n>: loss <fmt>, accuracy <pct>%", the live line under the training buttons. */
export function trainingLine(s: NnState, d: Derived): string {
  return `Epoch ${s.epoch}: loss ${proseNum(d.loss)}, accuracy ${Math.round(d.accuracy * 100)}%`;
}

/**
 * "(x₁, x₂) → <output> (<class>)" for the probe row. An output of exactly 0 reads "−1", matching
 * `accuracy`, which counts 0 as wrong. The class in parentheses is a label, not a formatted number,
 * so it keeps the typographic minus of "+1"/"−1" in `datasets.ts` while the coordinates and the
 * output stay on `fmt`'s plain hyphen like every other readout.
 */
export function probeText(s: NnState, d: Derived): string {
  const cls = d.probeOutput > 0 ? "+1" : "−1";
  return `(${fmt(s.probe[0])}, ${fmt(s.probe[1])}) → ${fmt(d.probeOutput)} (${cls})`;
}

/** The sentence that ties one Step to the backprop scene; 28 is the network's weight count. */
function epochText(s: NnState): string {
  return (
    "Each Step runs one full-batch gradient descent epoch: the gradient of the loss with respect " +
    `to every weight (the backprop scene, done 28 times at once), then a step of size η = ${proseNum(s.lr)}.`
  );
}

export interface NnExplanation {
  el: HTMLElement;
  render(s: NnState, d: Derived): void;
}

/** The neural network explanation: the layer, loss and update rules, the epoch sentence and the dataset's hint. */
export function createNnExplanation(host: HTMLElement): NnExplanation {
  const el = document.createElement("div");
  el.className = "explain";
  host.append(el);

  for (const tex of EQUATION_TEX) {
    const equation = createEquation();
    equation.set(tex);
    el.append(equation.el);
  }

  const epochPara = document.createElement("p");
  const hintPara = document.createElement("p");
  hintPara.className = "hint";
  el.append(epochPara, hintPara);

  return {
    el,
    render(s: NnState, d: Derived): void {
      epochPara.textContent = epochText(s);
      hintPara.textContent = d.dataset.hint;
    },
  };
}
