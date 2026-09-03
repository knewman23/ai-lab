// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { createThemeColors } from "../../../src/core/theme";
import { gradientDescent } from "../../../src/viz/gradient-descent";
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

describe("gradientDescent.mount", () => {
  it("renders the first frame, then idles until something changes", () => {
    const { host: h } = host();
    const viz = gradientDescent.mount(h);

    expect(viz.update(0.016)).toBe(true);
    expect(viz.update(0.016)).toBe(false);

    viz.dispose();
  });

  it("drops its theme listener on dispose", () => {
    const { host: h, theme } = host();
    const remove = vi.spyOn(theme, "removeEventListener");
    const viz = gradientDescent.mount(h);

    expect(() => {
      viz.dispose();
    }).not.toThrow();
    expect(remove).toHaveBeenCalledWith("change", expect.any(Function));
  });
});
