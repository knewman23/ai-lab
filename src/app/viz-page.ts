import type { Loop } from "../core/loop";
import { applySize } from "../core/renderer";
import { topicTitle, type Renderer, type ThemeColors, type Visualization } from "../viz/types";
import type { Header } from "./header";
import { createVizFrame, type VizFrame } from "./viz-frame";

/** The boot result; `rendererReady` never rejects, so a viz route can explain itself. */
export type RendererResult =
  | { readonly ok: true; readonly renderer: Renderer }
  | { readonly ok: false; readonly error: unknown };

export interface VizPageDeps {
  readonly main: HTMLElement;
  readonly header: Pick<Header, "setBreadcrumb">;
  readonly theme: ThemeColors;
  readonly loop: Loop;
  readonly rendererReady: Promise<RendererResult>;
}

export interface VizPage {
  enter(entry: Visualization, token: number): Promise<void>;
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
  let baseline = 0;

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
      if (import.meta.env.DEV && renderer) {
        const geometries = renderer.info.memory.geometries;
        if (geometries > baseline) {
          console.warn(`viz leaked geometries: ${baseline} -> ${geometries}`);
        }
      }
      instance = null;
    }
    renderer = null;
    baseline = 0;

    // The renderer outlives the route; only its host frame goes.
    frame?.el.remove();
    frame = null;
  }

  async function enter(entry: Visualization, token: number): Promise<void> {
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

    const result = await deps.rendererReady;
    // A leave() or a newer enter() happened while the renderer was booting.
    if (current !== token) return;

    if (!result.ok) {
      own.showNotice(
        notice(
          "This visualization needs WebGPU or WebGL 2",
          "This browser or GPU did not provide either, so the scene cannot be drawn here.",
        ),
      );
      if (import.meta.env.DEV) console.warn("renderer unavailable", result.error);
      return;
    }

    try {
      renderer = result.renderer;
      own.canvasContainer.replaceChildren(renderer.domElement);
      baseline = renderer.info.memory.geometries;

      const mounted = entry.mount({
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
        applySize(result.renderer, w, h);
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
      baseline = 0;
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
