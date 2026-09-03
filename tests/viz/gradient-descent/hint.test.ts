// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { createUsageHint } from "../../../src/viz/gradient-descent/hint";

const KEY = "ai-lab.hint.gradient-descent";

afterEach(() => {
  localStorage.clear();
});

describe("createUsageHint", () => {
  it("attaches a note with the three usage lines", () => {
    const container = document.createElement("div");
    const hint = createUsageHint(container);

    const el = container.querySelector(".canvas-hint");
    expect(el).not.toBeNull();
    expect(el?.getAttribute("role")).toBe("note");
    expect(el?.querySelectorAll("li")).toHaveLength(3);

    hint.dispose();
  });

  it("removes itself and remembers the dismissal when the button is clicked", () => {
    const container = document.createElement("div");
    const hint = createUsageHint(container);

    container.querySelector<HTMLButtonElement>(".canvas-hint button")?.click();

    expect(container.querySelector(".canvas-hint")).toBeNull();
    expect(localStorage.getItem(KEY)).toBe("1");

    hint.dispose();
  });

  it("hides on the first interaction, without needing the button", () => {
    const container = document.createElement("div");
    const hint = createUsageHint(container);

    hint.hide();
    hint.hide();

    expect(container.querySelector(".canvas-hint")).toBeNull();
    expect(localStorage.getItem(KEY)).toBe("1");

    hint.dispose();
  });

  it("stays away once dismissed on an earlier visit", () => {
    localStorage.setItem(KEY, "1");
    const container = document.createElement("div");
    const hint = createUsageHint(container);

    expect(container.querySelector(".canvas-hint")).toBeNull();

    hint.dispose();
  });

  it("shows the hint when storage throws", () => {
    const original = Object.getOwnPropertyDescriptor(window, "localStorage");
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      get() {
        throw new Error("storage disabled");
      },
    });

    const container = document.createElement("div");
    try {
      const hint = createUsageHint(container);
      expect(container.querySelector(".canvas-hint")).not.toBeNull();
      expect(() => {
        hint.hide();
      }).not.toThrow();
    } finally {
      if (original) Object.defineProperty(window, "localStorage", original);
    }
  });
});
