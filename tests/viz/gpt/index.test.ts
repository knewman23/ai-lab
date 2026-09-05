// @vitest-environment jsdom
import { BufferGeometry, Material, Mesh, type Object3D, PerspectiveCamera, Vector3 } from "three";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createThemeColors } from "../../../src/core/theme";
import { gptTransformer } from "../../../src/viz/gpt";
import { buildScene } from "../../../src/viz/gpt/scene-build";
import { frameGpt } from "../../../src/viz/gpt/frame-gpt";
import { BAND_Z, columnX } from "../../../src/viz/gpt/layout";
import type { Renderer, VizHost } from "../../../src/viz/types";

/**
 * Levers the mocked modules read. `throwAt` names the unit whose construction fails, so the
 * unwind test can break one mount without breaking every other test in the file; `order` records
 * the disposals so the unwind's direction can be asserted rather than assumed.
 */
const control = vi.hoisted(() => ({
  throwAt: "",
  order: [] as string[],
  passes: 0,
  /** Which stage each unit that dims was last told to focus, tagged with the unit. */
  focus: [] as string[],
  /** `${query}:${head}` for every arc redraw, so the fan's aim can be read back. */
  arcs: [] as string[],
  /** The column the token stack was last told to draw in the accent. */
  queried: [] as number[],
  /** Whether the floor's arrow chain was last shown or hidden. */
  pathShown: [] as boolean[],
  /** Every distribution the probability row was drawn from. */
  bars: [] as number[][],
}));

vi.mock("../../../src/viz/gpt/columns", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../src/viz/gpt/columns")>();
  return {
    ...actual,
    createColumns: (theme: Parameters<typeof actual.createColumns>[0]) => {
      const columns = actual.createColumns(theme);
      return {
        ...columns,
        setQuery(i: number): void {
          control.queried.push(i);
          columns.setQuery(i);
        },
        dispose(): void {
          control.order.push("columns");
          columns.dispose();
        },
      };
    },
  };
});

vi.mock("../../../src/viz/gpt/arcs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../src/viz/gpt/arcs")>();
  return {
    ...actual,
    createArcs: (theme: Parameters<typeof actual.createArcs>[0]) => {
      const arcs = actual.createArcs(theme);
      return {
        ...arcs,
        set(...args: Parameters<typeof arcs.set>): void {
          control.arcs.push(`${args[1]}:${args[2]}`);
          arcs.set(...args);
        },
        setFocus(stage: Parameters<typeof arcs.setFocus>[0]): void {
          control.focus.push(`arcs:${stage}`);
          arcs.setFocus(stage);
        },
        dispose(): void {
          control.order.push("arcs");
          arcs.dispose();
        },
      };
    },
  };
});

vi.mock("../../../src/viz/gpt/residual-path", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../src/viz/gpt/residual-path")>();
  return {
    ...actual,
    createResidualPath: (theme: Parameters<typeof actual.createResidualPath>[0]) => {
      if (control.throwAt === "residual-path") throw new Error("residual path refused to build");
      const path = actual.createResidualPath(theme);
      return {
        ...path,
        setShow(on: boolean): void {
          control.pathShown.push(on);
          path.setShow(on);
        },
      };
    },
  };
});

vi.mock("../../../src/viz/gpt/bars", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../src/viz/gpt/bars")>();
  return {
    ...actual,
    createBars: (theme: Parameters<typeof actual.createBars>[0]) => {
      const bars = actual.createBars(theme);
      return {
        ...bars,
        set(p: Float64Array): void {
          control.bars.push([...p]);
          bars.set(p);
        },
      };
    },
  };
});

vi.mock("../../../src/viz/gpt/wall-bands", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../src/viz/gpt/wall-bands")>();
  return {
    ...actual,
    createWallBands: (theme: Parameters<typeof actual.createWallBands>[0]) => {
      const bands = actual.createWallBands(theme);
      return {
        ...bands,
        setFocus(stage: Parameters<typeof bands.setFocus>[0]): void {
          control.focus.push(`bands:${stage}`);
          bands.setFocus(stage);
        },
      };
    },
  };
});

vi.mock("../../../src/viz/gpt/state", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../src/viz/gpt/state")>();
  return {
    ...actual,
    pass: (s: Parameters<typeof actual.pass>[0]) => {
      control.passes += 1;
      return actual.pass(s);
    },
  };
});

/** The canvas is square so screen pixels and NDC agree with the scene camera's aspect of 1. */
const SIZE = 400;

/** What the fake renderer was handed on one frame. */
interface Frame {
  readonly scene: Object3D;
  readonly camera: PerspectiveCamera;
}

function host(): {
  host: VizHost;
  theme: ReturnType<typeof createThemeColors>;
  frames: Frame[];
} {
  const canvas = document.createElement("canvas");
  const frames: Frame[] = [];
  const renderer = {
    domElement: canvas,
    // Stands in for the matrix update a real renderer does each frame, which the pick raycast
    // and the label projection both read.
    render: vi.fn((scene: Object3D, camera: PerspectiveCamera) => {
      scene.updateMatrixWorld(true);
      camera.updateMatrixWorld(true);
      frames.push({ scene, camera });
    }),
    backend: {},
    info: { memory: { geometries: 0 } },
  } as unknown as Renderer;
  const theme = createThemeColors(() => "#1f4ed8");
  vi.spyOn(canvas, "getBoundingClientRect").mockReturnValue({
    left: 0,
    top: 0,
    width: SIZE,
    height: SIZE,
  } as DOMRect);
  canvas.setPointerCapture = vi.fn();
  canvas.releasePointerCapture = vi.fn();
  canvas.hasPointerCapture = vi.fn(() => false);
  const canvasContainer = document.createElement("div");
  canvasContainer.append(canvas);
  return {
    host: { canvasContainer, panel: document.createElement("div"), renderer, theme },
    theme,
    frames,
  };
}

/** The last frame the scene rendered; a test that reads one has always driven `update` first. */
function lastFrame(frames: Frame[]): Frame {
  const frame = frames.at(-1);
  if (frame === undefined) throw new Error("the scene has not rendered a frame");
  return frame;
}

/**
 * The CSS pixel a world point projects to, from a stand-in for the scene's camera:
 * `createSceneKit` builds a 45-degree camera at aspect 1 and the scene parks it at `frameGpt`.
 */
function pixelOf(world: readonly [number, number, number]): readonly [number, number] {
  const home = frameGpt();
  const camera = new PerspectiveCamera(45, 1, 0.1, 100);
  camera.up.set(0, 0, 1);
  camera.position.set(...home.position);
  camera.lookAt(new Vector3(...home.target));
  camera.updateMatrixWorld();
  const p = new Vector3(...world).project(camera);
  return [((p.x + 1) / 2) * SIZE, ((1 - p.y) / 2) * SIZE];
}

function pointer(type: string, x: number, y: number): PointerEvent {
  // MouseEvent rather than PointerEvent: jsdom's PointerEvent support varies, and the
  // handlers only read pointerId, clientX and clientY.
  const event = new MouseEvent(type, { clientX: x, clientY: y });
  Object.defineProperty(event, "pointerId", { value: 1 });
  return event as PointerEvent;
}

function clickCanvas(canvas: HTMLElement, at: readonly [number, number]): void {
  canvas.dispatchEvent(pointer("pointerdown", at[0], at[1]));
  canvas.dispatchEvent(pointer("pointerup", at[0], at[1]));
}

function drag(
  canvas: HTMLElement,
  from: readonly [number, number],
  to: readonly [number, number],
): void {
  canvas.dispatchEvent(pointer("pointerdown", from[0], from[1]));
  canvas.dispatchEvent(pointer("pointermove", to[0], to[1]));
  canvas.dispatchEvent(pointer("pointerup", to[0], to[1]));
}

function labelTexts(container: HTMLElement): string[] {
  return [...container.querySelectorAll(".viz-labels span")].map((s) => s.textContent ?? "");
}

function select(el: HTMLElement, label: string): HTMLSelectElement {
  const found = [...el.querySelectorAll<HTMLSelectElement>("select")].find((s) =>
    s.parentElement?.textContent?.includes(label),
  );
  if (!found) throw new Error(`select not found: ${label}`);
  return found;
}

function toggle(el: HTMLElement, label: string): HTMLInputElement {
  const found = [...el.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')].find((i) =>
    i.parentElement?.textContent?.includes(label),
  );
  if (!found) throw new Error(`toggle not found: ${label}`);
  return found;
}

function readout(el: HTMLElement): string {
  return [...el.querySelectorAll("dd")].map((d) => d.textContent ?? "").join(" ");
}

/** Every geometry and material hanging off the scene while it is mounted. */
function resources(root: Object3D): Set<object> {
  const held = new Set<object>();
  root.traverse((object) => {
    const { geometry, material } = object as { geometry?: object; material?: object };
    if (geometry) held.add(geometry);
    if (material) held.add(material);
  });
  return held;
}

afterEach(() => {
  control.throwAt = "";
  control.order.length = 0;
  control.passes = 0;
  control.focus.length = 0;
  control.arcs.length = 0;
  control.queried.length = 0;
  control.pathShown.length = 0;
  control.bars.length = 0;
  localStorage.clear();
  vi.restoreAllMocks();
});

describe("gptTransformer", () => {
  it("carries the registry metadata", () => {
    expect(gptTransformer.id).toBe("gpt-transformer");
    expect(gptTransformer.topic).toBe("machine-learning");
    expect(gptTransformer.title).toBe("GPT transformer");
    expect(gptTransformer.summary).toBe(
      "Drag eight word embeddings across the floor and watch one transformer block respond: attention arcs between the tokens, the residual stream, and the probability of every next word.",
    );
    expect(gptTransformer.status).toBe("ready");
  });
});

describe("buildScene", () => {
  it("hangs every drawn unit off the scene", () => {
    const { host: h } = host();
    const scene = buildScene(h, false);

    // A unit that is built but never added is a unit the viewer never sees, and nothing
    // downstream would notice: it disposes cleanly and draws nothing.
    for (const group of [
      scene.wall.group,
      scene.floor.group,
      scene.bands.group,
      scene.columns.group,
      scene.arcs.group,
      scene.bars.group,
      scene.path.group,
    ]) {
      expect(group.parent).toBe(scene.kit.scene);
    }

    // The pick volumes hang off a group of their own, which hangs off the scene — never off
    // the floor, whose bare plane a drag would raycast recursively.
    const picks = scene.hits.targets[0]?.parent;
    expect(picks?.children).toHaveLength(scene.hits.targets.length);
    expect(picks).not.toBe(scene.floor.group);
    expect(picks?.parent).toBe(scene.kit.scene);

    scene.unwind();
  });

  it("leaves nothing attached or overlaid once it unwinds", () => {
    const { host: h } = host();
    const scene = buildScene(h, false);
    expect(h.canvasContainer.querySelector("div.viz-labels")).not.toBeNull();

    scene.unwind();

    let meshes = 0;
    scene.kit.scene.traverse((object) => {
      if ((object as Mesh).isMesh === true) meshes += 1;
    });
    expect(meshes).toBe(0);
    expect(h.canvasContainer.querySelector("div.viz-labels")).toBeNull();
  });
});

describe("gptTransformer.mount", () => {
  it("renders the first frame, then idles until something changes", () => {
    const { host: h } = host();
    const viz = gptTransformer.mount(h);

    expect(viz.update(0.016)).toBe(true);
    expect(viz.update(0.016)).toBe(false);

    viz.dispose();
  });

  it("puts the band, word, vocabulary and path labels over the canvas", () => {
    const { host: h } = host();
    const viz = gptTransformer.mount(h);

    const texts = labelTexts(h.canvasContainer);
    expect(texts).toContain("embed + position");
    expect(texts).toContain("logits");
    expect(texts).toContain("fast");
    expect(texts).toContain("+ attention");

    viz.dispose();
  });

  it("drops the labels it cannot draw legibly, keeping the first band name", () => {
    const { host: h } = host();
    const viz = gptTransformer.mount(h);
    // Every label drawn wide enough to cover the whole canvas, so all 29 fight for one space.
    for (const span of h.canvasContainer.querySelectorAll<HTMLElement>(".viz-labels span")) {
      span.getBoundingClientRect = (): DOMRect => new DOMRect(0, 0, 4 * SIZE, 4 * SIZE);
    }
    viz.resize(SIZE, SIZE);
    viz.update(0.016);

    const shown = [...h.canvasContainer.querySelectorAll<HTMLElement>(".viz-labels span")].filter(
      (span) => !span.hidden,
    );
    expect(shown.map((span) => span.textContent)).toEqual(["embed + position"]);

    viz.dispose();
  });

  it("re-aims the camera when the canvas changes shape", () => {
    const { host: h, frames } = host();
    const viz = gptTransformer.mount(h);

    viz.resize(800, 400);
    viz.update(0.016);

    expect(lastFrame(frames).camera.aspect).toBe(2);

    viz.dispose();
  });

  it("selects the query token when its column is clicked, and says so in the panel", () => {
    const { host: h } = host();
    const viz = gptTransformer.mount(h);
    // One frame so the scene graph's world matrices are current for the pick raycast.
    viz.update(0.016);
    const query = select(h.panel, "Query token");
    expect(query.value).toBe("4");

    const middle = (BAND_Z.embed + BAND_Z.mlp) / 2;
    clickCanvas(h.renderer.domElement, pixelOf([columnX(1), 0, middle]));

    expect(query.value).toBe("1");

    viz.dispose();
  });

  it("renders the panel once during mount, before anything has been touched", () => {
    const { host: h } = host();
    const viz = gptTransformer.mount(h);

    // The panel seeds its widgets from `initialState()` rather than from the state it is
    // handed, so a mount that never rendered would show correct controls only by coincidence
    // and stale ones the moment anything restores a state. The readout is the tell: it has no
    // seeded content at all, so text in it means `render` ran.
    expect(readout(h.panel).trim()).not.toBe("");

    viz.dispose();
  });

  it("focuses the same stage on every unit that dims", () => {
    const { host: h } = host();
    const viz = gptTransformer.mount(h);
    control.focus.length = 0;

    const stage = select(h.panel, "Stage");
    stage.value = "scores";
    stage.dispatchEvent(new Event("change"));

    // The bands dim and the ribbons switch to raw scores off one selection.
    expect(control.focus).toEqual(["bands:scores", "arcs:scores"]);

    viz.dispose();
  });

  it("aims the arcs and the accent column at the selected query and head", () => {
    const { host: h } = host();
    const viz = gptTransformer.mount(h);
    viz.update(0.016);
    expect(control.arcs.at(-1)).toBe("4:both");
    expect(control.queried.at(-1)).toBe(4);

    const middle = (BAND_Z.embed + BAND_Z.mlp) / 2;
    clickCanvas(h.renderer.domElement, pixelOf([columnX(2), 0, middle]));
    expect(control.arcs.at(-1)).toBe("2:both");
    expect(control.queried.at(-1)).toBe(2);

    const head = select(h.panel, "Head");
    head.value = "head1";
    head.dispatchEvent(new Event("change"));
    expect(control.arcs.at(-1)).toBe("2:head1");

    viz.dispose();
  });

  it("hides the floor's arrow chain when the residual-path toggle goes off", () => {
    const { host: h } = host();
    const viz = gptTransformer.mount(h);
    expect(control.pathShown.at(-1)).toBe(true);

    const path = toggle(h.panel, "Residual path");
    path.checked = false;
    path.dispatchEvent(new Event("change"));

    expect(control.pathShown.at(-1)).toBe(false);

    viz.dispose();
  });

  it("moves a word when its sphere is dragged across the floor", () => {
    const { host: h } = host();
    const viz = gptTransformer.mount(h);
    viz.update(0.016);
    const before = readout(h.panel);

    // `the` starts at embedding (0, 1.6), which is floor (0, -0.76). The grab is 0.15 off its
    // centre: outside the 0.09 sphere the viewer sees, inside the wider pick volume around it.
    // Aiming at the sphere itself would pass just as well with the drag wired to the visible
    // meshes, and the forgiving grab is the whole point of the pick volume.
    drag(h.renderer.domElement, pixelOf([0.15, -0.76, 0.09]), pixelOf([1.4, -4, 0.09]));

    expect(viz.update(0.016)).toBe(true);
    // Moving a word moves the tied unembedding, so the distribution moves with it.
    expect(readout(h.panel)).not.toBe(before);
    // The hint comes down on the first drag: it has been read.
    expect(h.canvasContainer.querySelector(".canvas-hint")).toBeNull();

    viz.dispose();
  });

  it("answers a temperature move with a softmax rather than a forward pass", () => {
    const { host: h } = host();
    const viz = gptTransformer.mount(h);
    const passes = control.passes;
    const before = readout(h.panel);

    const slider = h.panel.querySelector<HTMLInputElement>('input[type="range"]');
    if (!slider) throw new Error("temperature slider not found");
    slider.value = slider.min;
    slider.dispatchEvent(new Event("input"));

    expect(control.passes).toBe(passes);
    expect(readout(h.panel)).not.toBe(before);

    viz.dispose();
  });

  it.each(["Positional encoding", "Causal mask"])(
    "runs the forward pass again when %s moves",
    (label) => {
      const { host: h } = host();
      const viz = gptTransformer.mount(h);
      // Probe from a middle token: the default query is the last position, which already sees
      // every key, so unmasking there is a real no-op and would prove nothing about the toggle.
      const query = select(h.panel, "Query token");
      query.value = "1";
      query.dispatchEvent(new Event("change"));

      const passes = control.passes;
      const before = readout(h.panel);

      const control_ = toggle(h.panel, label);
      control_.checked = false;
      control_.dispatchEvent(new Event("change"));

      // Both are inputs to `forward`, so neither can be answered from the cached pass.
      expect(control.passes).toBe(passes + 1);
      expect(readout(h.panel)).not.toBe(before);

      viz.dispose();
    },
  );

  it("runs the forward pass again when the sentence changes", () => {
    const { host: h } = host();
    const viz = gptTransformer.mount(h);
    const passes = control.passes;

    const sentence = select(h.panel, "Sentence");
    sentence.value = "dog-ran";
    sentence.dispatchEvent(new Event("change"));

    expect(control.passes).toBe(passes + 1);
    expect(labelTexts(h.canvasContainer)).toContain("ran");

    viz.dispose();
  });

  it("detaches both pointer mechanisms and empties the panel on dispose", () => {
    const { host: h } = host();
    const remove = vi.spyOn(h.renderer.domElement, "removeEventListener");
    const viz = gptTransformer.mount(h);
    expect(h.panel.childElementCount).toBeGreaterThan(0);

    viz.dispose();

    // The drag listens on the bubble phase, the column pick's pointerdown on the capture
    // phase; both arms must come off or a disposed scene keeps answering the pointer.
    // Both mechanisms hear pointerdown in the capture phase — ahead of OrbitControls, which
    // listens on the bubble phase — so the capturing removals are exactly theirs, and the
    // count is what says both came off rather than one leaving a disposed scene listening.
    const removed = remove.mock.calls;
    expect(
      removed.filter(([type, , capture]) => type === "pointerdown" && capture === true),
    ).toHaveLength(2);
    const types = removed.map(([type]) => type);
    for (const type of ["pointermove", "pointerup", "pointercancel"]) {
      expect(types).toContain(type);
    }
    expect(h.panel.childElementCount).toBe(0);
    expect(h.canvasContainer.querySelector("div.viz-labels")).toBeNull();
    expect(h.canvasContainer.querySelector(".canvas-hint")).toBeNull();
  });

  it("gives back every theme listener it took", () => {
    const { host: h, theme } = host();
    const add = vi.spyOn(theme, "addEventListener");
    const remove = vi.spyOn(theme, "removeEventListener");
    const viz = gptTransformer.mount(h);
    const taken = add.mock.calls.filter(([type]) => type === "change").length;
    // Each drawn unit subscribes, and so does the assembler: a scene with none would
    // pass the balance below without ever having been theme-aware.
    expect(taken).toBeGreaterThan(1);

    viz.dispose();

    expect(remove.mock.calls.filter(([type]) => type === "change")).toHaveLength(taken);
  });

  it("redraws when the palette changes under it", () => {
    const { host: h, theme } = host();
    const viz = gptTransformer.mount(h);
    viz.update(0.016);
    expect(viz.update(0.016)).toBe(false);

    theme.dispatchEvent(new Event("change"));

    expect(viz.update(0.016)).toBe(true);

    viz.dispose();
  });

  it("redraws the probability row whenever the distribution moves", () => {
    const { host: h } = host();
    const viz = gptTransformer.mount(h);
    const before = control.bars.at(-1);
    expect(before).toBeDefined();

    const slider = h.panel.querySelector<HTMLInputElement>('input[type="range"]');
    if (!slider) throw new Error("temperature slider not found");
    slider.value = slider.min;
    slider.dispatchEvent(new Event("input"));

    expect(control.bars.at(-1)).not.toEqual(before);

    viz.dispose();
  });

  it("releases every geometry and material exactly once", () => {
    // The spies stand in for the real disposals: nothing here reads a released buffer, and
    // recording `this` is the whole point — it is what says which resource was let go.
    const released: object[] = [];
    vi.spyOn(BufferGeometry.prototype, "dispose").mockImplementation(function (
      this: BufferGeometry,
    ) {
      released.push(this);
    });
    vi.spyOn(Material.prototype, "dispose").mockImplementation(function (this: Material) {
      released.push(this);
    });

    const { host: h, frames } = host();
    const viz = gptTransformer.mount(h);
    viz.update(0.016);
    const { scene } = lastFrame(frames);
    const held = resources(scene);
    // A guard on the guard: an empty scene would make every assertion below vacuous.
    expect(held.size).toBeGreaterThan(10);

    viz.dispose();

    for (const resource of held) {
      expect(released.filter((r) => r === resource)).toHaveLength(1);
    }
    // Nothing is left hanging off the scene for a second sweep to find.
    let meshes = 0;
    scene.traverse((object) => {
      if ((object as Mesh).isMesh === true) meshes += 1;
    });
    expect(meshes).toBe(0);
  });

  it("unwinds in reverse and leaks nothing when a unit refuses to build", () => {
    const released: object[] = [];
    vi.spyOn(BufferGeometry.prototype, "dispose").mockImplementation(function (
      this: BufferGeometry,
    ) {
      released.push(this);
    });

    control.throwAt = "residual-path";
    const { host: h } = host();

    expect(() => gptTransformer.mount(h)).toThrow("residual path refused to build");

    // The arcs are built after the columns, so they are torn down before them.
    expect(control.order).toEqual(["arcs", "columns"]);
    expect(released.length).toBeGreaterThan(0);
    // A half-built mount leaves no overlay, no hint and no panel behind either.
    expect(h.canvasContainer.querySelector("div.viz-labels")).toBeNull();
    expect(h.canvasContainer.querySelector(".canvas-hint")).toBeNull();
    expect(h.panel.childElementCount).toBe(0);
  });

  it("leaves the hint off once a previous visit dismissed it", () => {
    localStorage.setItem("ai-lab.hint.gpt", "1");
    const { host: h } = host();
    const viz = gptTransformer.mount(h);

    expect(h.canvasContainer.querySelector(".canvas-hint")).toBeNull();

    viz.dispose();
  });
});
