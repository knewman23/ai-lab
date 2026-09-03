/** Everything the loop touches outside itself, so tests can drive it by hand. */
export interface LoopDeps {
  readonly raf: (cb: (t: number) => void) => number;
  readonly caf: (id: number) => void;
  /** Milliseconds, monotonic. */
  readonly now: () => number;
  readonly isHidden: () => boolean;
  /** Subscribes to visibility changes; returns an unsubscribe function. */
  readonly onVisibility: (cb: () => void) => () => void;
}

export interface Loop {
  setTick(fn: (dt: number) => boolean): void;
  start(): void;
  stop(): void;
  /** Wakes the loop from idle and resets the idle timer; a no-op before start(). */
  poke(): void;
  isIdle(): boolean;
  dispose(): void;
}

/** Largest dt handed to a tick, in seconds; longer gaps are treated as one frame. */
const MAX_DT = 0.1;
/** How long the tick may report "nothing rendered" before the loop idles, in ms. */
const IDLE_AFTER_MS = 1000;

function defaultDeps(): LoopDeps {
  return {
    raf: (cb) => window.requestAnimationFrame(cb),
    caf: (id) => {
      window.cancelAnimationFrame(id);
    },
    now: () => performance.now(),
    isHidden: () => document.hidden,
    onVisibility: (cb) => {
      document.addEventListener("visibilitychange", cb);
      return () => {
        document.removeEventListener("visibilitychange", cb);
      };
    },
  };
}

/**
 * Drives one tick per animation frame. Constructing a loop subscribes to
 * visibilitychange; dispose() unsubscribes. A tick that throws stops the loop
 * and the error propagates out of the frame callback, so a broken tick fails
 * once rather than every frame.
 */
export function createLoop(deps?: Partial<LoopDeps>): Loop {
  const d: LoopDeps = { ...defaultDeps(), ...deps };

  let tick: (dt: number) => boolean = () => false;
  let started = false;
  let idle = false;
  let frame: number | null = null;
  let last = 0;
  let lastRenderAt = 0;

  function request(): void {
    if (frame !== null || !started || idle || d.isHidden()) return;
    frame = d.raf(onFrame);
  }

  function cancel(): void {
    if (frame === null) return;
    d.caf(frame);
    frame = null;
  }

  function onFrame(): void {
    frame = null;
    const t = d.now();
    const dt = Math.max(0, Math.min((t - last) / 1000, MAX_DT));
    last = t;

    let rendered: boolean;
    try {
      rendered = tick(dt);
    } catch (error) {
      started = false;
      throw error;
    }

    if (rendered) lastRenderAt = t;
    else if (t - lastRenderAt > IDLE_AFTER_MS) {
      idle = true;
      return;
    }
    request();
  }

  function wake(): void {
    const t = d.now();
    // A frame already in flight carries an accurate `last`; resetting it here
    // would swallow the time that frame has been waiting.
    if (frame === null || idle) last = t;
    lastRenderAt = t;
    idle = false;
    request();
  }

  const unsubscribe = d.onVisibility(() => {
    if (!started) return;
    if (d.isHidden()) cancel();
    else wake();
  });

  return {
    setTick(fn) {
      tick = fn;
    },
    start() {
      started = true;
      wake();
    },
    stop() {
      started = false;
      cancel();
    },
    poke() {
      if (!started) return;
      wake();
    },
    isIdle() {
      return idle;
    },
    dispose() {
      started = false;
      cancel();
      unsubscribe();
    },
  };
}
