import { defineConfig } from "vitest/config";

export default defineConfig({
  base: "/ai-lab/",
  build: {
    target: "es2022",
    sourcemap: false,
    // three/webgpu is the renderer library, loaded on demand by the first
    // visualization route and never by the home page, so it is allowed to be
    // large. Everything the entry chunk loads is far under the default limit.
    chunkSizeWarningLimit: 800,
    rollupOptions: {
      output: {
        // Vite 8 bundles with Rolldown; manualChunks is deprecated. Grouping
        // keeps three and katex as shared chunks across the three scenes.
        codeSplitting: {
          groups: [
            { name: "three", test: /node_modules\/three\/build\// },
            { name: "katex", test: /node_modules\/katex\// },
          ],
        },
      },
    },
  },
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
    passWithNoTests: true,
  },
});
