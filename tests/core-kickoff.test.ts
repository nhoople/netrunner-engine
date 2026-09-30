/**
 * FFG Core Set kickoff from floor v1.86.0: Magnum Opus / Yog.0 / Desperado /
 * Breaking News / Scorched Earth (+ other kickoff clears).
 *
 * Cards-first: requires cards-data with data/core (CARDS_DATA_ROOT or sibling
 * checkout). Floor pin remains v1.86.0 — no GitHub Release until set-complete.
 */
import { describe, expect, it, beforeAll } from "vitest";
import {
  assertCardsPinnedTag,
  assertPinnedTag,
  cardsDataPresent,
  crDataPresent,
  createInitialState,
  evalEffect,
  fx,
  getCardDef,
  instantiateCard,
  loadCardCatalog,
  loadCardPool,
  validateEffectTree,
} from "../src/index.js";

const CLEAR = [
  "magnum-opus",
  "yog-0",
  "aurora",
  "ninja",
  "desperado",
  "decoy",
  "wyldside",
  "net-shield",
  "the-toolbox",
  "access-to-globalsec",
  "anonymous-tip",
  "scorched-earth",
  "melange-mining-corp",
  "shipment-from-kaguya",
  "data-mine",
  "breaking-news",
  "precognition",
  "shadow",
  "research-station",
  "astroscript-pilot-program",
  "akitaro-watanabe",
  "private-security-force",
] as const;

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.115.0");
});

describe("FFG Core Set kickoff (floor v1.86.0 → set-complete v1.87.0)", () => {
  it("declares core in-progress or supported at corpus head with 113 cards", () => {
    const pool = loadCardPool(true);
    expect(pool.waves.core).toBeDefined();
    expect(["in-progress", "supported"]).toContain(pool.waves.core.status);
    expect(pool.waves.core.cards).toHaveLength(113);
    expect(pool.corpusOrder[0]).toBe("core");
    expect(pool.corpusOrder[1]).toBe("what-lies-ahead");
    expect(pool.corpusOrder[2]).toBe("trace-amount");
    expect(pool.corpusOrder[3]).toBe("cyber-exodus");
    expect(pool.waves["reign-and-reverie"].status).toBe("supported");
  });

  it("declares at least 22 Core-only clears", () => {
    const pool = loadCardPool(true);
    let clear = 0;
    for (const id of pool.waves.core.cards) {
      const def = getCardDef(id);
      if ((def.unsupported ?? []).length === 0 && def.wave === "core") {
        clear++;
      }
    }
    expect(clear).toBeGreaterThanOrEqual(22);
  });

  it("loads kickoff clears with empty unsupported", () => {
    const catalog = loadCardCatalog(true);
    for (const id of CLEAR) {
      const def = catalog.get(id)!;
      expect(def, id).toBeDefined();
      expect(def.unsupported ?? [], id).toEqual([]);
      expect(def.wave).toBe("core");
    }
  });

  it("Magnum Opus click-gains 2¢", () => {
    const def = getCardDef("magnum-opus");
    const ab = def.paidAbilities![0]!;
    expect(ab.cost).toEqual({ clicks: 1 });
    expect(ab.effect).toEqual(fx.gainCredits("runner", 2));
    expect(validateEffectTree(ab.effect)).toBeNull();

    const s = structuredClone(createInitialState());
    const mo = instantiateCard("magnum-opus", "mo", "runner:rig");
    s.cards["mo"] = mo;
    s.runner.rig.push("mo");
    const before = s.runner.credits;
    const r = evalEffect({ state: s, sourceId: "mo" }, ab.effect);
    expect(r.ok).toBe(true);
    expect(s.runner.credits).toBe(before + 2);
  });

  it("Yog.0 / Aurora / Ninja are icebreaker maps", () => {
    const yog = getCardDef("yog-0");
    expect(yog.breaker?.breaksSubtype).toBe("code gate");
    expect(yog.breaker?.breakCredits).toBe(0);
    expect(yog.breaker?.breakMaxSubs).toBe(1);

    const aurora = getCardDef("aurora");
    expect(aurora.breaker?.breaksSubtype).toBe("barrier");
    expect(aurora.breaker?.breakCredits).toBe(2);
    expect(aurora.breaker?.pumpCredits).toBe(2);
    expect(aurora.breaker?.pumpStrength).toBe(3);

    const ninja = getCardDef("ninja");
    expect(ninja.breaker?.breaksSubtype).toBe("sentry");
    expect(ninja.breaker?.breakCredits).toBe(1);
    expect(ninja.breaker?.pumpCredits).toBe(3);
    expect(ninja.breaker?.pumpStrength).toBe(5);
  });

  it("Desperado gains 1¢ on successful run", () => {
    const def = getCardDef("desperado");
    expect(def.muBonus).toBe(1);
    expect(def.unique).toBe(true);
    expect(def.onSuccessfulRun).toEqual(fx.gainCredits("runner", 1));
    expect(validateEffectTree(def.onSuccessfulRun!)).toBeNull();
  });

  it("Decoy prevents 1 tag via trash interrupt", () => {
    const def = getCardDef("decoy");
    const ab = def.paidAbilities![0]!;
    expect(ab.windows).toContain("tag_interrupt_paw");
    expect(ab.cost).toEqual({ trashSelf: true });
    expect(JSON.stringify(ab.effect)).toContain("prevent_pending_tags");
    expect(validateEffectTree(ab.effect)).toBeNull();
  });

  it("Breaking News tags on score; removes tags if scored this turn", () => {
    const def = getCardDef("breaking-news");
    expect(def.onScore).toEqual({
      op: "do",
      action: { kind: "give_tags", amount: 2 },
    });
    expect(validateEffectTree(def.onScore!)).toBeNull();
    expect(JSON.stringify(def.onDiscardPhaseEnd)).toContain(
      "self_scored_this_turn",
    );
    expect(JSON.stringify(def.onDiscardPhaseEnd)).toContain("remove_tags");
    expect(validateEffectTree(def.onDiscardPhaseEnd!)).toBeNull();
  });

  it("Scorched Earth requires tagged and does 4 meat", () => {
    const def = getCardDef("scorched-earth");
    expect(def.playRequiresTagged).toBe(true);
    expect(def.onPlay).toEqual({
      op: "do",
      action: { kind: "meat_damage", amount: 4 },
    });
    expect(validateEffectTree(def.onPlay!)).toBeNull();
  });

  it("Data Mine nets then trashes self", () => {
    const def = getCardDef("data-mine");
    const sub = def.subroutines![0]!;
    expect(JSON.stringify(sub.effect)).toContain("net_damage");
    expect(JSON.stringify(sub.effect)).toContain("trash_self");
    expect(validateEffectTree(sub.effect)).toBeNull();
  });

  it("AstroScript places agenda counter and advances", () => {
    const def = getCardDef("astroscript-pilot-program");
    expect(JSON.stringify(def.onScore)).toContain("add_agenda_counter");
    expect(validateEffectTree(def.onScore!)).toBeNull();
    const ab = def.paidAbilities![0]!;
    expect(ab.cost).toEqual({ agendaCounters: 1 });
    expect(JSON.stringify(ab.effect)).toContain("place_advancements");
    expect(validateEffectTree(ab.effect)).toBeNull();
  });

  it("Akitaro lowers ice rez cost protecting its server", () => {
    const def = getCardDef("akitaro-watanabe");
    expect(def.iceRezCostReductionProtectingThisServer).toBe(2);
    expect(def.unique).toBe(true);
  });

  it("Private Security Force meats while Runner is tagged", () => {
    const def = getCardDef("private-security-force");
    const ab = def.paidAbilities![0]!;
    expect(ab.requireRunnerTagged).toBe(true);
    expect(ab.effect).toEqual({
      op: "do",
      action: { kind: "meat_damage", amount: 1 },
    });
    expect(validateEffectTree(ab.effect)).toBeNull();
  });

  it("Shipment from Kaguya places advancements on up to 2", () => {
    const def = getCardDef("shipment-from-kaguya");
    expect(JSON.stringify(def.onPlay)).toContain("place_advancements_on_up_to");
    expect(validateEffectTree(def.onPlay!)).toBeNull();
  });
});
