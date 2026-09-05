// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { createControlFocus } from "../../../src/viz/shared/control-focus";

type Id = "first" | "second";

function registry(): Readonly<Record<Id, HTMLElement>> {
  return { first: document.createElement("div"), second: document.createElement("div") };
}

describe("createControlFocus", () => {
  it("outlines the named control", () => {
    const controls = registry();
    createControlFocus(controls)("first");

    expect(controls.first.classList.contains("is-focused")).toBe(true);
    expect(controls.second.classList.contains("is-focused")).toBe(false);
  });

  it("moves the outline rather than accumulating outlines", () => {
    const controls = registry();
    const focus = createControlFocus(controls);

    focus("first");
    focus("second");

    expect(controls.first.classList.contains("is-focused")).toBe(false);
    expect(controls.second.classList.contains("is-focused")).toBe(true);
  });

  it("clears the outline on undefined", () => {
    const controls = registry();
    const focus = createControlFocus(controls);

    focus("second");
    focus(undefined);

    expect(controls.second.classList.contains("is-focused")).toBe(false);
  });

  it("throws when a union member was declared but never registered", () => {
    const controls = { first: document.createElement("div") } as unknown as Record<Id, HTMLElement>;
    expect(() => createControlFocus(controls)("second")).toThrow(/never registered/);
  });
});
