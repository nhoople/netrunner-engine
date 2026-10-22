/**
 * vantage-point play tests.
 */
import { describe, expect, it, beforeAll } from "vitest";
import {
  assertCardsPinnedTag,
  assertPinnedTag,
  cardsDataPresent,
  crDataPresent,
  fx,
  getCardDef,
  validateEffectTree,
} from "../src/index.js";

describe("vantage-point", () => {
  describe("vp-v113-kickoff", () => {

  beforeAll(() => {
    if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
    if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
    assertPinnedTag("v26.03");
    assertCardsPinnedTag("v1.147.11");
  });

  describe("Vantage Point v1.13.0 kickoff", () => {

    it("Flywheel has two gain+may-draw subroutines", () => {
      const def = getCardDef("flywheel");
      expect(def.subroutines).toHaveLength(2);
      for (const sub of def.subroutines ?? []) {
        expect(validateEffectTree(sub.effect)).toBeNull();
        expect(JSON.stringify(sub.effect)).toContain("gain_credits");
      }
    });

    it("Vulture Fund gains 14¢ and takes 1 bad publicity", () => {
      const def = getCardDef("vulture-fund");
      expect(def.onPlay).toEqual(
        fx.seq(
          fx.gainCredits("corp", 14),
          fx.do({ kind: "give_bad_publicity", amount: 1 }),
        ),
      );
      expect(validateEffectTree(def.onPlay!)).toBeNull();
    });

    it("Paywall onEncounter drains 1¢ and offers ETR-unless-pay", () => {
      const def = getCardDef("paywall");
      expect(validateEffectTree(def.onEncounter!)).toBeNull();
      expect(def.subroutines).toHaveLength(1);
      expect(validateEffectTree(def.subroutines![0]!.effect)).toBeNull();
    });

    it("Borrowed Goods is +1 MU and may tag on install", () => {
      const def = getCardDef("borrowed-goods");
      expect(def.muBonus).toBe(1);
      expect(validateEffectTree(def.onInstall!)).toBeNull();
    });
  });
  });

  describe("vp-v114-b-slice", () => {

  beforeAll(() => {
    if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
    if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
    assertPinnedTag("v26.03");
    assertCardsPinnedTag("v1.147.11");
  });

  describe("Vantage Point v1.14.0 B-slice", () => {

    it("Vic is once/turn click+1¢ draw and remove tag", () => {
      const def = getCardDef("virtual-intelligence-p-i-you-can-call-me-vic");
      expect(def.paidAbilities).toHaveLength(1);
      const ab = def.paidAbilities![0]!;
      expect(ab.flag).toBe("once_per_turn");
      expect(ab.clickCost).toBe(1);
      expect(ab.creditCost).toBe(1);
      expect(validateEffectTree(ab.effect)).toBeNull();
      expect(JSON.stringify(ab.effect)).toContain("remove_tags");
    });

    it("Lionsmane has three net-damage subroutines", () => {
      const def = getCardDef("lionsmane");
      expect(def.subroutines).toHaveLength(3);
      for (const sub of def.subroutines ?? []) {
        expect(validateEffectTree(sub.effect)).toBeNull();
      }
    });

    it("Esca must-reveal from R&D and onAccess lose¢ / tagged net", () => {
      const def = getCardDef("esca");
      expect(def.mustRevealWhenAccessedFromRd).toBe(true);
      expect(validateEffectTree(def.onAccess!)).toBeNull();
      expect(JSON.stringify(def.onAccess)).toContain("lose_credits");
    });

    it("Sleipnir may-draw / may-shuffle / ETR", () => {
      const def = getCardDef("sleipnir");
      expect(def.subroutines).toHaveLength(3);
      for (const sub of def.subroutines ?? []) {
        expect(validateEffectTree(sub.effect)).toBeNull();
      }
      expect(JSON.stringify(def.subroutines![2]!.effect)).toContain(
        "end_the_run",
      );
    });
  });
  });

  describe("vp-v115-b-slice", () => {

  beforeAll(() => {
    if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
    if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
    assertPinnedTag("v26.03");
    assertCardsPinnedTag("v1.147.11");
  });

  describe("Vantage Point v1.15.0 B-slice", () => {

    it("Caveat Emptor offers allotted-click choose", () => {
      const def = getCardDef("caveat-emptor");
      expect(validateEffectTree(def.onPlay!)).toBeNull();
      expect(JSON.stringify(def.onPlay)).toContain("allotted_clicks_next_turn");
    });

    it("Grubber onRez BP if protecting_central + dual ETR-unless-pay", () => {
      const def = getCardDef("grubber");
      expect(JSON.stringify(def.onRez)).toContain("protecting_central");
      expect(validateEffectTree(def.onRez!)).toBeNull();
      expect(def.subroutines).toHaveLength(2);
      for (const sub of def.subroutines ?? []) {
        expect(validateEffectTree(sub.effect)).toBeNull();
      }
    });

    it("Reverb discounts per other unrezzed ice + dual ETR", () => {
      const def = getCardDef("reverb");
      expect(def.rezCostDiscountPerOtherUnrezzedIce).toBe(1);
      expect(def.subroutines).toHaveLength(2);
      for (const sub of def.subroutines ?? []) {
        expect(validateEffectTree(sub.effect)).toBeNull();
      }
    });

    it("Vertigo onPass forbids steal/trash when no clicks", () => {
      const def = getCardDef("vertigo");
      expect(JSON.stringify(def.onPass)).toContain("forbid_steal_trash_this_run");
      expect(JSON.stringify(def.onPass)).toContain('"op":"not"');
      expect(validateEffectTree(def.onPass!)).toBeNull();
      expect(def.subroutines).toHaveLength(1);
      expect(validateEffectTree(def.subroutines![0]!.effect)).toBeNull();
    });
  });
  });

  describe("vp-v116-b-slice", () => {

  beforeAll(() => {
    if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
    if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
    assertPinnedTag("v26.03");
    assertCardsPinnedTag("v1.147.11");
  });

  describe("Vantage Point v1.17.0 B-slice", () => {

    it("Take a Dive is hq_rd run with subroutine BP and RFG on run end", () => {
      const def = getCardDef("take-a-dive");
      expect(def.runEvent?.servers).toBe("hq_rd");
      expect(validateEffectTree(def.runEvent!.onSuccessfulRun!)).toBeNull();
      expect(JSON.stringify(def.runEvent!.onSuccessfulRun)).toContain(
        "subroutine_resolved_this_run",
      );
      expect(JSON.stringify(def.runEvent!.onSuccessfulRun)).toContain(
        "give_bad_publicity",
      );
      expect(validateEffectTree(def.runEvent!.onRunEnd!)).toBeNull();
      expect(JSON.stringify(def.runEvent!.onRunEnd)).toContain("rfg_self");
    });

    it("Event Horizon has trashSelf ETR paid ability and two unless-pay subs", () => {
      const def = getCardDef("event-horizon");
      expect(def.paidAbilities).toHaveLength(1);
      expect(def.paidAbilities![0]!.cost?.trashSelf).toBe(true);
      expect(def.paidAbilities![0]!.requireDuringRun).toBe(true);
      expect(validateEffectTree(def.paidAbilities![0]!.effect)).toBeNull();
      expect(def.subroutines).toHaveLength(2);
      for (const sub of def.subroutines ?? []) {
        expect(validateEffectTree(sub.effect)).toBeNull();
      }
    });

    it("Vicsek does X net+tags equal to Runner tags then tag+trash_self", () => {
      const def = getCardDef("vicsek");
      expect(def.subroutines).toHaveLength(2);
      expect(JSON.stringify(def.subroutines![0]!.effect)).toContain(
        "runner_tags",
      );
      expect(validateEffectTree(def.subroutines![0]!.effect)).toBeNull();
      expect(validateEffectTree(def.subroutines![1]!.effect)).toBeNull();
      expect(JSON.stringify(def.subroutines![1]!.effect)).toContain("trash_self");
    });
  });
  });

  describe("vp-v117-b-slice", () => {

  beforeAll(() => {
    if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
    if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
    assertPinnedTag("v26.03");
    assertCardsPinnedTag("v1.147.11");
  });

  describe("Vantage Point v1.17.0 B-slice", () => {

    it("Sell Out trashes own resource then gains 4¢ and draws 2", () => {
      const def = getCardDef("sell-out");
      expect(def.playRequiresInstalledResource).toBe(true);
      expect(validateEffectTree(def.playAdditionalCost!)).toBeNull();
      expect(JSON.stringify(def.playAdditionalCost)).toContain("trash_own_resource");
      expect(validateEffectTree(def.onPlay!)).toBeNull();
      expect(JSON.stringify(def.onPlay)).toContain("gain_credits");
      expect(JSON.stringify(def.onPlay)).toContain('"amount":2');
    });

    it("Underdome Irregulars gates on ice_rezzed_this_turn", () => {
      const def = getCardDef("underdome-irregulars");
      expect(validateEffectTree(def.onRunnerActionPhaseEnd!)).toBeNull();
      expect(JSON.stringify(def.onRunnerActionPhaseEnd)).toContain(
        "ice_rezzed_this_turn",
      );
      expect(JSON.stringify(def.onRunnerActionPhaseEnd)).toContain("trash_self");
      expect(JSON.stringify(def.onRunnerActionPhaseEnd)).toContain("remove_tags");
    });

    it("Unleash removes a tag then rez-may-resolve", () => {
      const def = getCardDef("unleash");
      expect(def.playRequiresTagged).toBe(true);
      expect(validateEffectTree(def.playAdditionalCost!)).toBeNull();
      expect(JSON.stringify(def.playAdditionalCost)).toContain("remove_tags");
      expect(validateEffectTree(def.onPlay!)).toBeNull();
      expect(JSON.stringify(def.onPlay)).toContain("rez_may_resolve_sub");
    });
  });
  });

  describe("vp-v118-b-slice", () => {

  beforeAll(() => {
    if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
    if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
    assertPinnedTag("v26.03");
    assertCardsPinnedTag("v1.147.11");
  });

  describe("Vantage Point v1.18.0 B-slice", () => {

    it("Witch Hunt takes BP on score/steal and tags on action-phase end", () => {
      const def = getCardDef("witch-hunt");
      expect(def.badPublicityOnScore).toBe(1);
      expect(validateEffectTree(def.onSteal!)).toBeNull();
      expect(JSON.stringify(def.onSteal)).toContain("give_bad_publicity");
      expect(validateEffectTree(def.onCorpActionPhaseEnd!)).toBeNull();
      expect(JSON.stringify(def.onCorpActionPhaseEnd)).toContain(
        "self_scored_this_turn",
      );
      expect(JSON.stringify(def.onCorpActionPhaseEnd)).toContain(
        "runner_tags",
      );
      expect(JSON.stringify(def.onCorpActionPhaseEnd)).toContain("give_tags");
    });

    it("Stowaway installs on ice and gains on successful host-server run", () => {
      const def = getCardDef("stowaway");
      expect(def.installOnIce).toBe(true);
      expect(validateEffectTree(def.onSuccessfulRun!)).toBeNull();
      expect(JSON.stringify(def.onSuccessfulRun)).toContain("gain_credits");
      expect(JSON.stringify(def.onSuccessfulRun)).toContain('"amount":2');
    });

    it("Méliès City costs a steal click and gains a click on score", () => {
      const def = getCardDef("melies-city-luxury-line");
      expect(def.stealAdditionalClicks).toBe(1);
      expect(validateEffectTree(def.onScore!)).toBeNull();
      expect(JSON.stringify(def.onScore)).toContain("gain_clicks");
    });
  });
  });

  describe("vp-v119-b-slice", () => {

  beforeAll(() => {
    if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
    if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
    assertPinnedTag("v26.03");
    assertCardsPinnedTag("v1.147.11");
  });

  describe("Vantage Point v1.19.0 B-slice", () => {

    it("Ansel 2.0 subroutines trash / RFG heap / install / ETR", () => {
      const def = getCardDef("ansel-2-0");
      expect(def.subroutines).toHaveLength(4);
      expect(def.subtypes).toContain("bioroid");
      for (const sub of def.subroutines ?? []) {
        expect(validateEffectTree(sub.effect), sub.id).toBeNull();
      }
      expect(JSON.stringify(def.subroutines)).toContain("rfg_heap_card");
      expect(JSON.stringify(def.subroutines)).toContain(
        "install_from_hq_or_archives",
      );
    });

    it("Kompromat requires iced server and BP-unless-derez on success", () => {
      const def = getCardDef("kompromat");
      expect(def.runEvent?.requiresProtectingIce).toBe(true);
      expect(validateEffectTree(def.runEvent!.onRunEnd!)).toBeNull();
      expect(JSON.stringify(def.runEvent?.onRunEnd)).toContain("run_successful");
      expect(JSON.stringify(def.runEvent?.onRunEnd)).toContain(
        "derez_unless_protecting_attacked",
      );
      expect(JSON.stringify(def.runEvent?.onRunEnd)).toContain("rfg_self");
    });

    it("Retirement Plan is a double that installs from Archives paying", () => {
      const def = getCardDef("retirement-plan");
      expect(def.playAdditionalClick).toBe(true);
      expect(validateEffectTree(def.onPlay!)).toBeNull();
      expect(JSON.stringify(def.onPlay)).toContain("install_from_archives");
    });
  });
  });

  describe("vp-v120-b-slice", () => {

  beforeAll(() => {
    if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
    if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
    assertPinnedTag("v26.03");
    assertCardsPinnedTag("v1.147.11");
  });

  describe("Vantage Point v1.20.0 B-slice", () => {

    it("ezaM swaps ice, looks top R&D, and fortifies", () => {
      const def = getCardDef("ezam");
      expect(def.paidAbilities?.[0]?.cost).toEqual({ clicks: 1 });
      expect(validateEffectTree(def.paidAbilities![0]!.effect)).toBeNull();
      expect(JSON.stringify(def.paidAbilities)).toContain(
        "swap_source_ice_with_other",
      );
      expect(def.subroutines).toHaveLength(2);
      for (const sub of def.subroutines ?? []) {
        expect(validateEffectTree(sub.effect), sub.id).toBeNull();
      }
      expect(JSON.stringify(def.subroutines)).toContain("look_top_rd_may_bottom");
      expect(JSON.stringify(def.subroutines)).toContain("fortify_all_ice");
    });

    it("Magistrate taxes steals and drains on score", () => {
      const def = getCardDef("magistrate-revontulet");
      expect(def.stealAdditionalCreditsWhileRezzed).toBe(3);
      expect(validateEffectTree(def.onAgendaScored!)).toBeNull();
      expect(JSON.stringify(def.onAgendaScored)).toContain("lose_credits");
    });

    it("Scapegoat offers remove BP or shuffle installed", () => {
      const def = getCardDef("scapegoat");
      expect(validateEffectTree(def.onPlay!)).toBeNull();
      expect(JSON.stringify(def.onPlay)).toContain("remove_bad_publicity");
      expect(JSON.stringify(def.onPlay)).toContain(
        "shuffle_installed_runner_into_stack",
      );
    });
  });
  });

  describe("vp-v121-b-slice", () => {

  beforeAll(() => {
    if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
    if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
    assertPinnedTag("v26.03");
    assertCardsPinnedTag("v1.147.11");
  });

  describe("Vantage Point v1.21.0 B-slice", () => {

    it("Tailgate discounts by HQ ice and bonus-accesses HQ", () => {
      const def = getCardDef("tailgate");
      expect(def.playCostDiscountPerIceProtectingServer).toBe("hq");
      expect(def.runEvent?.servers).toBe("hq");
      expect(def.runEvent?.bonusAccess).toBe(2);
    });

    it("Chain Reaction requires all centrals then trashes", () => {
      const def = getCardDef("chain-reaction");
      expect(def.playRequiresSuccessfulAllCentralsThisTurn).toBe(true);
      expect(validateEffectTree(def.onPlay!)).toBeNull();
      expect(JSON.stringify(def.onPlay)).toContain("trash_n_installed_corp");
      expect(JSON.stringify(def.onPlay)).toContain("trash_installed_runner");
    });

    it("realloc() is a double that picks two rezzed ice", () => {
      const def = getCardDef("realloc");
      expect(def.playAdditionalClick).toBe(true);
      expect(validateEffectTree(def.onPlay!)).toBeNull();
      expect(JSON.stringify(def.onPlay)).toContain("realloc_two_rezzed_ice");
    });
  });
  });

  describe("vp-v122-b-slice", () => {

  beforeAll(() => {
    if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
    if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
    assertPinnedTag("v26.03");
    assertCardsPinnedTag("v1.147.11");
  });

  describe("Vantage Point v1.22.0 B-slice", () => {

    it("Myōshu gates on scored-not-installed agenda and scores self", () => {
      const def = getCardDef("myoshu");
      expect(def.playRequiresScoredAgendaNotInstalledThisTurn).toBe(true);
      expect(def.agendaPoints).toBe(2);
      expect(validateEffectTree(def.onPlay!)).toBeNull();
      expect(JSON.stringify(def.onPlay)).toContain("score_self_as_agenda");
    });

    it("Flood the Market is a double that advances per iced rooted remote", () => {
      const def = getCardDef("flood-the-market");
      expect(def.playAdditionalClick).toBe(true);
      expect(validateEffectTree(def.onPlay!)).toBeNull();
      expect(JSON.stringify(def.onPlay)).toContain(
        "place_advancements_per_iced_rooted_remote",
      );
    });

    it("Synchrocyclotron discounts the first double each turn", () => {
      const def = getCardDef("synchrocyclotron");
      expect(def.firstDoubleOperationClickDiscount).toBe(1);
    });
  });
  });

  describe("vp-v123-b-slice", () => {

  beforeAll(() => {
    if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
    if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
    assertPinnedTag("v26.03");
    assertCardsPinnedTag("v1.147.11");
  });

  describe("Vantage Point v1.23.0 B-slice", () => {

    it("Knowledge Seeker arranges R&D and purges on encounter end", () => {
      const def = getCardDef("knowledge-seeker");
      expect(def.subroutines?.length).toBe(3);
      expect(JSON.stringify(def.subroutines)).toContain("look_top_n_rd_arrange");
      expect(validateEffectTree(def.onEncounterEnd!)).toBeNull();
      expect(JSON.stringify(def.onEncounterEnd)).toContain("virus_counters_gte");
      expect(JSON.stringify(def.onEncounterEnd)).toContain("purge_virus_counters");
      expect(JSON.stringify(def.onEncounterEnd)).toContain("derez_source");
    });

    it("Lotus Haze scores agenda counters and moves rezzed upgrades", () => {
      const def = getCardDef("lotus-haze");
      expect(JSON.stringify(def.onScore)).toContain("add_agenda_counter");
      expect(def.paidAbilities?.[0]?.cost?.agendaCounters).toBe(1);
      expect(validateEffectTree(def.paidAbilities![0]!.effect)).toBeNull();
      expect(JSON.stringify(def.paidAbilities![0]!.effect)).toContain(
        "may_move_rezzed_upgrade_to_another_server_root",
      );
    });

    it("Hype Machine discounts rez after agenda score/steal", () => {
      const def = getCardDef("hype-machine");
      expect(def.rezCostDiscountIfAgendaScoredOrStolenThisTurn).toBe(6);
      expect(def.paidAbilities?.[0]?.cost?.trashSelf).toBe(true);
      expect(validateEffectTree(def.paidAbilities![0]!.effect)).toBeNull();
    });
  });
  });

  describe("vp-v124-b-slice", () => {

  beforeAll(() => {
    if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
    if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
    assertPinnedTag("v26.03");
    assertCardsPinnedTag("v1.147.11");
  });

  describe("Vantage Point v1.24.0 B-slice", () => {

    it("Lethe tags on bypass/full-break and has Archives/grip subs", () => {
      const def = getCardDef("lethe");
      expect(validateEffectTree(def.onBypass!)).toBeNull();
      expect(JSON.stringify(def.onBypass)).toContain("give_tags");
      expect(validateEffectTree(def.onFullyBreak!)).toBeNull();
      expect(JSON.stringify(def.subroutines)).toContain(
        "may_add_archives_card_to_rd_top_or_bottom",
      );
      expect(JSON.stringify(def.subroutines)).toContain(
        "add_installed_runner_to_grip",
      );
    });

    it("Reanimation Protocol install+rez ice from Archives with discount", () => {
      const def = getCardDef("reanimation-protocol");
      expect(validateEffectTree(def.onPlay!)).toBeNull();
      expect(JSON.stringify(def.onPlay)).toContain(
        "install_and_rez_ice_from_archives",
      );
      expect(JSON.stringify(def.onPlay)).toContain('"totalDiscount":10');
    });

    it("Tungsten Tailor penalizes ice strength and rewards low-str breaks", () => {
      const def = getCardDef("the-tungsten-tailor");
      expect(def.muBonus).toBe(1);
      expect(def.allIceStrengthPenalty).toBe(1);
      expect(def.gainCreditOnBreakIceStrengthLteOncePerTurn).toBe(0);
    });
  });
  });

  describe("vp-v125-b-slice", () => {

  beforeAll(() => {
    if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
    if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
    assertPinnedTag("v26.03");
    assertCardsPinnedTag("v1.147.11");
  });

  describe("Vantage Point v1.25.0 B-slice", () => {

    it("Hiram looks at R&D on hardware install/trash", () => {
      const def = getCardDef("hiram-0mission-svensson-shadow-of-the-past");
      expect(validateEffectTree(def.onHardwareInstallOrTrash!)).toBeNull();
      expect(JSON.stringify(def.onHardwareInstallOrTrash)).toContain(
        "look_top_n_rd_peek",
      );
    });

    it("Red Room is central-only with other-server ETR", () => {
      const def = getCardDef("the-red-room");
      expect(def.installServers).toEqual(["hq", "rd", "archives"]);
      expect(JSON.stringify(def.onFirstAgendaScoredOrStolenThisTurn)).toContain(
        "add_power_counter",
      );
      expect(def.paidAbilities?.[0]?.requireOtherServer).toBe(true);
      expect(validateEffectTree(def.paidAbilities![0]!.effect)).toBeNull();
    });

    it("Nihilo Agent cycles tags/BP with power trash", () => {
      const def = getCardDef("nihilo-agent");
      expect(def.trashWhenPowerEmpty).toBe(true);
      expect(validateEffectTree(def.onRez!)).toBeNull();
      expect(validateEffectTree(def.onTurnBegin!)).toBeNull();
      expect(validateEffectTree(def.onDiscardPhaseEnd!)).toBeNull();
    });
  });
  });

  describe("vp-v126-b-slice", () => {

  beforeAll(() => {
    if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
    if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
    assertPinnedTag("v26.03");
    assertCardsPinnedTag("v1.147.11");
  });

  describe("Vantage Point v1.26.0 B-slice", () => {

    it("Flagship is HQ/R&D-only with Crisium-class + access cap", () => {
      const def = getCardDef("flagship");
      expect(def.installServers).toEqual(["hq", "rd"]);
      expect(def.runsCannotBeSuccessful).toBe(true);
      expect(def.maxAccessOtherThanSelf).toBe(1);
    });

    it("Cultivate looks, trashes one, HQs one, arranges rest", () => {
      const def = getCardDef("cultivate");
      expect(validateEffectTree(def.onPlay!)).toBeNull();
      expect(JSON.stringify(def.onPlay)).toContain(
        "look_top_n_rd_trash_one_hq_one_arrange_rest",
      );
    });

    it("Touchstone hosts credits on first event, spendable during runs", () => {
      const def = getCardDef("touchstone");
      expect(def.hostedCreditsOnFirstEventPlayOncePerTurn).toBe(1);
      expect(def.spendHostedCreditsDuringRuns).toBe(true);
    });
  });
  });

  describe("vp-v127-b-slice", () => {

  beforeAll(() => {
    if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
    if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
    assertPinnedTag("v26.03");
    assertCardsPinnedTag("v1.147.11");
  });

  describe("Vantage Point v1.27.0 B-slice", () => {

    it("Stick and Poke gains a net+draw subroutine on first encounter", () => {
      const def = getCardDef("stick-and-poke");
      expect(def.firstEncounterGainsSubroutine?.text).toContain("net damage");
      expect(validateEffectTree(def.firstEncounterGainsSubroutine!.effect)).toBeNull();
    });

    it("Rotary is a console with tag-for-access and Corp trash", () => {
      const def = getCardDef("rotary");
      expect(def.muBonus).toBe(1);
      expect(def.mayTakeTagForBonusAccessOnHqRdBreach).toBe(1);
      expect(def.paidAbilities?.[0]?.requireRunnerTagged).toBe(true);
      expect(def.paidAbilities?.[0]?.usableByAnyPlayer).toBe(true);
      expect(validateEffectTree(def.paidAbilities![0]!.effect)).toBeNull();
    });

    it("Sipa may swap outermost after full break", () => {
      const def = getCardDef("sipa");
      expect(def.maySwapOutermostIceOnPassAfterFullyBreakOncePerTurn).toBe(true);
    });
  });
  });

  describe("vp-v128-b-slice", () => {

  beforeAll(() => {
    if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
    if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
    assertPinnedTag("v26.03");
    assertCardsPinnedTag("v1.147.11");
  });

  describe("Vantage Point v1.28.0 B-slice", () => {

    it("Sacrifice Zone is faceup with first-advance credits + other-server meat", () => {
      const def = getCardDef("sacrifice-zone-expansion");
      expect(def.installFaceup).toBe(true);
      expect(def.creditsOnFirstAdvanceThisTurn).toBe(3);
      expect(validateEffectTree(def.onSuccessfulRunOtherServerOncePerTurn!)).toBeNull();
    });

    it("Shackleton fires on outside-pool spend during run", () => {
      const def = getCardDef("shackleton-grid");
      expect(validateEffectTree(def.onSpendCreditsOutsidePoolDuringRunOncePerTurn!)).toBeNull();
      expect(JSON.stringify(def.onSpendCreditsOutsidePoolDuringRunOncePerTurn)).toContain("meat_damage");
    });

    it("Tocsin searches R&D from HQ for barrier + sentry", () => {
      const def = getCardDef("tocsin");
      expect(def.paidAbilities?.[0]?.usableFromHq).toBe(true);
      expect(validateEffectTree(def.paidAbilities![0]!.effect)).toBeNull();
      expect(JSON.stringify(def.paidAbilities![0]!.effect)).toContain(
        "search_rd_up_to_one_each_subtype_to_hq",
      );
      expect(def.subroutines?.length).toBe(3);
    });
  });
  });

  describe("vp-v129-b-slice", () => {

  beforeAll(() => {
    if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
    if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
    assertPinnedTag("v26.03");
    assertCardsPinnedTag("v1.147.11");
  });

  describe("Vantage Point v1.29.0 B-slice", () => {

    it("Corsair is a strength-0 fracter with stealth-only weaken", () => {
      const def = getCardDef("corsair");
      expect(def.breaker?.breaksSubtype).toBe("barrier");
      expect(def.breaker?.strength).toBe(0);
      expect(def.breaker?.breakCredits).toBe(1);
      const weaken = def.paidAbilities?.[0];
      expect(weaken?.cost).toMatchObject({
        credits: 1,
        creditsFromStealthOnly: true,
      });
      expect(weaken?.requireEncounterSubtype).toBe("barrier");
      expect(validateEffectTree(weaken!.effect)).toBeNull();
      expect(JSON.stringify(weaken!.effect)).toContain("weaken_ice");
    });

    it("Methuselah is a stealth console with onRunBegin trash-to-host", () => {
      const def = getCardDef("methuselah");
      expect(def.subtypes).toContain("console");
      expect(def.subtypes).toContain("stealth");
      expect(def.muBonus).toBe(1);
      expect(def.spendHostedCreditsDuringRuns).toBe(true);
      expect(validateEffectTree(def.onRunBegin!)).toBeNull();
      expect(JSON.stringify(def.onRunBegin)).toContain(
        "may_trash_hardware_from_grip_place_hosted_credits",
      );
    });

    it("Lampades loads power on install and stealth access-trash", () => {
      const def = getCardDef("lampades");
      expect(def.powerCountersOnInstall).toBe(3);
      expect(def.accessTrashPayingPrintedCostFromStealth).toBe(true);
    });
  });
  });

  describe("vp-v130-b-slice", () => {

  beforeAll(() => {
    if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
    if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
    assertPinnedTag("v26.03");
    assertCardsPinnedTag("v1.147.11");
  });

  describe("Vantage Point v1.30.0 B-slice", () => {

    it("Baker runs Archives with stealth approach redirect", () => {
      const def = getCardDef("baker");
      const ab = def.paidAbilities?.[0];
      expect(ab?.flag).toBe("once_per_turn");
      expect(ab?.startsRun?.servers).toBe("archives");
      expect(
        ab?.startsRun?.mayRedirectApproachArchivesToHqOrRdPayingStealthCredits,
      ).toBe(1);
    });

    it("Aircheck blocks pool spend/lose and may-run remote on success", () => {
      const def = getCardDef("aircheck");
      expect(def.subtypes).toContain("stealth");
      expect(def.runEvent?.servers).toBe("hq_rd");
      expect(def.runEvent?.placeEventCredits).toBe(4);
      expect(def.runEvent?.blockCreditPoolSpendAndLose).toBe(true);
      expect(validateEffectTree(def.runEvent!.onRunEnd!)).toBeNull();
      expect(JSON.stringify(def.runEvent!.onRunEnd)).toContain("may_start_run");
      expect(JSON.stringify(def.runEvent!.onRunEnd)).toContain("run_successful");
    });
  });
  });

  describe("vp-v131-b-slice", () => {

  beforeAll(() => {
    if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
    if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
    assertPinnedTag("v26.03");
    assertCardsPinnedTag("v1.147.11");
  });

  describe("Vantage Point v1.31.0 B-slice", () => {

    it("Luana hosts BP on turn begin and returns on uninstall", () => {
      const def = getCardDef("luana-campos");
      expect(def.returnHostedBadPublicityOnUninstall).toBe(true);
      expect(validateEffectTree(def.onTurnBegin!)).toBeNull();
      expect(JSON.stringify(def.onTurnBegin)).toContain("may_host_bad_publicity_then");
    });

    it("Let Them Dream lowers runner-score points and searches on score", () => {
      const def = getCardDef("let-them-dream");
      expect(def.agendaPointsModifierInRunnerScoreArea).toBe(-1);
      expect(validateEffectTree(def.onScore!)).toBeNull();
      expect(JSON.stringify(def.onScore)).toContain(
        "may_search_hq_rd_archives_agenda_to_hq_or_rd_bottom",
      );
    });

    it("Editorial searches R&D on first BP take", () => {
      const def = getCardDef("editorial-division-ad-nihilum");
      expect(validateEffectTree(def.onFirstBadPublicityTakeEachTurn!)).toBeNull();
      expect(JSON.stringify(def.onFirstBadPublicityTakeEachTurn)).toContain(
        "may_search_rd_non_agenda_any_subtype_to_hq",
      );
    });
  });
  });

  describe("vp-v132-b-slice", () => {

  beforeAll(() => {
    if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
    if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
    assertPinnedTag("v26.03");
    assertCardsPinnedTag("v1.147.11");
  });

  describe("Vantage Point v1.32.0 B-slice", () => {

    it("Nurse Hạnh draws when Archives facedown cards turn faceup", () => {
      const def = getCardDef("nurse-hanh");
      expect(def.onArchivesFacedownTurnedFaceupGte?.min).toBe(2);
      expect(validateEffectTree(def.onArchivesFacedownTurnedFaceupGte!.effect)).toBeNull();
    });

    it("Beta Build searches non-virus program then may return on run end", () => {
      const def = getCardDef("beta-build");
      expect(validateEffectTree(def.onPlay!)).toBeNull();
      expect(JSON.stringify(def.onPlay)).toContain(
        "search_stack_non_virus_program_install_ignore_costs_track",
      );
      expect(validateEffectTree(def.runEvent!.onRunEnd!)).toBeNull();
    });

    it("Perfect Recall loads power and forbids steal/trash copies", () => {
      const def = getCardDef("perfect-recall");
      expect(def.powerCountersOnRez).toBe(1);
      expect(def.powerCounterOnAgendaScoredOrStolenFromThisServer).toBe(1);
      expect(def.paidAbilities?.[0]?.requiresActiveRun).toBe(true);
      expect(validateEffectTree(def.paidAbilities![0]!.effect)).toBeNull();
    });
  });
  });

  describe("vp-v133-b-slice", () => {

  beforeAll(() => {
    if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
    if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
    assertPinnedTag("v26.03");
    assertCardsPinnedTag("v1.147.11");
  });

  describe("Vantage Point v1.33.0 B-slice", () => {

    it("Word on the Street adds −1 AP cost / rewards non-install scores", () => {
      const def = getCardDef("word-on-the-street");
      expect(def.unique).toBe(true);
      expect(
        validateEffectTree(def.additionalCostOnScoreAgendaInstalledThisTurn!),
      ).toBeNull();
      expect(
        JSON.stringify(def.additionalCostOnScoreAgendaInstalledThisTurn),
      ).toContain("add_to_corp_score_as_agenda");
      expect(validateEffectTree(def.onAgendaScored!)).toBeNull();
      expect(JSON.stringify(def.onAgendaScored)).toContain(
        "last_scored_agenda_installed_this_turn",
      );
    });

    it("Read-Write Share hosts from grip and shuffles on trash", () => {
      const def = getCardDef("read-write-share");
      expect(def.maxHostedCards).toBe(4);
      expect(validateEffectTree(def.onInstall!)).toBeNull();
      expect(validateEffectTree(def.onTurnBegin!)).toBeNull();
      expect(JSON.stringify(def.onInstall)).toContain(
        "may_host_one_from_grip_facedown_then_draw",
      );
      expect(def.paidAbilities?.[0]?.cost?.trashSelf).toBe(true);
      expect(validateEffectTree(def.paidAbilities![0]!.effect)).toBeNull();
    });

    it("Hackerspace hosts unique companion/connection with hand-size bonus", () => {
      const def = getCardDef("hackerspace");
      expect(def.unique).toBe(true);
      expect(def.hostsUniqueCompanionOrConnectionResources?.creditDiscount).toBe(
        1,
      );
      expect(def.handSizeBonusIfHostingCompanionAndConnection).toBe(2);
    });

    it("Méliès U secretly sets face and flips on central success", () => {
      const def = getCardDef("melies-u-only-the-brightest");
      expect(def.flipIdentityOnSuccessfulCentralRun).toBe(true);
      expect(validateEffectTree(def.onDiscardPhaseEnd!)).toBeNull();
      expect(JSON.stringify(def.onDiscardPhaseEnd)).toContain(
        "melies_secretly_set_face",
      );
      expect(validateEffectTree(def.onRunnerActionPhaseEnd!)).toBeNull();
      expect(
        validateEffectTree(
          def.identityFlippedHooks!.onFlipToBackIfRunMatchesFace!,
        ),
      ).toBeNull();
      expect(
        validateEffectTree(def.identityFlippedHooks!.onRunnerDiscardPhaseEnd!),
      ).toBeNull();
    });
  });
  });
});
