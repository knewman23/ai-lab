// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createWalkthroughChrome } from "../../src/app/walkthrough";
import type { StepView, WalkthroughInstance } from "../../src/viz/types";

const PROSE = [
  "Drag the ball downhill and the arrow will follow it.",
  "Step the optimizer once and a new point joins the trail.",
  "Switch to the ravine to see the two optimizers disagree.",
];

/** A stand-in scene walkthrough: records what the chrome asked it to do. */
function fakeWalkthrough(): WalkthroughInstance & {
  readonly visited: number[];
  readonly exits: number[];
} {
  const visited: number[] = [];
  const exits: number[] = [];
  return {
    title: "Walk me through it",
    length: PROSE.length,
    visited,
    exits,
    goTo(index: number): StepView {
      const prose = PROSE[index];
      if (prose === undefined) {
        throw new RangeError(`step index ${index} is outside 0…${PROSE.length - 1}`);
      }
      visited.push(index);
      return { index, total: PROSE.length, prose };
    },
    exit(): void {
      exits.push(visited.length);
    },
  };
}

function harness() {
  const wrapper = document.createElement("div");
  const banner = document.createElement("div");
  const step = document.createElement("div");
  wrapper.append(banner, step);
  document.body.replaceChildren(wrapper);

  const walkthrough = fakeWalkthrough();
  const onStepChange = vi.fn();
  const chrome = createWalkthroughChrome({
    wrapper,
    banner,
    step,
    walkthrough,
    onStepChange,
  });
  return { wrapper, banner, step, walkthrough, onStepChange, chrome };
}

function button(root: HTMLElement, label: string): HTMLButtonElement {
  const found = [...root.querySelectorAll("button")].find((b) => b.textContent === label);
  if (!found) {
    throw new Error(`no "${label}" button in ${root.innerHTML}`);
  }
  return found;
}

beforeEach(() => {
  document.body.replaceChildren();
  Element.prototype.scrollIntoView = vi.fn();
});

describe("createWalkthroughChrome", () => {
  it("offers the walkthrough's own title as the start control, and no step card", () => {
    const { banner, step, walkthrough } = harness();

    expect(button(banner, walkthrough.title)).toBeDefined();
    expect(step.children).toHaveLength(0);
  });

  it("starts at the first step when the start control is pressed", () => {
    const { banner, step, walkthrough, onStepChange } = harness();

    button(banner, walkthrough.title).click();

    expect(walkthrough.visited).toEqual([0]);
    expect(step.textContent).toContain(PROSE[0]);
    expect(onStepChange).toHaveBeenCalledWith(0);
  });

  it("shows the 1-based position and the total in the banner", () => {
    const { banner, chrome } = harness();

    chrome.show(1);

    expect(banner.textContent).toContain("2");
    expect(banner.textContent).toContain("3");
    expect(banner.textContent?.toLowerCase()).toContain("walkthrough");
  });

  it("marks the wrapper active while a walkthrough is running", () => {
    const { wrapper, chrome } = harness();

    expect(wrapper.classList.contains("wt-active")).toBe(false);
    chrome.show(0);
    expect(wrapper.classList.contains("wt-active")).toBe(true);
    chrome.exit();
    expect(wrapper.classList.contains("wt-active")).toBe(false);
  });

  it("disables Back on the first step and enables it after advancing", () => {
    const { step, chrome } = harness();

    chrome.show(0);
    expect(button(step, "Back").disabled).toBe(true);

    button(step, "Next").click();
    expect(button(step, "Back").disabled).toBe(false);
  });

  it("advances and retreats through the steps", () => {
    const { step, walkthrough, chrome } = harness();

    chrome.show(0);
    button(step, "Next").click();
    button(step, "Next").click();
    expect(step.textContent).toContain(PROSE[2]);

    button(step, "Back").click();
    expect(step.textContent).toContain(PROSE[1]);
    expect(walkthrough.visited).toEqual([0, 1, 2, 1]);
  });

  it("reads Finish on the last step and exits when it is pressed", () => {
    const { banner, step, walkthrough, onStepChange, wrapper } = harness();

    // Reach the last step through the chrome itself.
    button(banner, walkthrough.title).click();
    button(step, "Next").click();
    button(step, "Next").click();

    expect(button(step, "Finish")).toBeDefined();
    button(step, "Finish").click();

    expect(walkthrough.exits).toHaveLength(1);
    expect(wrapper.classList.contains("wt-active")).toBe(false);
    expect(onStepChange).toHaveBeenLastCalledWith(undefined);
  });

  it("Exit restores the scene and puts the start control back", () => {
    const { banner, step, walkthrough, onStepChange, chrome } = harness();

    chrome.show(1);
    button(banner, "Exit").click();

    expect(walkthrough.exits).toHaveLength(1);
    expect(step.children).toHaveLength(0);
    expect(button(banner, walkthrough.title)).toBeDefined();
    expect(onStepChange).toHaveBeenLastCalledWith(undefined);
  });

  it("scrolls the step card into view on each advance", () => {
    const { step, chrome } = harness();
    const scroll = vi.spyOn(Element.prototype, "scrollIntoView");

    chrome.show(0);
    expect(scroll).toHaveBeenCalledTimes(1);
    button(step, "Next").click();
    expect(scroll).toHaveBeenCalledTimes(2);
  });

  it("advances on the right arrow, retreats on the left and exits on Escape", () => {
    const { walkthrough, chrome } = harness();

    chrome.show(0);
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
    expect(walkthrough.visited).toEqual([0, 1]);

    document.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true }));
    expect(walkthrough.visited).toEqual([0, 1, 0]);

    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(walkthrough.exits).toHaveLength(1);
  });

  it("stays put at either end rather than throwing on an arrow key", () => {
    const { walkthrough, chrome } = harness();

    chrome.show(0);
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true }));
    expect(walkthrough.visited).toEqual([0]);

    chrome.show(PROSE.length - 1);
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
    expect(walkthrough.visited).toEqual([0, PROSE.length - 1]);
    expect(walkthrough.exits).toHaveLength(0);
  });

  it.each(["input", "select", "textarea"])("ignores the keys while focus is inside a %s", (tag) => {
    const { walkthrough, chrome } = harness();
    chrome.show(0);

    const field = document.createElement(tag);
    document.body.append(field);
    field.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
    field.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true }));
    field.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));

    expect(walkthrough.visited).toEqual([0]);
    expect(walkthrough.exits).toHaveLength(0);
  });

  it("ignores the keys when no walkthrough is running", () => {
    const { walkthrough } = harness();

    document.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));

    expect(walkthrough.visited).toEqual([]);
  });

  it("dispose() drops the key listener and the chrome", () => {
    const { banner, step, walkthrough, chrome } = harness();

    chrome.show(0);
    chrome.dispose();

    document.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));

    expect(walkthrough.visited).toEqual([0]);
    expect(banner.children).toHaveLength(0);
    expect(step.children).toHaveLength(0);
  });
});
