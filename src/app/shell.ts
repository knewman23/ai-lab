import { createLoop } from "../core/loop";
import { createRenderer } from "../core/renderer";
import { createThemeColors, watchTheme } from "../core/theme";
import { renderHeader } from "./header";
import { renderHome } from "./home";
import { REGISTRY } from "./registry";
import { createRouter } from "./router";
import { createVizPage, type RendererResult } from "./viz-page";

/**
 * Composes the page. The header, theme and router come up first and never
 * depend on the renderer, so the home page works even where WebGPU and
 * WebGL 2 are both missing.
 */
export function createShell(root: HTMLElement): void {
  const header = renderHeader();
  const main = document.createElement("main");
  root.replaceChildren(header.el, main);

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
  // needs it, so boot can start before the first route is known.
  const holder = document.createElement("div");
  const rendererReady: Promise<RendererResult> = createRenderer(holder).then(
    (renderer) => ({ ok: true, renderer }) as const,
    (error: unknown) => ({ ok: false, error }) as const,
  );

  const vizPage = createVizPage({ main, header, theme, loop, rendererReady });

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
