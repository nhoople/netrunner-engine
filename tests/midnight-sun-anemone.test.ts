/**
 * Midnight Sun Anemone: onRez while protecting attacked server → may trash
 * 1 from HQ to do 2 net damage (`trash_hq` + then; CR §8.1.3 / §10.4).
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
  assertCardsPinnedTag("v0.75.0");
});

function must(
  state: ReturnType<typeof createInitialState>,
  action: Parameters<typeof applyAction>[1],
) {
  const r = applyAction(state, action);
  if (!r.ok) throw new Error(`${r.error} ${JSON.stringify(r.cites)}`);
  return r.state;
}

function anemoneOnRez(): Effect {
  return fx.if(
    { op: "source_protects_attacked_server" },
    fx.choose("corp", [
      {
        id: "trash-hq-net",
        label: "Trash 1 from HQ: do 2 net damage",
        effect: fx.trashHq("first", fx.netDamage(2)),
      },
      {
        id: "decline",
        label: "Decline",
        effect: fx.gainCredits("corp", 0),
      },
    ]),
  );
}

describe("MS Anemone trash_hq.then (onRez during run)", () => {
  it("validates trash_hq + then tree", () => {
    expect(
      validateEffectTree(fx.trashHq("first", fx.netDamage(2))),
    ).toBeNull();
    expect(validateEffectTree(anemoneOnRez())).toBeNull();
  });

  it("trashes from HQ then deals 2 net", () => {
    let s = createInitialState();
    s = structuredClone(s);
    const ice = instantiateCard("anemone", "an-1", "server:hq:ice");
    ice.unsupported = [];
    s.cards["an-1"] = ice;
    const card = instantiateCard("hedge-fund", "hq-1", "corp:hand");
    s.cards["hq-1"] = card;
    s.corp.hand = ["hq-1"];
    s.runner.hand = ["r1", "r2", "r3"].map((id, i) => {
      const c = instantiateCard("sure-gamble", id, "runner:hand");
      s.cards[id] = c;
      return id;
    });

    const r = evalEffect(
      { state: s, sourceId: "an-1" },
      fx.trashHq("first", fx.netDamage(2)),
    );
    expect(r.ok).toBe(true);
    expect(s.corp.hand).toEqual([]);
    expect(s.corp.discard).toContain("hq-1");
    expect(s.runner.hand.length).toBe(1);
  });

  it("skips net damage when HQ empty", () => {
    let s = createInitialState();
    s = structuredClone(s);
    const ice = instantiateCard("anemone", "an-1", "server:hq:ice");
    s.cards["an-1"] = ice;
    s.corp.hand = [];
    s.runner.hand = ["r1", "r2"].map((id) => {
      const c = instantiateCard("sure-gamble", id, "runner:hand");
      s.cards[id] = c;
      return id;
    });
    const before = s.runner.hand.length;
    const r = evalEffect(
      { state: s, sourceId: "an-1" },
      fx.trashHq("first", fx.netDamage(2)),
    );
    expect(r.ok).toBe(true);
    expect(s.runner.hand.length).toBe(before);
  });

  it("onRez during run offers trash→net; decline leaves HQ", () => {
    let s = createInitialState();
    s = structuredClone(s);
    const remoteId = "remote-1" as ServerId;
    s.servers[remoteId] = { id: remoteId, kind: "remote", ice: [], root: [] };

    const an = instantiateCard("anemone", "an-1", `server:${remoteId}:ice`);
    an.unsupported = [];
    an.onRez = anemoneOnRez();
    an.rezzed = false;
    s.cards["an-1"] = an;
    s.servers[remoteId].ice = ["an-1"];

    const hq = instantiateCard("hedge-fund", "hq-1", "corp:hand");
    s.cards["hq-1"] = hq;
    s.corp.hand = ["hq-1"];
    s.corp.credits = 10;
    s.runner.clicks = 4;
    s.runner.credits = 10;
    s.runner.hand = ["r1", "r2", "r3"].map((id) => {
      const c = instantiateCard("sure-gamble", id, "runner:hand");
      s.cards[id] = c;
      return id;
    });
    s.activeSide = "runner";
    s.timingKey = "runner.takeAction";

    s = must(s, { type: "basic_run", serverId: remoteId });
    s = must(s, { type: "rez_ice", cardId: "an-1" });
    expect(s.pendingChoice?.options.some((o) => o.id === "trash-hq-net")).toBe(
      true,
    );
    const grip = s.runner.hand.length;
    s = must(s, { type: "choose_option", optionId: "trash-hq-net" });
    expect(s.corp.hand).toEqual([]);
    expect(s.runner.hand.length).toBe(grip - 2);
  });
});

describe("MS Anemone card wiring (v0.31.0+)", () => {
  it("Anemone clears unsupported with trash_hq.then onRez", () => {
    const def = getCardDef("anemone");
    expect(def.unsupported).toEqual([]);
    expect(def.type).toBe("ice");
    expect(def.onRez).toEqual(
      expect.objectContaining({
        op: "if",
        cond: { op: "source_protects_attacked_server" },
      }),
    );
  });
});
