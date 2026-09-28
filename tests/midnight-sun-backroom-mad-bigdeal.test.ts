/**
 * Midnight Sun cluster: Backroom Machinations, Mutually Assured Destruction,
 * Big Deal — score_self_as_agenda / trash_any_rezzed_give_tags / place+may-score+rfg.
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
  queryLegality,
  validateEffectTree,
  agendaPointsFor,
} from "../src/index.js";
import type { ServerId } from "../src/state/types.js";

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.27.0");
});

function must(
  state: ReturnType<typeof createInitialState>,
  action: Parameters<typeof applyAction>[1],
) {
  const r = applyAction(state, action);
  if (!r.ok) throw new Error(`${r.error} ${JSON.stringify(r.cites)}`);
  return r.state;
}

describe("MS score_self_as_agenda (Backroom Machinations)", () => {
  it("validates score_self_as_agenda tree", () => {
    expect(validateEffectTree(fx.scoreSelfAsAgenda(1))).toBeNull();
  });

  it("moves source from Archives into Corp score area for 1 point", () => {
    let s = createInitialState();
    s = structuredClone(s);
    const op = instantiateCard(
      "hedge-fund",
      "br-1",
      "corp:archives",
    );
    s.cards["br-1"] = op;
    s.corp.discard = ["br-1"];
    const r = evalEffect(
      { state: s, sourceId: "br-1" },
      fx.scoreSelfAsAgenda(1),
    );
    expect(r.ok).toBe(true);
    expect(s.corp.discard).not.toContain("br-1");
    expect(s.corp.score).toContain("br-1");
    expect(s.cards["br-1"].zone).toBe("corp:score");
    expect(s.cards["br-1"].agendaPoints).toBe(1);
    expect(agendaPointsFor(s, "corp")).toBe(1);
  });

  it("playAdditionalCost remove_tags + playRequiresTagged gate", () => {
    let s = createInitialState();
    s = structuredClone(s);
    s.timingKey = "corp.takeAction";
    s.activeSide = "corp";
    s.corp.clicks = 3;
    s.corp.credits = 10;
    s.runner.tags = 1;
    const op = instantiateCard("hedge-fund", "br-play", "corp:hq");
    op.playCost = 2;
    op.playRequiresTagged = true;
    op.playAdditionalCost = fx.removeTags(1);
    op.onPlay = fx.scoreSelfAsAgenda(1);
    s.cards["br-play"] = op;
    s.corp.hand = ["br-play"];
    s = must(s, { type: "play_operation", cardId: "br-play" });
    expect(s.runner.tags).toBe(0);
    expect(s.corp.score).toContain("br-play");
    expect(agendaPointsFor(s, "corp")).toBe(1);
  });
});

describe("MS trash_any_rezzed_give_tags (MAD)", () => {
  it("validates trash_any_rezzed_give_tags tree", () => {
    expect(validateEffectTree(fx.trashAnyRezzedGiveTags())).toBeNull();
  });

  it("trashes chosen rezzed cards and gives 1 tag each; done ends", () => {
    let s = createInitialState();
    s = structuredClone(s);
    const remote = "remote-1" as ServerId;
    s.servers[remote] = { id: remote, kind: "remote", ice: [], root: [] };
    const ice = instantiateCard("ice-wall", "ice-1", `server:${remote}:ice`);
    ice.rezzed = true;
    s.cards["ice-1"] = ice;
    s.servers[remote].ice = ["ice-1"];
    const asset = instantiateCard(
      "pad-campaign",
      "asset-1",
      `server:${remote}:root`,
    );
    asset.rezzed = true;
    s.cards["asset-1"] = asset;
    s.servers[remote].root = ["asset-1"];
    s.runner.tags = 0;

    let r = evalEffect(
      { state: s, sourceId: s.corp.identityId },
      fx.trashAnyRezzedGiveTags(),
    );
    expect(r.ok).toBe(true);
    expect(s.pendingChoice).not.toBeNull();
    expect(s.pendingChoice!.options.some((o) => o.id === "trash-tag:ice-1")).toBe(
      true,
    );

    s = must(s, { type: "choose_option", optionId: "trash-tag:ice-1" });
    expect(s.corp.discard).toContain("ice-1");
    expect(s.runner.tags).toBe(1);
    expect(s.pendingChoice).not.toBeNull();

    s = must(s, { type: "choose_option", optionId: "trash-tag:asset-1" });
    expect(s.corp.discard).toContain("asset-1");
    expect(s.runner.tags).toBe(2);
    // No rezzed cards left — chain ends without a further choice.
    expect(s.pendingChoice).toBeNull();
  });

  it("playAdditionalClicks=2 requires three clicks total", () => {
    let s = createInitialState();
    s = structuredClone(s);
    s.timingKey = "corp.takeAction";
    s.activeSide = "corp";
    s.corp.clicks = 2;
    s.corp.credits = 20;
    const op = instantiateCard("hedge-fund", "mad-1", "corp:hq");
    op.playCost = 4;
    op.playAdditionalClicks = 2;
    op.onPlay = fx.trashAnyRezzedGiveTags();
    s.cards["mad-1"] = op;
    s.corp.hand = ["mad-1"];
    const legal = queryLegality(s).legal;
    expect(
      legal.some(
        (e) => e.action.type === "play_operation" && e.action.cardId === "mad-1",
      ),
    ).toBe(false);
    s.corp.clicks = 3;
    const legal2 = queryLegality(s).legal;
    expect(
      legal2.some(
        (e) => e.action.type === "play_operation" && e.action.cardId === "mad-1",
      ),
    ).toBe(true);
    s = must(s, { type: "play_operation", cardId: "mad-1" });
    expect(s.corp.clicks).toBe(0);
  });
});

describe("MS Big Deal place_advancements thenMayScore + rfg_self", () => {
  it("validates Big Deal effect tree", () => {
    const tree = fx.placeAdvancements(4, false, {
      thenMayScore: true,
      then: fx.rfgSelf(),
    });
    expect(validateEffectTree(tree)).toBeNull();
  });

  it("places 4, offers score when able, RFGs source; terminal zeroes clicks", () => {
    let s = createInitialState();
    s = structuredClone(s);
    s.timingKey = "corp.takeAction";
    s.activeSide = "corp";
    s.corp.clicks = 2;
    s.corp.credits = 20;
    const remote = "remote-1" as ServerId;
    s.servers[remote] = { id: remote, kind: "remote", ice: [], root: [] };
    const agenda = instantiateCard(
      "hostile-takeover",
      "ag-1",
      `server:${remote}:root`,
    );
    // Hostile Takeover is 2/1 — place 4 so it's scorable from 0.
    agenda.advancementTokens = 0;
    s.cards["ag-1"] = agenda;
    s.servers[remote].root = ["ag-1"];

    const op = instantiateCard("hedge-fund", "bd-1", "corp:hq");
    op.playCost = 17;
    op.endsActionPhase = true;
    op.onPlay = fx.placeAdvancements(4, false, {
      thenMayScore: true,
      then: fx.rfgSelf(),
    });
    s.cards["bd-1"] = op;
    s.corp.hand = ["bd-1"];
    s.corp.credits = 20;

    s = must(s, { type: "play_operation", cardId: "bd-1" });
    expect(s.cards["ag-1"].advancementTokens).toBe(4);
    expect(s.pendingChoice).not.toBeNull();
    expect(s.corp.clicks).toBe(0);
    // Still in Archives until RFG runs after choice.
    expect(s.corp.discard).toContain("bd-1");

    s = must(s, { type: "choose_option", optionId: "score:ag-1" });
    expect(s.corp.score).toContain("ag-1");
    expect(s.cards["bd-1"].zone).toBe("removed-from-game");
    expect(s.corp.discard).not.toContain("bd-1");
  });

  it("RFGs even when scoring declined", () => {
    let s = createInitialState();
    s = structuredClone(s);
    const remote = "remote-1" as ServerId;
    s.servers[remote] = { id: remote, kind: "remote", ice: [], root: [] };
    const agenda = instantiateCard(
      "hostile-takeover",
      "ag-2",
      `server:${remote}:root`,
    );
    agenda.advancementTokens = 0;
    s.cards["ag-2"] = agenda;
    s.servers[remote].root = ["ag-2"];
    const op = instantiateCard("hedge-fund", "bd-2", "corp:archives");
    s.cards["bd-2"] = op;
    s.corp.discard = ["bd-2"];

    const r = evalEffect(
      { state: s, sourceId: "bd-2" },
      fx.placeAdvancements(4, false, {
        thenMayScore: true,
        then: fx.rfgSelf(),
      }),
    );
    expect(r.ok).toBe(true);
    expect(s.pendingChoice).not.toBeNull();
    s = must(s, { type: "choose_option", optionId: "decline" });
    expect(s.corp.score).not.toContain("ag-2");
    expect(s.cards["ag-2"].advancementTokens).toBe(4);
    expect(s.cards["bd-2"].zone).toBe("removed-from-game");
  });
});

describe("MS card wiring (Backroom / MAD / Big Deal)", () => {
  it("wires cleared ops with empty unsupported", () => {
    const br = getCardDef("backroom-machinations");
    expect(br.unsupported).toEqual([]);
    expect(br.playRequiresTagged).toBe(true);
    expect(br.playAdditionalCost).toEqual(fx.removeTags(1));
    expect(br.onPlay).toEqual(fx.scoreSelfAsAgenda(1));
    expect(br.agendaPoints).toBe(1);

    const mad = getCardDef("mutually-assured-destruction");
    expect(mad.unsupported).toEqual([]);
    expect(mad.playAdditionalClicks).toBe(2);
    expect(mad.onPlay).toEqual(fx.trashAnyRezzedGiveTags());

    const bd = getCardDef("big-deal");
    expect(bd.unsupported).toEqual([]);
    expect(bd.endsActionPhase).toBe(true);
    expect(bd.onPlay).toEqual(
      fx.placeAdvancements(4, false, {
        thenMayScore: true,
        then: fx.rfgSelf(),
      }),
    );
  });
});
