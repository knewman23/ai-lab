import { Group } from "three";
import type { Forward } from "../../core/math/transformer";
import { disposeLayers, type Layer, lineLayer, type Segment } from "../shared/layer";
import { writeWorldSegments } from "../shared/layer-write";
import type { ThemeColors } from "../types";
import { columnSegments, COLUMN_ENDPOINTS } from "./columns-geometry";
import { COLUMN_X } from "./layout";

export interface Columns {
  readonly group: Group;
  /** The two world layers: the unselected columns, and the query column on top. Read by tests. */
  readonly layers: Readonly<{ ink: Layer; accent: Layer }>;
  /** Redraws every column from a forward pass. */
  set(f: Forward): void;
  /** Selects the query column, which is the one drawn in `--accent`. */
  setQuery(i: number): void;
  dispose(): void;
}

/**
 * The ink layer can hold every column: `setQuery` is free to name a position the current pass
 * does not have, and until `set` runs again the query column simply is not drawn.
 */
const ENDPOINTS = COLUMN_X.length * COLUMN_ENDPOINTS;

/** §5.3's "one step brighter": how much lighter than `--accent` the query column is drawn. */
const QUERY_LIGHTEN = 0.08;

/**
 * The five token columns: a vertical line per sequence position with an arrow glyph on each of
 * the five vector bands. Colour is per layer, not per segment, so the selection is a split
 * across two buffers — the query column into `--accent` at a higher render order, the rest into
 * `--ink` — rather than a second material on the same one.
 */
export function createColumns(theme: ThemeColors): Columns {
  const ink = lineLayer(ENDPOINTS, 10, { depth: true });
  const accent = lineLayer(COLUMN_ENDPOINTS, 11, { depth: true });
  const layers = { ink, accent } as const;

  const group = new Group();
  group.add(ink.object, accent.object);

  function applyTheme(): void {
    ink.material.color.copy(theme.ink);
    // A step brighter than the accent itself, so the query column reads as selected against
    // the arcs and the probability bars, which are drawn in the flat accent.
    accent.material.color.copy(theme.accent).offsetHSL(0, 0, QUERY_LIGHTEN);
  }
  applyTheme();
  theme.addEventListener("change", applyTheme);

  /** The pass the columns currently show; null until the first `set`. */
  let pass: Forward | null = null;
  let query = 0;

  function redraw(): void {
    const inkSegments: Segment[] = [];
    let accentSegments: readonly Segment[] = [];
    if (pass !== null) {
      for (let i = 0; i < pass.x.length; i++) {
        const segments = columnSegments(pass, i);
        if (i === query) accentSegments = segments;
        else inkSegments.push(...segments);
      }
    }
    // Both writes go through `commit`, so an empty layer hides rather than drawing zero vertices.
    writeWorldSegments(ink, inkSegments);
    writeWorldSegments(accent, accentSegments);
  }
  redraw();

  return {
    group,
    layers,

    set(f): void {
      if (f.x.length > COLUMN_X.length) {
        throw new Error(
          `gpt columns: ${f.x.length} positions exceed the ${COLUMN_X.length} columns`,
        );
      }
      pass = f;
      redraw();
    },

    setQuery(i): void {
      query = i;
      redraw();
    },

    dispose(): void {
      theme.removeEventListener("change", applyTheme);
      // Detach before the assembler's disposeObject(scene) sweep, so these
      // geometries and materials are not disposed a second time.
      group.removeFromParent();
      group.clear();
      disposeLayers([ink, accent]);
    },
  };
}
