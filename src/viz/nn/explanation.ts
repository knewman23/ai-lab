import { createEquation } from "../../ui/equation";
import { formatLr, fmt, proseNum } from "../../ui/readout";
import type { Derived, NnState } from "./state";
import type { OverviewSpec } from "../../ui/overview";
import type { ControlInfo } from "../../ui/info";

/** One entry per control, in the panel's order: what it changes, and what to watch. */
export const CONTROL_INFO = {
  dataset: {
    what:
      "Swaps the points the network is asked to separate, and restarts training from that " +
      "dataset's own seed at epoch 0.",
    why:
      "None of the three can be split by a straight line, which is the reason for a hidden layer " +
      "at all. XOR needs a cross, two moons needs a curve and circles needs a ring, and the same " +
      "network learns all three by moving only its weights.",
  },
  lr: {
    what: "How far every weight moves along its gradient on each epoch.",
    why:
      "The knob that decides whether training converges or thrashes. Raise it and the loss falls " +
      "faster until it starts overshooting and the boundary flails; lower it and progress is " +
      "steady but slow. It can be changed mid-run without restarting.",
  },
  showWeights: {
    what: "Draws the network itself: a column of units per layer, linked by their weights.",
    why:
      "Link thickness is the size of a weight and its colour is the sign, so training is visible " +
      "as the links reorganising. With the probe on, the columns also show that input's " +
      "activations layer by layer, which is the chain the output at the end comes from.",
  },
  showData: {
    what: "Draws the training points on the floor, coloured by their true class.",
    why:
      "The examples are the only thing the network is fitted to. Accuracy in the training line " +
      "is the fraction of exactly these points that land on the correct side of the boundary.",
  },
  showBoundary: {
    what: "Shades the floor by what the network predicts at every point, not just where data sits.",
    why:
      "This is the function that was learned. Watching it bend from an arbitrary split into the " +
      "shape of the data is the whole of training, and the pale band running through it is where " +
      "the network is least certain.",
  },
} as const satisfies Readonly<Record<string, ControlInfo>>;

export const OVERVIEW: OverviewSpec = {
  summary: "Learning a boundary that no straight line could have drawn",
  objective:
    "A network of small units, each squashing a weighted sum, can carve a curved boundary " +
    "between two classes. Training moves the weights until that boundary separates the data, and " +
    "nothing about its shape is designed — all of it is learned from the examples.",
  whereUsed:
    "Classifiers over tabular data: fraud detection deciding whether a card transaction is " +
    "unusual, credit scoring rating an applicant, and diagnostic models weighing a patient's " +
    "measurements. The same shape as here — a handful of numbers in, one probability out.",
  example:
    "A card transaction arrives as a few numbers: amount, time of day, distance from the last " +
    "purchase. Fraudulent and legitimate ones cannot be told apart by a single straight cut " +
    "through those numbers, which is exactly the difficulty the four clusters on this floor are " +
    "a miniature of.",
};

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
    `to every weight (the backprop scene, done 28 times at once), then a step of size η = ${formatLr(s.lr)}.`
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
