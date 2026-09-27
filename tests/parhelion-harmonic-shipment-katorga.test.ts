/**
 * Parhelion v0.53: Bloop (derez-harmonic rez cost), Pulse (harmonic loss /
 * click-or-ETR), Shipment from Vladisibirsk (min tags + advancements),
 * Katorga Breakout (heap → grip on successful run).
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
import type { ServerId } from "../src/state/types.js";

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  // Pin bump lands with this slice; local CARDS_DATA_ROOT may be ahead.
  assertCardsPinnedTag("v0.68.0");
});

function must(
  state: ReturnType<typeof createInitialState>,
  action: Parameters<typeof applyAction>[1],
) {
  const r = applyAction(state, action);
  if (!r.ok) throw new Error(`${r.error} ${JSON.stringify(r.cites)}`);
  return r.state;
}

describe("PH lose_credits_per_rezzed_subtype + add_from_heap_to_grip IR", () => {
  it("validates new effect trees", () => {
    expect(
      validateEffectTree(fx.loseCreditsPerRezzedSubtype("runner", "harmonic")),
    ).toBeNull();
    expect(validateEffectTree(fx.addFromHeapToGrip("choose"))).toBeNull();
  });

  it("runner loses 1¢ per rezzed harmonic", () => {
    let s = createInitialState();
    s = structuredClone(s);
    s.runner.credits = 5;
    const h1 = instantiateCard("ice-wall", "h-1", "server:hq:ice");
    h1.subtypes = ["barrier", "harmonic"];
    h1.rezzed = true;
    s.cards["h-1"] = h1;
    s.servers.hq.ice = ["h-1"];
    const h2 = instantiateCard("ice-wall", "h-2", "server:rd:ice");
    h2.subtypes = ["code gate", "harmonic"];
    h2.rezzed = true;
    s.cards["h-2"] = h2;
    s.servers.rd.ice = ["h-2"];
    const r = evalEffect(
      { state: s, sourceId: "h-1" },
      fx.loseCreditsPerRezzedSubtype("runner", "harmonic"),
    );
    expect(r.ok).toBe(true);
    expect(s.runner.credits).toBe(3);
  });

  it("adds sole heap card to grip; multi opens choice", () => {
    let s = createInitialState();
    s = structuredClone(s);
    const a = instantiateCard("sure-gamble", "heap-a", "runner:heap");
    const b = instantiateCard("sure-gamble", "heap-b", "runner:heap");
    s.cards["heap-a"] = a;
    s.cards["heap-b"] = b;
    s.runner.discard = ["heap-a"];
    const r1 = evalEffect(
      { state: s, sourceId: "runner-id" },
      fx.addFromHeapToGrip("choose"),
    );
    expect(r1.ok).toBe(true);
    expect(s.runner.hand).toContain("heap-a");
    expect(s.runner.discard).not.toContain("heap-a");

    s.runner.hand = [];
    s.runner.discard = ["heap-a", "heap-b"];
    const r2 = evalEffect(
      { state: s, sourceId: "runner-id" },
      fx.addFromHeapToGrip("choose"),
    );
    expect(r2.ok).toBe(true);
    expect(s.pendingChoice?.chooser).toBe("runner");
    expect(s.pendingChoice?.options.map((o) => o.id)).toEqual(
      expect.arrayContaining(["heap-grip:heap-a", "heap-grip:heap-b"]),
    );
    s = must(s, { type: "choose_option", optionId: "heap-grip:heap-b" });
    expect(s.runner.hand).toContain("heap-b");
    expect(s.runner.discard).toEqual(["heap-a"]);
  });
});

describe("PH Bloop rezAdditionalCostDerezSubtype", () => {
  it("cannot rez without another rezzed harmonic; derezzes one on rez", () => {
    let s = createInitialState();
    s = structuredClone(s);
    s.corp.credits = 10;
    const bloop = instantiateCard("ice-wall", "bloop-1", "server:hq:ice");
    bloop.title = "Bloop";
    bloop.subtypes = ["sentry", "ap", "destroyer", "harmonic"];
    bloop.rezCost = 3;
    bloop.rezAdditionalCostDerezSubtype = "harmonic";
    bloop.unsupported = [];
    s.cards["bloop-1"] = bloop;
    s.servers.hq.ice = ["bloop-1"];

    s.activeSide = "runner";
    s.timingKey = "runner.takeAction";
    s.runner.clicks = 4;
    s = must(s, { type: "basic_run", serverId: "hq" as ServerId });
    // Approach PAW — no other harmonic → cannot rez
    let guard = 0;
    while (s.timingKey !== "run.approachPaw" && s.run && guard++ < 20) {
      const r = applyAction(s, { type: "pass_window" });
      if (!r.ok) break;
      s = r.state;
    }
    expect(s.timingKey).toBe("run.approachPaw");
    let rez = applyAction(s, { type: "rez_ice", cardId: "bloop-1" });
    expect(rez.ok).toBe(false);

    const wave = instantiateCard("ice-wall", "wave-1", "server:rd:ice");
    wave.subtypes = ["code gate", "harmonic"];
    wave.rezzed = true;
    wave.faceup = true;
    s.cards["wave-1"] = wave;
    s.servers.rd.ice = ["wave-1"];

    rez = applyAction(s, { type: "rez_ice", cardId: "bloop-1" });
    expect(rez.ok).toBe(true);
    s = rez.state;
    expect(s.cards["bloop-1"].rezzed).toBe(true);
    expect(s.cards["wave-1"].rezzed).toBe(false);
  });

  it("wires Bloop from cards-data", () => {
    const def = getCardDef("bloop");
    expect(def.unsupported).toEqual([]);
    expect(def.rezAdditionalCostDerezSubtype).toBe("harmonic");
    expect(def.subroutines).toHaveLength(3);
    expect(validateEffectTree(def.subroutines![0]!.effect)).toBeNull();
  });
});

describe("PH Pulse onRez + harmonic subroutines", () => {
  it("on rez during run loses a runner click; wires from cards-data", () => {
    const def = getCardDef("pulse");
    expect(def.unsupported).toEqual([]);
    expect(def.onRez).toBeTruthy();
    expect(validateEffectTree(def.onRez!)).toBeNull();
    expect(def.subroutines).toHaveLength(2);
    expect(
      validateEffectTree(def.subroutines![0]!.effect),
    ).toBeNull();
    expect(
      validateEffectTree(def.subroutines![1]!.effect),
    ).toBeNull();

    let s = createInitialState();
    s = structuredClone(s);
    s.corp.credits = 10;
    s.runner.clicks = 3;
    const pulse = instantiateCard("ice-wall", "pulse-1", "server:hq:ice");
    pulse.title = "Pulse";
    pulse.subtypes = ["code gate", "harmonic"];
    pulse.rezCost = 3;
    pulse.onRez = def.onRez;
    pulse.unsupported = [];
    s.cards["pulse-1"] = pulse;
    s.servers.hq.ice = ["pulse-1"];
    s.activeSide = "runner";
    s.timingKey = "runner.takeAction";
    s.runner.clicks = 3;
    s = must(s, { type: "basic_run", serverId: "hq" as ServerId });
    let guard = 0;
    while (s.timingKey !== "run.approachPaw" && s.run && guard++ < 20) {
      const r = applyAction(s, { type: "pass_window" });
      if (!r.ok) break;
      s = r.state;
    }
    expect(s.timingKey).toBe("run.approachPaw");
    const before = s.runner.clicks;
    s = must(s, { type: "rez_ice", cardId: "pulse-1" });
    expect(s.cards["pulse-1"].rezzed).toBe(true);
    expect(s.runner.clicks).toBe(before - 1);
  });
});

describe("PH Shipment from Vladisibirsk", () => {
  it("requires ≥2 tags and places 4 advancements", () => {
    const def = getCardDef("shipment-from-vladisibirsk");
    expect(def.unsupported).toEqual([]);
    expect(def.playRequiresMinTags).toBe(2);
    expect(validateEffectTree(def.onPlay!)).toBeNull();

    let s = createInitialState();
    s = structuredClone(s);
    s.activeSide = "corp";
    s.timingKey = "corp.takeAction";
    s.corp.clicks = 3;
    s.corp.credits = 5;
    s.runner.tags = 1;
    const ship = instantiateCard(
      "hedge-fund",
      "ship-1",
      "corp:hq",
    );
    ship.title = "Shipment from Vladisibirsk";
    ship.type = "operation";
    ship.playCost = 1;
    ship.playRequiresMinTags = 2;
    ship.onPlay = def.onPlay;
    ship.unsupported = [];
    s.cards["ship-1"] = ship;
    s.corp.hand = ["ship-1"];
    const agenda = instantiateCard(
      "hostile-takeover",
      "ag-1",
      "server:remote1:root",
    );
    s.cards["ag-1"] = agenda;
    s.servers.remote1 = {
      id: "remote1",
      root: ["ag-1"],
      ice: [],
    };
    // Ensure remote exists in servers map used by createInitialState
    if (!s.servers.remote1) {
      (s.servers as Record<string, { id: string; root: string[]; ice: string[] }>)[
        "remote1"
      ] = { id: "remote1", root: ["ag-1"], ice: [] };
    }

    let r = applyAction(s, { type: "play_operation", cardId: "ship-1" });
    expect(r.ok).toBe(false);

    s.runner.tags = 2;
    r = applyAction(s, { type: "play_operation", cardId: "ship-1" });
    expect(r.ok).toBe(true);
    s = r.state;
    // place_advancements may open a choice when multiple targets — sole agenda auto
    expect(
      (s.cards["ag-1"].advancementTokens ?? 0) === 4 ||
        s.pendingChoice !== null,
    ).toBe(true);
    if (s.pendingChoice) {
      const opt = s.pendingChoice.options.find((o) => o.id.includes("ag-1"));
      expect(opt).toBeTruthy();
      s = must(s, { type: "choose_option", optionId: opt!.id });
      expect(s.cards["ag-1"].advancementTokens).toBe(4);
    }
  });
});

describe("PH Katorga Breakout wiring", () => {
  it("wires runEvent onSuccessfulRun add_from_heap_to_grip", () => {
    const def = getCardDef("katorga-breakout");
    expect(def.unsupported).toEqual([]);
    expect(def.runEvent?.servers).toBe("any");
    expect(def.runEvent?.onSuccessfulRun).toEqual(
      fx.addFromHeapToGrip("choose"),
    );
    expect(validateEffectTree(def.runEvent!.onSuccessfulRun!)).toBeNull();
  });
});
