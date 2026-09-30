/**
 * Downfall v1.54.0 G-slice: Project Yagi-Uda / Architect Deployment Test /
 * Daily Quest / “Baklan” Bochkin / Masterwork (v37).
 */
import { describe, expect, it, beforeAll } from "vitest";
import {
  assertCardsPinnedTag,
  assertPinnedTag,
  cardsDataPresent,
  crDataPresent,
  evalEffect,
  fx,
  getCardDef,
  loadCardCatalog,
  loadCardPool,
  validateEffectTree,
  createInitialState,
  instantiateCard,
} from "../src/index.js";
import type { GameState } from "../src/state/types.js";
import { noteProgramOrHardwareInstalled } from "../src/state/programHardwareInstall.js";
import { emptyTurnBookkeeping } from "../src/state/turn.js";

const CLEAR = [
  "project-yagi-uda",
  "architect-deployment-test",
  "daily-quest",
  "baklan-bochkin",
  "masterwork-v37",
] as const;

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.89.0");
});

describe("Downfall v1.54.0 G-slice", () => {
  it("declares downfall supported with at least 40 clears", () => {
    const pool = loadCardPool(true);
    expect(pool.waves["downfall"].status).toBe("supported");
    expect(pool.waves["downfall"].cards).toHaveLength(65);
    let clear = 0;
    for (const id of pool.waves["downfall"].cards) {
      if ((getCardDef(id).unsupported ?? []).length === 0) clear++;
    }
    expect(clear).toBeGreaterThanOrEqual(40);
  });

  it("loads five new clear G-slice cards", () => {
    const catalog = loadCardCatalog(true);
    for (const id of CLEAR) {
      const def = catalog.get(id)!;
      expect(def.unsupported ?? [], id).toEqual([]);
      expect(def.wave).toBe("downfall");
    }
  });

  it("Yagi-Uda overadvances on score and swaps HQ with attacked during run", () => {
    const def = getCardDef("project-yagi-uda");
    expect(def.onScore).toEqual(
      fx.do({ kind: "add_agenda_counters_from_overadvance", past: 3 }),
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
      "yagi_swap_hq_with_attacked_root_or_ice",
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
      accessRemaining: null,
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
    const mw = instantiateCard("masterwork-v37", "mw-1", "runner:rig");
    s.cards["mw-1"] = mw;
    s.runner.rig = ["mw-1"];
    const filler = instantiateCard("sure-gamble", "draw-1", "runner:stack");
    s.cards["draw-1"] = filler;
    s.runner.deck = ["draw-1"];
    s.runner.hand = [];
    noteProgramOrHardwareInstalled(s, "mw-1");
    expect(s.turn.hardwareInstalledThisTurn).toBe(1);
    expect(s.runner.hand).toEqual(["draw-1"]);
  });
});
