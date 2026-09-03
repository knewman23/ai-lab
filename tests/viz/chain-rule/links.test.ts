import { describe, expect, it, vi } from "vitest";
import { COMPOSITIONS } from "../../../src/core/math/compositions";
import { createThemeColors } from "../../../src/core/theme";
import { createLinks } from "../../../src/viz/chain-rule/links";
import { facePoints } from "../../../src/viz/chain-rule/links-geometry";
import { derived, initialState, setX } from "../../../src/viz/chain-rule/state";

function make() {
  const theme = createThemeColors(() => "#1f4ed8");
  return { links: createLinks(theme), theme };
}

describe("createLinks", () => {
  it("writes six connectors, six primed, six legs, three secants and three tangents at the initial state", () => {
    const { links } = make();
    const s = initialState();
    const d = derived(s);
    links.set(COMPOSITIONS.sin3x, s.x, d, facePoints(COMPOSITIONS.sin3x, s.x, d));
    const { layers } = links;
    expect(layers.connectors.geometry.drawRange.count).toBe(12);
    expect(layers.primed.geometry.drawRange.count).toBe(12);
    expect(layers.legs.geometry.drawRange.count).toBe(12);
    expect(layers.secants.geometry.drawRange.count).toBe(6);
    expect(layers.tangents.geometry.drawRange.count).toBe(6);
    links.dispose();
  });

  it("empties the primed, leg and secant layers at the right edge", () => {
    const { links } = make();
    const s = setX(initialState(), 3);
    const d = derived(s);
    links.set(COMPOSITIONS.sin3x, s.x, d, facePoints(COMPOSITIONS.sin3x, s.x, d));
    expect(links.layers.primed.geometry.drawRange.count).toBe(0);
    expect(links.layers.legs.geometry.drawRange.count).toBe(0);
    expect(links.layers.secants.geometry.drawRange.count).toBe(0);
    expect(links.layers.connectors.geometry.drawRange.count).toBe(12);
    links.dispose();
  });

  it("setShow toggles both connector layers together and the others by key", () => {
    const { links } = make();
    links.setShow({ connectors: false, triangles: true, secants: false, tangents: true });
    expect(links.layers.connectors.object.visible).toBe(false);
    expect(links.layers.primed.object.visible).toBe(false);
    expect(links.layers.legs.object.visible).toBe(true);
    expect(links.layers.secants.object.visible).toBe(false);
    expect(links.layers.tangents.object.visible).toBe(true);
    links.dispose();
  });

  it("uses theme colours and the listed opacities", () => {
    const { links, theme } = make();
    expect(links.layers.tangents.material.color.equals(theme.accent)).toBe(true);
    expect(links.layers.primed.material.color.equals(theme.faint)).toBe(true);
    expect(links.layers.connectors.material.opacity).toBe(0.8);
    expect(links.layers.primed.material.opacity).toBe(0.6);
    expect(links.layers.legs.material.opacity).toBe(0.9);
    expect(links.layers.tangents.material.transparent).toBe(true);
    links.dispose();
  });

  it("dispose releases the five layers and drops the theme listener", () => {
    const { links, theme } = make();
    const remove = vi.spyOn(theme, "removeEventListener");
    const spies = Object.values(links.layers).flatMap((l) => [
      vi.spyOn(l.geometry, "dispose"),
      vi.spyOn(l.material, "dispose"),
    ]);
    links.dispose();
    for (const spy of spies) expect(spy).toHaveBeenCalledTimes(1);
    expect(remove).toHaveBeenCalledWith("change", expect.any(Function));
  });
});
