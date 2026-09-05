import { COMP_KEYS, COMPOSITIONS, DX_RANGE, type CompKey } from "../../core/math/compositions";
import { createButton } from "../../ui/button";
import { createPanel } from "../../ui/panel";
import { fmt } from "../../ui/readout";
import { createSelect } from "../../ui/select";
import { createLogSlider } from "../../ui/slider";
import { createToggle, type Toggle } from "../../ui/toggle";
import { createControlFocus } from "../shared/control-focus";
import { createExplanation } from "./explanation";
import { createChainReadouts } from "./panel-readouts";
import { DX_DEFAULT, initialState, type ChainState, type Derived, type ShowKey } from "./state";

export interface ChainPanelHandlers {
  onComp(key: CompKey): void;
  onDx(dx: number): void;
  onReset(): void;
  onResetView(): void;
  onShow(key: ShowKey, on: boolean): void;
}

const SHOW_KEYS: readonly { key: ShowKey; label: string }[] = [
  { key: "triangles", label: "Δ triangles" },
  { key: "secants", label: "Secants" },
  { key: "tangents", label: "Tangents" },
  { key: "connectors", label: "Connectors" },
];

/**
 * The scene's own name for each control a walkthrough step may point at. A union rather than an
 * open string, so a step naming a control this panel does not register is a compile error.
 */
export type ChainControlId =
  | "comp"
  | "dx"
  | "reset"
  | "resetView"
  | "showTriangles"
  | "showSecants"
  | "showTangents"
  | "showConnectors";

export interface ChainPanel {
  el: HTMLElement;
  /** Exhaustive by construction: a union member with no element fails to compile. */
  readonly controls: Readonly<Record<ChainControlId, HTMLElement>>;
  render(state: ChainState, d: Derived): void;
  /** Outlines one control, or clears the outline. */
  focus(id: ChainControlId | undefined): void;
  dispose(): void;
}

/** The chain rule graph side panel: controls, grouped readouts and the live explanation. */
export function createChainPanel(host: HTMLElement, handlers: ChainPanelHandlers): ChainPanel {
  const panel = createPanel();
  host.append(panel.el);

  const setup = panel.section("Setup");

  const compSelect = createSelect({
    label: "Composition",
    options: COMP_KEYS.map((key) => ({ value: key, title: COMPOSITIONS[key].title })),
    value: COMP_KEYS[0],
    onChange: (v) => handlers.onComp(v as CompKey),
  });
  setup.append(compSelect.el);

  const dxSlider = createLogSlider({
    label: "Step",
    min: DX_RANGE[0],
    max: DX_RANGE[1],
    value: DX_DEFAULT,
    onChange: (v) => handlers.onDx(v),
    format: (v) => `Δx = ${fmt(v)}`,
  });
  setup.append(dxSlider.el);

  // A slider's own readout only refreshes on input, so the state-dependent clipping text lives here.
  const dxNote = document.createElement("p");
  dxNote.className = "hint dx-note";
  dxNote.hidden = true;
  setup.append(dxNote);

  const runRow = document.createElement("div");
  runRow.className = "btn-row";
  runRow.setAttribute("role", "group");
  runRow.setAttribute("aria-label", "Run controls");
  const resetBtn = createButton({ label: "Reset", onClick: () => handlers.onReset() });
  const resetViewBtn = createButton({ label: "Reset view", onClick: () => handlers.onResetView() });
  runRow.append(resetBtn.el, resetViewBtn.el);
  panel.section("Run").append(runRow);

  const showSection = panel.section("Show");
  const toggles = new Map<ShowKey, Toggle>();
  const init = initialState().show;
  for (const { key, label } of SHOW_KEYS) {
    const toggle = createToggle({
      label,
      checked: init[key],
      onChange: (on) => handlers.onShow(key, on),
    });
    toggles.set(key, toggle);
    showSection.append(toggle.el);
  }

  const readouts = createChainReadouts(panel);
  const explanation = createExplanation(panel.el);
  // Marked so the shell can collapse it while a walkthrough's step card, which occupies the
  // same place in the panel, is showing.
  explanation.el.dataset.role = "explanation";

  const toggleFor = (key: ShowKey): HTMLElement => {
    const toggle = toggles.get(key);
    if (!toggle) throw new Error(`chain rule panel: the "${key}" toggle was never built`);
    return toggle.el;
  };

  const controls: Readonly<Record<ChainControlId, HTMLElement>> = {
    comp: compSelect.el,
    dx: dxSlider.el,
    reset: resetBtn.el,
    resetView: resetViewBtn.el,
    showTriangles: toggleFor("triangles"),
    showSecants: toggleFor("secants"),
    showTangents: toggleFor("tangents"),
    showConnectors: toggleFor("connectors"),
  };
  const focus = createControlFocus(controls);

  function render(state: ChainState, d: Derived): void {
    if (compSelect.value !== state.comp) compSelect.value = state.comp;
    if (dxSlider.value !== state.dx) dxSlider.value = state.dx;

    for (const { key } of SHOW_KEYS) {
      const toggle = toggles.get(key);
      if (toggle && toggle.checked !== state.show[key]) toggle.checked = state.show[key];
    }

    if (d.dxEff === null) {
      dxNote.textContent = "x is at the right edge; no Δ";
      dxNote.hidden = false;
    } else if (d.dxEff !== state.dx) {
      dxNote.textContent = `clipped to ${fmt(d.dxEff)} so x + Δx stays in the domain`;
      dxNote.hidden = false;
    } else {
      dxNote.textContent = "";
      dxNote.hidden = true;
    }

    readouts.render(state, d);
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
