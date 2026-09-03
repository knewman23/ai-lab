// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { createThemeColors } from "../../../src/core/theme";
import { derivativeExplorer } from "../../../src/viz/derivative";
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

const HINT_KEY = "ai-lab.hint.derivative";

afterEach(() => {
  localStorage.clear();
});

describe("derivativeExplorer.mount", () => {
  it("renders the first frame, then idles until something changes", () => {
    const { host: h } = host();
    const viz = derivativeExplorer.mount(h);

    expect(viz.update(0.016)).toBe(true);
    expect(viz.update(0.016)).toBe(false);

    viz.dispose();
  });

  it("drops its theme listener on dispose", () => {
    const { host: h, theme } = host();
    const remove = vi.spyOn(theme, "removeEventListener");
    const viz = derivativeExplorer.mount(h);

    expect(() => {
      viz.dispose();
    }).not.toThrow();
    expect(remove).toHaveBeenCalledWith("change", expect.any(Function));
  });

  it("shows the usage hint over the canvas until it is dismissed", () => {
    const { host: h } = host();
    const viz = derivativeExplorer.mount(h);

    const button = h.canvasContainer.querySelector<HTMLButtonElement>(".canvas-hint button");
    expect(button).not.toBeNull();
    button?.click();
    expect(h.canvasContainer.querySelector(".canvas-hint")).toBeNull();

    viz.dispose();
  });

  it("takes the hint down on dispose", () => {
    const { host: h } = host();
    const viz = derivativeExplorer.mount(h);

    expect(h.canvasContainer.querySelector(".canvas-hint")).not.toBeNull();
    viz.dispose();
    expect(h.canvasContainer.querySelector(".canvas-hint")).toBeNull();
  });

  it("leaves the hint off once a previous visit dismissed it", () => {
    localStorage.setItem(HINT_KEY, "1");
    const { host: h } = host();
    const viz = derivativeExplorer.mount(h);

    expect(h.canvasContainer.querySelector(".canvas-hint")).toBeNull();

    viz.dispose();
  });
});
