import { Group } from "three";
import type { Graph } from "../../core/math/autograd";
import type { ThemeColors } from "../types";
import { disposeLayers, type Layer, lineLayer, type Segment } from "../shared/layer";
import { writeWorldSegments } from "../shared/layer-write";
import { activeEdgeSegments, edgeSegments } from "./edges-geometry";
import type { Positions } from "./layout";

export interface Edges {
  readonly group: Group;
  /** The two world layers: every edge, and the edges into the active node; read by tests. */
  readonly layers: Readonly<{ all: Layer; active: Layer }>;
  /** Rewrites the all-edges layer for a graph laid out at `positions`. */
  set(g: Graph, positions: Positions): void;
  /** Highlights the edges into `node`, or none for `null`. */
  setActive(g: Graph, positions: Positions, node: string | null): void;
  dispose(): void;
}

/** Endpoints the all-edges buffer holds: 12 edges; the largest preset has 9. */
const ALL_ENDPOINTS = 24;
/** Endpoints the active buffer holds: 4 edges; every op has at most 2 inputs. */
const ACTIVE_ENDPOINTS = 8;

/**
 * The graph's edges drawn on the wall, lifted toward the camera: every edge in
 * `--line` at renderOrder 2, and the edges into the active node in `--accent`
 * at renderOrder 3 on top. Direction is implied by the layout (left to right).
 */
export function createEdges(theme: ThemeColors): Edges {
  const all = lineLayer(ALL_ENDPOINTS, 2, { depth: true });
  const active = lineLayer(ACTIVE_ENDPOINTS, 3, { depth: true });
  const layers = { all, active } as const;

  const group = new Group();
  group.add(all.object, active.object);

  function applyTheme(): void {
    all.material.color.copy(theme.line);
    active.material.color.copy(theme.accent);
  }
  applyTheme();
  theme.addEventListener("change", applyTheme);

  /** Writes `segments` into `layer`; in DEV, throws first if they would overrun its buffer. */
  function write(layer: Layer, segments: readonly Segment[]): void {
    if (import.meta.env.DEV && segments.length * 6 > layer.positions.length) {
      throw new Error(
        `edges: ${segments.length} segments do not fit a ${layer.positions.length / 6}-segment layer`,
      );
    }
    writeWorldSegments(layer, segments);
  }

  return {
    group,
    layers,

    set(g: Graph, positions: Positions): void {
      write(all, edgeSegments(g, positions));
    },

    setActive(g: Graph, positions: Positions, node: string | null): void {
      write(active, node === null ? [] : activeEdgeSegments(g, positions, node));
    },

    dispose(): void {
      theme.removeEventListener("change", applyTheme);
      // Detach before the assembler's disposeObject(scene) sweep, so these
      // geometries and materials are not disposed a second time.
      group.removeFromParent();
      group.clear();
      disposeLayers([all, active]);
    },
  };
}
