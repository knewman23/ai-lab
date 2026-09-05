import type { Mat2 } from "../../core/math/matrix2";
import { createButton } from "../../ui/button";
import { createPanel } from "../../ui/panel";
import { createReadout, fmt } from "../../ui/readout";
import { createSelect } from "../../ui/select";
import { createSlider } from "../../ui/slider";
import { createToggle } from "../../ui/toggle";
import { createControlFocus } from "../shared/control-focus";
import { createExplanation } from "./explanation";
import { createMatrixInput } from "./matrix-input";
import { PRESETS, PRESET_KEYS, type PresetKey } from "./presets";
import type { MtState, ShowKey, derived } from "./state";

export interface MtPanelHandlers {
  onPreset(key: PresetKey): void;
  onEntry(i: 0 | 1 | 2 | 3, v: number): void;
  onT(t: number): void;
  onReset(): void;
  onResetView(): void;
  onShow(key: ShowKey, on: boolean): void;
}

const SHOW_KEYS: readonly { key: ShowKey; label: string }[] = [
  { key: "grid", label: "Transformed grid" },
  { key: "eigen", label: "Eigenvectors" },
  { key: "ghost", label: "Ghost square" },
];

/**
 * The scene's own name for each control a walkthrough step may point at. A union rather than an
 * open string, so a step naming a control this panel does not register is a compile error.
 */
export type MtControlId =
  "preset" | "matrix" | "animate" | "reset" | "resetView" | "showGrid" | "showEigen" | "showGhost";

export interface MtPanel {
  el: HTMLElement;
  /** Exhaustive by construction: a union member with no element fails to compile. */
  readonly controls: Readonly<Record<MtControlId, HTMLElement>>;
  render(state: MtState, d: ReturnType<typeof derived>): void;
  /** Outlines one control, or clears the outline. */
  focus(id: MtControlId | undefined): void;
  dispose(): void;
}

function eigenvalueText(e: ReturnType<typeof derived>["eigen"]): string {
  if (e.kind === "complex") return "complex pair";
  if (e.kind === "uniform") return "all directions";
  return e.pairs.map((p) => fmt(p.value)).join(", ");
}

function sameMatrix(a: Mat2, b: Mat2): boolean {
  return a[0] === b[0] && a[1] === b[1] && a[2] === b[2] && a[3] === b[3];
}

/** The matrix transformation side panel: controls, readouts and the live explanation. */
export function createMtPanel(host: HTMLElement, handlers: MtPanelHandlers): MtPanel {
  const panel = createPanel();
  host.append(panel.el);

  // One "Setup" section: each widget carries its own label, so per-widget headings would repeat them.
  const setup = panel.section("Setup");

  const preset = createSelect({
    label: "Preset",
    options: [
      ...PRESET_KEYS.map((key) => ({ value: key, title: PRESETS[key].title })),
      { value: "custom", title: "Custom", disabled: true },
    ],
    value: PRESET_KEYS[0],
    onChange: (v) => handlers.onPreset(v as PresetKey),
  });
  setup.append(preset.el);

  let lastMatrix: Mat2 = PRESETS.identity.m;
  const matrixInput = createMatrixInput({
    value: lastMatrix,
    onEntry: (i, v) => handlers.onEntry(i, v),
  });
  // Wrapped like every other control: the four entries are one labelled thing, not four loose
  // boxes, and this was the only control in any panel with no visible caption. A span rather
  // than a <label>, since a label may only point at one of the four inputs.
  const matrixField = document.createElement("div");
  matrixField.className = "field";
  matrixField.setAttribute("role", "group");
  matrixField.setAttribute("aria-label", "Matrix entries");
  const matrixLabel = document.createElement("span");
  matrixLabel.className = "lbl";
  matrixLabel.textContent = "Matrix";
  matrixField.append(matrixLabel, matrixInput.el);
  setup.append(matrixField);

  const animate = createSlider({
    label: "Animate",
    min: 0,
    max: 1,
    step: 0.01,
    value: 1,
    onChange: (v) => handlers.onT(v),
    format: (v) => `t = ${v.toFixed(2)}`,
  });
  setup.append(animate.el);

  const runSection = panel.section("Run");
  const runRow = document.createElement("div");
  runRow.className = "btn-row";
  runRow.setAttribute("role", "group");
  runRow.setAttribute("aria-label", "Run controls");
  const resetBtn = createButton({ label: "Reset", onClick: () => handlers.onReset() });
  const resetViewBtn = createButton({ label: "Reset view", onClick: () => handlers.onResetView() });
  runRow.append(resetBtn.el, resetViewBtn.el);
  runSection.append(runRow);

  const showSection = panel.section("Show");
  const toggles = new Map<ShowKey, ReturnType<typeof createToggle>>();
  for (const { key, label } of SHOW_KEYS) {
    const toggle = createToggle({
      label,
      checked: true,
      onChange: (on) => handlers.onShow(key, on),
    });
    toggles.set(key, toggle);
    showSection.append(toggle.el);
  }

  const readoutSection = panel.section("Readouts");
  const readout = createReadout(["det M(t)", "trace M", "Eigenvalues", "Area", "Orientation"]);
  readoutSection.append(readout.el);

  const note = document.createElement("p");
  note.className = "hint note";
  note.textContent = "Set Animate to 1 to drag the vectors";
  panel.el.append(note);

  const explanation = createExplanation();
  // Marked so the shell can collapse it while a walkthrough's step card, which occupies the
  // same place in the panel, is showing.
  explanation.el.dataset.role = "explanation";
  panel.el.append(explanation.el);

  const toggleFor = (key: ShowKey): HTMLElement => {
    const toggle = toggles.get(key);
    if (!toggle) throw new Error(`matrix panel: the "${key}" toggle was never built`);
    return toggle.el;
  };

  const controls: Readonly<Record<MtControlId, HTMLElement>> = {
    preset: preset.el,
    matrix: matrixField,
    animate: animate.el,
    reset: resetBtn.el,
    resetView: resetViewBtn.el,
    showGrid: toggleFor("grid"),
    showEigen: toggleFor("eigen"),
    showGhost: toggleFor("ghost"),
  };
  const focus = createControlFocus(controls);

  function render(state: MtState, d: ReturnType<typeof derived>): void {
    if (preset.value !== state.preset) preset.value = state.preset;

    if (!sameMatrix(lastMatrix, state.m)) {
      lastMatrix = state.m;
      matrixInput.set(state.m);
    }

    if (animate.value !== state.t) animate.value = state.t;

    for (const { key } of SHOW_KEYS) {
      const toggle = toggles.get(key);
      if (toggle && toggle.checked !== state.show[key]) toggle.checked = state.show[key];
    }

    readout.set("det M(t)", fmt(d.detMt));
    readout.set("trace M", fmt(d.traceM));
    readout.set("Eigenvalues", eigenvalueText(d.eigen));
    readout.set("Area", fmt(d.area));
    readout.set("Orientation", d.orientation);

    note.hidden = state.t === 1;

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
