import { createLoop } from "../core/loop";
import { createThemeColors, watchTheme } from "../core/theme";
import { renderHeader } from "./header";
import { renderHome } from "./home";
import { REGISTRY } from "./registry";
import { createRouter } from "./router";
import type { Renderer } from "../viz/types";
import { createVizPage, type RendererResult } from "./viz-page";

/** The part of core/renderer.ts the shell needs, so tests can stand in for it. */
export interface RendererModule {
  createRenderer: (container: HTMLElement) => Promise<Renderer>;
  applySize: (renderer: Renderer, w: number, h: number) => void;
}

export interface ShellDeps {
  /** Defaults to the real dynamic import; tests inject a stub. */
  readonly importRenderer?: () => Promise<RendererModule>;
}

const importRendererModule = (): Promise<RendererModule> => import("../core/renderer");

/**
 * The renderer is created on the first viz route and shared from then on:
 * three/webgpu is the bulk of the bundle and the home page never needs it.
 *
 * Downloading the module and creating the renderer are separate failures. A
 * module that did not arrive is transient, so it is not memoised and the next
 * route tries again; a machine without WebGPU or WebGL 2 will not grow one, so
 * that result is memoised and every later route reuses it.
 */
export function createRendererGate(
  holder: HTMLElement,
  importRenderer: () => Promise<RendererModule> = importRendererModule,
): () => Promise<RendererResult> {
  let pending: Promise<RendererResult> | null = null;

  return (): Promise<RendererResult> => {
    if (pending) return pending;

    const attempt = (async (): Promise<RendererResult> => {
      let module: RendererModule;
      try {
        module = await importRenderer();
      } catch (error) {
        return { ok: false, reason: "load", error };
      }
      try {
        const renderer = await module.createRenderer(holder);
        return { ok: true, renderer, applySize: module.applySize };
      } catch (error) {
        return { ok: false, reason: "gpu", error };
      }
    })();

    pending = attempt;
    // Clearing here, rather than inside the attempt, keeps the memo correct even
    // if the importer throws before its first await.
    void attempt.then((result) => {
      if (!result.ok && result.reason === "load" && pending === attempt) pending = null;
    });
    return attempt;
  };
}

/**
 * Composes the page. The header, theme and router come up first and never
 * depend on the renderer, so the home page works even where WebGPU and
 * WebGL 2 are both missing, and never downloads Three.js.
 */
export function createShell(root: HTMLElement, deps: ShellDeps = {}): void {
  const header = renderHeader();
  const main = document.createElement("main");
  main.id = "main";
  // Focusable only as the skip link's target, never in the tab order itself.
  main.tabIndex = -1;

  const skip = document.createElement("a");
  skip.className = "skip";
  skip.href = "#main";
  skip.textContent = "Skip to content";
  skip.addEventListener("click", (event) => {
    // Routing reads the hash, so letting "#main" land would navigate home.
    event.preventDefault();
    main.focus();
  });

  root.replaceChildren(skip, header.el, main);

  const theme = createThemeColors();
  // The shell lives for the page lifetime, so this disposer is never called;
  // it is kept in a local so the ownership is explicit rather than dropped.
  const stopWatchingTheme = watchTheme(theme);
  void stopWatchingTheme;
  const loop = createLoop();
  theme.addEventListener("change", () => {
    loop.poke();
  });

  // The canvas is born in a detached holder and moves into whichever frame
  // needs it, so it survives navigation between scenes.
  const holder = document.createElement("div");
  const getRenderer = createRendererGate(holder, deps.importRenderer);

  const vizPage = createVizPage({ main, header, theme, loop, getRenderer });

  let token = 0;
  let homePage: HTMLElement | null = null;
  const router = createRouter((route) => {
    // The router resolves redirects itself; only home and viz arrive here.
    if (route.kind === "redirect") return;
    // The viz page owns its own frame subtree and removes it in leave();
    // the shell only owns the home page it appends here.
    vizPage.leave();
    if (route.kind === "home") {
      header.setBreadcrumb([]);
      homePage = renderHome(REGISTRY);
      main.replaceChildren(homePage);
      // `#/<topic>` lands on that topic's section; plain home starts at the top.
      const target = route.topic ? homePage.querySelector(`#topic-${route.topic}`) : null;
      if (target) target.scrollIntoView();
      else window.scrollTo(0, 0);
      return;
    }
    homePage?.remove();
    homePage = null;
    token += 1;
    vizPage.enter(route.entry, token, route.step).catch((error: unknown) => {
      // enter() handles its own failures; this is the backstop.
      if (import.meta.env.DEV) console.error("viz route failed", error);
    });
  });

  router.start();
}
