import { Group } from "three";
import { disposeLayers, type Layer, lineLayer, type Segment } from "../shared/layer";
import { writeWorldSegments } from "../shared/layer-write";
import type { ThemeColors } from "../types";
import { BAND_Z, type BandKey, WALL_W } from "./layout";
import type { StageKey } from "./state";

export interface WallBands {
  readonly group: Group;
  /** One layer per band, so each carries its own opacity; read by tests. */
  readonly layers: Readonly<Record<BandKey, Layer>>;
  /** Lights the band the focused stage belongs to and dims the rest; `all` lights every band. */
  setFocus(stage: StageKey): void;
  dispose(): void;
}

/**
 * Toward the camera, which looks at the wall from −y: the guide lines sit just off the plane
 * rather than in it. `shared/lift.ts` is no help here — its `FACES.front` lift points the other
 * way, as `nn/layout.ts` notes for the same wall-and-floor arrangement.
 */
const LIFT = -0.01;

/** What a band out of focus drops to. Full is 1, so this is the whole of the spec's 0.25. */
export const DIM_OPACITY = 0.25;

/**
 * Which band each focusable stage belongs to. The three attention stages — raw scores, the
 * softmax, the weighted sum — all happen on the attention band, so all three light it.
 */
const FOCUS_BAND: Readonly<Record<Exclude<StageKey, "all">, BandKey>> = {
  embed: "embed",
  scores: "attention",
  softmax: "attention",
  weighted: "attention",
  residual: "residual",
  mlp: "mlp",
  logits: "logits",
};

const BANDS = Object.keys(BAND_Z) as readonly BandKey[];

/** The horizontal guide line of one band, spanning the wall's full width. */
function bandLine(band: BandKey): Segment {
  const z = BAND_Z[band];
  return [
    [-WALL_W / 2, LIFT, z],
    [WALL_W / 2, LIFT, z],
  ];
}

/**
 * The five stage bands: horizontal guide lines across the wall at the band heights, in `--soft`
 * because `--line` is near-invisible on the translucent wall. Focus is per band and so is the
 * material, one layer each; the lines themselves never move, so `setFocus` only touches opacity.
 */
export function createWallBands(theme: ThemeColors): WallBands {
  const layers = Object.fromEntries(
    BANDS.map((band, i) => [band, lineLayer(2, 1 + i, { depth: true })]),
  ) as Record<BandKey, Layer>;

  const group = new Group();
  for (const band of BANDS) {
    const layer = layers[band];
    writeWorldSegments(layer, [bandLine(band)]);
    group.add(layer.object);
  }

  function applyTheme(): void {
    for (const band of BANDS) layers[band].material.color.copy(theme.soft);
  }
  applyTheme();
  theme.addEventListener("change", applyTheme);

  return {
    group,
    layers,

    setFocus(stage): void {
      const focus = stage === "all" ? null : FOCUS_BAND[stage];
      for (const band of BANDS) {
        layers[band].material.opacity = focus === null || focus === band ? 1 : DIM_OPACITY;
      }
    },

    dispose(): void {
      theme.removeEventListener("change", applyTheme);
      // Detach before the assembler's disposeObject(scene) sweep, so these
      // geometries and materials are not disposed a second time.
      group.removeFromParent();
      group.clear();
      disposeLayers(BANDS.map((band) => layers[band]));
    },
  };
}
