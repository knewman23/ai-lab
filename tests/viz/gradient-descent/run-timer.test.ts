import { describe, expect, it } from "vitest";
import { createRunTimer } from "../../../src/viz/gradient-descent/run-timer";

describe("createRunTimer", () => {
  it("yields one step per period at the configured rate", () => {
    const timer = createRunTimer(10);
    let steps = 0;
    for (let i = 0; i < 10; i++) steps += timer.advance(0.05);
    expect(steps).toBe(5);
  });

  it("returns nothing before a full period has elapsed", () => {
    const timer = createRunTimer(10);
    expect(timer.advance(0.05)).toBe(0);
  });

  it("caps a long frame at one step and does not burst afterwards", () => {
    const timer = createRunTimer(10);
    expect(timer.advance(1)).toBe(1);
    expect(timer.advance(0.05)).toBeLessThanOrEqual(1);
    expect(timer.advance(0.05)).toBeLessThanOrEqual(1);
  });

  it("carries leftover time over to the next call", () => {
    const timer = createRunTimer(10);
    expect(timer.advance(0.08)).toBe(0);
    expect(timer.advance(0.03)).toBe(1);
  });

  it("clears the accumulator on reset", () => {
    const timer = createRunTimer(10);
    timer.advance(0.09);
    timer.reset();
    expect(timer.advance(0.05)).toBe(0);
    expect(timer.advance(0.05)).toBe(1);
  });

  it("changes rate with setHz and clears the accumulator", () => {
    const timer = createRunTimer(10);
    timer.advance(0.09);
    timer.setHz(2);
    expect(timer.advance(0.4)).toBe(0);
    expect(timer.advance(0.2)).toBe(1);
  });

  it("ignores non-finite or negative deltas", () => {
    const timer = createRunTimer(10);
    expect(timer.advance(Number.NaN)).toBe(0);
    expect(timer.advance(-5)).toBe(0);
    expect(timer.advance(0.1)).toBe(1);
  });
});
