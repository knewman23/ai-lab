// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { Line } from "three";
import { createThemeColors } from "../../../src/core/theme";
import { RingBuffer } from "../../../src/core/math/ring-buffer";
import { SURFACES, isInDomain } from "../../../src/core/math/surfaces";
import type { Vec2 } from "../../../src/core/math/numeric";
import { createMarker } from "../../../src/viz/gradient-descent/marker";
import { createPathLine } from "../../../src/viz/gradient-descent/path-line";

/**
 * A step that leaves the domain is a real state the scene reports ("left the domain"), but the
 * surface it is drawn on only exists over the domain, and every one of these functions is
 * unbounded outside it — Rosenbrock reaches z = 1160 two units out, in a scene whose surface
 * spans z ∈ [0, 3.1]. Drawing that point at its true height throws the ball and its trail out
 * of the frame entirely.
 */
const OUTSIDE: Vec2 = [-9.52, -5.82];

function theme() {
  return createThemeColors(() => "#1f4ed8");
}

/** The tallest the surface gets anywhere on its own domain: the scene's drawable ceiling. */
function heightCeiling(key: keyof typeof SURFACES): number {
  const surface = SURFACES[key];
  let hi = 0;
  const N = 40;
  for (let i = 0; i <= N; i += 1) {
    for (let j = 0; j <= N; j += 1) {
      const x = surface.domain.x[0] + ((surface.domain.x[1] - surface.domain.x[0]) * i) / N;
      const y = surface.domain.y[0] + ((surface.domain.y[1] - surface.domain.y[0]) * j) / N;
      hi = Math.max(hi, Math.abs(surface.scale * surface.f(x, y)));
    }
  }
  return hi;
}

describe("what the scene draws when a step leaves the domain", () => {
  it("keeps the marker on the surface rather than at the height of a point outside it", () => {
    const surface = SURFACES.rosenbrock;
    const marker = createMarker(theme());

    marker.setPosition(surface, OUTSIDE);

    const drawn = marker.hitTarget.position;
    expect(isInDomain(surface, [drawn.x, drawn.y])).toBe(true);
    expect(Math.abs(drawn.z)).toBeLessThanOrEqual(heightCeiling("rosenbrock"));

    marker.dispose();
  });

  it("keeps every point of the trail on the surface too", () => {
    const surface = SURFACES.rosenbrock;
    const path = new RingBuffer<Vec2>(8);
    path.push(surface.start);
    path.push([-1.23, 2.15]);
    path.push(OUTSIDE);

    const pathLine = createPathLine(theme(), 8);
    pathLine.sync(surface, path);

    const line = pathLine.group.children.find((child): child is Line => child instanceof Line);
    if (!line) throw new Error("the path line has no Line to read");
    const positions = line.geometry.getAttribute("position");
    const ceiling = heightCeiling("rosenbrock");

    for (let i = 0; i < path.size; i += 1) {
      const point: Vec2 = [positions.getX(i), positions.getY(i)];
      expect(isInDomain(surface, point), `trail point ${i} is off the surface`).toBe(true);
      expect(
        Math.abs(positions.getZ(i)),
        `trail point ${i} is above the scene`,
      ).toBeLessThanOrEqual(ceiling + 0.1);
    }

    pathLine.dispose();
  });

  it("still draws an in-domain point exactly where it is", () => {
    const surface = SURFACES.bowl;
    const marker = createMarker(theme());
    const inside: Vec2 = [1.25, -0.5];

    marker.setPosition(surface, inside);

    const drawn = marker.hitTarget.position;
    expect(drawn.x).toBeCloseTo(inside[0], 12);
    expect(drawn.y).toBeCloseTo(inside[1], 12);
    expect(drawn.z).toBeCloseTo(surface.scale * surface.f(inside[0], inside[1]), 12);

    marker.dispose();
  });
});
