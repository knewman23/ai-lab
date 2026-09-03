import { defineConfig } from "vitest/config";

export default defineConfig({
  base: "/ai-lab/",
  build: { target: "es2022", sourcemap: true },
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
    passWithNoTests: true,
  },
});
