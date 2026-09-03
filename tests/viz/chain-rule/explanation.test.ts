// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { chainText, createExplanation } from "../../../src/viz/chain-rule/explanation";
import { derived, initialState, setComp, setX } from "../../../src/viz/chain-rule/state";
import type { Derived } from "../../../src/viz/chain-rule/state";

/** The default derived values with Δy/Δu forced to null, as when Δu vanishes over the step. */
function zeroDu(d: Derived): Derived {
  if (!d.deltas) throw new Error("expected deltas");
  return { ...d, deltas: { ...d.deltas, dy: 0, dyDu: null, dyDx: 0 } };
}

describe("chainText", () => {
  it("spells out the product of the two slopes at the default state", () => {
    const s = initialState();
    const t = chainText(s, derived(s));

    expect(t.rule).toContain("At x = 0.4");
    expect(t.rule).toContain("g′(x) = 3");
    expect(t.rule).toContain("f′(u) = 0.3624");
    expect(t.rule).toContain("3 × 0.3624 = 1.087");
    expect(t.hint).toBe(
      "A linear inner function: the composite's slope is just the outer slope times 3.",
    );
  });

  it("spells out the finite ratios over the effective Δx", () => {
    const s = initialState();
    const t = chainText(s, derived(s));

    expect(t.finite).toContain("With Δx = 0.5");
    expect(t.finite).toContain("3 × ");
    expect(t.finite).toContain("Shrink Δx and each ratio becomes its derivative.");
  });

  it("explains the undefined middle ratio when Δu is 0", () => {
    const s = initialState();
    const t = chainText(s, zeroDu(derived(s)));

    expect(t.finite).toContain("With Δx = 0.5");
    expect(t.finite).toContain("Δu is 0 here, so the middle ratio is undefined");
    expect(t.finite).toContain("Δy/Δx = 0");
  });

  it("asks for a move left of the edge when there is no Δx", () => {
    const s = setX(initialState(), 3);
    const t = chainText(s, derived(s));

    expect(t.finite).toBe("Move x left of the edge to see the triangles.");
  });

  it("uses the selected preset's hint", () => {
    const s = setComp(initialState(), "sincube");
    expect(chainText(s, derived(s)).hint).toContain("g′ = cos x is zero");
  });
});

describe("createExplanation", () => {
  it("renders the chain rule, the preset equations and the three sentences", () => {
    const host = document.createElement("div");
    const explanation = createExplanation(host);
    const s = initialState();
    explanation.render(s, derived(s));

    expect(host.contains(explanation.el)).toBe(true);
    const equations = explanation.el.querySelectorAll(".equation");
    expect(equations.length).toBe(6);
    for (const eq of equations) expect(eq.querySelector(".katex")).not.toBeNull();

    const paras = [...explanation.el.querySelectorAll("p")].map((p) => p.textContent ?? "");
    expect(paras.some((p) => p.includes("g′(x) = 3 on the front wall"))).toBe(true);
    expect(paras.some((p) => p.startsWith("With Δx = 0.5"))).toBe(true);
    expect(paras.some((p) => p.startsWith("A linear inner function"))).toBe(true);
  });
});
