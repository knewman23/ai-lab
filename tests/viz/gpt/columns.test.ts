import { describe, expect, it } from "vitest";
import { EMBEDDING_PRESETS, forward, SEQUENCES } from "../../../src/core/math/transformer";
import { columnSegments } from "../../../src/viz/gpt/columns-geometry";
import { createColumns } from "../../../src/viz/gpt/columns";
import type { Layer, Segment, Vec3 } from "../../../src/viz/shared/layer";
import { testTheme } from "./helpers";

const SEQUENCE = SEQUENCES["cat-sat"];
const PASS = forward({
  embeddings: EMBEDDING_PRESETS.tuned,
  sequence: SEQUENCE,
  positional: true,
  causal: true,
});

function make() {
  const { theme, repaint } = testTheme();
  return { columns: createColumns(theme), theme, repaint };
}

/** The segments a layer is actually drawing, rounded to the float32 the buffer holds. */
function drawn(layer: Layer): Segment[] {
  const count = layer.geometry.drawRange.count;
  const out: Segment[] = [];
  for (let n = 0; n < count; n += 2) {
    const point = (at: number): Vec3 => [
      layer.positions[at * 3]!,
      layer.positions[at * 3 + 1]!,
      layer.positions[at * 3 + 2]!,
    ];
    out.push([point(n), point(n + 1)]);
  }
  return out;
}

/** The same segments as float32, so a buffer read compares equal to a computed one. */
function asFloat32(segments: readonly Segment[]): Segment[] {
  const round = (p: Vec3): Vec3 => [Math.fround(p[0]), Math.fround(p[1]), Math.fround(p[2])];
  return segments.map(([a, b]) => [round(a), round(b)]);
}

describe("createColumns", () => {
  it("draws nothing until a pass arrives, so no layer issues a zero-vertex draw", () => {
    const { columns } = make();
    expect(columns.layers.ink.object.visible).toBe(false);
    expect(columns.layers.accent.object.visible).toBe(false);
    columns.dispose();
  });

  it("draws one column per sequence position, each a stem plus five band glyphs", () => {
    const { columns } = make();
    columns.set(PASS);
    columns.setQuery(0);

    const ink = drawn(columns.layers.ink);
    let n = 0;
    for (let i = 1; i < SEQUENCE.length; i++) {
      const expected = asFloat32(columnSegments(PASS, i));
      expect(ink.slice(n, n + expected.length)).toEqual(expected);
      n += expected.length;
    }
    expect(ink).toHaveLength(n);
    expect(columns.layers.ink.object.visible).toBe(true);
    columns.dispose();
  });

  it("moves the query column into the accent layer and leaves the rest in ink", () => {
    const { columns } = make();
    columns.set(PASS);
    columns.setQuery(2);

    expect(drawn(columns.layers.accent)).toEqual(asFloat32(columnSegments(PASS, 2)));
    const ink = drawn(columns.layers.ink);
    expect(ink).toEqual(asFloat32([0, 1, 3, 4].flatMap((i) => columnSegments(PASS, i))));
    columns.dispose();
  });

  it("keeps the split when a new pass arrives without a new query", () => {
    const { columns } = make();
    columns.setQuery(3);
    columns.set(PASS);
    expect(drawn(columns.layers.accent)).toEqual(asFloat32(columnSegments(PASS, 3)));
    columns.dispose();
  });

  it("colours the layers --ink and --accent, and recolours on a theme change", () => {
    const { columns, theme, repaint } = make();
    expect(columns.layers.ink.material.color.getHex()).toBe(theme.ink.getHex());
    // A step brighter than the flat accent, so the query column stands out from the arcs.
    const brighter = theme.accent.clone().offsetHSL(0, 0, 0.08);
    expect(columns.layers.accent.material.color.getHex()).toBe(brighter.getHex());
    expect(columns.layers.accent.material.color.getHSL({ h: 0, s: 0, l: 0 }).l).toBeGreaterThan(
      theme.accent.getHSL({ h: 0, s: 0, l: 0 }).l,
    );

    repaint("--accent", "#663344");
    expect(columns.layers.accent.material.color.getHex()).toBe(
      theme.accent.clone().offsetHSL(0, 0, 0.08).getHex(),
    );
    columns.dispose();
  });

  it("releases its shared geometries and materials and stops listening on dispose", () => {
    const { columns, repaint } = make();
    columns.set(PASS);
    const before = columns.layers.accent.material.color.getHex();
    columns.dispose();
    expect(columns.group.children).toHaveLength(0);
    repaint("--accent", "#0a0b0c");
    expect(columns.layers.accent.material.color.getHex()).toBe(before);
  });

  it("throws rather than overrunning its buffers when the sequence is too long", () => {
    const { columns } = make();
    const long = forward({
      embeddings: EMBEDDING_PRESETS.tuned,
      sequence: [...SEQUENCE, 1],
      positional: true,
      causal: true,
    });
    expect(() => {
      columns.set(long);
    }).toThrow(/columns/);
    columns.dispose();
  });
});
