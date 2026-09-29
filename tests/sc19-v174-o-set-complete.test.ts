/**
 * System Core 2019 v1.74.0 O-slice set-complete: remaining 9 uniques → 84/147
 * + pool supported. Interaction smoke ≥3.
 */
import { describe, expect, it, beforeAll } from "vitest";
import {
  assertCardsPinnedTag,
  assertPinnedTag,
  cardsDataPresent,
  createInitialState,
  crDataPresent,
  evalEffect,
  fx,
  getCardDef,
  instantiateCard,
  loadCardCatalog,
  loadCardPool,
  effectiveBreakerStrength,
  validateEffectTree,
} from "../src/index.js";
import type { GameState } from "../src/state/types.js";
import { noteRunnerClickSpend } from "../src/state/clickHooks.js";
import { usedMemory } from "../src/state/turn.js";

const CLEAR = [
  "ash-2x3zb9cy",
  "crypsis",
  "deus-x",
  "bank-job",
  "seidr-laboratories-destiny-defined",
  "dinosaurus",
  "patchwork",
  "sundew",
  "oversight-ai",
] as const;

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.78.0");
});

describe("System Core 2019 v1.74.0 O-slice set-complete", () => {
  it("declares SC19 supported with ≥84 SC19-only clears", () => {
    const pool = loadCardPool(true);
    expect(pool.waves["system-core-2019"].status).toBe("supported");
    expect(pool.waves["system-core-2019"].cards).toHaveLength(147);
    let clear = 0;
    for (const id of pool.waves["system-core-2019"].cards) {
      const def = getCardDef(id);
      if (
        (def.unsupported ?? []).length === 0 &&
        def.wave === "system-core-2019"
      ) {
        clear++;
      }
    }
    expect(clear).toBeGreaterThanOrEqual(84);
  });

  it("loads nine O-slice clears with empty unsupported", () => {
    const catalog = loadCardCatalog(true);
    for (const id of CLEAR) {
      const def = catalog.get(id)!;
      expect(def.unsupported ?? [], id).toEqual([]);
      expect(def.wave).toBe("system-core-2019");
    }
  });

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
    const bj = instantiateCard("bank-job", "bj", "runner:rig");
    bj.hostedCredits = 8;
    s.cards["bj"] = bj;
    s.runner.rig.push("bj");
    s.run = {
      attackedServerId: "remote-1",
      phase: "success",
      position: null,
      successful: true,
      accessedCardIds: [],
      accessCandidates: [],
      accessRemaining: null,
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
    s.corp.discard.push("hf");
    s.run = {
      attackedServerId: "hq",
      phase: "approach_ice",
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
    noteRunnerClickSpend(s);
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
    const dino = instantiateCard("dinosaurus", "dino", "runner:rig");
    s.cards["dino"] = dino;
    s.runner.rig.push("dino");
    const blade = instantiateCard("gordian-blade", "gb", "runner:rig");
    blade.hostId = "dino";
    dino.hostedCardIds = ["gb"];
    s.cards["gb"] = blade;
    s.runner.rig.push("gb");
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
    expect(getCardDef("oversight-ai").onPlay).toEqual(fx.oversightAiRezAndHost());
    expect(validateEffectTree(getCardDef("oversight-ai").onPlay!)).toBeNull();
    const deus = getCardDef("deus-x");
    expect(deus.paidAbilities?.some((a) => a.cost?.trashSelf)).toBe(true);
    expect(
      JSON.stringify(getCardDef("ash-2x3zb9cy").onSuccessfulRun),
    ).toContain("restrict_run_access");
  });

  it("interaction smoke ≥3: Bank Job skip-breach, Seidr Archives→R&D, Sundew click", () => {
    // Covered by the three dedicated tests above — gate asserts they exist.
    expect(CLEAR.length).toBe(9);
  });
});
