import { Group } from "three";
import type { Composition } from "../../core/math/compositions";
import type { ThemeColors } from "../types";
import { disposeLayers, type Layer, lineLayer } from "../shared/layer";
import { writeWorldSegments } from "../shared/layer-write";
import { linkSegments } from "./links-geometry";
import type { Derived, ShowKey } from "./state";

export interface Links {
  readonly group: Group;
  /** The five world layers, keyed by what they draw; read by tests. */
  readonly layers: {
    readonly connectors: Layer;
    readonly primed: Layer;
    readonly legs: Layer;
    readonly secants: Layer;
    readonly tangents: Layer;
  };
  /** Rewrites every layer for a state. */
  set(c: Composition, x: number, d: Derived): void;
  /** Shows or hides layers by overlay toggle; "connectors" covers both connector layers. */
  setShow(show: Readonly<Record<ShowKey, boolean>>): void;
  dispose(): void;
}

/** Endpoint capacities: six segments of connectors and legs, three of secants and tangents. */
const CONNECTOR_ENDPOINTS = 12;
const LEG_ENDPOINTS = 12;
const LINE_ENDPOINTS = 6;

/**
 * The lines that tie the three faces together: connectors from P to Q to R
 * (and their primed twins), the Δ-triangle legs, the secants and the tangents.
 * Every layer holds world coordinates because a connector crosses faces; the
 * geometry module lifts each endpoint off the face it lies on.
 */
export function createLinks(theme: ThemeColors): Links {
  const connectors = lineLayer(CONNECTOR_ENDPOINTS, 3, { depth: true });
  const primed = lineLayer(CONNECTOR_ENDPOINTS, 4, { depth: true });
  const legs = lineLayer(LEG_ENDPOINTS, 5, { depth: true });
  const secants = lineLayer(LINE_ENDPOINTS, 5, { depth: true });
  const tangents = lineLayer(LINE_ENDPOINTS, 6, { depth: true });
  const layers = { connectors, primed, legs, secants, tangents };
  const all = [connectors, primed, legs, secants, tangents];

  connectors.material.opacity = 0.8;
  primed.material.opacity = 0.6;
  legs.material.opacity = 0.9;
  secants.material.opacity = 0.9;

  const group = new Group();
  group.add(...all.map((layer) => layer.object));

  function applyTheme(): void {
    connectors.material.color.copy(theme.soft);
    primed.material.color.copy(theme.faint);
    legs.material.color.copy(theme.soft);
    secants.material.color.copy(theme.soft);
    tangents.material.color.copy(theme.accent);
  }
  applyTheme();
  theme.addEventListener("change", applyTheme);

  return {
    group,
    layers,

    set(c: Composition, x: number, d: Derived): void {
      const segments = linkSegments(c, x, d);
      writeWorldSegments(connectors, segments.connectors);
      writeWorldSegments(primed, segments.primed);
      writeWorldSegments(legs, segments.legs);
      writeWorldSegments(secants, segments.secants);
      writeWorldSegments(tangents, segments.tangents);
    },

    setShow(show: Readonly<Record<ShowKey, boolean>>): void {
      connectors.object.visible = show.connectors;
      primed.object.visible = show.connectors;
      legs.object.visible = show.triangles;
      secants.object.visible = show.secants;
      tangents.object.visible = show.tangents;
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
