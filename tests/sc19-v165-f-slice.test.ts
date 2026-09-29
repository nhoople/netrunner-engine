/**
 * System Core 2019 v1.65.0 F-slice: Gabriel Santiago / Quest Completed /
 * Explode-a-palooza / Lamprey / Ghost Branch.
 */
import { describe, expect, it, beforeAll } from "vitest";
import {
  assertCardsPinnedTag,
  assertPinnedTag,
  cardsDataPresent,
  crDataPresent,
  fx,
  getCardDef,
  loadCardCatalog,
  loadCardPool,
  validateEffectTree,
} from "../src/index.js";

const CLEAR = [
  "gabriel-santiago-consummate-professional",
  "quest-completed",
  "explode-a-palooza",
  "lamprey",
  "ghost-branch",
] as const;

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.76.0");
});

describe("System Core 2019 v1.65.0 F-slice", () => {
  it("declares at least 35 SC19-only clears", () => {
    const pool = loadCardPool(true);
    expect(pool.waves["system-core-2019"].status).toBe("supported");
    let clear = 0;
    for (const id of pool.waves["system-core-2019"].cards) {
      const def = getCardDef(id);
      if ((def.unsupported ?? []).length === 0 && def.wave === "system-core-2019") {
        clear++;
      }
    }
    expect(clear).toBeGreaterThanOrEqual(35);
  });

  it("loads five clear F-slice cards", () => {
    const catalog = loadCardCatalog(true);
    for (const id of CLEAR) {
      const def = catalog.get(id)!;
      expect(def.unsupported ?? [], id).toEqual([]);
      expect(def.wave).toBe("system-core-2019");
    }
  });

  it("Gabriel gains 2¢ on first successful HQ run", () => {
    const def = getCardDef("gabriel-santiago-consummate-professional");
    expect(def.type).toBe("identity");
    expect(def.onFirstSuccessfulHqRunThisTurn).toEqual(
      fx.gainCredits("runner", 2),
    );
    expect(validateEffectTree(def.onFirstSuccessfulHqRunThisTurn!)).toBeNull();
  });

  it("Quest Completed accesses one installed non-ice after all centrals", () => {
    const def = getCardDef("quest-completed");
    expect(def.playRequiresSuccessfulAllCentralsThisTurn).toBe(true);
    expect(def.onPlay).toEqual(
      fx.do({ kind: "access_one_root_other_server" }),
    );
    expect(validateEffectTree(def.onPlay!)).toBeNull();
  });

  it("Explode-a-palooza may gain 5¢ on access", () => {
    const def = getCardDef("explode-a-palooza");
    expect(def.mustRevealWhenAccessedFromRd).toBe(true);
    expect(def.onAccess?.op).toBe("choose");
    expect(validateEffectTree(def.onAccess!)).toBeNull();
  });

  it("Lamprey drains Corp on HQ success and trashes on virus purge", () => {
    const def = getCardDef("lamprey");
    expect(def.trashOnVirusPurge).toBe(true);
    expect(def.onSuccessfulRun).toEqual(
      fx.if(
        { op: "attacking_hq" },
        fx.do({ kind: "lose_credits", side: "corp", amount: 1 }),
      ),
    );
    expect(validateEffectTree(def.onSuccessfulRun!)).toBeNull();
  });

  it("Ghost Branch may tag per advancement on access", () => {
    const def = getCardDef("ghost-branch");
    expect(def.canAdvance).toBe(true);
    expect(def.onAccess?.op).toBe("choose");
    expect(JSON.stringify(def.onAccess)).toContain("give_tags_per_advancement");
    expect(validateEffectTree(def.onAccess!)).toBeNull();
  });
});
