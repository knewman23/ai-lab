import {
  BufferAttribute,
  Color,
  DynamicDrawUsage,
  Group,
  InstancedMesh,
  Line,
  LineBasicMaterial,
  BufferGeometry,
  Matrix4,
  MeshBasicMaterial,
  Object3D,
  SphereGeometry,
} from "three";
import { disposeObject } from "../../core/scene";
import type { RingBuffer } from "../../core/math/ring-buffer";
import type { Vec2 } from "../../core/math/numeric";
import type { Surface } from "../../core/math/surfaces";
import type { ThemeColors } from "../types";

export interface PathLine {
  readonly group: Group;
  sync(surface: Surface, path: RingBuffer<Vec2>): void;
  setVisible(on: boolean): void;
  dispose(): void;
}

/**
 * A polyline of every point visited since the last reset, fading from
 * `--faint` (old) to `--accent` (recent), with a small sphere marking each
 * step. Both the line and the step markers are preallocated to `capacity`
 * and only their draw range / instance count grow as the path fills.
 */
export function createPathLine(theme: ThemeColors, capacity = 2000): PathLine {
  const geometry = new BufferGeometry();
  const positions = new Float32Array(capacity * 3);
  const colors = new Float32Array(capacity * 3);
  const positionAttr = new BufferAttribute(positions, 3).setUsage(DynamicDrawUsage);
  const colorAttr = new BufferAttribute(colors, 3).setUsage(DynamicDrawUsage);
  geometry.setAttribute("position", positionAttr);
  geometry.setAttribute("color", colorAttr);
  geometry.setDrawRange(0, 0);

  const lineMaterial = new LineBasicMaterial({ vertexColors: true });
  const line = new Line(geometry, lineMaterial);

  const sphereGeometry = new SphereGeometry(0.03, 8, 6);
  const sphereMaterial = new MeshBasicMaterial({ vertexColors: false });
  const steps = new InstancedMesh(sphereGeometry, sphereMaterial, capacity);
  steps.count = 0;

  const group = new Group();
  group.add(line, steps);

  const scratchMatrix = new Matrix4();
  const scratchObject = new Object3D();
  const scratchColor = new Color();

  // Kept so a theme "change" can recolour without a fresh surface/path.
  let lastSurface: Surface | undefined;
  let lastPath: RingBuffer<Vec2> | undefined;

  function recolour(surface: Surface, path: RingBuffer<Vec2>): void {
    const n = Math.min(path.size, capacity);
    path.forEach((p, age, i) => {
      if (i >= n) return;
      const [x, y] = p;
      const z = surface.scale * surface.f(x, y) + 0.01;
      scratchColor.lerpColors(theme.faint, theme.accent, age);

      positions[i * 3] = x;
      positions[i * 3 + 1] = y;
      positions[i * 3 + 2] = z;
      colors[i * 3] = scratchColor.r;
      colors[i * 3 + 1] = scratchColor.g;
      colors[i * 3 + 2] = scratchColor.b;

      scratchObject.position.set(x, y, z);
      scratchObject.updateMatrix();
      scratchMatrix.copy(scratchObject.matrix);
      steps.setMatrixAt(i, scratchMatrix);
      steps.setColorAt(i, scratchColor);
    });

    positionAttr.needsUpdate = true;
    colorAttr.needsUpdate = true;
    steps.instanceMatrix.needsUpdate = true;
    if (steps.instanceColor) steps.instanceColor.needsUpdate = true;
    geometry.setDrawRange(0, n);
    steps.count = n;
    geometry.computeBoundingSphere();
  }

  function onThemeChange(): void {
    if (lastSurface && lastPath) recolour(lastSurface, lastPath);
  }
  theme.addEventListener("change", onThemeChange);

  return {
    group,

    sync(surface: Surface, path: RingBuffer<Vec2>): void {
      lastSurface = surface;
      lastPath = path;
      recolour(surface, path);
    },

    setVisible(on: boolean): void {
      group.visible = on;
    },

    dispose(): void {
      theme.removeEventListener("change", onThemeChange);
      disposeObject(group);
      steps.dispose();
      group.clear();
    },
  };
}
