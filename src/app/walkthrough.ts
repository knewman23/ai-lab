import { createButton } from "../ui/button";
import type { WalkthroughInstance } from "../viz/types";

export interface WalkthroughChromeDeps {
  /** Carries `.wt-active`, which collapses the scene panel's explanation section. */
  readonly wrapper: HTMLElement;
  readonly banner: HTMLElement;
  readonly step: HTMLElement;
  readonly walkthrough: WalkthroughInstance;
  /** The index now showing, or undefined once the walkthrough has been left. */
  readonly onStepChange: (index: number | undefined) => void;
  readonly keyTarget?: EventTarget;
}

export interface WalkthroughChrome {
  /** Shows one step. The index must already be in range — the viz page clamps. */
  show(index: number): void;
  exit(): void;
  dispose(): void;
}

/**
 * Arrow keys and Escape belong to a text field or a slider whenever one has
 * focus; stealing them there would make the panel's own controls unusable.
 */
function inFormControl(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  return ["INPUT", "SELECT", "TEXTAREA"].includes(target.tagName);
}

/**
 * The shell's half of walkthrough mode: a banner, a step card, and the keys.
 * It reads `StepView` only and never inspects a scene's state.
 */
export function createWalkthroughChrome(deps: WalkthroughChromeDeps): WalkthroughChrome {
  const { wrapper, banner, step: stepHost, walkthrough, onStepChange } = deps;
  let index: number | undefined;

  function renderStart(): void {
    const start = createButton({
      label: walkthrough.title,
      onClick: () => {
        show(0);
      },
    });
    start.el.classList.add("wt-start");
    banner.replaceChildren(start.el);
    stepHost.replaceChildren();
  }

  function show(next: number): void {
    // Only when the walkthrough starts, never on a later step: a visitor who opens the overview
    // mid-walkthrough keeps it open.
    const starting = index === undefined;
    const view = walkthrough.goTo(next);
    index = view.index;

    if (starting) {
      for (const overview of wrapper.querySelectorAll('details[data-role="overview"]')) {
        if (overview instanceof HTMLDetailsElement) overview.open = false;
      }
    }

    const progress = document.createElement("span");
    progress.className = "wt-progress lbl";
    progress.textContent = `Walkthrough · ${view.index + 1}/${view.total}`;
    const exitBtn = createButton({ label: "Exit", onClick: exit });
    banner.replaceChildren(progress, exitBtn.el);

    const card = document.createElement("div");
    card.className = "wt-card";

    const number = document.createElement("p");
    number.className = "wt-number lbl";
    number.textContent = `Step ${view.index + 1}`;

    const prose = document.createElement("p");
    prose.className = "wt-prose";
    prose.textContent = view.prose;

    const isLast = view.index === view.total - 1;
    const back = createButton({
      label: "Back",
      onClick: () => {
        show(view.index - 1);
      },
    });
    back.setDisabled(view.index === 0);
    const forward = createButton({
      label: isLast ? "Finish" : "Next",
      variant: "primary",
      onClick: () => {
        if (isLast) exit();
        else show(view.index + 1);
      },
    });

    const row = document.createElement("div");
    row.className = "btn-row";
    row.setAttribute("role", "group");
    row.setAttribute("aria-label", "Walkthrough steps");
    row.append(back.el, forward.el);

    card.append(number, prose, row);
    stepHost.replaceChildren(card);
    wrapper.classList.add("wt-active");
    onStepChange(view.index);
    // The card sits low in a long panel; a viewer who scrolled up must not have
    // to hunt for it. Optional because jsdom does not implement it.
    card.scrollIntoView?.({ block: "nearest" });
  }

  function exit(): void {
    index = undefined;
    walkthrough.exit();
    wrapper.classList.remove("wt-active");
    renderStart();
    onStepChange(undefined);
  }

  function onKeyDown(event: Event): void {
    if (index === undefined) return;
    if (!(event instanceof KeyboardEvent)) return;
    if (inFormControl(event.target)) return;

    if (event.key === "Escape") {
      exit();
    } else if (event.key === "ArrowRight") {
      if (index < walkthrough.length - 1) show(index + 1);
    } else if (event.key === "ArrowLeft") {
      if (index > 0) show(index - 1);
    } else {
      return;
    }
    event.preventDefault();
  }

  const keyTarget = deps.keyTarget ?? document;
  keyTarget.addEventListener("keydown", onKeyDown);
  renderStart();

  return {
    show,
    exit,
    dispose(): void {
      keyTarget.removeEventListener("keydown", onKeyDown);
      index = undefined;
      banner.replaceChildren();
      stepHost.replaceChildren();
      wrapper.classList.remove("wt-active");
    },
  };
}
