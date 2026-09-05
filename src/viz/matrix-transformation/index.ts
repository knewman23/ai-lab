import { createSceneKit, disposeObject, prefersReducedMotion } from "../../core/scene";
import type { Vec2 } from "../../core/math/numeric";
import { attachDrag } from "../shared/drag";
import { frameFor, type Framing } from "../shared/framing";
import { createUsageHint, type UsageHint } from "../shared/hint";
import type { Visualization, VizHost, VizInstance } from "../types";
import { createBasis } from "./basis";
import { createEigenLines } from "./eigen-lines";
import { createPlane } from "./plane";
import { createMtPanel, type MtControlId, type MtPanel } from "./panel";
import { createWalkthrough } from "../shared/walkthrough";
import { MT_STEPS, MT_WALKTHROUGH_TITLE } from "./walkthrough";
import type { PresetKey } from "./presets";
import {
  derived,
  dragBasis,
  initialState,
  reset,
  setEntry,
  setPreset,
  setShow,
  setT,
  type MtState,
  type ShowKey,
  ENTRY_BOUND,
} from "./state";

const HINT = {
  storageKey: "ai-lab.hint.matrix-transformation",
  heading: "How to explore",
  lines: [
    "Drag the tips of the two arrows to change the matrix, or type the entries.",
    "Drag the background to orbit; scroll to zoom; right-drag (or two fingers) to pan.",
    "Slide Animate below 1 to watch the plane deform from the identity.",
  ],
};

/** The scene is drawn over [-5, 5] in both axes, flat at z = 0. */
const DOMAIN = { x: [-5, 5], y: [-5, 5] } as const;
const FLAT: readonly [number, number] = [0, 0];

/** The bound the state reducer clamps matrix entries to; mirrored here so a drag never overshoots. */

function clamp3(v: number): number {
  return Math.min(ENTRY_BOUND, Math.max(-ENTRY_BOUND, v));
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

    const plane = createPlane(host.theme);
    built.push(() => {
      plane.dispose();
    });

    const basis = createBasis(host.theme);
    built.push(() => {
      basis.dispose();
    });

    const eigen = createEigenLines(host.theme);
    built.push(() => {
      eigen.dispose();
    });

    kit.scene.add(plane.group, basis.group, eigen.group);

    return { kit, plane, basis, eigen, unwind };
  } catch (error) {
    unwind();
    throw error;
  }
}

function mount(host: VizHost): VizInstance {
  const { kit, plane, basis, eigen, unwind } = buildScene(host, prefersReducedMotion());

  let state: MtState = initialState();
  let dirty = true;
  // Declared before `apply` because the panel's handlers can call `apply`
  // while the panel is still being constructed.
  let panel: MtPanel | undefined;

  // The plane is flat, so its framing never changes: computed once and reused
  // by Reset view.
  const home: Framing = frameFor(DOMAIN, FLAT);

  function goHome(): void {
    kit.camera.position.set(...home.position);
    kit.controls.target.set(...home.target);
    kit.controls.update();
  }
  goHome();

  function apply(next: MtState): void {
    state = next;
    const d = derived(state);

    plane.setMatrix(d.mt, d.detMt);
    plane.setShow({ grid: state.show.grid, ghost: state.show.ghost });
    basis.setMatrix(d.mt);
    // Mid-animation the arrows show M(t), which is not the matrix being
    // edited, so grabbing them would write a value the visitor did not aim for.
    basis.setDraggable(state.t === 1);
    eigen.set(d.eigen, state.t);
    eigen.setVisible(state.show.eigen);

    panel?.render(state, d);
    dirty = true;
  }

  let detachDrag: (() => void) | undefined;
  let hint: UsageHint | undefined;

  try {
    panel = createMtPanel(host.panel, {
      onPreset: (key: PresetKey) => apply(setPreset(state, key)),
      onEntry: (i: 0 | 1 | 2 | 3, v: number) => apply(setEntry(state, i, v)),
      onT: (t: number) => apply(setT(state, t)),
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
      hitTargets: basis.hitTargets,
      // Everything here lives on the z = 0 plane.
      getPlaneZ: () => 0,
      clamp: (p: Vec2): Vec2 => [clamp3(p[0]), clamp3(p[1])],
      enabled: () => state.t === 1,
      onDrag: (index: number, p: Vec2) => {
        // The first move of an arrow is proof the hint has been read.
        hint?.hide();
        if (index === 0 || index === 1) apply(dragBasis(state, index, p));
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

  const walkthrough = createWalkthrough<MtState, MtControlId>({
    title: MT_WALKTHROUGH_TITLE,
    steps: MT_STEPS,
    initial: initialState,
    apply,
    focus: (id) => panel?.focus(id),
    frame: () => {
      goHome();
    },
  });

  return {
    walkthrough,

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
      // teardown, and this matches the gradient scene's order.
      eigen.dispose();
      basis.dispose();
      plane.dispose();
      disposeObject(kit.scene);
      kit.dispose();
      panel?.dispose();
    },
  };
}

export const matrixTransformation: Visualization = {
  id: "matrix-transformation",
  topic: "linear-algebra",
  title: "Matrix transformation",
  summary:
    "Drag the two basis vectors and watch the plane, the unit square, the determinant and the eigenvectors respond.",
  status: "ready",
  mount,
};
