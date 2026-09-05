import { describe, expect, it, vi } from "vitest";
import {
  createRouter,
  parseHash,
  resolveRoute,
  type Route,
  type ResolvedRoute,
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
    [
      "#/machine-learning/gpt-transformer/walkthrough/3",
      { kind: "viz", topic: "machine-learning", id: "gpt-transformer", step: 2 },
    ],
    [
      "#/machine-learning/gpt-transformer/walkthrough/1",
      { kind: "viz", topic: "machine-learning", id: "gpt-transformer", step: 0 },
    ],
    // A step that cannot be an index at all is the plain scene, not a 404.
    [
      "#/machine-learning/gpt-transformer/walkthrough/0",
      { kind: "viz", topic: "machine-learning", id: "gpt-transformer" },
    ],
    [
      "#/machine-learning/gpt-transformer/walkthrough/-1",
      { kind: "viz", topic: "machine-learning", id: "gpt-transformer" },
    ],
    [
      "#/machine-learning/gpt-transformer/walkthrough/x",
      { kind: "viz", topic: "machine-learning", id: "gpt-transformer" },
    ],
    [
      "#/machine-learning/gpt-transformer/walkthrough/1.5",
      { kind: "viz", topic: "machine-learning", id: "gpt-transformer" },
    ],
    // Trailing slashes are trimmed first, so this is the three-segment case: home.
    ["#/machine-learning/gpt-transformer/walkthrough/", { kind: "home" }],
    ["#/machine-learning/gpt-transformer/walkthrough", { kind: "home" }],
    // A fourth segment that is not "walkthrough" is an unknown route, as today.
    ["#/machine-learning/gpt-transformer/steps/3", { kind: "home" }],
    ["#/a/b/c/d/e", { kind: "home" }],
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
    ).toEqual({ kind: "redirect", hash: "#/" });
  });

  it("resolves an unknown viz route to redirect", () => {
    const find = (): RegistryEntry | undefined => undefined;
    expect(resolveRoute({ kind: "viz", topic: "nope", id: "nope" }, find)).toEqual({
      kind: "redirect",
      hash: "#/",
    });
  });
});

describe("resolveRoute with a walkthrough step", () => {
  it("keeps the step on the resolved viz route", () => {
    const entry: LazyVisualization = {
      id: "gradient-descent",
      topic: "machine-learning",
      title: "Gradient descent",
      summary: "A visualization.",
      status: "ready",
      load: () => Promise.reject(new Error("not loaded in this test")),
    };
    const find = (): RegistryEntry | undefined => entry;
    expect(
      resolveRoute(
        { kind: "viz", topic: "machine-learning", id: "gradient-descent", step: 2 },
        find,
      ),
    ).toEqual({ kind: "viz", entry, step: 2 });
  });

  it("redirects an unknown entry to home even when a step was asked for", () => {
    const find = (): RegistryEntry | undefined => undefined;
    expect(resolveRoute({ kind: "viz", topic: "nope", id: "nope", step: 2 }, find)).toEqual({
      kind: "redirect",
      hash: "#/",
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

  it("parses a walkthrough deep link straight through to onChange", () => {
    const deps = makeStubDeps("#/machine-learning/gradient-descent/walkthrough/9");
    const onChange = vi.fn();
    const find = (): RegistryEntry | undefined => readyEntry;
    const router = createRouter(onChange, find, deps);

    router.start();

    expect(onChange).toHaveBeenCalledWith({ kind: "viz", entry: readyEntry, step: 8 });
    expect(deps.setHashCalls).toEqual([]);
  });

  it("navigates to the target the resolver names rather than a hardcoded #/", () => {
    const target = "#/machine-learning/gradient-descent";
    const deps = {
      ...makeStubDeps("#/machine-learning/gradient-descent/walkthrough/2"),
      resolve: (): ResolvedRoute => ({ kind: "redirect", hash: target }),
    };
    const onChange = vi.fn();
    const router = createRouter(onChange, () => readyEntry, deps);

    router.start();

    expect(deps.setHashCalls).toEqual([target]);
    expect(onChange).not.toHaveBeenCalled();
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
