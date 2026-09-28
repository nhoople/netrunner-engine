/**
 * TAI v0.82: Banner, Curupira, Debbie, Virtual Service Agent, Mercury.
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
  modifiersFromStartsRun,
} from "../src/index.js";

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.18.0");
});

describe("TAI Banner / Curupira / Debbie / VSA / Mercury", () => {
  it("wires Banner forbid ETR ability; unsupported empty", () => {
    const def = getCardDef("banner");
    expect(def.unsupported).toEqual([]);
    const ab = def.paidAbilities?.[0];
    expect(ab?.requireEncounterSubtype).toBe("barrier");
    expect(validateEffectTree(ab!.effect)).toBeNull();
  });

  it("forbid_end_the_run_this_encounter suppresses ETR", () => {
    let s = createInitialState();
    s = structuredClone(s);
    s.run = {
      attackedServerId: "hq",
      phase: "encounter",
      position: 0,
      successful: null,
      accessedCardIds: [],
      accessCandidates: [],
      accessRemaining: null,
      encounter: {
        iceId: "ice-1",
        broken: [false],
        forbidEndTheRunThisEncounter: true,
      },
      endedTheRun: false,
      cannotJackOut: false,
      strengthBoosts: {},
      encounterStrengthBoosts: {},
      iceStrengthBoosts: {},
      accessingCardId: null,
    };
    const r = evalEffect(
      { state: s, sourceId: s.corp.identityId },
      { op: "do", action: { kind: "end_the_run" } },
    );
    expect(r.ok).toBe(true);
    expect(s.run.endedTheRun).toBe(false);
  });

  it("wires Curupira onFullyBreak + bypass/break/pump", () => {
    const def = getCardDef("curupira");
    expect(def.unsupported).toEqual([]);
    expect(validateEffectTree(def.onFullyBreak!)).toBeNull();
    expect(def.paidAbilities).toHaveLength(3);
  });

  it("wires Debbie run-event credits + transfer startsRun", () => {
    const def = getCardDef("debbie-downtown-moreira");
    expect(def.unsupported).toEqual([]);
    expect(def.hostedCreditsOnRunEventPlay).toBe(1);
    expect(validateEffectTree(def.onInstall!)).toBeNull();
    const ab = def.paidAbilities?.[0];
    expect(ab?.startsRun?.transferHostedCreditsToEventCredits).toBe(true);
  });

  it("transferHostedCreditsToEventCredits moves pool into run mods", () => {
    let s = createInitialState();
    s = structuredClone(s);
    const deb = instantiateCard(
      "debbie-downtown-moreira",
      "deb-1",
      "runner:rig",
    );
    deb.hostedCredits = 3;
    s.cards["deb-1"] = deb;
    s.runner.rig.push("deb-1");
    const mods = modifiersFromStartsRun(
      s,
      { servers: "any", transferHostedCreditsToEventCredits: true },
      "deb-1",
    );
    expect(mods.eventCredits).toBe(3);
    expect(s.cards["deb-1"]!.hostedCredits).toBe(0);
  });

  it("wires VSA onPass decoder tracker; unsupported empty", () => {
    const def = getCardDef("virtual-service-agent");
    expect(def.unsupported).toEqual([]);
    expect(validateEffectTree(def.onPass!)).toBeNull();
    expect(def.subroutines).toHaveLength(1);
  });

  it("wires Mercury breach bonus field; unsupported empty", () => {
    const def = getCardDef("mercury-chrome-libertador");
    expect(def.unsupported).toEqual([]);
    expect(def.onBreachHqRdIfNoBreaksOncePerTurnMayBonusAccess).toBe(1);
  });
});
