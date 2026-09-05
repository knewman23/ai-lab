// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { createInfoButton, type ControlInfo } from "../../src/ui/info";

const INFO: ControlInfo = {
  what: "Sets how far the optimizer moves along the downhill direction at each step.",
  why: "Too small and the run crawls; too large and it overshoots the valley and leaves the domain.",
};

describe("createInfoButton", () => {
  it("gives the button an accessible name naming the control", () => {
    const { button } = createInfoButton("Learning rate", INFO);
    expect(button.getAttribute("aria-label")).toBe("What Learning rate does");
    expect(button.type).toBe("button");
  });

  it("points the button at its own popover", () => {
    const { button, popover } = createInfoButton("Learning rate", INFO);
    expect(popover.id).not.toBe("");
    expect(button.getAttribute("popovertarget")).toBe(popover.id);
    expect(popover.getAttribute("popover")).toBe("auto");
  });

  it("titles the popover with the control and carries both halves of the copy", () => {
    const { popover } = createInfoButton("Learning rate", INFO);
    expect(popover.querySelector("h4")?.textContent).toBe("Learning rate");
    expect(popover.textContent).toContain(INFO.what);
    expect(popover.textContent).toContain(INFO.why);
  });

  it("gives two controls different popovers, so one button cannot open another's", () => {
    const a = createInfoButton("Surface", INFO);
    const b = createInfoButton("Optimizer", INFO);
    expect(a.popover.id).not.toBe(b.popover.id);
    expect(a.button.getAttribute("popovertarget")).not.toBe(b.button.getAttribute("popovertarget"));
  });
});
