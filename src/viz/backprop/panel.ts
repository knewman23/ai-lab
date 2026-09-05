import { GRAPH_KEYS, GRAPHS, type GraphKey } from "../../core/math/graphs";
import { createButton } from "../../ui/button";
import { createOverview } from "../../ui/overview";
import { createPanel } from "../../ui/panel";
import { createSelect } from "../../ui/select";
import { createToggle, type Toggle } from "../../ui/toggle";
import { createControlFocus } from "../shared/control-focus";
import { createExplanation, OVERVIEW, passLine } from "./explanation";
import { createLeafSliders, type LeafSliders } from "./panel-leaves";
import { createBpReadouts, type BpReadouts } from "./panel-readouts";
import { initialState, type BpState, type Derived, type ShowKey } from "./state";

export interface BpPanelHandlers {
  onGraph(key: GraphKey): void;
  onStep(): void;
  onPlay(on: boolean): void;
  onResetPass(): void;
  onLeaf(id: string, v: number): void;
  onReset(): void;
  onResetView(): void;
  onShow(key: ShowKey, on: boolean): void;
}

const SHOW_KEYS: readonly { key: ShowKey; label: string }[] = [
  { key: "values", label: "Value bars" },
  { key: "grads", label: "Grad bars" },
  { key: "edgeDerivs", label: "Edge derivatives" },
];

/**
 * The scene's own name for each control a walkthrough step may point at. A union rather than an
 * open string, so a step naming a control this panel does not register is a compile error.
 * `leaves` is the whole section: its sliders are rebuilt whenever the graph changes.
 */
export type BpControlId =
  | "graph"
  | "leaves"
  | "step"
  | "play"
  | "resetPass"
  | "reset"
  | "resetView"
  | "showValues"
  | "showGrads"
  | "showEdgeDerivs";

export interface BpPanel {
  el: HTMLElement;
  /** Exhaustive by construction: a union member with no element fails to compile. */
  readonly controls: Readonly<Record<BpControlId, HTMLElement>>;
  render(state: BpState, d: Derived): void;
  /** Outlines one control, or clears the outline. */
  focus(id: BpControlId | undefined): void;
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

/** The backprop side panel: graph, pass controls, leaf sliders, overlays, readouts and the explanation. */
export function createBpPanel(host: HTMLElement, handlers: BpPanelHandlers): BpPanel {
  const panel = createPanel();
  host.append(panel.el);

  // Built before any section so it is the panel's first child, under the walkthrough banner.
  const overview = createOverview(OVERVIEW);
  panel.el.append(overview.el);

  const graphSelect = createSelect({
    label: "Graph",
    options: GRAPH_KEYS.map((key) => ({ value: key, title: GRAPHS[key].title })),
    value: GRAPH_KEYS[0],
    onChange: (v) => handlers.onGraph(v as GraphKey),
  });
  panel.section("Setup").append(graphSelect.el);

  // The Play button dispatches the opposite of the last rendered `playing`.
  let playing = false;
  const stepBtn = createButton({ label: "Step", onClick: () => handlers.onStep() });
  const playBtn = createButton({ label: "Play", onClick: () => handlers.onPlay(!playing) });
  const resetPassBtn = createButton({ label: "Reset pass", onClick: () => handlers.onResetPass() });
  const passPara = document.createElement("p");
  passPara.className = "pass-line";
  passPara.setAttribute("aria-live", "polite");
  const passSection = panel.section("Pass");
  passSection.append(buttonRow("Pass controls", stepBtn.el, playBtn.el, resetPassBtn.el), passPara);

  const leavesSection = panel.section("Leaves");

  const resetBtn = createButton({ label: "Reset", onClick: () => handlers.onReset() });
  const resetViewBtn = createButton({ label: "Reset view", onClick: () => handlers.onResetView() });
  panel.section("Run").append(buttonRow("Run controls", resetBtn.el, resetViewBtn.el));

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

  const readoutSection = panel.section("Readouts");
  const explanation = createExplanation(panel.el);
  // Marked so the shell can collapse it while a walkthrough's step card, which occupies the
  // same place in the panel, is showing.
  explanation.el.dataset.role = "explanation";

  const toggleFor = (key: ShowKey): HTMLElement => {
    const toggle = toggles.get(key);
    if (!toggle) throw new Error(`backprop panel: the "${key}" toggle was never built`);
    return toggle.el;
  };

  const controls: Readonly<Record<BpControlId, HTMLElement>> = {
    graph: graphSelect.el,
    leaves: leavesSection,
    step: stepBtn.el,
    play: playBtn.el,
    resetPass: resetPassBtn.el,
    reset: resetBtn.el,
    resetView: resetViewBtn.el,
    showValues: toggleFor("values"),
    showGrads: toggleFor("grads"),
    showEdgeDerivs: toggleFor("edgeDerivs"),
  };
  const focus = createControlFocus(controls);

  // The leaf sliders and readout rows depend on the graph, so both are rebuilt when it changes.
  let graphKey: GraphKey | null = null;
  let leafSliders: LeafSliders | null = null;
  let readouts: BpReadouts | null = null;

  function rebuild(key: GraphKey): void {
    leafSliders?.dispose();
    readouts?.dispose();
    graphKey = key;
    leafSliders = createLeafSliders(leavesSection, GRAPHS[key], (id, v) => handlers.onLeaf(id, v));
    readouts = createBpReadouts(readoutSection, GRAPHS[key]);
  }

  function render(state: BpState, d: Derived): void {
    if (graphSelect.value !== state.graph) graphSelect.value = state.graph;
    if (graphKey !== state.graph) rebuild(state.graph);

    playing = state.playing;
    playBtn.setLabel(playing ? "Pause" : "Play");
    stepBtn.setDisabled(d.done);
    playBtn.setDisabled(d.done);
    passPara.textContent = passLine(state.step, d);

    leafSliders?.render(state.leaves);

    for (const { key } of SHOW_KEYS) {
      const toggle = toggles.get(key);
      if (toggle && toggle.checked !== state.show[key]) toggle.checked = state.show[key];
    }

    readouts?.render(d);
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
