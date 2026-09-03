import { createLoop } from "../core/loop";
import { createThemeColors, watchTheme } from "../core/theme";
import { renderHeader } from "./header";
import { renderHome } from "./home";
import { REGISTRY } from "./registry";
import { createRouter } from "./router";
import { createVizPage, type RendererResult } from "./viz-page";

/**
 * Composes the page. The header, theme and router come up first and never
 * depend on the renderer, so the home page works even where WebGPU and
 * WebGL 2 are both missing, and never downloads Three.js.
 */
export function createShell(root: HTMLElement): void {
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
  // Both the renderer module and the renderer itself are created on the first
  // viz route and then reused: three/webgpu is ~650 kB the home page never needs.
  let rendererReady: Promise<RendererResult> | null = null;
  const getRenderer = (): Promise<RendererResult> => {
    rendererReady ??= (async (): Promise<RendererResult> => {
      try {
        const { applySize, createRenderer } = await import("../core/renderer");
        return { ok: true, renderer: await createRenderer(holder), applySize };
      } catch (error) {
        return { ok: false, error };
      }
    })();
    return rendererReady;
  };

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
    vizPage.enter(route.entry, token).catch((error: unknown) => {
      // enter() handles its own failures; this is the backstop.
      if (import.meta.env.DEV) console.error("viz route failed", error);
    });
  });

  router.start();
}
