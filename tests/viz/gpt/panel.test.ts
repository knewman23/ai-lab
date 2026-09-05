// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { createGptPanel, type GptPanelHandlers } from "../../../src/viz/gpt/panel";
import type { GptState } from "../../../src/viz/gpt/state";
import {
  derived,
  initialState,
  setQuery,
  setSentence,
  setStage,
  setTemperature,
} from "../../../src/viz/gpt/state";

/**
 * `satisfies` rather than an annotation, so the spies keep their `Mock` types: assertions read
 * them as properties, which is what keeps `handlers()` off the unbound-method rule.
 */
function handlers() {
  return {
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
  } satisfies GptPanelHandlers;
}

type Handlers = ReturnType<typeof handlers>;

type Panel = ReturnType<typeof createGptPanel>;

function mount(h: Handlers = handlers()): Panel {
  return createGptPanel(document.createElement("div"), h);
}

function show(panel: Panel, s: GptState): void {
  panel.render(s, derived(s));
}

function selects(el: HTMLElement): HTMLSelectElement[] {
  return [...el.querySelectorAll("select")];
}

/** The nth `<select>` in DOM order, which §6 fixes: sentence, embeddings, query, head, stage. */
function select(el: HTMLElement, index: number): HTMLSelectElement {
  const found = selects(el)[index];
  if (!found) throw new Error(`select ${index} not found`);
  return found;
}

function choose(el: HTMLElement, index: number, value: string): void {
  const s = select(el, index);
  s.value = value;
  s.dispatchEvent(new Event("change"));
}

function button(el: HTMLElement, label: string): HTMLButtonElement {
  const found = [...el.querySelectorAll("button")].find((b) => b.textContent === label);
  if (!found) throw new Error(`button not found: ${label}`);
  return found;
}

function range(el: HTMLElement): HTMLInputElement {
  const found = el.querySelector<HTMLInputElement>('input[type="range"]');
  if (!found) throw new Error("temperature slider not found");
  return found;
}

function slide(el: HTMLElement, raw: string): void {
  const input = range(el);
  input.value = raw;
  input.dispatchEvent(new Event("input"));
}

function checkboxes(el: HTMLElement): HTMLInputElement[] {
  return [...el.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')];
}

function check(el: HTMLElement, index: number, on: boolean): void {
  const box = checkboxes(el)[index];
  if (!box) throw new Error(`toggle ${index} not found`);
  box.checked = on;
  box.dispatchEvent(new Event("change"));
}

function readoutRow(el: HTMLElement, key: string): string {
  const dt = [...el.querySelectorAll("dt")].find((n) => n.textContent === key);
  const dd = dt?.nextElementSibling;
  if (!dd) throw new Error(`readout key not found: ${key}`);
  return dd.textContent ?? "";
}

/** The caveat under the readout rows, which is a second `p.hint` inside the Readouts section. */
function caveat(el: HTMLElement): HTMLParagraphElement {
  const section = [...el.querySelectorAll("section.panel-section")].find(
    (s) => s.querySelector("h3")?.textContent === "Readouts",
  );
  const p = section?.querySelector("p.hint");
  if (!(p instanceof HTMLParagraphElement)) throw new Error("readout caveat not found");
  return p;
}

function hint(el: HTMLElement): string {
  const p = el.querySelector("p.hint");
  if (!p) throw new Error("preset hint not found");
  return p.textContent ?? "";
}

describe("createGptPanel: the §6 controls, in order", () => {
  it("lays the five selects out as sentence, embeddings, query token, head, stage", () => {
    const panel = mount();
    expect(selects(panel.el).map((s) => s.previousElementSibling?.textContent)).toEqual([
      "Sentence",
      "Embeddings",
      "Query token",
      "Head",
      "Stage",
    ]);
  });

  it("names the sentences by the words they spell", () => {
    const panel = mount();
    const sentence = select(panel.el, 0);
    expect([...sentence.options].map((o) => o.value)).toEqual(["cat-sat", "dog-ran", "scrambled"]);
    expect([...sentence.options].map((o) => o.textContent)).toEqual([
      "the cat sat on the",
      "the dog ran on the",
      "on the mat sat cat",
    ]);
  });

  it("dispatches the sentence and the embedding preset", () => {
    const h = handlers();
    const panel = mount(h);
    choose(panel.el, 0, "scrambled");
    choose(panel.el, 1, "spread");
    expect(h.onSentence).toHaveBeenCalledWith("scrambled");
    expect(h.onPreset).toHaveBeenCalledWith("spread");
  });

  it("dispatches Reset embeddings and Reset view separately", () => {
    const h = handlers();
    const panel = mount(h);
    button(panel.el, "Reset embeddings").click();
    button(panel.el, "Reset view").click();
    expect(h.onResetEmbeddings).toHaveBeenCalledTimes(1);
    expect(h.onResetView).toHaveBeenCalledTimes(1);
    expect(h.onPreset).not.toHaveBeenCalled();
  });

  it("offers the five query positions as numbers, and dispatches the index", () => {
    const h = handlers();
    const panel = mount(h);
    expect([...select(panel.el, 2).options].map((o) => o.value)).toEqual(["0", "1", "2", "3", "4"]);
    choose(panel.el, 2, "2");
    expect(h.onQuery).toHaveBeenCalledWith(2);
  });

  it("labels the query positions with the current sentence's words", () => {
    const panel = mount();
    show(panel, initialState());
    expect([...select(panel.el, 2).options].map((o) => o.textContent)) //
      .toEqual(["0 the", "1 cat", "2 sat", "3 on", "4 the"]);

    show(panel, setSentence(initialState(), "scrambled"));
    expect([...select(panel.el, 2).options].map((o) => o.textContent)) //
      .toEqual(["0 on", "1 the", "2 mat", "3 sat", "4 cat"]);
  });

  it("dispatches the head and the stage", () => {
    const h = handlers();
    const panel = mount(h);
    choose(panel.el, 3, "head1");
    choose(panel.el, 4, "mlp");
    expect(h.onHead).toHaveBeenCalledWith("head1");
    expect(h.onStage).toHaveBeenCalledWith("mlp");
    expect([...select(panel.el, 4).options].map((o) => o.textContent)).toEqual([
      "all",
      "embed + position",
      "scores",
      "softmax",
      "weighted sum",
      "+ residual",
      "MLP",
      "logits",
    ]);
  });

  it("dispatches the three toggles in the §6.7 order", () => {
    const h = handlers();
    const panel = mount(h);
    expect(checkboxes(panel.el).map((b) => b.nextElementSibling?.nextElementSibling?.textContent)) //
      .toEqual(["Positional encoding", "Causal mask", "Residual path"]);
    check(panel.el, 0, false);
    check(panel.el, 1, false);
    check(panel.el, 2, false);
    expect(h.onPositional).toHaveBeenCalledWith(false);
    expect(h.onCausal).toHaveBeenCalledWith(false);
    expect(h.onResidualPath).toHaveBeenCalledWith(false);
  });
});

describe("createGptPanel: the temperature slider", () => {
  it("is logarithmic over [0.2, 3] and reports its ends exactly", () => {
    const h = handlers();
    const panel = mount(h);
    slide(panel.el, "0");
    expect(h.onTemperature).toHaveBeenLastCalledWith(0.2);
    slide(panel.el, "1000");
    expect(h.onTemperature).toHaveBeenLastCalledWith(3);
    // The midpoint of a log scale is the geometric mean; a linear one would report 1.6.
    slide(panel.el, "500");
    expect(h.onTemperature).toHaveBeenLastCalledWith(Math.sqrt(0.2 * 3));
  });

  it("formats through the shared proseNum, not the slider's default learning-rate format", () => {
    const panel = mount();
    slide(panel.el, "500");
    // proseNum keeps four significant digits; formatLr would round this to 0.775.
    expect(panel.el.querySelector("output")?.textContent).toBe("0.7746");
  });

  it("follows state.temperature without firing", () => {
    const h = handlers();
    const panel = mount(h);
    show(panel, setTemperature(initialState(), 2));
    expect(panel.el.querySelector("output")?.textContent).toBe("2");
    expect(h.onTemperature).not.toHaveBeenCalled();
  });
});

describe("createGptPanel: the preset hint", () => {
  it("writes the chosen preset's line under the embeddings select", () => {
    const panel = mount();
    show(panel, initialState());
    const tuned = hint(panel.el);

    const collapsed = { ...initialState(), preset: "collapsed" } as const;
    show(panel, collapsed);
    expect(hint(panel.el)).toContain("head 1's positional bias on its own");
    expect(hint(panel.el)).not.toBe(tuned);
  });

  it("sits inside the same section as the embeddings select", () => {
    const panel = mount();
    const section = select(panel.el, 1).closest("section");
    expect(section?.querySelector("p.hint")).not.toBeNull();
  });
});

describe("createGptPanel: the readout follows the focused stage", () => {
  it("writes the raw score row with masked entries as —", () => {
    const panel = mount();
    show(panel, setQuery(setStage(initialState(), "scores"), 2));
    expect(readoutRow(panel.el, "Head 1 scores")).toBe("2.563, 2.5, 1.821, —, —");
  });

  it("writes the top-3 next tokens at the default stage", () => {
    const panel = mount();
    show(panel, initialState());
    expect(readoutRow(panel.el, "Next token")).toBe("the 0.7892, sat 0.1306, cat 0.0414");
  });

  it("rebuilds the rows when the focused stage changes", () => {
    const panel = mount();
    show(panel, setStage(initialState(), "mlp"));
    expect(readoutRow(panel.el, "W₂h + b₂")).toBe("(-0.3868, 0.4325)");
    show(panel, setStage(initialState(), "residual"));
    expect(() => readoutRow(panel.el, "W₂h + b₂")).toThrow();
    expect(readoutRow(panel.el, "x'(4)")).toBe("(-0.2119, 2.205)");
  });

  it("shows the caveat only on a stage that has one", () => {
    const panel = mount();
    show(panel, setStage(initialState(), "mlp"));
    expect(caveat(panel.el).hidden).toBe(true);
    expect(caveat(panel.el).textContent).toBe("");

    show(panel, setStage(initialState(), "scores"));
    expect(caveat(panel.el).hidden).toBe(false);
    expect(caveat(panel.el).textContent).toContain("not a model quantity");
  });

  it("re-renders the equation only when the TeX changes", () => {
    const panel = mount();
    const section = [...panel.el.querySelectorAll("section.panel-section")].find(
      (s) => s.querySelector("h3")?.textContent === "Readouts",
    );
    const equation = section?.querySelector(".equation");
    if (!equation) throw new Error("readout equation not found");

    show(panel, setStage(initialState(), "mlp"));
    const rendered = equation.querySelector(".katex");
    expect(rendered).not.toBeNull();

    show(panel, setTemperature(setStage(initialState(), "mlp"), 2));
    expect(equation.querySelector(".katex")).toBe(rendered);

    show(panel, setStage(initialState(), "logits"));
    expect(equation.querySelector(".katex")).not.toBe(rendered);
  });
});

describe("createGptPanel: teardown", () => {
  it("empties the host", () => {
    const host = document.createElement("div");
    const panel = createGptPanel(host, handlers());
    expect(host.childElementCount).toBe(1);
    panel.dispose();
    expect(host.childElementCount).toBe(0);
  });
});
