import { describe, expect, it } from "vitest";
import { labelRank } from "../../../src/viz/gpt/label-rank";

describe("labelRank", () => {
  it("ranks the five families band, word, step, bar, vocabulary in that order", () => {
    expect(labelRank("band:attention")).toBe(0);
    expect(labelRank("word:3")).toBe(1);
    expect(labelRank("step:mlp")).toBe(2);
    expect(labelRank("bar:5")).toBe(3);
    expect(labelRank("vocab:5")).toBe(4);
  });

  it("separates the vocabulary from the bars, which carry the same eight words", () => {
    expect(labelRank("vocab:0")).toBeGreaterThan(labelRank("bar:0"));
  });

  it("throws for an id from no known family rather than guessing a rank", () => {
    expect(() => labelRank("halo:1")).toThrow(/halo:1/);
    expect(() => labelRank("band")).toThrow(/band/);
  });
});
