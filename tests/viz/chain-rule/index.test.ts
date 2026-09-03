// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { createThemeColors } from "../../../src/core/theme";
import { chainRuleGraph } from "../../../src/viz/chain-rule";
import type { Renderer, VizHost } from "../../../src/viz/types";

function host(): { host: VizHost; theme: ReturnType<typeof createThemeColors> } {
  const canvas = document.createElement("canvas");
  const renderer = {
    domElement: canvas,
    render: vi.fn(),
    backend: {},
    info: { memory: { geometries: 0 } },
  } as unknown as Renderer;
  const theme = createThemeColors(() => "#1f4ed8");
  const canvasContainer = document.createElement("div");
  canvasContainer.append(canvas);
  return {
    host: { canvasContainer, panel: document.createElement("div"), renderer, theme },
    theme,
  };
}

const HINT_KEY = "ai-lab.hint.chain-rule";

afterEach(() => {
  localStorage.clear();
});

describe("chainRuleGraph", () => {
  it("carries the registry metadata", () => {
    expect(chainRuleGraph.id).toBe("chain-rule-graph");
    expect(chainRuleGraph.topic).toBe("calculus");
    expect(chainRuleGraph.title).toBe("Chain rule graph");
    expect(chainRuleGraph.summary).toBe(
      "Drag x along a composed function and watch a small Δx become Δu on the front wall, then Δy on the side wall and the floor: the three slopes multiply.",
    );
    expect(chainRuleGraph.status).toBe("ready");
  });
});

describe("chainRuleGraph.mount", () => {
  it("renders the first frame, then idles until something changes", () => {
    const { host: h } = host();
    const viz = chainRuleGraph.mount(h);

    expect(viz.update(0.016)).toBe(true);
    expect(viz.update(0.016)).toBe(false);

    viz.dispose();
  });

  it("re-renders after the Tangents toggle flips", () => {
    const { host: h } = host();
    const viz = chainRuleGraph.mount(h);
    viz.update(0.016);

    const input = [...h.panel.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')].find(
      (el) => el.parentElement?.textContent?.includes("Tangents"),
    );
    if (!input) throw new Error("Tangents toggle not found");
    expect(input.checked).toBe(false);

    input.checked = true;
    expect(() => {
      input.dispatchEvent(new Event("change"));
    }).not.toThrow();
    expect(viz.update(0.016)).toBe(true);

    viz.dispose();
  });

  it("detaches its pointer listeners and empties the panel on dispose", () => {
    const { host: h } = host();
    const remove = vi.spyOn(h.renderer.domElement, "removeEventListener");
    const viz = chainRuleGraph.mount(h);
    expect(h.panel.childElementCount).toBeGreaterThan(0);

    viz.dispose();

    const removed = remove.mock.calls.map((call) => call[0]);
    for (const type of ["pointerdown", "pointermove", "pointerup", "pointercancel"]) {
      expect(removed).toContain(type);
    }
    expect(h.panel.childElementCount).toBe(0);
  });

  it("drops its theme listener on dispose", () => {
    const { host: h, theme } = host();
    const remove = vi.spyOn(theme, "removeEventListener");
    const viz = chainRuleGraph.mount(h);

    expect(() => {
      viz.dispose();
    }).not.toThrow();
    expect(remove).toHaveBeenCalledWith("change", expect.any(Function));
  });

  it("shows the usage hint over the canvas until it is dismissed", () => {
    const { host: h } = host();
    const viz = chainRuleGraph.mount(h);

    const button = h.canvasContainer.querySelector<HTMLButtonElement>(".canvas-hint button");
    expect(button).not.toBeNull();
    button?.click();
    expect(h.canvasContainer.querySelector(".canvas-hint")).toBeNull();

    viz.dispose();
  });

  it("takes the hint down on dispose", () => {
    const { host: h } = host();
    const viz = chainRuleGraph.mount(h);

    expect(h.canvasContainer.querySelector(".canvas-hint")).not.toBeNull();
    viz.dispose();
    expect(h.canvasContainer.querySelector(".canvas-hint")).toBeNull();
  });

  it("leaves the hint off once a previous visit dismissed it", () => {
    localStorage.setItem(HINT_KEY, "1");
    const { host: h } = host();
    const viz = chainRuleGraph.mount(h);

    expect(h.canvasContainer.querySelector(".canvas-hint")).toBeNull();

    viz.dispose();
  });
});
