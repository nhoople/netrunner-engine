/**
 * Midnight Sun Pinhole Threading: replace-breach access 1 root of another
 * server; cannot steal/trash agendas accessed this way.
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
  instantiateCard,
  queryLegality,
  validateEffectTree,
} from "../src/index.js";

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v0.81.0");
});

function must(
  state: ReturnType<typeof createInitialState>,
  action: Parameters<typeof applyAction>[1],
) {
  const r = applyAction(state, action);
  if (!r.ok) throw new Error(`${r.error} ${JSON.stringify(r.cites)}`);
  return r.state;
}

describe("MS access_one_root_other_server (Pinhole Threading)", () => {
  it("validates access_one_root_other_server tree", () => {
    expect(validateEffectTree(fx.accessOneRootOtherServer())).toBeNull();
  });

  it("presets other-server root candidates, forbids steal/trash, clears skipBreach", () => {
    let s = createInitialState();
    s = structuredClone(s);
    s.timingKey = "run.success";
    s.run = {
      attackedServerId: "hq",
      phase: "success",
      position: null,
      successful: true,
      accessedCardIds: [],
      accessCandidates: [],
      accessRemaining: null,
      encounter: null,
      endedTheRun: false,
      cannotJackOut: false,
      strengthBoosts: {},
      encounterStrengthBoosts: {},
      iceStrengthBoosts: {},
      accessingCardId: null,
      skipBreach: true,
    };
    const remote = s.servers["remote:1"];
    if (!remote) {
      s.servers["remote:1"] = {
        id: "remote:1",
        kind: "remote",
        ice: [],
        root: [],
      };
    }
    const asset = instantiateCard("pad-campaign", "asset-1", "server:remote:1:root");
    s.cards["asset-1"] = asset;
    s.servers["remote:1"].root = ["asset-1"];
    const agenda = instantiateCard(
      "hostile-takeover",
      "agenda-1",
      "server:remote:1:root",
    );
    s.cards["agenda-1"] = agenda;
    s.servers["remote:1"].root.push("agenda-1");

    const src = instantiateCard("jailbreak", "pin-1", "runner:heap");
    s.cards["pin-1"] = src;

    const r = evalEffect(
      { state: s, sourceId: "pin-1" },
      fx.accessOneRootOtherServer(),
    );
    expect(r.ok).toBe(true);
    expect(s.run!.cannotStealOrTrash).toBe(true);
    expect(s.run!.skipBreach).toBe(false);
    expect(s.run!.accessCandidatesPreset).toBe(true);
    expect(s.run!.accessRemaining).toBe(1);
    expect(s.run!.accessCandidates.sort()).toEqual(
      ["agenda-1", "asset-1"].sort(),
    );
  });

  it("blocks steal when cannotStealOrTrash is set during access", () => {
    let s = createInitialState();
    s = structuredClone(s);
    s.timingKey = "breach.awaitAccess";
    s.activeSide = "runner";
    const agenda = instantiateCard(
      "hostile-takeover",
      "agenda-1",
      "server:remote:1:root",
    );
    s.cards["agenda-1"] = agenda;
    if (!s.servers["remote:1"]) {
      s.servers["remote:1"] = {
        id: "remote:1",
        kind: "remote",
        ice: [],
        root: ["agenda-1"],
      };
    } else {
      s.servers["remote:1"].root = ["agenda-1"];
    }
    s.run = {
      attackedServerId: "hq",
      phase: "breach",
      position: null,
      successful: true,
      accessedCardIds: [],
      accessCandidates: ["agenda-1"],
      accessRemaining: 1,
      encounter: null,
      endedTheRun: false,
      cannotJackOut: false,
      strengthBoosts: {},
      encounterStrengthBoosts: {},
      iceStrengthBoosts: {},
      accessingCardId: null,
      cannotStealOrTrash: true,
      accessCandidatesPreset: true,
    };
    s = must(s, { type: "access_card", cardId: "agenda-1" });
    expect(s.run!.accessingCardId).toBe("agenda-1");
    const legal = queryLegality(s).legal;
    expect(legal.some((a) => a.type === "steal_agenda")).toBe(false);
    const steal = applyAction(s, { type: "steal_agenda", cardId: "agenda-1" });
    expect(steal.ok).toBe(false);
  });
});
