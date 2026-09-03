import {
  ArrowHelper,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  SphereGeometry,
  Vector3,
} from "three";
import { magnitude } from "../../core/math/numeric";
import type { Vec2 } from "../../core/math/numeric";
import type { Surface } from "../../core/math/surfaces";
import type { ThemeColors } from "../types";
import { disposeArrow, fadeArrow, overlayArrow } from "../shared/arrow";

export interface Marker {
  readonly group: Group;
  /** Invisible pick volume for the drag raycast; see the note on its material. */
  readonly hitTarget: Mesh;
  setPosition(surface: Surface, pos: Vec2): void;
  setTangentVisible(on: boolean): void;
  dispose(): void;
}

const BALL_RADIUS = 0.08;
const HIT_RADIUS = 0.2;
const PLANE_SIDE = 1.2;
const ARROW_SCALE = 0.15;
const MIN_LENGTH = 0.2;
const MAX_LENGTH = 1.5;
const FLAT = 1e-9;
const BALL_ORDER = 9;
const ARROW_ORDER = 10;

/**
 * The draggable ball on the surface, with the gradient and negative-gradient
 * arrows and the tangent plane that share its position.
 *
 * `hitTarget` uses an invisible *material* rather than `mesh.visible = false`,
 * so the raycast in drag.ts hits it whichever way three treats invisible
 * objects; nothing is drawn either way.
 */
export function createMarker(theme: ThemeColors): Marker {
  const ballGeometry = new SphereGeometry(BALL_RADIUS, 24, 16);
  const ballMaterial = new MeshStandardMaterial({ roughness: 0.5 });
  ballMaterial.color.copy(theme.ink);
  const ball = new Mesh(ballGeometry, ballMaterial);
  // Above the surface in the draw order, but still depth-tested: the ball is a
  // solid body and should be occluded when it really is behind something.
  ball.renderOrder = BALL_ORDER;

  const hitGeometry = new SphereGeometry(HIT_RADIUS, 12, 8);
  const hitMaterial = new MeshBasicMaterial({ visible: false });
  const hitTarget = new Mesh(hitGeometry, hitMaterial);

  const up = new Vector3(0, 0, 1);
  const gradArrow = new ArrowHelper(up, new Vector3(), 1);
  const descentArrow = new ArrowHelper(up, new Vector3(), 1);
  // The arrows lie in the tangent plane, so at the default camera the surface
  // mesh buries most of their length: draw them over it instead of inside it.
  for (const arrow of [gradArrow, descentArrow]) {
    overlayArrow(arrow, {
      renderOrder: ARROW_ORDER,
      depthTest: false,
      depthWrite: false,
      transparent: false,
    });
  }
  fadeArrow(descentArrow, 0.45);

  const planeGeometry = new PlaneGeometry(PLANE_SIDE, PLANE_SIDE);
  const planeMaterial = new MeshBasicMaterial({
    transparent: true,
    opacity: 0.18,
    side: DoubleSide,
    depthWrite: false,
  });
  planeMaterial.color.copy(theme.accent);
  const plane = new Mesh(planeGeometry, planeMaterial);

  const group = new Group();
  group.add(ball, hitTarget, gradArrow, descentArrow, plane);

  function applyTheme(): void {
    ballMaterial.color.copy(theme.ink);
    gradArrow.setColor(theme.accent);
    descentArrow.setColor(theme.accent);
    planeMaterial.color.copy(theme.accent);
  }
  applyTheme();
  theme.addEventListener("change", applyTheme);

  const origin = new Vector3();
  const dir = new Vector3();
  const normal = new Vector3();

  /** Points `arrow` along the tangent-plane lift of the unit xy direction (dx, dy). */
  function aim(arrow: ArrowHelper, dx: number, dy: number, g: Vec2, s: number, len: number): void {
    dir.set(dx, dy, s * (g[0] * dx + g[1] * dy)).normalize();
    arrow.position.copy(origin);
    arrow.setDirection(dir);
    arrow.setLength(len, 0.18 * len, 0.08 * len);
  }

  return {
    group,
    hitTarget,

    setPosition(surface: Surface, pos: Vec2): void {
      const [x, y] = pos;
      const s = surface.scale;
      origin.set(x, y, s * surface.f(x, y));
      ball.position.copy(origin);
      hitTarget.position.copy(origin);

      const g = surface.grad(x, y);
      const m = magnitude(g);
      const flat = m < FLAT;
      gradArrow.visible = !flat;
      descentArrow.visible = !flat;
      if (!flat) {
        const len = Math.min(Math.max(ARROW_SCALE * m, MIN_LENGTH), MAX_LENGTH);
        const dx = g[0] / m;
        const dy = g[1] / m;
        aim(gradArrow, dx, dy, g, s, len);
        aim(descentArrow, -dx, -dy, g, s, len);
      }

      plane.position.copy(origin);
      normal.set(-s * g[0], -s * g[1], 1).normalize();
      plane.quaternion.setFromUnitVectors(up, normal);
    },

    setTangentVisible(on: boolean): void {
      plane.visible = on;
    },

    dispose(): void {
      theme.removeEventListener("change", applyTheme);
      disposeArrow(gradArrow);
      disposeArrow(descentArrow);
      ballGeometry.dispose();
      ballMaterial.dispose();
      hitGeometry.dispose();
      hitMaterial.dispose();
      planeGeometry.dispose();
      planeMaterial.dispose();
      group.clear();
    },
  };
}
