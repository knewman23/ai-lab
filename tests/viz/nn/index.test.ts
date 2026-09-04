// @vitest-environment jsdom
import { PerspectiveCamera, Vector3 } from "three";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createThemeColors } from "../../../src/core/theme";
import { neuralNetwork } from "../../../src/viz/nn";
import { frameNn } from "../../../src/viz/nn/frame-nn";
import { floorPoint } from "../../../src/viz/nn/layout";
import type { Renderer, VizHost } from "../../../src/viz/types";

/**
 * Counts the repaints of the decision boundary, the scene's one expensive redraw: the
 * assembler must ask for it when the weights change and at no other time.
 */
const counts = vi.hoisted(() => ({ floorSet: 0 }));

vi.mock("../../../src/viz/nn/floor", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../src/viz/nn/floor")>();
  return {
    ...actual,
    createFloor: (theme: Parameters<typeof actual.createFloor>[0]) => {
      const floor = actual.createFloor(theme);
      return {
        ...floor,
        set(grid: Float32Array): void {
          counts.floorSet += 1;
          floor.set(grid);
        },
      };
    },
  };
});

/** The canvas is square so screen pixels and NDC agree with the scene camera's aspect of 1. */
const SIZE = 400;

function host(): { host: VizHost; theme: ReturnType<typeof createThemeColors> } {
  const canvas = document.createElement("canvas");
  const renderer = {
    domElement: canvas,
    // Stands in for the matrix update a real renderer does each frame, which the drag
    // raycast and the label projection both read.
    render: vi.fn(
      (
        scene: { updateMatrixWorld(force: boolean): void },
        camera: { updateMatrixWorld(force: boolean): void },
      ) => {
        scene.updateMatrixWorld(true);
        camera.updateMatrixWorld(true);
      },
    ),
    backend: {},
    info: { memory: { geometries: 0 } },
  } as unknown as Renderer;
  const theme = createThemeColors(() => "#1f4ed8");
  vi.spyOn(canvas, "getBoundingClientRect").mockReturnValue({
    left: 0,
    top: 0,
    width: SIZE,
    height: SIZE,
  } as DOMRect);
  canvas.setPointerCapture = vi.fn();
  canvas.releasePointerCapture = vi.fn();
  canvas.hasPointerCapture = vi.fn(() => false);
  const canvasContainer = document.createElement("div");
  canvasContainer.append(canvas);
  return {
    host: { canvasContainer, panel: document.createElement("div"), renderer, theme },
    theme,
  };
}

const HINT_KEY = "ai-lab.hint.nn";

function button(el: HTMLElement, label: string): HTMLButtonElement {
  const found = [...el.querySelectorAll("button")].find((b) => b.textContent === label);
  if (!found) throw new Error(`button not found: ${label}`);
  return found;
}

function trainingLine(el: HTMLElement): string {
  return el.querySelector(".training-line")?.textContent ?? "";
}

function probeReadout(el: HTMLElement): string {
  return [...el.querySelectorAll("dd")].map((d) => d.textContent ?? "").join(" ");
}

/** The probe readout's input pair, which `probeText` writes as "(x, y) -> ...". */
function probeInput(el: HTMLElement): readonly [number, number] {
  const m = /\(([-\d.]+), ([-\d.]+)\)/.exec(probeReadout(el));
  if (!m) throw new Error(`no probe readout in: ${probeReadout(el)}`);
  return [Number(m[1]), Number(m[2])];
}

/**
 * The CSS pixel the world point `world` projects to, from a stand-in for the scene's camera:
 * `createSceneKit` builds a 45-degree camera at aspect 1, and `goHome` parks it at `frameNn`
 * looking at the framing's target. Lets a test aim a pointer at a known spot on the floor.
 */
function pixelOf(world: readonly [number, number, number]): readonly [number, number] {
  const home = frameNn();
  const camera = new PerspectiveCamera(45, 1, 0.1, 100);
  // The scene is Z-up, as `createSceneKit` builds it.
  camera.up.set(0, 0, 1);
  camera.position.set(...home.position);
  camera.lookAt(new Vector3(...home.target));
  camera.updateMatrixWorld();
  const p = new Vector3(...world).project(camera);
  return [((p.x + 1) / 2) * SIZE, ((1 - p.y) / 2) * SIZE];
}

function pointer(type: string, x: number, y: number): PointerEvent {
  // MouseEvent rather than PointerEvent: jsdom's PointerEvent support varies, and the
  // handlers only read pointerId, clientX and clientY.
  const event = new MouseEvent(type, { clientX: x, clientY: y });
  Object.defineProperty(event, "pointerId", { value: 1 });
  return event as PointerEvent;
}

/** A press and release at the same spot: the click-to-place arm of the probe drag. */
function clickCanvas(canvas: HTMLElement, at: readonly [number, number]): void {
  canvas.dispatchEvent(pointer("pointerdown", at[0], at[1]));
  canvas.dispatchEvent(pointer("pointerup", at[0], at[1]));
}

function labelTexts(container: HTMLElement): string[] {
  return [...container.querySelectorAll(".viz-labels span")].map((s) => s.textContent ?? "");
}

function range(el: HTMLElement): HTMLInputElement {
  const found = el.querySelector<HTMLInputElement>('input[type="range"]');
  if (!found) throw new Error("learning-rate slider not found");
  return found;
}

function toggle(el: HTMLElement, label: string): HTMLInputElement {
  const found = [...el.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')].find((i) =>
    i.parentElement?.textContent?.includes(label),
  );
  if (!found) throw new Error(`toggle not found: ${label}`);
  return found;
}

beforeEach(() => {
  counts.floorSet = 0;
});

afterEach(() => {
  localStorage.clear();
});

describe("neuralNetwork", () => {
  it("carries the registry metadata", () => {
    expect(neuralNetwork.id).toBe("neural-network");
    expect(neuralNetwork.topic).toBe("machine-learning");
    expect(neuralNetwork.title).toBe("Neural network");
    expect(neuralNetwork.summary).toBe(
      "Watch a tiny network learn: layers on a wall with weights as struts, the data and the decision boundary on the floor, one gradient step at a time.",
    );
    expect(neuralNetwork.status).toBe("ready");
  });
});

describe("neuralNetwork.mount", () => {
  it("renders the first frame, then idles until something changes", () => {
    const { host: h } = host();
    const viz = neuralNetwork.mount(h);

    expect(viz.update(0.016)).toBe(true);
    expect(viz.update(0.016)).toBe(false);

    viz.dispose();
  });

  it("trains an epoch when Step is clicked", () => {
    const { host: h } = host();
    const viz = neuralNetwork.mount(h);
    viz.update(0.016);
    expect(trainingLine(h.panel).startsWith("Epoch 0")).toBe(true);

    button(h.panel, "Step").click();
    expect(trainingLine(h.panel).startsWith("Epoch 1")).toBe(true);
    expect(viz.update(0.016)).toBe(true);

    viz.dispose();
  });

  it("trains an epoch every EPOCH_MS while playing and keeps rendering", () => {
    const { host: h } = host();
    const viz = neuralNetwork.mount(h);
    viz.update(0.016);

    button(h.panel, "Play").click();
    expect(viz.update(0.15)).toBe(true);
    expect(trainingLine(h.panel).startsWith("Epoch 1")).toBe(true);

    // 50 ms are left over from the 150; 40 ms more does not reach the next 100 ms
    // boundary, and the frame still renders because the scene is playing.
    expect(viz.update(0.04)).toBe(true);
    expect(trainingLine(h.panel).startsWith("Epoch 1")).toBe(true);

    viz.dispose();
  });

  it("puts layer and input labels over the canvas", () => {
    const { host: h } = host();
    const viz = neuralNetwork.mount(h);

    const texts = labelTexts(h.canvasContainer);
    expect(texts).toContain("input");
    expect(texts).toContain("output");
    expect(texts).toContain("x₁");

    viz.dispose();
  });

  it("removes the label layer on dispose", () => {
    const { host: h } = host();
    const viz = neuralNetwork.mount(h);
    expect(h.canvasContainer.querySelector("div.viz-labels")).not.toBeNull();

    viz.dispose();
    expect(h.canvasContainer.querySelector("div.viz-labels")).toBeNull();
  });

  it("detaches its pointer listeners and empties the panel on dispose", () => {
    const { host: h } = host();
    const remove = vi.spyOn(h.renderer.domElement, "removeEventListener");
    const viz = neuralNetwork.mount(h);
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
    const viz = neuralNetwork.mount(h);

    expect(() => {
      viz.dispose();
    }).not.toThrow();
    expect(remove).toHaveBeenCalledWith("change", expect.any(Function));
  });

  it("shows the usage hint over the canvas until it is dismissed", () => {
    const { host: h } = host();
    const viz = neuralNetwork.mount(h);

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
    const viz = neuralNetwork.mount(h);

    expect(h.canvasContainer.querySelector(".canvas-hint")).not.toBeNull();
    viz.dispose();
    expect(h.canvasContainer.querySelector(".canvas-hint")).toBeNull();
  });

  it("repaints the boundary only when the weights change", () => {
    const { host: h } = host();
    const viz = neuralNetwork.mount(h);
    viz.update(0.016);
    // Once for the initial parameters.
    expect(counts.floorSet).toBe(1);

    button(h.panel, "Step").click();
    expect(counts.floorSet).toBe(2);

    const slider = range(h.panel);
    slider.value = String(Number(slider.value) - 1);
    slider.dispatchEvent(new Event("input"));

    const weightsToggle = toggle(h.panel, "Weights");
    weightsToggle.checked = false;
    weightsToggle.dispatchEvent(new Event("change"));

    clickCanvas(h.renderer.domElement, pixelOf(floorPoint([1.5, 1.5])));

    // The learning rate, an overlay toggle and a probe move leave the weights alone.
    expect(counts.floorSet).toBe(2);

    viz.dispose();
  });

  it("moves the probe and hides the hint when the floor is clicked", () => {
    const { host: h } = host();
    const viz = neuralNetwork.mount(h);
    // One frame so the scene graph's world matrices are current for the raycast.
    viz.update(0.016);
    expect(probeInput(h.panel)).toEqual([0, 0]);
    const before = labelTexts(h.canvasContainer);

    clickCanvas(h.renderer.domElement, pixelOf(floorPoint([1.5, 1.5])));

    const [x, y] = probeInput(h.panel);
    expect(x).toBeCloseTo(1.5, 1);
    expect(y).toBeCloseTo(1.5, 1);
    expect(labelTexts(h.canvasContainer)).not.toEqual(before);
    expect(h.canvasContainer.querySelector(".canvas-hint")).toBeNull();

    viz.dispose();
  });

  it("restarts training at epoch 0 when the dataset changes", () => {
    const { host: h } = host();
    const viz = neuralNetwork.mount(h);

    button(h.panel, "Step").click();
    expect(trainingLine(h.panel).startsWith("Epoch 1")).toBe(true);

    const select = h.panel.querySelector<HTMLSelectElement>("select");
    if (!select) throw new Error("dataset select not found");
    select.value = "circles";
    select.dispatchEvent(new Event("change"));

    expect(trainingLine(h.panel).startsWith("Epoch 0")).toBe(true);

    viz.dispose();
  });

  it("leaves the hint off once a previous visit dismissed it", () => {
    localStorage.setItem(HINT_KEY, "1");
    const { host: h } = host();
    const viz = neuralNetwork.mount(h);

    expect(h.canvasContainer.querySelector(".canvas-hint")).toBeNull();

    viz.dispose();
  });
});
