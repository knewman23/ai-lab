/** Formats `n` to `sig` significant digits, stripping trailing zeros. Non-finite values render as "—". */
export function fmt(n: number, sig = 4): string {
  if (!Number.isFinite(n)) return "—";
  return Number(n.toPrecision(sig)).toString();
}

/** `fmt` for prose: spells the minus sign with a typographic minus. Readouts keep `fmt`'s plain hyphen. */
export function proseNum(n: number): string {
  return fmt(n).replaceAll("-", "\u2212");
}

export interface Readout {
  el: HTMLDListElement;
  set: (key: string, text: string) => void;
}

/** A `<dl>` of key/value rows. `set` updates the `<dd>` for a known key and throws for an unknown one. */
export function createReadout(rows: readonly string[]): Readout {
  const el = document.createElement("dl");
  el.className = "readout";
  // Values change as the visualization runs; announce them without interrupting.
  el.setAttribute("aria-live", "polite");

  const values = new Map<string, HTMLElement>();
  for (const key of rows) {
    const dt = document.createElement("dt");
    dt.className = "lbl";
    dt.textContent = key;

    const dd = document.createElement("dd");

    el.append(dt, dd);
    values.set(key, dd);
  }

  return {
    el,
    set(key: string, text: string) {
      const dd = values.get(key);
      if (!dd) throw new Error(`createReadout: unknown key "${key}"`);
      dd.textContent = text;
    },
  };
}
