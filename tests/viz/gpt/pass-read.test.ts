import { describe, expect, it } from "vitest";
import { EMBEDDING_PRESETS, forward, SEQUENCES } from "../../../src/core/math/transformer";
import { vec2At } from "../../../src/viz/gpt/pass-read";

const PASS = forward({
  embeddings: EMBEDDING_PRESETS.tuned,
  sequence: SEQUENCES["cat-sat"],
  positional: true,
  causal: true,
});

const COLUMNS = { owner: "gpt columns", slot: "column" } as const;
const PATH = { owner: "gpt residual path", slot: "position" } as const;

describe("vec2At", () => {
  it("reads the stage's own numbers out of the pass", () => {
    const x = PASS.x[2]!;
    expect(vec2At(PASS.x, 2, "x", COLUMNS)).toEqual([x[0], x[1]]);
  });

  it("throws rather than defaulting when the row is missing", () => {
    // d_model is 2 and every stage returns one vector per position, so this is a bug upstream,
    // not a blank to draw around: a zero here would draw a vector that the model never computed.
    expect(() => vec2At(PASS.x, PASS.x.length, "x", COLUMNS)).toThrow(
      "gpt columns: no x at column 5",
    );
    expect(() => vec2At(PASS.xFinal, 9, "xFinal", PATH)).toThrow(
      "gpt residual path: no xFinal at position 9",
    );
  });

  it("throws rather than defaulting when the row is not a 2-vector", () => {
    const short = [Float64Array.from([1])];
    expect(() => vec2At(short, 0, "x", COLUMNS)).toThrow(
      "gpt columns: x at column 0 is not a 2-vector",
    );
    expect(() => vec2At([new Float64Array(0)], 0, "pe", PATH)).toThrow(/not a 2-vector/);
  });
});
