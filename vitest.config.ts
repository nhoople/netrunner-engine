import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    // Quarantined jnet ports run through vitest.jnet.config.ts (`npm run test:jnet`).
    exclude: ["**/node_modules/**", "**/dist/**", "tests/jnet/**"],
    // Checks state invariants after every applyAction against a shrink-only
    // baseline (tests/baselines/invariants.json).
    setupFiles: ["tests/setup/invariants.ts"],
  },
});
