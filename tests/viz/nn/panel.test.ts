// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { DATASETS, DATASET_KEYS } from "../../../src/core/math/datasets";
import { probeText, trainingLine } from "../../../src/viz/nn/explanation";
import { createNnPanel, type NnPanelHandlers } from "../../../src/viz/nn/panel";
import type { NnState } from "../../../src/viz/nn/state";
import {
  derived,
  initialState,
  LR_RANGE,
  setDataset,
  setLr,
  setPlaying,
  setProbe,
  setShow,
  trainEpoch,
} from "../../../src/viz/nn/state";

function handlers(): NnPanelHandlers {
  return {
    onDataset: vi.fn(),
    onStep: vi.fn(),
    onPlay: vi.fn(),
    onReset: vi.fn(),
    onLr: vi.fn(),
    onResetView: vi.fn(),
    onShow: vi.fn(),
  };
}

type Panel = ReturnType<typeof createNnPanel>;

function mount(h: NnPanelHandlers = handlers()): Panel {
  const host = document.createElement("div");
  return createNnPanel(host, h);
}

function renderState(panel: Panel, s: NnState): void {
  panel.render(s, derived(s));
}

function button(el: HTMLElement, label: string): HTMLButtonElement {
  const found = [...el.querySelectorAll("button")].find((b) => b.textContent === label);
  if (!found) throw new Error(`button not found: ${label}`);
  return found;
}

function range(el: HTMLElement): HTMLInputElement {
  const found = el.querySelector<HTMLInputElement>('input[type="range"]');
  if (!found) throw new Error("lr slider not found");
  return found;
}

function toggles(el: HTMLElement): HTMLInputElement[] {
  return [...el.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')];
}

function trainingText(el: HTMLElement): string {
  const p = el.querySelector("p.training-line");
  if (!p) throw new Error("training line not found");
  return p.textContent ?? "";
}

function readoutText(el: HTMLElement, key: string): string {
  const dt = [...el.querySelectorAll("dt")].find((n) => n.textContent === key);
  const dd = dt?.nextElementSibling;
  if (!dd) throw new Error(`readout key not found: ${key}`);
  return dd.textContent ?? "";
}

describe("createNnPanel", () => {
  it("lists the datasets in DATASET_KEYS order and dispatches onDataset", () => {
    const onDataset = vi.fn();
    const panel = mount({ ...handlers(), onDataset });
    const select = panel.el.querySelector<HTMLSelectElement>("select");
    if (!select) throw new Error("dataset select not found");

    const options = [...select.options];
    expect(options.map((o) => o.value)).toEqual([...DATASET_KEYS]);
    expect(options.map((o) => o.textContent)).toEqual(["XOR", "Two moons", "Circles"]);

    select.value = "circles";
    select.dispatchEvent(new Event("change"));
    expect(onDataset).toHaveBeenCalledWith("circles");
  });

  it("orders the sections as the spec lists them", () => {
    const panel = mount();
    expect([...panel.el.querySelectorAll("section.panel-section > h3")].map((h) => h.textContent)) //
      .toEqual(["Setup", "Training", "Run", "Show", "Readouts"]);
  });

  it("reflects state.dataset on the select without firing", () => {
    const h = handlers();
    const panel = mount(h);
    const select = panel.el.querySelector<HTMLSelectElement>("select");
    if (!select) throw new Error("dataset select not found");

    renderState(panel, initialState());
    expect(select.value).toBe("xor");
    renderState(panel, setDataset(initialState(), "moons"));
    expect(select.value).toBe("moons");
    for (const spy of Object.values(h)) expect(spy).not.toHaveBeenCalled();
  });

  it("dispatches the training buttons and follows state.playing", () => {
    const onStep = vi.fn();
    const onPlay = vi.fn();
    const onReset = vi.fn();
    const panel = mount({ ...handlers(), onStep, onPlay, onReset });
    renderState(panel, initialState());

    button(panel.el, "Step").click();
    button(panel.el, "Reset").click();
    button(panel.el, "Play").click();
    expect(onStep).toHaveBeenCalledTimes(1);
    expect(onReset).toHaveBeenCalledTimes(1);
    expect(onPlay).toHaveBeenLastCalledWith(true);

    renderState(panel, setPlaying(initialState(), true));
    button(panel.el, "Pause").click();
    expect(onPlay).toHaveBeenLastCalledWith(false);
    expect(() => button(panel.el, "Play")).toThrow();
  });

  it("dispatches onLr from the log slider and reflects state.lr without firing", () => {
    const onLr = vi.fn();
    const h = { ...handlers(), onLr };
    const panel = mount(h);
    const slider = range(panel.el);
    renderState(panel, initialState());
    const atDefault = slider.value;

    slider.value = slider.max;
    slider.dispatchEvent(new Event("input"));
    expect(onLr).toHaveBeenCalledTimes(1);
    expect(onLr.mock.calls[0]?.[0]).toBeCloseTo(LR_RANGE[1], 6);

    onLr.mockClear();
    renderState(panel, initialState());
    expect(slider.value).toBe(atDefault);
    renderState(panel, setLr(initialState(), LR_RANGE[0]));
    expect(slider.value).toBe(slider.min);
    for (const spy of Object.values(h)) expect(spy).not.toHaveBeenCalled();
  });

  it("dispatches onResetView", () => {
    const onResetView = vi.fn();
    const panel = mount({ ...handlers(), onResetView });
    button(panel.el, "Reset view").click();
    expect(onResetView).toHaveBeenCalledTimes(1);
  });

  it("dispatches onShow with the toggle's key", () => {
    const onShow = vi.fn();
    const panel = mount({ ...handlers(), onShow });
    const inputs = toggles(panel.el);
    expect(inputs.length).toBe(3);
    expect([...panel.el.querySelectorAll(".switch-label")].map((n) => n.textContent)).toEqual([
      "Weights",
      "Data",
      "Boundary",
    ]);

    // Every overlay starts on, so each first toggle turns it off.
    (["weights", "data", "boundary"] as const).forEach((key, i) => {
      const input = inputs[i];
      if (!input) throw new Error(`toggle ${key} not found`);
      input.checked = !input.checked;
      input.dispatchEvent(new Event("change"));
      expect(onShow).toHaveBeenLastCalledWith(key, false);
    });
  });

  it("syncs the toggles to state.show on render without firing", () => {
    const h = handlers();
    const panel = mount(h);
    renderState(panel, initialState());
    expect(toggles(panel.el).map((t) => t.checked)).toEqual([true, true, true]);

    renderState(panel, setShow(setShow(initialState(), "data", false), "boundary", false));
    expect(toggles(panel.el).map((t) => t.checked)).toEqual([true, false, false]);
    for (const spy of Object.values(h)) expect(spy).not.toHaveBeenCalled();
  });

  it("shows the training line", () => {
    const panel = mount();
    const s = trainEpoch(trainEpoch(initialState()));
    renderState(panel, s);
    expect(trainingText(panel.el)).toBe(trainingLine(s, derived(s)));
    expect(trainingText(panel.el)).toMatch(/^Epoch 2: loss .+, accuracy \d+%$/);
  });

  it("shows the probe readout and no epoch, loss or accuracy row", () => {
    const panel = mount();
    const s = setProbe(initialState(), [1.5, -0.5]);
    renderState(panel, s);
    expect(readoutText(panel.el, "Probe")).toBe(probeText(s, derived(s)));
    const keys = [...panel.el.querySelectorAll("dt")].map((n) => n.textContent);
    expect(keys).toEqual(["Probe"]);
  });

  it("keeps the explanation equations across renders and dataset changes", () => {
    const panel = mount();
    const s = initialState();
    renderState(panel, s);

    const equation = panel.el.querySelector(".explain .equation");
    if (!equation) throw new Error("explanation equation not found");
    const first = equation.querySelector(".katex");
    expect(first).not.toBeNull();

    renderState(panel, trainEpoch(s));
    expect(equation.querySelector(".katex")).toBe(first);

    const moons = setDataset(s, "moons");
    renderState(panel, moons);
    expect(equation.querySelector(".katex")).toBe(first);
    expect(panel.el.querySelector(".explain p.hint")?.textContent).toBe(DATASETS.moons.hint);
  });

  it("clears the host on dispose", () => {
    const host = document.createElement("div");
    const panel = createNnPanel(host, handlers());
    expect(host.childElementCount).toBe(1);
    panel.dispose();
    expect(host.childElementCount).toBe(0);
  });
});
