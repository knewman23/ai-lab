// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { createRendererGate, type RendererModule } from "../../src/app/shell";
import type { RendererResult } from "../../src/app/viz-page";
import type { Renderer } from "../../src/viz/types";

/** Narrows a result to the success arm, failing the test with its error if not. */
function expectOk(result: RendererResult): Extract<RendererResult, { ok: true }> {
  if (!result.ok) throw new Error(`expected ok, got ${result.reason}`);
  return result;
}

function fakeRenderer(): Renderer {
  return { domElement: document.createElement("canvas") } as unknown as Renderer;
}

/** A stand-in for core/renderer.ts whose two halves fail independently. */
function fakeModule(createRenderer: RendererModule["createRenderer"]): RendererModule {
  return { createRenderer, applySize: () => undefined };
}

describe("createRendererGate", () => {
  it("creates the renderer once and shares it across routes", async () => {
    const holder = document.createElement("div");
    const renderer = fakeRenderer();
    const createRenderer = vi.fn(() => Promise.resolve(renderer));
    const importRenderer = vi.fn(() => Promise.resolve(fakeModule(createRenderer)));
    const getRenderer = createRendererGate(holder, importRenderer);

    const [first, second] = await Promise.all([getRenderer(), getRenderer()]);

    expect(importRenderer).toHaveBeenCalledTimes(1);
    expect(createRenderer).toHaveBeenCalledTimes(1);
    expect(createRenderer).toHaveBeenCalledWith(holder);
    expect(expectOk(first).renderer).toBe(renderer);
    expect(typeof expectOk(first).applySize).toBe("function");
    expect(second).toBe(first);
  });

  it("reports a module that did not arrive as a load failure, without rejecting", async () => {
    const importRenderer = vi.fn(() => Promise.reject(new Error("offline")));
    const getRenderer = createRendererGate(document.createElement("div"), importRenderer);

    const result = await getRenderer();

    expect(result).toMatchObject({ ok: false, reason: "load" });
    expect(result.ok ? null : result.error).toBeInstanceOf(Error);
  });

  it("does not memoise a load failure, so the next route retries", async () => {
    const renderer = fakeRenderer();
    const importRenderer = vi
      .fn<() => Promise<RendererModule>>()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValue(fakeModule(() => Promise.resolve(renderer)));
    const getRenderer = createRendererGate(document.createElement("div"), importRenderer);

    const failed = await getRenderer();
    const retried = await getRenderer();

    expect(failed.ok).toBe(false);
    expect(expectOk(retried).renderer).toBe(renderer);
    expect(importRenderer).toHaveBeenCalledTimes(2);
  });

  it("does not memoise a load failure thrown before the importer's first await", async () => {
    const renderer = fakeRenderer();
    const importRenderer = vi
      .fn<() => Promise<RendererModule>>()
      .mockImplementationOnce(() => {
        throw new Error("bad chunk");
      })
      .mockResolvedValue(fakeModule(() => Promise.resolve(renderer)));
    const getRenderer = createRendererGate(document.createElement("div"), importRenderer);

    await expect(getRenderer()).resolves.toMatchObject({ ok: false, reason: "load" });
    await expect(getRenderer()).resolves.toMatchObject({ ok: true });
  });

  it("memoises a GPU failure, so a later route does not retry", async () => {
    const createRenderer = vi.fn(() => Promise.reject(new Error("no adapter")));
    const importRenderer = vi.fn(() => Promise.resolve(fakeModule(createRenderer)));
    const getRenderer = createRendererGate(document.createElement("div"), importRenderer);

    const first = await getRenderer();
    const second = await getRenderer();

    expect(first).toMatchObject({ ok: false, reason: "gpu" });
    expect(first.ok ? null : first.error).toBeInstanceOf(Error);
    expect(second).toBe(first);
    expect(createRenderer).toHaveBeenCalledTimes(1);
    expect(importRenderer).toHaveBeenCalledTimes(1);
  });
});
