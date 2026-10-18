
import {
  describe,
  expect,
  it,
  beforeAll,
} from "vitest";
import {
  applyAction,
  assertCardsPinnedTag,
  assertPinnedTag,
  cardsDataPresent,
  createInitialState,
  crDataPresent,
  evalEffect,
  fx,
  getCardDef,
  instantiateCard,
  validateEffectTree,
  queryLegality,
  agendaPointsFor,
  effectiveIceStrength,
  dealDamage,
  effectiveBreakerStrength,
  continuousIceRezCostIncrease,
  canPayCost,
  isAttackingCentral,
  payCost,
  recurringCreditsForCentralRun,
  refillRecurringCredits,
  runnerAvailableCredits,
  runnerCreditsFor,
  spendRunnerCredits,
  spendRunnerCreditsFor,
  CR,
  effectiveEventPlayCost,
  eventPlayCostDiscountTotal,
  loadCardCatalog,
  loadCardPool,
  rezCostDiscountPerRezzedSubtype,
  abilitiesSuppressed,
  isServerAllowedForSpec,
  serversMatchingSpec,
  resolveAndAdvance,
} from "../src/index.js";
import type { ServerId, PaidAbility, StartsRunSpec } from "../src/state/types.js";
import type { Effect } from "../src/index.js";
import { canScoreAgenda } from "../src/state/scoring.js";
import { isCoreDamageType } from "../src/state/damage.js";
import { firePowerOnHarmonicIceRez, syncEtrPerPowerCounterSubs } from "../src/state/powerCounters.js";
import { moveRunnerCardToHeap, purgeVirusCounters } from "../src/state/trashHooks.js";
import { beginCorpTurnFlags } from "../src/state/turn.js";
import { noteInstalledCardCreditSpend } from "../src/state/costs.js";
import { beginBreachAccess } from "../src/state/access.js";

describe("midnight-sun", () => {
  describe("midnight-sun-add-power-counter", () => {
  beforeAll(() => {
    if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
    if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
    assertPinnedTag("v26.03");
    assertCardsPinnedTag("v1.147.6");
  });

  function must(
    state: ReturnType<typeof createInitialState>,
    action: Parameters<typeof applyAction>[1],
  ) {
    const r = applyAction(state, action);
    if (!r.ok) throw new Error(`${r.error} ${JSON.stringify(r.cites)}`);
    return r.state;
  }

  describe("MS add_power_counter IR (always)", () => {
    it("accepts add_power_counter Effect IR", () => {
      expect(validateEffectTree(fx.addPowerCounter(1))).toBeNull();
    });

    it("add_power_counter places counters on source (no charge ≥1 gate)", () => {
      const s = createInitialState();
      const card = instantiateCard("hyperbaric", "h-1", "runner:installed");
      card.powerCounters = 0;
      s.cards["h-1"] = card;
      s.runner.installed.push("h-1");
      const r = evalEffect({ state: s, sourceId: "h-1" }, fx.addPowerCounter(2));
      expect(r.ok).toBe(true);
      expect(card.powerCounters).toBe(2);
      expect(s.log.some((l) => l.includes("power counter"))).toBe(true);
    });

    it("Hyperbaric-shaped paid ability spends 2¢ and places a power counter", () => {
      let s = createInitialState();
      s = structuredClone(s);
      const h = instantiateCard("hyperbaric", "h-1", "runner:installed");
      h.powerCounters = 1;
      h.paidAbilities = [
        {
          id: "hyperbaric-place-power",
          label: "2¢: Place 1 power counter on Hyperbaric",
          clickCost: 0,
          creditCost: 2,
          cost: { credits: 2 },
          windows: ["runner_action_paw"],
          effect: fx.addPowerCounter(1),
        },
      ];
      s.cards["h-1"] = h;
      s.runner.installed = ["h-1"];
      s.runner.credits = 5;
      s.activeSide = "runner";
      s.timingKey = "runner.actionPaw";

      const before = h.powerCounters ?? 0;
      s = must(s, {
        type: "use_paid_ability",
        cardId: "h-1",
        abilityId: "hyperbaric-place-power",
      });
      expect(s.runner.credits).toBe(3);
      expect(s.cards["h-1"]!.powerCounters).toBe(before + 1);
    });

    it("Endurance-shaped onSuccessfulRunOncePerTurn places a power counter", () => {
      let s = createInitialState();
      s = structuredClone(s);
      const end = instantiateCard("endurance", "end-1", "runner:installed");
      end.powerCounters = 3;
      end.onSuccessfulRunOncePerTurn = true;
      end.onSuccessfulRun = fx.addPowerCounter(1);
      s.cards["end-1"] = end;
      s.runner.installed = ["end-1"];
      s.servers.hq.ice = [];
      s.servers.hq.root = [];
      s.activeSide = "runner";
      s.timingKey = "runner.takeAction";
      s.runner.clicks = 4;

      s = must(s, { type: "basic_run", serverId: "hq" as ServerId });
      expect(s.run).toBeNull();
      expect(s.turn.successfulRunThisTurn).toBe(true);
      expect(s.cards["end-1"]!.powerCounters).toBe(4);
      expect(s.turn.onSuccessfulRunFiredIds).toContain("end-1");

      // Second success same turn: no second place
      if (s.timingKey === "runner.actionPaw") {
        s = must(s, { type: "pass_window" });
      }
      expect(s.timingKey).toBe("runner.takeAction");
      s.runner.clicks = 4;
      s = must(s, { type: "basic_run", serverId: "rd" as ServerId });
      expect(s.cards["end-1"]!.powerCounters).toBe(4);
    });

    it("Endurance-shaped 2-counter break ability breaks up to 2 subs", () => {
      let s = createInitialState();
      s = structuredClone(s);
      // Ice with 2 ETR subs (Maskirovka)
      const ice = instantiateCard("maskirovka", "ice-1", "server:hq:ice");
      ice.rezzed = false;
      s.cards["ice-1"] = ice;
      s.servers.hq.ice = ["ice-1"];

      const end = instantiateCard("endurance", "end-1", "runner:installed");
      end.powerCounters = 4;
      end.paidAbilities = [
        {
          id: "endurance-power-break",
          label: "Spend 2 power counters: break up to 2 subroutines",
          clickCost: 0,
          creditCost: 0,
          cost: { powerCounters: 2 },
          windows: ["encounter_paw"],
          effect: fx.seq(
            fx.do({ kind: "break_encounter_subroutine" }),
            fx.do({ kind: "break_encounter_subroutine" }),
          ),
        },
      ];
      s.cards["end-1"] = end;
      s.runner.installed = ["end-1"];
      s.runner.credits = 10;
      s.runner.clicks = 4;
      s.corp.credits = 20;
      s.activeSide = "runner";
      s.timingKey = "runner.takeAction";

      s = must(s, { type: "basic_run", serverId: "hq" as ServerId });
      s = must(s, { type: "rez_ice", cardId: "ice-1" });
      s = must(s, { type: "pass_window" });
      expect(s.timingKey).toBe("run.encounterPaw");

      const before = s.cards["end-1"]!.powerCounters ?? 0;
      s = must(s, {
        type: "use_paid_ability",
        cardId: "end-1",
        abilityId: "endurance-power-break",
      });
      expect(s.cards["end-1"]!.powerCounters).toBe(before - 2);
      expect(s.run?.encounter?.broken.every(Boolean)).toBe(true);
    });
  });

  describe("MS Hyperbaric / Endurance card wiring (v0.31.0+)", () => {
    it("Hyperbaric fully wired onto add_power_counter", () => {
      const h = getCardDef("hyperbaric");
      expect(h.unsupported).toEqual([]);
      expect(h.strengthPerPowerCounter).toBe(true);
      expect(h.powerCountersOnInstall).toBe(1);
      const place = h.paidAbilities?.find((a) => a.id === "hyperbaric-place-power");
      expect(place?.cost?.credits).toBe(2);
      expect(place?.effect?.op).toBe("do");
      expect((place?.effect as { action?: { kind?: string } })?.action?.kind).toBe(
        "add_power_counter",
      );
    });

    it("Endurance fully wired; console note cleared", () => {
      const e = getCardDef("endurance");
      expect(e.unsupported).toEqual([]);
      expect(e.onSuccessfulRunOncePerTurn).toBe(true);
      expect(e.powerCountersOnInstall).toBe(3);
      expect(e.muBonus).toBe(2);
      expect(e.onSuccessfulRun).toBeTruthy();
      expect(
        e.paidAbilities?.some(
          (a) => a.id === "endurance-power-break" && a.cost?.powerCounters === 2,
        ),
      ).toBe(true);
    });

    it("live Hyperbaric paid ability from card def places a counter", () => {
      let s = createInitialState();
      s = structuredClone(s);
      const h = instantiateCard("hyperbaric", "h-live", "runner:installed");
      s.cards["h-live"] = h;
      s.runner.installed = ["h-live"];
      s.runner.credits = 5;
      s.activeSide = "runner";
      s.timingKey = "runner.actionPaw";
      const before = h.powerCounters ?? 0;
      s = must(s, {
        type: "use_paid_ability",
        cardId: "h-live",
        abilityId: "hyperbaric-place-power",
      });
      expect(s.cards["h-live"]!.powerCounters).toBe(before + 1);
      expect(s.runner.credits).toBe(3);
    });

    it("live Endurance places on first successful run", () => {
      let s = createInitialState();
      s = structuredClone(s);
      const end = instantiateCard("endurance", "end-live", "runner:installed");
      s.cards["end-live"] = end;
      s.runner.installed = ["end-live"];
      s.servers.archives.ice = [];
      s.servers.archives.root = [];
      s.activeSide = "runner";
      s.timingKey = "runner.takeAction";
      s.runner.clicks = 4;
      const before = end.powerCounters ?? 0;
      s = must(s, { type: "basic_run", serverId: "archives" as ServerId });
      expect(s.cards["end-live"]!.powerCounters).toBe(before + 1);
    });
  });
  });

  describe("midnight-sun-anemone", () => {
  beforeAll(() => {
    if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
    if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
    assertPinnedTag("v26.03");
    assertCardsPinnedTag("v1.147.6");
  });

  function must(
    state: ReturnType<typeof createInitialState>,
    action: Parameters<typeof applyAction>[1],
  ) {
    const r = applyAction(state, action);
    if (!r.ok) throw new Error(`${r.error} ${JSON.stringify(r.cites)}`);
    return r.state;
  }

  function anemoneOnRez(): Effect {
    return fx.if(
      { op: "source_protects_attacked_server" },
      fx.choose("corp", [
        {
          id: "trash-hq-net",
          label: "Trash 1 from HQ: do 2 net damage",
          effect: fx.trashHq("first", fx.netDamage(2)),
        },
        {
          id: "decline",
          label: "Decline",
          effect: fx.gainCredits("corp", 0),
        },
      ]),
    );
  }

  describe("MS Anemone trash_hq.then (onRez during run)", () => {
    it("validates trash_hq + then tree", () => {
      expect(
        validateEffectTree(fx.trashHq("first", fx.netDamage(2))),
      ).toBeNull();
      expect(validateEffectTree(anemoneOnRez())).toBeNull();
    });

    it("skips net damage when HQ empty", () => {
      let s = createInitialState();
      s = structuredClone(s);
      const ice = instantiateCard("anemone", "an-1", "server:hq:ice");
      s.cards["an-1"] = ice;
      s.corp.hand = [];
      s.runner.hand = ["r1", "r2"].map((id) => {
        const c = instantiateCard("sure-gamble", id, "runner:hand");
        s.cards[id] = c;
        return id;
      });
      const before = s.runner.hand.length;
      const r = evalEffect(
        { state: s, sourceId: "an-1" },
        fx.trashHq("first", fx.netDamage(2)),
      );
      expect(r.ok).toBe(true);
      expect(s.runner.hand.length).toBe(before);
    });

    it("trashes from HQ then deals 2 net", () => {
      let s = createInitialState();
      s = structuredClone(s);
      const ice = instantiateCard("anemone", "an-1", "server:hq:ice");
      ice.unsupported = [];
      s.cards["an-1"] = ice;
      const card = instantiateCard("hedge-fund", "hq-1", "corp:hand");
      s.cards["hq-1"] = card;
      s.corp.hand = ["hq-1"];
      s.runner.hand = ["r1", "r2", "r3"].map((id) => {
        const c = instantiateCard("sure-gamble", id, "runner:hand");
        s.cards[id] = c;
        return id;
      });

      const r = evalEffect(
        { state: s, sourceId: "an-1" },
        fx.trashHq("first", fx.netDamage(2)),
      );
      expect(r.ok).toBe(true);
      expect(s.corp.hand).toEqual([]);
      expect(s.corp.discardPile).toContain("hq-1");
      expect(s.runner.hand.length).toBe(1);
    });

    it("onRez during run offers trash→net; decline leaves HQ", () => {
      let s = createInitialState();
      s = structuredClone(s);
      const remoteId = "remote-1" as ServerId;
      s.servers[remoteId] = { id: remoteId, kind: "remote", ice: [], root: [] };

      const an = instantiateCard("anemone", "an-1", `server:${remoteId}:ice`);
      an.unsupported = [];
      an.onRez = anemoneOnRez();
      an.rezzed = false;
      s.cards["an-1"] = an;
      s.servers[remoteId].ice = ["an-1"];

      const hq = instantiateCard("hedge-fund", "hq-1", "corp:hand");
      s.cards["hq-1"] = hq;
      s.corp.hand = ["hq-1"];
      s.corp.credits = 10;
      s.runner.clicks = 4;
      s.runner.credits = 10;
      s.runner.hand = ["r1", "r2", "r3"].map((id) => {
        const c = instantiateCard("sure-gamble", id, "runner:hand");
        s.cards[id] = c;
        return id;
      });
      s.activeSide = "runner";
      s.timingKey = "runner.takeAction";

      s = must(s, { type: "basic_run", serverId: remoteId });
      s = must(s, { type: "rez_ice", cardId: "an-1" });
      expect(s.pendingChoice?.options.some((o) => o.id === "trash-hq-net")).toBe(
        true,
      );
      const grip = s.runner.hand.length;
      s = must(s, { type: "choose_option", optionId: "trash-hq-net" });
      expect(s.corp.hand).toEqual([]);
      expect(s.runner.hand.length).toBe(grip - 2);
    });
  });

  describe("MS Anemone card wiring (v0.31.0+)", () => {
    it("Anemone clears unsupported with trash_hq.then onRez", () => {
      const def = getCardDef("anemone");
      expect(def.unsupported).toEqual([]);
      expect(def.type).toBe("ice");
      expect(def.onRez).toEqual(
        expect.objectContaining({
          op: "if",
          cond: { op: "source_protects_attacked_server" },
        }),
      );
    });
  });
  });

  describe("midnight-sun-backroom-mad-bigdeal", () => {
  beforeAll(() => {
    if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
    if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
    assertPinnedTag("v26.03");
    assertCardsPinnedTag("v1.147.6");
  });

  function must(
    state: ReturnType<typeof createInitialState>,
    action: Parameters<typeof applyAction>[1],
  ) {
    const r = applyAction(state, action);
    if (!r.ok) throw new Error(`${r.error} ${JSON.stringify(r.cites)}`);
    return r.state;
  }

  describe("MS score_self_as_agenda (Backroom Machinations)", () => {
    it("validates score_self_as_agenda tree", () => {
      expect(validateEffectTree(fx.scoreSelfAsAgenda(1))).toBeNull();
    });

    it("moves source from Archives into Corp score area for 1 point", () => {
      let s = createInitialState();
      s = structuredClone(s);
      const op = instantiateCard(
        "hedge-fund",
        "br-1",
        "corp:archives",
      );
      s.cards["br-1"] = op;
      s.corp.discardPile = ["br-1"];
      const r = evalEffect(
        { state: s, sourceId: "br-1" },
        fx.scoreSelfAsAgenda(1),
      );
      expect(r.ok).toBe(true);
      expect(s.corp.discardPile).not.toContain("br-1");
      expect(s.corp.scoreArea).toContain("br-1");
      expect(s.cards["br-1"].zone).toBe("corp:score");
      expect(s.cards["br-1"].agendaPoints).toBe(1);
      expect(agendaPointsFor(s, "corp")).toBe(1);
    });

    it("playAdditionalCost remove_tags + playRequiresTagged gate", () => {
      let s = createInitialState();
      s = structuredClone(s);
      s.timingKey = "corp.takeAction";
      s.activeSide = "corp";
      s.corp.clicks = 3;
      s.corp.credits = 10;
      s.runner.tags = 1;
      const op = instantiateCard("hedge-fund", "br-play", "corp:hq");
      op.playCost = 2;
      op.playRequiresTagged = true;
      op.playAdditionalCost = fx.removeTags(1);
      op.onPlay = fx.scoreSelfAsAgenda(1);
      s.cards["br-play"] = op;
      s.corp.hand = ["br-play"];
      s = must(s, { type: "play_operation", cardId: "br-play" });
      expect(s.runner.tags).toBe(0);
      expect(s.corp.scoreArea).toContain("br-play");
      expect(agendaPointsFor(s, "corp")).toBe(1);
    });
  });

  describe("MS trash_any_rezzed_give_tags (MAD)", () => {
    it("validates trash_any_rezzed_give_tags tree", () => {
      expect(validateEffectTree(fx.trashAnyRezzedGiveTags())).toBeNull();
    });

    it("trashes chosen rezzed cards and gives 1 tag each; done ends", () => {
      let s = createInitialState();
      s = structuredClone(s);
      const remote = "remote-1" as ServerId;
      s.servers[remote] = { id: remote, kind: "remote", ice: [], root: [] };
      const ice = instantiateCard("ice-wall", "ice-1", `server:${remote}:ice`);
      ice.rezzed = true;
      s.cards["ice-1"] = ice;
      s.servers[remote].ice = ["ice-1"];
      const asset = instantiateCard(
        "pad-campaign",
        "asset-1",
        `server:${remote}:root`,
      );
      asset.rezzed = true;
      s.cards["asset-1"] = asset;
      s.servers[remote].root = ["asset-1"];
      s.runner.tags = 0;

      const r = evalEffect(
        { state: s, sourceId: s.corp.identityId },
        fx.trashAnyRezzedGiveTags(),
      );
      expect(r.ok).toBe(true);
      expect(s.pendingChoice).not.toBeNull();
      expect(s.pendingChoice!.options.some((o) => o.id === "trash-tag:ice-1")).toBe(
        true,
      );

      s = must(s, { type: "choose_option", optionId: "trash-tag:ice-1" });
      expect(s.corp.discardPile).toContain("ice-1");
      expect(s.runner.tags).toBe(1);
      expect(s.pendingChoice).not.toBeNull();

      s = must(s, { type: "choose_option", optionId: "trash-tag:asset-1" });
      expect(s.corp.discardPile).toContain("asset-1");
      expect(s.runner.tags).toBe(2);
      // No rezzed cards left — chain ends without a further choice.
      expect(s.pendingChoice).toBeNull();
    });

    it("playAdditionalClicks=2 requires three clicks total", () => {
      let s = createInitialState();
      s = structuredClone(s);
      s.timingKey = "corp.takeAction";
      s.activeSide = "corp";
      s.corp.clicks = 2;
      s.corp.credits = 20;
      const op = instantiateCard("hedge-fund", "mad-1", "corp:hq");
      op.playCost = 4;
      op.playAdditionalClicks = 2;
      op.onPlay = fx.trashAnyRezzedGiveTags();
      s.cards["mad-1"] = op;
      s.corp.hand = ["mad-1"];
      const legal = queryLegality(s).legal;
      expect(
        legal.some(
          (e) => e.action.type === "play_operation" && e.action.cardId === "mad-1",
        ),
      ).toBe(false);
      s.corp.clicks = 3;
      const legal2 = queryLegality(s).legal;
      expect(
        legal2.some(
          (e) => e.action.type === "play_operation" && e.action.cardId === "mad-1",
        ),
      ).toBe(true);
      s = must(s, { type: "play_operation", cardId: "mad-1" });
      expect(s.corp.clicks).toBe(0);
    });
  });

  describe("MS Big Deal place_advancements thenMayScore + rfg_self", () => {
    it("validates Big Deal effect tree", () => {
      const tree = fx.placeAdvancements(4, false, {
        thenMayScore: true,
        then: fx.rfgSelf(),
      });
      expect(validateEffectTree(tree)).toBeNull();
    });

    it("places 4, offers score when able, RFGs source; action phase ends after the choice", () => {
      let s = createInitialState();
      s = structuredClone(s);
      s.timingKey = "corp.takeAction";
      s.activeSide = "corp";
      s.corp.clicks = 2;
      s.corp.credits = 20;
      const remote = "remote-1" as ServerId;
      s.servers[remote] = { id: remote, kind: "remote", ice: [], root: [] };
      const agenda = instantiateCard(
        "hostile-takeover",
        "ag-1",
        `server:${remote}:root`,
      );
      // Hostile Takeover is 2/1 — place 4 so it's scorable from 0.
      agenda.advancementCounters = 0;
      s.cards["ag-1"] = agenda;
      s.servers[remote].root = ["ag-1"];

      const op = instantiateCard("hedge-fund", "bd-1", "corp:hq");
      op.playCost = 17;
      op.endsActionPhase = true;
      op.onPlay = fx.placeAdvancements(4, false, {
        thenMayScore: true,
        then: fx.rfgSelf(),
      });
      s.cards["bd-1"] = op;
      s.corp.hand = ["bd-1"];
      s.corp.credits = 20;

      s = must(s, { type: "play_operation", cardId: "bd-1" });
      expect(s.cards["ag-1"].advancementCounters).toBe(4);
      expect(s.pendingChoice).not.toBeNull();
      expect(s.corp.clicks).toBe(1);
      // Still in Archives until RFG runs after choice.
      expect(s.corp.discardPile).toContain("bd-1");

      s = must(s, { type: "choose_option", optionId: "score:ag-1" });
      expect(s.corp.clicks).toBe(0);
      expect(s.corp.scoreArea).toContain("ag-1");
      expect(s.cards["bd-1"].zone).toBe("removed-from-game");
      expect(s.corp.discardPile).not.toContain("bd-1");
    });

    it("RFGs even when scoring declined", () => {
      let s = createInitialState();
      s = structuredClone(s);
      const remote = "remote-1" as ServerId;
      s.servers[remote] = { id: remote, kind: "remote", ice: [], root: [] };
      const agenda = instantiateCard(
        "hostile-takeover",
        "ag-2",
        `server:${remote}:root`,
      );
      agenda.advancementCounters = 0;
      s.cards["ag-2"] = agenda;
      s.servers[remote].root = ["ag-2"];
      const op = instantiateCard("hedge-fund", "bd-2", "corp:archives");
      s.cards["bd-2"] = op;
      s.corp.discardPile = ["bd-2"];

      const r = evalEffect(
        { state: s, sourceId: "bd-2" },
        fx.placeAdvancements(4, false, {
          thenMayScore: true,
          then: fx.rfgSelf(),
        }),
      );
      expect(r.ok).toBe(true);
      expect(s.pendingChoice).not.toBeNull();
      s = must(s, { type: "choose_option", optionId: "decline" });
      expect(s.corp.scoreArea).not.toContain("ag-2");
      expect(s.cards["ag-2"].advancementCounters).toBe(4);
      expect(s.cards["bd-2"].zone).toBe("removed-from-game");
    });
  });

  describe("MS card wiring (Backroom / MAD / Big Deal)", () => {
    it("wires cleared ops with empty unsupported", () => {
      const br = getCardDef("backroom-machinations");
      expect(br.unsupported).toEqual([]);
      expect(br.playRequiresTagged).toBe(true);
      expect(br.playAdditionalCost).toEqual(fx.removeTags(1));
      expect(br.onPlay).toEqual(fx.scoreSelfAsAgenda(1));
      expect(br.agendaPoints).toBe(1);

      const mad = getCardDef("mutually-assured-destruction");
      expect(mad.unsupported).toEqual([]);
      expect(mad.playAdditionalClicks).toBe(2);
      expect(mad.onPlay).toEqual(fx.trashAnyRezzedGiveTags());

      const bd = getCardDef("big-deal");
      expect(bd.unsupported).toEqual([]);
      expect(bd.endsActionPhase).toBe(true);
      expect(bd.onPlay).toEqual(
        fx.placeAdvancements(4, false, {
          thenMayScore: true,
          then: fx.rfgSelf(),
        }),
      );
    });
  });
  });

  describe("midnight-sun-bathynomus", () => {
  beforeAll(() => {
    if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
    if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
    assertPinnedTag("v26.03");
    assertCardsPinnedTag("v1.147.6");
  });

  function must(
    state: ReturnType<typeof createInitialState>,
    action: Parameters<typeof applyAction>[1],
  ) {
    const r = applyAction(state, action);
    if (!r.ok) throw new Error(`${r.error} ${JSON.stringify(r.cites)}`);
    return r.state;
  }

  describe("MS strengthBonusProtectingArchives (always)", () => {
    it("adds printed strength plus bonus while on Archives ice", () => {
      let s = createInitialState();
      s = structuredClone(s);
      const bath = instantiateCard("bathynomus", "bath-1", "server:archives:ice");
      bath.strengthBonusProtectingArchives = 3;
      bath.unsupported = [];
      s.cards["bath-1"] = bath;
      s.servers.archives.ice = ["bath-1"];

      expect(effectiveIceStrength(s, "bath-1")).toBe(1 + 3);
    });

    it("does not apply bonus while protecting HQ or a remote", () => {
      let s = createInitialState();
      s = structuredClone(s);
      const onHq = instantiateCard("bathynomus", "bath-hq", "server:hq:ice");
      onHq.strengthBonusProtectingArchives = 3;
      s.cards["bath-hq"] = onHq;
      s.servers.hq.ice = ["bath-hq"];
      expect(effectiveIceStrength(s, "bath-hq")).toBe(1);

      const remote = instantiateCard(
        "bathynomus",
        "bath-remote",
        "server:remote-1:ice",
      );
      remote.strengthBonusProtectingArchives = 3;
      s.cards["bath-remote"] = remote;
      s.servers["remote-1"] = {
        id: "remote-1",
        kind: "remote",
        ice: ["bath-remote"],
        root: [],
      };
      expect(effectiveIceStrength(s, "bath-remote")).toBe(1);
    });

    it("scales with N when field is not 3", () => {
      let s = createInitialState();
      s = structuredClone(s);
      const bath = instantiateCard("bathynomus", "bath-n", "server:archives:ice");
      bath.strengthBonusProtectingArchives = 5;
      s.cards["bath-n"] = bath;
      s.servers.archives.ice = ["bath-n"];
      expect(effectiveIceStrength(s, "bath-n")).toBe(1 + 5);
    });

    it("stacks with encounter fortify boosts", () => {
      let s = createInitialState();
      s = structuredClone(s);
      const bath = instantiateCard(
        "bathynomus",
        "bath-boost",
        "server:archives:ice",
      );
      bath.strengthBonusProtectingArchives = 3;
      s.cards["bath-boost"] = bath;
      s.servers.archives.ice = ["bath-boost"];
      s.run = {
        attackedServerId: "archives",
        position: 0,
        phase: "encounter",
        successful: null,
        accessedCardIds: [],
        accessCandidates: [],
        randomAccessLimit: null,
        endedTheRun: false,
        cannotJackOut: false,
        strengthBoosts: {},
        encounterStrengthBoosts: {},
        iceStrengthBoosts: { "bath-boost": 2 },
        accessingCardId: null,
        encounter: {
          iceId: "bath-boost",
          broken: [false],
        },
      };
      // 1 printed + 3 Archives + 2 fortify
      expect(effectiveIceStrength(s, "bath-boost")).toBe(6);
    });

    it("does not fire Palisade remote bonus when only Archives field is set", () => {
      let s = createInitialState();
      s = structuredClone(s);
      const bath = instantiateCard(
        "bathynomus",
        "bath-no-remote",
        "server:remote-1:ice",
      );
      bath.strengthBonusProtectingArchives = 3;
      s.cards["bath-no-remote"] = bath;
      s.servers["remote-1"] = {
        id: "remote-1",
        kind: "remote",
        ice: ["bath-no-remote"],
        root: [],
      };
      expect(effectiveIceStrength(s, "bath-no-remote")).toBe(1);
    });
  });

  describe("MS Bathynomus card wiring (v0.31.0+)", () => {
    it("Bathynomus clears unsupported with strengthBonusProtectingArchives", () => {
      const def = getCardDef("bathynomus");
      expect(def.unsupported).toEqual([]);
      expect(def.strengthBonusProtectingArchives).toBe(3);
      expect(def.strength).toBe(1);
      expect(def.rezCost).toBe(3);
      expect(def.subtypes).toEqual(["sentry", "ap"]);
      expect(def.subroutines).toHaveLength(1);
      expect(def.subroutines![0].effect).toEqual(fx.netDamage(3));
    });

    it("Archives Bathynomus requires higher breaker strength than HQ copy", () => {
      let s = createInitialState();
      s = structuredClone(s);
      const bath = instantiateCard("bathynomus", "bath-enc", "server:archives:ice");
      bath.rezzed = true;
      bath.faceup = true;
      s.cards["bath-enc"] = bath;
      s.servers.archives.ice = ["bath-enc"];

      const breaker = instantiateCard("mimic", "br-1", "runner:installed");
      // Mimic printed strength 3; Archives Bathynomus is 4 — needs boost.
      s.cards["br-1"] = breaker;
      s.runner.installed = ["br-1"];
      s.runner.credits = 10;
      s.runner.clicks = 4;
      s.activeSide = "runner";
      s.timingKey = "runner.takeAction";

      expect(getCardDef("bathynomus").strengthBonusProtectingArchives).toBe(3);
      expect(effectiveIceStrength(s, "bath-enc")).toBe(4);

      s = must(s, { type: "basic_run", serverId: "archives" });
      s = structuredClone(s);
      s.run!.phase = "encounter";
      s.run!.encounter = {
        iceId: "bath-enc",
        broken: [false],
      };
      s.timingKey = "run.encounterPaw";

      const legalBefore = queryLegality(s).legal;
      const breaksBefore = legalBefore.filter(
        (e) =>
          e.action.type === "break_subroutine" &&
          e.action.breakerId === "br-1",
      );
      expect(breaksBefore.length).toBe(0);

      s.run!.strengthBoosts["br-1"] = 1;
      const legalAfter = queryLegality(s).legal;
      const breaksAfter = legalAfter.filter(
        (e) =>
          e.action.type === "break_subroutine" &&
          e.action.breakerId === "br-1",
      );
      expect(breaksAfter.length).toBeGreaterThan(0);
    });
  });
  });

  describe("midnight-sun-begemot", () => {
  beforeAll(() => {
    if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
    if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
    assertPinnedTag("v26.03");
    assertCardsPinnedTag("v1.147.6");
  });

  function must(
    state: ReturnType<typeof createInitialState>,
    action: Parameters<typeof applyAction>[1],
  ) {
    const r = applyAction(state, action);
    if (!r.ok) throw new Error(`${r.error} ${JSON.stringify(r.cites)}`);
    return r.state;
  }

  describe("MS strengthBonusPerCoreDamageThisGame (always)", () => {
    it("adds printed strength plus bonus × core damage taken this game", () => {
      let s = createInitialState();
      s = structuredClone(s);
      const beg = instantiateCard("begemot", "beg-1", "runner:installed");
      beg.strengthBonusPerCoreDamageThisGame = 1;
      beg.unsupported = [];
      s.cards["beg-1"] = beg;
      s.runner.installed = ["beg-1"];
      s.runner.coreDamage = 0;

      expect(effectiveBreakerStrength(s, "beg-1")).toBe(2);

      s.runner.coreDamage = 3;
      expect(effectiveBreakerStrength(s, "beg-1")).toBe(5);
    });

    it("scales with N when field is not 1", () => {
      let s = createInitialState();
      s = structuredClone(s);
      const beg = instantiateCard("begemot", "beg-2", "runner:installed");
      beg.strengthBonusPerCoreDamageThisGame = 2;
      s.cards["beg-2"] = beg;
      s.runner.installed = ["beg-2"];
      s.runner.coreDamage = 2;
      expect(effectiveBreakerStrength(s, "beg-2")).toBe(2 + 4);
    });

    it("install onInstall core_damage increases strength via the counter", () => {
      let s = createInitialState();
      s = structuredClone(s);
      // Grip fillers so core damage does not flatline
      for (let i = 0; i < 3; i++) {
        const id = `filler-${i}`;
        const c = instantiateCard("sure-gamble", id, "runner:grip");
        s.cards[id] = c;
        s.runner.hand.push(id);
      }
      const beg = instantiateCard("begemot", "beg-inst", "runner:grip");
      beg.onInstall = fx.coreDamage(1);
      beg.strengthBonusPerCoreDamageThisGame = 1;
      beg.unsupported = [];
      beg.installCost = 0;
      s.cards["beg-inst"] = beg;
      s.runner.hand.push("beg-inst");
      s.runner.credits = 10;
      s.runner.clicks = 4;
      s.runner.coreDamage = 1; // prior core damage this game
      s.activeSide = "runner";
      s.timingKey = "runner.takeAction";

      expect(effectiveBreakerStrength(s, "beg-inst")).toBe(3); // 2 + 1 prior

      s = must(s, {
        type: "basic_install",
        cardId: "beg-inst",
        destination: { kind: "installed" },
      });
      expect(s.runner.coreDamage).toBe(2); // prior + onInstall
      expect(s.runner.installed).toContain("beg-inst");
      expect(effectiveBreakerStrength(s, "beg-inst")).toBe(4); // 2 + 2 CD
    });

    it("dealDamage(core) raises strength for an installed Begemot-shaped breaker", () => {
      let s = createInitialState();
      s = structuredClone(s);
      for (let i = 0; i < 2; i++) {
        const id = `g-${i}`;
        const c = instantiateCard("sure-gamble", id, "runner:grip");
        s.cards[id] = c;
        s.runner.hand.push(id);
      }
      const beg = instantiateCard("begemot", "beg-dmg", "runner:installed");
      beg.strengthBonusPerCoreDamageThisGame = 1;
      s.cards["beg-dmg"] = beg;
      s.runner.installed = ["beg-dmg"];
      s.runner.coreDamage = 0;

      dealDamage(s, "core", 1, "test");
      expect(s.runner.coreDamage).toBe(1);
      expect(effectiveBreakerStrength(s, "beg-dmg")).toBe(3);
    });

    it("pump + strengthBonusPerCoreDamageThisGame stack", () => {
      let s = createInitialState();
      s = structuredClone(s);
      const beg = instantiateCard("begemot", "beg-pump", "runner:installed");
      beg.strengthBonusPerCoreDamageThisGame = 1;
      s.cards["beg-pump"] = beg;
      s.runner.installed = ["beg-pump"];
      s.runner.coreDamage = 2;
      s.run = {
        attackedServerId: "hq",
        position: 0,
        phase: "encounter",
        successful: null,
        accessedCardIds: [],
        accessCandidates: [],
        randomAccessLimit: null,
        endedTheRun: false,
        cannotJackOut: false,
        strengthBoosts: { "beg-pump": 1 },
        encounterStrengthBoosts: {},
        iceStrengthBoosts: {},
        accessingCardId: null,
        encounter: {
          iceId: "ice-1",
          broken: [],
        },
      };
      // 2 printed + 2 CD + 1 run boost
      expect(effectiveBreakerStrength(s, "beg-pump")).toBe(5);
    });
  });

  describe("MS Begemot card wiring (v0.31.0+)", () => {
    it("Begemot clears unsupported with strengthBonusPerCoreDamageThisGame", () => {
      const def = getCardDef("begemot");
      expect(def.unsupported).toEqual([]);
      expect(def.strengthBonusPerCoreDamageThisGame).toBe(1);
      expect(def.onInstall).toEqual(fx.coreDamage(1));
      expect(def.breaker?.breaksSubtype).toBe("barrier");
      expect(def.breaker?.breakMaxSubs).toBe(99);
      expect(def.breaker?.breakCredits).toBe(1);
      expect(def.breaker?.strength).toBe(2);
      expect(def.memoryCost).toBe(2);
    });

    it("effective strength from card wiring meets ice after core damage", () => {
      let s = createInitialState();
      s = structuredClone(s);
      const beg = instantiateCard("begemot", "beg-enc", "runner:installed");
      s.cards["beg-enc"] = beg;
      s.runner.installed = ["beg-enc"];
      s.runner.coreDamage = 2; // printed 2 + 2 CD = 4
      expect(getCardDef("begemot").strengthBonusPerCoreDamageThisGame).toBe(1);
      expect(effectiveBreakerStrength(s, "beg-enc")).toBe(4);
    });
  });
  });

  describe("midnight-sun-blood-in-the-water", () => {
  beforeAll(() => {
    if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
    if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
    assertPinnedTag("v26.03");
    assertCardsPinnedTag("v1.147.6");
  });

  function must(
    state: ReturnType<typeof createInitialState>,
    action: Parameters<typeof applyAction>[1],
  ) {
    const r = applyAction(state, action);
    if (!r.ok) throw new Error(`${r.error} ${JSON.stringify(r.cites)}`);
    return r.state;
  }

  describe("MS advancementRequirementEqualsRunnerGrip (Blood in the Water)", () => {
    it("canScore when advancements >= Runner grip size", () => {
      let s = createInitialState();
      s = structuredClone(s);
      const remote = "remote-1" as ServerId;
      s.servers[remote] = { id: remote, kind: "remote", ice: [], root: [] };
      const agenda = instantiateCard(
        "blood-in-the-water",
        "bitw-1",
        `server:${remote}:root`,
      );
      agenda.advancementRequirementEqualsRunnerGrip = true;
      agenda.advancementCounters = 2;
      agenda.unsupported = [];
      s.cards["bitw-1"] = agenda;
      s.servers[remote].root = ["bitw-1"];
      s.runner.hand = ["r1", "r2"];
      for (const id of s.runner.hand) {
        s.cards[id] = instantiateCard("sure-gamble", id, "runner:grip");
      }
      expect(canScoreAgenda(s, agenda)).toBe(true);

      s.runner.hand.push("r3");
      s.cards["r3"] = instantiateCard("sure-gamble", "r3", "runner:grip");
      expect(canScoreAgenda(s, agenda)).toBe(false);
    });

    it("scores when counters meet dynamic requirement", () => {
      let s = createInitialState();
      s = structuredClone(s);
      const remote = "remote-1" as ServerId;
      s.servers[remote] = { id: remote, kind: "remote", ice: [], root: [] };
      const agenda = instantiateCard(
        "blood-in-the-water",
        "bitw-1",
        `server:${remote}:root`,
      );
      agenda.advancementRequirementEqualsRunnerGrip = true;
      agenda.advancementCounters = 1;
      agenda.unsupported = [];
      s.cards["bitw-1"] = agenda;
      s.servers[remote].root = ["bitw-1"];
      s.runner.hand = ["r1"];
      s.cards["r1"] = instantiateCard("sure-gamble", "r1", "runner:grip");
      s.corp.clicks = 3;
      s.activeSide = "corp";
      s.timingKey = "corp.actionPaw";
      const id = s.cards[s.corp.identityId];
      if (id) delete id.onAgendaScored;

      const legal = queryLegality(s).legal;
      expect(
        legal.some(
          (e) => e.action.type === "score_agenda" && e.action.cardId === "bitw-1",
        ),
      ).toBe(true);
      s = must(s, { type: "score_agenda", cardId: "bitw-1" });
      expect(s.corp.scoreArea).toContain("bitw-1");
    });
  });
  });

  describe("midnight-sun-cats-cradle", () => {
  beforeAll(() => {
    if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
    if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
    assertPinnedTag("v26.03");
    assertCardsPinnedTag("v1.147.6");
  });

  function must(
    state: ReturnType<typeof createInitialState>,
    action: Parameters<typeof applyAction>[1],
  ) {
    const r = applyAction(state, action);
    if (!r.ok) throw new Error(`${r.error} ${JSON.stringify(r.cites)}`);
    return r.state;
  }

  /** Approach PAW with unrezzed ice on a remote; Runner has Cat's Cradle installed. */
  function approachWithCatsCradle(
    iceDefId: string,
    cradleField: { subtype: string; amount: number },
  ) {
    let s = createInitialState();
    s = structuredClone(s);
    const ice = instantiateCard(iceDefId, "ice-1", "server:remote-1:ice");
    s.cards["ice-1"] = ice;
    s.servers["remote-1"] = {
      id: "remote-1",
      kind: "remote",
      ice: ["ice-1"],
      root: [],
    };

    const cradle = instantiateCard("cats-cradle", "cc-1", "runner:installed");
    cradle.iceRezCostIncreaseBySubtype = { ...cradleField };
    cradle.unsupported = [];
    s.cards["cc-1"] = cradle;
    s.runner.installed = ["cc-1"];
    s.runner.credits = 10;
    s.runner.clicks = 4;
    s.corp.credits = 20;
    s.activeSide = "runner";
    s.timingKey = "runner.takeAction";

    s = must(s, { type: "basic_run", serverId: "remote-1" as ServerId });
    return s;
  }

  describe("MS iceRezCostIncreaseBySubtype (always)", () => {
    it("sums subtype-filtered increase for matching ice", () => {
      let s = createInitialState();
      s = structuredClone(s);
      const ice = instantiateCard("enigma", "ice-1", "server:hq:ice");
      s.cards["ice-1"] = ice;
      s.servers.hq.ice = ["ice-1"];

      const cradle = instantiateCard("cats-cradle", "cc-1", "runner:installed");
      cradle.iceRezCostIncreaseBySubtype = {
        subtype: "code gate",
        amount: 1,
      };
      s.cards["cc-1"] = cradle;
      s.runner.installed = ["cc-1"];

      expect(continuousIceRezCostIncrease(s, "ice-1")).toBe(1);
    });

    it("does not apply when ice lacks the subtype", () => {
      let s = createInitialState();
      s = structuredClone(s);
      const ice = instantiateCard("ice-wall", "ice-1", "server:hq:ice");
      s.cards["ice-1"] = ice;
      s.servers.hq.ice = ["ice-1"];

      const cradle = instantiateCard("cats-cradle", "cc-1", "runner:installed");
      cradle.iceRezCostIncreaseBySubtype = {
        subtype: "code gate",
        amount: 1,
      };
      s.cards["cc-1"] = cradle;
      s.runner.installed = ["cc-1"];

      expect(continuousIceRezCostIncrease(s, "ice-1")).toBe(0);
    });

    it("ignores subtype filter on cards not in the installed area", () => {
      let s = createInitialState();
      s = structuredClone(s);
      const ice = instantiateCard("enigma", "ice-1", "server:hq:ice");
      s.cards["ice-1"] = ice;
      s.servers.hq.ice = ["ice-1"];

      const cradle = instantiateCard("cats-cradle", "cc-heap", "runner:heap");
      cradle.iceRezCostIncreaseBySubtype = {
        subtype: "code gate",
        amount: 1,
      };
      s.cards["cc-heap"] = cradle;
      s.runner.discardPile.push("cc-heap");

      expect(continuousIceRezCostIncrease(s, "ice-1")).toBe(0);
    });

    it("stacks with flat iceRezCostIncrease (Xanadu-class)", () => {
      let s = createInitialState();
      s = structuredClone(s);
      const ice = instantiateCard("enigma", "ice-1", "server:hq:ice");
      s.cards["ice-1"] = ice;
      s.servers.hq.ice = ["ice-1"];

      const cradle = instantiateCard("cats-cradle", "cc-1", "runner:installed");
      cradle.iceRezCostIncreaseBySubtype = {
        subtype: "code gate",
        amount: 1,
      };
      s.cards["cc-1"] = cradle;

      const xanadu = instantiateCard("xanadu", "xa-1", "runner:installed");
      xanadu.iceRezCostIncrease = 1;
      s.cards["xa-1"] = xanadu;
      s.runner.installed = ["cc-1", "xa-1"];

      expect(continuousIceRezCostIncrease(s, "ice-1")).toBe(2);

      const barrier = instantiateCard("ice-wall", "ice-2", "server:rd:ice");
      s.cards["ice-2"] = barrier;
      s.servers.rd.ice = ["ice-2"];
      expect(continuousIceRezCostIncrease(s, "ice-2")).toBe(1);
    });

    it("stacks multiple installed subtype filters", () => {
      let s = createInitialState();
      s = structuredClone(s);
      const ice = instantiateCard("enigma", "ice-1", "server:hq:ice");
      s.cards["ice-1"] = ice;
      s.servers.hq.ice = ["ice-1"];

      for (const id of ["cc-a", "cc-b"] as const) {
        const cradle = instantiateCard("cats-cradle", id, "runner:installed");
        cradle.iceRezCostIncreaseBySubtype = {
          subtype: "code gate",
          amount: 1,
        };
        s.cards[id] = cradle;
        s.runner.installed.push(id);
      }
      expect(continuousIceRezCostIncrease(s, "ice-1")).toBe(2);
    });

    it("rezzes code gate paying base+1 with Cat's Cradle installed", () => {
      let s = approachWithCatsCradle("enigma", {
        subtype: "code gate",
        amount: 1,
      });
      const base = s.cards["ice-1"].rezCost ?? 0;
      expect(base).toBe(3);
      const before = s.corp.credits;
      s = must(s, { type: "rez_ice", cardId: "ice-1" });
      expect(s.corp.credits).toBe(before - (base + 1));
      expect(s.log.some((l) => /rezzes Enigma for 4¢ \(base 3\+1\)/.test(l))).toBe(
        true,
      );
    });

    it("does not inflate barrier rez when only code-gate filter is installed", () => {
      let s = approachWithCatsCradle("ice-wall", {
        subtype: "code gate",
        amount: 1,
      });
      const base = s.cards["ice-1"].rezCost ?? 0;
      const before = s.corp.credits;
      s = must(s, { type: "rez_ice", cardId: "ice-1" });
      expect(s.corp.credits).toBe(before - base);
    });

    it("legality omits rez when Corp cannot afford subtype-inflated cost", () => {
      let s = approachWithCatsCradle("enigma", {
        subtype: "code gate",
        amount: 1,
      });
      // Enigma 3 + 1 = 4; leave Corp with only 3¢
      s = structuredClone(s);
      s.corp.credits = 3;
      const legal = queryLegality(s);
      expect(
        legal.legal.some(
          (e) => e.action.type === "rez_ice" && e.action.cardId === "ice-1",
        ),
      ).toBe(false);

      const r = applyAction(s, { type: "rez_ice", cardId: "ice-1" });
      expect(r.ok).toBe(false);
    });
  });

  describe("MS Cat's Cradle card wiring (v0.31.0+)", () => {
    it("Cat's Cradle clears unsupported with iceRezCostIncreaseBySubtype", () => {
      const def = getCardDef("cats-cradle");
      expect(def.unsupported).toEqual([]);
      expect(def.iceRezCostIncreaseBySubtype).toEqual({
        subtype: "code gate",
        amount: 1,
      });
      expect(def.type).toBe("program");
      expect(def.breaker?.breaksSubtype).toBe("code gate");
      expect(def.installCost).toBe(2);
      expect(def.strength).toBe(1);
      expect(def.memoryCost).toBe(1);
    });
  });
  });

  describe("midnight-sun-cezve", () => {
  beforeAll(() => {
    if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
    if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
    assertPinnedTag("v26.03");
    assertCardsPinnedTag("v1.147.6");
  });

  function must(
    state: ReturnType<typeof createInitialState>,
    action: Parameters<typeof applyAction>[1],
  ) {
    const r = applyAction(state, action);
    if (!r.ok) throw new Error(`${r.error} ${JSON.stringify(r.cites)}`);
    return r.state;
  }

  function withCezve(opts?: {
    server?: ServerId;
    bank?: number;
    pool?: number;
    inRun?: boolean;
  }) {
    let s = createInitialState();
    s = structuredClone(s);
    const cezve = instantiateCard("cezve", "cz-1", "runner:installed");
    cezve.recurringCreditsMax = 2;
    cezve.recurringCredits = opts?.pool ?? 2;
    cezve.recurringSpendFor = ["run_central"];
    cezve.unsupported = [];
    s.cards["cz-1"] = cezve;
    s.runner.installed = ["cz-1"];
    s.runner.credits = opts?.bank ?? 0;
    s.runner.clicks = 4;
    s.activeSide = "runner";
    s.timingKey = "runner.takeAction";

    if (opts?.inRun !== false) {
      const server = opts?.server ?? "hq";
      s.run = {
        attackedServerId: server,
        phase: "encounter",
        position: 0,
        successful: null,
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
    }
    return s;
  }

  describe("MS run_central recurring (always)", () => {
    it("isAttackingCentral only for hq/rd/archives with an active run", () => {
      const s = withCezve({ server: "hq" });
      expect(isAttackingCentral(s)).toBe(true);
      s.run!.attackedServerId = "rd";
      expect(isAttackingCentral(s)).toBe(true);
      s.run!.attackedServerId = "archives";
      expect(isAttackingCentral(s)).toBe(true);
      s.run!.attackedServerId = "remote-1";
      expect(isAttackingCentral(s)).toBe(false);
      s.run = null;
      expect(isAttackingCentral(s)).toBe(false);
    });

    it("includes Cezve pool in runnerAvailableCredits only on central runs", () => {
      let s = withCezve({ bank: 1, pool: 2, server: "hq" });
      expect(recurringCreditsForCentralRun(s)).toBe(2);
      expect(runnerAvailableCredits(s)).toBe(3);

      s.run!.attackedServerId = "remote-1";
      expect(recurringCreditsForCentralRun(s)).toBe(0);
      expect(runnerAvailableCredits(s)).toBe(1);

      s = withCezve({ bank: 1, pool: 2, inRun: false });
      expect(recurringCreditsForCentralRun(s)).toBe(0);
      expect(runnerAvailableCredits(s)).toBe(1);
    });

    it("canPayCost / payCost draw from Cezve on central run, not remote", () => {
      let s = withCezve({ bank: 0, pool: 2, server: "hq" });
      expect(canPayCost(s, "runner", { credits: 2 })).toBe(true);
      payCost(s, "runner", { credits: 2 }, "test:cezve");
      expect(s.cards["cz-1"].recurringCredits).toBe(0);
      expect(s.runner.credits).toBe(0);
      expect(
        s.log.some((l) => /Spend 2¢ from Cezve recurring credits \(run_central\)/.test(l)),
      ).toBe(true);

      s = withCezve({ bank: 0, pool: 2, server: "remote-1" });
      expect(canPayCost(s, "runner", { credits: 1 })).toBe(false);
      expect(s.cards["cz-1"].recurringCredits).toBe(2);
    });

    it("spendRunnerCredits depletes Cezve before the bank on central run", () => {
      const s = withCezve({ bank: 3, pool: 2, server: "rd" });
      spendRunnerCredits(s, 3);
      expect(s.cards["cz-1"].recurringCredits).toBe(0);
      expect(s.runner.credits).toBe(2);
    });

    it("does not spend Cezve outside a run or on a remote", () => {
      let s = withCezve({ bank: 5, pool: 2, inRun: false });
      spendRunnerCredits(s, 2);
      expect(s.cards["cz-1"].recurringCredits).toBe(2);
      expect(s.runner.credits).toBe(3);

      s = withCezve({ bank: 5, pool: 2, server: "remote-1" });
      spendRunnerCredits(s, 2);
      expect(s.cards["cz-1"].recurringCredits).toBe(2);
      expect(s.runner.credits).toBe(3);
    });

    it("runnerCreditsFor trash/play_event includes Cezve only on central", () => {
      let s = withCezve({ bank: 0, pool: 2, server: "archives" });
      expect(runnerCreditsFor(s, "trash")).toBe(2);
      expect(runnerCreditsFor(s, "play_event")).toBe(2);
      spendRunnerCreditsFor(s, 1, "trash");
      expect(s.cards["cz-1"].recurringCredits).toBe(1);

      s = withCezve({ bank: 0, pool: 2, inRun: false });
      expect(runnerCreditsFor(s, "trash")).toBe(0);
      expect(runnerCreditsFor(s, "play_event")).toBe(0);
    });

    it("refills Cezve recurring to max on Runner turn refill", () => {
      const s = withCezve({ pool: 0, inRun: false });
      expect(s.cards["cz-1"].recurringCredits).toBe(0);
      refillRecurringCredits(s, "runner");
      expect(s.cards["cz-1"].recurringCredits).toBe(2);
    });

    it("ignores run_central credits on cards not in the installed area", () => {
      let s = createInitialState();
      s = structuredClone(s);
      const cezve = instantiateCard("cezve", "cz-heap", "runner:heap");
      cezve.recurringCreditsMax = 2;
      cezve.recurringCredits = 2;
      cezve.recurringSpendFor = ["run_central"];
      s.cards["cz-heap"] = cezve;
      s.runner.discardPile.push("cz-heap");
      s.runner.credits = 0;
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
        strengthBoosts: {},
        encounterStrengthBoosts: {},
        iceStrengthBoosts: {},
        accessingCardId: null,
      };
      expect(recurringCreditsForCentralRun(s)).toBe(0);
      expect(runnerAvailableCredits(s)).toBe(0);
    });
  });

  describe("MS Cezve break integration (always)", () => {
    it("breaks Ice Wall on HQ using only Cezve recurring credits", () => {
      let s = createInitialState();
      s = structuredClone(s);
      const ice = instantiateCard("ice-wall", "ice-1", "server:hq:ice");
      s.cards["ice-1"] = ice;
      s.servers.hq.ice = ["ice-1"];

      const breaker = instantiateCard("corroder", "br-1", "runner:installed");
      s.cards["br-1"] = breaker;

      const cezve = instantiateCard("cezve", "cz-1", "runner:installed");
      cezve.recurringCreditsMax = 2;
      cezve.recurringCredits = 2;
      cezve.recurringSpendFor = ["run_central"];
      cezve.unsupported = [];
      s.cards["cz-1"] = cezve;
      s.runner.installed = ["br-1", "cz-1"];
      s.runner.credits = 0;
      s.runner.clicks = 4;
      s.corp.credits = 20;
      s.activeSide = "runner";
      s.timingKey = "runner.takeAction";

      s = must(s, { type: "basic_run", serverId: "hq" as ServerId });
      s = must(s, { type: "rez_ice", cardId: "ice-1" });
      s = must(s, { type: "pass_window" });

      // Corroder: str 2 vs Ice Wall 1; break cost 1¢
      const legal = queryLegality(s);
      expect(
        legal.legal.some(
          (e) =>
            e.action.type === "break_subroutine" &&
            e.action.breakerId === "br-1",
        ),
      ).toBe(true);

      s = must(s, {
        type: "break_subroutine",
        breakerId: "br-1",
        subIndex: 0,
      });
      expect(s.cards["cz-1"].recurringCredits).toBe(1);
      expect(s.runner.credits).toBe(0);
      expect(
        s.log.some((l) => /Spend 1¢ from Cezve recurring credits \(run_central\)/.test(l)),
      ).toBe(true);
    });

    it("cannot break on a remote using only Cezve recurring", () => {
      let s = createInitialState();
      s = structuredClone(s);
      const ice = instantiateCard("ice-wall", "ice-1", "server:remote-1:ice");
      s.cards["ice-1"] = ice;
      s.servers["remote-1"] = {
        id: "remote-1",
        kind: "remote",
        ice: ["ice-1"],
        root: [],
      };

      const breaker = instantiateCard("corroder", "br-1", "runner:installed");
      s.cards["br-1"] = breaker;

      const cezve = instantiateCard("cezve", "cz-1", "runner:installed");
      cezve.recurringCreditsMax = 2;
      cezve.recurringCredits = 2;
      cezve.recurringSpendFor = ["run_central"];
      s.cards["cz-1"] = cezve;
      s.runner.installed = ["br-1", "cz-1"];
      s.runner.credits = 0;
      s.runner.clicks = 4;
      s.corp.credits = 20;
      s.activeSide = "runner";
      s.timingKey = "runner.takeAction";

      s = must(s, { type: "basic_run", serverId: "remote-1" as ServerId });
      s = must(s, { type: "rez_ice", cardId: "ice-1" });
      s = must(s, { type: "pass_window" });

      const legal = queryLegality(s);
      expect(
        legal.legal.some(
          (e) =>
            e.action.type === "break_subroutine" &&
            e.action.breakerId === "br-1",
        ),
      ).toBe(false);

      const r = applyAction(s, {
        type: "break_subroutine",
        breakerId: "br-1",
        subIndex: 0,
      });
      expect(r.ok).toBe(false);
      expect(s.cards["cz-1"].recurringCredits).toBe(2);
    });
  });

  describe("MS Cezve card wiring (v0.31.0+)", () => {
    it("Cezve clears unsupported with run_central recurringSpendFor", () => {
      const def = getCardDef("cezve");
      expect(def.unsupported).toEqual([]);
      expect(def.recurringSpendFor).toEqual(["run_central"]);
      expect(def.recurringCreditsMax).toBe(2);
      expect(def.memoryCost).toBe(1);
      expect(def.installCost).toBe(2);
    });
  });
  });

  describe("midnight-sun-chekist", () => {
  beforeAll(() => {
    if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
    if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
    assertPinnedTag("v26.03");
    assertCardsPinnedTag("v1.147.6");
  });

  function must(
    state: ReturnType<typeof createInitialState>,
    action: Parameters<typeof applyAction>[1],
  ) {
    const r = applyAction(state, action);
    if (!r.ok) throw new Error(`${r.error} ${JSON.stringify(r.cites)}`);
    return r.state;
  }

  function chekistOnAccess(): Effect {
    return fx.giveTagsPerAdvancement(1, 1);
  }

  describe("MS give_tags_per_advancement (Chekist)", () => {
    it("validates give_tags_per_advancement tree", () => {
      expect(validateEffectTree(chekistOnAccess())).toBeNull();
    });

    it("gives base + per×advancement tags from source", () => {
      let s = createInitialState();
      s = structuredClone(s);
      const remote = "remote-1" as ServerId;
      s.servers[remote] = { id: remote, kind: "remote", ice: [], root: [] };
      const card = instantiateCard(
        "chekist-scion",
        "chek-1",
        `server:${remote}:root`,
      );
      card.advancementCounters = 2;
      card.onAccess = chekistOnAccess();
      s.cards["chek-1"] = card;
      s.servers[remote].root = ["chek-1"];
      s.runner.tags = 0;

      const r = evalEffect({ state: s, sourceId: "chek-1" }, chekistOnAccess());
      expect(r.ok).toBe(true);
      expect(s.runner.tags).toBe(3); // 1 + 2
    });

    it("onAccess during remote breach tags the Runner", () => {
      let s = createInitialState();
      s = structuredClone(s);
      const remote = "remote-1" as ServerId;
      s.servers[remote] = { id: remote, kind: "remote", ice: [], root: [] };
      const card = instantiateCard(
        "chekist-scion",
        "chek-1",
        `server:${remote}:root`,
      );
      card.rezzed = false;
      card.faceup = false;
      card.canAdvance = true;
      card.advancementCounters = 1;
      card.onAccess = chekistOnAccess();
      card.unsupported = [];
      s.cards["chek-1"] = card;
      s.servers[remote].root = ["chek-1"];
      s.runner.tags = 0;
      s.activeSide = "runner";
      // Mid-breach access window.
      s.timingKey = "breach.awaitAccess";
      s.run = {
        attackedServerId: remote,
        phase: "breach",
        position: null,
        successful: true,
        accessedCardIds: [],
        accessCandidates: ["chek-1"],
        randomAccessLimit: null,
        encounter: null,
        endedTheRun: false,
        cannotJackOut: false,
        strengthBoosts: {},
        encounterStrengthBoosts: {},
        iceStrengthBoosts: {},
        accessingCardId: null,
      };

      s = must(s, { type: "access_card", cardId: "chek-1" });
      expect(s.runner.tags).toBe(2); // 1 + 1 advancement
      expect(s.log.some((l) => /tag/i.test(l))).toBe(true);
    });

    it("Chekist card wiring is fully clear on pin v0.33.0", () => {
      const def = getCardDef("chekist-scion");
      expect(def.unsupported ?? []).toEqual([]);
      expect(def.onAccess).toEqual({
        op: "do",
        action: {
          kind: "give_tags",
          amount: 0,
          tally: {
            count: "source_advancement_counters",
            per: 1,
            side: "source",
            base: 1,
          },
        },
      });
    });
  });
  });

  describe("midnight-sun-core-damage", () => {
  beforeAll(() => {
    if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
    if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
    assertPinnedTag("v26.03");
    assertCardsPinnedTag("v1.147.6");
  });

  function must(
    state: ReturnType<typeof createInitialState>,
    action: Parameters<typeof applyAction>[1],
  ) {
    const r = applyAction(state, action);
    if (!r.ok) throw new Error(`${r.error} ${JSON.stringify(r.cites)}`);
    return r.state;
  }

  function assertEsaWired(): void {
    const esa = getCardDef("esa-afontov-eco-insurrectionist");
    expect(esa.unsupported).toEqual([]);
    expect(esa.onFirstCoreDamageThisTurn).toBeTruthy();
  }

  describe("MS core-damage IR (always)", () => {
    it("accepts core_damage and brain_damage Effect IR", () => {
      expect(validateEffectTree(fx.coreDamage(1))).toBeNull();
      expect(validateEffectTree(fx.coreDamage(1))).toBeNull();
      expect(isCoreDamageType("core")).toBe(true);
      expect(isCoreDamageType("brain")).toBe(true);
      expect(isCoreDamageType("net")).toBe(false);
      expect(CR.coreDamage.id).toBe("rule_core_damage");
      expect(CR.brainDamage.id).toBe("rule_brain_damage");
    });

    it("core_damage and brain_damage both reduce max hand and trash grip", () => {
      let s = createInitialState();
      s = structuredClone(s);
      // Fill grip so damage does not flatline
      for (let i = 0; i < 4; i++) {
        const id = `filler-${i}`;
        s.cards[id] = instantiateCard("sure-gamble", id, "runner:grip");
        s.runner.hand.push(id);
      }
      const beforeHand = s.runner.hand.length;
      const r = evalEffect(
        { state: s, sourceId: s.corp.identityId },
        fx.coreDamage(1),
      );
      expect(r.ok).toBe(true);
      expect(s.runner.coreDamage).toBe(1);
      expect(s.runner.maxHandSize).toBe(4);
      expect(s.runner.hand.length).toBe(beforeHand - 1);
      expect(s.turn.coreDamageSufferedThisTurn).toBe(1);

      const r2 = evalEffect(
        { state: s, sourceId: s.corp.identityId },
        fx.coreDamage(1),
      );
      expect(r2.ok).toBe(true);
      expect(s.runner.coreDamage).toBe(2);
      expect(s.turn.coreDamageSufferedThisTurn).toBe(2);
    });

    it("onFirstCoreDamageThisTurn fires once per turn (synthetic Esâ)", () => {
      let s = createInitialState();
      s = structuredClone(s);
      for (let i = 0; i < 5; i++) {
        const id = `grip-${i}`;
        s.cards[id] = instantiateCard("sure-gamble", id, "runner:grip");
        s.runner.hand.push(id);
      }
      const stackTop = s.runner.deck[0];
      expect(stackTop).toBeTruthy();

      const id = s.cards[s.runner.identityId]!;
      id.onFirstCoreDamageThisTurn = {
        op: "choose",
        chooser: "runner",
        options: [
          {
            id: "draw-sabotage",
            label: "Draw 1 and sabotage 2",
            effect: fx.seq(fx.draw("runner", 1), fx.sabotage(2, true)),
          },
          { id: "decline", label: "Decline", effect: fx.seq() },
        ],
      };

      dealDamage(s, "core", 1, "test-source");
      expect(s.pendingChoice?.chooser).toBe("runner");
      expect(s.pendingChoice?.options.map((o) => o.id)).toEqual(
        expect.arrayContaining(["draw-sabotage", "decline"]),
      );

      s = must(s, { type: "choose_option", optionId: "draw-sabotage" });
      expect(s.runner.hand).toContain(stackTop);
      expect(s.pendingSabotage?.amount).toBe(2);

      // Corp resolves sabotage (empty HQ → all from R&D)
      s.corp.hand = [];
      s = must(s, { type: "resolve_sabotage", hqCardIds: [] });
      expect(s.pendingSabotage).toBeNull();

      const bd = s.runner.coreDamage;
      const handLen = s.runner.hand.length;
      dealDamage(s, "core", 1, "test-source-2");
      expect(s.runner.coreDamage).toBe(bd + 1);
      expect(s.runner.hand.length).toBe(handLen - 1);
      // Second core damage this turn: no new choice
      expect(s.pendingChoice).toBeNull();
    });

    it("decline path skips draw and sabotage", () => {
      let s = createInitialState();
      s = structuredClone(s);
      for (let i = 0; i < 3; i++) {
        const id = `g-${i}`;
        s.cards[id] = instantiateCard("sure-gamble", id, "runner:grip");
        s.runner.hand.push(id);
      }
      const id = s.cards[s.runner.identityId]!;
      id.onFirstCoreDamageThisTurn = {
        op: "choose",
        chooser: "runner",
        options: [
          {
            id: "draw-sabotage",
            label: "Draw 1 and sabotage 2",
            effect: fx.seq(fx.draw("runner", 1), fx.sabotage(2, true)),
          },
          { id: "decline", label: "Decline", effect: fx.seq() },
        ],
      };
      const handBefore = s.runner.hand.length;
      dealDamage(s, "brain", 1, "alias-source");
      expect(s.pendingChoice).toBeTruthy();
      s = must(s, { type: "choose_option", optionId: "decline" });
      expect(s.pendingSabotage).toBeNull();
      // One trash from damage; no draw
      expect(s.runner.hand.length).toBe(handBefore - 1);
    });
  });

  describe("MS Esâ card JSON", () => {
    it("Esâ wires onFirstCoreDamageThisTurn with may draw+sabotage", () => {
      assertEsaWired();
      const esa = getCardDef("esa-afontov-eco-insurrectionist");
      expect(esa.unsupported).toEqual([]);
      expect(esa.onFirstCoreDamageThisTurn).toBeTruthy();
      expect(validateEffectTree(esa.onFirstCoreDamageThisTurn!)).toBeNull();

      let s = createInitialState();
      s = structuredClone(s);
      const live = instantiateCard(
        "esa-afontov-eco-insurrectionist",
        "esa-live",
        "runner:identity",
      );
      s.cards["esa-live"] = live;
      s.runner.identityId = "esa-live";
      for (let i = 0; i < 4; i++) {
        const id = `h-${i}`;
        s.cards[id] = instantiateCard("sure-gamble", id, "runner:grip");
        s.runner.hand.push(id);
      }
      dealDamage(s, "core", 1, "hakarl");
      expect(s.pendingChoice?.options.map((o) => o.id)).toEqual(
        expect.arrayContaining(["draw-sabotage", "decline"]),
      );
    });
  });
  });

  describe("midnight-sun-deep-dive", () => {
  beforeAll(() => {
    if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
    if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
    assertPinnedTag("v26.03");
    assertCardsPinnedTag("v1.147.6");
  });

  describe("MS deep_dive_resolve", () => {
    it("validates deep_dive_resolve tree", () => {
      expect(validateEffectTree(fx.deepDiveResolve(8, 1))).toBeNull();
    });

    it("sets aside R&D, accesses, steals agenda, shuffles remainder", () => {
      let s = createInitialState();
      s = structuredClone(s);
      s.runner.clicks = 0;
      const agenda = instantiateCard("hostile-takeover", "ag-1", "corp:rd");
      const filler = instantiateCard("hedge-fund", "f-1", "corp:rd");
      const filler2 = instantiateCard("hedge-fund", "f-2", "corp:rd");
      s.cards["ag-1"] = agenda;
      s.cards["f-1"] = filler;
      s.cards["f-2"] = filler2;
      s.corp.deck = ["ag-1", "f-1", "f-2"];
      const src = instantiateCard("jailbreak", "dd-1", "runner:heap");
      s.cards["dd-1"] = src;

      const r = evalEffect(
        { state: s, sourceId: "dd-1" },
        fx.deepDiveResolve(8, 1),
      );
      expect(r.ok).toBe(true);
      expect(s.runner.scoreArea).toContain("ag-1");
      expect(agendaPointsFor(s, "runner")).toBeGreaterThanOrEqual(1);
      expect(s.corp.deck.sort()).toEqual(["f-1", "f-2"].sort());
      expect(s.runner.clicks).toBe(0);
      expect(s.corp.corpSetAside ?? []).toEqual([]);
    });
  });
  });

  describe("midnight-sun-echo", () => {
  beforeAll(() => {
    if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
    if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
    assertPinnedTag("v26.03");
    assertCardsPinnedTag("v1.147.6");
  });

  describe("MS Echo powerCounterOnHarmonicIceRez", () => {
    it("places power on Echo when any harmonic ice is rezzed", () => {
      let s = createInitialState();
      s = structuredClone(s);
      const echo = instantiateCard("ice-wall", "echo-1", "server:hq:ice");
      echo.powerCounterOnHarmonicIceRez = true;
      echo.etrSubroutinesPerPowerCounter = true;
      echo.powerCounters = 0;
      echo.subtypes = ["barrier", "harmonic"];
      s.cards["echo-1"] = echo;
      s.servers.hq.ice = ["echo-1"];
      const wave = instantiateCard("ice-wall", "wave-1", "server:rd:ice");
      wave.subtypes = ["code gate", "harmonic"];
      wave.rezzed = true;
      s.cards["wave-1"] = wave;
      s.servers.rd.ice = ["wave-1"];
      firePowerOnHarmonicIceRez(s, "wave-1");
      expect(s.cards["echo-1"].powerCounters).toBe(1);
      expect(s.cards["echo-1"].subroutines![0]!.text).toBe("End the run.");
    });
  });
  });

  describe("midnight-sun-elivagar", () => {
  beforeAll(() => {
    if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
    if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
    assertPinnedTag("v26.03");
    assertCardsPinnedTag("v1.147.6");
  });

  function must(
    state: ReturnType<typeof createInitialState>,
    action: Parameters<typeof applyAction>[1],
  ) {
    const r = applyAction(state, action);
    if (!r.ok) throw new Error(`${r.error} ${JSON.stringify(r.cites)}`);
    return r.state;
  }

  function elivagarOnScore(): Effect {
    return fx.mayDerezInstalled({ excludeSelf: true });
  }

  function setupScoreWithInstalled(opts: {
    rezzedIce?: boolean;
    rezzedAsset?: boolean;
    unrezzedIce?: boolean;
  }) {
    let s = createInitialState();
    s = structuredClone(s);

    const agenda = instantiateCard(
      "elivagar-bifurcation",
      "eli-1",
      "server:remote-1:root",
    );
    agenda.unsupported = [];
    agenda.onScore = elivagarOnScore();
    agenda.advancementCounters = agenda.advancementRequirement ?? 2;
    s.cards["eli-1"] = agenda;
    s.servers["remote-1"] = {
      id: "remote-1",
      kind: "remote",
      ice: [],
      root: ["eli-1"],
    };

    if (opts.rezzedIce) {
      const ice = instantiateCard("ice-wall", "ice-1", "server:hq:ice");
      ice.rezzed = true;
      ice.faceup = true;
      s.cards["ice-1"] = ice;
      s.servers.hq.ice.push("ice-1");
    }
    if (opts.unrezzedIce) {
      const ice = instantiateCard("enigma", "ice-unrez", "server:rd:ice");
      ice.rezzed = false;
      s.cards["ice-unrez"] = ice;
      s.servers.rd.ice.push("ice-unrez");
    }
    if (opts.rezzedAsset) {
      const remote2 = "remote-2" as ServerId;
      s.servers[remote2] = {
        id: remote2,
        kind: "remote",
        ice: [],
        root: [],
      };
      const asset = instantiateCard("pad-campaign", "asset-1", `server:${remote2}:root`);
      asset.rezzed = true;
      asset.faceup = true;
      s.cards["asset-1"] = asset;
      s.servers[remote2].root = ["asset-1"];
    }

    s.corp.clicks = 3;
    s.corp.credits = 10;
    s.activeSide = "corp";
    s.timingKey = "corp.actionPaw";
    // Isolate agenda onScore from HB Precision Design's onAgendaScored choice.
    const id = s.cards[s.corp.identityId];
    if (id) delete id.onAgendaScored;
    return s;
  }

  describe("MS Élivágar may_derez_installed onScore", () => {
    it("validates may_derez_installed effect tree", () => {
      expect(validateEffectTree(elivagarOnScore())).toBeNull();
    });

    it("offers rezzed ice and rezzed asset as derez targets", () => {
      let s = setupScoreWithInstalled({ rezzedIce: true, rezzedAsset: true });
      s = must(s, { type: "score_agenda", cardId: "eli-1" });
      expect(s.corp.scoreArea).toContain("eli-1");
      const ids = s.pendingChoice?.options.map((o) => o.id) ?? [];
      expect(ids).toEqual(
        expect.arrayContaining(["derez:ice-1", "derez:asset-1", "decline"]),
      );
    });

    it("derezzes chosen asset (not ice-only)", () => {
      let s = setupScoreWithInstalled({ rezzedIce: true, rezzedAsset: true });
      s = must(s, { type: "score_agenda", cardId: "eli-1" });
      s = must(s, { type: "choose_option", optionId: "derez:asset-1" });
      expect(s.cards["asset-1"]!.rezzed).toBe(false);
      expect(s.cards["ice-1"]!.rezzed).toBe(true);
    });

    it("ignores unrezzed ice; decline leaves rezzed ice up", () => {
      let s = setupScoreWithInstalled({
        rezzedIce: true,
        unrezzedIce: true,
      });
      s = must(s, { type: "score_agenda", cardId: "eli-1" });
      const ids = s.pendingChoice?.options.map((o) => o.id) ?? [];
      expect(ids).toContain("derez:ice-1");
      expect(ids).not.toContain("derez:ice-unrez");
      s = must(s, { type: "choose_option", optionId: "decline" });
      expect(s.cards["ice-1"]!.rezzed).toBe(true);
    });

    it("no choice when nothing rezzed installed", () => {
      let s = setupScoreWithInstalled({});
      s = must(s, { type: "score_agenda", cardId: "eli-1" });
      expect(s.pendingChoice).toBeFalsy();
      expect(s.corp.scoreArea).toContain("eli-1");
    });

    it("evalEffect may_derez_installed directly offers installed targets", () => {
      let s = createInitialState();
      s = structuredClone(s);
      const src = instantiateCard("elivagar-bifurcation", "eli-src", "corp:score");
      s.cards["eli-src"] = src;
      const asset = instantiateCard("pad-campaign", "a1", "server:remote-1:root");
      asset.rezzed = true;
      asset.faceup = true;
      s.cards["a1"] = asset;
      s.servers["remote-1"] = {
        id: "remote-1",
        kind: "remote",
        ice: [],
        root: ["a1"],
      };
      const r = evalEffect({ state: s, sourceId: "eli-src" }, elivagarOnScore());
      expect(r.ok).toBe(true);
      expect(s.pendingChoice?.options.some((o) => o.id === "derez:a1")).toBe(
        true,
      );
    });
  });

  describe("MS Élivágar card wiring (v0.31.0+)", () => {
    it("Élivágar clears unsupported with may_derez_installed onScore", () => {
      const def = getCardDef("elivagar-bifurcation");
      expect(def.unsupported).toEqual([]);
      expect(def.type).toBe("agenda");
      expect(def.advancementRequirement).toBe(2);
      expect(def.agendaPoints).toBe(1);
      expect(def.onScore).toEqual({
        op: "do",
        action: {
          kind: "may_derez_installed",
          excludeSelf: true,
        },
      });
    });
  });
  });

  describe("midnight-sun-envelopment-mavirus-steelskin", () => {
  beforeAll(() => {
    if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
    if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
    assertPinnedTag("v26.03");
    assertCardsPinnedTag("v1.147.6");
  });

  function must(
    state: ReturnType<typeof createInitialState>,
    action: Parameters<typeof applyAction>[1],
  ) {
    const r = applyAction(state, action);
    if (!r.ok) throw new Error(`${r.error} ${JSON.stringify(r.cites)}`);
    return r.state;
  }

  describe("MS Envelopment etrSubroutinesPerPowerCounter", () => {
    it("sync expands ETR subs before printed ones", () => {
      const ice = instantiateCard("ice-wall", "env-1", "server:hq:ice");
      ice.etrSubroutinesPerPowerCounter = true;
      ice.baseSubroutines = structuredClone(ice.subroutines ?? []);
      ice.powerCounters = 0;
      syncEtrPerPowerCounterSubs(ice);
      expect(ice.subroutines?.length).toBe(ice.baseSubroutines!.length);

      ice.powerCounters = 4;
      syncEtrPerPowerCounterSubs(ice);
      expect(ice.subroutines?.length).toBe(4 + ice.baseSubroutines!.length);
      expect(ice.subroutines![0]!.text).toBe("End the run.");
      expect(ice.subroutines![3]!.text).toBe("End the run.");
      expect(ice.subroutines![4]!.id).toBe(ice.baseSubroutines![0]!.id);
    });

    it("add_power_counter syncs ETR subs", () => {
      let s = createInitialState();
      s = structuredClone(s);
      const ice = instantiateCard("ice-wall", "env-2", "server:hq:ice");
      ice.etrSubroutinesPerPowerCounter = true;
      ice.powerCounters = 0;
      s.cards["env-2"] = ice;
      s.servers.hq.ice = ["env-2"];
      const r = evalEffect(
        { state: s, sourceId: "env-2" },
        fx.addPowerCounter(4),
      );
      expect(r.ok).toBe(true);
      expect(s.cards["env-2"].powerCounters).toBe(4);
      expect(s.cards["env-2"].subroutines!.length).toBeGreaterThanOrEqual(4);
      expect(s.cards["env-2"].subroutines![0]!.text).toBe("End the run.");
    });
  });

  describe("MS purge_virus_counters (Mavirus)", () => {
    it("validates purge tree", () => {
      expect(validateEffectTree(fx.purgeVirusCounters())).toBeNull();
      expect(validateEffectTree(fx.mayPurgeVirusCounters())).toBeNull();
    });

    it("clears virus counters and trashes Clot-class cards", () => {
      let s = createInitialState();
      s = structuredClone(s);
      const virus = instantiateCard("imp", "imp-1", "runner:installed");
      virus.virusCounters = 3;
      s.cards["imp-1"] = virus;
      s.runner.installed = ["imp-1"];
      const clot = instantiateCard("clot", "clot-1", "runner:installed");
      clot.trashOnVirusPurge = true;
      s.cards["clot-1"] = clot;
      s.runner.installed.push("clot-1");

      purgeVirusCounters(s, s.corp.identityId);
      expect(s.cards["imp-1"].virusCounters).toBe(0);
      expect(s.runner.discardPile).toContain("clot-1");
      expect(s.runner.installed).not.toContain("clot-1");
    });

    it("source_rezzed gates net damage in onAccess tree", () => {
      const tree = fx.seq(
        fx.if({ op: "source_rezzed" }, fx.netDamage(1)),
        fx.mayPurgeVirusCounters(),
      );
      expect(validateEffectTree(tree)).toBeNull();

      let s = createInitialState();
      s = structuredClone(s);
      const up = instantiateCard("pad-campaign", "mav-1", "server:hq:root");
      up.rezzed = false;
      s.cards["mav-1"] = up;
      s.runner.hand = ["filler-1", "filler-2"];
      for (const id of ["filler-1", "filler-2"]) {
        s.cards[id] = instantiateCard("sure-gamble", id, "runner:grip");
      }
      const before = s.runner.hand.length;
      const r = evalEffect({ state: s, sourceId: "mav-1" }, tree);
      expect(r.ok).toBe(true);
      // Unrezzed — no net damage; may-purge pending.
      expect(s.runner.hand.length).toBe(before);
      expect(s.pendingChoice).not.toBeNull();
    });
  });

  describe("MS onTrashFromGripOrStack (Steelskin)", () => {
    it("offers may-draw when trashed from grip", () => {
      let s = createInitialState();
      s = structuredClone(s);
      const sk = instantiateCard("sure-gamble", "sk-1", "runner:grip");
      sk.onTrashFromGripOrStack = fx.mayDraw("runner", 2);
      s.cards["sk-1"] = sk;
      s.runner.hand = ["sk-1"];
      s.runner.deck = ["d1", "d2", "d3"];
      for (const id of ["d1", "d2", "d3"]) {
        s.cards[id] = instantiateCard("sure-gamble", id, "runner:stack");
      }
      moveRunnerCardToHeap(s, "sk-1");
      expect(s.runner.discardPile).toContain("sk-1");
      expect(s.pendingChoice).not.toBeNull();
      expect(s.pendingChoice!.chooser).toBe("runner");
      s = must(s, { type: "choose_option", optionId: "draw" });
      expect(s.runner.hand.length).toBe(2);
    });
  });

  describe("MS card wiring (Envelopment / Mavirus / Steelskin)", () => {
    it("wires cleared cards with empty unsupported", () => {
      const env = getCardDef("envelopment");
      expect(env.unsupported).toEqual([]);
      expect(env.etrSubroutinesPerPowerCounter).toBe(true);
      expect(env.onRez).toEqual(fx.addPowerCounter(4));
      expect(env.onTurnBegin).toEqual(fx.removePowerCounter(1));

      const mav = getCardDef("mavirus");
      expect(mav.unsupported).toEqual([]);
      expect(mav.onTrash).toEqual(fx.purgeVirusCounters());
      expect(mav.onAccess).toBeTruthy();

      const sk = getCardDef("steelskin-scarring");
      expect(sk.unsupported).toEqual([]);
      expect(sk.onTrashFromGripOrStack).toEqual(fx.mayDraw("runner", 2));
    });
  });
  });

  describe("midnight-sun-environmental-testing", () => {
  beforeAll(() => {
    if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
    if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
    assertPinnedTag("v26.03");
    assertCardsPinnedTag("v1.147.6");
  });

  function must(
    state: ReturnType<typeof createInitialState>,
    action: Parameters<typeof applyAction>[1],
  ) {
    const r = applyAction(state, action);
    if (!r.ok) throw new Error(`${r.error} ${JSON.stringify(r.cites)}`);
    return r.state;
  }

  function etInstallEffect() {
    return fx.addPowerCounter(1);
  }

  function etThreshold() {
    return {
      amount: 4,
      effect: fx.seq(fx.trashSelf(), fx.gainCredits("runner", 9)),
    };
  }

  function withEt(opts?: { powerCounters?: number; runnerCredits?: number }) {
    let s = createInitialState();
    s = structuredClone(s);
    const et = instantiateCard(
      "environmental-testing",
      "et-1",
      "runner:installed",
    );
    et.onProgramOrHardwareInstall = etInstallEffect();
    et.onPowerCountersGte = etThreshold();
    et.unsupported = [];
    et.powerCounters = opts?.powerCounters ?? 0;
    s.cards["et-1"] = et;
    s.runner.installed = ["et-1"];
    s.runner.credits = opts?.runnerCredits ?? 10;
    s.runner.clicks = 4;
    s.runner.memoryLimit = 8;
    s.activeSide = "runner";
    s.timingKey = "runner.takeAction";
    return s;
  }

  function installFree(
    state: ReturnType<typeof createInitialState>,
    defId: string,
    instanceId: string,
  ) {
    let s = state;
    const card = instantiateCard(defId, instanceId, "runner:grip");
    card.installCost = 0;
    s.cards[instanceId] = card;
    s.runner.hand = [instanceId];
    s.runner.clicks = 1;
    s.activeSide = "runner";
    s.timingKey = "runner.takeAction";
    s = must(s, {
      type: "basic_install",
      cardId: instanceId,
      destination: { kind: "installed" },
    });
    return s;
  }

  describe("MS Environmental Testing install-trigger power counters (always)", () => {
    it("accepts onProgramOrHardwareInstall + onPowerCountersGte Effect IR", () => {
      expect(validateEffectTree(etInstallEffect())).toBeNull();
      expect(validateEffectTree(etThreshold().effect)).toBeNull();
    });

    it("program install places 1 power counter on ET", () => {
      let s = withEt({ powerCounters: 0 });
      s = installFree(s, "imp", "imp-1");
      expect(s.runner.installed).toContain("imp-1");
      expect(s.cards["et-1"]!.powerCounters).toBe(1);
      expect(s.runner.installed).toContain("et-1");
    });

    it("hardware install places 1 power counter on ET", () => {
      let s = withEt({ powerCounters: 0 });
      s = installFree(s, "docklands-pass", "hw-1");
      expect(s.runner.installed).toContain("hw-1");
      expect(s.cards["et-1"]!.powerCounters).toBe(1);
    });

    it("resource install does not place a power counter", () => {
      let s = withEt({ powerCounters: 0 });
      s = installFree(s, "no-free-lunch", "res-1");
      expect(s.runner.installed).toContain("res-1");
      expect(s.cards["et-1"]!.powerCounters).toBe(0);
    });

    it("fourth program install trashes ET and gains 9¢", () => {
      let s = withEt({ powerCounters: 3, runnerCredits: 5 });
      s = installFree(s, "imp", "imp-pop");
      expect(s.runner.installed).not.toContain("et-1");
      expect(s.runner.discardPile).toContain("et-1");
      expect(s.cards["et-1"]!.zone).toBe("runner:heap");
      expect(s.runner.credits).toBe(14); // 5 + 9
    });

    it("charge from 3→4 trashes ET and gains 9¢", () => {
      const s = withEt({ powerCounters: 3, runnerCredits: 1 });
      const r = evalEffect(
        { state: s, sourceId: "et-1" },
        {
          op: "do",
          action: { kind: "charge", pick: "card", cardId: "et-1" },
        },
      );
      expect(r.ok).toBe(true);
      expect(s.runner.installed).not.toContain("et-1");
      expect(s.runner.discardPile).toContain("et-1");
      expect(s.runner.credits).toBe(10); // 1 + 9
    });

    it("add_power_counter crossing threshold trashes without install", () => {
      const s = withEt({ powerCounters: 3, runnerCredits: 0 });
      const r = evalEffect(
        { state: s, sourceId: "et-1" },
        fx.addPowerCounter(1),
      );
      expect(r.ok).toBe(true);
      expect(s.runner.installed).not.toContain("et-1");
      expect(s.runner.discardPile).toContain("et-1");
      expect(s.runner.credits).toBe(9);
    });
  });

  describe("MS Environmental Testing card data (when wired)", () => {
    function etWired(): boolean {
      const def = getCardDef("environmental-testing");
      return (
        (def.unsupported?.length ?? 0) === 0 &&
        Boolean(def.onProgramOrHardwareInstall) &&
        Boolean(def.onPowerCountersGte)
      );
    }

    it("environmental-testing is fully clear with install + threshold IR", () => {
      if (!etWired()) {
        expect(
          getCardDef("environmental-testing").unsupported!.length,
        ).toBeGreaterThan(0);
        return;
      }
      const def = getCardDef("environmental-testing");
      expect(def.unsupported).toEqual([]);
      expect(def.onProgramOrHardwareInstall).toEqual(fx.addPowerCounter(1));
      expect(def.onPowerCountersGte?.amount).toBe(4);
      expect(def.onPowerCountersGte?.effect).toEqual(
        fx.seq(fx.trashSelf(), fx.gainCredits("runner", 9)),
      );
      expect(validateEffectTree(def.onProgramOrHardwareInstall!)).toBeNull();
      expect(validateEffectTree(def.onPowerCountersGte!.effect)).toBeNull();
    });
  });
  });

  describe("midnight-sun-first-virus-install", () => {
  beforeAll(() => {
    if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
    if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
    assertPinnedTag("v26.03");
    assertCardsPinnedTag("v1.147.6");
  });

  function must(
    state: ReturnType<typeof createInitialState>,
    action: Parameters<typeof applyAction>[1],
  ) {
    const r = applyAction(state, action);
    if (!r.ok) throw new Error(`${r.error} ${JSON.stringify(r.cites)}`);
    return r.state;
  }

  describe("MS onFirstVirusInstallThisTurn IR (always)", () => {
    it("accepts onFirstVirusInstallThisTurn sabotage Effect IR", () => {
      expect(validateEffectTree(fx.sabotage(1, true))).toBeNull();
    });

    it("fires once on first virus program install (synthetic Avgustina)", () => {
      let s = createInitialState();
      s = structuredClone(s);

      const avg = instantiateCard("avgustina-ivanovskaya", "avg-1", "runner:installed");
      avg.onFirstVirusInstallThisTurn = fx.sabotage(1, true);
      avg.unsupported = [];
      s.cards["avg-1"] = avg;
      s.runner.installed.push("avg-1");

      const virus = instantiateCard("imp", "imp-1", "runner:grip");
      virus.installCost = 0;
      s.cards["imp-1"] = virus;
      s.runner.hand = ["imp-1"];
      s.runner.credits = 5;
      s.runner.clicks = 1;
      s.runner.memoryLimit = 8;
      s.activeSide = "runner";
      s.timingKey = "runner.takeAction";

      expect(s.turn.virusProgramsInstalledThisTurn).toBe(0);
      s = must(s, {
        type: "basic_install",
        cardId: "imp-1",
        destination: { kind: "installed" },
      });
      expect(s.runner.installed).toContain("imp-1");
      expect(s.turn.virusProgramsInstalledThisTurn).toBe(1);
      expect(s.pendingSabotage?.amount).toBe(1);

      s.corp.hand = [];
      s = must(s, { type: "resolve_sabotage", hqCardIds: [] });
      expect(s.pendingSabotage).toBeNull();

      // Second virus this turn: no new sabotage
      const virus2 = instantiateCard("imp", "imp-2", "runner:grip");
      virus2.installCost = 0;
      s.cards["imp-2"] = virus2;
      s.runner.hand = ["imp-2"];
      s.runner.clicks = 1;
      s.activeSide = "runner";
      s.timingKey = "runner.takeAction";
      s = must(s, {
        type: "basic_install",
        cardId: "imp-2",
        destination: { kind: "installed" },
      });
      expect(s.turn.virusProgramsInstalledThisTurn).toBe(2);
      expect(s.pendingSabotage).toBeNull();
    });

    it("non-virus program install does not fire", () => {
      let s = createInitialState();
      s = structuredClone(s);

      const avg = instantiateCard("avgustina-ivanovskaya", "avg-2", "runner:installed");
      avg.onFirstVirusInstallThisTurn = fx.sabotage(1, true);
      s.cards["avg-2"] = avg;
      s.runner.installed.push("avg-2");

      const nonVirus = instantiateCard("imp", "nv-1", "runner:grip");
      nonVirus.subtypes = [];
      nonVirus.installCost = 0;
      s.cards["nv-1"] = nonVirus;
      s.runner.hand = ["nv-1"];
      s.runner.credits = 5;
      s.runner.clicks = 1;
      s.runner.memoryLimit = 8;
      s.activeSide = "runner";
      s.timingKey = "runner.takeAction";

      s = must(s, {
        type: "basic_install",
        cardId: "nv-1",
        destination: { kind: "installed" },
      });
      expect(s.turn.virusProgramsInstalledThisTurn).toBe(0);
      expect(s.pendingSabotage).toBeNull();
    });
  });

  describe("MS Avgustina card wiring (v0.31.0+)", () => {
    it("Avgustina wires onFirstVirusInstallThisTurn sabotage; unsupported empty", () => {
      const a = getCardDef("avgustina-ivanovskaya");
      expect(a.unsupported).toEqual([]);
      expect(a.onFirstVirusInstallThisTurn).toEqual(fx.sabotage(1, true));
      expect(validateEffectTree(a.onFirstVirusInstallThisTurn!)).toBeNull();

      let s = createInitialState();
      s = structuredClone(s);
      const live = instantiateCard(
        "avgustina-ivanovskaya",
        "avg-live",
        "runner:installed",
      );
      s.cards["avg-live"] = live;
      s.runner.installed.push("avg-live");

      const virus = instantiateCard("imp", "imp-live", "runner:grip");
      virus.installCost = 0;
      s.cards["imp-live"] = virus;
      s.runner.hand = ["imp-live"];
      s.runner.credits = 5;
      s.runner.clicks = 1;
      s.runner.memoryLimit = 8;
      s.activeSide = "runner";
      s.timingKey = "runner.takeAction";

      s = must(s, {
        type: "basic_install",
        cardId: "imp-live",
        destination: { kind: "installed" },
      });
      expect(s.pendingSabotage?.amount).toBe(1);
    });
  });
  });

  describe("midnight-sun-ghosttongue", () => {
  beforeAll(() => {
    if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
    if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
    assertPinnedTag("v26.03");
    assertCardsPinnedTag("v1.147.6");
  });

  function must(
    state: ReturnType<typeof createInitialState>,
    action: Parameters<typeof applyAction>[1],
  ) {
    const r = applyAction(state, action);
    if (!r.ok) throw new Error(`${r.error} ${JSON.stringify(r.cites)}`);
    return r.state;
  }

  describe("MS eventPlayCostDiscount (always)", () => {
    it("sums discounts from installed cards and floors play cost at 0", () => {
      let s = createInitialState();
      s = structuredClone(s);
      const gt = instantiateCard("ghosttongue", "gt-1", "runner:installed");
      gt.eventPlayCostDiscount = 1;
      gt.unsupported = [];
      s.cards["gt-1"] = gt;
      s.runner.installed = ["gt-1"];

      expect(eventPlayCostDiscountTotal(s)).toBe(1);
      expect(effectiveEventPlayCost(s, 5)).toBe(4);
      expect(effectiveEventPlayCost(s, 1)).toBe(0);
      expect(effectiveEventPlayCost(s, 0)).toBe(0);
      expect(effectiveEventPlayCost(s, undefined)).toBe(0);
    });

    it("stacks multiple installed discounts", () => {
      let s = createInitialState();
      s = structuredClone(s);
      for (const id of ["gt-a", "gt-b"] as const) {
        const gt = instantiateCard("ghosttongue", id, "runner:installed");
        gt.eventPlayCostDiscount = 1;
        s.cards[id] = gt;
        s.runner.installed.push(id);
      }
      expect(eventPlayCostDiscountTotal(s)).toBe(2);
      expect(effectiveEventPlayCost(s, 3)).toBe(1);
    });

    it("ignores discounts on cards not in the installed area", () => {
      let s = createInitialState();
      s = structuredClone(s);
      const gt = instantiateCard("ghosttongue", "gt-heap", "runner:heap");
      gt.eventPlayCostDiscount = 1;
      s.cards["gt-heap"] = gt;
      s.runner.discardPile.push("gt-heap");
      expect(eventPlayCostDiscountTotal(s)).toBe(0);
      expect(effectiveEventPlayCost(s, 5)).toBe(5);
    });

    it("plays event paying printed cost minus discount", () => {
      let s = createInitialState();
      s = structuredClone(s);
      const gt = instantiateCard("ghosttongue", "gt-2", "runner:installed");
      gt.eventPlayCostDiscount = 1;
      gt.unsupported = [];
      s.cards["gt-2"] = gt;
      s.runner.installed = ["gt-2"];

      const ev = instantiateCard("sure-gamble", "sg-1", "runner:grip");
      s.cards["sg-1"] = ev;
      s.runner.hand = ["sg-1"];
      s.runner.credits = 5; // printed 5; with −1 need only 4
      s.runner.clicks = 1;
      s.activeSide = "runner";
      s.timingKey = "runner.takeAction";

      s = must(s, { type: "play_event", cardId: "sg-1" });
      // pay 4, gain 9
      expect(s.runner.credits).toBe(5 - 4 + 9);
      expect(s.log.some((l) => /plays Sure Gamble for 4¢/.test(l))).toBe(true);
      expect(s.log.some((l) => /cost calc 1\.16\.2a/.test(l))).toBe(true);
    });

    it("allows play when bank has only the discounted amount", () => {
      let s = createInitialState();
      s = structuredClone(s);
      const gt = instantiateCard("ghosttongue", "gt-3", "runner:installed");
      gt.eventPlayCostDiscount = 1;
      s.cards["gt-3"] = gt;
      s.runner.installed = ["gt-3"];

      const ev = instantiateCard("sure-gamble", "sg-2", "runner:grip");
      s.cards["sg-2"] = ev;
      s.runner.hand = ["sg-2"];
      s.runner.credits = 4; // cannot afford printed 5 without discount
      s.runner.clicks = 1;
      s.activeSide = "runner";
      s.timingKey = "runner.takeAction";

      const legal = queryLegality(s);
      expect(
        legal.legal.some(
          (e) => e.action.type === "play_event" && e.action.cardId === "sg-2",
        ),
      ).toBe(true);

      s = must(s, { type: "play_event", cardId: "sg-2" });
      expect(s.runner.credits).toBe(4 - 4 + 9);
    });

    it("without discount, 4¢ cannot play Sure Gamble", () => {
      let s = createInitialState();
      s = structuredClone(s);
      const ev = instantiateCard("sure-gamble", "sg-3", "runner:grip");
      s.cards["sg-3"] = ev;
      s.runner.hand = ["sg-3"];
      s.runner.credits = 4;
      s.runner.clicks = 1;
      s.activeSide = "runner";
      s.timingKey = "runner.takeAction";

      const legal = queryLegality(s);
      expect(
        legal.legal.some(
          (e) => e.action.type === "play_event" && e.action.cardId === "sg-3",
        ),
      ).toBe(false);

      const r = applyAction(s, { type: "play_event", cardId: "sg-3" });
      expect(r.ok).toBe(false);
    });
  });

  describe("MS Ghosttongue card wiring (v0.31.0+)", () => {
    it("Ghosttongue wires eventPlayCostDiscount + onInstall core_damage; unsupported empty", () => {
      const def = getCardDef("ghosttongue");
      expect(def.type).toBe("hardware");
      expect(def.installCost).toBe(2);
      expect(def.eventPlayCostDiscount).toBe(1);
      expect(def.onInstall).toEqual({
        op: "do",
        action: { kind: "core_damage", amount: 1 },
      });
      expect(def.unsupported ?? []).toEqual([]);
    });
  });
  });

  describe("midnight-sun-hakarl", () => {
  beforeAll(() => {
    if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
    if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
    assertPinnedTag("v26.03");
    assertCardsPinnedTag("v1.147.6");
  });

  function must(
    state: ReturnType<typeof createInitialState>,
    action: Parameters<typeof applyAction>[1],
  ) {
    const r = applyAction(state, action);
    if (!r.ok) throw new Error(`${r.error} ${JSON.stringify(r.cites)}`);
    return r.state;
  }

  function hakarlOnRez(): Effect {
    return fx.if(
      { op: "source_protects_attacked_server" },
      fx.mayDerezInstalled({
        excludeSelf: true,
        then: fx.forbidBioroidIcePaidAbilitiesThisTurn(),
      }),
    );
  }

  function setupHakarlRun(opts?: { otherRezzed?: boolean }) {
    let s = createInitialState();
    s = structuredClone(s);

    const remoteId = "remote-1" as ServerId;
    s.servers[remoteId] = {
      id: remoteId,
      kind: "remote",
      ice: [],
      root: [],
    };

    const hakarl = instantiateCard(
      "hakarl-1-0",
      "hakarl-1",
      `server:${remoteId}:ice`,
    );
    hakarl.unsupported = [];
    hakarl.onRez = hakarlOnRez();
    hakarl.rezzed = false;
    s.cards["hakarl-1"] = hakarl;
    s.servers[remoteId].ice = ["hakarl-1"];

    if (opts?.otherRezzed !== false) {
      const otherServer = "remote-2" as ServerId;
      s.servers[otherServer] = {
        id: otherServer,
        kind: "remote",
        ice: [],
        root: [],
      };
      const other = instantiateCard(
        "pad-campaign",
        "other-1",
        `server:${otherServer}:root`,
      );
      other.rezzed = true;
      other.faceup = true;
      s.cards["other-1"] = other;
      s.servers[otherServer].root = ["other-1"];
    }

    s.corp.credits = 20;
    s.runner.credits = 10;
    s.runner.clicks = 4;
    s.runner.installed = [];
    s.activeSide = "runner";
    s.timingKey = "runner.takeAction";
    return { s, remoteId };
  }

  describe("MS Hákarl may-derez + bioroid paid-ability lock IR (always)", () => {
    it("validates Hákarl onRez effect tree", () => {
      const err = validateEffectTree(hakarlOnRez(), "hakarl.onRez");
      expect(err).toBeNull();
    });

    it("rez during run against this server offers may-derez when another card is rezzed", () => {
      const setup = setupHakarlRun({ otherRezzed: true });
      let s = setup.s;
      const remoteId = setup.remoteId;
      s = must(s, { type: "basic_run", serverId: remoteId });
      s = must(s, { type: "rez_ice", cardId: "hakarl-1" });
      expect(s.pendingChoice?.chooser).toBe("corp");
      expect(s.pendingChoice?.options.some((o) => o.id === "derez:other-1")).toBe(
        true,
      );
      expect(s.pendingChoice?.options.some((o) => o.id === "decline")).toBe(true);
    });

    it("choosing derez applies lock and blocks bioroid click-break", () => {
      const setup = setupHakarlRun({ otherRezzed: true });
      let s = setup.s;
      const remoteId = setup.remoteId;
      s = must(s, { type: "basic_run", serverId: remoteId });
      s = must(s, { type: "rez_ice", cardId: "hakarl-1" });
      s = must(s, { type: "choose_option", optionId: "derez:other-1" });

      expect(s.cards["other-1"]!.rezzed).toBe(false);
      expect(s.turn.bioroidIcePaidAbilitiesForbidden).toBe(true);

      s = must(s, { type: "pass_window" });
      s = must(s, { type: "pass_window" });
      expect(s.timingKey).toBe("run.encounterPaw");
      expect(
        queryLegality(s).legal.some(
          (e) => e.action.type === "break_bioroid_subroutine",
        ),
      ).toBe(false);

      const blocked = applyAction(s, {
        type: "break_bioroid_subroutine",
        subIndex: 0,
      });
      expect(blocked.ok).toBe(false);
    });

    it("decline leaves bioroid click-break available", () => {
      const setup = setupHakarlRun({ otherRezzed: true });
      let s = setup.s;
      const remoteId = setup.remoteId;
      s = must(s, { type: "basic_run", serverId: remoteId });
      s = must(s, { type: "rez_ice", cardId: "hakarl-1" });
      s = must(s, { type: "choose_option", optionId: "decline" });

      expect(s.cards["other-1"]!.rezzed).toBe(true);
      expect(s.turn.bioroidIcePaidAbilitiesForbidden).toBe(false);

      s = must(s, { type: "pass_window" });
      expect(s.timingKey).toBe("run.encounterPaw");
      expect(
        queryLegality(s).legal.some(
          (e) => e.action.type === "break_bioroid_subroutine",
        ),
      ).toBe(true);

      const before = s.runner.clicks;
      s = must(s, { type: "break_bioroid_subroutine", subIndex: 0 });
      expect(s.runner.clicks).toBe(before - 1);
      expect(s.run!.encounter!.broken[0]).toBe(true);
    });

    it("no other rezzed cards → no choice and no lock", () => {
      const setup = setupHakarlRun({ otherRezzed: false });
      let s = setup.s;
      const remoteId = setup.remoteId;
      s = must(s, { type: "basic_run", serverId: remoteId });
      s = must(s, { type: "rez_ice", cardId: "hakarl-1" });
      expect(s.pendingChoice).toBeNull();
      expect(s.turn.bioroidIcePaidAbilitiesForbidden).toBe(false);

      s = must(s, { type: "pass_window" });
      expect(
        queryLegality(s).legal.some(
          (e) => e.action.type === "break_bioroid_subroutine",
        ),
      ).toBe(true);
    });

    it("onRez when source does not protect attacked server is a no-op", () => {
      let s = createInitialState();
      s = structuredClone(s);
      const remoteA = "remote-1" as ServerId;
      const remoteB = "remote-2" as ServerId;
      s.servers[remoteA] = { id: remoteA, kind: "remote", ice: [], root: [] };
      s.servers[remoteB] = { id: remoteB, kind: "remote", ice: [], root: [] };

      const hakarl = instantiateCard(
        "hakarl-1-0",
        "hakarl-1",
        `server:${remoteB}:ice`,
      );
      hakarl.onRez = hakarlOnRez();
      hakarl.rezzed = true;
      s.cards["hakarl-1"] = hakarl;
      s.servers[remoteB].ice = ["hakarl-1"];

      const other = instantiateCard(
        "pad-campaign",
        "other-1",
        `server:${remoteB}:root`,
      );
      other.rezzed = true;
      s.cards["other-1"] = other;
      s.servers[remoteB].root = ["other-1"];

      // Synthetic run against A while Hákarl protects B.
      s.run = {
        attackedServerId: remoteA,
        phase: "approach_ice",
        position: 0,
        successful: false,
        endedTheRun: false,
        encounter: null,
      } as typeof s.run;

      const r = evalEffect({ state: s, sourceId: "hakarl-1" }, hakarlOnRez());
      expect(r.ok).toBe(true);
      expect(s.pendingChoice).toBeNull();
      expect(s.turn.bioroidIcePaidAbilitiesForbidden).toBe(false);
      expect(s.cards["other-1"]!.rezzed).toBe(true);
    });

    it("lock clears at beginCorpTurnFlags", () => {
      const setup = setupHakarlRun({ otherRezzed: true });
      let s = setup.s;
      const remoteId = setup.remoteId;
      s = must(s, { type: "basic_run", serverId: remoteId });
      s = must(s, { type: "rez_ice", cardId: "hakarl-1" });
      s = must(s, { type: "choose_option", optionId: "derez:other-1" });
      expect(s.turn.bioroidIcePaidAbilitiesForbidden).toBe(true);

      beginCorpTurnFlags(s);
      expect(s.turn.bioroidIcePaidAbilitiesForbidden).toBe(false);
    });

    it("may_derez can target rezzed ice as well as assets", () => {
      const setup = setupHakarlRun({ otherRezzed: false });
      let s = setup.s;
      const remoteId = setup.remoteId;
      const otherServer = "remote-2" as ServerId;
      s.servers[otherServer] = {
        id: otherServer,
        kind: "remote",
        ice: [],
        root: [],
      };
      const wall = instantiateCard(
        "ice-wall",
        "wall-1",
        `server:${otherServer}:ice`,
      );
      wall.rezzed = true;
      wall.faceup = true;
      s.cards["wall-1"] = wall;
      s.servers[otherServer].ice = ["wall-1"];

      s = must(s, { type: "basic_run", serverId: remoteId });
      s = must(s, { type: "rez_ice", cardId: "hakarl-1" });
      expect(s.pendingChoice?.options.some((o) => o.id === "derez:wall-1")).toBe(
        true,
      );
      s = must(s, { type: "choose_option", optionId: "derez:wall-1" });
      expect(s.cards["wall-1"]!.rezzed).toBe(false);
      expect(s.turn.bioroidIcePaidAbilitiesForbidden).toBe(true);
    });
  });

  describe("MS Hákarl card-data wiring (v0.31.0+)", () => {
    it("hakarl-1-0 is fully clear with onRez may-derez + bioroid lock", () => {
      const def = getCardDef("hakarl-1-0");
      expect(def.unsupported ?? []).toEqual([]);
      expect(def.subtypes).toContain("bioroid");
      expect(def.onRez).toEqual({
        op: "if",
        cond: { op: "source_protects_attacked_server" },
        then: {
          op: "do",
          action: {
            kind: "may_derez_installed",
            excludeSelf: true,
            then: {
              op: "do",
              action: { kind: "forbid_bioroid_ice_paid_abilities_this_turn" },
            },
          },
        },
      });
      expect(def.subroutines?.some((sub) => sub.id === "hakarl-core")).toBe(true);
      expect(def.subroutines?.some((sub) => sub.id === "hakarl-etr")).toBe(true);
    });
  });
  });

  describe("midnight-sun-into-the-depths", () => {
  beforeAll(() => {
    if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
    if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
    assertPinnedTag("v26.03");
    assertCardsPinnedTag("v1.147.6");
  });

  function must(
    state: ReturnType<typeof createInitialState>,
    action: Parameters<typeof applyAction>[1],
  ) {
    const r = applyAction(state, action);
    if (!r.ok) throw new Error(`${r.error} ${JSON.stringify(r.cites)}`);
    return r.state;
  }

  const intoTheDepthsOptions = () => [
    {
      id: "credits",
      label: "Gain 4¢",
      effect: fx.gainCredits("runner", 4),
    },
    {
      id: "search",
      label: "Search stack for a program and install it",
      effect: fx.searchStackProgramInstall(),
    },
    {
      id: "charge",
      label: "Charge 1 installed card",
      effect: fx.chargeChoose(),
    },
  ];

  const intoTheDepthsEffect = () =>
    fx.exclusiveChoicesPerPassedIce(intoTheDepthsOptions());

  /**
   * Play Into the Depths on HQ with `iceCount` unrezzed ice and walk the run
   * to success (approach pass + jack-out continue per ice).
   */
  function playIntoTheDepthsOnHq(
    iceCount: number,
    extras?: (s: ReturnType<typeof createInitialState>) => void,
  ) {
    let s = createInitialState();
    s = structuredClone(s);
    const ev = instantiateCard("jailbreak", "itd-1", "runner:grip");
    ev.playCost = 0;
    ev.title = "Into the Depths";
    ev.defId = "into-the-depths";
    ev.runEvent = {
      servers: "any",
      skipBreach: true,
      onSuccessfulRun: intoTheDepthsEffect(),
    };
    s.cards["itd-1"] = ev;
    s.runner.hand = ["itd-1"];
    s.runner.credits = 20;
    s.runner.clicks = 4;
    s.activeSide = "runner";
    s.timingKey = "runner.takeAction";
    // Keep breach empty so skipBreach isn't required for completion
    s.corp.hand = [];

    s.servers.hq.ice = [];
    for (let i = 0; i < iceCount; i++) {
      const id = `ice-${i}`;
      const ice = instantiateCard("ice-wall", id, "server:hq:ice");
      ice.rezzed = false;
      s.cards[id] = ice;
      s.servers.hq.ice.push(id);
    }

    extras?.(s);
    s = must(s, { type: "play_event", cardId: "itd-1", serverId: "hq" });

    // Unrezzed ice: approach PAW → (decline rez) → movement/pass → jack-out window
    for (let i = 0; i < iceCount; i++) {
      expect(s.timingKey).toBe("run.approachPaw");
      s = must(s, { type: "pass_window" });
      s = must(s, { type: "pass_window" });
      expect(s.timingKey).toBe("run.jackOutWindow");
      s = must(s, { type: "continue_run" });
    }

    // Approach server PAW → success (skipBreach opens exclusive choices; stay on run)
    while (
      s.run &&
      !s.pendingChoice &&
      !s.pendingExclusiveChoices &&
      (s.timingKey === "run.approachServerPaw" ||
        s.timingKey === "run.approachPaw" ||
        s.timingKey === "run.jackOutWindow")
    ) {
      if (s.timingKey === "run.jackOutWindow") {
        s = must(s, { type: "continue_run" });
      } else {
        s = must(s, { type: "pass_window" });
      }
    }
    return s;
  }

  describe("MS Into the Depths exclusive choices IR (always)", () => {
    it("accepts exclusive_choices_per_passed_ice + search_stack_program_install IR", () => {
      expect(validateEffectTree(intoTheDepthsEffect())).toBeNull();
      expect(validateEffectTree(fx.searchStackProgramInstall())).toBeNull();
      expect(validateEffectTree(fx.installStackProgram("x"))).toBeNull();
    });

    it("rejects empty exclusive options", () => {
      expect(
        validateEffectTree({
          op: "do",
          action: { kind: "exclusive_choices_per_passed_ice", options: [] },
        } as never),
      ).toMatch(/options/);
    });

    it("0 ice passed → no choices", () => {
      const s = playIntoTheDepthsOnHq(0);
      expect(s.pendingChoice).toBeNull();
      expect(s.pendingExclusiveChoices).toBeNull();
      expect(s.turn.successfulRunThisTurn).toBe(true);
    });

    it("1 ice passed → choose among 3 exclusive options; credits only", () => {
      let s = playIntoTheDepthsOnHq(1);
      expect(s.run?.passedIceIds?.length ?? 0).toBe(1);
      expect(s.pendingExclusiveChoices?.remaining).toBe(1);
      expect(s.pendingChoice?.options.map((o) => o.id).sort()).toEqual([
        "charge",
        "credits",
        "search",
      ]);

      const before = s.runner.credits;
      s = must(s, { type: "choose_option", optionId: "credits" });
      expect(s.runner.credits).toBe(before + 4);
      expect(s.pendingChoice).toBeNull();
      expect(s.pendingExclusiveChoices).toBeNull();
    });

    it("2 ice → two distinct options; cannot reuse credits", () => {
      let s = playIntoTheDepthsOnHq(2);
      expect(s.run?.passedIceIds?.length ?? 0).toBe(2);
      expect(s.pendingExclusiveChoices?.remaining).toBe(2);

      const before = s.runner.credits;
      s = must(s, { type: "choose_option", optionId: "credits" });
      expect(s.runner.credits).toBe(before + 4);
      // One remaining among charge + search
      expect(s.pendingExclusiveChoices?.remaining).toBe(1);
      expect(s.pendingChoice?.options.map((o) => o.id).sort()).toEqual([
        "charge",
        "search",
      ]);

      // Charge with no chargeable card → no-op, exclusive finishes
      s = must(s, { type: "choose_option", optionId: "charge" });
      expect(s.pendingChoice).toBeNull();
      expect(s.pendingExclusiveChoices).toBeNull();
    });

    it("3 ice → all three modes; search installs sole stack program", () => {
      let s = playIntoTheDepthsOnHq(3, (st) => {
        const prog = instantiateCard("leech", "prog-1", "runner:stack");
        prog.installCost = 2;
        st.cards["prog-1"] = prog;
        st.runner.deck = ["prog-1"];
        // Chargeable card on  (sole — program has no power counters)
        const hyp = instantiateCard("hyperbaric", "hyp-1", "runner:installed");
        hyp.powerCounters = 1;
        st.cards["hyp-1"] = hyp;
        st.runner.installed.push("hyp-1");
      });
      expect(s.run?.passedIceIds?.length ?? 0).toBe(3);

      const before = s.runner.credits;
      s = must(s, { type: "choose_option", optionId: "credits" });
      expect(s.runner.credits).toBe(before + 4);

      s = must(s, { type: "choose_option", optionId: "search" });
      // Sole program auto-installs; last mode (charge) auto-resolves sole chargeable
      expect(s.runner.installed).toContain("prog-1");
      expect(s.runner.deck).not.toContain("prog-1");
      expect(s.cards["prog-1"]!.zone).toBe("runner:installed");
      expect(s.cards["hyp-1"]!.powerCounters).toBe(2);
      expect(s.pendingChoice).toBeNull();
      expect(s.pendingExclusiveChoices).toBeNull();
    });

    it("search with multiple affordable programs opens install choice", () => {
      let s = playIntoTheDepthsOnHq(1, (st) => {
        const a = instantiateCard("propeller", "prog-a", "runner:stack");
        a.installCost = 1;
        const b = instantiateCard("leech", "prog-b", "runner:stack");
        b.installCost = 1;
        st.cards["prog-a"] = a;
        st.cards["prog-b"] = b;
        st.runner.deck = ["prog-a", "prog-b"];
      });

      s = must(s, { type: "choose_option", optionId: "search" });
      expect(s.pendingChoice?.options.map((o) => o.id).sort()).toEqual([
        "stack-install-prog-a",
        "stack-install-prog-b",
      ]);
      expect(s.pendingExclusiveChoices?.remaining).toBe(0);

      s = must(s, { type: "choose_option", optionId: "stack-install-prog-b" });
      expect(s.runner.installed).toContain("prog-b");
      expect(s.runner.installed).not.toContain("prog-a");
      expect(s.pendingExclusiveChoices).toBeNull();
    });

    it("4+ ice still caps at 3 exclusive resolutions", () => {
      const s = playIntoTheDepthsOnHq(4);
      expect(s.run?.passedIceIds?.length ?? 0).toBe(4);
      expect(s.pendingExclusiveChoices?.remaining).toBe(3);
    });
  });

  describe("MS Into the Depths card def (when wired)", () => {
    it("into-the-depths wires exclusive_choices_per_passed_ice when clear", () => {
      const def = getCardDef("into-the-depths");
      if ((def.unsupported?.length ?? 0) > 0) {
        expect(def.unsupported?.[0]).toMatch(/passed-ice|unique option/i);
        return;
      }
      expect(def.runEvent?.onSuccessfulRun).toBeTruthy();
      const fxTree = def.runEvent!.onSuccessfulRun!;
      expect(validateEffectTree(fxTree)).toBeNull();
      expect(
        fxTree.op === "do" &&
          fxTree.action.kind === "exclusive_choices_per_passed_ice",
      ).toBe(true);
    });
  });
  });

  describe("midnight-sun-ir", () => {
  beforeAll(() => {
    if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
    if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
    assertPinnedTag("v26.03");
    assertCardsPinnedTag("v1.147.6");
  });

  function must(
    state: ReturnType<typeof createInitialState>,
    action: Parameters<typeof applyAction>[1],
  ) {
    const r = applyAction(state, action);
    if (!r.ok) throw new Error(`${r.error} ${JSON.stringify(r.cites)}`);
    return r.state;
  }

  describe("cards pin v0.48.0 + Midnight Sun load", () => {
    it("pins v0.48.0 and loads MS wave (supported)", () => {
      const pool = loadCardPool(true);
      expect(pool.corpusOrder).toEqual([
        "core",
        "what-lies-ahead",
        "trace-amount",
        "cyber-exodus",
        "a-study-in-static",
        "humanitys-shadow",
        "future-proof",
        "creation-and-control",
        "opening-moves",
        "stalwart",
        "mala-tempora",
        "true-colors",
        "fear-and-loathing",
        "double-time",
        "honor-and-profit",
        "upstalk",
        "the-spaces-between",
        "first-contact",
        "up-and-over",
        "all-that-remains",
        "the-source",
        "order-and-chaos",
        "the-valley",
        "breaker-bay",
        "chrome-city",
        "the-underway",
        "old-hollywood",
        "the-universe-of-tomorrow",
        "data-and-destiny",
        "kala-ghoda",
        "business-first",
        "democracy-and-dogma",
        "salsette-island",
        "the-liberated-mind",
        "fear-the-masses",
        "twenty-three-seconds",
        "blood-money",
        "escalation",
        "intervention",
        "martial-law",
        "quorum",
        "daedalus-complex",
        "station-one",
        "terminal-directive",
        "earths-scion",
        "blood-and-water",
        "free-mars",
        "crimson-dust",
        "revised-core",
        "sovereign-sight",
        "down-the-white-nile",
        "council-of-the-crest",
        "the-devil-and-the-dragon",
        "whispers-in-nalubaale",
        "kampala-ascendent",
        "reign-and-reverie",
        "magnum-opus",
        "system-core-2019",
        "downfall",
        "uprising",
        "system-gateway",
        "system-update-2021",
        "midnight-sun",
        "parhelion",
        "the-automata-initiative",
        "rebellion-without-rehearsal",
        "elevation",
        "vantage-point",
      ]);
      expect(pool.waves["midnight-sun"].status).toBe("supported");
      const catalog = loadCardCatalog(true);
      // RaR +56 new files (2 SC19 reprints already counted); SC19 +84 (63 Gateway/SU21 reprints already counted).
      const corpus = 49 + 15 /*wla unique titles incl Plascrete (corpus card, not fixtures wave)*/ + 15 + 13 + 15 + 15 + 13 + 46 + 16 + 17 + 18 + 18 + 15 + 19 + 50 + 17 + 20 + 18 + 18 + 17 + 19 + 55 + 19 + 18 + 56 + 84 + 65 + 65 + 77 + 82 + 65 + 63 + 65 + 65 + 82 + 66 + 18 + 17 + 19 + 18 + 54 + 18 + 19 + 19 + 19 + 18 + 18 /*ftm*/ + 20 /*23s*/ + 20 /*bm*/ + 20 /*es*/ + 18 /*in*/ + 20 /*ml*/ + 20 /*qu*/ + 20 /*dc*/ + 20 /*so*/ + 43 /*td*/ + 20 /*eas*/ + 20 /*baw*/ + 20 /*fm*/ + 20 /*cd*/ + 20 /*ss*/ + 20 /*dtwn*/ + 20 /*cotc*/ + 20 /*tdatd*/ + 20 /*win*/ + 20 /*ka*/ + 8 /*mo*/;
      expect(catalog.size).toBe(corpus);
      expect(catalog.has("maskirovka")).toBe(true);
      expect(catalog.has("chastushka")).toBe(true);
    });

    it("Maskirovka IR evaluates (fully-supported MS ice smoke)", () => {
      const def = getCardDef("maskirovka");
      expect(def.unsupported).toEqual([]);
      expect(def.subroutines?.[0]?.effect).toEqual(fx.gainCredits("corp", 2));
      expect(def.subroutines?.[1]?.effect).toEqual(fx.etr());
      const s = createInitialState();
      const ice = instantiateCard("maskirovka", "mask-1", "server:hq:ice");
      s.cards["mask-1"] = ice;
      s.corp.credits = 0;
      const r = evalEffect(
        { state: s, sourceId: "mask-1" },
        def.subroutines![0]!.effect,
      );
      expect(r.ok).toBe(true);
      expect(s.corp.credits).toBe(2);
    });
  });

  describe("sabotage IR (CR §10.12)", () => {
    it("validates and auto-trashes from R&D then HQ facedown", () => {
      expect(validateEffectTree(fx.sabotage(2))).toBeNull();
      expect(CR.sabotage.number).toBe("10.12.1");

      const s = createInitialState();
      // Deck front = top of R&D
      const top = s.corp.deck[0]!;
      const hqBefore = s.corp.hand.length;
      const deckBefore = s.corp.deck.length;
      const r = evalEffect(
        { state: s, sourceId: "runner-id" },
        fx.sabotage(2),
      );
      expect(r.ok).toBe(true);
      expect(s.corp.deck.length).toBe(deckBefore - 2);
      expect(s.corp.hand.length).toBe(hqBefore);
      expect(s.corp.discardPile).toContain(top);
      expect(s.cards[top].faceup).toBe(false);
      expect(s.cards[top].zone).toBe("corp:archives");
    });

    it("trashes all when HQ+R&D < N (CR 10.12.3b)", () => {
      const s = createInitialState();
      s.corp.deck = s.corp.deck.slice(0, 1);
      s.corp.hand = s.corp.hand.slice(0, 1);
      const total = s.corp.deck.length + s.corp.hand.length;
      const r = evalEffect(
        { state: s, sourceId: "runner-id" },
        fx.sabotage(5),
      );
      expect(r.ok).toBe(true);
      expect(s.corp.deck.length).toBe(0);
      expect(s.corp.hand.length).toBe(0);
      expect(s.corp.discardPile.length).toBeGreaterThanOrEqual(total);
      for (const id of s.corp.discardPile.slice(-total)) {
        expect(s.cards[id].faceup).toBe(false);
      }
    });

    it("interactive sabotage pauses for Corp resolve_sabotage", () => {
      let s = createInitialState();
      // Ensure HQ has cards so Corp can choose.
      while (s.corp.hand.length < 2 && s.corp.deck.length > 0) {
        const id = s.corp.deck.shift()!;
        s.corp.hand.push(id);
        s.cards[id].zone = "corp:hq";
      }
      const r = evalEffect(
        { state: s, sourceId: "runner-id" },
        fx.sabotage(2, true),
      );
      expect(r.ok).toBe(true);
      expect(s.pendingSabotage?.amount).toBe(2);

      const legal = queryLegality(s);
      const sabotageActs = legal.legal.filter(
        (a) => a.action.type === "resolve_sabotage",
      );
      expect(sabotageActs.length).toBeGreaterThan(0);

      const pickHq = s.corp.hand.slice(-1);
      s = must(s, { type: "resolve_sabotage", hqCardIds: pickHq });
      expect(s.pendingSabotage).toBeNull();
      expect(s.corp.discardPile.length).toBeGreaterThanOrEqual(2);
      expect(s.cards[pickHq[0]!].faceup).toBe(false);
    });
  });

  describe("mark IR (CR §10.11)", () => {
    it("identify_mark designates a central; second call is no-op", () => {
      expect(validateEffectTree(fx.identifyMark())).toBeNull();
      const s = createInitialState();
      expect(s.markServerId).toBeNull();
      expect(evalEffect({ state: s, sourceId: "runner-id" }, fx.identifyMark()).ok).toBe(
        true,
      );
      expect(s.markServerId).toBeTruthy();
      const first = s.markServerId;
      expect(evalEffect({ state: s, sourceId: "runner-id" }, fx.identifyMark()).ok).toBe(
        true,
      );
      expect(s.markServerId).toBe(first);
      expect(s.log.join("\n")).toMatch(/already/);
    });

    it("has_mark / attacking_mark conditions", () => {
      const s = createInitialState();
      expect(
        evalEffect(
          { state: s, sourceId: "runner-id" },
          fx.if({ op: "has_mark" }, fx.gainCredits("runner", 1)),
        ).ok,
      ).toBe(true);
      expect(s.runner.credits).toBe(5); // no mark → else skipped

      evalEffect({ state: s, sourceId: "runner-id" }, fx.identifyMark());
      const mark = s.markServerId!;
      expect(
        evalEffect(
          { state: s, sourceId: "runner-id" },
          fx.if({ op: "has_mark" }, fx.gainCredits("runner", 1)),
        ).ok,
      ).toBe(true);
      expect(s.runner.credits).toBe(6);

      s.run = {
        attackedServerId: mark,
        phase: "approach_ice",
        position: null,
        successful: null,
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
      expect(
        evalEffect(
          { state: s, sourceId: "runner-id" },
          fx.if({ op: "attacking_mark" }, fx.gainCredits("runner", 1)),
        ).ok,
      ).toBe(true);
      expect(s.runner.credits).toBe(7);
    });
  });

  describe("charge IR (CR §10.10)", () => {
    it("charges self only when ≥1 power counter present", () => {
      expect(validateEffectTree(fx.chargeSelf())).toBeNull();
      const s = createInitialState();
      const card = instantiateCard("propeller", "prop-1", "runner:installed");
      card.powerCounters = 0;
      s.cards["prop-1"] = card;
      s.runner.installed.push("prop-1");

      expect(
        evalEffect({ state: s, sourceId: "prop-1" }, fx.chargeSelf()).ok,
      ).toBe(true);
      expect(card.powerCounters).toBe(0);

      card.powerCounters = 2;
      expect(
        evalEffect({ state: s, sourceId: "prop-1" }, fx.chargeSelf()).ok,
      ).toBe(true);
      expect(card.powerCounters).toBe(3);
    });

    it("charge choose auto-picks sole candidate; multi opens pendingChoice", () => {
      const s = createInitialState();
      const a = instantiateCard("propeller", "prop-a", "runner:installed");
      a.powerCounters = 1;
      const b = instantiateCard("revolver", "rev-b", "runner:installed");
      b.powerCounters = 2;
      s.cards["prop-a"] = a;
      s.cards["rev-b"] = b;
      s.runner.installed.push("prop-a", "rev-b");

      expect(
        evalEffect({ state: s, sourceId: "runner-id" }, fx.chargeChoose()).ok,
      ).toBe(true);
      expect(s.pendingChoice?.chooser).toBe("runner");
      expect(s.pendingChoice?.options.length).toBe(2);

      const opt = s.pendingChoice!.options[0]!;
      const before = s.cards[
        opt.id.startsWith("charge-") ? opt.id.slice("charge-".length) : ""
      ]?.powerCounters;
      const next = must(s, { type: "choose_option", optionId: opt.id });
      expect(next.pendingChoice).toBeNull();
      const targetId = opt.id.slice("charge-".length);
      expect(next.cards[targetId].powerCounters).toBe((before ?? 0) + 1);
    });

    it("fail-closed on unknown charge pick", () => {
      expect(
        validateEffectTree({
          op: "do",
          action: { kind: "charge", pick: "nope" },
        }),
      ).toMatch(/pick/);
    });
  });
  });

  describe("midnight-sun-ivik", () => {
  beforeAll(() => {
    if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
    if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
    assertPinnedTag("v26.03");
    assertCardsPinnedTag("v1.147.6");
  });

  function must(
    state: ReturnType<typeof createInitialState>,
    action: Parameters<typeof applyAction>[1],
  ) {
    const r = applyAction(state, action);
    if (!r.ok) throw new Error(`${r.error} ${JSON.stringify(r.cites)}`);
    return r.state;
  }

  /** Approach PAW with unrezzed Ivik on a remote; optional rezzed code gates elsewhere. */
  function approachIvik(opts: {
    rezzedCodeGates?: number;
    rezzedBarriers?: number;
    discount?: { subtype: string; amount: number };
  }) {
    let s = createInitialState();
    s = structuredClone(s);

    const ivik = instantiateCard("ivik", "ivik-1", "server:remote-1:ice");
    ivik.rezCostDiscountPerRezzedSubtype = opts.discount ?? {
      subtype: "code gate",
      amount: 1,
    };
    ivik.unsupported = [];
    s.cards["ivik-1"] = ivik;
    s.servers["remote-1"] = {
      id: "remote-1",
      kind: "remote",
      ice: ["ivik-1"],
      root: [],
    };

    let n = 0;
    for (let i = 0; i < (opts.rezzedCodeGates ?? 0); i++) {
      n += 1;
      const id = `cg-${n}`;
      const ice = instantiateCard("enigma", id, "server:hq:ice");
      ice.rezzed = true;
      ice.faceup = true;
      s.cards[id] = ice;
      s.servers.hq.ice.push(id);
    }
    for (let i = 0; i < (opts.rezzedBarriers ?? 0); i++) {
      n += 1;
      const id = `bar-${n}`;
      const ice = instantiateCard("ice-wall", id, "server:rd:ice");
      ice.rezzed = true;
      ice.faceup = true;
      s.cards[id] = ice;
      s.servers.rd.ice.push(id);
    }

    s.corp.credits = 20;
    s.runner.credits = 10;
    s.runner.clicks = 4;
    s.activeSide = "runner";
    s.timingKey = "runner.takeAction";

    s = must(s, { type: "basic_run", serverId: "remote-1" as ServerId });
    return s;
  }

  describe("MS rezCostDiscountPerRezzedSubtype (Ivik)", () => {
    it("counts 0 with no rezzed matching ice", () => {
      const s = approachIvik({});
      expect(rezCostDiscountPerRezzedSubtype(s, "ivik-1")).toBe(0);
    });

    it("counts 1¢ per rezzed code gate", () => {
      const s = approachIvik({ rezzedCodeGates: 3 });
      expect(rezCostDiscountPerRezzedSubtype(s, "ivik-1")).toBe(3);
    });

    it("ignores rezzed ice lacking the subtype", () => {
      const s = approachIvik({ rezzedCodeGates: 1, rezzedBarriers: 2 });
      expect(rezCostDiscountPerRezzedSubtype(s, "ivik-1")).toBe(1);
    });

    it("ignores unrezzed matching ice", () => {
      let s = approachIvik({ rezzedCodeGates: 0 });
      s = structuredClone(s);
      const ice = instantiateCard("enigma", "cg-unrez", "server:hq:ice");
      ice.rezzed = false;
      s.cards["cg-unrez"] = ice;
      s.servers.hq.ice.push("cg-unrez");
      expect(rezCostDiscountPerRezzedSubtype(s, "ivik-1")).toBe(0);
    });

    it("does not count the ice being rezzed", () => {
      let s = createInitialState();
      s = structuredClone(s);
      const ivik = instantiateCard("ivik", "ivik-1", "server:hq:ice");
      // Even if somehow subtype matched, self must not count while unrezzed.
      ivik.subtypes = ["barrier", "ap", "code gate"];
      ivik.rezzed = false;
      ivik.rezCostDiscountPerRezzedSubtype = {
        subtype: "code gate",
        amount: 1,
      };
      s.cards["ivik-1"] = ivik;
      s.servers.hq.ice = ["ivik-1"];
      expect(rezCostDiscountPerRezzedSubtype(s, "ivik-1")).toBe(0);
    });

    it("rezzes Ivik paying base−N with N rezzed code gates", () => {
      let s = approachIvik({ rezzedCodeGates: 2 });
      const base = s.cards["ivik-1"].rezCost ?? 0;
      expect(base).toBe(7);
      const before = s.corp.credits;
      s = must(s, { type: "rez_ice", cardId: "ivik-1" });
      expect(s.corp.credits).toBe(before - (base - 2));
      expect(
        s.log.some((l) => /rezzes Ivik for 5¢ \(base 7−2\)/.test(l)),
      ).toBe(true);
    });

    it("floors rez cost at 0 when discount exceeds base", () => {
      let s = approachIvik({ rezzedCodeGates: 10 });
      const before = s.corp.credits;
      s = must(s, { type: "rez_ice", cardId: "ivik-1" });
      expect(s.corp.credits).toBe(before);
      expect(s.cards["ivik-1"].rezzed).toBe(true);
    });

    it("legality includes rez when discount makes cost affordable", () => {
      let s = approachIvik({ rezzedCodeGates: 4 });
      // Ivik 7 − 4 = 3
      s = structuredClone(s);
      s.corp.credits = 3;
      s = must(s, { type: "pass_window" });
      const legal = queryLegality(s);
      expect(
        legal.legal.some(
          (e) => e.action.type === "rez_ice" && e.action.cardId === "ivik-1",
        ),
      ).toBe(true);

      s = must(s, { type: "rez_ice", cardId: "ivik-1" });
      expect(s.corp.credits).toBe(0);
    });

    it("legality omits rez when Corp still cannot afford after discount", () => {
      let s = approachIvik({ rezzedCodeGates: 1 });
      // Ivik 7 − 1 = 6
      s = structuredClone(s);
      s.corp.credits = 5;
      s = must(s, { type: "pass_window" });
      const legal = queryLegality(s);
      expect(
        legal.legal.some(
          (e) => e.action.type === "rez_ice" && e.action.cardId === "ivik-1",
        ),
      ).toBe(false);

      const r = applyAction(s, { type: "rez_ice", cardId: "ivik-1" });
      expect(r.ok).toBe(false);
    });

    it("stacks with continuous ice rez cost increases (net modifier)", () => {
      let s = approachIvik({ rezzedCodeGates: 2 });
      s = structuredClone(s);
      const cradle = instantiateCard("cats-cradle", "cc-1", "runner:installed");
      cradle.iceRezCostIncreaseBySubtype = {
        subtype: "barrier",
        amount: 1,
      };
      s.cards["cc-1"] = cradle;
      s.runner.installed = ["cc-1"];
      // Ivik is barrier: +1 from Cat's Cradle, −2 from two code gates → net −1
      const base = s.cards["ivik-1"].rezCost ?? 0;
      const before = s.corp.credits;
      s = must(s, { type: "rez_ice", cardId: "ivik-1" });
      expect(s.corp.credits).toBe(before - (base + 1 - 2));
    });
  });

  describe("MS Ivik card wiring (v0.31.0+)", () => {
    it("Ivik clears unsupported with rezCostDiscountPerRezzedSubtype", () => {
      const def = getCardDef("ivik");
      expect(def.unsupported).toEqual([]);
      expect(def.rezCostDiscountPerRezzedSubtype).toEqual({
        subtype: "code gate",
        amount: 1,
      });
      expect(def.type).toBe("ice");
      expect(def.rezCost).toBe(7);
      expect(def.strength).toBe(5);
      expect(def.subtypes).toEqual(expect.arrayContaining(["barrier", "ap"]));
    });
  });
  });

  describe("midnight-sun-light-the-fire", () => {
  beforeAll(() => {
    if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
    if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
    assertPinnedTag("v26.03");
    assertCardsPinnedTag("v1.147.6");
  });

  function must(
    state: ReturnType<typeof createInitialState>,
    action: Parameters<typeof applyAction>[1],
  ) {
    const r = applyAction(state, action);
    if (!r.ok) throw new Error(`${r.error} ${JSON.stringify(r.cites)}`);
    return r.state;
  }

  function lightTheFireAbility(): PaidAbility {
    return {
      id: "ltf-run",
      label:
        "[click], trash, suffer 1 core damage: run remote; blank root; on success trash root",
      clickCost: 1,
      creditCost: 0,
      cost: { clicks: 1, trashSelf: true, coreDamage: 1 },
      windows: ["runner_action_paw"],
      effect: fx.do({ kind: "gain_credits", side: "runner", amount: 0 }),
      startsRun: {
        servers: "remote",
        blankAttackedServerRoot: true,
        onSuccessfulRun: fx.trashAttackedServerRoot(),
      },
    };
  }

  function setupRemoteWithRoot(opts?: {
    rootDefId?: string;
    rezzed?: boolean;
    withIce?: boolean;
  }) {
    let s = createInitialState();
    s = structuredClone(s);

    const remoteId = "remote-1";
    s.servers[remoteId] = {
      id: remoteId,
      kind: "remote",
      ice: [],
      root: [],
    };

    if (opts?.withIce) {
      const ice = instantiateCard("tithe", "ice-1", `server:${remoteId}:ice`);
      ice.rezzed = false;
      s.cards["ice-1"] = ice;
      s.servers[remoteId].ice = ["ice-1"];
    }

    const rootDef = opts?.rootDefId ?? "pad-campaign";
    const asset = instantiateCard(rootDef, "root-1", `server:${remoteId}:root`);
    asset.rezzed = opts?.rezzed ?? true;
    s.cards["root-1"] = asset;
    s.servers[remoteId].root = ["root-1"];

    const ltf = instantiateCard("light-the-fire", "ltf-1", "runner:installed");
    ltf.unsupported = [];
    ltf.paidAbilities = [lightTheFireAbility()];
    s.cards["ltf-1"] = ltf;
    s.runner.installed = ["ltf-1"];
    s.runner.credits = 10;
    s.runner.clicks = 4;
    // Grip fillers so core-damage cost does not flatline.
    for (let i = 0; i < 3; i++) {
      const id = `filler-${i}`;
      const c = instantiateCard("sure-gamble", id, "runner:grip");
      s.cards[id] = c;
      s.runner.hand.push(id);
    }
    s.corp.credits = 20;
    s.activeSide = "runner";
    s.timingKey = "runner.takeAction";
    return s;
  }

  describe("MS Light the Fire! IR (always)", () => {
    it("serversMatchingSpec remote excludes centrals", () => {
      const s = createInitialState();
      const remotes = serversMatchingSpec(s, { servers: "remote" });
      expect(remotes.every((id) => s.servers[id].kind === "remote")).toBe(true);
      expect(remotes.includes("hq")).toBe(false);
      expect(isServerAllowedForSpec(s, { servers: "remote" }, "hq")).toBe(false);
    });

    it("pays click+trash+core damage and starts a remote run with blanking", () => {
      let s = setupRemoteWithRoot({ withIce: true });
      const legal = queryLegality(s).legal;
      expect(
        legal.some(
          (e) =>
            e.action.type === "use_paid_ability" &&
            e.action.cardId === "ltf-1" &&
            e.action.abilityId === "ltf-run" &&
            e.action.serverId === "remote-1",
        ),
      ).toBe(true);
      expect(
        legal.some(
          (e) =>
            e.action.type === "use_paid_ability" &&
            e.action.cardId === "ltf-1" &&
            e.action.serverId === "hq",
        ),
      ).toBe(false);

      const clicksBefore = s.runner.clicks;
      const gripBefore = s.runner.hand.length;
      const bdBefore = s.runner.coreDamage;

      s = must(s, {
        type: "use_paid_ability",
        cardId: "ltf-1",
        abilityId: "ltf-run",
        serverId: "remote-1",
      });

      expect(s.runner.clicks).toBe(clicksBefore - 1);
      expect(s.runner.installed.includes("ltf-1")).toBe(false);
      expect(s.runner.discardPile.includes("ltf-1")).toBe(true);
      expect(s.runner.coreDamage).toBe(bdBefore + 1);
      expect(s.runner.hand.length).toBe(gripBefore - 1);
      expect(s.run).not.toBeNull();
      expect(s.run!.attackedServerId).toBe("remote-1");
      expect(s.run!.blankAttackedServerRoot).toBe(true);
      expect(abilitiesSuppressed(s, "root-1")).toBe(true);
    });

    it("blanks Crisium so the run can be declared successful", () => {
      let s = setupRemoteWithRoot({ rootDefId: "crisium-grid", rezzed: true });
      s = must(s, {
        type: "use_paid_ability",
        cardId: "ltf-1",
        abilityId: "ltf-run",
        serverId: "remote-1",
      });
      // Ice-less remote: run auto-walks to completion (run cleared).
      expect(s.run).toBeNull();
      expect(s.servers["remote-1"]).toBeUndefined();
      expect(s.corp.discardPile.includes("root-1")).toBe(true);
      expect(s.log.some((l) => /Run successful/.test(l))).toBe(true);
    });

    it("on success trashes all root cards and skips Hokusai onSuccessfulRun", () => {
      let s = setupRemoteWithRoot({ rootDefId: "hokusai-grid", rezzed: true });
      // Second root card
      const asset = instantiateCard(
        "pad-campaign",
        "root-2",
        "server:remote-1:root",
      );
      asset.rezzed = true;
      s.cards["root-2"] = asset;
      s.servers["remote-1"].root.push("root-2");

      const gripBefore = s.runner.hand.length;
      s = must(s, {
        type: "use_paid_ability",
        cardId: "ltf-1",
        abilityId: "ltf-run",
        serverId: "remote-1",
      });

      expect(s.run).toBeNull();
      expect(s.servers["remote-1"]).toBeUndefined();
      expect(s.corp.discardPile).toEqual(
        expect.arrayContaining(["root-1", "root-2"]),
      );
      // Hokusai would deal 1 net; grip only lost the core-damage cost card.
      expect(s.runner.hand.length).toBe(gripBefore - 1);
    });

    it("fails closed when ability requires a remote and none exist", () => {
      let s = createInitialState();
      s = structuredClone(s);
      // Remove remotes
      for (const id of Object.keys(s.servers)) {
        if (s.servers[id].kind === "remote") delete s.servers[id];
      }
      const ltf = instantiateCard("light-the-fire", "ltf-1", "runner:installed");
      ltf.paidAbilities = [lightTheFireAbility()];
      s.cards["ltf-1"] = ltf;
      s.runner.installed = ["ltf-1"];
      s.runner.clicks = 4;
      for (let i = 0; i < 2; i++) {
        const id = `f-${i}`;
        s.cards[id] = instantiateCard("sure-gamble", id, "runner:grip");
        s.runner.hand.push(id);
      }
      s.activeSide = "runner";
      s.timingKey = "runner.takeAction";

      const legal = queryLegality(s).legal.filter(
        (e) =>
          e.action.type === "use_paid_ability" && e.action.cardId === "ltf-1",
      );
      expect(legal).toHaveLength(0);
    });

    it("soft: when wired, card def exposes remote startsRun + blank + root trash", () => {
      const def = getCardDef("light-the-fire");
      if ((def.unsupported?.length ?? 0) > 0) {
        expect(def.unsupported!.length).toBeGreaterThan(0);
        return;
      }
      const ab = def.paidAbilities?.[0];
      expect(ab?.cost?.trashSelf).toBe(true);
      expect(ab?.cost?.coreDamage).toBe(1);
      expect(ab?.cost?.clicks).toBe(1);
      const sr = ab?.startsRun as StartsRunSpec | undefined;
      expect(sr?.servers).toBe("remote");
      expect(sr?.blankAttackedServerRoot).toBe(true);
      expect(sr?.onSuccessfulRun).toEqual(fx.trashAttackedServerRoot());
    });
  });
  });

  describe("midnight-sun-mark-encounter-bypass", () => {
  beforeAll(() => {
    if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
    if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
    assertPinnedTag("v26.03");
    assertCardsPinnedTag("v1.147.6");
  });

  function must(
    state: ReturnType<typeof createInitialState>,
    action: Parameters<typeof applyAction>[1],
  ) {
    const r = applyAction(state, action);
    if (!r.ok) throw new Error(`${r.error} ${JSON.stringify(r.cites)}`);
    return r.state;
  }

  /** Ice on HQ, Backstitching-shaped resource in rig; run to encounter PAW. */
  function encounterWithBackstitching(opts: {
    markServerId: ServerId | null;
    runServerId: ServerId;
  }) {
    let s = createInitialState();
    s = structuredClone(s);
    s.markServerId = opts.markServerId;

    const ice = instantiateCard("tithe", "ice-1", `server:${opts.runServerId}:ice`);
    ice.rezzed = false;
    s.cards["ice-1"] = ice;
    s.servers[opts.runServerId].ice = ["ice-1"];

    const bs = instantiateCard("backstitching", "bs-1", "runner:installed");
    bs.paidAbilities = [
      {
        id: "backstitching-bypass",
        label: "Trash Backstitching: bypass encountered ice (mark run)",
        clickCost: 0,
        creditCost: 0,
        cost: { trashSelf: true },
        windows: ["encounter_paw"],
        requireAttackingMark: true,
        effect: fx.do({ kind: "bypass_current_ice" }),
      },
    ];
    s.cards["bs-1"] = bs;
    s.runner.installed = ["bs-1"];
    s.runner.credits = 10;
    s.runner.clicks = 4;
    s.corp.credits = 20;
    s.activeSide = "runner";
    s.timingKey = "runner.takeAction";

    s = must(s, { type: "basic_run", serverId: opts.runServerId });
    s = must(s, { type: "rez_ice", cardId: "ice-1" });
    s = must(s, { type: "pass_window" });
    expect(s.timingKey).toBe("run.encounterPaw");
    return s;
  }

  describe("MS requireAttackingMark encounter bypass IR (always)", () => {
    it("trashes self and bypasses ice when attacking the mark", () => {
      let s = encounterWithBackstitching({
        markServerId: "hq",
        runServerId: "hq",
      });

      const legal = queryLegality(s).legal;
      expect(
        legal.some(
          (e) =>
            e.action.type === "use_paid_ability" &&
            e.action.cardId === "bs-1" &&
            e.action.abilityId === "backstitching-bypass",
        ),
      ).toBe(true);

      s = must(s, {
        type: "use_paid_ability",
        cardId: "bs-1",
        abilityId: "backstitching-bypass",
      });

      expect(s.runner.installed).not.toContain("bs-1");
      expect(s.runner.discardPile).toContain("bs-1");
      expect(s.cards["bs-1"]!.zone).toBe("runner:heap");
      expect(s.run?.bypassedIceIds).toContain("ice-1");
      expect(s.run?.encounter?.broken.every(Boolean)).toBe(true);
      expect(s.log.some((l) => /Bypass/i.test(l))).toBe(true);

      // All subs broken → pass window advances past encounter into movement.
      s = must(s, { type: "pass_window" });
      expect(s.timingKey).not.toBe("run.encounterPaw");
    });

    it("ability is illegal when not attacking the mark", () => {
      const s = encounterWithBackstitching({
        markServerId: "rd",
        runServerId: "hq",
      });

      const legal = queryLegality(s).legal;
      expect(
        legal.some(
          (e) =>
            e.action.type === "use_paid_ability" &&
            e.action.abilityId === "backstitching-bypass",
        ),
      ).toBe(false);

      const bad = applyAction(s, {
        type: "use_paid_ability",
        cardId: "bs-1",
        abilityId: "backstitching-bypass",
      });
      expect(bad.ok).toBe(false);
      if (!bad.ok) {
        expect(bad.error).toMatch(/mark/i);
      }
    });

    it("ability is illegal when no mark is designated", () => {
      const s = encounterWithBackstitching({
        markServerId: null,
        runServerId: "hq",
      });

      const bad = applyAction(s, {
        type: "use_paid_ability",
        cardId: "bs-1",
        abilityId: "backstitching-bypass",
      });
      expect(bad.ok).toBe(false);
    });
  });

  describe("MS Backstitching card wiring (v0.31.0+)", () => {
    it("wires paid bypass; unsupported empty", () => {
      const def = getCardDef("backstitching");
      expect(def.unsupported).toEqual([]);
      expect(def.onTurnBegin).toBeTruthy();
      const ab = def.paidAbilities?.find((a) => a.id === "backstitching-bypass");
      expect(ab).toBeTruthy();
      expect(ab!.requireAttackingMark).toBe(true);
      expect(ab!.cost?.trashSelf).toBe(true);
      expect(ab!.windows).toContain("encounter_paw");
      expect(ab!.effect).toEqual({
        op: "do",
        action: { kind: "bypass_current_ice" },
      });
    });
  });
  });

  describe("midnight-sun-mark-run", () => {
  beforeAll(() => {
    if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
    if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
    assertPinnedTag("v26.03");
    assertCardsPinnedTag("v1.147.6");
  });

  function must(
    state: ReturnType<typeof createInitialState>,
    action: Parameters<typeof applyAction>[1],
  ) {
    const r = applyAction(state, action);
    if (!r.ok) throw new Error(`${r.error} ${JSON.stringify(r.cites)}`);
    return r.state;
  }

  function assertCardsMarkRunWired(): void {
    const carpe = getCardDef("carpe-diem");
    const sable = getCardDef("nyusha-sable-sintashta-symphonic-prodigy");
    expect(carpe.unsupported).toEqual([]);
    expect(sable.unsupported).toEqual([]);
    expect(sable.onSuccessfulRun).toBeTruthy();
  }

  describe("MS mark-run IR (always)", () => {
    it("serversMatchingSpec mark returns designated mark only", () => {
      const s = createInitialState();
      expect(serversMatchingSpec(s, { servers: "mark" })).toEqual([]);
      s.markServerId = "rd";
      expect(serversMatchingSpec(s, { servers: "mark" })).toEqual(["rd"]);
    });

    it("start_run_on_mark queues pending then starts run via choose", () => {
      let s = createInitialState();
      s = structuredClone(s);
      s.markServerId = "hq";
      s.servers.hq.ice = [];
      s.runner.credits = 5;
      s.runner.clicks = 4;
      s.activeSide = "runner";
      s.timingKey = "runner.takeAction";

      const ev = instantiateCard("sure-gamble", "carpe-1", "runner:grip");
      ev.playCost = 0;
      ev.onPlay = fx.seq(
        fx.identifyMark(),
        fx.gainCredits("runner", 4),
        {
          op: "choose",
          chooser: "runner",
          options: [
            {
              id: "run-mark",
              label: "Make a run on the mark",
              effect: fx.startRunOnMark(),
            },
            {
              id: "decline",
              label: "Decline",
              effect: fx.seq(),
            },
          ],
        },
      );
      s.cards["carpe-1"] = ev;
      s.runner.hand = ["carpe-1"];

      s = must(s, { type: "play_event", cardId: "carpe-1" });
      expect(s.pendingChoice?.chooser).toBe("runner");
      expect(s.runner.credits).toBe(9);
      expect(s.markServerId).toBeTruthy();

      s = must(s, { type: "choose_option", optionId: "run-mark" });
      expect(s.pendingStartRunOnMark).toBeNull();
      expect(s.turn.successfulRunThisTurn).toBe(true);
      expect(s.run).toBeNull();
    });

    it("Carpe-shaped decline skips the run", () => {
      let s = createInitialState();
      s = structuredClone(s);
      s.servers.rd.ice = [];
      s.runner.credits = 5;
      s.runner.clicks = 4;
      s.activeSide = "runner";
      s.timingKey = "runner.takeAction";

      const ev = instantiateCard("sure-gamble", "carpe-2", "runner:grip");
      ev.playCost = 0;
      ev.onPlay = fx.seq(fx.identifyMark(), fx.gainCredits("runner", 4), {
        op: "choose",
        chooser: "runner",
        options: [
          {
            id: "run-mark",
            label: "Make a run on the mark",
            effect: fx.startRunOnMark(),
          },
          { id: "decline", label: "Decline", effect: fx.seq() },
        ],
      });
      s.cards["carpe-2"] = ev;
      s.runner.hand = ["carpe-2"];

      s = must(s, { type: "play_event", cardId: "carpe-2" });
      const clicksBefore = s.runner.clicks;
      s = must(s, { type: "choose_option", optionId: "decline" });
      expect(s.turn.successfulRunThisTurn).toBe(false);
      expect(s.run).toBeNull();
      // deferAfterBasicAction should have completed the action
      expect(s.runner.clicks).toBe(clicksBefore);
    });

    it("identity onSuccessfulRun once-per-turn on mark gains a click", () => {
      let s = createInitialState();
      s = structuredClone(s);
      const id = s.cards[s.runner.identityId]!;
      id.onSuccessfulRun = {
        op: "if",
        cond: { op: "attacking_mark" },
        then: fx.gainClicks("runner", 1),
      };
      id.onSuccessfulRunOncePerTurn = true;

      // Archives: empty breach completes immediately.
      s.markServerId = "archives";
      s.servers.archives.ice = [];
      s.corp.discardPile = [];
      s.activeSide = "runner";
      s.timingKey = "runner.takeAction";
      s.runner.clicks = 4;
      const clicksBefore = s.runner.clicks;
      s = must(s, { type: "basic_run", serverId: "archives" });
      expect(s.run).toBeNull();
      expect(s.turn.successfulRunThisTurn).toBe(true);
      expect(s.runner.clicks).toBe(clicksBefore); // spent 1 for run, gained 1 from ID
      expect(s.turn.onSuccessfulRunFiredIds).toContain(s.runner.identityId);

      // Second successful mark run same turn: no second click
      if (s.timingKey === "runner.actionPaw") {
        s = must(s, { type: "pass_window" });
      }
      expect(s.timingKey).toBe("runner.takeAction");
      s.runner.clicks = 4;
      s = must(s, { type: "basic_run", serverId: "archives" });
      expect(s.runner.clicks).toBe(3);
    });
  });

  describe("MS mark-run card wiring", () => {
    it("Carpe Diem and Nyusha clear unsupported", () => {
      assertCardsMarkRunWired();
    });

    it("Carpe Diem play may run mark end-to-end", () => {
      assertCardsMarkRunWired();
      let s = createInitialState();
      s = structuredClone(s);
      // Use Nyusha so onTurnBegin identify is irrelevant; Carpe identifies itself
      const id = instantiateCard(
        "nyusha-sable-sintashta-symphonic-prodigy",
        "sable-id",
        "runner:identity",
      );
      s.cards["sable-id"] = id;
      s.runner.identityId = "sable-id";

      const carpe = instantiateCard("carpe-diem", "carpe-live", "runner:grip");
      s.cards["carpe-live"] = carpe;
      s.runner.hand = ["carpe-live"];
      s.runner.credits = 5;
      s.runner.clicks = 4;
      s.activeSide = "runner";
      s.timingKey = "runner.takeAction";
      for (const sid of ["hq", "rd", "archives"] as const) {
        s.servers[sid].ice = [];
      }

      s = must(s, { type: "play_event", cardId: "carpe-live" });
      expect(s.pendingChoice?.options.map((o) => o.id)).toEqual(
        expect.arrayContaining(["run-mark", "decline"]),
      );
      expect(s.runner.credits).toBe(8); // 5 - 1 play + 4 gain
      s = must(s, { type: "choose_option", optionId: "run-mark" });
      expect(s.turn.successfulRunThisTurn).toBe(true);
    });
  });
  });

  describe("midnight-sun-mestnichestvo", () => {
  beforeAll(() => {
    if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
    if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
    assertPinnedTag("v26.03");
    assertCardsPinnedTag("v1.147.6");
  });

  function must(
    state: ReturnType<typeof createInitialState>,
    action: Parameters<typeof applyAction>[1],
  ) {
    const r = applyAction(state, action);
    if (!r.ok) throw new Error(`${r.error} ${JSON.stringify(r.cites)}`);
    return r.state;
  }

  function mestOnEncounter(): Effect {
    return fx.choose("corp", [
      {
        id: "remove-adv",
        label: "Remove 1 advancement: Runner loses 3¢",
        effect: fx.removeAdvancements(1, fx.loseCredits("runner", 3)),
      },
      {
        id: "decline",
        label: "Decline",
        effect: fx.gainCredits("corp", 0),
      },
    ]);
  }

  describe("MS remove_advancements (Mestnichestvo)", () => {
    it("validates remove_advancements + then tree", () => {
      expect(
        validateEffectTree(fx.removeAdvancements(1, fx.loseCredits("runner", 3))),
      ).toBeNull();
      expect(validateEffectTree(mestOnEncounter())).toBeNull();
    });

    it("skips then when no advancements to remove", () => {
      let s = createInitialState();
      s = structuredClone(s);
      const ice = instantiateCard("mestnichestvo", "mest-1", "server:hq:ice");
      ice.advancementCounters = 0;
      s.cards["mest-1"] = ice;
      s.servers.hq.ice = ["mest-1"];
      s.runner.credits = 5;

      const r = evalEffect(
        { state: s, sourceId: "mest-1" },
        fx.removeAdvancements(1, fx.loseCredits("runner", 3)),
      );
      expect(r.ok).toBe(true);
      expect(s.cards["mest-1"].advancementCounters).toBe(0);
      expect(s.runner.credits).toBe(5);
    });

    it("removes advancement and runs then", () => {
      let s = createInitialState();
      s = structuredClone(s);
      const ice = instantiateCard("mestnichestvo", "mest-1", "server:hq:ice");
      ice.advancementCounters = 2;
      ice.unsupported = [];
      s.cards["mest-1"] = ice;
      s.servers.hq.ice = ["mest-1"];
      s.runner.credits = 5;

      const r = evalEffect(
        { state: s, sourceId: "mest-1" },
        fx.removeAdvancements(1, fx.loseCredits("runner", 3)),
      );
      expect(r.ok).toBe(true);
      expect(s.cards["mest-1"].advancementCounters).toBe(1);
      expect(s.runner.credits).toBe(2);
    });

    it("encounter choose remove drains Runner 3¢", () => {
      let s = createInitialState();
      s = structuredClone(s);
      const remoteId = "remote-1" as ServerId;
      s.servers[remoteId] = { id: remoteId, kind: "remote", ice: [], root: [] };

      const mest = instantiateCard("mestnichestvo", "mest-1", `server:${remoteId}:ice`);
      mest.unsupported = [];
      mest.onEncounter = mestOnEncounter();
      mest.advancementCounters = 1;
      mest.rezzed = true;
      mest.faceup = true;
      s.cards["mest-1"] = mest;
      s.servers[remoteId].ice = ["mest-1"];

      s.corp.credits = 10;
      s.runner.credits = 6;
      s.runner.clicks = 4;
      s.activeSide = "runner";
      s.timingKey = "runner.takeAction";

      s = must(s, { type: "basic_run", serverId: remoteId });
      if (s.timingKey === "run.approachPaw") {
        s = must(s, { type: "pass_window" });
      }
      expect(s.pendingChoice?.options.some((o) => o.id === "remove-adv")).toBe(
        true,
      );
      s = must(s, { type: "choose_option", optionId: "remove-adv" });
      expect(s.cards["mest-1"].advancementCounters).toBe(0);
      expect(s.runner.credits).toBe(3);
    });
  });

  describe("MS Mestnichestvo card wiring (v0.31.0+)", () => {
    it("Mestnichestvo clears unsupported with remove_advancements onEncounter", () => {
      const def = getCardDef("mestnichestvo");
      expect(def.unsupported).toEqual([]);
      expect(def.type).toBe("ice");
      expect(def.canAdvance).toBe(true);
      expect(def.onEncounter).toEqual(
        expect.objectContaining({
          op: "choose",
          chooser: "corp",
        }),
      );
    });
  });
  });

  describe("midnight-sun-mitosis", () => {
  beforeAll(() => {
    if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
    if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
    assertPinnedTag("v26.03");
    assertCardsPinnedTag("v1.147.6");
  });

  describe("MS install_hq_new_remotes_with_advancements (Mitosis)", () => {
    it("validates mitosis install tree", () => {
      expect(
        validateEffectTree(fx.installHqNewRemotesWithAdvancements(2, 2)),
      ).toBeNull();
    });

    it("installs up to 2 HQ cards into new remotes with advancements and lockout", () => {
      let s = createInitialState();
      s = structuredClone(s);
      s.corp.credits = 20;
      const a = instantiateCard("hostile-takeover", "ag-1", "corp:hq");
      a.installCost = 0;
      const b = instantiateCard("pad-campaign", "as-1", "corp:hq");
      b.installCost = 0;
      const c = instantiateCard("ice-wall", "ice-1", "corp:hq");
      c.installCost = 1;
      s.cards["ag-1"] = a;
      s.cards["as-1"] = b;
      s.cards["ice-1"] = c;
      s.corp.hand = ["ag-1", "as-1", "ice-1"];
      const src = instantiateCard("hedge-fund", "mit-1", "corp:play-area");
      s.cards["mit-1"] = src;

      const r = evalEffect(
        { state: s, sourceId: "mit-1" },
        fx.installHqNewRemotesWithAdvancements(2, 2),
      );
      expect(r.ok).toBe(true);
      expect(s.corp.hand).toEqual(["ice-1"]);
      expect(s.turn.cannotScoreOrRezCardIds.sort()).toEqual(
        ["ag-1", "as-1"].sort(),
      );
      expect(s.cards["ag-1"].advancementCounters).toBe(2);
      expect(s.cards["as-1"].advancementCounters).toBe(2);
      expect(s.cards["ag-1"].zone).toMatch(/^server:remote-\d+:root$/);
      expect(s.cards["as-1"].zone).toMatch(/^server:remote-\d+:root$/);

      // Cannot score locked agenda this turn.
      s.timingKey = "corp.actionPaw";
      s.activeSide = "corp";
      const score = applyAction(s, { type: "score_agenda", cardId: "ag-1" });
      expect(score.ok).toBe(false);
    });
  });
  });

  describe("midnight-sun-moon-pool", () => {
  beforeAll(() => {
    if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
    if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
    assertPinnedTag("v26.03");
    assertCardsPinnedTag("v1.147.6");
  });

  describe("MS moon_pool_resolve (Moon Pool)", () => {
    it("validates moon_pool_resolve tree", () => {
      expect(validateEffectTree(fx.moonPoolResolve(2, 2))).toBeNull();
    });

    it("RFGs self, trashes HQ, reveals Archives agendas into R&D with advancements", () => {
      let s = createInitialState();
      s = structuredClone(s);
      const pool = instantiateCard("pad-campaign", "mp-1", "corp:archives");
      s.cards["mp-1"] = pool;
      s.corp.discardPile = ["mp-1"];

      const hq1 = instantiateCard("hedge-fund", "hq-1", "corp:hq");
      const hq2 = instantiateCard("hedge-fund", "hq-2", "corp:hq");
      s.cards["hq-1"] = hq1;
      s.cards["hq-2"] = hq2;
      s.corp.hand = ["hq-1", "hq-2"];

      const facedownAgenda = instantiateCard(
        "hostile-takeover",
        "fa-1",
        "corp:archives",
      );
      facedownAgenda.faceup = false;
      s.cards["fa-1"] = facedownAgenda;
      s.corp.discardPile.push("fa-1");

      const host = instantiateCard("pad-campaign", "host-1", "server:remote-1:root");
      host.canAdvance = true;
      host.advancementCounters = 0;
      s.cards["host-1"] = host;
      s.servers["remote-1"] = {
        id: "remote-1",
        kind: "remote",
        ice: [],
        root: ["host-1"],
      };

      const r = evalEffect(
        { state: s, sourceId: "mp-1" },
        fx.moonPoolResolve(2, 2),
      );
      expect(r.ok).toBe(true);
      expect(s.cards["mp-1"].zone).toBe("removed-from-game");
      expect(s.corp.hand).toEqual([]);
      expect(s.corp.discardPile).toContain("hq-1");
      expect(s.corp.discardPile).toContain("hq-2");
      expect(s.corp.discardPile).not.toContain("fa-1");
      expect(s.corp.deck).toContain("fa-1");
      expect(s.cards["host-1"].advancementCounters).toBe(1);
    });
  });
  });

  describe("midnight-sun-ob-superheavy", () => {
  beforeAll(() => {
    if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
    if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
    assertPinnedTag("v26.03");
    assertCardsPinnedTag("v1.147.6");
  });

  describe("MS Ob Superheavy search_rd_install_rez_by_printed_rez_cost", () => {
    it("validates search tree", () => {
      expect(
        validateEffectTree(fx.searchRdInstallRezByPrintedRezCost(-1)),
      ).toBeNull();
    });

    it("installs and rezzes R&D card with printed rez = last - 1", () => {
      let s = createInitialState();
      s = structuredClone(s);
      s.turn.lastTrashedRezzedPrintedRezCost = 3;
      const ice = instantiateCard("ice-wall", "iw-1", "corp:rd");
      ice.rezCost = 2;
      s.cards["iw-1"] = ice;
      s.corp.deck = ["iw-1", ...s.corp.deck];
      const id = instantiateCard(
        "haas-bioroid-precision-design",
        "ob-1",
        "corp:identity",
      );
      s.cards["ob-1"] = id;
      s.corp.identityId = "ob-1";

      s.corp.credits = 2;
      const r = evalEffect(
        { state: s, sourceId: "ob-1" },
        fx.searchRdInstallRezByPrintedRezCost(-1),
      );
      expect(r.ok).toBe(true);
      const paid = applyAction(s, { type: "choose_option", optionId: "ob-rez:iw-1" });
      if (!paid.ok) throw new Error(paid.error);
      expect(paid.state.corp.deck).not.toContain("iw-1");
      expect(paid.state.cards["iw-1"].rezzed).toBe(true);
      expect(paid.state.cards["iw-1"].zone).toMatch(/^server:remote-\d+:ice$/);
      expect(paid.state.corp.credits).toBe(0);
    });
  });
  });

  describe("midnight-sun-padma-charge", () => {
  beforeAll(() => {
    if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
    if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
    assertPinnedTag("v26.03");
    assertCardsPinnedTag("v1.147.6");
  });

  function must(
    state: ReturnType<typeof createInitialState>,
    action: Parameters<typeof applyAction>[1],
  ) {
    const r = applyAction(state, action);
    if (!r.ok) throw new Error(`${r.error} ${JSON.stringify(r.cites)}`);
    return r.state;
  }

  function assertPadmaWired(): void {
    const padma = getCardDef("captain-padma-isbister-intrepid-explorer");
    expect(padma.unsupported).toEqual([]);
    expect(padma.onFirstRdRunBeginThisTurn).toBeTruthy();
  }

  describe("MS Padma charge run-begin IR (always)", () => {
    it("accepts onFirstRdRunBeginThisTurn may-charge Effect IR", () => {
      const effect = {
        op: "choose" as const,
        chooser: "runner" as const,
        options: [
          {
            id: "charge",
            label: "Charge 1 installed card",
            effect: fx.chargeChoose(),
          },
          {
            id: "decline",
            label: "Decline",
            effect: fx.seq(),
          },
        ],
      };
      expect(validateEffectTree(effect)).toBeNull();
    });

    it("onFirstRdRunBeginThisTurn fires once on first R&D run begin", () => {
      let s = createInitialState();
      s = structuredClone(s);
      const id = s.cards[s.runner.identityId]!;
      id.onFirstRdRunBeginThisTurn = {
        op: "choose",
        chooser: "runner",
        options: [
          {
            id: "charge",
            label: "Charge 1 installed card",
            effect: fx.chargeChoose(),
          },
          { id: "decline", label: "Decline", effect: fx.seq() },
        ],
      };

      // Chargeable program in rig
      const prog = instantiateCard("propeller", "prop-1", "runner:installed");
      prog.powerCounters = 2;
      s.cards["prop-1"] = prog;
      s.runner.installed.push("prop-1");

      s.servers.rd.ice = [];
      s.servers.rd.root = [];
      s.corp.deck = [];
      s.activeSide = "runner";
      s.timingKey = "runner.takeAction";
      s.runner.clicks = 4;

      s = must(s, { type: "basic_run", serverId: "rd" });
      expect(s.turn.rdRunBegunThisTurn).toBe(true);
      expect(s.pendingChoice?.options.map((o) => o.id)).toEqual(
        expect.arrayContaining(["charge", "decline"]),
      );

      s = must(s, { type: "choose_option", optionId: "charge" });
      expect(s.cards["prop-1"]!.powerCounters).toBe(3);
      expect(s.pendingChoice).toBeNull();
      // Empty R&D ice + empty deck/root → run completes
      expect(s.run).toBeNull();
      expect(s.turn.successfulRunThisTurn).toBe(true);

      // Second R&D run same turn: no second trigger
      if (s.timingKey === "runner.actionPaw") {
        s = must(s, { type: "pass_window" });
      }
      expect(s.timingKey).toBe("runner.takeAction");
      s.runner.clicks = 4;
      s = must(s, { type: "basic_run", serverId: "rd" });
      expect(s.pendingChoice).toBeNull();
      expect(s.cards["prop-1"]!.powerCounters).toBe(3);
    });

    it("does not fire on first HQ run begin", () => {
      let s = createInitialState();
      s = structuredClone(s);
      const id = s.cards[s.runner.identityId]!;
      id.onFirstRdRunBeginThisTurn = {
        op: "choose",
        chooser: "runner",
        options: [
          {
            id: "charge",
            label: "Charge",
            effect: fx.chargeChoose(),
          },
          { id: "decline", label: "Decline", effect: fx.seq() },
        ],
      };
      s.servers.hq.ice = [];
      s.activeSide = "runner";
      s.timingKey = "runner.takeAction";
      s.runner.clicks = 4;
      s = must(s, { type: "basic_run", serverId: "hq" });
      expect(s.turn.rdRunBegunThisTurn).toBe(false);
      expect(s.pendingChoice).toBeNull();
    });

    it("decline skips charge and continues the run", () => {
      let s = createInitialState();
      s = structuredClone(s);
      const id = s.cards[s.runner.identityId]!;
      id.onFirstRdRunBeginThisTurn = {
        op: "choose",
        chooser: "runner",
        options: [
          {
            id: "charge",
            label: "Charge 1 installed card",
            effect: fx.chargeChoose(),
          },
          { id: "decline", label: "Decline", effect: fx.seq() },
        ],
      };
      const prog = instantiateCard("propeller", "prop-2", "runner:installed");
      prog.powerCounters = 1;
      s.cards["prop-2"] = prog;
      s.runner.installed.push("prop-2");
      s.servers.rd.ice = [];
      s.servers.rd.root = [];
      s.corp.deck = [];
      s.activeSide = "runner";
      s.timingKey = "runner.takeAction";
      s.runner.clicks = 4;

      s = must(s, { type: "basic_run", serverId: "rd" });
      s = must(s, { type: "choose_option", optionId: "decline" });
      expect(s.cards["prop-2"]!.powerCounters).toBe(1);
      expect(s.run).toBeNull();
      expect(s.turn.successfulRunThisTurn).toBe(true);
    });
  });

  describe("MS Padma card JSON", () => {
    it("Padma wires onFirstRdRunBeginThisTurn with may charge", () => {
      assertPadmaWired();
      const padma = getCardDef("captain-padma-isbister-intrepid-explorer");
      expect(padma.unsupported).toEqual([]);
      expect(padma.onFirstRdRunBeginThisTurn).toBeTruthy();
      expect(validateEffectTree(padma.onFirstRdRunBeginThisTurn!)).toBeNull();

      let s = createInitialState();
      s = structuredClone(s);
      const live = instantiateCard(
        "captain-padma-isbister-intrepid-explorer",
        "padma-live",
        "runner:identity",
      );
      s.cards["padma-live"] = live;
      s.runner.identityId = "padma-live";

      const prog = instantiateCard("propeller", "prop-live", "runner:installed");
      prog.powerCounters = 4;
      s.cards["prop-live"] = prog;
      s.runner.installed.push("prop-live");

      s.servers.rd.ice = [];
      s.servers.rd.root = [];
      s.corp.deck = [];
      s.activeSide = "runner";
      s.timingKey = "runner.takeAction";
      s.runner.clicks = 4;
      s = must(s, { type: "basic_run", serverId: "rd" });
      expect(s.pendingChoice?.options.map((o) => o.id)).toEqual(
        expect.arrayContaining(["charge", "decline"]),
      );
      s = must(s, { type: "choose_option", optionId: "charge" });
      expect(s.cards["prop-live"]!.powerCounters).toBe(5);
    });
  });
  });

  describe("midnight-sun-panweave", () => {
  beforeAll(() => {
    if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
    if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
    assertPinnedTag("v26.03");
    assertCardsPinnedTag("v1.147.6");
  });

  function must(
    state: ReturnType<typeof createInitialState>,
    action: Parameters<typeof applyAction>[1],
  ) {
    const r = applyAction(state, action);
    if (!r.ok) throw new Error(`${r.error} ${JSON.stringify(r.cites)}`);
    return r.state;
  }

  /** PAN-Weave printed ability as Effect IR. */
  function panweaveEffect() {
    return fx.loseCredits(
      "corp",
      1,
      fx.gainCredits("runner", 1),
    );
  }

  function withPanweave(opts?: { corpCredits?: number; runnerCredits?: number }) {
    let s = createInitialState();
    s = structuredClone(s);
    const pw = instantiateCard("pan-weave", "pw-1", "runner:installed");
    pw.onFirstSuccessfulHqRunThisTurn = panweaveEffect();
    pw.unsupported = [];
    s.cards["pw-1"] = pw;
    s.runner.installed = ["pw-1"];
    s.corp.credits = opts?.corpCredits ?? 5;
    s.runner.credits = opts?.runnerCredits ?? 3;
    s.servers.hq.ice = [];
    s.servers.hq.root = [];
    s.servers.rd.ice = [];
    s.servers.rd.root = [];
    s.corp.hand = [];
    s.corp.deck = [];
    s.activeSide = "runner";
    s.timingKey = "runner.takeAction";
    s.runner.clicks = 4;
    return s;
  }

  /** Drain empty-server breach back to runner take-action. */
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
    if (s.timingKey === "runner.actionPaw") {
      s = must(s, { type: "pass_window" });
    }
    return s;
  }

  describe("MS PAN-Weave first-HQ credit transfer (always)", () => {
    it("accepts lose_credits.then Effect IR", () => {
      expect(validateEffectTree(panweaveEffect())).toBeNull();
    });

    it("rejects malformed lose_credits.then", () => {
      expect(
        validateEffectTree({
          op: "do",
          action: {
            kind: "lose_credits",
            side: "corp",
            amount: 1,
            then: { op: "do", action: { kind: "not_a_real_primitive" } },
          },
        } as never),
      ).toMatch(/unknown kind|not_a_real/);
    });

    it("first successful HQ: Corp loses 1¢, Runner gains 1¢", () => {
      let s = withPanweave({ corpCredits: 5, runnerCredits: 3 });
      s = must(s, { type: "basic_run", serverId: "hq" as ServerId });
      expect(s.turn.successfulHqRunThisTurn).toBe(true);
      expect(s.corp.credits).toBe(4);
      expect(s.runner.credits).toBe(4);
    });

    it("second successful HQ same turn does not transfer again", () => {
      let s = withPanweave({ corpCredits: 5, runnerCredits: 3 });
      s = must(s, { type: "basic_run", serverId: "hq" as ServerId });
      expect(s.corp.credits).toBe(4);
      expect(s.runner.credits).toBe(4);

      s = finishToTakeAction(s);
      expect(s.timingKey).toBe("runner.takeAction");
      s.runner.clicks = 4;
      s = must(s, { type: "basic_run", serverId: "hq" as ServerId });
      expect(s.corp.credits).toBe(4);
      expect(s.runner.credits).toBe(4);
    });

    it("successful R&D does not trigger; later first HQ still does", () => {
      let s = withPanweave({ corpCredits: 5, runnerCredits: 3 });
      s = must(s, { type: "basic_run", serverId: "rd" as ServerId });
      expect(s.turn.successfulHqRunThisTurn).toBe(false);
      expect(s.corp.credits).toBe(5);
      expect(s.runner.credits).toBe(3);

      s = finishToTakeAction(s);
      expect(s.timingKey).toBe("runner.takeAction");
      s.runner.clicks = 4;
      s = must(s, { type: "basic_run", serverId: "hq" as ServerId });
      expect(s.turn.successfulHqRunThisTurn).toBe(true);
      expect(s.corp.credits).toBe(4);
      expect(s.runner.credits).toBe(4);
    });

    it("Corp at 0¢: loses nothing; Runner does not gain (if they do)", () => {
      let s = withPanweave({ corpCredits: 0, runnerCredits: 3 });
      s = must(s, { type: "basic_run", serverId: "hq" as ServerId });
      expect(s.turn.successfulHqRunThisTurn).toBe(true);
      expect(s.corp.credits).toBe(0);
      expect(s.runner.credits).toBe(3);
    });
  });

  describe("MS PAN-Weave card data (when wired)", () => {
    function panweaveWired(): boolean {
      const def = getCardDef("pan-weave");
      return (
        (def.unsupported?.length ?? 0) === 0 &&
        Boolean(def.onFirstSuccessfulHqRunThisTurn)
      );
    }

    it("pan-weave is fully clear with onFirstSuccessfulHqRunThisTurn", () => {
      if (!panweaveWired()) {
        expect(getCardDef("pan-weave").unsupported!.length).toBeGreaterThan(0);
        return;
      }
      const def = getCardDef("pan-weave");
      expect(def.unsupported).toEqual([]);
      expect(def.onInstall).toBeTruthy();
      expect(def.onFirstSuccessfulHqRunThisTurn).toBeTruthy();
      expect(validateEffectTree(def.onFirstSuccessfulHqRunThisTurn!)).toBeNull();
    });
  });
  });

  describe("midnight-sun-pinhole", () => {
  beforeAll(() => {
    if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
    if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
    assertPinnedTag("v26.03");
    assertCardsPinnedTag("v1.147.6");
  });

  function must(
    state: ReturnType<typeof createInitialState>,
    action: Parameters<typeof applyAction>[1],
  ) {
    const r = applyAction(state, action);
    if (!r.ok) throw new Error(`${r.error} ${JSON.stringify(r.cites)}`);
    return r.state;
  }

  describe("MS access_one_root_other_server (Pinhole Threading)", () => {
    it("validates access_one_root_other_server tree", () => {
      expect(validateEffectTree(fx.accessOneRootOtherServer())).toBeNull();
    });

    it("presets other-server root candidates, forbids steal/trash, clears skipBreach", () => {
      let s = createInitialState();
      s = structuredClone(s);
      s.timingKey = "run.success";
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
        strengthBoosts: {},
        encounterStrengthBoosts: {},
        iceStrengthBoosts: {},
        accessingCardId: null,
        skipBreach: true,
      };
      const remote = s.servers["remote:1"];
      if (!remote) {
        s.servers["remote:1"] = {
          id: "remote:1",
          kind: "remote",
          ice: [],
          root: [],
        };
      }
      const asset = instantiateCard("pad-campaign", "asset-1", "server:remote:1:root");
      s.cards["asset-1"] = asset;
      s.servers["remote:1"].root = ["asset-1"];
      const agenda = instantiateCard(
        "hostile-takeover",
        "agenda-1",
        "server:remote:1:root",
      );
      s.cards["agenda-1"] = agenda;
      s.servers["remote:1"].root.push("agenda-1");

      const src = instantiateCard("jailbreak", "pin-1", "runner:heap");
      s.cards["pin-1"] = src;

      const r = evalEffect(
        { state: s, sourceId: "pin-1" },
        fx.accessOneRootOtherServer(),
      );
      expect(r.ok).toBe(true);
      expect(s.run!.cannotStealOrTrash).toBe(true);
      expect(s.run!.skipBreach).toBe(false);
      expect(s.run!.accessCandidatesPreset).toBe(true);
      expect(s.run!.randomAccessLimit).toBe(1);
      expect(s.run!.accessCandidates.sort()).toEqual(
        ["agenda-1", "asset-1"].sort(),
      );
    });

    it("blocks steal when cannotStealOrTrash is set during access", () => {
      let s = createInitialState();
      s = structuredClone(s);
      s.timingKey = "breach.awaitAccess";
      s.activeSide = "runner";
      const agenda = instantiateCard(
        "hostile-takeover",
        "agenda-1",
        "server:remote:1:root",
      );
      s.cards["agenda-1"] = agenda;
      if (!s.servers["remote:1"]) {
        s.servers["remote:1"] = {
          id: "remote:1",
          kind: "remote",
          ice: [],
          root: ["agenda-1"],
        };
      } else {
        s.servers["remote:1"].root = ["agenda-1"];
      }
      s.run = {
        attackedServerId: "hq",
        phase: "breach",
        position: null,
        successful: true,
        accessedCardIds: [],
        accessCandidates: ["agenda-1"],
        randomAccessLimit: 1,
        encounter: null,
        endedTheRun: false,
        cannotJackOut: false,
        strengthBoosts: {},
        encounterStrengthBoosts: {},
        iceStrengthBoosts: {},
        accessingCardId: null,
        cannotStealOrTrash: true,
        accessCandidatesPreset: true,
      };
      s = must(s, { type: "access_card", cardId: "agenda-1" });
      // cannotStealOrTrash: 11.6_3 skips steal and completes access (no park).
      expect(s.run?.accessingCardId ?? null).toBeNull();
      expect(s.runner.scoreArea).not.toContain("agenda-1");
      const steal = applyAction(s, { type: "steal_agenda", cardId: "agenda-1" });
      expect(steal.ok).toBe(false);
    });
  });
  });

  describe("midnight-sun-play-additional-cost", () => {
  beforeAll(() => {
    if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
    if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
    assertPinnedTag("v26.03");
    assertCardsPinnedTag("v1.147.6");
  });

  function must(
    state: ReturnType<typeof createInitialState>,
    action: Parameters<typeof applyAction>[1],
  ) {
    const r = applyAction(state, action);
    if (!r.ok) throw new Error(`${r.error} ${JSON.stringify(r.cites)}`);
    return r.state;
  }

  describe("MS playAdditionalCost IR (always)", () => {
    it("accepts playAdditionalCost Effect IR trees (core_damage)", () => {
      expect(validateEffectTree(fx.coreDamage(1))).toBeNull();
    });

    it("Running Hot-shaped play pays core damage then gains clicks", () => {
      let s = createInitialState();
      s = structuredClone(s);
      // Grip fillers so core damage does not flatline (event itself leaves grip first)
      for (let i = 0; i < 3; i++) {
        const id = `filler-${i}`;
        s.cards[id] = instantiateCard("sure-gamble", id, "runner:grip");
        s.runner.hand.push(id);
      }
      const ev = instantiateCard("running-hot", "rh-1", "runner:grip");
      ev.playCost = 1;
      ev.playAdditionalCost = fx.coreDamage(1);
      ev.onPlay = fx.gainClicks("runner", 3);
      // Clear unsupported so play path is exercised via instance fields
      ev.unsupported = [];
      s.cards["rh-1"] = ev;
      s.runner.hand.push("rh-1");
      s.runner.credits = 5;
      s.runner.clicks = 1;
      s.activeSide = "runner";
      s.timingKey = "runner.takeAction";

      const gripBefore = s.runner.hand.length;
      const clicksBefore = s.runner.clicks;
      s = must(s, { type: "play_event", cardId: "rh-1" });

      expect(s.runner.credits).toBe(4);
      // click spent to play + 3 gained
      expect(s.runner.clicks).toBe(clicksBefore - 1 + 3);
      expect(s.runner.coreDamage).toBe(1);
      expect(s.runner.maxHandSize).toBe(4);
      // Event left grip; one more card trashed by core damage
      expect(s.runner.hand.length).toBe(gripBefore - 2);
      expect(s.runner.discardPile).toContain("rh-1");
      expect(s.log.some((l) => l.includes("Additional cost paid"))).toBe(true);
      expect(s.log.some((l) => /Core damage|core damage/i.test(l))).toBe(true);
    });

    it("play without playAdditionalCost still works (Sure Gamble)", () => {
      let s = createInitialState();
      s = structuredClone(s);
      const ev = instantiateCard("sure-gamble", "sg-1", "runner:grip");
      s.cards["sg-1"] = ev;
      s.runner.hand = ["sg-1"];
      s.runner.credits = 5;
      s.runner.clicks = 1;
      s.activeSide = "runner";
      s.timingKey = "runner.takeAction";

      s = must(s, { type: "play_event", cardId: "sg-1" });
      expect(s.runner.credits).toBe(5 - 5 + 9);
      expect(s.runner.coreDamage).toBe(0);
    });

    it("legality still offers play_event when additional cost is present", () => {
      let s = createInitialState();
      s = structuredClone(s);
      for (let i = 0; i < 2; i++) {
        const id = `f-${i}`;
        s.cards[id] = instantiateCard("sure-gamble", id, "runner:grip");
        s.runner.hand.push(id);
      }
      const ev = instantiateCard("running-hot", "rh-2", "runner:grip");
      ev.playCost = 1;
      ev.playAdditionalCost = fx.coreDamage(1);
      ev.onPlay = fx.gainClicks("runner", 3);
      s.cards["rh-2"] = ev;
      s.runner.hand.push("rh-2");
      s.runner.credits = 5;
      s.runner.clicks = 1;
      s.activeSide = "runner";
      s.timingKey = "runner.takeAction";

      const legal = queryLegality(s);
      expect(
        legal.legal.some(
          (e) => e.action.type === "play_event" && e.action.cardId === "rh-2",
        ),
      ).toBe(true);
    });
  });

  describe("MS Running Hot card wiring (v0.31.0+)", () => {
    it("Running Hot wires playAdditionalCost + onPlay; unsupported empty", () => {
      const rh = getCardDef("running-hot");
      expect(rh.unsupported).toEqual([]);
      expect(rh.playCost).toBe(1);
      expect(rh.playAdditionalCost).toEqual(fx.coreDamage(1));
      expect(rh.onPlay).toEqual(fx.gainClicks("runner", 3));

      let s = createInitialState();
      s = structuredClone(s);
      for (let i = 0; i < 3; i++) {
        const id = `w-${i}`;
        s.cards[id] = instantiateCard("sure-gamble", id, "runner:grip");
        s.runner.hand.push(id);
      }
      const card = instantiateCard("running-hot", "rh-live", "runner:grip");
      s.cards["rh-live"] = card;
      s.runner.hand.push("rh-live");
      s.runner.credits = 3;
      s.runner.clicks = 1;
      s.activeSide = "runner";
      s.timingKey = "runner.takeAction";

      s = must(s, { type: "play_event", cardId: "rh-live" });
      expect(s.runner.coreDamage).toBe(1);
      expect(s.runner.clicks).toBe(3); // 1-1+3
      expect(s.runner.credits).toBe(2);
    });
  });
  });

  describe("midnight-sun-power-counter-cost", () => {
  beforeAll(() => {
    if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
    if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
    assertPinnedTag("v26.03");
    assertCardsPinnedTag("v1.147.6");
  });

  function must(
    state: ReturnType<typeof createInitialState>,
    action: Parameters<typeof applyAction>[1],
  ) {
    const r = applyAction(state, action);
    if (!r.ok) throw new Error(`${r.error} ${JSON.stringify(r.cites)}`);
    return r.state;
  }

  /** Place ice on HQ, put breaker in rig, run to encounter PAW. */
  function encounterHq(
    iceDefId: string,
    breakerDefId: string,
    opts?: { powerCounters?: number; breakViaPaidOnly?: boolean },
  ) {
    let s = createInitialState();
    s = structuredClone(s);
    const ice = instantiateCard(iceDefId, "ice-1", "server:hq:ice");
    ice.rezzed = false;
    s.cards["ice-1"] = ice;
    s.servers.hq.ice = ["ice-1"];

    const br = instantiateCard(breakerDefId, "br-1", "runner:installed");
    if (opts?.powerCounters !== undefined) {
      br.powerCounters = opts.powerCounters;
    }
    if (opts?.breakViaPaidOnly && br.breaker) {
      br.breaker.breakViaPaidAbilityOnly = true;
    }
    s.cards["br-1"] = br;
    s.runner.installed = ["br-1"];
    s.runner.credits = 10;
    s.runner.clicks = 4;
    s.corp.credits = 20;
    s.activeSide = "runner";
    s.timingKey = "runner.takeAction";
    s = must(s, { type: "basic_run", serverId: "hq" as ServerId });
    s = must(s, { type: "rez_ice", cardId: "ice-1" });
    s = must(s, { type: "pass_window" });
    expect(s.timingKey).toBe("run.encounterPaw");
    return s;
  }

  describe("MS cost.powerCounters IR (always)", () => {
    it("canPayCost / payCost spend hosted power counters", () => {
      const s = createInitialState();
      const card = instantiateCard("propeller", "p-1", "runner:installed");
      card.powerCounters = 3;
      s.cards["p-1"] = card;
      s.runner.installed.push("p-1");
      expect(canPayCost(s, "runner", { powerCounters: 1 }, card)).toBe(true);
      expect(canPayCost(s, "runner", { powerCounters: 4 }, card)).toBe(false);
      payCost(s, "runner", { powerCounters: 2 }, "test", card);
      expect(card.powerCounters).toBe(1);
      expect(s.log.some((l) => l.includes("power counter"))).toBe(true);
    });

    it("Revolver-shaped power-counter break spends counter and breaks sub", () => {
      let s = encounterHq("tithe", "revolver", {
        powerCounters: 6,
        breakViaPaidOnly: true,
      });
      const br = s.cards["br-1"]!;
      br.paidAbilities = [
        ...(br.paidAbilities ?? []).filter((a) => a.id !== "revolver-power-break"),
        {
          id: "revolver-power-break",
          label: "Spend 1 power counter: break 1 sentry subroutine",
          clickCost: 0,
          creditCost: 0,
          cost: { powerCounters: 1 },
          windows: ["encounter_paw"],
          effect: fx.do({
            kind: "break_encounter_subroutine",
            requireSubtype: "sentry",
          }),
        },
      ];
      if (br.breaker) br.breaker.breakViaPaidAbilityOnly = true;

      const before = br.powerCounters ?? 0;
      s = must(s, {
        type: "use_paid_ability",
        cardId: "br-1",
        abilityId: "revolver-power-break",
      });
      expect(s.cards["br-1"]!.powerCounters).toBe(before - 1);
      expect(s.run?.encounter?.broken.some(Boolean)).toBe(true);
    });

    it("breakViaPaidAbilityOnly blocks standard break_subroutine", () => {
      const s = encounterHq("tithe", "revolver", {
        powerCounters: 6,
        breakViaPaidOnly: true,
      });
      const view = queryLegality(s);
      expect(
        view.legal.some(
          (e) =>
            e.action.type === "break_subroutine" &&
            e.action.breakerId === "br-1",
        ),
      ).toBe(false);
      const bad = applyAction(s, {
        type: "break_subroutine",
        breakerId: "br-1",
        subIndex: 0,
      });
      expect(bad.ok).toBe(false);
    });

    it("Propeller-shaped power-counter pump spends counter and boosts strength", () => {
      let s = encounterHq("ping", "propeller", { powerCounters: 4 });
      const br = s.cards["br-1"]!;
      br.paidAbilities = [
        ...(br.paidAbilities ?? []).filter((a) => a.id !== "propeller-power-pump"),
        {
          id: "propeller-power-pump",
          label: "Spend 1 power counter: +2 strength",
          clickCost: 0,
          creditCost: 0,
          cost: { powerCounters: 1 },
          windows: ["encounter_paw"],
          effect: fx.do({ kind: "pump_strength", amount: 2 }),
        },
      ];
      const beforeStr = effectiveBreakerStrength(s, "br-1");
      const beforePc = br.powerCounters ?? 0;
      s = must(s, {
        type: "use_paid_ability",
        cardId: "br-1",
        abilityId: "propeller-power-pump",
      });
      expect(s.cards["br-1"]!.powerCounters).toBe(beforePc - 1);
      expect(effectiveBreakerStrength(s, "br-1")).toBe(beforeStr + 2);
    });

    it("cannot use power-counter ability with zero counters", () => {
      const s = encounterHq("ping", "propeller", { powerCounters: 0 });
      const br = s.cards["br-1"]!;
      br.paidAbilities = [
        {
          id: "propeller-power-pump",
          label: "Spend 1 power counter: +2 strength",
          clickCost: 0,
          creditCost: 0,
          cost: { powerCounters: 1 },
          windows: ["encounter_paw"],
          effect: fx.do({ kind: "pump_strength", amount: 2 }),
        },
      ];
      const r = applyAction(s, {
        type: "use_paid_ability",
        cardId: "br-1",
        abilityId: "propeller-power-pump",
      });
      expect(r.ok).toBe(false);
    });
  });

  describe("MS power-counter card JSON wiring (v0.31.0+)", () => {
    it("clears unsupported on Revolver + Propeller", () => {
      expect(getCardDef("revolver").unsupported).toEqual([]);
      expect(getCardDef("propeller").unsupported).toEqual([]);
      expect(getCardDef("revolver").breaker?.breakViaPaidAbilityOnly).toBe(true);
      expect(
        getCardDef("revolver").paidAbilities?.some(
          (a) => a.id === "revolver-power-break" && a.cost?.powerCounters === 1,
        ),
      ).toBe(true);
      expect(
        getCardDef("propeller").paidAbilities?.some(
          (a) => a.cost?.powerCounters === 1,
        ),
      ).toBe(true);
    });
  });
  });

  describe("midnight-sun-rigging-up", () => {
  beforeAll(() => {
    if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
    if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
    assertPinnedTag("v26.03");
    assertCardsPinnedTag("v1.147.6");
  });

  function must(
    state: ReturnType<typeof createInitialState>,
    action: Parameters<typeof applyAction>[1],
  ) {
    const r = applyAction(state, action);
    if (!r.ok) throw new Error(`${r.error} ${JSON.stringify(r.cites)}`);
    return r.state;
  }

  const riggingUpEffect = () =>
    fx.installFromGripDiscount(["program", "hardware"], 3, true);

  describe("MS Rigging Up discounted install + may charge IR (always)", () => {
    it("accepts install_from_grip_discount Effect IR", () => {
      expect(validateEffectTree(riggingUpEffect())).toBeNull();
      expect(validateEffectTree(fx.installGripCard("x", 3))).toBeNull();
      expect(validateEffectTree(fx.mayChargeCard("x"))).toBeNull();
    });

    it("rejects invalid types / discount", () => {
      expect(
        validateEffectTree({
          op: "do",
          action: {
            kind: "install_from_grip_discount",
            types: ["ice"],
            discount: 3,
          },
        } as never),
      ).toMatch(/types/);
      expect(
        validateEffectTree({
          op: "do",
          action: {
            kind: "install_from_grip_discount",
            types: ["program"],
            discount: -1,
          },
        } as never),
      ).toMatch(/discount/);
    });

    it("installs Hyperbaric at 0¢ (3−3) and may charge after powerCountersOnInstall", () => {
      let s = createInitialState();
      s = structuredClone(s);
      const ev = instantiateCard("sure-gamble", "ru-1", "runner:grip");
      ev.onPlay = riggingUpEffect();
      s.cards["ru-1"] = ev;
      s.runner.hand = ["ru-1"];

      const h = instantiateCard("hyperbaric", "hyp-1", "runner:grip");
      // Ensure install places counters before may-charge (Hyperbaric ruling).
      h.powerCountersOnInstall = 1;
      h.installCost = 3;
      s.cards["hyp-1"] = h;
      s.runner.hand.push("hyp-1");
      s.runner.credits = 2; // play 0 + install 0; leave spare
      s.activeSide = "runner";
      s.timingKey = "runner.takeAction";
      s.runner.clicks = 4;

      // Replace sure-gamble with a 0-cost event shell
      ev.type = "event";
      ev.playCost = 0;
      ev.defId = "rigging-up";
      ev.title = "Rigging Up";

      s = must(s, { type: "play_event", cardId: "ru-1" });
      // Sole candidate → auto install, then may-charge pending
      expect(s.runner.installed).toContain("hyp-1");
      expect(s.runner.hand).not.toContain("hyp-1");
      expect(s.cards["hyp-1"]!.powerCounters).toBe(1);
      expect(s.runner.credits).toBe(2); // paid 0 for install
      expect(s.pendingChoice).not.toBeNull();
      expect(s.pendingChoice!.options.map((o) => o.id)).toEqual(
        expect.arrayContaining(["charge", "decline"]),
      );

      s = must(s, { type: "choose_option", optionId: "charge" });
      expect(s.cards["hyp-1"]!.powerCounters).toBe(2);
      expect(s.pendingChoice).toBeNull();
    });

    it("decline skips charge after discounted install", () => {
      let s = createInitialState();
      s = structuredClone(s);
      const ev = instantiateCard("sure-gamble", "ru-2", "runner:grip");
      ev.type = "event";
      ev.playCost = 0;
      ev.onPlay = riggingUpEffect();
      s.cards["ru-2"] = ev;

      const h = instantiateCard("hyperbaric", "hyp-2", "runner:grip");
      h.powerCountersOnInstall = 1;
      h.installCost = 3;
      s.cards["hyp-2"] = h;
      s.runner.hand = ["ru-2", "hyp-2"];
      s.runner.credits = 0;
      s.activeSide = "runner";
      s.timingKey = "runner.takeAction";
      s.runner.clicks = 4;

      s = must(s, { type: "play_event", cardId: "ru-2" });
      expect(s.cards["hyp-2"]!.powerCounters).toBe(1);
      s = must(s, { type: "choose_option", optionId: "decline" });
      expect(s.cards["hyp-2"]!.powerCounters).toBe(1);
    });

    it("does not offer charge when installed card has no power counters", () => {
      let s = createInitialState();
      s = structuredClone(s);
      const r = evalEffect(
        { state: s, sourceId: "runner-id" },
        fx.mayChargeCard("missing"),
      );
      expect(r.ok).toBe(true);
      expect(s.pendingChoice).toBeNull();

      const prog = instantiateCard("cleaver", "cl-1", "runner:installed");
      prog.powerCounters = 0;
      s.cards["cl-1"] = prog;
      s.runner.installed.push("cl-1");
      const r2 = evalEffect(
        { state: s, sourceId: "runner-id" },
        fx.mayChargeCard("cl-1"),
      );
      expect(r2.ok).toBe(true);
      expect(s.pendingChoice).toBeNull();
    });

    it("chooses among multiple affordable program/hardware; ignores resources", () => {
      let s = createInitialState();
      s = structuredClone(s);
      const ev = instantiateCard("sure-gamble", "ru-3", "runner:grip");
      ev.type = "event";
      ev.playCost = 0;
      ev.onPlay = riggingUpEffect();
      s.cards["ru-3"] = ev;

      const h = instantiateCard("hyperbaric", "hyp-3", "runner:grip");
      h.powerCountersOnInstall = 1;
      h.installCost = 3;
      s.cards["hyp-3"] = h;

      const end = instantiateCard("endurance", "end-3", "runner:grip");
      end.powerCountersOnInstall = 3;
      end.installCost = 8;
      s.cards["end-3"] = end;

      const res = instantiateCard("no-free-lunch", "nfl-3", "runner:grip");
      res.type = "resource";
      res.installCost = 0;
      s.cards["nfl-3"] = res;

      s.runner.hand = ["ru-3", "hyp-3", "end-3", "nfl-3"];
      s.runner.credits = 5; // Endurance needs 5 after −3; Hyperbaric 0
      s.activeSide = "runner";
      s.timingKey = "runner.takeAction";
      s.runner.clicks = 4;

      s = must(s, { type: "play_event", cardId: "ru-3" });
      expect(s.pendingChoice).not.toBeNull();
      const ids = s.pendingChoice!.options.map((o) => o.id);
      expect(ids).toEqual(
        expect.arrayContaining(["install-hyp-3", "install-end-3"]),
      );
      expect(ids.some((id) => id.includes("nfl"))).toBe(false);

      s = must(s, { type: "choose_option", optionId: "install-end-3" });
      expect(s.runner.installed).toContain("end-3");
      expect(s.runner.credits).toBe(0); // 5 − 5
      expect(s.cards["end-3"]!.powerCounters).toBe(3);
      expect(s.pendingChoice).not.toBeNull();
      s = must(s, { type: "choose_option", optionId: "charge" });
      expect(s.cards["end-3"]!.powerCounters).toBe(4);
    });

    it("no-ops when no affordable candidates", () => {
      let s = createInitialState();
      s = structuredClone(s);
      const h = instantiateCard("hyperbaric", "hyp-4", "runner:grip");
      h.installCost = 3;
      s.cards["hyp-4"] = h;
      s.runner.hand = ["hyp-4"];
      s.runner.credits = 0; // need 0 after discount actually — wait 3-3=0
      // Use a 5-cost program so 5-3=2 unaffordable
      h.installCost = 5;
      const r = evalEffect(
        { state: s, sourceId: "runner-id" },
        fx.installFromGripDiscount(["program", "hardware"], 3, true),
      );
      expect(r.ok).toBe(true);
      expect(s.runner.installed).not.toContain("hyp-4");
      expect(s.pendingChoice).toBeNull();
    });
  });

  describe("MS Rigging Up card wiring (v0.31.0+)", () => {
    it("Rigging Up wires install_from_grip_discount + mayCharge; unsupported empty", () => {
      const def = getCardDef("rigging-up");
      expect(def.type).toBe("event");
      expect(def.playCost).toBe(0);
      expect(def.unsupported ?? []).toEqual([]);
      expect(def.onPlay).toEqual(
        fx.installFromGripDiscount(["program", "hardware"], 3, true),
      );
    });
  });
  });

  describe("midnight-sun-skip-discard-adv-cost", () => {
  beforeAll(() => {
    if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
    if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
    assertPinnedTag("v26.03");
    assertCardsPinnedTag("v1.147.6");
  });

  function must(
    state: ReturnType<typeof createInitialState>,
    action: Parameters<typeof applyAction>[1],
  ) {
    const r = applyAction(state, action);
    if (!r.ok) throw new Error(`${r.error} ${JSON.stringify(r.cites)}`);
    return r.state;
  }

  function midnight3OnScore(): Effect {
    return fx.seq(
      fx.draw("corp", 3),
      fx.choose("corp", [
        {
          id: "skip-discard",
          label: "Skip discard step this turn",
          effect: fx.skipDiscardThisTurn(),
        },
        {
          id: "decline",
          label: "Decline",
          effect: fx.gainCredits("corp", 0),
        },
      ]),
    );
  }

  function azefScoreCost(): Effect {
    return fx.mustTrashInstalled({ excludeSelf: true });
  }

  function pravdivostEffect(): Effect {
    return fx.choose("corp", [
      {
        id: "place-adv",
        label: "Place 1 advancement on an advanceable card",
        effect: fx.placeAdvancements(1),
      },
      {
        id: "decline",
        label: "Decline",
        effect: fx.gainCredits("corp", 0),
      },
    ]);
  }

  describe("MS skip_discard_this_turn (Midnight-3)", () => {
    it("validates skip_discard_this_turn + choose tree", () => {
      expect(validateEffectTree(midnight3OnScore())).toBeNull();
    });

    it("onScore may skip discard; discard_to_hand_size keeps oversize hand", () => {
      let s = createInitialState();
      s = structuredClone(s);
      const agenda = instantiateCard(
        "midnight-3-arcology",
        "m3-1",
        "server:remote-1:root",
      );
      agenda.unsupported = [];
      agenda.onScore = midnight3OnScore();
      agenda.advancementCounters = agenda.advancementRequirement ?? 4;
      s.cards["m3-1"] = agenda;
      s.servers["remote-1"] = {
        id: "remote-1",
        kind: "remote",
        ice: [],
        root: ["m3-1"],
      };
      s.corp.deck = ["d1", "d2", "d3", "d4", "d5"];
      for (const id of s.corp.deck) {
        s.cards[id] = instantiateCard("hedge-fund", id, "corp:rd");
      }
      s.corp.hand = ["h1", "h2", "h3", "h4", "h5"];
      for (const id of s.corp.hand) {
        s.cards[id] = instantiateCard("hedge-fund", id, "corp:hq");
      }
      s.corp.maxHandSize = 5;
      s.corp.clicks = 3;
      s.corp.credits = 10;
      s.activeSide = "corp";
      s.timingKey = "corp.actionPaw";
      const id = s.cards[s.corp.identityId];
      if (id) delete id.onAgendaScored;

      s = must(s, { type: "score_agenda", cardId: "m3-1" });
      expect(s.corp.scoreArea).toContain("m3-1");
      expect(s.pendingChoice?.options.map((o) => o.id)).toEqual(
        expect.arrayContaining(["skip-discard", "decline"]),
      );
      s = must(s, { type: "choose_option", optionId: "skip-discard" });
      expect(s.turn.skipDiscardThisTurn).toBe(true);
      expect(s.corp.hand.length).toBe(8);

      s.timingKey = "corp.discard";
      s = must(s, { type: "discard_to_hand_size" });
      expect(s.corp.hand.length).toBe(8);
      expect(s.turn.skipDiscardThisTurn).toBe(false);
      expect(s.log.some((l) => l.includes("skips discard"))).toBe(true);
    });

    it("without skip, discard trims to max hand size", () => {
      let s = createInitialState();
      s = structuredClone(s);
      s.corp.hand = ["h1", "h2", "h3", "h4", "h5", "h6", "h7"];
      for (const id of s.corp.hand) {
        s.cards[id] = instantiateCard("hedge-fund", id, "corp:hq");
      }
      s.corp.maxHandSize = 5;
      s.turn.skipDiscardThisTurn = false;
      s.activeSide = "corp";
      s.timingKey = "corp.discard";
      s = must(s, { type: "discard_to_hand_size" });
      expect(s.corp.hand.length).toBe(5);
    });
  });

  describe("MS cost.advancementCounters (Drago)", () => {
    it("canPayCost / payCost spend hosted advancements", () => {
      const s = createInitialState();
      const card = instantiateCard(
        "drago-ivanov",
        "drago-1",
        "server:remote-1:root",
      );
      card.advancementCounters = 3;
      s.cards["drago-1"] = card;
      expect(canPayCost(s, "corp", { advancementCounters: 2 }, card)).toBe(true);
      expect(canPayCost(s, "corp", { advancementCounters: 4 }, card)).toBe(false);
      payCost(s, "corp", { advancementCounters: 2 }, "test", card);
      expect(card.advancementCounters).toBe(1);
      expect(s.log.some((l) => l.includes("advancement"))).toBe(true);
    });

    it("paid ability spends 2 advancements and gives a tag", () => {
      let s = createInitialState();
      s = structuredClone(s);
      const remote = "remote-1" as ServerId;
      s.servers[remote] = { id: remote, kind: "remote", ice: [], root: [] };
      const drago = instantiateCard(
        "drago-ivanov",
        "drago-1",
        `server:${remote}:root`,
      );
      drago.rezzed = true;
      drago.faceup = true;
      drago.unsupported = [];
      drago.advancementCounters = 2;
      drago.paidAbilities = [
        {
          id: "drago-tag",
          label: "Remove 2 advancements: give Runner 1 tag",
          clickCost: 1,
          creditCost: 0,
          cost: { clicks: 1, advancementCounters: 2 },
          windows: ["corp_action_paw"],
          effect: fx.giveTags(1),
        },
      ];
      s.cards["drago-1"] = drago;
      s.servers[remote].root = ["drago-1"];
      s.corp.clicks = 3;
      s.corp.credits = 5;
      s.runner.tags = 0;
      s.activeSide = "corp";
      s.timingKey = "corp.takeAction";

      const legal = queryLegality(s).legal;
      expect(
        legal.some(
          (e) =>
            e.action.type === "use_paid_ability" &&
            e.action.cardId === "drago-1" &&
            e.action.abilityId === "drago-tag",
        ),
      ).toBe(true);

      s = must(s, {
        type: "use_paid_ability",
        cardId: "drago-1",
        abilityId: "drago-tag",
      });
      expect(s.cards["drago-1"].advancementCounters).toBe(0);
      expect(s.runner.tags).toBe(1);
      expect(s.corp.clicks).toBe(2);
    });
  });

  describe("MS scoreAdditionalCost must_trash (Azef)", () => {
    it("validates must_trash_installed", () => {
      expect(validateEffectTree(azefScoreCost())).toBeNull();
    });

    it("requires trash of another installed card before scoring", () => {
      let s = createInitialState();
      s = structuredClone(s);
      const agenda = instantiateCard(
        "azef-protocol",
        "azef-1",
        "server:remote-1:root",
      );
      agenda.unsupported = [];
      agenda.scoreAdditionalCost = azefScoreCost();
      agenda.onScore = fx.meatDamage(2);
      agenda.advancementCounters = agenda.advancementRequirement ?? 3;
      s.cards["azef-1"] = agenda;
      s.servers["remote-1"] = {
        id: "remote-1",
        kind: "remote",
        ice: [],
        root: ["azef-1"],
      };
      const ice = instantiateCard("ice-wall", "ice-1", "server:hq:ice");
      ice.rezzed = true;
      s.cards["ice-1"] = ice;
      s.servers.hq.ice = ["ice-1"];
      s.corp.clicks = 3;
      s.corp.credits = 10;
      s.runner.hand = ["rh1", "rh2", "rh3"];
      for (const id of s.runner.hand) {
        s.cards[id] = instantiateCard("sure-gamble", id, "runner:grip");
      }
      s.activeSide = "corp";
      s.timingKey = "corp.actionPaw";
      const id = s.cards[s.corp.identityId];
      if (id) delete id.onAgendaScored;

      s = must(s, { type: "score_agenda", cardId: "azef-1" });
      expect(s.corp.scoreArea).not.toContain("azef-1");
      expect(s.pendingScoreAgendaId).toBe("azef-1");
      expect(s.pendingChoice?.options.map((o) => o.id)).toEqual(["trash:ice-1"]);

      s = must(s, { type: "choose_option", optionId: "trash:ice-1" });
      expect(s.corp.scoreArea).toContain("azef-1");
      expect(s.pendingScoreAgendaId).toBeNull();
      expect(s.servers.hq.ice).not.toContain("ice-1");
      expect(s.corp.discardPile).toContain("ice-1");
      expect(s.runner.hand.length).toBeLessThan(3);
    });

    it("cannot score Azef with no other installed cards", () => {
      let s = createInitialState();
      s = structuredClone(s);
      const agenda = instantiateCard(
        "azef-protocol",
        "azef-1",
        "server:remote-1:root",
      );
      agenda.scoreAdditionalCost = azefScoreCost();
      agenda.advancementCounters = 3;
      s.cards["azef-1"] = agenda;
      s.servers["remote-1"] = {
        id: "remote-1",
        kind: "remote",
        ice: [],
        root: ["azef-1"],
      };
      s.servers.hq.ice = [];
      s.servers.rd.ice = [];
      s.servers.archives.ice = [];
      s.activeSide = "corp";
      s.timingKey = "corp.actionPaw";
      const legal = queryLegality(s).legal;
      expect(
        legal.some(
          (e) => e.action.type === "score_agenda" && e.action.cardId === "azef-1",
        ),
      ).toBe(false);
    });
  });

  describe("MS onFirstSuccessfulRunThisTurn (Pravdivost)", () => {
    it("validates may-place choose tree", () => {
      expect(validateEffectTree(pravdivostEffect())).toBeNull();
    });

    it("fires once on first successful run; may place advancement", () => {
      let s = createInitialState();
      s = structuredClone(s);
      const id = s.cards[s.corp.identityId];
      id.onFirstSuccessfulRunThisTurn = pravdivostEffect();
      id.unsupported = [];

      const remote = "remote-1" as ServerId;
      s.servers[remote] = { id: remote, kind: "remote", ice: [], root: [] };
      const asset = instantiateCard(
        "pad-campaign",
        "adv-1",
        `server:${remote}:root`,
      );
      asset.canAdvance = true;
      asset.rezzed = true;
      asset.advancementCounters = 0;
      s.cards["adv-1"] = asset;
      s.servers[remote].root = ["adv-1"];

      s.servers.hq.ice = [];
      s.servers.hq.root = [];
      s.corp.hand = [];
      s.activeSide = "runner";
      s.timingKey = "runner.takeAction";
      s.runner.clicks = 4;

      s = must(s, { type: "basic_run", serverId: "hq" as ServerId });
      expect(s.turn.successfulRunThisTurn).toBe(true);
      expect(s.pendingChoice?.options.map((o) => o.id) ?? []).toEqual(
        expect.arrayContaining(["place-adv", "decline"]),
      );
      s = must(s, { type: "choose_option", optionId: "place-adv" });
      expect(s.cards["adv-1"].advancementCounters).toBe(1);
    });
  });

  describe("MS card wiring (v0.32.0+)", () => {
    it("Midnight-3 / Drago / Azef / Pravdivost are fully clear", () => {
      const m3 = getCardDef("midnight-3-arcology");
      expect(m3.unsupported ?? []).toEqual([]);
      expect(m3.onScore).toBeTruthy();

      const drago = getCardDef("drago-ivanov");
      expect(drago.unsupported ?? []).toEqual([]);
      expect(drago.paidAbilities?.[0]?.cost?.advancementCounters).toBe(2);

      const azef = getCardDef("azef-protocol");
      expect(azef.unsupported ?? []).toEqual([]);
      expect(azef.scoreAdditionalCost).toBeTruthy();

      const prav = getCardDef("pravdivost-consulting-political-solutions");
      expect(prav.unsupported ?? []).toEqual([]);
      expect(prav.onFirstSuccessfulRunThisTurn).toBeTruthy();
    });
  });
  });

  describe("midnight-sun-trash-other", () => {
  beforeAll(() => {
    if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
    if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
    assertPinnedTag("v26.03");
    assertCardsPinnedTag("v1.147.6");
  });

  function must(
    state: ReturnType<typeof createInitialState>,
    action: Parameters<typeof applyAction>[1],
  ) {
    const r = applyAction(state, action);
    if (!r.ok) throw new Error(`${r.error} ${JSON.stringify(r.cites)}`);
    return r.state;
  }

  function svyatogorOnTurnBegin(): Effect {
    return fx.mayTrashInstalled({
      excludeSelf: true,
      then: fx.gainCredits("corp", 3),
    });
  }

  function extractOnPlay(): Effect {
    return fx.seq(
      fx.gainCredits("corp", 6),
      fx.mayTrashInstalled({
        excludeSelf: true,
        then: fx.gainCredits("corp", 3),
      }),
    );
  }

  function stavkaOnRez(): Effect {
    return fx.mayTrashInstalled({
      excludeSelf: true,
      then: fx.fortify(5),
    });
  }

  function withCorpAsset(
    defId: string,
    instanceId: string,
    opts?: { onTurnBegin?: Effect; rezCost?: number },
  ) {
    let s = createInitialState();
    s = structuredClone(s);
    const remoteId = "remote-1" as ServerId;
    s.servers[remoteId] = {
      id: remoteId,
      kind: "remote",
      ice: [],
      root: [],
    };
    const card = instantiateCard(defId, instanceId, `server:${remoteId}:root`);
    card.rezzed = true;
    card.faceup = true;
    card.unsupported = [];
    if (opts?.onTurnBegin) card.onTurnBegin = opts.onTurnBegin;
    if (opts?.rezCost !== undefined) card.rezCost = opts.rezCost;
    s.cards[instanceId] = card;
    s.servers[remoteId].root = [instanceId];
    s.corp.credits = 5;
    s.activeSide = "corp";
    s.timingKey = "corp.turnBegins";
    return { s, remoteId };
  }

  describe("MS may_trash_installed IR (always)", () => {
    it("validates Svyatogor / Extract / Stavka effect trees", () => {
      expect(validateEffectTree(svyatogorOnTurnBegin())).toBeNull();
      expect(validateEffectTree(extractOnPlay())).toBeNull();
      expect(validateEffectTree(stavkaOnRez())).toBeNull();
    });

    it("may_trash_installed offers targets + decline; choosing trashes + then", () => {
      const { s: base } = withCorpAsset("refuge-campaign", "svy-1", {
        onTurnBegin: svyatogorOnTurnBegin(),
      });
      let s = base;
      const otherRemote = "remote-2" as ServerId;
      s.servers[otherRemote] = {
        id: otherRemote,
        kind: "remote",
        ice: [],
        root: [],
      };
      const other = instantiateCard(
        "pad-campaign",
        "pad-1",
        `server:${otherRemote}:root`,
      );
      other.rezzed = true;
      other.faceup = true;
      s.cards["pad-1"] = other;
      s.servers[otherRemote].root = ["pad-1"];

      const r = evalEffect({ state: s, sourceId: "svy-1" }, svyatogorOnTurnBegin());
      expect(r.ok).toBe(true);
      expect(s.pendingChoice?.chooser).toBe("corp");
      expect(s.pendingChoice?.options.some((o) => o.id === "trash:pad-1")).toBe(
        true,
      );
      expect(s.pendingChoice?.options.some((o) => o.id === "decline")).toBe(true);
      expect(
        s.pendingChoice?.options.some((o) => o.id === "trash:svy-1"),
      ).toBe(false);

      s = must(s, { type: "choose_option", optionId: "trash:pad-1" });
      expect(s.corp.discardPile).toContain("pad-1");
      expect(s.servers[otherRemote]).toBeUndefined();
      expect(s.corp.credits).toBe(8); // 5 + 3
    });

    it("may_trash_installed no-ops when no other installed cards", () => {
      const { s } = withCorpAsset("refuge-campaign", "svy-1", {
        onTurnBegin: svyatogorOnTurnBegin(),
      });
      const before = s.corp.credits;
      const r = evalEffect({ state: s, sourceId: "svy-1" }, svyatogorOnTurnBegin());
      expect(r.ok).toBe(true);
      expect(s.pendingChoice).toBeFalsy();
      expect(s.corp.credits).toBe(before);
    });

    it("Extract gains 6 then may trash for +3", () => {
      let s = createInitialState();
      s = structuredClone(s);
      const remoteId = "remote-1" as ServerId;
      s.servers[remoteId] = {
        id: remoteId,
        kind: "remote",
        ice: [],
        root: [],
      };
      const pad = instantiateCard(
        "pad-campaign",
        "pad-1",
        `server:${remoteId}:root`,
      );
      pad.rezzed = true;
      pad.faceup = true;
      s.cards["pad-1"] = pad;
      s.servers[remoteId].root = ["pad-1"];

      const extract = instantiateCard("hedge-fund", "extract-1", "corp:hq");
      extract.onPlay = extractOnPlay();
      extract.playCost = 0;
      extract.unsupported = [];
      s.cards["extract-1"] = extract;
      s.corp.hand = ["extract-1"];
      s.corp.credits = 3;
      s.corp.clicks = 1;
      s.activeSide = "corp";
      s.timingKey = "corp.takeAction";

      s = must(s, { type: "play_operation", cardId: "extract-1" });
      expect(s.corp.credits).toBe(9); // 3 + 6; may-trash pending
      expect(s.pendingChoice?.options.some((o) => o.id === "trash:pad-1")).toBe(
        true,
      );
      s = must(s, { type: "choose_option", optionId: "trash:pad-1" });
      expect(s.corp.credits).toBe(12); // +3
      expect(s.corp.discardPile).toContain("pad-1");
    });

    it("Stavka on rez may trash other for +5 strength this run", () => {
      let s = createInitialState();
      s = structuredClone(s);
      const remoteId = "remote-1" as ServerId;
      s.servers[remoteId] = {
        id: remoteId,
        kind: "remote",
        ice: [],
        root: [],
      };
      const stavka = instantiateCard("stavka", "stavka-1", `server:${remoteId}:ice`);
      stavka.onRez = stavkaOnRez();
      stavka.unsupported = [];
      stavka.rezzed = false;
      stavka.strength = 2;
      s.cards["stavka-1"] = stavka;
      s.servers[remoteId].ice = ["stavka-1"];

      const pad = instantiateCard(
        "pad-campaign",
        "pad-1",
        `server:${remoteId}:root`,
      );
      pad.rezzed = false;
      pad.faceup = false;
      s.cards["pad-1"] = pad;
      s.servers[remoteId].root = ["pad-1"];

      s.corp.credits = 20;
      s.runner.credits = 10;
      s.runner.clicks = 4;
      s.activeSide = "runner";
      s.timingKey = "runner.takeAction";

      s = must(s, { type: "basic_run", serverId: remoteId });
      if (s.timingKey === "run.initiatePaw") {
        s = must(s, { type: "pass_window" });
        s = must(s, { type: "pass_window" });
      }
      s = must(s, { type: "rez_ice", cardId: "stavka-1" });
      expect(s.pendingChoice?.options.some((o) => o.id === "trash:pad-1")).toBe(
        true,
      );
      expect(
        s.pendingChoice?.options.some((o) => o.id === "trash:stavka-1"),
      ).toBe(false);

      s = must(s, { type: "choose_option", optionId: "trash:pad-1" });
      expect(s.corp.discardPile).toContain("pad-1");
      expect(s.run?.iceStrengthBoosts["stavka-1"]).toBe(5);
      expect(effectiveIceStrength(s, "stavka-1")).toBe(7);
    });

    it("may_trash_installed can target unrezzed ice", () => {
      let s = createInitialState();
      s = structuredClone(s);
      const remoteId = "remote-1" as ServerId;
      s.servers[remoteId] = {
        id: remoteId,
        kind: "remote",
        ice: [],
        root: [],
      };
      const ice = instantiateCard("ice-wall", "iw-1", `server:${remoteId}:ice`);
      ice.rezzed = false;
      s.cards["iw-1"] = ice;
      s.servers[remoteId].ice = ["iw-1"];

      const r = evalEffect(
        { state: s, sourceId: "corp-id" },
        fx.mayTrashInstalled({ excludeSelf: true }),
      );
      expect(r.ok).toBe(true);
      expect(s.pendingChoice?.options.some((o) => o.id === "trash:iw-1")).toBe(
        true,
      );
    });
  });

  describe("MS trash-other card defs (pin v0.31.0)", () => {
    it("Svyatogor / Extract / Stavka are fully clear with may_trash_installed", () => {
      const svy = getCardDef("svyatogor-excavator");
      expect(svy.unsupported).toEqual([]);
      expect(svy.onTurnBegin).toEqual(
        fx.mayTrashInstalled({
          excludeSelf: true,
          then: fx.gainCredits("corp", 3),
        }),
      );

      const extract = getCardDef("extract");
      expect(extract.unsupported).toEqual([]);
      expect(extract.onPlay).toEqual(
        fx.seq(
          fx.gainCredits("corp", 6),
          fx.mayTrashInstalled({
            excludeSelf: true,
            then: fx.gainCredits("corp", 3),
          }),
        ),
      );

      const stavka = getCardDef("stavka");
      expect(stavka.unsupported).toEqual([]);
      expect(stavka.onRez).toEqual(
        fx.mayTrashInstalled({
          excludeSelf: true,
          then: fx.fortify(5),
        }),
      );
    });
  });
  });

  describe("midnight-sun-trieste-regenesis-wave", () => {
  beforeAll(() => {
    if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
    if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
    assertPinnedTag("v26.03");
    assertCardsPinnedTag("v1.147.6");
  });


  describe("MS Trieste choose_rezzed_bioroid_forbid_runner_break", () => {
    it("validates tree", () => {
      expect(
        validateEffectTree(fx.chooseRezzedBioroidForbidRunnerBreak()),
      ).toBeNull();
    });

    it("marks the only rezzed bioroid ice", () => {
      let s = createInitialState();
      s = structuredClone(s);
      const ice = instantiateCard("hakarl-1-0", "bio-1", "server:hq:ice");
      ice.rezzed = true;
      s.cards["bio-1"] = ice;
      s.servers.hq.ice = ["bio-1"];
      const r = evalEffect(
        { state: s, sourceId: s.corp.identityId },
        fx.chooseRezzedBioroidForbidRunnerBreak(),
      );
      expect(r.ok).toBe(true);
      expect(s.cards["bio-1"].cannotBreakWithRunnerCardAbilities).toBe(true);
    });
  });

  describe("MS Wave search_rd_ice + gain_credits_per_rezzed_subtype", () => {
    it("validates trees", () => {
      expect(validateEffectTree(fx.searchRdIceToHq())).toBeNull();
      expect(
        validateEffectTree(fx.gainCreditsPerRezzedSubtype("harmonic")),
      ).toBeNull();
    });

    it("searches R&D for ice into HQ", () => {
      let s = createInitialState();
      s = structuredClone(s);
      const ice = instantiateCard("ice-wall", "rd-ice", "corp:rd");
      s.cards["rd-ice"] = ice;
      s.corp.deck = ["rd-ice", ...s.corp.deck];
      const r = evalEffect(
        { state: s, sourceId: s.corp.identityId },
        fx.searchRdIceToHq(),
      );
      expect(r.ok).toBe(true);
      expect(s.corp.hand).toContain("rd-ice");
      expect(s.cards["rd-ice"].zone).toBe("corp:hq");
    });

    it("gains 1¢ per rezzed harmonic ice", () => {
      let s = createInitialState();
      s = structuredClone(s);
      s.corp.credits = 0;
      const h1 = instantiateCard("ice-wall", "h1", "server:hq:ice");
      h1.rezzed = true;
      h1.subtypes = ["code gate", "harmonic"];
      s.cards["h1"] = h1;
      s.servers.hq.ice = ["h1"];
      const h2 = instantiateCard("ice-wall", "h2", "server:rd:ice");
      h2.rezzed = true;
      h2.subtypes = ["barrier", "harmonic"];
      s.cards["h2"] = h2;
      s.servers.rd.ice = ["h2"];
      const r = evalEffect(
        { state: s, sourceId: s.corp.identityId },
        fx.gainCreditsPerRezzedSubtype("harmonic"),
      );
      expect(r.ok).toBe(true);
      expect(s.corp.credits).toBe(2);
    });
  });

  describe("MS Regenesis score_facedown_agenda_from_archives_if_clean", () => {
    it("validates tree", () => {
      expect(
        validateEffectTree(fx.scoreFacedownAgendaFromArchivesIfClean()),
      ).toBeNull();
    });

    it("skips when Corp cards were added to Archives this turn", () => {
      let s = createInitialState();
      s = structuredClone(s);
      s.turn.corpCardsAddedToArchivesThisTurn = 2;
      const ag = instantiateCard("hostile-takeover", "arch-ag2", "corp:archives");
      ag.faceup = false;
      s.cards["arch-ag2"] = ag;
      s.corp.discardPile = ["arch-ag2"];
      const r = evalEffect(
        { state: s, sourceId: s.corp.identityId },
        fx.scoreFacedownAgendaFromArchivesIfClean(),
      );
      expect(r.ok).toBe(true);
      expect(s.corp.scoreArea).not.toContain("arch-ag2");
    });

    it("scores a facedown Archives agenda when Archives was clean", () => {
      let s = createInitialState();
      s = structuredClone(s);
      s.turn.corpCardsAddedToArchivesThisTurn = 0;
      const ag = instantiateCard("hostile-takeover", "arch-ag", "corp:archives");
      ag.faceup = false;
      s.cards["arch-ag"] = ag;
      s.corp.discardPile = ["arch-ag"];
      const before = agendaPointsFor(s, "corp");
      const r = evalEffect(
        { state: s, sourceId: s.corp.identityId },
        fx.scoreFacedownAgendaFromArchivesIfClean(),
      );
      expect(r.ok).toBe(true);
      expect(s.corp.scoreArea).toContain("arch-ag");
      expect(s.cards["arch-ag"].faceup).toBe(true);
      expect(agendaPointsFor(s, "corp")).toBe(before + 1);
    });
  });

  describe("MS card wiring (Trieste / Wave / Regenesis)", () => {
    it("wires cleared cards", () => {
      expect(getCardDef("trieste-model-bioroids").unsupported).toEqual([]);
      expect(getCardDef("wave").unsupported).toEqual([]);
      expect(getCardDef("regenesis").unsupported).toEqual([]);
      expect(getCardDef("regenesis").onScore).toEqual(fx.scoreFacedownAgendaFromArchivesIfClean());
    });
  });
  });

  describe("midnight-sun-trust-operation", () => {
  beforeAll(() => {
    if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
    if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
    assertPinnedTag("v26.03");
    assertCardsPinnedTag("v1.147.6");
  });


  function trustOnPlay(): Effect {
    return fx.seq(
      fx.trashResource("choose"),
      fx.installAndRezFromArchivesFree(),
    );
  }

  describe("MS install_and_rez_from_archives_free (Trust Operation)", () => {
    it("validates Trust Operation effect tree", () => {
      expect(validateEffectTree(trustOnPlay())).toBeNull();
    });

    it("installs and rezzes an Archives asset into a new remote", () => {
      let s = createInitialState();
      s = structuredClone(s);
      const asset = instantiateCard("pad-campaign", "arch-1", "corp:archives");
      s.cards["arch-1"] = asset;
      s.corp.discardPile = ["arch-1"];
      s.runner.installed = [];
      // No resources — trash_resource no-ops; install still runs.
      const r = evalEffect(
        { state: s, sourceId: s.corp.identityId },
        fx.installAndRezFromArchivesFree(),
      );
      expect(r.ok).toBe(true);
      expect(s.corp.discardPile).not.toContain("arch-1");
      expect(s.cards["arch-1"].rezzed).toBe(true);
      expect(s.cards["arch-1"].zone).toMatch(/^server:remote-\d+:root$/);
    });

    it("installs ice from Archives protecting a new remote", () => {
      let s = createInitialState();
      s = structuredClone(s);
      const ice = instantiateCard("ice-wall", "arch-ice", "corp:archives");
      s.cards["arch-ice"] = ice;
      s.corp.discardPile = ["arch-ice"];
      const r = evalEffect(
        { state: s, sourceId: s.corp.identityId },
        fx.installAndRezFromArchivesFree(),
      );
      expect(r.ok).toBe(true);
      expect(s.cards["arch-ice"].rezzed).toBe(true);
      expect(s.cards["arch-ice"].zone).toMatch(/^server:remote-\d+:ice$/);
    });

    it("Trust Operation card wiring is fully clear on pin v0.34.0", () => {
      const def = getCardDef("trust-operation");
      expect(def.unsupported ?? []).toEqual([]);
      expect(def.playRequiresTagged).toBe(true);
      expect(def.onPlay).toBeTruthy();
    });
  });
  });

  describe("midnight-sun-twinning", () => {
  beforeAll(() => {
    if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
    if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
    assertPinnedTag("v26.03");
    assertCardsPinnedTag("v1.147.6");
  });

  describe("MS The Twinning power + bonus access", () => {
    it("places power on first installed-card credit spend this turn", () => {
      let s = createInitialState();
      s = structuredClone(s);
      const twin = instantiateCard("aesops-pawnshop", "tw-1", "runner:installed");
      twin.powerOnFirstInstalledCardCreditSpendThisTurn = true;
      twin.powerCounters = 0;
      s.cards["tw-1"] = twin;
      s.runner.installed = ["tw-1"];
      noteInstalledCardCreditSpend(s);
      expect(s.cards["tw-1"].powerCounters).toBe(1);
      noteInstalledCardCreditSpend(s);
      expect(s.cards["tw-1"].powerCounters).toBe(1);
    });

    it("removes up to 2 power for bonus access on HQ breach", () => {
      let s = createInitialState();
      s = structuredClone(s);
      const twin = instantiateCard("aesops-pawnshop", "tw-1", "runner:installed");
      twin.removePowerForBonusAccessOnHqRdBreach = 2;
      twin.powerCounters = 3;
      s.cards["tw-1"] = twin;
      s.runner.installed = ["tw-1"];
      s.corp.hand = [];
      const c1 = instantiateCard("hedge-fund", "c1", "corp:hq");
      const c2 = instantiateCard("hedge-fund", "c2", "corp:hq");
      const c3 = instantiateCard("hedge-fund", "c3", "corp:hq");
      s.cards["c1"] = c1;
      s.cards["c2"] = c2;
      s.cards["c3"] = c3;
      s.corp.hand = ["c1", "c2", "c3"];
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
      expect(s.cards["tw-1"].powerCounters).toBe(1);
      expect(s.run!.bonusAccess).toBe(2);
    });
  });
  });

  describe("midnight-sun-ubiquitous-vig", () => {
  beforeAll(() => {
    if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
    if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
    assertPinnedTag("v26.03");
    assertCardsPinnedTag("v1.147.6");
  });

  function vigOnTurnBegin(): Effect {
    return fx.gainCreditsPerAdvancement(1);
  }

  function withRezzedVig(advancements: number) {
    let s = createInitialState();
    s = structuredClone(s);
    const remoteId = "remote-1" as ServerId;
    s.servers[remoteId] = {
      id: remoteId,
      kind: "remote",
      ice: [],
      root: [],
    };
    const card = instantiateCard(
      "ubiquitous-vig",
      "vig-1",
      `server:${remoteId}:root`,
    );
    card.rezzed = true;
    card.faceup = true;
    card.unsupported = [];
    card.onTurnBegin = vigOnTurnBegin();
    card.canAdvance = true;
    card.advancementCounters = advancements;
    s.cards["vig-1"] = card;
    s.servers[remoteId].root = ["vig-1"];
    s.corp.credits = 5;
    s.activeSide = "corp";
    s.timingKey = "corp.turnBegins";
    return { s, remoteId };
  }

  describe("MS gain_credits_per_advancement IR (always)", () => {
    it("validates Ubiquitous Vig turn-begin effect tree", () => {
      expect(validateEffectTree(vigOnTurnBegin())).toBeNull();
    });

    it("gains 1¢ per hosted advancement on the source", () => {
      const { s } = withRezzedVig(3);
      const before = s.corp.credits;
      const r = evalEffect({ state: s, sourceId: "vig-1" }, vigOnTurnBegin());
      expect(r.ok).toBe(true);
      expect(s.corp.credits).toBe(before + 3);
    });

    it("gains 0¢ when the source has no advancements", () => {
      const { s } = withRezzedVig(0);
      const before = s.corp.credits;
      const r = evalEffect({ state: s, sourceId: "vig-1" }, vigOnTurnBegin());
      expect(r.ok).toBe(true);
      expect(s.corp.credits).toBe(before);
    });

    it("corp.turnBegins fires onTurnBegin for rezzed Vig", () => {
      const { s } = withRezzedVig(2);
      s.corp.credits = 10;
      resolveAndAdvance(s);
      expect(s.corp.credits).toBe(12);
      expect(
        s.log.some((line) =>
          line.includes("corp gains 2¢ (CR 1.10.3a)"),
        ),
      ).toBe(true);
    });
  });

  describe("MS Ubiquitous Vig card wiring (v0.31.0+)", () => {
    it("wires onTurnBegin gain_credits_per_advancement; unsupported empty", () => {
      const def = getCardDef("ubiquitous-vig");
      expect(def.type).toBe("asset");
      expect(def.canAdvance).toBe(true);
      expect(def.unsupported).toEqual([]);
      expect(def.onTurnBegin).toEqual(fx.gainCreditsPerAdvancement(1));
      expect(validateEffectTree(def.onTurnBegin)).toBeNull();
    });
  });
  });

  describe("midnight-sun-vasilisa", () => {
  beforeAll(() => {
    if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
    if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
    assertPinnedTag("v26.03");
    assertCardsPinnedTag("v1.147.6");
  });

  function must(
    state: ReturnType<typeof createInitialState>,
    action: Parameters<typeof applyAction>[1],
  ) {
    const r = applyAction(state, action);
    if (!r.ok) throw new Error(`${r.error} ${JSON.stringify(r.cites)}`);
    return r.state;
  }

  describe("MS place_advancements advanceable-only (Vasilisa)", () => {
    it("places on agenda, skips non-advanceable ice", () => {
      let s = createInitialState();
      s = structuredClone(s);
      const ice = instantiateCard("enigma", "ice-1", "server:hq:ice");
      ice.rezzed = true;
      ice.canAdvance = false;
      s.cards["ice-1"] = ice;
      s.servers.hq.ice = ["ice-1"];

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

      const r = evalEffect(
        { state: s, sourceId: "ice-1" },
        fx.placeAdvancements(1),
      );
      expect(r.ok).toBe(true);
      expect(s.cards["ag-1"].advancementCounters).toBe(1);
      expect(s.cards["ice-1"].advancementCounters ?? 0).toBe(0);
    });

    it("places on canAdvance asset, skips non-advanceable asset", () => {
      let s = createInitialState();
      s = structuredClone(s);
      const remote1 = "remote-1" as ServerId;
      const remote2 = "remote-2" as ServerId;
      s.servers[remote1] = { id: remote1, kind: "remote", ice: [], root: [] };
      s.servers[remote2] = { id: remote2, kind: "remote", ice: [], root: [] };

      const plain = instantiateCard("pad-campaign", "plain-1", `server:${remote1}:root`);
      plain.canAdvance = false;
      s.cards["plain-1"] = plain;
      s.servers[remote1].root = ["plain-1"];

      const adv = instantiateCard("ubiquitous-vig", "adv-1", `server:${remote2}:root`);
      adv.canAdvance = true;
      s.cards["adv-1"] = adv;
      s.servers[remote2].root = ["adv-1"];

      const r = evalEffect(
        { state: s, sourceId: "adv-1" },
        fx.placeAdvancements(2),
      );
      expect(r.ok).toBe(true);
      expect(s.cards["adv-1"].advancementCounters).toBe(2);
      expect(s.cards["plain-1"].advancementCounters ?? 0).toBe(0);
    });

    it("no-ops when only non-advanceable cards are installed", () => {
      let s = createInitialState();
      s = structuredClone(s);
      const ice = instantiateCard("enigma", "ice-1", "server:hq:ice");
      s.cards["ice-1"] = ice;
      s.servers.hq.ice = ["ice-1"];
      const r = evalEffect(
        { state: s, sourceId: "ice-1" },
        fx.placeAdvancements(1),
      );
      expect(r.ok).toBe(true);
      expect(s.cards["ice-1"].advancementCounters ?? 0).toBe(0);
      expect(s.log.some((l) => /no eligible card/.test(l))).toBe(true);
    });

    it("Vasilisa encounter pay-adv path places on advanceable target", () => {
      let s = createInitialState();
      s = structuredClone(s);
      const remoteId = "remote-1" as ServerId;
      s.servers[remoteId] = { id: remoteId, kind: "remote", ice: [], root: [] };

      const vas = instantiateCard("vasilisa", "vas-1", `server:${remoteId}:ice`);
      vas.unsupported = [];
      vas.rezzed = true;
      vas.faceup = true;
      s.cards["vas-1"] = vas;
      s.servers[remoteId].ice = ["vas-1"];

      const agenda = instantiateCard(
        "hostile-takeover",
        "ag-1",
        "server:remote-2:root",
      );
      s.cards["ag-1"] = agenda;
      s.servers["remote-2"] = {
        id: "remote-2",
        kind: "remote",
        ice: [],
        root: ["ag-1"],
      };

      s.corp.credits = 5;
      s.runner.clicks = 4;
      s.runner.credits = 10;
      s.activeSide = "runner";
      s.timingKey = "runner.takeAction";

      s = must(s, { type: "basic_run", serverId: remoteId });
      // Approach → rez already done; walk to encounter
      // Vasilisa may already be rezzed; pass approach if needed
      if (s.timingKey === "run.approachPaw") {
        s = must(s, { type: "pass_window" });
      }
      // Encounter should fire onEncounter choose
      expect(s.pendingChoice?.options.some((o) => o.id === "pay-adv")).toBe(true);
      const before = s.corp.credits;
      s = must(s, { type: "choose_option", optionId: "pay-adv" });
      expect(s.corp.credits).toBe(before - 1);
      expect(s.cards["ag-1"].advancementCounters).toBe(1);
    });
  });

  describe("MS Vasilisa card wiring (v0.31.0+)", () => {
    it("Vasilisa clears unsupported with advanceable place_advancements", () => {
      const def = getCardDef("vasilisa");
      expect(def.unsupported).toEqual([]);
      expect(def.type).toBe("ice");
      expect(def.onEncounter).toBeTruthy();
      expect(def.strength).toBe(2);
      expect(def.rezCost).toBe(2);
    });
  });
  });

  describe("midnight-sun-virtuoso-mark-hq", () => {
  beforeAll(() => {
    if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
    if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
    assertPinnedTag("v26.03");
    assertCardsPinnedTag("v1.147.6");
  });

  function must(
    state: ReturnType<typeof createInitialState>,
    action: Parameters<typeof applyAction>[1],
  ) {
    const r = applyAction(state, action);
    if (!r.ok) throw new Error(`${r.error} ${JSON.stringify(r.cites)}`);
    return r.state;
  }

  function virtuosoMarkEffect() {
    return fx.if(
      { op: "attacking_hq" },
      fx.bonusAccess(1),
      fx.breachServerWhenRunEnds("hq"),
    );
  }

  describe("MS Virtuoso mark-HQ IR (always)", () => {
    it("accepts Virtuoso-shaped onFirstSuccessfulMarkRunThisTurn Effect IR", () => {
      expect(validateEffectTree(virtuosoMarkEffect())).toBeNull();
    });

    it("HQ mark → +1 bonus access during mark breach", () => {
      let s = createInitialState();
      s = structuredClone(s);
      s.markServerId = "hq";

      const v = instantiateCard("virtuoso", "v-1", "runner:installed");
      v.onFirstSuccessfulMarkRunThisTurn = virtuosoMarkEffect();
      s.cards["v-1"] = v;
      s.runner.installed = ["v-1"];

      // Two cards in HQ so bonus access can add a second candidate.
      const a = instantiateCard("hedge-fund", "hq-a", "corp:hq");
      const b = instantiateCard("hedge-fund", "hq-b", "corp:hq");
      s.cards["hq-a"] = a;
      s.cards["hq-b"] = b;
      s.corp.hand = ["hq-a", "hq-b"];
      s.servers.hq.ice = [];
      s.servers.hq.root = [];
      s.activeSide = "runner";
      s.timingKey = "runner.takeAction";
      s.runner.clicks = 4;

      s = must(s, { type: "basic_run", serverId: "hq" as ServerId });
      expect(s.turn.successfulMarkRunThisTurn).toBe(true);
      expect(s.turn.successfulRunThisTurn).toBe(true);
      // Still mid-breach with bonus access.
      expect(s.run?.bonusAccess).toBe(1);
      expect(s.timingKey).toBe("breach.awaitAccess");
      expect(s.run?.randomAccessLimit).toBeGreaterThanOrEqual(2);
      expect(s.run?.accessCandidates.length).toBeGreaterThanOrEqual(2);

      // Finish breach — non-agenda access auto-continues.
      while (s.run && s.timingKey === "breach.awaitAccess") {
        if (s.run.accessCandidates.length === 0) {
          s = must(s, { type: "finish_breach" });
          break;
        }
        const cand = s.run.accessCandidates[0]!;
        s = must(s, { type: "access_card", cardId: cand });
      }
      expect(s.run).toBeNull();
    });

    it("non-HQ mark → post-run HQ breach (not a successful HQ run)", () => {
      let s = createInitialState();
      s = structuredClone(s);
      s.markServerId = "archives";

      const v = instantiateCard("virtuoso", "v-2", "runner:installed");
      v.onFirstSuccessfulMarkRunThisTurn = virtuosoMarkEffect();
      s.cards["v-2"] = v;
      s.runner.installed = ["v-2"];

      const hqCard = instantiateCard("hedge-fund", "hq-1", "corp:hq");
      s.cards["hq-1"] = hqCard;
      s.corp.hand = ["hq-1"];
      s.servers.archives.ice = [];
      s.servers.archives.root = [];
      s.corp.discardPile = [];
      s.activeSide = "runner";
      s.timingKey = "runner.takeAction";
      s.runner.clicks = 4;

      s = must(s, { type: "basic_run", serverId: "archives" as ServerId });
      expect(s.turn.successfulMarkRunThisTurn).toBe(true);
      // Archives empty → mark breach auto-completes; then post-run HQ breach.
      expect(s.run?.isPostRunBreach).toBe(true);
      expect(s.run?.attackedServerId).toBe("hq");
      expect(s.run?.successful).toBeNull();
      expect(s.timingKey).toBe("breach.awaitAccess");
      expect(s.turn.successfulHqRunThisTurn).toBe(false);

      s = must(s, { type: "access_card", cardId: "hq-1" });
      expect(s.run).toBeNull();
      expect(s.turn.successfulHqRunThisTurn).toBe(false);
      expect(s.log.some((l) => /Post-run breach of hq/i.test(l))).toBe(true);
    });

    it("fires only on the first successful mark run each turn", () => {
      let s = createInitialState();
      s = structuredClone(s);
      s.markServerId = "archives";

      const v = instantiateCard("virtuoso", "v-3", "runner:installed");
      v.onFirstSuccessfulMarkRunThisTurn = virtuosoMarkEffect();
      s.cards["v-3"] = v;
      s.runner.installed = ["v-3"];
      s.servers.archives.ice = [];
      s.corp.discardPile = [];
      s.corp.hand = [];
      s.activeSide = "runner";
      s.timingKey = "runner.takeAction";
      s.runner.clicks = 4;

      s = must(s, { type: "basic_run", serverId: "archives" as ServerId });
      expect(s.turn.successfulMarkRunThisTurn).toBe(true);
      const postLogs = s.log.filter((l) => /Post-run breach of hq/i.test(l));
      expect(postLogs).toHaveLength(1);

      // Drain empty HQ post-run breach if still open
      while (s.run && s.timingKey === "breach.awaitAccess") {
        if (s.run.accessCandidates.length === 0) {
          s = must(s, { type: "finish_breach" });
        } else {
          const cand = s.run.accessCandidates[0]!;
          s = must(s, { type: "access_card", cardId: cand });
        }
      }

      if (s.timingKey === "runner.actionPaw") {
        s = must(s, { type: "pass_window" });
      }
      expect(s.timingKey).toBe("runner.takeAction");
      s.runner.clicks = 4;
      const logLen = s.log.length;
      s = must(s, { type: "basic_run", serverId: "archives" as ServerId });
      const newPost = s.log
        .slice(logLen)
        .filter((l) => /Post-run breach of hq/i.test(l));
      expect(newPost).toHaveLength(0);
    });

    it("non-mark successful run does not consume the mark trigger", () => {
      let s = createInitialState();
      s = structuredClone(s);
      s.markServerId = "hq";

      const v = instantiateCard("virtuoso", "v-4", "runner:installed");
      v.onFirstSuccessfulMarkRunThisTurn = virtuosoMarkEffect();
      s.cards["v-4"] = v;
      s.runner.installed = ["v-4"];
      s.servers.archives.ice = [];
      s.corp.discardPile = [];
      s.activeSide = "runner";
      s.timingKey = "runner.takeAction";
      s.runner.clicks = 4;

      s = must(s, { type: "basic_run", serverId: "archives" as ServerId });
      expect(s.turn.successfulMarkRunThisTurn).toBe(false);
      expect(s.turn.successfulRunThisTurn).toBe(true);
      expect(s.log.some((l) => /bonus access|Post-run breach/i.test(l))).toBe(
        false,
      );
    });

    it("installing a second console trashes the first (CR 3.8.5b)", () => {
      let s = createInitialState();
      s = structuredClone(s);
      const first = instantiateCard("virtuoso", "con-1", "runner:grip");
      const second = instantiateCard("endurance", "con-2", "runner:grip");
      s.cards["con-1"] = first;
      s.cards["con-2"] = second;
      s.runner.hand = ["con-1", "con-2"];
      s.runner.credits = 20;
      s.runner.clicks = 4;
      s.activeSide = "runner";
      s.timingKey = "runner.takeAction";

      s = must(s, { type: "basic_install", cardId: "con-1", destination: { kind: "installed" } });
      expect(s.runner.installed).toContain("con-1");
      if (s.timingKey === "runner.actionPaw") {
        s = must(s, { type: "pass_window" });
      }
      s = must(s, { type: "basic_install", cardId: "con-2", destination: { kind: "installed" } });
      expect(s.runner.installed).toContain("con-2");
      expect(s.runner.installed).not.toContain("con-1");
      expect(s.runner.discardPile).toContain("con-1");
      expect(s.log.some((l) => /console limit/i.test(l))).toBe(true);
    });
  });

  describe("MS Virtuoso / console card wiring (v0.31.0+)", () => {
    it("Virtuoso fully wired; Endurance and Marrow console notes cleared", () => {
      expect(getCardDef("virtuoso").unsupported).toEqual([]);
      expect(getCardDef("endurance").unsupported).toEqual([]);
      expect(getCardDef("marrow").unsupported).toEqual([]);
      expect(getCardDef("virtuoso").onFirstSuccessfulMarkRunThisTurn).toBeTruthy();
      expect(
        validateEffectTree(getCardDef("virtuoso").onFirstSuccessfulMarkRunThisTurn!),
      ).toBeNull();
      expect(getCardDef("virtuoso").onTurnBegin).toEqual(fx.identifyMark());
    });
  });
  });

  describe("midnight-sun-vladisibirsk", () => {
  beforeAll(() => {
    if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
    if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
    assertPinnedTag("v26.03");
    assertCardsPinnedTag("v1.147.6");
  });

  function must(
    state: ReturnType<typeof createInitialState>,
    action: Parameters<typeof applyAction>[1],
  ) {
    const r = applyAction(state, action);
    if (!r.ok) throw new Error(`${r.error} ${JSON.stringify(r.cites)}`);
    return r.state;
  }

  function vladPlace(): ReturnType<typeof fx.placeAdvancements> {
    return fx.placeAdvancements(2, false, {
      sameServerRootAsSource: true,
      excludeSelf: true,
    });
  }

  describe("MS Vladisibirsk same-server place_advancements", () => {
    it("validates sameServerRootAsSource tree", () => {
      expect(validateEffectTree(vladPlace())).toBeNull();
    });

    it("places on another advanceable root card in the same server only", () => {
      let s = createInitialState();
      s = structuredClone(s);
      const remote = "remote-1" as ServerId;
      s.servers[remote] = { id: remote, kind: "remote", ice: [], root: [] };
      const vlad = instantiateCard(
        "vladisibirsk-city-grid",
        "vlad-1",
        `server:${remote}:root`,
      );
      vlad.rezzed = true;
      vlad.advancementCounters = 2;
      s.cards["vlad-1"] = vlad;
      const agenda = instantiateCard(
        "hostile-takeover",
        "ag-1",
        `server:${remote}:root`,
      );
      agenda.advancementCounters = 0;
      s.cards["ag-1"] = agenda;
      // Other server agenda should not receive advancement counters.
      const remote2 = "remote-2" as ServerId;
      s.servers[remote2] = { id: remote2, kind: "remote", ice: [], root: [] };
      const other = instantiateCard(
        "hostile-takeover",
        "ag-2",
        `server:${remote2}:root`,
      );
      other.advancementCounters = 0;
      s.cards["ag-2"] = other;
      s.servers[remote].root = ["vlad-1", "ag-1"];
      s.servers[remote2].root = ["ag-2"];

      const r = evalEffect({ state: s, sourceId: "vlad-1" }, vladPlace());
      expect(r.ok).toBe(true);
      expect(s.cards["ag-1"].advancementCounters).toBe(2);
      expect(s.cards["ag-2"].advancementCounters).toBe(0);
      expect(s.cards["vlad-1"].advancementCounters).toBe(2); // cost not paid here
    });

    it("paid ability spends 2 advancements and places 2 on sibling root", () => {
      let s = createInitialState();
      s = structuredClone(s);
      const remote = "remote-1" as ServerId;
      s.servers[remote] = { id: remote, kind: "remote", ice: [], root: [] };
      const vlad = instantiateCard(
        "vladisibirsk-city-grid",
        "vlad-1",
        `server:${remote}:root`,
      );
      vlad.rezzed = true;
      vlad.faceup = true;
      vlad.advancementCounters = 2;
      vlad.unsupported = [];
      vlad.paidAbilities = [
        {
          id: "vlad-move",
          label: "Remove 2 advancements: place 2 on another root card",
          clickCost: 1,
          creditCost: 0,
          cost: { clicks: 1, advancementCounters: 2 },
          flag: "once_per_turn",
          windows: ["corp_action_paw"],
          effect: vladPlace(),
        },
      ];
      s.cards["vlad-1"] = vlad;
      const agenda = instantiateCard(
        "hostile-takeover",
        "ag-1",
        `server:${remote}:root`,
      );
      agenda.advancementCounters = 1;
      s.cards["ag-1"] = agenda;
      s.servers[remote].root = ["vlad-1", "ag-1"];
      s.corp.clicks = 3;
      s.activeSide = "corp";
      s.timingKey = "corp.takeAction";

      const legal = queryLegality(s).legal;
      expect(
        legal.some(
          (e) =>
            e.action.type === "use_paid_ability" &&
            e.action.cardId === "vlad-1" &&
            e.action.abilityId === "vlad-move",
        ),
      ).toBe(true);
      s = must(s, {
        type: "use_paid_ability",
        cardId: "vlad-1",
        abilityId: "vlad-move",
      });
      expect(s.cards["vlad-1"].advancementCounters).toBe(0);
      expect(s.cards["ag-1"].advancementCounters).toBe(3);
      expect(s.corp.clicks).toBe(2);
    });

    it("Vladisibirsk card wiring is fully clear on pin v0.48.0", () => {
      const def = getCardDef("vladisibirsk-city-grid");
      expect(def.unsupported ?? []).toEqual([]);
      expect(def.paidAbilities?.[0]?.cost?.advancementCounters).toBe(2);
    });
  });
  });

  describe("midnight-sun-wiring", () => {
  beforeAll(() => {
    if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
    if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
    assertPinnedTag("v26.03");
    assertCardsPinnedTag("v1.147.6");
  });

  function must(
    state: ReturnType<typeof createInitialState>,
    action: Parameters<typeof applyAction>[1],
  ) {
    const r = applyAction(state, action);
    if (!r.ok) throw new Error(`${r.error} ${JSON.stringify(r.cites)}`);
    return r.state;
  }

  function assertCardsWiringPresent(): void {
    const chastushka = getCardDef("chastushka");
    expect(chastushka.unsupported).toEqual([]);
    expect(chastushka.runEvent?.skipBreach).toBe(true);
  }

  describe("MS host wiring (always)", () => {
    it("skipBreach on runEvent skips breach after successful run", () => {
      let s = createInitialState();
      s = structuredClone(s);
      // Synthetic Chastushka-shaped event
      const ev = instantiateCard("jailbreak", "chast-1", "runner:grip");
      ev.runEvent = {
        servers: "hq",
        skipBreach: true,
        onSuccessfulRun: fx.sabotage(2, true),
      };
      ev.playCost = 0;
      s.cards["chast-1"] = ev;
      s.runner.hand = ["chast-1"];
      s.runner.credits = 5;
      s.runner.clicks = 4;
      s.activeSide = "runner";
      s.timingKey = "runner.takeAction";
      s.servers.hq.ice = [];
      s = must(s, { type: "play_event", cardId: "chast-1", serverId: "hq" });
      expect(s.pendingSabotage?.amount).toBe(2);
      expect(s.turn.successfulRunThisTurn).toBe(true);
      // No breach access remaining
      expect(s.run).toBeNull();
    });

    it("identity onTurnBegin fires identify_mark", () => {
      let s = createInitialState();
      s = structuredClone(s);
      const id = s.cards[s.runner.identityId]!;
      id.onTurnBegin = fx.identifyMark();
      expect(s.markServerId).toBeNull();
      s.timingKey = "runner.turnBegins";
      resolveAndAdvance(s);
      expect(s.markServerId).toBeTruthy();
    });

    it("installed onAgendaScored fires sabotage for Marrow-class", () => {
      let s = createInitialState();
      s = structuredClone(s);
      // Avoid Corp ID onAgendaScored (HB Precision Design) consuming the score window.
      const corpId = instantiateCard(
        "weyland-consortium-built-to-last",
        "corp-id",
        "corp:hq",
      );
      s.cards["corp-id"] = corpId;
      s.corp.identityId = "corp-id";

      const marrow = instantiateCard("marrow", "marrow-1", "runner:installed");
      marrow.onAgendaScored = fx.sabotage(1, true);
      s.cards["marrow-1"] = marrow;
      s.runner.installed.push("marrow-1");

      const agenda = instantiateCard(
        "hostile-takeover",
        "ag-1",
        "server:remote-1:root",
      );
      agenda.advancementCounters = agenda.advancementRequirement ?? 2;
      s.cards["ag-1"] = agenda;
      s.servers["remote-1"] = {
        id: "remote-1",
        kind: "remote",
        ice: [],
        root: ["ag-1"],
      };
      s.corp.clicks = 3;
      s.corp.credits = 10;
      s.activeSide = "corp";
      s.timingKey = "corp.actionPaw";
      s = must(s, { type: "score_agenda", cardId: "ag-1" });
      expect(s.pendingSabotage?.amount).toBe(1);
    });

    it("onAgendaScoredOrStolen may-charge for Daeg-class", () => {
      let s = createInitialState();
      s = structuredClone(s);
      const daeg = instantiateCard("daeg-first-net-cat", "daeg-1", "runner:installed");
      daeg.onAgendaScoredOrStolen = fx.choose("runner", [
        {
          id: "charge",
          label: "Charge 1 installed card",
          effect: fx.chargeChoose(),
        },
        {
          id: "decline",
          label: "Decline",
          effect: fx.gainCredits("runner", 0),
        },
      ]);
      s.cards["daeg-1"] = daeg;
      s.runner.installed.push("daeg-1");
      const prop = instantiateCard("propeller", "prop-1", "runner:installed");
      prop.powerCounters = 1;
      s.cards["prop-1"] = prop;
      s.runner.installed.push("prop-1");

      const agenda = instantiateCard(
        "hostile-takeover",
        "ag-2",
        "server:remote-2:root",
      );
      agenda.advancementCounters = agenda.advancementRequirement ?? 2;
      s.cards["ag-2"] = agenda;
      s.servers["remote-2"] = {
        id: "remote-2",
        kind: "remote",
        ice: [],
        root: ["ag-2"],
      };
      s.corp.clicks = 3;
      s.corp.credits = 10;
      s.activeSide = "corp";
      s.timingKey = "corp.actionPaw";
      s = must(s, { type: "score_agenda", cardId: "ag-2" });
      expect(s.pendingChoice?.chooser).toBe("runner");
      s = must(s, { type: "choose_option", optionId: "charge" });
      // sole chargeable → auto charge
      expect(s.cards["prop-1"].powerCounters).toBe(2);
    });

    it("Stoneship charge paid ability eval", () => {
      const s = createInitialState();
      const ship = instantiateCard("stoneship-chart-room", "ship-1", "runner:installed");
      // Ensure charge ability exists even on pre-wiring pin
      if (!ship.paidAbilities?.some((a) => a.id === "stoneship-charge")) {
        ship.paidAbilities = [
          ...(ship.paidAbilities ?? []),
          {
            id: "stoneship-charge",
            label: "Trash Stoneship Chart Room: charge 1 installed card",
            clickCost: 0,
            creditCost: 0,
            cost: { trashSelf: true },
            windows: ["runner_action_paw"],
            effect: fx.chargeChoose(),
          },
        ];
      }
      s.cards["ship-1"] = ship;
      s.runner.installed.push("ship-1");
      const prop = instantiateCard("propeller", "prop-s", "runner:installed");
      prop.powerCounters = 2;
      s.cards["prop-s"] = prop;
      s.runner.installed.push("prop-s");
      s.activeSide = "runner";
      s.timingKey = "runner.actionPaw";
      const before = prop.powerCounters;
      const next = must(s, {
        type: "use_paid_ability",
        cardId: "ship-1",
        abilityId: "stoneship-charge",
      });
      expect(next.cards["prop-s"].powerCounters).toBe(before + 1);
      expect(next.runner.discardPile).toContain("ship-1");
    });

    it("Carpe Diem onPlay identify_mark + gain credits", () => {
      const s = createInitialState();
      const before = s.runner.credits;
      const r = evalEffect(
        { state: s, sourceId: "runner-id" },
        fx.seq(fx.identifyMark(), fx.gainCredits("runner", 4)),
      );
      expect(r.ok).toBe(true);
      expect(s.markServerId).toBeTruthy();
      expect(s.runner.credits).toBe(before + 4);
    });
  });

  describe("MS card JSON wiring", () => {
    it("clears unsupported where IR covers the card", () => {
      assertCardsWiringPresent();
      expect(getCardDef("chastushka").unsupported).toEqual([]);
      expect(getCardDef("chastushka").runEvent?.skipBreach).toBe(true);
      expect(getCardDef("stoneship-chart-room").unsupported).toEqual([]);
      expect(
        getCardDef("stoneship-chart-room").paidAbilities?.some(
          (a) => a.id === "stoneship-charge",
        ),
      ).toBe(true);
      expect(getCardDef("daeg-first-net-cat").unsupported).toEqual([]);
      expect(getCardDef("daeg-first-net-cat").onAgendaScoredOrStolen).toBeTruthy();
      expect(getCardDef("carpe-diem").onPlay).toEqual(
        fx.seq(
          fx.identifyMark(),
          fx.gainCredits("runner", 4),
          fx.choose("runner", [
            {
              id: "run-mark",
              label: "Make a run on the mark",
              effect: fx.startRunOnMark(),
            },
            {
              id: "decline",
              label: "Decline",
              effect: fx.seq(),
            },
          ]),
        ),
      );
      expect(getCardDef("marrow").onAgendaScored).toEqual(fx.sabotage(1, true));
      expect(getCardDef("marrow").onInstall).toEqual(fx.coreDamage(1));
      expect(getCardDef("esa-afontov-eco-insurrectionist").unsupported).toEqual(
        [],
      );
      expect(
        getCardDef("esa-afontov-eco-insurrectionist").onFirstCoreDamageThisTurn,
      ).toBeTruthy();
      expect(
        getCardDef("nyusha-sable-sintashta-symphonic-prodigy").onTurnBegin,
      ).toEqual(fx.identifyMark());
      expect(
        getCardDef("captain-padma-isbister-intrepid-explorer").unsupported,
      ).toEqual([]);
      expect(
        getCardDef("captain-padma-isbister-intrepid-explorer")
          .onFirstRdRunBeginThisTurn,
      ).toBeTruthy();
    });

    it("Chastushka end-to-end", () => {
      assertCardsWiringPresent();
      let s = createInitialState();
      s = structuredClone(s);
      const ev = instantiateCard("chastushka", "ch-1", "runner:grip");
      s.cards["ch-1"] = ev;
      s.runner.hand = ["ch-1"];
      s.runner.credits = 5;
      s.runner.clicks = 4;
      s.activeSide = "runner";
      s.timingKey = "runner.takeAction";
      s.servers.hq.ice = [];
      s = must(s, { type: "play_event", cardId: "ch-1", serverId: "hq" });
      expect(s.pendingSabotage?.amount).toBe(4);
      const legal = queryLegality(s);
      expect(
        legal.legal.some((a) => a.action.type === "resolve_sabotage"),
      ).toBe(true);
    });
  });
  });
});
