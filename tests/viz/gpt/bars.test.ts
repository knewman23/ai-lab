import { type BufferAttribute, DoubleSide, type MeshStandardMaterial } from "three";
import { describe, expect, it, vi } from "vitest";
import {
  EMBEDDING_PRESETS,
  forward,
  probabilities,
  SEQUENCES,
  VOCAB,
} from "../../../src/core/math/transformer";
import { BAR_BUFFER_FLOATS, leaderSegment, writeBars } from "../../../src/viz/gpt/bars-geometry";
import { createBars } from "../../../src/viz/gpt/bars";
import { drawn, testTheme } from "./helpers";

const PASS = forward({
  embeddings: EMBEDDING_PRESETS.tuned,
  sequence: SEQUENCES["cat-sat"],
  positional: true,
  causal: true,
});
const PROBS = probabilities(PASS.logits, 1);

function make() {
  const { theme, repaint } = testTheme();
  const bars = createBars(theme);
  bars.set(PROBS);
  return { bars, theme, repaint };
}

describe("createBars", () => {
  it("draws exactly what the geometry computes, out of the attribute the mesh is bound to", () => {
    const { bars } = make();
    const expected = new Float32Array(BAR_BUFFER_FLOATS);
    const count = writeBars(expected, PROBS);
    expect(bars.geometry.drawRange.count).toBe(count);
    // The bound attribute, not the exported reference: binding a different array would leave
    // `bars.positions` right and the mesh drawing something else entirely.
    const bound = bars.geometry.getAttribute("position") as BufferAttribute;
    expect(bound.array).toBe(bars.positions);
    expect([...(bound.array as Float32Array)]).toEqual([...expected]);
    // Uploaded, not just written: `needsUpdate` has no getter in three, and setting it is what
    // bumps `version`, so a `set` that skipped it would leave the version at 0.
    expect(bound.version).toBeGreaterThan(0);
    bars.dispose();
  });

  it("rewrites the buffer on a new distribution rather than rebuilding geometry", () => {
    const { bars } = make();
    const before = bars.geometry;
    const version = (bars.geometry.getAttribute("position") as BufferAttribute).version;
    const uniform = Float64Array.from(VOCAB.map(() => 1 / VOCAB.length));
    bars.set(uniform);
    const expected = new Float32Array(BAR_BUFFER_FLOATS);
    writeBars(expected, uniform);
    expect(bars.geometry).toBe(before);
    const bound = bars.geometry.getAttribute("position") as BufferAttribute;
    expect([...(bound.array as Float32Array)]).toEqual([...expected]);
    expect(bound.version).toBeGreaterThan(version);
    bars.dispose();
  });

  it("lets the geometry's guards through rather than drawing a broken row", () => {
    const { bars } = make();
    expect(() => bars.set(Float64Array.from([1, 0]))).toThrow(/probabilities for 8 words/);
    expect(() => bars.set(Float64Array.from(VOCAB.map(() => 0)))).toThrow(/no mass/);
    bars.dispose();
  });

  it("runs the leader line the geometry names, in --soft", () => {
    const { bars, theme } = make();
    expect(drawn(bars.leader)).toHaveLength(1);
    const [from, to] = drawn(bars.leader)[0]!;
    const [expectedFrom, expectedTo] = leaderSegment();
    for (let i = 0; i < 3; i++) {
      expect(from[i]).toBeCloseTo(expectedFrom[i]!, 5);
      expect(to[i]).toBeCloseTo(expectedTo[i]!, 5);
    }
    // `--soft`, never `--line`, which is near-invisible against the translucent wall.
    expect(bars.leader.material.color.equals(theme.soft)).toBe(true);
    bars.dispose();
  });

  it("draws the bars in --accent, double-sided, on one un-negated normal", () => {
    const { bars, theme } = make();
    expect(bars.material.color.equals(theme.accent)).toBe(true);
    expect(bars.material.side).toBe(DoubleSide);
    // One normal for the whole buffer, never negated: WebGPU's DoubleSide path already
    // multiplies by faceDirection.
    const normals = bars.geometry.getAttribute("normal");
    expect(normals.count * 3).toBe(BAR_BUFFER_FLOATS);
    for (let n = 0; n < normals.count; n++) {
      expect([normals.getX(n), normals.getY(n), normals.getZ(n)]).toEqual([0, 1, 0]);
    }
    bars.dispose();
  });

  it("draws nothing until it has a distribution", () => {
    const { theme } = testTheme();
    const bars = createBars(theme);
    // WebGPU warns on a draw with zero vertices, so the row is hidden until the first `set`.
    expect(bars.geometry.drawRange.count).toBe(0);
    expect(bars.mesh.visible).toBe(false);
    bars.set(PROBS);
    expect(bars.mesh.visible).toBe(true);
    bars.dispose();
  });

  it("recolours on a theme change", () => {
    const { bars, theme, repaint } = make();
    repaint("--accent", "#ff0000");
    repaint("--soft", "#0000ff");
    expect((bars.mesh.material as MeshStandardMaterial).color.equals(theme.accent)).toBe(true);
    expect(bars.leader.material.color.equals(theme.soft)).toBe(true);
    bars.dispose();
  });

  it("releases its geometry, material and listener on dispose", () => {
    const { bars, theme } = make();
    const spies = [
      vi.spyOn(bars.geometry, "dispose"),
      vi.spyOn(bars.material, "dispose"),
      vi.spyOn(bars.leader.geometry, "dispose"),
      vi.spyOn(bars.leader.material, "dispose"),
    ];
    const off = vi.spyOn(theme, "removeEventListener");
    bars.dispose();
    for (const spy of spies) expect(spy).toHaveBeenCalledTimes(1);
    expect(off).toHaveBeenCalledWith("change", expect.any(Function));
    expect(bars.group.children).toHaveLength(0);
  });
});
