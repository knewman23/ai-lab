/*
 * Deep import, through the official "three/src/*" export in three's package.json.
 * The theme boots on the home page, and importing Color from "three" pulls in
 * three.core, which is a prebuilt bundle and so cannot be tree-shaken: measured
 * at roughly 210 kB added to the entry chunk. From source it is the same class
 * with only its own maths, about 14 kB. (The on-demand three chunk, which the
 * scenes load, is 775 kB.)
 *
 * These Color objects therefore come from a different module instance than the
 * one inside three/webgpu. That is safe because three duck-types on the isColor
 * flag and never uses `instanceof Color`, and because both copies of
 * ColorManagement start from the same defaults. Do not change
 * ColorManagement.enabled or the working colour space anywhere in this app:
 * setting it on one copy would leave the other converting differently.
 */
import { Color } from "three/src/math/Color.js";
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
  line2: "--line-2",
  accent: "--accent",
  warn: "--warn",
} as const satisfies Readonly<Record<Exclude<keyof ThemeColors, keyof EventTarget>, string>>;

type Field = keyof typeof TOKENS;

const FIELDS = Object.keys(TOKENS) as readonly Field[];

/**
 * Palette tokens are hex by policy, so anything else leaves the colour alone.
 * Only 3- and 6-digit forms are accepted: three's Color.setStyle cannot parse
 * 4- or 8-digit hex and would warn on every refresh.
 */
const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

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
  readonly line2 = new Color();
  readonly accent = new Color();
  readonly warn = new Color();

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

function documentReader(): (token: string) => string {
  // The declaration is live, so one lookup serves every token and every refresh.
  let style: CSSStyleDeclaration | null = null;
  return (token) => {
    style ??= getComputedStyle(document.documentElement);
    return style.getPropertyValue(token);
  };
}

export function createThemeColors(read?: (token: string) => string): ThemeHandle {
  return new ThemeColorsImpl(read ?? documentReader());
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

  const media =
    typeof matchMedia === "function" ? matchMedia("(prefers-color-scheme: dark)") : null;
  media?.addEventListener("change", refresh);

  return () => {
    observer.disconnect();
    media?.removeEventListener("change", refresh);
  };
}
