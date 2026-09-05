// @vitest-environment jsdom
import type { Crumb } from "../../src/app/header";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Loop } from "../../src/core/loop";
import { createVizPage, type RendererResult } from "../../src/app/viz-page";
import { createPanel } from "../../src/ui/panel";
import type {
  StepView,
  LazyVisualization,
  Renderer,
  ThemeColors,
  Visualization,
  VizInstance,
} from "../../src/viz/types";

class FakeResizeObserver {
  constructor(private readonly callback: () => void) {}
  observe(): void {
    this.callback();
  }
  unobserve(): void {}
  disconnect(): void {}
}

function fakeLoop(): Loop & { started: number; stopped: number } {
  return {
    started: 0,
    stopped: 0,
    setTick() {},
    start() {
      this.started += 1;
    },
    stop() {
      this.stopped += 1;
    },
    poke() {},
    isIdle: () => true,
    dispose() {},
  };
}

function fakeRenderer(): Renderer {
  return {
    domElement: document.createElement("canvas"),
    info: { memory: { geometries: 0 } },
    setPixelRatio() {},
    setSize() {},
  } as unknown as Renderer;
}

function fakeInstance(): VizInstance {
  return { update: () => false, resize: () => undefined, dispose: () => undefined };
}

function viz(mount: Visualization["mount"], id = "one"): Visualization {
  return { id, topic: "calculus", title: "One", summary: "A viz.", status: "ready", mount };
}

/** A registry entry whose chunk resolves immediately. */
function lazy(mount: Visualization["mount"], id = "one"): LazyVisualization {
  const loaded = viz(mount, id);
  return {
    id,
    topic: "calculus",
    title: "One",
    summary: "A viz.",
    status: "ready",
    load: () => Promise.resolve(loaded),
  };
}

interface Harness {
  main: HTMLElement;
  crumbs: Crumb[][];
  loop: ReturnType<typeof fakeLoop>;
  page: ReturnType<typeof createVizPage>;
  hashes: string[];
}

function harness(rendererReady: Promise<RendererResult>): Harness {
  const main = document.createElement("div");
  const crumbs: Crumb[][] = [];
  const loop = fakeLoop();
  const hashes: string[] = [];
  const page = createVizPage({
    replaceHash: (hash: string) => hashes.push(hash),
    main,
    header: {
      setBreadcrumb(parts) {
        crumbs.push([...parts]);
      },
    },
    theme: new EventTarget() as ThemeColors,
    loop,
    getRenderer: () => rendererReady,
  });
  return { main, crumbs, loop, page, hashes };
}

const ok = (): Promise<RendererResult> =>
  Promise.resolve({ ok: true, renderer: fakeRenderer(), applySize: () => undefined });

beforeEach(() => {
  vi.stubGlobal("ResizeObserver", FakeResizeObserver);
  // jsdom ships no scrollIntoView; the chrome calls it on every advance.
  Element.prototype.scrollIntoView = vi.fn();
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("createVizPage", () => {
  it("mounts a visualization and starts the loop", async () => {
    const { main, crumbs, loop, page } = harness(ok());
    const mount = vi.fn(() => fakeInstance());
    await page.enter(lazy(mount), 1);

    expect(mount).toHaveBeenCalledTimes(1);
    expect(loop.started).toBe(1);
    expect(crumbs).toEqual([[{ text: "Calculus", href: "#/calculus" }, "One"]]);
    expect(main.querySelector(".viz-canvas canvas")).not.toBeNull();
    expect(main.querySelector(".notice")).toBeNull();
  });

  it("does not mount when a newer enter has taken over", async () => {
    const { main, page } = harness(ok());
    const stale = vi.fn(() => fakeInstance());
    const fresh = vi.fn(() => fakeInstance());

    const first = page.enter(lazy(stale, "stale"), 1);
    const second = page.enter(lazy(fresh, "fresh"), 2);
    await Promise.all([first, second]);

    expect(stale).not.toHaveBeenCalled();
    expect(fresh).toHaveBeenCalledTimes(1);
    expect(main.querySelectorAll(".viz").length).toBe(1);
  });

  it("does not mount when leave() happens before the renderer resolves", async () => {
    const { main, loop, page } = harness(ok());
    const mount = vi.fn(() => fakeInstance());

    const pending = page.enter(lazy(mount), 1);
    page.leave();
    await pending;

    expect(mount).not.toHaveBeenCalled();
    expect(loop.started).toBe(0);
    expect(main.querySelector(".viz")).toBeNull();
  });

  it("shows a notice when the renderer is unavailable", async () => {
    const { main, loop, page } = harness(
      Promise.resolve({ ok: false, reason: "gpu", error: new Error("no gpu") }),
    );
    const mount = vi.fn(() => fakeInstance());
    await page.enter(lazy(mount), 1);

    const notice = main.querySelector(".notice");
    expect(notice?.querySelector("h2")?.textContent).toBe(
      "This visualization needs WebGPU or WebGL 2",
    );
    expect(notice?.querySelector("a")?.getAttribute("href")).toBe(
      "https://github.com/knewman23/ai-frontier",
    );
    expect(main.querySelector(".viz")).toBeNull();
    expect(mount).not.toHaveBeenCalled();
    expect(loop.started).toBe(0);
  });

  it("shows a notice when mount throws, without rejecting", async () => {
    const { main, loop, page } = harness(ok());
    const mount = (): VizInstance => {
      throw new Error("bad viz");
    };

    await expect(page.enter(lazy(mount), 1)).resolves.toBeUndefined();

    expect(main.querySelector(".notice")?.querySelector("h2")?.textContent).toBe(
      "This visualization failed to start",
    );
    expect(loop.started).toBe(0);
    expect(loop.stopped).toBeGreaterThanOrEqual(1);
    // A failed mount leaves nothing to dispose, so leave() stays quiet.
    expect(() => {
      page.leave();
    }).not.toThrow();
  });

  it("shows the not-loaded notice when the renderer chunk fails to arrive", async () => {
    const { main, loop, page } = harness(
      Promise.resolve({ ok: false, reason: "load", error: new Error("offline") }),
    );
    const mount = vi.fn(() => fakeInstance());

    await page.enter(lazy(mount), 1);

    const heading = main.querySelector(".notice")?.querySelector("h2")?.textContent;
    expect(heading).toBe("This visualization failed to start");
    expect(main.querySelector(".notice")?.querySelector("p")?.textContent).toBe(
      "This visualization could not be loaded.",
    );
    expect(mount).not.toHaveBeenCalled();
    expect(loop.started).toBe(0);
  });

  it("shows a notice when the visualization chunk fails to load", async () => {
    const { main, loop, page } = harness(ok());
    const entry: LazyVisualization = {
      id: "one",
      topic: "calculus",
      title: "One",
      summary: "A viz.",
      status: "ready",
      load: () => Promise.reject(new Error("network")),
    };

    await expect(page.enter(entry, 1)).resolves.toBeUndefined();

    expect(main.querySelector(".notice")?.querySelector("h2")?.textContent).toBe(
      "This visualization failed to start",
    );
    expect(main.querySelector(".notice")?.querySelector("p")?.textContent).toBe(
      "This visualization could not be loaded.",
    );
    expect(loop.started).toBe(0);
  });

  it("does not mount when leave() happens before the chunk resolves", async () => {
    const { main, loop, page } = harness(ok());
    const mount = vi.fn(() => fakeInstance());
    let release: (() => void) | undefined;
    const entry: LazyVisualization = {
      id: "one",
      topic: "calculus",
      title: "One",
      summary: "A viz.",
      status: "ready",
      load: () =>
        new Promise<Visualization>((resolve) => {
          release = () => {
            resolve(viz(mount));
          };
        }),
    };

    const pending = page.enter(entry, 1);
    page.leave();
    release?.();
    await pending;

    expect(mount).not.toHaveBeenCalled();
    expect(loop.started).toBe(0);
    expect(main.querySelector(".viz")).toBeNull();
  });

  it("tolerates leave() before enter and twice in a row", async () => {
    const { main, page } = harness(ok());
    expect(() => {
      page.leave();
    }).not.toThrow();

    await page.enter(
      lazy(() => fakeInstance()),
      1,
    );
    page.leave();
    expect(() => {
      page.leave();
    }).not.toThrow();
    expect(main.querySelector(".viz")).toBeNull();
  });

  it("disposes the instance on leave", async () => {
    const dispose = vi.fn();
    const { page } = harness(ok());
    await page.enter(
      lazy(() => ({ ...fakeInstance(), dispose })),
      1,
    );
    page.leave();
    page.leave();
    expect(dispose).toHaveBeenCalledTimes(1);
  });
});

/**
 * A scene with a walkthrough: it records the indices it was replayed to, and
 * builds a panel with an explanation section so the collapse can be checked.
 */
function walkingViz(prose: readonly string[]): {
  readonly entry: LazyVisualization;
  readonly visited: number[];
  readonly exits: number[];
  panelHost(): HTMLElement | undefined;
} {
  const visited: number[] = [];
  const exits: number[] = [];
  let host: HTMLElement | undefined;

  const entry = lazy((vizHost) => {
    host = vizHost.panel;
    const panel = createPanel();
    panel.section("Setup");
    panel.section("What you are seeing", { role: "explanation" });
    // The shape every real scene has: prose in a plain `.explain` block, marked in place.
    const explain = document.createElement("div");
    explain.className = "explain";
    explain.dataset.role = "explanation";
    panel.el.append(explain);
    vizHost.panel.append(panel.el);
    return {
      ...fakeInstance(),
      walkthrough: {
        title: "Walk me through it",
        length: prose.length,
        goTo(index: number): StepView {
          const text = prose[index];
          if (text === undefined) {
            throw new RangeError(`step index ${index} is outside 0…${prose.length - 1}`);
          }
          visited.push(index);
          return { index, total: prose.length, prose: text };
        },
        exit(): void {
          exits.push(visited.length);
        },
      },
    };
  }, "walker");

  return { entry, visited, exits, panelHost: () => host };
}

const PROSE = ["First, drag the ball.", "Then step the optimizer.", "Now switch surfaces."];

function stepButton(main: HTMLElement, label: string): HTMLButtonElement {
  const found = [...main.querySelectorAll("button")].find((b) => b.textContent === label);
  if (!found) {
    throw new Error(`no "${label}" button in the panel`);
  }
  return found;
}

describe("createVizPage and walkthrough mode", () => {
  it("wraps the panel in three regions and hands the scene only the middle one", async () => {
    const { main, page } = harness(ok());
    const scene = walkingViz(PROSE);

    await page.enter(scene.entry, 1);

    const wrapper = main.querySelector(".panel-host");
    expect(wrapper?.querySelector(":scope > .wt-banner")).not.toBeNull();
    expect(wrapper?.querySelector(":scope > .wt-scene")).not.toBeNull();
    expect(wrapper?.querySelector(":scope > .wt-step")).not.toBeNull();
    expect(scene.panelHost()).toBe(wrapper?.querySelector(".wt-scene"));
  });

  it("collapses the explanation section by marking the wrapper while a step shows", async () => {
    const { main, page } = harness(ok());
    const scene = walkingViz(PROSE);
    await page.enter(scene.entry, 1);

    const wrapper = main.querySelector(".panel-host");
    const marked = [...main.querySelectorAll('[data-role="explanation"]')];
    expect(marked).toHaveLength(2);
    expect(marked.every((el) => wrapper?.contains(el) === true)).toBe(true);
    expect(wrapper?.classList.contains("wt-active")).toBe(false);

    stepButton(main, "Walk me through it").click();
    expect(wrapper?.classList.contains("wt-active")).toBe(true);
  });

  it("renders no chrome at all for a scene without a walkthrough", async () => {
    const { main, page } = harness(ok());

    await page.enter(
      lazy(() => fakeInstance()),
      1,
    );

    expect(main.querySelector(".wt-banner")?.children).toHaveLength(0);
    expect(main.querySelector(".wt-step")?.children).toHaveLength(0);
  });

  it("opens a deep-linked step on a cold load", async () => {
    const { main, page } = harness(ok());
    const scene = walkingViz(PROSE);

    await page.enter(scene.entry, 1, 1);

    expect(scene.visited).toEqual([1]);
    expect(main.querySelector(".wt-step")?.textContent).toContain(PROSE[1]);
  });

  it("clamps a step past the end to the last one and rewrites the hash", async () => {
    const { main, page, hashes } = harness(ok());
    const scene = walkingViz(PROSE);

    await page.enter(scene.entry, 1, 98);

    expect(scene.visited).toEqual([PROSE.length - 1]);
    expect(hashes.at(-1)).toBe("#/calculus/walker/walkthrough/3");
    expect(main.querySelector(".wt-step")?.textContent).toContain(PROSE[PROSE.length - 1]);
  });

  it("rewrites a step on a scene that ships no walkthrough back to the plain scene", async () => {
    const { main, page, hashes } = harness(ok());

    await page.enter(
      lazy(() => fakeInstance()),
      1,
      2,
    );

    expect(hashes).toEqual(["#/calculus/one"]);
    expect(main.querySelector(".wt-step")?.children).toHaveLength(0);
  });

  it("rewrites the hash as the visitor advances, goes back, and finishes", async () => {
    const { main, page, hashes } = harness(ok());
    const scene = walkingViz(PROSE);
    await page.enter(scene.entry, 1);

    stepButton(main, "Walk me through it").click();
    expect(hashes.at(-1)).toBe("#/calculus/walker/walkthrough/1");

    stepButton(main, "Next").click();
    expect(hashes.at(-1)).toBe("#/calculus/walker/walkthrough/2");

    stepButton(main, "Back").click();
    expect(hashes.at(-1)).toBe("#/calculus/walker/walkthrough/1");

    stepButton(main, "Exit").click();
    expect(hashes.at(-1)).toBe("#/calculus/walker");
    expect(scene.exits).toHaveLength(1);
  });

  it("replaces history entries rather than pushing one per step", async () => {
    const replaceState = vi.spyOn(window.history, "replaceState");
    const pushState = vi.spyOn(window.history, "pushState");
    const main = document.createElement("div");
    // No replaceHash override: this exercises the real one.
    const page = createVizPage({
      main,
      header: { setBreadcrumb: () => {} },
      theme: new EventTarget() as ThemeColors,
      loop: fakeLoop(),
      getRenderer: () => ok(),
    });
    const scene = walkingViz(PROSE);

    await page.enter(scene.entry, 1);
    stepButton(main, "Walk me through it").click();

    expect(replaceState).toHaveBeenCalledWith(null, "", "#/calculus/walker/walkthrough/1");
    expect(pushState).not.toHaveBeenCalled();
  });

  it("drops the chrome and its key listener on leave", async () => {
    const { main, page } = harness(ok());
    const scene = walkingViz(PROSE);
    await page.enter(scene.entry, 1);
    stepButton(main, "Walk me through it").click();

    page.leave();
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));

    expect(scene.visited).toEqual([0]);
  });
});
