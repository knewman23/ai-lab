import {
  BufferAttribute,
  BufferGeometry,
  Group,
  Line,
  LineBasicMaterial,
  Mesh,
  MeshStandardMaterial,
  SphereGeometry,
} from "three";
import type { Eigen } from "../../core/math/matrix2";
import { clipSegment } from "../../core/math/matrix2";
import type { Vec2 } from "../../core/math/numeric";
import type { ThemeColors } from "../types";

export interface EigenLines {
  readonly group: Group;
  set(eigen: Eigen, t: number): void;
  setVisible(on: boolean): void;
  dispose(): void;
}

const SPHERE_RADIUS = 0.06;
const LINE_ORDER = 3;
const SPHERE_ORDER = 10;
/** Half-length of the pre-clip segment: long enough to cross any usable bound. */
const REACH = 10;
const ZERO = 1e-6;
const INDICES = [0, 1] as const;

/**
 * The eigen lines of M and the spheres at λ(t)·v, where M(t) sends each unit
 * eigenvector. M(t) = (1 − t)I + tM shares M's eigenvectors, so the lines are
 * computed from M once and stay correct as t moves.
 *
 * Both lines and both spheres are allocated up front and toggled with
 * `visible`; a matrix with one eigen pair, or none, simply leaves the spares
 * hidden. `setVisible` is the overlay toggle and composes with that: nothing is
 * shown while it is off.
 */
export function createEigenLines(theme: ThemeColors, bound = 5): EigenLines {
  const lineMaterial = new LineBasicMaterial({
    transparent: true,
    depthTest: false,
    depthWrite: false,
  });
  const lineGeometries: readonly [BufferGeometry, BufferGeometry] = [
    new BufferGeometry(),
    new BufferGeometry(),
  ];
  const makeLine = (geometry: BufferGeometry): Line => {
    geometry.setAttribute("position", new BufferAttribute(new Float32Array(6), 3));
    const line = new Line(geometry, lineMaterial);
    line.renderOrder = LINE_ORDER;
    line.visible = false;
    return line;
  };
  const lines: readonly [Line, Line] = [makeLine(lineGeometries[0]), makeLine(lineGeometries[1])];

  const sphereGeometry = new SphereGeometry(SPHERE_RADIUS, 16, 12);
  // `transparent` puts the spheres in the same sort group as the flat layers
  // below them, so renderOrder decides: without it the unit-square fill, which
  // is transparent, would paint over them.
  const sphereMaterial = new MeshStandardMaterial({ roughness: 0.5, transparent: true });
  const makeSphere = (): Mesh => {
    const sphere = new Mesh(sphereGeometry, sphereMaterial);
    sphere.renderOrder = SPHERE_ORDER;
    sphere.visible = false;
    return sphere;
  };
  const spheres: readonly [Mesh, Mesh] = [makeSphere(), makeSphere()];

  const group = new Group();
  group.add(...lines, ...spheres);

  function applyTheme(): void {
    lineMaterial.color.copy(theme.line2);
    sphereMaterial.color.copy(theme.ink);
  }
  applyTheme();
  theme.addEventListener("change", applyTheme);

  /** Points line `i` along v, clipped to the display bound; hidden if it misses. */
  function setLine(i: 0 | 1, v: Vec2): void {
    const from: Vec2 = [-REACH * v[0], -REACH * v[1]];
    const to: Vec2 = [REACH * v[0], REACH * v[1]];
    const clipped = clipSegment(from, to, bound);
    const line = lines[i];
    if (clipped === null) {
      line.visible = false;
      return;
    }
    const position = lineGeometries[i].getAttribute("position") as BufferAttribute;
    position.setXYZ(0, clipped[0][0], clipped[0][1], 0);
    position.setXYZ(1, clipped[1][0], clipped[1][1], 0);
    position.needsUpdate = true;
    lineGeometries[i].computeBoundingSphere();
    line.visible = true;
  }

  return {
    group,

    set(eigen: Eigen, t: number): void {
      const pairs = eigen.kind === "real" ? eigen.pairs : [];
      for (const i of INDICES) {
        const pair = pairs[i];
        if (pair === undefined) {
          lines[i].visible = false;
          spheres[i].visible = false;
          continue;
        }
        setLine(i, pair.vector);
        // λ(t) = 1 − t + tλ: the eigenvalue of M(t) on the same eigenvector.
        const lambdaT = 1 - t + t * pair.value;
        spheres[i].visible = Math.abs(lambdaT) >= ZERO;
        spheres[i].position.set(lambdaT * pair.vector[0], lambdaT * pair.vector[1], 0);
      }
    },

    setVisible(on: boolean): void {
      group.visible = on;
    },

    dispose(): void {
      theme.removeEventListener("change", applyTheme);
      for (const geometry of lineGeometries) geometry.dispose();
      lineMaterial.dispose();
      sphereGeometry.dispose();
      sphereMaterial.dispose();
      group.removeFromParent();
      group.clear();
    },
  };
}
