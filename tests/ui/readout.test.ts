// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { createReadout, fmt, proseNum } from "../../src/ui/readout";

describe("fmt", () => {
  it.each([
    [10.25, "10.25"],
    [6.40312, "6.403"],
    [NaN, "—"],
    [Infinity, "—"],
    [-Infinity, "—"],
    [0, "0"],
    [2, "2"],
  ])("fmt(%p) === %p", (n, expected) => {
    expect(fmt(n)).toBe(expected);
  });
});

describe("proseNum", () => {
  it("spells a negative number with a typographic minus", () => {
    expect(proseNum(-1.25)).toBe("\u22121.25");
  });

  it("leaves non-negative numbers as fmt does", () => {
    expect(proseNum(6.40312)).toBe("6.403");
  });
});

describe("createReadout", () => {
  it("renders a dl with a dt/dd pair per row", () => {
    const readout = createReadout(["loss", "step"]);
    const dts = [...readout.el.querySelectorAll("dt")].map((n) => n.textContent);
    const dds = [...readout.el.querySelectorAll("dd")];
    expect(readout.el.tagName).toBe("DL");
    expect(dts).toEqual(["loss", "step"]);
    expect(dds).toHaveLength(2);
  });

  it("set() updates the matching dd", () => {
    const readout = createReadout(["loss", "step"]);
    readout.set("loss", "0.042");
    const dds = [...readout.el.querySelectorAll("dt")].map((dt, i) => ({
      key: dt.textContent,
      value: [...readout.el.querySelectorAll("dd")][i]?.textContent,
    }));
    expect(dds).toEqual([
      { key: "loss", value: "0.042" },
      { key: "step", value: "" },
    ]);
  });

  it("set() throws for an unknown key", () => {
    const readout = createReadout(["loss"]);
    expect(() => readout.set("nope", "x")).toThrow();
  });
});
