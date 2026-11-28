/**
 * FX-view: what each seat sees of pending abilities, held-over effects and
 * choices that come from a card it may not see (CR audit program, fix-now
 * session FX-view, 2026-11-21).
 *
 * A facedown card in Archives, a card in HQ or the grip, and an unrezzed
 * installed card are hidden information (CR 10.2.2a). The other player
 * cannot learn them (CR 10.2.2b), so a pending ability, a choice, or the rest
 * of an effect that names such a card is not in that player's view. The
 * player who controls the card sees all of it. Decided 2026-11-21: a
 * facedown Subliminal Messaging's turn-begin offer is private to the Corp
 * until it reveals. Each test name states what a seat sees and cites the rule.
 */
import { beforeAll, describe, expect, it } from "vitest";
import {
  assertCardsPinnedTag,
  assertPinnedTag,
  cardsDataPresent,
  crDataPresent,
  getPublicView,
  legalActions,
} from "../../../src/index.js";
import type { GameState } from "../../../src/index.js";
import type { PendingAbilityInstance } from "../../../src/state/types/pendingAbilities.js";
import type { PublicView } from "../../../src/state/types/publicView.js";
import type { ServerId } from "../../../src/state/types/servers.js";
import type { Side } from "../../../src/state/types/shared.js";
import {
  corpTurn,
  drive,
  fresh,
  installRoot,
  installRunner,
  must,
  optionIds,
  pick,
  put,
  runnerTurn,
  toCorpTurn,
  toHand,
} from "../../rulings/rulings-helpers.js";
import { openReactionWindow } from "../../../src/state/triggers/pendingAbilities.js";
import { hostCard } from "../../../src/state/hostingAndTrash/host.js";

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.147.29");
});

/** A Subliminal Messaging in Archives, facedown unless `faceup`. */
function subliminalInArchives(s: GameState, id: string, faceup = false) {
  put(s, "subliminal-messaging", id, "corp:archives").faceup = faceup;
  s.corp.discardPile.push(id);
}

/** The seat's view without the engine's own log, which hosts do not show. */
function seen(s: GameState, side: Side): string {
  const { log: _log, ...view } = getPublicView(s, side);
  return JSON.stringify(view);
}

function pendingSources(view: PublicView): string[] {
  return view.pendingAbilities.map((instance) => instance.sourceId).sort();
}

/**
 * The Corp's turn begins after a Runner turn with no run, with two facedown
 * Subliminal Messaging in Archives and a rezzed PAD Campaign: three
 * turn-begin abilities, and the Corp picks which to trigger first.
 */
function threePending(): GameState {
  const s = runnerTurn(fresh());
  subliminalInArchives(s, "sm-1");
  subliminalInArchives(s, "sm-2");
  installRoot(s, "pad-campaign", "pad-1", true);
  return toCorpTurn(s);
}

describe("pending abilities in each seat's view", () => {
  it("the Runner's view of a pending ability from a facedown card names neither the card nor its ability (CR 10.2.2a)", () => {
    const s = threePending();
    expect(s.pendingAbilities.map((p) => p.sourceId).sort()).toEqual([
      "pad-1",
      "sm-1",
      "sm-2",
    ]);
    const runner = getPublicView(s, "runner");
    expect(pendingSources(runner)).toEqual(["pad-1"]);
    const text = seen(s, "runner");
    expect(text).not.toMatch(/subliminal/i);
    expect(text).not.toContain("sm-1");
    expect(text).not.toContain("sm-2");
  });

  it("a reaction window in the Runner's view lists only the pending abilities the Runner may know of (CR 9.2.8a, 10.2.2a)", () => {
    const s = threePending();
    // A window holding all three instances (CR 9.2.8a).
    openReactionWindow(
      s,
      s.pendingAbilities.map((p) => p.id),
      null,
    );
    const corpWindow = getPublicView(s, "corp").reactionStack.at(-1);
    const runnerWindow = getPublicView(s, "runner").reactionStack.at(-1);
    expect(corpWindow?.pendingInstanceIds).toHaveLength(3);
    const pad = s.pendingAbilities.find((p) => p.sourceId === "pad-1")!;
    expect(runnerWindow?.pendingInstanceIds).toEqual([pad.id]);
  });

  it("the Corp sees every pending ability it controls, from facedown Archives cards too (CR 4.4.6c)", () => {
    const s = threePending();
    const corp = getPublicView(s, "corp");
    expect(pendingSources(corp)).toEqual(["pad-1", "sm-1", "sm-2"]);
    const offer = corp.pendingAbilities.find((p) => p.sourceId === "sm-1");
    expect(offer?.abilityKey).toBe("subliminal-messaging-return");
    expect(offer?.payload).toBeDefined();
  });

  it("the Runner does not see the Corp choose which pending ability to trigger when one comes from a facedown card (CR 9.2.8d, 10.2.2a)", () => {
    const s = threePending();
    expect(s.pendingChoice?.chooser).toBe("corp");
    expect(getPublicView(s, "corp").pendingChoice?.options).toHaveLength(3);
    expect(getPublicView(s, "runner").pendingChoice).toBeNull();
  });

  it("a pending ability from a faceup card in Archives is open to the Runner (CR 4.4.6c, 10.2.3a)", () => {
    let s = runnerTurn(fresh());
    subliminalInArchives(s, "sm-1", true);
    subliminalInArchives(s, "sm-2", true);
    s = toCorpTurn(s);
    const runner = getPublicView(s, "runner");
    expect(pendingSources(runner)).toEqual(["sm-1", "sm-2"]);
    expect(runner.pendingChoice?.options).toHaveLength(2);
  });

  it("a pending ability from a facedown installed card keeps its place in the Runner's view but not its ability or payload (CR 10.2.2a, 10.2.3a)", () => {
    const s = runnerTurn(fresh());
    installRoot(s, "pad-campaign", "pad-down", false);
    s.pendingAbilities.push({
      id: "pa-test",
      abilityKey: "on-turn-begin",
      sourceId: "pad-down",
      controller: "corp",
      mandatory: true,
      status: "pending",
      independentOfSource: false,
      windowId: null,
      payload: { kind: "stored_conditional", effectKey: "onTurnBegin" },
    });
    const runner = getPublicView(s, "runner").pendingAbilities;
    expect(runner).toHaveLength(1);
    expect(runner[0]?.sourceId).toBe("pad-down");
    expect(runner[0]?.abilityKey).toBe("hidden");
    expect(runner[0]?.payload).toBeUndefined();
    const corp = getPublicView(s, "corp").pendingAbilities;
    expect(corp[0]?.abilityKey).toBe("on-turn-begin");
  });

  it("a choice from a facedown installed card, such as paying its rez cost, stays open to the Runner (CR 10.2.3a)", () => {
    const s = runnerTurn(fresh());
    installRoot(s, "pad-campaign", "pad-down", false);
    s.pendingChoice = {
      sourceId: "pad-down",
      chooser: "corp",
      options: [
        {
          id: "pay",
          label: "Pay",
          effect: {
            op: "do",
            action: { kind: "gain_credits", side: "corp", amount: 0 },
          },
        },
      ],
    };
    expect(getPublicView(s, "runner").pendingChoice?.options).toHaveLength(1);
  });

  it("while the Runner accesses a facedown card from HQ, the Corp's choice from that card stays open to the Runner (CR 7.1.2, 10.2.3b)", () => {
    let s = runnerTurn(fresh());
    s.corp.hand = [];
    toHand(s, "corp", "snare", "sn-1");
    s.corp.credits = 10;
    s = must(s, { type: "basic_run", serverId: "hq" });
    s = drive(s, () => false);
    expect(s.pendingChoice?.sourceId).toBe("sn-1");
    expect(getPublicView(s, "runner").pendingChoice?.sourceId).toBe("sn-1");
    // A payload that names the accessed card stays too (CR 7.1.2).
    s.pendingAbilities.push({
      id: "pa-test",
      abilityKey: "on-corp-draw-card",
      sourceId: s.corp.identityId,
      controller: "corp",
      mandatory: false,
      status: "pending",
      independentOfSource: false,
      windowId: null,
      payload: { kind: "on_corp_draw_card", drawnCardId: "sn-1" },
    });
    const runner = getPublicView(s, "runner").pendingAbilities;
    expect(runner.at(-1)?.payload).toEqual({
      kind: "on_corp_draw_card",
      drawnCardId: "sn-1",
    });
  });

  it("a pending ability from a facedown card hosted on an installed card keeps its place in the Runner's view, like an installed one (CR 4.6.5, 10.2.2a)", () => {
    const s = runnerTurn(fresh());
    installRoot(s, "pad-campaign", "host-1", true);
    put(s, "pad-campaign", "hosted-1", "hosted:host-1").faceup = false;
    hostCard(s, "hosted-1", "host-1");
    s.pendingAbilities.push({
      id: "pa-test",
      abilityKey: "on-turn-begin",
      sourceId: "hosted-1",
      controller: "corp",
      mandatory: true,
      status: "pending",
      independentOfSource: false,
      windowId: null,
    });
    const runner = getPublicView(s, "runner").pendingAbilities;
    expect(runner.map((p) => p.abilityKey)).toEqual(["hidden"]);
  });

  it("the Runner's choice of a program to trash for memory, while installing one from the grip, stays open to the Corp (CR 10.2.3a, 10.2.3b)", () => {
    const s = runnerTurn(fresh());
    for (const [defId, id] of [
      ["corroder", "co-1"],
      ["gordian-blade", "gb-1"],
      ["femme-fatale", "ff-1"],
      ["mimic", "mi-1"],
    ] as const) {
      installRunner(s, defId, id);
    }
    toHand(s, "runner", "yog-0", "yog-1");
    const install = legalActions(s).find(
      (action) => "cardId" in action && action.cardId === "yog-1",
    );
    expect(install).toBeDefined();
    const t = must(s, install!);
    expect(t.pendingChoice?.chooser).toBe("runner");
    expect(getPublicView(t, "corp").pendingChoice?.options.length).toBe(
      t.pendingChoice?.options.length,
    );
  });

  it("the Corp's choice of a card to trash first, while installing from HQ, stays open to the Runner (CR 8.5.6, 10.2.3b)", () => {
    const s = corpTurn(fresh());
    installRoot(s, "pad-campaign", "pad-1", true);
    const server = s.cards["pad-1"]!.zone.split(":")[1]!;
    const ash = put(s, "ash-2x3zb9cy", "up-1", `server:${server}:root`);
    ash.rezzed = true;
    ash.faceup = true;
    s.servers[server as ServerId]!.root.push("up-1");
    toHand(s, "corp", "pad-campaign", "pad-2");
    const t = must(s, {
      type: "basic_install",
      cardId: "pad-2",
      trashFirst: true,
      destination: { kind: "remote_root", serverId: server },
    } as never);
    expect(t.pendingChoice?.chooser).toBe("corp");
    expect(getPublicView(t, "runner").pendingChoice).not.toBeNull();
  });

  it("a reaction window that holds only pending abilities the Runner may not know of is not in the Runner's view (CR 9.2.8a, 10.2.2a)", () => {
    const s = runnerTurn(fresh());
    subliminalInArchives(s, "sm-1");
    s.pendingAbilities.push({
      id: "pa-test",
      abilityKey: "subliminal-messaging-return",
      sourceId: "sm-1",
      controller: "corp",
      mandatory: true,
      status: "pending",
      independentOfSource: true,
      windowId: null,
    });
    openReactionWindow(s, ["pa-test"], null);
    expect(getPublicView(s, "runner").reactionStack).toEqual([]);
    expect(getPublicView(s, "corp").reactionStack).toHaveLength(1);
  });

  it("a payload that names a facedown installed card keeps it: where that card is installed is open (CR 10.2.3a)", () => {
    const s = runnerTurn(fresh());
    installRoot(s, "pad-campaign", "pad-down", false);
    s.pendingAbilities.push({
      id: "pa-test",
      abilityKey: "test",
      sourceId: s.runner.identityId,
      controller: "runner",
      mandatory: false,
      status: "pending",
      independentOfSource: false,
      windowId: null,
      payload: { kind: "blackguard_force_rez", targetId: "pad-down" },
    });
    expect(getPublicView(s, "runner").pendingAbilities[0]?.payload).toEqual({
      kind: "blackguard_force_rez",
      targetId: "pad-down",
    });
  });

  it("a pending ability's payload that names a card the Runner may not see is left out of the Runner's view, not the Corp's (CR 10.2.2a)", () => {
    const s = runnerTurn(fresh());
    toHand(s, "corp", "hedge-fund", "hq-1");
    const instance: PendingAbilityInstance = {
      id: "pa-test",
      abilityKey: "on-corp-draw-card",
      sourceId: s.corp.identityId,
      controller: "corp",
      mandatory: false,
      status: "pending",
      independentOfSource: false,
      windowId: null,
      payload: { kind: "on_corp_draw_card", drawnCardId: "hq-1" },
    };
    s.pendingAbilities.push(instance);
    const runner = getPublicView(s, "runner").pendingAbilities;
    expect(runner).toHaveLength(1);
    expect(runner[0]?.abilityKey).toBe("on-corp-draw-card");
    expect(runner[0]?.payload).toBeUndefined();
    const corp = getPublicView(s, "corp").pendingAbilities;
    expect(corp[0]?.payload).toEqual(instance.payload);
  });
});

describe("held-over effects in each seat's view", () => {
  it("the rest of an effect from a facedown card is not in the Runner's view; the Corp sees it (CR 10.2.2a)", () => {
    const s = runnerTurn(fresh());
    subliminalInArchives(s, "sm-1");
    s.pendingEffectContinuation = {
      sourceId: "sm-1",
      effects: [
        {
          op: "do",
          action: { kind: "move_archives_to_hq", cardId: "sm-1", reveal: true },
        },
      ],
    };
    expect(getPublicView(s, "runner").pendingEffectContinuation).toBeNull();
    expect(seen(s, "runner")).not.toContain("sm-1");
    expect(getPublicView(s, "corp").pendingEffectContinuation).toEqual(
      s.pendingEffectContinuation,
    );
  });

  it("the rest of an effect from an open card keeps its source but not the hidden cards it names (CR 10.2.2a, 10.2.3a)", () => {
    const s = runnerTurn(fresh());
    toHand(s, "corp", "hedge-fund", "hq-1");
    subliminalInArchives(s, "sm-1");
    const idOnly = {
      sourceId: s.corp.identityId,
      effects: [
        {
          op: "do" as const,
          action: {
            kind: "gain_credits" as const,
            side: "corp" as const,
            amount: 1,
          },
        },
      ],
    };
    s.pendingEffectContinuation = {
      sourceId: s.corp.identityId,
      effects: [
        {
          op: "do",
          action: { kind: "trash_card", cardId: "hq-1" },
        } as never,
      ],
      followedBy: {
        sourceId: "sm-1",
        effects: [],
        followedBy: idOnly,
      },
    };
    const runner = getPublicView(s, "runner").pendingEffectContinuation;
    expect(runner?.sourceId).toBe(s.corp.identityId);
    expect(runner?.effects).toEqual([]);
    // The facedown card's segment is left out; the open one after it stays.
    expect(runner?.followedBy).toEqual(idOnly);
    const corp = getPublicView(s, "corp").pendingEffectContinuation;
    expect(corp).toEqual(s.pendingEffectContinuation);
  });
});

describe("held-over effects, the controller's own", () => {
  it("the Corp sees its own held-over effect from a card it may not see itself, such as one taken from R&D (CR 1.14.5)", () => {
    const s = runnerTurn(fresh());
    put(s, "hedge-fund", "rd-1", "corp:rd");
    s.corp.deck.unshift("rd-1");
    s.pendingEffectContinuation = {
      sourceId: "rd-1",
      effects: [
        { op: "do", action: { kind: "gain_credits", side: "corp", amount: 1 } },
      ],
    };
    expect(getPublicView(s, "corp").pendingEffectContinuation?.sourceId).toBe(
      "rd-1",
    );
    expect(getPublicView(s, "runner").pendingEffectContinuation).toBeNull();
  });
});

describe("Subliminal Messaging's turn-begin offer", () => {
  it("a facedown copy's offer is private to the Corp: the Runner's view does not show that the Corp is asked (CR 4.4.6c, 10.2.2b)", () => {
    let s = runnerTurn(fresh());
    subliminalInArchives(s, "sm-1");
    s = toCorpTurn(s);
    expect(s.pendingChoice?.sourceId).toBe("sm-1");
    expect(getPublicView(s, "runner").pendingChoice).toBeNull();
    expect(seen(s, "runner")).not.toMatch(/sm-1|subliminal/i);
    expect(
      getPublicView(s, "corp").pendingChoice?.options.map((o) => o.id),
    ).toEqual(["add", "decline"]);
  });

  it("when the Corp reveals a facedown copy, the Runner sees the reveal (CR 1.21.3)", () => {
    let s = runnerTurn(fresh());
    subliminalInArchives(s, "sm-1");
    s = toCorpTurn(s);
    s = pick(s, "add");
    expect(s.corp.hand).toContain("sm-1");
    const reveals = getPublicView(s, "runner").reveals;
    expect(reveals.at(-1)?.cards.map((card) => card.title)).toEqual([
      "Subliminal Messaging",
    ]);
  });

  it("a faceup copy's offer is open to the Runner (CR 4.4.6c, 10.2.3a)", () => {
    let s = runnerTurn(fresh());
    subliminalInArchives(s, "sm-1", true);
    s = toCorpTurn(s);
    expect(getPublicView(s, "runner").pendingChoice?.sourceId).toBe("sm-1");
  });
});

describe("Record Reconstructor", () => {
  /** A successful Archives run with one faceup and one facedown card there. */
  function runArchives(): GameState {
    let s = runnerTurn(fresh());
    installRunner(s, "record-reconstructor", "rr-1");
    put(s, "hedge-fund", "arch-up", "corp:archives").faceup = true;
    put(s, "ice-wall", "arch-down", "corp:archives").faceup = false;
    s.corp.discardPile.push("arch-up", "arch-down");
    s = must(s, { type: "basic_run", serverId: "archives" });
    return drive(s, () => false);
  }

  it("instead of breaching Archives, the Runner may add a faceup Archives card to the top of R&D, and only faceup cards are offered (CR 1.14.5, 4.4.6c)", () => {
    const s = runArchives();
    expect(s.pendingChoice?.sourceId).toBe("rr-1");
    expect(s.pendingChoice?.chooser).toBe("runner");
    expect(optionIds(s)).toEqual(["breach", "rd-top:arch-up"]);
  });

  it("the Runner's view of Record Reconstructor's choice names no facedown Archives card (CR 4.4.6c, 10.2.2a)", () => {
    const s = runArchives();
    const text = seen(s, "runner");
    expect(text).not.toContain("arch-down");
    expect(text).not.toMatch(/Ice Wall/);
    expect(getPublicView(s, "corp").pendingChoice?.options).toHaveLength(2);
  });

  it("adding the card skips the breach and puts it facedown on top of R&D (CR 9.9.8)", () => {
    let s = runArchives();
    s = pick(s, "rd-top:arch-up");
    expect(s.corp.deck[0]).toBe("arch-up");
    expect(s.cards["arch-up"]?.faceup).toBe(false);
    expect(s.corp.discardPile).toEqual(["arch-down"]);
  });

  it("declining breaches Archives as usual (CR 6.9.5b)", () => {
    let s = runArchives();
    s = pick(s, "breach");
    expect(s.run?.skipBreach ?? false).toBe(false);
    s = drive(s, (x) => !x.run);
    // Breaching Archives accesses every card there and turns it faceup.
    expect(s.cards["arch-down"]?.faceup).toBe(true);
    expect(s.corp.deck[0]).not.toBe("arch-up");
  });

  it("with no faceup card in Archives there is nothing to choose, and the Runner breaches (CR 6.9.5b)", () => {
    let s = runnerTurn(fresh());
    installRunner(s, "record-reconstructor", "rr-1");
    put(s, "ice-wall", "arch-down", "corp:archives").faceup = false;
    s.corp.discardPile.push("arch-down");
    s = must(s, { type: "basic_run", serverId: "archives" });
    s = drive(s, (x) => !x.run);
    expect(s.pendingChoice).toBeNull();
    expect(s.cards["arch-down"]?.faceup).toBe(true);
  });
});
