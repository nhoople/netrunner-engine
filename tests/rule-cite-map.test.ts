/**
 * CR cite-map hygiene (G7): every CR.* number/id pair resolves
 * bidirectionally in the pinned CR index.json.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
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
});
