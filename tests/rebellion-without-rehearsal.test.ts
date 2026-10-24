/**
 * rebellion-without-rehearsal play tests.
 */
import { describe, expect, it, beforeAll } from "vitest";
import {
  assertCardsPinnedTag,
  assertPinnedTag,
  cardsDataPresent,
  crDataPresent,
  createGame,
  effectiveIceStrength,
  evalEffect,
  fx,
  getCardDef,
  instantiateCard,
  validateEffectTree,
  applyAction,
  createInitialState,
  purgeVirusCounters,
} from "../src/index.js";

describe("rebellion-without-rehearsal", () => {
  describe("rwr-v088-corp-ice-resources", () => {
  beforeAll(() => {
    if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
    if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
    assertPinnedTag("v26.03");
    assertCardsPinnedTag("v1.147.12");
  });

  describe("RWR v0.88 Corporate Hospitality / Boto / Capacitor / FoF / Seraph", () => {

    it("Corporate Hospitality is double: gain 6, draw 2, archives to HQ", () => {
      const def = getCardDef("corporate-hospitality");
      expect(def.playAdditionalClick).toBe(true);
      expect(def.onPlay).toEqual(
        fx.seq(
          fx.gainCredits("corp", 6),
          fx.draw("corp", 2),
          fx.do({ kind: "archives_to_hq", amount: 1 }),
        ),
      );
    });

    it("Boto threat strength + may-trash-HQ ETR", () => {
      const def = getCardDef("boto");
      expect(def.threatStrengthBonus).toEqual({ level: 4, amount: 2 });
      expect(def.subroutines).toHaveLength(3);
    });

    it("Capacitor gains credits per tags and strength while tagged", () => {
      const def = getCardDef("capacitor");
      expect(def.strengthBonusWhileTagged).toBe(2);
      const state = createGame({ seed: 1 });
      const ice = instantiateCard("capacitor", "cap1", "server:hq:ice");
      state.cards[ice.id] = ice;
      state.servers.hq.ice.push(ice.id);
      ice.rezzed = true;
      expect(effectiveIceStrength(state, ice.id)).toBe(3);
      state.runner.tags = 2;
      expect(effectiveIceStrength(state, ice.id)).toBe(5);
      const before = state.corp.credits;
      const r = evalEffect(
        { state, sourceId: ice.id },
        fx.gainCreditsPerRunnerTags(1),
      );
      expect(r.ok).toBe(true);
      expect(state.corp.credits).toBe(before + 2);
    });

    it("Friend of a Friend second ability requires untagged", () => {
      const def = getCardDef("friend-of-a-friend");
      const abs = def.paidAbilities ?? [];
      expect(abs).toHaveLength(2);
      expect(abs[1].requiresUntagged).toBe(true);
    });

    it("Seraph onEncounter is a three-way choose", () => {
      const def = getCardDef("seraph");
      expect(def.onEncounter?.op).toBe("choose");
      expect(def.subroutines).toHaveLength(3);
    });
  });
  });

  describe("rwr-v089-powers-stoke-breakers", () => {
  beforeAll(() => {
    if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
    if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
    assertPinnedTag("v26.03");
    assertCardsPinnedTag("v1.147.12");
  });

  describe("RWR v0.89 Powers / Stoke / Boi-tatá / Sorocaban / Piranhas", () => {

    it("The Powers That Be may install on agenda score", () => {
      const def = getCardDef("the-powers-that-be");
      expect(def.onAgendaScored?.op).toBe("choose");
    });

    it("Stoke the Embers scores + non-HQ install", () => {
      const def = getCardDef("stoke-the-embers");
      expect(def.onScore).toEqual(
        fx.seq(
          fx.gainCredits("corp", 3),
          fx.do({ kind: "place_advancements", amount: 1 }),
        ),
      );
      expect(def.onInstallFromNonHq?.op).toBe("choose");
    });

    it("Boi-tatá is a sentry breaker with trash discount", () => {
      const def = getCardDef("boi-tata");
      expect(def.breaker?.breaksSubtype).toBe("sentry");
      expect(def.paidAbilityCreditDiscountIfOwnInstalledTrashedThisTurn).toBe(1);
    });

    it("Sorocaban Blade limits trashes per encounter", () => {
      const def = getCardDef("sorocaban-blade");
      expect(def.maxInstalledRunnerTrashesPerEncounter).toBe(1);
      expect(def.subroutines).toHaveLength(3);
    });

    it("Piranhas has rez cost and HQ>grip ETR", () => {
      const def = getCardDef("piranhas");
      expect(def.rezAdditionalCost?.op).toBe("choose");
      expect(def.subroutines?.[2]?.effect).toEqual({
        op: "if",
        cond: { op: "hq_count_gt_grip" },
        then: fx.etr(),
      });
    });
  });
  });

  describe("rwr-v090-charlotte-janaina-crew", () => {
  beforeAll(() => {
    if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
    if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
    assertPinnedTag("v26.03");
    assertCardsPinnedTag("v1.147.12");
  });

  describe("RWR v0.90 Charlotte / Janaína / Arruaceiras / Logjam / Hammer", () => {

    it("Charlotte is advanceable with turn-begin and trash abilities", () => {
      const def = getCardDef("charlotte-cacador");
      expect(def.canAdvance).toBe(true);
      expect(def.onTurnBegin?.op).toBe("choose");
      expect(def.paidAbilities?.[0]?.cost?.trashSelf).toBe(true);
    });

    it("Janaína places hosted credits and returns to HQ", () => {
      const def = getCardDef("janaina-jk-dumont-kindelan");
      expect(def.onTurnBegin).toEqual({
        op: "do",
        action: { kind: "place_hosted_credits", amount: 3 },
      });
      const eff = def.paidAbilities?.[0]?.effect as { effects: unknown[] };
      expect(JSON.stringify(eff)).toContain("return_source_to_hq");
    });

    it("Arruaceiras weakens and trashes weak ice", () => {
      const def = getCardDef("arruaceiras-crew");
      expect(def.paidAbilities).toHaveLength(2);
      expect(def.paidAbilities?.[1]?.effect).toEqual({
        op: "do",
        action: { kind: "trash_encounter_ice_if_strength_lte", maxStrength: 0 },
      });
    });

    it("Logjam advances from Archives types", () => {
      const def = getCardDef("logjam");
      expect(def.strengthPerAdvancement).toBe(1);
      expect(def.onRez).toEqual({
        op: "do",
        action: {
          kind: "place_advancements_on_self_per_faceup_archive_types",
          base: 1,
        },
      });
    });

    it("Hammer limits breaks except killers", () => {
      const def = getCardDef("hammer");
      expect(def.maxPrintedSubsBreakExceptSubtype).toBe("killer");
      expect(def.subroutines).toHaveLength(3);
    });
  });
  });

  describe("rwr-v091-policing-breach-tags", () => {
  beforeAll(() => {
    if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
    if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
    assertPinnedTag("v26.03");
    assertCardsPinnedTag("v1.147.12");
  });

  describe("RWR v0.91 policing / breach / tags", () => {

    it("Active Policing is terminal with steal/trash gate and click penalty", () => {
      const def = getCardDef("active-policing");
      expect(def.endsActionPhase).toBe(true);
      expect(def.playRequiresRunnerStoleOrTrashedCorpCardLastTurn).toBe(true);
      expect(validateEffectTree(def.onPlay!)).toBeNull();
      expect(JSON.stringify(def.onPlay)).toContain("allotted_clicks_next_turn");
    });

    it("Bring Them Home moves grip cards to stack top", () => {
      const def = getCardDef("bring-them-home");
      expect(def.endsActionPhase).toBe(true);
      expect(validateEffectTree(def.onPlay!)).toBeNull();
      expect(JSON.stringify(def.onPlay)).toContain("add_random_grip_to_stack_top");
    });

    it("Pretty Mary gates R&D bonus access on min allowed", () => {
      const def = getCardDef("pretty-mary-da-silva");
      expect(def.onBreachRdIfAccessGteMayBonusAccess).toEqual({
        min: 2,
        amount: 1,
      });
    });

    it("Eye for an Eye requires untagged and grants access trash", () => {
      const def = getCardDef("eye-for-an-eye");
      expect(def.playRequiresUntagged).toBe(true);
      expect(def.accessTrashFromGrip).toEqual({ gripCards: 1 });
      expect(def.runEvent?.servers).toBe("hq");
      expect(def.runEvent?.bonusAccess).toBe(1);
    });

    it("Valentina gains credits when tags are removed", () => {
      const def = getCardDef("valentina-ferreira-carvalho");
      expect(def.onRemoveTags).toEqual({
        op: "do",
        action: { kind: "gain_credits", side: "runner", amount: 1 },
      });
      expect(validateEffectTree(def.onRemoveTags!)).toBeNull();
      expect(validateEffectTree(def.onInstall!)).toBeNull();
    });
  });
  });

  describe("rwr-v092-malandragem-physarum-lobisomem", () => {
  beforeAll(() => {
    if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
    if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
    assertPinnedTag("v26.03");
    assertCardsPinnedTag("v1.147.12");
  });

  describe("RWR v0.92 Malandragem / Physarum / Lobisomem / Trick Shot / Privileged Access", () => {

    it("Malandragem RFGs when empty and bypasses weak ice", () => {
      const def = getCardDef("malandragem");
      expect(def.powerCountersOnInstall).toBe(2);
      expect(def.rfgWhenPowerEmpty).toBe(true);
      expect(def.paidAbilities?.[0]?.requireEncounterStrengthLte).toBe(3);
    });

    it("Physarum installs on ice and bypasses non-barriers", () => {
      const def = getCardDef("physarum-entangler");
      expect(def.installOnIce).toBe(true);
      expect(def.trashOnVirusPurge).toBe(true);
      expect(def.paidAbilities?.[0]?.forbidEncounterSubtype).toBe("barrier");
      expect(def.paidAbilities?.[0]?.cost?.creditsPerEncounterSubroutine).toBe(1);
    });

    it("Lobisomem is a dual code gate / barrier breaker", () => {
      const def = getCardDef("lobisomem");
      expect(def.breaker?.breaksSubtype).toBe("code gate");
      expect(validateEffectTree(def.onFullyBreak!)).toBeNull();
      expect(def.paidAbilities?.length).toBeGreaterThanOrEqual(3);
    });

    it("Trick Shot places event credits and may run a remote", () => {
      const def = getCardDef("trick-shot");
      expect(def.runEvent?.placeEventCredits).toBe(4);
      expect(def.runEvent?.bonusAccess).toBe(1);
      expect(validateEffectTree(def.runEvent!.onSuccessfulRun!)).toBeNull();
      expect(validateEffectTree(def.runEvent!.onRunEnd!)).toBeNull();
    });

    it("Privileged Access requires untagged and installs from heap", () => {
      const def = getCardDef("privileged-access");
      expect(def.playRequiresUntagged).toBe(true);
      expect(def.runEvent?.skipBreach).toBe(true);
      expect(validateEffectTree(def.runEvent!.onSuccessfulRun!)).toBeNull();
    });
  });
  });

  describe("rwr-v093-amanuensis-ashen-spree", () => {
  beforeAll(() => {
    if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
    if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
    assertPinnedTag("v26.03");
    assertCardsPinnedTag("v1.147.12");
  });

  describe("RWR v0.93 Amanuensis / Ashen / Sudden / Working Prototype / Spree", () => {

    it("Amanuensis places power when tagged at turn end", () => {
      const def = getCardDef("amanuensis");
      expect(def.muBonus).toBe(1);
      expect(validateEffectTree(def.onRunnerTurnEnd!)).toBeNull();
      expect(validateEffectTree(def.onRemoveTags!)).toBeNull();
    });

    it("Ashen Epilogue shuffles grip+heap and RFGs", () => {
      const def = getCardDef("ashen-epilogue");
      expect(validateEffectTree(def.onPlay!)).toBeNull();
      expect(JSON.stringify(def.onPlay)).toContain("shuffle_grip_and_heap_into_stack");
    });

    it("Sudden Commandment may play a non-terminal operation", () => {
      const def = getCardDef("sudden-commandment");
      expect(validateEffectTree(def.onPlay!)).toBeNull();
      expect(JSON.stringify(def.onPlay)).toContain(
        "may_play_nonterminal_operation_from_hq",
      );
    });

    it("Working Prototype gains power on any rez", () => {
      const def = getCardDef("working-prototype");
      expect(def.powerCounterOnAnyCardRez).toBe(1);
      expect(def.paidAbilities).toHaveLength(2);
    });

    it("Spree places power and hosts trojans during the run", () => {
      const def = getCardDef("spree");
      expect(def.powerCountersOnPlay).toBe(3);
      expect(def.runEvent?.servers).toBe("any");
      expect(def.paidAbilities?.[0]?.requireDuringRun).toBe(true);
    });
  });
  });

  describe("rwr-v094-hearts-basalt-juli", () => {
  beforeAll(() => {
    if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
    if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
    assertPinnedTag("v26.03");
    assertCardsPinnedTag("v1.147.12");
  });

  describe("RWR v0.94 Hearts / Warm Reception / Basalt / Juli / Alarm Clock", () => {

    it("Hearts and Minds moves/places advancements at turn begin", () => {
      const def = getCardDef("hearts-and-minds");
      expect(validateEffectTree(def.onTurnBegin!)).toBeNull();
      expect(JSON.stringify(def.onTurnBegin)).toContain("move_advancements");
      expect(JSON.stringify(def.onTurnBegin)).toContain(
        "host_server_unprotected_by_ice",
      );
    });

    it("Warm Reception may install and may derez-pair when unprotected", () => {
      const def = getCardDef("warm-reception");
      expect(validateEffectTree(def.onTurnBegin!)).toBeNull();
      expect(JSON.stringify(def.onTurnBegin)).toContain(
        "may_install_from_hq_paying_costs",
      );
      expect(JSON.stringify(def.onTurnBegin)).toContain("derez_source");
    });

    it("Basalt Spire scores agenda counters and mills R&D", () => {
      const def = getCardDef("the-basalt-spire");
      expect(validateEffectTree(def.onSteal!)).toBeNull();
      expect(validateEffectTree(def.onScore!)).toBeNull();
      expect(def.paidAbilities?.[0]?.flag).toBe("once_per_turn");
      expect(JSON.stringify(def.paidAbilities?.[0]?.effect)).toContain(
        "trash_top_of_rd",
      );
    });

    it("Juli loads power and reacts to first resource paid ability", () => {
      const def = getCardDef("juli-moreira-lee");
      expect(def.powerCountersOnInstall).toBe(4);
      expect(def.trashWhenPowerEmpty).toBe(true);
      expect(
        validateEffectTree(def.onFirstResourcePaidAbilityEachTurn!),
      ).toBeNull();
    });

    it("Alarm Clock may start an HQ run with 2-click first-encounter bypass", () => {
      const def = getCardDef("alarm-clock");
      expect(validateEffectTree(def.onTurnBegin!)).toBeNull();
      expect(JSON.stringify(def.onTurnBegin)).toContain("may_start_run");
      expect(JSON.stringify(def.onTurnBegin)).toContain(
        "bypassFirstEncounterForClicks",
      );
    });
  });
  });

  describe("rwr-v095-holo-isaac-king", () => {
  beforeAll(() => {
    if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
    if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
    assertPinnedTag("v26.03");
    assertCardsPinnedTag("v1.147.12");
  });

  describe("RWR v0.95 Holo Man / Isaac / Kingmaking / Amelia / Cohort", () => {

    it("Holo Man moves and places advancements on this server", () => {
      const def = getCardDef("the-holo-man");
      expect(validateEffectTree(def.onTurnBegin!)).toBeNull();
      expect(def.paidAbilities?.[0]?.flag).toBe("once_per_turn");
      expect(JSON.stringify(def.paidAbilities?.[0]?.effect)).toContain(
        "sameServerRootOrIceAsSource",
      );
    });

    it("Isaac boosts advanced ice and may move at turn end", () => {
      const def = getCardDef("isaac-liberdade");
      expect(def.advancedIceProtectingThisServerStrengthBonus).toBe(2);
      expect(validateEffectTree(def.onMovedToServerRoot!)).toBeNull();
      expect(validateEffectTree(def.onCorpTurnEnd!)).toBeNull();
    });

    it("Kingmaking draws up to 3 and may add a low-AP agenda", () => {
      const def = getCardDef("kingmaking");
      expect(validateEffectTree(def.onScore!)).toBeNull();
      expect(JSON.stringify(def.onScore)).toContain("draw_up_to");
      expect(JSON.stringify(def.onScore)).toContain(
        "may_add_hq_agenda_ap_lte_to_score",
      );
    });

    it("Amelia places power on heavy HQ/R&D access", () => {
      const def = getCardDef("amelia-earhart");
      expect(def.powerOnHqRdRunEndIfAccessedGte).toEqual({ min: 3, amount: 1 });
      expect(validateEffectTree(def.onTurnBegin!)).toBeNull();
    });

    it("Cohort offers HQ trash or Archives faceup modes", () => {
      const def = getCardDef("cohort-guidance-program");
      expect(validateEffectTree(def.onTurnBegin!)).toBeNull();
      expect(JSON.stringify(def.onTurnBegin)).toContain("may_trash_hq_then");
      expect(JSON.stringify(def.onTurnBegin)).toContain(
        "may_turn_facedown_archives_faceup_then",
      );
    });
  });
  });

  describe("rwr-v096-business-tributary-manuel", () => {
  beforeAll(() => {
    if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
    if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
    assertPinnedTag("v26.03");
    assertCardsPinnedTag("v1.147.12");
  });

  describe("RWR v0.96 Business / Tributary / Meeting / Manuel / Window", () => {

    it("Business As Usual offers advancements or virus purge (+threat)", () => {
      const def = getCardDef("business-as-usual");
      expect(validateEffectTree(def.onPlay!)).toBeNull();
      expect(JSON.stringify(def.onPlay)).toContain("place_advancements_on_up_to");
      expect(JSON.stringify(def.onPlay)).toContain(
        "remove_all_virus_from_one_installed",
      );
      expect(JSON.stringify(def.onPlay)).toContain('"op":"threat"');
    });

    it("Tributary moves on first run begin and fortifies", () => {
      const def = getCardDef("tributary");
      expect(validateEffectTree(def.onFirstRunBeginThisTurn!)).toBeNull();
      expect(JSON.stringify(def.onFirstRunBeginThisTurn)).toContain(
        "move_source_ice_to_outermost_attacked",
      );
      expect(def.subroutines?.length).toBe(2);
      expect(validateEffectTree(def.subroutines![0]!.effect!)).toBeNull();
      expect(validateEffectTree(def.subroutines![1]!.effect!)).toBeNull();
      expect(JSON.stringify(def.subroutines)).toContain("fortify_all_ice");
    });

    it("Meeting of Minds resolves connection or virtual search", () => {
      const def = getCardDef("meeting-of-minds");
      expect(validateEffectTree(def.onPlay!)).toBeNull();
      expect(JSON.stringify(def.onPlay)).toContain("resolve_meeting_of_minds");
    });

    it("Manuel grants tagged HQ/R&D access and threat trash cost", () => {
      const def = getCardDef("manuel-lattes-de-moura");
      expect(def.bonusAccessOnHqRdBreachWhileTagged).toBe(1);
      expect(def.threatBasicTrashAdditionalCostTrashHq).toBe(3);
    });

    it("Window may install then derez/rez on the run", () => {
      const def = getCardDef("window-of-opportunity");
      expect(validateEffectTree(def.onPlay!)).toBeNull();
      expect(JSON.stringify(def.onPlay)).toContain("may_install_from_grip");
      expect(def.runEvent?.derezProtectingIceOnRunBegin).toBe(true);
      expect(def.runEvent?.mayRezEventDerezzedIceOnRunEndIgnoreCosts).toBe(true);
    });
  });
  });

  describe("rwr-v097-sebastiao-cloud-descent", () => {
  beforeAll(() => {
    if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
    if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
    assertPinnedTag("v26.03");
    assertCardsPinnedTag("v1.147.12");
  });

  describe("RWR v0.97 Sebastião / Cloud Eater / Descent / Nuvem / Sisyphus", () => {

    it("Sebastião installs connection on tags and gates connection trash", () => {
      const def = getCardDef("sebastiao-souza-pessoa-activist-organizer");
      expect(validateEffectTree(def.onTakeTagsWhenUntagged!)).toBeNull();
      expect(def.connectionBasicTrashAdditionalCostTrashHq).toBe(true);
      expect(JSON.stringify(def.onTakeTagsWhenUntagged)).toContain("connection");
    });

    it("Cloud Eater forces encounter-end choice and has three subs", () => {
      const def = getCardDef("cloud-eater");
      expect(validateEffectTree(def.onEncounterEndIfRezzedThisTurn!)).toBeNull();
      expect(def.subroutines?.length).toBe(3);
      expect(validateEffectTree(def.subroutines![0]!.effect!)).toBeNull();
    });

    it("Descent returns to HQ and expends from HQ", () => {
      const def = getCardDef("descent");
      expect(validateEffectTree(def.onTurnBegin!)).toBeNull();
      expect(def.paidAbilities?.[0]?.usableFromHq).toBe(true);
      expect(validateEffectTree(def.paidAbilities![0]!.effect!)).toBeNull();
      expect(JSON.stringify(def.paidAbilities)).toContain(
        "may_reveal_shuffle_agendas_into_rd",
      );
    });

    it("Nuvem looks at R&D after ops/expendables", () => {
      const def = getCardDef("nuvem-sa-law-of-the-land");
      expect(validateEffectTree(def.onAfterOperationOrExpendable!)).toBeNull();
      expect(def.creditsOnFirstRdTrashThisTurn).toBe(2);
    });

    it("Sisyphus offers reencounter on first CG/sentry pass", () => {
      const def = getCardDef("sisyphus-protocol");
      expect(
        validateEffectTree(def.onFirstPassRezzedCodeGateOrSentryThisTurn!),
      ).toBeNull();
      expect(
        JSON.stringify(def.onFirstPassRezzedCodeGateOrSentryThisTurn),
      ).toContain("pay_credits_reencounter_passed_ice");
    });
  });
  });

  describe("rwr-v098-lightning-brasilia-lycian", () => {
  beforeAll(() => {
    if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
    if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
    assertPinnedTag("v26.03");
    assertCardsPinnedTag("v1.147.12");
  });

  describe("RWR v0.98 Eminent / Lightning / Brasília / Thunderbolt / Lycian", () => {

    it("Eminent Domain expend and onScore trees", () => {
      const def = getCardDef("eminent-domain");
      expect(def.paidAbilities?.[0]?.usableFromHq).toBe(true);
      expect(validateEffectTree(def.paidAbilities![0]!.effect!)).toBeNull();
      expect(JSON.stringify(def.paidAbilities)).toContain(
        "may_install_and_rez_from_hq",
      );
      expect(validateEffectTree(def.onScore!)).toBeNull();
      expect(JSON.stringify(def.onScore)).toContain(
        "may_search_rd_install_rez_ignore_costs",
      );
    });

    it("Lightning Laboratory counters and run-begin / end-turn hooks", () => {
      const def = getCardDef("lightning-laboratory");
      expect(validateEffectTree(def.onScore!)).toBeNull();
      expect(JSON.stringify(def.onScore)).toContain("add_agenda_counter");
      expect(
        def.onRunBeginMaySpendAgendaCounterRezUpToIceProtectingAttacked,
      ).toEqual({ maxIce: 2 });
      expect(
        def.onCorpTurnEndDerezUpToIceProtectingLightningServer,
      ).toEqual({ maxIce: 2 });
    });

    it("Brasília once-per-turn rez-during-run hook", () => {
      const def = getCardDef("brasilia-government-grid");
      expect(def.oncePerTurnOnRezIceProtectingThisServerDuringRun).toEqual({
        mayDerezOtherIceForStrengthBonus: 3,
      });
    });

    it("Thunderbolt identity AP/destroyer hook", () => {
      const def = getCardDef("thunderbolt-armaments-peace-through-power");
      expect(def.onRezApOrDestroyerIceDuringRun).toEqual({
        strengthBonus: 1,
        gainEtrUnlessTrashInstalledSub: true,
      });
    });

    it("Lycian chooses subtypes on rez and derezzes any turn end", () => {
      const def = getCardDef("lycian-multi-munition");
      expect(validateEffectTree(def.onRez!)).toBeNull();
      expect(JSON.stringify(def.onRez)).toContain("choose_lycian_subtypes");
      expect(def.derezAtAnyTurnEnd).toBe(true);
      expect(def.subroutines?.length).toBe(3);
      expect(JSON.stringify(def.subroutines)).toContain("source_has_subtype");
    });
  });
  });

  describe("rwr-v099-burner-cataloguer-muse", () => {
  beforeAll(() => {
    if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
    if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
    assertPinnedTag("v26.03");
    assertCardsPinnedTag("v1.147.12");
  });

  describe("RWR v0.99 Burner / Cataloguer / Muse / Jeitinho / Wizard's Chest", () => {

    it("Burner runEvent skipBreach + burner_resolve", () => {
      const def = getCardDef("burner");
      expect(def.runEvent?.servers).toBe("hq");
      expect(def.runEvent?.skipBreach).toBe(true);
      expect(validateEffectTree(def.runEvent!.onSuccessfulRun!)).toBeNull();
      expect(JSON.stringify(def.runEvent!.onSuccessfulRun)).toContain(
        "resolve_burner",
      );
    });

    it("Cataloguer arrange + paid breach gates", () => {
      const def = getCardDef("cataloguer");
      expect(def.powerCountersOnInstall).toBe(2);
      expect(def.trashWhenPowerEmpty).toBe(true);
      expect(validateEffectTree(def.onSuccessfulRun!)).toBeNull();
      expect(JSON.stringify(def.onSuccessfulRun)).toContain("set_run_skip_breach");
      expect(JSON.stringify(def.onSuccessfulRun)).toContain(
        "look_top_n_rd_arrange",
      );
      const ab = def.paidAbilities![0]!;
      expect(ab.requiresSuccessfulRdRunThisTurn).toBe(true);
      expect(validateEffectTree(ab.effect)).toBeNull();
      expect(JSON.stringify(ab.effect)).toContain("breach_server_standalone");
    });

    it("Muse daemonHost + onInstall search", () => {
      const def = getCardDef("muse");
      expect(def.daemonHost).toBe(true);
      expect(def.subtypes).toContain("daemon");
      expect(validateEffectTree(def.onInstall!)).toBeNull();
      expect(JSON.stringify(def.onInstall)).toContain(
        "search_install_non_daemon",
      );
    });

    it("Jeitinho all-centrals score + heap bypass", () => {
      const def = getCardDef("jeitinho");
      expect(validateEffectTree(def.onRunnerTurnEnd!)).toBeNull();
      expect(JSON.stringify(def.onRunnerTurnEnd)).toContain(
        "successful_all_centrals_this_turn",
      );
      expect(JSON.stringify(def.onRunnerTurnEnd)).toContain("assassination");
      expect(JSON.stringify(def.onRunnerTurnEnd)).toContain(
        "check_assassination_win",
      );
      expect(def.onBypassMayInstallFromHeap).toEqual({
        requiresThreat: 3,
        clickCost: 1,
      });
    });

    it("Wizard's Chest all-centrals paid ability", () => {
      const def = getCardDef("the-wizard-s-chest");
      const ab = def.paidAbilities![0]!;
      expect(ab.requiresSuccessfulAllCentralsThisTurn).toBe(true);
      expect(ab.cost?.trashSelf).toBe(true);
      expect(validateEffectTree(ab.effect)).toBeNull();
      expect(JSON.stringify(ab.effect)).toContain("resolve_wizard_chest");
    });
  });
  });

  describe("rwr-v100-cupellation-heliamphora", () => {
  beforeAll(() => {
    if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
    if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
    assertPinnedTag("v26.03");
    assertCardsPinnedTag("v1.147.12");
  });

  function must(
    state: ReturnType<typeof createInitialState>,
    action: Parameters<typeof applyAction>[1],
  ) {
    const r = applyAction(state, action);
    if (!r.ok) throw new Error(`${r.error} ${JSON.stringify(r.cites)}`);
    return r.state;
  }

  describe("RWR v1.00 Cupellation / Heliamphora", () => {
    it("Cupellation IR: maxHosted + access host + HQ breach Effect", () => {
      const def = getCardDef("cupellation");
      expect(def.maxHostedCards).toBe(1);
      expect(def.accessHostNonAgendaFaceup).toEqual({ creditCost: 1 });
      expect(validateEffectTree(def.onBreachHqIfHostingCorpCard!)).toBeNull();
      expect(JSON.stringify(def.onBreachHqIfHostingCorpCard)).toContain(
        "trash_self",
      );
      expect(JSON.stringify(def.onBreachHqIfHostingCorpCard)).toContain(
        "bonus_access",
      );
    });

    it("Heliamphora IR: Archives interrupt + onVirusPurge random HQ", () => {
      const def = getCardDef("heliamphora");
      expect(def.onWouldAccessArchivesHostInstead).toEqual({
        oncePerArchivesBreach: true,
      });
      expect(validateEffectTree(def.onVirusPurge!)).toBeNull();
      expect(JSON.stringify(def.onVirusPurge)).toContain('"pick":"random"');
      expect(JSON.stringify(def.onVirusPurge)).toContain('"amount":2');
      expect(JSON.stringify(def.onVirusPurge)).toContain("trash_self");
    });

    it("Cupellation hosts accessed non-agenda faceup (not installed)", () => {
      let s = createInitialState();
      s = structuredClone(s);
      s.runner.credits = 5;
      const cup = instantiateCard("cupellation", "cup-1", "runner:installed");
      s.cards["cup-1"] = cup;
      s.runner.installed = ["cup-1"];

      const asset = instantiateCard("pad-campaign", "a-1", "corp:hq");
      s.cards["a-1"] = asset;
      s.corp.hand = ["a-1"];

      s.run = {
        attackedServerId: "hq",
        phase: "breach",
        position: null,
        successful: true,
        endedTheRun: false,
        cannotJackOut: false,
        strengthBoosts: {},
        encounterStrengthBoosts: {},
        iceStrengthBoosts: {},
        accessingCardId: "a-1",
        accessCandidates: [],
        accessedCardIds: ["a-1"],
        randomAccessLimit: 0,
        encounter: null,
        breached: true,
      };
      s.timingKey = "breach.awaitAccess";

      s = must(s, { type: "access_host_non_agenda_faceup", cardId: "a-1" });
      expect(s.runner.credits).toBe(4);
      expect(s.cards["cup-1"]!.hostedCardIds).toEqual(["a-1"]);
      expect(s.cards["a-1"]!.zone).toBe("hosted:cup-1");
      expect(s.cards["a-1"]!.hostId).toBe("cup-1");
      expect(s.cards["a-1"]!.faceup).toBe(true);
      expect(s.corp.hand).not.toContain("a-1");
      expect(s.corp.discardPile).not.toContain("a-1");
      expect(s.runner.installed).not.toContain("a-1");
    });

    it("Heliamphora onVirusPurge trashes 2 random HQ + self", () => {
      let s = createInitialState();
      s = structuredClone(s);
      const heli = instantiateCard("heliamphora", "heli-1", "runner:installed");
      s.cards["heli-1"] = heli;
      s.runner.installed = ["heli-1"];

      for (const id of ["h1", "h2", "h3"]) {
        const c = instantiateCard("hedge-fund", id, "corp:hq");
        s.cards[id] = c;
      }
      s.corp.hand = ["h1", "h2", "h3"];

      purgeVirusCounters(s, s.corp.identityId);
      expect(s.runner.installed).not.toContain("heli-1");
      expect(s.runner.discardPile).toContain("heli-1");
      expect(s.corp.hand).toHaveLength(1);
      expect(s.corp.discardPile.filter((id) => id.startsWith("h")).length).toBe(2);
    });

    it("trash_hq random amount validates and evals", () => {
      const fx = {
        op: "do" as const,
        action: {
          kind: "trash_hq" as const,
          pick: "random" as const,
          amount: 2,
        },
      };
      expect(validateEffectTree(fx)).toBeNull();
      let s = createInitialState();
      s = structuredClone(s);
      for (const id of ["x1", "x2"]) {
        s.cards[id] = instantiateCard("hedge-fund", id, "corp:hq");
      }
      s.corp.hand = ["x1", "x2"];
      const r = evalEffect({ state: s, sourceId: s.corp.identityId }, fx);
      expect(r.ok).toBe(true);
      expect(s.corp.hand).toHaveLength(0);
    });
  });
  });
});
