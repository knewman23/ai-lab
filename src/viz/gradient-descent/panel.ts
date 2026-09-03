import { createButton } from "../../ui/button";
import { createPanel } from "../../ui/panel";
import { createReadout, fmt } from "../../ui/readout";
import { createSelect } from "../../ui/select";
import { createLogSlider } from "../../ui/slider";
import { createToggle } from "../../ui/toggle";
import { OPTIMIZER_KEYS, OPTIMIZERS, type OptimizerKey } from "../../core/math/optimizers";
import { SURFACES, SURFACE_KEYS, type SurfaceKey } from "../../core/math/surfaces";
import { createExplanation } from "./explanation";
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

const SHOW_KEYS: readonly { key: ShowKey; label: string }[] = [
  { key: "tangent", label: "Tangent plane" },
  { key: "contours", label: "Contours" },
  { key: "path", label: "Path" },
];

export interface GdPanel {
  el: HTMLElement;
  render(state: GdState, d: ReturnType<typeof derived>): void;
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

  const surfaceSection = panel.section("Surface");
  const surface = createSelect({
    label: "Surface",
    options: SURFACE_KEYS.map((key) => ({ value: key, title: SURFACES[key].title })),
    value: SURFACE_KEYS[0],
    onChange: (v) => handlers.onSurface(v as SurfaceKey),
  });
  surfaceSection.append(surface.el);

  const optimizerSection = panel.section("Optimizer");
  const optimizer = createSelect({
    label: "Optimizer",
    options: OPTIMIZER_KEYS.map((key) => ({ value: key, title: OPTIMIZERS[key].title })),
    value: OPTIMIZER_KEYS[0],
    onChange: (v) => handlers.onOptimizer(v as OptimizerKey),
  });
  optimizerSection.append(optimizer.el);

  const lrSection = panel.section("Learning rate");
  const lr = createLogSlider({
    label: "Learning rate",
    min: 1e-3,
    max: 1,
    value: 0.1,
    onChange: (v) => handlers.onLr(v),
  });
  lrSection.append(lr.el);

  const runSection = panel.section("Run");
  const runRow = document.createElement("div");
  runRow.className = "btn-row";
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
  panel.el.append(explanation.el);

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
      state.status === "left-domain" ? "left the domain" : state.status === "diverged" ? "diverged" : "",
    );

    explanation.render(state, d);
  }

  return {
    el: panel.el,
    render,
    dispose(): void {
      host.innerHTML = "";
    },
  };
}
