/**
 * The "what does this do?" button that sits beside a control's label.
 *
 * A native popover rather than a positioned div: the panel is a scroll container, so anything
 * absolutely positioned inside it is clipped at the panel's edge. A popover renders in the top
 * layer, which escapes that, and brings light dismiss and Escape with it for free.
 */

export interface ControlInfo {
  /** What the control does, in one or two sentences. */
  readonly what: string;
  /** Why it is there: what changes, and what is worth watching. */
  readonly why: string;
}

export interface InfoButton {
  /** The button itself, to sit next to the label. */
  readonly button: HTMLButtonElement;
  /** The panel it opens. Must be in the document for the popover to work. */
  readonly popover: HTMLElement;
}

let nextId = 0;

/** How far the popover sits from the button, in pixels. */
const GAP = 8;
/** Kept clear of the viewport edges so the panel never opens half off screen. */
const MARGIN = 12;

/**
 * jsdom implements neither the popover API nor layout, so both are treated as optional: the
 * markup is what the tests assert, and the browser supplies the behaviour.
 */
function supportsPopover(el: HTMLElement): boolean {
  return typeof (el as { showPopover?: unknown }).showPopover === "function";
}

function place(popover: HTMLElement, button: HTMLElement): void {
  const anchor = button.getBoundingClientRect();
  const own = popover.getBoundingClientRect();
  if (own.width === 0) return;

  // Prefer directly below the button, flipping above when there is no room.
  const below = anchor.bottom + GAP;
  const top =
    below + own.height + MARGIN > window.innerHeight && anchor.top - own.height - GAP > MARGIN
      ? anchor.top - own.height - GAP
      : below;

  // Right-aligned to the button, then pulled back inside the viewport.
  const wanted = anchor.right - own.width;
  const left = Math.max(MARGIN, Math.min(wanted, window.innerWidth - own.width - MARGIN));

  popover.style.top = `${Math.round(top)}px`;
  popover.style.left = `${Math.round(left)}px`;
}

/** `label` names the control the info is about; it titles the popover and the button's aria-label. */
export function createInfoButton(label: string, info: ControlInfo): InfoButton {
  const id = `info-${++nextId}`;

  const button = document.createElement("button");
  button.type = "button";
  button.className = "info-button";
  button.textContent = "i";
  button.setAttribute("aria-label", `What ${label} does`);
  button.setAttribute("popovertarget", id);

  const popover = document.createElement("div");
  popover.id = id;
  popover.className = "info-popover";
  popover.setAttribute("popover", "auto");

  const title = document.createElement("h4");
  title.className = "lbl";
  title.textContent = label;

  const what = document.createElement("p");
  what.textContent = info.what;

  const why = document.createElement("p");
  why.className = "info-why";
  why.textContent = info.why;

  popover.append(title, what, why);

  if (supportsPopover(popover)) {
    // Positioned as it opens: the button's place on screen changes as the panel scrolls.
    popover.addEventListener("beforetoggle", (event: ToggleEvent) => {
      if (event.newState === "open") {
        // Measured after the browser has laid it out, which happens on the same frame.
        requestAnimationFrame(() => {
          place(popover, button);
        });
      }
    });
  }

  return { button, popover };
}

/**
 * The label and, when there is any, its info button — the row that sits above a control. The
 * popover rides along in the same row so callers never have to place it themselves.
 */
export function labelRow(label: HTMLElement, name: string, info?: ControlInfo): HTMLElement {
  if (!info) return label;

  const row = document.createElement("div");
  row.className = "lbl-row";
  const { button, popover } = createInfoButton(name, info);
  row.append(label, button, popover);
  return row;
}
