import { describe, expect, it } from "vitest";
import { VOCAB } from "../../../src/core/math/transformer";
import { stageReadout } from "../../../src/viz/gpt/panel-readouts";
import type { Derived, GptState, StageKey } from "../../../src/viz/gpt/state";
import {
  derived,
  initialState,
  setHead,
  setQuery,
  setStage,
  setTemperature,
} from "../../../src/viz/gpt/state";

/**
 * The §7 table, stage by stage. Every expected number here is a literal transcribed from the
 * reference figures, never recomputed with the formatter the implementation uses: the point of
 * this file is that the numbers reach the panel from `forward`, so a test that recomputed them
 * through the same helpers would agree with any implementation at all.
 */
function rowsAt(s: GptState): Map<string, string> {
  return new Map(stageReadout(s, derived(s)).rows);
}

function noteAt(s: GptState): string {
  return stageReadout(s, derived(s)).note;
}

function texAt(s: GptState): string {
  return stageReadout(s, derived(s)).tex;
}

const base = initialState();

describe("stageReadout: the §7 stage rows", () => {
  it("all: the selected row's weights and the top-3 next tokens", () => {
    const rows = rowsAt(setStage(base, "all"));
    expect(rows.get("Head 1 weights")).toBe("0.3196, 0.4388, 0.09807, 0.0184, 0.1252");
    expect(rows.get("Head 2 weights")).toBe("0.1964, 0.1227, 0.4137, 0.05799, 0.2093");
    expect(rows.get("Next token")).toBe("the 0.7892, sat 0.1306, cat 0.0414");
    expect(texAt(setStage(base, "all"))).toContain("softmax");
  });

  it("embed + position: the embedding, its pe(p) and their sum", () => {
    const rows = rowsAt(setStage(base, "embed"));
    expect(rows.get("Embedding")).toBe("the (0, 1.6)");
    expect(rows.get("pe(4)")).toBe("(-0.5229, -0.6054)");
    expect(rows.get("x(4)")).toBe("(-0.5229, 0.9946)");
  });

  it("scores: the raw score row per head, masked entries as —", () => {
    const rows = rowsAt(setStage(base, "scores"));
    expect(rows.get("Head 1 scores")).toBe("1.419, 1.736, 0.2381, -1.435, 0.4824");
    expect(rows.get("Head 2 scores")).toBe("0.8294, 0.3585, 1.574, -0.3905, 0.8928");

    const middle = rowsAt(setQuery(setStage(base, "scores"), 2));
    expect(middle.get("Head 1 scores")).toBe("2.563, 2.5, 1.821, —, —");
    expect(middle.get("Head 2 scores")).toBe("0.5215, -0.8624, 3.369, —, —");
  });

  it("softmax: the weight row, summing to 1, and the blend when both heads are shown", () => {
    const one = rowsAt(setHead(setStage(base, "softmax"), "head1"));
    expect(one.get("Head 1 weights")).toBe("0.3196, 0.4388, 0.09807, 0.0184, 0.1252");
    expect(one.get("Sum")).toBe("1");
    expect(one.has("Head 2 weights")).toBe(false);

    const both = rowsAt(setStage(base, "softmax"));
    expect(both.get("Blend")).toBe("0.2546, 0.3025, 0.1912, 0.0296, 0.1421");
    expect(both.has("Sum")).toBe(false);
  });

  it("weighted sum: each a_ij v_j term and the head's total", () => {
    const rows = rowsAt(setHead(setStage(base, "weighted"), "head2"));
    expect(rows.get("Head 2 terms")).toBe(
      "0.1964 × (0.64, 1.28) + 0.1227 × (1.466, 1.179) + 0.4137 × (-1.386, 1.062) + " +
        "0.05799 × (-1.114, -1.03) + 0.2093 × (-0.4183, 0.7956)",
    );
    expect(rows.get("Head 2 total")).toBe("(-0.4201, 0.942)");
    expect(rowsAt(setStage(base, "weighted")).get("attnOut")).toBe("(0.3111, 1.21)");
  });

  it("+ residual: the two vectors and their sum", () => {
    const rows = rowsAt(setStage(base, "residual"));
    expect(rows.get("x(4)")).toBe("(-0.5229, 0.9946)");
    expect(rows.get("attnOut")).toBe("(0.3111, 1.21)");
    expect(rows.get("x'(4)")).toBe("(-0.2119, 2.205)");
  });

  it("MLP: the four hidden activations and the output vector", () => {
    const rows = rowsAt(setStage(base, "mlp"));
    expect(rows.get("tanh(W₁x' + b₁)")).toBe("0.4677, 0.9805, -0.9835, -0.6164");
    expect(rows.get("W₂h + b₂")).toBe("(-0.3868, 0.4325)");
    expect(rows.get("x''(4)")).toBe("(-0.5987, 2.637)");
  });

  it("logits: all eight logits and probabilities, sorted", () => {
    const readout = stageReadout(setStage(base, "logits"), derived(setStage(base, "logits")));
    expect(readout.rows.map(([key]) => key)).toEqual([
      "the",
      "sat",
      "cat",
      "ran",
      "dog",
      "on",
      "mat",
      "fast",
    ]);
    expect(readout.rows).toHaveLength(VOCAB.length);
    expect(new Map(readout.rows).get("the")).toBe("logit 4.219 → p 0.7892");
    expect(new Map(readout.rows).get("fast")).toBe("logit -4.459 → p 0.0001344");
  });
});

describe("stageReadout: the Sum row", () => {
  /**
   * Replaces head 1's row for the default query. A softmax row sums to 1 in every state the panel
   * can reach, so a Sum row hardcoded to "1" is indistinguishable from a live one through the
   * controls; `stageReadout` is pure, so the row it claims to report can be handed to it directly.
   */
  function withWeightRow(d: Derived, row: readonly number[]): Derived {
    const [head1, head2] = d.pass.heads;
    if (!head1 || !head2) throw new Error("the pass has no heads");
    const weights = head1.weights.map((existing, i) =>
      i === base.query ? Float64Array.from(row) : existing,
    );
    return { ...d, pass: { ...d.pass, heads: [{ ...head1, weights }, head2] } };
  }

  it("reports the row's total rather than asserting it", () => {
    const s = setHead(setStage(base, "softmax"), "head1");
    const short = withWeightRow(derived(s), [0.25, 0.15, 0.2, 0.1, 0.1]);
    const rows = new Map(stageReadout(s, short).rows);
    expect(rows.get("Head 1 weights")).toBe("0.25, 0.15, 0.2, 0.1, 0.1");
    expect(rows.get("Sum")).toBe("0.8");
  });

  it("reads 1 on a real softmax row, which is what the stage claims", () => {
    expect(rowsAt(setHead(setStage(base, "softmax"), "head1")).get("Sum")).toBe("1");
  });
});

describe("stageReadout: the equation over the numbers", () => {
  /** One fragment per stage that no other stage's equation contains. */
  const FRAGMENTS: readonly (readonly [StageKey, string])[] = [
    ["all", "\\mathrm{Attention}(Q,K,V)"],
    ["embed", "e_{t_p} + \\mathrm{pe}(p)"],
    ["scores", "(q_i \\cdot k_j)/\\sqrt{d}"],
    ["softmax", "a_i = \\mathrm{softmax}(s_i)"],
    ["weighted", "\\sum_j a_{ij} v_j"],
    ["residual", "x'_i = x_i + o_i"],
    ["mlp", "\\tanh(W_1 x'_i + b_1)"],
    ["logits", "x''_{\\mathrm{last}} \\cdot E / T"],
  ];

  it("gives every stage the equation §7 pairs it with", () => {
    for (const [stage, fragment] of FRAGMENTS) {
      expect(texAt(setStage(base, stage))).toContain(fragment);
    }
  });

  it("never repeats one stage's equation on another", () => {
    const all = FRAGMENTS.map(([stage]) => texAt(setStage(base, stage)));
    expect(new Set(all).size).toBe(FRAGMENTS.length);
  });
});

describe("stageReadout: what the numbers are not", () => {
  it("says the both-heads score blend is a display quantity, not a model one", () => {
    const note = noteAt(setStage(base, "scores"));
    expect(note).toContain("not a model quantity");
    expect(noteAt(setHead(setStage(base, "scores"), "head1"))).not.toContain(
      "not a model quantity",
    );
  });

  it("names the blend's coefficients and says it is not a distribution", () => {
    const note = noteAt(setStage(base, "softmax"));
    expect(note).toContain("0.6");
    expect(note).toContain("0.32");
    expect(note).toContain("0.92");
    expect(note).toContain("not a distribution");
  });

  it("explains the single-key row at query 0 rather than leaving it looking wrong", () => {
    const note = noteAt(setQuery(setStage(base, "softmax"), 0));
    expect(note).toContain("exactly 1");
    expect(note).toContain("full width");
    expect(noteAt(setStage(base, "softmax"))).not.toContain("full width");
  });

  it("says the logits come from the last position, whichever query is selected", () => {
    expect(noteAt(setQuery(setStage(base, "logits"), 1))).toContain("last position");
  });
});

describe("stageReadout: the temperature reaches the distribution", () => {
  it("flattens the probabilities as T rises, leaving the logits alone", () => {
    const stage = setStage(base, "logits");
    const cold = new Map(stageReadout(stage, derived(stage)).rows);
    const hot = setTemperature(stage, 3);
    const warm = new Map(stageReadout(hot, derived(hot)).rows);
    expect(cold.get("the")).toContain("logit 4.219");
    expect(warm.get("the")).toContain("logit 4.219");
    expect(warm.get("the")).toBe("logit 4.219 → p 0.3719");
  });
});
