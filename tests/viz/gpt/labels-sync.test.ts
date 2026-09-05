// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import type { LabelKind, LabelLayer } from "../../../src/viz/shared/labels";
import type { Vec3 } from "../../../src/viz/shared/layer";
import { syncLabels } from "../../../src/viz/gpt/labels-sync";
import {
  derived,
  initialState,
  setEmbedding,
  setResidualPath,
  setSentence,
  type GptState,
} from "../../../src/viz/gpt/state";

interface Written {
  readonly text: string;
  readonly world: Vec3;
  readonly kind: LabelKind;
}

/** A stand-in for the overlay that keeps the ids, which the DOM spans do not carry. */
function recorder(): { layer: LabelLayer; written: Map<string, Written>; removed: string[] } {
  const written = new Map<string, Written>();
  const removed: string[] = [];
  const layer: LabelLayer = {
    set: (id, text, world, kind) => {
      written.set(id, { text, world, kind });
    },
    remove: (id) => {
      written.delete(id);
      removed.push(id);
    },
    update: () => undefined,
    clear: () => written.clear(),
    dispose: () => undefined,
  };
  return { layer, written, removed };
}

function write(state: GptState): ReturnType<typeof recorder> {
  const rec = recorder();
  syncLabels(rec.layer, state, derived(state));
  return rec;
}

function text(rec: ReturnType<typeof recorder>, id: string): string {
  const entry = rec.written.get(id);
  if (entry === undefined) throw new Error(`no label ${id}`);
  return entry.text;
}

function world(rec: ReturnType<typeof recorder>, id: string): Vec3 {
  const entry = rec.written.get(id);
  if (entry === undefined) throw new Error(`no label ${id}`);
  return entry.world;
}

/** §5.8's five families, written out rather than read off the module under test. */
const BAND_NAMES = ["embed + position", "attention", "+ residual", "MLP", "logits"];
const BAND_IDS = ["band:embed", "band:attention", "band:residual", "band:mlp", "band:logits"];
const WORDS = ["the", "cat", "sat", "on", "mat", "dog", "ran", "fast"];
const SENTENCE = ["the", "cat", "sat", "on", "the"];
const STEP_IDS = ["step:position", "step:attention", "step:mlp"];
const STEP_NAMES = ["+ position", "+ attention", "+ MLP"];

describe("syncLabels", () => {
  it("writes all five of the spec's label families", () => {
    const rec = write(initialState());

    expect(BAND_IDS.map((id) => text(rec, id))).toEqual(BAND_NAMES);
    expect(SENTENCE.map((_, i) => text(rec, `word:${i}`))).toEqual(SENTENCE);
    expect(WORDS.map((_, v) => text(rec, `vocab:${v}`))).toEqual(WORDS);
    expect(WORDS.map((_, v) => text(rec, `bar:${v}`))).toEqual(WORDS);
    expect(STEP_IDS.map((id) => text(rec, id))).toEqual(STEP_NAMES);
  });

  it("writes nothing but those families", () => {
    const rec = write(initialState());
    expect(rec.written.size).toBe(
      BAND_IDS.length + SENTENCE.length + WORDS.length * 2 + STEP_IDS.length,
    );
  });

  it("stacks the band names in pipeline order, off the wall's right edge", () => {
    const rec = write(initialState());
    const zs = BAND_IDS.map((id) => world(rec, id)[2]);
    for (const [i, z] of zs.entries()) if (i > 0) expect(z).toBeGreaterThan(zs[i - 1]!);
    expect(new Set(BAND_IDS.map((id) => world(rec, id)[0])).size).toBe(1);
    // Clear of every token column, so a band name never sits on top of a glyph.
    const columns = SENTENCE.map((_, i) => world(rec, `word:${i}`)[0]);
    expect(world(rec, "band:logits")[0]).toBeGreaterThan(Math.max(...columns));
  });

  it("hangs the sequence words under the wall in column order", () => {
    const rec = write(initialState());
    const xs = SENTENCE.map((_, i) => world(rec, `word:${i}`)[0]);
    for (const [i, x] of xs.entries()) if (i > 0) expect(x).toBeGreaterThan(xs[i - 1]!);
    // The wall stands on z = 0, so its words hang below it.
    for (const [i] of SENTENCE.entries()) expect(world(rec, `word:${i}`)[2]).toBeLessThan(0);
  });

  it("renames the sequence words when the sentence changes", () => {
    const rec = write(setSentence(initialState(), "dog-ran"));
    expect(SENTENCE.map((_, i) => text(rec, `word:${i}`))).toEqual([
      "the",
      "dog",
      "ran",
      "on",
      "the",
    ]);
  });

  it("follows a word across the floor when its embedding moves", () => {
    const before = write(initialState());
    const after = write(setEmbedding(initialState(), 4, [-1.5, 1.5]));
    expect(world(after, "vocab:4")).not.toEqual(world(before, "vocab:4"));
    expect(world(after, "vocab:5")).toEqual(world(before, "vocab:5"));
  });

  it("lifts each bar's label to the top of the bar it names", () => {
    const state = initialState();
    const d = derived(state);
    const rec = write(state);
    let tallest = 0;
    for (let v = 1; v < d.probabilities.length; v++) {
      if (d.probabilities[v]! > d.probabilities[tallest]!) tallest = v;
    }
    let shortest = 0;
    for (let v = 1; v < d.probabilities.length; v++) {
      if (d.probabilities[v]! < d.probabilities[shortest]!) shortest = v;
    }
    expect(world(rec, `bar:${tallest}`)[2]).toBeGreaterThan(world(rec, `bar:${shortest}`)[2]);
  });

  it("chains the three residual-path labels along the path", () => {
    const rec = write(initialState());
    const at = STEP_IDS.map((id) => world(rec, id));
    // Three distinct midpoints on the floor's own lift, not three labels on one spot.
    expect(new Set(at.map((p) => `${p[0]},${p[1]}`)).size).toBe(3);
    expect(new Set(at.map((p) => p[2])).size).toBe(1);
  });

  it("takes the residual-path labels down when the path is hidden", () => {
    const rec = recorder();
    const state = initialState();
    syncLabels(rec.layer, state, derived(state));
    const off = setResidualPath(state, false);
    syncLabels(rec.layer, off, derived(off));

    for (const id of STEP_IDS) expect(rec.written.has(id)).toBe(false);
    expect(rec.removed).toEqual(expect.arrayContaining(STEP_IDS));
    // The other four families stay: only the set that changed is rebuilt.
    expect(rec.written.has("band:logits")).toBe(true);
    expect(rec.written.has("vocab:7")).toBe(true);
  });
});
