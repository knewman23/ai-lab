// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { createDxPanel, type DxPanelHandlers } from "../../../src/viz/derivative/panel";
import { derived, initialState, setFn, setX, zoomIn } from "../../../src/viz/derivative/state";
import type { DxState } from "../../../src/viz/derivative/state";

function handlers(): DxPanelHandlers {
  return {
    onFn: vi.fn(),
    onH: vi.fn(),
    onZoomIn: vi.fn(),
    onResetZoom: vi.fn(),
    onReset: vi.fn(),
    onResetView: vi.fn(),
    onShow: vi.fn(),
  };
}

function mount(h: DxPanelHandlers = handlers()): ReturnType<typeof createDxPanel> {
  const host = document.createElement("div");
  return createDxPanel(host, h);
}

function renderState(panel: ReturnType<typeof createDxPanel>, s: DxState): void {
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

function hNote(el: HTMLElement): HTMLElement {
  const note = el.querySelector<HTMLElement>("p.h-note");
  if (!note) throw new Error("h-note not found");
  return note;
}

function windowNote(el: HTMLElement): HTMLElement {
  const note = el.querySelector<HTMLElement>("p.window");
  if (!note) throw new Error("window note not found");
  return note;
}

function zoomNote(el: HTMLElement): HTMLElement {
  const note = [...el.querySelectorAll<HTMLElement>("p.note")].find((p) =>
    (p.textContent ?? "").includes("Reset zoom to move the point"),
  );
  if (!note) throw new Error("zoom note not found");
  return note;
}

function tangentSentence(el: HTMLElement): string {
  const p = el.querySelectorAll(".explain p")[0];
  if (!p) throw new Error("tangent sentence not found");
  return p.textContent ?? "";
}

function zoomedTo3(): DxState {
  return zoomIn(zoomIn(zoomIn(initialState())));
}

describe("createDxPanel", () => {
  it("renders the initial readouts", () => {
    const panel = mount();
    renderState(panel, initialState());

    expect(readoutText(panel.el, "x")).toBe("1.5");
    expect(readoutText(panel.el, "f(x)")).toBe("2.25");
    expect(readoutText(panel.el, "f′(x)")).toBe("3");
    expect(readoutText(panel.el, "Secant slope")).toBe("4");
    expect(readoutText(panel.el, "Secant − f′")).toBe("1");
  });

  it("hides the window and zoom notes at zoom 0", () => {
    const panel = mount();
    renderState(panel, initialState());

    expect(windowNote(panel.el).hidden).toBe(true);
    expect(zoomNote(panel.el).hidden).toBe(true);
    expect(hNote(panel.el).hidden).toBe(true);
  });

  it("reports the jump at the corner of |x|", () => {
    const panel = mount();
    renderState(panel, setX(setFn(initialState(), "abs"), 0));

    expect(readoutText(panel.el, "f′(x)")).toBe("undefined: left -1, right 1");
    expect(readoutText(panel.el, "Secant slope")).toBe("1");
    expect(readoutText(panel.el, "Secant − f′")).toBe("—");
  });

  it("reports the vertical tangent of √|x|", () => {
    const panel = mount();
    renderState(panel, setX(setFn(initialState(), "sqrtabs"), 0));

    expect(readoutText(panel.el, "f′(x)")).toBe("∞ (vertical tangent)");
  });

  it("notes the clipped h near the right edge", () => {
    const panel = mount();
    renderState(panel, setX(initialState(), 2.5));

    const note = hNote(panel.el);
    expect(note.hidden).toBe(false);
    expect(note.textContent).toContain("clipped to 0.5");
  });

  it("notes that there is no secant at the right edge", () => {
    const panel = mount();
    renderState(panel, setX(initialState(), 3));

    const note = hNote(panel.el);
    expect(note.hidden).toBe(false);
    expect(note.textContent).toContain("no secant");
    expect(readoutText(panel.el, "Secant slope")).toBe("—");
  });

  it("shows the window and disables Zoom in at the deepest zoom", () => {
    const panel = mount();
    renderState(panel, zoomedTo3());

    expect(button(panel.el, "Zoom in").disabled).toBe(true);
    expect(button(panel.el, "Reset zoom").disabled).toBe(false);

    const note = windowNote(panel.el);
    expect(note.hidden).toBe(false);
    expect(note.textContent).toBe("Window: [1.453, 1.547]");
    expect(zoomNote(panel.el).hidden).toBe(false);
  });

  it("disables Reset zoom at zoom 0", () => {
    const panel = mount();
    renderState(panel, initialState());

    expect(button(panel.el, "Reset zoom").disabled).toBe(true);
    expect(button(panel.el, "Zoom in").disabled).toBe(false);
  });

  it("names the blue line only where a tangent is drawn", () => {
    const panel = mount();

    renderState(panel, initialState());
    expect(tangentSentence(panel.el)).toBe("At x = 1.5, f′(x) = 3, the slope of the blue line.");

    renderState(panel, setX(setFn(initialState(), "abs"), 0));
    const jump = tangentSentence(panel.el);
    expect(jump).not.toContain("blue line");
    expect(jump).toBe(
      "At x = 0 the left and right slopes differ (\u22121 and 1), so no tangent line is drawn.",
    );

    renderState(panel, setX(setFn(initialState(), "sqrtabs"), 0));
    const vertical = tangentSentence(panel.el);
    expect(vertical).not.toContain("blue line");
    expect(vertical).toBe("At x = 0 the tangent is vertical, so f′(0) is undefined.");
  });

  it("dispatches onFn when the function select changes", () => {
    const onFn = vi.fn();
    const panel = mount({ ...handlers(), onFn });
    const select = panel.el.querySelector<HTMLSelectElement>("select");
    if (!select) throw new Error("function select not found");

    select.value = "sine";
    select.dispatchEvent(new Event("change"));

    expect(onFn).toHaveBeenCalledWith("sine");
  });

  it("dispatches the run handlers when the buttons are clicked", () => {
    const onZoomIn = vi.fn();
    const onResetZoom = vi.fn();
    const onReset = vi.fn();
    const onResetView = vi.fn();
    const panel = mount({ ...handlers(), onZoomIn, onResetZoom, onReset, onResetView });

    button(panel.el, "Zoom in").click();
    button(panel.el, "Reset zoom").click();
    button(panel.el, "Reset").click();
    button(panel.el, "Reset view").click();

    expect(onZoomIn).toHaveBeenCalledTimes(1);
    expect(onResetZoom).toHaveBeenCalledTimes(1);
    expect(onReset).toHaveBeenCalledTimes(1);
    expect(onResetView).toHaveBeenCalledTimes(1);
  });

  it("dispatches onShow when a toggle changes", () => {
    const onShow = vi.fn();
    const panel = mount({ ...handlers(), onShow });
    const input = panel.el.querySelector<HTMLInputElement>('input[type="checkbox"]');
    if (!input) throw new Error("tangent toggle not found");

    input.checked = false;
    input.dispatchEvent(new Event("change"));

    expect(onShow).toHaveBeenCalledWith("tangent", false);
  });

  it("never fires handlers while rendering", () => {
    const h = handlers();
    const panel = mount(h);

    renderState(panel, initialState());
    renderState(panel, setFn(initialState(), "sine"));
    renderState(panel, setX(setFn(initialState(), "abs"), 0));
    renderState(panel, zoomedTo3());

    for (const spy of Object.values(h)) {
      expect(spy).not.toHaveBeenCalled();
    }
  });

  it("keeps the function equation node until the function changes", () => {
    const panel = mount();
    const s = initialState();
    renderState(panel, s);

    const equation = panel.el.querySelectorAll(".explain .equation")[1];
    if (!equation) throw new Error("function equation not found");
    const first = equation.querySelector(".katex");
    expect(first).not.toBeNull();

    renderState(panel, s);
    expect(equation.querySelector(".katex")).toBe(first);

    renderState(panel, setFn(s, "sine"));
    expect(equation.querySelector(".katex")).not.toBe(first);
  });
});
