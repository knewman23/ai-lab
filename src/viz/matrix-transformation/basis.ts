import {
  ArrowHelper,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  SphereGeometry,
  Vector3,
} from "three";
import type { Mat2 } from "../../core/math/matrix2";
import { columns } from "../../core/math/matrix2";
import type { ThemeColors } from "../types";
import { disposeArrow, overlayArrow } from "../shared/arrow";

export interface Basis {
  readonly group: Group;
  /** Invisible pick volumes for the drag raycast; see the note on their material. */
  readonly hitTargets: readonly [Mesh, Mesh];
  setMatrix(mt: Mat2): void;
  setDraggable(on: boolean): void;
  dispose(): void;
}

const BALL_RADIUS = 0.08;
const HIT_RADIUS = 0.2;
const HEAD_FRACTION = 0.18;
const MIN_HEAD = 0.08;
const MAX_HEAD = 0.3;
const HEAD_WIDTH_FRACTION = 0.6;
const ZERO = 1e-6;
const ORDER = 10;
const INDICES = [0, 1] as const;

/**
 * The two basis vectors M(t)·e₁ and M(t)·e₂, each an arrow from the origin with
 * a draggable tip ball.
 *
 * Each `hitTargets` entry uses an invisible *material* rather than
 * `mesh.visible = false`, so the raycast in drag.ts hits it whichever way three
 * treats invisible objects; nothing is drawn either way. `setDraggable` only
 * hides the visible balls: whether a drag may start is decided by the drag
 * handler's `enabled` predicate.
 */
export function createBasis(theme: ThemeColors): Basis {
  const arrows: readonly [ArrowHelper, ArrowHelper] = [
    new ArrowHelper(new Vector3(1, 0, 0), new Vector3(), 1),
    new ArrowHelper(new Vector3(0, 1, 0), new Vector3(), 1),
  ];
  // Depth testing stays on: these are solid bodies in a scene of flat layers,
  // and `transparent` alone is enough to sort them above the fill.
  for (const arrow of arrows) overlayArrow(arrow, { renderOrder: ORDER });

  const ballGeometry = new SphereGeometry(BALL_RADIUS, 24, 16);
  const ballMaterials: readonly [MeshStandardMaterial, MeshStandardMaterial] = [
    new MeshStandardMaterial({ roughness: 0.5, transparent: true }),
    new MeshStandardMaterial({ roughness: 0.5, transparent: true }),
  ];
  const makeBall = (material: MeshStandardMaterial): Mesh => {
    const ball = new Mesh(ballGeometry, material);
    ball.renderOrder = ORDER;
    return ball;
  };
  const balls: readonly [Mesh, Mesh] = [makeBall(ballMaterials[0]), makeBall(ballMaterials[1])];

  const hitGeometry = new SphereGeometry(HIT_RADIUS, 12, 8);
  const hitMaterials: readonly [MeshBasicMaterial, MeshBasicMaterial] = [
    new MeshBasicMaterial({ visible: false }),
    new MeshBasicMaterial({ visible: false }),
  ];
  const hitTargets: readonly [Mesh, Mesh] = [
    new Mesh(hitGeometry, hitMaterials[0]),
    new Mesh(hitGeometry, hitMaterials[1]),
  ];

  const group = new Group();
  group.add(...arrows, ...balls, ...hitTargets);

  function applyTheme(): void {
    arrows[0].setColor(theme.accent);
    arrows[1].setColor(theme.ink);
    ballMaterials[0].color.copy(theme.accent);
    ballMaterials[1].color.copy(theme.ink);
  }
  applyTheme();
  theme.addEventListener("change", applyTheme);

  const dir = new Vector3();

  return {
    group,
    hitTargets,

    setMatrix(mt: Mat2): void {
      const cols = columns(mt);
      for (const i of INDICES) {
        const [x, y] = cols[i];
        const length = Math.hypot(x, y);
        const arrow = arrows[i];
        // An ArrowHelper cannot represent a zero vector: hide it and leave the
        // tip ball sitting at the origin, which is where the column points.
        arrow.visible = length >= ZERO;
        if (arrow.visible) {
          dir.set(x / length, y / length, 0);
          arrow.setDirection(dir);
          const head = Math.min(Math.max(HEAD_FRACTION * length, MIN_HEAD), MAX_HEAD);
          arrow.setLength(length, head, HEAD_WIDTH_FRACTION * head);
        }
        balls[i].position.set(x, y, 0);
        hitTargets[i].position.set(x, y, 0);
      }
    },

    setDraggable(on: boolean): void {
      for (const material of ballMaterials) material.visible = on;
    },

    dispose(): void {
      theme.removeEventListener("change", applyTheme);
      for (const arrow of arrows) disposeArrow(arrow);
      ballGeometry.dispose();
      for (const material of ballMaterials) material.dispose();
      hitGeometry.dispose();
      for (const material of hitMaterials) material.dispose();
      group.removeFromParent();
      group.clear();
    },
  };
}
