// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { createLogSlider } from "../../src/ui/slider";
import { formatLr } from "../../src/core/math/optimizers";

function input(el: HTMLElement): HTMLInputElement {
  const node = el.querySelector("input[type=range]");
  if (!node) throw new Error("range input not found");
  return node as HTMLInputElement;
}

function output(el: HTMLElement): HTMLOutputElement {
  const node = el.querySelector("output");
  if (!node) throw new Error("output not found");
  return node;
}

describe("createLogSlider", () => {
  it("positions the input at the log-mapped step for the initial value", () => {
    const slider = createLogSlider({
      label: "LR",
      min: 1e-3,
      max: 1,
      value: 0.1,
      onChange: () => {},
    });
    expect(input(slider.el).value).toBe("667");
  });

  it("maps input 1000 to the max value and calls onChange", () => {
    const onChange = vi.fn();
    const slider = createLogSlider({ label: "LR", min: 1e-3, max: 1, value: 0.1, onChange });
    const range = input(slider.el);
    range.value = "1000";
    range.dispatchEvent(new Event("input"));
    expect(slider.value).toBeCloseTo(1, 12);
    expect(onChange).toHaveBeenCalledWith(1);
  });

  it("maps input 0 to the min value", () => {
    const onChange = vi.fn();
    const slider = createLogSlider({ label: "LR", min: 1e-3, max: 1, value: 0.1, onChange });
    const range = input(slider.el);
    range.value = "0";
    range.dispatchEvent(new Event("input"));
    expect(slider.value).toBeCloseTo(1e-3, 12);
    expect(onChange).toHaveBeenCalledWith(1e-3);
  });

  it("shows the formatted value in the output element", () => {
    const slider = createLogSlider({
      label: "LR",
      min: 1e-3,
      max: 1,
      value: 0.1,
      onChange: () => {},
    });
    expect(output(slider.el).textContent).toBe(formatLr(0.1));
  });

  it("uses a custom format function when provided", () => {
    const slider = createLogSlider({
      label: "LR",
      min: 1e-3,
      max: 1,
      value: 0.1,
      onChange: () => {},
      format: (v) => `x${v}`,
    });
    expect(output(slider.el).textContent).toBe("x0.1");
  });

  it("setting .value programmatically moves the input and output without calling onChange", () => {
    const onChange = vi.fn();
    const slider = createLogSlider({ label: "LR", min: 1e-3, max: 1, value: 0.1, onChange });
    slider.value = 0.5;
    expect(Number(input(slider.el).value)).toBeCloseTo(900, 0);
    expect(output(slider.el).textContent).toBe(formatLr(0.5));
    expect(onChange).not.toHaveBeenCalled();
    expect(slider.value).toBeCloseTo(0.5, 12);
  });
});
