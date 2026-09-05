/**
 * Building the scene-side half of the GPT visualization, and unwinding it again. Lifted out of
 * `index.ts` because the assembler's two jobs — standing the objects up, and then running them
 * against the state — read better apart than the ~350 lines they came to together.
 */

import { Group } from "three";
import { createSceneKit, disposeObject } from "../../core/scene";
import { createLabelLayer, type LabelLayer } from "../shared/labels";
import { createWall } from "../shared/wall";
import type { VizHost } from "../types";
import { createArcs } from "./arcs";
import { createBars } from "./bars";
import { createColumnHits } from "./column-pick";
import { createColumns } from "./columns";
import { createFloorEmbed } from "./floor-embed";
import { labelRank } from "./label-rank";
import { WALL_H, WALL_OPACITY, WALL_W } from "./layout";
import { createResidualPath } from "./residual-path";
import { createWallBands } from "./wall-bands";

/** Everything a mounted GPT scene holds on the GPU side, plus the overlay pinned over it. */
export interface GptScene {
  readonly kit: ReturnType<typeof createSceneKit>;
  readonly wall: ReturnType<typeof createWall>;
  readonly floor: ReturnType<typeof createFloorEmbed>;
  readonly bands: ReturnType<typeof createWallBands>;
  readonly columns: ReturnType<typeof createColumns>;
  readonly arcs: ReturnType<typeof createArcs>;
  readonly bars: ReturnType<typeof createBars>;
  readonly path: ReturnType<typeof createResidualPath>;
  readonly hits: ReturnType<typeof createColumnHits>;
  readonly labels: LabelLayer;
  /** Tears the whole of the above down in reverse, for a failure later in the mount. */
  readonly unwind: () => void;
}

/**
 * Builds the scene-side objects. If any one of them throws, the ones already built are disposed
 * in reverse order before the error is rethrown, so a half-finished mount never leaks GPU
 * resources. The returned `unwind` lets the caller do the same for a failure later in the mount.
 */
export function buildScene(host: VizHost, reducedMotion: boolean): GptScene {
  const built: Array<() => void> = [];
  const unwind = (): void => {
    for (let i = built.length - 1; i >= 0; i -= 1) built[i]?.();
  };

  try {
    const kit = createSceneKit(host.renderer, host.theme, { reducedMotion });
    built.push(() => {
      disposeObject(kit.scene);
      kit.dispose();
    });

    const wall = createWall(host.theme, { width: WALL_W, height: WALL_H, opacity: WALL_OPACITY });
    built.push(() => {
      wall.dispose();
    });

    const floor = createFloorEmbed(host.theme);
    built.push(() => {
      floor.dispose();
    });

    const bands = createWallBands(host.theme);
    built.push(() => {
      bands.dispose();
    });

    const columns = createColumns(host.theme);
    built.push(() => {
      columns.dispose();
    });

    const arcs = createArcs(host.theme);
    built.push(() => {
      arcs.dispose();
    });

    const bars = createBars(host.theme);
    built.push(() => {
      bars.dispose();
    });

    const path = createResidualPath(host.theme);
    built.push(() => {
      path.dispose();
    });

    // The column pick volumes get a group of their own rather than joining the columns': the
    // drag raycasts the floor recursively for click-to-place, and an invisible box anywhere
    // under a raycast surface swallows the hit it was meant to find.
    const hits = createColumnHits();
    const hitGroup = new Group();
    hitGroup.add(...hits.targets);
    built.push(() => {
      hitGroup.removeFromParent();
      hitGroup.clear();
      hits.dispose();
    });

    // Before the hint, so the hint is the later sibling and paints on top.
    // Ranked, so the overlay's five families give way to each other rather than overprint.
    const labels = createLabelLayer(host.canvasContainer, { rank: labelRank });
    built.push(() => {
      labels.dispose();
    });

    kit.scene.add(
      wall.group,
      floor.group,
      bands.group,
      columns.group,
      arcs.group,
      bars.group,
      path.group,
      hitGroup,
    );

    return { kit, wall, floor, bands, columns, arcs, bars, path, hits, labels, unwind };
  } catch (error) {
    unwind();
    throw error;
  }
}
