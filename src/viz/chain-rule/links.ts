import { Group } from "three";
import type { Composition } from "../../core/math/compositions";
import type { ThemeColors } from "../types";
import { disposeLayers, type Layer, lineLayer } from "../shared/layer";
import { writeWorldSegments } from "../shared/layer-write";
import { linkSegments, type LinkSegments } from "./links-geometry";
import type { Derived, ShowKey } from "./state";

type LinkKey = keyof LinkSegments;

export interface Links {
  readonly group: Group;
  /** The five world layers, keyed by what they draw; read by tests. */
  readonly layers: Readonly<Record<LinkKey, Layer>>;
  /** Rewrites every layer for a state. */
  set(c: Composition, x: number, d: Derived): void;
  /** Shows or hides layers by overlay toggle; "connectors" covers both connector layers. */
  setShow(show: Readonly<Record<ShowKey, boolean>>): void;
  dispose(): void;
}

/** How each layer is drawn: buffer size in endpoints, render order, opacity, theme colour, and the toggle that shows it. */
interface LayerSpec {
  readonly endpoints: number;
  readonly order: number;
  readonly opacity: number;
  readonly colour: "soft" | "faint" | "accent";
  readonly show: ShowKey;
}

/** Six segments of connectors and legs, three of secants and tangents; orders per spec §3.2. */
const SPECS: Readonly<Record<LinkKey, LayerSpec>> = {
  connectors: { endpoints: 12, order: 3, opacity: 0.8, colour: "soft", show: "connectors" },
  primed: { endpoints: 12, order: 4, opacity: 0.6, colour: "faint", show: "connectors" },
  legs: { endpoints: 12, order: 5, opacity: 0.9, colour: "soft", show: "triangles" },
  secants: { endpoints: 6, order: 5, opacity: 0.9, colour: "soft", show: "secants" },
  tangents: { endpoints: 6, order: 6, opacity: 1, colour: "accent", show: "tangents" },
};

const KEYS = Object.keys(SPECS) as LinkKey[];

/**
 * The lines that tie the three faces together: connectors from P to Q to R
 * (and their primed twins), the Δ-triangle legs, the secants and the tangents.
 * Every layer holds world coordinates because a connector crosses faces; the
 * geometry module lifts each endpoint off the face it lies on.
 */
export function createLinks(theme: ThemeColors): Links {
  const layers = {} as Record<LinkKey, Layer>;
  for (const key of KEYS) {
    const spec = SPECS[key];
    const layer = lineLayer(spec.endpoints, spec.order, { depth: true });
    layer.material.opacity = spec.opacity;
    layers[key] = layer;
  }
  const all = KEYS.map((key) => layers[key]);

  const group = new Group();
  group.add(...all.map((layer) => layer.object));

  function applyTheme(): void {
    for (const key of KEYS) layers[key].material.color.copy(theme[SPECS[key].colour]);
  }
  applyTheme();
  theme.addEventListener("change", applyTheme);

  return {
    group,
    layers,

    set(c: Composition, x: number, d: Derived): void {
      const segments = linkSegments(c, x, d);
      for (const key of KEYS) writeWorldSegments(layers[key], segments[key]);
    },

    setShow(show: Readonly<Record<ShowKey, boolean>>): void {
      for (const key of KEYS) layers[key].object.visible = show[SPECS[key].show];
    },

    dispose(): void {
      theme.removeEventListener("change", applyTheme);
      // Detach before the assembler's disposeObject(scene) sweep, so these
      // geometries and materials are not disposed a second time.
      group.removeFromParent();
      group.clear();
      disposeLayers(all);
    },
  };
}
