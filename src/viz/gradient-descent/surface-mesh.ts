import {
  BufferAttribute,
  Color,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
} from "three";
import { disposeObject } from "../../core/scene";
import type { Surface } from "../../core/math/surfaces";
import type { ThemeColors } from "../types";

/** Sampled display-space heights, row-major as `heights[j * nx + i]`. */
export interface SurfaceGrid {
  readonly heights: Float32Array;
  readonly nx: number;
  readonly ny: number;
  readonly heightRange: readonly [number, number];
}

export interface SurfaceMesh {
  readonly group: Group;
  setSurface(surface: Surface): SurfaceGrid;
  dispose(): void;
}

const SEGMENTS = 128;
const NX = SEGMENTS + 1;
const NY = SEGMENTS + 1;

/**
 * The loss surface: one 128x128 plane whose positions and vertex colours are
 * rewritten in place per surface, plus a faint wireframe sharing the geometry.
 *
 * PlaneGeometry lays vertices out row-major as `ix + NX * iy`, so grid index
 * `j * NX + i` addresses the same vertex. Mapping `j` to increasing y (the
 * plane maps it to decreasing y) reverses triangle winding, so the computed
 * normals are negated back to point up.
 */
export function createSurfaceMesh(theme: ThemeColors): SurfaceMesh {
  const geometry = new PlaneGeometry(1, 1, SEGMENTS, SEGMENTS);
  const count = NX * NY;

  const colors = new Float32Array(count * 3);
  geometry.setAttribute("color", new BufferAttribute(colors, 3));

  const solid = new MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.85,
    metalness: 0,
    side: DoubleSide,
    // Push the faces back so the shared-geometry wireframe stays on top.
    polygonOffset: true,
    polygonOffsetFactor: 1,
    polygonOffsetUnits: 1,
  });
  const wireMaterial = new MeshBasicMaterial({
    wireframe: true,
    transparent: true,
    opacity: 0.25,
    depthWrite: false,
  });
  wireMaterial.color.copy(theme.line);

  const surfaceMesh = new Mesh(geometry, solid);
  const wireMesh = new Mesh(geometry, wireMaterial);
  wireMesh.renderOrder = 1;

  const group = new Group();
  group.add(surfaceMesh, wireMesh);

  // Normalised heights in [0, 1], kept so a theme change recolours without
  // re-evaluating f.
  const t = new Float32Array(count);
  const scratch = new Color();

  function recolour(): void {
    for (let v = 0; v < count; v++) {
      scratch.lerpColors(theme.sunken, theme.accent, t[v]!);
      colors[v * 3] = scratch.r;
      colors[v * 3 + 1] = scratch.g;
      colors[v * 3 + 2] = scratch.b;
    }
    geometry.getAttribute("color").needsUpdate = true;
  }

  function onThemeChange(): void {
    recolour();
    wireMaterial.color.copy(theme.line);
  }
  theme.addEventListener("change", onThemeChange);

  recolour();

  return {
    group,

    setSurface(surface: Surface): SurfaceGrid {
      const [x0, x1] = surface.domain.x;
      const [y0, y1] = surface.domain.y;
      const dx = (x1 - x0) / SEGMENTS;
      const dy = (y1 - y0) / SEGMENTS;

      const position = geometry.getAttribute("position");
      const heights = new Float32Array(count);
      let min = Infinity;
      let max = -Infinity;

      for (let j = 0; j < NY; j++) {
        const y = y0 + j * dy;
        for (let i = 0; i < NX; i++) {
          const x = x0 + i * dx;
          const z = surface.scale * surface.f(x, y);
          const v = j * NX + i;
          heights[v] = z;
          if (z < min) min = z;
          if (z > max) max = z;
          position.setXYZ(v, x, y, z);
        }
      }

      const span = max - min;
      for (let v = 0; v < count; v++) t[v] = span > 0 ? (heights[v]! - min) / span : 0;

      position.needsUpdate = true;
      geometry.computeVertexNormals();
      const normal = geometry.getAttribute("normal");
      const normals = normal.array as Float32Array;
      for (let n = 0; n < normals.length; n++) normals[n] = -normals[n]!;
      normal.needsUpdate = true;
      geometry.computeBoundingSphere();
      recolour();

      return { heights, nx: NX, ny: NY, heightRange: [min, max] };
    },

    dispose(): void {
      theme.removeEventListener("change", onThemeChange);
      disposeObject(group);
      group.clear();
    },
  };
}
