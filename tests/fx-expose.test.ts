/**
 * FX-expose: a Runner's choice among facedown Corp cards names them only by
 * where they are (CR audit program, fix-now session FX-expose, 2026-11-26).
 *
 * An unrezzed installed card is hidden information (CR 10.2.2a); where it
 * is, the server and the ice position, is open information (CR 10.2.3a).
 * Exposing a card reveals it (CR 1.21.4), so the Runner learns its title
 * only once it is exposed. Before this fix the choice buttons for expose,
 * Forged Activation Orders and Tinkering carried the unrezzed cards' titles.
 * Each choice label is built by `openCardName` in the seat-view module. The
 * Corp may look at its own facedown cards at any time (CR 1.21.2a), so its
 * view keeps their titles, and a choice the Corp makes over them names them.
 */
import { beforeAll, describe, expect, it } from "vitest";
import {
  assertCardsPinnedTag,
  assertPinnedTag,
  cardsDataPresent,
  crDataPresent,
  getPublicView,
} from "../src/index.js";
import type { GameState } from "../src/index.js";
import { evalEffect } from "../src/effects/eval.js";
import { fx } from "../src/effects/ir.js";
import { hostCard } from "../src/state/hostingAndTrash/host.js";
import { openCardName } from "../src/state/visibility/seatVisibility.js";
import type { Side } from "../src/state/types.js";
import {
  fresh,
  installIce,
  installRoot,
  must,
  pick,
  put,
  runnerTurn,
  toHand,
} from "./rulings-helpers.js";

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.147.29");
});

/**
 * The Runner's turn with an unrezzed Ice Wall protecting HQ, an unrezzed
 * Enigma outermost on R&D with a rezzed Tollbooth behind it, and a facedown
 * PAD Campaign alone in a remote root.
 */
function board(): GameState {
  const s = runnerTurn(fresh());
  installIce(s, "ice-wall", "iw-1", "hq", false);
  installIce(s, "tollbooth", "tb-1", "rd", true);
  installIce(s, "enigma", "en-1", "rd", false);
  installRoot(s, "pad-campaign", "pad-1", false);
  return s;
}

const FACEDOWN_TITLES = ["Ice Wall", "Enigma", "PAD Campaign"];

/** The seat's view without the engine's own log, which hosts do not show. */
function seen(s: GameState, side: Side): string {
  const { log: _log, ...view } = getPublicView(s, side);
  return JSON.stringify(view);
}

function labels(s: GameState, side: Side): string[] {
  return (getPublicView(s, side).pendingChoice?.options ?? []).map(
    (o) => o.label,
  );
}

/** Titles of the ice on a server as the seat sees them. */
function iceTitles(s: GameState, side: Side, server: "hq" | "rd") {
  const row = getPublicView(s, side).servers.find((sv) => sv.id === server);
  return row!.ice.map((ice) => ice.title);
}

function playForgedActivationOrders(): GameState {
  const s = board();
  toHand(s, "runner", "forged-activation-orders", "fao-1");
  return must(s, { type: "play_event", cardId: "fao-1" });
}

function playTinkering(): GameState {
  const s = board();
  toHand(s, "runner", "tinkering", "tk-1");
  return must(s, { type: "play_event", cardId: "tk-1" });
}

/** Infiltration: "Gain 2 credits or expose 1 card", choosing to expose. */
function playInfiltrationToExpose(): GameState {
  const s = board();
  toHand(s, "runner", "infiltration", "inf-1");
  const played = must(s, { type: "play_event", cardId: "inf-1" });
  return played.pendingChoice?.options.some((o) => o.id.startsWith("expose:"))
    ? played
    : pick(played, "expose");
}

describe("the Runner's choice names facedown Corp cards by where they are", () => {
  it("Runner's expose choice names unrezzed ice by position and a facedown root card by its server, not by title (CR 10.2.2a, 10.2.3a)", () => {
    const s = playInfiltrationToExpose();
    expect(s.pendingChoice?.chooser).toBe("runner");
    const shown = labels(s, "runner");
    expect(shown).toEqual(
      expect.arrayContaining([
        "Expose the unrezzed ice protecting HQ, position 1 from the outermost",
        "Expose the unrezzed ice protecting R&D, position 1 from the outermost",
        "Expose the facedown card in the root of Remote pad-1",
      ]),
    );
    const text = seen(s, "runner");
    for (const title of FACEDOWN_TITLES) expect(text).not.toContain(title);
  });

  it("Runner's Forged Activation Orders choice names unrezzed ice by server and position, not title (CR 10.2.2a, 10.2.3a)", () => {
    const s = playForgedActivationOrders();
    expect(s.pendingChoice?.chooser).toBe("runner");
    expect(labels(s, "runner").sort()).toEqual([
      "Choose the unrezzed ice protecting HQ, position 1 from the outermost",
      "Choose the unrezzed ice protecting R&D, position 1 from the outermost",
    ]);
    const text = seen(s, "runner");
    for (const title of FACEDOWN_TITLES) expect(text).not.toContain(title);
  });

  it("Runner's Tinkering choice names unrezzed ice by position and rezzed ice by title (CR 10.2.2a, 10.2.3a)", () => {
    const s = playTinkering();
    expect(s.pendingChoice?.chooser).toBe("runner");
    const gains = "sentry, code gate, barrier until end of turn";
    expect(labels(s, "runner").sort()).toEqual([
      `Give Tollbooth ${gains}`,
      `Give the unrezzed ice protecting HQ, position 1 from the outermost ${gains}`,
      `Give the unrezzed ice protecting R&D, position 1 from the outermost ${gains}`,
    ]);
    const text = seen(s, "runner");
    for (const title of FACEDOWN_TITLES) expect(text).not.toContain(title);
  });

  it("Runner's En Passant choice names the passed unrezzed ice by position, not title (CR 10.2.2a, 4.6.9a)", () => {
    const s = board();
    put(s, "en-passant", "ep-1", "runner:play-area");
    s.turn.lastRunPassedUnrezzedIceIds = ["iw-1", "en-1"];
    const r = evalEffect(
      { state: s, sourceId: "ep-1" },
      fx.do({ kind: "trash_passed_unrezzed_ice" } as never),
    );
    if (!r.ok) throw new Error(r.error);
    expect(labels(s, "runner").sort()).toEqual([
      "Trash the unrezzed ice protecting HQ, position 1 from the outermost",
      "Trash the unrezzed ice protecting R&D, position 1 from the outermost",
    ]);
    const text = seen(s, "runner");
    for (const title of FACEDOWN_TITLES) expect(text).not.toContain(title);
  });

  it("two facedown cards hosted on one card get different names for the Runner and keep their titles for the Corp (CR 10.2.2a, 1.21.2a)", () => {
    const s = board();
    put(s, "hostile-takeover", "h-1", "corp:hq");
    put(s, "priority-requisition", "h-2", "corp:hq");
    hostCard(s, "h-1", "tb-1");
    hostCard(s, "h-2", "tb-1");
    expect([
      openCardName(s, "h-1", "runner"),
      openCardName(s, "h-2", "runner"),
    ]).toEqual([
      "facedown card 1 hosted on Tollbooth",
      "facedown card 2 hosted on Tollbooth",
    ]);
    expect(openCardName(s, "h-1", "corp")).toBe("Hostile Takeover");
  });

  it("the Runner learns an exposed card's title only once it is exposed (CR 1.21.4)", () => {
    let s = playInfiltrationToExpose();
    s = pick(s, "iw-1");
    expect(s.log.join("\n")).toContain("Ice Wall");
  });
});

describe("the Corp still sees its own titles", () => {
  it("Corp still sees its own titles on the board while the Runner chooses for expose, Forged Activation Orders and Tinkering (CR 1.21.2a)", () => {
    for (const s of [
      playInfiltrationToExpose(),
      playForgedActivationOrders(),
      playTinkering(),
    ]) {
      expect(s.pendingChoice?.chooser).toBe("runner");
      expect(iceTitles(s, "corp", "hq")).toEqual(["Ice Wall"]);
      expect(iceTitles(s, "corp", "rd")).toEqual(["Enigma", "Tollbooth"]);
      expect(iceTitles(s, "runner", "hq")).toEqual([null]);
      // The Corp's view of the Runner's choice still says which card each
      // option is (CR 10.2.3a).
      const ids = getPublicView(s, "corp").pendingChoice!.options.map(
        (o) => o.id,
      );
      expect(ids.some((id) => id.endsWith(":iw-1"))).toBe(true);
    }
  });

  it("Corp still sees its own titles in a choice the Corp makes over its facedown cards (CR 1.21.2a)", () => {
    const s = board();
    const r = evalEffect(
      { state: s, sourceId: "pad-1" },
      fx.do({
        kind: "choose_card",
        chooser: "corp",
        zone: "remote_root",
        then: fx.gainCredits("corp", 0),
      } as never),
    );
    if (!r.ok) throw new Error(r.error);
    expect(s.pendingChoice?.chooser).toBe("corp");
    expect(labels(s, "corp")).toEqual(["PAD Campaign"]);
  });

  it("a generic choose_card the Runner makes over a facedown root card names it by its server (CR 10.2.2a)", () => {
    const s = board();
    installRoot(s, "hostile-takeover", "ht-1", false);
    const r = evalEffect(
      { state: s, sourceId: s.runner.identityId },
      fx.do({
        kind: "choose_card",
        chooser: "runner",
        zone: "remote_root",
        then: fx.gainCredits("runner", 0),
      } as never),
    );
    if (!r.ok) throw new Error(r.error);
    expect(labels(s, "runner").sort()).toEqual([
      "the facedown card in the root of Remote ht-1",
      "the facedown card in the root of Remote pad-1",
    ]);
    expect(seen(s, "runner")).not.toContain("Hostile Takeover");
  });
});
