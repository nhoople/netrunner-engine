/**
 * Parhelion v0.69: Asmund Pudlat.
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
  assertCardsPinnedTag("v1.35.0");
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
    const asmund = instantiateCard("asmund-pudlat", "asm-1", "runner:rig");
    asmund.trashWhenNoHostedCards = true;
    s.cards["asm-1"] = asmund;
    s.runner.rig = ["asm-1"];

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
    expect(s.runner.rig).not.toContain("v-1"); // not installed
    expect(s.runner.deck).toContain("v-2");
    expect(s.runner.deck).toContain("fill-1");
    expect(s.runner.deck).not.toContain("v-1");
  });

  it("may add hosted to grip then trashes when empty", () => {
    let s = createInitialState();
    s = structuredClone(s);
    const asmund = instantiateCard("asmund-pudlat", "asm-1", "runner:rig");
    asmund.trashWhenNoHostedCards = true;
    asmund.hostedCardIds = ["v-1"];
    s.cards["asm-1"] = asmund;
    s.runner.rig = ["asm-1"];
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
    expect(s.runner.discard).toContain("asm-1");
    expect(s.runner.rig).not.toContain("asm-1");
  });
});
