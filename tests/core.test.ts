/**
 * core play tests.
 */
import { describe, expect, it, beforeAll } from "vitest";
import {
  assertCardsPinnedTag,
  assertPinnedTag,
  cardsDataPresent,
  crDataPresent,
  createInitialState,
  evalEffect,
  getCardDef,
  instantiateCard,
  validateEffectTree,
  moveRunnerCardToHeap,
  fx,
} from "../src/index.js";
import {
  beginExpose,
  acceptPendingExpose,
  preventPendingExpose,
} from "../src/state/expose.js";
import {
  maybeOpenTrashPrevent,
  preventPendingInstalledTrash,
} from "../src/state/trashPrevent.js";

describe("core", () => {
  describe("core-final-7-clears", () => {

  beforeAll(() => {
    if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
    if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
    assertPinnedTag("v26.03");
    assertCardsPinnedTag("v1.147.7");
  });

  describe("FFG Core Set final 7 clears", () => {

    it("Infiltration choose gain 2¢ or expose", () => {
      const def = getCardDef("infiltration");
      expect(validateEffectTree(def.onPlay!)).toBeNull();
      expect(JSON.stringify(def.onPlay)).toContain("expose");
      expect(JSON.stringify(def.onPlay)).toContain("gain_credits");

      const s = structuredClone(createInitialState());
      s.servers["remote-1"] = {
        id: "remote-1",
        kind: "remote",
        ice: [],
        root: ["asset-1"],
      };
      const asset = instantiateCard("melange-mining-corp", "asset-1", "server:remote-1:root");
      asset.rezzed = false;
      asset.faceup = false;
      s.cards["asset-1"] = asset;
      const r = evalEffect(
        { state: s, sourceId: "runner-id" },
        {
          op: "do",
          action: { kind: "expose", pick: "choose", cardId: "asset-1" },
        },
      );
      expect(r.ok).toBe(true);
      expect(s.cards["asset-1"]!.faceup).toBe(true);
    });

    it("Lemuria requires successful HQ run this turn + expose IR", () => {
      const def = getCardDef("lemuria-codecracker");
      const ab = def.paidAbilities![0]!;
      expect(ab.requiresSuccessfulHqRunThisTurn).toBe(true);
      expect(ab.windows).toContain("runner_action_paw");
      expect(validateEffectTree(ab.effect)).toBeNull();
      expect(JSON.stringify(ab.effect)).toContain("expose");
    });

    it("Zaibatsu may-rez + prevent expose interrupt (smoke interrupt chain)", () => {
      const def = getCardDef("zaibatsu-loyalty");
      expect(def.mayRezWhenCardWouldBeExposed).toBe(true);
      expect(def.paidAbilities?.some((a) => a.windows.includes("expose_interrupt"))).toBe(
        true,
      );
      for (const ab of def.paidAbilities ?? []) {
        expect(validateEffectTree(ab.effect)).toBeNull();
      }

      const s = structuredClone(createInitialState());
      s.servers["remote-1"] = {
        id: "remote-1",
        kind: "remote",
        ice: [],
        root: ["zb", "hidden"],
      };
      const zb = instantiateCard("zaibatsu-loyalty", "zb", "server:remote-1:root");
      zb.rezzed = false;
      zb.faceup = false;
      s.cards["zb"] = zb;
      const hidden = instantiateCard(
        "melange-mining-corp",
        "hidden",
        "server:remote-1:root",
      );
      hidden.rezzed = false;
      hidden.faceup = false;
      s.cards["hidden"] = hidden;
      s.corp.credits = 5;

      const status = beginExpose(s, "hidden");
      expect(status).toBe("pending");
      expect(s.pendingExpose?.phase).toBe("may_rez");
      expect(s.pendingChoice?.options.some((o) => o.id === "zaibatsu-rez:zb")).toBe(
        true,
      );

      // Decline may-rez → interrupt if Zaibatsu were rezzed; rez it first then prevent.
      const rez = evalEffect(
        { state: s, sourceId: "zb" },
        { op: "do", action: { kind: "rez_for_expose_interrupt", cardId: "zb" } },
      );
      expect(rez.ok).toBe(true);
      expect(s.cards["zb"]!.rezzed).toBe(true);
      expect(s.pendingExpose?.phase).toBe("interrupt");

      preventPendingExpose(s, 1);
      expect(s.pendingExpose).toBeNull();
      expect(s.cards["hidden"]!.faceup).toBe(false);
    });

    it("expose accept path faces the card up", () => {
      const s = structuredClone(createInitialState());
      s.servers["remote-1"] = {
        id: "remote-1",
        kind: "remote",
        ice: [],
        root: ["hidden"],
      };
      const hidden = instantiateCard(
        "melange-mining-corp",
        "hidden",
        "server:remote-1:root",
      );
      hidden.rezzed = false;
      hidden.faceup = false;
      s.cards["hidden"] = hidden;
      beginExpose(s, "hidden");
      if (s.pendingExpose?.phase === "interrupt") {
        acceptPendingExpose(s);
      }
      expect(s.cards["hidden"]!.faceup).toBe(true);
    });

    it("Chum registers next-ice strength + conditional net", () => {
      const def = getCardDef("chum");
      expect(validateEffectTree(def.subroutines![0]!.effect)).toBeNull();
      expect(JSON.stringify(def.subroutines![0]!.effect)).toContain(
        "chum_register_next_ice",
      );

      const s = structuredClone(createInitialState());
      const chum = instantiateCard("chum", "chum-ice", "server:hq:ice");
      s.cards["chum-ice"] = chum;
      s.servers.hq.ice.push("chum-ice");
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
      };
      const r = evalEffect(
        { state: s, sourceId: "chum-ice" },
        {
          op: "do",
          action: {
            kind: "chum_register_next_ice",
            strengthBonus: 2,
            netDamageIfNotFullyBroken: 3,
          },
        },
      );
      expect(r.ok).toBe(true);
      expect(s.run!.chumNextIce).toEqual({
        strengthBonus: 2,
        netDamageIfNotFullyBroken: 3,
      });
    });

    it("Account Siphon may-instead-of-breach IR", () => {
      const def = getCardDef("account-siphon");
      expect(def.runEvent?.servers).toBe("hq");
      expect(validateEffectTree(def.runEvent!.onSuccessfulRun!)).toBeNull();
      expect(JSON.stringify(def.runEvent!.onSuccessfulRun)).toContain(
        "may_breach_instead_account_siphon",
      );

      const s = structuredClone(createInitialState());
      s.corp.credits = 7;
      s.runner.credits = 0;
      s.runner.tags = 0;
      s.run = {
        attackedServerId: "hq",
        phase: "success",
        position: null,
        successful: true,
        accessedCardIds: [],
        accessCandidates: [],
        randomAccessLimit: null,
        endedTheRun: false,
        cannotJackOut: false,
        strengthBoosts: {},
        encounterStrengthBoosts: {},
        iceStrengthBoosts: {},
      };
      const offer = evalEffect(
        { state: s, sourceId: "siphon" },
        {
          op: "do",
          action: { kind: "may_breach_instead_account_siphon" },
        },
      );
      expect(offer.ok).toBe(true);
      expect(s.pendingChoice?.chooser).toBe("runner");
      const resolve = evalEffect(
        { state: s, sourceId: "siphon" },
        {
          op: "do",
          action: { kind: "resolve_account_siphon", loseAmount: 5 },
        },
      );
      expect(resolve.ok).toBe(true);
      expect(s.run!.skipBreach).toBe(true);
      expect(s.corp.credits).toBe(2);
      expect(s.runner.credits).toBe(10);
      expect(s.runner.tags).toBe(2);
    });

    it("ABT looks top N and may install+rez ice", () => {
      const def = getCardDef("accelerated-beta-test");
      expect(validateEffectTree(def.onScore!)).toBeNull();
      expect(JSON.stringify(def.onScore)).toContain("accelerated_beta_test");

      const s = structuredClone(createInitialState());
      const ice = instantiateCard("shadow", "ice-look", "corp:rd");
      const op = instantiateCard("aggressive-negotiation", "op-look", "corp:rd");
      const ice2 = instantiateCard("data-mine", "ice2-look", "corp:rd");
      s.cards["ice-look"] = ice;
      s.cards["op-look"] = op;
      s.cards["ice2-look"] = ice2;
      s.corp.deck = ["ice-look", "op-look", "ice2-look"];
      const r = evalEffect(
        { state: s, sourceId: "abt" },
        { op: "do", action: { kind: "accelerated_beta_test", n: 3 } },
      );
      expect(r.ok).toBe(true);
      expect(s.pendingChoice?.chooser).toBe("corp");
      expect(s.turn.rdLookedCards).toContain("ice-look");
    });

    it("Sacrificial Construct opens trash interrupt (prevent × trash smoke)", () => {
      const def = getCardDef("sacrificial-construct");
      const ab = def.paidAbilities![0]!;
      expect(ab.windows).toContain("trash_interrupt");
      expect(validateEffectTree(ab.effect)).toBeNull();

      const s = structuredClone(createInitialState());
      const sc = instantiateCard("sacrificial-construct", "sc", "runner:installed");
      s.cards["sc"] = sc;
      s.runner.installed.push("sc");
      const prog = instantiateCard("magnum-opus", "mo", "runner:installed");
      s.cards["mo"] = prog;
      s.runner.installed.push("mo");

      expect(maybeOpenTrashPrevent(s, "mo")).toBe(true);
      expect(s.pendingTrashPrevent?.cardId).toBe("mo");
      preventPendingInstalledTrash(s);
      expect(s.pendingTrashPrevent).toBeNull();
      expect(s.runner.installed).toContain("mo");

      // After prevent, a fresh trash with no interrupt payable goes through.
      s.runner.installed = s.runner.installed.filter((id) => id !== "sc");
      moveRunnerCardToHeap(s, "mo");
      expect(s.runner.discardPile).toContain("mo");
    });
  });

  describe("FFG Core Set set-complete gate", () => {

    it("interaction smoke — interrupt chain: Zaibatsu prevent × expose", () => {
      const s = structuredClone(createInitialState());
      s.servers["remote-1"] = {
        id: "remote-1",
        kind: "remote",
        ice: [],
        root: ["zb", "hidden"],
      };
      const zb = instantiateCard("zaibatsu-loyalty", "zb", "server:remote-1:root");
      zb.rezzed = true;
      zb.faceup = true;
      s.cards["zb"] = zb;
      const hidden = instantiateCard(
        "melange-mining-corp",
        "hidden",
        "server:remote-1:root",
      );
      hidden.rezzed = false;
      hidden.faceup = false;
      s.cards["hidden"] = hidden;
      s.corp.credits = 5;
      const status = beginExpose(s, "hidden");
      expect(status).toBe("pending");
      expect(s.pendingExpose?.phase).toBe("interrupt");
      preventPendingExpose(s, 1);
      expect(s.cards["hidden"]!.faceup).toBe(false);
    });

    it("interaction smoke — prevent × trash: Sacrificial Construct", () => {
      const s = structuredClone(createInitialState());
      const sc = instantiateCard("sacrificial-construct", "sc", "runner:installed");
      s.cards["sc"] = sc;
      s.runner.installed.push("sc");
      const hw = instantiateCard("desperado", "desp", "runner:installed");
      s.cards["desp"] = hw;
      s.runner.installed.push("desp");
      expect(maybeOpenTrashPrevent(s, "desp")).toBe(true);
      preventPendingInstalledTrash(s);
      expect(s.runner.installed).toContain("desp");
    });

    it("interaction smoke — success instead-of-breach: Account Siphon skipBreach", () => {
      const s = structuredClone(createInitialState());
      s.corp.credits = 4;
      s.run = {
        attackedServerId: "hq",
        phase: "success",
        position: null,
        successful: true,
        accessedCardIds: [],
        accessCandidates: [],
        randomAccessLimit: null,
        endedTheRun: false,
        cannotJackOut: false,
        strengthBoosts: {},
        encounterStrengthBoosts: {},
        iceStrengthBoosts: {},
      };
      const siphon = instantiateCard("account-siphon", "siphon", "runner:play-area");
      s.cards["siphon"] = siphon;
      evalEffect(
        { state: s, sourceId: "siphon" },
        {
          op: "do",
          action: { kind: "resolve_account_siphon", loseAmount: 4 },
        },
      );
      expect(s.run!.skipBreach).toBe(true);
      expect(s.corp.credits).toBe(0);
      expect(s.runner.credits).toBeGreaterThanOrEqual(8);
    });
  });
  });

  describe("core-kickoff", () => {

  beforeAll(() => {
    if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
    if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
    assertPinnedTag("v26.03");
    assertCardsPinnedTag("v1.147.7");
  });

  describe("FFG Core Set kickoff (floor v1.86.0 → set-complete v1.87.0)", () => {

    it("Magnum Opus click-gains 2¢", () => {
      const def = getCardDef("magnum-opus");
      const ab = def.paidAbilities![0]!;
      expect(ab.cost).toEqual({ clicks: 1 });
      expect(ab.effect).toEqual(fx.gainCredits("runner", 2));
      expect(validateEffectTree(ab.effect)).toBeNull();

      const s = structuredClone(createInitialState());
      const mo = instantiateCard("magnum-opus", "mo", "runner:installed");
      s.cards["mo"] = mo;
      s.runner.installed.push("mo");
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
      expect(ab.windows).toContain("tag_interrupt");
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
  });

  describe("core-v186-clears", () => {

  beforeAll(() => {
    if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
    if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
    assertPinnedTag("v26.03");
    assertCardsPinnedTag("v1.147.7");
  });

  describe("FFG Core Set additional clears (floor v1.86.0 → v1.87.0)", () => {

    it("Personal Touch hosts on icebreaker with +1 strength", () => {
      const def = getCardDef("the-personal-touch");
      expect(def.hostIcebreakerStrengthBonus).toBe(1);
      expect(JSON.stringify(def.onInstall)).toContain(
        "gamedragon_may_host_on_icebreaker",
      );
      expect(validateEffectTree(def.onInstall!)).toBeNull();
    });

    it("Rabbit Hole grants link and may install another copy", () => {
      const def = getCardDef("rabbit-hole");
      expect(def.link).toBe(1);
      expect(JSON.stringify(def.onInstall)).toContain(
        "search_stack_same_title_may_install_paying",
      );
      expect(validateEffectTree(def.onInstall!)).toBeNull();
    });

    it("Security Subcontract trashes rezzed ice for credits", () => {
      const def = getCardDef("security-subcontract");
      const ab = def.paidAbilities![0]!;
      expect(ab.requiresRezzedIce).toBe(true);
      expect(ab.cost).toEqual({ clicks: 1 });
      expect(JSON.stringify(ab.effect)).toContain("trash_rezzed_ice_gain_credits");
      expect(validateEffectTree(ab.effect)).toBeNull();
    });

    it("Shipment from MirrorMorph installs up to 3 from HQ", () => {
      const def = getCardDef("shipment-from-mirrormorph");
      expect(JSON.stringify(def.onPlay)).toContain(
        "install_up_to_from_hq_paying_costs",
      );
      expect(validateEffectTree(def.onPlay!)).toBeNull();
    });

    it("Déjà Vu pulls from heap (1 or up to 2 virus)", () => {
      const def = getCardDef("deja-vu");
      expect(JSON.stringify(def.onPlay)).toContain("deja_vu_from_heap");
      expect(validateEffectTree(def.onPlay!)).toBeNull();

      const s = structuredClone(createInitialState());
      const a = instantiateCard("deja-vu", "dv", "runner:grip");
      s.cards["dv"] = a;
      const v1 = instantiateCard("medium", "v1", "runner:heap");
      const v2 = instantiateCard("parasite", "v2", "runner:heap");
      const other = instantiateCard("magnum-opus", "mo", "runner:heap");
      s.cards["v1"] = v1;
      s.cards["v2"] = v2;
      s.cards["mo"] = other;
      s.runner.discardPile.push("v1", "v2", "mo");
      const r = evalEffect({ state: s, sourceId: "dv" }, def.onPlay!);
      expect(r.ok).toBe(true);
      expect(s.pendingChoice).toBeTruthy();
      expect(s.pendingChoice!.options.length).toBeGreaterThanOrEqual(4);
    });

    it("Djinn is a MU-capped daemon with virus search", () => {
      const def = getCardDef("djinn");
      expect(def.daemonHost).toBe(true);
      expect(def.daemonHostMaxMu).toBe(3);
      expect(def.daemonHostExcludeIcebreaker).toBe(true);
      const ab = def.paidAbilities![0]!;
      expect(JSON.stringify(ab.effect)).toContain(
        "search_stack_subtype_add_to_grip",
      );
      expect(validateEffectTree(ab.effect)).toBeNull();
    });

    it("Medium places virus on RD success and chooses breach bonus", () => {
      const def = getCardDef("medium");
      expect(def.chooseBonusAccessLessThanVirusOnRdBreach).toBe(true);
      expect(JSON.stringify(def.onSuccessfulRun)).toContain("add_virus_counter");
      expect(JSON.stringify(def.onSuccessfulRun)).toContain("attacking_rd");
      expect(validateEffectTree(def.onSuccessfulRun!)).toBeNull();
    });

    it("Demolition Run grants free access trash on HQ/R&D", () => {
      const def = getCardDef("demolition-run");
      expect(def.runEvent?.servers).toBe("hq_rd");
      expect(def.runEvent?.accessTrashFree).toBe(true);
    });

    it("Crash Space recurring spend for basic remove-tag", () => {
      const def = getCardDef("crash-space");
      expect(def.recurringSpendFor).toContain("basic_remove_tag");
    });

    it("Parasite trashes host at strength ≤0", () => {
      const def = getCardDef("parasite");
      expect(def.trashHostWhenStrengthLte).toBe(0);
    });

    it("Wyrm breaks only when ice strength ≤0", () => {
      const def = getCardDef("wyrm");
      expect(def.breaker?.breakRequiresIceStrengthLte).toBe(0);
    });

    it("Kate discounts first program/hardware install", () => {
      const def = getCardDef("kate-mac-mccaffrey-digital-tinker");
      expect(def.firstProgramOrHardwareInstallDiscount).toBe(1);
    });

    it("Noise trashes top of R&D on virus install", () => {
      const def = getCardDef("noise-hacker-extraordinaire");
      expect(JSON.stringify(def.onVirusProgramInstall)).toContain("trash_top_of_rd");
      expect(validateEffectTree(def.onVirusProgramInstall!)).toBeNull();
    });

    it("Posted Bounty may forfeit self for tag + BP", () => {
      const def = getCardDef("posted-bounty");
      expect(JSON.stringify(def.onScore)).toContain("forfeit_self");
      expect(validateEffectTree(def.onScore!)).toBeNull();
    });

    it("fx helpers still validate", () => {
      expect(validateEffectTree(fx.gainCredits("runner", 1))).toBeNull();
    });
  });
  });
});
