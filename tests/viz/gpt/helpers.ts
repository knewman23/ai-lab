import { createThemeColors, type ThemeHandle } from "../../../src/core/theme";

/** Tokens the GPT scene never reads: `readToken` rejects the empty string and leaves them black. */
const UNSET = "";

const INITIAL: readonly (readonly [string, string])[] = [
  ["--ink", "#112233"],
  ["--soft", "#445566"],
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
