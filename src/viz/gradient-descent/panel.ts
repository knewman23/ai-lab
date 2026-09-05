import { createButton } from "../../ui/button";
import { createPanel } from "../../ui/panel";
import { createReadout, fmt } from "../../ui/readout";
import { createSelect } from "../../ui/select";
import { createLogSlider } from "../../ui/slider";
import { createToggle } from "../../ui/toggle";
import { OPTIMIZER_KEYS, OPTIMIZERS, type OptimizerKey } from "../../core/math/optimizers";
import { SURFACES, SURFACE_KEYS, type SurfaceKey } from "../../core/math/surfaces";
import { createControlFocus } from "../shared/control-focus";
import type { ControlInfo } from "../../ui/info";
import { createOverview } from "../../ui/overview";
import { CONTROL_INFO, createExplanation, OVERVIEW } from "./explanation";
import type { GdState, ShowKey, derived } from "./state";

export interface GdPanelHandlers {
  onSurface(key: SurfaceKey): void;
  onOptimizer(key: OptimizerKey): void;
  onLr(lr: number): void;
  onStep(): void;
  onToggleRun(): void;
  onReset(): void;
  onResetView(): void;
  onShow(key: ShowKey, on: boolean): void;
}

const SHOW_KEYS: readonly { key: ShowKey; label: string; info: ControlInfo }[] = [
  { key: "tangent", label: "Tangent plane", info: CONTROL_INFO.showTangent },
  { key: "contours", label: "Contours", info: CONTROL_INFO.showContours },
  { key: "path", label: "Path", info: CONTROL_INFO.showPath },
];

/**
 * The scene's own name for each control a walkthrough step may point at. A union rather than an
 * open string, so a step naming a control this panel does not register is a compile error.
 */
export type GdControlId =
  | "surface"
  | "optimizer"
  | "lr"
  | "step"
  | "run"
  | "reset"
  | "resetView"
  | "showTangent"
  | "showContours"
  | "showPath";

export interface GdPanel {
  el: HTMLElement;
  /** Exhaustive by construction: a union member with no element fails to compile. */
  readonly controls: Readonly<Record<GdControlId, HTMLElement>>;
  render(state: GdState, d: ReturnType<typeof derived>): void;
  /** Outlines one control, or clears the outline. */
  focus(id: GdControlId | undefined): void;
  dispose(): void;
}

/** The gradient descent side panel: controls, readouts and the live explanation. */
export function createGdPanel(
  host: HTMLElement,
  handlers: GdPanelHandlers,
  info: { backend: string },
): GdPanel {
  const panel = createPanel();
  host.append(panel.el);

  // Built before any section so it is the panel's first child, under the walkthrough banner.
  const overview = createOverview(OVERVIEW);
  panel.el.append(overview.el);

  // One "Setup" section: each widget carries its own label, so per-widget headings would repeat them.
  const setupSection = panel.section("Setup");
  const surfaceSection = setupSection;
  const surface = createSelect({
    label: "Surface",
    options: SURFACE_KEYS.map((key) => ({ value: key, title: SURFACES[key].title })),
    value: SURFACE_KEYS[0],
    onChange: (v) => handlers.onSurface(v as SurfaceKey),
    info: CONTROL_INFO.surface,
  });
  surfaceSection.append(surface.el);

  const optimizerSection = setupSection;
  const optimizer = createSelect({
    label: "Optimizer",
    options: OPTIMIZER_KEYS.map((key) => ({ value: key, title: OPTIMIZERS[key].title })),
    value: OPTIMIZER_KEYS[0],
    onChange: (v) => handlers.onOptimizer(v as OptimizerKey),
    info: CONTROL_INFO.optimizer,
  });
  optimizerSection.append(optimizer.el);

  const lrSection = setupSection;
  const lr = createLogSlider({
    label: "Learning rate",
    min: 1e-3,
    max: 1,
    value: 0.1,
    onChange: (v) => handlers.onLr(v),
    info: CONTROL_INFO.lr,
  });
  lrSection.append(lr.el);

  const runSection = panel.section("Run");
  const runRow = document.createElement("div");
  runRow.className = "btn-row";
  runRow.setAttribute("role", "group");
  runRow.setAttribute("aria-label", "Run controls");
  const stepBtn = createButton({ label: "Step", onClick: () => handlers.onStep() });
  const runBtn = createButton({
    label: "Run",
    variant: "primary",
    onClick: () => handlers.onToggleRun(),
  });
  const resetBtn = createButton({ label: "Reset", onClick: () => handlers.onReset() });
  const resetViewBtn = createButton({ label: "Reset view", onClick: () => handlers.onResetView() });
  runRow.append(stepBtn.el, runBtn.el, resetBtn.el, resetViewBtn.el);
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
  const readout = createReadout([
    "Position",
    "Loss",
    "Gradient",
    "|∇f|",
    "Steps",
    "Status",
    "Renderer",
  ]);
  readout.set("Renderer", info.backend);
  readoutSection.append(readout.el);

  const explanation = createExplanation();
  // Marked so the shell can collapse it while a walkthrough's step card, which occupies the
  // same place in the panel, is showing.
  explanation.el.dataset.role = "explanation";
  panel.el.append(explanation.el);

  const toggleFor = (key: ShowKey): HTMLElement => {
    const toggle = toggles.get(key);
    if (!toggle) throw new Error(`gd panel: the "${key}" toggle was never built`);
    return toggle.el;
  };

  const controls: Readonly<Record<GdControlId, HTMLElement>> = {
    surface: surface.el,
    optimizer: optimizer.el,
    lr: lr.el,
    step: stepBtn.el,
    run: runBtn.el,
    reset: resetBtn.el,
    resetView: resetViewBtn.el,
    showTangent: toggleFor("tangent"),
    showContours: toggleFor("contours"),
    showPath: toggleFor("path"),
  };
  const focus = createControlFocus(controls);

  function render(state: GdState, d: ReturnType<typeof derived>): void {
    if (surface.value !== state.surface) surface.value = state.surface;
    if (optimizer.value !== state.optimizer) optimizer.value = state.optimizer;
    if (lr.value !== state.lr) lr.value = state.lr;

    for (const { key } of SHOW_KEYS) {
      const toggle = toggles.get(key);
      if (toggle && toggle.checked !== state.show[key]) toggle.checked = state.show[key];
    }

    runBtn.setLabel(state.running ? "Pause" : "Run");
    stepBtn.setDisabled(!d.canStep);
    runBtn.setDisabled(!d.canStep);

    const [x, y] = state.pos;
    const [gx, gy] = d.grad;
    readout.set("Position", `(${fmt(x)}, ${fmt(y)})`);
    readout.set("Loss", fmt(d.loss));
    readout.set("Gradient", `(${fmt(gx)}, ${fmt(gy)})`);
    readout.set("|∇f|", fmt(d.gradMag));
    readout.set("Steps", String(state.steps));
    readout.set(
      "Status",
      state.status === "left-domain"
        ? "left the domain"
        : state.status === "diverged"
          ? "diverged"
          : "",
    );

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
