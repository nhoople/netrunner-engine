/**
 * Comprehensive Rules examples from chapter 7.
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
  enterStep,
  evalEffect,
  instantiateCard,
} from "../src/index.js";
import { beginBreachAccess, refreshRdDeckCandidate } from "../src/state/access.js";
import { applyRunAccessRestrictions } from "../src/state/accessFilter.js";
import { trashCorpCardToArchives } from "../src/effects/corpTrash.js";
import type { Action, GameState, ServerId } from "../src/state/types.js";

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.147.12");
});

function must(state: GameState, action: Action): GameState {
  const result = applyAction(state, action);
  if (!result.ok) throw new Error(`${result.error} ${JSON.stringify(result.cites)}`);
  return result.state;
}

function breach(state: GameState, server: ServerId): void {
  state.run = {
    attackedServerId: server,
    phase: "breach",
    position: null,
    successful: true,
    accessedCardIds: [],
    accessCandidates: [],
    randomAccessLimit: null,
    encounter: null,
    endedTheRun: false,
    cannotJackOut: false,
    strengthBoosts: {},
    encounterStrengthBoosts: {},
    iceStrengthBoosts: {},
    accessingCardId: null,
    breached: true,
  };
  enterStep(state, "breach.awaitAccess");
}

describe("CR examples, chapter 7", () => {
  it("tells the Runner whether Poétrï installed a card they already accessed (CR 7.3.1a.ex1)", () => {
    const s = createInitialState();
    const scatter = instantiateCard("hedge-fund", "scatter-1", "corp:hq");
    scatter.title = "Scatter Field";
    const palisade = instantiateCard("ice-wall", "palisade-1", "corp:hq");
    palisade.title = "Palisade";
    const unknown = instantiateCard("hedge-fund", "unknown-1", "corp:hq");
    unknown.title = "Offworld Office";
    s.cards["scatter-1"] = scatter;
    s.cards["palisade-1"] = palisade;
    s.cards["unknown-1"] = unknown;
    s.corp.hand = ["scatter-1", "palisade-1", "unknown-1"];
    s.corp.credits = 10;
    breach(s, "hq");
    s.run!.accessedCardIds = ["scatter-1", "palisade-1"];
    const known = evalEffect(
      { state: s, sourceId: s.corp.identityId },
      { op: "do", action: { kind: "install_hq_card_paying_costs", cardId: "palisade-1" } },
    );
    expect(known.ok).toBe(true);
    expect(s.log.join("\n")).toContain("The Runner knows this is Palisade");
    const hidden = evalEffect(
      { state: s, sourceId: s.corp.identityId },
      { op: "do", action: { kind: "install_hq_card_paying_costs", cardId: "unknown-1" } },
    );
    expect(hidden.ok).toBe(true);
    expect(s.log.join("\n")).toContain("Install an unknown card from HQ");
    expect(s.log.join("\n")).toContain("7.3.1a");
  });

  it("does not count an Archives Interface replacement toward Zahya's accesses (CR 7.3.6.ex1)", () => {
    let s = createInitialState();
    const face = instantiateCard("archives-interface", "ai-1", "runner:installed");
    const first = instantiateCard("hedge-fund", "arch-1", "corp:archives");
    first.title = "Replacement Target";
    const second = instantiateCard("hedge-fund", "arch-2", "corp:archives");
    second.title = "Real Access";
    s.cards["ai-1"] = face;
    s.cards["arch-1"] = first;
    s.cards["arch-2"] = second;
    s.runner.installed = ["ai-1"];
    s.corp.discardPile = ["arch-1", "arch-2"];
    expect(face.archivesAccessMayRfgInstead).toBeTruthy();
    breach(s, "archives");
    beginBreachAccess(s);
    s = must(s, { type: "access_card", cardId: "arch-1" });
    expect(s.pendingChoice?.options.map((option) => option.id) ?? s.log.slice(-8)).toEqual([
      "archives-rfg:arch-1",
      "archives-access:arch-1",
    ]);
    s = must(s, { type: "choose_option", optionId: "archives-rfg:arch-1" });
    expect(s.run?.accessedCardIds).not.toContain("arch-1");
    expect(s.removedFromGame).toContain("arch-1");
    s = must(s, { type: "access_card", cardId: "arch-2" });
    const text = s.log.join("\n");
    expect(text).toContain(`Accessed ${second.title}`);
    expect(text).not.toContain(`Accessed ${first.title}`);
  });

  it("lets Immolation Script replace the first Archives ice, then blocks a later replacement after a real access (CR 7.3.6.ex2)", () => {
    let s = createInitialState();
    const ice = instantiateCard("ice-wall", "arch-ice", "corp:archives");
    const copy = instantiateCard("ice-wall", "rezzed-ice", "server:hq:ice");
    copy.rezzed = true;
    copy.faceup = true;
    const other = instantiateCard("hedge-fund", "arch-op", "corp:archives");
    s.cards["arch-ice"] = ice;
    s.cards["rezzed-ice"] = copy;
    s.cards["arch-op"] = other;
    s.servers.hq.ice = ["rezzed-ice"];
    s.corp.discardPile = ["arch-ice", "arch-op"];
    breach(s, "archives");
    s.run!.immolationScriptAccessReplace = true;
    beginBreachAccess(s);
    s = must(s, { type: "access_card", cardId: "arch-op" });
    expect(s.run?.accessedCardIds).toContain("arch-op");
    evalEffect(
      { state: s, sourceId: "rezzed-ice" },
      { op: "do", action: { kind: "cap_run_access_remaining", max: 1 } },
    );
    expect(s.run?.randomAccessLimit).toBe(0);
  });

  it("finishes the current breach before Raymond Flint's HQ breach begins (CR 7.3.8.ex1)", () => {
    const s = createInitialState();
    const agenda = instantiateCard("clone-retirement", "clone-1", "corp:hq");
    const flint = instantiateCard("raymond-flint", "flint-1", "runner:installed");
    s.cards["clone-1"] = agenda;
    s.cards["flint-1"] = flint;
    s.runner.installed = ["flint-1"];
    s.corp.hand = ["clone-1", "hq-other"];
    const other = instantiateCard("hedge-fund", "hq-other", "corp:hq");
    s.cards["hq-other"] = other;
    breach(s, "hq");
    beginBreachAccess(s);
    const before = [...s.run!.accessCandidates];
    const queued = evalEffect(
      { state: s, sourceId: "flint-1" },
      { op: "do", action: { kind: "breach_hq_no_root" } },
    );
    expect(queued.ok).toBe(true);
    expect(s.run?.accessCandidates).toEqual(before);
    expect(s.run?.queuedBreachesAfterCurrent).toEqual([
      { server: "hq", cannotAccessRoot: true },
    ]);
    expect(s.log.join("\n")).toContain("7.3.8");
  });

  it("leaves Ash as the only access candidate after the trace (CR 7.4.2.ex1)", () => {
    const s = createInitialState();
    const ash = instantiateCard("ash-2x3zb9cy", "ash-1", "server:remote-1:root");
    const other = instantiateCard("pad-campaign", "pad-1", "server:remote-1:root");
    ash.rezzed = true;
    ash.faceup = true;
    other.rezzed = true;
    other.faceup = true;
    s.cards["ash-1"] = ash;
    s.cards["pad-1"] = other;
    s.servers["remote-1"] = {
      id: "remote-1",
      kind: "remote",
      ice: [],
      root: ["ash-1", "pad-1"],
    };
    breach(s, "remote-1");
    s.run!.accessOnlyCardIds = ["ash-1"];
    beginBreachAccess(s);
    expect(s.run?.accessCandidates).toEqual(["ash-1"]);
    const accessed = must(s, { type: "access_card", cardId: "ash-1" });
    expect(accessed.run?.accessCandidates).toEqual([]);
  });

  it("restores the other HQ cards when Flagship is hosted on Cupellation (CR 7.4.2a.ex1)", () => {
    let s = createInitialState();
    const flagship = instantiateCard("flagship", "flag-1", "server:hq:root");
    flagship.rezzed = true;
    flagship.faceup = true;
    const docklands = instantiateCard("docklands-pass", "dock-1", "runner:installed");
    const seen = instantiateCard("hedge-fund", "hq-seen", "corp:hq");
    const other = instantiateCard("hedge-fund", "hq-other", "corp:hq");
    s.cards["flag-1"] = flagship;
    s.cards["dock-1"] = docklands;
    s.cards["hq-seen"] = seen;
    s.cards["hq-other"] = other;
    s.runner.installed = ["dock-1"];
    s.servers.hq.root = ["flag-1"];
    s.corp.hand = ["hq-other", "hq-seen"];
    breach(s, "hq");
    beginBreachAccess(s);
    expect(s.run?.accessCandidates).toEqual(expect.arrayContaining(["hq-seen", "hq-other", "flag-1"]));
    s = must(s, { type: "access_card", cardId: "hq-seen" });
    expect(s.run?.accessCandidates).not.toContain("hq-other");
    expect(s.run?.accessCandidates).toContain("flag-1");
    s = must(s, { type: "access_card", cardId: "flag-1" });
    s.servers.hq.root = [];
    flagship.zone = "runner:hosted";
    applyRunAccessRestrictions(s);
    expect(s.run?.accessCandidates).toContain("hq-other");
    expect(s.run?.accessCandidates).not.toContain("hq-seen");
    expect(s.log.join("\n")).toContain("7.4.2a");
  });

  it("keeps HQ cards out until Flagship's restriction ends, then allows two accesses (CR 7.4.2b.ex1)", () => {
    const s = createInitialState();
    const flagship = instantiateCard("flagship", "flag-1", "server:hq:root");
    flagship.rezzed = true;
    flagship.faceup = true;
    const docklands = instantiateCard("docklands-pass", "dock-1", "runner:installed");
    const prior = instantiateCard("hedge-fund", "hq-prior", "corp:hq");
    const a = instantiateCard("hedge-fund", "hq-a", "corp:hq");
    const b = instantiateCard("hedge-fund", "hq-b", "corp:hq");
    s.cards["flag-1"] = flagship;
    s.cards["dock-1"] = docklands;
    s.cards["hq-prior"] = prior;
    s.cards["hq-a"] = a;
    s.cards["hq-b"] = b;
    s.runner.installed = ["dock-1"];
    s.servers.hq.root = ["flag-1"];
    s.corp.hand = ["hq-b", "hq-a", "hq-prior"];
    breach(s, "hq");
    s.run!.accessedCardIds = ["hq-prior"];
    beginBreachAccess(s);
    expect(s.run?.accessCandidates).not.toContain("hq-a");
    expect(s.run?.accessCandidates).not.toContain("hq-b");
    expect(s.run?.randomAccessLimit).toBeGreaterThanOrEqual(2);
    flagship.rezzed = false;
    applyRunAccessRestrictions(s);
    expect(s.run?.accessCandidates).toEqual(expect.arrayContaining(["hq-a", "hq-b"]));
    expect(s.run?.accessCandidates).not.toContain("hq-prior");
    expect(s.run?.randomAccessLimit).toBeGreaterThanOrEqual(2);
  });

  it("removes Immolation Script's chosen ice as a candidate without accessing it (CR 7.4.3.ex1)", () => {
    let s = createInitialState();
    const ice = instantiateCard("ice-wall", "arch-ice", "corp:archives");
    const copy = instantiateCard("ice-wall", "rezzed-ice", "server:hq:ice");
    copy.rezzed = true;
    copy.faceup = true;
    s.cards["arch-ice"] = ice;
    s.cards["rezzed-ice"] = copy;
    s.servers.hq.ice = ["rezzed-ice"];
    s.corp.discardPile = ["arch-ice"];
    breach(s, "archives");
    s.run!.immolationScriptAccessReplace = true;
    beginBreachAccess(s);
    s = must(s, { type: "access_card", cardId: "arch-ice" });
    s = must(s, { type: "choose_option", optionId: "immolation-replace:arch-ice" });
    expect(s.run?.accessedCardIds).not.toContain("arch-ice");
    expect(s.run?.accessCandidates).not.toContain("arch-ice");
    expect(s.corp.discardPile).toContain("rezzed-ice");
    expect(s.log.join("\n")).toContain("7.4.3");
  });

  it("drops a remote card from the candidates when the Runner declines Gagarin's cost (CR 7.4.3.ex2)", () => {
    let s = createInitialState();
    s.cards[s.corp.identityId]!.additionalCreditsToAccessRemoteRoot = 1;
    const asset = instantiateCard("pad-campaign", "pad-1", "server:remote-1:root");
    asset.rezzed = true;
    asset.faceup = true;
    s.cards["pad-1"] = asset;
    s.servers["remote-1"] = {
      id: "remote-1",
      kind: "remote",
      ice: [],
      root: ["pad-1"],
    };
    s.runner.credits = 0;
    breach(s, "remote-1");
    beginBreachAccess(s);
    s = must(s, { type: "access_card", cardId: "pad-1" });
    s = must(s, { type: "choose_option", optionId: "access-tax-decline:pad-1" });
    expect(s.run?.accessedCardIds).not.toContain("pad-1");
    expect(s.run?.accessCandidates).not.toContain("pad-1");
    expect(s.log.join("\n")).toContain("7.4.3");
  });

  it("accesses an upgrade again after it is trashed into Archives during that breach (CR 7.4.5.ex1)", () => {
    let s = createInitialState();
    const upgrade = instantiateCard("ash-2x3zb9cy", "up-1", "server:archives:root");
    upgrade.rezzed = true;
    upgrade.faceup = true;
    upgrade.trashCost = 0;
    s.cards["up-1"] = upgrade;
    const filler = instantiateCard("hedge-fund", "arch-fill", "corp:archives");
    s.cards["arch-fill"] = filler;
    s.corp.discardPile = ["arch-fill"];
    s.servers.archives.root = ["up-1"];
    breach(s, "archives");
    beginBreachAccess(s);
    s = must(s, { type: "access_card", cardId: "up-1" });
    trashCorpCardToArchives(s, "up-1");
    expect(s.run?.accessCandidates).toContain("up-1");
    enterStep(s, "breach.awaitAccess");
    expect(s.log.join("\n")).toContain("7.4.5");
    s = must(s, { type: "access_card", cardId: "up-1" });
    expect(s.run?.accessedCardIds.filter((id) => id === "up-1")).toHaveLength(2);
  });

  it("accesses Celebrity Gift again when Bacterial Programming leaves a new copy on top (CR 7.4.7a.ex1)", () => {
    const s = createInitialState();
    const gift = instantiateCard("hedge-fund", "gift-1", "corp:rd");
    gift.title = "Celebrity Gift";
    const agenda = instantiateCard("clone-retirement", "agenda-1", "corp:rd");
    agenda.title = "Bacterial Programming";
    s.cards["gift-1"] = gift;
    s.cards["agenda-1"] = agenda;
    s.corp.deck = ["gift-1", "agenda-1", ...s.corp.deck.filter((id) => id !== "gift-1" && id !== "agenda-1")];
    breach(s, "rd");
    s.run!.bonusAccess = 2;
    beginBreachAccess(s);
    expect(s.run?.accessCandidates[0]).toBe("gift-1");
    const next = must(s, { type: "access_card", cardId: "gift-1" });
    refreshRdDeckCandidate(next);
    expect(next.run?.accessCandidates[0]).toBe("agenda-1");
    next.corp.deck = next.corp.deck.filter((id) => id !== "agenda-1");
    const giftAgain = instantiateCard("hedge-fund", "gift-2", "corp:rd");
    giftAgain.title = "Celebrity Gift";
    next.cards["gift-2"] = giftAgain;
    next.corp.deck = ["gift-2", ...next.corp.deck.filter((id) => id !== "gift-2")];
    refreshRdDeckCandidate(next);
    expect(next.run?.accessCandidates[0]).toBe("gift-2");
    expect(next.run?.accessedCardIds).toContain("gift-1");
  });

  it("offers Seidr's new top card before the card under the one already accessed (CR 7.4.7a.ex2)", () => {
    const s = createInitialState();
    const first = instantiateCard("hedge-fund", "rd-1", "corp:rd");
    const agenda = instantiateCard("clone-retirement", "rd-2", "corp:rd");
    const third = instantiateCard("hedge-fund", "rd-3", "corp:rd");
    const fourth = instantiateCard("hedge-fund", "rd-4", "corp:rd");
    const strongbox = instantiateCard("strongbox", "box-1", "server:rd:root");
    strongbox.rezzed = true;
    strongbox.faceup = true;
    s.cards["rd-1"] = first;
    s.cards["rd-2"] = agenda;
    s.cards["rd-3"] = third;
    s.cards["rd-4"] = fourth;
    s.cards["box-1"] = strongbox;
    s.servers.rd.root = ["box-1"];
    s.corp.deck = ["rd-1", "rd-2", "rd-3", "rd-4"];
    breach(s, "rd");
    s.run!.bonusAccess = 3;
    beginBreachAccess(s);
    expect(s.run?.randomAccessLimit).toBeGreaterThanOrEqual(4);
    expect(s.run?.accessCandidates[0]).toBe("rd-1");
    let next = must(s, { type: "access_card", cardId: "rd-1" });
    refreshRdDeckCandidate(next);
    expect(next.run?.accessCandidates[0]).toBe("rd-2");
    next.corp.deck = next.corp.deck.filter((id) => id !== "rd-2");
    const added = instantiateCard("hedge-fund", "rd-new", "corp:rd");
    next.cards["rd-new"] = added;
    next.corp.deck = ["rd-new", ...next.corp.deck];
    refreshRdDeckCandidate(next);
    expect(next.run?.accessCandidates[0]).toBe("rd-new");
    next = must(next, { type: "access_card", cardId: "rd-new" });
    refreshRdDeckCandidate(next);
    expect(next.run?.accessCandidates[0]).toBe("rd-3");
  });
});
