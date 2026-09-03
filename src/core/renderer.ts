import { WebGPUBackend, WebGPURenderer } from "three/webgpu";
import type { Renderer } from "../viz/types";

/** Retina is worth one extra pixel step, not four. */
function pixelRatio(): number {
  return Math.min(window.devicePixelRatio, 2);
}

/**
 * Creates the single renderer the shell owns, attaches its canvas to `container`
 * and initialises the backend. Initialisation failures propagate to the caller.
 */
export async function createRenderer(container: HTMLElement): Promise<Renderer> {
  const renderer = new WebGPURenderer({ antialias: true });
  renderer.setPixelRatio(pixelRatio());

  const canvas = renderer.domElement;
  canvas.style.display = "block";
  canvas.style.width = "100%";
  canvas.style.height = "100%";
  canvas.style.touchAction = "none";
  container.appendChild(canvas);

  try {
    await renderer.init();
  } catch (error) {
    // Leave nothing behind for the caller's fallback UI to fight with.
    canvas.remove();
    renderer.dispose();
    throw error;
  }
  return renderer;
}

/** Resizes the drawing buffer without touching the canvas's CSS size. */
export function applySize(renderer: Renderer, w: number, h: number): void {
  renderer.setPixelRatio(pixelRatio());
  renderer.setSize(w, h, false);
}

/** Which backend the renderer actually got, for the status line. */
export function backendName(renderer: Renderer): "webgpu" | "webgl2" {
  return renderer.backend instanceof WebGPUBackend ? "webgpu" : "webgl2";
}
