import { describe, expect, it } from "vitest";
import { parseHash, resolveRoute, type Route } from "../../src/app/router";
import type { RegistryEntry, Visualization } from "../../src/viz/types";

describe("parseHash", () => {
  it.each<[string, Route]>([
    ["", { kind: "home" }],
    ["#", { kind: "home" }],
    ["#/", { kind: "home" }],
    [
      "#/machine-learning/gradient-descent",
      { kind: "viz", topic: "machine-learning", id: "gradient-descent" },
    ],
    ["#/a/b/", { kind: "viz", topic: "a", id: "b" }],
    ["#/only-one", { kind: "home" }],
    ["#/a/b/c", { kind: "home" }],
  ])("parses %s", (hash, expected) => {
    expect(parseHash(hash)).toEqual(expected);
  });

  it("decodes percent-encoded segments", () => {
    expect(parseHash("#/machine%2Dlearning/x")).toEqual({
      kind: "viz",
      topic: "machine-learning",
      id: "x",
    });
  });

  it("does not throw on malformed percent-encoding and yields home", () => {
    expect(() => parseHash("#/%E0%A4%A/x")).not.toThrow();
    expect(parseHash("#/%E0%A4%A/x")).toEqual({ kind: "home" });
  });
});

describe("resolveRoute", () => {
  const readyEntry: Visualization = {
    id: "gradient-descent",
    topic: "machine-learning",
    title: "Gradient descent",
    summary: "A visualization.",
    status: "ready",
    mount: () => ({
      update: () => false,
      resize: () => {},
      dispose: () => {},
    }),
  };

  const soonEntry: RegistryEntry = {
    id: "backprop-graph",
    topic: "machine-learning",
    title: "Backprop graph",
    summary: "Coming soon.",
    status: "soon",
  };

  it("resolves home to home", () => {
    const find = (): RegistryEntry | undefined => undefined;
    expect(resolveRoute({ kind: "home" }, find)).toEqual({ kind: "home" });
  });

  it("resolves a viz route with a ready entry to viz", () => {
    const find = (): RegistryEntry | undefined => readyEntry;
    expect(
      resolveRoute({ kind: "viz", topic: "machine-learning", id: "gradient-descent" }, find),
    ).toEqual({ kind: "viz", entry: readyEntry });
  });

  it("resolves a viz route with a soon entry to redirect", () => {
    const find = (): RegistryEntry | undefined => soonEntry;
    expect(
      resolveRoute({ kind: "viz", topic: "machine-learning", id: "backprop-graph" }, find),
    ).toEqual({ kind: "redirect" });
  });

  it("resolves an unknown viz route to redirect", () => {
    const find = (): RegistryEntry | undefined => undefined;
    expect(resolveRoute({ kind: "viz", topic: "nope", id: "nope" }, find)).toEqual({
      kind: "redirect",
    });
  });
});
