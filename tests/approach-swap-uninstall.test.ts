/**
 * Midori and Mitra Aman swap the approached ice with ice from HQ (or
 * Archives). The swapped-out ice is uninstalled: its hosted cards and
 * counters are trashed and the swap's checkpoint occurs (CR 8.8.4b). The
 * Runner keeps approaching the new ice (CR 6.2.7b).
 */
import { beforeAll, describe, expect, it } from "vitest";
import {
  applyAction,
  assertCardsPinnedTag,
  assertPinnedTag,
  cardsDataPresent,
  createInitialState,
  crDataPresent,
  evalEffect,
  instantiateCard,
} from "../src/index.js";
import { iceAtRunnerPosition } from "../src/state/runPosition.js";
import type { Action, GameState } from "../src/state/types.js";

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.147.22");
});

function must(s: GameState, action: Action): GameState {
  const r = applyAction(s, action);
  if (!r.ok) throw new Error(`${action.type}: ${r.error}`);
  return r.state;
}

const logged = (s: GameState): string => s.log.join("\n");

function addCard(s: GameState, def: string, id: string, zone: string, rezzed = false) {
  const card = instantiateCard(def, id, zone);
  card.rezzed = rezzed;
  card.faceup = rezzed;
  s.cards[id] = card;
  return card;
}

/**
 * Approaching Ice Wall "a" on HQ, which hosts an installed Parasite and two
 * advancement counters. HQ holds Enigma "new"; Archives holds Enigma "old".
 */
function approachingHostedIce(upgrade: "midori" | "mitra-aman"): GameState {
  let s = createInitialState();
  addCard(s, "ice-wall", "a", "server:hq:ice", true);
  s.servers.hq.ice = ["a"];
  addCard(s, upgrade, "up", "server:hq:root", true);
  s.servers.hq.root = ["up"];
  addCard(s, "enigma", "new", "corp:hq");
  s.corp.hand = ["new"];
  const old = addCard(s, "enigma", "old", "corp:archives");
  old.faceup = true;
  s.corp.discardPile = ["old"];
  s.runner.credits = 20;
  s.runner.clicks = 4;
  s.corp.credits = 20;
  s.activeSide = "runner";
  s.timingKey = "runner.takeAction";
  s = must(s, { type: "basic_run", serverId: "hq" });
  for (let i = 0; i < 6 && s.run?.phase !== "approach_ice"; i += 1) {
    s = must(s, { type: "pass_window" });
  }
  expect(s.run?.phase).toBe("approach_ice");
  expect(iceAtRunnerPosition(s)).toBe("a");
  // As a trojan install leaves it: listed as installed, hosted by hostId.
  const parasite = addCard(s, "parasite", "par", "runner:installed");
  parasite.hostId = "a";
  s.runner.installed = ["par"];
  s.cards["a"]!.advancementCounters = 2;
  return s;
}

function swap(s: GameState, kind: "swap_approached_ice_with_hq" | "swap_approached_ice_with_hq_or_archives", replacementIceId: string) {
  return evalEffect({ state: s, sourceId: "up" }, { op: "do", action: { kind, replacementIceId } });
}

function expectUninstalled(s: GameState, to: "corp:hq" | "corp:archives") {
  expect(s.cards["a"]?.zone).toBe(to);
  expect(s.cards["par"]?.zone).toBe("runner:heap");
  expect(s.cards["par"]?.hostId).toBeUndefined();
  expect(s.runner.installed).not.toContain("par");
  expect(s.cards["a"]?.hostedCardIds ?? []).toEqual([]);
  expect(s.cards["a"]?.advancementCounters ?? 0).toBe(0);
  expect(logged(s)).toContain("8.8.4b");
  // The Runner keeps approaching the new ice in that position (CR 6.2.7b).
  expect(s.run?.phase).toBe("approach_ice");
  expect(s.run?.positionVacated ?? false).toBe(false);
}

describe("Midori: the swapped-out ice is uninstalled (CR 8.8.4b)", () => {
  it("trashes its hosted cards and counters, and the Runner approaches the new ice", () => {
    const s = approachingHostedIce("midori");
    expect(swap(s, "swap_approached_ice_with_hq", "new").ok).toBe(true);
    expectUninstalled(s, "corp:hq");
    expect(iceAtRunnerPosition(s)).toBe("new");
    expect(s.cards["a"]?.faceup).toBe(false);
  });
});

describe("Mitra Aman: the swapped-out ice is uninstalled (CR 8.8.4b)", () => {
  it("from HQ: trashes its hosted cards and counters", () => {
    const s = approachingHostedIce("mitra-aman");
    expect(swap(s, "swap_approached_ice_with_hq_or_archives", "new").ok).toBe(true);
    expectUninstalled(s, "corp:hq");
    expect(iceAtRunnerPosition(s)).toBe("new");
    expect(s.cards["a"]?.faceup).toBe(false);
  });

  it("from Archives: trashes its hosted cards and counters, and the ice enters Archives faceup", () => {
    const s = approachingHostedIce("mitra-aman");
    expect(swap(s, "swap_approached_ice_with_hq_or_archives", "old").ok).toBe(true);
    expectUninstalled(s, "corp:archives");
    expect(iceAtRunnerPosition(s)).toBe("old");
    // It was rezzed, so the Runner had seen it (CR 8.8.4a).
    expect(s.cards["a"]?.faceup).toBe(true);
  });
});

describe("Midori through its trigger: the chosen ice is swapped in, not rezzed in HQ", () => {
  it("choosing the HQ ice runs the swap (the option's own effect)", () => {
    let s = createInitialState();
    addCard(s, "enigma", "a", "server:hq:ice", true);
    s.servers.hq.ice = ["a"];
    addCard(s, "midori", "mid", "server:hq:root", true);
    s.servers.hq.root = ["mid"];
    addCard(s, "ice-wall", "new", "corp:hq");
    s.corp.hand = ["new"];
    s.runner.credits = 20;
    s.runner.clicks = 4;
    s.corp.credits = 20;
    s.activeSide = "runner";
    s.timingKey = "runner.takeAction";
    s = must(s, { type: "basic_run", serverId: "hq" });
    for (let i = 0; i < 10 && !s.pendingChoice; i += 1) s = must(s, { type: "pass_window" });
    expect(s.pendingChoice?.options.map((o) => o.id).sort()).toEqual(["decline", "new"]);
    s = must(s, { type: "choose_option", optionId: "new" });
    expect(s.servers.hq.ice).toEqual(["new"]);
    expect(s.cards["new"]?.zone).toBe("server:hq:ice");
    expect(s.cards["new"]?.rezzed).toBe(false);
    expect(s.corp.hand).toContain("a");
    expect(logged(s)).not.toContain("Rez Ice Wall ignoring all costs");
  });
});

describe("a choice keyed by a grip card id resolves its own effect", () => {
  it("Bahia Bands' install from grip keeps its 1 credit discount", () => {
    let s = createInitialState();
    addCard(s, "bahia-bands", "bb", "runner:play");
    const corroder = addCard(s, "corroder", "cor", "runner:grip");
    s.runner.hand = ["cor"];
    s.runner.credits = 10;
    s.runner.clicks = 4;
    s.activeSide = "runner";
    s.timingKey = "runner.takeAction";
    const cost = corroder.installCost;
    expect(cost).toBeGreaterThan(0);
    const r = evalEffect(
      { state: s, sourceId: "bb" },
      { op: "do", action: { kind: "may_install_from_grip", discount: 1 } },
    );
    expect(r.ok).toBe(true);
    expect(s.pendingChoice?.options.map((o) => o.id)).toContain("cor");
    s = must(s, { type: "choose_option", optionId: "cor" });
    expect(s.runner.installed).toContain("cor");
    expect(s.runner.credits).toBe(10 - (cost - 1));
  });
});
