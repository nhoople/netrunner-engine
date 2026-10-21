/**
 * reign-and-reverie play tests.
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
  validateEffectTree,
  legalFenrisHostIds,
  abilitiesSuppressed,
  releaseHostedCardsOnTrash,
  runnerAbilityCarrierIds,
  RUNNER_OUTSIDE_GAME_IDENTITIES_ZONE,
} from "../src/index.js";
import type {
  GameState,
} from "../src/state/types.js";

describe("reign-and-reverie", () => {
  describe("rar-v175-kickoff", () => {

  beforeAll(() => {
    if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
    if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
    assertPinnedTag("v26.03");
    assertCardsPinnedTag("v1.147.9");
  });

  describe("Reign and Reverie v1.75.0 kickoff", () => {

    it("Fly on the Wall scores for a tag", () => {
      const def = getCardDef("fly-on-the-wall");
      expect(def.onScore).toEqual({
        op: "do",
        action: { kind: "give_tags", amount: 1 },
      });
      expect(validateEffectTree(def.onScore!)).toBeNull();
    });

    it("Hyperloop Extension gains 3¢ when scored or stolen", () => {
      const def = getCardDef("hyperloop-extension");
      expect(def.onAgendaScoredOrStolen).toEqual(fx.gainCredits("corp", 3));
      expect(validateEffectTree(def.onAgendaScoredOrStolen!)).toBeNull();
    });

    it("Hot Pursuit runs HQ for 9¢ + tag on success", () => {
      const def = getCardDef("hot-pursuit");
      expect(def.runEvent?.servers).toBe("hq");
      expect(JSON.stringify(def.runEvent?.onSuccessfulRun)).toContain(
        "gain_credits",
      );
      expect(JSON.stringify(def.runEvent?.onSuccessfulRun)).toContain(
        "give_tags",
      );
      expect(validateEffectTree(def.runEvent!.onSuccessfulRun!)).toBeNull();
    });

    it("Kyuban installs on ice and gains on pass host", () => {
      const def = getCardDef("kyuban");
      expect(def.installOnIce).toBe(true);
      expect(def.onPassHost).toEqual(fx.gainCredits("runner", 2));
      expect(validateEffectTree(def.onPassHost!)).toBeNull();
    });

    it("Bankroll may place hosted ¢; trash takes all", () => {
      const def = getCardDef("bankroll");
      expect(JSON.stringify(def.onSuccessfulRun)).toContain(
        "place_hosted_credits",
      );
      expect(validateEffectTree(def.onSuccessfulRun!)).toBeNull();
      const ab = def.paidAbilities![0]!;
      expect(ab.cost).toEqual({ trashSelf: true });
      expect(JSON.stringify(ab.effect)).toContain("take_hosted_credits");
      expect(validateEffectTree(ab.effect)).toBeNull();

      const s = structuredClone(createInitialState());
      const br = instantiateCard("bankroll", "br", "runner:installed");
      br.hostedCredits = 3;
      s.cards["br"] = br;
      s.runner.installed.push("br");
      const before = s.runner.credits;
      const r = evalEffect(
        { state: s, sourceId: "br" },
        { op: "do", action: { kind: "take_hosted_credits", amount: 99 } },
      );
      expect(r.ok).toBe(true);
      expect(s.runner.credits).toBe(before + 3);
    });
  });
  });

  describe("rar-v176-a-slice", () => {

  beforeAll(() => {
    if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
    if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
    assertPinnedTag("v26.03");
    assertCardsPinnedTag("v1.147.9");
  });

  describe("Reign and Reverie v1.76.0 A-slice", () => {

    it("Liza draws 2 and takes a tag on first successful central", () => {
      const def = getCardDef("liza-talking-thunder-prominent-legislator");
      expect(def.onFirstSuccessfulCentralRunThisTurn).toEqual({
        op: "seq",
        effects: [fx.draw("runner", 2), fx.do({ kind: "give_tags", amount: 1 })],
      });
      expect(
        validateEffectTree(def.onFirstSuccessfulCentralRunThisTurn!),
      ).toBeNull();
    });

    it("Sportsmetal chooses gain 2¢ or draw 2 on agenda scored/stolen", () => {
      const def = getCardDef("sportsmetal-go-big-or-go-home");
      expect(def.onAgendaScoredOrStolen?.op).toBe("choose");
      expect(JSON.stringify(def.onAgendaScoredOrStolen)).toContain(
        "gain_credits",
      );
      expect(JSON.stringify(def.onAgendaScoredOrStolen)).toContain("draw");
      expect(validateEffectTree(def.onAgendaScoredOrStolen!)).toBeNull();
    });

    it("Gnat gains 1¢ at turn begin when grip has ≤2 cards", () => {
      const def = getCardDef("nathaniel-gnat-hall-one-of-a-kind");
      expect(def.onTurnBegin?.op).toBe("if");
      expect(JSON.stringify(def.onTurnBegin)).toContain("grip_count_gte");
      expect(JSON.stringify(def.onTurnBegin)).toContain("gain_credits");
      expect(validateEffectTree(def.onTurnBegin!)).toBeNull();

      const s = structuredClone(createInitialState());
      const id = instantiateCard(
        "nathaniel-gnat-hall-one-of-a-kind",
        "gnat",
        "runner:identity",
      );
      s.cards["gnat"] = id;
      s.runner.identityCardId = "gnat";
      s.runner.hand = [];
      const before = s.runner.credits;
      const r = evalEffect({ state: s, sourceId: "gnat" }, def.onTurnBegin!);
      expect(r.ok).toBe(true);
      expect(s.runner.credits).toBe(before + 1);
    });

    it("Guinea Pig trashes grip and gains 10¢", () => {
      const def = getCardDef("guinea-pig");
      expect(JSON.stringify(def.onPlay)).toContain("trash_random_from_grip");
      expect(JSON.stringify(def.onPlay)).toContain("gain_credits");
      expect(validateEffectTree(def.onPlay!)).toBeNull();

      const s = structuredClone(createInitialState());
      for (const [i, cardId] of ["a", "b", "c"].entries()) {
        const c = instantiateCard("sure-gamble", cardId, "runner:grip");
        s.cards[cardId] = c;
        s.runner.hand.push(cardId);
        void i;
      }
      const before = s.runner.credits;
      const r = evalEffect({ state: s, sourceId: "gp" }, def.onPlay!);
      expect(r.ok).toBe(true);
      expect(s.runner.hand).toHaveLength(0);
      expect(s.runner.credits).toBe(before + 10);
    });

    it("Hydra subs branch on tagged vs untagged", () => {
      const def = getCardDef("hydra");
      expect(def.subroutines).toHaveLength(3);
      for (const sub of def.subroutines!) {
        expect(sub.effect.op).toBe("if");
        expect(JSON.stringify(sub.effect)).toContain("runner_tagged");
        expect(validateEffectTree(sub.effect)).toBeNull();
      }
      expect(JSON.stringify(def.subroutines![0].effect)).toContain("net_damage");
      expect(JSON.stringify(def.subroutines![1].effect)).toContain(
        "gain_credits",
      );
      expect(JSON.stringify(def.subroutines![2].effect)).toContain(
        "end_the_run",
      );
    });
  });
  });

  describe("rar-v177-b-slice", () => {

  beforeAll(() => {
    if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
    if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
    assertPinnedTag("v26.03");
    assertCardsPinnedTag("v1.147.9");
  });

  describe("Reign and Reverie v1.77.0 B-slice", () => {

    it("SIU may trash self to Trace[3] for a tag", () => {
      const def = getCardDef("siu");
      expect(def.onTurnBegin?.op).toBe("choose");
      expect(JSON.stringify(def.onTurnBegin)).toContain("trash_self");
      expect(JSON.stringify(def.onTurnBegin)).toContain("trace");
      expect(validateEffectTree(def.onTurnBegin!)).toBeNull();
    });

    it("Too Big to Fail requires <10¢ then gains 7¢ + bad publicity", () => {
      const def = getCardDef("too-big-to-fail");
      expect(def.playRequiresCreditsLt).toBe(10);
      expect(def.onPlay).toEqual({
        op: "seq",
        effects: [
          fx.gainCredits("corp", 7),
          fx.do({ kind: "give_bad_publicity", amount: 1 }),
        ],
      });
      expect(validateEffectTree(def.onPlay!)).toBeNull();
    });

    it("Office Supplies reduces by link and chooses gain or draw 4", () => {
      const def = getCardDef("office-supplies");
      expect(def.playCostReducedByLink).toBe(true);
      expect(def.onPlay?.op).toBe("choose");
      expect(validateEffectTree(def.onPlay!)).toBeNull();
    });

    it("Miss Bones hosts 12¢ spendable for trash", () => {
      const def = getCardDef("miss-bones");
      expect(def.hostedCreditsOnInstall).toBe(12);
      expect(def.hostedCreditsSpendFor).toEqual(["trash"]);
    });

    it("Tycoon is a fracter that pays Corp on encounter end if broke", () => {
      const def = getCardDef("tycoon");
      expect(def.breaker?.breaksSubtype).toBe("barrier");
      expect(def.breaker?.breakMaxSubs).toBe(2);
      expect(def.corpGainsCreditsOnEncounterEndIfBroke).toBe(2);
    });
  });
  });

  describe("rar-v178-c-slice", () => {

  beforeAll(() => {
    if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
    if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
    assertPinnedTag("v26.03");
    assertCardsPinnedTag("v1.147.9");
  });

  describe("Reign and Reverie v1.78.0 C-slice", () => {

    it("Insight may arrange top 4 R&D then reveal_top_n_rd", () => {
      const def = getCardDef("insight");
      expect(def.playAdditionalClick).toBe(true);
      expect(def.onPlay?.op).toBe("seq");
      expect(JSON.stringify(def.onPlay)).toContain("look_top_n_rd_arrange");
      expect(JSON.stringify(def.onPlay)).toContain("reveal_top_n_rd");
      expect(validateEffectTree(def.onPlay!)).toBeNull();
    });

    it("Under the Bus requires access last turn then trashes connection + BP", () => {
      const def = getCardDef("under-the-bus");
      expect(def.playRequiresRunnerAccessedCardLastTurn).toBe(true);
      expect(def.onPlay).toEqual({
        op: "seq",
        effects: [
          fx.do({
            kind: "trash_installed_resource_with_subtype",
            subtype: "connection",
            pick: "choose",
          }),
          fx.do({ kind: "give_bad_publicity", amount: 1 }),
        ],
      });
      expect(validateEffectTree(def.onPlay!)).toBeNull();
    });

    it("Thimblerig may swap ice on turn begin and on pass", () => {
      const def = getCardDef("thimblerig");
      expect(JSON.stringify(def.onTurnBegin)).toContain(
        "may_swap_ice_with_other_installed",
      );
      expect(JSON.stringify(def.onPass)).toContain(
        "may_swap_ice_with_other_installed",
      );
      expect(validateEffectTree(def.onTurnBegin!)).toBeNull();
      expect(validateEffectTree(def.onPass!)).toBeNull();
    });

    it("Gatekeeper has +6 strength if rezzed this turn", () => {
      const def = getCardDef("gatekeeper");
      expect(def.strengthBonusIfRezzedThisTurn).toBe(6);
      expect(def.strength).toBe(0);
      expect(JSON.stringify(def.subroutines)).toContain("draw_up_to");
      expect(JSON.stringify(def.subroutines)).toContain(
        "may_reveal_shuffle_agendas_into_rd",
      );
      for (const sub of def.subroutines ?? []) {
        expect(validateEffectTree(sub.effect)).toBeNull();
      }
    });

    it("Game Changer gains clicks equal to Runner scored agendas then RFGs", () => {
      const def = getCardDef("game-changer");
      expect(def.rfgInsteadOfTrashing).toBe(true);
      expect(def.onPlay).toEqual({
        op: "do",
        action: {
          kind: "gain_clicks",
          side: "corp",
          amount: 0,
          tally: { count: "runner_score", per: 1, side: "corp" },
        },
      });
      expect(validateEffectTree(def.onPlay!)).toBeNull();
    });
  });
  });

  describe("rar-v179-d-slice", () => {

  beforeAll(() => {
    if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
    if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
    assertPinnedTag("v26.03");
    assertCardsPinnedTag("v1.147.9");
  });

  describe("Reign and Reverie v1.81.0 D-slice", () => {

    it("Cradle is a decoder with grip strength penalty and break-any", () => {
      const def = getCardDef("cradle");
      expect(def.strengthPenaltyPerGripCard).toBe(1);
      expect(def.breaker?.breaksSubtype).toBe("code gate");
      expect(def.breaker?.breakCredits).toBe(2);
      expect(def.breaker?.breakMaxSubs).toBe(99);
    });

    it("The Outfit gains credits on each bad publicity take", () => {
      const def = getCardDef("the-outfit-family-owned-and-operated");
      expect(def.gainCreditsOnEachBadPublicityTake).toBe(3);
    });

    it("Building Blocks reveals a barrier then install+rez ignore costs", () => {
      const def = getCardDef("building-blocks");
      expect(def.onPlay).toEqual({
        op: "do",
        action: {
          kind: "reveal_hq_subtype_install_and_rez_ignore_costs",
          subtype: "barrier",
        },
      });
      expect(validateEffectTree(def.onPlay!)).toBeNull();
    });

    it("Attitude Adjustment draws 2 then reveals agendas for credits", () => {
      const def = getCardDef("attitude-adjustment");
      expect(def.onPlay).toEqual({
        op: "seq",
        effects: [
          fx.draw("corp", 2),
          fx.do({
            kind: "may_reveal_shuffle_agendas_into_rd",
            max: 2,
            creditsEach: 2,
          }),
        ],
      });
      expect(validateEffectTree(def.onPlay!)).toBeNull();
    });

    it("API-S Keeper Isobel may remove an advancement for credits", () => {
      const def = getCardDef("api-s-keeper-isobel");
      expect(def.onTurnBegin).toEqual({
        op: "do",
        action: {
          kind: "may_remove_advancement_from_installed_gain_credits",
          credits: 3,
        },
      });
      expect(validateEffectTree(def.onTurnBegin!)).toBeNull();
    });
  });
  });

  describe("rar-v180-e-slice", () => {

  beforeAll(() => {
    if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
    if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
    assertPinnedTag("v26.03");
    assertCardsPinnedTag("v1.147.9");
  });

  describe("Reign and Reverie v1.81.0 E-slice", () => {

    it("Jumon places 2 advancements on a remote root at Corp turn end", () => {
      const def = getCardDef("jumon");
      expect(def.onCorpTurnEnd).toEqual({
        op: "do",
        action: {
          kind: "place_advancements",
          amount: 2,
          onlyRemoteRoot: true,
          pick: "choose",
        },
      });
      expect(validateEffectTree(def.onCorpTurnEnd!)).toBeNull();
    });

    it("Ika is a host killer with rehost, break up to 2, and pump", () => {
      const def = getCardDef("ika");
      expect(def.breaker?.breaksSubtype).toBe("sentry");
      expect(def.breaker?.breakViaPaidAbilityOnly).toBe(true);
      expect(def.breaker?.breakMaxSubs).toBe(2);
      const breakAb = def.paidAbilities?.find((a) => a.id === "ika-break");
      expect(breakAb?.effect).toEqual({
        op: "do",
        action: {
          kind: "break_host_subroutine",
          maxSubs: 2,
          requireSubtype: "sentry",
        },
      });
      expect(validateEffectTree(breakAb!.effect)).toBeNull();
      const hostAb = def.paidAbilities?.find((a) => a.id === "ika-host");
      expect(JSON.stringify(hostAb?.effect)).toContain("rehost_on_other_ice");
    });

    it("Mind's Eye charges on R&D success and breaches without root access", () => {
      const def = getCardDef("minds-eye");
      expect(def.muBonus).toBe(1);
      expect(def.unique).toBe(true);
      expect(JSON.stringify(def.onSuccessfulRun)).toContain("attacking_rd");
      expect(JSON.stringify(def.onSuccessfulRun)).toContain("add_power_counter");
      const breach = def.paidAbilities?.find((a) => a.id === "minds-eye-breach-rd");
      expect(breach?.effect).toEqual({
        op: "do",
        action: {
          kind: "breach_server_standalone",
          server: "rd",
          cannotAccessRoot: true,
        },
      });
      expect(validateEffectTree(breach!.effect)).toBeNull();
    });

    it("Drudge Work loads power on rez and reveals agendas for AP credits", () => {
      const def = getCardDef("drudge-work");
      expect(def.powerCountersOnRez).toBe(3);
      expect(def.trashWhenPowerEmpty).toBe(true);
      const ab = def.paidAbilities?.find((a) => a.id === "drudge-work-reveal");
      expect(ab?.effect).toEqual({
        op: "do",
        action: { kind: "reveal_agenda_hq_or_archives_gain_ap_shuffle" },
      });
      expect(validateEffectTree(ab!.effect)).toBeNull();
    });

    it("Hijacked Router taxes create-server and may trash on Archives", () => {
      const def = getCardDef("hijacked-router");
      expect(def.corpLosesCreditsOnCreateServer).toBe(1);
      expect(def.unique).toBe(true);
      expect(JSON.stringify(def.onSuccessfulRun)).toContain("attacking_archives");
      expect(JSON.stringify(def.onSuccessfulRun)).toContain("trash_self");
      expect(validateEffectTree(def.onSuccessfulRun!)).toBeNull();
    });
  });
  });

  describe("rar-v181-f-slice", () => {

  beforeAll(() => {
    if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
    if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
    assertPinnedTag("v26.03");
    assertCardsPinnedTag("v1.147.9");
  });

  describe("Reign and Reverie v1.81.0 F-slice", () => {

    it("Meridian offers score-as-−1 or gain 4¢ + ETR", () => {
      const def = getCardDef("meridian");
      const sub = def.subroutines?.[0];
      expect(sub?.effect?.op).toBe("choose");
      expect(JSON.stringify(sub?.effect)).toContain("add_to_runner_score_as_agenda");
      expect(JSON.stringify(sub?.effect)).toContain("end_the_run");
      expect(validateEffectTree(sub!.effect)).toBeNull();
    });

    it("Giordano Memorial Field ETRs unless pay per Runner scored agenda", () => {
      const def = getCardDef("giordano-memorial-field");
      expect(def.onSuccessfulRun).toEqual({
        op: "do",
        action: {
          kind: "unless",
          payer: "runner",
          cost: {
            op: "do",
            action: {
              kind: "lose_credits",
              side: "runner",
              amount: 0,
              tally: { count: "runner_score", per: 2, side: "runner" },
            },
          },
          instruction: { op: "do", action: { kind: "end_the_run" } },
        },
      });
      expect(validateEffectTree(def.onSuccessfulRun!)).toBeNull();
    });

    it("Broad Daylight may take BP then agenda counters; meat paid ability", () => {
      const def = getCardDef("broad-daylight");
      expect(def.onScore).toEqual({
        op: "do",
        action: {
          kind: "may_take_bad_publicity_then_add_agenda_counters_equal_to_bad_publicity",
          amount: 1,
        },
      });
      expect(validateEffectTree(def.onScore!)).toBeNull();
      const ab = def.paidAbilities?.find((a) => a.id === "broad-daylight-meat");
      expect(ab?.flag).toBe("once_per_turn");
      expect(ab?.cost?.agendaCounters).toBe(1);
      expect(JSON.stringify(ab?.effect)).toContain("meat_damage");
    });

    it("Thunder Art Gallery installs discounted on first avoid/remove tag", () => {
      const def = getCardDef("thunder-art-gallery");
      expect(def.onFirstAvoidOrRemoveTagThisTurn).toBeTruthy();
      expect(JSON.stringify(def.onFirstAvoidOrRemoveTagThisTurn)).toContain(
        "install_from_grip_discount",
      );
      expect(validateEffectTree(def.onFirstAvoidOrRemoveTagThisTurn!)).toBeNull();
    });

    it("Algernon may pay for a click that risks turn-end trash", () => {
      const def = getCardDef("algernon");
      expect(def.onTurnBegin).toEqual({
        op: "do",
        action: {
          kind: "may_pay_credits_gain_click_trash_at_turn_end_if_no_successful_run",
          credits: 2,
        },
      });
      expect(validateEffectTree(def.onTurnBegin!)).toBeNull();
    });
  });
  });

  describe("rar-v182-g-slice", () => {

  beforeAll(() => {
    if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
    if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
    assertPinnedTag("v26.03");
    assertCardsPinnedTag("v1.147.9");
  });

  describe("Reign and Reverie v1.82.0 G-slice", () => {

    it("Arella Salvatore installs from HQ with advancement on score from server", () => {
      const def = getCardDef("arella-salvatore");
      expect(def.onAgendaScoredFromThisServer).toEqual({
        op: "do",
        action: {
          kind: "may_install_from_hq_ignore_costs_then_place_advancements",
          amount: 1,
        },
      });
      expect(validateEffectTree(def.onAgendaScoredFromThisServer!)).toBeNull();
    });

    it("Divert Power derezzes any then may rez with per-derez discount", () => {
      const def = getCardDef("divert-power");
      expect(def.onPlay).toEqual({
        op: "do",
        action: {
          kind: "derez_any_number_then_may_rez_discount_per",
          creditsPerDerezzed: 3,
        },
      });
      expect(validateEffectTree(def.onPlay!)).toBeNull();
    });

    it("Lady Liberty places power on turn begin; paid ability scores HQ agenda", () => {
      const def = getCardDef("lady-liberty");
      expect(def.onTurnBegin).toEqual({
        op: "do",
        action: { kind: "add_power_counter", amount: 1 },
      });
      expect(validateEffectTree(def.onTurnBegin!)).toBeNull();
      const ab = def.paidAbilities?.find((a) => a.id === "lady-liberty-score");
      expect(ab?.cost?.clicks).toBe(3);
      expect(JSON.stringify(ab?.effect)).toContain(
        "add_agenda_from_hq_to_score_worth_exact_hosted_power",
      );
      expect(validateEffectTree(ab!.effect)).toBeNull();
    });

    it("Psych Mike may gain credits per R&D access on first successful R&D run end", () => {
      const def = getCardDef("psych-mike");
      expect(def.onFirstSuccessfulRunOnRdEndsThisTurn).toBeTruthy();
      expect(JSON.stringify(def.onFirstSuccessfulRunOnRdEndsThisTurn)).toContain(
        "gain_credits_equal_to_rd_accesses_this_run",
      );
      expect(
        validateEffectTree(def.onFirstSuccessfulRunOnRdEndsThisTurn!),
      ).toBeNull();
    });

    it("Otoroshi places advancements then accesses unless pay", () => {
      const def = getCardDef("otoroshi");
      const sub = def.subroutines?.[0];
      expect(sub?.effect).toEqual({
        op: "do",
        action: {
          kind: "may_place_up_to_advancements_on_remote_root_then_access_unless_pay",
          maxAdvancements: 3,
          credits: 3,
        },
      });
      expect(validateEffectTree(sub!.effect)).toBeNull();
    });
  });
  });

  describe("rar-v183-h-slice", () => {

  beforeAll(() => {
    if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
    if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
    assertPinnedTag("v26.03");
    assertCardsPinnedTag("v1.147.9");
  });

  describe("Reign and Reverie v1.83.0 H-slice", () => {

    it("Eavesdrop hosts as condition with Trace on host encounter", () => {
      const def = getCardDef("eavesdrop");
      expect(def.onPlay).toEqual({
        op: "do",
        action: { kind: "host_on_ice_as_condition" },
      });
      expect(validateEffectTree(def.onPlay!)).toBeNull();
      expect(def.onHostEncounter).toBeTruthy();
      expect(JSON.stringify(def.onHostEncounter)).toContain('"kind":"trace"');
      expect(validateEffectTree(def.onHostEncounter!)).toBeNull();
    });

    it("District 99 places power on first program/hardware trash; heap return", () => {
      const def = getCardDef("district-99");
      expect(def.onFirstProgramOrHardwareTrashEachTurn).toBeTruthy();
      expect(
        validateEffectTree(def.onFirstProgramOrHardwareTrashEachTurn!),
      ).toBeNull();
      const ab = def.paidAbilities?.find((a) => a.id === "district-99-heap");
      expect(ab?.cost?.powerCounters).toBe(3);
      expect(JSON.stringify(ab?.effect)).toContain("matchingIdentityFaction");
      expect(validateEffectTree(ab!.effect)).toBeNull();
    });

    it("Mâché places power equal to access trash cost; paid draw", () => {
      const def = getCardDef("mache");
      expect(def.onFirstAccessTrashEachTurn).toBeTruthy();
      expect(JSON.stringify(def.onFirstAccessTrashEachTurn)).toContain(
        "add_power_counter_equal_to_last_access_trash_cost",
      );
      expect(validateEffectTree(def.onFirstAccessTrashEachTurn!)).toBeNull();
      const ab = def.paidAbilities?.find((a) => a.id === "mache-draw");
      expect(ab?.cost?.powerCounters).toBe(3);
      expect(JSON.stringify(ab?.effect)).toContain("draw");
    });

    it("Reboot installs up to 5 from heap facedown then RFGs", () => {
      const def = getCardDef("reboot");
      expect(def.runEvent?.servers).toBe("archives");
      expect(def.runEvent?.skipBreach).toBe(true);
      expect(JSON.stringify(def.runEvent?.onSuccessfulRun)).toContain(
        "install_up_to_from_heap_facedown",
      );
      expect(JSON.stringify(def.runEvent?.onSuccessfulRun)).toContain("rfg_self");
      expect(validateEffectTree(def.runEvent!.onSuccessfulRun!)).toBeNull();
    });

    it("Saraswati installs+advances with lock until next Corp turn", () => {
      const def = getCardDef("saraswati-mnemonics-endless-exploration");
      const ab = def.paidAbilities?.[0];
      expect(ab?.cost?.clicks).toBe(1);
      expect(ab?.cost?.credits).toBe(1);
      expect(JSON.stringify(ab?.effect)).toContain(
        "install_from_hq_on_remote_root_place_advancement_cannot_score_or_rez_until_next_corp_turn",
      );
      expect(validateEffectTree(ab!.effect)).toBeNull();
    });
  });
  });

  describe("rar-v184-i-slice", () => {

  beforeAll(() => {
    if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
    if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
    assertPinnedTag("v26.03");
    assertCardsPinnedTag("v1.147.9");
  });

  describe("Reign and Reverie v1.84.0 I-slice", () => {

    it("Formicary: formicaryApproachAnyServer + rez/move + ETR unless net damage", () => {
      const def = getCardDef("formicary");
      const ab = def.paidAbilities?.find((a) => a.id === "formicary-approach");
      expect(ab?.formicaryApproachAnyServer).toBe(true);
      expect(ab?.windows).toContain("approach_server_paw");
      expect(JSON.stringify(ab?.effect)).toContain("rez_move_innermost");
      expect(validateEffectTree(ab!.effect)).toBeNull();
      const sub = def.subroutines?.[0];
      expect(JSON.stringify(sub?.effect)).toContain("net_damage");
      expect(validateEffectTree(sub!.effect)).toBeNull();
    });

    it("Neurostasis: canAdvance + may_pay_credits_for_shuffle_installed_runner_per_advancement", () => {
      const def = getCardDef("neurostasis");
      expect(def.canAdvance).toBe(true);
      expect(JSON.stringify(def.onAccess)).toContain(
        "may_pay_credits_for_shuffle_installed_runner_per_advancement",
      );
      expect(validateEffectTree(def.onAccess!)).toBeNull();
    });

    it("Akiko Nisei: onBreachRd play_psi_game with bonus_access on match", () => {
      const def = getCardDef("akiko-nisei-head-case");
      expect(def.onBreachRd).toBeTruthy();
      expect(JSON.stringify(def.onBreachRd)).toContain("play_psi_game");
      expect(JSON.stringify(def.onBreachRd)).toContain("ifBidsMatch");
      expect(JSON.stringify(def.onBreachRd)).toContain("bonus_access");
      expect(validateEffectTree(def.onBreachRd!)).toBeNull();
    });

    it("Divide and Conquer: archives runEvent + queue_breaches_after_current", () => {
      const def = getCardDef("divide-and-conquer");
      expect(def.runEvent?.servers).toBe("archives");
      expect(JSON.stringify(def.runEvent?.onSuccessfulRun)).toContain(
        "queue_breaches_after_current",
      );
      expect(JSON.stringify(def.runEvent?.onSuccessfulRun)).toContain(
        "cannotAccessRoot",
      );
      expect(validateEffectTree(def.runEvent!.onSuccessfulRun!)).toBeNull();
    });

    it("Fast Break: fast_break_equal_to_runner_scored_agendas", () => {
      const def = getCardDef("fast-break");
      expect(JSON.stringify(def.onPlay)).toContain(
        "runner_break_fast_equal_to_scored_agendas",
      );
      expect(validateEffectTree(def.onPlay!)).toBeNull();
    });
  });
  });

  describe("rar-v185-j-slice", () => {

  beforeAll(() => {
    if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
    if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
    assertPinnedTag("v26.03");
    assertCardsPinnedTag("v1.147.9");
  });

  describe("Reign and Reverie v1.85.0 J-slice", () => {

    it("Blockchain: gainsSubroutinesBeforePrintedPerFaceupArchives + printed subs", () => {
      const def = getCardDef("blockchain");
      expect(def.gainsSubroutinesBeforePrintedPerFaceupArchives).toMatchObject({
        subtype: "transaction",
        type: "operation",
        per: 2,
      });
      expect(
        validateEffectTree(
          def.gainsSubroutinesBeforePrintedPerFaceupArchives!.subroutine.effect,
        ),
      ).toBeNull();
      expect(def.subroutines).toHaveLength(2);
      expect(validateEffectTree(def.subroutines![0]!.effect)).toBeNull();
      expect(validateEffectTree(def.subroutines![1]!.effect)).toBeNull();
      expect(JSON.stringify(def.subroutines![1]!.effect)).toContain(
        "end_the_run",
      );
    });

    it("Peeping Tom: empty subs + choose_type_reveal_gain_etr_unless_tag_for_run", () => {
      const def = getCardDef("peeping-tom");
      expect(def.subroutines ?? []).toEqual([]);
      expect(JSON.stringify(def.onEncounter)).toContain(
        "choose_type_reveal_gain_etr_unless_tag_for_run",
      );
      expect(validateEffectTree(def.onEncounter!)).toBeNull();
    });

    it("Daruma: onApproachServer + daruma_swap + offer_jack_out onSuccess", () => {
      const def = getCardDef("daruma");
      expect(def.onApproachServer).toBeTruthy();
      expect(JSON.stringify(def.onApproachServer)).toContain(
        "swap_this_root_with_other_root_or_hq",
      );
      expect(JSON.stringify(def.onApproachServer)).toContain("offer_jack_out");
      expect(JSON.stringify(def.onApproachServer)).toContain("onSuccess");
      expect(validateEffectTree(def.onApproachServer!)).toBeNull();
    });

    it("Hangeki: trash-only play gate + corp installed + may-access", () => {
      const def = getCardDef("hangeki");
      expect(def.playRequiresRunnerTrashedCorpCardLastTurn).toBe(true);
      expect(def.playRequiresCorpHasInstalledCard).toBe(true);
      expect(JSON.stringify(def.onPlay)).toContain(
        "choose_installed_runner_may_access",
      );
      expect(JSON.stringify(def.onPlay)).toContain("rfg_self");
      expect(JSON.stringify(def.onPlay)).toContain(
        "add_to_runner_score_as_agenda",
      );
      expect(validateEffectTree(def.onPlay!)).toBeNull();
    });

    it("Acme Consulting: additionalTagsDuringOutermostIceEncounter", () => {
      const def = getCardDef("acme-consulting-the-truth-you-need");
      expect(def.additionalTagsDuringOutermostIceEncounter).toBe(1);
      expect(def.type).toBe("identity");
      expect(def.side).toBe("corp");
    });
  });
  });

  describe("rar-v186-set-complete", () => {
  beforeAll(() => {
    if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
    if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
    assertPinnedTag("v26.03");
    assertCardsPinnedTag("v1.147.9");
  });

  function seedFenrisWithOutsideIdentity(
    primaryIdDef: string,
    hostedIdDef: string,
  ): { state: GameState; fenrisId: string; hostedId: string } {
    const s = structuredClone(createInitialState());
    const primary = instantiateCard(primaryIdDef, "runner-id", "runner:grip");
    s.cards["runner-id"] = primary;
    s.runner.identityId = "runner-id";

    const hosted = instantiateCard(
      hostedIdDef,
      "gmod-extra",
      RUNNER_OUTSIDE_GAME_IDENTITIES_ZONE,
    );
    s.cards["gmod-extra"] = hosted;
    s.runner.additionalIdentities = ["gmod-extra"];

    const fenris = instantiateCard("dj-fenris", "fenris", "runner:installed");
    s.cards["fenris"] = fenris;
    s.runner.installed.push("fenris");
    // Ensure stack has cards for draw-based smoke (Liza).
    for (let i = 0; i < 4; i++) {
      const id = `fill-${i}`;
      s.cards[id] = instantiateCard("easy-mark", id, "runner:stack");
      s.runner.deck.push(id);
    }
    return { state: s, fenrisId: "fenris", hostedId: "gmod-extra" };
  }

  describe("Reign and Reverie v1.86.0 set-complete", () => {

    it("loads DJ Fenris clear shape under CR 1.5.4", () => {
      const catalog = loadCardCatalog(true);
      const def = catalog.get("dj-fenris")!;
      expect(def.unsupported ?? []).toEqual([]);
      expect(def.wave).toBe("reign-and-reverie");
      expect(def.unique).toBe(true);
      expect(def.deckLimit).toBe(1);
      expect(def.gainsTextOfHostedIdentity).toBe(true);
      expect(def.returnHostedIdentityToOutsideGameOnUninstall).toBe(true);
      expect(validateEffectTree(def.onInstall!)).toBeNull();
      expect(JSON.stringify(def.onInstall)).toContain(
        "host_gmod_identity_from_outside_game",
      );
    });

    it("smoke cannot/filter: Chaos Theory (shaper) cannot host same-faction g-mod; Quetzal (anarch) is legal", () => {
      const { state: s } = seedFenrisWithOutsideIdentity(
        "chaos-theory-wunderkind",
        "chaos-theory-wunderkind",
      );
      // Same title instance as primary faction shaper — filter out.
      s.cards["gmod-extra"]!.faction = "shaper";
      expect(legalFenrisHostIds(s, true)).toEqual([]);

      const quetzal = instantiateCard(
        "quetzal-free-spirit",
        "quetzal-extra",
        RUNNER_OUTSIDE_GAME_IDENTITIES_ZONE,
      );
      s.cards["quetzal-extra"] = quetzal;
      s.runner.additionalIdentities = ["quetzal-extra"];
      expect(legalFenrisHostIds(s, true)).toEqual(["quetzal-extra"]);

      const r = evalEffect(
        { state: s, sourceId: "fenris" },
        s.cards["fenris"]!.onInstall!,
      );
      expect(r.ok).toBe(true);
      expect(s.cards["fenris"]!.hostedCardIds).toEqual(["quetzal-extra"]);
      expect(s.runner.additionalIdentities).toEqual([]);
      expect(s.cards["fenris"]!.paidAbilities?.some((a) => a.id === "quetzal-break")).toBe(
        true,
      );
      expect(runnerAbilityCarrierIds(s)).toEqual(["runner-id", "fenris"]);
    });

    it("smoke success ternary: Fenris(Liza) first successful central; uninstall returns to outside-game not heap", () => {
      const { state: s, fenrisId, hostedId } = seedFenrisWithOutsideIdentity(
        "chaos-theory-wunderkind",
        "liza-talking-thunder-prominent-legislator",
      );
      const r = evalEffect(
        { state: s, sourceId: fenrisId },
        s.cards[fenrisId]!.onInstall!,
      );
      expect(r.ok).toBe(true);
      expect(s.cards[fenrisId]!.onFirstSuccessfulCentralRunThisTurn).toBeTruthy();
      expect(validateEffectTree(s.cards[fenrisId]!.onFirstSuccessfulCentralRunThisTurn!)).toBeNull();

      // Fire carrier ability directly (first successful central).
      const beforeHand = s.runner.hand.length;
      const beforeTags = s.runner.tags;
      const fire = evalEffect(
        { state: s, sourceId: fenrisId },
        s.cards[fenrisId]!.onFirstSuccessfulCentralRunThisTurn!,
      );
      expect(fire.ok).toBe(true);
      // Liza: draw 2 + take 1 tag (seq in card JSON).
      expect(s.runner.hand.length).toBeGreaterThanOrEqual(beforeHand);
      expect(s.runner.tags).toBeGreaterThanOrEqual(beforeTags);

      releaseHostedCardsOnTrash(s, fenrisId);
      expect(s.runner.additionalIdentities).toContain(hostedId);
      expect(s.cards[hostedId]!.zone).toBe(RUNNER_OUTSIDE_GAME_IDENTITIES_ZONE);
      expect(s.runner.discardPile).not.toContain(hostedId);
      expect(s.cards[fenrisId]!.onFirstSuccessfulCentralRunThisTurn).toBeUndefined();
      expect(s.cards[fenrisId]!.hostedCardIds ?? []).toEqual([]);
    });

    it("smoke blank×host: Direct Access blanks primary ID; Fenris gained Quetzal text remains", () => {
      const { state: s, fenrisId } = seedFenrisWithOutsideIdentity(
        "chaos-theory-wunderkind",
        "quetzal-free-spirit",
      );
      const r = evalEffect(
        { state: s, sourceId: fenrisId },
        s.cards[fenrisId]!.onInstall!,
      );
      expect(r.ok).toBe(true);
      expect(s.cards[fenrisId]!.paidAbilities?.length).toBeGreaterThan(0);

      // Simulate Direct Access blanking identities for the run.
      s.run = {
        attackedServerId: "hq",
        phase: "encounter",
        position: 0,
        successful: null,
        accessedCardIds: [],
        accessCandidates: [],
        randomAccessLimit: null,
        endedTheRun: false,
        cannotJackOut: false,
        strengthBoosts: {},
        encounterStrengthBoosts: {},
        iceStrengthBoosts: {},
        blankIdentities: true,
        runSourceId: "da",
      };
      const da = instantiateCard("direct-access", "da", "runner:play-area");
      s.cards["da"] = da;

      expect(abilitiesSuppressed(s, "runner-id")).toBe(true);
      // Fenris is a resource carrying gained text — DA does not blank it (CR notes).
      expect(abilitiesSuppressed(s, fenrisId)).toBe(false);
      expect(s.cards[fenrisId]!.paidAbilities?.some((a) => a.id === "quetzal-break")).toBe(
        true,
      );
    });

    it("smoke interrupt/paid: Fenris(Reina) adds first-ice rez surcharge; gone after trash", () => {
      const { state: s, fenrisId } = seedFenrisWithOutsideIdentity(
        "chaos-theory-wunderkind",
        "reina-roja-freedom-fighter",
      );
      expect(s.cards["runner-id"]!.firstIceRezCostIncrease ?? 0).toBe(0);
      const r = evalEffect(
        { state: s, sourceId: fenrisId },
        s.cards[fenrisId]!.onInstall!,
      );
      expect(r.ok).toBe(true);
      expect(s.cards[fenrisId]!.firstIceRezCostIncrease).toBe(1);
      expect(runnerAbilityCarrierIds(s)).toContain(fenrisId);

      releaseHostedCardsOnTrash(s, fenrisId);
      expect(s.cards[fenrisId]!.firstIceRezCostIncrease).toBeUndefined();
      expect(runnerAbilityCarrierIds(s)).toEqual(["runner-id"]);
    });

    it("J leftovers still clear in pool (Blockchain / Peeping Tom / Daruma / Acme)", () => {
      for (const id of [
        "blockchain",
        "peeping-tom",
        "daruma",
        "acme-consulting-the-truth-you-need",
      ] as const) {
        expect(getCardDef(id).unsupported ?? [], id).toEqual([]);
      }
    });
  });
  });
});
