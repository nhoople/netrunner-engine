/**
 * Comprehensive Rules examples from chapter 8.
 * Each test plays that example's board. An example that already has a
 * test in a mechanism file stays in that file.
 */
import { beforeAll, describe, expect, it } from "vitest";
import {
  applyAction,
  assertCardsPinnedTag,
  assertPinnedTag,
  autoWalk,
  cardsDataPresent,
  createInitialState,
  crDataPresent,
  enterStep,
  instantiateCard,
} from "../src/index.js";
import type { Action, GameState, ServerId } from "../src/state/types.js";

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.147.6");
});

function must(state: GameState, action: Action): GameState {
  const result = applyAction(state, action);
  if (!result.ok) throw new Error(`${result.error} ${JSON.stringify(result.cites)}`);
  return result.state;
}

function runnerTurn(state: GameState, clicks = 4, credits = 5): GameState {
  state.activeSide = "runner";
  state.timingKey = "runner.takeAction";
  state.runner.clicks = clicks;
  state.runner.credits = credits;
  return state;
}

function corpTurn(state: GameState, clicks = 3, credits = 10): GameState {
  state.activeSide = "corp";
  state.timingKey = "corp.takeAction";
  state.corp.clicks = clicks;
  state.corp.credits = credits;
  return state;
}

/** Pass open windows until pred, a choice, or a psi game. */
function passUntil(
  state: GameState,
  pred: (s: GameState) => boolean,
  max = 24,
): GameState {
  let s = state;
  for (let i = 0; i < max && !pred(s); i++) {
    if (s.pendingChoice || s.psi) break;
    const before = s.timingKey;
    const result = applyAction(s, { type: "pass_window" });
    if (!result.ok) break;
    s = result.state;
    if (s.timingKey === before && !s.pendingChoice && !s.psi) break;
  }
  return s;
}

function remote(state: GameState, id: string, ice: string[] = [], root: string[] = []) {
  const serverId = id as ServerId;
  state.servers[serverId] = { id: serverId, kind: "remote", ice, root };
  return serverId;
}

describe("CR examples, chapter 8", () => {
    it("installs an unrevealed upgrade into an occupied remote root and rejects an operation (CR 8.5.13a.ex1)", () => {
    let s = createInitialState();
    const serverId = remote(s, "remote-1", [], ["pad-1"]);
    const pad = instantiateCard("pad-campaign", "pad-1", "server:remote-1:root");
    pad.faceup = false;
    pad.rezzed = false;
    s.cards["pad-1"] = pad;
    const hedge = instantiateCard("hedge-fund", "hf-1", "corp:hq");
    const grid = instantiateCard("nanisivik-grid", "nan-1", "corp:hq");
    s.cards["hf-1"] = hedge;
    s.cards["nan-1"] = grid;
    s.corp.hand = ["hf-1", "nan-1"];
    corpTurn(s, 2, 10);

    const operation = applyAction(s, {
      type: "basic_install",
      cardId: "hf-1",
      destination: { kind: "remote_root", serverId },
    });
    expect(operation.ok).toBe(false);
    const secondAsset = instantiateCard("pad-campaign", "pad-2", "corp:hq");
    s.cards["pad-2"] = secondAsset;
    s.corp.hand = ["hf-1", "nan-1", "pad-2"];
    const asset = applyAction(s, {
      type: "basic_install",
      cardId: "pad-2",
      destination: { kind: "remote_root", serverId },
    });
    expect(asset.ok).toBe(false);
    if (!asset.ok) expect(asset.cites?.map((cite) => cite.number)).toContain("4.6.6e");

    s = must(s, {
      type: "basic_install",
      cardId: "nan-1",
      destination: { kind: "remote_root", serverId },
    });
    expect(s.servers[serverId]!.root).toEqual(["pad-1", "nan-1"]);
    expect(s.cards["pad-1"]?.faceup).toBe(false);
    expect(s.cards["nan-1"]?.faceup).toBe(false);
    expect(s.log.some((line) => /reveal (Pad Campaign|Nanisivik Grid)/i.test(line))).toBe(false);
  });

    it("does not reveal ice Brân installs from HQ (CR 8.5.13a.ex2)", () => {
    let s = createInitialState();
    const serverId = remote(s, "remote-1", ["bran-1"]);
    const bran = instantiateCard("bran-1-0", "bran-1", "server:remote-1:ice");
    bran.rezzed = true;
    bran.faceup = true;
    s.cards["bran-1"] = bran;
    const inward = instantiateCard("ice-wall", "in-1", "corp:hq");
    s.cards["in-1"] = inward;
    s.corp.hand = ["in-1"];
    runnerTurn(s, 4, 5);

    s = must(s, { type: "basic_run", serverId });
    s = passUntil(s, (st) => st.timingKey === "run.encounterPaw");
    s = must(s, { type: "break_bioroid_subroutine", subIndex: 1 });
    s = passUntil(s, (st) => st.timingKey === "run.encounterPaw");
    s = must(s, { type: "break_bioroid_subroutine", subIndex: 2 });
    s = passUntil(s, (st) => st.servers[serverId]!.ice.includes("in-1"));
    expect(s.cards["in-1"]?.faceup).toBe(false);
    expect(s.cards["in-1"]?.zone).toBe(`server:${serverId}:ice`);
    expect(s.log.some((line) => /reveal Ice Wall/i.test(line))).toBe(false);
    expect(s.log.some((line) => line.includes("Install Ice Wall inward of Brân 1.0"))).toBe(
      true,
    );
  });

    it("does not reveal a second region installed into a root that already has one (CR 8.5.13b.ex1)", () => {
    let s = createInitialState();
    const serverId = remote(s, "remote-1", [], ["nan-old"]);
    const oldGrid = instantiateCard("nanisivik-grid", "nan-old", "server:remote-1:root");
    oldGrid.rezzed = true;
    oldGrid.faceup = true;
    s.cards["nan-old"] = oldGrid;
    const nextGrid = instantiateCard("nanisivik-grid", "nan-new", "corp:hq");
    s.cards["nan-new"] = nextGrid;
    s.corp.hand = ["nan-new"];
    corpTurn(s, 1, 10);

    s = must(s, {
      type: "basic_install",
      cardId: "nan-new",
      destination: { kind: "remote_root", serverId },
    });
    expect(s.servers[serverId]!.root).toEqual(["nan-new"]);
    expect(s.cards["nan-new"]?.faceup).toBe(false);
    expect(s.corp.discardPile).toContain("nan-old");
    expect(s.log.some((line) => /reveal Nanisivik Grid/i.test(line))).toBe(false);
  });

    it("resolves Brân's install subroutine from Archives with no install (CR 8.5.14.ex1)", () => {
    let s = createInitialState();
    const grid = instantiateCard("nanisivik-grid", "nan-1", "server:hq:root");
    grid.rezzed = true;
    grid.faceup = true;
    s.cards["nan-1"] = grid;
    s.servers.hq.root = ["nan-1"];
    const bran = instantiateCard("bran-1-0", "bran-arch", "corp:archives");
    bran.faceup = false;
    bran.rezzed = false;
    s.cards["bran-arch"] = bran;
    s.corp.discardPile = ["bran-arch"];
    const wall = instantiateCard("ice-wall", "hq-ice", "corp:hq");
    s.cards["hq-ice"] = wall;
    s.corp.hand = ["hq-ice"];
    runnerTurn(s, 1, 5);

    s = must(s, { type: "basic_run", serverId: "hq" });
    s = passUntil(s, (st) => Boolean(st.pendingChoice));
    expect(s.pendingChoice?.chooser).toBe("corp");
    const flip = s.pendingChoice!.options.find((option) => option.id === "flip:bran-arch:0");
    expect(flip).toBeTruthy();
    s = must(s, { type: "choose_option", optionId: flip!.id });
    expect(s.cards["bran-arch"]?.faceup).toBe(true);
    expect(s.cards["bran-arch"]?.zone).toBe("corp:archives");
    expect(s.corp.hand).toEqual(["hq-ice"]);
    expect(s.servers.hq.ice).not.toContain("hq-ice");
    expect(
      s.log.some((line) => line.includes("Install ice inward — source not protecting attacked server.")),
    ).toBe(true);
  });

    it("cannot find an event with Artist Colony (CR 8.7.2b.ex1)", () => {
    let s = createInitialState();
    const colony = instantiateCard("artist-colony", "ac-1", "runner:installed");
    s.cards["ac-1"] = colony;
    s.runner.installed = ["ac-1"];
    const agenda = instantiateCard("hostile-takeover", "ag-1", "runner:score");
    agenda.faceup = true;
    agenda.agendaPoints = 2;
    s.cards["ag-1"] = agenda;
    s.runner.scoreArea = ["ag-1"];
    const event = instantiateCard("sure-gamble", "sg-1", "runner:stack");
    s.cards["sg-1"] = event;
    s.runner.deck = ["sg-1"];
    s.activeSide = "runner";
    s.timingKey = "runner.actionPaw";
    s.runner.credits = 0;

    s = must(s, {
      type: "use_paid_ability",
      cardId: "ac-1",
      abilityId: "artist-colony-search",
    });
    expect(s.pendingChoice).toBeNull();
    expect(s.runner.deck).toContain("sg-1");
    expect(s.runner.installed).not.toContain("sg-1");
    expect(s.runner.scoreArea).not.toContain("ag-1");
    expect(s.log.some((line) => line.includes("Artist Colony — no program/resource/hardware in stack."))).toBe(
      true,
    );
  });

    it("leaves Botulus hosted on Palisade when Thimblerig swaps with it (CR 8.8.3a.ex1)", () => {
    let s = createInitialState();
    remote(s, "remote-1", ["th-1"]);
    remote(s, "remote-2", ["pal-1"]);
    const thimble = instantiateCard("thimblerig", "th-1", "server:remote-1:ice");
    thimble.rezzed = true;
    thimble.faceup = true;
    const palisade = instantiateCard("palisade", "pal-1", "server:remote-2:ice");
    palisade.rezzed = true;
    palisade.faceup = true;
    s.cards["th-1"] = thimble;
    s.cards["pal-1"] = palisade;
    const bot = instantiateCard("botulus", "bot-1", "runner:grip");
    s.cards["bot-1"] = bot;
    s.runner.hand = ["bot-1"];
    runnerTurn(s, 1, 5);
    s = must(s, {
      type: "basic_install",
      cardId: "bot-1",
      destination: { kind: "host_ice", iceId: "pal-1" },
    });
    expect(s.cards["bot-1"]?.hostId).toBe("pal-1");

    s.activeSide = "corp";
    enterStep(s, "corp.turnBegins");
    autoWalk(s);
    expect(s.pendingChoice?.sourceId).toBe("th-1");
    const swapped = must(s, { type: "choose_option", optionId: "swap-ice:pal-1" });
    expect(swapped.servers["remote-1"]!.ice).toEqual(["pal-1"]);
    expect(swapped.servers["remote-2"]!.ice).toEqual(["th-1"]);
    expect(swapped.cards["bot-1"]?.hostId).toBe("pal-1");
    expect(swapped.cards["bot-1"]?.zone).toBe("runner:installed");
    expect(swapped.runner.installed).toContain("bot-1");
  });
});
