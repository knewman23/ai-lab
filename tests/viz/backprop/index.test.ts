// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { createThemeColors } from "../../../src/core/theme";
import { backpropGraph } from "../../../src/viz/backprop";
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

const HINT_KEY = "ai-lab.hint.backprop";

function button(el: HTMLElement, label: string): HTMLButtonElement {
  const found = [...el.querySelectorAll("button")].find((b) => b.textContent === label);
  if (!found) throw new Error(`button not found: ${label}`);
  return found;
}

function passLine(el: HTMLElement): string {
  return el.querySelector(".pass-line")?.textContent ?? "";
}

function labelTexts(container: HTMLElement): string[] {
  return [...container.querySelectorAll(".viz-labels span")].map((s) => s.textContent ?? "");
}

afterEach(() => {
  localStorage.clear();
});

describe("backpropGraph", () => {
  it("carries the registry metadata", () => {
    expect(backpropGraph.id).toBe("backprop-graph");
    expect(backpropGraph.topic).toBe("machine-learning");
    expect(backpropGraph.title).toBe("Backprop graph");
    expect(backpropGraph.summary).toBe(
      "Step through the forward and backward passes of a small autograd graph: values fill in, then gradients flow back along every edge with the local derivative written on it.",
    );
    expect(backpropGraph.status).toBe("ready");
  });
});

describe("backpropGraph.mount", () => {
  it("renders the first frame, then idles until something changes", () => {
    const { host: h } = host();
    const viz = backpropGraph.mount(h);

    expect(viz.update(0.016)).toBe(true);
    expect(viz.update(0.016)).toBe(false);

    viz.dispose();
  });

  it("advances the pass when Step is clicked", () => {
    const { host: h } = host();
    const viz = backpropGraph.mount(h);
    viz.update(0.016);
    expect(passLine(h.panel).startsWith("Step 0 of 10")).toBe(true);

    button(h.panel, "Step").click();
    expect(passLine(h.panel).startsWith("Step 1 of 10")).toBe(true);
    expect(viz.update(0.016)).toBe(true);

    viz.dispose();
  });

  it("steps on its own every STEP_MS while playing and keeps rendering", () => {
    const { host: h } = host();
    const viz = backpropGraph.mount(h);
    viz.update(0.016);

    button(h.panel, "Play").click();
    expect(viz.update(0.8)).toBe(true);
    expect(passLine(h.panel).startsWith("Step 1 of 10")).toBe(true);

    // 0.1 s more does not reach the next 0.7 s boundary; still rendering while playing.
    expect(viz.update(0.1)).toBe(true);
    expect(passLine(h.panel).startsWith("Step 1 of 10")).toBe(true);

    viz.dispose();
  });

  it("puts node and op labels over the canvas", () => {
    const { host: h } = host();
    const viz = backpropGraph.mount(h);

    const texts = labelTexts(h.canvasContainer);
    expect(texts).toContain("x1");
    expect(texts).toContain("×");

    viz.dispose();
  });

  it("removes the label layer on dispose", () => {
    const { host: h } = host();
    const viz = backpropGraph.mount(h);
    expect(h.canvasContainer.querySelector("div.viz-labels")).not.toBeNull();

    viz.dispose();
    expect(h.canvasContainer.querySelector("div.viz-labels")).toBeNull();
  });

  it("detaches its pointer listeners and empties the panel on dispose", () => {
    const { host: h } = host();
    const remove = vi.spyOn(h.renderer.domElement, "removeEventListener");
    const viz = backpropGraph.mount(h);
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
    const viz = backpropGraph.mount(h);

    expect(() => {
      viz.dispose();
    }).not.toThrow();
    expect(remove).toHaveBeenCalledWith("change", expect.any(Function));
  });

  it("shows the usage hint over the canvas until it is dismissed", () => {
    const { host: h } = host();
    const viz = backpropGraph.mount(h);

    const hint = h.canvasContainer.querySelector(".canvas-hint");
    expect(hint).not.toBeNull();
    // The hint is created after the label layer so it paints on top.
    expect(hint?.previousElementSibling?.classList.contains("viz-labels")).toBe(true);

    hint?.querySelector("button")?.click();
    expect(h.canvasContainer.querySelector(".canvas-hint")).toBeNull();

    viz.dispose();
  });

  it("takes the hint down on dispose", () => {
    const { host: h } = host();
    const viz = backpropGraph.mount(h);

    expect(h.canvasContainer.querySelector(".canvas-hint")).not.toBeNull();
    viz.dispose();
    expect(h.canvasContainer.querySelector(".canvas-hint")).toBeNull();
  });

  it("leaves the hint off once a previous visit dismissed it", () => {
    localStorage.setItem(HINT_KEY, "1");
    const { host: h } = host();
    const viz = backpropGraph.mount(h);

    expect(h.canvasContainer.querySelector(".canvas-hint")).toBeNull();

    viz.dispose();
  });
});
