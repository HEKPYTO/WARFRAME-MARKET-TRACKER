import js from "@eslint/js";
import tseslint from "@typescript-eslint/eslint-plugin";
import tsParser from "@typescript-eslint/parser";
import solid from "eslint-plugin-solid";
import globals from "globals";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.dirname(fileURLToPath(import.meta.url));

export default [
  {
    ignores: [
      ".output/**",
      ".playwright-cli/**",
      ".turbo/**",
      ".vinxi/**",
      ".worktrees/**",
      "artifacts/**",
      "backups/**",
      "coverage/**",
      "dist/**",
      "docs/**",
      "node_modules/**",
      "output/**",
      "apps/web/dist/**",
      "apps/web/.vinxi/**",
      "apps/web/.output/**",
      "apps/web/.nitro/**",
      "apps/worker/dist/**",
      "packages/*/dist/**",
    ],
  },
  js.configs.recommended,
  {
    files: ["**/*.ts", "**/*.tsx"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: "latest",
        projectService: true,
        sourceType: "module",
        tsconfigRootDir: rootDir,
      },
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
    plugins: {
      "@typescript-eslint": tseslint,
      solid,
    },
    rules: {
      ...tseslint.configs.recommended.rules,
      ...solid.configs.typescript.rules,
      "@typescript-eslint/consistent-type-imports": "error",
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
        },
      ],
      "solid/reactivity": "error",
    },
  },
];
