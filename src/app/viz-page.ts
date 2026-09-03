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
  isCurrent(token: number): boolean;
}

const NOTEBOOK_URL = "https://github.com/knewman23/ai-frontier";

function noRendererNotice(): HTMLElement {
  const wrapper = document.createElement("div");
  const heading = document.createElement("h2");
  heading.textContent = "This visualization needs WebGPU or WebGL 2";
  const body = document.createElement("p");
  body.textContent =
    "This browser or GPU did not provide either, so the scene cannot be drawn here.";
  const link = document.createElement("a");
  link.href = NOTEBOOK_URL;
  link.textContent = "Read the notebook version on GitHub";
  wrapper.append(heading, body, link);
  return wrapper;
}

/** Owns one visualization at a time: mount, size, tick, and tear down. */
export function createVizPage(deps: VizPageDeps): VizPage {
  let current: number | null = null;
  let frame: VizFrame | null = null;
  let instance: ReturnType<Visualization["mount"]> | null = null;
  let observer: ResizeObserver | null = null;
  let listeners: AbortController | null = null;
  let renderer: Renderer | null = null;
  let baseline = 0;

  const isCurrent = (token: number): boolean => current === token;

  function leave(): void {
    current = null;
    deps.loop.stop();
    deps.loop.setTick(() => false);
    observer?.disconnect();
    observer = null;
    listeners?.abort();
    listeners = null;

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

    // The renderer outlives the route; only its host frame goes.
    frame?.el.remove();
    frame = null;
  }

  async function enter(entry: Visualization, token: number): Promise<void> {
    current = token;
    const own = createVizFrame();
    frame = own;
    deps.header.setBreadcrumb([topicTitle(entry.topic), entry.title]);
    own.showLoading();
    deps.main.append(own.el);

    const result = await deps.rendererReady;
    if (!isCurrent(token)) return;

    if (!result.ok) {
      own.showNotice(noRendererNotice());
      if (import.meta.env.DEV) console.warn("renderer unavailable", result.error);
      return;
    }

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
    for (const type of ["pointerdown", "pointermove", "wheel", "input", "change"] as const) {
      own.el.addEventListener(type, poke, { passive: true, signal: controller.signal });
    }

    deps.loop.setTick((dt) => mounted.update(dt));
    deps.loop.start();
  }

  return { enter, leave, isCurrent };
}
