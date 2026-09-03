export interface UsageHint {
  readonly el: HTMLElement;
  /** Hides the hint and remembers the dismissal; safe to call more than once. */
  hide(): void;
  dispose(): void;
}

const STORAGE_KEY = "ai-lab.hint.gradient-descent";

const LINES = [
  "Drag the ball to move it, or click anywhere on the surface to place it.",
  "Drag the background to orbit; scroll to zoom; right-drag (or two fingers) to pan.",
  "Step or Run in the panel; Reset view re-frames the camera.",
];

/** Storage is unavailable in private modes and some embeddings; showing the hint is the safe default. */
function dismissed(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

function remember(): void {
  try {
    localStorage.setItem(STORAGE_KEY, "1");
  } catch {
    // Nothing to remember it with; the hint just returns next visit.
  }
}

/**
 * The overlay that tells a first-time visitor how to work the scene. It is a
 * sibling of the canvas rather than a child, so it only takes pointer events
 * inside its own box and the rest of the viewport still orbits.
 *
 * Already dismissed on a previous visit? The element is still returned, but it
 * is never attached, so callers need no special case.
 */
export function createUsageHint(container: HTMLElement): UsageHint {
  const el = document.createElement("div");
  el.className = "canvas-hint";
  el.setAttribute("role", "note");

  const heading = document.createElement("h3");
  heading.className = "lbl";
  heading.textContent = "How to explore";

  const list = document.createElement("ul");
  for (const line of LINES) {
    const item = document.createElement("li");
    item.textContent = line;
    list.append(item);
  }

  const button = document.createElement("button");
  button.type = "button";
  button.textContent = "Got it";

  el.append(heading, list, button);

  let hidden = dismissed();

  function hide(): void {
    if (hidden) return;
    hidden = true;
    el.remove();
    remember();
  }

  button.addEventListener("click", hide);

  if (!hidden) container.append(el);

  return {
    el,
    hide,
    dispose(): void {
      button.removeEventListener("click", hide);
      el.remove();
    },
  };
}
