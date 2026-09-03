import { Vector3 } from "three";
import { DOMAIN, type CompKey } from "../../core/math/compositions";
import type { Vec2 } from "../../core/math/numeric";
import { createSceneKit, disposeObject, prefersReducedMotion } from "../../core/scene";
import { attachDrag } from "../shared/drag";
import type { Framing } from "../shared/framing";
import { createUsageHint, type UsageHint } from "../shared/hint";
import type { Visualization, VizHost, VizInstance } from "../types";
import { createCurves } from "./curves";
import { createFaces } from "./faces";
import { frameCorner } from "./frame-corner";
import { createLinks } from "./links";
import { facePoints } from "./links-geometry";
import { createChainPanel, type ChainPanel } from "./panel";
import { createPoints } from "./points";
import {
  derived,
  initialState,
  reset,
  setComp,
  setDx,
  setShow,
  setX,
  type ChainState,
  type ShowKey,
} from "./state";

const HINT = {
  storageKey: "ai-lab.hint.chain-rule",
  heading: "How to explore",
  lines: [
    "Drag the black point on the front wall or the floor, or click the wall to move it.",
    "Shrink Δx to watch the three secants become tangents.",
    "Orbit to see the Δu leg shared by both walls.",
  ],
};

/** P lives on the front wall, the plane y = 0. */
const WALL_NORMAL = new Vector3(0, 1, 0);
/** R lives on the floor, the plane z = 0. */
const FLOOR_NORMAL = new Vector3(0, 0, 1);
/** Index of R in the drag's hit targets; P is 0. */
const R_INDEX = 1;

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

/**
 * Builds the scene-side objects. If any one of them throws, the ones already
 * built are disposed in reverse order before the error is rethrown, so a
 * half-finished mount never leaks GPU resources. The returned `unwind` lets
 * the caller do the same for a failure later in the mount.
 */
function buildScene(host: VizHost, reducedMotion: boolean) {
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

    const faces = createFaces(host.theme);
    built.push(() => {
      faces.dispose();
    });

    const curves = createCurves(host.theme);
    built.push(() => {
      curves.dispose();
    });

    const links = createLinks(host.theme);
    built.push(() => {
      links.dispose();
    });

    const points = createPoints(host.theme);
    built.push(() => {
      points.dispose();
    });

    kit.scene.add(faces.group, curves.group, links.group, points.group);

    return { kit, faces, curves, links, points, unwind };
  } catch (error) {
    unwind();
    throw error;
  }
}

function mount(host: VizHost): VizInstance {
  const { kit, faces, curves, links, points, unwind } = buildScene(host, prefersReducedMotion());

  let state: ChainState = initialState();
  let dirty = true;
  // Declared before `apply` because the panel's handlers can call `apply`
  // while the panel is still being constructed.
  let panel: ChainPanel | undefined;

  // The three faces never move, so the framing never changes: computed once
  // and reused by Reset view.
  const home: Framing = frameCorner();

  function goHome(): void {
    kit.camera.position.set(...home.position);
    kit.controls.target.set(...home.target);
    kit.controls.update();
  }
  goHome();

  function apply(next: ChainState): void {
    state = next;
    const d = derived(state);

    // Resamples only when the composition itself changes.
    curves.setComposition(d.comp);
    const fp = facePoints(d.comp, state.x, d);
    points.set(fp, d.showPrimed ? fp.primed : null);
    links.set(d.comp, state.x, d);
    // The layers start visible and tangents default to off, so this is not optional.
    links.setShow(state.show);

    panel?.render(state, d);
    dirty = true;
  }

  let detachDrag: (() => void) | undefined;
  let hint: UsageHint | undefined;

  try {
    panel = createChainPanel(host.panel, {
      onComp: (key: CompKey) => apply(setComp(state, key)),
      onDx: (dx: number) => apply(setDx(state, dx)),
      onReset: () => apply(reset(state)),
      onResetView: () => {
        goHome();
        dirty = true;
      },
      onShow: (key: ShowKey, on: boolean) => apply(setShow(state, key, on)),
    });

    hint = createUsageHint(host.canvasContainer, HINT);

    detachDrag = attachDrag({
      canvas: host.renderer.domElement,
      camera: kit.camera,
      controls: kit.controls,
      hitTargets: [points.hitP, points.hitR],
      // P drags on the front wall, R on the floor; both planes pass through the origin.
      plane: {
        normal: (index: number) => (index === R_INDEX ? FLOOR_NORMAL : WALL_NORMAL),
        getOffset: () => 0,
      },
      // Only x is read back; the second component rides along untouched.
      clamp: (p: Vec2): Vec2 => [clamp(p[0], DOMAIN[0], DOMAIN[1]), p[1]],
      surfaceTarget: faces.front,
      onDrag: (_index: number, p: Vec2) => {
        // The first move of the point is proof the hint has been read.
        hint?.hide();
        apply(setX(state, p[0]));
      },
    });
  } catch (error) {
    hint?.dispose();
    panel?.dispose();
    unwind();
    throw error;
  }

  function onThemeChange(): void {
    dirty = true;
  }
  host.theme.addEventListener("change", onThemeChange);

  apply(state);

  return {
    update(dt: number): boolean {
      // Damping keeps the camera moving for a moment after the pointer stops.
      const moved = kit.controls.update(dt);
      if (!dirty && !moved) return false;
      host.renderer.render(kit.scene, kit.camera);
      dirty = false;
      return true;
    },

    resize(w: number, h: number): void {
      kit.camera.aspect = w / h;
      kit.camera.updateProjectionMatrix();
      dirty = true;
    },

    dispose(): void {
      host.theme.removeEventListener("change", onThemeChange);
      detachDrag?.();
      hint?.dispose();
      // Scene objects first, then the panel: DOM teardown is independent of GPU
      // teardown, and this matches the other scenes' order.
      points.dispose();
      links.dispose();
      curves.dispose();
      faces.dispose();
      disposeObject(kit.scene);
      kit.dispose();
      panel?.dispose();
    },
  };
}

export const chainRuleGraph: Visualization = {
  id: "chain-rule-graph",
  topic: "calculus",
  title: "Chain rule graph",
  summary:
    "Drag x along a composed function and watch a small Δx become Δu on the front wall, then Δy on the side wall and the floor: the three slopes multiply.",
  status: "ready",
  mount,
};
