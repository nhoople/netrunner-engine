/**
 * System Core 2019 v1.73.0 N-slice: Contract Killer / Queen's Gambit /
 * Blue Sun / Mason Bellamy / Jinteki: Replicating Perfection.
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
  isRunTargetAllowed,
  loadCardCatalog,
  loadCardPool,
  validateEffectTree,
} from "../src/index.js";

const CLEAR = [
  "contract-killer",
  "queens-gambit",
  "blue-sun-powering-the-future",
  "mason-bellamy",
  "jinteki-replicating-perfection",
] as const;

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.78.0");
});

describe("System Core 2019 v1.73.0 N-slice", () => {
  it("declares at least 75 SC19-only clears", () => {
    const pool = loadCardPool(true);
    expect(pool.waves["system-core-2019"].status).toBe("supported");
    let clear = 0;
    for (const id of pool.waves["system-core-2019"].cards) {
      const def = getCardDef(id);
      if ((def.unsupported ?? []).length === 0 && def.wave === "system-core-2019") {
        clear++;
      }
    }
    expect(clear).toBeGreaterThanOrEqual(75);
  });

  it("loads five clear N-slice cards", () => {
    const catalog = loadCardCatalog(true);
    for (const id of CLEAR) {
      const def = catalog.get(id)!;
      expect(def.unsupported ?? [], id).toEqual([]);
      expect(def.wave).toBe("system-core-2019");
    }
  });

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
    expect(def.onPlay).toEqual(fx.queensGambitPlaceUpTo(3, 2));
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
          kind: "queens_gambit_place_on",
          cardId: "ag",
          amount: 2,
          creditsPer: 2,
        },
      },
    );
    expect(place.ok).toBe(true);
    expect(ag.advancementTokens).toBe(2);
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
