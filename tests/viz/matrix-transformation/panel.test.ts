// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { createMtPanel, type MtPanelHandlers } from "../../../src/viz/matrix-transformation/panel";
import {
  derived,
  initialState,
  setPreset,
  setT,
} from "../../../src/viz/matrix-transformation/state";
import type { MtState } from "../../../src/viz/matrix-transformation/state";

function handlers(): MtPanelHandlers {
  return {
    onPreset: vi.fn(),
    onEntry: vi.fn(),
    onT: vi.fn(),
    onReset: vi.fn(),
    onResetView: vi.fn(),
    onShow: vi.fn(),
  };
}

function mount(h: MtPanelHandlers = handlers()): ReturnType<typeof createMtPanel> {
  const host = document.createElement("div");
  return createMtPanel(host, h);
}

function readoutText(el: HTMLElement, key: string): string {
  const dt = [...el.querySelectorAll("dt")].find((n) => n.textContent === key);
  const dd = dt?.nextElementSibling;
  if (!dd) throw new Error(`readout key not found: ${key}`);
  return dd.textContent ?? "";
}

function renderState(panel: ReturnType<typeof createMtPanel>, s: MtState): void {
  panel.render(s, derived(s));
}

describe("createMtPanel", () => {
  it("renders the identity readouts", () => {
    const panel = mount();
    renderState(panel, initialState());

    expect(readoutText(panel.el, "det M(t)")).toBe("1");
    expect(readoutText(panel.el, "trace M")).toBe("2");
    expect(readoutText(panel.el, "Eigenvalues")).toBe("all directions");
    expect(readoutText(panel.el, "Area")).toBe("1");
    expect(readoutText(panel.el, "Orientation")).toBe("preserved");
  });

  it("reports a reversed orientation for the reflection preset", () => {
    const panel = mount();
    renderState(panel, setPreset(initialState(), "reflection"));

    expect(readoutText(panel.el, "det M(t)")).toBe("-1");
    expect(readoutText(panel.el, "Orientation")).toBe("reversed");
  });

  it("reports a complex pair for the rotation preset", () => {
    const panel = mount();
    renderState(panel, setPreset(initialState(), "rotation"));

    expect(readoutText(panel.el, "Eigenvalues")).toBe("complex pair");
  });

  it("reports the single repeated eigenvalue for the shear preset", () => {
    const panel = mount();
    renderState(panel, setPreset(initialState(), "shear"));

    expect(readoutText(panel.el, "Eigenvalues")).toBe("1");
  });

  it("reports a collapsed orientation for the projection preset", () => {
    const panel = mount();
    renderState(panel, setPreset(initialState(), "projection"));

    expect(readoutText(panel.el, "Orientation")).toBe("collapsed");
  });

  it("describes the zero eigenvalue without naming a basis vector", () => {
    const panel = mount();
    renderState(panel, setPreset(initialState(), "projection"));

    const paragraphs = [...panel.el.querySelectorAll(".explain p")];
    const sentence = paragraphs[paragraphs.length - 1]?.textContent ?? "";

    expect(sentence).toContain("One eigenvalue is 0");
    expect(sentence).toContain("sent to the origin");
    expect(sentence).not.toContain("ĵ");
    expect(sentence).not.toContain("î");
  });

  it("dispatches onPreset when the preset select changes", () => {
    const onPreset = vi.fn();
    const panel = mount({ ...handlers(), onPreset });
    const select = panel.el.querySelector<HTMLSelectElement>("select");
    if (!select) throw new Error("preset select not found");

    select.value = "shear";
    select.dispatchEvent(new Event("change"));

    expect(onPreset).toHaveBeenCalledWith("shear");
  });

  it("selects the disabled custom option without dispatching", () => {
    const onPreset = vi.fn();
    const panel = mount({ ...handlers(), onPreset });
    const select = panel.el.querySelector<HTMLSelectElement>("select");
    if (!select) throw new Error("preset select not found");

    const custom = [...select.options].find((o) => o.value === "custom");
    expect(custom?.disabled).toBe(true);

    renderState(panel, { ...initialState(), preset: "custom" });

    expect(select.value).toBe("custom");
    expect(onPreset).not.toHaveBeenCalled();
  });

  it("shows the drag note and the t readout while t is below 1", () => {
    const panel = mount();
    renderState(panel, setT(initialState(), 0.5));

    const note = panel.el.querySelector<HTMLElement>("p.note");
    if (!note) throw new Error("note not found");
    expect(note.hidden).toBe(false);

    const output = panel.el.querySelector("output");
    expect(output?.textContent).toBe("t = 0.50");
  });

  it("hides the drag note at t = 1", () => {
    const panel = mount();
    renderState(panel, initialState());

    const note = panel.el.querySelector<HTMLElement>("p.note");
    expect(note?.hidden).toBe(true);
  });

  it("keeps the matrix equation node when the matrix is unchanged", () => {
    const panel = mount();
    const s = initialState();
    renderState(panel, s);

    const equation = panel.el.querySelector(".explain .equation");
    if (!equation) throw new Error("matrix equation not found");
    const first = equation.firstChild;
    expect(first).not.toBeNull();

    renderState(panel, s);

    expect(equation.firstChild).toBe(first);
  });

  it("never fires handlers while rendering", () => {
    const h = handlers();
    const panel = mount(h);

    renderState(panel, initialState());
    renderState(panel, setPreset(initialState(), "shear"));
    renderState(panel, setT(setPreset(initialState(), "rotation"), 0.25));

    for (const spy of Object.values(h)) {
      expect(spy).not.toHaveBeenCalled();
    }
  });
});
