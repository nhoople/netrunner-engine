/**
 * CR cite-map hygiene (G7): every CR.* number/id pair resolves
 * bidirectionally in the pinned CR index.json.
 *
 * Citation existence (CR audit tool 1.5a): every literal `CR n.n…` in
 * src/** names a rule number that exists at the pin. Known misses are in
 * tests/baselines/cr-citations.json, which may only shrink. This checks
 * existence only; whether the cited rule is about what the code does is
 * tool 1.5b.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it, beforeAll } from "vitest";
import { assertPinnedTag, CR, crDataPresent } from "../src/index.js";

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  assertPinnedTag("v26.03");
});

describe("CR cite map (G7)", () => {
  it("every CR.* number/id pair is bidirectional in pinned index.json", () => {
    const index = JSON.parse(
      readFileSync(join(process.cwd(), "vendor/cr-data/index.json"), "utf8"),
    ) as {
      numbers: Record<string, string>;
      ids: Record<string, string>;
    };

    const entries = Object.entries(CR) as Array<
      [string, { number: string; id: string }]
    >;
    expect(entries.length).toBeGreaterThan(50);

    const failures: string[] = [];
    for (const [key, cite] of entries) {
      if (index.numbers[cite.number] !== cite.id) {
        failures.push(
          `CR.${key}: numbers[${cite.number}] = ${index.numbers[cite.number] ?? "MISSING"}, expected ${cite.id}`,
        );
      }
      if (index.ids[cite.id] !== cite.number) {
        failures.push(
          `CR.${key}: ids[${cite.id}] = ${index.ids[cite.id] ?? "MISSING"}, expected ${cite.number}`,
        );
      }
    }
    expect(failures).toEqual([]);
  });

  it("rdAccess uses rule_candidates_in_rnd (CR 7.4.1c)", () => {
    expect(CR.rdAccess).toEqual({
      number: "7.4.1c",
      id: "rule_candidates_in_rnd",
    });
  });

  it("installCost cites sec_install_cost (CR 8.5.11)", () => {
    expect(CR.installCost).toEqual({
      number: "8.5.11",
      id: "sec_install_cost",
    });
  });

  it("every literal CR citation in src/ exists at the pin (shrink-only baseline)", () => {
    const index = JSON.parse(
      readFileSync(join(process.cwd(), "vendor/cr-data/index.json"), "utf8"),
    ) as { numbers: Record<string, string> };
    const baseline = (
      JSON.parse(
        readFileSync(
          join(process.cwd(), "tests/baselines/cr-citations.json"),
          "utf8",
        ),
      ) as { missing: string[] }
    ).missing;

    const files: string[] = [];
    const walk = (dir: string): void => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        const p = join(dir, e.name);
        if (e.isDirectory()) walk(p);
        else if (e.name.endsWith(".ts")) files.push(p);
      }
    };
    walk(join(process.cwd(), "src"));

    // `CR 8.5.11`, `CR 1.21.1–1.21.6`, `CR 7.2.1, 7.2.2 / 7.3`, `CR 9`.
    const NUM = String.raw`\d+(?:\.\d+)+[a-z]?|\d+(?![\d.])`;
    const CITE = new RegExp(
      String.raw`\bCR\s+((?:${NUM})(?:\s*(?:,|–|—|-|/|&|and|or)\s*(?:${NUM}))*)`,
      "g",
    );
    let cited = 0;
    const missing = new Set<string>();
    for (const file of files) {
      const text = readFileSync(file, "utf8");
      for (const m of text.matchAll(CITE)) {
        for (const number of m[1]!.match(new RegExp(NUM, "g")) ?? []) {
          cited++;
          if (!(number in index.numbers)) {
            missing.add(`${relative(process.cwd(), file)} CR ${number}`);
          }
        }
      }
    }
    expect(cited).toBeGreaterThan(1000);
    const found = [...missing].sort();
    expect(
      found.filter((k) => !baseline.includes(k)),
      "CR citation(s) not in vendor/cr-data/index.json at the pin: fix the " +
        "number, or record it in tests/baselines/cr-citations.json with a reason",
    ).toEqual([]);
    expect(
      baseline.filter((k) => !found.includes(k)),
      "fixed citation(s): remove from tests/baselines/cr-citations.json",
    ).toEqual([]);
  });
});
