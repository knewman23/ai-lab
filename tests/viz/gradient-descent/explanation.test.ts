// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { createExplanation } from "../../../src/viz/gradient-descent/explanation";
import { derived, initialState } from "../../../src/viz/gradient-descent/state";

describe("createExplanation", () => {
  it("shows the numeric gradient and magnitude for the initial state", () => {
    const explanation = createExplanation();
    const s = initialState();
    explanation.render(s, derived(s));

    const code = explanation.el.querySelector("code.readout-inline");
    expect(code?.textContent).toBe("∇f = (5, 4), |∇f| = 6.403");
  });

  it("swaps the hint text when the surface changes", () => {
    const explanation = createExplanation();
    const s = { ...initialState(), surface: "saddle" as const };
    explanation.render(s, derived(s));

    const hint = explanation.el.querySelector("p.hint");
    expect(hint?.textContent).toBe(
      "The ball slides off along y until it leaves the domain: that's the optimizer escaping a saddle.",
    );
  });
});
