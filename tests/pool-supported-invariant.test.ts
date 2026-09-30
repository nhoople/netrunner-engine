/**
 * Pool invariant: every wave with status `supported` must have empty
 * `unsupported` on each listed card, unless that card id appears in the
 * cards-data allowlist (`data/supported-unsupported-allowlist.json`).
 *
 * Explicit deferrals while keeping status=supported are rare; prefer leaving
 * the wave in-progress / partial until clears land.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, beforeAll } from "vitest";
import {
  assertCardsPinnedTag,
  cardsDataPresent,
  getCardDef,
  loadCardPool,
} from "../src/index.js";

type Allowlist = {
  version?: number;
  cards?: Record<string, string>;
};

function loadAllowlist(): Record<string, string> {
  const path = join(
    process.cwd(),
    "vendor/cards-data/supported-unsupported-allowlist.json",
  );
  if (!existsSync(path)) return {};
  const raw = JSON.parse(readFileSync(path, "utf8")) as Allowlist;
  return raw.cards ?? {};
}

beforeAll(() => {
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertCardsPinnedTag("v1.93.0");
});

describe("supported-wave pool invariant", () => {
  it("supported waves have empty unsupported (or allowlisted deferral)", () => {
    const pool = loadCardPool(true);
    const allow = loadAllowlist();
    const failures: string[] = [];

    for (const [waveName, wave] of Object.entries(pool.waves)) {
      if (wave.status !== "supported") continue;
      for (const id of wave.cards) {
        const notes = getCardDef(id).unsupported ?? [];
        if (notes.length === 0) continue;
        if (allow[id]) continue;
        failures.push(
          `${waveName}/${id}: unsupported=${JSON.stringify(notes)}; add to supported-unsupported-allowlist.json with a deferral reason, or clear the card`,
        );
      }
    }

    expect(failures).toEqual([]);
  });
});
