import { Vector3 } from "three";
import { BAND, FNS, Z0, type Fn1D } from "../../core/math/functions1d";
import type { FnKey } from "../../core/math/functions1d";
import type { Vec2 } from "../../core/math/numeric";
import { createSceneKit, disposeObject, prefersReducedMotion } from "../../core/scene";
import { attachDrag } from "../shared/drag";
import type { Framing } from "../shared/framing";
import { createUsageHint, type UsageHint } from "../shared/hint";
import type { Visualization, VizHost, VizInstance } from "../types";
import { createAxes } from "./axes";
import { createCurves } from "./curves";
import { frameVertical } from "./frame-vertical";
import { createTangentSecant } from "./lines";
import { createDxPanel, type DxPanel } from "./panel";
import { createPoints } from "./points";
import {
  derived,
  initialState,
  reset,
  resetZoom,
  setFn,
  setH,
  setShow,
  setX,
  zoomIn,
  type DxState,
  type ShowKey,
} from "./state";

const HINT = {
  storageKey: "ai-lab.hint.derivative",
  heading: "How to explore",
  lines: [
    "Drag the black point along the curve, or click the plane to move it.",
    "Shrink h to watch the secant become the tangent.",
    "Zoom in to see the curve straighten into its tangent.",
  ],
};

/** The point never leaves the drawn domain, whatever the pointer does. */
const X_BOUND = 3;

/** The plane every drag happens on: the scene is flat in y = 0. */
const PLANE_NORMAL = new Vector3(0, 1, 0);

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

    const axes = createAxes(host.theme);
    built.push(() => {
      axes.dispose();
    });

    const curves = createCurves(host.theme);
    built.push(() => {
      curves.dispose();
    });

    const lines = createTangentSecant(host.theme);
    built.push(() => {
      lines.dispose();
    });

    const points = createPoints(host.theme);
    built.push(() => {
      points.dispose();
    });

    kit.scene.add(axes.group, curves.group, lines.group, points.group);

    return { kit, axes, curves, lines, points, unwind };
  } catch (error) {
    unwind();
    throw error;
  }
}

function mount(host: VizHost): VizInstance {
  const { kit, axes, curves, lines, points, unwind } = buildScene(host, prefersReducedMotion());

  let state: DxState = initialState();
  let dirty = true;
  // Declared before `apply` because the panel's handlers can call `apply`
  // while the panel is still being constructed.
  let panel: DxPanel | undefined;
  // The curve buffers are resampled only when the function itself changes.
  let drawnFn: Fn1D | null = null;

  // Nothing here moves out of the plane y = 0, so the framing never changes:
  // computed once and reused by Reset view.
  const home: Framing = frameVertical();

  function goHome(): void {
    kit.camera.position.set(...home.position);
    kit.controls.target.set(...home.target);
    kit.controls.update();
  }
  goHome();

  function apply(next: DxState): void {
    state = next;
    const d = derived(state);
    const fn = FNS[state.fn];
    const s = fn.scale;

    if (fn !== drawnFn) {
      curves.setFunction(fn);
      drawnFn = fn;
    }
    curves.setZoom(fn, state.x, d.K);
    axes.setZoomed(d.K > 1);

    // Zoomed, the window is redrawn about the point, which sits at the origin.
    const [px, pz]: readonly [number, number] = d.K === 1 ? [state.x, s * d.fx] : ([0, 0] as const);

    let secantPoint: readonly [number, number] | null = null;
    if (d.secant !== null && d.secantInWindow && d.hEff !== null) {
      const h = d.hEff;
      const fxh = fn.f(state.x + h);
      secantPoint = d.K === 1 ? [state.x + h, s * fxh] : [h * d.K, s * (fxh - d.fx) * d.K];
    }

    // The zoom magnifies both display axes equally, so a slope is unchanged.
    const tangentSlope: number | "vertical" | null =
      d.d.kind === "value" ? s * d.d.v : d.d.kind === "vertical" ? "vertical" : null;

    // The band belongs to the whole domain, so it is only read at K = 1.
    const marker: readonly [number, number] | null =
      d.K === 1 && d.d.kind === "value"
        ? [state.x, clamp(Z0 + fn.primeScale * d.d.v, BAND[0], BAND[1])]
        : null;

    lines.set({
      px,
      pz,
      tangentSlope,
      secant: secantPoint === null ? null : { x: secantPoint[0], z: secantPoint[1] },
    });
    points.set([px, pz], secantPoint, marker);
    curves.setGuides(px, pz, marker === null ? null : marker[1]);
    curves.setShow({ derivative: state.show.derivative, guides: state.show.derivative });
    lines.setShow({ tangent: state.show.tangent, secant: state.show.secant });

    panel?.render(state, d);
    dirty = true;
  }

  let detachDrag: (() => void) | undefined;
  let hint: UsageHint | undefined;

  try {
    panel = createDxPanel(host.panel, {
      onFn: (key: FnKey) => apply(setFn(state, key)),
      onH: (h: number) => apply(setH(state, h)),
      onZoomIn: () => apply(zoomIn(state)),
      onResetZoom: () => apply(resetZoom(state)),
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
      hitTargets: [points.hitTarget],
      plane: { normal: PLANE_NORMAL, getOffset: () => 0 },
      // Only x is read back; the second component rides along untouched.
      clamp: (p: Vec2): Vec2 => [clamp(p[0], -X_BOUND, X_BOUND), p[1]],
      // Zoomed in, the window is pinned to the point, so moving it would fight the view.
      enabled: () => state.zoom === 0,
      surfaceTarget: points.clickPlane,
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
      lines.dispose();
      curves.dispose();
      axes.dispose();
      disposeObject(kit.scene);
      kit.dispose();
      panel?.dispose();
    },
  };
}

export const derivativeExplorer: Visualization = {
  id: "derivative-tangent",
  topic: "calculus",
  title: "Derivative & tangent",
  summary:
    "Drag a point along a curve and watch the tangent, the secant limit and the derivative curve respond; zoom in to see the curve become its tangent.",
  status: "ready",
  mount,
};
