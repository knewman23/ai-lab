import { describe, expect, it } from "vitest";
import { createThemeColors } from "../../src/core/theme";

const LIGHT: Record<string, string> = {
  "--bg": "#f7f7f5",
  "--card": "#ffffff",
  "--sunken": "#eeeeec",
  "--ink": "#141414",
  "--soft": "#4a4a4a",
  "--faint": "#8a8a8a",
  "--line": "#dcdcda",
  "--line-2": "#c4c4c0",
  "--accent": "#1f4ed8",
  "--warn": "#9a6b12",
};

function tokens(overrides: Record<string, string> = {}): Record<string, string> {
  return { ...LIGHT, ...overrides };
}

describe("createThemeColors", () => {
  it("reads every token into its colour field", () => {
    const colors = createThemeColors((token) => tokens()[token] ?? "");

    expect(colors.bg.getHexString()).toBe("f7f7f5");
    expect(colors.card.getHexString()).toBe("ffffff");
    expect(colors.sunken.getHexString()).toBe("eeeeec");
    expect(colors.ink.getHexString()).toBe("141414");
    expect(colors.soft.getHexString()).toBe("4a4a4a");
    expect(colors.faint.getHexString()).toBe("8a8a8a");
    expect(colors.line.getHexString()).toBe("dcdcda");
    expect(colors.line2.getHexString()).toBe("c4c4c0");
    expect(colors.accent.getHexString()).toBe("1f4ed8");
    expect(colors.warn.getHexString()).toBe("9a6b12");
  });

  it("trims surrounding whitespace from a token value", () => {
    const colors = createThemeColors(() => "  #1f4ed8\n");

    expect(colors.accent.getHexString()).toBe("1f4ed8");
  });

  it("keeps the same Color objects across refresh()", () => {
    const store = tokens();
    const colors = createThemeColors((token) => store[token] ?? "");
    const accent = colors.accent;

    store["--accent"] = "#55d4a0";
    colors.refresh();

    expect(colors.accent).toBe(accent);
    expect(accent.getHexString()).toBe("55d4a0");
  });

  it("updates warn and line2 in place after refresh()", () => {
    const store = tokens();
    const colors = createThemeColors((token) => store[token] ?? "");
    const warn = colors.warn;
    const line2 = colors.line2;

    store["--warn"] = "#e2b357";
    store["--line-2"] = "#2e323b";
    colors.refresh();

    expect(colors.warn).toBe(warn);
    expect(colors.line2).toBe(line2);
    expect(warn.getHexString()).toBe("e2b357");
    expect(line2.getHexString()).toBe("2e323b");
  });

  it("dispatches change exactly once per refresh that alters colours", () => {
    const store = tokens();
    const colors = createThemeColors((token) => store[token] ?? "");
    let events = 0;
    colors.addEventListener("change", () => {
      events++;
    });

    store["--bg"] = "#101010";
    store["--accent"] = "#55d4a0";
    colors.refresh();

    expect(events).toBe(1);
  });

  it("dispatches no change event when no token moved", () => {
    const store = tokens();
    const colors = createThemeColors((token) => store[token] ?? "");
    let events = 0;
    colors.addEventListener("change", () => {
      events++;
    });

    colors.refresh();

    expect(events).toBe(0);
  });

  it("keeps the previous colour when a token reads empty", () => {
    const store = tokens();
    const colors = createThemeColors((token) => store[token] ?? "");

    store["--accent"] = "";
    expect(() => {
      colors.refresh();
    }).not.toThrow();
    expect(colors.accent.getHexString()).toBe("1f4ed8");
  });

  it("keeps the previous colour when a token is unparseable", () => {
    const store = tokens();
    const colors = createThemeColors((token) => store[token] ?? "");

    store["--accent"] = "var(--missing)";
    colors.refresh();

    expect(colors.accent.getHexString()).toBe("1f4ed8");
  });
});
