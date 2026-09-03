import { Color } from "three";
import type { ThemeColors } from "../viz/types";

export interface ThemeHandle extends ThemeColors {
  /** Re-reads every token; dispatches "change" when any colour moved. */
  refresh(): void;
}

/** CSS custom property per ThemeColors field, in the order the tokens are declared. */
const TOKENS = {
  bg: "--bg",
  card: "--card",
  sunken: "--sunken",
  ink: "--ink",
  soft: "--soft",
  faint: "--faint",
  line: "--line",
  accent: "--accent",
} as const satisfies Readonly<Record<Exclude<keyof ThemeColors, keyof EventTarget>, string>>;

type Field = keyof typeof TOKENS;

const FIELDS = Object.keys(TOKENS) as readonly Field[];

/** Only hex values are used by the palette; anything else leaves the colour alone. */
const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

function readToken(read: (token: string) => string, token: string): string | null {
  const value = read(token).trim();
  return HEX.test(value) ? value : null;
}

class ThemeColorsImpl extends EventTarget implements ThemeHandle {
  readonly bg = new Color();
  readonly card = new Color();
  readonly sunken = new Color();
  readonly ink = new Color();
  readonly soft = new Color();
  readonly faint = new Color();
  readonly line = new Color();
  readonly accent = new Color();

  constructor(private readonly read: (token: string) => string) {
    super();
    this.apply();
  }

  refresh(): void {
    if (this.apply()) this.dispatchEvent(new Event("change"));
  }

  /** Writes the current token values in place; returns true when something changed. */
  private apply(): boolean {
    let changed = false;
    for (const field of FIELDS) {
      const value = readToken(this.read, TOKENS[field]);
      if (value === null) continue;
      const color = this[field];
      const before = color.getHex();
      color.setStyle(value);
      if (color.getHex() !== before) changed = true;
    }
    return changed;
  }
}

export function createThemeColors(read?: (token: string) => string): ThemeHandle {
  const readValue =
    read ?? ((token: string) => getComputedStyle(document.documentElement).getPropertyValue(token));
  return new ThemeColorsImpl(readValue);
}

/** Refreshes on explicit theme switches and on OS colour-scheme changes. */
export function watchTheme(colors: ThemeHandle): () => void {
  const refresh = (): void => {
    colors.refresh();
  };

  const observer = new MutationObserver(refresh);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-theme"],
  });

  const media = window.matchMedia("(prefers-color-scheme: dark)");
  media.addEventListener("change", refresh);

  return () => {
    observer.disconnect();
    media.removeEventListener("change", refresh);
  };
}
