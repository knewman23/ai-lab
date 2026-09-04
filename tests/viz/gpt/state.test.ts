import { describe, expect, it } from "vitest";
import { EMBEDDING_PRESETS, SEQUENCES, probabilities } from "../../../src/core/math/transformer";
import type { GptState } from "../../../src/viz/gpt/state";
import {
  TEMPERATURE_RANGE,
  derived,
  initialState,
  pass,
  resetEmbeddings,
  setCausal,
  setEmbedding,
  setHead,
  setPositional,
  setPreset,
  setQuery,
  setResidualPath,
  setSentence,
  setStage,
  setTemperature,
} from "../../../src/viz/gpt/state";

/** Deep enough to catch a setter mutating the state it was handed. */
const snapshot = (s: GptState): string => JSON.stringify(s);

describe("gpt scene state", () => {
  it("opens on the tuned cat-sat sentence with the last token selected", () => {
    const s = initialState();
    expect(s.sentence).toBe("cat-sat");
    expect(s.preset).toBe("tuned");
    expect(s.embeddings).toEqual(EMBEDDING_PRESETS.tuned);
    expect(s.query).toBe(4);
    expect(s.head).toBe("both");
    expect(s.stage).toBe("all");
    expect(s.temperature).toBe(1);
    expect(s.positional).toBe(true);
    expect(s.causal).toBe(true);
    expect(s.residualPath).toBe(true);
    expect(TEMPERATURE_RANGE).toEqual([0.2, 3]);
  });

  it("every setter returns a new object and leaves the old one untouched", () => {
    const s = initialState();
    const before = snapshot(s);
    const results = [
      setSentence(s, "dog-ran"),
      setPreset(s, "spread"),
      setEmbedding(s, 2, [0.5, 0.5]),
      resetEmbeddings(setEmbedding(s, 2, [0.5, 0.5])),
      setQuery(s, 0),
      setHead(s, "head2"),
      setStage(s, "softmax"),
      setTemperature(s, 2),
      setPositional(s, false),
      setCausal(s, false),
      setResidualPath(s, false),
    ];
    for (const next of results) expect(next).not.toBe(s);
    expect(snapshot(s)).toBe(before);
  });

  it("setHead, setStage and setResidualPath each set what they name", () => {
    const s = initialState();
    expect(setHead(s, "head1").head).toBe("head1");
    expect(setHead(setHead(s, "head1"), "head2").head).toBe("head2");
    expect(setStage(s, "weighted").stage).toBe("weighted");
    expect(setResidualPath(s, false).residualPath).toBe(false);
    expect(setResidualPath(setResidualPath(s, false), true).residualPath).toBe(true);
    // The rest of the state comes across untouched.
    expect({ ...setStage(s, "weighted"), stage: s.stage }).toEqual(s);
  });

  // Five positions is a spec constant, and `setQuery`'s bound and the column layout both assume it.
  // A fourth sentence of a different length should fail here rather than leave `query` stale.
  it("every sequence has the five positions the layout draws", () => {
    for (const sequence of Object.values(SEQUENCES)) expect(sequence).toHaveLength(5);
  });

  it("setSentence switches the sequence and keeps the embeddings", () => {
    const s = setSentence(initialState(), "scrambled");
    expect(s.sentence).toBe("scrambled");
    expect(derived(s).sequence).toEqual([...SEQUENCES.scrambled]);
    expect(s.embeddings).toEqual(EMBEDDING_PRESETS.tuned);
  });

  it("setQuery rejects an index outside 0..4", () => {
    const s = initialState();
    expect(setQuery(s, 0).query).toBe(0);
    expect(setQuery(s, 4).query).toBe(4);
    expect(() => setQuery(s, 5)).toThrow(/query/);
    expect(() => setQuery(s, -1)).toThrow(/query/);
    expect(() => setQuery(s, 1.5)).toThrow(/query/);
  });

  it("setEmbedding moves only the word it names", () => {
    const s = initialState();
    const moved = setEmbedding(s, 3, [1.1, -0.4]);
    expect(moved.embeddings[3]).toEqual([1.1, -0.4]);
    expect(moved.embeddings.filter((_, v) => v !== 3)).toEqual(
      s.embeddings.filter((_, v) => v !== 3),
    );
    expect(s.embeddings[3]).toEqual(EMBEDDING_PRESETS.tuned[3]);
    expect(() => setEmbedding(s, 8, [0, 0])).toThrow(/word/);
  });

  it("resetEmbeddings restores the current preset, not the default one", () => {
    const dragged = setEmbedding(setPreset(initialState(), "spread"), 0, [0, 0]);
    expect(dragged.embeddings).not.toEqual(EMBEDDING_PRESETS.spread);
    expect(resetEmbeddings(dragged).embeddings).toEqual(EMBEDDING_PRESETS.spread);
    expect(resetEmbeddings(dragged).preset).toBe("spread");
  });

  it("setPreset replaces all eight embeddings", () => {
    const s = setPreset(setEmbedding(initialState(), 5, [0, 0]), "collapsed");
    expect(s.preset).toBe("collapsed");
    expect(s.embeddings).toEqual(EMBEDDING_PRESETS.collapsed);
  });

  it("setTemperature clamps to the slider's range", () => {
    const s = initialState();
    expect(setTemperature(s, 0.05).temperature).toBe(0.2);
    expect(setTemperature(s, 9).temperature).toBe(3);
    expect(setTemperature(s, 0.7).temperature).toBe(0.7);
  });

  it("derived returns the forward pass and the probabilities at the current temperature", () => {
    const s = setTemperature(initialState(), 0.4);
    const d = derived(s);
    expect(d.pass.x).toHaveLength(5);
    expect(d.pass.logits).toHaveLength(8);
    expect([...d.probabilities]).toEqual([...probabilities(d.pass.logits, 0.4)]);
    expect([...d.probabilities].reduce((a, b) => a + b, 0)).toBeCloseTo(1, 12);
    // The temperature reshapes the distribution without touching the pass it came from.
    expect([...derived(setTemperature(s, 3)).pass.logits]).toEqual([...d.pass.logits]);
  });

  it("pass is the forward half on its own, so a temperature move can skip it", () => {
    const s = initialState();
    expect(pass(s)).toEqual(derived(s).pass);
    // Nothing in `pass` depends on the temperature, which is what lets the assembler cache it.
    expect(pass(setTemperature(s, 2.5))).toEqual(pass(s));
    expect([...probabilities(pass(s).logits, 2.5)]).toEqual([
      ...derived(setTemperature(s, 2.5)).probabilities,
    ]);
  });

  it("derived feeds the toggles into the forward pass, not just the panel", () => {
    const s = initialState();
    const masked = derived(s).pass;
    const open = derived(setCausal(s, false)).pass;
    for (const head of masked.heads) {
      expect(head.weights.map((row) => row.length)).toEqual([1, 2, 3, 4, 5]);
    }
    for (const head of open.heads) {
      expect(head.weights.map((row) => row.length)).toEqual([5, 5, 5, 5, 5]);
    }
    // Positional encoding reaches it too: pe(p) goes to zero when the toggle is off.
    const off = derived(setPositional(s, false)).pass;
    const zero = Float64Array.from([0, 0]);
    expect(off.pe).toHaveLength(5);
    expect(off.pe[1]).toEqual(zero);
    expect(masked.pe).toHaveLength(5);
    expect(masked.pe[1]).toBeInstanceOf(Float64Array);
    expect(masked.pe[1]).not.toEqual(zero);
  });
});
