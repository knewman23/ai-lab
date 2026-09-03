import type { Mat2 } from "../../core/math/matrix2";

/** Keys identifying the built-in preset matrices, in display order. */
export type PresetKey = "identity" | "scale" | "shear" | "rotation" | "reflection" | "projection";

export const PRESET_KEYS = [
  "identity",
  "scale",
  "shear",
  "rotation",
  "reflection",
  "projection",
] as const satisfies readonly PresetKey[];

/** Table of preset titles and exact matrices, per the design spec. */
export const PRESETS: Readonly<Record<PresetKey, { readonly title: string; readonly m: Mat2 }>> = {
  identity: { title: "Identity", m: [1, 0, 0, 1] },
  scale: { title: "Scale", m: [2, 0, 0, 0.5] },
  shear: { title: "Shear", m: [1, 1, 0, 1] },
  rotation: {
    title: "Rotation 45°",
    m: [Math.SQRT1_2, -Math.SQRT1_2, Math.SQRT1_2, Math.SQRT1_2],
  },
  reflection: { title: "Reflection across x", m: [1, 0, 0, -1] },
  projection: { title: "Projection onto x", m: [1, 0, 0, 0] },
};
