export interface RunTimer {
  /** Accumulates `dt` and returns how many steps are due: 0 or 1. */
  advance(dt: number): number;
  reset(): void;
  setHz(hz: number): void;
}

/**
 * Paces the Run button's steps at a fixed rate, independent of frame rate.
 *
 * At most one step is returned per call, so a long frame (a backgrounded tab,
 * a slow first paint) never releases a burst of steps that would skip the
 * path forward invisibly. Leftover time carries over, but is clamped to a
 * single period so the backlog cannot grow without bound either.
 */
export function createRunTimer(hz: number): RunTimer {
  let period = 1 / hz;
  let accumulator = 0;

  return {
    advance(dt: number): number {
      if (!Number.isFinite(dt) || dt <= 0) return 0;
      accumulator += dt;
      if (accumulator < period) return 0;
      accumulator = Math.min(accumulator - period, period);
      return 1;
    },

    reset(): void {
      accumulator = 0;
    },

    setHz(next: number): void {
      period = 1 / next;
      accumulator = 0;
    },
  };
}
