import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    // Quarantined jnet ports run through vitest.jnet.config.ts (`npm run test:jnet`).
    exclude: ["**/node_modules/**", "**/dist/**", "tests/jnet/**"],
  },
});
