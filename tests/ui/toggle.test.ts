// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { createToggle } from "../../src/ui/toggle";

function checkbox(el: HTMLElement): HTMLInputElement {
  const node = el.querySelector("input[type=checkbox]");
  if (!node) throw new Error("checkbox not found");
  return node as HTMLInputElement;
}

describe("createToggle", () => {
  it("sets role=switch and keeps aria-checked in sync with checked", () => {
    const toggle = createToggle({ label: "Live update", checked: false, onChange: () => {} });
    const input = checkbox(toggle.el);

    expect(input.getAttribute("role")).toBe("switch");
    expect(input.getAttribute("aria-checked")).toBe("false");

    input.checked = true;
    input.dispatchEvent(new Event("change"));
    expect(input.getAttribute("aria-checked")).toBe("true");

    toggle.checked = false;
    expect(input.getAttribute("aria-checked")).toBe("false");
  });
});
