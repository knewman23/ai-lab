/**
 * The GPT side panel: §6's controls in §6's order, the §7 readout for the focused stage, and the
 * explanation. Every control dispatches a handler rather than touching the scene, so the setters
 * in `state.ts` stay the only way this scene changes — which is what a walkthrough will need too.
 */

import { createButton } from "../../ui/button";
import { createEquation } from "../../ui/equation";
import { createPanel } from "../../ui/panel";
import { createReadout, proseNum, type Readout } from "../../ui/readout";
import { createLogSlider } from "../../ui/slider";
import type { Toggle } from "../../ui/toggle";
import { createGptExplanation, PRESET_HINTS } from "./explanation";
import {
  HEAD_OPTIONS,
  keyedSelect,
  labelledToggle,
  PRESET_OPTIONS,
  QUERY_OPTIONS,
  queryTitles,
  retitle,
  SENTENCE_OPTIONS,
  STAGE_OPTIONS,
} from "./panel-controls";
import { stageReadout } from "./panel-readouts";
import type { Derived, GptState, SentenceKey } from "./state";
import { initialState, TEMPERATURE_RANGE } from "./state";

export interface GptPanelHandlers {
  onSentence(key: GptState["sentence"]): void;
  onPreset(key: GptState["preset"]): void;
  onResetEmbeddings(): void;
  onQuery(position: number): void;
  onHead(key: GptState["head"]): void;
  onStage(key: GptState["stage"]): void;
  onTemperature(t: number): void;
  onPositional(on: boolean): void;
  onCausal(on: boolean): void;
  onResidualPath(on: boolean): void;
  onResetView(): void;
}

/** The equation, rows and caveat for the focused stage; the rows are rebuilt when the keys change. */
function createStageReadout(section: HTMLElement): (s: GptState, d: Derived) => void {
  const equation = createEquation();
  const hint = document.createElement("p");
  hint.className = "hint";
  section.append(equation.el, hint);

  let readout: Readout | null = null;
  let keys = "";

  return (s, d) => {
    const { tex, rows, note } = stageReadout(s, d);
    equation.set(tex);

    const signature = rows.map(([key]) => key).join("|");
    let table = readout;
    if (signature !== keys) {
      keys = signature;
      table?.el.remove();
      table = createReadout(rows.map(([key]) => key));
      hint.before(table.el);
      readout = table;
    }
    if (!table) throw new Error("gpt panel: the focused stage produced no readout rows");
    for (const [key, text] of rows) table.set(key, text);
    hint.textContent = note;
    hint.hidden = note === "";
  };
}

export interface GptPanel {
  el: HTMLElement;
  render(state: GptState, d: Derived): void;
  dispose(): void;
}

/** §6's eight control clusters, the §7 readout and the explanation, in that order. */
export function createGptPanel(host: HTMLElement, handlers: GptPanelHandlers): GptPanel {
  const panel = createPanel();
  host.append(panel.el);
  const init = initialState();

  const sentence = keyedSelect("Sentence", SENTENCE_OPTIONS, init.sentence, (v) =>
    handlers.onSentence(v),
  );
  const preset = keyedSelect("Embeddings", PRESET_OPTIONS, init.preset, (v) =>
    handlers.onPreset(v),
  );
  const presetHint = document.createElement("p");
  presetHint.className = "hint";
  const resetEmbeddings = createButton({
    label: "Reset embeddings",
    onClick: () => handlers.onResetEmbeddings(),
  });
  panel.section("Setup").append(sentence.el, preset.el, presetHint, resetEmbeddings.el);

  const query = keyedSelect("Query token", QUERY_OPTIONS, String(init.query), (v) =>
    handlers.onQuery(Number(v)),
  );
  const head = keyedSelect("Head", HEAD_OPTIONS, init.head, (v) => handlers.onHead(v));
  panel.section("Attention").append(query.el, head.el);

  const stage = keyedSelect("Stage", STAGE_OPTIONS, init.stage, (v) => handlers.onStage(v));
  const temperature = createLogSlider({
    label: "Temperature",
    min: TEMPERATURE_RANGE[0],
    max: TEMPERATURE_RANGE[1],
    value: init.temperature,
    format: proseNum,
    onChange: (v) => handlers.onTemperature(v),
  });
  panel.section("Stage").append(stage.el, temperature.el);

  const positional = labelledToggle("Positional encoding", init.positional, (on) =>
    handlers.onPositional(on),
  );
  const causal = labelledToggle("Causal mask", init.causal, (on) => handlers.onCausal(on));
  const residual = labelledToggle("Residual path", init.residualPath, (on) =>
    handlers.onResidualPath(on),
  );
  panel.section("Show").append(positional.el, causal.el, residual.el);

  const resetView = createButton({ label: "Reset view", onClick: () => handlers.onResetView() });
  const runRow = document.createElement("div");
  runRow.className = "btn-row";
  runRow.append(resetView.el);
  panel.section("Run").append(runRow);

  const renderStage = createStageReadout(panel.section("Readouts"));
  createGptExplanation(panel.el);

  // The query labels are the sentence's words, so they are rewritten only when the sentence moves.
  let labelled: SentenceKey | null = null;
  const sync = (control: { value: string }, value: string): void => {
    if (control.value !== value) control.value = value;
  };
  const flip = (toggle: Toggle, on: boolean): void => {
    if (toggle.checked !== on) toggle.checked = on;
  };

  return {
    el: panel.el,
    render(state: GptState, d: Derived): void {
      sync(sentence, state.sentence);
      sync(preset, state.preset);
      presetHint.textContent = PRESET_HINTS[state.preset];

      if (labelled !== state.sentence) {
        labelled = state.sentence;
        retitle(query, queryTitles(state.sentence));
      }
      sync(query, String(state.query));
      sync(head, state.head);
      sync(stage, state.stage);
      if (temperature.value !== state.temperature) temperature.value = state.temperature;

      flip(positional, state.positional);
      flip(causal, state.causal);
      flip(residual, state.residualPath);

      renderStage(state, d);
    },
    dispose(): void {
      host.replaceChildren();
    },
  };
}
