import { describe, expect, it, vi } from "vitest";
import {
  EMBEDDING_PRESETS,
  type Forward,
  forward,
  SEQUENCES,
} from "../../../src/core/math/transformer";
import { pathDrawing, STEPS } from "../../../src/viz/gpt/residual-path-geometry";
import type { Layer, Segment, Vec3 } from "../../../src/viz/shared/layer";
import { createResidualPath } from "../../../src/viz/gpt/residual-path";
import { testTheme } from "./helpers";

function pass(sentence: keyof typeof SEQUENCES, positional = true): Forward {
  return forward({
    embeddings: EMBEDDING_PRESETS.tuned,
    sequence: SEQUENCES[sentence],
    positional,
    causal: true,
  });
}

const CAT_SAT = pass("cat-sat");
const LAST = SEQUENCES["cat-sat"].length - 1;

function make() {
  const { theme, repaint } = testTheme();
  const path = createResidualPath(theme);
  path.set(CAT_SAT, LAST);
  return { path, theme, repaint };
}

/** The segments a layer is actually drawing. */
function drawn(layer: Layer): Segment[] {
  const out: Segment[] = [];
  const point = (at: number): Vec3 => [
    layer.positions[at * 3]!,
    layer.positions[at * 3 + 1]!,
    layer.positions[at * 3 + 2]!,
  ];
  for (let n = 0; n < layer.geometry.drawRange.count; n += 2) out.push([point(n), point(n + 1)]);
  return out;
}

function expectSegments(layer: Layer, want: readonly Segment[]): void {
  const got = drawn(layer);
  expect(got).toHaveLength(want.length);
  for (let i = 0; i < want.length; i++) {
    for (const end of [0, 1] as const) {
      for (let j = 0; j < 3; j++) expect(got[i]![end][j]).toBeCloseTo(want[i]![end][j]!, 5);
    }
  }
}

describe("createResidualPath", () => {
  it("draws each step into its own layer, and the ring into its own", () => {
    const { path } = make();
    const { arrows, ring } = pathDrawing(CAT_SAT, LAST);
    for (let s = 0; s < STEPS.length; s++) expectSegments(path.layers[STEPS[s]!], arrows[s]!);
    expectSegments(path.layers.ring, ring);
    path.dispose();
  });

  it("redraws when the query moves", () => {
    const { path } = make();
    path.set(CAT_SAT, 1);
    const { arrows } = pathDrawing(CAT_SAT, 1);
    expectSegments(path.layers.attention, arrows[1]!);
    path.dispose();
  });

  it("hides a step with nothing to draw rather than drawing zero vertices", () => {
    const { path } = make();
    expect(path.layers.position.object.visible).toBe(true);
    // With positional encoding off the embedding *is* x, so the position step has no reach.
    path.set(pass("cat-sat", false), LAST);
    expect(drawn(path.layers.position)).toHaveLength(0);
    expect(path.layers.position.object.visible).toBe(false);
    expect(path.layers.attention.object.visible).toBe(true);
    path.dispose();
  });

  it("colours the three steps --soft, --accent and --ink, and the ring with the last", () => {
    const { path, theme } = make();
    expect(path.layers.position.material.color.equals(theme.soft)).toBe(true);
    expect(path.layers.attention.material.color.equals(theme.accent)).toBe(true);
    expect(path.layers.mlp.material.color.equals(theme.ink)).toBe(true);
    expect(path.layers.ring.material.color.equals(theme.ink)).toBe(true);
    path.dispose();
  });

  it("lets the geometry's guards through rather than drawing a broken chain", () => {
    const { path } = make();
    expect(() => path.set(CAT_SAT, 9)).toThrow(/position 9/);
    path.dispose();
  });

  it("hides on setShow(false)", () => {
    const { path } = make();
    expect(path.group.visible).toBe(true);
    path.setShow(false);
    expect(path.group.visible).toBe(false);
    path.setShow(true);
    expect(path.group.visible).toBe(true);
    path.dispose();
  });

  it("recolours on a theme change", () => {
    const { path, theme, repaint } = make();
    repaint("--soft", "#0000ff");
    repaint("--accent", "#ff0000");
    repaint("--ink", "#00ff00");
    expect(path.layers.position.material.color.equals(theme.soft)).toBe(true);
    expect(path.layers.attention.material.color.equals(theme.accent)).toBe(true);
    expect(path.layers.mlp.material.color.equals(theme.ink)).toBe(true);
    expect(path.layers.ring.material.color.equals(theme.ink)).toBe(true);
    path.dispose();
  });

  it("releases its layers and listener on dispose", () => {
    const { path, theme } = make();
    const spies = Object.values(path.layers).flatMap((layer) => [
      vi.spyOn(layer.geometry, "dispose"),
      vi.spyOn(layer.material, "dispose"),
    ]);
    const off = vi.spyOn(theme, "removeEventListener");
    path.dispose();
    for (const spy of spies) expect(spy).toHaveBeenCalledTimes(1);
    expect(off).toHaveBeenCalledWith("change", expect.any(Function));
    expect(path.group.children).toHaveLength(0);
  });
});
