/**
 * humanitys-shadow play tests.
 */
import { describe, expect, it, beforeAll } from "vitest";
import {
  assertCardsPinnedTag,
  assertPinnedTag,
  cardsDataPresent,
  crDataPresent,
  fx,
  validateEffectTree,
  getCardDef,
  startingHandSizeFor,
  playEffectFromCard,
} from "../src/index.js";

describe("humanitys-shadow", () => {
  describe("hs-primitives", () => {
  beforeAll(() => {
    if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
    if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
    assertPinnedTag("v26.03");
    assertCardsPinnedTag("v1.147.18");
  });

  describe("HS primitives IR validate", () => {
    it("accepts Surge / Replicator / Data Hound / Kraken / Foxfire kinds", () => {
      expect(
        validateEffectTree(
          fx.placeVirusOnProgramThatReceivedVirusThisTurn(2),
        ),
      ).toBeNull();
      expect(
        validateEffectTree(
          fx.maySearchStackCopyOfLastInstalledHardwareAddToGrip(),
        ),
      ).toBeNull();
      expect(
        validateEffectTree(fx.lookTopLastTraceExcessStackTrashOneArrangeRest()),
      ).toBeNull();
      expect(
        validateEffectTree(fx.chooseServerCorpTrashIceProtecting()),
      ).toBeNull();
      expect(
        validateEffectTree(fx.trashVirtualResourceOrLinkCard("choose")),
      ).toBeNull();
      expect(
        validateEffectTree({
          op: "seq",
          effects: [
            { op: "prevent", forbid: "jack_out" },
            fx.trashSelf(),
          ],
        }),
      ).toBeNull();
    });
  });
  });

  describe("hs-v192-set-complete", () => {

  beforeAll(() => {
    if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
    if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
    assertPinnedTag("v26.03");
    assertCardsPinnedTag("v1.147.18");
  });

  describe("Humanity's Shadow v1.92.0 set-complete", () => {

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
      expect(JSON.stringify(playEffectFromCard(getCardDef("surge")))).toContain(
        "place_virus_on_program_that_received_virus_this_turn",
      );

      const pher = getCardDef("pheromones");
      expect(pher.recurringCreditsMaxEqualsVirusCounters).toBe(true);
      expect(pher.recurringSpendFor).toEqual(["run_hq"]);
      expect(JSON.stringify(pher.onSuccessfulRun)).toContain("attacking_hq");

      expect(JSON.stringify(playEffectFromCard(getCardDef("quality-time")))).toContain(
        '"amount":5',
      );

      expect(JSON.stringify(getCardDef("replicator").onHardwareInstall)).toContain(
        "may_search_stack_copy_of_last_installed_hardware_add_to_grip",
      );

      expect(getCardDef("creeper").memoryCostZeroIfLinkGte).toBe(2);
      expect(getCardDef("creeper").breaker?.breaksSubtype).toBe("sentry");

      expect(getCardDef("kraken").playRequiresAgendaStolenThisTurn).toBe(true);
      expect(JSON.stringify(playEffectFromCard(getCardDef("kraken")))).toContain(
        "choose_server_corp_trash_ice_protecting",
      );

      const eve = getCardDef("eve-campaign");
      expect(JSON.stringify(eve.onRez)).toContain("place_hosted_credits");
      expect(JSON.stringify(eve.onTurnBegin)).toContain("take_hosted_credits");

      expect(JSON.stringify(playEffectFromCard(getCardDef("rework")))).toContain(
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
      expect(getCardDef("salvage").continuousGainedSubDecls?.some((d) => d.kind === "per_advancement")).toBe(true);

      expect(getCardDef("simone-diego").recurringSpendFor).toEqual([
        "advance_cards_this_server",
      ]);
      expect(getCardDef("simone-diego").recurringCreditsMax).toBe(2);

      expect(JSON.stringify(playEffectFromCard(getCardDef("foxfire")))).toContain(
        "trash_virtual_resource_or_link_card",
      );
    });
  });
  });
});
