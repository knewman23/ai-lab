import { describe, expect, it } from "vitest";
import { DATASET_KEYS, DATASETS, DOMAIN, type DatasetKey } from "../../../src/core/math/datasets";
import { accuracy, gradients, initParams, step } from "../../../src/core/math/mlp";

const SIZES: Readonly<Record<DatasetKey, number>> = { xor: 40, moons: 60, circles: 60 };
const TITLES: Readonly<Record<DatasetKey, string>> = {
  xor: "XOR",
  moons: "Two moons",
  circles: "Circles",
};

describe("DATASET_KEYS", () => {
  it("lists xor, moons and circles in that order", () => {
    expect([...DATASET_KEYS]).toEqual(["xor", "moons", "circles"]);
  });

  it("names each dataset by its own key", () => {
    for (const key of DATASET_KEYS) expect(DATASETS[key].key).toBe(key);
  });
});

describe.each(DATASET_KEYS)("%s", (key) => {
  const d = DATASETS[key];

  it("has the stated size", () => {
    expect(d.points.length).toBe(SIZES[key]);
  });

  it("is balanced within ±2", () => {
    const positive = d.points.filter((p) => p.y === 1).length;
    expect(Math.abs(positive - (d.points.length - positive))).toBeLessThanOrEqual(2);
  });

  it("keeps every point inside the domain", () => {
    for (const { x } of d.points) {
      for (const v of x) {
        expect(v).toBeGreaterThanOrEqual(DOMAIN[0]);
        expect(v).toBeLessThanOrEqual(DOMAIN[1]);
      }
    }
  });

  it("has a title and a hint", () => {
    expect(d.title).toBe(TITLES[key]);
    expect(d.hint.length).toBeGreaterThan(0);
  });

  it("trains to accuracy ≥ 0.9 within 300 epochs from its startSeed", () => {
    let p = initParams(d.startSeed);
    for (let epoch = 0; epoch < 300; epoch++) p = step(p, gradients(p, d), 0.1);
    expect(accuracy(p, d)).toBeGreaterThanOrEqual(0.9);
  });
});

describe("module identity", () => {
  it("gives the same points to every importer", async () => {
    const again = await import("../../../src/core/math/datasets");
    for (const key of DATASET_KEYS) {
      expect(again.DATASETS[key].points).toBe(DATASETS[key].points);
    }
  });
});

describe("DOMAIN", () => {
  it("is [−3, 3]", () => {
    expect([...DOMAIN]).toEqual([-3, 3]);
  });
});
