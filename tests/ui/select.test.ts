// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { createSelect } from "../../src/ui/select";

function select(el: HTMLElement): HTMLSelectElement {
  const node = el.querySelector("select");
  if (!node) throw new Error("select not found");
  return node;
}

describe("createSelect", () => {
  it("renders a disabled option with the disabled attribute", () => {
    const s = createSelect({
      label: "Mode",
      options: [
        { value: "a", title: "A" },
        { value: "custom", title: "Custom", disabled: true },
      ],
      value: "a",
      onChange: () => {},
    });
    const options = select(s.el).querySelectorAll("option");
    const custom = Array.from(options).find((o) => o.value === "custom");
    expect(custom).toBeDefined();
    expect(custom?.disabled).toBe(true);
  });

  it("does not mark a non-disabled option as disabled", () => {
    const s = createSelect({
      label: "Mode",
      options: [{ value: "a", title: "A" }],
      value: "a",
      onChange: () => {},
    });
    const options = select(s.el).querySelectorAll("option");
    const a = Array.from(options).find((o) => o.value === "a");
    expect(a?.disabled).toBe(false);
  });

  it("allows programmatically selecting a disabled option", () => {
    const s = createSelect({
      label: "Mode",
      options: [
        { value: "a", title: "A" },
        { value: "custom", title: "Custom", disabled: true },
      ],
      value: "a",
      onChange: () => {},
    });
    s.value = "custom";
    expect(s.value).toBe("custom");
    expect(select(s.el).value).toBe("custom");
  });

  it("still fires onChange on a user-driven change event", () => {
    const onChange = vi.fn();
    const s = createSelect({
      label: "Mode",
      options: [
        { value: "a", title: "A" },
        { value: "b", title: "B" },
      ],
      value: "a",
      onChange,
    });
    const el = select(s.el);
    el.value = "b";
    el.dispatchEvent(new Event("change"));
    expect(onChange).toHaveBeenCalledWith("b");
  });
});
