/**
 * Shared Stryker config for one Phase 3 area (CR audit tool 1.9).
 * Each stryker/<area>.config.mjs calls areaConfig("<area>").
 */
import { areas } from "./areas.mjs";

export function areaConfig(name) {
  const area = areas[name];
  if (!area) throw new Error(`Unknown mutation area "${name}"`);
  // Read by stryker/vitest.config.mjs in each test-runner worker, which
  // inherits this process's environment.
  process.env.STRYKER_AREA = name;
  return {
    $schema: "../node_modules/@stryker-mutator/core/schema/stryker-schema.json",
    testRunner: "vitest",
    vitest: {
      configFile: "stryker/vitest.config.mjs",
      // Run the area's own test list, not vitest's import-graph guess.
      related: false,
    },
    plugins: ["@stryker-mutator/vitest-runner"],
    mutate: area.mutate,
    coverageAnalysis: "perTest",
    // The engine is type-checked in CI; skip a per-mutant tsc pass.
    checkers: [],
    reporters: ["clear-text", "progress", "html", "json"],
    htmlReporter: { fileName: `reports/mutation/${name}.html` },
    jsonReporter: { fileName: `reports/mutation/${name}.json` },
    tempDirName: `.stryker-tmp/${name}`,
    incremental: false,
    timeoutMS: 30000,
    concurrency: 4,
    thresholds: { high: 90, low: 70, break: null },
  };
}
