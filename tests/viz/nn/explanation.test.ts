// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { DATASETS } from "../../../src/core/math/datasets";
import { fmt, proseNum } from "../../../src/ui/readout";
import { createNnExplanation, probeText, trainingLine } from "../../../src/viz/nn/explanation";
import type { Derived, NnState } from "../../../src/viz/nn/state";
import { derived, initialState, setDataset, setProbe, trainEpoch } from "../../../src/viz/nn/state";

/** A state and its `derived`, the pair every explanation function takes. */
function pair(s: NnState): [NnState, Derived] {
  return [s, derived(s)];
}

/** The first probe on a coarse grid whose output has the wanted sign. */
function probeWithOutput(s: NnState, want: 1 | -1): NnState {
  for (let x = -3; x <= 3; x += 0.5) {
    for (let y = -3; y <= 3; y += 0.5) {
      const candidate = setProbe(s, [x, y]);
      const out = derived(candidate).probeOutput;
      if (Math.sign(out) === want) return candidate;
    }
  }
  throw new Error(`no probe with output sign ${want}`);
}

describe("trainingLine", () => {
  it("reports the epoch, loss and accuracy percentage", () => {
    const [s, d] = pair(initialState());
    expect(trainingLine(s, d)).toBe(
      `Epoch 0: loss ${proseNum(d.loss)}, accuracy ${Math.round(d.accuracy * 100)}%`,
    );
  });

  it("follows the epoch counter and the falling loss", () => {
    let s = initialState();
    for (let i = 0; i < 20; i++) s = trainEpoch(s);
    const d = derived(s);
    expect(d.loss).toBeLessThan(derived(initialState()).loss);
    expect(trainingLine(s, d)).toBe(
      `Epoch 20: loss ${proseNum(d.loss)}, accuracy ${Math.round(d.accuracy * 100)}%`,
    );
  });
});

describe("probeText", () => {
  it("reads the probe coordinates, the output and the predicted class", () => {
    const base = initialState();
    const positive = probeWithOutput(base, 1);
    const dp = derived(positive);
    expect(probeText(positive, dp)).toBe(
      `(${fmt(positive.probe[0])}, ${fmt(positive.probe[1])}) → ${fmt(dp.probeOutput)} (+1)`,
    );

    const negative = probeWithOutput(base, -1);
    const dn = derived(negative);
    expect(probeText(negative, dn)).toBe(
      `(${fmt(negative.probe[0])}, ${fmt(negative.probe[1])}) → ${fmt(dn.probeOutput)} (−1)`,
    );
  });

  it("counts an output of exactly 0 as −1, matching accuracy", () => {
    const s = setProbe(initialState(), [1, -2]);
    const d: Derived = { ...derived(s), probeOutput: 0 };
    expect(probeText(s, d)).toBe("(1, -2) → 0 (−1)");
  });
});

describe("createNnExplanation", () => {
  it("renders the three equations once and keeps them across renders", () => {
    const host = document.createElement("div");
    const explanation = createNnExplanation(host);
    const equations = [...host.querySelectorAll(".equation")];
    expect(equations.length).toBe(3);
    expect(equations.every((eq) => eq.querySelector(".katex") !== null)).toBe(true);

    const first = equations[0]?.querySelector(".katex");
    const s = initialState();
    explanation.render(s, derived(s));
    explanation.render(s, derived(s));
    const moons = setDataset(s, "moons");
    explanation.render(moons, derived(moons));
    // The equations are the same for every dataset and epoch, so they never re-render.
    expect(equations[0]?.querySelector(".katex")).toBe(first);
  });

  it("writes the epoch sentence with the learning rate and the dataset's hint", () => {
    const host = document.createElement("div");
    const explanation = createNnExplanation(host);
    const s = initialState();
    explanation.render(s, derived(s));
    expect([...host.querySelectorAll("p")].map((p) => p.textContent)).toEqual([
      "Each Step runs one full-batch gradient descent epoch: the gradient of the loss with respect to every weight (the backprop scene, done 28 times at once), then a step of size η = 0.1.",
      DATASETS.xor.hint,
    ]);

    const moons = setDataset(s, "moons");
    explanation.render(moons, derived(moons));
    expect(host.querySelector("p.hint")?.textContent).toBe(DATASETS.moons.hint);
  });
});
