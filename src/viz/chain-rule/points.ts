import { Group, Mesh, MeshBasicMaterial, SphereGeometry } from "three";
import type { Vec3 } from "../shared/layer";
import type { ThemeColors } from "../types";
import type { MarkedPoints } from "./links-geometry";

export interface Points {
  readonly group: Group;
  /** Invisible pick volume around P, for the drag raycast. */
  readonly hitP: Mesh;
  /** Invisible pick volume around R, for the drag raycast. */
  readonly hitR: Mesh;
  /**
   * Places P, Q, R (and the hit spheres with P and R). The primed spheres are
   * shown at `points.primed` when `primed` is true and a step exists, else hidden.
   */
  set(points: MarkedPoints & { readonly primed: MarkedPoints | null }, primed: boolean): void;
  dispose(): void;
}

const MAIN_RADIUS = 0.08;
const Q_RADIUS = 0.07;
const PRIMED_RADIUS = 0.05;
const HIT_RADIUS = 0.2;
const ORDER = 10;

/**
 * The six spheres of the scene, P, Q, R and P′, Q′, R′, plus the two invisible
 * pick volumes around the draggable P and R.
 *
 * The pick volumes use an invisible *material* rather than `mesh.visible = false`,
 * so the drag raycast hits them whichever way three treats invisible objects;
 * nothing is drawn either way. The spheres are solid bodies in a scene of flat
 * layers, so they keep depth testing and rely on `transparent` plus
 * `renderOrder` to sort above the layers. Geometries are shared where radii
 * match and each is disposed once.
 */
export function createPoints(theme: ThemeColors): Points {
  const mainGeometry = new SphereGeometry(MAIN_RADIUS, 24, 16);
  const qGeometry = new SphereGeometry(Q_RADIUS, 24, 16);
  const primedGeometry = new SphereGeometry(PRIMED_RADIUS, 16, 12);
  const hitGeometry = new SphereGeometry(HIT_RADIUS, 12, 8);

  const inkMaterial = new MeshBasicMaterial({ transparent: true });
  const softMaterial = new MeshBasicMaterial({ transparent: true });
  const hitMaterial = new MeshBasicMaterial({ visible: false });

  const makeSphere = (geometry: SphereGeometry, material: MeshBasicMaterial): Mesh => {
    const mesh = new Mesh(geometry, material);
    mesh.renderOrder = ORDER;
    return mesh;
  };
  const p = makeSphere(mainGeometry, inkMaterial);
  const q = makeSphere(qGeometry, softMaterial);
  const r = makeSphere(mainGeometry, inkMaterial);
  const primedMeshes = [
    makeSphere(primedGeometry, softMaterial),
    makeSphere(primedGeometry, softMaterial),
    makeSphere(primedGeometry, softMaterial),
  ] as const;
  const hitP = new Mesh(hitGeometry, hitMaterial);
  const hitR = new Mesh(hitGeometry, hitMaterial);

  const group = new Group();
  group.add(p, q, r, ...primedMeshes, hitP, hitR);

  function applyTheme(): void {
    inkMaterial.color.copy(theme.ink);
    softMaterial.color.copy(theme.soft);
  }
  applyTheme();
  theme.addEventListener("change", applyTheme);

  function place(mesh: Mesh, at: Vec3): void {
    mesh.position.set(at[0], at[1], at[2]);
  }

  return {
    group,
    hitP,
    hitR,

    set(points, primed): void {
      place(p, points.p);
      place(q, points.q);
      place(r, points.r);
      hitP.position.copy(p.position);
      hitR.position.copy(r.position);

      const show = primed && points.primed !== null;
      for (const mesh of primedMeshes) mesh.visible = show;
      if (points.primed !== null) {
        place(primedMeshes[0], points.primed.p);
        place(primedMeshes[1], points.primed.q);
        place(primedMeshes[2], points.primed.r);
      }
    },

    dispose(): void {
      theme.removeEventListener("change", applyTheme);
      // Detach before the assembler's disposeObject(scene) sweep, so these
      // geometries and materials are not disposed a second time.
      group.removeFromParent();
      group.clear();
      mainGeometry.dispose();
      qGeometry.dispose();
      primedGeometry.dispose();
      hitGeometry.dispose();
      inkMaterial.dispose();
      softMaterial.dispose();
      hitMaterial.dispose();
    },
  };
}
