import { describe, expect, it } from "vitest";
import { entriesByTopic, findEntry, REGISTRY } from "../../src/app/registry";
import { TOPICS } from "../../src/viz/types";

describe("registry", () => {
  it("has unique ids", () => {
    const ids = REGISTRY.map((entry) => entry.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("groups entries by topic with every topic present, in TOPICS order", () => {
    const map = entriesByTopic();
    const keys = Array.from(map.keys());
    expect(keys).toEqual(TOPICS.map((topic) => topic.slug));
  });

  it("files each entry under its own topic", () => {
    const map = entriesByTopic();
    for (const [topic, entries] of map) {
      for (const entry of entries) {
        expect(entry.topic).toBe(topic);
      }
    }
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

  it("returns undefined for an unregistered visualization id", () => {
    expect(findEntry("machine-learning", "gradient-descent")).toBeUndefined();
  });

  it("returns undefined for an unknown topic", () => {
    expect(findEntry("not-a-topic", "anything")).toBeUndefined();
  });
});
