/**
 * Comprehensive Rules examples from chapter 4.
 * Each test plays that example's board.
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
  getPublicView,
  instantiateCard,
} from "../src/index.js";
import type { GameState } from "../src/state/types.js";

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.147.6");
});

describe("CR examples, chapter 4", () => {

  function encounterRun(serverId: "hq", iceId: string): NonNullable<GameState["run"]> {
    return {
      attackedServerId: serverId,
      phase: "encounter",
      position: 0,
      successful: null,
      accessedCardIds: [],
      accessCandidates: [],
      randomAccessLimit: null,
      encounter: { iceId, broken: [] },
      endedTheRun: false,
      cannotJackOut: false,
      strengthBoosts: {},
      encounterStrengthBoosts: {},
      iceStrengthBoosts: {},
      accessingCardId: null,
    };
  }


  it("reveals facedown Fast Break before Clone Suffrage Movement adds it to HQ (CR 4.1.2a.ex1)", () => {
    const s = createInitialState();
    const fast = instantiateCard("fast-break", "fb-1", "corp:archives");
    fast.faceup = false;
    s.cards["fb-1"] = fast;
    s.corp.discardPile = ["fb-1"];
    const moved = evalEffect(
      { state: s, sourceId: "csm-1" },
      { op: "do", action: { kind: "may_add_operation_from_archives_to_hq" } },
    );
    expect(moved.ok).toBe(true);
    const reveal = s.log.findIndex((line) => line.includes("Reveal Fast Break"));
    const added = s.log.findIndex((line) => line.includes("add Fast Break"));
    expect(reveal).toBeGreaterThan(-1);
    expect(added).toBeGreaterThan(reveal);
    expect(s.log[reveal]).toContain("4.1.2a");
    expect(s.corp.hand).toContain("fb-1");
    expect(s.corp.discardPile).not.toContain("fb-1");
  });



  it("does not trace when Warroid Tracker is the card the Runner trashed (CR 4.6.6i.ex1)", () => {
    const s = createInitialState();
    const warroid = instantiateCard("warroid-tracker", "war-1", "server:hq:root");
    warroid.rezzed = true;
    const program = instantiateCard("corroder", "prog-1", "runner:installed");
    s.cards["war-1"] = warroid;
    s.cards["prog-1"] = program;
    s.servers.hq.root = ["war-1"];
    s.runner.installed = ["prog-1"];
    const trashed = evalEffect(
      { state: s, sourceId: "prog-1" },
      { op: "do", action: { kind: "trash_corp_card", cardId: "war-1" } },
    );
    expect(trashed.ok).toBe(true);
    expect(s.corp.discardPile).toContain("war-1");
    expect(s.trace).toBeNull();
    expect(s.runner.installed).toContain("prog-1");
    expect(s.pendingChoice).toBeNull();
  });




  it("counts ice on the server Border Control left, not Border Control itself (CR 4.6.6i.ex2)", () => {
    const s = createInitialState();
    const border = instantiateCard("border-control", "bc-1", "server:hq:ice");
    border.rezzed = true;
    const wall = instantiateCard("ice-wall", "wall-1", "server:hq:ice");
    wall.rezzed = true;
    s.cards["bc-1"] = border;
    s.cards["wall-1"] = wall;
    s.servers.hq.ice = ["bc-1", "wall-1"];
    s.corp.credits = 0;
    s.run = encounterRun("hq", "bc-1");
    const resolved = evalEffect(
      { state: s, sourceId: "bc-1" },
      { op: "do", action: { kind: "trash_encounter_ice_resolve_subroutine", subIndex: 0 } },
    );
    expect(resolved.ok).toBe(true);
    expect(s.corp.discardPile).toContain("bc-1");
    expect(s.corp.credits).toBe(1);
  });




  it("counts Archives ice when Nanisivik resolves Border Control already in Archives (CR 4.6.6i.ex3)", () => {
    const s = createInitialState();
    const border = instantiateCard("border-control", "bc-1", "corp:archives");
    border.faceup = false;
    border.rezzed = false;
    const wall = instantiateCard("ice-wall", "wall-1", "server:hq:ice");
    wall.rezzed = true;
    s.cards["bc-1"] = border;
    s.cards["wall-1"] = wall;
    s.corp.discardPile = ["bc-1"];
    s.servers.hq.ice = ["wall-1"];
    s.corp.credits = 3;
    s.run = encounterRun("hq", "wall-1");
    const resolved = evalEffect(
      { state: s, sourceId: "bc-1" },
      {
        op: "do",
        action: {
          kind: "flip_archives_ice_resolve_subroutine",
          iceId: "bc-1",
          subIndex: 0,
        },
      },
    );
    expect(resolved.ok).toBe(true);
    expect(s.corp.credits).toBe(3);
  });




    it("refuses a second remote while Earth Station's limit is already met (CR 4.6.8f.ex1)", () => {
    const s = createInitialState();
    s.cards[s.corp.identityId]!.maxRemoteServers = 1;
    s.servers["remote-1"] = { id: "remote-1", kind: "remote", ice: [], root: [] };
    const pad = instantiateCard("pad-campaign", "pad-1", "corp:hq");
    s.cards["pad-1"] = pad;
    s.corp.hand = ["pad-1"];
    s.corp.clicks = 1;
    s.corp.credits = 5;
    s.activeSide = "corp";
    s.timingKey = "corp.takeAction";
    const refused = applyAction(s, {
      type: "basic_install",
      cardId: "pad-1",
      destination: { kind: "new_remote" },
    });
    expect(refused.ok).toBe(false);
    expect(Object.values(s.servers).filter((server) => server.kind === "remote")).toHaveLength(1);
  });



  it("draws for Exile when Test Run installs a program from the heap (CR 4.8.3.ex1)", () => {
    const s = createInitialState();
    const exile = instantiateCard("exile-streethawk", "exile-1", "runner:identity");
    s.cards["exile-1"] = exile;
    s.runner.identityId = "exile-1";
    const program = instantiateCard("corroder", "prog-1", "runner:heap");
    const drawn = instantiateCard("sure-gamble", "draw-1", "runner:stack");
    s.cards["prog-1"] = program;
    s.cards["draw-1"] = drawn;
    s.runner.discardPile = ["prog-1"];
    s.runner.deck = ["draw-1", ...s.runner.deck];
    const deckBefore = s.runner.deck.length;
    const installed = evalEffect(
      { state: s, sourceId: "exile-1" },
      { op: "do", action: { kind: "install_program_from_stack_or_heap_free" } },
    );
    expect(installed.ok).toBe(true);
    expect(s.runner.installed).toContain("prog-1");
    expect(s.runner.hand).toContain("draw-1");
    expect(s.runner.deck).toHaveLength(deckBefore - 1);
  });



  it("sets Daily Business Show's draw aside facedown so the Runner is not told which card was bottomed (CR 4.8.7.ex1)", () => {
    const s = createInitialState();
    const show = instantiateCard("daily-business-show", "dbs-1", "server:hq:root");
    show.rezzed = true;
    const accessed = instantiateCard("hedge-fund", "accessed-1", "corp:rd");
    accessed.faceup = false;
    const other = instantiateCard("hedge-fund", "other-1", "corp:rd");
    other.title = "Other Card";
    other.faceup = false;
    s.cards["dbs-1"] = show;
    s.cards["accessed-1"] = accessed;
    s.cards["other-1"] = other;
    s.servers.hq.root = ["dbs-1"];
    s.corp.deck = ["accessed-1", "other-1", ...s.corp.deck];
    s.activeSide = "corp";
    s.timingKey = "corp.mandatoryDraw";
    const drawing = applyAction(s, { type: "pass_window" });
    if (!drawing.ok) throw new Error(drawing.error);
    const mid = drawing.state;
    expect(mid.cards["accessed-1"]?.faceup).toBe(false);
    expect(mid.cards["other-1"]?.faceup).toBe(false);
    expect(mid.corp.hand).not.toContain("accessed-1");
    const runner = getPublicView(mid, "runner");
    const corp = getPublicView(mid, "corp");
    const runnerLabels = runner.pendingChoice?.options.map((option) => option.label).join("\n") ?? "";
    const corpLabels = corp.pendingChoice?.options.map((option) => option.label).join("\n") ?? "";
    expect(runnerLabels).not.toContain("Hedge Fund");
    expect(runnerLabels).not.toContain("Other Card");
    expect(corpLabels).toContain("Hedge Fund");
    const setAside = runner.setAside ?? [];
    expect(setAside.some((card) => card.title === "Hedge Fund")).toBe(false);
    const chosen = applyAction(mid, { type: "choose_option", optionId: "dbs-bottom:accessed-1" });
    if (!chosen.ok) throw new Error(chosen.error);
    expect(chosen.state.corp.deck.at(-1)).toBe("accessed-1");
    expect(chosen.state.corp.hand).toContain("other-1");
    expect(chosen.state.log.join("\n")).toContain("add a card to the bottom");
    expect(chosen.state.log.join("\n")).not.toContain("add Hedge Fund to the bottom");
  });

});
