export interface VizFrame {
  readonly el: HTMLElement;
  readonly canvasContainer: HTMLElement;
  readonly panel: HTMLElement;
  showLoading(): void;
  /** Terminal failure state: replaces the whole frame with a notice. */
  showNotice(node: HTMLElement): void;
}

/** The scene/panel layout a viz route mounts into. One frame per visit. */
export function createVizFrame(): VizFrame {
  const el = document.createElement("div");
  el.className = "viz";

  const canvasContainer = document.createElement("div");
  canvasContainer.className = "viz-canvas";

  const panel = document.createElement("aside");
  panel.className = "viz-panel";

  el.append(canvasContainer, panel);

  return {
    el,
    canvasContainer,
    panel,
    showLoading() {
      const loading = document.createElement("p");
      loading.className = "viz-loading lbl";
      loading.textContent = "Loading renderer…";
      canvasContainer.replaceChildren(loading);
    },
    showNotice(node) {
      // Out of the scene/panel grid: a notice is a page, not a viewport.
      el.className = "viz-notice";
      const notice = document.createElement("div");
      notice.className = "notice";
      notice.append(node);
      el.replaceChildren(notice);
    },
  };
}
