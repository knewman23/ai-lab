// @vitest-environment jsdom
import type { Crumb } from "../../src/app/header";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Loop } from "../../src/core/loop";
import { createVizPage, type RendererResult } from "../../src/app/viz-page";
import type { Renderer, ThemeColors, VizInstance, Visualization } from "../../src/viz/types";

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

interface Harness {
  main: HTMLElement;
  crumbs: Crumb[][];
  loop: ReturnType<typeof fakeLoop>;
  page: ReturnType<typeof createVizPage>;
}

function harness(rendererReady: Promise<RendererResult>): Harness {
  const main = document.createElement("div");
  const crumbs: Crumb[][] = [];
  const loop = fakeLoop();
  const page = createVizPage({
    main,
    header: {
      setBreadcrumb(parts) {
        crumbs.push([...parts]);
      },
    },
    theme: new EventTarget() as ThemeColors,
    loop,
    rendererReady,
  });
  return { main, crumbs, loop, page };
}

const ok = (): Promise<RendererResult> => Promise.resolve({ ok: true, renderer: fakeRenderer() });

beforeEach(() => {
  vi.stubGlobal("ResizeObserver", FakeResizeObserver);
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
    await page.enter(viz(mount), 1);

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

    const first = page.enter(viz(stale, "stale"), 1);
    const second = page.enter(viz(fresh, "fresh"), 2);
    await Promise.all([first, second]);

    expect(stale).not.toHaveBeenCalled();
    expect(fresh).toHaveBeenCalledTimes(1);
    expect(main.querySelectorAll(".viz").length).toBe(1);
  });

  it("does not mount when leave() happens before the renderer resolves", async () => {
    const { main, loop, page } = harness(ok());
    const mount = vi.fn(() => fakeInstance());

    const pending = page.enter(viz(mount), 1);
    page.leave();
    await pending;

    expect(mount).not.toHaveBeenCalled();
    expect(loop.started).toBe(0);
    expect(main.querySelector(".viz")).toBeNull();
  });

  it("shows a notice when the renderer is unavailable", async () => {
    const { main, loop, page } = harness(
      Promise.resolve({ ok: false, error: new Error("no gpu") }),
    );
    const mount = vi.fn(() => fakeInstance());
    await page.enter(viz(mount), 1);

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

    await expect(page.enter(viz(mount), 1)).resolves.toBeUndefined();

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

  it("tolerates leave() before enter and twice in a row", async () => {
    const { main, page } = harness(ok());
    expect(() => {
      page.leave();
    }).not.toThrow();

    await page.enter(
      viz(() => fakeInstance()),
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
      viz(() => ({ ...fakeInstance(), dispose })),
      1,
    );
    page.leave();
    page.leave();
    expect(dispose).toHaveBeenCalledTimes(1);
  });
});
