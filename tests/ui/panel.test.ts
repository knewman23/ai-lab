// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { createPanel } from "../../src/ui/panel";

describe("createPanel", () => {
  it("appends a titled section and returns it for content", () => {
    const panel = createPanel();
    const section = panel.section("Setup");

    expect(section.tagName).toBe("SECTION");
    expect(section.querySelector("h3")?.textContent).toBe("Setup");
    expect(section.parentElement).toBe(panel.el);
  });

  it("leaves a section with no role unmarked", () => {
    const panel = createPanel();
    const section = panel.section("Setup");

    expect(section.dataset.role).toBeUndefined();
    expect(panel.el.querySelectorAll("[data-role]")).toHaveLength(0);
  });

  it("marks the explanation section so a wrapper can collapse it", () => {
    const panel = createPanel();
    panel.section("Setup");
    const explanation = panel.section("What you are seeing", { role: "explanation" });

    expect(explanation.dataset.role).toBe("explanation");
    expect(panel.el.querySelectorAll('[data-role="explanation"]')).toHaveLength(1);
  });
});
