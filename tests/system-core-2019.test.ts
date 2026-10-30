/**
 * system-core-2019 play tests.
 */
import { describe, expect, it, beforeAll } from "vitest";
import {
  assertCardsPinnedTag,
  assertPinnedTag,
  cardsDataPresent,
  CR,
  crDataPresent,
  createGame,
  evalEffect,
  fx,
  getCardDef,
  instantiateCard,
  occurCheckpoint,
  validateEffectTree,
  createInitialState,
  boostTrace,
  effectiveIceStrength,
  startTrace,
  canPayCost,
  payCost,
  effectiveIceSubtypes,
  isRunTargetAllowed,
  effectiveBreakerStrength,
} from "../src/index.js";
import {
  memoryLimit,
  usedMemory,
} from "../src/state/turn.js";
import {
  beginBreachAccess,
  refreshRdDeckCandidate,
} from "../src/state/access.js";
import {
  corpCreditsForTrace,
} from "../src/state/trace.js";
import {
  creditsAvailableForInstall,
  spendCreditsForInstall,
} from "../src/state/costs.js";
import {
  fireHostedCreditsOnAnyIceRez,
} from "../src/state/powerCounters.js";
import {
  modifiersFromStartsRun,
} from "../src/state/runStart.js";
import type {
  GameState,
} from "../src/state/types.js";
import {
  noteRunnerClickSpend,
} from "../src/state/clickHooks.js";

describe("system-core-2019", () => {
  describe("sc19-v159-kickoff", () => {

  beforeAll(() => {
    if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
    if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
    assertPinnedTag("v26.03");
    assertCardsPinnedTag("v1.147.13");
  });

  describe("System Core 2019 v1.59.0 kickoff", () => {

    it("Easy Mark gains 3¢ on play", () => {
      const def = getCardDef("easy-mark");
      expect(def.playCost).toBe(0);
      expect(def.onPlay).toEqual(fx.gainCredits("runner", 3));
      expect(validateEffectTree(def.onPlay!)).toBeNull();

      const state = createGame({ seed: 1 });
      const card = instantiateCard("easy-mark", "em1", "runner:grip");
      state.cards[card.id] = card;
      const before = state.runner.credits;
      const gain = evalEffect(
        { state, sourceId: card.id },
        fx.gainCredits("runner", 3),
      );
      expect(gain.ok).toBe(true);
      expect(state.runner.credits).toBe(before + 3);
    });

    it("Beanstalk Royalties gains 3¢ on play", () => {
      const def = getCardDef("beanstalk-royalties");
      expect(def.playCost).toBe(0);
      expect(def.onPlay).toEqual(fx.gainCredits("corp", 3));
      expect(validateEffectTree(def.onPlay!)).toBeNull();
    });

    it("Wall of Static is a barrier with one ETR subroutine", () => {
      const def = getCardDef("wall-of-static");
      expect(def.subtypes).toContain("barrier");
      expect(def.strength).toBe(3);
      expect(def.subroutines).toHaveLength(1);
      expect(def.subroutines![0].effect).toEqual(fx.etr());
      expect(validateEffectTree(def.subroutines![0].effect)).toBeNull();
    });

    it("Akamatsu Mem Chip grants +1 MU", () => {
      const def = getCardDef("akamatsu-mem-chip");
      expect(def.muBonus).toBe(1);
      expect(def.installCost).toBe(1);
      expect(def.subtypes).toContain("chip");
    });

    it("Spiderweb is a barrier with three ETR subroutines", () => {
      const def = getCardDef("spiderweb");
      expect(def.subtypes).toContain("barrier");
      expect(def.strength).toBe(2);
      expect(def.subroutines).toHaveLength(3);
      for (const sub of def.subroutines!) {
        expect(sub.effect).toEqual(fx.etr());
        expect(validateEffectTree(sub.effect)).toBeNull();
      }
    });
  });
  });

  describe("sc19-v160-a-slice", () => {

  beforeAll(() => {
    if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
    if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
    assertPinnedTag("v26.03");
    assertCardsPinnedTag("v1.147.13");
  });

  describe("System Core 2019 v1.60.0 A-slice", () => {

    it("Neural Katana does 3 net damage", () => {
      const def = getCardDef("neural-katana");
      expect(def.subroutines).toHaveLength(1);
      expect(def.subroutines![0].effect).toEqual(fx.netDamage(3));
      expect(validateEffectTree(def.subroutines![0].effect)).toBeNull();
    });

    it("Wall of Thorns does 2 net then ETR", () => {
      const def = getCardDef("wall-of-thorns");
      expect(def.subroutines).toHaveLength(2);
      expect(def.subroutines![0].effect).toEqual(fx.netDamage(2));
      expect(def.subroutines![1].effect).toEqual(fx.etr());
    });

    it("Armitage Codebusting hosts 12¢ and takes 2¢", () => {
      const def = getCardDef("armitage-codebusting");
      expect(def.hostedCreditsOnInstall).toBe(12);
      expect(def.paidAbilities?.[0]?.effect).toEqual(
        fx.do({ kind: "take_hosted_credits", amount: 2 }),
      );
      expect(validateEffectTree(def.paidAbilities![0].effect)).toBeNull();
    });

    it("Hadrian's Wall is advanceable with two ETR subs", () => {
      const def = getCardDef("hadrians-wall");
      expect(def.canAdvance).toBe(true);
      expect(def.strengthPerAdvancement).toBe(1);
      expect(def.subroutines).toHaveLength(2);
      expect(def.subroutines![0].effect).toEqual(fx.etr());
      expect(def.subroutines![1].effect).toEqual(fx.etr());
    });

    it("IPO gains 13¢ and ends the action phase", () => {
      const def = getCardDef("ipo");
      expect(def.endsActionPhase).toBe(true);
      expect(def.onPlay).toEqual(fx.gainCredits("corp", 13));
      expect(validateEffectTree(def.onPlay!)).toBeNull();
    });
  });
  });

  describe("sc19-v161-b-slice", () => {

  beforeAll(() => {
    if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
    if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
    assertPinnedTag("v26.03");
    assertCardsPinnedTag("v1.147.13");
  });

  describe("System Core 2019 v1.61.0 B-slice", () => {

    it("Battering Ram is a barrier fracter (break 2 / pump run)", () => {
      const def = getCardDef("battering-ram");
      expect(def.breaker).toEqual({
        breaksSubtype: "barrier",
        strength: 3,
        breakCredits: 2,
        breakMaxSubs: 2,
        pumpCredits: 1,
        pumpStrength: 1,
      });
      expect(def.paidAbilities?.[0]?.effect).toEqual(fx.pump(1, "run"));
    });

    it("Force of Nature is a code gate decoder", () => {
      const def = getCardDef("force-of-nature");
      expect(def.breaker?.breaksSubtype).toBe("code gate");
      expect(def.breaker?.breakMaxSubs).toBe(2);
      expect(def.paidAbilities?.[0]?.effect).toEqual(fx.pump(1));
    });

    it("Pipeline is a sentry killer (break 1 / pump run)", () => {
      const def = getCardDef("pipeline");
      expect(def.breaker?.breaksSubtype).toBe("sentry");
      expect(def.breaker?.breakMaxSubs).toBe(1);
      expect(def.paidAbilities?.[0]?.effect).toEqual(fx.pump(1, "run"));
    });

    it("Blue Level Clearance is a double: +click, gain 5, draw 2", () => {
      const def = getCardDef("blue-level-clearance");
      expect(def.playAdditionalClick).toBe(true);
      expect(def.onPlay).toEqual(
        fx.seq(fx.gainCredits("corp", 5), fx.draw("corp", 2)),
      );
      expect(validateEffectTree(def.onPlay!)).toBeNull();
    });

    it("Adonis Campaign hosts 12¢ and takes 3¢ on turn begin", () => {
      const def = getCardDef("adonis-campaign");
      expect(def.hostedCreditsOnInstall).toBe(12);
      expect(def.onTurnBegin).toEqual(
        fx.do({ kind: "take_hosted_credits", amount: 3 }),
      );
      expect(validateEffectTree(def.onTurnBegin!)).toBeNull();
    });
  });
  });

  describe("sc19-v162-c-slice", () => {

  beforeAll(() => {
    if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
    if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
    assertPinnedTag("v26.03");
    assertCardsPinnedTag("v1.147.13");
  });

  describe("System Core 2019 v1.62.0 C-slice", () => {

    it("Demara is a barrier fracter with trash-self bypass", () => {
      const def = getCardDef("demara");
      expect(def.breaker).toEqual({
        breaksSubtype: "barrier",
        strength: 1,
        breakCredits: 2,
        breakMaxSubs: 2,
        pumpCredits: 2,
        pumpStrength: 3,
      });
      expect(def.paidAbilities?.[0]?.effect).toEqual(fx.pump(3));
      expect(def.paidAbilities?.[1]?.cost).toEqual({ trashSelf: true });
      expect(def.paidAbilities?.[1]?.requireEncounterSubtype).toBe("barrier");
      expect(def.paidAbilities?.[1]?.effect).toEqual(
        fx.do({ kind: "bypass_current_ice", requireSubtype: "barrier" }),
      );
      expect(validateEffectTree(def.paidAbilities![0].effect)).toBeNull();
      expect(validateEffectTree(def.paidAbilities![1].effect)).toBeNull();
    });

    it("Himitsu-Bako returns to HQ and has ETR", () => {
      const def = getCardDef("himitsu-bako");
      expect(def.subtypes).toContain("barrier");
      expect(def.paidAbilities?.[0]?.effect).toEqual(
        fx.do({ kind: "return_source_to_hq" }),
      );
      expect(def.subroutines).toHaveLength(1);
      expect(def.subroutines![0].effect).toEqual(fx.etr());
      expect(validateEffectTree(def.paidAbilities![0].effect)).toBeNull();
      expect(validateEffectTree(def.subroutines![0].effect)).toBeNull();
    });

    it("Marked Accounts takes 1¢ on turn begin and places 3¢", () => {
      const def = getCardDef("marked-accounts");
      expect(def.onTurnBegin).toEqual(
        fx.do({ kind: "take_hosted_credits", amount: 1 }),
      );
      expect(def.paidAbilities?.[0]?.effect).toEqual(
        fx.do({ kind: "place_hosted_credits", amount: 3 }),
      );
      expect(validateEffectTree(def.onTurnBegin!)).toBeNull();
      expect(validateEffectTree(def.paidAbilities![0].effect)).toBeNull();
    });

    it("Modded installs program/hardware from grip at −3", () => {
      const def = getCardDef("modded");
      expect(def.onPlay).toEqual(
        fx.do({
          kind: "install_from_grip_discount",
          types: ["program", "hardware"],
          discount: 3,
        }),
      );
      expect(validateEffectTree(def.onPlay!)).toBeNull();
    });

    it("Chaos Theory identity grants +1 MU via memoryLimit", () => {
      const def = getCardDef("chaos-theory-wunderkind");
      expect(def.type).toBe("identity");
      expect(def.muBonus).toBe(1);

      const state = createGame({ seed: 1 });
      const base = memoryLimit(state);
      const id = instantiateCard(
        "chaos-theory-wunderkind",
        "ct-id",
        "runner:identity",
      );
      state.cards[id.id] = id;
      state.runner.identityId = id.id;
      expect(memoryLimit(state)).toBe(base + 1);
    });
  });
  });

  describe("sc19-v163-d-slice", () => {

  beforeAll(() => {
    if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
    if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
    assertPinnedTag("v26.03");
    assertCardsPinnedTag("v1.147.13");
  });

  describe("System Core 2019 v1.63.0 D-slice", () => {

    it("Hunter is Trace[3] → give 1 tag", () => {
      const def = getCardDef("hunter");
      expect(def.subtypes).toEqual(
        expect.arrayContaining(["sentry", "tracer", "observer"]),
      );
      expect(def.subroutines).toHaveLength(1);
      expect(def.subroutines![0].effect).toEqual(
        fx.do({
          kind: "trace",
          strength: 3,
          onSuccess: fx.giveTags(1),
        }),
      );
      expect(validateEffectTree(def.subroutines![0].effect)).toBeNull();
    });

    it("Caduceus is Trace gain + Trace ETR", () => {
      const def = getCardDef("caduceus");
      expect(def.subroutines).toHaveLength(2);
      expect(def.subroutines![0].effect).toEqual(
        fx.do({
          kind: "trace",
          strength: 3,
          onSuccess: fx.gainCredits("corp", 3),
        }),
      );
      expect(def.subroutines![1].effect).toEqual(
        fx.do({
          kind: "trace",
          strength: 2,
          onSuccess: fx.etr(),
        }),
      );
      expect(validateEffectTree(def.subroutines![0].effect)).toBeNull();
      expect(validateEffectTree(def.subroutines![1].effect)).toBeNull();
    });

    it("Yagura looks at R&D then does 1 net damage", () => {
      const def = getCardDef("yagura");
      expect(def.subroutines).toHaveLength(2);
      expect(def.subroutines![0].effect).toEqual(
        fx.do({ kind: "look_top_rd_may_bottom" }),
      );
      expect(def.subroutines![1].effect).toEqual(fx.netDamage(1));
      expect(validateEffectTree(def.subroutines![0].effect)).toBeNull();
      expect(validateEffectTree(def.subroutines![1].effect)).toBeNull();
    });

    it("Viktor 1.0 is bioroid with core damage + ETR", () => {
      const def = getCardDef("viktor-1-0");
      expect(def.subtypes).toEqual(
        expect.arrayContaining(["code gate", "bioroid", "ap"]),
      );
      expect(def.subroutines).toHaveLength(2);
      expect(def.subroutines![0].effect).toEqual(
        fx.do({ kind: "core_damage", amount: 1 }),
      );
      expect(def.subroutines![1].effect).toEqual(fx.etr());
      expect(validateEffectTree(def.subroutines![0].effect)).toBeNull();
      expect(validateEffectTree(def.subroutines![1].effect)).toBeNull();
    });

    it("Special Order searches stack for an icebreaker", () => {
      const def = getCardDef("special-order");
      expect(def.onPlay).toEqual(
        fx.do({ kind: "search_stack_icebreaker" }),
      );
      expect(validateEffectTree(def.onPlay!)).toBeNull();
    });
  });
  });

  describe("sc19-v164-e-slice", () => {

  beforeAll(() => {
    if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
    if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
    assertPinnedTag("v26.03");
    assertCardsPinnedTag("v1.147.13");
  });

  describe("System Core 2019 v1.64.0 E-slice", () => {

    it("Heimdall 1.0 is bioroid with core + ETR×2", () => {
      const def = getCardDef("heimdall-1-0");
      expect(def.subtypes).toEqual(
        expect.arrayContaining(["barrier", "bioroid", "ap"]),
      );
      expect(def.subroutines).toHaveLength(3);
      expect(def.subroutines![0].effect).toEqual(
        fx.do({ kind: "core_damage", amount: 1 }),
      );
      expect(def.subroutines![1].effect).toEqual(fx.etr());
      expect(def.subroutines![2].effect).toEqual(fx.etr());
      expect(validateEffectTree(def.subroutines![0].effect)).toBeNull();
    });

    it("Ichi 1.0 trashes programs then Trace core+tag", () => {
      const def = getCardDef("ichi-1-0");
      expect(def.subtypes).toEqual(
        expect.arrayContaining(["sentry", "bioroid", "tracer", "destroyer"]),
      );
      expect(def.subroutines).toHaveLength(3);
      expect(def.subroutines![0].effect).toEqual(
        fx.do({ kind: "trash_program", pick: "choose" }),
      );
      expect(def.subroutines![1].effect).toEqual(
        fx.do({ kind: "trash_program", pick: "choose" }),
      );
      expect(def.subroutines![2].effect).toEqual(
        fx.do({
          kind: "trace",
          strength: 1,
          onSuccess: fx.seq(
            fx.do({ kind: "core_damage", amount: 1 }),
            fx.giveTags(1),
          ),
        }),
      );
      expect(validateEffectTree(def.subroutines![2].effect)).toBeNull();
    });

    it("SEA Source gates on successful run last turn then Trace tag", () => {
      const def = getCardDef("sea-source");
      expect(def.playRequiresSuccessfulRunLastTurn).toBe(true);
      expect(def.onPlay).toEqual(
        fx.do({
          kind: "trace",
          strength: 3,
          onSuccess: fx.giveTags(1),
        }),
      );
      expect(validateEffectTree(def.onPlay!)).toBeNull();
    });

    it("Product Placement reveals from R&D and gains 2¢ on access", () => {
      const def = getCardDef("product-placement");
      expect(def.mustRevealWhenAccessedFromRd).toBe(true);
      expect(def.skipOnAccessFromArchives).toBe(true);
      expect(def.onAccess).toEqual(fx.gainCredits("corp", 2));
      expect(validateEffectTree(def.onAccess!)).toBeNull();
    });

    it("Notoriety scores itself after all centrals", () => {
      const def = getCardDef("notoriety");
      expect(def.playRequiresSuccessfulAllCentralsThisTurn).toBe(true);
      expect(def.onPlay).toEqual(
        fx.do({
          kind: "add_to_runner_score_as_agenda",
          agendaPoints: 1,
        }),
      );
      expect(validateEffectTree(def.onPlay!)).toBeNull();
    });
  });
  });

  describe("sc19-v165-f-slice", () => {

  beforeAll(() => {
    if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
    if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
    assertPinnedTag("v26.03");
    assertCardsPinnedTag("v1.147.13");
  });

  describe("System Core 2019 v1.65.0 F-slice", () => {

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
      expect(JSON.stringify(def.onAccess)).toContain("source_advancement_counters");
      expect(validateEffectTree(def.onAccess!)).toBeNull();
    });
  });
  });

  describe("sc19-v166-g-slice", () => {

  beforeAll(() => {
    if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
    if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
    assertPinnedTag("v26.03");
    assertCardsPinnedTag("v1.147.13");
  });

  describe("System Core 2019 v1.66.0 G-slice", () => {

    it("HQ Interface grants +1 access whenever breaching HQ", () => {
      const def = getCardDef("hq-interface");
      expect(def.bonusAccessOnHqBreach).toBe(1);
      expect(def.type).toBe("hardware");

      const s = structuredClone(createInitialState());
      const hw = instantiateCard("hq-interface", "hqi", "runner:installed");
      s.cards["hqi"] = hw;
      s.runner.installed = ["hqi"];
      for (const id of ["c1", "c2", "c3"] as const) {
        s.cards[id] = instantiateCard("hedge-fund", id, "corp:hq");
      }
      s.corp.hand = ["c1", "c2", "c3"];
      s.turn.hqBreachesThisTurn = 1; // not first-breach-only
      s.run = {
        attackedServerId: "hq",
        phase: "breach",
        position: null,
        successful: true,
        accessedCardIds: [],
        accessCandidates: [],
        randomAccessLimit: null,
        encounter: null,
        endedTheRun: false,
        cannotJackOut: false,
        strengthBoosts: {},
        encounterStrengthBoosts: {},
        iceStrengthBoosts: {},
        accessingCardId: null,
      };
      beginBreachAccess(s);
      expect(s.run!.accessCandidates.length).toBe(2);
      expect(
        s.log.some((l) => l.includes("HQ Interface") && l.includes("+1")),
      ).toBe(true);
    });

    it("R&D Interface grants +1 access whenever breaching R&D", () => {
      const def = getCardDef("r-d-interface");
      expect(def.bonusAccessOnRdBreach).toBe(1);

      const s = structuredClone(createInitialState());
      const hw = instantiateCard("r-d-interface", "rdi", "runner:installed");
      s.cards["rdi"] = hw;
      s.runner.installed = ["rdi"];
      for (const id of ["d1", "d2", "d3"] as const) {
        s.cards[id] = instantiateCard("hedge-fund", id, "corp:rd");
      }
      s.corp.deck = ["d1", "d2", "d3"];
      s.run = {
        attackedServerId: "rd",
        phase: "breach",
        position: null,
        successful: true,
        accessedCardIds: [],
        accessCandidates: [],
        randomAccessLimit: null,
        encounter: null,
        endedTheRun: false,
        cannotJackOut: false,
        strengthBoosts: {},
        encounterStrengthBoosts: {},
        iceStrengthBoosts: {},
        accessingCardId: null,
      };
      beginBreachAccess(s);
      expect((s.run!.bonusAccess ?? 0)).toBeGreaterThanOrEqual(1);
      expect(s.run!.randomAccessLimit).toBeGreaterThanOrEqual(2);
      expect(s.run!.accessCandidates[0]).toBe("d1");
      s.run!.accessedCardIds.push("d1");
      s.run!.randomAccessLimit = Math.max(0, (s.run!.randomAccessLimit ?? 1) - 1);
      refreshRdDeckCandidate(s);
      expect(s.run!.accessCandidates[0]).toBe("d2");
      expect(
        s.log.some((l) => l.includes("R&D Interface") && l.includes("+1")),
      ).toBe(true);
    });

    it("Closed Accounts requires a tag and drains the Runner credit pool", () => {
      const def = getCardDef("closed-accounts");
      expect(def.playRequiresTagged).toBe(true);
      expect(def.onPlay).toEqual(fx.loseAllCredits("runner"));
      expect(validateEffectTree(def.onPlay!)).toBeNull();

      const s = structuredClone(createInitialState());
      s.runner.credits = 7;
      const r = evalEffect(
        { state: s, sourceId: "closed-accounts" },
        fx.loseAllCredits("runner"),
      );
      expect(r.ok).toBe(true);
      expect(s.runner.credits).toBe(0);
    });

    it("Flare Trace success trashes hardware, deals unpreventable meat, ETRs", () => {
      const def = getCardDef("flare");
      expect(def.subroutines?.length).toBe(1);
      const sub = def.subroutines![0]!;
      expect(sub.effect?.op).toBe("do");
      expect(validateEffectTree(sub.effect!)).toBeNull();
      const raw = JSON.stringify(sub.effect);
      expect(raw).toContain('"kind":"trace"');
      expect(raw).toContain('"kind":"trash_hardware"');
      expect(raw).toContain('"cannotPrevent":true');
      expect(raw).toContain('"kind":"end_the_run"');

      const s = structuredClone(createInitialState());
      // Grip cards so meat can trash; Plascrete-class interrupt must not open.
      for (const id of ["g1", "g2"] as const) {
        s.cards[id] = instantiateCard("sure-gamble", id, "runner:grip");
      }
      s.runner.hand = ["g1", "g2"];
      const pc = instantiateCard("sure-gamble", "pc", "runner:installed");
      pc.paidAbilities = [
        {
          id: "fake-plascrete",
          label: "prevent meat",
          windows: ["damage_interrupt"],
          requirePendingDamageTypes: ["meat"],
          cost: { credits: 0 },
          effect: fx.do({ kind: "gain_credits", side: "runner", amount: 0 }),
        },
      ];
      s.cards["pc"] = pc;
      s.runner.installed = ["pc"];
      const r = evalEffect(
        { state: s, sourceId: "flare" },
        fx.meatDamage(2, { cannotPrevent: true }),
      );
      expect(r.ok).toBe(true);
      expect(s.pendingDamage).toBeFalsy();
      expect(s.runner.hand.length).toBe(0);
      expect(
        s.log.some((l) => l.includes("cannot be prevented")),
      ).toBe(true);
    });

    it("Leela bounces an unrezzed installed Corp card on score/steal", () => {
      const def = getCardDef("leela-patel-trained-pragmatist");
      expect(def.type).toBe("identity");
      expect(def.onAgendaScoredOrStolen).toEqual(
        fx.returnInstalledCorpToHq("choose", { unrezzedOnly: true }),
      );
      expect(validateEffectTree(def.onAgendaScoredOrStolen!)).toBeNull();

      const s = structuredClone(createInitialState());
      const ice = instantiateCard("ice-wall", "iw", "server:hq:ice");
      ice.rezzed = false;
      const rezzed = instantiateCard("pad-campaign", "pad", "server:remote1:root");
      rezzed.rezzed = true;
      s.cards["iw"] = ice;
      s.cards["pad"] = rezzed;
      s.servers.hq.ice = ["iw"];
      s.servers.remote1 = {
        id: "remote1",
        kind: "remote",
        root: ["pad"],
        ice: [],
      };
      const r = evalEffect(
        { state: s, sourceId: s.runner.identityId },
        fx.returnInstalledCorpToHq("choose", { unrezzedOnly: true }),
      );
      expect(r.ok).toBe(true);
      // Only one unrezzed target → auto-pick, no choice.
      expect(s.pendingChoice).toBeFalsy();
      expect(s.corp.hand).toContain("iw");
      expect(s.servers.hq.ice).not.toContain("iw");
      expect(s.servers.remote1.root).toContain("pad");
    });
  });
  });

  describe("sc19-v167-h-slice", () => {

  beforeAll(() => {
    if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
    if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
    assertPinnedTag("v26.03");
    assertCardsPinnedTag("v1.147.13");
  });

  describe("System Core 2019 v1.69.0 H-slice", () => {

    it("Priority Requisition may rez ice ignoring costs on score", () => {
      const def = getCardDef("priority-requisition");
      expect(def.onScore).toEqual(fx.rezIceIgnoringCosts());
      expect(validateEffectTree(def.onScore!)).toBeNull();
    });

    it("Neural EMP requires a Runner run last turn and deals 1 net", () => {
      const def = getCardDef("neural-emp");
      expect(def.playRequiresRunnerMadeRunLastTurn).toBe(true);
      expect(def.onPlay).toEqual(fx.netDamage(1));
      expect(validateEffectTree(def.onPlay!)).toBeNull();
    });

    it("Stronger Together grants +1 strength to bioroid ice", () => {
      const def = getCardDef("haas-bioroid-stronger-together");
      expect(def.iceStrengthBonusForSubtype).toEqual({
        subtype: "bioroid",
        bonus: 1,
      });

      const s = structuredClone(createInitialState());
      const id = instantiateCard(
        "haas-bioroid-stronger-together",
        "hb-id",
        "corp:hq",
      );
      s.cards["hb-id"] = id;
      s.corp.identityId = "hb-id";
      const ice = instantiateCard("eli-1-0", "eli", "server:hq:ice");
      ice.rezzed = true;
      s.cards["eli"] = ice;
      s.servers.hq.ice = ["eli"];
      expect(effectiveIceStrength(s, "eli")).toBe((ice.strength ?? 0) + 1);
    });

    it("Making News provides 2 recurring credits usable during traces", () => {
      const def = getCardDef("nbn-making-news");
      expect(def.recurringCreditsMax).toBe(2);
      expect(def.recurringSpendFor).toEqual(["trace"]);

      const s = structuredClone(createInitialState());
      const id = instantiateCard("nbn-making-news", "nbn-id", "corp:hq");
      id.recurringCredits = 2;
      s.cards["nbn-id"] = id;
      s.corp.identityId = "nbn-id";
      s.corp.credits = 0;
      expect(corpCreditsForTrace(s)).toBe(2);
      startTrace(s, "nbn-id", 3, fx.giveTags(1));
      expect(boostTrace(s, 2)).toBeNull();
      expect(id.recurringCredits).toBe(0);
      expect(s.trace!.corpSpent).toBe(2);
    });

    it("Philotic deals net equal to Runner scored agendas", () => {
      const def = getCardDef("philotic-entanglement");
      expect(def.deckLimit).toBe(1);
      expect(def.onScore).toEqual({
        op: "do",
        action: {
          kind: "net_damage",
          amount: 0,
          tally: { count: "runner_score", per: 1, side: "runner" },
        },
      });
      expect(validateEffectTree(def.onScore!)).toBeNull();

      const s = structuredClone(createInitialState());
      for (const id of ["a1", "a2"] as const) {
        const ag = instantiateCard("hostile-takeover", id, "runner:score");
        s.cards[id] = ag;
      }
      s.runner.scoreArea = ["a1", "a2"];
      for (const id of ["g1", "g2"] as const) {
        s.cards[id] = instantiateCard("sure-gamble", id, "runner:grip");
      }
      s.runner.hand = ["g1", "g2"];
      s.cards["philotic"] = instantiateCard(
        "philotic-entanglement",
        "philotic",
        "corp:score",
      );
      const r = evalEffect(
        { state: s, sourceId: "philotic" },
        fx.netDamagePerRunnerScoredAgenda(),
      );
      expect(r.ok).toBe(true);
      expect(s.runner.hand.length).toBe(0);
    });
  });
  });

  describe("sc19-v168-i-slice", () => {

  beforeAll(() => {
    if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
    if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
    assertPinnedTag("v26.03");
    assertCardsPinnedTag("v1.147.13");
  });

  describe("System Core 2019 v1.69.0 I-slice", () => {

    it("John Masanori draws on first success and tags on first unsuccessful", () => {
      const def = getCardDef("john-masanori");
      expect(def.onFirstSuccessfulRunThisTurn).toEqual(fx.draw("runner", 1));
      expect(def.onFirstUnsuccessfulRunThisTurn).toEqual(fx.giveTags(1));
      expect(validateEffectTree(def.onFirstSuccessfulRunThisTurn!)).toBeNull();
      expect(validateEffectTree(def.onFirstUnsuccessfulRunThisTurn!)).toBeNull();

      const s = structuredClone(createInitialState());
      const john = instantiateCard("john-masanori", "john", "runner:installed");
      s.cards["john"] = john;
      s.runner.installed = ["john"];
      for (const id of ["c1"] as const) {
        s.cards[id] = instantiateCard("sure-gamble", id, "runner:stack");
      }
      s.runner.deck = ["c1"];
      const r = evalEffect(
        { state: s, sourceId: "john" },
        fx.draw("runner", 1),
      );
      expect(r.ok).toBe(true);
      expect(s.runner.hand).toContain("c1");
      expect(s.runner.tags).toBe(0);
      const t = evalEffect(
        { state: s, sourceId: "john" },
        fx.giveTags(1),
      );
      expect(t.ok).toBe(true);
      expect(s.runner.tags).toBe(1);
    });

    it("Spark Agency loses Runner credits on first advertisement rez", () => {
      const def = getCardDef("spark-agency-worldswide-reach");
      expect(def.loseCreditsOnFirstAdvertisementRezThisTurn).toBe(1);

      const s = structuredClone(createInitialState());
      const id = instantiateCard(
        "spark-agency-worldswide-reach",
        "spark-id",
        "corp:hq",
      );
      s.cards["spark-id"] = id;
      s.corp.identityId = "spark-id";
      s.runner.credits = 5;
      expect(id.loseCreditsOnFirstAdvertisementRezThisTurn).toBe(1);
    });

    it("Paper Trail traces then trashes connection/job resources", () => {
      const def = getCardDef("paper-trail");
      expect(def.onScore).toEqual({
        op: "do",
        action: {
          kind: "trace",
          strength: 6,
          onSuccess: fx.trashInstalledResourcesWithAnySubtype([
            "connection",
            "job",
          ]),
        },
      });
      expect(validateEffectTree(def.onScore!)).toBeNull();

      const s = structuredClone(createInitialState());
      const conn = instantiateCard("john-masanori", "conn", "runner:installed");
      const other = instantiateCard("cyberfeeder", "chip", "runner:installed");
      s.cards["conn"] = conn;
      s.cards["chip"] = other;
      s.runner.installed = ["conn", "chip"];
      s.cards["pt"] = instantiateCard("paper-trail", "pt", "corp:score");
      const r = evalEffect(
        { state: s, sourceId: "pt" },
        fx.trashInstalledResourcesWithAnySubtype(["connection", "job"]),
      );
      expect(r.ok).toBe(true);
      expect(s.runner.installed).toEqual(["chip"]);
      expect(s.runner.discardPile).toContain("conn");
    });

    it("Data Dealer forfeits an agenda for 9¢", () => {
      const def = getCardDef("data-dealer");
      const ab = def.paidAbilities?.[0];
      expect(ab?.cost?.forfeitAgenda).toBe(true);
      expect(ab?.cost?.clicks).toBe(1);
      expect(ab?.effect).toEqual(fx.gainCredits("runner", 9));
      expect(validateEffectTree(ab!.effect)).toBeNull();

      const s = structuredClone(createInitialState());
      const dd = instantiateCard("data-dealer", "dd", "runner:installed");
      s.cards["dd"] = dd;
      s.runner.installed = ["dd"];
      s.runner.clicks = 1;
      s.runner.credits = 0;
      const ag = instantiateCard("hostile-takeover", "stolen", "runner:score");
      s.cards["stolen"] = ag;
      s.runner.scoreArea = ["stolen"];
      const cost = ab!.cost!;
      expect(canPayCost(s, "runner", cost, dd)).toBe(true);
      payCost(s, "runner", cost, "data-dealer-forfeit", dd);
      expect(s.runner.clicks).toBe(0);
      expect(s.runner.scoreArea).toEqual([]);
      expect(s.removedFromGame).toContain("stolen");
      const r = evalEffect({ state: s, sourceId: "dd" }, ab!.effect);
      expect(r.ok).toBe(true);
      expect(s.runner.credits).toBe(9);
    });

    it("Cyberfeeder provides recurring credits for virus installs", () => {
      const def = getCardDef("cyberfeeder");
      expect(def.recurringCreditsMax).toBe(1);
      expect(def.recurringSpendFor).toEqual(["use_program", "install_virus"]);

      const s = structuredClone(createInitialState());
      const cf = instantiateCard("cyberfeeder", "cf", "runner:installed");
      cf.recurringCredits = 1;
      s.cards["cf"] = cf;
      s.runner.installed = ["cf"];
      s.runner.credits = 0;
      const virus = instantiateCard("fermenter", "ds", "runner:grip");
      s.cards["ds"] = virus;
      expect(creditsAvailableForInstall(s, "runner", virus)).toBe(1);
      spendCreditsForInstall(s, "runner", 1, virus);
      expect(cf.recurringCredits).toBe(0);
      expect(s.runner.credits).toBe(0);
    });
  });
  });

  describe("sc19-v169-j-slice", () => {

  beforeAll(() => {
    if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
    if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
    assertPinnedTag("v26.03");
    assertCardsPinnedTag("v1.147.13");
  });

  describe("System Core 2019 v1.69.0 J-slice", () => {

    it("Run Amok trashes ice rezzed this run on run end", () => {
      const def = getCardDef("run-amok");
      expect(def.runEvent?.onRunEnd).toEqual(fx.trashIceRezzedThisRun("choose"));
      expect(validateEffectTree(def.runEvent!.onRunEnd!)).toBeNull();

      const s = structuredClone(createInitialState());
      const ice = instantiateCard("ice-wall", "iw", "server:hq:ice");
      ice.rezzed = true;
      s.cards["iw"] = ice;
      s.servers.hq.ice = ["iw"];
      s.run = {
        ...(s.run ?? ({} as never)),
        attackedServerId: "hq",
        position: 0,
        successful: true,
        iceRezzedThisRunIds: ["iw"],
      } as typeof s.run;
      s.cards["amok"] = instantiateCard("run-amok", "amok", "runner:heap");
      const r = evalEffect(
        { state: s, sourceId: "amok" },
        fx.trashIceRezzedThisRun("first"),
      );
      expect(r.ok).toBe(true);
      expect(s.servers.hq.ice).toEqual([]);
      expect(s.corp.discardPile).toContain("iw");
    });

    it("Tsurugi ends the run unless Corp pays 1¢", () => {
      const def = getCardDef("tsurugi");
      expect(def.subroutines?.[0]?.effect).toEqual(fx.endTheRunUnlessCorpPays(1));
      expect(validateEffectTree(def.subroutines![0]!.effect)).toBeNull();
      expect(def.subroutines?.length).toBe(4);

      const s = structuredClone(createInitialState());
      s.corp.credits = 0;
      s.run = {
        attackedServerId: "hq",
        position: 0,
        successful: false,
      } as typeof s.run;
      s.cards["tsu"] = instantiateCard("tsurugi", "tsu", "server:hq:ice");
      const r = evalEffect(
        { state: s, sourceId: "tsu" },
        fx.endTheRunUnlessCorpPays(1),
      );
      expect(r.ok).toBe(true);
      expect(s.run?.successful).toBe(false);
      expect(s.run?.endedTheRun || s.log.some((l) => /end the run/i.test(l))).toBeTruthy();
    });

    it("Elizabeth Mills removes BP on rez and trashes a location", () => {
      const def = getCardDef("elizabeth-mills");
      expect(def.onRez).toEqual({
        op: "do",
        action: { kind: "remove_bad_publicity", amount: 1 },
      });
      expect(validateEffectTree(def.onRez!)).toBeNull();
      expect(validateEffectTree(def.paidAbilities![0]!.effect)).toBeNull();

      const s = structuredClone(createInitialState());
      const loc = instantiateCard("earthrise-hotel", "loc", "runner:installed");
      s.cards["loc"] = loc;
      s.runner.installed = ["loc"];
      s.cards["mills"] = instantiateCard("elizabeth-mills", "mills", "server:remote1:root");
      const r = evalEffect(
        { state: s, sourceId: "mills" },
        fx.trashInstalledResourceWithSubtype("location", "first"),
      );
      expect(r.ok).toBe(true);
      expect(s.runner.installed).toEqual([]);
      expect(s.runner.discardPile).toContain("loc");
    });

    it("Kati Jones shares once-per-turn across paid abilities", () => {
      const def = getCardDef("kati-jones");
      expect(def.paidAbilitiesOncePerTurn).toBe(true);
      expect(def.paidAbilities?.length).toBe(2);
      expect(validateEffectTree(def.paidAbilities![0]!.effect)).toBeNull();
      expect(validateEffectTree(def.paidAbilities![1]!.effect)).toBeNull();
    });

    it("Ice Analyzer gains hosted credits on ice rez for program installs", () => {
      const def = getCardDef("ice-analyzer");
      expect(def.hostedCreditsOnAnyIceRez).toBe(1);
      expect(def.hostedCreditsSpendFor).toEqual(["install"]);
      expect(def.hostedCreditsSpendForInstallTypes).toEqual(["program"]);

      const s = structuredClone(createInitialState());
      const ia = instantiateCard("ice-analyzer", "ia", "runner:installed");
      ia.hostedCreditsOnAnyIceRez = 1;
      s.cards["ia"] = ia;
      s.runner.installed = ["ia"];
      const ice = instantiateCard("ice-wall", "iw", "server:hq:ice");
      ice.rezzed = true;
      s.cards["iw"] = ice;
      fireHostedCreditsOnAnyIceRez(s, "iw");
      expect(ia.hostedCredits).toBe(1);

      s.runner.credits = 0;
      const prog = instantiateCard("fermenter", "fv", "runner:grip");
      s.cards["fv"] = prog;
      expect(creditsAvailableForInstall(s, "runner", prog)).toBe(1);
      spendCreditsForInstall(s, "runner", 1, prog);
      expect(ia.hostedCredits).toBe(0);

      ia.hostedCredits = 1;
      const hw = instantiateCard("akamatsu-mem-chip", "chip", "runner:grip");
      s.cards["chip"] = hw;
      expect(creditsAvailableForInstall(s, "runner", hw)).toBe(0);
    });
  });
  });

  describe("sc19-v170-k-slice", () => {

  beforeAll(() => {
    if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
    if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
    assertPinnedTag("v26.03");
    assertCardsPinnedTag("v1.147.13");
  });

  describe("System Core 2019 v1.70.0 K-slice", () => {

    it("Faerie is a 0¢ sentry breaker that trashes after breaking this run", () => {
      const def = getCardDef("faerie");
      expect(def.breaker?.breaksSubtype).toBe("sentry");
      expect(def.breaker?.breakCredits).toBe(0);
      expect(def.trashAfterBreakingThisRun).toBe(true);
      expect(def.paidAbilities?.some((a) => a.id === "faerie-pump")).toBe(true);
    });

    it("Datasucker places virus on central success and weakens encounter ice", () => {
      const def = getCardDef("datasucker");
      expect(validateEffectTree(def.onSuccessfulRun!)).toBeNull();
      expect(JSON.stringify(def.onSuccessfulRun)).toContain("attacking_central");
      expect(JSON.stringify(def.onSuccessfulRun)).toContain("add_virus_counter");
      expect(def.paidAbilities?.[0]?.cost).toEqual({ virusCounters: 1 });
      expect(def.paidAbilities?.[0]?.effect).toEqual(fx.weakenIce(1));
      expect(validateEffectTree(def.paidAbilities![0]!.effect)).toBeNull();
    });

    it("Stimhack places 9 event credits and deals unpreventable core on run end", () => {
      const def = getCardDef("stimhack");
      expect(def.runEvent?.placeEventCredits).toBe(9);
      expect(def.runEvent?.onRunEnd).toEqual(
        fx.coreDamage(1, { cannotPrevent: true }),
      );
      expect(validateEffectTree(def.runEvent!.onRunEnd!)).toBeNull();

      const s = structuredClone(createInitialState());
      for (let i = 0; i < 4; i++) {
        const id = `filler-${i}`;
        s.cards[id] = instantiateCard("sure-gamble", id, "runner:grip");
        s.runner.hand.push(id);
      }
      const beforeHand = s.runner.hand.length;
      s.cards["stim"] = instantiateCard("stimhack", "stim", "runner:heap");
      const r = evalEffect(
        { state: s, sourceId: "stim" },
        fx.coreDamage(1, { cannotPrevent: true }),
      );
      expect(r.ok).toBe(true);
      expect(s.runner.coreDamage).toBe(1);
      expect(s.runner.hand.length).toBe(beforeHand - 1);
    });

    it("Turing has remote strength, blocks AI, and ETR-unless-clicks", () => {
      const def = getCardDef("turing");
      expect(def.strengthBonusProtectingRemote).toBe(3);
      expect(def.cannotBreakWithAi).toBe(true);
      expect(def.subroutines?.[0]?.effect).toEqual(
        fx.endTheRunUnlessRunnerSpendsClicks(3),
      );
      expect(validateEffectTree(def.subroutines![0]!.effect)).toBeNull();

      const s = structuredClone(createInitialState());
      s.runner.clicks = 0;
      s.run = {
        attackedServerId: "remote1",
        position: 0,
        successful: false,
      } as typeof s.run;
      s.cards["tur"] = instantiateCard("turing", "tur", "server:remote1:ice");
      const r = evalEffect(
        { state: s, sourceId: "tur" },
        fx.endTheRunUnlessRunnerSpendsClicks(3),
      );
      expect(r.ok).toBe(true);
      expect(
        s.run?.endedTheRun || s.log.some((l) => /end the run/i.test(l)),
      ).toBeTruthy();

      const s2 = structuredClone(createInitialState());
      s2.runner.clicks = 3;
      s2.run = {
        attackedServerId: "remote1",
        position: 0,
        successful: false,
      } as typeof s2.run;
      s2.cards["tur"] = instantiateCard("turing", "tur", "server:remote1:ice");
      const r2 = evalEffect(
        { state: s2, sourceId: "tur" },
        fx.endTheRunUnlessRunnerSpendsClicks(3),
      );
      expect(r2.ok).toBe(true);
      expect(s2.pendingChoice?.chooser).toBe("runner");
      expect(
        s2.pendingChoice?.options.some((o) => /spend/i.test(o.label)),
      ).toBe(true);
    });

    it("Spear Phishing sets bypassInnermostEncounter on the run", () => {
      const def = getCardDef("spear-phishing");
      expect(def.runEvent?.bypassInnermostEncounter).toBe(true);

      const s = structuredClone(createInitialState());
      s.cards["sp"] = instantiateCard("spear-phishing", "sp", "runner:heap");
      const mods = modifiersFromStartsRun(s, def.runEvent!, "sp");
      expect(mods.bypassInnermostEncounter).toBe(true);
    });
  });
  });

  describe("sc19-v171-l-slice", () => {

  beforeAll(() => {
    if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
    if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
    assertPinnedTag("v26.03");
    assertCardsPinnedTag("v1.147.13");
  });

  describe("System Core 2019 v1.71.0 L-slice", () => {

    it("Fetal AI reveals from R&D, nets on access, and costs 2¢ to steal", () => {
      const def = getCardDef("fetal-ai");
      expect(def.mustRevealWhenAccessedFromRd).toBe(true);
      expect(def.skipOnAccessFromArchives).toBe(true);
      expect(def.stealAdditionalCredits).toBe(2);
      expect(def.onAccess).toEqual(fx.netDamage(2));
      expect(validateEffectTree(def.onAccess!)).toBeNull();
    });

    it("Data Raven uses Funhouse-class encounter and Trace→power", () => {
      const def = getCardDef("data-raven");
      expect(def.onEncounter).toEqual(fx.endTheRunUnlessTakeTags(1));
      expect(validateEffectTree(def.onEncounter!)).toBeNull();
      expect(def.paidAbilities?.[0]?.cost).toEqual({ powerCounters: 1 });
      expect(def.paidAbilities?.[0]?.effect).toEqual(fx.giveTags(1));
      expect(JSON.stringify(def.subroutines?.[0]?.effect)).toContain("trace");
      expect(JSON.stringify(def.subroutines?.[0]?.effect)).toContain(
        "add_power_counter",
      );
      expect(validateEffectTree(def.subroutines![0]!.effect)).toBeNull();
    });

    it("Red Herrings is Persistent with server steal credit cost", () => {
      const def = getCardDef("red-herrings");
      expect(def.persistent).toBe(true);
      expect(def.stealAdditionalCreditsFromProtectingServer).toBe(5);
    });

    it("Public Support scores when power counters empty", () => {
      const def = getCardDef("public-support");
      expect(def.powerCountersOnRez).toBe(3);
      expect(def.scoreWhenPowerEmpty).toEqual({ agendaPoints: 1 });
      expect(def.onTurnBegin).toEqual(fx.removePowerCounter(1));
      expect(validateEffectTree(def.onTurnBegin!)).toBeNull();

      const s = structuredClone(createInitialState());
      const ps = instantiateCard("public-support", "ps", "server:remote-1:root");
      ps.powerCounters = 1;
      ps.scoreWhenPowerEmpty = { agendaPoints: 1 };
      ps.rezzed = true;
      s.cards["ps"] = ps;
      s.servers["remote-1"] = {
        id: "remote-1",
        kind: "remote",
        ice: [],
        root: ["ps"],
      };
      const r = evalEffect(
        { state: s, sourceId: "ps" },
        fx.removePowerCounter(1),
      );
      expect(r.ok).toBe(true);
      expect(s.corp.scoreArea).toContain("ps");
      expect(ps.agendaPoints).toBe(1);
    });

    it("Project Junebug may pay 1¢ for 2 net per advancement", () => {
      const def = getCardDef("project-junebug");
      expect(def.canAdvance).toBe(true);
      expect(def.onAccess).toEqual(
        fx.mayPayCreditsForNetDamagePerAdvancement(1, 2),
      );
      expect(validateEffectTree(def.onAccess!)).toBeNull();

      const s = structuredClone(createInitialState());
      s.corp.credits = 1;
      const jb = instantiateCard("project-junebug", "jb", "server:remote-1:root");
      jb.advancementCounters = 2;
      s.cards["jb"] = jb;
      const r = evalEffect(
        { state: s, sourceId: "jb" },
        fx.mayPayCreditsForNetDamagePerAdvancement(1, 2),
      );
      expect(r.ok).toBe(true);
      expect(s.pendingChoice?.chooser).toBe("corp");
      expect(s.pendingChoice?.options.some((o) => o.id === "pay")).toBe(true);
    });
  });
  });

  describe("sc19-v172-m-slice", () => {

  beforeAll(() => {
    if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
    if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
    assertPinnedTag("v26.03");
    assertCardsPinnedTag("v1.147.13");
  });

  describe("System Core 2019 v1.72.0 M-slice", () => {

    it("Paragon reuses look_top_n_stack_may_bottom_one on successful run", () => {
      const def = getCardDef("paragon");
      expect(def.muBonus).toBe(1);
      expect(def.onSuccessfulRunOncePerTurn).toBe(true);
      expect(JSON.stringify(def.onSuccessfulRun)).toContain(
        "look_top_n_stack_may_bottom_one",
      );
      expect(validateEffectTree(def.onSuccessfulRun!)).toBeNull();
    });

    it("Aggressive Secretary may pay 2¢ to trash programs per advancement", () => {
      const def = getCardDef("aggressive-secretary");
      expect(def.canAdvance).toBe(true);
      expect(def.onAccess).toEqual(
        fx.mayPayCreditsForTrashProgramsPerAdvancement(2),
      );
      expect(validateEffectTree(def.onAccess!)).toBeNull();

      const s = structuredClone(createInitialState());
      s.corp.credits = 2;
      const as = instantiateCard(
        "aggressive-secretary",
        "as",
        "server:remote-1:root",
      );
      as.advancementCounters = 2;
      s.cards["as"] = as;
      const prog = instantiateCard("corroder", "p1", "runner:installed");
      s.cards["p1"] = prog;
      s.runner.installed.push("p1");
      const r = evalEffect(
        { state: s, sourceId: "as" },
        fx.mayPayCreditsForTrashProgramsPerAdvancement(2),
      );
      expect(r.ok).toBe(true);
      expect(s.pendingChoice?.chooser).toBe("corp");
      expect(s.pendingChoice?.options.some((o) => o.id === "pay")).toBe(true);
    });

    it("Successful Field Test installs any number from HQ ignore costs", () => {
      const def = getCardDef("successful-field-test");
      expect(def.onScore).toEqual(fx.installAnyNumberFromHqIgnoreCosts());
      expect(validateEffectTree(def.onScore!)).toBeNull();

      const s = structuredClone(createInitialState());
      const ice = instantiateCard("ice-wall", "iw", "corp:hq");
      s.cards["iw"] = ice;
      s.corp.hand.push("iw");
      const r = evalEffect(
        { state: s, sourceId: s.corp.identityId },
        fx.installAnyNumberFromHqIgnoreCosts(),
      );
      expect(r.ok).toBe(true);
      expect(s.pendingChoice?.chooser).toBe("corp");
      expect(s.pendingChoice?.options.some((o) => o.id === "done-hq-install")).toBe(
        true,
      );
      expect(
        s.pendingChoice?.options.some((o) => o.id.startsWith("hq-any:iw:")),
      ).toBe(true);
    });

    it("Hostage searches stack for Connection and may install", () => {
      const def = getCardDef("hostage");
      expect(def.playAdditionalClick).toBe(true);
      expect(def.onPlay).toEqual(fx.searchStackSubtypeMayInstall("connection"));
      expect(validateEffectTree(def.onPlay!)).toBeNull();

      const s = structuredClone(createInitialState());
      s.runner.credits = 5;
      const conn = instantiateCard("kati-jones", "kj", "runner:stack");
      s.cards["kj"] = conn;
      s.runner.deck = ["kj"];
      const r = evalEffect(
        { state: s, sourceId: s.runner.identityId },
        fx.searchStackSubtypeMayInstall("connection"),
      );
      expect(r.ok).toBe(true);
      expect(s.runner.hand).toContain("kj");
      expect(s.pendingChoice?.chooser).toBe("runner");
      expect(s.pendingChoice?.options.some((o) => o.id === "install:kj")).toBe(
        true,
      );
    });

    it("Tinkering grants chosen ice subtypes until end of turn", () => {
      const def = getCardDef("tinkering");
      expect(def.onPlay).toEqual(
        fx.grantChosenIceSubtypesUntilEndOfTurn([
          "sentry",
          "code gate",
          "barrier",
        ]),
      );
      expect(validateEffectTree(def.onPlay!)).toBeNull();

      const s = structuredClone(createInitialState());
      const ice = instantiateCard("ice-wall", "iw", "server:hq:ice");
      s.cards["iw"] = ice;
      s.servers.hq.ice.push("iw");
      const r = evalEffect(
        { state: s, sourceId: s.runner.identityId },
        fx.grantChosenIceSubtypesUntilEndOfTurn([
          "sentry",
          "code gate",
          "barrier",
        ]),
      );
      expect(r.ok).toBe(true);
      expect(s.pendingChoice?.chooser).toBe("runner");
      const grant = evalEffect(
        { state: s, sourceId: s.runner.identityId },
        {
          op: "do",
          action: {
            kind: "grant_ice_subtypes_until_end_of_turn",
            cardId: "iw",
            subtypes: ["sentry", "code gate", "barrier"],
          },
        },
      );
      expect(grant.ok).toBe(true);
      expect(ice.grantedSubtypesUntilEndOfTurn).toEqual([
        "sentry",
        "code gate",
        "barrier",
      ]);
      const subs = effectiveIceSubtypes(s, "iw");
      expect(subs).toEqual(expect.arrayContaining(["barrier", "sentry", "code gate"]));
    });
  });
  });

  describe("sc19-v173-n-slice", () => {

  beforeAll(() => {
    if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
    if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
    assertPinnedTag("v26.03");
    assertCardsPinnedTag("v1.147.13");
  });

  describe("System Core 2019 v1.73.0 N-slice", () => {

    it("Contract Killer is Ronin-class with choose trash/meat", () => {
      const def = getCardDef("contract-killer");
      expect(def.canAdvance).toBe(true);
      expect(def.paidAbilities?.[0]?.requiresAdvancements).toBe(2);
      expect(def.paidAbilities?.[0]?.cost).toEqual({
        clicks: 1,
        trashSelf: true,
      });
      expect(validateEffectTree(def.paidAbilities![0]!.effect)).toBeNull();
      expect(JSON.stringify(def.paidAbilities![0]!.effect)).toContain(
        "trash_installed_resource_with_subtype",
      );
      expect(JSON.stringify(def.paidAbilities![0]!.effect)).toContain(
        "meat_damage",
      );
    });

    it("Queen's Gambit places up to 3 and blocks access", () => {
      const def = getCardDef("queens-gambit");
      expect(def.playAdditionalClick).toBe(true);
      expect(def.onPlay).toEqual({
        op: "do",
        action: { kind: "place_up_to", max: 3, creditsPer: 2 },
      });
      expect(validateEffectTree(def.onPlay!)).toBeNull();

      const s = structuredClone(createInitialState());
      s.servers["remote-1"] = {
        id: "remote-1",
        kind: "remote",
        ice: [],
        root: ["ag"],
      };
      const ag = instantiateCard("hostile-takeover", "ag", "server:remote-1:root");
      ag.rezzed = false;
      s.cards["ag"] = ag;
      const r = evalEffect(
        { state: s, sourceId: s.runner.identityId },
        fx.queensGambitPlaceUpTo(3, 2),
      );
      expect(r.ok).toBe(true);
      expect(s.pendingChoice?.chooser).toBe("runner");
      const place = evalEffect(
        { state: s, sourceId: s.runner.identityId },
        {
          op: "do",
          action: {
            kind: "place_on",
            cardId: "ag",
            amount: 2,
            creditsPer: 2,
          },
        },
      );
      expect(place.ok).toBe(true);
      expect(ag.advancementCounters).toBe(2);
      expect(s.runner.credits).toBeGreaterThanOrEqual(4);
      expect(s.turn.cannotAccessCardIdsThisTurn).toContain("ag");
    });

    it("Blue Sun may return rezzed card to HQ for rez credits", () => {
      const def = getCardDef("blue-sun-powering-the-future");
      expect(def.onTurnBegin).toEqual(fx.mayReturnRezzedToHqGainRezCost());
      expect(validateEffectTree(def.onTurnBegin!)).toBeNull();

      const s = structuredClone(createInitialState());
      const ice = instantiateCard("ice-wall", "iw", "server:hq:ice");
      ice.rezzed = true;
      s.cards["iw"] = ice;
      s.servers.hq.ice.push("iw");
      const before = s.corp.credits;
      const r = evalEffect(
        { state: s, sourceId: s.corp.identityId },
        fx.mayReturnRezzedToHqGainRezCost(),
      );
      expect(r.ok).toBe(true);
      expect(s.pendingChoice?.options.some((o) => o.id === "blue-sun:iw")).toBe(
        true,
      );
      const done = evalEffect(
        { state: s, sourceId: s.corp.identityId },
        {
          op: "do",
          action: { kind: "return_rezzed_to_hq_gain_rez_cost", cardId: "iw" },
        },
      );
      expect(done.ok).toBe(true);
      expect(s.corp.hand).toContain("iw");
      expect(s.corp.credits).toBe(before + (ice.rezCost ?? 0));
    });

    it("Mason Bellamy declares encounter-end click loss", () => {
      const def = getCardDef("mason-bellamy");
      expect(def.loseClickOnProtectingIceEncounterEndIfBroke).toBe(true);
    });

    it("Replicating Perfection blocks remotes until a central run", () => {
      const def = getCardDef("jinteki-replicating-perfection");
      expect(def.cannotRunRemotesUntilCentralRunThisTurn).toBe(true);

      const s = structuredClone(createInitialState());
      const id = instantiateCard(
        "jinteki-replicating-perfection",
        "corp-id",
        "corp:identity",
      );
      s.cards["corp-id"] = id;
      s.corp.identityId = "corp-id";
      s.servers["remote-1"] = {
        id: "remote-1",
        kind: "remote",
        ice: [],
        root: [],
      };
      expect(isRunTargetAllowed(s, "remote-1")).toBe(false);
      expect(isRunTargetAllowed(s, "hq")).toBe(true);
      s.turn.remotesUnlockedByCentralRunThisTurn = true;
      expect(isRunTargetAllowed(s, "remote-1")).toBe(true);
    });
  });
  });

  describe("sc19-v174-o-set-complete", () => {

  beforeAll(() => {
    if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
    if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
    assertPinnedTag("v26.03");
    assertCardsPinnedTag("v1.147.13");
  });

  describe("System Core 2019 v1.74.0 O-slice set-complete", () => {

    it("Bank Job successful remote → take hosted + skip breach", () => {
      const def = getCardDef("bank-job");
      expect(def.hostedCreditsOnInstall).toBe(8);
      expect(JSON.stringify(def.onSuccessfulRun)).toContain("attacking_remote");
      expect(JSON.stringify(def.onSuccessfulRun)).toContain(
        "may_take_any_hosted_credits_skip_breach",
      );
      expect(validateEffectTree(def.onSuccessfulRun!)).toBeNull();

      const s = structuredClone(createInitialState());
      s.servers["remote-1"] = {
        id: "remote-1",
        kind: "remote",
        ice: [],
        root: [],
      };
      const bj = instantiateCard("bank-job", "bj", "runner:installed");
      bj.hostedCredits = 8;
      s.cards["bj"] = bj;
      s.runner.installed.push("bj");
      s.run = {
        attackedServerId: "remote-1",
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
      const r = evalEffect(
        { state: s, sourceId: "bj" },
        fx.mayTakeAnyHostedCreditsSkipBreach(),
      );
      expect(r.ok).toBe(true);
      expect(s.pendingChoice?.chooser).toBe("runner");
      const take = evalEffect(
        { state: s, sourceId: "bj" },
        {
          op: "do",
          action: { kind: "take_hosted_credits_skip_breach", amount: 3 },
        },
      );
      expect(take.ok).toBe(true);
      expect(s.runner.credits).toBeGreaterThanOrEqual(3);
      expect(s.run?.skipBreach).toBe(true);
      expect(bj.hostedCredits).toBe(5);
    });

    it("Seidr first click during run → may Archives to R&D top", () => {
      const def = getCardDef("seidr-laboratories-destiny-defined");
      expect(validateEffectTree(def.onFirstRunnerClickSpendOrLoseDuringRun!)).toBeNull();
      expect(JSON.stringify(def.onFirstRunnerClickSpendOrLoseDuringRun)).toContain(
        "may_add_archives_card_to_rd_top",
      );

      const s = structuredClone(createInitialState());
      const id = instantiateCard(
        "seidr-laboratories-destiny-defined",
        "seidr",
        "corp:identity",
      );
      s.cards["seidr"] = id;
      s.corp.identityId = "seidr";
      const arch = instantiateCard("hedge-fund", "hf", "corp:archives");
      s.cards["hf"] = arch;
      s.corp.discardPile.push("hf");
      s.run = {
        attackedServerId: "hq",
        phase: "approach_ice",
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
      noteRunnerClickSpend(s);
      expect(s.turn.seidrClickMetPending).toBe(true);
      occurCheckpoint(
        s,
        "instruction",
        "seidr first click during run",
        [CR.checkpointConditionalAbilities],
        "test",
      );
      expect(s.turn.seidrClickDuringRunFiredThisTurn).toBe(true);
      expect(s.pendingChoice?.chooser).toBe("corp");
    });

    it("Sundew gains on first Runner click spend", () => {
      const def = getCardDef("sundew");
      expect(def.gainCreditsOnFirstRunnerClickSpendThisTurn).toBe(2);
      expect(def.refundCreditsIfRunBeginsOnThisServerDuringClickAction).toBe(2);

      const s = structuredClone(createInitialState());
      s.servers["remote-1"] = {
        id: "remote-1",
        kind: "remote",
        ice: [],
        root: ["sd"],
      };
      const sd = instantiateCard("sundew", "sd", "server:remote-1:root");
      sd.rezzed = true;
      s.cards["sd"] = sd;
      const before = s.corp.credits;
      noteRunnerClickSpend(s);
      expect(s.corp.credits).toBe(before + 2);
      expect(s.turn.sundewFirstClickSpendFiredThisTurn).toBe(true);
      expect(s.turn.sundewRefundServerIdsThisAction).toContain("remote-1");
    });

    it("Dinosaurus hosts non-AI breaker with +2 strength and MU exempt", () => {
      const def = getCardDef("dinosaurus");
      expect(def.hostNonAiIcebreaker).toBe(true);
      expect(def.hostedIcebreakerMemoryDoesNotCount).toBe(true);
      expect(def.hostIcebreakerStrengthBonus).toBe(2);
      expect(def.maxHostedCards).toBe(1);

      const s: GameState = structuredClone(createInitialState());
      const dino = instantiateCard("dinosaurus", "dino", "runner:installed");
      s.cards["dino"] = dino;
      s.runner.installed.push("dino");
      const blade = instantiateCard("gordian-blade", "gb", "runner:installed");
      blade.hostId = "dino";
      dino.hostedCardIds = ["gb"];
      s.cards["gb"] = blade;
      s.runner.installed.push("gb");
      expect(usedMemory(s)).toBe(0);
      expect(effectiveBreakerStrength(s, "gb")).toBe(
        (blade.breaker?.strength ?? 0) + 2,
      );
    });

    it("Patchwork declares once-per-turn trash-grip discount", () => {
      const def = getCardDef("patchwork");
      expect(def.playOrInstallDiscountByTrashingGripOncePerTurn).toBe(2);
    });

    it("Crypsis / Oversight / Deus X / Ash declare encounter IR fields", () => {
      expect(getCardDef("crypsis").removeVirusOrTrashOnEncounterEndIfBroke).toBe(
        true,
      );
      expect(getCardDef("oversight-ai").onPlay).toEqual({
        op: "do",
        action: { kind: "rez_and_host" },
      });
      expect(validateEffectTree(getCardDef("oversight-ai").onPlay!)).toBeNull();
      const deus = getCardDef("deus-x");
      expect(deus.paidAbilities?.some((a) => a.cost?.trashSelf)).toBe(true);
      expect(
        JSON.stringify(getCardDef("ash-2x3zb9cy").onSuccessfulRun),
      ).toContain("restrict_run_access");
    });

  });
  });
});
