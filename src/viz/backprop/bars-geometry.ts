/** World units of bar per unit of value: |value| ≤ 10 fills 3 units. */
export const S_VALUE = 0.3;
/** World units of bar per unit of gradient: |grad| ≤ 2 fills 3 units. */
export const S_GRAD = 1.5;
/** Longest bar drawn; the label still shows the true number. */
export const MAX_LENGTH = 3;
/** Duration of a bar's ease when a step reveals it. */
export const EASE_MS = 300;

export type BarKind = "value" | "grad";

export interface BarTransform {
  /** Length along y, clamped to `MAX_LENGTH`. */
  readonly length: number;
  /** Y of the bar's centre: positive quantities point toward −y (the camera side). */
  readonly centreY: number;
  readonly visible: boolean;
}

/** Length and centre of a bar for quantity `v` of `kind`; the sign of `v` picks the side of the wall. */
export function barTransform(kind: BarKind, v: number, revealed: boolean): BarTransform {
  const length = Math.min(MAX_LENGTH, (kind === "value" ? S_VALUE : S_GRAD) * Math.abs(v));
  const centreY = length === 0 ? 0 : v < 0 ? length / 2 : -length / 2;
  return { length, centreY, visible: revealed };
}

/** Cubic ease-out, t in [0, 1]. */
export function ease(t: number): number {
  const u = 1 - t;
  return 1 - u * u * u;
}

/**
 * A scalar that eases from its current value to a target over `EASE_MS`, or jumps
 * when asked (or always, under reduced motion). Drive it with `advance(dtMs)`.
 */
export class Eased {
  private from = 0;
  private target = 0;
  private current = 0;
  /** Milliseconds since the last non-instant `set`; ≥ EASE_MS once settled. */
  private elapsed = EASE_MS;

  constructor(private readonly reducedMotion: boolean) {}

  get value(): number {
    return this.current;
  }

  /** True while an ease is in progress, i.e. while `advance` still has work to do. */
  get moving(): boolean {
    return this.elapsed < EASE_MS;
  }

  /** Starts easing toward `target` from wherever the value is now; `instant` (or no change) jumps there. */
  set(target: number, options: { readonly instant?: boolean } = {}): void {
    this.target = target;
    if (options.instant === true || this.reducedMotion || target === this.current) {
      this.from = this.current = target;
      this.elapsed = EASE_MS;
      return;
    }
    this.from = this.current;
    this.elapsed = 0;
  }

  /** Steps the ease by `dtMs`; true while the value is still moving. */
  advance(dtMs: number): boolean {
    if (!this.moving) return false;
    this.elapsed = Math.min(EASE_MS, this.elapsed + dtMs);
    const t = ease(this.elapsed / EASE_MS);
    this.current = this.from + (this.target - this.from) * t;
    return this.moving;
  }
}
