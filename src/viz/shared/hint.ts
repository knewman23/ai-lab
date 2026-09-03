export interface UsageHint {
  readonly el: HTMLElement;
  /** Hides the hint and remembers the dismissal; safe to call more than once. */
  hide(): void;
  dispose(): void;
}

export interface UsageHintSpec {
  /** localStorage key the dismissal is remembered under; one per visualization. */
  readonly storageKey: string;
  readonly heading?: string;
  readonly lines: readonly string[];
}

const DEFAULT_HEADING = "How to explore";

/** Storage is unavailable in private modes and some embeddings; showing the hint is the safe default. */
function dismissed(key: string): boolean {
  try {
    return localStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}

function remember(key: string): void {
  try {
    localStorage.setItem(key, "1");
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
export function createUsageHint(container: HTMLElement, spec: UsageHintSpec): UsageHint {
  const el = document.createElement("div");
  el.className = "canvas-hint";
  el.setAttribute("role", "note");

  const heading = document.createElement("h3");
  heading.className = "lbl";
  heading.textContent = spec.heading ?? DEFAULT_HEADING;

  const list = document.createElement("ul");
  for (const line of spec.lines) {
    const item = document.createElement("li");
    item.textContent = line;
    list.append(item);
  }

  const button = document.createElement("button");
  button.type = "button";
  button.textContent = "Got it";

  el.append(heading, list, button);

  let hidden = dismissed(spec.storageKey);

  function hide(): void {
    if (hidden) return;
    hidden = true;
    el.remove();
    remember(spec.storageKey);
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
