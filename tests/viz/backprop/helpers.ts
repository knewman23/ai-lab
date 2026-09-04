import { initialState, stepForward } from "../../../src/viz/backprop/state";
import type { BpState } from "../../../src/viz/backprop/state";

/** The state after `step` pass steps from `s` (default: the initial state). */
export function at(step: number, s: BpState = initialState()): BpState {
  let out = s;
  for (let i = 0; i < step; i++) out = stepForward(out);
  return out;
}
