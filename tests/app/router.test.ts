import { describe, expect, it, vi } from "vitest";
import {
  createRouter,
  parseHash,
  resolveRoute,
  type Route,
  type RouterDeps,
} from "../../src/app/router";
import type { LazyVisualization, RegistryEntry } from "../../src/viz/types";

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
    ["#/machine-learning", { kind: "home", topic: "machine-learning" }],
    ["#/machine-learning/", { kind: "home", topic: "machine-learning" }],
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
  const readyEntry: LazyVisualization = {
    id: "gradient-descent",
    topic: "machine-learning",
    title: "Gradient descent",
    summary: "A visualization.",
    status: "ready",
    load: () =>
      Promise.resolve({
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

describe("createRouter", () => {
  const readyEntry: LazyVisualization = {
    id: "gradient-descent",
    topic: "machine-learning",
    title: "Gradient descent",
    summary: "A visualization.",
    status: "ready",
    load: () =>
      Promise.resolve({
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
      }),
  };

  function makeStubDeps(initialHash: string): RouterDeps & {
    listeners: Array<() => void>;
    setHashCalls: string[];
    setHashDirectly(h: string): void;
    fire(): void;
  } {
    let hash = initialHash;
    const listeners: Array<() => void> = [];
    const setHashCalls: string[] = [];
    return {
      listeners,
      setHashCalls,
      getHash: () => hash,
      setHash: (h: string) => {
        setHashCalls.push(h);
        hash = h;
      },
      addListener: (callback: () => void) => {
        listeners.push(callback);
        return () => {
          const index = listeners.indexOf(callback);
          if (index !== -1) {
            listeners.splice(index, 1);
          }
        };
      },
      setHashDirectly(h: string): void {
        hash = h;
      },
      fire(): void {
        for (const listener of listeners) {
          listener();
        }
      },
    };
  }

  it("starting on an unknown hash writes #/ exactly once and does not call onChange", () => {
    const deps = makeStubDeps("#/not-a-topic/not-an-id");
    const onChange = vi.fn();
    const find = (): RegistryEntry | undefined => undefined;
    const router = createRouter(onChange, find, deps);

    router.start();

    expect(deps.setHashCalls).toEqual(["#/"]);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("calls onChange with home when the listener then fires with hash #/", () => {
    const deps = makeStubDeps("#/not-a-topic/not-an-id");
    const onChange = vi.fn();
    const find = (): RegistryEntry | undefined => undefined;
    const router = createRouter(onChange, find, deps);

    router.start();
    deps.setHashDirectly("#/");
    deps.fire();

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith({ kind: "home" });
  });

  it("starting on a ready route calls onChange once with the entry", () => {
    const deps = makeStubDeps("#/machine-learning/gradient-descent");
    const onChange = vi.fn();
    const find = (): RegistryEntry | undefined => readyEntry;
    const router = createRouter(onChange, find, deps);

    router.start();

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith({ kind: "viz", entry: readyEntry });
  });

  it("double start() dispatches only once", () => {
    const deps = makeStubDeps("#/machine-learning/gradient-descent");
    const onChange = vi.fn();
    const find = (): RegistryEntry | undefined => readyEntry;
    const router = createRouter(onChange, find, deps);

    router.start();
    router.start();

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(deps.listeners).toHaveLength(1);
  });

  it("stop() invokes the remove function", () => {
    const deps = makeStubDeps("#/machine-learning/gradient-descent");
    const onChange = vi.fn();
    const find = (): RegistryEntry | undefined => readyEntry;
    const router = createRouter(onChange, find, deps);

    router.start();
    expect(deps.listeners).toHaveLength(1);

    router.stop();
    expect(deps.listeners).toHaveLength(0);
  });
});
