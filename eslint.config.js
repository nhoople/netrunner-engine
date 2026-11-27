import eslint from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";
import prettierConfig from "eslint-config-prettier";

export default tseslint.config(
  {
    ignores: [
      "dist/**",
      "node_modules/**",
      "vendor/**",
      ".stryker-tmp/**",
      "reports/**",
    ],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
    rules: {
      // Prefer existing tsc unused checks; keep eslint from blocking on `_`-prefixed names.
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
      // Thin recommended set: allow intentional `any` escape hatches without a rewrite.
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-empty-object-type": "warn",
    },
  },
  {
    // Choose windows open through openPendingChoose, which refuses to
    // overwrite a pending choice or open one with no options. Clears
    // (`= null`) stay raw.
    files: ["src/**/*.ts"],
    ignores: ["src/state/triggers/pendingChoice.ts"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector:
            "AssignmentExpression[left.type='MemberExpression'][left.property.name='pendingChoice'][right.type='ObjectExpression']",
          message:
            "Open a choice with openPendingChoose (src/state/triggers/pendingChoice.ts), not a raw pendingChoice object.",
        },
      ],
    },
  },
  // Last: turn off the stylistic rules Prettier owns, so the two never disagree.
  prettierConfig,
);
