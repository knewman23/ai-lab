import { describe, expect, it } from "vitest";
import { isFinitePoint } from "../../../src/core/math/numeric";
import { SURFACES, isInDomain } from "../../../src/core/math/surfaces";
import { getOptimizer } from "../../../src/core/math/optimizers";
import {
  PATH_CAPACITY,
  derived,
  drag,
  initialState,
  reset,
  setLr,
  setOptimizer,
  setShow,
  setSurface,
  step,
  toggleRun,
} from "../../../src/viz/gradient-descent/state";

describe("initialState", () => {
  it("matches the documented defaults", () => {
    const s = initialState();
    expect(s.surface).toBe("bowl");
    expect(s.optimizer).toBe("sgd");
    expect(s.lr).toBe(0.1);
    expect(s.pos).toEqual(SURFACES.bowl.start);
    expect(s.steps).toBe(0);
    expect(s.status).toBe("ok");
    expect(s.running).toBe(false);
    expect(s.show).toEqual({ tangent: true, contours: true, path: true });
    expect(s.path.size).toBe(1);
    expect(s.path.last()).toEqual(s.pos);
  });
});

describe("step", () => {
  it("reduces loss, increments steps, grows path, keeps status ok", () => {
    const s0 = initialState();
    const loss0 = derived(s0).loss;
    const s1 = step(s0);
    expect(s1.pos).toEqual([2, 1.6]);
    expect(s1.steps).toBe(1);
    expect(s1.path.size).toBe(2);
    expect(s1.status).toBe("ok");
    expect(derived(s1).loss).toBeLessThan(loss0);
  });

  it("detects domain exit on saddle within 100 steps", () => {
    let s = setOptimizer(setSurface(initialState(), "saddle"), "sgd");
    s = setLr(s, 0.1);
    let leftDomain = false;
    for (let i = 0; i < 100; i++) {
      s = step(s);
      if (s.status === "left-domain") {
        leftDomain = true;
        break;
      }
    }
    expect(leftDomain).toBe(true);
    expect(s.running).toBe(false);
    expect(derived(s).canStep).toBe(false);
    expect(isFinitePoint(s.pos)).toBe(true);
    expect(isInDomain(SURFACES.saddle, s.pos)).toBe(false);

    const before = s;
    const after = step(s);
    expect(after).toEqual(before);
    expect(after.steps).toBe(before.steps);
  });

  it("detects divergence on rosenbrock within 50 steps", () => {
    let s = setLr(setOptimizer(setSurface(initialState(), "rosenbrock"), "sgd"), 1e307);
    let diverged = false;
    for (let i = 0; i < 50; i++) {
      s = step(s);
      if (s.status === "diverged") {
        diverged = true;
        break;
      }
    }
    expect(diverged).toBe(true);
    expect(isFinitePoint(s.pos)).toBe(false);
    expect(() => derived(s)).not.toThrow();
  });
});

describe("drag", () => {
  it("clamps to domain and resets steps/optState/path/status", () => {
    const s0 = setOptimizer(initialState(), "adam");
    const stepped = step(step(s0));
    const dragged = drag(stepped, [100, 100]);
    const domain = SURFACES.bowl.domain;
    expect(dragged.pos[0]).toBe(domain.x[1]);
    expect(dragged.pos[1]).toBe(domain.y[1]);
    expect(dragged.steps).toBe(0);
    expect(dragged.optState).toEqual(getOptimizer("adam").init());
    expect(dragged.path.size).toBe(1);
    expect(dragged.path.last()).toEqual(dragged.pos);
    expect(dragged.status).toBe("ok");
    expect(dragged.running).toBe(false);
  });

  it("recovers a diverged state to ok", () => {
    let s = setLr(setOptimizer(setSurface(initialState(), "rosenbrock"), "sgd"), 1e307);
    for (let i = 0; i < 50 && s.status === "ok"; i++) {
      s = step(s);
    }
    expect(s.status).toBe("diverged");
    const d = drag(s, [0, 0]);
    expect(d.status).toBe("ok");
  });
});

describe("reset", () => {
  it("returns to surface start, keeping unrelated fields", () => {
    const s0 = setLr(setOptimizer(initialState(), "momentum"), 0.05);
    const stepped = step(step(s0));
    const r = reset(stepped);
    expect(r.pos).toEqual(SURFACES.bowl.start);
    expect(r.steps).toBe(0);
    expect(r.optState).toEqual(getOptimizer("momentum").init());
    expect(r.path.size).toBe(1);
    expect(r.path.last()).toEqual(SURFACES.bowl.start);
    expect(r.status).toBe("ok");
    expect(r.running).toBe(false);
    expect(r.lr).toBe(0.05);
    expect(r.optimizer).toBe("momentum");
    expect(r.surface).toBe("bowl");
    expect(r.show).toEqual(s0.show);
  });
});

describe("setSurface", () => {
  it("behaves like reset on the new surface", () => {
    const s0 = step(initialState());
    const s1 = setSurface(s0, "himmelblau");
    expect(s1.surface).toBe("himmelblau");
    expect(s1.pos).toEqual(SURFACES.himmelblau.start);
    expect(s1.steps).toBe(0);
    expect(s1.path.size).toBe(1);
    expect(s1.status).toBe("ok");
    expect(s1.running).toBe(false);
  });

  it("sets the learning rate to the new surface's default", () => {
    const s0 = initialState();
    const rosenbrock = setSurface(s0, "rosenbrock");
    expect(rosenbrock.lr).toBe(0.001);

    const himmelblau = setSurface(s0, "himmelblau");
    expect(himmelblau.lr).toBe(0.01);
  });
});

describe("setOptimizer", () => {
  it("keeps pos, resets optState/steps, clears path", () => {
    const s0 = step(initialState());
    const s1 = setOptimizer(s0, "adam");
    expect(s1.optimizer).toBe("adam");
    expect(s1.pos).toEqual(s0.pos);
    expect(s1.steps).toBe(0);
    expect(s1.optState).toEqual(getOptimizer("adam").init());
    expect(s1.path.size).toBe(1);
    expect(s1.path.last()).toEqual(s0.pos);
    expect(s1.status).toBe("ok");
    expect(s1.running).toBe(false);
  });

  it("resets pos to the surface start when switching optimizer after divergence", () => {
    let s = setLr(setOptimizer(setSurface(initialState(), "rosenbrock"), "sgd"), 1e307);
    for (let i = 0; i < 50 && s.status === "ok"; i++) {
      s = step(s);
    }
    expect(s.status).toBe("diverged");
    const s1 = setOptimizer(s, "adam");
    expect(s1.pos).toEqual(SURFACES.rosenbrock.start);
    expect(s1.status).toBe("ok");
    expect(derived(s1).canStep).toBe(true);
  });

  it("resets pos to the surface start when switching optimizer after leaving the domain", () => {
    let s = setLr(setOptimizer(setSurface(initialState(), "saddle"), "sgd"), 0.1);
    for (let i = 0; i < 100 && s.status === "ok"; i++) {
      s = step(s);
    }
    expect(s.status).toBe("left-domain");
    const s1 = setOptimizer(s, "adam");
    expect(s1.pos).toEqual(SURFACES.saddle.start);
    expect(s1.status).toBe("ok");
    expect(derived(s1).canStep).toBe(true);
  });
});

describe("setLr", () => {
  it("only changes lr mid-run", () => {
    const s0 = toggleRun(step(initialState()));
    const optStateBefore = s0.optState;
    const s1 = setLr(s0, 0.2);
    expect(s1.lr).toBe(0.2);
    expect(s1.steps).toBe(s0.steps);
    expect(s1.optState).toBe(optStateBefore);
    expect(s1.running).toBe(s0.running);
  });
});

describe("toggleRun", () => {
  it("toggles ok state between running true/false", () => {
    const s0 = initialState();
    const s1 = toggleRun(s0);
    expect(s1.running).toBe(true);
    const s2 = toggleRun(s1);
    expect(s2.running).toBe(false);
  });

  it("stays not running on diverged or left-domain states", () => {
    let s = setLr(setOptimizer(setSurface(initialState(), "rosenbrock"), "sgd"), 1e307);
    for (let i = 0; i < 50 && s.status === "ok"; i++) {
      s = step(s);
    }
    expect(s.status).toBe("diverged");
    const toggled = toggleRun(s);
    expect(toggled.running).toBe(false);
  });
});

describe("setShow", () => {
  it("changes only the given flag", () => {
    const s0 = initialState();
    const s1 = setShow(s0, "contours", false);
    expect(s1.show).toEqual({ tangent: true, contours: false, path: true });
  });
});

describe("path capacity", () => {
  it("bounds path size at PATH_CAPACITY while steps keeps counting", () => {
    let s = setLr(initialState(), 0.001);
    for (let i = 0; i < 2100; i++) {
      s = step(s);
    }
    expect(s.steps).toBe(2100);
    expect(s.path.size).toBe(PATH_CAPACITY);
  });
});

describe("purity", () => {
  it("step does not mutate the input state's scalar fields", () => {
    const s0 = initialState();
    Object.freeze(s0);
    expect(() => step(s0)).not.toThrow();
    const s1 = step(s0);
    expect(s1).not.toBe(s0);
  });
});
