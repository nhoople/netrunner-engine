/**
 * Midnight Sun Mestnichestvo: onEncounter may remove 1 hosted advancement;
 * if so, Runner loses 3¢ (`remove_advancements` + then; CR §1.18.1).
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
import type { Effect } from "../src/index.js";
import type { ServerId } from "../src/state/types.js";

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.15.0");
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

  it("removes advancement and runs then", () => {
    let s = createInitialState();
    s = structuredClone(s);
    const ice = instantiateCard("mestnichestvo", "mest-1", "server:hq:ice");
    ice.advancementTokens = 2;
    ice.unsupported = [];
    s.cards["mest-1"] = ice;
    s.servers.hq.ice = ["mest-1"];
    s.runner.credits = 5;

    const r = evalEffect(
      { state: s, sourceId: "mest-1" },
      fx.removeAdvancements(1, fx.loseCredits("runner", 3)),
    );
    expect(r.ok).toBe(true);
    expect(s.cards["mest-1"].advancementTokens).toBe(1);
    expect(s.runner.credits).toBe(2);
  });

  it("skips then when no advancements to remove", () => {
    let s = createInitialState();
    s = structuredClone(s);
    const ice = instantiateCard("mestnichestvo", "mest-1", "server:hq:ice");
    ice.advancementTokens = 0;
    s.cards["mest-1"] = ice;
    s.servers.hq.ice = ["mest-1"];
    s.runner.credits = 5;

    const r = evalEffect(
      { state: s, sourceId: "mest-1" },
      fx.removeAdvancements(1, fx.loseCredits("runner", 3)),
    );
    expect(r.ok).toBe(true);
    expect(s.cards["mest-1"].advancementTokens).toBe(0);
    expect(s.runner.credits).toBe(5);
  });

  it("encounter choose remove drains Runner 3¢", () => {
    let s = createInitialState();
    s = structuredClone(s);
    const remoteId = "remote-1" as ServerId;
    s.servers[remoteId] = { id: remoteId, kind: "remote", ice: [], root: [] };

    const mest = instantiateCard("mestnichestvo", "mest-1", `server:${remoteId}:ice`);
    mest.unsupported = [];
    mest.onEncounter = mestOnEncounter();
    mest.advancementTokens = 1;
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
    expect(s.cards["mest-1"].advancementTokens).toBe(0);
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
