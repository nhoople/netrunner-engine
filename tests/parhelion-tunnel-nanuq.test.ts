/**
 * Parhelion Tunnel Vision (mark AI breaker) + Nanuq (RFG on uninstall / agenda).
 */
import { describe, expect, it, beforeAll } from "vitest";
import {
  applyAction,
  assertCardsPinnedTag,
  assertPinnedTag,
  cardsDataPresent,
  createInitialState,
  crDataPresent,
  fx,
  getCardDef,
  instantiateCard,
  queryLegality,
} from "../src/index.js";
import { moveRunnerCardToHeap } from "../src/state/trashHooks.js";
import type { ServerId } from "../src/state/types.js";

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.30.0");
});

function must(
  state: ReturnType<typeof createInitialState>,
  action: Parameters<typeof applyAction>[1],
) {
  const r = applyAction(state, action);
  if (!r.ok) throw new Error(`${r.error} ${JSON.stringify(r.cites)}`);
  return r.state;
}

describe("PH Tunnel Vision mark-only break", () => {
  it("cannot break off-mark; can break on mark", () => {
    let s = createInitialState();
    s = structuredClone(s);
    const tv = instantiateCard("mayfly", "tv-1", "runner:rig");
    tv.title = "Tunnel Vision";
    tv.breaker = {
      breaksSubtype: "*",
      strength: 5,
      breakCredits: 2,
      breakMaxSubs: 2,
      breakRequiresAttackingMark: true,
    };
    tv.unsupported = [];
    s.cards["tv-1"] = tv;
    s.runner.rig = ["tv-1"];
    s.runner.credits = 10;
    s.markServerId = "rd";
    const ice = instantiateCard("palisade", "ice-1", "server:hq:ice");
    ice.rezzed = true;
    ice.strength = 1;
    s.cards["ice-1"] = ice;
    s.servers.hq.ice = ["ice-1"];
    s.activeSide = "runner";
    s.timingKey = "runner.takeAction";
    s.runner.clicks = 4;
    s = must(s, { type: "basic_run", serverId: "hq" as ServerId });
    let guard = 0;
    while (s.timingKey !== "run.encounterPaw" && s.run && guard++ < 20) {
      if (queryLegality(s).legal.some((e) => e.action.type === "pass_window")) {
        s = must(s, { type: "pass_window" });
      } else break;
    }
    expect(s.timingKey).toBe("run.encounterPaw");
    const legal = queryLegality(s).legal;
    expect(
      legal.some(
        (e) =>
          e.action.type === "break_subroutine" &&
          e.action.breakerId === "tv-1",
      ),
    ).toBe(false);

    // Retarget mark to HQ and re-check via a fresh encounter-shaped state
    s.markServerId = "hq";
    const legal2 = queryLegality(s).legal;
    expect(
      legal2.some(
        (e) =>
          e.action.type === "break_subroutine" &&
          e.action.breakerId === "tv-1",
      ),
    ).toBe(true);
  });
});

describe("PH Nanuq RFG on uninstall / agenda", () => {
  it("rfgOnUninstall sends to RFG instead of heap", () => {
    let s = createInitialState();
    s = structuredClone(s);
    const n = instantiateCard("mayfly", "nan-1", "runner:rig");
    n.title = "Nanuq";
    n.rfgOnUninstall = true;
    n.unsupported = [];
    s.cards["nan-1"] = n;
    s.runner.rig = ["nan-1"];
    moveRunnerCardToHeap(s, "nan-1");
    expect(s.runner.rig).not.toContain("nan-1");
    expect(s.runner.discard).not.toContain("nan-1");
    expect(s.removedFromGame).toContain("nan-1");
    expect(s.cards["nan-1"]!.zone).toBe("removed-from-game");
  });

  it("onAgendaScoredOrStolen RFGs Nanuq", () => {
    let s = createInitialState();
    s = structuredClone(s);
    const n = instantiateCard("mayfly", "nan-2", "runner:rig");
    n.title = "Nanuq";
    n.rfgOnUninstall = true;
    n.onAgendaScoredOrStolen = fx.rfgSelf();
    n.unsupported = [];
    s.cards["nan-2"] = n;
    s.runner.rig = ["nan-2"];
    // Score a synthetic agenda via host path: place agenda and score
    const remote = "remote-1" as ServerId;
    s.servers[remote] = { id: remote, kind: "remote", ice: [], root: [] };
    const ag = instantiateCard("offworld-office", "ag-1", `server:${remote}:root`);
    ag.advancementTokens = 10;
    ag.advancementRequirement = 2;
    ag.unsupported = [];
    s.cards["ag-1"] = ag;
    s.servers[remote].root = ["ag-1"];
    s.corp.clicks = 3;
    s.activeSide = "corp";
    s.timingKey = "corp.takeAction";
    const id = s.cards[s.corp.identityId];
    if (id) delete id.onAgendaScored;
    s = must(s, { type: "score_agenda", cardId: "ag-1" });
    expect(s.removedFromGame).toContain("nan-2");
  });
});

describe("PH Tunnel Vision / Nanuq wiring (pin v0.51.0)", () => {
  it("wires both cards with empty unsupported", () => {
    const tv = getCardDef("tunnel-vision");
    expect(tv.unsupported).toEqual([]);
    expect(tv.onTurnBegin).toEqual(fx.identifyMark());
    expect(tv.breaker?.breakRequiresAttackingMark).toBe(true);
    expect(tv.breaker?.breaksSubtype).toBe("*");
    expect(tv.breaker?.breakMaxSubs).toBe(2);

    const nan = getCardDef("nanuq");
    expect(nan.unsupported).toEqual([]);
    expect(nan.rfgOnUninstall).toBe(true);
    expect(nan.onAgendaScoredOrStolen).toEqual(fx.rfgSelf());
    expect(nan.breaker?.breaksSubtype).toBe("*");
    expect(nan.breaker?.breakMaxSubs).toBe(2);
  });
});
