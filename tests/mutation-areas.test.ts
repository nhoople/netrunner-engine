/**
 * Stryker area configs (CR audit tool 1.9). Mutation runs are local only
 * (`npm run mutate:<area>`); this keeps the per-area scope from going stale
 * as files move.
 */
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
// @ts-expect-error -- plain ESM config module without type declarations
import { areas, sourceScanTests, testFilesFor } from "../stryker/areas.mjs";

type Area = { mutate: string[] };
const areaMap = areas as Record<string, Area>;
const pkg = JSON.parse(readFileSync("package.json", "utf8")) as {
  scripts: Record<string, string>;
};

describe("mutation areas", () => {
  it("covers the ten Phase 3 areas", () => {
    expect(Object.keys(areaMap)).toHaveLength(10);
  });

  for (const [name, area] of Object.entries(areaMap)) {
    it(`${name}: mutates files that exist, picks tests, and has a config and script`, () => {
      expect(area.mutate.filter((f) => !existsSync(f))).toEqual([]);
      const tests = (testFilesFor as (n: string) => string[])(name);
      expect(tests.length).toBeGreaterThan(0);
      expect(tests.filter((t) => (sourceScanTests as Set<string>).has(t))).toEqual([]);
      expect(existsSync(`stryker/${name}.config.mjs`)).toBe(true);
      expect(pkg.scripts[`mutate:${name}`]).toBe(`stryker run stryker/${name}.config.mjs`);
    });
  }
});
