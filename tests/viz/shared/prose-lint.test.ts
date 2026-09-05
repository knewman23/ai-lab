import { describe, expect, it } from "vitest";
import { expectStepProse } from "./prose-lint";

const GOOD =
  "Drag the ball downhill and the arrow will follow it, so the readout reports a smaller slope.";

/**
 * The lint guards every scene's prose, and none of the shipped prose trips it — which means
 * nothing else in the suite proves the lint still works. These do.
 */
describe("expectStepProse", () => {
  it("accepts prose that says what to do and what will happen", () => {
    expect(() => {
      expectStepProse(GOOD, "sample");
    }).not.toThrow();
  });

  it.each([
    "You can see the boundary bend towards the data once the run has gone on long enough.",
    "Notice that the trail crosses the valley rather than running down it, step after step.",
    "The optimizer is currently sitting at the bottom of the bowl, which is where it converged.",
    "As you can see, the two heads disagree about which token matters most in this sentence.",
  ])("rejects prose that asserts what is on screen: %s", (prose) => {
    expect(() => {
      expectStepProse(prose, "sample");
    }).toThrow();
  });

  it("rejects empty prose and one-liners too short to be a step", () => {
    expect(() => {
      expectStepProse("   ", "sample");
    }).toThrow();
    expect(() => {
      expectStepProse("Drag it.", "sample");
    }).toThrow();
  });
});
