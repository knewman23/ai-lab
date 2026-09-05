import { Group } from "three";
import type { Forward } from "../../core/math/transformer";
import { disposeLayers, type Layer, lineLayer } from "../shared/layer";
import { writeWorldSegments } from "../shared/layer-write";
import type { ThemeColors } from "../types";
import {
  pathDrawing,
  RING_ENDPOINTS,
  STEP_ENDPOINTS,
  STEPS,
  type StepKey,
} from "./residual-path-geometry";

/** One layer per step, plus the ring that marks where the token ends up. */
type PathKey = StepKey | "ring";

export interface ResidualPath {
  readonly group: Group;
  readonly layers: Readonly<Record<PathKey, Layer>>;
  /** Redraws the chain for one sequence position. */
  set(f: Forward, query: number): void;
  setShow(on: boolean): void;
  dispose(): void;
}

/** The path sits above the floor's unembedding rays, and below nothing else on the floor. */
const ORDER = 3;

const PATH_KEYS = [...STEPS, "ring"] as const satisfies readonly PathKey[];

/**
 * The selected token's vector moving through embedding space on the floor: three chained arrows
 * and a ring, colour per step so which stage moved it is never in doubt. This is what ties the
 * two surfaces together — the wall shows the pipeline's shape, this shows the same token's
 * vector actually travelling toward whichever word comes next. The chain's arithmetic, and its
 * refusal to normalise the two deltas, are `residual-path-geometry.ts`'s.
 */
export function createResidualPath(theme: ThemeColors): ResidualPath {
  const step = (): Layer => lineLayer(STEP_ENDPOINTS, ORDER, { depth: true });
  const layers: Readonly<Record<PathKey, Layer>> = {
    position: step(),
    attention: step(),
    mlp: step(),
    ring: lineLayer(RING_ENDPOINTS, ORDER, { depth: true }),
  };

  const group = new Group();
  for (const key of PATH_KEYS) group.add(layers[key].object);

  function applyTheme(): void {
    layers.position.material.color.copy(theme.soft);
    layers.attention.material.color.copy(theme.accent);
    layers.mlp.material.color.copy(theme.ink);
    layers.ring.material.color.copy(theme.ink);
  }
  applyTheme();
  theme.addEventListener("change", applyTheme);

  return {
    group,
    layers,

    set(f, query): void {
      const { arrows, ring } = pathDrawing(f, query);
      for (let s = 0; s < STEPS.length; s++) {
        const key = STEPS[s];
        const arrow = arrows[s];
        if (key === undefined || arrow === undefined) {
          throw new Error(`gpt residual path: no arrow for step ${s}`);
        }
        // Through `commit`, so a zero-length step hides rather than drawing zero vertices.
        writeWorldSegments(layers[key], arrow);
      }
      writeWorldSegments(layers.ring, ring);
    },

    setShow(on): void {
      group.visible = on;
    },

    dispose(): void {
      theme.removeEventListener("change", applyTheme);
      // Detach before the assembler's disposeObject(scene) sweep, so these
      // geometries and materials are not disposed a second time.
      group.removeFromParent();
      group.clear();
      disposeLayers(PATH_KEYS.map((key) => layers[key]));
    },
  };
}
