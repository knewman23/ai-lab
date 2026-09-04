import { DATASETS, DATASET_KEYS, type DatasetKey } from "../../core/math/datasets";
import { createButton } from "../../ui/button";
import { createPanel } from "../../ui/panel";
import { createReadout } from "../../ui/readout";
import { createSelect } from "../../ui/select";
import { createLogSlider } from "../../ui/slider";
import { createToggle, type Toggle } from "../../ui/toggle";
import { createNnExplanation, probeText, trainingLine } from "./explanation";
import { initialState, LR_RANGE, type Derived, type NnState, type ShowKey } from "./state";

export interface NnPanelHandlers {
  onDataset(key: DatasetKey): void;
  onStep(): void;
  onPlay(on: boolean): void;
  onReset(): void;
  onLr(lr: number): void;
  onResetView(): void;
  onShow(key: ShowKey, on: boolean): void;
}

const SHOW_KEYS: readonly { key: ShowKey; label: string }[] = [
  { key: "weights", label: "Weights" },
  { key: "data", label: "Data" },
  { key: "boundary", label: "Boundary" },
];

/** The one readout row: epoch, loss and accuracy live in the training line instead. */
const PROBE_ROW = "Probe";

export interface NnPanel {
  el: HTMLElement;
  render(state: NnState, d: Derived): void;
  dispose(): void;
}

function buttonRow(label: string, ...buttons: HTMLElement[]): HTMLElement {
  const row = document.createElement("div");
  row.className = "btn-row";
  row.setAttribute("role", "group");
  row.setAttribute("aria-label", label);
  row.append(...buttons);
  return row;
}

/** The neural network side panel: dataset, training controls, overlays, the probe readout and the explanation. */
export function createNnPanel(host: HTMLElement, handlers: NnPanelHandlers): NnPanel {
  const panel = createPanel();
  host.append(panel.el);

  const init = initialState();

  const datasetSelect = createSelect({
    label: "Dataset",
    options: DATASET_KEYS.map((key) => ({ value: key, title: DATASETS[key].title })),
    value: init.dataset,
    onChange: (v) => handlers.onDataset(v as DatasetKey),
  });
  panel.section("Setup").append(datasetSelect.el);

  // The Play button dispatches the opposite of the last rendered `playing`.
  let playing = false;
  const stepBtn = createButton({ label: "Step", onClick: () => handlers.onStep() });
  const playBtn = createButton({ label: "Play", onClick: () => handlers.onPlay(!playing) });
  const resetBtn = createButton({ label: "Reset", onClick: () => handlers.onReset() });
  const lrSlider = createLogSlider({
    label: "Learning rate",
    min: LR_RANGE[0],
    max: LR_RANGE[1],
    value: init.lr,
    onChange: (v) => handlers.onLr(v),
  });
  const trainingPara = document.createElement("p");
  trainingPara.className = "training-line";
  trainingPara.setAttribute("aria-live", "polite");
  panel
    .section("Training")
    .append(
      buttonRow("Training controls", stepBtn.el, playBtn.el, resetBtn.el),
      lrSlider.el,
      trainingPara,
    );

  const resetViewBtn = createButton({ label: "Reset view", onClick: () => handlers.onResetView() });
  panel.section("Run").append(buttonRow("Run controls", resetViewBtn.el));

  const showSection = panel.section("Show");
  const toggles = new Map<ShowKey, Toggle>();
  for (const { key, label } of SHOW_KEYS) {
    const toggle = createToggle({
      label,
      checked: init.show[key],
      onChange: (on) => handlers.onShow(key, on),
    });
    toggles.set(key, toggle);
    showSection.append(toggle.el);
  }

  const readout = createReadout([PROBE_ROW]);
  panel.section("Readouts").append(readout.el);

  const explanation = createNnExplanation(panel.el);

  function render(state: NnState, d: Derived): void {
    if (datasetSelect.value !== state.dataset) datasetSelect.value = state.dataset;

    playing = state.playing;
    playBtn.setLabel(playing ? "Pause" : "Play");
    if (lrSlider.value !== state.lr) lrSlider.value = state.lr;
    trainingPara.textContent = trainingLine(state, d);

    for (const { key } of SHOW_KEYS) {
      const toggle = toggles.get(key);
      if (toggle && toggle.checked !== state.show[key]) toggle.checked = state.show[key];
    }

    readout.set(PROBE_ROW, probeText(state, d));
    explanation.render(state, d);
  }

  return {
    el: panel.el,
    render,
    dispose(): void {
      host.replaceChildren();
    },
  };
}
