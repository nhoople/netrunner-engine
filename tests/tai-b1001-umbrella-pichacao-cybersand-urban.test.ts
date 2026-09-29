/**
 * TAI v0.81: B-1001, Umbrella, Pichação, Cybersand Harvester,
 * Urban Art Vernissage.
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
  validateEffectTree,
  canPayCost,
  payCost,
} from "../src/index.js";
import { fireHostedCreditsOnAnyIceRez } from "../src/state/powerCounters.js";
import {
  creditsAvailableForInstall,
  spendCreditsForInstall,
} from "../src/state/costs.js";

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.82.0");
});

describe("TAI B-1001 / Umbrella / Pichação / Cybersand / Urban Art", () => {
  it("wires B-1001 removeTags + requireOtherServer", () => {
    const def = getCardDef("b-1001");
    expect(def.unsupported).toEqual([]);
    const ab = def.paidAbilities?.[0];
    expect(ab?.cost).toMatchObject({ removeTags: 1 });
    expect(ab?.requireOtherServer).toBe(true);
    expect(validateEffectTree(ab!.effect)).toBeNull();
  });

  it("CostSpec.removeTags is payable only with enough tags", () => {
    let s = createInitialState();
    s = structuredClone(s);
    const card = instantiateCard("b-1001", "b1", "server:remote1:root");
    s.cards["b1"] = card;
    expect(canPayCost(s, "corp", { removeTags: 1 }, card)).toBe(false);
    s.runner.tags = 2;
    expect(canPayCost(s, "corp", { removeTags: 1 }, card)).toBe(true);
    payCost(s, "corp", { removeTags: 1 }, "test", card);
    expect(s.runner.tags).toBe(1);
  });

  it("wires Umbrella trojan-host interface + thenIfBroke", () => {
    const def = getCardDef("umbrella");
    expect(def.unsupported).toEqual([]);
    expect(def.interfaceRequiresTrojanHost).toBe(true);
    const ab = def.paidAbilities?.[0];
    expect(ab?.cost).toMatchObject({ credits: 2 });
    expect(validateEffectTree(ab!.effect)).toBeNull();
    expect(ab!.effect).toMatchObject({
      op: "do",
      action: {
        kind: "break_encounter_subroutine",
        maxSubs: 3,
        requireSubtype: "code gate",
      },
    });
    expect(
      (ab!.effect as { action: { thenIfBroke?: unknown } }).action.thenIfBroke,
    ).toBeTruthy();
  });

  it("wires Pichação onPassHost + clicks_gained cond", () => {
    const def = getCardDef("pichacao");
    expect(def.unsupported).toEqual([]);
    expect(def.installOnIce).toBe(true);
    expect(validateEffectTree(def.onPassHost!)).toBeNull();
  });

  it("gain_clicks during a run increments clicksGainedThisRun", () => {
    let s = createInitialState();
    s = structuredClone(s);
    s.run = {
      attackedServerId: "hq",
      phase: "movement",
      position: null,
      successful: null,
      accessedCardIds: [],
      accessCandidates: [],
      accessRemaining: null,
      encounter: null,
      endedTheRun: false,
      cannotJackOut: false,
      strengthBoosts: {},
      encounterStrengthBoosts: {},
      iceStrengthBoosts: {},
      accessingCardId: null,
      clicksGainedThisRun: 0,
    };
    const r = evalEffect(
      { state: s, sourceId: s.runner.identityId },
      { op: "do", action: { kind: "gain_clicks", side: "runner", amount: 1 } },
    );
    expect(r.ok).toBe(true);
    expect(s.run.clicksGainedThisRun).toBe(1);
  });

  it("wires Cybersand hostedCreditsOnAnyIceRez + install spend", () => {
    const def = getCardDef("cybersand-harvester");
    expect(def.unsupported).toEqual([]);
    expect(def.hostedCreditsOnAnyIceRez).toBe(2);
    expect(def.hostedCreditsSpendFor).toEqual(["install"]);
    expect(validateEffectTree(def.paidAbilities![0]!.effect)).toBeNull();
  });

  it("ice rez places hosted credits on Cybersand", () => {
    let s = createInitialState();
    s = structuredClone(s);
    const sand = instantiateCard(
      "cybersand-harvester",
      "sand-1",
      "server:remote1:root",
    );
    sand.hostedCreditsOnAnyIceRez = 2;
    sand.rezzed = true;
    s.cards["sand-1"] = sand;
    if (!s.servers.remote1) {
      s.servers.remote1 = { id: "remote1", kind: "remote", ice: [], root: [] };
    }
    s.servers.remote1.root.push("sand-1");
    const ice = instantiateCard("ice-wall", "ice-1", "server:hq:ice");
    ice.rezzed = true;
    s.cards["ice-1"] = ice;
    s.servers.hq.ice.push("ice-1");
    fireHostedCreditsOnAnyIceRez(s, "ice-1");
    expect(s.cards["sand-1"]!.hostedCredits).toBe(2);
  });

  it("hostedCreditsSpendFor install draws from Cybersand pool", () => {
    let s = createInitialState();
    s = structuredClone(s);
    s.corp.credits = 0;
    const sand = instantiateCard(
      "cybersand-harvester",
      "sand-1",
      "server:remote1:root",
    );
    sand.hostedCreditsSpendFor = ["install"];
    sand.hostedCredits = 5;
    sand.rezzed = true;
    s.cards["sand-1"] = sand;
    expect(creditsAvailableForInstall(s, "corp")).toBe(5);
    spendCreditsForInstall(s, "corp", 3);
    expect(s.cards["sand-1"]!.hostedCredits).toBe(2);
    expect(s.corp.credits).toBe(0);
  });

  it("wires Urban Art return-trojan leaf + install spend", () => {
    const def = getCardDef("urban-art-vernissage");
    expect(def.unsupported).toEqual([]);
    expect(def.hostedCreditsSpendFor).toEqual(["install"]);
    expect(validateEffectTree(def.onTurnBegin!)).toBeNull();
    expect(def.onTurnBegin).toMatchObject({
      op: "do",
      action: {
        kind: "may_return_non_virus_trojan_to_grip_place_hosted",
        hostedAmount: 2,
      },
    });
  });
});
