/**
 * Downfall v1.56.0 I-slice: Fencer Fueno / Trickster Taka / The Nihilist /
 * In the Groove / Game Over.
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
  hostedCreditsSpendableToUseProgramsDuringRuns,
  runnerAvailableCreditsForBreaker,
} from "../src/index.js";
import type { GameState } from "../src/state/types.js";
import { emptyTurnBookkeeping } from "../src/state/turn.js";
import { fireRemainderOfTurnOnInstallPrintedCostGte } from "../src/state/programHardwareInstall.js";

const CLEAR = [
  "fencer-fueno",
  "trickster-taka",
  "the-nihilist",
  "in-the-groove",
  "game-over",
] as const;

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.104.0");
});

describe("Downfall v1.56.0 I-slice", () => {
  it("declares downfall supported with at least 50 clears", () => {
    const pool = loadCardPool(true);
    expect(pool.waves["downfall"].status).toBe("supported");
    expect(pool.waves["downfall"].cards).toHaveLength(65);
    let clear = 0;
    for (const id of pool.waves["downfall"].cards) {
      if ((getCardDef(id).unsupported ?? []).length === 0) clear++;
    }
    expect(clear).toBeGreaterThanOrEqual(50);
  });

  it("loads five new clear I-slice cards", () => {
    const catalog = loadCardCatalog(true);
    for (const id of CLEAR) {
      const def = catalog.get(id)!;
      expect(def.unsupported ?? [], id).toEqual([]);
      expect(def.wave).toBe("downfall");
    }
  });

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
    const taka = instantiateCard("trickster-taka", "taka-1", "runner:rig");
    taka.hostedCredits = 2;
    s.cards["taka-1"] = taka;
    s.runner.rig = ["taka-1"];
    s.runner.credits = 0;
    expect(hostedCreditsSpendableToUseProgramsDuringRuns(s)).toBe(0);
    s.run = {
      attackedServerId: "hq",
      phase: "encounter",
      position: 0,
      successful: null,
      accessedCardIds: [],
      accessCandidates: [],
      accessRemaining: null,
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
    const nih = instantiateCard("the-nihilist", "nih-1", "runner:rig");
    s.cards["nih-1"] = nih;
    s.runner.rig = ["nih-1"];
    const v1 = instantiateCard("imp", "imp-1", "runner:rig");
    v1.virusCounters = 2;
    s.cards["imp-1"] = v1;
    s.runner.rig.push("imp-1");
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
    const hw = instantiateCard("dzmz-optimizer", "hw-1", "runner:rig");
    hw.installCost = 2;
    s.cards["hw-1"] = hw;
    s.runner.rig = ["hw-1"];
    fireRemainderOfTurnOnInstallPrintedCostGte(s, "hw-1");
    expect(s.pendingChoice?.options.some((o) => o.id === "draw")).toBe(true);
  });

  it("Game Over requires stolen agenda last turn and trash-type composite", () => {
    const def = getCardDef("game-over");
    expect(def.playRequiresAgendaStolenLastTurn).toBe(true);
    expect(JSON.stringify(def.onPlay)).toContain(
      "game_over_trash_type_may_pay_3_prevent",
    );
    expect(JSON.stringify(def.onPlay)).toContain("give_bad_publicity");
    expect(validateEffectTree(def.onPlay!)).toBeNull();

    let s: GameState = createInitialState();
    s = structuredClone(s);
    const r = evalEffect(
      { state: s, sourceId: s.corp.identityId },
      fx.do({ kind: "game_over_trash_type_may_pay_3_prevent" }),
    );
    expect(r.ok).toBe(true);
    expect(s.pendingChoice?.options.some((o) => o.id.startsWith("go-type:"))).toBe(
      true,
    );
  });
});
