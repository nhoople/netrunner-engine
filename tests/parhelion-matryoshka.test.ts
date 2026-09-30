/**
 * Parhelion v0.70: Matryoshka.
 */
import { describe, expect, it, beforeAll } from "vitest";
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
} from "../src/index.js";

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.136.0");
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
    const main = instantiateCard("matryoshka", "mat-1", "runner:rig");
    s.cards["mat-1"] = main;
    s.runner.rig = ["mat-1"];
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
    expect(s.runner.rig).not.toContain("mat-2");
  });

  it("turn begin flips hosted cards faceup", () => {
    let s = createInitialState();
    s = structuredClone(s);
    const main = instantiateCard("matryoshka", "mat-1", "runner:rig");
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
    const main = instantiateCard("matryoshka", "mat-1", "runner:rig");
    main.hostedCardIds = ["mat-2"];
    main.breaker = {
      breaksSubtype: "*",
      strength: 5,
      breakCredits: 0,
      breakViaPaidAbilityOnly: true,
    };
    s.cards["mat-1"] = main;
    s.runner.rig = ["mat-1"];
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
      accessRemaining: null,
      encounter: { iceId: "ice-1", broken: [false, false] },
      endedTheRun: false,
      cannotJackOut: false,
      strengthBoosts: {},
      encounterStrengthBoosts: {},
      iceStrengthBoosts: {},
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
