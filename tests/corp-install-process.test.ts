/**
 * The Corp's install process when an ability installs the card.
 * CR 8.5.16b: the Corp declares the destination; the engine does not pick
 * a server for them (CR 1.15.2).
 * CR 8.5.6a / 8.5.6b: the Corp may trash cards already in the destination
 * first, and trashed ice is not counted for the install cost.
 * CR 8.5.7: a card trashed that way keeps its facing in Archives.
 * CR 8.5.13d / 1.16.4c: "install and rez" reveals a card that is not
 * rezzed; the Corp need not pay an additional cost to rez.
 * CR 8.2.5: a forfeited agenda is removed from the game.
 * CR 1.21.3 / 1.21.3a: a revealed card is shown to all players and is not
 * turned faceup.
 * CR 6.2.6: the Runner's position is an element of the path, not an index.
 * Card text decides whether the install cost is paid (CR 1.2.1).
 */
import { beforeAll, describe, expect, it } from "vitest";
import {
  applyAction,
  assertCardsPinnedTag,
  assertPinnedTag,
  cardsDataPresent,
  crDataPresent,
  createInitialState,
  evalEffect,
  fx,
  getCardDef,
  getPublicView,
  instantiateCard,
  playEffectFromCard,
} from "../src/index.js";
import type { Action, Effect, GameState } from "../src/index.js";

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.147.20");
});

function must(state: GameState, action: Action): GameState {
  const result = applyAction(state, action);
  if (!result.ok) throw new Error(`${state.timingKey}: ${result.error}`);
  return result.state;
}

function put(s: GameState, defId: string, id: string, zone: string) {
  const card = instantiateCard(defId, id, zone);
  s.cards[id] = card;
  return card;
}

function hq(s: GameState, cards: Array<[string, string]>): void {
  s.corp.hand = [];
  for (const [defId, id] of cards) {
    put(s, defId, id, "corp:hq");
    s.corp.hand.push(id);
  }
}

function archives(s: GameState, cards: Array<[string, string, boolean]>): void {
  s.corp.discardPile = [];
  for (const [defId, id, faceup] of cards) {
    put(s, defId, id, "corp:archives").faceup = faceup;
    s.corp.discardPile.push(id);
  }
}

function ice(s: GameState, defId: string, id: string, serverId: string, rezzed: boolean) {
  if (!s.servers[serverId]) {
    s.servers[serverId] = { id: serverId, kind: "remote", ice: [], root: [] };
  }
  const card = put(s, defId, id, `server:${serverId}:ice`);
  card.rezzed = rezzed;
  card.faceup = rezzed;
  s.servers[serverId].ice.push(id);
  s.corp.installed.push(id);
  return card;
}

function rooted(s: GameState, defId: string, id: string, serverId: string, rezzed: boolean) {
  if (!s.servers[serverId]) {
    s.servers[serverId] = { id: serverId, kind: "remote", ice: [], root: [] };
    s.nextRemoteNumber = Math.max(s.nextRemoteNumber, 2);
  }
  const card = put(s, defId, id, `server:${serverId}:root`);
  card.rezzed = rezzed;
  card.faceup = rezzed;
  s.servers[serverId].root.push(id);
  s.corp.installed.push(id);
  return card;
}

function run(s: GameState, sourceId: string, kind: string, extra: object = {}): void {
  const r = evalEffect({ state: s, sourceId }, fx.do({ kind, ...extra } as never));
  if (!r.ok) throw new Error(`${kind}: ${r.error}`);
}

function corpTurn(): GameState {
  const s = createInitialState();
  s.activeSide = "corp";
  s.timingKey = "corp.takeAction";
  s.corp.clicks = 3;
  s.corp.credits = 5;
  s.priorityStack = [];
  s.corp.hand = [];
  s.corp.discardPile = [];
  return s;
}

const logged = (s: GameState): string => s.log.join("\n");
const choose = (s: GameState, optionId: string): GameState =>
  must(s, { type: "choose_option", optionId });
const pick = (s: GameState, cardId: string): GameState => choose(s, `choose-card:${cardId}`);
const optionIds = (s: GameState): string[] =>
  (s.pendingChoice?.options ?? []).map((o) => o.id);

describe("an ability installs a Corp card: the Corp says where (CR 8.5.16b)", () => {
  it("pays the install cost unless the text ignores it (CR 8.5.6b)", () => {
    const s = corpTurn();
    hq(s, [["enigma", "new-ice"]]);
    ice(s, "ice-wall", "hq-ice", "hq", true);
    run(s, s.corp.identityId, "install_from_hq_or_archives");
    // "You may": the Corp can stop without installing.
    expect(optionIds(s)).toEqual(["choose-card:new-ice", "choose-cards-done"]);
    const chosen = pick(s, "new-ice");
    expect(chosen.pendingChoice?.chooser).toBe("corp");
    const paid = choose(chosen, "install-dest:hq");
    expect(paid.servers.hq.ice).toEqual(["new-ice", "hq-ice"]);
    expect(paid.corp.credits).toBe(4);
    expect(paid.cards["new-ice"].rezzed).toBe(false);

    const free = corpTurn();
    hq(free, [["enigma", "new-ice"]]);
    ice(free, "ice-wall", "hq-ice", "hq", true);
    run(free, free.corp.identityId, "install_from_hq_or_archives", {
      ignoreInstallCost: true,
    });
    const ignored = choose(pick(free, "new-ice"), "install-dest:hq");
    expect(ignored.servers.hq.ice).toEqual(["new-ice", "hq-ice"]);
    expect(ignored.corp.credits).toBe(5);
  });

  it("does not offer a destination the Corp cannot pay for", () => {
    const s = corpTurn();
    s.corp.credits = 0;
    hq(s, [["enigma", "new-ice"]]);
    ice(s, "ice-wall", "hq-ice", "hq", true);
    run(s, s.corp.identityId, "install_from_hq_or_archives");
    const ids = optionIds(pick(s, "new-ice"));
    // Protecting HQ costs 1¢ unless the ice there is trashed first.
    expect(ids).not.toContain("install-dest:hq");
    expect(ids).toContain("install-dest-trash:hq");
    expect(ids).toContain("install-dest:rd");
    expect(ids).toContain("install-dest:__new_remote__");
  });

  it("lets the Corp trash ice in the destination first (CR 8.5.6b, 8.5.7)", () => {
    const s = corpTurn();
    s.corp.credits = 1;
    hq(s, [["enigma", "new-ice"]]);
    ice(s, "ice-wall", "outer", "hq", false);
    ice(s, "ice-wall", "inner", "hq", true);
    run(s, s.corp.identityId, "install_from_hq_or_archives");
    let t = choose(pick(s, "new-ice"), "install-dest-trash:hq");
    expect(optionIds(t)).toEqual([
      "choose-card:outer",
      "choose-card:inner",
      "choose-cards-done",
    ]);
    t = pick(t, "outer");
    t = choose(t, "choose-cards-done");
    // One ice is left, so the new ice costs 1¢.
    expect(t.servers.hq.ice).toEqual(["new-ice", "inner"]);
    expect(t.corp.credits).toBe(0);
    // The unrezzed ice is facedown in Archives and its name is not logged.
    expect(t.cards["outer"].zone).toBe("corp:archives");
    expect(t.cards["outer"].faceup).toBe(false);
    expect(logged(t)).toContain("trashes a facedown card from hq before installing");
  });

  it("an instruction without 'may' has no way to decline (Interns)", () => {
    const s = corpTurn();
    hq(s, [["enigma", "new-ice"]]);
    archives(s, [["pad-campaign", "old-asset", true]]);
    run(s, s.corp.identityId, "install_from_hq_or_archives", {
      required: true,
      ignoreInstallCost: true,
    });
    expect(optionIds(s)).toEqual(["choose-card:new-ice", "choose-card:old-asset"]);
    // An asset with no remote server to go to opens a new one.
    const t = pick(s, "old-asset");
    expect(t.cards["old-asset"].zone).toMatch(/^server:remote-\d+:root$/);
    expect(t.corp.discardPile).toEqual([]);
    // A card installed from Archives is installed facedown (CR 8.5.3).
    expect(t.cards["old-asset"].faceup).toBe(false);
  });

  it("installs an asset over the one in a remote, which is trashed (CR 8.5.6a)", () => {
    const s = corpTurn();
    hq(s, [["pad-campaign", "new-asset"]]);
    rooted(s, "pad-campaign", "old-asset", "remote-1", true);
    rooted(s, "ash-2x3zb9cy", "upgrade", "remote-1", false);
    run(s, s.corp.identityId, "install_from_hq_or_archives");
    const dest = pick(s, "new-asset");
    // The upgrade may be trashed too, so both forms are on offer.
    expect(optionIds(dest)).toEqual([
      "install-dest:__new_remote__",
      "install-dest:remote-1",
      "install-dest-trash:remote-1",
    ]);
    const t = choose(dest, "install-dest:remote-1");
    expect(t.servers["remote-1"]?.root).toEqual(["upgrade", "new-asset"]);
    expect(t.cards["old-asset"].zone).toBe("corp:archives");
    expect(t.cards["old-asset"].faceup).toBe(true);
    expect(logged(t)).toContain("8.5.6a");
  });

  it("does not put an asset or agenda in a central root (CR 4.6.6e)", () => {
    const s = corpTurn();
    hq(s, [["hostile-takeover", "agenda"]]);
    run(s, s.corp.identityId, "install_from_hq_or_archives");
    const t = pick(s, "agenda");
    // Only a new remote can take it, so there is nothing to ask.
    expect(t.cards["agenda"].zone).toMatch(/^server:remote-\d+:root$/);
    expect(t.servers.hq.root).toEqual([]);
  });

  it("Hybrid Release offers only the facedown cards in Archives", () => {
    const s = corpTurn();
    archives(s, [
      ["pad-campaign", "up", true],
      ["ice-wall", "down", false],
      ["hedge-fund", "operation", false],
    ]);
    run(s, s.corp.identityId, "may_install_facedown_from_archives");
    expect(optionIds(s)).toEqual(["choose-card:down", "choose-cards-done"]);
    const none = choose(s, "choose-cards-done");
    expect(none.corp.discardPile).toEqual(["up", "down", "operation"]);
  });
});

describe("an ability install during a run (CR 6.2.6)", () => {
  function encounter(): GameState {
    const s = corpTurn();
    s.activeSide = "runner";
    hq(s, [["enigma", "new-ice"]]);
    ice(s, "ice-wall", "outer", "hq", true);
    ice(s, "drafter", "drafter", "hq", true);
    ice(s, "ice-wall", "inner", "hq", false);
    s.timingKey = "run.encounterPaw";
    s.run = {
      attackedServerId: "hq",
      phase: "encounter",
      position: 1,
      successful: null,
      accessedCardIds: [],
      accessCandidates: [],
      randomAccessLimit: null,
      encounter: null,
      endedTheRun: false,
      cannotJackOut: false,
      accessingCardId: null,
    };
    return s;
  }

  it("new ice goes outermost and the Runner keeps their ice (CR 6.2.6a)", () => {
    const s = encounter();
    run(s, "drafter", "install_from_hq_or_archives", { ignoreInstallCost: true });
    const t = choose(pick(s, "new-ice"), "install-dest:hq");
    expect(t.servers.hq.ice).toEqual(["new-ice", "outer", "drafter", "inner"]);
    expect(t.servers.hq.ice[t.run!.position!]).toBe("drafter");
    expect(logged(t)).toContain("6.2.6a");
  });

  it("other ice can be trashed first; the Runner's position follows their ice", () => {
    const s = encounter();
    run(s, "drafter", "install_from_hq_or_archives", { ignoreInstallCost: true });
    let t = choose(pick(s, "new-ice"), "install-dest-trash:hq");
    // The ice being encountered is not on offer (CR 8.5.10 is not modelled).
    expect(optionIds(t)).toEqual([
      "choose-card:outer",
      "choose-card:inner",
      "choose-cards-done",
    ]);
    t = pick(t, "outer");
    t = pick(t, "inner");
    expect(t.servers.hq.ice).toEqual(["new-ice", "drafter"]);
    expect(t.run?.position).toBe(1);
    expect(t.servers.hq.ice[t.run!.position!]).toBe("drafter");
    expect(t.cards["outer"].zone).toBe("corp:archives");
    expect(t.cards["inner"].zone).toBe("corp:archives");
  });
});

describe("install and rez (CR 8.5.15, 8.5.13d)", () => {
  function trustOperation(scoredAgenda: boolean): GameState {
    const s = corpTurn();
    put(s, "trust-operation", "to-1", "corp:play");
    archives(s, [["archer", "archer", true]]);
    s.corp.scoreArea = [];
    if (scoredAgenda) {
      put(s, "hostile-takeover", "scored", "corp:score").faceup = true;
      s.corp.scoreArea = ["scored"];
    }
    run(s, "to-1", "install_and_rez_from_archives_free");
    return choose(s, "install-dest:hq");
  }

  it("the Corp may pay Archer's additional cost; the agenda leaves the game (CR 8.2.5)", () => {
    const s = trustOperation(true);
    expect(s.pendingChoice?.chooser).toBe("corp");
    expect(optionIds(s)).toEqual(["install-rez-forfeit:scored", "install-rez-decline"]);
    const t = choose(s, "install-rez-forfeit:scored");
    expect(t.cards["archer"].rezzed).toBe(true);
    expect(t.corp.scoreArea).toEqual([]);
    expect(t.removedFromGame).toContain("scored");
    expect(t.cards["scored"].zone).toBe("removed-from-game");
    expect(t.corp.discardPile).not.toContain("scored");
    // "Ignoring all costs": no credits are spent.
    expect(t.corp.credits).toBe(5);
  });

  it("the Corp may decline it; Archer is revealed and stays facedown (CR 1.16.4c, 1.21.3a)", () => {
    const t = choose(trustOperation(true), "install-rez-decline");
    expect(t.cards["archer"].zone).toBe("server:hq:ice");
    expect(t.cards["archer"].rezzed).toBe(false);
    expect(t.cards["archer"].faceup).toBe(false);
    expect(t.corp.scoreArea).toEqual(["scored"]);
    expect(t.reveals?.at(-1)).toMatchObject({
      by: "corp",
      sourceTitle: "Trust Operation",
      cards: [{ defId: "archer", title: "Archer" }],
    });
  });

  it("with no agenda to forfeit the card is revealed without asking", () => {
    const t = trustOperation(false);
    expect(t.pendingChoice ?? null).toBeNull();
    expect(t.cards["archer"].rezzed).toBe(false);
    expect(t.cards["archer"].faceup).toBe(false);
    expect(logged(t)).toContain("reveal Archer (CR 8.5.13d, 1.21.3)");
  });

  it("Ob Superheavy Logistics: the Corp may fail to find (CR 8.7.2e)", () => {
    const s = corpTurn();
    s.turn.lastTrashedRezzedPrintedRezCost = 2;
    const wall = put(s, "ice-wall", "wall", "corp:rd");
    s.corp.deck = ["wall", ...s.corp.deck];
    run(s, s.corp.identityId, "search_rd_install_rez_by_printed_rez_cost", {
      delta: -1 * (2 - (wall.rezCost ?? 0)),
    });
    expect(optionIds(s)).toContain("choose-card:wall");
    const size = s.corp.deck.length;
    const t = choose(s, "choose-cards-done");
    expect(t.corp.deck).toHaveLength(size);
    expect(t.cards["wall"].zone).toBe("corp:rd");
    expect(logged(t)).toContain("8.7.2e");
  });
});

describe("the reveal record (CR 1.21.3)", () => {
  it("shows both players the title, carries no card id, and leaves the card facedown", () => {
    const s = corpTurn();
    put(s, "trust-operation", "to-1", "corp:play");
    archives(s, [["hostile-takeover", "agenda", false]]);
    run(s, "to-1", "install_and_rez_from_archives_free");
    expect(s.cards["agenda"].zone).toMatch(/^server:remote-\d+:root$/);
    expect(s.cards["agenda"].faceup).toBe(false);
    for (const side of ["corp", "runner"] as const) {
      const view = getPublicView(s, side);
      expect(view.reveals).toHaveLength(1);
      expect(view.reveals[0]).toEqual({
        seq: 1,
        by: "corp",
        sourceTitle: "Trust Operation",
        cards: [{ defId: "hostile-takeover", title: "Hostile Takeover" }],
      });
      expect(JSON.stringify(view.reveals)).not.toContain('"agenda"');
    }
  });
});

describe("Keyhole (card text: no 'may')", () => {
  it("looks at the top 3 of R&D without asking the Runner first", () => {
    const s = createInitialState();
    put(s, "keyhole", "kh-1", "runner:installed").faceup = true;
    s.runner.installed = ["kh-1"];
    s.corp.deck = [];
    for (const id of ["top-1", "top-2", "top-3", "top-4"]) {
      put(s, "hedge-fund", id, "corp:rd");
      s.corp.deck.push(id);
    }
    s.run = {
      attackedServerId: "rd",
      phase: "success",
      position: null,
      successful: true,
      accessedCardIds: [],
      accessCandidates: [],
      randomAccessLimit: null,
      encounter: null,
      endedTheRun: false,
      cannotJackOut: false,
      accessingCardId: null,
    };
    run(s, "kh-1", "may_breach_instead_keyhole");
    expect(s.run.skipBreach).toBe(true);
    expect(s.pendingChoice?.chooser).toBe("runner");
    expect(optionIds(s)).toEqual([
      "keyhole-trash:top-1",
      "keyhole-trash:top-2",
      "keyhole-trash:top-3",
    ]);
  });
});

describe("card definitions say whether the install cost is paid (CR 1.2.1)", () => {
  function resolve(s: GameState, sourceId: string, effect: Effect | undefined): void {
    if (!effect) throw new Error("The card has no such ability");
    const r = evalEffect({ state: s, sourceId }, effect);
    if (!r.ok) throw new Error(r.error);
  }

  /** HQ holds 1 ice; HQ is already protected by 1 ice, so protecting it costs 1¢. */
  function oneIceOnHq(): GameState {
    const s = corpTurn();
    hq(s, [["enigma", "new-ice"]]);
    ice(s, "ice-wall", "hq-ice", "hq", true);
    return s;
  }

  it("Interns: the install is required and ignores the install cost", () => {
    const s = oneIceOnHq();
    put(s, "interns", "interns-1", "corp:play");
    resolve(s, "interns-1", playEffectFromCard(getCardDef("interns")));
    // No "may": with 1 card that can be installed there is nothing to
    // choose but where it goes.
    expect(optionIds(s)).not.toContain("choose-cards-done");
    expect(optionIds(s)).toContain("install-dest:hq");
    const t = choose(s, "install-dest:hq");
    expect(t.servers.hq.ice).toEqual(["new-ice", "hq-ice"]);
    expect(t.corp.credits).toBe(5);
  });

  it("Drafter: 'ignoring all costs'", () => {
    const s = oneIceOnHq();
    const drafter = ice(s, "drafter", "drafter", "rd", true);
    resolve(s, "drafter", drafter.subroutines?.[1]?.effect);
    let t = choose(s, "install");
    t = choose(pick(t, "new-ice"), "install-dest:hq");
    expect(t.servers.hq.ice).toEqual(["new-ice", "hq-ice"]);
    expect(t.corp.credits).toBe(5);
  });

  it("Architect's second subroutine does not ignore the install cost", () => {
    const s = oneIceOnHq();
    const architect = ice(s, "architect", "architect", "rd", true);
    resolve(s, "architect", architect.subroutines?.[1]?.effect);
    const t = choose(pick(s, "new-ice"), "install-dest:hq");
    expect(t.servers.hq.ice).toEqual(["new-ice", "hq-ice"]);
    expect(t.corp.credits).toBe(4);
  });
});

describe("card definitions for searches and modes (CR 1.2.1)", () => {
  function deck(s: GameState, n: number): void {
    s.corp.deck = [];
    for (let i = 0; i < n; i += 1) {
      put(s, i === 0 ? "ice-wall" : "hedge-fund", `rd-${i}`, "corp:rd");
      s.corp.deck.push(`rd-${i}`);
    }
  }

  it("Graft: up to 3 cards, and they are revealed (CR 1.21.3)", () => {
    const s = corpTurn();
    deck(s, 5);
    put(s, "graft", "graft-1", "corp:score").faceup = true;
    s.corp.scoreArea = ["graft-1"];
    const r = evalEffect({ state: s, sourceId: "graft-1" }, getCardDef("graft").onScore!);
    if (!r.ok) throw new Error(r.error);
    let t = choose(s, "accept");
    t = pick(t, "rd-0");
    // "Up to 3": the Corp can stop after 1.
    t = choose(t, "choose-cards-done");
    expect(t.corp.hand).toEqual(["rd-0"]);
    expect(t.corp.deck).toHaveLength(4);
    expect(t.cards["rd-0"].faceup).toBe(false);
    expect(t.reveals?.at(-1)).toMatchObject({
      by: "corp",
      sourceTitle: "Graft",
      cards: [{ defId: "ice-wall", title: "Ice Wall" }],
    });
  });

  it("Project Atlas: the card found is revealed", () => {
    const s = corpTurn();
    deck(s, 3);
    put(s, "project-atlas", "atlas-1", "corp:score").faceup = true;
    s.corp.scoreArea = ["atlas-1"];
    const search = getCardDef("project-atlas").paidAbilities?.find(
      (a) => a.id === "atlas-search",
    );
    const r = evalEffect({ state: s, sourceId: "atlas-1" }, search!.effect);
    if (!r.ok) throw new Error(r.error);
    // Exactly 1 card with no criterion: there is no way to find nothing.
    expect(optionIds(s)).not.toContain("choose-cards-done");
    const t = pick(s, "rd-1");
    expect(t.corp.hand).toEqual(["rd-1"]);
    expect(t.reveals?.at(-1)?.cards).toEqual([
      { defId: "hedge-fund", title: "Hedge Fund" },
    ]);
  });

  it("Key Performance Indicators: drawing and shuffling a card back is one mode of four", () => {
    const effect = playEffectFromCard(getCardDef("key-performance-indicators"));
    const action = (effect as { action: { n: number; options: Array<{ id: string }> } }).action;
    expect(action.n).toBe(2);
    expect(action.options.map((o) => o.id)).toEqual([
      "draw-shuffle",
      "install-ice",
      "advance",
      "credits",
    ]);
  });

  it("Keyhole's card definition has no 'may'", () => {
    expect(JSON.stringify(getCardDef("keyhole"))).not.toContain("may_breach_instead_keyhole");
    expect(JSON.stringify(getCardDef("keyhole"))).toContain("breach_instead_keyhole");
  });
});
