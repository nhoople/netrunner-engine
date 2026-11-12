/**
 * The shape of tests/baselines/invariants.json, which the setup hook in
 * tests/setup/invariants.ts compares each test against. The hook fails a
 * test that finds a new problem or no longer finds a recorded one; this file
 * catches entries the hook never visits, so the baseline only shrinks.
 */
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { PROBLEM_RULES } from "../src/index.js";

type Baseline = Record<string, Record<string, string[]>>;

const baseline = JSON.parse(
  readFileSync(new URL("./baselines/invariants.json", import.meta.url), "utf8"),
) as Baseline;

/** Ignore quoting and escapes when looking for a test name in its source. */
const plain = (text: string) => text.replace(/[\\"'`]/g, "");

describe("invariants baseline", () => {
  it("names only test files that exist", () => {
    const missing = Object.keys(baseline).filter((file) => !existsSync(file));
    expect(missing).toEqual([]);
  });

  it("names only tests that are still in their file", () => {
    const missing: string[] = [];
    for (const [file, tests] of Object.entries(baseline)) {
      if (!existsSync(file)) continue;
      const source = plain(readFileSync(file, "utf8"));
      for (const name of Object.keys(tests)) {
        if (name === "(outside a test)") continue;
        const last = name.split(" > ").pop()!;
        if (!source.includes(plain(last))) missing.push(`${file} > ${name}`);
      }
    }
    expect(missing).toEqual([]);
  });

  it("lists known problem codes, sorted, without duplicates or empty entries", () => {
    const bad: string[] = [];
    for (const [file, tests] of Object.entries(baseline)) {
      for (const [name, codes] of Object.entries(tests)) {
        const where = `${file} > ${name}`;
        if (codes.length === 0) bad.push(`${where}: empty`);
        if (codes.join() !== [...new Set(codes)].sort().join()) bad.push(`${where}: unsorted or duplicate`);
        for (const code of codes) {
          if (!(code in PROBLEM_RULES)) bad.push(`${where}: unknown code ${code}`);
        }
      }
    }
    expect(bad).toEqual([]);
  });

  it("keeps files and tests in sorted order, as the update script writes them", () => {
    const files = Object.keys(baseline);
    expect(files).toEqual([...files].sort());
    for (const tests of Object.values(baseline)) {
      const names = Object.keys(tests);
      expect(names).toEqual([...names].sort());
    }
  });
});
