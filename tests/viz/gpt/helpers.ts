import { createThemeColors, type ThemeHandle } from "../../../src/core/theme";
import type { Layer, Segment, Vec3 } from "../../../src/viz/shared/layer";

/** Tokens the GPT scene never reads: `readToken` rejects the empty string and leaves them black. */
const UNSET = "";

const INITIAL: readonly (readonly [string, string])[] = [
  ["--ink", "#112233"],
  ["--soft", "#445566"],
  ["--faint", "#778899"],
  ["--accent", "#aa2244"],
];

export interface TestTheme {
  readonly theme: ThemeHandle;
  /** Moves one token and refreshes, so subscribers see a "change". */
  readonly repaint: (token: string, hex: string) => void;
}

/** A theme over a token map the test can move, for the recolour-on-change assertions. */
export function testTheme(): TestTheme {
  const tokens = new Map<string, string>(INITIAL.map(([token, hex]) => [token, hex]));
  const theme = createThemeColors((token) => {
    const hex = tokens.get(token);
    return hex === undefined ? UNSET : hex;
  });
  return {
    theme,
    repaint: (token, hex): void => {
      tokens.set(token, hex);
      theme.refresh();
    },
  };
}

/**
 * The segments a layer is actually drawing: its buffer read back to `drawRange.count`, so a test
 * sees what the GPU would and never the stale tail behind it.
 */
export function drawn(layer: Layer): Segment[] {
  const out: Segment[] = [];
  const point = (at: number): Vec3 => [
    layer.positions[at * 3]!,
    layer.positions[at * 3 + 1]!,
    layer.positions[at * 3 + 2]!,
  ];
  for (let n = 0; n < layer.geometry.drawRange.count; n += 2) out.push([point(n), point(n + 1)]);
  return out;
}
