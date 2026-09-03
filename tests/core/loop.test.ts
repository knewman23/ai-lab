import { describe, expect, it } from "vitest";
import { createLoop, type LoopDeps } from "../../src/core/loop";

interface Harness {
  readonly loop: ReturnType<typeof createLoop>;
  /** Runs every rAF callback recorded so far, after advancing the clock. */
  readonly flush: (advanceMs: number) => void;
  readonly pending: () => number;
  readonly cancelled: () => readonly number[];
  readonly setHidden: (hidden: boolean) => void;
  /** Fires the captured visibilitychange listener. */
  readonly fireVisibility: () => void;
  readonly unsubscribeCalls: () => number;
}

function harness(): Harness {
  let nowMs = 0;
  let hidden = false;
  let nextId = 1;
  let unsubscribeCalls = 0;
  let queued: Array<{ id: number; cb: (t: number) => void }> = [];
  const cancelled: number[] = [];
  const listeners: Array<() => void> = [];

  const deps: LoopDeps = {
    raf: (cb) => {
      const id = nextId++;
      queued.push({ id, cb });
      return id;
    },
    caf: (id) => {
      cancelled.push(id);
      queued = queued.filter((entry) => entry.id !== id);
    },
    now: () => nowMs,
    isHidden: () => hidden,
    onVisibility: (cb) => {
      listeners.push(cb);
      return () => {
        unsubscribeCalls++;
      };
    },
  };

  return {
    loop: createLoop(deps),
    flush: (advanceMs) => {
      nowMs += advanceMs;
      const due = queued;
      queued = [];
      for (const entry of due) entry.cb(nowMs);
    },
    pending: () => queued.length,
    cancelled: () => cancelled,
    setHidden: (value) => {
      hidden = value;
    },
    fireVisibility: () => {
      for (const cb of listeners) cb();
    },
    unsubscribeCalls: () => unsubscribeCalls,
  };
}

describe("createLoop", () => {
  it("passes dt to the tick in seconds", () => {
    const h = harness();
    const seen: number[] = [];
    h.loop.setTick((dt) => {
      seen.push(dt);
      return true;
    });
    h.loop.start();
    h.flush(16);
    h.flush(16);

    expect(seen).toHaveLength(2);
    expect(seen[1]).toBeCloseTo(0.016, 6);
  });

  it("clamps dt to 0.1 s when the clock jumps", () => {
    const h = harness();
    const seen: number[] = [];
    h.loop.setTick((dt) => {
      seen.push(dt);
      return true;
    });
    h.loop.start();
    h.flush(5000);

    expect(seen).toEqual([0.1]);
  });

  it("goes idle after the tick returns false for more than a second", () => {
    const h = harness();
    let calls = 0;
    h.loop.setTick(() => {
      calls++;
      return false;
    });
    h.loop.start();

    for (let i = 0; i < 70; i++) h.flush(16);

    expect(h.loop.isIdle()).toBe(true);
    expect(h.pending()).toBe(0);
    const settled = calls;
    h.flush(16);
    expect(calls).toBe(settled);
  });

  it("stays awake while the tick keeps rendering", () => {
    const h = harness();
    h.loop.setTick(() => true);
    h.loop.start();

    for (let i = 0; i < 200; i++) h.flush(16);

    expect(h.loop.isIdle()).toBe(false);
    expect(h.pending()).toBe(1);
  });

  it("resumes on poke() after going idle", () => {
    const h = harness();
    let calls = 0;
    h.loop.setTick(() => {
      calls++;
      return false;
    });
    h.loop.start();
    for (let i = 0; i < 70; i++) h.flush(16);
    const idleCalls = calls;

    h.loop.poke();

    expect(h.loop.isIdle()).toBe(false);
    expect(h.pending()).toBe(1);
    h.flush(16);
    expect(calls).toBe(idleCalls + 1);
  });

  it("requests no frames while the document is hidden", () => {
    const h = harness();
    h.loop.setTick(() => true);
    h.setHidden(true);
    h.loop.start();

    expect(h.pending()).toBe(0);
  });

  it("resumes when the document becomes visible again", () => {
    const h = harness();
    let calls = 0;
    h.loop.setTick(() => {
      calls++;
      return true;
    });
    h.setHidden(true);
    h.loop.start();
    h.setHidden(false);
    h.fireVisibility();

    expect(h.pending()).toBe(1);
    h.flush(16);
    expect(calls).toBe(1);
  });

  it("does not resume on visibility change when never started", () => {
    const h = harness();
    h.loop.setTick(() => true);
    h.fireVisibility();

    expect(h.pending()).toBe(0);
  });

  it("cancels the pending frame on stop()", () => {
    const h = harness();
    h.loop.setTick(() => true);
    h.loop.start();
    h.loop.stop();

    expect(h.cancelled()).toHaveLength(1);
    expect(h.pending()).toBe(0);
  });

  it("stops and unsubscribes from visibility on dispose()", () => {
    const h = harness();
    h.loop.setTick(() => true);
    h.loop.start();
    h.loop.dispose();

    expect(h.pending()).toBe(0);
    expect(h.unsubscribeCalls()).toBe(1);
  });
  it("leaves no pending frame when the tick throws", () => {
    const h = harness();
    h.loop.setTick(() => {
      throw new Error("tick blew up");
    });
    h.loop.start();

    expect(() => {
      h.flush(16);
    }).toThrow("tick blew up");
    expect(h.pending()).toBe(0);
  });

  it("goes dead after the tick throws, so poke() does nothing until start()", () => {
    const h = harness();
    h.loop.setTick(() => {
      throw new Error("tick blew up");
    });
    h.loop.start();
    expect(() => {
      h.flush(16);
    }).toThrow();

    h.loop.poke();
    h.fireVisibility();

    expect(h.pending()).toBe(0);
  });

  it("can be started again after the tick threw", () => {
    const h = harness();
    let explode = true;
    let calls = 0;
    h.loop.setTick(() => {
      calls++;
      if (explode) throw new Error("tick blew up");
      return true;
    });
    h.loop.start();
    expect(() => {
      h.flush(16);
    }).toThrow();

    explode = false;
    h.loop.start();
    h.flush(16);

    expect(calls).toBe(2);
    expect(h.pending()).toBe(1);
  });

  it("ignores poke() before start()", () => {
    const h = harness();
    h.loop.setTick(() => true);
    h.loop.poke();

    expect(h.pending()).toBe(0);
  });

  it("requests exactly one frame when the tick pokes reentrantly", () => {
    const h = harness();
    h.loop.setTick(() => {
      h.loop.poke();
      return true;
    });
    h.loop.start();
    h.flush(16);

    expect(h.pending()).toBe(1);
  });

  it("keeps a single pending frame when poke() lands mid-frame", () => {
    const h = harness();
    h.loop.setTick(() => true);
    h.loop.start();
    h.loop.poke();
    h.loop.poke();

    expect(h.pending()).toBe(1);
  });

  it("runs again after stop() then start()", () => {
    const h = harness();
    let calls = 0;
    h.loop.setTick(() => {
      calls++;
      return true;
    });
    h.loop.start();
    h.loop.stop();
    h.loop.start();
    h.flush(16);

    expect(calls).toBe(1);
    expect(h.pending()).toBe(1);
  });
});
