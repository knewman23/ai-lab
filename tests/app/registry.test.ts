import { describe, expect, it } from "vitest";
import { findEntry, REGISTRY } from "../../src/app/registry";
import type { LazyVisualization } from "../../src/viz/types";

/** Loads a ready entry's chunk and checks the module matches the card metadata. */
async function loadReady(topic: string, id: string): Promise<void> {
  const entry = findEntry(topic, id);
  expect(entry).toBeDefined();
  expect(entry?.status).toBe("ready");
  const load = (entry as LazyVisualization).load;
  expect(typeof load).toBe("function");
  const module = await load();
  expect(module.status).toBe("ready");
  expect(typeof module.mount).toBe("function");
  expect(module.id).toBe(id);
  expect(module.topic).toBe(topic);
  // The card metadata is duplicated in the registry; drift would ship a wrong card.
  expect(module.title).toBe(entry?.title);
  expect(module.summary).toBe(entry?.summary);
}

describe("registry", () => {
  it("has unique ids", () => {
    const ids = REGISTRY.map((entry) => entry.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  const roadmapExpectations: ReadonlyArray<{
    id: string;
    topic: string;
  }> = [{ id: "gpt-transformer", topic: "machine-learning" }];

  it.each(roadmapExpectations)(
    "has roadmap entry $id under $topic with status soon",
    ({ id, topic }) => {
      const entry = findEntry(topic, id);
      expect(entry).toBeDefined();
      expect(entry?.status).toBe("soon");
      expect(entry?.topic).toBe(topic);
    },
  );

  it("loads the gradient descent visualization from its own chunk", async () => {
    await loadReady("machine-learning", "gradient-descent");
  });

  it("loads the matrix transformation visualization from its own chunk", async () => {
    await loadReady("linear-algebra", "matrix-transformation");
    expect(findEntry("linear-algebra", "matrix-transformation")?.summary).not.toContain("cube");
  });

  it("loads the derivative explorer from its own chunk", async () => {
    await loadReady("calculus", "derivative-tangent");
    const summary = findEntry("calculus", "derivative-tangent")?.summary;
    expect(summary).not.toContain("roadmap");
    expect(summary).not.toContain("soon");
  });

  it("loads the neural network from its own chunk", async () => {
    await loadReady("machine-learning", "neural-network");
    const summary = findEntry("machine-learning", "neural-network")?.summary;
    expect(summary).not.toContain("roadmap");
    expect(summary).not.toContain("soon");
  });

  it("loads the backprop graph from its own chunk", async () => {
    await loadReady("machine-learning", "backprop-graph");
    const summary = findEntry("machine-learning", "backprop-graph")?.summary;
    expect(summary).not.toContain("roadmap");
    expect(summary).not.toContain("soon");
  });

  it("loads the chain rule graph from its own chunk", async () => {
    await loadReady("calculus", "chain-rule-graph");
    const summary = findEntry("calculus", "chain-rule-graph")?.summary;
    expect(summary).not.toContain("roadmap");
    expect(summary).not.toContain("soon");
  });

  it("lists the derivative explorer first among the calculus entries", () => {
    const calculus = REGISTRY.filter((entry) => entry.topic === "calculus");
    expect(calculus[0]?.id).toBe("derivative-tangent");
  });

  it("lists matrix transformation as the only linear algebra entry", () => {
    const linearAlgebra = REGISTRY.filter((entry) => entry.topic === "linear-algebra");
    expect(linearAlgebra.map((entry) => entry.id)).toEqual(["matrix-transformation"]);
  });

  it("lists gradient descent first among the machine learning entries", () => {
    const machineLearning = REGISTRY.filter((entry) => entry.topic === "machine-learning");
    expect(machineLearning[0]?.id).toBe("gradient-descent");
  });

  it("returns undefined for an unknown topic", () => {
    expect(findEntry("not-a-topic", "anything")).toBeUndefined();
  });
});
