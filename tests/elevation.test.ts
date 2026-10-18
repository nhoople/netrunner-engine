/**
 * elevation play tests.
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
  effectiveBreakerStrength,
  effectiveIceStrength,
  validateEffectTree,
} from "../src/index.js";

describe("elevation", () => {
  describe("elev-v101-kickoff", () => {
  beforeAll(() => {
    if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
    if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
    assertPinnedTag("v26.03");
    assertCardsPinnedTag("v1.147.6");
  });

  describe("Elevation v1.01.0 kickoff", () => {

    it("Clean Getaway runs any server for 6¢ on success", () => {
      const def = getCardDef("clean-getaway");
      expect(def.runEvent).toEqual({
        servers: "any",
        onSuccessfulRun: fx.gainCredits("runner", 6),
      });
    });

    it("Rent Rioters is 3 clicks + trash for 9¢", () => {
      const def = getCardDef("rent-rioters");
      expect(def.paidAbilities).toHaveLength(1);
      const ab = def.paidAbilities![0]!;
      expect(ab.clickCost).toBe(3);
      expect(ab.cost).toEqual({ clicks: 3, trashSelf: true });
      expect(ab.effect).toEqual(fx.gainCredits("runner", 9));
    });

    it("Anthill Excavation loads 8¢ on rez and takes 4¢ + draw on turn begin", () => {
      const def = getCardDef("anthill-excavation-contract");
      expect(def.onRez).toEqual(
        fx.do({ kind: "place_hosted_credits", amount: 8 }),
      );
      expect(def.onTurnBegin).toEqual(
        fx.seq(
          fx.do({ kind: "take_hosted_credits", amount: 4 }),
          fx.draw("corp", 1),
        ),
      );

      const state = createGame({ seed: 1 });
      const asset = instantiateCard(
        "anthill-excavation-contract",
        "anthill1",
        "server:remote-1:root",
      );
      state.cards[asset.id] = asset;
      state.servers["remote-1"] = {
        id: "remote-1",
        kind: "remote",
        ice: [],
        root: [asset.id],
      };
      asset.rezzed = true;
      const place = evalEffect(
        { state, sourceId: asset.id },
        fx.do({ kind: "place_hosted_credits", amount: 8 }),
      );
      expect(place.ok).toBe(true);
      expect(asset.hostedCredits).toBe(8);
      const before = state.corp.credits;
      const take = evalEffect(
        { state, sourceId: asset.id },
        fx.do({ kind: "take_hosted_credits", amount: 4 }),
      );
      expect(take.ok).toBe(true);
      expect(state.corp.credits).toBe(before + 4);
      expect(asset.hostedCredits).toBe(4);
    });
  });
  });

  describe("elev-v102-a-slice", () => {

  beforeAll(() => {
    if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
    if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
    assertPinnedTag("v26.03");
    assertCardsPinnedTag("v1.147.6");
  });

  describe("Elevation v1.02.0 A-slice", () => {

    it("Azimat is recurring trash credits; Chromatophores is Egret-class", () => {
      expect(getCardDef("azimat").recurringCreditsMax).toBe(2);
      expect(getCardDef("azimat").recurringSpendFor).toEqual(["trash"]);
      expect(getCardDef("chromatophores").installOnIce).toBe(true);
      expect(getCardDef("chromatophores").hostGainsAllIceSubtypes).toBe(true);
    });

    it("Byte! is Behold!-class ambush; Nanomanagement gains 2 clicks", () => {
      const b = getCardDef("byte");
      expect(b.mustRevealWhenAccessedFromRd).toBe(true);
      expect(b.skipOnAccessFromArchives).toBe(true);
      expect(b.onAccess).toBeDefined();
      expect(getCardDef("nanomanagement").onPlay).toEqual(
        fx.gainClicks("corp", 2),
      );
    });

    it("Hantu is virus killer with virus pump", () => {
      const h = getCardDef("hantu");
      expect(h.breaker?.breaksSubtype).toBe("sentry");
      expect(h.onInstall).toEqual(fx.addVirusCounter(2));
      expect(h.paidAbilities?.[0]?.cost).toEqual({ virusCounters: 1 });
    });

    it("Flyswatter purges on rez during run; N-Pot has threat ETRs", () => {
      const f = getCardDef("flyswatter");
      expect(f.onRez).toEqual(
        fx.if(
          { op: "source_protects_attacked_server" },
          fx.do({ kind: "purge_virus_counters" }),
        ),
      );
      const n = getCardDef("n-pot");
      expect(n.paidAbilities?.[0]?.effect).toEqual(fx.breakHostSubroutine());
      expect(n.subroutines).toHaveLength(3);
    });

    it("Empiricist / Syailendra / Lamplighter wire subroutine ice", () => {
      expect(getCardDef("empiricist").subroutines).toHaveLength(3);
      const s = getCardDef("syailendra");
      expect(s.canAdvance).toBe(true);
      expect(s.onEncounter).toBeDefined();
      const l = getCardDef("lamplighter");
      expect(l.onAgendaScoredOrStolen).toBeDefined();
      expect(l.subroutines).toHaveLength(2);
    });

    it("Top-Down / Illumination / Maglectric / Idiosyncresis / Devadatta", () => {
      expect(getCardDef("top-down-solutions").onPlay).toBeDefined();
      expect(getCardDef("illumination").runEvent?.servers).toBe("rd");
      expect(getCardDef("maglectric-rapid-748-mod").onSuccessfulRun).toBeDefined();
      expect(getCardDef("idiosyncresis").canAdvance).toBe(true);
      expect(getCardDef("devadatta-drone").powerCountersOnInstall).toBe(2);
      expect(getCardDef("devadatta-drone").maySpendPowerCountersForBonusRdAccess).toEqual(
        { max: 1 },
      );
    });
  });
  });

  describe("elev-v103-b-slice", () => {
  beforeAll(() => {
    if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
    if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
    assertPinnedTag("v26.03");
    assertCardsPinnedTag("v1.147.6");
  });

  describe("Elevation v1.03.0 B-slice", () => {

    it("Doomscroll uses tags_gte for third subroutine", () => {
      const d = getCardDef("doomscroll");
      expect(d.unsupported ?? []).toEqual([]);
      expect(d.subroutines).toHaveLength(3);
      expect(d.subroutines![2]!.effect).toEqual(
        fx.if({ op: "tags_gte", amount: 2 }, fx.netDamage(2)),
      );
      const state = createGame({ seed: 1 });
      state.runner.tags = 1;
      expect(
        evalEffect(
          { state, sourceId: "corp-id" },
          fx.if({ op: "tags_gte", amount: 2 }, fx.netDamage(2)),
        ).ok,
      ).toBe(true);
      // Cond false → if succeeds as no-op
      expect(state.runner.tags).toBe(1);
      state.runner.tags = 2;
      const before = state.runner.hand.length;
      // Give runner cards to take net damage from
      evalEffect(
        { state, sourceId: "corp-id" },
        fx.if({ op: "tags_gte", amount: 2 }, fx.netDamage(2)),
      );
      expect(state.runner.hand.length).toBeLessThanOrEqual(before);
    });

    it("Otto Campaign loads 6¢ and grants 2 clicks on empty", () => {
      const o = getCardDef("otto-campaign");
      expect(o.clicksOnHostedEmpty).toBe(2);
      expect(o.onRez).toEqual(fx.do({ kind: "place_hosted_credits", amount: 6 }));
      const state = createGame({ seed: 2 });
      const asset = instantiateCard(
        "otto-campaign",
        "otto1",
        "server:remote-1:root",
      );
      state.cards[asset.id] = asset;
      state.servers["remote-1"] = {
        id: "remote-1",
        kind: "remote",
        ice: [],
        root: [asset.id],
      };
      asset.rezzed = true;
      evalEffect(
        { state, sourceId: asset.id },
        fx.do({ kind: "place_hosted_credits", amount: 6 }),
      );
      expect(asset.hostedCredits).toBe(6);
      const clicksBefore = state.corp.clicks;
      // Drain to empty
      evalEffect(
        { state, sourceId: asset.id },
        fx.do({ kind: "take_hosted_credits", amount: 6 }),
      );
      expect(asset.hostedCredits).toBe(0);
      expect(state.corp.clicks).toBe(clicksBefore + 2);
    });

    it("Principia discounts install per icebreaker; Rising Tide heap strength", () => {
      const p = getCardDef("principia");
      expect(p.installCostDiscountPerInstalledIcebreaker).toBe(1);
      expect(p.breaker?.breaksSubtype).toBe("barrier");
      const r = getCardDef("rising-tide");
      expect(r.strengthBonusPerHeapSubtype).toEqual({
        subtype: "fracter",
        bonus: 1,
      });
      const state = createGame({ seed: 3 });
      const tide = instantiateCard("rising-tide", "tide1", "runner:installed");
      state.cards[tide.id] = tide;
      state.runner.installed.push(tide.id);
      expect(effectiveBreakerStrength(state, tide.id)).toBe(1);
      const heapFracter = instantiateCard("cleaver", "cleaver1", "runner:heap");
      state.cards[heapFracter.id] = heapFracter;
      state.runner.discardPile.push(heapFracter.id);
      expect(effectiveBreakerStrength(state, tide.id)).toBe(2);
    });

    it("Greenmail scores for 2¢ and forfeits for 4¢", () => {
      const g = getCardDef("greenmail");
      expect(g.onScore).toEqual(fx.gainCredits("corp", 2));
      expect(g.onForfeit).toEqual(fx.gainCredits("corp", 4));
    });
  });
  });

  describe("elev-v104-b-slice", () => {

  beforeAll(() => {
    if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
    if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
    assertPinnedTag("v26.03");
    assertCardsPinnedTag("v1.147.6");
  });

  describe("Elevation v1.04.0 B-slice", () => {

    it("Lie Low is a double with draw/remove-tags choice", () => {
      const c = getCardDef("lie-low");
      expect(c.playAdditionalClick).toBe(true);
      expect(c.onPlay?.op).toBe("choose");
    });

    it("Measured Response requires Threat 4 + successful run last turn", () => {
      const c = getCardDef("measured-response");
      expect(c.playRequiresThreat).toBe(4);
      expect(c.playRequiresSuccessfulRunLastTurn).toBe(true);
      expect(c.onPlay?.op).toBe("choose");
    });

    it("Kessleroid cannot be trashed while rezzed; dual ETR", () => {
      const c = getCardDef("kessleroid");
      expect(c.cannotBeTrashedByRunnerWhileRezzed).toBe(true);
      expect(c.subroutines).toHaveLength(2);
    });

    it("Scatter Field gains +4 when sole ice", () => {
      const c = getCardDef("scatter-field");
      expect(c.strengthBonusIfSoleIceProtectingServer).toBe(4);
      const state = createGame({ seed: 1 });
      const ice = instantiateCard("scatter-field", "sf1", "server:hq:ice");
      state.cards[ice.id] = ice;
      state.servers.hq.ice = [ice.id];
      ice.rezzed = true;
      expect(effectiveIceStrength(state, ice.id)).toBe((c.strength ?? 0) + 4);
      const other = instantiateCard("ice-wall", "iw1", "server:hq:ice");
      state.cards[other.id] = other;
      state.servers.hq.ice.push(other.id);
      expect(effectiveIceStrength(state, ice.id)).toBe(c.strength ?? 0);
    });

    it("Semak-samun requires fracter to break", () => {
      const c = getCardDef("semak-samun");
      expect(c.cannotBreakExceptSubtype).toBe("fracter");
      expect(c.subroutines).toHaveLength(1);
    });

    it("Fransofia Ward bumps ice rez and trash-bypasses at Corp ≥15¢", () => {
      const c = getCardDef("fransofia-ward");
      expect(c.iceRezCostIncrease).toBe(1);
      const ab = c.paidAbilities?.[0];
      expect(ab?.requiresCorpCreditsGte).toBe(15);
      expect(ab?.cost?.trashSelf).toBe(true);
      expect(ab?.effect).toEqual(fx.do({ kind: "bypass_current_ice" }));
    });
  });
  });

  describe("elev-v105-b-slice", () => {

  beforeAll(() => {
    if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
    if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
    assertPinnedTag("v26.03");
    assertCardsPinnedTag("v1.147.6");
  });

  describe("Elevation v1.05.0 B-slice", () => {

    it("Bumi 1.0 may trash trojan on rez; dual subs", () => {
      const c = getCardDef("bumi-1-0");
      expect(c.onRez).toBeDefined();
      expect(JSON.stringify(c.onRez)).toContain("includeSubtypes");
      expect(c.subroutines).toHaveLength(2);
    });

    it("Ritual draws per clicks remaining", () => {
      expect(getCardDef("ritual").onPlay).toEqual({
        op: "do",
        action: {
          kind: "draw",
          side: "runner",
          amount: 0,
          tally: { count: "clicks_remaining", per: 1, side: "runner" },
        },
      });
    });

    it("Sang Kancil discounts pump when run event active", () => {
      const c = getCardDef("sang-kancil");
      expect(c.breaker?.breaksSubtype).toBe("code gate");
      expect(c.paidAbilityCreditDiscountIfRunEventActive).toBe(2);
    });

    it("Transfer of Wealth runs HQ and scales gains from Corp credit loss", () => {
      const c = getCardDef("transfer-of-wealth");
      expect(c.runEvent?.servers).toBe("hq");
      expect(JSON.stringify(c.runEvent?.onSuccessfulRun)).toContain(
        "gainPerCreditLost",
      );
    });

    it("Public Access Plaza PAD + threat trash tags", () => {
      const c = getCardDef("public-access-plaza");
      expect(c.onTurnBegin).toEqual(fx.gainCredits("corp", 1));
      expect(c.threatGiveTagsOnRezzedTrash).toEqual({ level: 2, tags: 1 });
    });

    it("Scrounge is double: install from heap + may stack-bottom", () => {
      const c = getCardDef("scrounge");
      expect(c.playAdditionalClick).toBe(true);
      expect(JSON.stringify(c.onPlay)).toContain("install_from_heap");
      expect(JSON.stringify(c.onPlay)).toContain(
        "may_add_from_heap_to_stack_bottom",
      );
    });
  });
  });

  describe("elev-v106-b-slice", () => {

  beforeAll(() => {
    if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
    if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
    assertPinnedTag("v26.03");
    assertCardsPinnedTag("v1.147.6");
  });

  describe("Elevation v1.06.0 B-slice", () => {

    it("Topan installs from grip with thenOnInstall meat", () => {
      const ab = getCardDef("topan-ormas-leader").paidAbilities?.[0];
      expect(ab?.flag).toBe("once_per_turn");
      expect(JSON.stringify(ab?.effect)).toContain("thenOnInstall");
      expect(JSON.stringify(ab?.effect)).toContain("meat_damage");
    });

    it("KPI chooses exactly 2 including ice install ignore costs", () => {
      const onPlay = getCardDef("key-performance-indicators").onPlay;
      expect(JSON.stringify(onPlay)).toContain("choose_exactly_n");
      expect(JSON.stringify(onPlay)).toContain(
        "install_ice_from_hq_ignore_costs",
      );
    });

    it("Open Market hosts install credits for connection/job only", () => {
      const c = getCardDef("open-market");
      expect(c.hostedCreditsOnInstall).toBe(6);
      expect(c.hostedCreditsSpendFor).toEqual(["install"]);
      expect(c.hostedCreditsSpendForInstallSubtypes).toEqual([
        "connection",
        "job",
      ]);
    });

    it("Gourmand access-trashes self for non-agenda then draw", () => {
      expect(getCardDef("gourmand").accessTrashSelfNonAgendaThenDraw).toBe(true);
    });
  });
  });

  describe("elev-v107-b-slice", () => {

  beforeAll(() => {
    if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
    if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
    assertPinnedTag("v26.03");
    assertCardsPinnedTag("v1.147.6");
  });

  describe("Elevation v1.07.0 B-slice", () => {

    it("Project Ingatan discard-phase hub uses agenda counters + Archives install", () => {
      const c = getCardDef("project-ingatan");
      expect(JSON.stringify(c.onScore)).toContain('"kind":"dividends"');
      expect(JSON.stringify(c.onScore)).toContain('"n":1');
      expect(JSON.stringify(c.onDiscardPhaseEnd)).toContain("agenda_counters_gte");
      expect(JSON.stringify(c.onDiscardPhaseEnd)).toContain(
        "remove_agenda_counters",
      );
      expect(JSON.stringify(c.onDiscardPhaseEnd)).toContain(
        "may_install_from_archives_ignore_costs",
      );
      expect(validateEffectTree(c.onDiscardPhaseEnd!)).toBeNull();
    });

    it("Embedded Reporting dividends 2 + search operation to top", () => {
      const c = getCardDef("embedded-reporting");
      expect(JSON.stringify(c.onScore)).toContain('"kind":"dividends"');
      expect(JSON.stringify(c.onScore)).toContain('"n":2');
      expect(JSON.stringify(c.onDiscardPhaseEnd)).toContain(
        "search_rd_operation_to_top_rd",
      );
    });

    it("Sericulture chooses advancements with cannot-score-this-turn", () => {
      const c = getCardDef("sericulture-expansion");
      expect(JSON.stringify(c.onDiscardPhaseEnd)).toContain('"pick":"choose"');
      expect(JSON.stringify(c.onDiscardPhaseEnd)).toContain(
        "cannotScoreTargetThisTurn",
      );
    });

    it("Side Hustle credits on install/run begin and hosted threshold", () => {
      const c = getCardDef("side-hustle");
      expect(c.drawOnHostedEmpty).toBe(1);
      expect(c.onHostedCreditsGte?.amount).toBe(6);
      expect(JSON.stringify(c.onInstall)).toContain("place_hosted_credits");
      expect(JSON.stringify(c.onRunBegin)).toContain("place_hosted_credits");
      expect(JSON.stringify(c.onHostedCreditsGte?.effect)).toContain(
        "take_hosted_credits",
      );
    });

    it("LEO mandatory trash bioroid on attacked server then ETR", () => {
      const ab = getCardDef("leo-construction-labor-solutions").paidAbilities?.[0];
      expect(ab?.flag).toBe("once_per_turn");
      expect(JSON.stringify(ab?.effect)).toContain("trash_installed");
      expect(JSON.stringify(ab?.effect)).toContain("bioroid");
      expect(JSON.stringify(ab?.effect)).toContain("end_the_run");
    });

    it("Synapse fires onRemoveTags from identity + HQ install ignore costs", () => {
      const c = getCardDef("synapse-global-faster-than-thought");
      expect(c.onRemoveTags).toBeDefined();
      expect(JSON.stringify(c.onRemoveTags)).toContain(
        "may_install_from_hq_ignore_costs",
      );
      expect(validateEffectTree(c.onRemoveTags!)).toBeNull();
    });

    it("PT Untaian HQ gate + unrezzed place advancements", () => {
      const c = getCardDef("pt-untaian-lifes-building-blocks");
      expect(JSON.stringify(c.onDiscardPhaseEnd)).toContain("hq_count_lte");
      expect(JSON.stringify(c.onDiscardPhaseEnd)).toContain("unrezzedOnly");
      expect(JSON.stringify(c.onDiscardPhaseEnd)).toContain(
        "cannotScoreTargetThisTurn",
      );
    });

    it("Off the Books search reveal install-or-HQ", () => {
      const c = getCardDef("off-the-books");
      expect(JSON.stringify(c.onDiscardPhaseEnd)).toContain(
        "search_rd_reveal_may_install_ignore_costs_else_hq",
      );
    });
  });
  });

  describe("elev-v108-b-slice", () => {

  beforeAll(() => {
    if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
    if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
    assertPinnedTag("v26.03");
    assertCardsPinnedTag("v1.147.6");
  });

  describe("Elevation v1.08.0 B-slice", () => {

    it("Humanoid Resources paid seq: gain, draw, HQ installs, play operation", () => {
      const ab = getCardDef("humanoid-resources").paidAbilities?.[0];
      const s = JSON.stringify(ab?.effect);
      expect(s).toContain("gain_credits");
      expect(s).toContain("may_install_from_hq_paying_costs");
      expect(s).toContain("may_play_operation_from_hq");
      expect(ab?.effect).toBeDefined();
      expect(validateEffectTree(ab!.effect)).toBeNull();
    });

    it("Next Big Thing agenda counter ability + shuffle any HQ", () => {
      const c = getCardDef("next-big-thing");
      expect(JSON.stringify(c.onScore)).toContain("add_agenda_counter");
      expect(c.paidAbilities?.[0]?.usableFromRunnerScoreArea).toBe(true);
      expect(JSON.stringify(c.paidAbilities?.[0]?.effect)).toContain(
        "shuffle_any_number_hq_to_rd",
      );
    });

    it("Poétrï scores look R&D install non-agenda; stolen HQ install", () => {
      const c = getCardDef("poetri-luxury-brands-all-the-rage");
      expect(JSON.stringify(c.onAgendaScored)).toContain(
        "look_top_n_rd_may_install_one",
      );
      expect(JSON.stringify(c.onAgendaScored)).toContain("excludeAgenda");
      expect(JSON.stringify(c.onAgendaStolen)).toContain(
        "may_install_from_hq_paying_costs",
      );
      expect(JSON.stringify(c.onAgendaStolen)).toContain("excludeAgenda");
    });

    it("Phật Gioan discard power + first agenda scored/stolen net", () => {
      const c = getCardDef("phat-gioan-baotixita");
      expect(JSON.stringify(c.onDiscardPhaseEnd)).toContain("add_power_counter");
      expect(JSON.stringify(c.onFirstAgendaScoredOrStolenThisTurn)).toContain(
        "may_remove_power_counters_then_net_damage",
      );
    });

    it("Biawak optional forfeit rez discount + destroyer subs", () => {
      const c = getCardDef("biawak");
      expect(c.rezCostCreditDiscountOnForfeitAgenda).toBe(10);
      expect(c.subroutines?.length).toBe(3);
    });

    it("Cacophony first steal/trash power + action phase end sabotage", () => {
      const c = getCardDef("cacophony");
      expect(c.onFirstRunnerStoleOrTrashedCorpCardThisTurn).toBeDefined();
      expect(JSON.stringify(c.onRunnerActionPhaseEnd)).toContain("sabotage");
      expect(JSON.stringify(c.onRunnerActionPhaseEnd)).toContain(
        "remove_power_counter",
      );
    });

    it("Mercia Corp action phase end ice install discount + move", () => {
      const c = getCardDef("mercia-b4ll4rd");
      expect(JSON.stringify(c.onCorpActionPhaseEnd)).toContain(
        "may_install_ice_from_hq_discount_then_move_source",
      );
      expect(validateEffectTree(c.onCorpActionPhaseEnd!)).toBeNull();
    });
  });
  });

  describe("elev-v109-b-slice", () => {

  beforeAll(() => {
    if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
    if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
    assertPinnedTag("v26.03");
    assertCardsPinnedTag("v1.147.6");
  });

  describe("Elevation v1.09.0 B-slice", () => {

    it("Touch-ups additional click + advancements + grip shuffle IR", () => {
      const c = getCardDef("touch-ups");
      expect(c.playAdditionalClick).toBe(true);
      expect(JSON.stringify(c.onPlay)).toContain("place_advancements");
      expect(JSON.stringify(c.onPlay)).toContain("choose_type_shuffle_grip");
      expect(validateEffectTree(c.onPlay!)).toBeNull();
    });

    it("Knickknack first run begin trash-other printed install draw", () => {
      const c = getCardDef("knickknack-obrian");
      expect(JSON.stringify(c.onFirstRunBeginThisTurn)).toContain(
        "may_trash_other_installed_gain_printed_install_and_draw",
      );
    });

    it("Barry onAnyIceRez may install resource/hardware from grip", () => {
      const c = getCardDef("barry-baz-wong-tri-maf-veteran");
      expect(JSON.stringify(c.onAnyIceRez)).toContain("may_install_from_grip");
      expect(JSON.stringify(c.onAnyIceRez)).toContain("hardware");
    });

    it("Proprionegation agenda counter + Archives reposition paid ability", () => {
      const c = getCardDef("proprionegation");
      expect(JSON.stringify(c.onScore)).toContain("add_agenda_counter");
      expect(c.paidAbilities?.[0]?.requireDuringRun).toBe(true);
      expect(JSON.stringify(c.paidAbilities?.[0]?.effect)).toContain(
        "move_runner_to_archives_outermost",
      );
    });

    it("Mycoweb four subroutines (Archives install, rez discount, resolve subs)", () => {
      const c = getCardDef("mycoweb");
      expect(c.subroutines?.length).toBe(4);
      const s = JSON.stringify(c.subroutines);
      expect(s).toContain("may_install_from_archives_ignore_costs");
      expect(s).toContain("may_rez_installed_ice_discount");
      expect(s).toContain("may_resolve_subroutine_on_rezzed_ice");
    });

    it("Mahkota recurring + persistent + root trash bonus", () => {
      const c = getCardDef("mahkota-langit-grid");
      expect(c.recurringCreditsMax).toBe(2);
      expect(c.recurringSpendFor).toEqual(["rez_host_server"]);
      expect(c.persistent).toBe(true);
      expect(c.serverRootAssetTrashCostBonus).toBe(2);
    });
  });
  });

  describe("elev-v110-b-slice", () => {

  beforeAll(() => {
    if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
    if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
    assertPinnedTag("v26.03");
    assertCardsPinnedTag("v1.147.6");
  });

  describe("Elevation v1.10.0 B-slice", () => {

    it("MuslihaT turn begin look-top reveal breaker/run event IR", () => {
      const c = getCardDef("muslihat-multifarious-marketeer");
      expect(JSON.stringify(c.onTurnBegin)).toContain(
        "look_top_stack_may_reveal_breaker_or_run_event",
      );
      expect(validateEffectTree(c.onTurnBegin!)).toBeNull();
    });

    it("Nebula action phase end flip + flipped hooks", () => {
      const c = getCardDef("nebula-talent-management-making-stars");
      expect(JSON.stringify(c.onCorpActionPhaseEnd)).toContain(
        "corp_played_operation_this_turn",
      );
      expect(JSON.stringify(c.onCorpActionPhaseEnd)).toContain("flip_identity");
      expect(c.identityFlippedHooks?.onFirstOperationPlayThisTurn).toBeDefined();
      expect(validateEffectTree(c.onCorpActionPhaseEnd!)).toBeNull();
    });

    it("Petty Cash gate + Archives paid ability", () => {
      const c = getCardDef("petty-cash");
      expect(c.playRequiresNoCorpActionFinished).toBe(true);
      expect(JSON.stringify(c.onPlay)).toContain("played_from_non_hq");
      expect(c.paidAbilities?.[0]?.usableFromArchives).toBe(true);
      expect(JSON.stringify(c.paidAbilities?.[0]?.effect)).toContain(
        "play_self_from_archives_then_rfg",
      );
    });

    it("Peer Review single onPlay primitive", () => {
      const c = getCardDef("peer-review");
      expect(JSON.stringify(c.onPlay)).toContain("peer_review");
      expect(validateEffectTree(c.onPlay!)).toBeNull();
    });
  });
  });

  describe("elev-v111-b-slice", () => {

  beforeAll(() => {
    if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
    if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
    assertPinnedTag("v26.03");
    assertCardsPinnedTag("v1.147.6");
  });

  describe("Elevation v1.11.0 B-slice", () => {

    it("Mitra Aman onApproachIce may trash + swap primitive", () => {
      const c = getCardDef("mitra-aman");
      expect(JSON.stringify(c.onApproachIce)).toContain("mitra_aman_approach_ice");
      expect(validateEffectTree(c.onApproachIce!)).toBeNull();
    });

    it("Bigger Picture tagged gate + remove-tags mode", () => {
      const c = getCardDef("bigger-picture");
      expect(c.playRequiresTagged).toBe(true);
      expect(JSON.stringify(c.onPlay)).toContain("remove_bigger_picture_tags");
      expect(validateEffectTree(c.onPlay!)).toBeNull();
    });

    it("Aggressive Trendsetting scored hook + corp allotted click", () => {
      const c = getCardDef("aggressive-trendsetting");
      expect(JSON.stringify(c.onFirstCorpCardTrashEachTurn)).toContain(
        "allotted_clicks_next_turn",
      );
      expect(validateEffectTree(c.onFirstCorpCardTrashEachTurn!)).toBeNull();
    });

    it("Plutus rez additional cost + Archives transaction on turn begin", () => {
      const c = getCardDef("plutus");
      expect(JSON.stringify(c.rezAdditionalCost)).toContain(
        "pay_rez_additional_cost",
      );
      expect(JSON.stringify(c.onTurnBegin)).toContain(
        "may_play_transaction_from_archives",
      );
    });

    it("IP Enforcement tag-cost + install from Runner score", () => {
      const c = getCardDef("ip-enforcement");
      expect(JSON.stringify(c.playAdditionalCost)).toContain(
        "remove_enforcement_tags",
      );
      expect(JSON.stringify(c.onPlay)).toContain(
        "install_from_runner_score",
      );
    });

    it("Maintenance Access click + Archives→HQ approach redirect", () => {
      const c = getCardDef("maintenance-access");
      expect(c.playAdditionalClick).toBe(true);
      expect(c.runEvent?.redirectApproachArchivesToHq).toBe(true);
      expect(c.runEvent?.servers).toBe("archives");
    });
  });
  });

  describe("elev-v112-a-slice", () => {

  beforeAll(() => {
    if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
    if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
    assertPinnedTag("v26.03");
  });

  describe("Elevation v1.12.0 Slice A (local cards-data)", () => {

    it("Madani paid abilities validate", () => {
      const c = getCardDef("madani");
      if ((c.unsupported ?? []).length) return;
      expect(c.paidAbilities?.length).toBe(2);
      for (const ab of c.paidAbilities ?? []) {
        expect(validateEffectTree(ab.effect)).toBeNull();
      }
    });

    it("GAMEDRAGON host + pump fields", () => {
      const c = getCardDef("gamedragon-pro");
      if ((c.unsupported ?? []).length) return;
      expect(c.hostIcebreakerStrengthBonus).toBe(1);
      expect(c.extendsHostBreakerPumpToRun).toBe(true);
      expect(validateEffectTree(c.onInstall!)).toBeNull();
    });
  });
  });

  describe("elev-v112-b-slice", () => {

  beforeAll(() => {
    if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
    if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
    assertPinnedTag("v26.03");
    assertCardsPinnedTag("v1.147.6");
  });

  describe("Elevation v1.12.0 final B-slice", () => {

    it("Ryō Phoenix successful-run-after-sub primitive", () => {
      const c = getCardDef("ryo-phoenix-ono-out-of-the-ashes");
      expect(JSON.stringify(c.onSuccessfulRun)).toContain(
        "ryo_phoenix_on_successful_run",
      );
      expect(validateEffectTree(c.onSuccessfulRun!)).toBeNull();
    });

    it("Dewi flip + MU conditions", () => {
      const c = getCardDef("dewi-subrotoputri-pedagogical-dhalang");
      expect(JSON.stringify(c.onSuccessfulRun)).toContain("runner_mu_full");
      expect(JSON.stringify(c.onSuccessfulRun)).toContain("flip_identity");
      expect(validateEffectTree(c.onSuccessfulRun!)).toBeNull();
    });

    it("Charm Offensive Archives onRunEnd trash rezzed copy", () => {
      const c = getCardDef("charm-offensive");
      expect(JSON.stringify(c.runEvent?.onRunEnd)).toContain(
        "trash_rezzed_accessed",
      );
      expect(validateEffectTree(c.runEvent!.onRunEnd!)).toBeNull();
    });

    it("Shred first ETR prevention flag", () => {
      const c = getCardDef("shred");
      expect(c.runEvent?.shredPreventFirstEndTheRun).toBe(true);
      expect(c.runEvent?.servers).toBe("any");
    });

    it("Bling MU + free-install host + discard trash hosted", () => {
      const c = getCardDef("bling");
      expect(c.muBonus).toBe(1);
      expect(c.hostedCardsPlayableAsGrip).toBe(true);
      expect(JSON.stringify(c.onInstallWithoutSpendingCredits)).toContain(
        "host_top_of_stack_on_source",
      );
      expect(JSON.stringify(c.onDiscardPhaseEnd)).toContain(
        "trash_all_hosted_cards",
      );
    });

    it("Detente HQ host + any-player return access", () => {
      const c = getCardDef("detente");
      expect(c.muBonus).toBe(1);
      expect(JSON.stringify(c.onFirstSuccessfulHqRunThisTurn)).toContain(
        "host_random_hq",
      );
      const ab = c.paidAbilities?.find((a) => a.id === "detente-return-access");
      expect(ab?.usableByAnyPlayer).toBe(true);
      expect(JSON.stringify(ab?.effect)).toContain(
        "return_two_hosted_may_access",
      );
      expect(validateEffectTree(ab!.effect)).toBeNull();
    });

    it("Madani host/install paid abilities", () => {
      const c = getCardDef("madani");
      expect(c.paidAbilities?.length).toBe(2);
      for (const ab of c.paidAbilities ?? []) {
        expect(validateEffectTree(ab.effect)).toBeNull();
      }
    });

    it("GAMEDRAGON host on icebreaker + pump duration", () => {
      const c = getCardDef("gamedragon-pro");
      expect(c.hostIcebreakerStrengthBonus).toBe(1);
      expect(c.extendsHostBreakerPumpToRun).toBe(true);
      expect(JSON.stringify(c.onInstall)).toContain(
        "gamedragon_may_host_on_icebreaker",
      );
      expect(validateEffectTree(c.onInstall!)).toBeNull();
    });

    it("Au Co damage/HQ-trash power + look R&D", () => {
      const c = getCardDef("au-co-the-gold-standard-in-clones");
      expect(c.powerCounterOnDamageOrTrashFromHq).toBe(true);
      expect(JSON.stringify(c.onTurnBegin)).toContain("remove_co_2_look_rd");
      expect(validateEffectTree(c.onTurnBegin!)).toBeNull();
    });

    it("Bangun faceup agendas + access meat/tag", () => {
      const c = getCardDef("bangun-when-disaster-strikes");
      expect(c.mayInstallAgendasFaceup).toBe(true);
      expect(JSON.stringify(c.onAccessFaceupInstalledAgenda)).toContain(
        "meat_damage",
      );
      expect(validateEffectTree(c.onAccessFaceupInstalledAgenda!)).toBeNull();
    });
  });
  });
});
