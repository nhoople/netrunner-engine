import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    // Quarantined jnet ports run through vitest.jnet.config.ts (`npm run test:jnet`).
    exclude: ["**/node_modules/**", "**/dist/**", "tests/jnet/**"],
    // Checks state invariants after every applyAction against a shrink-only
    // baseline (tests/baselines/invariants.json).
    // Records which card abilities resolve (tests/setup/ability-fire.ts,
    // CR audit tool 1.18).
    setupFiles: [
      "tests/setup/ability-fire.ts",
      "tests/setup/invariants.ts",
      // Off unless LEGALITY_AGREEMENT_OUT is set (scripts/legality-agreement.mjs).
      "tests/setup/legality-agreement.ts",
    ],
  },
});
