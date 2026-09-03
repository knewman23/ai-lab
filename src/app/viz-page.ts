import type { Loop } from "../core/loop";
import {
  topicTitle,
  type LazyVisualization,
  type Renderer,
  type ThemeColors,
  type Visualization,
} from "../viz/types";
import type { Header } from "./header";
import { createVizFrame, type VizFrame } from "./viz-frame";

/**
 * The renderer boot result; `getRenderer()` never rejects, so a viz route can
 * explain itself. `applySize` rides along because it lives in the same module as
 * the `three/webgpu` import, which must stay out of the shell's static graph.
 *
 * A failure says which half failed: "load" is the renderer chunk not arriving,
 * which reads to the visitor exactly like a scene chunk not arriving, and "gpu"
 * is the machine having neither WebGPU nor WebGL 2.
 */
export type RendererResult =
  | {
      readonly ok: true;
      readonly renderer: Renderer;
      readonly applySize: (renderer: Renderer, w: number, h: number) => void;
    }
  | { readonly ok: false; readonly reason: "load" | "gpu"; readonly error: unknown };

export interface VizPageDeps {
  readonly main: HTMLElement;
  readonly header: Pick<Header, "setBreadcrumb">;
  readonly theme: ThemeColors;
  readonly loop: Loop;
  /** Memoised: creates the renderer on the first viz route, once per page load. */
  readonly getRenderer: () => Promise<RendererResult>;
}

export interface VizPage {
  enter(entry: LazyVisualization, token: number): Promise<void>;
  leave(): void;
}

const NOTEBOOK_URL = "https://github.com/knewman23/ai-frontier";

/** Plain HTML, so it renders whatever the renderer and the viz managed to do. */
function notice(heading: string, body: string): HTMLElement {
  const wrapper = document.createElement("div");
  const title = document.createElement("h2");
  title.textContent = heading;
  const text = document.createElement("p");
  text.textContent = body;
  const link = document.createElement("a");
  link.href = NOTEBOOK_URL;
  link.textContent = "Read the notebook version on GitHub";
  wrapper.append(title, text, link);
  return wrapper;
}

/** Shown when a chunk did not arrive, whichever chunk it was. */
function notLoadedNotice(): HTMLElement {
  return notice("This visualization failed to start", "This visualization could not be loaded.");
}

const POKE_EVENTS = [
  "pointerdown",
  "pointermove",
  "wheel",
  "click",
  "keydown",
  "input",
  "change",
] as const;

/** Owns one visualization at a time: mount, size, tick, and tear down. */
export function createVizPage(deps: VizPageDeps): VizPage {
  let current: number | null = null;
  let frame: VizFrame | null = null;
  let instance: ReturnType<Visualization["mount"]> | null = null;
  let observer: ResizeObserver | null = null;
  let listeners: AbortController | null = null;
  let renderer: Renderer | null = null;
  // DEV leak check. `renderer.info.memory.geometries` counts geometries uploaded and not yet
  // disposed for the renderer's whole lifetime, and three keeps some shared geometry alive on
  // purpose (ArrowHelper's module-level line and cone), so a pre-mount vs post-dispose
  // comparison false-positives on the first visit. Instead we remember the post-dispose count
  // per visualization id and warn only when a later visit leaves more behind than the last one:
  // that is the signature of a real per-mount leak.
  const highWater = new Map<string, number>();
  let currentId: string | null = null;

  /** Everything a running viz holds, minus the frame and the instance itself. */
  function stopDriving(): void {
    deps.loop.stop();
    deps.loop.setTick(() => false);
    observer?.disconnect();
    observer = null;
    listeners?.abort();
    listeners = null;
  }

  function leave(): void {
    current = null;
    stopDriving();

    if (instance) {
      instance.dispose();
      if (import.meta.env.DEV && renderer && currentId) {
        const geometries = renderer.info.memory.geometries;
        const previous = highWater.get(currentId);
        if (previous !== undefined && geometries > previous) {
          console.warn(`viz "${currentId}" leaked geometries: ${previous} -> ${geometries}`);
        }
        highWater.set(currentId, geometries);
      }
      instance = null;
    }
    renderer = null;
    currentId = null;

    // The renderer outlives the route; only its host frame goes.
    frame?.el.remove();
    frame = null;
  }

  async function enter(entry: LazyVisualization, token: number): Promise<void> {
    // Self-contained: an enter() without a leave() still leaves one frame behind.
    leave();
    current = token;
    const own = createVizFrame();
    frame = own;
    deps.header.setBreadcrumb([
      { text: topicTitle(entry.topic), href: `#/${entry.topic}` },
      entry.title,
    ]);
    own.showLoading();
    deps.main.append(own.el);

    // The renderer boots while the visualization's chunk downloads.
    let result: RendererResult;
    let viz: Visualization;
    try {
      [result, viz] = await Promise.all([deps.getRenderer(), entry.load()]);
    } catch (error) {
      // Only load() can reject here; getRenderer() reports failure in its result.
      if (current !== token) return;
      own.showNotice(notLoadedNotice());
      if (import.meta.env.DEV) console.error("visualization chunk failed to load", error);
      return;
    }
    // A leave() or a newer enter() happened while those were in flight.
    if (current !== token) return;

    if (!result.ok) {
      own.showNotice(
        result.reason === "load"
          ? notLoadedNotice()
          : notice(
              "This visualization needs WebGPU or WebGL 2",
              "This browser or GPU did not provide either, so the scene cannot be drawn here.",
            ),
      );
      if (import.meta.env.DEV) console.warn("renderer unavailable", result.reason, result.error);
      return;
    }

    try {
      renderer = result.renderer;
      own.canvasContainer.replaceChildren(renderer.domElement);
      currentId = entry.id;

      const mounted = viz.mount({
        canvasContainer: own.canvasContainer,
        panel: own.panel,
        renderer,
        theme: deps.theme,
      });
      instance = mounted;

      const fit = (): void => {
        const w = own.canvasContainer.clientWidth;
        const h = own.canvasContainer.clientHeight;
        if (w === 0 || h === 0) return;
        result.applySize(result.renderer, w, h);
        mounted.resize(w, h);
        deps.loop.poke();
      };

      observer = new ResizeObserver(fit);
      observer.observe(own.canvasContainer);
      fit();

      const controller = new AbortController();
      listeners = controller;
      const poke = (): void => {
        deps.loop.poke();
      };
      for (const type of POKE_EVENTS) {
        own.el.addEventListener(type, poke, { passive: true, signal: controller.signal });
      }

      deps.loop.setTick((dt) => mounted.update(dt));
      deps.loop.start();
    } catch (error) {
      stopDriving();
      try {
        // Best effort: a viz that threw mid-mount may still hold GPU resources,
        // and its dispose() is as likely to throw as its mount() was.
        instance?.dispose();
      } catch {
        /* the original error is the one worth reporting */
      }
      instance = null;
      renderer = null;
      currentId = null;
      own.showNotice(
        notice(
          "This visualization failed to start",
          "Something went wrong while building the scene, so it cannot be shown here.",
        ),
      );
      if (import.meta.env.DEV) console.error("visualization failed to start", error);
    }
  }

  return { enter, leave };
}
