
import {
  describe,
  expect,
  it,
  beforeAll,
} from "vitest";
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
  effectiveIceStrength,
  applyAction,
  createInitialState,
  queryLegality,
  runnerTrashCostForCard,
  effectiveIceSubtypes,
  hostedCreditsSpendableToUseProgramsDuringRuns,
  runnerAvailableCreditsForBreaker,
  additionalRunInitiateTax,
} from "../src/index.js";
import type { GameState } from "../src/state/types.js";
import { noteProgramOrHardwareInstalled, fireRemainderOfTurnOnInstallPrintedCostGte } from "../src/state/programHardwareInstall.js";
import { emptyTurnBookkeeping } from "../src/state/turn.js";
import { dealDamage } from "../src/state/damage.js";
import { azJobConnectionOrHardwareInstallDiscount, noteJobConnectionOrHardwareInstalled } from "../src/state/azInstallDiscount.js";
import { beginBreachAccess } from "../src/state/access.js";
import { abilitiesSuppressed } from "../src/state/abilities.js";
import { openPendingEndTheRun, preventPendingEndTheRun } from "../src/state/endTheRun.js";

describe("downfall", () => {
  describe("df-v147-kickoff", () => {

  beforeAll(() => {
    if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
    if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
    assertPinnedTag("v26.03");
    assertCardsPinnedTag("v1.147.6");
  });

  describe("Downfall v1.47.0 kickoff", () => {

    it("Rezeki gains 1¢ on turn begin", () => {
      const def = getCardDef("rezeki");
      expect(def.onTurnBegin).toEqual(fx.gainCredits("runner", 1));
      expect(validateEffectTree(def.onTurnBegin!)).toBeNull();

      const state = createGame({ seed: 1 });
      const card = instantiateCard("rezeki", "rz1", "runner:installed");
      state.cards[card.id] = card;
      state.runner.installed.push(card.id);
      const before = state.runner.credits;
      const gain = evalEffect(
        { state, sourceId: card.id },
        fx.gainCredits("runner", 1),
      );
      expect(gain.ok).toBe(true);
      expect(state.runner.credits).toBe(before + 1);
    });

    it("Bukhgalter is a sentry killer with once-per-turn full-break 2¢", () => {
      const def = getCardDef("bukhgalter");
      expect(def.breaker).toEqual({
        breaksSubtype: "sentry",
        strength: 1,
        breakCredits: 1,
        breakMaxSubs: 1,
        pumpCredits: 1,
        pumpStrength: 1,
      });
      expect(def.onFullyBreakOncePerTurn).toEqual(fx.gainCredits("runner", 2));
      expect(validateEffectTree(def.onFullyBreakOncePerTurn!)).toBeNull();
      expect(def.paidAbilities?.[0]?.effect).toEqual(
        fx.do({ kind: "pump_strength", amount: 1 }),
      );
    });

    it("Tiered Subscription gains 1¢ on first run begin each turn", () => {
      const def = getCardDef("tiered-subscription");
      expect(def.onFirstRunBeginThisTurn).toEqual(fx.gainCredits("corp", 1));
      expect(validateEffectTree(def.onFirstRunBeginThisTurn!)).toBeNull();
    });

    it("Isolation trashes a resource as additional cost and gains 7¢", () => {
      const def = getCardDef("isolation");
      expect(def.playCost).toBe(2);
      expect(def.playRequiresInstalledResource).toBe(true);
      expect(def.playAdditionalCost).toEqual(fx.trashOwnResource());
      expect(def.onPlay).toEqual(fx.gainCredits("runner", 7));
      expect(validateEffectTree(def.playAdditionalCost!)).toBeNull();
      expect(validateEffectTree(def.onPlay!)).toBeNull();
    });

    it("CSR Campaign may draw 1 on turn begin", () => {
      const def = getCardDef("csr-campaign");
      expect(def.onTurnBegin).toEqual(
        fx.choose("corp", [
          {
            id: "draw",
            label: "Draw 1 card",
            effect: fx.draw("corp", 1),
          },
          {
            id: "decline",
            label: "Decline",
            effect: fx.gainCredits("corp", 0),
          },
        ]),
      );
      expect(validateEffectTree(def.onTurnBegin!)).toBeNull();
    });
  });
  });

  describe("df-v148-a-slice", () => {

  beforeAll(() => {
    if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
    if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
    assertPinnedTag("v26.03");
    assertCardsPinnedTag("v1.147.6");
  });

  describe("Downfall v1.48.0 A-slice", () => {

    it("Congratulations! gains 1¢ on pass and has credit subroutine", () => {
      const def = getCardDef("congratulations");
      expect(def.onPass).toEqual(fx.gainCredits("corp", 1));
      expect(validateEffectTree(def.onPass!)).toBeNull();
      expect(def.subroutines).toHaveLength(1);
      expect(def.subroutines![0]!.effect).toEqual(
        fx.seq(fx.gainCredits("corp", 2), fx.gainCredits("runner", 1)),
      );
      expect(validateEffectTree(def.subroutines![0]!.effect)).toBeNull();
    });

    it("Gauss is a fracter with +3 strength this turn on install", () => {
      const def = getCardDef("gauss");
      expect(def.breaker).toEqual({
        breaksSubtype: "barrier",
        strength: 1,
        breakCredits: 1,
        breakMaxSubs: 1,
        pumpCredits: 2,
        pumpStrength: 2,
      });
      expect(def.onInstall).toEqual(
        fx.do({ kind: "gain_strength_this_turn", amount: 3 }),
      );
      expect(validateEffectTree(def.onInstall!)).toBeNull();
      expect(def.paidAbilities?.[0]?.effect).toEqual(
        fx.do({ kind: "pump_strength", amount: 2 }),
      );
    });

    it("Spec Work trashes a program as additional cost and gains 4¢ + draw 2", () => {
      const def = getCardDef("spec-work");
      expect(def.playCost).toBe(1);
      expect(def.playRequiresInstalledProgram).toBe(true);
      expect(def.playAdditionalCost).toEqual(fx.trashOwnProgram());
      expect(def.onPlay).toEqual(
        fx.seq(fx.gainCredits("runner", 4), fx.draw("runner", 2)),
      );
      expect(validateEffectTree(def.playAdditionalCost!)).toBeNull();
      expect(validateEffectTree(def.onPlay!)).toBeNull();
    });

    it("Nanoetching Matrix has once-per-turn click gain and onTrash may gain", () => {
      const def = getCardDef("nanoetching-matrix");
      expect(def.paidAbilities).toHaveLength(1);
      const ab = def.paidAbilities![0]!;
      expect(ab.flag).toBe("once_per_turn");
      expect(ab.clickCost).toBe(1);
      expect(ab.windows).toContain("corp_action_paw");
      expect(ab.effect).toEqual(fx.gainCredits("corp", 2));
      expect(validateEffectTree(ab.effect)).toBeNull();
      expect(def.onTrash).toEqual(
        fx.choose("corp", [
          {
            id: "gain",
            label: "Gain 2¢",
            effect: fx.gainCredits("corp", 2),
          },
          {
            id: "decline",
            label: "Decline",
            effect: fx.gainCredits("corp", 0),
          },
        ]),
      );
      expect(validateEffectTree(def.onTrash!)).toBeNull();
    });

    it("Sandstone places virus on encounter and loses strength per virus", () => {
      const def = getCardDef("sandstone");
      expect(def.strengthPerVirusCounter).toBe(-1);
      expect(def.onEncounter).toEqual(fx.addVirusCounter(1));
      expect(validateEffectTree(def.onEncounter!)).toBeNull();
      expect(def.subroutines).toHaveLength(1);
      expect(def.subroutines![0]!.effect).toEqual(
        fx.do({ kind: "end_the_run" }),
      );

      const state = createGame({ seed: 1 });
      const ice = instantiateCard("sandstone", "ss1", "server:hq:ice");
      state.cards[ice.id] = ice;
      state.servers.hq.ice.push(ice.id);
      ice.rezzed = true;
      ice.virusCounters = 0;
      expect(effectiveIceStrength(state, ice.id)).toBe(6);
      const place = evalEffect(
        { state, sourceId: ice.id },
        fx.addVirusCounter(1),
      );
      expect(place.ok).toBe(true);
      expect(ice.virusCounters).toBe(1);
      expect(effectiveIceStrength(state, ice.id)).toBe(5);
    });
  });
  });

  describe("df-v149-b-slice", () => {

  beforeAll(() => {
    if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
    if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
    assertPinnedTag("v26.03");
    assertCardsPinnedTag("v1.147.6");
  });

  function corpWithVulnerabilityAudit(): GameState {
    let s = createInitialState();
    s = structuredClone(s);
    const ag = instantiateCard(
      "vulnerability-audit",
      "va-1",
      "server:remote-1:root",
    );
    ag.advancementCounters = 4;
    s.cards["va-1"] = ag;
    s.servers["remote-1"] = {
      id: "remote-1",
      kind: "remote",
      ice: [],
      root: ["va-1"],
    };
    s.nextRemoteNumber = 2;
    s.activeSide = "corp";
    s.timingKey = "corp.actionPaw";
    s.corp.clicks = 3;
    return s;
  }

  describe("Downfall v1.49.0 B-slice", () => {

    it("Vulnerability Audit cannot score if installed this turn", () => {
      const def = getCardDef("vulnerability-audit");
      expect(def.type).toBe("agenda");
      expect(def.advancementRequirement).toBe(4);
      expect(def.agendaPoints).toBe(3);
      expect(def.cannotScoreIfInstalledThisTurn).toBe(true);

      const s = corpWithVulnerabilityAudit();
      s.turn.installedThisTurn = ["va-1"];

      expect(
        queryLegality(s).legal.some(
          (e) => e.action.type === "score_agenda" && e.action.cardId === "va-1",
        ),
      ).toBe(false);
      const blocked = applyAction(s, { type: "score_agenda", cardId: "va-1" });
      expect(blocked.ok).toBe(false);
      if (blocked.ok) return;
      expect(blocked.error).toMatch(/installed this turn/i);

      // Same agenda is scorable once it is no longer "installed this turn".
      s.turn.installedThisTurn = [];
      expect(
        queryLegality(s).legal.some(
          (e) => e.action.type === "score_agenda" && e.action.cardId === "va-1",
        ),
      ).toBe(true);
      const ok = applyAction(s, { type: "score_agenda", cardId: "va-1" });
      expect(ok.ok).toBe(true);
    });

    it("Calvin B4L3Y is Nanoetching twin with draw 2", () => {
      const def = getCardDef("calvin-b4l3y");
      expect(def.paidAbilities).toHaveLength(1);
      const ab = def.paidAbilities![0]!;
      expect(ab.flag).toBe("once_per_turn");
      expect(ab.clickCost).toBe(1);
      expect(ab.windows).toContain("corp_action_paw");
      expect(ab.effect).toEqual(fx.draw("corp", 2));
      expect(validateEffectTree(ab.effect)).toBeNull();
      expect(def.onTrash).toEqual(
        fx.choose("corp", [
          {
            id: "draw",
            label: "Draw 2 cards",
            effect: fx.draw("corp", 2),
          },
          {
            id: "decline",
            label: "Decline",
            effect: fx.gainCredits("corp", 0),
          },
        ]),
      );
      expect(validateEffectTree(def.onTrash!)).toBeNull();
    });

    it("Remastered Edition places agenda counter on score and spends for advancements", () => {
      const def = getCardDef("remastered-edition");
      expect(def.onScore).toEqual(
        fx.do({ kind: "add_agenda_counter", amount: 1 }),
      );
      expect(validateEffectTree(def.onScore!)).toBeNull();
      expect(def.paidAbilities).toHaveLength(1);
      const ab = def.paidAbilities![0]!;
      expect(ab.cost).toEqual({ agendaCounters: 1 });
      expect(ab.windows).toContain("corp_action_paw");
      expect(ab.effect).toEqual(
        fx.do({ kind: "place_advancements", amount: 1 }),
      );
      expect(validateEffectTree(ab.effect)).toBeNull();
    });

    it("Roughneck Repair Squad gains 6¢ for 3 clicks and may remove BP", () => {
      const def = getCardDef("roughneck-repair-squad");
      expect(def.paidAbilities).toHaveLength(1);
      const ab = def.paidAbilities![0]!;
      expect(ab.clickCost).toBe(3);
      expect(ab.windows).toContain("corp_action_paw");
      expect(ab.effect).toEqual(
        fx.seq(
          fx.gainCredits("corp", 6),
          fx.choose("corp", [
            {
              id: "remove-bp",
              label: "Remove 1 bad publicity",
              effect: fx.do({ kind: "remove_bad_publicity", amount: 1 }),
            },
            {
              id: "decline",
              label: "Decline",
              effect: fx.gainCredits("corp", 0),
            },
          ]),
        ),
      );
      expect(validateEffectTree(ab.effect)).toBeNull();
    });

    it("The Artist has dual once-per-turn paid abilities", () => {
      const def = getCardDef("the-artist");
      expect(def.paidAbilities).toHaveLength(2);
      const [gain, install] = def.paidAbilities!;
      expect(gain!.flag).toBe("once_per_turn");
      expect(gain!.clickCost).toBe(1);
      expect(gain!.effect).toEqual(fx.gainCredits("runner", 2));
      expect(validateEffectTree(gain!.effect)).toBeNull();
      expect(install!.flag).toBe("once_per_turn");
      expect(install!.clickCost).toBe(1);
      expect(install!.effect).toEqual(
        fx.do({
          kind: "install_from_grip_discount",
          types: ["program", "hardware"],
          discount: 1,
        }),
      );
      expect(validateEffectTree(install!.effect)).toBeNull();
    });
  });
  });

  describe("df-v150-c-slice", () => {

  beforeAll(() => {
    if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
    if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
    assertPinnedTag("v26.03");
    assertCardsPinnedTag("v1.147.6");
  });

  describe("Downfall v1.51.0 C-slice", () => {

    it("Increased Drop Rates must-reveal from R&D with onAccess tag-or-BP", () => {
      const def = getCardDef("increased-drop-rates");
      expect(def.mustRevealWhenAccessedFromRd).toBe(true);
      expect(def.onAccess).toEqual(
        fx.choose("runner", [
          {
            id: "take-tag",
            label: "Take 1 tag",
            effect: fx.do({ kind: "give_tags", amount: 1 }),
          },
          {
            id: "allow-remove-bp",
            label: "Allow Corp to remove 1 bad publicity",
            effect: fx.do({ kind: "remove_bad_publicity", amount: 1 }),
          },
        ]),
      );
      expect(validateEffectTree(def.onAccess!)).toBeNull();
    });

    it("Red Level Clearance is choose_exactly_n of four options", () => {
      const def = getCardDef("red-level-clearance");
      expect(def.onPlay).toBeDefined();
      expect(JSON.stringify(def.onPlay)).toContain("choose_exactly_n");
      expect(JSON.stringify(def.onPlay)).toContain("may_install_from_hq_paying_costs");
      expect(JSON.stringify(def.onPlay)).toContain("gain_clicks");
      expect(validateEffectTree(def.onPlay!)).toBeNull();
    });

    it("Afshar limits printed breaks on HQ and has lose¢ + ETR subs", () => {
      const def = getCardDef("afshar");
      expect(def.onEncounter).toEqual(
        fx.if({ op: "attacking_hq" }, fx.do({
          kind: "limit_printed_breaks_on_source_for_run",
          max: 1,
        })),
      );
      expect(validateEffectTree(def.onEncounter!)).toBeNull();
      expect(def.subroutines).toHaveLength(2);
      expect(validateEffectTree(def.subroutines![0]!.effect)).toBeNull();
      expect(validateEffectTree(def.subroutines![1]!.effect)).toBeNull();
      expect(JSON.stringify(def.subroutines![0]!.effect)).toContain("lose_credits");
      expect(JSON.stringify(def.subroutines![1]!.effect)).toContain("end_the_run");
    });

    it("Hagen loses strength per icebreaker and trashes non-breakers", () => {
      const def = getCardDef("hagen");
      expect(def.strengthBonusPerIcebreaker).toBe(-1);
      expect(def.subroutines).toHaveLength(2);
      expect(JSON.stringify(def.subroutines![0]!.effect)).toContain(
        "excludeSubtypes",
      );
      expect(validateEffectTree(def.subroutines![0]!.effect)).toBeNull();
      expect(validateEffectTree(def.subroutines![1]!.effect)).toBeNull();

      let s: GameState = createInitialState();
      s = structuredClone(s);
      const ice = instantiateCard("hagen", "hagen-1", "server:hq:ice");
      s.cards["hagen-1"] = ice;
      s.servers.hq.ice = ["hagen-1"];
      expect(effectiveIceStrength(s, "hagen-1")).toBe(6);

      const breaker = instantiateCard("bukhgalter", "brk-1", "runner:installed");
      s.cards["brk-1"] = breaker;
      s.runner.installed = ["brk-1"];
      expect(effectiveIceStrength(s, "hagen-1")).toBe(5);
    });

    it("SDS Drone Deployment has stealAdditionalCost + onScore trash program", () => {
      const def = getCardDef("sds-drone-deployment");
      expect(def.stealAdditionalCost).toEqual(
        fx.do({ kind: "trash_own_program" }),
      );
      expect(validateEffectTree(def.stealAdditionalCost!)).toBeNull();
      expect(def.onScore).toEqual(
        fx.do({ kind: "trash_program", pick: "choose" }),
      );
      expect(validateEffectTree(def.onScore!)).toBeNull();
    });
  });
  });

  describe("df-v151-d-slice", () => {

  beforeAll(() => {
    if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
    if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
    assertPinnedTag("v26.03");
    assertCardsPinnedTag("v1.147.6");
  });

  describe("Downfall v1.51.0 D-slice", () => {

    it("Supercorridor is console with MU, hand size, equal-credits onTurnEnd", () => {
      const def = getCardDef("supercorridor");
      expect(def.subtypes).toContain("console");
      expect(def.muBonus).toBe(2);
      expect(def.handSizeBonus).toBe(1);
      expect(def.onRunnerTurnEnd).toEqual(
        fx.if({ op: "credits_eq_other_side", side: "runner" }, fx.choose("runner", [
          {
            id: "gain",
            label: "Gain 2¢",
            effect: fx.gainCredits("runner", 2),
          },
          {
            id: "decline",
            label: "Decline",
            effect: fx.gainCredits("runner", 0),
          },
        ])),
      );
      expect(validateEffectTree(def.onRunnerTurnEnd!)).toBeNull();
    });

    it("Public Health Portal reveals top of R&D then gains 2¢", () => {
      const def = getCardDef("public-health-portal");
      expect(def.onTurnBegin).toEqual(
        fx.seq(fx.do({ kind: "reveal_top_of_rd" }), fx.gainCredits("corp", 2)),
      );
      expect(validateEffectTree(def.onTurnBegin!)).toBeNull();
    });

    it("Demolisher lowers Corp trash costs and gains on first trash", () => {
      const def = getCardDef("demolisher");
      expect(def.subtypes).toContain("console");
      expect(def.muBonus).toBe(1);
      expect(def.corpCardTrashCostReduction).toBe(1);
      expect(def.onFirstCorpCardTrashEachTurn).toEqual(
        fx.gainCredits("runner", 1),
      );
      expect(validateEffectTree(def.onFirstCorpCardTrashEachTurn!)).toBeNull();

      let s: GameState = createInitialState();
      s = structuredClone(s);
      const demo = instantiateCard("demolisher", "demo-1", "runner:installed");
      s.cards["demo-1"] = demo;
      s.runner.installed = ["demo-1"];
      const asset = instantiateCard("csr-campaign", "asset-1", "server:remote-1:root");
      s.cards["asset-1"] = asset;
      expect(asset.trashCost).toBe(2);
      expect(runnerTrashCostForCard(s, "asset-1")).toBe(1);
    });

    it("Flip Switch has trashSelf jack-out, remove-tag, and trace interrupt", () => {
      const def = getCardDef("flip-switch");
      expect(def.paidAbilities).toHaveLength(3);
      const jack = def.paidAbilities!.find((a) => a.id === "flip-switch-jack-out")!;
      expect(jack.cost?.trashSelf).toBe(true);
      expect(jack.requireDuringRun).toBe(true);
      expect(JSON.stringify(jack.effect)).toContain("end_the_run");
      expect(validateEffectTree(jack.effect)).toBeNull();

      const tag = def.paidAbilities!.find(
        (a) => a.id === "flip-switch-remove-tag",
      )!;
      expect(tag.cost?.trashSelf).toBe(true);
      expect(JSON.stringify(tag.effect)).toContain("remove_tags");
      expect(validateEffectTree(tag.effect)).toBeNull();

      const trace = def.paidAbilities!.find((a) => a.id === "flip-switch-trace")!;
      expect(trace.windows).toContain("trace_interrupt");
      expect(trace.cost?.trashSelf).toBe(true);
      expect(trace.effect).toEqual(
        fx.do({ kind: "set_trace_base_strength", amount: 0 }),
      );
      expect(validateEffectTree(trace.effect)).toBeNull();
    });

    it("Fully Operational resolves gain-or-draw per iced rooted remote", () => {
      const def = getCardDef("fully-operational");
      expect(def.onPlay).toEqual(
        fx.do({ kind: "resolve_fully_operational" }),
      );
      expect(validateEffectTree(def.onPlay!)).toBeNull();
    });
  });
  });

  describe("df-v152-e-slice", () => {

  beforeAll(() => {
    if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
    if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
    assertPinnedTag("v26.03");
    assertCardsPinnedTag("v1.147.6");
  });

  describe("Downfall v1.52.0 E-slice", () => {

    it("Trebuchet takes BP on rez, trashes installed, Trace[6] forbids steal/trash", () => {
      const def = getCardDef("trebuchet");
      expect(def.onRez).toEqual(
        fx.do({ kind: "give_bad_publicity", amount: 1 }),
      );
      expect(validateEffectTree(def.onRez!)).toBeNull();
      expect(def.subroutines).toHaveLength(2);
      expect(JSON.stringify(def.subroutines![0]!.effect)).toContain(
        "trash_installed_runner",
      );
      expect(JSON.stringify(def.subroutines![1]!.effect)).toContain(
        '"strength":6',
      );
      expect(JSON.stringify(def.subroutines![1]!.effect)).toContain(
        "forbid_steal_trash_this_run",
      );
      expect(validateEffectTree(def.subroutines![0]!.effect)).toBeNull();
      expect(validateEffectTree(def.subroutines![1]!.effect)).toBeNull();
    });

    it("Blueberry Diesel looks at top 2, may bottom one, then draws 2", () => {
      const def = getCardDef("blueberry-diesel");
      expect(def.onPlay).toEqual(
        fx.seq(
          fx.do({ kind: "look_top_n_stack_may_bottom_one", n: 2 }),
          fx.draw("runner", 2),
        ),
      );
      expect(validateEffectTree(def.onPlay!)).toBeNull();
    });

    it("Pelangi installs with 2 virus and grants encounter subtype", () => {
      const def = getCardDef("pelangi");
      expect(def.onInstall).toEqual(
        fx.do({ kind: "add_virus_counter", amount: 2 }),
      );
      expect(validateEffectTree(def.onInstall!)).toBeNull();
      expect(def.paidAbilities).toHaveLength(1);
      const ab = def.paidAbilities![0]!;
      expect(ab.cost?.virusCounters).toBe(1);
      expect(ab.flag).toBe("once_per_turn");
      expect(ab.windows).toContain("encounter_paw");
      expect(JSON.stringify(ab.effect)).toContain(
        "choose_grant_encounter_ice_subtype",
      );
      expect(validateEffectTree(ab.effect)).toBeNull();

      let s: GameState = createInitialState();
      s = structuredClone(s);
      const ice = instantiateCard("afshar", "ice-1", "server:hq:ice");
      s.cards["ice-1"] = ice;
      s.servers.hq!.ice = ["ice-1"];
      s.run = {
        attackedServerId: "hq",
        phase: "encounter",
        position: 0,
        successful: null,
        accessedCardIds: [],
        accessCandidates: [],
        randomAccessLimit: null,
        encounter: {
          iceId: "ice-1",
          broken: [false, false],
          grantedSubtypes: ["sentry"],
        },
        endedTheRun: false,
        cannotJackOut: false,
        strengthBoosts: {},
        encounterStrengthBoosts: {},
        iceStrengthBoosts: {},
      };
      const subs = effectiveIceSubtypes(s, "ice-1");
      expect(subs).toContain("code gate");
      expect(subs).toContain("sentry");
    });

    it("Utae is code-gate breaker with X-break once/run and virtual break", () => {
      const def = getCardDef("utae");
      expect(def.breaker?.breaksSubtype).toBe("code gate");
      expect(def.breaker?.breakViaPaidAbilityOnly).toBe(true);
      expect(def.paidAbilities).toHaveLength(3);
      const xBreak = def.paidAbilities!.find((a) => a.id === "utae-break-x")!;
      expect(xBreak.oncePerRun).toBe(true);
      expect(JSON.stringify(xBreak.effect)).toContain("payCreditsPerBrokenSub");
      expect(validateEffectTree(xBreak.effect)).toBeNull();
      const virt = def.paidAbilities!.find((a) => a.id === "utae-break-virtual")!;
      expect(virt.requireInstalledVirtualResourcesGte).toBe(3);
      expect(virt.creditCost).toBe(1);
      expect(validateEffectTree(virt.effect)).toBeNull();
      const pump = def.paidAbilities!.find((a) => a.id === "utae-pump")!;
      expect(JSON.stringify(pump.effect)).toContain("pump_strength");
      expect(validateEffectTree(pump.effect)).toBeNull();
    });

    it("Loot Box has ETR-unless-pay-2 and reveal-top-3 gain", () => {
      const def = getCardDef("loot-box");
      expect(def.subroutines).toHaveLength(2);
      const pay = def.subroutines![0]!.effect;
      expect(pay.op).toBe("do");
      expect(JSON.stringify(pay)).toContain("unless");
      expect(JSON.stringify(pay)).toContain("lose_credits");
      expect(JSON.stringify(pay)).toContain("end_the_run");
      expect(validateEffectTree(pay)).toBeNull();
      expect(def.subroutines![1]!.effect).toEqual(
        fx.do({ kind: "reveal_top_n", n: 3 }),
      );
      expect(validateEffectTree(def.subroutines![1]!.effect)).toBeNull();
    });
  });
  });

  describe("df-v153-f-slice", () => {

  beforeAll(() => {
    if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
    if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
    assertPinnedTag("v26.03");
    assertCardsPinnedTag("v1.147.6");
  });

  describe("Downfall v1.53.0 F-slice", () => {

    it("Secure and Protect is double + search-install central −3¢", () => {
      const def = getCardDef("secure-and-protect");
      expect(def.playAdditionalClick).toBe(true);
      expect(def.onPlay).toEqual(
        fx.do({
          kind: "search_rd_ice_install_central_discount",
          discount: 3,
        }),
      );
      expect(validateEffectTree(def.onPlay!)).toBeNull();
    });

    it("Lat may draw when grip equals HQ at discard phase end", () => {
      const def = getCardDef("lat-ethical-freelancer");
      expect(JSON.stringify(def.onDiscardPhaseEnd)).toContain("grip_count_eq_hq");
      expect(JSON.stringify(def.onDiscardPhaseEnd)).toContain('"kind":"draw"');
      expect(validateEffectTree(def.onDiscardPhaseEnd!)).toBeNull();
    });

    it("Rejig requires installed program/hardware and bounce-installs", () => {
      const def = getCardDef("rejig");
      expect(def.playRequiresInstalledProgramOrHardware).toBe(true);
      expect(def.onPlay).toEqual(fx.do({ kind: "install_rejig_bounce" }));
      expect(validateEffectTree(def.onPlay!)).toBeNull();
    });

    it("Chisel installs on ice, weakens host per virus, trashes at 0", () => {
      const def = getCardDef("chisel");
      expect(def.installOnIce).toBe(true);
      expect(def.hostStrengthPerVirusCounter).toBe(-1);
      expect(JSON.stringify(def.onHostEncounter)).toContain(
        "encounter_ice_strength_lte",
      );
      expect(JSON.stringify(def.onHostEncounter)).toContain(
        "trash_encounter_ice_if_strength_lte",
      );
      expect(JSON.stringify(def.onHostEncounter)).toContain("add_virus_counter");
      expect(validateEffectTree(def.onHostEncounter!)).toBeNull();
    });

    it("Rime rez-as-non-ice, +1 server ice strength, lose 1¢ sub", () => {
      const def = getCardDef("rime");
      expect(def.rezAsNonIceDuringRunsOnServer).toBe(true);
      expect(def.sameServerIceStrengthBonus).toBe(1);
      expect(def.subroutines).toHaveLength(1);
      expect(JSON.stringify(def.subroutines![0]!.effect)).toContain(
        "lose_credits",
      );
      expect(validateEffectTree(def.subroutines![0]!.effect)).toBeNull();
    });
  });
  });

  describe("df-v154-g-slice", () => {

  beforeAll(() => {
    if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
    if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
    assertPinnedTag("v26.03");
    assertCardsPinnedTag("v1.147.6");
  });

  describe("Downfall v1.54.0 G-slice", () => {

    it("Yagi-Uda overadvances on score and swaps HQ with attacked during run", () => {
      const def = getCardDef("project-yagi-uda");
      expect(def.onScore).toEqual(
        fx.do({ kind: "place_agenda_counters_past", past: 3 }),
      );
      expect(validateEffectTree(def.onScore!)).toBeNull();
      expect(def.paidAbilities).toHaveLength(1);
      const ab = def.paidAbilities![0]!;
      expect(ab.cost?.agendaCounters).toBe(1);
      expect(ab.requireDuringRun).toBe(true);
      expect(ab.windows).toEqual([
        "approach_paw",
        "encounter_paw",
        "approach_server_paw",
      ]);
      expect(JSON.stringify(ab.effect)).toContain(
        "swap_yagi_hq_with_attacked_root_or_ice",
      );
      expect(JSON.stringify(ab.effect)).toContain("offer_jack_out");
      expect(validateEffectTree(ab.effect)).toBeNull();
    });

    it("Architect Deployment Test looks top 5 and may install+rez ignore costs", () => {
      const def = getCardDef("architect-deployment-test");
      expect(def.onScore).toEqual(
        fx.lookTopNRdMayInstallAndRezIgnoreCosts(5),
      );
      expect(validateEffectTree(def.onScore!)).toBeNull();

      let s: GameState = createInitialState();
      s = structuredClone(s);
      const ice = instantiateCard("wraparound", "ice-look", "corp:rd");
      s.cards["ice-look"] = ice;
      s.corp.deck = ["ice-look", ...s.corp.deck];
      const r = evalEffect(
        { state: s, sourceId: s.corp.identityId },
        fx.lookTopNRdMayInstallAndRezIgnoreCosts(5),
      );
      expect(r.ok).toBe(true);
      expect(s.turn.rdLookedCards).toContain("ice-look");
      expect(
        s.pendingChoice?.options.some((o) => o.id.includes("ice-look")),
      ).toBe(true);
    });

    it("Daily Quest pays runner on success and corp if no success last turn", () => {
      const def = getCardDef("daily-quest");
      expect(def.rezOnlyDuringCorpTurn).toBe(true);
      expect(def.onSuccessfulRun).toEqual(
        fx.do({ kind: "gain_credits", side: "runner", amount: 2 }),
      );
      expect(JSON.stringify(def.onTurnBegin)).toContain(
        "no_successful_run_on_host_server_last_turn",
      );
      expect(JSON.stringify(def.onTurnBegin)).toContain('"amount":3');
      expect(validateEffectTree(def.onSuccessfulRun!)).toBeNull();
      expect(validateEffectTree(def.onTurnBegin!)).toBeNull();

      let s: GameState = createInitialState();
      s = structuredClone(s);
      const dq = instantiateCard("daily-quest", "dq-1", "server:hq:root");
      dq.rezzed = true;
      s.cards["dq-1"] = dq;
      s.servers.hq!.root = ["dq-1"];
      s.turn = emptyTurnBookkeeping({
        successfulRunServersLastTurn: ["hq"],
      });
      const creditsBefore = s.corp.credits;
      evalEffect({ state: s, sourceId: "dq-1" }, def.onTurnBegin!);
      expect(s.corp.credits).toBe(creditsBefore);

      s.turn.successfulRunServersLastTurn = ["rd"];
      evalEffect({ state: s, sourceId: "dq-1" }, def.onTurnBegin!);
      expect(s.corp.credits).toBe(creditsBefore + 3);

      const unhosted = createInitialState();
      const inHand = instantiateCard("daily-quest", "dq-hand", "corp:hq");
      inHand.rezzed = true;
      unhosted.cards["dq-hand"] = inHand;
      unhosted.corp.hand.push("dq-hand");
      const handCredits = unhosted.corp.credits;
      evalEffect({ state: unhosted, sourceId: "dq-hand" }, def.onTurnBegin!);
      expect(unhosted.corp.credits).toBe(handCredits);
    });

    it("Baklan places power on first encounter and may derez for tag", () => {
      const def = getCardDef("baklan-bochkin");
      expect(def.onFirstEncounterEachRun).toEqual(
        fx.do({ kind: "add_power_counter", amount: 1 }),
      );
      expect(validateEffectTree(def.onFirstEncounterEachRun!)).toBeNull();
      expect(def.paidAbilities).toHaveLength(1);
      const ab = def.paidAbilities![0]!;
      expect(ab.cost?.trashSelf).toBe(true);
      expect(ab.cost?.powerCountersEqualEncounterStrength).toBe(true);
      expect(JSON.stringify(ab.effect)).toContain("derez_encounter_ice");
      expect(JSON.stringify(ab.effect)).toContain("give_tags");
      expect(validateEffectTree(ab.effect)).toBeNull();

      let s: GameState = createInitialState();
      s = structuredClone(s);
      const ice = instantiateCard("wraparound", "ice-1", "server:hq:ice");
      ice.rezzed = true;
      s.cards["ice-1"] = ice;
      s.servers.hq!.ice = ["ice-1"];
      s.run = {
        attackedServerId: "hq",
        phase: "encounter",
        position: 0,
        successful: null,
        accessedCardIds: [],
        accessCandidates: [],
        randomAccessLimit: null,
        encounter: { iceId: "ice-1", broken: [false] },
        endedTheRun: false,
        cannotJackOut: false,
        strengthBoosts: {},
        encounterStrengthBoosts: {},
        iceStrengthBoosts: {},
      };
      const r = evalEffect(
        { state: s, sourceId: "bak-1" },
        fx.derezEncounterIce(),
      );
      expect(r.ok).toBe(true);
      expect(s.cards["ice-1"]!.rezzed).toBe(false);
    });

    it("Masterwork is console +1mu, first HW draw, run-begin HW surcharge", () => {
      const def = getCardDef("masterwork-v37");
      expect(def.muBonus).toBe(1);
      expect(def.subtypes).toContain("console");
      expect(def.onFirstHardwareInstallEachTurn).toEqual(
        fx.draw("runner", 1),
      );
      expect(def.onRunBegin).toEqual(
        fx.do({
          kind: "may_install_from_grip",
          types: ["hardware"],
          discount: -1,
        }),
      );
      expect(validateEffectTree(def.onFirstHardwareInstallEachTurn!)).toBeNull();
      expect(validateEffectTree(def.onRunBegin!)).toBeNull();

      let s: GameState = createInitialState();
      s = structuredClone(s);
      const mw = instantiateCard("masterwork-v37", "mw-1", "runner:installed");
      s.cards["mw-1"] = mw;
      s.runner.installed = ["mw-1"];
      const filler = instantiateCard("sure-gamble", "draw-1", "runner:stack");
      s.cards["draw-1"] = filler;
      s.runner.deck = ["draw-1"];
      s.runner.hand = [];
      noteProgramOrHardwareInstalled(s, "mw-1");
      expect(s.turn.hardwareInstalledThisTurn).toBe(1);
      expect(s.runner.hand).toEqual(["draw-1"]);
    });
  });
  });

  describe("df-v155-h-slice", () => {

  beforeAll(() => {
    if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
    if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
    assertPinnedTag("v26.03");
    assertCardsPinnedTag("v1.147.6");
  });

  describe("Downfall v1.55.0 H-slice", () => {

    it("Sting! does 1 + copies in other score on score/steal", () => {
      const def = getCardDef("sting");
      const kind =
        "net_damage_1_plus_copies_of_source_title_in_other_score_area";
      expect(def.onScore).toEqual(fx.do({ kind }));
      expect(def.onSteal).toEqual(fx.do({ kind }));
      expect(validateEffectTree(def.onScore!)).toBeNull();
      expect(validateEffectTree(def.onSteal!)).toBeNull();

      let s: GameState = createInitialState();
      s = structuredClone(s);
      const sting1 = instantiateCard("sting", "sting-1", "corp:score");
      const sting2 = instantiateCard("sting", "sting-2", "runner:score");
      s.cards["sting-1"] = sting1;
      s.cards["sting-2"] = sting2;
      s.corp.scoreArea = ["sting-1"];
      s.runner.scoreArea = ["sting-2"];
      // Fill grip so net damage does not flatline.
      for (let i = 0; i < 5; i++) {
        const c = instantiateCard("sure-gamble", `grip-${i}`, "runner:grip");
        s.cards[`grip-${i}`] = c;
        s.runner.hand.push(`grip-${i}`);
      }
      const before = s.runner.hand.length;
      const r = evalEffect(
        { state: s, sourceId: "sting-1" },
        def.onScore!,
      );
      expect(r.ok).toBe(true);
      // 1 + 1 copy in runner score = 2 net
      expect(s.runner.hand.length).toBe(before - 2);
    });

    it("Az discounts first job/connection/hardware install", () => {
      const def = getCardDef("az-mccaffrey-mechanical-prodigy");
      expect(def.firstJobConnectionOrHardwareInstallDiscount).toBe(1);

      let s: GameState = createInitialState();
      s = structuredClone(s);
      const az = instantiateCard(
        "az-mccaffrey-mechanical-prodigy",
        "az-id",
        "runner:identity",
      );
      s.cards["az-id"] = az;
      s.runner.identityId = "az-id";
      const hw = instantiateCard("dzmz-optimizer", "hw-1", "runner:grip");
      s.cards["hw-1"] = hw;
      expect(azJobConnectionOrHardwareInstallDiscount(s, hw)).toBe(1);
      noteJobConnectionOrHardwareInstalled(s, hw);
      expect(s.turn.jobConnectionOrHardwareInstallDiscountUsedThisTurn).toBe(
        true,
      );
      expect(azJobConnectionOrHardwareInstallDiscount(s, hw)).toBe(0);
    });

    it("Saisentan chooses type and amplifies net on trash of type", () => {
      const def = getCardDef("saisentan");
      expect(JSON.stringify(def.onEncounter)).toContain(
        "choose_card_type_for_encounter",
      );
      expect(def.amplifyNetDamageOnTrashChosenEncounterType).toBe(true);
      expect(def.subroutines).toHaveLength(3);
      for (const sub of def.subroutines!) {
        expect(JSON.stringify(sub.effect)).toContain("net_damage");
        expect(validateEffectTree(sub.effect)).toBeNull();
      }
      expect(validateEffectTree(def.onEncounter!)).toBeNull();

      let s: GameState = createInitialState();
      s = structuredClone(s);
      const ice = instantiateCard("saisentan", "sai-1", "server:hq:ice");
      ice.rezzed = true;
      s.cards["sai-1"] = ice;
      s.servers.hq!.ice = ["sai-1"];
      s.run = {
        attackedServerId: "hq",
        phase: "encounter",
        position: 0,
        successful: null,
        accessedCardIds: [],
        accessCandidates: [],
        randomAccessLimit: null,
        encounter: {
          iceId: "sai-1",
          broken: [false, false, false],
          chosenCardType: "event",
        },
        endedTheRun: false,
        cannotJackOut: false,
        strengthBoosts: {},
        encounterStrengthBoosts: {},
        iceStrengthBoosts: {},
      };
      // Sole grip card is the chosen type: 1 net trashes it, amplify 1 with
      // empty grip flatlines (proves amplify fired).
      const ev = instantiateCard("sure-gamble", "ev-0", "runner:grip");
      s.cards["ev-0"] = ev;
      s.runner.hand = ["ev-0"];
      dealDamage(s, "net", 1, "sai-1");
      expect(s.winner).toBe("corp");
      expect(s.winReason).toBe("flatline");
    });

    it("Focus Group requires successful run last turn and reveal-advance", () => {
      const def = getCardDef("focus-group");
      expect(def.playRequiresSuccessfulRunLastTurn).toBe(true);
      expect(def.onPlay).toEqual(
        fx.do({ kind: "reveal_may_advance" }),
      );
      expect(validateEffectTree(def.onPlay!)).toBeNull();

      let s: GameState = createInitialState();
      s = structuredClone(s);
      s.turn = emptyTurnBookkeeping({ successfulRunLastTurn: true });
      for (let i = 0; i < 2; i++) {
        const c = instantiateCard("sure-gamble", `g-${i}`, "runner:grip");
        s.cards[`g-${i}`] = c;
        s.runner.hand.push(`g-${i}`);
      }
      const r = evalEffect(
        { state: s, sourceId: s.corp.identityId },
        def.onPlay!,
      );
      expect(r.ok).toBe(true);
      expect(s.pendingChoice?.options.some((o) => o.id.startsWith("fg-type:"))).toBe(
        true,
      );
    });

    it("Divested Trust may forfeit on other steal to return agenda", () => {
      const def = getCardDef("divested-trust");
      expect(JSON.stringify(def.onOtherAgendaStolen)).toContain(
        "may_forfeit_return_stolen",
      );
      expect(validateEffectTree(def.onOtherAgendaStolen!)).toBeNull();

      let s: GameState = createInitialState();
      s = structuredClone(s);
      const div = instantiateCard("divested-trust", "div-1", "corp:score");
      const stolen = instantiateCard("hostile-takeover", "ag-1", "runner:score");
      s.cards["div-1"] = div;
      s.cards["ag-1"] = stolen;
      s.corp.scoreArea = ["div-1"];
      s.runner.scoreArea = ["ag-1"];
      s.turn.lastStolenAgendaId = "ag-1";
      const credits = s.corp.credits;
      const r = evalEffect(
        { state: s, sourceId: "div-1" },
        def.onOtherAgendaStolen!,
      );
      expect(r.ok).toBe(true);
      expect(
        s.pendingChoice?.options.some((o) => o.id === "forfeit-return"),
      ).toBe(true);
      // Resolve forfeit-return path.
      const opt = s.pendingChoice!.options.find((o) => o.id === "forfeit-return")!;
      s.pendingChoice = null;
      const r2 = evalEffect({ state: s, sourceId: "div-1" }, opt.effect);
      expect(r2.ok).toBe(true);
      expect(s.corp.scoreArea).not.toContain("div-1");
      expect(s.runner.scoreArea).not.toContain("ag-1");
      expect(s.corp.hand).toContain("ag-1");
      expect(s.corp.credits).toBe(credits + 5);
    });
  });
  });

  describe("df-v156-i-slice", () => {

  beforeAll(() => {
    if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
    if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
    assertPinnedTag("v26.03");
    assertCardsPinnedTag("v1.147.6");
  });

  describe("Downfall v1.56.0 I-slice", () => {

    it("Fencer Fueno places hosted credits and spends during runs", () => {
      const def = getCardDef("fencer-fueno");
      expect(def.spendHostedCreditsDuringRuns).toBe(true);
      expect(JSON.stringify(def.onTurnBegin)).toContain("place_hosted_credits");
      expect(JSON.stringify(def.onStealAgenda)).toContain("place_hosted_credits");
      expect(JSON.stringify(def.onRunnerTurnEnd)).toContain("hosted_credits_gte");
      expect(validateEffectTree(def.onTurnBegin!)).toBeNull();
      expect(validateEffectTree(def.onStealAgenda!)).toBeNull();
      expect(validateEffectTree(def.onRunnerTurnEnd!)).toBeNull();
    });

    it("Trickster Taka spends hosted credits to use programs during runs", () => {
      const def = getCardDef("trickster-taka");
      expect(def.spendHostedCreditsToUseProgramsDuringRuns).toBe(true);
      expect(JSON.stringify(def.onRunnerTurnEnd)).toContain("give_tags");
      expect(validateEffectTree(def.onTurnBegin!)).toBeNull();
      expect(validateEffectTree(def.onRunnerTurnEnd!)).toBeNull();

      let s: GameState = createInitialState();
      s = structuredClone(s);
      const taka = instantiateCard("trickster-taka", "taka-1", "runner:installed");
      taka.hostedCredits = 2;
      s.cards["taka-1"] = taka;
      s.runner.installed = ["taka-1"];
      s.runner.credits = 0;
      expect(hostedCreditsSpendableToUseProgramsDuringRuns(s)).toBe(0);
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
      expect(hostedCreditsSpendableToUseProgramsDuringRuns(s)).toBe(2);
      expect(runnerAvailableCreditsForBreaker(s)).toBeGreaterThanOrEqual(2);
    });

    it("The Nihilist first virus install + turn-begin may remove", () => {
      const def = getCardDef("the-nihilist");
      expect(JSON.stringify(def.onFirstVirusInstallThisTurn)).toContain(
        "add_virus_counter",
      );
      expect(def.onTurnBegin).toEqual(
        fx.do({ kind: "nihilist_may_remove_2_virus_draw_unless_corp_trash_top_rd" }),
      );
      expect(validateEffectTree(def.onFirstVirusInstallThisTurn!)).toBeNull();
      expect(validateEffectTree(def.onTurnBegin!)).toBeNull();

      let s: GameState = createInitialState();
      s = structuredClone(s);
      const nih = instantiateCard("the-nihilist", "nih-1", "runner:installed");
      s.cards["nih-1"] = nih;
      s.runner.installed = ["nih-1"];
      const v1 = instantiateCard("imp", "imp-1", "runner:installed");
      v1.virusCounters = 2;
      s.cards["imp-1"] = v1;
      s.runner.installed.push("imp-1");
      const r = evalEffect(
        { state: s, sourceId: "nih-1" },
        fx.do({ kind: "nihilist_may_remove_2_virus_draw_unless_corp_trash_top_rd" }),
      );
      expect(r.ok).toBe(true);
      expect(
        s.pendingChoice?.options.some((o) => o.id.startsWith("nihilist-rm:")),
      ).toBe(true);
    });

    it("In the Groove requires first click and registers install delayed", () => {
      const def = getCardDef("in-the-groove");
      expect(def.playRequiresFirstClick).toBe(true);
      expect(def.remainderOfTurnOnInstallPrintedCostGte?.min).toBe(1);
      expect(
        validateEffectTree(def.remainderOfTurnOnInstallPrintedCostGte!.effect),
      ).toBeNull();

      let s: GameState = createInitialState();
      s = structuredClone(s);
      s.turn = emptyTurnBookkeeping();
      const groove = instantiateCard("in-the-groove", "groove-1", "runner:heap");
      s.cards["groove-1"] = groove;
      s.turn.remainderOfTurnOnInstallPrintedCostGte = [
        {
          min: 1,
          effect: def.remainderOfTurnOnInstallPrintedCostGte!.effect,
          sourceId: "groove-1",
        },
      ];
      const hw = instantiateCard("dzmz-optimizer", "hw-1", "runner:installed");
      hw.installCost = 2;
      s.cards["hw-1"] = hw;
      s.runner.installed = ["hw-1"];
      fireRemainderOfTurnOnInstallPrintedCostGte(s, "hw-1");
      expect(s.pendingChoice?.options.some((o) => o.id === "draw")).toBe(true);
    });

    it("Game Over requires stolen agenda last turn and trash-type composite", () => {
      const def = getCardDef("game-over");
      expect(def.playRequiresAgendaStolenLastTurn).toBe(true);
      expect(JSON.stringify(def.onPlay)).toContain(
        "trash_type_may_pay_3_prevent",
      );
      expect(JSON.stringify(def.onPlay)).toContain("give_bad_publicity");
      expect(validateEffectTree(def.onPlay!)).toBeNull();

      let s: GameState = createInitialState();
      s = structuredClone(s);
      const r = evalEffect(
        { state: s, sourceId: s.corp.identityId },
        fx.do({ kind: "trash_type_may_pay_3_prevent" }),
      );
      expect(r.ok).toBe(true);
      expect(s.pendingChoice?.options.some((o) => o.id.startsWith("go-type:"))).toBe(
        true,
      );
    });
  });
  });

  describe("df-v157-j-slice", () => {

  beforeAll(() => {
    if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
    if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
    assertPinnedTag("v26.03");
    assertCardsPinnedTag("v1.147.6");
  });

  describe("Downfall v1.57.0 J-slice", () => {

    it("Reduced Service rez spend + initiate tax per power", () => {
      const def = getCardDef("reduced-service");
      expect(def.rezSpendCreditsForPowerCounters).toEqual({ max: 4 });
      expect(def.additionalRunInitiatePerPowerCounter).toEqual({ credits: 2 });
      expect(JSON.stringify(def.onSuccessfulRun)).toContain("remove_power_counter");
      expect(validateEffectTree(def.onSuccessfulRun!)).toBeNull();

      let s: GameState = createInitialState();
      s = structuredClone(s);
      const card = instantiateCard("reduced-service", "rs-1", "server:remote1:root");
      card.rezzed = true;
      card.powerCounters = 2;
      s.cards["rs-1"] = card;
      s.servers["remote1"] = {
        id: "remote1",
        kind: "remote",
        root: ["rs-1"],
        ice: [],
      };
      expect(additionalRunInitiateTax(s, "remote1")).toEqual({
        credits: 4,
        clicks: 0,
      });

      const spend = evalEffect(
        { state: s, sourceId: "rs-1" },
        fx.do({ kind: "rez_spend_credits_for_power_counters", amount: 3 }),
      );
      expect(spend.ok).toBe(true);
      // Corp starts with 5; spending 3 leaves 2; power was 2 + 3 = 5.
      expect(s.corp.credits).toBe(2);
      expect(s.cards["rs-1"]!.powerCounters).toBe(5);
    });

    it("Cold Site Server click→power, initiate tax, remove_all", () => {
      const def = getCardDef("cold-site-server");
      expect(def.additionalRunInitiatePerPowerCounter).toEqual({
        clicks: 1,
        credits: 1,
      });
      expect(def.onTurnBegin).toEqual(fx.removeAllPowerCounters());
      expect(validateEffectTree(def.onTurnBegin!)).toBeNull();
      expect(def.paidAbilities?.[0]?.effect).toEqual(fx.addPowerCounter(1));

      let s: GameState = createInitialState();
      s = structuredClone(s);
      const card = instantiateCard("cold-site-server", "cs-1", "server:remote1:root");
      card.rezzed = true;
      card.powerCounters = 3;
      s.cards["cs-1"] = card;
      s.servers["remote1"] = {
        id: "remote1",
        kind: "remote",
        root: ["cs-1"],
        ice: [],
      };
      expect(additionalRunInitiateTax(s, "remote1")).toEqual({
        credits: 3,
        clicks: 3,
      });
      const r = evalEffect(
        { state: s, sourceId: "cs-1" },
        fx.removeAllPowerCounters(),
      );
      expect(r.ok).toBe(true);
      expect(s.cards["cs-1"]!.powerCounters).toBe(0);
    });

    it("Stargate reveal top n RD trash one", () => {
      const def = getCardDef("stargate");
      expect(JSON.stringify(def.paidAbilities)).toContain(
        "reveal_top_n_rd_trash_one",
      );
      expect(JSON.stringify(def.paidAbilities)).toContain("set_run_skip_breach");
      const onSuccess = def.paidAbilities![0]!.startsRun!.onSuccessfulRun!;
      expect(validateEffectTree(onSuccess)).toBeNull();

      let s: GameState = createInitialState();
      s = structuredClone(s);
      const a = instantiateCard("hedge-fund", "rd-a", "corp:rd");
      const b = instantiateCard("hedge-fund", "rd-b", "corp:rd");
      const c = instantiateCard("hedge-fund", "rd-c", "corp:rd");
      s.cards["rd-a"] = a;
      s.cards["rd-b"] = b;
      s.cards["rd-c"] = c;
      s.corp.deck = ["rd-a", "rd-b", "rd-c"];
      const r = evalEffect(
        { state: s, sourceId: s.runner.identityId },
        fx.revealTopNRdTrashOne(3),
      );
      expect(r.ok).toBe(true);
      expect(s.pendingChoice?.chooser).toBe("runner");
      expect(s.pendingChoice?.options).toHaveLength(3);
      expect(s.turn.rdLookedCards).toEqual(["rd-a", "rd-b", "rd-c"]);
    });

    it("Letheia Nisei once-per-run approach + move outermost", () => {
      const def = getCardDef("letheia-nisei");
      expect(def.onApproachServerOncePerRun).toBe(true);
      expect(JSON.stringify(def.onApproachServer)).toContain(
        "move_runner_to_outermost_attacked",
      );
      expect(validateEffectTree(def.onApproachServer!)).toBeNull();

      let s: GameState = createInitialState();
      s = structuredClone(s);
      const ice = instantiateCard("ice-wall", "ice-1", "server:hq:ice");
      ice.rezzed = true;
      s.cards["ice-1"] = ice;
      s.servers.hq.ice = ["ice-1"];
      s.run = {
        attackedServerId: "hq",
        phase: "success",
        position: null,
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
        { state: s, sourceId: s.corp.identityId },
        fx.moveRunnerToOutermostAttacked(),
      );
      expect(r.ok).toBe(true);
      expect(s.run!.position).toBe(0);
    });

    it("Climactic Showdown choose server → decline registers breach bonus", () => {
      const def = getCardDef("climactic-showdown");
      expect(JSON.stringify(def.onTurnBegin)).toContain("rfg_self");
      expect(JSON.stringify(def.onTurnBegin)).toContain(
        "may_corp_choose_climactic_server_trash_ice_else_bonus_access",
      );
      expect(validateEffectTree(def.onTurnBegin!)).toBeNull();

      let s: GameState = createInitialState();
      s = structuredClone(s);
      s.turn = emptyTurnBookkeeping();
      const ice = instantiateCard("ice-wall", "ice-1", "server:hq:ice");
      ice.rezzed = true;
      s.cards["ice-1"] = ice;
      s.servers.hq.ice = ["ice-1"];

      const choose = evalEffect(
        { state: s, sourceId: s.runner.identityId },
        fx.climacticChooseServerCorpMayTrashIceElseBonusAccess(),
      );
      expect(choose.ok).toBe(true);
      expect(
        s.pendingChoice?.options.some((o) => o.id === "climactic-server:hq"),
      ).toBe(true);

      const corpMay = evalEffect(
        { state: s, sourceId: s.runner.identityId },
        fx.do({ kind: "may_corp_trash_climactic_ice", serverId: "hq" }),
      );
      expect(corpMay.ok).toBe(true);
      expect(
        s.pendingChoice?.options.some((o) => o.id === "climactic-decline"),
      ).toBe(true);

      const decline = evalEffect(
        { state: s, sourceId: s.runner.identityId },
        fx.do({ kind: "climactic_register_bonus_access", amount: 2 }),
      );
      expect(decline.ok).toBe(true);
      expect(s.turn.climacticBonusAccessOnFirstHqRdBreach).toBe(2);

      // Fire at first HQ breach.
      s.run = {
        attackedServerId: "hq",
        phase: "breach",
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
      // Seed HQ hand so bonus access has cards to expand into.
      const h1 = instantiateCard("hedge-fund", "hq-1", "corp:hq");
      const h2 = instantiateCard("hedge-fund", "hq-2", "corp:hq");
      const h3 = instantiateCard("hedge-fund", "hq-3", "corp:hq");
      s.cards["hq-1"] = h1;
      s.cards["hq-2"] = h2;
      s.cards["hq-3"] = h3;
      s.corp.hand = ["hq-1", "hq-2", "hq-3"];
      beginBreachAccess(s, "hq");
      expect(s.turn.climacticBonusAccessOnFirstHqRdBreach).toBe(0);
      expect(s.run!.bonusAccess ?? 0).toBeGreaterThanOrEqual(2);
    });
  });
  });

  describe("df-v158-k-slice", () => {

  beforeAll(() => {
    if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
    if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
    assertPinnedTag("v26.03");
    assertCardsPinnedTag("v1.147.6");
  });

  describe("Downfall v1.58.0 K-slice", () => {

    it("Direct Access blanks identities + may shuffle on run end", () => {
      const def = getCardDef("direct-access");
      expect(def.blankIdentitiesWhileResolving).toBe(true);
      expect(def.runEvent?.servers).toBe("any");
      expect(JSON.stringify(def.runEvent?.onRunEnd)).toContain(
        "may_shuffle_title_from_heap_into_stack",
      );
      expect(validateEffectTree(def.runEvent!.onRunEnd!)).toBeNull();

      let s: GameState = createInitialState();
      s = structuredClone(s);
      const da = instantiateCard("direct-access", "da-1", "runner:heap");
      s.cards["da-1"] = da;
      s.run = {
        attackedServerId: "hq",
        phase: "approach_server",
        position: null,
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
        runSourceId: "da-1",
      };
      expect(abilitiesSuppressed(s, s.corp.identityId)).toBe(true);
      expect(abilitiesSuppressed(s, s.runner.identityId)).toBe(true);
    });

    it("Lucky Charm interrupt RFG prevent Corp ETR", () => {
      const def = getCardDef("lucky-charm");
      const ab = def.paidAbilities![0]!;
      expect(ab.windows).toEqual(["end_the_run_interrupt"]);
      expect(ab.requiresSuccessfulHqRunThisTurn).toBe(true);
      expect(ab.cost?.rfgSelf).toBe(true);
      expect(validateEffectTree(ab.effect)).toBeNull();
      expect(JSON.stringify(ab.effect)).toContain(
        "prevent_pending_end_the_run_from_corp_card_ability",
      );
    });

    it("Whistleblower name-steal leaf validates", () => {
      const def = getCardDef("whistleblower");
      expect(JSON.stringify(def.onSuccessfulRun)).toContain(
        "may_trash_name_agenda_steal_ignore_costs",
      );
      expect(validateEffectTree(def.onSuccessfulRun!)).toBeNull();
    });

    it("Storgotic Resonator faction + power + net", () => {
      const def = getCardDef("storgotic-resonator");
      expect(def.faction).toBe("jinteki");
      expect(def.onFirstTrashMatchingRunnerIdentityFactionEachTurn).toBeTruthy();
      expect(JSON.stringify(def.paidAbilities)).toContain("net_damage");
      expect(
        validateEffectTree(def.onFirstTrashMatchingRunnerIdentityFactionEachTurn!),
      ).toBeNull();
    });

    it("Hyoubu Institute first-reveal + reveal paid", () => {
      const def = getCardDef("hyoubu-institute-absolute-clarity");
      expect(JSON.stringify(def.onFirstRevealEachTurn)).toContain("gain_credits");
      expect(JSON.stringify(def.paidAbilities)).toContain(
        "reveal_hyoubu_grip_random_or_stack_top",
      );
      expect(validateEffectTree(def.onFirstRevealEachTurn!)).toBeNull();
      expect(validateEffectTree(def.paidAbilities![0]!.effect)).toBeNull();
    });

    it("The Class Act discard-install draw + would-draw interrupt", () => {
      const def = getCardDef("the-class-act");
      expect(JSON.stringify(def.onDiscardPhaseEnd)).toContain(
        "self_installed_this_turn",
      );
      expect(JSON.stringify(def.onWouldDrawOncePerTurn)).toContain(
        "look_class_act_top_draw_amount_plus_one_bottom_one",
      );
      expect(validateEffectTree(def.onDiscardPhaseEnd!)).toBeNull();
      expect(validateEffectTree(def.onWouldDrawOncePerTurn!)).toBeNull();
    });

    it("Always Have a Backup Plan unsuccessful rerun leaf", () => {
      const def = getCardDef("always-have-a-backup-plan");
      expect(def.runEvent?.servers).toBe("any");
      expect(JSON.stringify(def.runEvent?.onRunEnd)).toContain(
        "backup_plan_may_rerun_ignore_additional_costs_bypass_last_ice",
      );
      expect(JSON.stringify(def.runEvent?.onRunEnd)).toContain("run_unsuccessful");
      expect(validateEffectTree(def.runEvent!.onRunEnd!)).toBeNull();
    });

    it("Complete Image agenda-pts gate + name-net loop", () => {
      const def = getCardDef("complete-image");
      expect(def.playRequiresSuccessfulRunLastTurn).toBe(true);
      expect(def.playRequiresRunnerAgendaPointsGte).toBe(3);
      expect(def.endsActionPhase).toBe(true);
      expect(JSON.stringify(def.onPlay)).toContain(
        "name_net_damage_loop",
      );
      expect(validateEffectTree(def.onPlay!)).toBeNull();
    });

    it("Khusyuk skip breach + set-aside access", () => {
      const def = getCardDef("khusyuk");
      expect(def.runEvent?.servers).toBe("rd");
      expect(JSON.stringify(def.runEvent?.onSuccessfulRun)).toContain(
        "set_run_skip_breach",
      );
      expect(JSON.stringify(def.runEvent?.onSuccessfulRun)).toContain(
        "choose_install_cost_set_aside_access_shuffle",
      );
      expect(validateEffectTree(def.runEvent!.onSuccessfulRun!)).toBeNull();
    });

    it("MirrorMorph third-distinct tracking field + discount leaf", () => {
      const def = getCardDef("mirrormorph-endless-iteration");
      expect(def.mirrormorphOnThirdDistinctAction).toBeTruthy();
      expect(JSON.stringify(def.mirrormorphOnThirdDistinctAction)).toContain(
        "mirrormorph_take_different_action_click_discount",
      );
      expect(validateEffectTree(def.mirrormorphOnThirdDistinctAction!)).toBeNull();

      let s: GameState = createInitialState();
      s = structuredClone(s);
      const mm = instantiateCard(
        "mirrormorph-endless-iteration",
        "mm-1",
        "corp:identity",
      );
      s.cards["mm-1"] = mm;
      s.corp.identityId = "mm-1";
      expect(mm.mirrormorphTrackDistinctActions).toBe(true);
      const r = evalEffect(
        { state: s, sourceId: "mm-1" },
        fx.mirrormorphTakeDifferentActionClickDiscount(),
      );
      expect(r.ok).toBe(true);
      expect(s.turn.mirrormorphClickDiscountPending).toBe(true);
    });

    it("interaction: Cold Site Server initiate tax still works", () => {
      let s: GameState = createInitialState();
      s = structuredClone(s);
      const card = instantiateCard("cold-site-server", "cs-1", "server:remote1:root");
      card.rezzed = true;
      card.powerCounters = 2;
      s.cards["cs-1"] = card;
      s.servers["remote1"] = {
        id: "remote1",
        kind: "remote",
        root: ["cs-1"],
        ice: [],
      };
      expect(additionalRunInitiateTax(s, "remote1")).toEqual({
        credits: 2,
        clicks: 2,
      });
    });

    it("interaction: Direct Access blankIdentities suppresses identity abilities", () => {
      let s: GameState = createInitialState();
      s = structuredClone(s);
      s.turn = emptyTurnBookkeeping();
      s.run = {
        attackedServerId: "rd",
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
        blankIdentities: true,
      };
      expect(abilitiesSuppressed(s, s.corp.identityId)).toBe(true);
      expect(abilitiesSuppressed(s, s.runner.identityId)).toBe(true);
    });

    it("interaction: Lucky Charm prevent pending Corp-ability ETR", () => {
      let s: GameState = createInitialState();
      s = structuredClone(s);
      s.turn = emptyTurnBookkeeping();
      s.turn.successfulHqRunThisTurn = true;
      s.run = {
        attackedServerId: "hq",
        phase: "encounter_ice",
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
      openPendingEndTheRun(s, "ice-wall-1", true);
      expect(s.pendingEndTheRun?.fromCorpCardAbility).toBe(true);
      const r = evalEffect(
        { state: s, sourceId: s.runner.identityId },
        fx.preventPendingEndTheRunFromCorpCardAbility(),
      );
      expect(r.ok).toBe(true);
      expect(s.pendingEndTheRun).toBeNull();
      expect(s.run?.endedTheRun).toBe(false);
      // Accept path would end the run — prevent cleared it.
      preventPendingEndTheRun(s);
      expect(s.pendingEndTheRun).toBeNull();
    });
  });
  });
});
