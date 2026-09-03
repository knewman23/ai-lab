// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { COMP_KEYS, COMPOSITIONS } from "../../../src/core/math/compositions";
import { createChainPanel, type ChainPanelHandlers } from "../../../src/viz/chain-rule/panel";
import {
  derived,
  initialState,
  setComp,
  setDx,
  setShow,
  setX,
} from "../../../src/viz/chain-rule/state";
import type { ChainState } from "../../../src/viz/chain-rule/state";

function handlers(): ChainPanelHandlers {
  return {
    onComp: vi.fn(),
    onDx: vi.fn(),
    onReset: vi.fn(),
    onResetView: vi.fn(),
    onShow: vi.fn(),
  };
}

function mount(h: ChainPanelHandlers = handlers()): ReturnType<typeof createChainPanel> {
  const host = document.createElement("div");
  return createChainPanel(host, h);
}

function renderState(panel: ReturnType<typeof createChainPanel>, s: ChainState): void {
  panel.render(s, derived(s));
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

function dxNote(el: HTMLElement): HTMLElement {
  const note = el.querySelector<HTMLElement>("p.dx-note");
  if (!note) throw new Error("dx-note not found");
  return note;
}

function toggles(el: HTMLElement): HTMLInputElement[] {
  return [...el.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')];
}

describe("createChainPanel", () => {
  it("lists the presets in COMP_KEYS order and dispatches onComp", () => {
    const onComp = vi.fn();
    const panel = mount({ ...handlers(), onComp });
    const select = panel.el.querySelector<HTMLSelectElement>("select");
    if (!select) throw new Error("composition select not found");

    const options = [...select.options];
    expect(options.map((o) => o.value)).toEqual([...COMP_KEYS]);
    expect(options.map((o) => o.textContent)).toEqual(COMP_KEYS.map((k) => COMPOSITIONS[k].title));

    select.value = "gauss";
    select.dispatchEvent(new Event("change"));
    expect(onComp).toHaveBeenCalledWith("gauss");
  });

  it("dispatches onDx from the Δx slider and labels its readout", () => {
    const onDx = vi.fn();
    const panel = mount({ ...handlers(), onDx });
    const range = panel.el.querySelector<HTMLInputElement>('input[type="range"]');
    if (!range) throw new Error("Δx slider not found");
    const out = panel.el.querySelector("output");
    expect(out?.textContent).toBe("Δx = 0.5");

    range.value = "1000";
    range.dispatchEvent(new Event("input"));
    expect(onDx).toHaveBeenCalledTimes(1);
    expect(onDx.mock.calls[0]?.[0]).toBeCloseTo(2, 9);
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
    expect(inputs.length).toBe(4);
    // Toggles start at initialState().show: triangles/secants/connectors on, tangents off.
    const expected: [string, boolean][] = [
      ["triangles", false],
      ["secants", false],
      ["tangents", true],
      ["connectors", false],
    ];

    expected.forEach(([key, on], i) => {
      const input = inputs[i];
      if (!input) throw new Error(`toggle ${key} not found`);
      input.checked = !input.checked;
      input.dispatchEvent(new Event("change"));
      expect(onShow).toHaveBeenLastCalledWith(key, on);
    });
  });

  it("syncs the toggles to state.show on render", () => {
    const panel = mount();
    renderState(panel, initialState());
    expect(toggles(panel.el).map((t) => t.checked)).toEqual([true, true, false, true]);

    renderState(panel, setShow(setShow(initialState(), "tangents", true), "secants", false));
    expect(toggles(panel.el).map((t) => t.checked)).toEqual([true, false, true, true]);
  });

  it("fills the readouts at the default state", () => {
    const panel = mount();
    renderState(panel, initialState());

    expect(readoutText(panel.el, "x")).toBe("0.4");
    expect(readoutText(panel.el, "u = g(x)")).toBe("1.2");
    expect(readoutText(panel.el, "y = f(u)")).toBe("0.932");
    expect(readoutText(panel.el, "g′(x)")).toBe("3");
    expect(readoutText(panel.el, "f′(u)")).toBe("0.3624");
    expect(readoutText(panel.el, "dy/dx")).toBe("1.087");
    expect(readoutText(panel.el, "Δu/Δx")).toBe("3");
    expect(readoutText(panel.el, "Δy/Δu")).toBe("-0.3364");
    expect(readoutText(panel.el, "Δy/Δx")).toBe("-1.009");
  });

  it("shows dashes for the ratios at the right edge", () => {
    const panel = mount();
    renderState(panel, setX(initialState(), 3));

    expect(readoutText(panel.el, "Δu/Δx")).toBe("—");
    expect(readoutText(panel.el, "Δy/Δu")).toBe("—");
    expect(readoutText(panel.el, "Δy/Δx")).toBe("—");
  });

  it("marks the middle ratio when Δu is 0", () => {
    const panel = mount();
    const s = initialState();
    const d = derived(s);
    if (!d.deltas) throw new Error("expected deltas");
    panel.render(s, { ...d, deltas: { ...d.deltas, dyDu: null } });

    expect(readoutText(panel.el, "Δy/Δu")).toBe("— (Δu = 0)");
  });

  it("hides the Δx note normally and shows the clipped and edge notes", () => {
    const panel = mount();
    renderState(panel, initialState());
    expect(dxNote(panel.el).hidden).toBe(true);

    renderState(panel, setDx(setX(initialState(), 2.5), 1));
    expect(dxNote(panel.el).hidden).toBe(false);
    expect(dxNote(panel.el).textContent).toBe("clipped to 0.5 so x + Δx stays in the domain");

    renderState(panel, setX(initialState(), 3));
    expect(dxNote(panel.el).hidden).toBe(false);
    expect(dxNote(panel.el).textContent).toBe("x is at the right edge; no Δ");
  });

  it("syncs the select and slider to state without firing handlers", () => {
    const h = handlers();
    const panel = mount(h);
    renderState(panel, setDx(setComp(initialState(), "sqrtq"), 1));

    const select = panel.el.querySelector<HTMLSelectElement>("select");
    expect(select?.value).toBe("sqrtq");
    expect(panel.el.querySelector("output")?.textContent).toBe("Δx = 1");
    for (const spy of Object.values(h)) expect(spy).not.toHaveBeenCalled();
  });

  it("keeps the preset equation node until the preset changes", () => {
    const panel = mount();
    const s = initialState();
    renderState(panel, s);

    const equation = panel.el.querySelectorAll(".explain .equation")[1];
    if (!equation) throw new Error("preset equation not found");
    const first = equation.querySelector(".katex");
    expect(first).not.toBeNull();

    renderState(panel, setX(s, 1));
    expect(equation.querySelector(".katex")).toBe(first);

    renderState(panel, setComp(s, "sinsq"));
    expect(equation.querySelector(".katex")).not.toBe(first);
  });

  it("clears the host on dispose", () => {
    const host = document.createElement("div");
    const panel = createChainPanel(host, handlers());
    expect(host.childElementCount).toBe(1);
    panel.dispose();
    expect(host.childElementCount).toBe(0);
  });
});
