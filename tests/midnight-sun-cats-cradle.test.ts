/**
 * Midnight Sun Cat's Cradle cluster: continuous ice rez cost +N¢ for ice
 * matching a subtype (`iceRezCostIncreaseBySubtype` while installed;
 * CR §1.16.2a / §8.1.2d). Distinct from flat `iceRezCostIncrease` (Xanadu).
 */
import { describe, expect, it, beforeAll } from "vitest";
import {
  applyAction,
  assertCardsPinnedTag,
  assertPinnedTag,
  cardsDataPresent,
  continuousIceRezCostIncrease,
  createInitialState,
  crDataPresent,
  getCardDef,
  instantiateCard,
  queryLegality,
} from "../src/index.js";
import type { ServerId } from "../src/index.js";

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v0.56.0");
});

function must(
  state: ReturnType<typeof createInitialState>,
  action: Parameters<typeof applyAction>[1],
) {
  const r = applyAction(state, action);
  if (!r.ok) throw new Error(`${r.error} ${JSON.stringify(r.cites)}`);
  return r.state;
}

/** Approach PAW with unrezzed ice on a remote; Runner has Cat's Cradle installed. */
function approachWithCatsCradle(
  iceDefId: string,
  cradleField: { subtype: string; amount: number },
) {
  let s = createInitialState();
  s = structuredClone(s);
  const ice = instantiateCard(iceDefId, "ice-1", "server:remote-1:ice");
  s.cards["ice-1"] = ice;
  s.servers["remote-1"] = {
    id: "remote-1",
    kind: "remote",
    ice: ["ice-1"],
    root: [],
  };

  const cradle = instantiateCard("cats-cradle", "cc-1", "runner:rig");
  cradle.iceRezCostIncreaseBySubtype = { ...cradleField };
  cradle.unsupported = [];
  s.cards["cc-1"] = cradle;
  s.runner.rig = ["cc-1"];
  s.runner.credits = 10;
  s.runner.clicks = 4;
  s.corp.credits = 20;
  s.activeSide = "runner";
  s.timingKey = "runner.takeAction";

  s = must(s, { type: "basic_run", serverId: "remote-1" as ServerId });
  return s;
}

describe("MS iceRezCostIncreaseBySubtype (always)", () => {
  it("sums subtype-filtered increase for matching ice", () => {
    let s = createInitialState();
    s = structuredClone(s);
    const ice = instantiateCard("enigma", "ice-1", "server:hq:ice");
    s.cards["ice-1"] = ice;
    s.servers.hq.ice = ["ice-1"];

    const cradle = instantiateCard("cats-cradle", "cc-1", "runner:rig");
    cradle.iceRezCostIncreaseBySubtype = {
      subtype: "code gate",
      amount: 1,
    };
    s.cards["cc-1"] = cradle;
    s.runner.rig = ["cc-1"];

    expect(continuousIceRezCostIncrease(s, "ice-1")).toBe(1);
  });

  it("does not apply when ice lacks the subtype", () => {
    let s = createInitialState();
    s = structuredClone(s);
    const ice = instantiateCard("ice-wall", "ice-1", "server:hq:ice");
    s.cards["ice-1"] = ice;
    s.servers.hq.ice = ["ice-1"];

    const cradle = instantiateCard("cats-cradle", "cc-1", "runner:rig");
    cradle.iceRezCostIncreaseBySubtype = {
      subtype: "code gate",
      amount: 1,
    };
    s.cards["cc-1"] = cradle;
    s.runner.rig = ["cc-1"];

    expect(continuousIceRezCostIncrease(s, "ice-1")).toBe(0);
  });

  it("ignores subtype filter on cards not in the rig", () => {
    let s = createInitialState();
    s = structuredClone(s);
    const ice = instantiateCard("enigma", "ice-1", "server:hq:ice");
    s.cards["ice-1"] = ice;
    s.servers.hq.ice = ["ice-1"];

    const cradle = instantiateCard("cats-cradle", "cc-heap", "runner:heap");
    cradle.iceRezCostIncreaseBySubtype = {
      subtype: "code gate",
      amount: 1,
    };
    s.cards["cc-heap"] = cradle;
    s.runner.discard.push("cc-heap");

    expect(continuousIceRezCostIncrease(s, "ice-1")).toBe(0);
  });

  it("stacks with flat iceRezCostIncrease (Xanadu-class)", () => {
    let s = createInitialState();
    s = structuredClone(s);
    const ice = instantiateCard("enigma", "ice-1", "server:hq:ice");
    s.cards["ice-1"] = ice;
    s.servers.hq.ice = ["ice-1"];

    const cradle = instantiateCard("cats-cradle", "cc-1", "runner:rig");
    cradle.iceRezCostIncreaseBySubtype = {
      subtype: "code gate",
      amount: 1,
    };
    s.cards["cc-1"] = cradle;

    const xanadu = instantiateCard("xanadu", "xa-1", "runner:rig");
    xanadu.iceRezCostIncrease = 1;
    s.cards["xa-1"] = xanadu;
    s.runner.rig = ["cc-1", "xa-1"];

    expect(continuousIceRezCostIncrease(s, "ice-1")).toBe(2);

    const barrier = instantiateCard("ice-wall", "ice-2", "server:rd:ice");
    s.cards["ice-2"] = barrier;
    s.servers.rd.ice = ["ice-2"];
    expect(continuousIceRezCostIncrease(s, "ice-2")).toBe(1);
  });

  it("stacks multiple installed subtype filters", () => {
    let s = createInitialState();
    s = structuredClone(s);
    const ice = instantiateCard("enigma", "ice-1", "server:hq:ice");
    s.cards["ice-1"] = ice;
    s.servers.hq.ice = ["ice-1"];

    for (const id of ["cc-a", "cc-b"] as const) {
      const cradle = instantiateCard("cats-cradle", id, "runner:rig");
      cradle.iceRezCostIncreaseBySubtype = {
        subtype: "code gate",
        amount: 1,
      };
      s.cards[id] = cradle;
      s.runner.rig.push(id);
    }
    expect(continuousIceRezCostIncrease(s, "ice-1")).toBe(2);
  });

  it("rezzes code gate paying base+1 with Cat's Cradle installed", () => {
    let s = approachWithCatsCradle("enigma", {
      subtype: "code gate",
      amount: 1,
    });
    const base = s.cards["ice-1"].rezCost ?? 0;
    expect(base).toBe(3);
    const before = s.corp.credits;
    s = must(s, { type: "rez_ice", cardId: "ice-1" });
    expect(s.corp.credits).toBe(before - (base + 1));
    expect(s.log.some((l) => /rezzes Enigma for 4¢ \(base 3\+1\)/.test(l))).toBe(
      true,
    );
  });

  it("does not inflate barrier rez when only code-gate filter is installed", () => {
    let s = approachWithCatsCradle("ice-wall", {
      subtype: "code gate",
      amount: 1,
    });
    const base = s.cards["ice-1"].rezCost ?? 0;
    const before = s.corp.credits;
    s = must(s, { type: "rez_ice", cardId: "ice-1" });
    expect(s.corp.credits).toBe(before - base);
  });

  it("legality omits rez when Corp cannot afford subtype-inflated cost", () => {
    let s = approachWithCatsCradle("enigma", {
      subtype: "code gate",
      amount: 1,
    });
    // Enigma 3 + 1 = 4; leave Corp with only 3¢
    s = structuredClone(s);
    s.corp.credits = 3;
    const legal = queryLegality(s);
    expect(
      legal.legal.some(
        (e) => e.action.type === "rez_ice" && e.action.cardId === "ice-1",
      ),
    ).toBe(false);

    const r = applyAction(s, { type: "rez_ice", cardId: "ice-1" });
    expect(r.ok).toBe(false);
  });
});

describe("MS Cat's Cradle card wiring (v0.31.0+)", () => {
  it("Cat's Cradle clears unsupported with iceRezCostIncreaseBySubtype", () => {
    const def = getCardDef("cats-cradle");
    expect(def.unsupported).toEqual([]);
    expect(def.iceRezCostIncreaseBySubtype).toEqual({
      subtype: "code gate",
      amount: 1,
    });
    expect(def.type).toBe("program");
    expect(def.breaker?.breaksSubtype).toBe("code gate");
    expect(def.installCost).toBe(2);
    expect(def.strength).toBe(1);
    expect(def.memoryCost).toBe(1);
  });
});
