import { defineConfig } from "vitest/config";

export default defineConfig({
  base: "/ai-lab/",
  build: {
    target: "es2022",
    sourcemap: false,
    // Only the three chunk is over the default 500 kB, and it is the renderer
    // library: no visualization can run without it, and no page loads it until
    // a visualization route asks for one. The limit is set above it so it stays
    // a tripwire on the entry chunk and the per-scene chunks, which are the ones
    // that must stay small.
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      output: {
        // Vite 8 bundles with Rolldown; manualChunks is deprecated. Grouping
        // keeps three and katex as shared chunks across the three scenes.
        // Rolldown adds one more shared chunk on its own, holding what the
        // scenes have in common: OrbitControls, the scene kit and the UI kit.
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
