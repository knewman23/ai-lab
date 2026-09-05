// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { EMBEDDING_PRESETS } from "../../../src/core/math/transformer";
import { createGptPanel, type GptPanelHandlers } from "../../../src/viz/gpt/panel";
import { GPT_STEPS } from "../../../src/viz/gpt/walkthrough";
import { derived, initialState, type GptState } from "../../../src/viz/gpt/state";
import { expectStepProse } from "../shared/prose-lint";

/** The state each step is entered from: the fold of every earlier step over a fresh initial. */
function stateBefore(index: number): GptState {
  let state = initialState();
  for (let i = 0; i < index; i += 1) {
    const step = GPT_STEPS[i];
    if (step === undefined) throw new Error(`no step ${i}`);
    state = step.enter(state);
  }
  return state;
}

function stepAt(index: number) {
  const step = GPT_STEPS[index];
  if (step === undefined) throw new Error(`no step ${index}`);
  return step;
}

function mountPanel() {
  const handlers: GptPanelHandlers = {
    onSentence: vi.fn(),
    onPreset: vi.fn(),
    onResetEmbeddings: vi.fn(),
    onQuery: vi.fn(),
    onHead: vi.fn(),
    onStage: vi.fn(),
    onTemperature: vi.fn(),
    onPositional: vi.fn(),
    onCausal: vi.fn(),
    onResidualPath: vi.fn(),
    onResetView: vi.fn(),
  };
  return createGptPanel(document.createElement("div"), handlers);
}

const INDICES = GPT_STEPS.map((_, i) => i);

describe("the GPT walkthrough", () => {
  it("is between five and nine steps", () => {
    expect(GPT_STEPS.length).toBeGreaterThanOrEqual(5);
    expect(GPT_STEPS.length).toBeLessThanOrEqual(9);
  });

  it.each(INDICES)("step %i's enter is deterministic over the diffing surface", (index) => {
    const input = stateBefore(index);
    // Every field of GptState is part of the diffing surface; this scene excludes none.
    const before = { ...input };
    const enter = stepAt(index).enter;

    const first = enter(input);
    const second = enter(input);

    // Determinism, not idempotence: enter(enter(s)) is free to differ from enter(s).
    expect(second).toEqual(first);
    expect({ ...input }).toEqual(before);
  });

  it.each(INDICES)("step %i names a control the mounted panel really registers", (index) => {
    const panel = mountPanel();
    const focus = stepAt(index).focus;
    if (focus === undefined) return;

    const el = panel.controls[focus];
    expect(el).toBeInstanceOf(HTMLElement);
    expect(panel.el.contains(el)).toBe(true);
  });

  it("outlines exactly the control the step names", () => {
    const panel = mountPanel();
    const focus = stepAt(3).focus;
    if (focus === undefined) throw new Error("step 3 is the one that names a control");

    panel.focus(focus);

    const outlined = [...panel.el.querySelectorAll(".is-focused")];
    expect(outlined).toEqual([panel.controls[focus]]);
  });

  it.each(INDICES)("step %i's prose says what to do, not what is on screen", (index) => {
    expectStepProse(stepAt(index).prose, `gpt step ${index}`);
  });

  it("pins the state at the collapsed step", () => {
    const state = stepAt(3).enter(stateBefore(3));

    expect(state.preset).toBe("collapsed");
    expect(state.embeddings).toEqual(EMBEDDING_PRESETS.collapsed);
    expect(state.head).toBe("head1");
    expect(state.stage).toBe("scores");
    expect(state.query).toBe(2);
    expect(state.causal).toBe(true);
    expect(state.positional).toBe(true);
  });

  it("puts head 1's strongest key on the preceding position once content is stripped out", () => {
    const state = stepAt(3).enter(stateBefore(3));
    const head1 = derived(state).pass.heads[0];
    if (head1 === undefined) throw new Error("the pass has no head 1");
    const row = head1.weights[state.query];
    if (row === undefined) throw new Error(`head 1 has no row ${state.query}`);

    const keys = [...row.slice(0, state.query + 1)];
    const strongest = keys.indexOf(Math.max(...keys));
    expect(strongest).toBe(state.query - 1);
  });

  it("pins the state at the spread step", () => {
    const state = stepAt(GPT_STEPS.length - 1).enter(stateBefore(GPT_STEPS.length - 1));

    expect(state.preset).toBe("spread");
    expect(state.embeddings).toEqual(EMBEDDING_PRESETS.spread);
    expect(state.stage).toBe("logits");
    expect(state.query).toBe(4);
    expect(state.causal).toBe(true);
    expect(state.sentence).toBe("cat-sat");
  });
});
