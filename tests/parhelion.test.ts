/**
 * parhelion play tests.
 */
import { describe, expect, it, beforeAll } from "vitest";
import {
  applyAction,
  assertCardsPinnedTag,
  assertPinnedTag,
  cardsDataPresent,
  createInitialState,
  crDataPresent,
  effectiveAdvancementRequirement,
  getCardDef,
  instantiateCard,
  queryLegality,
  evalEffect,
  fx,
  validateEffectTree,
  abilitiesSuppressed,
  agendaPointsFor,
  checkWinConditions,
  effectiveBreakerStrength,
} from "../src/index.js";
import {
  canScoreAgenda,
} from "../src/state/scoring.js";
import type {
  ServerId,
} from "../src/state/types.js";
import {
  recomputeRunnerMaxHandSize,
} from "../src/state/handSize.js";
import {
  resolveAndAdvance,
} from "../src/timing/machine.js";
import {
  moveRunnerCardToHeap,
} from "../src/state/trashHooks.js";
import {
  addBreakerStrengthBoostThisRun,
} from "../src/state/lingeringEffects.js";

describe("parhelion", () => {
  describe("parhelion-adv-req-reduction", () => {
  beforeAll(() => {
    if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
    if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
    assertPinnedTag("v26.03");
    assertCardsPinnedTag("v1.147.15");
  });

  function must(
    state: ReturnType<typeof createInitialState>,
    action: Parameters<typeof applyAction>[1],
  ) {
    const r = applyAction(state, action);
    if (!r.ok) throw new Error(`${r.error} ${JSON.stringify(r.cites)}`);
    return r.state;
  }

  function installAgenda(
    s: ReturnType<typeof createInitialState>,
    defId: string,
    instanceId: string,
    advancementCounters: number,
  ) {
    const remote = "remote-1" as ServerId;
    s.servers[remote] = { id: remote, kind: "remote", ice: [], root: [] };
    const agenda = instantiateCard(defId, instanceId, `server:${remote}:root`);
    agenda.advancementCounters = advancementCounters;
    agenda.unsupported = [];
    s.cards[instanceId] = agenda;
    s.servers[remote].root = [instanceId];
    return agenda;
  }

  describe("PH Freedom of Information (−1 adv req per tag)", () => {
    it("effective requirement drops with tags; canScore when counters meet it", () => {
      let s = createInitialState();
      s = structuredClone(s);
      const agenda = installAgenda(s, "freedom-of-information", "foi-1", 2);
      agenda.advancementRequirement = 4;
      agenda.advancementRequirementReductionPerTag = 1;
      s.runner.tags = 0;
      expect(effectiveAdvancementRequirement(s, agenda)).toBe(4);
      expect(canScoreAgenda(s, agenda)).toBe(false);

      s.runner.tags = 2;
      expect(effectiveAdvancementRequirement(s, agenda)).toBe(2);
      expect(canScoreAgenda(s, agenda)).toBe(true);

      s.runner.tags = 10;
      expect(effectiveAdvancementRequirement(s, agenda)).toBe(0);
    });

    it("scores via host when tags reduce requirement", () => {
      let s = createInitialState();
      s = structuredClone(s);
      const agenda = installAgenda(s, "freedom-of-information", "foi-1", 2);
      agenda.advancementRequirement = 4;
      agenda.advancementRequirementReductionPerTag = 1;
      s.runner.tags = 2;
      s.corp.clicks = 3;
      s.activeSide = "corp";
      s.timingKey = "corp.actionPaw";
      const id = s.cards[s.corp.identityId];
      if (id) delete id.onAgendaScored;

      const legal = queryLegality(s).legal;
      expect(
        legal.some(
          (e) => e.action.type === "score_agenda" && e.action.cardId === "foi-1",
        ),
      ).toBe(true);
      s = must(s, { type: "score_agenda", cardId: "foi-1" });
      expect(s.corp.scoreArea).toContain("foi-1");
    });
  });

  describe("PH Ontological Dependence (−1 adv req per core damage)", () => {
    it("uses runner.coreDamage as the this-game core-damage counter", () => {
      let s = createInitialState();
      s = structuredClone(s);
      const agenda = installAgenda(s, "ontological-dependence", "od-1", 2);
      agenda.advancementRequirement = 4;
      agenda.advancementRequirementReductionPerCoreDamageThisGame = 1;
      s.runner.coreDamage = 0;
      expect(effectiveAdvancementRequirement(s, agenda)).toBe(4);
      expect(canScoreAgenda(s, agenda)).toBe(false);

      s.runner.coreDamage = 2;
      expect(effectiveAdvancementRequirement(s, agenda)).toBe(2);
      expect(canScoreAgenda(s, agenda)).toBe(true);
    });
  });

  describe("PH Regulatory Capture (−1 adv req per BP, max 4)", () => {
    it("caps bad publicity counted at max", () => {
      let s = createInitialState();
      s = structuredClone(s);
      const agenda = installAgenda(s, "regulatory-capture", "rc-1", 2);
      agenda.advancementRequirement = 6;
      agenda.advancementRequirementReductionPerBadPublicity = {
        per: 1,
        max: 4,
      };
      s.corp.badPublicity = 0;
      expect(effectiveAdvancementRequirement(s, agenda)).toBe(6);
      expect(canScoreAgenda(s, agenda)).toBe(false);

      s.corp.badPublicity = 4;
      expect(effectiveAdvancementRequirement(s, agenda)).toBe(2);
      expect(canScoreAgenda(s, agenda)).toBe(true);

      s.corp.badPublicity = 9;
      expect(effectiveAdvancementRequirement(s, agenda)).toBe(2);
    });
  });

  describe("PH adv-req reduction card wiring (pin v0.48.0)", () => {
    it("wires FoI / OD / RC with empty unsupported", () => {
      const foi = getCardDef("freedom-of-information");
      expect(foi.unsupported).toEqual([]);
      expect(foi.advancementRequirementReductionPerTag).toBe(1);
      expect(foi.advancementRequirement).toBe(4);
      expect(foi.agendaPoints).toBe(2);

      const od = getCardDef("ontological-dependence");
      expect(od.unsupported).toEqual([]);
      expect(od.advancementRequirementReductionPerCoreDamageThisGame).toBe(1);
      expect(od.advancementRequirement).toBe(4);

      const rc = getCardDef("regulatory-capture");
      expect(rc.unsupported).toEqual([]);
      expect(rc.advancementRequirementReductionPerBadPublicity).toEqual({
        per: 1,
        max: 4,
      });
      expect(rc.advancementRequirement).toBe(6);
    });
  });
  });

  describe("parhelion-asmund", () => {
  beforeAll(() => {
    if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
    if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
    assertPinnedTag("v26.03");
    assertCardsPinnedTag("v1.147.15");
  });

  function must(
    state: ReturnType<typeof createInitialState>,
    action: Parameters<typeof applyAction>[1],
  ) {
    const r = applyAction(state, action);
    if (!r.ok) throw new Error(`${r.error} ${JSON.stringify(r.cites)}`);
    return r.state;
  }

  describe("PH Asmund Pudlat", () => {
    it("wires search-host + may-grip + trashWhenNoHostedCards", () => {
      const def = getCardDef("asmund-pudlat");
      expect(def.unsupported ?? []).toEqual([]);
      expect(def.trashWhenNoHostedCards).toBe(true);
      expect(validateEffectTree(def.onInstall!)).toBeNull();
      expect(validateEffectTree(def.onTurnBegin!)).toBeNull();
      expect(validateEffectTree(fx.searchStackHostVirusOrWeapon(2))).toBeNull();
      expect(validateEffectTree(fx.mayAddHostedCardToGrip())).toBeNull();
    });

    it("onInstall hosts up to 2 virus/weapon with different names from stack", () => {
      let s = createInitialState();
      s = structuredClone(s);
      const asmund = instantiateCard("asmund-pudlat", "asm-1", "runner:installed");
      asmund.trashWhenNoHostedCards = true;
      s.cards["asm-1"] = asmund;
      s.runner.installed = ["asm-1"];

      const v1 = instantiateCard("botulus", "v-1", "runner:stack");
      const v2 = instantiateCard("botulus", "v-2", "runner:stack"); // same title
      const w1 = instantiateCard("poison-vial", "w-1", "runner:stack");
      const fill = instantiateCard("sure-gamble", "fill-1", "runner:stack");
      s.cards["v-1"] = v1;
      s.cards["v-2"] = v2;
      s.cards["w-1"] = w1;
      s.cards["fill-1"] = fill;
      s.runner.deck = ["v-1", "v-2", "w-1", "fill-1"];

      const r = evalEffect(
        { state: s, sourceId: "asm-1" },
        fx.searchStackHostVirusOrWeapon(2),
      );
      expect(r.ok).toBe(true);
      expect(s.cards["asm-1"]!.hostedCardIds).toEqual(["v-1", "w-1"]);
      expect(s.cards["v-1"]!.hostId).toBe("asm-1");
      expect(s.cards["v-1"]!.faceup).toBe(true);
      expect(s.runner.installed).not.toContain("v-1"); // not installed
      expect(s.runner.deck).toContain("v-2");
      expect(s.runner.deck).toContain("fill-1");
      expect(s.runner.deck).not.toContain("v-1");
    });

    it("may add hosted to grip then trashes when empty", () => {
      let s = createInitialState();
      s = structuredClone(s);
      const asmund = instantiateCard("asmund-pudlat", "asm-1", "runner:installed");
      asmund.trashWhenNoHostedCards = true;
      asmund.hostedCardIds = ["v-1"];
      s.cards["asm-1"] = asmund;
      s.runner.installed = ["asm-1"];
      const v1 = instantiateCard("botulus", "v-1", "hosted:asm-1");
      v1.hostId = "asm-1";
      v1.faceup = true;
      s.cards["v-1"] = v1;

      const r = evalEffect(
        { state: s, sourceId: "asm-1" },
        fx.mayAddHostedCardToGrip(),
      );
      expect(r.ok).toBe(true);
      expect(s.pendingChoice?.chooser).toBe("runner");
      s = must(s, { type: "choose_option", optionId: "grip:v-1" });
      expect(s.runner.hand).toContain("v-1");
      expect(s.cards["v-1"]!.hostId).toBeUndefined();
      expect(s.runner.discardPile).toContain("asm-1");
      expect(s.runner.installed).not.toContain("asm-1");
    });
  });
  });

  describe("parhelion-concerto-anvil", () => {
  beforeAll(() => {
    if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
    if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
    assertPinnedTag("v26.03");
    assertCardsPinnedTag("v1.147.15");
  });

  describe("PH Concerto", () => {
    it("wires reveal-top place hosted credits + runEvent", () => {
      const def = getCardDef("concerto");
      expect(def.unsupported).toEqual([]);
      expect(def.runEvent?.servers).toBe("any");
      expect(validateEffectTree(def.onPlay!)).toBeNull();
      expect(
        validateEffectTree(fx.revealTopStackToGripPlaceHostedCredits()),
      ).toBeNull();

      let s = createInitialState();
      s = structuredClone(s);
      const top = instantiateCard("sure-gamble", "top-1", "runner:stack");
      top.playCost = 5;
      s.cards["top-1"] = top;
      s.runner.deck = ["top-1", ...s.runner.deck];
      const ev = instantiateCard("concerto", "con-1", "runner:heap");
      s.cards["con-1"] = ev;
      const r = evalEffect(
        { state: s, sourceId: "con-1" },
        fx.revealTopStackToGripPlaceHostedCredits(),
      );
      expect(r.ok).toBe(true);
      expect(s.runner.hand).toContain("top-1");
      expect(s.cards["con-1"]!.hostedCredits).toBe(5);
    });
  });

  describe("PH Anvil", () => {
    it("wires onEncounter may-trash → forbid break + subroutines", () => {
      const def = getCardDef("anvil");
      expect(def.unsupported).toEqual([]);
      expect(validateEffectTree(def.onEncounter!)).toBeNull();
      expect(def.subroutines?.length).toBe(2);
      expect(validateEffectTree(fx.forbidRunnerBreakOnSource())).toBeNull();

      let s = createInitialState();
      s = structuredClone(s);
      const ice = instantiateCard("anvil", "anv-1", "server:hq:ice");
      s.cards["anv-1"] = ice;
      const r = evalEffect(
        { state: s, sourceId: "anv-1" },
        fx.forbidRunnerBreakOnSource(),
      );
      expect(r.ok).toBe(true);
      expect(s.cards["anv-1"]!.cannotBreakWithRunnerCardAbilities).toBe(true);
    });
  });
  });

  describe("parhelion-cyber-power", () => {
  beforeAll(() => {
    if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
    if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
    assertPinnedTag("v26.03");
    assertCardsPinnedTag("v1.147.15");
  });

  function must(
    state: ReturnType<typeof createInitialState>,
    action: Parameters<typeof applyAction>[1],
  ) {
    const r = applyAction(state, action);
    if (!r.ok) throw new Error(`${r.error} ${JSON.stringify(r.cites)}`);
    return r.state;
  }

  function fillGrip(
    s: ReturnType<typeof createInitialState>,
    n: number,
    prefix: string,
  ) {
    for (let i = 0; i < n; i++) {
      const id = `${prefix}-${i}`;
      s.cards[id] = instantiateCard("sure-gamble", id, "runner:grip");
      s.runner.hand.push(id);
    }
  }

  function finishToTakeAction(
    state: ReturnType<typeof createInitialState>,
  ): ReturnType<typeof createInitialState> {
    let s = state;
    while (s.run && s.timingKey === "breach.awaitAccess") {
      if (s.run.accessCandidates.length === 0) {
        s = must(s, { type: "finish_breach" });
      } else {
        s = must(s, { type: "access_card", cardId: s.run.accessCandidates[0]! });
      }
    }
    // Drain pending sabotage / choice if present
    if (s.pendingChoice) {
      const decline =
        s.pendingChoice.options.find((o) => o.id === "decline") ??
        s.pendingChoice.options[0]!;
      s = must(s, { type: "choose_option", optionId: decline.id });
    }
    if (s.pendingSabotage) {
      s = must(s, { type: "resolve_sabotage", hqCardIds: [] });
    }
    if (s.timingKey === "runner.actionPaw") {
      s = must(s, { type: "pass_window" });
    }
    return s;
  }

  describe("PH Zenit Chip first successful central draw", () => {
    it("draws on first successful central; not on remote; not twice", () => {
      let s = createInitialState();
      s = structuredClone(s);
      const zen = instantiateCard("sure-gamble", "zen-1", "runner:installed");
      zen.title = "Zenit Chip JZ-2MJ";
      zen.type = "hardware";
      zen.onFirstSuccessfulCentralRunThisTurn = fx.draw("runner", 1);
      zen.unsupported = [];
      s.cards["zen-1"] = zen;
      s.runner.installed = ["zen-1"];
      // Stack cards to draw
      for (let i = 0; i < 3; i++) {
        const id = `stk-${i}`;
        s.cards[id] = instantiateCard("sure-gamble", id, "runner:stack");
        s.runner.deck.push(id);
      }
      s.servers.hq.ice = [];
      s.servers.rd.ice = [];
      s.servers["remote-1"] = {
        id: "remote-1" as ServerId,
        kind: "remote",
        ice: [],
        root: [],
      };
      s.activeSide = "runner";
      s.timingKey = "runner.takeAction";
      s.runner.clicks = 4;

      const grip0 = s.runner.hand.length;
      s = must(s, { type: "basic_run", serverId: "remote-1" as ServerId });
      expect(s.runner.hand.length).toBe(grip0);
      s = finishToTakeAction(s);
      s.runner.clicks = 4;

      s = must(s, { type: "basic_run", serverId: "hq" as ServerId });
      expect(s.runner.hand.length).toBe(grip0 + 1);
      s = finishToTakeAction(s);
      s.runner.clicks = 4;

      const grip1 = s.runner.hand.length;
      s = must(s, { type: "basic_run", serverId: "rd" as ServerId });
      expect(s.runner.hand.length).toBe(grip1);
    });
  });

  describe("PH Nga first successful run may sabotage", () => {
    it("offers choice; sabotage path removes power and pending sabotage", () => {
      let s = createInitialState();
      s = structuredClone(s);
      const nga = instantiateCard("sure-gamble", "nga-1", "runner:installed");
      nga.title = "Nga";
      nga.type = "program";
      nga.powerCounters = 3;
      nga.trashWhenPowerEmpty = true;
      nga.onSuccessfulRunOncePerTurn = true;
      nga.onSuccessfulRun = fx.choose("runner", [
        {
          id: "sabotage",
          label: "Remove 1 power counter to sabotage 1",
          effect: fx.seq(fx.removePowerCounter(1), fx.sabotage(1, true)),
        },
        {
          id: "decline",
          label: "Decline",
          effect: fx.gainCredits("runner", 0),
        },
      ]);
      nga.unsupported = [];
      s.cards["nga-1"] = nga;
      s.runner.installed = ["nga-1"];
      s.servers.hq.ice = [];
      s.activeSide = "runner";
      s.timingKey = "runner.takeAction";
      s.runner.clicks = 4;

      s = must(s, { type: "basic_run", serverId: "hq" as ServerId });
      expect(s.pendingChoice?.sourceId).toBe("nga-1");
      s = must(s, { type: "choose_option", optionId: "sabotage" });
      expect(s.cards["nga-1"]!.powerCounters).toBe(2);
      expect(s.pendingSabotage?.amount).toBe(1);
    });
  });

  describe("PH Dr. Nuka Vrolyck power draw", () => {
    it("pays click + power to draw 3; trashes when empty", () => {
      let s = createInitialState();
      s = structuredClone(s);
      const nuka = instantiateCard("sure-gamble", "nuka-1", "runner:installed");
      nuka.title = "Dr. Nuka Vrolyck";
      nuka.type = "resource";
      nuka.powerCounters = 2;
      nuka.trashWhenPowerEmpty = true;
      nuka.paidAbilities = [
        {
          id: "nuka-draw",
          label: "[click], hosted power counter: Draw 3 cards",
          clickCost: 1,
          creditCost: 0,
          cost: { clicks: 1, powerCounters: 1 },
          windows: ["runner_action_paw"],
          effect: fx.draw("runner", 3),
        },
      ];
      nuka.unsupported = [];
      s.cards["nuka-1"] = nuka;
      s.runner.installed = ["nuka-1"];
      for (let i = 0; i < 6; i++) {
        const id = `stk-n-${i}`;
        s.cards[id] = instantiateCard("sure-gamble", id, "runner:stack");
        s.runner.deck.push(id);
      }
      s.activeSide = "runner";
      s.timingKey = "runner.takeAction";
      s.runner.clicks = 4;
      const grip0 = s.runner.hand.length;

      s = must(s, {
        type: "use_paid_ability",
        cardId: "nuka-1",
        abilityId: "nuka-draw",
      });
      expect(s.runner.hand.length).toBe(grip0 + 3);
      expect(s.cards["nuka-1"]!.powerCounters).toBe(1);
      expect(s.runner.installed).toContain("nuka-1");

      s.timingKey = "runner.takeAction";
      s = must(s, {
        type: "use_paid_ability",
        cardId: "nuka-1",
        abilityId: "nuka-draw",
      });
      expect(s.cards["nuka-1"]!.powerCounters).toBe(0);
      expect(s.runner.installed).not.toContain("nuka-1");
      expect(s.runner.discardPile).toContain("nuka-1");
    });
  });

  describe("PH Finality playAdditionalCost + R&D bonus access", () => {
    it("pays core damage and starts R&D run with bonusAccess 3", () => {
      let s = createInitialState();
      s = structuredClone(s);
      fillGrip(s, 4, "fill");
      const ev = instantiateCard("jailbreak", "fin-1", "runner:grip");
      ev.title = "Finality";
      ev.playCost = 2;
      ev.playAdditionalCost = fx.coreDamage(1);
      ev.runEvent = { servers: "rd", bonusAccess: 3 };
      ev.unsupported = [];
      s.cards["fin-1"] = ev;
      s.runner.hand.push("fin-1");
      s.runner.credits = 5;
      s.runner.clicks = 4;
      s.servers.rd.ice = [];
      for (let i = 0; i < 5; i++) {
        const id = `rd-${i}`;
        s.cards[id] = instantiateCard("hedge-fund", id, "corp:rd");
        s.corp.deck.push(id);
      }
      s.activeSide = "runner";
      s.timingKey = "runner.takeAction";

      s = must(s, { type: "play_event", cardId: "fin-1", serverId: "rd" });
      expect(s.runner.coreDamage).toBe(1);
      expect(s.run?.attackedServerId).toBe("rd");
      expect(s.run?.bonusAccess).toBe(3);
      expect(s.turn.successfulRunThisTurn).toBe(true);
    });
  });

  describe("PH cyber/power card wiring (pin v0.49.0)", () => {
    it("wires Ampère / Zenit / Nga / Nuka / Finality with empty unsupported", () => {
      const ampere = getCardDef("ampere-cybernetics-for-anyone");
      expect(ampere.unsupported).toEqual([]);
      expect(ampere.type).toBe("identity");

      const zenit = getCardDef("zenit-chip-jz-2mj");
      expect(zenit.unsupported).toEqual([]);
      expect(zenit.onInstall).toEqual(fx.coreDamage(1));
      expect(zenit.onFirstSuccessfulCentralRunThisTurn).toEqual(
        fx.draw("runner", 1),
      );

      const nga = getCardDef("nga");
      expect(nga.unsupported).toEqual([]);
      expect(nga.powerCountersOnInstall).toBe(3);
      expect(nga.trashWhenPowerEmpty).toBe(true);
      expect(nga.onSuccessfulRunOncePerTurn).toBe(true);
      expect(nga.onSuccessfulRun).toBeTruthy();
      expect(validateEffectTree(nga.onSuccessfulRun!)).toBeNull();

      const nuka = getCardDef("dr-nuka-vrolyck");
      expect(nuka.unsupported).toEqual([]);
      expect(nuka.powerCountersOnInstall).toBe(2);
      expect(nuka.trashWhenPowerEmpty).toBe(true);
      expect(nuka.paidAbilities?.[0]?.cost).toEqual({
        clicks: 1,
        powerCounters: 1,
      });

      const finality = getCardDef("finality");
      expect(finality.unsupported).toEqual([]);
      expect(finality.playAdditionalCost).toEqual(fx.coreDamage(1));
      expect(finality.runEvent).toEqual({ servers: "rd", bonusAccess: 3 });
    });
  });
  });

  describe("parhelion-distributed-tracing", () => {
  beforeAll(() => {
    if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
    if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
    assertPinnedTag("v26.03");
    assertCardsPinnedTag("v1.147.15");
  });

  function must(
    state: ReturnType<typeof createInitialState>,
    action: Parameters<typeof applyAction>[1],
  ) {
    const r = applyAction(state, action);
    if (!r.ok) throw new Error(`${r.error} ${JSON.stringify(r.cites)}`);
    return r.state;
  }

  describe("PH Distributed Tracing", () => {
    it("requires agenda stolen last turn + extra click; gives 1 tag", () => {
      let s = createInitialState();
      s = structuredClone(s);
      const op = instantiateCard("hedge-fund", "dt-1", "corp:hq");
      op.title = "Distributed Tracing";
      op.type = "operation";
      op.playCost = 3;
      op.playAdditionalClick = true;
      op.playRequiresAgendaStolenLastTurn = true;
      op.onPlay = fx.giveTags(1);
      op.unsupported = [];
      s.cards["dt-1"] = op;
      s.corp.hand = ["dt-1"];
      s.corp.credits = 10;
      s.corp.clicks = 3;
      s.activeSide = "corp";
      s.timingKey = "corp.takeAction";
      s.turn.agendaPointsStolenLastTurn = 0;
      expect(
        queryLegality(s).legal.some(
          (e) => e.action.type === "play_operation" && e.action.cardId === "dt-1",
        ),
      ).toBe(false);

      s.turn.agendaPointsStolenLastTurn = 2;
      expect(
        queryLegality(s).legal.some(
          (e) => e.action.type === "play_operation" && e.action.cardId === "dt-1",
        ),
      ).toBe(true);

      const clicksBefore = s.corp.clicks;
      s = must(s, { type: "play_operation", cardId: "dt-1" });
      expect(s.corp.clicks).toBe(clicksBefore - 2); // click + additional
      expect(s.runner.tags).toBe(1);
    });
  });

  describe("PH Distributed Tracing wiring (pin v0.62.0)", () => {
    it("wires playRequiresAgendaStolenLastTurn + give_tags", () => {
      const d = getCardDef("distributed-tracing");
      expect(d.unsupported).toEqual([]);
      expect(d.playAdditionalClick).toBe(true);
      expect(d.playRequiresAgendaStolenLastTurn).toBe(true);
      expect(d.onPlay).toEqual(fx.giveTags(1));
    });
  });
  });

  describe("parhelion-gantulga", () => {
  beforeAll(() => {
    if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
    if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
    assertPinnedTag("v26.03");
    assertCardsPinnedTag("v1.147.15");
  });

  function must(
    state: ReturnType<typeof createInitialState>,
    action: Parameters<typeof applyAction>[1],
  ) {
    const r = applyAction(state, action);
    if (!r.ok) throw new Error(`${r.error} ${JSON.stringify(r.cites)}`);
    return r.state;
  }


  describe("PH Tsakhia Bankhar Gantulga", () => {
    it("wires may_choose_server + firstEncounterSubsBecomeNetDamage", () => {
      const def = getCardDef("tsakhia-bankhar-gantulga");
      expect(def.unsupported ?? []).toEqual([]);
      expect(def.firstEncounterSubsBecomeNetDamage).toBe(1);
      expect(validateEffectTree(def.onTurnBegin!)).toBeNull();
      expect(validateEffectTree(fx.mayChooseServer())).toBeNull();
    });

    it("may_choose_server names HQ on the source", () => {
      let s = createInitialState();
      s = structuredClone(s);
      const g = instantiateCard(
        "tsakhia-bankhar-gantulga",
        "gan-1",
        "runner:installed",
      );
      s.cards["gan-1"] = g;
      s.runner.installed = ["gan-1"];
      const r = evalEffect({ state: s, sourceId: "gan-1" }, fx.mayChooseServer());
      expect(r.ok).toBe(true);
      expect(s.pendingChoice?.chooser).toBe("runner");
      s = must(s, { type: "choose_option", optionId: "server:hq" });
      expect(s.cards["gan-1"]!.namedServerId).toBe("hq");
    });

    it("replaces first HQ encounter subs with net damage", () => {
      let s = createInitialState();
      s = structuredClone(s);
      s.activeSide = "runner";
      s.timingKey = "runner.takeAction";
      s.runner.clicks = 1;
      s.runner.credits = 5;
      // Fill grip so net damage has cards to trash.
      for (let i = 0; i < 3; i++) {
        const id = `grip-${i}`;
        s.cards[id] = instantiateCard("sure-gamble", id, "runner:grip");
        s.runner.hand.push(id);
      }
      const g = instantiateCard(
        "tsakhia-bankhar-gantulga",
        "gan-1",
        "runner:installed",
      );
      g.namedServerId = "hq";
      g.firstEncounterSubsBecomeNetDamage = 1;
      s.cards["gan-1"] = g;
      s.runner.installed = ["gan-1"];

      const ice = instantiateCard("ice-wall", "ice-1", "server:hq:ice");
      ice.rezzed = true;
      ice.faceup = true;
      ice.subroutines = [
        {
          id: "etr",
          text: "End the run.",
          effect: fx.etr(),
        },
      ];
      s.cards["ice-1"] = ice;
      s.servers.hq.ice = ["ice-1"];

      const gripBefore = s.runner.hand.length;
      s = must(s, { type: "basic_run", serverId: "hq" as ServerId });
      // Pass approach → encounter → pass encounter (let sub resolve).
      for (let i = 0; i < 16 && s.run; i++) {
        if (s.pendingChoice) {
          s = must(s, {
            type: "choose_option",
            optionId: s.pendingChoice.options[0]!.id,
          });
          continue;
        }
        const r = applyAction(s, { type: "pass_window" });
        if (!r.ok) break;
        s = r.state;
      }
      expect(
        s.log.some((l) => l.includes('as "Do 1 net damage." from')),
      ).toBe(true);
      // Net damage trashed a grip card; ETR did NOT fire (replaced).
      expect(s.runner.hand.length).toBe(gripBefore - 1);
      expect(s.log.some((l) => /End the run \(CR/.test(l))).toBe(false);
    });
  });
  });

  describe("parhelion-gaslight-djupstad", () => {
  beforeAll(() => {
    if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
    if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
    assertPinnedTag("v26.03");
    assertCardsPinnedTag("v1.147.15");
  });

  describe("PH Gaslight", () => {
    it("wires may-trash search operation from R&D", () => {
      const def = getCardDef("gaslight");
      expect(def.unsupported).toEqual([]);
      expect(validateEffectTree(def.onTurnBegin!)).toBeNull();
      expect(validateEffectTree(fx.searchRdOperationToHq())).toBeNull();

      let s = createInitialState();
      s = structuredClone(s);
      const op = instantiateCard("hedge-fund", "op-1", "corp:rd");
      s.cards["op-1"] = op;
      s.corp.deck = ["op-1", ...s.corp.deck];
      const r = evalEffect(
        { state: s, sourceId: "corp-id" },
        fx.searchRdOperationToHq(),
      );
      expect(r.ok).toBe(true);
      expect(s.corp.hand).toContain("op-1");
    });
  });

  describe("PH Djupstad Grid", () => {
    it("wires coreDamageOnAgendaScoredFromThisServer", () => {
      const def = getCardDef("djupstad-grid");
      expect(def.unsupported).toEqual([]);
      expect(def.coreDamageOnAgendaScoredFromThisServer).toBe(1);
    });
  });
  });

  describe("parhelion-hafrun-klevetnik-unsmiling", () => {
  beforeAll(() => {
    if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
    if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
    assertPinnedTag("v26.03");
    assertCardsPinnedTag("v1.147.15");
  });

  function must(
    state: ReturnType<typeof createInitialState>,
    action: Parameters<typeof applyAction>[1],
  ) {
    const r = applyAction(state, action);
    if (!r.ok) throw new Error(`${r.error} ${JSON.stringify(r.cites)}`);
    return r.state;
  }

  describe("PH Hafrún", () => {
    it("wires onRez may-trash-HQ → forbid runner break for run", () => {
      const def = getCardDef("hafrun");
      expect(def.unsupported).toEqual([]);
      expect(validateEffectTree(def.onRez!)).toBeNull();
      expect(validateEffectTree(fx.mayTrashHqThen(fx.forbidInstalledRunnerBreakForRun()))).toBeNull();

      let s = createInitialState();
      s = structuredClone(s);
      const filler = instantiateCard("hedge-fund", "hq-1", "corp:hq");
      s.cards["hq-1"] = filler;
      s.corp.hand = ["hq-1"];
      const ice = instantiateCard("hafrun", "haf-1", "server:hq:ice");
      s.cards["haf-1"] = ice;
      s.servers.hq.ice = ["haf-1"];
      const orca = instantiateCard("orca", "orca-1", "runner:installed");
      s.cards["orca-1"] = orca;
      s.runner.installed = ["orca-1"];
      s.run = {
        attackedServerId: "hq",
        phase: "approach",
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
      const r = evalEffect({ state: s, sourceId: "haf-1" }, def.onRez!);
      expect(r.ok).toBe(true);
      expect(s.pendingChoice?.chooser).toBe("corp");
      s = must(s, { type: "choose_option", optionId: "trash-hq:hq-1" });
      expect(s.corp.hand).not.toContain("hq-1");
      // sole runner card → auto forbid
      expect(s.cards["orca-1"]!.cannotBreakSubsThisRun).toBe(true);
    });
  });

  describe("PH Klevetnik", () => {
    it("wires onRez may-credits → blank resource until Corp turn end", () => {
      const def = getCardDef("klevetnik");
      expect(def.unsupported).toEqual([]);
      expect(validateEffectTree(def.onRez!)).toBeNull();

      let s = createInitialState();
      s = structuredClone(s);
      const res = instantiateCard("red-team", "res-1", "runner:installed");
      s.cards["res-1"] = res;
      s.runner.installed = ["res-1"];
      const ice = instantiateCard("klevetnik", "klev-1", "server:hq:ice");
      s.cards["klev-1"] = ice;
      s.servers.hq.ice = ["klev-1"];
      s.run = {
        attackedServerId: "hq",
        phase: "approach",
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
      const r = evalEffect({ state: s, sourceId: "klev-1" }, def.onRez!);
      expect(r.ok).toBe(true);
      s = must(s, { type: "choose_option", optionId: "give-credits" });
      expect(s.runner.credits).toBeGreaterThanOrEqual(2);
      expect(abilitiesSuppressed(s, "res-1")).toBe(true);
    });
  });

  describe("PH Unsmiling Tsarevna", () => {
    it("wires onRez may-credits → max 1 printed break per encounter", () => {
      const def = getCardDef("unsmiling-tsarevna");
      expect(def.unsupported).toEqual([]);
      expect(def.subroutines?.length).toBe(2);
      expect(validateEffectTree(def.onRez!)).toBeNull();
      expect(validateEffectTree(fx.limitPrintedBreaksOnSourceForRun(1))).toBeNull();

      let s = createInitialState();
      s = structuredClone(s);
      const ice = instantiateCard("unsmiling-tsarevna", "uns-1", "server:hq:ice");
      s.cards["uns-1"] = ice;
      s.servers.hq.ice = ["uns-1"];
      s.run = {
        attackedServerId: "hq",
        phase: "approach",
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
      const r = evalEffect({ state: s, sourceId: "uns-1" }, def.onRez!);
      expect(r.ok).toBe(true);
      s = must(s, { type: "choose_option", optionId: "give-credits" });
      expect(s.cards["uns-1"]!.maxPrintedSubsBreakablePerEncounter).toBe(1);
    });
  });
  });

  describe("parhelion-harmonic-shipment-katorga", () => {
  beforeAll(() => {
    if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
    if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
    assertPinnedTag("v26.03");
    // Pin bump lands with this slice; local CARDS_DATA_ROOT may be ahead.
    assertCardsPinnedTag("v1.147.15");
  });

  function must(
    state: ReturnType<typeof createInitialState>,
    action: Parameters<typeof applyAction>[1],
  ) {
    const r = applyAction(state, action);
    if (!r.ok) throw new Error(`${r.error} ${JSON.stringify(r.cites)}`);
    return r.state;
  }

  describe("PH lose_credits_per_rezzed_subtype + add_from_heap_to_grip IR", () => {
    it("validates new effect trees", () => {
      expect(
        validateEffectTree(fx.loseCreditsPerRezzedSubtype("runner", "harmonic")),
      ).toBeNull();
      expect(validateEffectTree(fx.addFromHeapToGrip("choose"))).toBeNull();
    });

    it("runner loses 1¢ per rezzed harmonic", () => {
      let s = createInitialState();
      s = structuredClone(s);
      s.runner.credits = 5;
      const h1 = instantiateCard("ice-wall", "h-1", "server:hq:ice");
      h1.subtypes = ["barrier", "harmonic"];
      h1.rezzed = true;
      s.cards["h-1"] = h1;
      s.servers.hq.ice = ["h-1"];
      const h2 = instantiateCard("ice-wall", "h-2", "server:rd:ice");
      h2.subtypes = ["code gate", "harmonic"];
      h2.rezzed = true;
      s.cards["h-2"] = h2;
      s.servers.rd.ice = ["h-2"];
      const r = evalEffect(
        { state: s, sourceId: "h-1" },
        fx.loseCreditsPerRezzedSubtype("runner", "harmonic"),
      );
      expect(r.ok).toBe(true);
      expect(s.runner.credits).toBe(3);
    });

    it("adds sole heap card to grip; multi opens choice", () => {
      let s = createInitialState();
      s = structuredClone(s);
      const a = instantiateCard("sure-gamble", "heap-a", "runner:heap");
      const b = instantiateCard("sure-gamble", "heap-b", "runner:heap");
      s.cards["heap-a"] = a;
      s.cards["heap-b"] = b;
      s.runner.discardPile = ["heap-a"];
      const r1 = evalEffect(
        { state: s, sourceId: "runner-id" },
        fx.addFromHeapToGrip("choose"),
      );
      expect(r1.ok).toBe(true);
      expect(s.runner.hand).toContain("heap-a");
      expect(s.runner.discardPile).not.toContain("heap-a");

      s.runner.hand = [];
      s.runner.discardPile = ["heap-a", "heap-b"];
      const r2 = evalEffect(
        { state: s, sourceId: "runner-id" },
        fx.addFromHeapToGrip("choose"),
      );
      expect(r2.ok).toBe(true);
      expect(s.pendingChoice?.chooser).toBe("runner");
      expect(s.pendingChoice?.options.map((o) => o.id)).toEqual(
        expect.arrayContaining(["heap-grip:heap-a", "heap-grip:heap-b"]),
      );
      s = must(s, { type: "choose_option", optionId: "heap-grip:heap-b" });
      expect(s.runner.hand).toContain("heap-b");
      expect(s.runner.discardPile).toEqual(["heap-a"]);
    });
  });

  describe("PH Bloop rezAdditionalCostDerezSubtype", () => {
    it("cannot rez without another rezzed harmonic; derezzes one on rez", () => {
      let s = createInitialState();
      s = structuredClone(s);
      s.corp.credits = 10;
      const bloop = instantiateCard("ice-wall", "bloop-1", "server:hq:ice");
      bloop.title = "Bloop";
      bloop.subtypes = ["sentry", "ap", "destroyer", "harmonic"];
      bloop.rezCost = 3;
      bloop.rezAdditionalCostDerezSubtype = "harmonic";
      bloop.unsupported = [];
      s.cards["bloop-1"] = bloop;
      s.servers.hq.ice = ["bloop-1"];

      s.activeSide = "runner";
      s.timingKey = "runner.takeAction";
      s.runner.clicks = 4;
      s = must(s, { type: "basic_run", serverId: "hq" as ServerId });
      // Approach PAW — no other harmonic → cannot rez
      let guard = 0;
      while (s.timingKey !== "run.approachPaw" && s.run && guard++ < 20) {
        const r = applyAction(s, { type: "pass_window" });
        if (!r.ok) break;
        s = r.state;
      }
      expect(s.timingKey).toBe("run.approachPaw");
      let rez = applyAction(s, { type: "rez_ice", cardId: "bloop-1" });
      expect(rez.ok).toBe(false);

      const wave = instantiateCard("ice-wall", "wave-1", "server:rd:ice");
      wave.subtypes = ["code gate", "harmonic"];
      wave.rezzed = true;
      wave.faceup = true;
      s.cards["wave-1"] = wave;
      s.servers.rd.ice = ["wave-1"];

      rez = applyAction(s, { type: "rez_ice", cardId: "bloop-1" });
      expect(rez.ok).toBe(true);
      s = rez.state;
      expect(s.cards["bloop-1"].rezzed).toBe(true);
      expect(s.cards["wave-1"].rezzed).toBe(false);
    });

    it("wires Bloop from cards-data", () => {
      const def = getCardDef("bloop");
      expect(def.unsupported).toEqual([]);
      expect(def.rezAdditionalCostDerezSubtype).toBe("harmonic");
      expect(def.subroutines).toHaveLength(3);
      expect(validateEffectTree(def.subroutines![0]!.effect)).toBeNull();
    });
  });

  describe("PH Pulse onRez + harmonic subroutines", () => {
    it("on rez during run loses a runner click; wires from cards-data", () => {
      const def = getCardDef("pulse");
      expect(def.unsupported).toEqual([]);
      expect(def.onRez).toBeTruthy();
      expect(validateEffectTree(def.onRez!)).toBeNull();
      expect(def.subroutines).toHaveLength(2);
      expect(
        validateEffectTree(def.subroutines![0]!.effect),
      ).toBeNull();
      expect(
        validateEffectTree(def.subroutines![1]!.effect),
      ).toBeNull();

      let s = createInitialState();
      s = structuredClone(s);
      s.corp.credits = 10;
      s.runner.clicks = 3;
      const pulse = instantiateCard("ice-wall", "pulse-1", "server:hq:ice");
      pulse.title = "Pulse";
      pulse.subtypes = ["code gate", "harmonic"];
      pulse.rezCost = 3;
      pulse.onRez = def.onRez;
      pulse.unsupported = [];
      s.cards["pulse-1"] = pulse;
      s.servers.hq.ice = ["pulse-1"];
      s.activeSide = "runner";
      s.timingKey = "runner.takeAction";
      s.runner.clicks = 3;
      s = must(s, { type: "basic_run", serverId: "hq" as ServerId });
      let guard = 0;
      while (s.timingKey !== "run.approachPaw" && s.run && guard++ < 20) {
        const r = applyAction(s, { type: "pass_window" });
        if (!r.ok) break;
        s = r.state;
      }
      expect(s.timingKey).toBe("run.approachPaw");
      const before = s.runner.clicks;
      s = must(s, { type: "rez_ice", cardId: "pulse-1" });
      expect(s.cards["pulse-1"].rezzed).toBe(true);
      expect(s.runner.clicks).toBe(before - 1);
    });
  });

  describe("PH Shipment from Vladisibirsk", () => {
    it("requires ≥2 tags and places 4 advancements", () => {
      const def = getCardDef("shipment-from-vladisibirsk");
      expect(def.unsupported).toEqual([]);
      expect(def.playRequiresMinTags).toBe(2);
      expect(validateEffectTree(def.onPlay!)).toBeNull();

      let s = createInitialState();
      s = structuredClone(s);
      s.activeSide = "corp";
      s.timingKey = "corp.takeAction";
      s.corp.clicks = 3;
      s.corp.credits = 5;
      s.runner.tags = 1;
      const ship = instantiateCard(
        "hedge-fund",
        "ship-1",
        "corp:hq",
      );
      ship.title = "Shipment from Vladisibirsk";
      ship.type = "operation";
      ship.playCost = 1;
      ship.playRequiresMinTags = 2;
      ship.onPlay = def.onPlay;
      ship.unsupported = [];
      s.cards["ship-1"] = ship;
      s.corp.hand = ["ship-1"];
      const agenda = instantiateCard(
        "hostile-takeover",
        "ag-1",
        "server:remote1:root",
      );
      s.cards["ag-1"] = agenda;
      s.servers.remote1 = {
        id: "remote1",
        root: ["ag-1"],
        ice: [],
      };
      // Ensure remote exists in servers map used by createInitialState
      if (!s.servers.remote1) {
        (s.servers as Record<string, { id: string; root: string[]; ice: string[] }>)[
          "remote1"
        ] = { id: "remote1", root: ["ag-1"], ice: [] };
      }

      let r = applyAction(s, { type: "play_operation", cardId: "ship-1" });
      expect(r.ok).toBe(false);

      s.runner.tags = 2;
      r = applyAction(s, { type: "play_operation", cardId: "ship-1" });
      expect(r.ok).toBe(true);
      s = r.state;
      // place_advancements may open a choice when multiple targets — sole agenda auto
      expect(
        (s.cards["ag-1"].advancementCounters ?? 0) === 4 ||
          s.pendingChoice !== null,
      ).toBe(true);
      if (s.pendingChoice) {
        const opt = s.pendingChoice.options.find((o) => o.id.includes("ag-1"));
        expect(opt).toBeTruthy();
        s = must(s, { type: "choose_option", optionId: opt!.id });
        expect(s.cards["ag-1"].advancementCounters).toBe(4);
      }
    });
  });

  describe("PH Katorga Breakout wiring", () => {
    it("wires runEvent onSuccessfulRun add_from_heap_to_grip", () => {
      const def = getCardDef("katorga-breakout");
      expect(def.unsupported).toEqual([]);
      expect(def.runEvent?.servers).toBe("any");
      expect(def.runEvent?.onSuccessfulRun).toEqual(
        fx.addFromHeapToGrip("choose"),
      );
      expect(validateEffectTree(def.runEvent!.onSuccessfulRun!)).toBeNull();
    });
  });
  });

  describe("parhelion-hendrik-nightmare", () => {
  beforeAll(() => {
    if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
    if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
    assertPinnedTag("v26.03");
    assertCardsPinnedTag("v1.147.15");
  });

  function must(
    state: ReturnType<typeof createInitialState>,
    action: Parameters<typeof applyAction>[1],
  ) {
    const r = applyAction(state, action);
    if (!r.ok) throw new Error(`${r.error} ${JSON.stringify(r.cites)}`);
    return r.state;
  }

  function emptyRun(server: ServerId, candidates: string[]) {
    return {
      attackedServerId: server,
      phase: "breach" as const,
      position: null,
      successful: true,
      accessedCardIds: [] as string[],
      accessCandidates: candidates,
      randomAccessLimit: null as number | null,
      encounter: null,
      endedTheRun: false,
      cannotJackOut: false,
      accessingCardId: null as string | null,
    };
  }

  describe("PH Mr. Hendrik", () => {
    it("wires onAccess may_pay_credits_for_core_damage while installed", () => {
      const def = getCardDef("mr-hendrik");
      expect(def.unsupported ?? []).toEqual([]);
      expect(def.onAccess).toEqual({
        op: "if",
        cond: { op: "source_installed" },
        then: {
          op: "do",
          action: {
            kind: "may_pay_credits_for_core_damage",
            amount: 2,
            damage: 1,
          },
        },
      });
      expect(validateEffectTree(def.onAccess!)).toBeNull();
      expect(validateEffectTree(fx.mayPayCreditsForCoreDamage(2, 1))).toBeNull();
    });

    it("Corp may pay 2¢ for interactive core damage; Runner prevents by losing clicks", () => {
      let s = createInitialState();
      s = structuredClone(s);
      const remote = "remote-1" as ServerId;
      s.servers[remote] = { id: remote, kind: "remote", ice: [], root: [] };
      const card = instantiateCard("mr-hendrik", "hendrik-1", `server:${remote}:root`);
      s.cards["hendrik-1"] = card;
      s.servers[remote].root = ["hendrik-1"];
      s.corp.credits = 5;
      s.runner.clicks = 2;
      s.runner.coreDamage = 0;
      s.activeSide = "runner";
      s.timingKey = "breach.awaitAccess";
      s.run = emptyRun(remote, ["hendrik-1"]);

      s = must(s, { type: "access_card", cardId: "hendrik-1" });
      expect(s.pendingChoice?.chooser).toBe("corp");
      expect(s.pendingChoice?.options.some((o) => o.id === "pay")).toBe(true);

      s = must(s, { type: "choose_option", optionId: "pay" });
      expect(s.corp.credits).toBe(3);
      expect(s.pendingDamage).toEqual({
        type: "core",
        remaining: 1,
        sourceId: "hendrik-1",
        preventByLoseAllClicks: true,
        expectedEffects: { damage: { type: "core", amount: 1 } },
      });

      const legal = queryLegality(s).legal.map((e) => e.action.type);
      expect(legal).toContain("prevent_damage_lose_all_clicks");
      expect(legal).toContain("accept_damage");
      expect(legal).not.toContain("prevent_damage");

      s = must(s, { type: "prevent_damage_lose_all_clicks" });
      expect(s.runner.clicks).toBe(0);
      expect(s.pendingDamage).toBeNull();
      expect(s.runner.coreDamage).toBe(0);
    });

    it("accepting pending damage applies 1 core damage", () => {
      let s = createInitialState();
      s = structuredClone(s);
      const remote = "remote-1" as ServerId;
      s.servers[remote] = { id: remote, kind: "remote", ice: [], root: [] };
      const card = instantiateCard("mr-hendrik", "hendrik-2", `server:${remote}:root`);
      s.cards["hendrik-2"] = card;
      s.servers[remote].root = ["hendrik-2"];
      // Fill grip so core damage does not flatline.
      for (let i = 0; i < 3; i++) {
        const id = `grip-${i}`;
        s.cards[id] = instantiateCard("sure-gamble", id, "runner:grip");
        s.runner.hand.push(id);
      }
      s.corp.credits = 5;
      s.runner.clicks = 0;
      s.activeSide = "runner";
      s.timingKey = "breach.awaitAccess";
      s.run = emptyRun(remote, ["hendrik-2"]);

      s = must(s, { type: "access_card", cardId: "hendrik-2" });
      s = must(s, { type: "choose_option", optionId: "pay" });
      expect(s.pendingDamage?.preventByLoseAllClicks).toBe(true);
      const legal = queryLegality(s).legal.map((e) => e.action.type);
      expect(legal).not.toContain("prevent_damage_lose_all_clicks");
      s = must(s, { type: "accept_damage" });
      expect(s.runner.coreDamage).toBe(1);
      expect(s.pendingDamage).toBeNull();
    });

    it("does not offer pay when not installed (HQ access)", () => {
      let s = createInitialState();
      s = structuredClone(s);
      const card = instantiateCard("mr-hendrik", "hendrik-hq", "corp:hq");
      s.cards["hendrik-hq"] = card;
      s.corp.hand = ["hendrik-hq"];
      s.corp.credits = 5;
      const r = evalEffect({ state: s, sourceId: "hendrik-hq" }, card.onAccess!);
      expect(r.ok).toBe(true);
      expect(s.pendingChoice).toBeNull();
      expect(s.pendingDamage).toBeNull();
    });
  });

  describe("PH Nightmare Archive", () => {
    it("wires mustReveal + onAccess choose score/−1 or core+rfg", () => {
      const def = getCardDef("nightmare-archive");
      expect(def.unsupported ?? []).toEqual([]);
      expect(def.mustRevealWhenAccessedFromRd).toBe(true);
      expect(def.onAccess?.op).toBe("choose");
      expect(validateEffectTree(def.onAccess!)).toBeNull();
      expect(validateEffectTree(fx.addToRunnerScoreAsAgenda(-1))).toBeNull();
    });

    it("Runner may add to score area as −1 agenda point", () => {
      let s = createInitialState();
      s = structuredClone(s);
      const remote = "remote-1" as ServerId;
      s.servers[remote] = { id: remote, kind: "remote", ice: [], root: [] };
      const card = instantiateCard(
        "nightmare-archive",
        "na-1",
        `server:${remote}:root`,
      );
      s.cards["na-1"] = card;
      s.servers[remote].root = ["na-1"];
      s.activeSide = "runner";
      s.timingKey = "breach.awaitAccess";
      s.run = emptyRun(remote, ["na-1"]);

      s = must(s, { type: "access_card", cardId: "na-1" });
      expect(s.pendingChoice?.chooser).toBe("runner");
      s = must(s, { type: "choose_option", optionId: "score-neg1" });
      expect(s.runner.scoreArea).toContain("na-1");
      expect(s.cards["na-1"].zone).toBe("runner:score");
      expect(s.cards["na-1"].agendaPoints).toBe(-1);
      expect(agendaPointsFor(s, "runner")).toBe(-1);
      expect(s.servers[remote].root).not.toContain("na-1");
    });

    it("declining scores deals 1 core damage and RFGs", () => {
      let s = createInitialState();
      s = structuredClone(s);
      const remote = "remote-1" as ServerId;
      s.servers[remote] = { id: remote, kind: "remote", ice: [], root: [] };
      const card = instantiateCard(
        "nightmare-archive",
        "na-2",
        `server:${remote}:root`,
      );
      s.cards["na-2"] = card;
      s.servers[remote].root = ["na-2"];
      for (let i = 0; i < 3; i++) {
        const id = `grip-na-${i}`;
        s.cards[id] = instantiateCard("sure-gamble", id, "runner:grip");
        s.runner.hand.push(id);
      }
      s.activeSide = "runner";
      s.timingKey = "breach.awaitAccess";
      s.run = emptyRun(remote, ["na-2"]);

      s = must(s, { type: "access_card", cardId: "na-2" });
      s = must(s, { type: "choose_option", optionId: "damage-rfg" });
      expect(s.runner.coreDamage).toBe(1);
      expect(s.cards["na-2"].zone).toBe("removed-from-game");
      expect(s.removedFromGame).toContain("na-2");
      expect(s.servers[remote].root).not.toContain("na-2");
    });

    it("must reveal when accessed from R&D", () => {
      let s = createInitialState();
      s = structuredClone(s);
      const card = instantiateCard("nightmare-archive", "na-rd", "corp:rd");
      card.faceup = false;
      s.cards["na-rd"] = card;
      s.corp.deck = ["na-rd", ...s.corp.deck];
      s.activeSide = "runner";
      s.timingKey = "breach.awaitAccess";
      s.run = emptyRun("rd", ["na-rd"]);

      s = must(s, { type: "access_card", cardId: "na-rd" });
      expect(s.cards["na-rd"].faceup).toBe(true);
      expect(s.log.some((l) => /Revealed Nightmare Archive while accessing from R&D/.test(l))).toBe(
        true,
      );
      expect(s.pendingChoice?.chooser).toBe("runner");
    });
  });
  });

  describe("parhelion-hostile-wake-vera", () => {
  beforeAll(() => {
    if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
    if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
    assertPinnedTag("v26.03");
    assertCardsPinnedTag("v1.147.15");
  });

  function must(
    state: ReturnType<typeof createInitialState>,
    action: Parameters<typeof applyAction>[1],
  ) {
    const r = applyAction(state, action);
    if (!r.ok) throw new Error(`${r.error} ${JSON.stringify(r.cites)}`);
    return r.state;
  }

  describe("PH Hostile Architecture", () => {
    it("wires meat on first installed Corp trash each turn", () => {
      const def = getCardDef("hostile-architecture");
      expect(def.unsupported).toEqual([]);
      expect(def.meatDamageOnInstalledCorpTrashOncePerTurn).toBe(2);

      let s = createInitialState();
      s = structuredClone(s);
      const ha = instantiateCard("hostile-architecture", "ha-1", "server:remote-1:root");
      ha.rezzed = true;
      s.cards["ha-1"] = ha;
      s.servers["remote-1"] = {
        id: "remote-1",
        kind: "remote",
        ice: [],
        root: ["ha-1"],
      };
      const pad = instantiateCard("pad-campaign", "pad-1", "server:remote-2:root");
      pad.rezzed = true;
      s.cards["pad-1"] = pad;
      s.servers["remote-2"] = {
        id: "remote-2",
        kind: "remote",
        ice: [],
        root: ["pad-1"],
      };
      s.runner.hand = [
        (() => {
          const c = instantiateCard("sure-gamble", "sg-1", "runner:grip");
          s.cards["sg-1"] = c;
          return "sg-1";
        })(),
        (() => {
          const c = instantiateCard("sure-gamble", "sg-2", "runner:grip");
          s.cards["sg-2"] = c;
          return "sg-2";
        })(),
      ];
      const gripBefore = s.runner.hand.length;
      const r = evalEffect(
        { state: s, sourceId: "corp-id" },
        fx.trashCorpCard("pad-1"),
      );
      expect(r.ok).toBe(true);
      expect(s.turn.hostileArchitectureUsedThisTurn).toBe(true);
      expect(s.runner.hand.length).toBe(gripBefore - 2);
    });
  });

  describe("PH Wake Implant", () => {
    it("wires onInstall meat + HQ power + may R&D bonus access", () => {
      const def = getCardDef("wake-implant-v2a-jrj");
      expect(def.unsupported).toEqual([]);
      expect(validateEffectTree(def.onInstall!)).toBeNull();
      expect(validateEffectTree(def.onSuccessfulRun!)).toBeNull();
      expect(def.maySpendPowerCountersForBonusRdAccess).toEqual({ max: 3 });

      let s = createInitialState();
      s = structuredClone(s);
      const wake = instantiateCard("wake-implant-v2a-jrj", "wake-1", "runner:installed");
      wake.powerCounters = 2;
      s.cards["wake-1"] = wake;
      s.runner.installed = ["wake-1"];
      s.markServerId = null;
      s.servers.rd.ice = [];
      // Put a few cards in R&D
      for (let i = 0; i < 4; i++) {
        const id = `rd-${i}`;
        const c = instantiateCard("hedge-fund", id, "corp:rd");
        s.cards[id] = c;
        s.corp.deck = [id, ...s.corp.deck];
      }
      s.runner.credits = 5;
      s.runner.clicks = 4;
      s.activeSide = "runner";
      s.timingKey = "runner.takeAction";
      s = must(s, { type: "basic_run", serverId: "rd" });
      expect(s.pendingChoice?.chooser).toBe("runner");
      expect(s.run?.wakeImplantPending).toBe(true);
      s = must(s, { type: "choose_option", optionId: "wake-access:2" });
      expect(s.cards["wake-1"]!.powerCounters).toBe(0);
      expect(s.run?.bonusAccess ?? 0).toBeGreaterThanOrEqual(2);
    });
  });

  describe("PH Vera Ivanovna", () => {
    it("wires onAgendaScoredOrStolen may_trash_one_from_grip", () => {
      const def = getCardDef("vera-ivanovna-shuyskaya");
      expect(def.unsupported).toEqual([]);
      expect(validateEffectTree(def.onAgendaScoredOrStolen!)).toBeNull();
      expect(validateEffectTree(fx.mayTrashOneFromGrip())).toBeNull();

      let s = createInitialState();
      s = structuredClone(s);
      const vera = instantiateCard(
        "vera-ivanovna-shuyskaya",
        "vera-1",
        "server:remote-1:root",
      );
      vera.rezzed = true;
      vera.onAgendaScoredOrStolen = fx.mayTrashOneFromGrip();
      s.cards["vera-1"] = vera;
      s.servers["remote-1"] = {
        id: "remote-1",
        kind: "remote",
        ice: [],
        root: ["vera-1"],
      };
      const sg = instantiateCard("sure-gamble", "sg-1", "runner:grip");
      s.cards["sg-1"] = sg;
      s.runner.hand = ["sg-1"];
      const ag = instantiateCard("hostile-takeover", "ag-1", "server:remote-2:root");
      ag.advancementCounters = 10;
      s.cards["ag-1"] = ag;
      s.servers["remote-2"] = {
        id: "remote-2",
        kind: "remote",
        ice: [],
        root: ["ag-1"],
      };
      const id = s.cards[s.corp.identityId];
      if (id) delete id.onAgendaScored;
      s.corp.clicks = 3;
      s.activeSide = "corp";
      s.timingKey = "corp.actionPaw";
      s = must(s, { type: "score_agenda", cardId: "ag-1" });
      expect(s.pendingChoice?.chooser).toBe("corp");
      s = must(s, { type: "choose_option", optionId: "trash-grip:sg-1" });
      expect(s.runner.discardPile).toContain("sg-1");
    });
  });
  });

  describe("parhelion-hush-flux", () => {
  beforeAll(() => {
    if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
    if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
    assertPinnedTag("v26.03");
    assertCardsPinnedTag("v1.147.15");
  });

  function must(
    state: ReturnType<typeof createInitialState>,
    action: Parameters<typeof applyAction>[1],
  ) {
    const r = applyAction(state, action);
    if (!r.ok) throw new Error(`${r.error} ${JSON.stringify(r.cites)}`);
    return r.state;
  }

  describe("PH Hush", () => {
    it("wires trojan blank-host + rehost paid ability", () => {
      const def = getCardDef("hush");
      expect(def.unsupported).toEqual([]);
      expect(def.installOnIce).toBe(true);
      expect(def.blanksHostAbilities).toBe(true);
      expect(def.paidAbilities?.[0]?.id).toBe("hush-rehost");
      expect(validateEffectTree(fx.rehostOnOtherIce())).toBeNull();
    });

    it("blanks host ice abilities continuously", () => {
      let s = createInitialState();
      s = structuredClone(s);
      const ice = instantiateCard("anvil", "ice-1", "server:hq:ice");
      ice.rezzed = true;
      s.cards["ice-1"] = ice;
      s.servers.hq.ice = ["ice-1"];
      const hush = instantiateCard("hush", "hush-1", "runner:installed");
      hush.hostId = "ice-1";
      s.cards["hush-1"] = hush;
      s.runner.installed = ["hush-1"];
      expect(abilitiesSuppressed(s, "ice-1")).toBe(true);

      // Rehost clears blank on previous host
      const other = instantiateCard("ice-wall", "ice-2", "server:rd:ice");
      other.rezzed = true;
      s.cards["ice-2"] = other;
      s.servers.rd.ice = ["ice-2"];
      const r = evalEffect(
        { state: s, sourceId: "hush-1" },
        fx.rehostOnOtherIce(),
      );
      expect(r.ok).toBe(true);
      expect(s.cards["hush-1"]!.hostId).toBe("ice-2");
      expect(abilitiesSuppressed(s, "ice-1")).toBe(false);
      expect(abilitiesSuppressed(s, "ice-2")).toBe(true);
    });
  });

  describe("PH Flux Capacitor", () => {
    it("wires trojan first-break may-charge flag", () => {
      const def = getCardDef("flux-capacitor");
      expect(def.unsupported).toEqual([]);
      expect(def.installOnIce).toBe(true);
      expect(def.chargeOnFirstBreakDuringHostEncounter).toBe(true);
      expect(validateEffectTree(fx.mayChargeChoose())).toBeNull();
    });

    it("offers may-charge on first break during host encounter", () => {
      let s = createInitialState();
      s = structuredClone(s);
      const prop = instantiateCard("propeller", "prop-1", "runner:installed");
      prop.powerCounters = 1;
      s.cards["prop-1"] = prop;
      const flux = instantiateCard("flux-capacitor", "flux-1", "runner:installed");
      flux.hostId = "ice-1";
      s.cards["flux-1"] = flux;
      const orca = instantiateCard("orca", "orca-1", "runner:installed");
      s.cards["orca-1"] = orca;
      s.runner.installed = ["prop-1", "flux-1", "orca-1"];

      const ice = instantiateCard("ice-wall", "ice-1", "server:hq:ice");
      ice.rezzed = true;
      ice.subtypes = ["sentry"];
      ice.subroutines = [
        { text: "ETR", effect: fx.do({ kind: "end_the_run" }) },
        { text: "ETR2", effect: fx.do({ kind: "end_the_run" }) },
      ];
      s.cards["ice-1"] = ice;
      s.servers.hq.ice = ["ice-1"];
      s.runner.credits = 20;
      s.runner.clicks = 4;
      s.activeSide = "runner";
      s.timingKey = "run.encounterPaw";
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
        },
        endedTheRun: false,
        cannotJackOut: false,
      };
      s.run.accessingCardId = null;
      addBreakerStrengthBoostThisRun(s, {
        createdBy: "orca-1",
        breakerId: "orca-1",
        amount: 10,
      });

      s = must(s, {
        type: "break_subroutine",
        breakerId: "orca-1",
        subIndex: 0,
      });
      expect(s.run!.encounter!.firstBreakChargeFiredIds).toContain("flux-1");
      expect(s.pendingChoice?.chooser).toBe("runner");
      s = must(s, { type: "choose_option", optionId: "charge" });
      expect(s.cards["prop-1"]!.powerCounters).toBe(2);

      // Second break this encounter does not re-offer
      s = must(s, {
        type: "break_subroutine",
        breakerId: "orca-1",
        subIndex: 1,
      });
      // Orca full-break may still offer charge; decline if present
      if (s.pendingChoice) {
        const ids = s.pendingChoice.options.map((o) => o.id);
        expect(ids).toContain("charge");
        must(s, { type: "choose_option", optionId: "decline" });
      }
    });
  });
  });

  describe("parhelion-hybrid-thule-reprise", () => {
  beforeAll(() => {
    if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
    if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
    assertPinnedTag("v26.03");
    assertCardsPinnedTag("v1.147.15");
  });

  function must(
    state: ReturnType<typeof createInitialState>,
    action: Parameters<typeof applyAction>[1],
  ) {
    const r = applyAction(state, action);
    if (!r.ok) throw new Error(`${r.error} ${JSON.stringify(r.cites)}`);
    return r.state;
  }

  describe("PH Hybrid Release", () => {
    it("wires may_install_facedown_from_archives onScore", () => {
      const def = getCardDef("hybrid-release");
      expect(def.unsupported).toEqual([]);
      expect(validateEffectTree(def.onScore!)).toBeNull();
      expect(validateEffectTree(fx.mayInstallFacedownFromArchives())).toBeNull();

      let s = createInitialState();
      s = structuredClone(s);
      const asset = instantiateCard("pad-campaign", "arch-1", "corp:archives");
      s.cards["arch-1"] = asset;
      s.corp.discardPile = ["arch-1"];
      const remotesBefore = Object.keys(s.servers).filter((k) =>
        k.startsWith("remote-"),
      ).length;
      const r = evalEffect(
        { state: s, sourceId: "corp-id" },
        fx.mayInstallFacedownFromArchives(),
      );
      expect(r.ok).toBe(true);
      expect(s.corp.discardPile).not.toContain("arch-1");
      const remotesAfter = Object.keys(s.servers).filter((k) =>
        k.startsWith("remote-"),
      ).length;
      expect(remotesAfter).toBe(remotesBefore + 1);
      expect(s.cards["arch-1"]!.rezzed).toBe(false);
      expect(s.cards["arch-1"]!.faceup).toBe(false);
    });
  });

  describe("PH Thule Subsea", () => {
    it("fires onAgendaStolen choice when Runner steals", () => {
      const def = getCardDef("thule-subsea-safety-below");
      expect(def.unsupported).toEqual([]);
      expect(validateEffectTree(def.onAgendaStolen!)).toBeNull();

      let s = createInitialState();
      s = structuredClone(s);
      const id = s.cards[s.corp.identityId]!;
      id.onAgendaStolen = structuredClone(def.onAgendaStolen!);
      id.title = "Thule Subsea: Safety Below";
      if (id.onAgendaScored) delete id.onAgendaScored;

      const agenda = instantiateCard(
        "hostile-takeover",
        "ag-1",
        "server:remote-1:root",
      );
      s.cards["ag-1"] = agenda;
      s.servers["remote-1"] = {
        id: "remote-1",
        kind: "remote",
        ice: [],
        root: ["ag-1"],
      };
      s.runner.credits = 10;
      s.runner.clicks = 4;
      s.activeSide = "runner";
      s.timingKey = "breach.awaitAccess";
      s.run = {
        attackedServerId: "remote-1",
        phase: "breach",
        position: null,
        successful: true,
        accessedCardIds: [],
        accessCandidates: ["ag-1"],
        randomAccessLimit: 1,
        encounter: null,
        endedTheRun: false,
        cannotJackOut: false,
        accessingCardId: null,
        cannotStealOrTrash: false,
        accessCandidatesPreset: true,
      };
      s = must(s, { type: "access_card", cardId: "ag-1" });
      s = must(s, { type: "steal_agenda", cardId: "ag-1" });
      expect(s.runner.scoreArea).toContain("ag-1");
      expect(s.pendingChoice?.chooser).toBe("runner");
      expect(s.pendingChoice?.options.map((o) => o.id).sort()).toEqual([
        "damage",
        "pay",
      ]);

      const clicksBefore = s.runner.clicks;
      const creditsBefore = s.runner.credits;
      s = must(s, { type: "choose_option", optionId: "pay" });
      expect(s.runner.clicks).toBe(clicksBefore - 1);
      expect(s.runner.credits).toBe(creditsBefore - 2);
    });
  });

  describe("PH Reprise", () => {
    it("requires agenda stolen this turn; returns Corp card; optional run", () => {
      const def = getCardDef("reprise");
      expect(def.unsupported).toEqual([]);
      expect(def.playRequiresAgendaStolenThisTurn).toBe(true);
      expect(def.runEventOptional).toBe(true);
      expect(def.runEvent?.servers).toBe("any");
      expect(validateEffectTree(def.onPlay!)).toBeNull();
      expect(validateEffectTree(fx.returnInstalledCorpToHq("choose"))).toBeNull();

      let s = createInitialState();
      s = structuredClone(s);
      const ev = instantiateCard("sure-gamble", "rep-1", "runner:grip");
      ev.title = "Reprise";
      ev.type = "event";
      ev.playCost = 0;
      ev.subtypes = ["run"];
      ev.playRequiresAgendaStolenThisTurn = true;
      ev.onPlay = fx.returnInstalledCorpToHq("choose");
      ev.runEvent = { servers: "any" };
      ev.runEventOptional = true;
      s.cards["rep-1"] = ev;
      s.runner.hand = ["rep-1"];
      s.runner.credits = 5;
      s.runner.clicks = 4;
      s.activeSide = "runner";
      s.timingKey = "runner.takeAction";
      s.turn.agendaPointsStolenThisTurn = 0;

      // Install one Corp asset to return
      const asset = instantiateCard("pad-campaign", "corp-a", "server:remote-1:root");
      s.cards["corp-a"] = asset;
      s.servers["remote-1"] = {
        id: "remote-1",
        kind: "remote",
        ice: [],
        root: ["corp-a"],
      };

      expect(
        queryLegality(s).legal.some(
          (e) => e.action.type === "play_event" && e.action.cardId === "rep-1",
        ),
      ).toBe(false);

      s.turn.agendaPointsStolenThisTurn = 2;
      expect(
        queryLegality(s).legal.some(
          (e) =>
            e.action.type === "play_event" &&
            e.action.cardId === "rep-1" &&
            !("serverId" in e.action && e.action.serverId),
        ),
      ).toBe(true);

      // Decline run: return asset to HQ
      s = must(s, { type: "play_event", cardId: "rep-1" });
      expect(s.corp.hand).toContain("corp-a");
      expect(s.servers["remote-1"]?.root ?? []).not.toContain("corp-a");
      expect(s.run).toBeNull();
    });
  });
  });

  describe("parhelion-issuaq-kimberlite-yakov", () => {
  beforeAll(() => {
    if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
    if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
    assertPinnedTag("v26.03");
    assertCardsPinnedTag("v1.147.15");
  });

  function must(
    state: ReturnType<typeof createInitialState>,
    action: Parameters<typeof applyAction>[1],
  ) {
    const r = applyAction(state, action);
    if (!r.ok) throw new Error(`${r.error} ${JSON.stringify(r.cites)}`);
    return r.state;
  }

  describe("PH Issuaq Adaptics", () => {
    it("places power on score if agenda not installed/advanced; reduces win", () => {
      const def = getCardDef("issuaq-adaptics-sustaining-diversity");
      expect(def.unsupported).toEqual([]);
      expect(def.powerOnScoreIfAgendaNotInstalledOrAdvancedThisTurn).toBe(true);
      expect(def.agendaPointsToWinReductionPerPowerCounter).toBe(1);

      let s = createInitialState();
      s = structuredClone(s);
      s.config.agendaPointsToWin = 3;
      const id = s.cards[s.corp.identityId]!;
      id.powerOnScoreIfAgendaNotInstalledOrAdvancedThisTurn = true;
      id.agendaPointsToWinReductionPerPowerCounter = 1;
      id.powerCounters = 0;
      id.title = "Issuaq Adaptics";
      if (id.onAgendaScored) delete id.onAgendaScored;

      const ag = instantiateCard("hostile-takeover", "ag-1", "server:remote-1:root");
      ag.advancementCounters = 10;
      ag.agendaPoints = 2;
      s.cards["ag-1"] = ag;
      s.servers["remote-1"] = {
        id: "remote-1",
        kind: "remote",
        ice: [],
        root: ["ag-1"],
      };
      // Not installed/advanced this turn
      s.turn.installedThisTurn = [];
      s.turn.advancedThisTurn = [];
      s.corp.clicks = 3;
      s.activeSide = "corp";
      s.timingKey = "corp.actionPaw";
      s = must(s, { type: "score_agenda", cardId: "ag-1" });
      expect(s.cards[s.corp.identityId]!.powerCounters).toBe(1);
      // 2 pts with need 3-1=2 → win
      expect(s.winner).toBe("corp");
    });
  });

  describe("PH Kimberlite Field", () => {
    it("wires may trash rezzed then trash Runner ≤ rez cost", () => {
      const def = getCardDef("kimberlite-field");
      expect(def.unsupported).toEqual([]);
      expect(validateEffectTree(def.onScore!)).toBeNull();

      let s = createInitialState();
      s = structuredClone(s);
      const ice = instantiateCard("ice-wall", "iw-1", "server:hq:ice");
      ice.rezzed = true;
      ice.rezCost = 1;
      s.cards["iw-1"] = ice;
      s.servers.hq.ice = ["iw-1"];
      const prog = instantiateCard("sure-gamble", "p-1", "runner:installed");
      prog.type = "program";
      prog.installCost = 1;
      s.cards["p-1"] = prog;
      s.runner.installed = ["p-1"];
      s.turn.lastTrashedRezzedPrintedRezCost = null;
      const r = evalEffect(
        { state: s, sourceId: "corp-id" },
        fx.mayTrashInstalled({
          excludeSelf: true,
          rezzedOnly: true,
          then: fx.trashInstalledRunnerLteLastTrashedRez("choose"),
        }),
      );
      expect(r.ok).toBe(true);
      expect(s.pendingChoice?.chooser).toBe("corp");
      s = must(s, { type: "choose_option", optionId: "trash:iw-1" });
      expect(s.corp.discardPile).toContain("iw-1");
      expect(s.turn.lastTrashedRezzedPrintedRezCost).toBe(1);
      // sole eligible runner → auto trash
      expect(s.runner.discardPile).toContain("p-1");
    });
  });

  describe("PH Yakov", () => {
    it("gains credits when a card is trashed from its server", () => {
      const def = getCardDef("yakov-erikovich-avdakov");
      expect(def.unsupported).toEqual([]);
      expect(def.creditsOnTrashFromThisServer).toBe(2);

      let s = createInitialState();
      s = structuredClone(s);
      const yak = instantiateCard(
        "yakov-erikovich-avdakov",
        "yak-1",
        "server:remote-1:root",
      );
      yak.rezzed = true;
      s.cards["yak-1"] = yak;
      const pad = instantiateCard("pad-campaign", "pad-1", "server:remote-1:root");
      pad.rezzed = true;
      s.cards["pad-1"] = pad;
      s.servers["remote-1"] = {
        id: "remote-1",
        kind: "remote",
        ice: [],
        root: ["yak-1", "pad-1"],
      };
      const creditsBefore = s.corp.credits;
      const r = evalEffect(
        { state: s, sourceId: "corp-id" },
        fx.trashCorpCard("pad-1"),
      );
      expect(r.ok).toBe(true);
      expect(s.corp.credits).toBe(creditsBefore + 2);
    });
  });
  });

  describe("parhelion-keeling-timebomb", () => {
  beforeAll(() => {
    if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
    if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
    assertPinnedTag("v26.03");
    assertCardsPinnedTag("v1.147.15");
  });

  function must(
    state: ReturnType<typeof createInitialState>,
    action: Parameters<typeof applyAction>[1],
  ) {
    const r = applyAction(state, action);
    if (!r.ok) throw new Error(`${r.error} ${JSON.stringify(r.cites)}`);
    return r.state;
  }

  describe("PH Dr. Vientiane Keeling", () => {
    it("wires onRez/onTurnBegin power + runner hand-size penalty", () => {
      const def = getCardDef("dr-vientiane-keeling");
      expect(def.unsupported).toEqual([]);
      expect(def.runnerHandSizePenaltyPerPowerCounter).toBe(1);
      expect(validateEffectTree(def.onRez!)).toBeNull();
      expect(validateEffectTree(def.onTurnBegin!)).toBeNull();

      let s = createInitialState();
      s = structuredClone(s);
      const keeling = instantiateCard(
        "pad-campaign",
        "keel-1",
        "server:remote1:root",
      );
      keeling.title = "Dr. Vientiane Keeling";
      keeling.rezCost = 0;
      keeling.runnerHandSizePenaltyPerPowerCounter = 1;
      keeling.onRez = def.onRez;
      keeling.onTurnBegin = def.onTurnBegin;
      keeling.unsupported = [];
      s.cards["keel-1"] = keeling;
      if (!s.servers.remote1) {
        s.servers.remote1 = { id: "remote1", kind: "remote", ice: [], root: [] };
      }
      s.servers.remote1.root = ["keel-1"];
      s.corp.credits = 5;
      s.activeSide = "corp";
      s.timingKey = "corp.actionPaw";
      const before = s.runner.maxHandSize;
      s = must(s, { type: "rez_asset", cardId: "keel-1" });
      expect(s.cards["keel-1"].powerCounters).toBe(1);
      recomputeRunnerMaxHandSize(s);
      expect(s.runner.maxHandSize).toBe(before - 1);
    });
  });

  describe("PH Time Bomb", () => {
    it("requires central success to install; detonates at ≥3 power", () => {
      const def = getCardDef("time-bomb");
      expect(def.unsupported).toEqual([]);
      expect(def.installRequiresSuccessfulCentralRunThisTurn).toBe(true);
      expect(def.powerCountersOnInstall).toBe(1);
      expect(validateEffectTree(def.onTurnBegin!)).toBeNull();

      let s = createInitialState();
      s = structuredClone(s);
      s.activeSide = "runner";
      s.timingKey = "runner.takeAction";
      s.runner.clicks = 4;
      s.runner.credits = 5;
      const bomb = instantiateCard("t400-memory-diamond", "bomb-1", "runner:grip");
      bomb.title = "Time Bomb";
      bomb.installCost = 0;
      bomb.handSizeBonus = undefined;
      bomb.muBonus = undefined;
      bomb.installRequiresSuccessfulCentralRunThisTurn = true;
      bomb.powerCountersOnInstall = 1;
      bomb.onTurnBegin = def.onTurnBegin;
      bomb.unsupported = [];
      s.cards["bomb-1"] = bomb;
      s.runner.hand.push("bomb-1");

      const r = applyAction(s, {
        type: "basic_install",
        cardId: "bomb-1",
        destination: { kind: "installed" },
      });
      expect(r.ok).toBe(false);

      s.turn.successfulHqRunThisTurn = true;
      s = must(s, {
        type: "basic_install",
        cardId: "bomb-1",
        destination: { kind: "installed" },
      });
      expect(s.cards["bomb-1"].powerCounters).toBe(1);

      // Simulate turn-begin resolve twice more → reaches 3 and detonates
      s.cards["bomb-1"].powerCounters = 2;
      const er = evalEffect(
        { state: s, sourceId: "bomb-1" },
        def.onTurnBegin!,
      );
      expect(er.ok).toBe(true);
      expect(s.runner.installed).not.toContain("bomb-1");
    });

    it("power_counters_gte cond validates", () => {
      expect(
        validateEffectTree(
          fx.if({ op: "power_counters_gte", amount: 3 }, fx.trashSelf()),
        ),
      ).toBeNull();
    });
  });
  });

  describe("parhelion-matryoshka", () => {
  beforeAll(() => {
    if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
    if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
    assertPinnedTag("v26.03");
    assertCardsPinnedTag("v1.147.15");
  });

  function must(
    state: ReturnType<typeof createInitialState>,
    action: Parameters<typeof applyAction>[1],
  ) {
    const r = applyAction(state, action);
    if (!r.ok) throw new Error(`${r.error} ${JSON.stringify(r.cites)}`);
    return r.state;
  }

  describe("PH Matryoshka", () => {
    it("wires AI breaker, host/break/pump abilities, unsupported empty", () => {
      const def = getCardDef("matryoshka");
      expect(def.unsupported ?? []).toEqual([]);
      expect(def.breaker?.breaksSubtype).toBe("*");
      expect(def.breaker?.breakViaPaidAbilityOnly).toBe(true);
      expect(def.deckLimit).toBe(6);
      expect(validateEffectTree(def.onTurnBegin!)).toBeNull();
      expect(validateEffectTree(fx.turnHostedCardsFaceup())).toBeNull();
      expect(validateEffectTree(fx.hostCopyFromGrip("Matryoshka"))).toBeNull();
      expect(validateEffectTree(fx.matryoshkaBreak())).toBeNull();
      expect(def.paidAbilities?.map((a) => a.id)).toEqual([
        "matryoshka-host",
        "matryoshka-break",
        "matryoshka-pump",
      ]);
    });

    it("hosts a grip copy faceup (not installed)", () => {
      let s = createInitialState();
      s = structuredClone(s);
      const main = instantiateCard("matryoshka", "mat-1", "runner:installed");
      s.cards["mat-1"] = main;
      s.runner.installed = ["mat-1"];
      const copy = instantiateCard("matryoshka", "mat-2", "runner:grip");
      s.cards["mat-2"] = copy;
      s.runner.hand = ["mat-2"];

      const r = evalEffect(
        { state: s, sourceId: "mat-1" },
        fx.hostCopyFromGrip("Matryoshka"),
      );
      expect(r.ok).toBe(true);
      expect(s.cards["mat-1"]!.hostedCardIds).toEqual(["mat-2"]);
      expect(s.cards["mat-2"]!.hostId).toBe("mat-1");
      expect(s.cards["mat-2"]!.faceup).toBe(true);
      expect(s.runner.hand).not.toContain("mat-2");
      expect(s.runner.installed).not.toContain("mat-2");
    });

    it("turn begin flips hosted cards faceup", () => {
      let s = createInitialState();
      s = structuredClone(s);
      const main = instantiateCard("matryoshka", "mat-1", "runner:installed");
      main.hostedCardIds = ["mat-2"];
      s.cards["mat-1"] = main;
      const copy = instantiateCard("matryoshka", "mat-2", "hosted:mat-1");
      copy.hostId = "mat-1";
      copy.faceup = false;
      s.cards["mat-2"] = copy;
      const r = evalEffect(
        { state: s, sourceId: "mat-1" },
        fx.turnHostedCardsFaceup(),
      );
      expect(r.ok).toBe(true);
      expect(s.cards["mat-2"]!.faceup).toBe(true);
    });

    it("matryoshka_break pays X, turns hosted facedown, breaks X subs", () => {
      let s = createInitialState();
      s = structuredClone(s);
      s.runner.credits = 5;
      const main = instantiateCard("matryoshka", "mat-1", "runner:installed");
      main.hostedCardIds = ["mat-2"];
      main.breaker = {
        breaksSubtype: "*",
        strength: 5,
        breakCredits: 0,
        breakViaPaidAbilityOnly: true,
      };
      s.cards["mat-1"] = main;
      s.runner.installed = ["mat-1"];
      const copy = instantiateCard("matryoshka", "mat-2", "hosted:mat-1");
      copy.hostId = "mat-1";
      copy.faceup = true;
      s.cards["mat-2"] = copy;

      const ice = instantiateCard("ice-wall", "ice-1", "server:hq:ice");
      ice.rezzed = true;
      ice.strength = 1;
      ice.subroutines = [
        { id: "a", text: "Sub A", effect: fx.etr() },
        { id: "b", text: "Sub B", effect: fx.etr() },
      ];
      s.cards["ice-1"] = ice;
      s.run = {
        attackedServerId: "hq",
        phase: "encounter",
        position: 0,
        successful: null,
        accessedCardIds: [],
        accessCandidates: [],
        randomAccessLimit: null,
        encounter: { iceId: "ice-1", broken: [false, false] },
        endedTheRun: false,
        cannotJackOut: false,
        accessingCardId: null,
      };

      const r = evalEffect({ state: s, sourceId: "mat-1" }, fx.matryoshkaBreak());
      expect(r.ok).toBe(true);
      expect(s.pendingChoice).toBeTruthy();
      s = must(s, { type: "choose_option", optionId: "break:2" });
      expect(s.runner.credits).toBe(3);
      expect(s.cards["mat-2"]!.faceup).toBe(false);
      expect(s.run!.encounter!.broken).toEqual([true, true]);
    });
  });
  });

  describe("parhelion-nanisivik-zato", () => {
  beforeAll(() => {
    if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
    if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
    assertPinnedTag("v26.03");
    assertCardsPinnedTag("v1.147.15");
  });

  function must(
    state: ReturnType<typeof createInitialState>,
    action: Parameters<typeof applyAction>[1],
  ) {
    const r = applyAction(state, action);
    if (!r.ok) throw new Error(`${r.error} ${JSON.stringify(r.cites)}`);
    return r.state;
  }

  function passUntil(
    state: ReturnType<typeof createInitialState>,
    pred: (s: ReturnType<typeof createInitialState>) => boolean,
    max = 24,
  ) {
    let s = state;
    for (let i = 0; i < max && !pred(s); i++) {
      if (s.pendingChoice) break;
      const r = applyAction(s, { type: "pass_window" });
      if (!r.ok) break;
      s = r.state;
    }
    return s;
  }

  describe("PH Nanisivik Grid", () => {
    it("wires onApproachServer may-flip-archives-ice IR", () => {
      const def = getCardDef("nanisivik-grid");
      expect(def.unsupported ?? []).toEqual([]);
      expect(def.subtypes).toContain("region");
      expect(validateEffectTree(def.onApproachServer!)).toBeNull();
      expect(
        validateEffectTree(fx.mayFlipArchivesIceResolveSubroutine()),
      ).toBeNull();
    });

    it("may_flip opens Corp choice; flip resolves Archives ice sub", () => {
      let s = createInitialState();
      s = structuredClone(s);
      const ice = instantiateCard("ice-wall", "arch-ice", "corp:archives");
      ice.faceup = false;
      ice.subroutines = [
        {
          id: "net",
          text: "Do 1 net damage.",
          effect: fx.netDamage(1),
        },
      ];
      s.cards["arch-ice"] = ice;
      s.corp.discardPile = ["arch-ice"];
      const grid = instantiateCard("nanisivik-grid", "nan-1", "server:hq:root");
      grid.rezzed = true;
      s.cards["nan-1"] = grid;

      const r = evalEffect(
        { state: s, sourceId: "nan-1" },
        fx.mayFlipArchivesIceResolveSubroutine(),
      );
      expect(r.ok).toBe(true);
      expect(s.pendingChoice?.chooser).toBe("corp");
      const flip = s.pendingChoice!.options.find((o) => o.id.startsWith("flip:"));
      expect(flip).toBeTruthy();
      s = must(s, { type: "choose_option", optionId: flip!.id });
      expect(s.cards["arch-ice"]!.faceup).toBe(true);
      expect(s.log.some((l) => l.includes("Turn Ice Wall faceup"))).toBe(true);
    });

    it("fires on approach of the protected server during a run", () => {
      let s = createInitialState();
      s = structuredClone(s);
      s.activeSide = "runner";
      s.timingKey = "runner.takeAction";
      s.runner.clicks = 1;
      s.runner.credits = 5;

      const ice = instantiateCard("ice-wall", "arch-ice", "corp:archives");
      ice.faceup = false;
      ice.subroutines = [
        {
          id: "etr",
          text: "End the run.",
          effect: fx.etr(),
        },
      ];
      s.cards["arch-ice"] = ice;
      s.corp.discardPile = ["arch-ice"];

      const grid = instantiateCard("nanisivik-grid", "nan-1", "server:hq:root");
      grid.rezzed = true;
      grid.faceup = true;
      s.cards["nan-1"] = grid;
      s.servers.hq.root = ["nan-1"];
      s.servers.hq.ice = [];

      s = must(s, { type: "basic_run", serverId: "hq" as ServerId });
      s = passUntil(s, (st) => !!st.pendingChoice || !!st.run?.endedTheRun);
      expect(s.pendingChoice?.chooser).toBe("corp");
      const flip = s.pendingChoice!.options.find((o) => o.id.startsWith("flip:"));
      s = must(s, { type: "choose_option", optionId: flip!.id });
      expect(s.cards["arch-ice"]!.faceup).toBe(true);
      expect(
        s.run?.endedTheRun === true ||
          s.run === null ||
          s.log.some((l) => /end the run/i.test(l)),
      ).toBe(true);
    });
  });

  describe("PH ZATO City Grid", () => {
    it("wires remoteOnly + iceGainsTrashToResolveChosenSubOnEncounter", () => {
      const def = getCardDef("zato-city-grid");
      expect(def.unsupported ?? []).toEqual([]);
      expect(def.remoteOnly).toBe(true);
      expect(def.iceGainsTrashToResolveChosenSubOnEncounter).toBe(true);
      expect(def.subtypes).toContain("region");
      expect(
        validateEffectTree(fx.trashEncounterIceResolveSubroutine(0)),
      ).toBeNull();
    });

    it("offers trash-to-resolve on encounter; trash resolves sub", () => {
      let s = createInitialState();
      s = structuredClone(s);
      s.activeSide = "runner";
      s.timingKey = "runner.takeAction";
      s.runner.clicks = 1;
      s.runner.credits = 5;

      s.servers["remote-1"] = {
        id: "remote-1",
        kind: "remote",
        ice: ["ice-1"],
        root: ["zato-1"],
      };
      const ice = instantiateCard("ice-wall", "ice-1", "server:remote-1:ice");
      ice.rezzed = true;
      ice.faceup = true;
      ice.subroutines = [
        {
          id: "etr",
          text: "End the run.",
          effect: fx.etr(),
        },
      ];
      s.cards["ice-1"] = ice;
      const zato = instantiateCard(
        "zato-city-grid",
        "zato-1",
        "server:remote-1:root",
      );
      zato.rezzed = true;
      zato.faceup = true;
      s.cards["zato-1"] = zato;

      s = must(s, { type: "basic_run", serverId: "remote-1" as ServerId });
      s = passUntil(s, (st) => !!st.pendingChoice || !!st.run?.endedTheRun);
      expect(s.pendingChoice?.chooser).toBe("corp");
      const trashOpt = s.pendingChoice!.options.find((o) =>
        o.id.startsWith("zato:"),
      );
      expect(trashOpt).toBeTruthy();
      s = must(s, { type: "choose_option", optionId: trashOpt!.id });
      expect(s.corp.discardPile).toContain("ice-1");
      expect(s.servers["remote-1"]!.ice).not.toContain("ice-1");
      expect(
        s.run?.endedTheRun === true ||
          s.run === null ||
          s.log.some((l) => /Trash Ice Wall; resolve/i.test(l)),
      ).toBe(true);
    });

    it("rejects remoteOnly install when server is not remote", () => {
      let s = createInitialState();
      s = structuredClone(s);
      s.activeSide = "corp";
      s.timingKey = "corp.takeAction";
      s.corp.clicks = 1;
      s.corp.credits = 10;
      const zato = instantiateCard("zato-city-grid", "zato-hq", "corp:hq");
      s.cards["zato-hq"] = zato;
      s.corp.hand = ["zato-hq"];
      const r = applyAction(s, {
        type: "basic_install",
        cardId: "zato-hq",
        destination: { kind: "remote_root", serverId: "hq" as ServerId },
      });
      expect(r.ok).toBe(false);
    });
  });
  });

  describe("parhelion-orca-info-abaasy", () => {
  beforeAll(() => {
    if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
    if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
    assertPinnedTag("v26.03");
    assertCardsPinnedTag("v1.147.15");
  });

  function must(
    state: ReturnType<typeof createInitialState>,
    action: Parameters<typeof applyAction>[1],
  ) {
    const r = applyAction(state, action);
    if (!r.ok) throw new Error(`${r.error} ${JSON.stringify(r.cites)}`);
    return r.state;
  }

  describe("PH Orca", () => {
    it("wires sentry breaker + onFullyBreakOncePerTurn may-charge", () => {
      const def = getCardDef("orca");
      expect(def.unsupported).toEqual([]);
      expect(def.breaker?.breaksSubtype).toBe("sentry");
      expect(def.breaker?.breakMaxSubs).toBe(99);
      expect(validateEffectTree(def.onFullyBreakOncePerTurn!)).toBeNull();

      let s = createInitialState();
      s = structuredClone(s);
      const orca = instantiateCard("orca", "orca-1", "runner:installed");
      s.cards["orca-1"] = orca;
      s.runner.installed = ["orca-1"];
      const prop = instantiateCard("propeller", "prop-1", "runner:installed");
      prop.powerCounters = 1;
      s.cards["prop-1"] = prop;
      s.runner.installed.push("prop-1");

      const ice = instantiateCard("ice-wall", "ice-1", "server:hq:ice");
      ice.rezzed = true;
      ice.subtypes = ["sentry"];
      ice.subroutines = [
        { text: "ETR", effect: fx.do({ kind: "end_the_run" }) },
        { text: "ETR2", effect: fx.do({ kind: "end_the_run" }) },
      ];
      s.cards["ice-1"] = ice;
      s.servers.hq.ice = ["ice-1"];
      s.runner.credits = 20;
      s.runner.clicks = 4;
      s.activeSide = "runner";
      s.timingKey = "run.encounterPaw";
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
        },
        endedTheRun: false,
        cannotJackOut: false,
        accessingCardId: null,
      };
      // Match strength
      addBreakerStrengthBoostThisRun(s, {
        createdBy: "orca-1",
        breakerId: "orca-1",
        amount: 10,
      });

      s = must(s, {
        type: "break_subroutine",
        breakerId: "orca-1",
        subIndex: 0,
      });
      // Multi-break: free second break
      s = must(s, {
        type: "break_subroutine",
        breakerId: "orca-1",
        subIndex: 1,
      });
      expect(s.turn.onFullyBreakFiredIds).toContain("orca-1");
      expect(s.pendingChoice?.chooser).toBe("runner");
      s = must(s, { type: "choose_option", optionId: "charge" });
      // sole chargeable → auto
      expect(s.cards["prop-1"]!.powerCounters).toBe(2);
    });
  });

  describe("PH Abaasy", () => {
    it("wires code gate breaker + may_trash_from_grip_to_draw", () => {
      const def = getCardDef("abaasy");
      expect(def.unsupported).toEqual([]);
      expect(def.breaker?.breaksSubtype).toBe("code gate");
      expect(validateEffectTree(def.onFullyBreakOncePerTurn!)).toBeNull();
      expect(validateEffectTree(fx.mayTrashFromGripToDraw())).toBeNull();

      let s = createInitialState();
      s = structuredClone(s);
      const filler = instantiateCard("sure-gamble", "sg-1", "runner:grip");
      s.cards["sg-1"] = filler;
      s.runner.hand = ["sg-1"];
      const handBefore = s.runner.hand.length;
      const deckBefore = s.runner.deck.length;
      const r = evalEffect(
        { state: s, sourceId: "runner-id" },
        fx.mayTrashFromGripToDraw(),
      );
      expect(r.ok).toBe(true);
      expect(s.pendingChoice?.chooser).toBe("runner");
      s = must(s, { type: "choose_option", optionId: "trash-draw:sg-1" });
      expect(s.runner.hand).not.toContain("sg-1");
      expect(s.runner.discardPile).toContain("sg-1");
      expect(s.runner.hand.length).toBe(handBefore); // trash 1, draw 1
      expect(s.runner.deck.length).toBe(deckBefore - 1);
    });
  });

  describe("PH Info Bounty", () => {
    it("wires identify_mark + gain on first mark run end if breached", () => {
      const def = getCardDef("info-bounty");
      expect(def.unsupported).toEqual([]);
      expect(def.onTurnBegin).toEqual(fx.identifyMark());
      expect(def.gainCreditsOnFirstMarkRunEndIfBreached).toBe(2);

      let s = createInitialState();
      s = structuredClone(s);
      const ib = instantiateCard("info-bounty", "ib-1", "runner:installed");
      s.cards["ib-1"] = ib;
      s.runner.installed = ["ib-1"];
      s.markServerId = "archives";
      s.servers.archives.ice = [];
      s.corp.discardPile = [];
      s.runner.credits = 5;
      s.runner.clicks = 4;
      s.activeSide = "runner";
      s.timingKey = "runner.takeAction";
      const creditsBefore = s.runner.credits;
      s = must(s, { type: "basic_run", serverId: "archives" });
      expect(s.run).toBeNull();
      expect(s.turn.infoBountyMarkRunEndUsed).toBe(true);
      expect(s.runner.credits).toBe(creditsBefore + 2);
    });
  });
  });

  describe("parhelion-raindrops-borehole", () => {
  beforeAll(() => {
    if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
    if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
    assertPinnedTag("v26.03");
    assertCardsPinnedTag("v1.147.15");
  });

  function must(
    state: ReturnType<typeof createInitialState>,
    action: Parameters<typeof applyAction>[1],
  ) {
    const r = applyAction(state, action);
    if (!r.ok) throw new Error(`${r.error} ${JSON.stringify(r.cites)}`);
    return r.state;
  }

  describe("PH Raindrops Cut Stone", () => {
    it("wires runEvent power-on-sub + onRunEnd draw/gain", () => {
      const def = getCardDef("raindrops-cut-stone");
      expect(def.unsupported ?? []).toEqual([]);
      expect(def.runEvent?.servers).toBe("any");
      expect(def.runEvent?.addPowerCounterOnSubroutineResolve).toBe(1);
      expect(def.runEvent?.onRunEnd).toEqual({
        op: "seq",
        effects: [
          {
            op: "do",
            action: {
              kind: "draw",
              side: "runner",
              amount: 0,
              tally: {
                count: "source_power_counters",
                per: 1,
                side: "source",
              },
            },
          },
          { op: "do", action: { kind: "gain_credits", side: "runner", amount: 3 } },
        ],
      });
      expect(validateEffectTree(def.runEvent!.onRunEnd!)).toBeNull();
    });

    it("places power on sub resolve (incl. ETR) then draws + gains on run end", () => {
      let s = createInitialState();
      s = structuredClone(s);
      s.activeSide = "runner";
      s.timingKey = "runner.takeAction";
      s.runner.clicks = 1;
      s.runner.credits = 5;
      s.runner.hand = ["rain-1"];
      s.runner.deck = [];
      for (let i = 0; i < 5; i++) {
        const id = `deck-${i}`;
        s.cards[id] = instantiateCard("sure-gamble", id, "runner:stack");
        s.runner.deck.push(id);
      }
      const ev = instantiateCard("raindrops-cut-stone", "rain-1", "runner:grip");
      ev.runEvent = {
        servers: "any",
        addPowerCounterOnSubroutineResolve: 1,
        onRunEnd: fx.seq(
          fx.drawPerPowerCounter("runner", 1),
          fx.gainCredits("runner", 3),
        ),
      };
      s.cards["rain-1"] = ev;

      const ice = instantiateCard("ice-wall", "ice-1", "server:hq:ice");
      ice.rezzed = true;
      ice.subroutines = [
        {
          id: "etr",
          text: "End the run.",
          effect: fx.etr(),
        },
      ];
      s.cards["ice-1"] = ice;
      s.servers.hq.ice = ["ice-1"];

      const creditsBefore = s.runner.credits;
      s = must(s, {
        type: "play_event",
        cardId: "rain-1",
        serverId: "hq" as ServerId,
      });
      // Walk approach / encounter PAWs until ETR ends the run.
      for (let i = 0; i < 16 && s.run; i++) {
        const r = applyAction(s, { type: "pass_window" });
        if (!r.ok) break;
        s = r.state;
      }
      expect(s.run).toBeNull();
      expect(s.cards["rain-1"]!.powerCounters).toBe(0);
      // Played from hand (empty) then drew 1 for the power counter.
      expect(s.runner.hand.length).toBe(1);
      expect(s.runner.credits).toBe(creditsBefore - 1 + 3); // playCost 1, gain 3
      expect(s.log.some((l) => l.includes("power counter"))).toBe(true);
    });

    it("draw tally of source power counters draws one per counter", () => {
      let s = createInitialState();
      s = structuredClone(s);
      for (let i = 0; i < 4; i++) {
        const id = `d-${i}`;
        s.cards[id] = instantiateCard("sure-gamble", id, "runner:stack");
        s.runner.deck.push(id);
      }
      const src = instantiateCard("raindrops-cut-stone", "r-1", "runner:heap");
      src.powerCounters = 2;
      s.cards["r-1"] = src;
      const before = s.runner.hand.length;
      const r = evalEffect(
        { state: s, sourceId: "r-1" },
        fx.drawPerPowerCounter("runner", 1),
      );
      expect(r.ok).toBe(true);
      expect(s.runner.hand.length).toBe(before + 2);
    });
  });

  describe("PH Superdeep Borehole", () => {
    it("wires hosted BP on rez + take on turn begin + win-when-empty", () => {
      const def = getCardDef("superdeep-borehole");
      expect(def.unsupported ?? []).toEqual([]);
      expect(def.badPublicityCountersOnRez).toBe(6);
      expect(def.winWhenBadPublicityCountersEmpty).toBe(true);
      expect(def.onTurnBegin).toEqual(fx.takeHostedBadPublicity(1));
      expect(validateEffectTree(def.onTurnBegin!)).toBeNull();
    });

    it("rez loads hosted BP that is not player BP; take moves to player BP", () => {
      let s = createInitialState();
      s = structuredClone(s);
      s.activeSide = "corp";
      s.timingKey = "corp.actionPaw";
      s.corp.clicks = 1;
      s.corp.credits = 10;
      s.corp.badPublicity = 0;
      const hole = instantiateCard("superdeep-borehole", "bh-1", "server:remote-1:root");
      hole.badPublicityCountersOnRez = 6;
      hole.winWhenBadPublicityCountersEmpty = true;
      hole.onTurnBegin = fx.takeHostedBadPublicity(1);
      hole.rezCost = 6;
      s.cards["bh-1"] = hole;
      s.servers["remote-1"] = {
        id: "remote-1",
        kind: "remote",
        ice: [],
        root: ["bh-1"],
      };

      s = must(s, { type: "rez_asset", cardId: "bh-1" });
      expect(s.cards["bh-1"]!.rezzed).toBe(true);
      expect(s.cards["bh-1"]!.badPublicityCounters).toBe(6);
      expect(s.corp.badPublicity).toBe(0); // hosted ≠ player BP

      const r = evalEffect(
        { state: s, sourceId: "bh-1" },
        fx.takeHostedBadPublicity(1),
      );
      expect(r.ok).toBe(true);
      expect(s.cards["bh-1"]!.badPublicityCounters).toBe(5);
      expect(s.corp.badPublicity).toBe(1);
      expect(s.winner).toBeNull();
    });

    it("Corp wins when hosted BP counters empty", () => {
      let s = createInitialState();
      s = structuredClone(s);
      const hole = instantiateCard("superdeep-borehole", "bh-2", "server:remote-1:root");
      hole.rezzed = true;
      hole.badPublicityCounters = 1;
      hole.winWhenBadPublicityCountersEmpty = true;
      s.cards["bh-2"] = hole;
      s.servers["remote-1"] = {
        id: "remote-1",
        kind: "remote",
        ice: [],
        root: ["bh-2"],
      };
      const r = evalEffect(
        { state: s, sourceId: "bh-2" },
        fx.takeHostedBadPublicity(1),
      );
      expect(r.ok).toBe(true);
      expect(s.cards["bh-2"]!.badPublicityCounters).toBe(0);
      expect(s.corp.badPublicity).toBe(1);
      expect(s.winner).toBe("corp");
      expect(s.winReason).toBe("corp_alternate");
      expect(s.done).toBe(true);
    });

    it("checkWinConditions sees empty rezzed borehole", () => {
      let s = createInitialState();
      s = structuredClone(s);
      const hole = instantiateCard("superdeep-borehole", "bh-3", "server:remote-1:root");
      hole.rezzed = true;
      hole.badPublicityCounters = 0;
      hole.winWhenBadPublicityCountersEmpty = true;
      s.cards["bh-3"] = hole;
      s.servers["remote-1"] = {
        id: "remote-1",
        kind: "remote",
        ice: [],
        root: ["bh-3"],
      };
      checkWinConditions(s);
      expect(s.winner).toBe("corp");
      expect(s.winReason).toBe("corp_alternate");
    });
  });
  });

  describe("parhelion-sim-poison-hippocampic", () => {
  beforeAll(() => {
    if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
    if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
    assertPinnedTag("v26.03");
    assertCardsPinnedTag("v1.147.15");
  });

  function must(
    state: ReturnType<typeof createInitialState>,
    action: Parameters<typeof applyAction>[1],
  ) {
    const r = applyAction(state, action);
    if (!r.ok) throw new Error(`${r.error} ${JSON.stringify(r.cites)}`);
    return r.state;
  }

  describe("PH Simulation Reset", () => {
    it("wires and resolves trash/shuffle/draw/RFG", () => {
      const def = getCardDef("simulation-reset");
      expect(def.unsupported).toEqual([]);
      expect(validateEffectTree(def.onPlay!)).toBeNull();

      let s = createInitialState();
      s = structuredClone(s);
      s.activeSide = "corp";
      s.timingKey = "corp.takeAction";
      s.corp.clicks = 3;
      s.corp.credits = 5;
      // Fill HQ and Archives
      for (let i = 0; i < 3; i++) {
        const id = `hq-${i}`;
        s.cards[id] = instantiateCard("hedge-fund", id, "corp:hq");
        s.corp.hand.push(id);
      }
      for (let i = 0; i < 4; i++) {
        const id = `arc-${i}`;
        s.cards[id] = instantiateCard("hedge-fund", id, "corp:archives");
        s.cards[id].faceup = true;
        s.corp.discardPile.push(id);
      }
      const deckBefore = s.corp.deck.length;
      const op = instantiateCard("hedge-fund", "sim-1", "corp:hq");
      op.title = "Simulation Reset";
      op.type = "operation";
      op.playCost = 1;
      op.onPlay = def.onPlay;
      op.unsupported = [];
      s.cards["sim-1"] = op;
      s.corp.hand.push("sim-1");

      s = must(s, { type: "play_operation", cardId: "sim-1" });
      expect(s.removedFromGame).toContain("sim-1");
      // Trashed up to 5 from HQ (3 fill + maybe demo cards, capped)
      expect(s.corp.deck.length).toBeGreaterThanOrEqual(deckBefore);
    });
  });

  describe("PH Poison Vial", () => {
    it("wires power break gated on already-broken sub", () => {
      const def = getCardDef("poison-vial");
      expect(def.unsupported).toEqual([]);
      expect(def.powerCountersOnInstall).toBe(3);
      expect(def.trashWhenPowerEmpty).toBe(true);
      const ab = def.paidAbilities![0]!;
      expect(ab.requireBrokenSubThisEncounter).toBe(true);
      expect(validateEffectTree(ab.effect)).toBeNull();

      expect(
        validateEffectTree(fx.breakEncounterSubroutine(undefined, 2)),
      ).toBeNull();

      let s = createInitialState();
      s = structuredClone(s);
      const vial = instantiateCard("t400-memory-diamond", "vial-1", "runner:installed");
      vial.title = "Poison Vial";
      vial.powerCounters = 3;
      vial.trashWhenPowerEmpty = true;
      vial.paidAbilities = [
        {
          id: "poison-vial-break",
          label: "break",
          clickCost: 0,
          creditCost: 0,
          cost: { powerCounters: 1 },
          windows: ["encounter_paw"],
          requireBrokenSubThisEncounter: true,
          effect: fx.breakEncounterSubroutine(undefined, 2),
        },
      ];
      vial.unsupported = [];
      s.cards["vial-1"] = vial;
      s.runner.installed = ["vial-1"];

      const ice = instantiateCard("palisade", "ice-1", "server:hq:ice");
      ice.rezzed = true;
      ice.subroutines = [
        { id: "a", text: "A", effect: fx.etr() },
        { id: "b", text: "B", effect: fx.etr() },
        { id: "c", text: "C", effect: fx.etr() },
      ];
      s.cards["ice-1"] = ice;
      s.servers.hq.ice = ["ice-1"];
      s.run = {
        attackedServerId: "hq",
        position: 0,
        successful: false,
        encounter: {
          iceId: "ice-1",
          broken: [false, false, false],
          subIndex: 0,
        },
      } as never;
      s.timingKey = "run.encounterPaw";
      s.activeSide = "runner";

      // No broken sub yet → illegal
      let r = applyAction(s, {
        type: "use_paid_ability",
        cardId: "vial-1",
        abilityId: "poison-vial-break",
      });
      expect(r.ok).toBe(false);

      s.run!.encounter!.broken[0] = true;
      r = applyAction(s, {
        type: "use_paid_ability",
        cardId: "vial-1",
        abilityId: "poison-vial-break",
      });
      expect(r.ok).toBe(true);
      s = r.state;
      expect(s.cards["vial-1"].powerCounters).toBe(2);
      // Broke up to 2 remaining → indices 1 and 2
      expect(s.run!.encounter!.broken).toEqual([true, true, true]);
    });
  });

  describe("PH Hippocampic Mechanocytes", () => {
    it("places power on install, meat damage, hand size per counter", () => {
      const def = getCardDef("hippocampic-mechanocytes");
      expect(def.unsupported).toEqual([]);
      expect(def.powerCountersOnInstall).toBe(2);
      expect(def.handSizePerPowerCounter).toBe(1);
      expect(validateEffectTree(def.onInstall!)).toBeNull();

      let s = createInitialState();
      s = structuredClone(s);
      s.activeSide = "runner";
      s.timingKey = "runner.takeAction";
      s.runner.clicks = 4;
      s.runner.credits = 5;
      // Pad grip so meat doesn't flatline
      for (let i = 0; i < 3; i++) {
        const id = `pad-${i}`;
        s.cards[id] = instantiateCard("sure-gamble", id, "runner:grip");
        s.runner.hand.push(id);
      }
      const hip = instantiateCard("t400-memory-diamond", "hip-1", "runner:grip");
      hip.title = "Hippocampic Mechanocytes";
      hip.installCost = 0;
      hip.handSizeBonus = undefined;
      hip.muBonus = undefined;
      hip.powerCountersOnInstall = 2;
      hip.handSizePerPowerCounter = 1;
      hip.onInstall = def.onInstall;
      hip.unsupported = [];
      s.cards["hip-1"] = hip;
      s.runner.hand.push("hip-1");
      const beforeHand = s.runner.maxHandSize;
      s = must(s, {
        type: "basic_install",
        cardId: "hip-1",
        destination: { kind: "installed" },
      });
      expect(s.cards["hip-1"].powerCounters).toBe(2);
      recomputeRunnerMaxHandSize(s);
      expect(s.runner.maxHandSize).toBe(beforeHand + 2);
    });
  });
  });

  describe("parhelion-spark-world-tree", () => {
  beforeAll(() => {
    if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
    if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
    assertPinnedTag("v26.03");
    assertCardsPinnedTag("v1.147.15");
  });

  function must(
    state: ReturnType<typeof createInitialState>,
    action: Parameters<typeof applyAction>[1],
  ) {
    const r = applyAction(state, action);
    if (!r.ok) throw new Error(`${r.error} ${JSON.stringify(r.cites)}`);
    return r.state;
  }

  describe("PH Spark of Inspiration", () => {
    it("wires onPlay spark_of_inspiration_resolve (−10¢)", () => {
      const def = getCardDef("spark-of-inspiration");
      expect(def.unsupported ?? []).toEqual([]);
      expect(def.onPlay).toEqual({
        op: "do",
        action: { kind: "resolve_spark_of_inspiration", discount: 10 },
      });
      expect(validateEffectTree(def.onPlay!)).toBeNull();
      expect(validateEffectTree(fx.sparkOfInspirationResolve(10))).toBeNull();
    });

    it("sets aside until program; may install −10¢; shuffles remainder", () => {
      let s = createInitialState();
      s = structuredClone(s);
      const filler = instantiateCard("sure-gamble", "fill-1", "runner:stack");
      const prog = instantiateCard("leech", "prog-1", "runner:stack");
      prog.installCost = 12;
      prog.memoryCost = 1;
      const filler2 = instantiateCard("sure-gamble", "fill-2", "runner:stack");
      s.cards["fill-1"] = filler;
      s.cards["prog-1"] = prog;
      s.cards["fill-2"] = filler2;
      // Top of stack = index 0 (shift order).
      s.runner.deck = ["fill-1", "prog-1", "fill-2"];
      s.runner.credits = 5;
      s.runner.installed = [];
      const src = instantiateCard("spark-of-inspiration", "spark-1", "runner:heap");
      s.cards["spark-1"] = src;

      const r = evalEffect(
        { state: s, sourceId: "spark-1" },
        fx.sparkOfInspirationResolve(10),
      );
      expect(r.ok).toBe(true);
      expect(s.pendingChoice?.options.map((o) => o.id)).toEqual([
        "install",
        "decline",
      ]);
      expect(s.runner.setAside).toEqual(["fill-1", "prog-1"]);
      expect(s.runner.deck).toEqual(["fill-2"]);

      s = must(s, { type: "choose_option", optionId: "install" });
      expect(s.runner.installed).toContain("prog-1");
      expect(s.runner.credits).toBe(3); // 12 − 10 = 2; 5 − 2 = 3
      expect(s.runner.setAside ?? []).toEqual([]);
      expect(s.runner.deck.sort()).toEqual(["fill-1", "fill-2"].sort());
      expect(s.cards["fill-1"]!.zone).toBe("runner:stack");
      expect(s.cards["fill-1"]!.faceup).toBe(false);
    });

    it("decline shuffles set-aside including the program", () => {
      let s = createInitialState();
      s = structuredClone(s);
      const prog = instantiateCard("leech", "prog-2", "runner:stack");
      prog.installCost = 5;
      s.cards["prog-2"] = prog;
      s.runner.deck = ["prog-2"];
      s.runner.credits = 20;
      const src = instantiateCard("spark-of-inspiration", "spark-2", "runner:heap");
      s.cards["spark-2"] = src;

      evalEffect(
        { state: s, sourceId: "spark-2" },
        fx.sparkOfInspirationResolve(10),
      );
      s = must(s, { type: "choose_option", optionId: "decline" });
      expect(s.runner.installed).not.toContain("prog-2");
      expect(s.runner.deck).toContain("prog-2");
      expect(s.runner.setAside ?? []).toEqual([]);
    });
  });

  describe("PH World Tree", () => {
    it("wires once-per-turn onSuccessfulRun may-trash search same type", () => {
      const def = getCardDef("world-tree");
      expect(def.unsupported ?? []).toEqual([]);
      expect(def.onSuccessfulRunOncePerTurn).toBe(true);
      expect(def.onSuccessfulRun).toEqual({
        op: "do",
        action: {
          kind: "may_trash_other_installed_search_stack_same_type_install",
          discount: 3,
        },
      });
      expect(validateEffectTree(def.onSuccessfulRun!)).toBeNull();
      expect(
        validateEffectTree(
          fx.mayTrashOtherInstalledSearchStackSameTypeInstall(3),
        ),
      ).toBeNull();
    });

    it("trash other hardware → search/install hardware −3¢", () => {
      let s = createInitialState();
      s = structuredClone(s);
      const tree = instantiateCard("world-tree", "wt-1", "runner:installed");
      s.cards["wt-1"] = tree;
      const hw = instantiateCard("pennyshaver", "hw-1", "runner:installed");
      s.cards["hw-1"] = hw;
      s.runner.installed = ["wt-1", "hw-1"];

      const found = instantiateCard("docklands-pass", "hw-2", "runner:stack");
      found.installCost = 5;
      s.cards["hw-2"] = found;
      s.runner.deck = ["hw-2"];
      s.runner.credits = 5;

      const r = evalEffect(
        { state: s, sourceId: "wt-1" },
        fx.mayTrashOtherInstalledSearchStackSameTypeInstall(3),
      );
      expect(r.ok).toBe(true);
      expect(s.pendingChoice?.options.map((o) => o.id)).toEqual(
        expect.arrayContaining(["trash:hw-1", "decline"]),
      );

      const creditsBefore = s.runner.credits;
      s = must(s, { type: "choose_option", optionId: "trash:hw-1" });
      expect(s.runner.installed).not.toContain("hw-1");
      expect(s.runner.discardPile).toContain("hw-1");
      // Sole stack hardware auto-installs at 5 − 3 = 2¢.
      expect(s.runner.installed).toContain("hw-2");
      expect(s.runner.credits).toBe(creditsBefore - 2);
      expect(s.runner.deck).not.toContain("hw-2");
    });

    it("fires once on first successful run via onSuccessfulRunOncePerTurn", () => {
      let s = createInitialState();
      s = structuredClone(s);
      const tree = instantiateCard("world-tree", "wt-3", "runner:installed");
      s.cards["wt-3"] = tree;
      const hw = instantiateCard("pennyshaver", "hw-3", "runner:installed");
      s.cards["hw-3"] = hw;
      s.runner.installed = ["wt-3", "hw-3"];
      s.servers.hq.ice = [];
      s.corp.hand = [];
      s.activeSide = "runner";
      s.timingKey = "runner.takeAction";
      s.runner.clicks = 4;

      s = must(s, { type: "basic_run", serverId: "hq" as ServerId });
      let guard = 0;
      while (s.run && !s.pendingChoice && guard++ < 30) {
        if (s.timingKey === "run.jackOutWindow") {
          s = must(s, { type: "continue_run" });
        } else if (
          s.timingKey === "run.approachServerPaw" ||
          s.timingKey === "run.approachPaw"
        ) {
          s = must(s, { type: "pass_window" });
        } else {
          break;
        }
      }
      expect(s.turn.successfulRunThisTurn).toBe(true);
      expect(s.turn.onSuccessfulRunFiredIds).toContain("wt-3");
      expect(s.pendingChoice?.options.some((o) => o.id === "trash:hw-3")).toBe(
        true,
      );
    });

    it("no-ops when no other installed cards", () => {
      let s = createInitialState();
      s = structuredClone(s);
      const tree = instantiateCard("world-tree", "wt-2", "runner:installed");
      s.cards["wt-2"] = tree;
      s.runner.installed = ["wt-2"];
      const r = evalEffect(
        { state: s, sourceId: "wt-2" },
        fx.mayTrashOtherInstalledSearchStackSameTypeInstall(3),
      );
      expect(r.ok).toBe(true);
      expect(s.pendingChoice).toBeNull();
    });
  });
  });

  describe("parhelion-tremolo-allot-k2cp", () => {
  beforeAll(() => {
    if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
    if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
    assertPinnedTag("v26.03");
    assertCardsPinnedTag("v1.147.15");
  });

  function must(
    state: ReturnType<typeof createInitialState>,
    action: Parameters<typeof applyAction>[1],
  ) {
    const r = applyAction(state, action);
    if (!r.ok) throw new Error(`${r.error} ${JSON.stringify(r.cites)}`);
    return r.state;
  }

  describe("PH Tremolo cybernetic break discount", () => {
    it("reduces break cost by 1¢ per installed cybernetic", () => {
      let s = createInitialState();
      s = structuredClone(s);
      const tr = instantiateCard("cleaver", "tr-1", "runner:installed");
      tr.title = "Tremolo";
      tr.breaker = {
        breaksSubtype: "barrier",
        strength: 2,
        breakCredits: 3,
        breakMaxSubs: 2,
        breakCreditsDiscountPerInstalledSubtype: {
          subtype: "cybernetic",
          amount: 1,
        },
      };
      tr.unsupported = [];
      const cyber = instantiateCard("marrow", "cy-1", "runner:installed");
      cyber.subtypes = ["cybernetic"];
      cyber.unsupported = [];
      s.cards["tr-1"] = tr;
      s.cards["cy-1"] = cyber;
      s.runner.installed = ["tr-1", "cy-1"];
      s.runner.credits = 5;
      const ice = instantiateCard("palisade", "ice-1", "server:hq:ice");
      ice.rezzed = true;
      ice.strength = 2;
      s.cards["ice-1"] = ice;
      s.servers.hq.ice = ["ice-1"];
      s.activeSide = "runner";
      s.timingKey = "runner.takeAction";
      s.runner.clicks = 4;
      s = must(s, { type: "basic_run", serverId: "hq" as ServerId });
      let guard = 0;
      while (s.timingKey !== "run.encounterPaw" && s.run && guard++ < 20) {
        if (queryLegality(s).legal.some((e) => e.action.type === "pass_window")) {
          s = must(s, { type: "pass_window" });
        } else {
          break;
        }
      }
      expect(s.timingKey).toBe("run.encounterPaw");
      const before = s.runner.credits;
      s = must(s, {
        type: "break_subroutine",
        breakerId: "tr-1",
        subIndex: 0,
      });
      // 3 − 1 cybernetic = 2¢
      expect(s.runner.credits).toBe(before - 2);
    });
  });

  describe("PH Basilar allotted clicks + Hypoxia next-turn delta", () => {
    it("accepts allotted_clicks_next_turn IR", () => {
      expect(
        validateEffectTree(fx.allottedClicksNextTurn("runner", -1)),
      ).toBeNull();
    });

    it("Basilar grants +1 allotted click on gainClicks", () => {
      let s = createInitialState();
      s = structuredClone(s);
      const bas = instantiateCard("marrow", "bas-1", "runner:installed");
      bas.title = "Basilar";
      bas.allottedClicksBonus = 1;
      bas.unsupported = [];
      s.cards["bas-1"] = bas;
      s.runner.installed = ["bas-1"];
      s.timingKey = "runner.gainClicks";
      resolveAndAdvance(s);
      expect(s.runner.clicks).toBe(5);
    });

    it("pending delta reduces next Runner allotment then clears", () => {
      let s = createInitialState();
      s = structuredClone(s);
      const r = evalEffect(
        { state: s, sourceId: s.corp.identityId },
        fx.allottedClicksNextTurn("runner", -1),
      );
      expect(r.ok).toBe(true);
      expect(s.runnerAllottedClicksDeltaNextTurn).toBe(-1);
      s.timingKey = "runner.gainClicks";
      resolveAndAdvance(s);
      expect(s.runner.clicks).toBe(3);
      expect(s.runnerAllottedClicksDeltaNextTurn).toBe(0);
    });
  });

  describe("PH K2CP Turbine aura", () => {
    it("gives +2 strength to non-AI icebreakers, not AI", () => {
      let s = createInitialState();
      s = structuredClone(s);
      const k2 = instantiateCard("sure-gamble", "k2-1", "runner:installed");
      k2.title = "K2CP Turbine";
      k2.type = "program";
      k2.giveStrengthToInstalledIcebreakers = {
        amount: 2,
        excludeSubtype: "ai",
      };
      k2.unsupported = [];
      const fracter = instantiateCard("cleaver", "cl-1", "runner:installed");
      fracter.unsupported = [];
      const ai = instantiateCard("mayfly", "ai-1", "runner:installed");
      ai.subtypes = ["icebreaker", "ai"];
      ai.breaker = {
        breaksSubtype: "*",
        strength: 1,
        breakCredits: 1,
      };
      ai.unsupported = [];
      s.cards["k2-1"] = k2;
      s.cards["cl-1"] = fracter;
      s.cards["ai-1"] = ai;
      s.runner.installed = ["k2-1", "cl-1", "ai-1"];
      expect(effectiveBreakerStrength(s, "cl-1")).toBe(
        (fracter.breaker?.strength ?? 0) + 2,
      );
      expect(effectiveBreakerStrength(s, "ai-1")).toBe(1);
    });
  });

  describe("PH tremolo/allot/k2cp card wiring (pin v0.50.0)", () => {
    it("wires Tremolo / Basilar / Hypoxia / K2CP with empty unsupported", () => {
      const tremolo = getCardDef("tremolo");
      expect(tremolo.unsupported).toEqual([]);
      expect(tremolo.breaker?.breakCredits).toBe(3);
      expect(tremolo.breaker?.breakMaxSubs).toBe(2);
      expect(tremolo.breaker?.breakCreditsDiscountPerInstalledSubtype).toEqual({
        subtype: "cybernetic",
        amount: 1,
      });

      const basilar = getCardDef("basilar-synthgland-2kvj");
      expect(basilar.unsupported).toEqual([]);
      expect(basilar.allottedClicksBonus).toBe(1);
      expect(basilar.onInstall).toEqual(fx.coreDamage(2));

      const hypoxia = getCardDef("hypoxia");
      expect(hypoxia.unsupported).toEqual([]);
      expect(hypoxia.playRequiresTagged).toBe(true);
      expect(validateEffectTree(hypoxia.onPlay!)).toBeNull();
      expect(JSON.stringify(hypoxia.onPlay)).toContain("allotted_clicks_next_turn");
      expect(JSON.stringify(hypoxia.onPlay)).toContain("rfg_self");

      const k2 = getCardDef("k2cp-turbine");
      expect(k2.unsupported).toEqual([]);
      expect(k2.giveStrengthToInstalledIcebreakers).toEqual({
        amount: 2,
        excludeSubtype: "ai",
      });
    });
  });
  });

  describe("parhelion-tunnel-nanuq", () => {
  beforeAll(() => {
    if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
    if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
    assertPinnedTag("v26.03");
    assertCardsPinnedTag("v1.147.15");
  });

  function must(
    state: ReturnType<typeof createInitialState>,
    action: Parameters<typeof applyAction>[1],
  ) {
    const r = applyAction(state, action);
    if (!r.ok) throw new Error(`${r.error} ${JSON.stringify(r.cites)}`);
    return r.state;
  }

  describe("PH Tunnel Vision mark-only break", () => {
    it("cannot break off-mark; can break on mark", () => {
      let s = createInitialState();
      s = structuredClone(s);
      const tv = instantiateCard("mayfly", "tv-1", "runner:installed");
      tv.title = "Tunnel Vision";
      tv.breaker = {
        breaksSubtype: "*",
        strength: 5,
        breakCredits: 2,
        breakMaxSubs: 2,
        breakRequiresAttackingMark: true,
      };
      tv.unsupported = [];
      s.cards["tv-1"] = tv;
      s.runner.installed = ["tv-1"];
      s.runner.credits = 10;
      s.markServerId = "rd";
      const ice = instantiateCard("palisade", "ice-1", "server:hq:ice");
      ice.rezzed = true;
      ice.strength = 1;
      s.cards["ice-1"] = ice;
      s.servers.hq.ice = ["ice-1"];
      s.activeSide = "runner";
      s.timingKey = "runner.takeAction";
      s.runner.clicks = 4;
      s = must(s, { type: "basic_run", serverId: "hq" as ServerId });
      let guard = 0;
      while (s.timingKey !== "run.encounterPaw" && s.run && guard++ < 20) {
        if (queryLegality(s).legal.some((e) => e.action.type === "pass_window")) {
          s = must(s, { type: "pass_window" });
        } else break;
      }
      expect(s.timingKey).toBe("run.encounterPaw");
      const legal = queryLegality(s).legal;
      expect(
        legal.some(
          (e) =>
            e.action.type === "break_subroutine" &&
            e.action.breakerId === "tv-1",
        ),
      ).toBe(false);

      // Retarget mark to HQ and re-check via a fresh encounter-shaped state
      s.markServerId = "hq";
      const legal2 = queryLegality(s).legal;
      expect(
        legal2.some(
          (e) =>
            e.action.type === "break_subroutine" &&
            e.action.breakerId === "tv-1",
        ),
      ).toBe(true);
    });
  });

  describe("PH Nanuq RFG on uninstall / agenda", () => {
    it("rfgOnUninstall sends to RFG instead of heap", () => {
      let s = createInitialState();
      s = structuredClone(s);
      const n = instantiateCard("mayfly", "nan-1", "runner:installed");
      n.title = "Nanuq";
      n.rfgOnUninstall = true;
      n.unsupported = [];
      s.cards["nan-1"] = n;
      s.runner.installed = ["nan-1"];
      moveRunnerCardToHeap(s, "nan-1");
      expect(s.runner.installed).not.toContain("nan-1");
      expect(s.runner.discardPile).not.toContain("nan-1");
      expect(s.removedFromGame).toContain("nan-1");
      expect(s.cards["nan-1"]!.zone).toBe("removed-from-game");
    });

    it("onAgendaScoredOrStolen RFGs Nanuq", () => {
      let s = createInitialState();
      s = structuredClone(s);
      const n = instantiateCard("mayfly", "nan-2", "runner:installed");
      n.title = "Nanuq";
      n.rfgOnUninstall = true;
      n.onAgendaScoredOrStolen = fx.rfgSelf();
      n.unsupported = [];
      s.cards["nan-2"] = n;
      s.runner.installed = ["nan-2"];
      // Score a synthetic agenda via host path: place agenda and score
      const remote = "remote-1" as ServerId;
      s.servers[remote] = { id: remote, kind: "remote", ice: [], root: [] };
      const ag = instantiateCard("offworld-office", "ag-1", `server:${remote}:root`);
      ag.advancementCounters = 10;
      ag.advancementRequirement = 2;
      ag.unsupported = [];
      s.cards["ag-1"] = ag;
      s.servers[remote].root = ["ag-1"];
      s.corp.clicks = 3;
      s.activeSide = "corp";
      s.timingKey = "corp.actionPaw";
      const id = s.cards[s.corp.identityId];
      if (id) delete id.onAgendaScored;
      s = must(s, { type: "score_agenda", cardId: "ag-1" });
      expect(s.removedFromGame).toContain("nan-2");
    });
  });

  describe("PH Tunnel Vision / Nanuq wiring (pin v0.51.0)", () => {
    it("wires both cards with empty unsupported", () => {
      const tv = getCardDef("tunnel-vision");
      expect(tv.unsupported).toEqual([]);
      expect(tv.onTurnBegin).toEqual(fx.identifyMark());
      expect(tv.breaker?.breakRequiresAttackingMark).toBe(true);
      expect(tv.breaker?.breaksSubtype).toBe("*");
      expect(tv.breaker?.breakMaxSubs).toBe(2);

      const nan = getCardDef("nanuq");
      expect(nan.unsupported).toEqual([]);
      expect(nan.rfgOnUninstall).toBe(true);
      expect(nan.onAgendaScoredOrStolen).toEqual(fx.rfgSelf());
      expect(nan.breaker?.breaksSubtype).toBe("*");
      expect(nan.breaker?.breakMaxSubs).toBe(2);
    });
  });
  });
});
