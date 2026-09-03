import { describe, expect, it } from "vitest";
import { findEntry, REGISTRY } from "../../src/app/registry";

describe("registry", () => {
  it("has unique ids", () => {
    const ids = REGISTRY.map((entry) => entry.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  const roadmapExpectations: ReadonlyArray<{
    id: string;
    topic: string;
  }> = [
    { id: "derivative-tangent", topic: "calculus" },
    { id: "chain-rule-graph", topic: "calculus" },
    { id: "matrix-transformation", topic: "linear-algebra" },
    { id: "backprop-graph", topic: "machine-learning" },
    { id: "neural-network", topic: "machine-learning" },
    { id: "gpt-transformer", topic: "machine-learning" },
  ];

  it.each(roadmapExpectations)(
    "has roadmap entry $id under $topic with status soon",
    ({ id, topic }) => {
      const entry = findEntry(topic, id);
      expect(entry).toBeDefined();
      expect(entry?.status).toBe("soon");
      expect(entry?.topic).toBe(topic);
    },
  );

  it("has the gradient descent visualization ready to mount", () => {
    const entry = findEntry("machine-learning", "gradient-descent");
    expect(entry).toBeDefined();
    expect(entry?.status).toBe("ready");
    expect(typeof (entry as { mount?: unknown } | undefined)?.mount).toBe("function");
  });

  it("lists gradient descent first among the machine learning entries", () => {
    const machineLearning = REGISTRY.filter((entry) => entry.topic === "machine-learning");
    expect(machineLearning[0]?.id).toBe("gradient-descent");
  });

  it("returns undefined for an unknown topic", () => {
    expect(findEntry("not-a-topic", "anything")).toBeUndefined();
  });
});
