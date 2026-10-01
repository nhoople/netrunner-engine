/**
 * Humanity's Shadow (hs) Genesis set-complete — floor v1.91.0 → v1.92.0.
 * 15/15 HS-only clears; 5 reprints absorbed. CR pin v26.03.
 */
import { describe, expect, it, beforeAll } from "vitest";
import {
  assertCardsPinnedTag,
  assertPinnedTag,
  cardsDataPresent,
  crDataPresent,
  getCardDef,
  loadCardCatalog,
  loadCardPool,
  startingHandSizeFor,
  validateEffectTree,
} from "../src/index.js";

const HS_CLEARS = [
  "surge",
  "andromeda-dispossessed-ristie",
  "pheromones",
  "quality-time",
  "replicator",
  "creeper",
  "kraken",
  "eve-campaign",
  "rework",
  "whirlpool",
  "data-hound",
  "bernice-mai",
  "salvage",
  "simone-diego",
  "foxfire",
] as const;

const HS_REPRINTS = [
  "xanadu",
  "networking",
  "hq-interface",
  "kati-jones",
  "hokusai-grid",
] as const;

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.142.2");
});

describe("Humanity's Shadow v1.92.0 set-complete", () => {
  it("declares humanitys-shadow supported after a-study-in-static with 20 cards", () => {
    const pool = loadCardPool(true);
    expect(pool.waves["humanitys-shadow"].status).toBe("supported");
    expect(pool.waves["humanitys-shadow"].cards).toHaveLength(20);
    expect(pool.corpusOrder[0]).toBe("core");
    expect(pool.corpusOrder[1]).toBe("what-lies-ahead");
    expect(pool.corpusOrder[2]).toBe("trace-amount");
    expect(pool.corpusOrder[3]).toBe("cyber-exodus");
    expect(pool.corpusOrder[4]).toBe("a-study-in-static");
    expect(pool.corpusOrder[5]).toBe("humanitys-shadow");
    expect(pool.corpusOrder[6]).toBe("future-proof");
    expect(pool.corpusOrder[7]).toBe("creation-and-control");
    expect(pool.corpusOrder[8]).toBe("opening-moves");
    expect(pool.corpusOrder[9]).toBe("stalwart")
    expect(pool.corpusOrder[10]).toBe("mala-tempora");
    expect(pool.corpusOrder[11]).toBe("true-colors");
    expect(pool.corpusOrder[12]).toBe("fear-and-loathing");
    expect(pool.corpusOrder[13]).toBe("double-time");
    expect(pool.waves["a-study-in-static"].status).toBe("supported");
  });

  it("clears all 15 HS-only cards with empty unsupported", () => {
    loadCardCatalog(true);
    for (const id of HS_CLEARS) {
      const def = getCardDef(id);
      expect(def.wave).toBe("humanitys-shadow");
      expect(def.unsupported ?? []).toEqual([]);
      if (def.onPlay) expect(validateEffectTree(def.onPlay)).toBeNull();
      if (def.onRez) expect(validateEffectTree(def.onRez)).toBeNull();
      if (def.onTurnBegin) expect(validateEffectTree(def.onTurnBegin)).toBeNull();
      if (def.onSuccessfulRun) {
        expect(validateEffectTree(def.onSuccessfulRun)).toBeNull();
      }
      if (def.onHardwareInstall) {
        expect(validateEffectTree(def.onHardwareInstall)).toBeNull();
      }
      for (const ab of def.paidAbilities ?? []) {
        expect(validateEffectTree(ab.effect)).toBeNull();
      }
      for (const sub of def.subroutines ?? []) {
        if (sub.effect) expect(validateEffectTree(sub.effect)).toBeNull();
      }
      if (def.gainsSubroutinesPerAdvancement?.subroutine.effect) {
        expect(
          validateEffectTree(
            def.gainsSubroutinesPerAdvancement.subroutine.effect,
          ),
        ).toBeNull();
      }
    }
  });

  it("absorbs 5 reprints from earlier waves", () => {
    for (const id of HS_REPRINTS) {
      const def = getCardDef(id);
      expect(def.wave).not.toBe("humanitys-shadow");
      expect(def.unsupported ?? []).toEqual([]);
    }
  });

  it("maps HS-specific fields and primitives", () => {
    expect(getCardDef("andromeda-dispossessed-ristie").startingHandSize).toBe(9);
    expect(getCardDef("andromeda-dispossessed-ristie").link).toBe(1);
    expect(
      startingHandSizeFor(getCardDef("andromeda-dispossessed-ristie")),
    ).toBe(9);
    expect(startingHandSizeFor(getCardDef("noise-hacker-extraordinaire"))).toBe(
      5,
    );

    expect(getCardDef("surge").playRequiresVirusCounterPlacedOnProgramThisTurn).toBe(
      true,
    );
    expect(JSON.stringify(getCardDef("surge").onPlay)).toContain(
      "place_virus_on_program_that_received_virus_this_turn",
    );

    const pher = getCardDef("pheromones");
    expect(pher.recurringCreditsMaxEqualsVirusCounters).toBe(true);
    expect(pher.recurringSpendFor).toEqual(["run_hq"]);
    expect(JSON.stringify(pher.onSuccessfulRun)).toContain("attacking_hq");

    expect(JSON.stringify(getCardDef("quality-time").onPlay)).toContain(
      '"amount":5',
    );

    expect(JSON.stringify(getCardDef("replicator").onHardwareInstall)).toContain(
      "may_search_stack_copy_of_last_installed_hardware_add_to_grip",
    );

    expect(getCardDef("creeper").memoryCostZeroIfLinkGte).toBe(2);
    expect(getCardDef("creeper").breaker?.breaksSubtype).toBe("sentry");

    expect(getCardDef("kraken").playRequiresAgendaStolenThisTurn).toBe(true);
    expect(JSON.stringify(getCardDef("kraken").onPlay)).toContain(
      "choose_server_corp_trash_ice_protecting",
    );

    const eve = getCardDef("eve-campaign");
    expect(JSON.stringify(eve.onRez)).toContain("place_hosted_credits");
    expect(JSON.stringify(eve.onTurnBegin)).toContain("take_hosted_credits");

    expect(JSON.stringify(getCardDef("rework").onPlay)).toContain(
      "shuffle_hq_to_rd",
    );

    const whirl = getCardDef("whirlpool");
    expect(JSON.stringify(whirl.subroutines)).toContain('"forbid":"jack_out"');
    expect(JSON.stringify(whirl.subroutines)).toContain("trash_self");

    expect(JSON.stringify(getCardDef("data-hound").subroutines)).toContain(
      "look_top_last_trace_excess_stack_trash_one_arrange_rest",
    );

    const bernice = getCardDef("bernice-mai");
    expect(JSON.stringify(bernice.onSuccessfulRun)).toContain("give_tags");
    expect(JSON.stringify(bernice.onSuccessfulRun)).toContain("trash_self");

    expect(getCardDef("salvage").canAdvance).toBe(true);
    expect(getCardDef("salvage").canAdvanceOnlyWhenRezzed).toBe(true);
    expect(getCardDef("salvage").gainsSubroutinesPerAdvancement).toBeTruthy();

    expect(getCardDef("simone-diego").recurringSpendFor).toEqual([
      "advance_cards_this_server",
    ]);
    expect(getCardDef("simone-diego").recurringCreditsMax).toBe(2);

    expect(JSON.stringify(getCardDef("foxfire").onPlay)).toContain(
      "trash_virtual_resource_or_link_card",
    );
  });
});
