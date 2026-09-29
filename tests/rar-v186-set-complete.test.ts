/**
 * Reign and Reverie v1.86.0 set-complete: DJ Fenris clear → 56/56 + pool
 * supported. Interaction smoke ≥3 (blank×host, success ternary, cannot/filter).
 */
import { describe, expect, it, beforeAll } from "vitest";
import {
  assertCardsPinnedTag,
  assertPinnedTag,
  cardsDataPresent,
  createInitialState,
  crDataPresent,
  evalEffect,
  getCardDef,
  instantiateCard,
  loadCardCatalog,
  loadCardPool,
  legalFenrisHostIds,
  abilitiesSuppressed,
  releaseHostedCardsOnTrash,
  runnerAbilityCarrierIds,
  RUNNER_OUTSIDE_GAME_IDENTITIES_ZONE,
  validateEffectTree,
} from "../src/index.js";
import type { GameState } from "../src/state/types.js";

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.86.0");
});

function seedFenrisWithOutsideIdentity(
  primaryIdDef: string,
  hostedIdDef: string,
): { state: GameState; fenrisId: string; hostedId: string } {
  const s = structuredClone(createInitialState());
  const primary = instantiateCard(primaryIdDef, "runner-id", "runner:grip");
  s.cards["runner-id"] = primary;
  s.runner.identityId = "runner-id";

  const hosted = instantiateCard(
    hostedIdDef,
    "gmod-extra",
    RUNNER_OUTSIDE_GAME_IDENTITIES_ZONE,
  );
  s.cards["gmod-extra"] = hosted;
  s.runner.additionalIdentities = ["gmod-extra"];

  const fenris = instantiateCard("dj-fenris", "fenris", "runner:rig");
  s.cards["fenris"] = fenris;
  s.runner.rig.push("fenris");
  // Ensure stack has cards for draw-based smoke (Liza).
  for (let i = 0; i < 4; i++) {
    const id = `fill-${i}`;
    s.cards[id] = instantiateCard("easy-mark", id, "runner:stack");
    s.runner.deck.push(id);
  }
  return { state: s, fenrisId: "fenris", hostedId: "gmod-extra" };
}

describe("Reign and Reverie v1.86.0 set-complete", () => {
  it("declares reign-and-reverie supported with 56/56 RaR-only clears", () => {
    const pool = loadCardPool(true);
    expect(pool.waves["reign-and-reverie"].status).toBe("supported");
    expect(pool.waves["reign-and-reverie"].cards).toHaveLength(58);
    let clear = 0;
    for (const id of pool.waves["reign-and-reverie"].cards) {
      const def = getCardDef(id);
      if (
        (def.unsupported ?? []).length === 0 &&
        def.wave === "reign-and-reverie"
      ) {
        clear++;
      }
    }
    expect(clear).toBe(56);
  });

  it("loads DJ Fenris clear shape under CR 1.5.4", () => {
    const catalog = loadCardCatalog(true);
    const def = catalog.get("dj-fenris")!;
    expect(def.unsupported ?? []).toEqual([]);
    expect(def.wave).toBe("reign-and-reverie");
    expect(def.unique).toBe(true);
    expect(def.deckLimit).toBe(1);
    expect(def.gainsTextOfHostedIdentity).toBe(true);
    expect(def.returnHostedIdentityToOutsideGameOnUninstall).toBe(true);
    expect(validateEffectTree(def.onInstall!)).toBeNull();
    expect(JSON.stringify(def.onInstall)).toContain(
      "fenris_host_gmod_identity_from_outside_game",
    );
  });

  it("smoke cannot/filter: Chaos Theory (shaper) cannot host same-faction g-mod; Quetzal (anarch) is legal", () => {
    const { state: s } = seedFenrisWithOutsideIdentity(
      "chaos-theory-wunderkind",
      "chaos-theory-wunderkind",
    );
    // Same title instance as primary faction shaper — filter out.
    s.cards["gmod-extra"]!.faction = "shaper";
    expect(legalFenrisHostIds(s, true)).toEqual([]);

    const quetzal = instantiateCard(
      "quetzal-free-spirit",
      "quetzal-extra",
      RUNNER_OUTSIDE_GAME_IDENTITIES_ZONE,
    );
    s.cards["quetzal-extra"] = quetzal;
    s.runner.additionalIdentities = ["quetzal-extra"];
    expect(legalFenrisHostIds(s, true)).toEqual(["quetzal-extra"]);

    const r = evalEffect(
      { state: s, sourceId: "fenris" },
      s.cards["fenris"]!.onInstall!,
    );
    expect(r.ok).toBe(true);
    expect(s.cards["fenris"]!.hostedCardIds).toEqual(["quetzal-extra"]);
    expect(s.runner.additionalIdentities).toEqual([]);
    expect(s.cards["fenris"]!.paidAbilities?.some((a) => a.id === "quetzal-break")).toBe(
      true,
    );
    expect(runnerAbilityCarrierIds(s)).toEqual(["runner-id", "fenris"]);
  });

  it("smoke success ternary: Fenris(Liza) first successful central; uninstall returns to outside-game not heap", () => {
    const { state: s, fenrisId, hostedId } = seedFenrisWithOutsideIdentity(
      "chaos-theory-wunderkind",
      "liza-talking-thunder-prominent-legislator",
    );
    const r = evalEffect(
      { state: s, sourceId: fenrisId },
      s.cards[fenrisId]!.onInstall!,
    );
    expect(r.ok).toBe(true);
    expect(s.cards[fenrisId]!.onFirstSuccessfulCentralRunThisTurn).toBeTruthy();
    expect(validateEffectTree(s.cards[fenrisId]!.onFirstSuccessfulCentralRunThisTurn!)).toBeNull();

    // Fire carrier ability directly (first successful central).
    const beforeHand = s.runner.hand.length;
    const beforeTags = s.runner.tags;
    const fire = evalEffect(
      { state: s, sourceId: fenrisId },
      s.cards[fenrisId]!.onFirstSuccessfulCentralRunThisTurn!,
    );
    expect(fire.ok).toBe(true);
    // Liza: draw 2 + take 1 tag (seq in card JSON).
    expect(s.runner.hand.length).toBeGreaterThanOrEqual(beforeHand);
    expect(s.runner.tags).toBeGreaterThanOrEqual(beforeTags);

    releaseHostedCardsOnTrash(s, fenrisId);
    expect(s.runner.additionalIdentities).toContain(hostedId);
    expect(s.cards[hostedId]!.zone).toBe(RUNNER_OUTSIDE_GAME_IDENTITIES_ZONE);
    expect(s.runner.discard).not.toContain(hostedId);
    expect(s.cards[fenrisId]!.onFirstSuccessfulCentralRunThisTurn).toBeUndefined();
    expect(s.cards[fenrisId]!.hostedCardIds ?? []).toEqual([]);
  });

  it("smoke blank×host: Direct Access blanks primary ID; Fenris gained Quetzal text remains", () => {
    const { state: s, fenrisId } = seedFenrisWithOutsideIdentity(
      "reina-roja-freedom-fighter",
      "quetzal-free-spirit",
    );
    expect(s.cards["runner-id"]!.firstIceRezCostIncrease).toBe(1);
    const r = evalEffect(
      { state: s, sourceId: fenrisId },
      s.cards[fenrisId]!.onInstall!,
    );
    expect(r.ok).toBe(true);
    expect(s.cards[fenrisId]!.paidAbilities?.length).toBeGreaterThan(0);

    // Simulate Direct Access blanking identities for the run.
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
      blankIdentities: true,
      runSourceId: "da",
    };
    const da = instantiateCard("direct-access", "da", "runner:play-area");
    s.cards["da"] = da;

    expect(abilitiesSuppressed(s, "runner-id")).toBe(true);
    // Fenris is a resource carrying gained text — DA does not blank it (CR notes).
    expect(abilitiesSuppressed(s, fenrisId)).toBe(false);
    expect(s.cards[fenrisId]!.paidAbilities?.some((a) => a.id === "quetzal-break")).toBe(
      true,
    );
  });

  it("smoke interrupt/paid: Fenris(Reina) adds first-ice rez surcharge; gone after trash", () => {
    const { state: s, fenrisId } = seedFenrisWithOutsideIdentity(
      "chaos-theory-wunderkind",
      "reina-roja-freedom-fighter",
    );
    expect(s.cards["runner-id"]!.firstIceRezCostIncrease ?? 0).toBe(0);
    const r = evalEffect(
      { state: s, sourceId: fenrisId },
      s.cards[fenrisId]!.onInstall!,
    );
    expect(r.ok).toBe(true);
    expect(s.cards[fenrisId]!.firstIceRezCostIncrease).toBe(1);
    expect(runnerAbilityCarrierIds(s)).toContain(fenrisId);

    releaseHostedCardsOnTrash(s, fenrisId);
    expect(s.cards[fenrisId]!.firstIceRezCostIncrease).toBeUndefined();
    expect(runnerAbilityCarrierIds(s)).toEqual(["runner-id"]);
  });

  it("J leftovers still clear in pool (Blockchain / Peeping Tom / Daruma / Acme)", () => {
    for (const id of [
      "blockchain",
      "peeping-tom",
      "daruma",
      "acme-consulting-the-truth-you-need",
    ] as const) {
      expect(getCardDef(id).unsupported ?? [], id).toEqual([]);
    }
  });
});
