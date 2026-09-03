// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { createGdPanel, type GdPanelHandlers } from "../../../src/viz/gradient-descent/panel";
import { derived, initialState } from "../../../src/viz/gradient-descent/state";

function handlers(): GdPanelHandlers {
  return {
    onSurface: vi.fn(),
    onOptimizer: vi.fn(),
    onLr: vi.fn(),
    onStep: vi.fn(),
    onToggleRun: vi.fn(),
    onReset: vi.fn(),
    onResetView: vi.fn(),
    onShow: vi.fn(),
  };
}

function readoutText(el: HTMLElement, key: string): string {
  const dt = [...el.querySelectorAll("dt")].find((n) => n.textContent === key);
  const dd = dt?.nextElementSibling;
  if (!dd) throw new Error(`readout key not found: ${key}`);
  return dd.textContent ?? "";
}

function button(el: HTMLElement, label: string): HTMLButtonElement {
  const btn = [...el.querySelectorAll("button")].find((b) => b.textContent === label);
  if (!btn) throw new Error(`button not found: ${label}`);
  return btn;
}

describe("createGdPanel", () => {
  it("renders initial readouts", () => {
    const host = document.createElement("div");
    const panel = createGdPanel(host, handlers(), { backend: "webgpu" });
    const s = initialState();
    panel.render(s, derived(s));

    expect(readoutText(panel.el, "Steps")).toBe("0");
    expect(readoutText(panel.el, "Status")).toBe("");
    expect(button(panel.el, "Run")).toBeTruthy();
  });

  it("dispatches onSurface when the surface select changes", () => {
    const host = document.createElement("div");
    const onSurface = vi.fn();
    const panel = createGdPanel(host, { ...handlers(), onSurface }, { backend: "webgpu" });
    const select = panel.el.querySelector<HTMLSelectElement>("select")!;
    select.value = "saddle";
    select.dispatchEvent(new Event("change"));

    expect(onSurface).toHaveBeenCalledWith("saddle");
  });

  it("dispatches onStep when Step is clicked", () => {
    const host = document.createElement("div");
    const onStep = vi.fn();
    const panel = createGdPanel(host, { ...handlers(), onStep }, { backend: "webgpu" });
    const s = initialState();
    panel.render(s, derived(s));

    button(panel.el, "Step").click();
    expect(onStep).toHaveBeenCalled();
  });

  it("disables Step and Run and shows diverged status", () => {
    const host = document.createElement("div");
    const panel = createGdPanel(host, handlers(), { backend: "webgpu" });
    const s = { ...initialState(), status: "diverged" as const };
    panel.render(s, derived(s));

    expect(button(panel.el, "Step").disabled).toBe(true);
    expect(button(panel.el, "Run").disabled).toBe(true);
    expect(readoutText(panel.el, "Status")).toBe("diverged");
  });

  it("shows Pause when running", () => {
    const host = document.createElement("div");
    const panel = createGdPanel(host, handlers(), { backend: "webgpu" });
    const s = { ...initialState(), running: true };
    panel.render(s, derived(s));

    expect(panel.el.textContent).toContain("Pause");
  });

  it("dispose empties the host", () => {
    const host = document.createElement("div");
    const panel = createGdPanel(host, handlers(), { backend: "webgpu" });
    expect(host.children.length).toBeGreaterThan(0);
    panel.dispose();
    expect(host.children.length).toBe(0);
  });
});
