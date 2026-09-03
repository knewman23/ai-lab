// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { createEquation } from "../../src/ui/equation";

describe("createEquation", () => {
  it("renders a div.equation", () => {
    const eq = createEquation();
    expect(eq.el.tagName).toBe("DIV");
    expect(eq.el.classList.contains("equation")).toBe(true);
  });

  it("set() renders KaTeX markup for a valid expression", () => {
    const eq = createEquation();
    eq.set("\\nabla f");
    expect(eq.el.querySelector(".katex")).not.toBeNull();
  });

  it("set() with the same string is a no-op (preserves node identity)", () => {
    const eq = createEquation();
    eq.set("\\nabla f");
    const first = eq.el.firstChild;
    eq.set("\\nabla f");
    expect(eq.el.firstChild).toBe(first);
  });

  it("set() with a different string replaces the content", () => {
    const eq = createEquation();
    eq.set("\\nabla f");
    const first = eq.el.firstChild;
    eq.set("x^2");
    expect(eq.el.firstChild).not.toBe(first);
    expect(eq.el.textContent).toContain("x");
  });

  it("set() with an invalid expression does not throw and renders something", () => {
    const eq = createEquation();
    expect(() => eq.set("\\frac{")).not.toThrow();
    expect(eq.el.children.length).toBeGreaterThan(0);
  });

  it("set('') clears the element", () => {
    const eq = createEquation();
    eq.set("\\nabla f");
    eq.set("");
    expect(eq.el.innerHTML).toBe("");
  });
});
