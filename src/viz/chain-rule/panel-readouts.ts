import type { Panel } from "../../ui/panel";
import { createReadout, fmt } from "../../ui/readout";
import { derivativeText } from "./explanation";
import type { ChainState, Derived } from "./state";

export interface ChainReadouts {
  render(state: ChainState, d: Derived): void;
}

/** Appends the Values, Derivatives and Ratios readout sections to `panel`. */
export function createChainReadouts(panel: Panel): ChainReadouts {
  const values = createReadout(["x", "u = g(x)", "y = f(u)"]);
  panel.section("Values").append(values.el);

  const derivatives = createReadout(["g′(x)", "f′(u)", "dy/dx"]);
  panel.section("Derivatives").append(derivatives.el);

  const ratios = createReadout(["Δu/Δx", "Δy/Δu", "Δy/Δx"]);
  panel.section("Ratios").append(ratios.el);

  return {
    render(state: ChainState, d: Derived): void {
      values.set("x", fmt(state.x));
      values.set("u = g(x)", fmt(d.u));
      values.set("y = f(u)", fmt(d.y));

      derivatives.set("g′(x)", derivativeText(d.dg));
      derivatives.set("f′(u)", derivativeText(d.df));
      derivatives.set("dy/dx", derivativeText(d.dydx));

      const dl = d.deltas;
      ratios.set("Δu/Δx", dl === null ? "—" : fmt(dl.duDx));
      ratios.set("Δy/Δu", dl === null ? "—" : dl.dyDu === null ? "— (Δu = 0)" : fmt(dl.dyDu));
      ratios.set("Δy/Δx", dl === null ? "—" : fmt(dl.dyDx));
    },
  };
}
