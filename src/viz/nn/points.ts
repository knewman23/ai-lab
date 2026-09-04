import { Group, InstancedMesh, Matrix4, MeshStandardMaterial, SphereGeometry } from "three";
import type { Dataset } from "../../core/math/datasets";
import type { ThemeColors } from "../types";
import { floorPoint } from "./layout";

export interface Points {
  readonly group: Group;
  /** One instance per data point; `count` follows the dataset's size. */
  readonly mesh: InstancedMesh;
  set(d: Dataset): void;
  setShow(on: boolean): void;
  dispose(): void;
}

/** Sphere radius, which is also how far a sphere stands off the floor plane so it rests on it. */
const RADIUS = 0.07;
/** The largest dataset has 60 points; the instance buffer is sized once for all three. */
const CAPACITY = 60;

/**
 * The labelled training points, as small spheres standing on the floor at their inputs: ink for
 * the +1 class, accent for −1. One InstancedMesh serves every dataset, its `count` following the
 * one currently set.
 */
export function createPoints(theme: ThemeColors): Points {
  const geometry = new SphereGeometry(RADIUS, 12, 8);
  const material = new MeshStandardMaterial({ roughness: 0.5 });
  const mesh = new InstancedMesh(geometry, material, CAPACITY);
  mesh.count = 0;
  // The auto-computed bounding sphere is fixed to whatever the instances were on the first cull
  // test and is never invalidated as `set` moves them, so culling is off (see the toolchain notes
  // and `gradient-descent/path-line.ts`); 60 instances are cheap to always draw.
  mesh.frustumCulled = false;

  const group = new Group();
  group.add(mesh);

  const scratch = new Matrix4();
  /** The last dataset set, kept so a theme change can re-colour without the assembler. */
  let last: Dataset | undefined;

  function write(d: Dataset): void {
    mesh.count = Math.min(d.points.length, CAPACITY);
    for (let i = 0; i < mesh.count; i++) {
      const point = d.points[i]!;
      const [x, y, z] = floorPoint(point.x);
      mesh.setMatrixAt(i, scratch.makeTranslation(x, y, z + RADIUS));
      mesh.setColorAt(i, point.y === 1 ? theme.ink : theme.accent);
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
  }

  function applyTheme(): void {
    if (last !== undefined) write(last);
  }
  theme.addEventListener("change", applyTheme);

  return {
    group,
    mesh,

    set(d): void {
      last = d;
      write(d);
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
      geometry.dispose();
      material.dispose();
      mesh.dispose();
    },
  };
}
