import { FNS, FN_KEYS, type FnKey } from "../../core/math/functions1d";
import { createButton } from "../../ui/button";
import { createOverview } from "../../ui/overview";
import { createPanel } from "../../ui/panel";
import { createReadout, fmt } from "../../ui/readout";
import { createSelect } from "../../ui/select";
import { createLogSlider } from "../../ui/slider";
import { createToggle } from "../../ui/toggle";
import { createControlFocus } from "../shared/control-focus";
import type { ControlInfo } from "../../ui/info";
import { CONTROL_INFO, createExplanation, derivativeText, OVERVIEW } from "./explanation";
import { H_RANGE, MAX_ZOOM, type DxState, type ShowKey, type derived } from "./state";

export interface DxPanelHandlers {
  onFn(key: FnKey): void;
  onH(h: number): void;
  onZoomIn(): void;
  onResetZoom(): void;
  onReset(): void;
  onResetView(): void;
  onShow(key: ShowKey, on: boolean): void;
}

const SHOW_KEYS: readonly { key: ShowKey; label: string; info: ControlInfo }[] = [
  { key: "tangent", label: "Tangent", info: CONTROL_INFO.showTangent },
  { key: "secant", label: "Secant", info: CONTROL_INFO.showSecant },
  { key: "derivative", label: "Derivative curve", info: CONTROL_INFO.showDerivative },
];

/**
 * The scene's own name for each control a walkthrough step may point at. A union rather than an
 * open string, so a step naming a control this panel does not register is a compile error.
 */
export type DxControlId =
  | "fn"
  | "h"
  | "zoomIn"
  | "resetZoom"
  | "reset"
  | "resetView"
  | "showTangent"
  | "showSecant"
  | "showDerivative";

export interface DxPanel {
  el: HTMLElement;
  /** Exhaustive by construction: a union member with no element fails to compile. */
  readonly controls: Readonly<Record<DxControlId, HTMLElement>>;
  render(state: DxState, d: ReturnType<typeof derived>): void;
  /** Outlines one control, or clears the outline. */
  focus(id: DxControlId | undefined): void;
  dispose(): void;
}

/** The derivative explorer side panel: controls, readouts and the live explanation. */
export function createDxPanel(host: HTMLElement, handlers: DxPanelHandlers): DxPanel {
  const panel = createPanel();
  host.append(panel.el);

  // Built before any section so it is the panel's first child, under the walkthrough banner.
  const overview = createOverview(OVERVIEW);
  panel.el.append(overview.el);

  // One "Setup" section: each widget carries its own label, so per-widget headings would repeat them.
  const setup = panel.section("Setup");

  const fnSelect = createSelect({
    label: "Function",
    options: FN_KEYS.map((key) => ({ value: key, title: FNS[key].title })),
    value: FN_KEYS[0],
    onChange: (v) => handlers.onFn(v as FnKey),
    info: CONTROL_INFO.fn,
  });
  setup.append(fnSelect.el);

  const hSlider = createLogSlider({
    label: "h",
    min: H_RANGE[0],
    max: H_RANGE[1],
    value: 1,
    onChange: (v) => handlers.onH(v),
    format: (v) => fmt(v),
    info: CONTROL_INFO.h,
  });
  setup.append(hSlider.el);

  // A slider's own readout only refreshes on input, so the state-dependent clipping text lives here.
  const hNote = document.createElement("p");
  hNote.className = "hint h-note";
  hNote.hidden = true;
  setup.append(hNote);

  const runSection = panel.section("Run");
  const runRow = document.createElement("div");
  runRow.className = "btn-row";
  runRow.setAttribute("role", "group");
  runRow.setAttribute("aria-label", "Run controls");
  const zoomInBtn = createButton({ label: "Zoom in", onClick: () => handlers.onZoomIn() });
  const resetZoomBtn = createButton({ label: "Reset zoom", onClick: () => handlers.onResetZoom() });
  const resetBtn = createButton({ label: "Reset", onClick: () => handlers.onReset() });
  const resetViewBtn = createButton({ label: "Reset view", onClick: () => handlers.onResetView() });
  runRow.append(zoomInBtn.el, resetZoomBtn.el, resetBtn.el, resetViewBtn.el);
  runSection.append(runRow);

  const showSection = panel.section("Show");
  const toggles = new Map<ShowKey, ReturnType<typeof createToggle>>();
  for (const { key, label, info } of SHOW_KEYS) {
    const toggle = createToggle({
      label,
      checked: true,
      onChange: (on) => handlers.onShow(key, on),
      info,
    });
    toggles.set(key, toggle);
    showSection.append(toggle.el);
  }

  const readoutSection = panel.section("Readouts");
  const readout = createReadout(["x", "f(x)", "f′(x)", "Secant slope", "Secant − f′"]);
  readoutSection.append(readout.el);

  const windowNote = document.createElement("p");
  windowNote.className = "note window";
  windowNote.hidden = true;

  const zoomNote = document.createElement("p");
  zoomNote.className = "note";
  zoomNote.textContent = "Reset zoom to move the point";
  zoomNote.hidden = true;

  panel.el.append(windowNote, zoomNote);

  const explanation = createExplanation();
  // Marked so the shell can collapse it while a walkthrough's step card, which occupies the
  // same place in the panel, is showing.
  explanation.el.dataset.role = "explanation";
  panel.el.append(explanation.el);

  const toggleFor = (key: ShowKey): HTMLElement => {
    const toggle = toggles.get(key);
    if (!toggle) throw new Error(`derivative panel: the "${key}" toggle was never built`);
    return toggle.el;
  };

  const controls: Readonly<Record<DxControlId, HTMLElement>> = {
    fn: fnSelect.el,
    h: hSlider.el,
    zoomIn: zoomInBtn.el,
    resetZoom: resetZoomBtn.el,
    reset: resetBtn.el,
    resetView: resetViewBtn.el,
    showTangent: toggleFor("tangent"),
    showSecant: toggleFor("secant"),
    showDerivative: toggleFor("derivative"),
  };
  const focus = createControlFocus(controls);

  function render(state: DxState, d: ReturnType<typeof derived>): void {
    if (fnSelect.value !== state.fn) fnSelect.value = state.fn;
    if (hSlider.value !== state.h) hSlider.value = state.h;

    for (const { key } of SHOW_KEYS) {
      const toggle = toggles.get(key);
      if (toggle && toggle.checked !== state.show[key]) toggle.checked = state.show[key];
    }

    if (d.hEff === null) {
      hNote.textContent = "x is at the right edge; no secant";
      hNote.hidden = false;
    } else if (d.hEff !== state.h) {
      hNote.textContent = `clipped to ${fmt(d.hEff)} so x + h stays in the domain`;
      hNote.hidden = false;
    } else {
      hNote.textContent = "";
      hNote.hidden = true;
    }

    zoomInBtn.setDisabled(state.zoom >= MAX_ZOOM);
    resetZoomBtn.setDisabled(state.zoom === 0);

    readout.set("x", fmt(state.x));
    readout.set("f(x)", fmt(d.fx));
    readout.set("f′(x)", derivativeText(d.d));
    readout.set("Secant slope", d.secant === null ? "—" : fmt(d.secant));
    readout.set("Secant − f′", d.gap === null ? "—" : fmt(d.gap));

    windowNote.textContent = `Window: [${fmt(d.window[0])}, ${fmt(d.window[1])}]`;
    windowNote.hidden = state.zoom === 0;
    zoomNote.hidden = state.zoom === 0;

    explanation.render(state, d);
  }

  return {
    el: panel.el,
    controls,
    focus,
    render,
    dispose(): void {
      host.replaceChildren();
    },
  };
}
