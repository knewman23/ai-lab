import { defineConfig } from "vitest/config";

export default defineConfig({
  base: "/ai-lab/",
  build: {
    target: "es2022",
    sourcemap: false,
    // The one chunk is three/webgpu plus katex, so it is expected to be large.
    chunkSizeWarningLimit: 1200,
  },
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
    passWithNoTests: true,
  },
});
