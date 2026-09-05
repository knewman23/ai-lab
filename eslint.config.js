import js from "@eslint/js";
import tseslint from "typescript-eslint";
import globals from "globals";

export default tseslint.config(
  {
    // `tmp/` is scratch: the visual-verify output and one-off audit harnesses live there.
    ignores: ["dist/", "public/", "node_modules/", "tmp/"],
  },
  {
    files: ["eslint.config.js"],
    ...js.configs.recommended,
  },
  {
    files: ["**/*.ts"],
    extends: [js.configs.recommended, ...tseslint.configs.recommendedTypeChecked],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
      globals: globals.browser,
    },
  },
);
