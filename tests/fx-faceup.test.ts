/**
 * FX-faceup: accessing a card does not turn it faceup (CR audit program,
 * fix-now session FX-faceup, 2026-11-27).
 *
 * While the Runner accesses a card they may look at it, and so may the Corp
 * unless it is accessed from R&D (CR 7.1.2). After the access, the card
 * stays visible to the Runner for the rest of the breach (CR 7.3.1a). It
 * never becomes open information: a faceup card can be examined by any
 * player (CR 4.6.3), and a facedown card in play is hidden information
 * (CR 10.2.2a). Before this fix `access_card` set `faceup` on every
 * accessed card and nothing cleared it for an installed card, so an
 * unrezzed card the Runner accessed and left stayed faceup for the rest of
 * the game: the spectator's log and board, and the Runner's own view, named
 * it. The face is what the game's spectator view reads, so "the card is not
 * faceup" is the spectator's case here; the game repo tests its board and
 * log line.
 *
 * A card that something else makes faceup keeps it: a stolen agenda is
 * faceup in the score area (CR 1.17.4), a card the Runner trashes while
 * accessing it goes to Archives faceup (CR 4.4.6b), and a rezzed or exposed
 * card is faceup before the access and stays so (CR 8.1.1, 1.21.4).
 */
import { beforeAll, describe, expect, it } from "vitest";
import {
  assertCardsPinnedTag,
  assertPinnedTag,
  cardsDataPresent,
  crDataPresent,
  getPublicView,
  legalActions,
} from "../src/index.js";
import type { GameState } from "../src/index.js";
import { completeExpose } from "../src/state/visibility/expose.js";
import { openPendingChoose } from "../src/state/triggers/pendingChoice.js";
import {
  openCardName,
  runnerSeesAccessedCard,
} from "../src/state/visibility/seatVisibility.js";
import type { Action } from "../src/state/types/actions.js";
import type { ServerId } from "../src/state/types/servers.js";
import type { Side } from "../src/state/types/shared.js";
import {
  fresh,
  installRoot,
  must,
  optionIds,
  put,
  runnerTurn,
  setIdentity,
  toHand,
} from "./rulings-helpers.js";

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.147.29");
});

const SERVER = "remote-pad-1" as ServerId;
const HT_SERVER = "remote-ht-1" as ServerId;

/** The Runner's turn with a facedown PAD Campaign alone in a remote root. */
function padBoard(): GameState {
  const s = runnerTurn(fresh());
  installRoot(s, "pad-campaign", "pad-1", false);
  return s;
}

/** PAD Campaign and a facedown Ash 2X3ZB9CY together in one remote root. */
function padAndAshBoard(): GameState {
  const s = padBoard();
  put(s, "ash-2x3zb9cy", "ash-1", `server:${SERVER}:root`);
  s.cards["ash-1"]!.rezzed = false;
  s.cards["ash-1"]!.faceup = false;
  s.servers[SERVER]!.root.push("ash-1");
  return s;
}

/** The title a seat's board shows for a card in the remote root. */
function rootTitle(s: GameState, side: Side, id: string): string | null {
  const server = getPublicView(s, side).servers.find((x) => x.id === SERVER);
  return server?.root.find((card) => card.id === id)?.title ?? null;
}

/**
 * Pass and continue until the Runner may access a card or the run is over.
 * Every Corp rez window is passed, so nothing is rezzed on the way.
 */
function toAccess(s: GameState): GameState {
  for (let i = 0; i < 40; i++) {
    if (!s.run || s.pendingChoice) return s;
    const legal = legalActions(s);
    if (legal.some((a) => a.type === "access_card")) return s;
    const next = (["continue_run", "finish_breach", "pass_window"] as const)
      .map((t) => legal.find((a) => a.type === t))
      .find(Boolean);
    if (!next) throw new Error(`stuck at ${s.timingKey}`);
    s = must(s, next);
  }
  throw new Error("no access");
}

/** Leave each card accessed, access the rest, and pass until the run is over. */
function toRunEnd(s: GameState): GameState {
  for (let i = 0; i < 40 && s.run; i++) {
    const legal = legalActions(s);
    const next = (
      [
        "finish_access",
        "access_card",
        "finish_breach",
        "continue_run",
        "pass_window",
      ] as const
    )
      .map((t) => legal.find((a) => a.type === t))
      .find(Boolean);
    if (!next) throw new Error(`stuck at ${s.timingKey}`);
    s = must(s, next);
  }
  expect(s.run).toBeNull();
  return s;
}

function runOnRemote(s: GameState): GameState {
  return toAccess(must(s, { type: "basic_run", serverId: SERVER }));
}

function access(s: GameState, cardId: string): GameState {
  return must(s, { type: "access_card", cardId });
}

function act(s: GameState, type: Action["type"], cardId: string): GameState {
  const action = legalActions(s).find(
    (a) => a.type === type && "cardId" in a && a.cardId === cardId,
  );
  if (!action) throw new Error(`no ${type} for ${cardId}`);
  return must(s, action);
}

describe("an accessed card is not turned faceup (CR 7.1.2, 4.6.3, 10.2.2a)", () => {
  it("an accessed unrezzed PAD Campaign is not faceup while it is accessed, and is facedown after the run", () => {
    let s = access(runOnRemote(padBoard()), "pad-1");
    expect(s.run?.accessingCardId).toBe("pad-1");
    expect(s.cards["pad-1"]!.faceup).toBe(false);
    s = toRunEnd(s);
    expect(s.cards["pad-1"]!.faceup).toBe(false);
    expect(s.cards["pad-1"]!.rezzed).toBe(false);
  });

  it("the spectator, who sees only faces, never sees the accessed PAD Campaign: it is facedown during the breach and after it", () => {
    let s = access(runOnRemote(padAndAshBoard()), "pad-1");
    expect(s.cards["pad-1"]!.faceup).toBe(false);
    s = must(s, { type: "finish_access" });
    s = toAccess(s);
    // The breach goes on: Ash is still a candidate.
    expect(s.timing.structure).toBe("breach");
    expect(s.cards["pad-1"]!.faceup).toBe(false);
    s = toRunEnd(access(s, "ash-1"));
    expect(s.cards["pad-1"]!.faceup).toBe(false);
    expect(s.cards["ash-1"]!.faceup).toBe(false);
  });

  it("the Runner's view names PAD Campaign while accessing it and for the rest of the breach (CR 7.1.2, 7.3.1a)", () => {
    let s = runOnRemote(padAndAshBoard());
    expect(rootTitle(s, "runner", "pad-1")).toBeNull();
    s = access(s, "pad-1");
    expect(rootTitle(s, "runner", "pad-1")).toBe("PAD Campaign");
    expect(openCardName(s, "pad-1", "runner")).toBe("PAD Campaign");
    s = toAccess(must(s, { type: "finish_access" }));
    expect(s.run?.accessingCardId).toBeNull();
    expect(rootTitle(s, "runner", "pad-1")).toBe("PAD Campaign");
    expect(openCardName(s, "pad-1", "runner")).toBe("PAD Campaign");
    // Ash has not been accessed yet, so the Runner does not see it.
    expect(rootTitle(s, "runner", "ash-1")).toBeNull();
  });

  it("the Runner's view hides the accessed PAD Campaign after the breach (CR 7.3.1a, 10.2.2a)", () => {
    const s = toRunEnd(access(runOnRemote(padAndAshBoard()), "pad-1"));
    expect(rootTitle(s, "runner", "pad-1")).toBeNull();
    expect(rootTitle(s, "runner", "ash-1")).toBeNull();
    expect(openCardName(s, "pad-1", "runner")).not.toContain("PAD Campaign");
    const seen = JSON.stringify(getPublicView(s, "runner").servers);
    expect(seen).not.toContain("PAD Campaign");
    expect(seen).not.toContain("Ash 2X3ZB9CY");
  });

  it("the Corp still sees its own PAD Campaign during the access and after the run (CR 1.21.2a)", () => {
    let s = access(runOnRemote(padBoard()), "pad-1");
    expect(rootTitle(s, "corp", "pad-1")).toBe("PAD Campaign");
    s = toRunEnd(s);
    expect(rootTitle(s, "corp", "pad-1")).toBe("PAD Campaign");
  });
});

describe("how long the Runner sees a card they accessed (CR 7.3.1a)", () => {
  it("a Corp choice that names the PAD Campaign the Runner is accessing keeps its label in the Runner's view (CR 7.1.2)", () => {
    const s = access(runOnRemote(padBoard()), "pad-1");
    openPendingChoose(s, {
      sourceId: s.corp.identityId,
      chooser: "corp",
      options: [
        {
          id: "probe:pad-1",
          label: "Probe PAD Campaign",
          effect: {
            op: "do",
            action: { kind: "trash_card", cardId: "pad-1" } as never,
          },
        },
      ],
    });
    const options = getPublicView(s, "runner").pendingChoice?.options ?? [];
    expect(options.map((o) => o.label)).toEqual(["Probe PAD Campaign"]);
  });

  /** PAD Campaign accessed and left; Ash is still to be accessed. */
  function midBreach(): GameState {
    const s = access(runOnRemote(padAndAshBoard()), "pad-1");
    return toAccess(must(s, { type: "finish_access" }));
  }

  it("during an encounter forced inside the breach (Ganked!) the Runner still sees the cards accessed earlier in it (CR 6.1.4b)", () => {
    const s = midBreach();
    expect(runnerSeesAccessedCard(s, "pad-1")).toBe(true);
    s.timing.structure = "run";
    s.run!.resumeAccessAfterReencounter = true;
    expect(runnerSeesAccessedCard(s, "pad-1")).toBe(true);
    s.run!.resumeAccessAfterReencounter = false;
    expect(runnerSeesAccessedCard(s, "pad-1")).toBe(false);
  });

  it("once the run is ended the breach is over, and the Runner no longer sees them (CR 6.1.4a)", () => {
    const s = midBreach();
    s.run!.endedTheRun = true;
    expect(runnerSeesAccessedCard(s, "pad-1")).toBe(false);
    expect(rootTitle(s, "runner", "pad-1")).toBeNull();
  });

  it("a card accessed facedown in Archives stays visible to the Runner for the breach, but a card accessed elsewhere that later goes there does not (CR 7.3.2a, 1.12.1)", () => {
    const s = midBreach();
    s.servers[SERVER]!.root = s.servers[SERVER]!.root.filter(
      (id) => id !== "pad-1",
    );
    s.cards["pad-1"]!.zone = "corp:archives";
    s.corp.discardPile.push("pad-1");
    expect(runnerSeesAccessedCard(s, "pad-1")).toBe(false);
    s.run!.attackedServerId = "archives";
    expect(runnerSeesAccessedCard(s, "pad-1")).toBe(true);
  });
});

describe("a card made faceup by its own step stays faceup", () => {
  it("a stolen facedown agenda is faceup in the Runner's score area (CR 1.17.4)", () => {
    const s0 = runnerTurn(fresh());
    installRoot(s0, "hostile-takeover", "ht-1", false);
    let s = toAccess(must(s0, { type: "basic_run", serverId: HT_SERVER }));
    s = access(s, "ht-1");
    if (legalActions(s).some((a) => a.type === "steal_agenda")) {
      s = act(s, "steal_agenda", "ht-1");
    }
    s = toRunEnd(s);
    expect(s.runner.scoreArea).toContain("ht-1");
    expect(s.cards["ht-1"]!.faceup).toBe(true);
  });

  it("a PAD Campaign the Runner trashes while accessing it goes to Archives faceup (CR 4.4.6b)", () => {
    let s = access(runOnRemote(padBoard()), "pad-1");
    s = act(s, "trash_accessed", "pad-1");
    s = toRunEnd(s);
    expect(s.corp.discardPile).toContain("pad-1");
    expect(s.cards["pad-1"]!.faceup).toBe(true);
  });

  it("a rezzed PAD Campaign stays faceup after it is accessed (CR 8.1.1)", () => {
    const s0 = runnerTurn(fresh());
    installRoot(s0, "pad-campaign", "pad-1", true);
    const s = toRunEnd(access(runOnRemote(s0), "pad-1"));
    expect(s.cards["pad-1"]!.faceup).toBe(true);
    expect(rootTitle(s, "runner", "pad-1")).toBe("PAD Campaign");
  });

  it("an exposed PAD Campaign keeps the face its exposure gave it after it is accessed (CR 1.21.4)", () => {
    const s0 = padBoard();
    completeExpose(s0, "pad-1");
    expect(s0.cards["pad-1"]!.faceup).toBe(true);
    const s = toRunEnd(access(runOnRemote(s0), "pad-1"));
    expect(s.cards["pad-1"]!.faceup).toBe(true);
  });
});

describe("BANGUN reads the agenda's face from before the access", () => {
  function bangunBoard(faceup: boolean): GameState {
    const s = runnerTurn(fresh());
    setIdentity(s, "corp", "bangun-when-disaster-strikes");
    for (let i = 0; i < 4; i++) toHand(s, "runner", "sure-gamble", `sg-${i}`);
    const agenda = installRoot(s, "hostile-takeover", "ht-1", false);
    agenda.faceup = faceup;
    return s;
  }

  function accessAgenda(s0: GameState): GameState {
    let s = access(
      toAccess(must(s0, { type: "basic_run", serverId: HT_SERVER })),
      "ht-1",
    );
    // Resolve BANGUN's ability if it is pending.
    for (let i = 0; i < 5 && s.pendingChoice; i++) {
      s = must(s, { type: "choose_option", optionId: optionIds(s)[0]! });
    }
    return s;
  }

  it("accessing a faceup installed agenda meets BANGUN's condition (CR 3.2.3a)", () => {
    const s = accessAgenda(bangunBoard(true));
    expect(s.runner.tags).toBe(1);
    expect(s.runner.hand.length).toBe(2);
  });

  it("accessing a facedown installed agenda does not, though the Runner looks at it (CR 7.1.2)", () => {
    const s = accessAgenda(bangunBoard(false));
    expect(s.runner.tags).toBe(0);
    expect(s.runner.hand.length).toBe(4);
  });
});
