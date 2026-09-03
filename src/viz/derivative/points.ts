import {
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  SphereGeometry,
} from "three";
import type { ThemeColors } from "../types";
import { CENTRE_Z } from "./frame-vertical";

export interface Points {
  readonly group: Group;
  /** Invisible pick volume around the main point, for the drag raycast. */
  readonly hitTarget: Mesh;
  /** Invisible plane in y = 0, for click-to-place. */
  readonly clickPlane: Mesh;
  set(
    main: readonly [number, number],
    secant: readonly [number, number] | null,
    marker: readonly [number, number] | null,
  ): void;
  dispose(): void;
}

const MAIN_RADIUS = 0.08;
const SMALL_RADIUS = 0.06;
const HIT_RADIUS = 0.2;
const ORDER = 10;
/** Covers X in [-3.5, 3.5] and, about CENTRE_Z, Z in [-8.75, 3.25]. */
const PLANE_SIZE: readonly [number, number] = [7, 12];

/**
 * The three spheres in the scene, plus the two invisible targets the pointer
 * uses: a pick volume around the main point and the plane a click lands on.
 *
 * Both targets use an invisible *material* rather than `mesh.visible = false`,
 * so the raycast in drag.ts hits them whichever way three treats invisible
 * objects; nothing is drawn either way. The spheres are solid bodies in a scene
 * of flat layers, so they keep depth testing and rely on `transparent` plus
 * `renderOrder` to sort above the layers.
 */
export function createPoints(theme: ThemeColors): Points {
  const mainGeometry = new SphereGeometry(MAIN_RADIUS, 24, 16);
  const smallGeometry = new SphereGeometry(SMALL_RADIUS, 16, 12);

  const mainMaterial = new MeshStandardMaterial({ roughness: 0.5, transparent: true });
  const secantMaterial = new MeshStandardMaterial({ roughness: 0.5, transparent: true });
  const markerMaterial = new MeshStandardMaterial({ roughness: 0.5, transparent: true });

  const makeSphere = (geometry: SphereGeometry, material: MeshStandardMaterial): Mesh => {
    const mesh = new Mesh(geometry, material);
    mesh.renderOrder = ORDER;
    return mesh;
  };
  const mainPoint = makeSphere(mainGeometry, mainMaterial);
  const secantPoint = makeSphere(smallGeometry, secantMaterial);
  const markerPoint = makeSphere(smallGeometry, markerMaterial);

  const hitGeometry = new SphereGeometry(HIT_RADIUS, 12, 8);
  const hitMaterial = new MeshBasicMaterial({ visible: false });
  const hitTarget = new Mesh(hitGeometry, hitMaterial);

  const planeGeometry = new PlaneGeometry(PLANE_SIZE[0], PLANE_SIZE[1]);
  const planeMaterial = new MeshBasicMaterial({ visible: false, side: DoubleSide });
  const clickPlane = new Mesh(planeGeometry, planeMaterial);
  // A PlaneGeometry stands in x/y; this lays it into the scene's y = 0 plane.
  clickPlane.rotation.x = Math.PI / 2;
  clickPlane.position.set(0, 0, CENTRE_Z);

  const group = new Group();
  group.add(mainPoint, secantPoint, markerPoint, hitTarget, clickPlane);

  function applyTheme(): void {
    mainMaterial.color.copy(theme.ink);
    secantMaterial.color.copy(theme.soft);
    markerMaterial.color.copy(theme.accent);
  }
  applyTheme();
  theme.addEventListener("change", applyTheme);

  /** Places a sphere at a display point, or hides it when there is none. */
  function place(mesh: Mesh, at: readonly [number, number] | null): void {
    mesh.visible = at !== null;
    if (at !== null) mesh.position.set(at[0], 0, at[1]);
  }

  return {
    group,
    hitTarget,
    clickPlane,

    set(
      main: readonly [number, number],
      secant: readonly [number, number] | null,
      marker: readonly [number, number] | null,
    ): void {
      place(mainPoint, main);
      hitTarget.position.copy(mainPoint.position);
      place(secantPoint, secant);
      place(markerPoint, marker);
    },

    dispose(): void {
      theme.removeEventListener("change", applyTheme);
      // Detach before the assembler's disposeObject(scene) sweep, so these
      // geometries and materials are not disposed a second time.
      group.removeFromParent();
      group.clear();
      mainGeometry.dispose();
      smallGeometry.dispose();
      mainMaterial.dispose();
      secantMaterial.dispose();
      markerMaterial.dispose();
      hitGeometry.dispose();
      hitMaterial.dispose();
      planeGeometry.dispose();
      planeMaterial.dispose();
    },
  };
}
