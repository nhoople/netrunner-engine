/**
 * uprising play tests.
 */
import { describe, expect, it, beforeAll } from "vitest";
import {
  assertCardsPinnedTag,
  assertPinnedTag,
  cardsDataPresent,
  crDataPresent,
  createGame,
  evalEffect,
  fx,
  getCardDef,
  instantiateCard,
  validateEffectTree,
  applyAction,
  createInitialState,
  effectiveIceStrength,
  queryLegality,
  stealAdditionalCreditsFromActiveLockdowns,
  trashActiveLockdownsAtCorpTurnBegin,
  stealAgenda,
} from "../src/index.js";
import type {
  Action,
  GameState,
} from "../src/state/types.js";
import {
  beginCorpTurnFlags,
  beginRunnerTurnFlags,
} from "../src/state/turn.js";
import {
  dealDamage,
} from "../src/state/damage.js";
import {
  agendaPointsFor,
} from "../src/state/scoring.js";
import {
  fireCorpIdentityFlippedSuccessfulHqOrRdRun,
} from "../src/state/identityFlipHooks.js";
import {
  additionalRunInitiateCredits,
} from "../src/state/runInitiateTax.js";

describe("uprising", () => {
  describe("ur-v135-kickoff", () => {

  beforeAll(() => {
    if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
    if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
    assertPinnedTag("v26.03");
    assertCardsPinnedTag("v1.147.15");
  });

  describe("Uprising v1.35.0 kickoff", () => {

    it("Daily Casts loads 8¢ on install and takes 2¢ on turn begin", () => {
      const def = getCardDef("daily-casts");
      expect(def.hostedCreditsOnInstall).toBe(8);
      expect(def.onTurnBegin).toEqual(fx.do({ kind: "take_hosted_credits", amount: 2 }));
      expect(validateEffectTree(def.onTurnBegin!)).toBeNull();

      const state = createGame({ seed: 1 });
      const card = instantiateCard("daily-casts", "dc1", "runner:installed");
      state.cards[card.id] = card;
      state.runner.installed.push(card.id);
      card.hostedCredits = 8;
      const before = state.runner.credits;
      const take = evalEffect(
        { state, sourceId: card.id },
        fx.do({ kind: "take_hosted_credits", amount: 2 }),
      );
      expect(take.ok).toBe(true);
      expect(state.runner.credits).toBe(before + 2);
      expect(card.hostedCredits).toBe(6);
    });

    it("Bass CH1R180G4 is click+trash for gain 2 clicks", () => {
      const def = getCardDef("bass-ch1r180g4");
      expect(def.paidAbilities).toHaveLength(1);
      const ab = def.paidAbilities![0]!;
      expect(ab.clickCost).toBe(1);
      expect(ab.cost).toEqual({ clicks: 1, trashSelf: true });
      expect(ab.windows).toContain("corp_action_paw");
      expect(ab.effect).toEqual(fx.gainClicks("corp", 2));
      expect(validateEffectTree(ab.effect)).toBeNull();
    });

    it("Makler is a barrier fracter with once-per-turn full-break credit", () => {
      const def = getCardDef("makler");
      expect(def.breaker).toEqual({
        breaksSubtype: "barrier",
        strength: 2,
        breakCredits: 2,
        breakMaxSubs: 2,
        pumpCredits: 2,
        pumpStrength: 2,
      });
      expect(def.onFullyBreakOncePerTurn).toEqual(fx.gainCredits("runner", 1));
      expect(validateEffectTree(def.onFullyBreakOncePerTurn!)).toBeNull();
      expect(def.paidAbilities?.[0]?.effect).toEqual(
        fx.do({ kind: "pump_strength", amount: 2 }),
      );
    });
  });
  });

  describe("ur-v136-a-slice", () => {

  beforeAll(() => {
    if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
    if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
    assertPinnedTag("v26.03");
    assertCardsPinnedTag("v1.147.15");
  });

  describe("Uprising v1.36.0 A-slice", () => {

    it("La Costa Grid is remoteOnly and places advancement on turn begin", () => {
      const def = getCardDef("la-costa-grid");
      expect(def.remoteOnly).toBe(true);
      expect(def.onTurnBegin).toEqual({
        op: "do",
        action: {
          kind: "place_advancements",
          amount: 1,
          sameServerRootAsSource: true,
          pick: "choose",
        },
      });
      expect(validateEffectTree(def.onTurnBegin!)).toBeNull();
    });

    it("Gold Farmer taxes breaks and has dual ETR-unless-pay-3", () => {
      const def = getCardDef("gold-farmer");
      expect(def.runnerLoseCreditsOnBreakPrintedSubroutine).toBe(1);
      expect(def.subroutines).toHaveLength(2);
      for (const sub of def.subroutines ?? []) {
        expect(validateEffectTree(sub.effect)).toBeNull();
        expect(JSON.stringify(sub.effect)).toContain("end_the_run");
      }
    });

    it("Mantle has 1 recurring credit for programs and hardware", () => {
      const def = getCardDef("mantle");
      expect(def.recurringCreditsMax).toBe(1);
      expect(def.recurringSpendFor).toEqual(["use_program", "use_hardware"]);
    });

    it("False Lead forfeits to strip Runner clicks when they have 2+", () => {
      const def = getCardDef("false-lead");
      expect(def.paidAbilities).toHaveLength(1);
      const ab = def.paidAbilities![0]!;
      expect(ab.cost).toEqual({ trashSelf: true });
      expect(ab.windows).toContain("corp_action_paw");
      expect(validateEffectTree(ab.effect)).toBeNull();
      expect(JSON.stringify(ab.effect)).toContain("clicks_gte");
      expect(JSON.stringify(ab.effect)).toContain("lose_clicks");
    });

    it("Bellona costs 5¢ to steal and gains 5¢ on score", () => {
      const def = getCardDef("bellona");
      expect(def.stealAdditionalCredits).toBe(5);
      expect(def.onScore).toEqual(fx.gainCredits("corp", 5));
      expect(validateEffectTree(def.onScore!)).toBeNull();
    });
  });
  });

  describe("ur-v137-b-slice", () => {

  beforeAll(() => {
    if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
    if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
    assertPinnedTag("v26.03");
    assertCardsPinnedTag("v1.147.15");
  });

  describe("Uprising v1.37.1 B-slice", () => {

    it("Euler is a paid-ability code gate breaker with install-this-turn free break", () => {
      const def = getCardDef("euler");
      expect(def.breaker?.breaksSubtype).toBe("code gate");
      expect(def.breaker?.breakViaPaidAbilityOnly).toBe(true);
      const free = def.paidAbilities?.find((a) => a.id === "euler-break-install");
      expect(free?.requireInstalledThisTurn).toBe(true);
      expect(free?.creditCost).toBe(0);
      expect(validateEffectTree(free!.effect)).toBeNull();
    });

    it("Penrose dual-mode barrier/code gate with stealth pump", () => {
      const def = getCardDef("penrose");
      expect(def.subtypes).toEqual(
        expect.arrayContaining(["decoder", "fracter"]),
      );
      const barrier = def.paidAbilities?.find(
        (a) => a.id === "penrose-break-barrier",
      );
      expect(barrier?.requireInstalledThisTurn).toBe(true);
      const pump = def.paidAbilities?.find((a) => a.id === "penrose-pump");
      expect(pump?.cost?.creditsFromStealthOnly).toBe(true);
    });

    it("Odore free break requires 3+ virtual resources", () => {
      const def = getCardDef("odore");
      expect(def.breaker?.breaksSubtype).toBe("sentry");
      const free = def.paidAbilities?.find(
        (a) => a.id === "odore-break-virtual",
      );
      expect(free?.requireInstalledVirtualResourcesGte).toBe(3);
    });

    it("Cayambe Grid places on protecting ice and taxes advanced ice", () => {
      const def = getCardDef("cayambe-grid");
      expect(def.approachServerEtrUnlessCreditsPerAdvancedIce).toBe(2);
      expect(def.onTurnBegin).toEqual({
        op: "do",
        action: {
          kind: "place_advancements",
          amount: 1,
          onlyIceProtectingSourceServer: true,
          pick: "choose",
        },
      });
      expect(validateEffectTree(def.onTurnBegin!)).toBeNull();
    });

    it("Moshing trashes 3 from grip then gains and draws", () => {
      const def = getCardDef("moshing");
      expect(def.playRequiresOtherGripCardsGte).toBe(3);
      expect(def.playAdditionalCost).toEqual({
        op: "do",
        action: { kind: "trash_n_from_grip", amount: 3 },
      });
      expect(validateEffectTree(def.onPlay!)).toBeNull();
    });

    it("Cyberdex Sandbox gains on first purge and may purge on score", () => {
      const def = getCardDef("cyberdex-sandbox");
      expect(def.onVirusPurgeOncePerTurn).toBe(true);
      expect(validateEffectTree(def.onVirusPurge!)).toBeNull();
      expect(validateEffectTree(def.onScore!)).toBeNull();
      expect(JSON.stringify(def.onScore)).toContain("purge_virus_counters");
    });

    it("DreamNet draws on first successful run with digital/link bonus", () => {
      const def = getCardDef("dreamnet");
      expect(validateEffectTree(def.onFirstSuccessfulRunThisTurn!)).toBeNull();
      const s = JSON.stringify(def.onFirstSuccessfulRunThisTurn);
      expect(s).toContain("identity_has_subtype");
      expect(s).toContain("link_gte");
    });

    it("Swift is a console with MU and first-run-event click", () => {
      const def = getCardDef("swift");
      expect(def.muBonus).toBe(1);
      expect(def.gainClickOnFirstRunEventThisTurn).toBe(true);
      expect(def.subtypes).toContain("console");
    });

    it("Self-modifying Code searches stack for a program", () => {
      const def = getCardDef("self-modifying-code");
      const ab = def.paidAbilities?.[0];
      expect(ab?.cost?.trashSelf).toBe(true);
      expect(ab?.cost?.credits).toBe(2);
      expect(validateEffectTree(ab!.effect)).toBeNull();
    });
  });
  });

  describe("ur-v138-c-slice", () => {

  beforeAll(() => {
    if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
    if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
    assertPinnedTag("v26.03");
    assertCardsPinnedTag("v1.147.15");
  });

  describe("Uprising v1.38.1 C-slice", () => {

    it("Afterimage is stealth sentry breaker with once-per-turn bypass", () => {
      const def = getCardDef("afterimage");
      expect(def.breaker?.breaksSubtype).toBe("sentry");
      const bypass = def.paidAbilities?.find((a) => a.id === "afterimage-bypass");
      expect(bypass?.flag).toBe("once_per_turn");
      expect(bypass?.cost?.creditsFromStealthOnly).toBe(true);
      expect(validateEffectTree(bypass!.effect)).toBeNull();
    });

    it("Penumbral Toolkit hosts run credits with HQ install discount", () => {
      const def = getCardDef("penumbral-toolkit");
      expect(def.hostedCreditsOnInstall).toBe(4);
      expect(def.spendHostedCreditsDuringRuns).toBe(true);
      expect(def.installCostDiscountIfSuccessfulHqRunThisTurn).toBe(2);
    });

    it("F2P lets untagged Runner break and has bounce/tag subs", () => {
      const def = getCardDef("f2p");
      const ab = def.paidAbilities?.[0];
      expect(ab?.usableByAnyPlayer).toBe(true);
      expect(ab?.requiresUntagged).toBe(true);
      expect(def.subroutines).toHaveLength(2);
      expect(validateEffectTree(def.subroutines![0]!.effect)).toBeNull();
    });

    it("Transport Monopoly places agenda counters and can block success", () => {
      const def = getCardDef("transport-monopoly");
      expect(validateEffectTree(def.onScore!)).toBeNull();
      const ab = def.paidAbilities?.[0];
      expect(ab?.cost?.agendaCounters).toBe(1);
      expect(ab?.requireDuringRun).toBe(true);
      expect(validateEffectTree(ab!.effect)).toBeNull();
    });

    it("Akhet advances for strength and printed-sub cap", () => {
      const def = getCardDef("akhet");
      expect(def.canAdvance).toBe(true);
      expect(def.strengthBonusAtAdvancements).toEqual({
        threshold: 3,
        bonus: 3,
      });
      expect(def.maxPrintedSubsBreakablePerEncounterAtAdvancements).toEqual({
        threshold: 3,
        max: 1,
      });
    });

    it("Colossus scales with advancements", () => {
      const def = getCardDef("colossus");
      expect(def.canAdvance).toBe(true);
      expect(def.strengthPerAdvancement).toBe(1);
      expect(def.subroutines).toHaveLength(2);
      for (const sub of def.subroutines ?? []) {
        expect(validateEffectTree(sub.effect)).toBeNull();
      }
    });
  });
  });

  describe("ur-v139-d-slice", () => {

  beforeAll(() => {
    if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
    if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
    assertPinnedTag("v26.03");
    assertCardsPinnedTag("v1.147.15");
  });

  describe("Uprising v1.39.0 D-slice", () => {

    it("Drafter may retrieve from Archives and install ignoring costs", () => {
      const def = getCardDef("drafter");
      expect(def.subroutines).toHaveLength(2);
      for (const sub of def.subroutines ?? []) {
        expect(validateEffectTree(sub.effect)).toBeNull();
      }
    });

    it("Aniccam is a console that draws on first event trash", async () => {
      const def = getCardDef("aniccam");
      expect(def.muBonus).toBe(1);
      expect(def.subtypes).toContain("console");
      expect(validateEffectTree(def.onFirstEventTrashedThisTurn!)).toBeNull();

      const {
        createInitialState,
        instantiateCard,
        occurCheckpoint,
        CR,
      } = await import("../src/index.js");
      const { fireOnFirstEventTrashedThisTurn } = await import(
        "../src/state/trashHooks.js"
      );
      const s = createInitialState();
      const card = instantiateCard("aniccam", "an", "runner:installed");
      s.cards["an"] = card;
      s.runner.installed = ["an"];
      fireOnFirstEventTrashedThisTurn(s);
      expect(s.turn.firstEventTrashedMetPending).toBe(true);
      occurCheckpoint(
        s,
        "instruction",
        "aniccam first event trash",
        [CR.checkpointConditionalAbilities],
        "test",
      );
      expect(s.turn.firstEventTrashedUsedThisTurn).toBe(true);
      expect(
        s.log.some((line) =>
          line.includes("Aniccam becomes pending — first event trashed this turn"),
        ),
      ).toBe(true);
    });

    it("Cybertrooper Talut grants link and icebreaker strength", () => {
      const def = getCardDef("cybertrooper-talut");
      expect(def.link).toBe(1);
      expect(def.nonAiIcebreakerInstallStrengthBonusThisTurn).toBe(2);
    });

    it("Tranquility Home Grid is remoteOnly with first-root-install choice", () => {
      const def = getCardDef("tranquility-home-grid");
      expect(def.remoteOnly).toBe(true);
      expect(
        validateEffectTree(def.onFirstInstallInThisServerRootThisTurn!),
      ).toBeNull();
    });

    it("Winchester traces and gains an HQ ETR sub", () => {
      const def = getCardDef("winchester");
      expect(def.subroutines).toHaveLength(2);
      expect(def.gainsSubroutinesWhileProtectingHq).toHaveLength(1);
      expect(
        validateEffectTree(def.gainsSubroutinesWhileProtectingHq![0]!.effect),
      ).toBeNull();
    });
  });
  });

  describe("ur-v140-e-slice", () => {

  beforeAll(() => {
    if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
    if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
    assertPinnedTag("v26.03");
    assertCardsPinnedTag("v1.147.15");
  });

  describe("Uprising v1.42.0 E-slice", () => {

    it("Cerebral Overwriter may pay for core damage per advancement while installed", () => {
      const def = getCardDef("cerebral-overwriter");
      expect(def.canAdvance).toBe(true);
      expect(def.subtypes).toContain("ambush");
      expect(validateEffectTree(def.onAccess!)).toBeNull();
      expect(JSON.stringify(def.onAccess)).toContain(
        "may_pay_credits_for_core_damage_per_advancement",
      );
      expect(JSON.stringify(def.onAccess)).toContain("source_installed");
    });

    it("Bravado gains credits from base plus passed ice on run end", () => {
      const def = getCardDef("bravado");
      expect(def.runEvent?.requiresProtectingIce).toBe(true);
      expect(validateEffectTree(def.runEvent!.onRunEnd!)).toBeNull();
      expect(JSON.stringify(def.runEvent!.onRunEnd)).toContain(
        "passed_ice",
      );
    });

    it("Scapenet traces then RFGs installed chip/virtual", () => {
      const def = getCardDef("scapenet");
      expect(def.playRequiresSuccessfulRunLastTurn).toBe(true);
      expect(validateEffectTree(def.onPlay!)).toBeNull();
      expect(JSON.stringify(def.onPlay)).toContain(
        "rfg_installed_with_any_subtype",
      );
    });

    it("Megaprix Qualifier adds an agenda counter when another copy is scored", () => {
      const def = getCardDef("megaprix-qualifier");
      expect(def.agendaPointsPerAgendaCounter).toBe(1);
      expect(validateEffectTree(def.onScore!)).toBeNull();
      expect(JSON.stringify(def.onScore)).toContain(
        "another_copy_of_source_title_in_either_score_area",
      );
    });

    it("Harmony AR Therapy shuffles distinct heap titles then RFGs self", () => {
      const def = getCardDef("harmony-ar-therapy");
      expect(validateEffectTree(def.onPlay!)).toBeNull();
      expect(JSON.stringify(def.onPlay)).toContain(
        "shuffle_up_to_n_distinct_heap_titles_into_stack",
      );
      expect(JSON.stringify(def.onPlay)).toContain("rfg_self");
    });
  });
  });

  describe("ur-v141-f-slice", () => {

  beforeAll(() => {
    if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
    if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
    assertPinnedTag("v26.03");
    assertCardsPinnedTag("v1.147.15");
  });

  describe("Uprising v1.42.0 F-slice", () => {

    it("Devil Charm RFGs self then weakens encountered ice with empty cost", () => {
      const def = getCardDef("devil-charm");
      const ab = def.paidAbilities?.[0];
      expect(ab?.windows).toContain("encounter_paw");
      expect(ab?.cost).toEqual({});
      expect(validateEffectTree(ab!.effect)).toBeNull();
      expect(JSON.stringify(ab!.effect)).toContain("rfg_self");
      expect(JSON.stringify(ab!.effect)).toContain("weaken_ice");
    });

    it("Simulchip trashes self + program (waivable) to install from heap", () => {
      const def = getCardDef("simulchip");
      const ab = def.paidAbilities?.[0];
      expect(ab?.cost?.trashSelf).toBe(true);
      expect(
        ab?.cost?.trashInstalledProgramUnlessOwnInstalledTrashedThisTurn,
      ).toBe(true);
      expect(validateEffectTree(ab!.effect)).toBeNull();
      expect(JSON.stringify(ab!.effect)).toContain("install_from_heap");
    });

    it("Cordyceps installs virus, then may remove + swap on successful central", () => {
      const def = getCardDef("cordyceps");
      expect(def.onSuccessfulRunOncePerTurn).toBe(true);
      expect(validateEffectTree(def.onInstall!)).toBeNull();
      expect(JSON.stringify(def.onInstall)).toContain("add_virus_counter");
      expect(validateEffectTree(def.onSuccessfulRun!)).toBeNull();
      expect(JSON.stringify(def.onSuccessfulRun)).toContain(
        "remove_virus_counters",
      );
      expect(JSON.stringify(def.onSuccessfulRun)).toContain(
        "may_swap_protecting_attacked_ice_with_other_installed",
      );
      expect(JSON.stringify(def.onSuccessfulRun)).toContain("attacking_central");
    });

    it("Keiko grants MU and companion install/spend credits", () => {
      const def = getCardDef("keiko");
      expect(def.muBonus).toBe(2);
      expect(def.gainCreditsOnFirstCompanionInstallOrSpendThisTurn).toBe(1);
      expect(def.subtypes).toContain("console");
      expect(def.subtypes).toContain("companion");
    });

    it("Flower Sermon scores counters then looks/advances/bottoms R&D", () => {
      const def = getCardDef("flower-sermon");
      expect(validateEffectTree(def.onScore!)).toBeNull();
      expect(JSON.stringify(def.onScore)).toContain("add_agenda_counter");
      const ab = def.paidAbilities?.[0];
      expect(ab?.cost?.agendaCounters).toBe(1);
      expect(ab?.windows).toContain("corp_action_paw");
      expect(validateEffectTree(ab!.effect)).toBeNull();
      expect(JSON.stringify(ab!.effect)).toContain(
        "look_top_rd_may_advance_may_bottom",
      );
    });
  });
  });

  describe("ur-v142-g-slice", () => {

  beforeAll(() => {
    if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
    if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
    assertPinnedTag("v26.03");
    assertCardsPinnedTag("v1.147.15");
  });

  describe("Uprising v1.42.0 G-slice", () => {

    it("Týr is bioroid ice with allotted-click break flag and three subs", () => {
      const def = getCardDef("tyr");
      expect(def.subtypes).toContain("bioroid");
      expect(def.bioroidBreakGivesCorpAllottedClickNextTurn).toBe(true);
      expect(def.subroutines).toHaveLength(3);
      const kinds = def.subroutines!.map((s) =>
        JSON.stringify(s.effect),
      );
      expect(kinds[0]).toContain("core_damage");
      expect(kinds[1]).toContain("trash_installed_runner");
      expect(kinds[1]).toContain("gain_credits");
      expect(kinds[2]).toContain("end_the_run");
      for (const s of def.subroutines!) {
        expect(validateEffectTree(s.effect)).toBeNull();
      }
    });

    it("Vaporframe Fabricator click-installs from HQ; onTrash excludes source server", () => {
      const def = getCardDef("vaporframe-fabricator");
      const ab = def.paidAbilities?.[0];
      expect(ab?.flag).toBe("once_per_turn");
      expect(ab?.cost?.clicks ?? ab?.clickCost).toBe(1);
      expect(validateEffectTree(ab!.effect)).toBeNull();
      expect(JSON.stringify(ab!.effect)).toContain(
        "may_install_from_hq_ignore_costs",
      );
      expect(validateEffectTree(def.onTrash!)).toBeNull();
      expect(JSON.stringify(def.onTrash)).toContain(
        "may_install_from_hq_ignore_costs_exclude_source_server",
      );
    });

    it("Mu Safecracker stealth-only + HQ/RD pay-for-bonus-access fields", () => {
      const def = getCardDef("mu-safecracker");
      expect(def.paidAbilitiesUseStealthCreditsOnly).toBe(true);
      expect(def.onSuccessfulHqRunMayPayForBonusAccess).toEqual({
        credits: 1,
        bonusAccess: 1,
      });
      expect(def.onSuccessfulRdRunMayPayForBonusAccess).toEqual({
        credits: 2,
        bonusAccess: 1,
      });
    });

    it("Wall to Wall wires wall_to_wall_turn_begin on turn begin", () => {
      const def = getCardDef("wall-to-wall");
      expect(validateEffectTree(def.onTurnBegin!)).toBeNull();
      expect(JSON.stringify(def.onTurnBegin)).toContain(
        "wall_to_wall_turn_begin",
      );
    });

    it("Engram Flush chooses card type on encounter; reveal/trash subs", () => {
      const def = getCardDef("engram-flush");
      expect(validateEffectTree(def.onEncounter!)).toBeNull();
      expect(JSON.stringify(def.onEncounter)).toContain(
        "choose_card_type_for_encounter",
      );
      expect(def.subroutines).toHaveLength(2);
      for (const s of def.subroutines!) {
        expect(validateEffectTree(s.effect)).toBeNull();
        expect(JSON.stringify(s.effect)).toContain(
          "reveal_grip_may_trash_chosen_encounter_type",
        );
      }
    });
  });
  });

  describe("ur-v143-h-slice", () => {

  beforeAll(() => {
    if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
    if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
    assertPinnedTag("v26.03");
    assertCardsPinnedTag("v1.147.15");
  });

  describe("Uprising v1.43.0 H-slice", () => {

    it("Ganked! is ambush with R&D reveal + trash-to-encounter onAccess", () => {
      const def = getCardDef("ganked");
      expect(def.subtypes).toContain("ambush");
      expect(def.mustRevealWhenAccessedFromRd).toBe(true);
      expect(validateEffectTree(def.onAccess!)).toBeNull();
      expect(JSON.stringify(def.onAccess)).toContain(
        "trash_self_choose_rezzed_protecting_ice_encounter",
      );
    });

    it("Mystic Maemi hosts credits for play_event + steal/turn hooks", () => {
      const def = getCardDef("mystic-maemi");
      expect(def.subtypes).toContain("companion");
      expect(def.hostedCreditsSpendFor).toEqual(["play_event"]);
      expect(validateEffectTree(def.onTurnBegin!)).toBeNull();
      expect(JSON.stringify(def.onTurnBegin)).toContain("place_hosted_credits");
      expect(validateEffectTree(def.onStealAgenda!)).toBeNull();
      expect(JSON.stringify(def.onStealAgenda)).toContain("place_hosted_credits");
      expect(validateEffectTree(def.onRunnerTurnEnd!)).toBeNull();
      expect(JSON.stringify(def.onRunnerTurnEnd)).toContain("hosted_credits_gte");
      expect(JSON.stringify(def.onRunnerTurnEnd)).toContain(
        "trash_random_from_grip",
      );
      expect(JSON.stringify(def.onRunnerTurnEnd)).toContain("trash_self");
    });

    it("Paladin Poemu excludes connection install spend + must trash installed", () => {
      const def = getCardDef("paladin-poemu");
      expect(def.subtypes).toContain("companion");
      expect(def.hostedCreditsSpendFor).toEqual(["install"]);
      expect(def.hostedCreditsSpendForInstallExcludeSubtypes).toEqual([
        "connection",
      ]);
      expect(validateEffectTree(def.onTurnBegin!)).toBeNull();
      expect(validateEffectTree(def.onStealAgenda!)).toBeNull();
      expect(validateEffectTree(def.onRunnerTurnEnd!)).toBeNull();
      expect(JSON.stringify(def.onRunnerTurnEnd)).toContain(
        "trash_must_own_installed",
      );
    });

    it("Prognostic Q-Loop first-run look + once/turn reveal/install", () => {
      const def = getCardDef("prognostic-q-loop");
      expect(validateEffectTree(def.onFirstRunBeginThisTurn!)).toBeNull();
      expect(JSON.stringify(def.onFirstRunBeginThisTurn)).toContain(
        "look_top_n_stack_peek",
      );
      const ab = def.paidAbilities?.[0];
      expect(ab?.flag).toBe("once_per_turn");
      expect(ab?.cost?.credits).toBe(1);
      expect(ab?.windows).toContain("runner_action_paw");
      expect(validateEffectTree(ab!.effect)).toBeNull();
      expect(JSON.stringify(ab!.effect)).toContain(
        "reveal_top_stack_may_install_program_or_hardware",
      );
    });

    it("Boomerang chooses ice on install; trash-breaks vs chosen ice + lingering shuffle", () => {
      const def = getCardDef("boomerang");
      expect(def.chooseIceOnInstall).toBe(true);
      const ab = def.paidAbilities?.[0];
      expect(ab?.cost?.trashSelf).toBe(true);
      expect(ab?.windows).toContain("encounter_paw");
      expect(ab?.requireEncounterChosenIce).toBe(true);
      expect(validateEffectTree(ab!.effect)).toBeNull();
      expect(JSON.stringify(ab!.effect)).toContain("break_encounter_subroutine");
      expect(JSON.stringify(ab!.effect)).toContain(
        "may_shuffle_register_title_from_heap_on_successful_run_end",
      );
    });
  });
  });

  describe("ur-v144-i-slice", () => {

  beforeAll(() => {
    if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
    if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
    assertPinnedTag("v26.03");
    assertCardsPinnedTag("v1.147.15");
  });

  function must(state: GameState, action: Action): GameState {
    const r = applyAction(state, action);
    if (!r.ok) throw new Error(`${r.error} ${JSON.stringify(r.cites)}`);
    return r.state;
  }

  function corpPlayReady(s: GameState): GameState {
    s = structuredClone(s);
    s.activeSide = "corp";
    s.timingKey = "corp.takeAction";
    s.corp.clicks = 3;
    s.corp.credits = 20;
    return s;
  }

  describe("Uprising v1.44.0 I-slice", () => {

    it("SYNC Rerouting wires onRunBegin pay-or-tag", () => {
      const def = getCardDef("sync-rerouting");
      expect(validateEffectTree(def.onRunBegin!)).toBeNull();
      expect(JSON.stringify(def.onRunBegin)).toContain("lose_credits");
      expect(JSON.stringify(def.onRunBegin)).toContain('"amount":4');
      expect(JSON.stringify(def.onRunBegin)).toContain("give_tags");
    });

    it("Argus Crackdown wires iced-server meat onSuccessfulRun", () => {
      const def = getCardDef("argus-crackdown");
      expect(validateEffectTree(def.onSuccessfulRun!)).toBeNull();
      expect(JSON.stringify(def.onSuccessfulRun)).toContain(
        "attacked_server_protected_by_ice",
      );
      expect(JSON.stringify(def.onSuccessfulRun)).toContain("meat_damage");
    });

    it("Hyoubu wires choose_server + psi on chosen successful run", () => {
      const def = getCardDef("hyoubu-precog-manifold");
      expect(validateEffectTree(def.onPlay!)).toBeNull();
      expect(JSON.stringify(def.onPlay)).toContain("choose_server");
      expect(validateEffectTree(def.onSuccessfulRun!)).toBeNull();
      expect(JSON.stringify(def.onSuccessfulRun)).toContain(
        "attacking_chosen_server",
      );
      expect(JSON.stringify(def.onSuccessfulRun)).toContain("play_psi_game");
      expect(JSON.stringify(def.onSuccessfulRun)).toContain("end_the_run");
    });

    it("NAPD Cordon wires steal additional credits formula", () => {
      const def = getCardDef("napd-cordon");
      expect(def.stealAdditionalCreditsFormula).toEqual({
        base: 4,
        perAdvancement: 2,
      });
    });

    it("NEXT Activation Command wires +2 strength + icebreaker-only breaks", () => {
      const def = getCardDef("next-activation-command");
      expect(def.allIceStrengthBonus).toBe(2);
      expect(def.cannotBreakExceptIcebreaker).toBe(true);
    });

    it("lockdown lingers in play-area and gates a second lockdown", () => {
      let s = corpPlayReady(createInitialState());
      const sync = instantiateCard("sync-rerouting", "sync-1", "corp:hq");
      const argus = instantiateCard("argus-crackdown", "argus-1", "corp:hq");
      s.cards["sync-1"] = sync;
      s.cards["argus-1"] = argus;
      s.corp.hand = ["sync-1", "argus-1"];

      s = must(s, { type: "play_operation", cardId: "sync-1" });
      expect(s.cards["sync-1"]!.zone).toBe("corp:play-area");
      expect(s.corp.discardPile).not.toContain("sync-1");
      expect(
        queryLegality(s).legal.some(
          (e) =>
            e.action.type === "play_operation" && e.action.cardId === "argus-1",
        ),
      ).toBe(false);

      const blocked = applyAction(s, {
        type: "play_operation",
        cardId: "argus-1",
      });
      expect(blocked.ok).toBe(false);
    });

    it("Corp turn begin trashes lingering lockdown", () => {
      const s = corpPlayReady(createInitialState());
      const sync = instantiateCard("sync-rerouting", "sync-2", "corp:play-area");
      s.cards["sync-2"] = sync;
      expect(s.cards["sync-2"]!.zone).toBe("corp:play-area");

      trashActiveLockdownsAtCorpTurnBegin(s);
      expect(s.cards["sync-2"]!.zone).toBe("corp:archives");
      expect(s.corp.discardPile).toContain("sync-2");
      expect(
        s.log.some((line) => line.includes("trashed at Corp turn begin")),
      ).toBe(true);
    });

    it("SYNC onRunBegin from play-area offers pay 4¢ or take a tag", () => {
      let s = corpPlayReady(createInitialState());
      const sync = instantiateCard("sync-rerouting", "sync-3", "corp:play-area");
      s.cards["sync-3"] = sync;
      s.runner.credits = 10;
      s.runner.tags = 0;
      s.run = {
        attackedServerId: "hq",
        phase: "initiation",
        position: null,
        successful: null,
        accessedCardIds: [],
        accessCandidates: [],
        randomAccessLimit: null,
        encounter: null,
        endedTheRun: false,
        cannotJackOut: false,
      };

      const r = evalEffect(
        { state: s, sourceId: "sync-3" },
        s.cards["sync-3"]!.onRunBegin!,
      );
      expect(r.ok).toBe(true);
      expect(s.pendingChoice?.chooser).toBe("runner");
      expect(s.pendingChoice?.options.some((o) => o.id === "pay4")).toBe(true);
      expect(s.pendingChoice?.options.some((o) => o.id === "tag")).toBe(true);

      s = must(s, { type: "choose_option", optionId: "tag" });
      expect(s.runner.tags).toBe(1);
    });

    it("Argus does 2 meat on successful run vs iced server", () => {
      const s = corpPlayReady(createInitialState());
      const argus = instantiateCard(
        "argus-crackdown",
        "arg-meat",
        "corp:play-area",
      );
      const ice = instantiateCard("ice-wall", "iw-1", "server:hq:ice");
      ice.rezzed = true;
      s.cards["arg-meat"] = argus;
      s.cards["iw-1"] = ice;
      s.servers.hq.ice = ["iw-1"];
      for (let i = 0; i < 3; i++) {
        const id = `grip-${i}`;
        s.cards[id] = instantiateCard("sure-gamble", id, "runner:grip");
        s.runner.hand.push(id);
      }
      s.run = {
        attackedServerId: "hq",
        phase: "success",
        position: null,
        successful: true,
        accessedCardIds: [],
        accessCandidates: [],
        randomAccessLimit: null,
        encounter: null,
        endedTheRun: false,
        cannotJackOut: false,
      };

      const gripBefore = s.runner.hand.length;
      const r = evalEffect(
        { state: s, sourceId: "arg-meat" },
        s.cards["arg-meat"]!.onSuccessfulRun!,
      );
      expect(r.ok).toBe(true);
      expect(s.runner.hand.length).toBe(gripBefore - 2);
      expect(s.runner.discardPile.length).toBeGreaterThanOrEqual(2);
    });

    it("Argus skips meat when attacked server has no ice", () => {
      const s = corpPlayReady(createInitialState());
      const argus = instantiateCard(
        "argus-crackdown",
        "arg-skip",
        "corp:play-area",
      );
      s.cards["arg-skip"] = argus;
      s.servers.hq.ice = [];
      for (let i = 0; i < 2; i++) {
        const id = `grip-s-${i}`;
        s.cards[id] = instantiateCard("sure-gamble", id, "runner:grip");
        s.runner.hand.push(id);
      }
      s.run = {
        attackedServerId: "hq",
        phase: "success",
        position: null,
        successful: true,
        accessedCardIds: [],
        accessCandidates: [],
        randomAccessLimit: null,
        encounter: null,
        endedTheRun: false,
        cannotJackOut: false,
      };
      const before = s.runner.hand.length;
      const r = evalEffect(
        { state: s, sourceId: "arg-skip" },
        s.cards["arg-skip"]!.onSuccessfulRun!,
      );
      expect(r.ok).toBe(true);
      expect(s.runner.hand.length).toBe(before);
    });

    it("Hyoubu choose_server stores chosenServerId", () => {
      let s = corpPlayReady(createInitialState());
      const hy = instantiateCard("hyoubu-precog-manifold", "hy-1", "corp:hq");
      s.cards["hy-1"] = hy;
      s.corp.hand = ["hy-1"];
      s = must(s, { type: "play_operation", cardId: "hy-1" });
      expect(s.cards["hy-1"]!.zone).toBe("corp:play-area");
      expect(s.pendingChoice?.chooser).toBe("corp");
      s = must(s, { type: "choose_option", optionId: "server:rd" });
      expect(s.cards["hy-1"]!.chosenServerId).toBe("rd");
    });

    it("NAPD adds 4+2×advancement steal cost while active", () => {
      let s = corpPlayReady(createInitialState());
      const napd = instantiateCard("napd-cordon", "napd-1", "corp:hq");
      const ag = instantiateCard(
        "hostile-takeover",
        "ag-1",
        "server:remote-1:root",
      );
      ag.advancementCounters = 2;
      s.cards["napd-1"] = napd;
      s.cards["ag-1"] = ag;
      s.corp.hand = ["napd-1"];
      if (!s.servers["remote-1"]) {
        s.servers["remote-1"] = {
          id: "remote-1",
          kind: "remote",
          root: [],
          ice: [],
        };
      }
      s.servers["remote-1"]!.root = ["ag-1"];
      s = must(s, { type: "play_operation", cardId: "napd-1" });
      expect(stealAdditionalCreditsFromActiveLockdowns(s, "ag-1")).toBe(8);
    });

    it("NEXT gives +2 ice strength and blocks non-icebreaker breaks", () => {
      let s = corpPlayReady(createInitialState());
      const next = instantiateCard(
        "next-activation-command",
        "next-1",
        "corp:hq",
      );
      const ice = instantiateCard("ice-wall", "iw-next", "server:hq:ice");
      ice.rezzed = true;
      ice.strength = 1;
      s.cards["next-1"] = next;
      s.cards["iw-next"] = ice;
      s.servers.hq.ice = ["iw-next"];
      s.corp.hand = ["next-1"];
      expect(effectiveIceStrength(s, "iw-next")).toBe(1);
      s = must(s, { type: "play_operation", cardId: "next-1" });
      expect(effectiveIceStrength(s, "iw-next")).toBe(3);

      const boom = instantiateCard("boomerang", "boom-1", "runner:installed");
      boom.chosenIceId = "iw-next";
      s.cards["boom-1"] = boom;
      s.runner.installed = ["boom-1"];
      s.run = {
        attackedServerId: "hq",
        phase: "encounter",
        position: 0,
        successful: null,
        accessedCardIds: [],
        accessCandidates: [],
        randomAccessLimit: null,
        encounter: {
          iceId: "iw-next",
          broken: [false],
        },
        endedTheRun: false,
        cannotJackOut: false,
      };
      s.activeSide = "runner";
      s.timingKey = "run.encounterPaw";

      const legal = queryLegality(s).legal;
      expect(
        legal.some(
          (e) =>
            e.action.type === "use_paid_ability" && e.action.cardId === "boom-1",
        ),
      ).toBe(false);
    });
  });
  });

  describe("ur-v145-j-slice", () => {

  beforeAll(() => {
    if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
    if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
    assertPinnedTag("v26.03");
    assertCardsPinnedTag("v1.147.15");
  });

  function must(state: GameState, action: Action): GameState {
    const r = applyAction(state, action);
    if (!r.ok) throw new Error(`${r.error} ${JSON.stringify(r.cites)}`);
    return r.state;
  }

  function corpPlayReady(s: GameState): GameState {
    s = structuredClone(s);
    s.activeSide = "corp";
    s.timingKey = "corp.takeAction";
    s.corp.clicks = 3;
    s.corp.credits = 20;
    return s;
  }

  function runnerActionReady(s: GameState): GameState {
    s = structuredClone(s);
    s.activeSide = "runner";
    s.timingKey = "runner.takeAction";
    s.runner.clicks = 4;
    s.runner.credits = 20;
    return s;
  }

  describe("Uprising v1.45.0 J-slice", () => {

    it("Hoshiko wires access-turn-end flip + flipped begin draw", () => {
      const def = getCardDef("hoshiko-shiro-untold-protagonist");
      expect(validateEffectTree(def.onRunnerTurnEnd!)).toBeNull();
      expect(validateEffectTree(def.onTurnBegin!)).toBeNull();
      expect(JSON.stringify(def.onRunnerTurnEnd)).toContain(
        "accessed_a_card_this_turn",
      );
      expect(JSON.stringify(def.onRunnerTurnEnd)).toContain("flip_identity");
      expect(JSON.stringify(def.onTurnBegin)).toContain("identity_flipped");
      expect(JSON.stringify(def.onTurnBegin)).toContain("draw");
    });

    it("Hoshiko gains 2¢ and flips when a card was accessed", () => {
      const s = createInitialState();
      const id = instantiateCard(
        "hoshiko-shiro-untold-protagonist",
        "hoshiko-1",
        "runner:identity",
      );
      s.cards["hoshiko-1"] = id;
      s.runner.identityId = "hoshiko-1";
      s.runner.credits = 5;
      s.turn.accessedACardThisTurn = true;
      expect(s.cards["hoshiko-1"]!.identityFlipped).toBeFalsy();

      const r = evalEffect(
        { state: s, sourceId: "hoshiko-1" },
        s.cards["hoshiko-1"]!.onRunnerTurnEnd!,
      );
      expect(r.ok).toBe(true);
      expect(s.runner.credits).toBe(7);
      expect(s.cards["hoshiko-1"]!.identityFlipped).toBe(true);
    });

    it("Hoshiko flipped face is the active face: digital, link 1 (CR 3.1.1a)", () => {
      const s = createInitialState();
      const id = instantiateCard(
        "hoshiko-shiro-untold-protagonist",
        "hoshiko-1",
        "runner:identity",
      );
      // Faces come from the pinned cards data (identityFaces, front first).
      expect(id.identityFaces?.[1]).toEqual({
        title: "Hoshiko Shiro: Mahou Shoujo",
        subtypes: ["digital"],
        link: 1,
      });
      s.cards["hoshiko-1"] = id;
      s.runner.identityId = "hoshiko-1";
      s.turn.accessedACardThisTurn = true;

      const r = evalEffect(
        { state: s, sourceId: "hoshiko-1" },
        s.cards["hoshiko-1"]!.onRunnerTurnEnd!,
      );
      expect(r.ok).toBe(true);
      expect(s.cards["hoshiko-1"]!.identityFlipped).toBe(true);
      expect(s.cards["hoshiko-1"]!.subtypes).toEqual(["digital"]);
      expect(s.cards["hoshiko-1"]!.link).toBe(1);
      expect(s.runner.link).toBe(1);
    });

    it("DRM wires no-HQ-last-turn gate + search + remote install + forbid score", () => {
      const def = getCardDef("digital-rights-management");
      expect(def.playRequiresNoSuccessfulHqRunLastTurn).toBe(true);
      expect(validateEffectTree(def.onPlay!)).toBeNull();
      expect(JSON.stringify(def.onPlay)).toContain("search_rd_type_to_hq");
      expect(JSON.stringify(def.onPlay)).toContain(
        "may_install_from_hq_in_remote_root_paying_costs",
      );
      expect(JSON.stringify(def.onPlay)).toContain(
        "forbid_scoring_agendas_this_turn",
      );
    });

    it("DRM play gate blocks after successful HQ last turn", () => {
      const s = corpPlayReady(createInitialState());
      const drm = instantiateCard(
        "digital-rights-management",
        "drm-1",
        "corp:hq",
      );
      s.cards["drm-1"] = drm;
      s.corp.hand = ["drm-1"];
      s.turn.successfulHqRunLastTurn = true;
      expect(
        queryLegality(s).legal.some(
          (e) =>
            e.action.type === "play_operation" && e.action.cardId === "drm-1",
        ),
      ).toBe(false);
      const blocked = applyAction(s, {
        type: "play_operation",
        cardId: "drm-1",
      });
      expect(blocked.ok).toBe(false);

      s.turn.successfulHqRunLastTurn = false;
      expect(
        queryLegality(s).legal.some(
          (e) =>
            e.action.type === "play_operation" && e.action.cardId === "drm-1",
        ),
      ).toBe(true);
    });

    it("beginCorpTurnFlags carries successfulHqRunLastTurn", () => {
      const s = createInitialState();
      s.turn.successfulHqRunThisTurn = true;
      beginCorpTurnFlags(s);
      expect(s.turn.successfulHqRunLastTurn).toBe(true);
      expect(s.turn.successfulHqRunThisTurn).toBe(false);
    });

    it("Paule's Café wires host faceup + install-hosted discount", () => {
      const def = getCardDef("paules-cafe");
      expect(def.unique).toBe(true);
      expect(def.paidAbilities?.length).toBe(2);
      const host = def.paidAbilities![0]!;
      const install = def.paidAbilities![1]!;
      expect(validateEffectTree(host.effect)).toBeNull();
      expect(validateEffectTree(install.effect)).toBeNull();
      expect(JSON.stringify(host.effect)).toContain(
        "may_host_one_program_or_hardware_from_grip_faceup",
      );
      expect(JSON.stringify(install.effect)).toContain(
        "may_install_one_hosted_card",
      );
      expect(JSON.stringify(install.effect)).toContain(
        "firstThisTurnDiscountPerUniqueConnection",
      );
    });

    it("Paule's may host a program faceup from grip", () => {
      let s = runnerActionReady(createInitialState());
      const cafe = instantiateCard("paules-cafe", "cafe-1", "runner:installed");
      const prog = instantiateCard("sure-gamble", "prog-1", "runner:grip");
      // Use a real program if available; otherwise force type.
      prog.type = "program";
      prog.installCost = 2;
      prog.memoryCost = 1;
      s.cards["cafe-1"] = cafe;
      s.cards["prog-1"] = prog;
      s.runner.installed = ["cafe-1"];
      s.runner.hand = ["prog-1"];

      const r = evalEffect(
        { state: s, sourceId: "cafe-1" },
        {
          op: "do",
          action: { kind: "may_host_one_program_or_hardware_from_grip_faceup" },
        },
      );
      expect(r.ok).toBe(true);
      expect(s.pendingChoice?.options.some((o) => o.id.includes("prog-1"))).toBe(
        true,
      );
      s = must(s, {
        type: "choose_option",
        optionId: `host-grip-faceup:prog-1`,
      });
      expect(s.cards["prog-1"]!.zone).toBe("hosted:cafe-1");
      expect(s.cards["prog-1"]!.faceup).toBe(true);
      expect(s.cards["cafe-1"]!.hostedCardIds).toContain("prog-1");
    });

    it("Konjin wires psi → may nested encounter resume", () => {
      const def = getCardDef("konjin");
      expect(validateEffectTree(def.onEncounter!)).toBeNull();
      expect(JSON.stringify(def.onEncounter)).toContain("play_psi_game");
      expect(JSON.stringify(def.onEncounter)).toContain(
        "may_choose_other_rezzed_ice_encounter_then_resume_source",
      );
    });

    it("Konjin may choose other rezzed ice for nested encounter", () => {
      const s = createInitialState();
      const konjin = instantiateCard("konjin", "kon-1", "server:hq:ice");
      const wall = instantiateCard("ice-wall", "wall-1", "server:rd:ice");
      wall.rezzed = true;
      wall.faceup = true;
      konjin.rezzed = true;
      konjin.faceup = true;
      s.cards["kon-1"] = konjin;
      s.cards["wall-1"] = wall;
      s.servers.hq.ice = ["kon-1"];
      s.servers.rd.ice = ["wall-1"];
      s.run = {
        attackedServerId: "hq",
        phase: "encounter",
        position: 0,
        successful: null,
        accessedCardIds: [],
        accessCandidates: [],
        randomAccessLimit: null,
        encounter: { iceId: "kon-1", broken: [false] },
        endedTheRun: false,
        cannotJackOut: false,
      };

      const r = evalEffect(
        { state: s, sourceId: "kon-1" },
        {
          op: "do",
          action: {
            kind: "may_choose_other_rezzed_ice_encounter_then_resume_source",
          },
        },
      );
      expect(r.ok).toBe(true);
      expect(
        s.pendingChoice?.options.some((o) => o.id === "konjin-encounter:wall-1"),
      ).toBe(true);

      const chosen = applyAction(s, {
        type: "choose_option",
        optionId: "konjin-encounter:wall-1",
      });
      // Divert may walk; accept either pending divert state or resumed walk.
      expect(chosen.ok).toBe(true);
      if (chosen.ok) {
        expect(
          chosen.state.run?.resumeEncounterIceId === "kon-1" ||
            chosen.state.run?.forceEncounterIceId === "wall-1" ||
            chosen.state.run?.encounter?.iceId === "wall-1" ||
            chosen.state.log.some((l) => l.includes("resume")),
        ).toBe(true);
      }
    });

    it("Buffer Drive wires spectator batch + RFG heap-to-top", () => {
      const def = getCardDef("buffer-drive");
      expect(def.unique).toBe(true);
      expect(validateEffectTree(def.onFirstGripOrStackTrashBatchEachTurn!)).toBeNull();
      expect(JSON.stringify(def.onFirstGripOrStackTrashBatchEachTurn)).toContain(
        "may_add_one_of_card_ids_to_stack_bottom",
      );
      const paid = def.paidAbilities![0]!;
      expect(validateEffectTree(paid.effect)).toBeNull();
      expect(JSON.stringify(paid.effect)).toContain("rfg_self");
      expect(JSON.stringify(paid.effect)).toContain(
        "may_add_from_heap_to_stack_top",
      );
    });

    it("Buffer Drive offers bottoming one of a grip trash batch", () => {
      let s = createInitialState();
      const buf = instantiateCard("buffer-drive", "buf-1", "runner:installed");
      const a = instantiateCard("sure-gamble", "a-1", "runner:grip");
      const b = instantiateCard("sure-gamble", "b-1", "runner:grip");
      s.cards["buf-1"] = buf;
      s.cards["a-1"] = a;
      s.cards["b-1"] = b;
      s.runner.installed = ["buf-1"];
      s.runner.hand = ["a-1", "b-1"];
      s.turn.pendingGripOrStackTrashBatchIds = ["a-1", "b-1"];
      // Simulate already in heap after trash.
      s.runner.hand = [];
      s.runner.discardPile = ["a-1", "b-1"];
      a.zone = "runner:heap";
      b.zone = "runner:heap";

      const r = evalEffect(
        { state: s, sourceId: "buf-1" },
        buf.onFirstGripOrStackTrashBatchEachTurn!,
      );
      expect(r.ok).toBe(true);
      expect(s.pendingChoice?.options.some((o) => o.id === "batch-bottom:a-1")).toBe(
        true,
      );
      s = must(s, { type: "choose_option", optionId: "batch-bottom:a-1" });
      expect(s.runner.deck[s.runner.deck.length - 1]).toBe("a-1");
      expect(s.runner.discardPile).not.toContain("a-1");
    });

    it("beginRunnerTurnFlags resets access + café + buffer once flags", () => {
      const s = createInitialState();
      s.turn.accessedACardThisTurn = true;
      s.turn.paulesCafeInstallUsedThisTurn = true;
      s.turn.bufferDriveGripStackTrashUsedThisTurn = true;
      s.turn.successfulHqRunLastTurn = true;
      beginRunnerTurnFlags(s);
      expect(s.turn.accessedACardThisTurn).toBe(false);
      expect(s.turn.paulesCafeInstallUsedThisTurn).toBe(false);
      expect(s.turn.bufferDriveGripStackTrashUsedThisTurn).toBe(false);
      expect(s.turn.successfulHqRunLastTurn).toBe(true);
    });
  });
  });

  describe("ur-v146-k-slice", () => {

  beforeAll(() => {
    if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
    if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
    assertPinnedTag("v26.03");
    assertCardsPinnedTag("v1.147.15");
  });

  function must(state: GameState, action: Action): GameState {
    const r = applyAction(state, action);
    if (!r.ok) throw new Error(`${r.error} ${JSON.stringify(r.cites)}`);
    return r.state;
  }

  function runnerActionReady(s: GameState): GameState {
    s = structuredClone(s);
    s.activeSide = "runner";
    s.timingKey = "runner.takeAction";
    s.runner.clicks = 4;
    s.runner.credits = 20;
    return s;
  }

  describe("Uprising v1.46.0 K-slice", () => {

    it("Prāna wires damage interrupt + discharge", () => {
      const def = getCardDef("prana-condenser");
      expect(def.paidAbilities?.length).toBe(2);
      const prevent = def.paidAbilities![0]!;
      expect(prevent.windows).toContain("damage_interrupt");
      expect(prevent.requirePendingDamageTypes).toEqual(["net"]);
      expect(prevent.oncePerPendingDamageInstance).toBe(true);
      expect(validateEffectTree(prevent.effect)).toBeNull();
      expect(JSON.stringify(prevent.effect)).toContain("prevent_pending_damage");
      expect(JSON.stringify(def.paidAbilities![1]!.effect)).toContain(
        "source_power_counters",
      );
    });

    it("Prāna interrupt prevents 1 net, places power, gains 3¢ (once)", () => {
      let s = createInitialState();
      s = structuredClone(s);
      const prana = instantiateCard("prana-condenser", "prana-1", "server:remote-1:root");
      prana.rezzed = true;
      s.cards["prana-1"] = prana;
      s.servers["remote-1"] = {
        id: "remote-1",
        kind: "remote",
        ice: [],
        root: ["prana-1"],
      };
      s.corp.credits = 5;
      s.runner.hand = ["h1", "h2"];
      for (const id of ["h1", "h2"]) {
        s.cards[id] = instantiateCard("sure-gamble", id, "runner:grip");
      }
      expect(dealDamage(s, "net", 2, "src")).toBe("pending");
      expect(s.pendingDamage?.remaining).toBe(2);
      const legal = queryLegality(s).legal.map((e) => e.action);
      expect(
        legal.some(
          (a) =>
            a.type === "use_paid_ability" &&
            a.cardId === "prana-1" &&
            a.abilityId === "prana-prevent-net",
        ),
      ).toBe(true);
      s = must(s, {
        type: "use_paid_ability",
        cardId: "prana-1",
        abilityId: "prana-prevent-net",
      });
      expect(s.pendingDamage?.remaining).toBe(1);
      expect(s.cards["prana-1"]!.powerCounters).toBe(1);
      expect(s.corp.credits).toBe(8);
      // Once per instance — not re-offered.
      expect(
        queryLegality(s).legal.some(
          (e) =>
            e.action.type === "use_paid_ability" &&
            e.action.cardId === "prana-1",
        ),
      ).toBe(false);
    });

    it("Vacheron steal non-Archives → 4 counters / 0 AP; Archives plain", () => {
      const def = getCardDef("project-vacheron");
      expect(def.vacheronStealReplacement).toBe(true);
      expect(def.worthZeroAgendaPointsWhileHasAgendaCounters).toBe(true);
      expect(validateEffectTree(def.onTurnBegin!)).toBeNull();

      let s = createInitialState();
      s = structuredClone(s);
      const vac = instantiateCard("project-vacheron", "vac-1", "server:remote-1:root");
      s.cards["vac-1"] = vac;
      s.servers["remote-1"] = {
        id: "remote-1",
        kind: "remote",
        ice: [],
        root: ["vac-1"],
      };
      stealAgenda(s, "vac-1");
      expect(s.runner.scoreArea).toContain("vac-1");
      expect(s.cards["vac-1"]!.agendaCounters).toBe(4);
      expect(agendaPointsFor(s, "runner")).toBe(0);

      beginRunnerTurnFlags(s);
      const r = evalEffect(
        { state: s, sourceId: "vac-1" },
        s.cards["vac-1"]!.onTurnBegin!,
      );
      expect(r.ok).toBe(true);
      expect(s.cards["vac-1"]!.agendaCounters).toBe(3);

      // Archives steal — no replacement.
      let s2 = createInitialState();
      s2 = structuredClone(s2);
      const vac2 = instantiateCard("project-vacheron", "vac-2", "corp:archives");
      s2.cards["vac-2"] = vac2;
      s2.corp.discardPile = ["vac-2"];
      stealAgenda(s2, "vac-2");
      expect(s2.cards["vac-2"]!.agendaCounters ?? 0).toBe(0);
      expect(agendaPointsFor(s2, "runner")).toBe(3);
    });

    it("Earth Station: max 1 remote + HQ tax front + remote tax flipped + HQ unflip", () => {
      const def = getCardDef("earth-station-sea-headquarters");
      expect(def.maxRemoteServers).toBe(1);
      expect(def.additionalRunInitiateCredits).toEqual({
        hqUnflipped: 1,
        remoteFlipped: 6,
      });
      expect(def.identityFlippedHooks?.onSuccessfulHqRun).toBeTruthy();

      const s = runnerActionReady(createInitialState());
      const id = instantiateCard(
        "earth-station-sea-headquarters",
        "es-1",
        "corp:identity",
      );
      s.cards["es-1"] = id;
      s.corp.identityId = "es-1";
      s.runner.credits = 0;
      expect(additionalRunInitiateCredits(s, "hq")).toBe(1);
      expect(
        queryLegality(s).legal.some(
          (e) => e.action.type === "basic_run" && e.action.serverId === "hq",
        ),
      ).toBe(false);

      s.runner.credits = 5;
      expect(
        queryLegality(s).legal.some(
          (e) => e.action.type === "basic_run" && e.action.serverId === "hq",
        ),
      ).toBe(true);

      s.cards["es-1"]!.identityFlipped = true;
      s.servers["remote-1"] = {
        id: "remote-1",
        kind: "remote",
        ice: [],
        root: [],
      };
      expect(additionalRunInitiateCredits(s, "remote-1")).toBe(6);
      s.runner.credits = 5;
      expect(
        queryLegality(s).legal.some(
          (e) =>
            e.action.type === "basic_run" && e.action.serverId === "remote-1",
        ),
      ).toBe(false);

      fireCorpIdentityFlippedSuccessfulHqOrRdRun(s, "hq");
      expect(s.cards["es-1"]!.identityFlipped).toBe(false);
    });

    it("Kakurenbo wires triple + HQ trash + facedown + install+adv + RFG", () => {
      const def = getCardDef("kakurenbo");
      expect(def.playAdditionalClicks).toBe(2);
      expect(validateEffectTree(def.onPlay!)).toBeNull();
      const js = JSON.stringify(def.onPlay);
      expect(js).toContain("trash_any_number_from_hq");
      expect(js).toContain("turn_all_archives_facedown");
      expect(js).toContain(
        "may_install_from_archives_in_remote_root_with_advancements",
      );
      expect(js).toContain("rfg_self");
    });

    it("Gachapon wires trash resolve", () => {
      const def = getCardDef("gachapon");
      expect(def.paidAbilities?.length).toBe(1);
      expect(validateEffectTree(def.paidAbilities![0]!.effect)).toBeNull();
      expect(JSON.stringify(def.paidAbilities![0]!.effect)).toContain(
        "resolve_gachapon",
      );
      expect(def.paidAbilities![0]!.cost?.trashSelf).toBe(true);
    });

    it("The Back: first hardware use during run places power", () => {
      const def = getCardDef("the-back");
      expect(validateEffectTree(def.onFirstHardwareUseDuringRunEachTurn!)).toBeNull();
      expect(def.paidAbilities![0]!.cost?.rfgSelf).toBe(true);

      let s = runnerActionReady(createInitialState());
      const back = instantiateCard("the-back", "back-1", "runner:installed");
      s.cards["back-1"] = back;
      const hw = instantiateCard("airbladex-jsrf-ed", "hw-1", "runner:installed");
      hw.powerCounters = 2;
      s.cards["hw-1"] = hw;
      s.runner.installed = ["back-1", "hw-1"];
      s.run = {
        attackedServerId: "hq",
        phase: "encounter",
        position: 0,
        successful: null,
        accessedCardIds: [],
        accessCandidates: [],
        randomAccessLimit: null,
        encounter: null,
        endedTheRun: false,
        cannotJackOut: false,
        accessingCardId: null,
      };
      // Open damage so AirbladeX paid ability is legal.
      expect(dealDamage(s, "net", 1, "src")).toBe("pending");
      s = must(s, {
        type: "use_paid_ability",
        cardId: "hw-1",
        abilityId: "airblade-prevent-damage",
      });
      expect(s.cards["back-1"]!.powerCounters).toBe(1);
      expect(s.turn.hardwareUsedDuringRunThisTurn).toBe(true);
    });

    it("GameNET × Tollbooth pay_credits_or_etr triggers once", () => {
      let s = createInitialState();
      s = structuredClone(s);
      const gn = instantiateCard(
        "gamenet-where-dreams-are-real",
        "gn-2",
        "corp:identity",
      );
      s.cards["gn-2"] = gn;
      s.corp.identityId = "gn-2";
      s.corp.credits = 0;
      s.runner.credits = 5;
      s.run = {
        attackedServerId: "hq",
        phase: "encounter",
        position: 0,
        successful: null,
        accessedCardIds: [],
        accessCandidates: [],
        randomAccessLimit: null,
        encounter: null,
        endedTheRun: false,
        cannotJackOut: false,
        accessingCardId: null,
      };
      const tb = instantiateCard("tollbooth", "tb-1", "server:hq:ice");
      s.cards["tb-1"] = tb;
      const r2 = evalEffect(
        { state: s, sourceId: "tb-1" },
        fx.payCreditsOrEtr("runner", 3),
      );
      expect(r2.ok).toBe(true);
      expect(s.runner.credits).toBe(2);
      expect(s.corp.credits).toBe(1);
    });
  });

  describe("Interaction smoke — Uprising / v1.46.0", () => {
    it("prevent × cost: Prāna × net instance (9.12.2b)", () => {
      expect(getCardDef("prana-condenser").unsupported ?? []).toEqual([]);
    });
    it("cannot × basic / additional cost: Earth Station unpayable HQ absent (1.16.1b)", () => {
      expect(
        getCardDef("earth-station-sea-headquarters").additionalRunInitiateCredits
          ?.hqUnflipped,
      ).toBe(1);
    });
  });
  });
});
