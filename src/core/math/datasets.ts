import type { DataPoint, Dataset } from "./mlp";
import { gaussian, mulberry32 } from "./prng";

export type DatasetKey = "xor" | "moons" | "circles";

/** Ordered as in the spec's dataset table; `xor` is the default. */
export const DATASET_KEYS = ["xor", "moons", "circles"] as const satisfies readonly DatasetKey[];

/** The range of both input coordinates, and of the floor the boundary is painted on. */
export const DOMAIN = [-3, 3] as const;

/** Keeps a noisy sample inside the domain rather than letting a tail escape the floor. */
function clamp(v: number): number {
  return Math.min(DOMAIN[1], Math.max(DOMAIN[0], v));
}

function point(x: number, y: number, label: 1 | -1, rand: () => number, sigma: number): DataPoint {
  return {
    x: [clamp(x + sigma * gaussian(rand)), clamp(y + sigma * gaussian(rand))],
    y: label,
  };
}

/** Ten points around each of the four centres (±1.5, ±1.5); the two diagonals are the two classes. */
function xorPoints(seed: number): readonly DataPoint[] {
  const rand = mulberry32(seed);
  const points: DataPoint[] = [];
  for (const sx of [1, -1]) {
    for (const sy of [1, -1]) {
      const label: 1 | -1 = sx * sy > 0 ? 1 : -1;
      for (let i = 0; i < 10; i++) points.push(point(1.5 * sx, 1.5 * sy, label, rand, 0.45));
    }
  }
  return points;
}

/** The classic interleaving pair: an upper arc (+1) and a lower arc (−1), 30 points each. */
function moonsPoints(seed: number): readonly DataPoint[] {
  const rand = mulberry32(seed);
  const points: DataPoint[] = [];
  const arcs = [
    { cx: -0.8, cy: -0.5, from: 0, label: 1 },
    { cx: 0.8, cy: 0.5, from: Math.PI, label: -1 },
  ] as const;
  for (const arc of arcs) {
    for (let i = 0; i < 30; i++) {
      const theta = arc.from + (Math.PI * i) / 29;
      const x = arc.cx + 1.6 * Math.cos(theta);
      const y = arc.cy + 1.6 * Math.sin(theta);
      points.push(point(x, y, arc.label, rand, 0.2));
    }
  }
  return points;
}

/** An inner disc (+1) inside a ring (−1), 30 points each: a closed boundary. */
function circlesPoints(seed: number): readonly DataPoint[] {
  const rand = mulberry32(seed);
  const points: DataPoint[] = [];
  const rings = [
    { inner: 0, outer: 0.8, label: 1 },
    { inner: 1.8, outer: 2.4, label: -1 },
  ] as const;
  for (const ring of rings) {
    for (let i = 0; i < 30; i++) {
      const theta = 2 * Math.PI * rand();
      const r = ring.inner + (ring.outer - ring.inner) * Math.sqrt(rand());
      points.push(point(r * Math.cos(theta), r * Math.sin(theta), ring.label, rand, 0.15));
    }
  }
  return points;
}

/**
 * The three toy problems, built once at module load from fixed dataset seeds so they never change.
 * Only `initParams` takes the scene's seed; each `startSeed` is verified by a test to train that
 * dataset to ≥ 0.9 accuracy within 300 epochs at the default learning rate.
 */
export const DATASETS: Readonly<Record<DatasetKey, Dataset>> = {
  xor: {
    key: "xor",
    title: "XOR",
    points: xorPoints(11),
    startSeed: 1,
    hint: "No single line separates the classes: the hidden layer has to bend the space first.",
  },
  moons: {
    key: "moons",
    title: "Two moons",
    points: moonsPoints(12),
    startSeed: 2,
    hint: "Two interleaving arcs; watch the boundary curve between them, and press Reset for a different starting seed if it stalls.",
  },
  circles: {
    key: "circles",
    title: "Circles",
    points: circlesPoints(13),
    startSeed: 1,
    hint: "The boundary has to close around the inner disc.",
  },
};
