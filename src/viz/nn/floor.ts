import {
  BufferAttribute,
  Color,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
} from "three";
import { disposeLayers, type Layer, lineLayer, type Segment, type Vec3 } from "../shared/layer";
import { writeWorldSegments } from "../shared/layer-write";
import type { ThemeColors } from "../types";
import { FLOOR_CY, FLOOR_SIZE } from "./layout";

export interface Floor {
  readonly group: Group;
  /** The vertex-coloured plane the decision boundary is painted on. */
  readonly mesh: Mesh;
  /** Repaints from a `boundaryGrid`: `n × n` outputs, row-major `ix + n·iy` with y increasing. */
  set(grid: Float32Array): void;
  setShow(on: boolean): void;
  dispose(): void;
}

/** Samples per axis, matching `boundaryGrid`'s default: 39 segments, 40 vertices a side. */
const N = 40;
const COUNT = N * N;

/** Opacity with the boundary shown, and the faint wash it drops to when hidden. */
const SHOWN_OPACITY = 0.85;
const HIDDEN_OPACITY = 0.18;

/** Lift the outline toward +z, the camera side of the floor, so the plane does not z-fight it. */
const LIFT_Z = 0.01;

/** The floor's four edges in world space. */
function outlineSegments(): readonly Segment[] {
  const h = FLOOR_SIZE / 2;
  const corners: readonly Vec3[] = [
    [-h, FLOOR_CY - h, LIFT_Z],
    [h, FLOOR_CY - h, LIFT_Z],
    [h, FLOOR_CY + h, LIFT_Z],
    [-h, FLOOR_CY + h, LIFT_Z],
  ];
  return corners.map((c, i) => [c, corners[(i + 1) % corners.length]!] as const);
}

/**
 * The input domain [−3, 3]² as a flat square in the plane z = 0, painted with the network's
 * decision boundary: accent at −1, the page background at 0, ink at +1.
 *
 * `PlaneGeometry` lies in the XY plane already, so it needs no rotation here; it lays its vertices
 * out row-major as `ix + N·iy` with `iy` running along *decreasing* y, while `boundaryGrid` runs
 * along increasing y. Geometry vertex `ix + N·iy` therefore takes grid entry `ix + N·(N − 1 − iy)`,
 * the same mirror `gradient-descent/surface-mesh.ts` documents.
 */
export function createFloor(theme: ThemeColors): Floor {
  const geometry = new PlaneGeometry(FLOOR_SIZE, FLOOR_SIZE, N - 1, N - 1);
  const colors = new Float32Array(COUNT * 3);
  geometry.setAttribute("color", new BufferAttribute(colors, 3));

  const material = new MeshBasicMaterial({
    vertexColors: true,
    transparent: true,
    opacity: SHOWN_OPACITY,
    side: DoubleSide,
  });
  const mesh = new Mesh(geometry, material);
  mesh.position.set(0, FLOOR_CY, 0);
  mesh.renderOrder = 0;

  const segments = outlineSegments();
  const outline: Layer = lineLayer(segments.length * 2, 0, { depth: true });
  writeWorldSegments(outline, segments);

  const group = new Group();
  group.add(mesh, outline.object);

  const scratch = new Color();
  /** The last grid set, kept so `setShow` and a theme change can repaint without the assembler. */
  let lastGrid: Float32Array | undefined;
  let shown = true;

  function writeVertex(v: number): void {
    colors[v * 3] = scratch.r;
    colors[v * 3 + 1] = scratch.g;
    colors[v * 3 + 2] = scratch.b;
  }

  /** A two-segment lerp accent → bg → ink at t = (value + 1) / 2. */
  function colourFor(value: number): Color {
    const t = (value + 1) / 2;
    if (t <= 0.5) return scratch.lerpColors(theme.accent, theme.bg, t * 2);
    return scratch.lerpColors(theme.bg, theme.ink, (t - 0.5) * 2);
  }

  function repaint(): void {
    if (lastGrid === undefined) return;
    for (let iy = 0; iy < N; iy++) {
      for (let ix = 0; ix < N; ix++) {
        colourFor(lastGrid[ix + N * (N - 1 - iy)] ?? 0);
        writeVertex(ix + N * iy);
      }
    }
    geometry.getAttribute("color").needsUpdate = true;
  }

  function wash(): void {
    scratch.copy(theme.faint);
    for (let v = 0; v < COUNT; v++) writeVertex(v);
    geometry.getAttribute("color").needsUpdate = true;
  }

  function applyTheme(): void {
    outline.material.color.copy(theme.line);
    if (shown) repaint();
    else wash();
  }
  applyTheme();
  theme.addEventListener("change", applyTheme);

  return {
    group,
    mesh,

    set(grid): void {
      lastGrid = grid;
      if (shown) repaint();
    },

    setShow(on): void {
      shown = on;
      material.opacity = on ? SHOWN_OPACITY : HIDDEN_OPACITY;
      if (on) repaint();
      else wash();
    },

    dispose(): void {
      theme.removeEventListener("change", applyTheme);
      // Detach before the assembler's disposeObject(scene) sweep, so these
      // geometries and materials are not disposed a second time.
      group.removeFromParent();
      group.clear();
      geometry.dispose();
      material.dispose();
      disposeLayers([outline]);
    },
  };
}
