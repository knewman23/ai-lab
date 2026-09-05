// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { EMBEDDING_PRESETS } from "../../../src/core/math/transformer";
import { createGptExplanation, PRESET_HINTS } from "../../../src/viz/gpt/explanation";

/** The whole panel's prose, for the ordering assertions §7 asks for. */
function prose(): { el: HTMLElement; text: string; paragraphs: string[] } {
  const host = document.createElement("div");
  createGptExplanation(host);
  const paragraphs = [...host.querySelectorAll("p")].map((p) => p.textContent ?? "");
  return { el: host, text: paragraphs.join("\n"), paragraphs };
}

/** Where a phrase first appears in the prose; -1 would fail the ordering comparison loudly. */
function at(text: string, phrase: string): number {
  const i = text.indexOf(phrase);
  if (i < 0) throw new Error(`explanation does not say: ${phrase}`);
  return i;
}

describe("createGptExplanation", () => {
  it("renders the block's three rules as equations, once", () => {
    const { el } = prose();
    const equations = [...el.querySelectorAll(".equation")];
    expect(equations).toHaveLength(3);
    expect(equations.every((eq) => eq.querySelector(".katex") !== null)).toBe(true);
  });

  it("covers the five §7 topics in the order the spec lists them", () => {
    const { text } = prose();
    const order = [
      at(text, "residual stream"), // what a block does
      at(text, "two components"), // why d_model = 2, and what it costs
      at(text, "Head 1 leans positional"), // what the two heads lean toward
      at(text, "no layer norm"), // why layer norm is absent
      at(text, "Nothing here is trained"), // no training, and where to find it
    ];
    expect(order).toEqual([...order].sort((a, b) => a - b));
  });
});

describe("the three conclusions the prose exists to prevent", () => {
  it("says head 1 is previous-position biased, and names collapsed as the preset that shows it", () => {
    const { text } = prose();
    expect(text).toContain("biased");
    expect(at(text, "collapsed")).toBeGreaterThan(at(text, "biased"));
    expect(text).toContain("not a previous-token head");
  });

  it("says the block predicts the token it just read, and what would break that", () => {
    const { text } = prose();
    expect(text).toContain("the token it just read");
    expect(text).toContain("0.79");
    expect(text).toContain("tied unembedding");
  });

  it("says a tied unembedding rewards distance from the origin, not only direction", () => {
    const { text } = prose();
    expect(text).toContain("further from the origin");
    expect(text).toContain("spread");
  });

  it("keeps the direction half of the magnitude claim, which is false without it", () => {
    // The logit is x''·e, so dragging a word further out *away* from the final vector shrinks
    // its bar. An unqualified "further out grows the bar" is wrong over half the plane.
    const { text } = prose();
    expect(text).toContain("further from the origin on the same side as the final vector");
    expect(text).toContain("the bar shrinks");
    expect(PRESET_HINTS.spread).toContain("only on the side the final vector points to");
  });
});

describe("the two simplifications the prose has to own", () => {
  it("says why layer norm is absent and what it does in a real block", () => {
    const { text } = prose();
    expect(text).toContain("no layer norm");
    expect(text).toContain("±(1, −1)");
    expect(text).toContain("fixed length");
  });

  it("says nothing is trained here and points at the neural network scene", () => {
    const { text } = prose();
    expect(text).toContain("Nothing here is trained");
    expect(text).toContain("neural network scene");
  });
});

describe("PRESET_HINTS", () => {
  it("blames head 1's own cross-terms for head 1's row, never the other head", () => {
    // Head 1's row comes from its own W_Q and W_K alone; head 2 cannot reach it. A viewer with
    // head 1 selected reads this hint beside a row head 2 did not produce.
    expect(PRESET_HINTS.tuned).toContain("inside head 1");
    expect(PRESET_HINTS.tuned).toContain("its own positional term");
    expect(PRESET_HINTS.tuned).not.toContain("head 2");
  });

  it("carries one line for each of the three presets", () => {
    expect(Object.keys(PRESET_HINTS).sort()).toEqual(Object.keys(EMBEDDING_PRESETS).sort());
    for (const hint of Object.values(PRESET_HINTS)) expect(hint.length).toBeGreaterThan(20);
  });

  it("states the §1.3 link on the collapsed preset, in the interface rather than only in a test", () => {
    expect(PRESET_HINTS.collapsed).toBe(
      "No information in the embeddings — switch here to see head 1's positional bias on its own.",
    );
  });
});
