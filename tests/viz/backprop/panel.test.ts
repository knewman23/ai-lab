// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { GRAPH_KEYS, GRAPHS } from "../../../src/core/math/graphs";
import { createBpPanel, type BpPanelHandlers } from "../../../src/viz/backprop/panel";
import {
  derived,
  initialState,
  setGraph,
  setLeaf,
  setPlaying,
  setShow,
  stepForward,
} from "../../../src/viz/backprop/state";
import type { BpState } from "../../../src/viz/backprop/state";

function handlers(): BpPanelHandlers {
  return {
    onGraph: vi.fn(),
    onStep: vi.fn(),
    onPlay: vi.fn(),
    onResetPass: vi.fn(),
    onLeaf: vi.fn(),
    onReset: vi.fn(),
    onResetView: vi.fn(),
    onShow: vi.fn(),
  };
}

type Panel = ReturnType<typeof createBpPanel>;

function mount(h: BpPanelHandlers = handlers()): Panel {
  const host = document.createElement("div");
  return createBpPanel(host, h);
}

function renderState(panel: Panel, s: BpState): void {
  panel.render(s, derived(s));
}

function at(step: number, s: BpState = initialState()): BpState {
  let out = s;
  for (let i = 0; i < step; i++) out = stepForward(out);
  return out;
}

function readoutText(el: HTMLElement, key: string): string {
  const dt = [...el.querySelectorAll("dt")].find((n) => n.textContent === key);
  const dd = dt?.nextElementSibling;
  if (!dd) throw new Error(`readout key not found: ${key}`);
  return dd.textContent ?? "";
}

function button(el: HTMLElement, label: string): HTMLButtonElement {
  const found = [...el.querySelectorAll("button")].find((b) => b.textContent === label);
  if (!found) throw new Error(`button not found: ${label}`);
  return found;
}

function ranges(el: HTMLElement): HTMLInputElement[] {
  return [...el.querySelectorAll<HTMLInputElement>('input[type="range"]')];
}

function toggles(el: HTMLElement): HTMLInputElement[] {
  return [...el.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')];
}

function passLine(el: HTMLElement): string {
  const p = el.querySelector("p.pass-line");
  if (!p) throw new Error("pass line not found");
  return p.textContent ?? "";
}

describe("createBpPanel", () => {
  it("lists the graphs in GRAPH_KEYS order and dispatches onGraph", () => {
    const onGraph = vi.fn();
    const panel = mount({ ...handlers(), onGraph });
    const select = panel.el.querySelector<HTMLSelectElement>("select");
    if (!select) throw new Error("graph select not found");

    const options = [...select.options];
    expect(options.map((o) => o.value)).toEqual([...GRAPH_KEYS]);
    expect(options.map((o) => o.textContent)).toEqual(GRAPH_KEYS.map((k) => GRAPHS[k].title));

    select.value = "shared-node";
    select.dispatchEvent(new Event("change"));
    expect(onGraph).toHaveBeenCalledWith("shared-node");
  });

  it("dispatches the pass buttons", () => {
    const onStep = vi.fn();
    const onPlay = vi.fn();
    const onResetPass = vi.fn();
    const panel = mount({ ...handlers(), onStep, onPlay, onResetPass });
    renderState(panel, initialState());

    button(panel.el, "Step").click();
    button(panel.el, "Reset pass").click();
    button(panel.el, "Play").click();
    expect(onStep).toHaveBeenCalledTimes(1);
    expect(onResetPass).toHaveBeenCalledTimes(1);
    expect(onPlay).toHaveBeenLastCalledWith(true);

    renderState(panel, setPlaying(initialState(), true));
    button(panel.el, "Pause").click();
    expect(onPlay).toHaveBeenLastCalledWith(false);
    expect(() => button(panel.el, "Play")).toThrow();
  });

  it("builds one slider per leaf and dispatches onLeaf", () => {
    const onLeaf = vi.fn();
    const panel = mount({ ...handlers(), onLeaf });
    renderState(panel, initialState());
    const sliders = ranges(panel.el);
    expect(sliders.length).toBe(5);
    const [x1] = sliders;
    if (!x1) throw new Error("x1 slider not found");
    expect(x1.min).toBe("-4");
    expect(x1.max).toBe("4");
    expect(x1.step).toBe("0.01");
    expect(x1.value).toBe("2");

    x1.value = "1.5";
    x1.dispatchEvent(new Event("input"));
    expect(onLeaf).toHaveBeenCalledWith("x1", 1.5);
  });

  it("rebuilds the sliders when the graph changes", () => {
    const panel = mount();
    renderState(panel, initialState());
    expect(ranges(panel.el).length).toBe(5);

    renderState(panel, setGraph(initialState(), "product-sum"));
    const sliders = ranges(panel.el);
    expect(sliders.length).toBe(3);
    expect(sliders[2]?.min).toBe("-10");
    expect(sliders[2]?.value).toBe("10");
  });

  it("reflects state.leaves on render without firing handlers", () => {
    const h = handlers();
    const panel = mount(h);
    renderState(panel, setLeaf(initialState(), "w1", 1.25));
    expect(ranges(panel.el)[1]?.value).toBe("1.25");
    for (const spy of Object.values(h)) expect(spy).not.toHaveBeenCalled();
  });

  it("dispatches onReset and onResetView", () => {
    const onReset = vi.fn();
    const onResetView = vi.fn();
    const panel = mount({ ...handlers(), onReset, onResetView });

    button(panel.el, "Reset").click();
    button(panel.el, "Reset view").click();
    expect(onReset).toHaveBeenCalledTimes(1);
    expect(onResetView).toHaveBeenCalledTimes(1);
  });

  it("dispatches onShow with the toggle's key", () => {
    const onShow = vi.fn();
    const panel = mount({ ...handlers(), onShow });
    const inputs = toggles(panel.el);
    expect(inputs.length).toBe(3);
    expect([...panel.el.querySelectorAll(".switch-label")].map((n) => n.textContent)).toEqual([
      "Value bars",
      "Grad bars",
      "Edge derivatives",
    ]);

    // Every overlay starts on, so each first toggle turns it off.
    (["values", "grads", "edgeDerivs"] as const).forEach((key, i) => {
      const input = inputs[i];
      if (!input) throw new Error(`toggle ${key} not found`);
      input.checked = !input.checked;
      input.dispatchEvent(new Event("change"));
      expect(onShow).toHaveBeenLastCalledWith(key, false);
    });
  });

  it("syncs the toggles to state.show on render without firing", () => {
    const onShow = vi.fn();
    const panel = mount({ ...handlers(), onShow });
    renderState(panel, initialState());
    expect(toggles(panel.el).map((t) => t.checked)).toEqual([true, true, true]);

    renderState(panel, setShow(setShow(initialState(), "grads", false), "edgeDerivs", false));
    expect(toggles(panel.el).map((t) => t.checked)).toEqual([true, false, false]);
    expect(onShow).not.toHaveBeenCalled();
  });

  it("fills the readouts with the output and each leaf's value and grad", () => {
    const panel = mount();
    renderState(panel, initialState());
    expect(readoutText(panel.el, "o")).toBe("0.7071  ∂ —");
    expect(readoutText(panel.el, "x1")).toBe("2  ∂ —");
    expect(readoutText(panel.el, "b")).toBe("6.881  ∂ —");

    renderState(panel, at(10));
    expect(readoutText(panel.el, "o")).toBe("0.7071  ∂ 1");
    expect(readoutText(panel.el, "x1")).toBe("2  ∂ -1.5");
    expect(readoutText(panel.el, "w2")).toBe("1  ∂ 0");
    expect(readoutText(panel.el, "b")).toBe("6.881  ∂ 0.5");
  });

  it("rebuilds the readouts for the new graph", () => {
    const panel = mount();
    renderState(panel, initialState());
    renderState(panel, setGraph(initialState(), "product-sum"));
    expect(readoutText(panel.el, "d")).toBe("4  ∂ —");
    expect(readoutText(panel.el, "c")).toBe("10  ∂ —");
    expect(() => readoutText(panel.el, "o")).toThrow();
  });

  it("shows the pass line", () => {
    const panel = mount();
    renderState(panel, initialState());
    expect(passLine(panel.el)).toBe(
      "Step 0 of 10: Leaves are given; press Step to run the forward pass.",
    );
    renderState(panel, at(6));
    expect(passLine(panel.el)).toBe("Step 6 of 10: backward at o: o.grad = 1 → n.grad += 0.5 × 1");
  });

  it("keeps the graph equation node until the graph changes", () => {
    const panel = mount();
    const s = initialState();
    renderState(panel, s);

    const equation = panel.el.querySelector(".explain .graph-equation");
    if (!equation) throw new Error("graph equation not found");
    const first = equation.querySelector(".katex");
    expect(first).not.toBeNull();

    renderState(panel, at(3, s));
    expect(equation.querySelector(".katex")).toBe(first);

    renderState(panel, setGraph(s, "shared-node"));
    expect(equation.querySelector(".katex")).not.toBe(first);
  });

  it("writes the step sentence and the hint under the equations", () => {
    const panel = mount();
    renderState(panel, at(1));
    const paras = [...panel.el.querySelectorAll(".explain p")].map((p) => p.textContent);
    expect(paras).toEqual(["forward: x1·w1 = 2 × −3 = −6", GRAPHS.neuron.hint]);
  });

  it("clears the host on dispose", () => {
    const host = document.createElement("div");
    const panel = createBpPanel(host, handlers());
    expect(host.childElementCount).toBe(1);
    panel.dispose();
    expect(host.childElementCount).toBe(0);
  });
});
