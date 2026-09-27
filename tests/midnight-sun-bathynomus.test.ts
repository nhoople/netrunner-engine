/**
 * Midnight Sun Bathynomus cluster: +N strength while protecting Archives
 * (`strengthBonusProtectingArchives`; mirrors Palisade's remote bonus,
 * CR §3.4.4 / §4.6.7d Archives as a central server). Net-damage subroutine
 * already modeled.
 */
import { describe, expect, it, beforeAll } from "vitest";
import {
  applyAction,
  assertCardsPinnedTag,
  assertPinnedTag,
  cardsDataPresent,
  createInitialState,
  crDataPresent,
  effectiveIceStrength,
  fx,
  getCardDef,
  instantiateCard,
  queryLegality,
} from "../src/index.js";

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v0.79.0");
});

function must(
  state: ReturnType<typeof createInitialState>,
  action: Parameters<typeof applyAction>[1],
) {
  const r = applyAction(state, action);
  if (!r.ok) throw new Error(`${r.error} ${JSON.stringify(r.cites)}`);
  return r.state;
}

describe("MS strengthBonusProtectingArchives (always)", () => {
  it("adds printed strength plus bonus while on Archives ice", () => {
    let s = createInitialState();
    s = structuredClone(s);
    const bath = instantiateCard("bathynomus", "bath-1", "server:archives:ice");
    bath.strengthBonusProtectingArchives = 3;
    bath.unsupported = [];
    s.cards["bath-1"] = bath;
    s.servers.archives.ice = ["bath-1"];

    expect(effectiveIceStrength(s, "bath-1")).toBe(1 + 3);
  });

  it("does not apply bonus while protecting HQ or a remote", () => {
    let s = createInitialState();
    s = structuredClone(s);
    const onHq = instantiateCard("bathynomus", "bath-hq", "server:hq:ice");
    onHq.strengthBonusProtectingArchives = 3;
    s.cards["bath-hq"] = onHq;
    s.servers.hq.ice = ["bath-hq"];
    expect(effectiveIceStrength(s, "bath-hq")).toBe(1);

    const remote = instantiateCard(
      "bathynomus",
      "bath-remote",
      "server:remote-1:ice",
    );
    remote.strengthBonusProtectingArchives = 3;
    s.cards["bath-remote"] = remote;
    s.servers["remote-1"] = {
      id: "remote-1",
      kind: "remote",
      ice: ["bath-remote"],
      root: [],
    };
    expect(effectiveIceStrength(s, "bath-remote")).toBe(1);
  });

  it("scales with N when field is not 3", () => {
    let s = createInitialState();
    s = structuredClone(s);
    const bath = instantiateCard("bathynomus", "bath-n", "server:archives:ice");
    bath.strengthBonusProtectingArchives = 5;
    s.cards["bath-n"] = bath;
    s.servers.archives.ice = ["bath-n"];
    expect(effectiveIceStrength(s, "bath-n")).toBe(1 + 5);
  });

  it("stacks with encounter fortify boosts", () => {
    let s = createInitialState();
    s = structuredClone(s);
    const bath = instantiateCard(
      "bathynomus",
      "bath-boost",
      "server:archives:ice",
    );
    bath.strengthBonusProtectingArchives = 3;
    s.cards["bath-boost"] = bath;
    s.servers.archives.ice = ["bath-boost"];
    s.run = {
      attackedServerId: "archives",
      position: 0,
      phase: "encounter",
      successful: null,
      accessedCardIds: [],
      accessCandidates: [],
      accessRemaining: null,
      endedTheRun: false,
      cannotJackOut: false,
      strengthBoosts: {},
      encounterStrengthBoosts: {},
      iceStrengthBoosts: { "bath-boost": 2 },
      accessingCardId: null,
      encounter: {
        iceId: "bath-boost",
        broken: [false],
      },
    };
    // 1 printed + 3 Archives + 2 fortify
    expect(effectiveIceStrength(s, "bath-boost")).toBe(6);
  });

  it("does not fire Palisade remote bonus when only Archives field is set", () => {
    let s = createInitialState();
    s = structuredClone(s);
    const bath = instantiateCard(
      "bathynomus",
      "bath-no-remote",
      "server:remote-1:ice",
    );
    bath.strengthBonusProtectingArchives = 3;
    s.cards["bath-no-remote"] = bath;
    s.servers["remote-1"] = {
      id: "remote-1",
      kind: "remote",
      ice: ["bath-no-remote"],
      root: [],
    };
    expect(effectiveIceStrength(s, "bath-no-remote")).toBe(1);
  });
});

describe("MS Bathynomus card wiring (v0.31.0+)", () => {
  it("Bathynomus clears unsupported with strengthBonusProtectingArchives", () => {
    const def = getCardDef("bathynomus");
    expect(def.unsupported).toEqual([]);
    expect(def.strengthBonusProtectingArchives).toBe(3);
    expect(def.strength).toBe(1);
    expect(def.rezCost).toBe(3);
    expect(def.installCost).toBe(3);
    expect(def.subtypes).toEqual(["sentry", "ap"]);
    expect(def.subroutines).toHaveLength(1);
    expect(def.subroutines![0].effect).toEqual(fx.netDamage(3));
  });

  it("Archives Bathynomus requires higher breaker strength than HQ copy", () => {
    let s = createInitialState();
    s = structuredClone(s);
    const bath = instantiateCard("bathynomus", "bath-enc", "server:archives:ice");
    bath.rezzed = true;
    bath.faceup = true;
    s.cards["bath-enc"] = bath;
    s.servers.archives.ice = ["bath-enc"];

    const breaker = instantiateCard("mimic", "br-1", "runner:rig");
    // Mimic printed strength 3; Archives Bathynomus is 4 — needs boost.
    s.cards["br-1"] = breaker;
    s.runner.rig = ["br-1"];
    s.runner.credits = 10;
    s.runner.clicks = 4;
    s.activeSide = "runner";
    s.timingKey = "runner.takeAction";

    expect(getCardDef("bathynomus").strengthBonusProtectingArchives).toBe(3);
    expect(effectiveIceStrength(s, "bath-enc")).toBe(4);

    s = must(s, { type: "basic_run", serverId: "archives" });
    s = structuredClone(s);
    s.run!.phase = "encounter";
    s.run!.encounter = {
      iceId: "bath-enc",
      broken: [false],
    };
    s.timingKey = "run.encounterPaw";

    const legalBefore = queryLegality(s).legal;
    const breaksBefore = legalBefore.filter(
      (e) =>
        e.action.type === "break_subroutine" &&
        e.action.breakerId === "br-1",
    );
    expect(breaksBefore.length).toBe(0);

    s.run!.strengthBoosts["br-1"] = 1;
    const legalAfter = queryLegality(s).legal;
    const breaksAfter = legalAfter.filter(
      (e) =>
        e.action.type === "break_subroutine" &&
        e.action.breakerId === "br-1",
    );
    expect(breaksAfter.length).toBeGreaterThan(0);
  });
});
