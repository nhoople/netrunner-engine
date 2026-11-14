/**
 * Vitest config used only under Stryker. It narrows the suite to the tests
 * of the area named in STRYKER_AREA (set by stryker/base.mjs).
 */
import { defineConfig } from "vitest/config";
import { testFilesFor } from "./areas.mjs";

const area = process.env.STRYKER_AREA;
if (!area) throw new Error("STRYKER_AREA is not set; run through `npm run mutate:<area>`");

export default defineConfig({
  test: {
    include: testFilesFor(area),
    exclude: ["**/node_modules/**", "**/dist/**", "tests/jnet/**"],
    setupFiles: ["tests/setup/invariants.ts"],
  },
});
