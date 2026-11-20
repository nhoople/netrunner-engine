/**
 * CR audit area 2: uninstalling, ice positions, rearranging and moving the
 * Runner (CR 8.5.1b, 8.5.10, 6.2, 8.3, 4.9).
 *
 * The cards go through their own effect kinds; the shared helpers are
 * `src/state/procedures/uninstall.ts`, `src/state/procedures/rearrange.ts`
 * and `src/state/runPosition.ts`.
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
  fx,
  instantiateCard,
} from "../src/index.js";
import { checkpointAfterInstruction } from "../src/legality/checkpoints.js";
import { hostCard } from "../src/state/procedures/host.js";
import {
  isRearrangement,
  moveIce,
  rearrangeIce,
} from "../src/state/procedures/rearrange.js";
import {
  ceaseVacantPositions,
  isInstalled,
  removeCardFromGame,
  uninstallCard,
} from "../src/state/procedures/uninstall.js";
import {
  addOutermostIce,
  iceAtRunnerPosition,
  moveRunnerInward,
  noteIceUninstalled,
  followEncounteredIce,
  moveRunnerToIce,
  moveRunnerToOutermost,
  notePositionsCeased,
  runnerCanMoveToPosition,
  setAttackedServer,
} from "../src/state/runPosition.js";
import type { GameState, RunState } from "../src/state/types.js";
import { expectStateDelta, snapshot } from "./kind-coverage.js";

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.147.25");
});

type Zone = Parameters<typeof instantiateCard>[2];

/** The demo state, with its Runner program not marked rezzed (CR 8.1.4f). */
function fresh(): GameState {
  const s = createInitialState();
  for (const card of Object.values(s.cards)) {
    if (card.side === "runner") card.rezzed = false;
  }
  return s;
}

function put(
  s: GameState,
  defId: string,
  id: string,
  zone: Zone,
): GameState["cards"][string] {
  const card = instantiateCard(defId, id, zone);
  s.cards[id] = card;
  if (zone === "corp:score") s.corp.scoreArea.push(id);
  if (zone === "corp:play-area") (s.corp.playArea ??= []).push(id);
  if (zone === "runner:play-area") (s.runner.playArea ??= []).push(id);
  return card;
}

function runKind(
  s: GameState,
  sourceId: string,
  kind: string,
  extra: object = {},
): void {
  const r = evalEffect(
    { state: s, sourceId },
    fx.do({ kind, ...extra } as Parameters<typeof fx.do>[0]),
  );
  if (!r.ok) throw new Error(`${kind}: ${r.error ?? "failed"}`);
}

function choose(s: GameState, optionId: string): GameState {
  const r = applyAction(s, { type: "choose_option", optionId });
  if (!r.ok) throw new Error(`${optionId}: ${r.error}`);
  return r.state;
}

function run(over: Partial<RunState> = {}): RunState {
  return {
    attackedServerId: "hq",
    phase: "encounter",
    position: 0,
    successful: null,
    accessedCardIds: [],
    accessCandidates: [],
    randomAccessLimit: null,
    encounter: null,
    endedTheRun: false,
    cannotJackOut: false,
    accessingCardId: null,
    ...over,
  } as RunState;
}

/** Two ice on HQ and one on R&D, all rezzed. */
function iceBoard(): GameState {
  const s = fresh();
  for (const [id, zone] of [
    ["out-1", "server:hq:ice"],
    ["in-1", "server:hq:ice"],
    ["rd-1", "server:rd:ice"],
  ] as const) {
    const ice = put(s, "ice-wall", id, zone);
    ice.rezzed = true;
    ice.faceup = true;
  }
  s.servers.hq.ice = ["out-1", "in-1"];
  s.servers.rd.ice = ["rd-1"];
  return s;
}

describe("uninstalling a card fires its uninstall abilities (CR 8.5.1b)", () => {
  it("Jua returning Muertos Gang Member to the stack lets the Corp rez a card (CR 8.5.1b, 9.6.13c)", () => {
    const s = fresh();
    put(s, "jua", "jua-1", "server:hq:ice");
    s.servers.hq.ice = ["jua-1"];
    put(s, "muertos-gang-member", "mg-1", "runner:installed");
    put(s, "corroder", "cor-1", "runner:installed");
    s.runner.installed = ["mg-1", "cor-1"];
    runKind(s, "jua-1", "choose_jua_two_bounce_one");
    let after = choose(s, "pair:mg-1:cor-1");
    after = choose(after, "bounce:mg-1");
    expect(after.runner.deck[0]).toBe("mg-1");
    expect(
      after.log.some((l) =>
        l.includes("Muertos Gang Member becomes pending — uninstalled"),
      ),
    ).toBe(true);
  });

  it("Jua returning Nanuq to the stack removes Nanuq from the game instead (CR 9.1.8g, 4.9.2)", () => {
    const s = fresh();
    put(s, "jua", "jua-1", "server:hq:ice");
    s.servers.hq.ice = ["jua-1"];
    put(s, "nanuq", "nq-1", "runner:installed");
    put(s, "corroder", "cor-1", "runner:installed");
    s.runner.installed = ["nq-1", "cor-1"];
    const before = snapshot(s);
    runKind(s, "jua-1", "choose_jua_two_bounce_one");
    let after = choose(s, "pair:nq-1:cor-1");
    after = choose(after, "bounce:nq-1");
    expectStateDelta(before, after, {
      "cards.nq-1.zone": { from: "runner:installed", to: "removed-from-game" },
      "removedFromGame.length": 1,
    });
    expect(after.runner.deck).not.toContain("nq-1");
  });

  it("a program returned to the stack by Jua keeps none of its counters (CR 1.12.1, 10.3.1g)", () => {
    const s = fresh();
    put(s, "jua", "jua-1", "server:hq:ice");
    s.servers.hq.ice = ["jua-1"];
    const ds = put(s, "datasucker", "ds-1", "runner:installed");
    ds.virusCounters = 2;
    put(s, "corroder", "cor-1", "runner:installed");
    s.runner.installed = ["ds-1", "cor-1"];
    runKind(s, "jua-1", "choose_jua_two_bounce_one");
    let after = choose(s, "pair:ds-1:cor-1");
    after = choose(after, "bounce:ds-1");
    expect(after.cards["ds-1"]!.zone).toBe("runner:stack");
    expect(after.cards["ds-1"]!.virusCounters ?? 0).toBe(0);
  });

  it("an installed card added to the grip loses its hosted cards at the next checkpoint (CR 10.3.1g, 1.13.13)", () => {
    const s = fresh();
    put(s, "leprechaun", "lep-1", "runner:installed");
    put(s, "corroder", "cor-1", "runner:installed");
    s.runner.installed = ["lep-1", "cor-1"];
    hostCard(s, "cor-1", "lep-1", { installed: true });
    const before = snapshot(s);
    runKind(s, "lep-1", "add_installed_runner_card_to_grip", {
      cardId: "lep-1",
    });
    checkpointAfterInstruction(s, "test");
    expectStateDelta(before, s, {
      "cards.lep-1.zone": { from: "runner:installed", to: "runner:grip" },
      "cards.cor-1.zone": { from: "runner:installed", to: "runner:heap" },
    });
    expect(s.cards["cor-1"]!.hostId).toBeUndefined();
  });

  it("an agenda scored with Casting Call on it sends Casting Call to Archives (CR 8.5.1b, 10.3.1g)", () => {
    const s = fresh();
    put(s, "research-grant", "rg-1", "server:remote-1:root");
    put(s, "casting-call", "cc-1", "corp:play-area");
    s.servers["remote-1"] = {
      id: "remote-1",
      kind: "remote",
      ice: [],
      root: ["rg-1"],
    } as GameState["servers"][string];
    hostCard(s, "cc-1", "rg-1");
    runKind(s, "rg-1", "score_installed_agenda_ignore_requirement", {
      cardId: "rg-1",
    });
    checkpointAfterInstruction(s, "test");
    expect(s.cards["rg-1"]!.zone).toBe("corp:score");
    expect(s.cards["cc-1"]!.zone).toBe("corp:archives");
    expect(s.cards["rg-1"]!.hostedCardIds ?? []).toEqual([]);
  });
});

describe("the uninstall procedure (CR 8.5.1b, 4.9.2)", () => {
  it("does nothing to a card that is not installed", () => {
    const s = fresh();
    put(s, "corroder", "cor-1", "runner:grip");
    s.runner.hand = ["cor-1"];
    expect(uninstallCard(s, "cor-1", "deck-top")).toBe(false);
    expect(s.runner.hand).toEqual(["cor-1"]);
    expect(isInstalled(s, "cor-1")).toBe(false);
    expect(uninstallCard(s, "no-such-card", "hand")).toBe(false);
  });

  it("puts a Corp card facedown in HQ, unrezzed, with no advancements", () => {
    const s = iceBoard();
    s.cards["out-1"]!.advancementCounters = 2;
    expect(uninstallCard(s, "out-1", "hand")).toBe(true);
    const ice = s.cards["out-1"]!;
    expect(s.corp.hand).toContain("out-1");
    expect(ice.zone).toBe("corp:hq");
    expect(ice.faceup).toBe(false);
    expect(ice.rezzed).toBe(false);
    expect(ice.advancementCounters).toBeUndefined();
    expect(s.servers.hq.ice).toEqual(["in-1"]);
  });

  it("puts a Runner card in the grip faceup and recomputes link", () => {
    const s = fresh();
    const rabbit = put(s, "rabbit-hole", "rh-1", "runner:installed");
    s.runner.installed = ["rh-1"];
    s.runner.link = (rabbit.link ?? 0) + 0;
    expect(uninstallCard(s, "rh-1", "hand")).toBe(true);
    expect(s.cards["rh-1"]!.zone).toBe("runner:grip");
    expect(s.cards["rh-1"]!.faceup).toBe(true);
    expect(s.runner.link).toBe(0);
  });

  it("puts a card on top of, at the bottom of, or shuffled into its owner's deck", () => {
    const s = iceBoard();
    put(s, "hedge-fund", "rd-a", "corp:rd");
    put(s, "hedge-fund", "rd-b", "corp:rd");
    s.corp.deck = ["rd-a", "rd-b"];
    uninstallCard(s, "out-1", "deck-top");
    uninstallCard(s, "in-1", "deck-bottom");
    expect(s.corp.deck).toEqual(["out-1", "rd-a", "rd-b", "in-1"]);
    expect(s.cards["out-1"]!.zone).toBe("corp:rd");
    expect(s.cards["in-1"]!.faceup).toBe(false);
    uninstallCard(s, "rd-1", "deck-shuffle");
    expect(s.corp.deck).toHaveLength(5);
    expect(s.corp.deck).toContain("rd-1");
  });

  it("removes a card from the game faceup, and a scored agenda's advancement counters return to the bank (CR 4.9.6, 1.17.5)", () => {
    const s = iceBoard();
    s.cards["out-1"]!.advancementCounters = 1;
    uninstallCard(s, "out-1", "removed-from-game");
    expect(s.removedFromGame).toEqual(["out-1"]);
    expect(s.cards["out-1"]!.faceup).toBe(true);
    const agenda = put(s, "hostile-takeover", "ht-1", "server:hq:root");
    s.servers.hq.root = ["ht-1"];
    agenda.advancementCounters = 2;
    uninstallCard(s, "ht-1", "score-area", { scoreSide: "runner" });
    expect(s.runner.scoreArea).toEqual(["ht-1"]);
    expect(s.cards["ht-1"]!.zone).toBe("runner:score");
    expect(s.cards["ht-1"]!.advancementCounters ?? 0).toBe(0);
    uninstallCard(s, "in-1", "score-area");
    expect(s.corp.scoreArea).toEqual(["in-1"]);
    expect(s.cards["in-1"]!.zone).toBe("corp:score");
  });

  it("ends the card's own host link and keeps a Runner card's hand size bonus only while installed (CR 1.13.12)", () => {
    const s = fresh();
    put(s, "leprechaun", "lep-1", "runner:installed");
    put(s, "corroder", "cor-1", "runner:installed");
    put(s, "brain-cage", "bc-1", "runner:installed");
    s.runner.installed = ["lep-1", "cor-1", "bc-1"];
    hostCard(s, "cor-1", "lep-1", { installed: true });
    uninstallCard(s, "cor-1", "hand");
    expect(s.cards["cor-1"]!.hostId).toBeUndefined();
    expect(s.cards["lep-1"]!.hostedCardIds ?? []).toEqual([]);
    const withCage = s.runner.maxHandSize;
    uninstallCard(s, "bc-1", "hand");
    expect(s.runner.maxHandSize).toBe(withCage - 3);
  });

  it("ends the pending instances of the uninstalled card and no other (CR 9.6.10)", () => {
    const s = iceBoard();
    const pending = (id: string, sourceId: string) => ({
      id,
      abilityKey: "test",
      sourceId,
      controller: "corp" as const,
      mandatory: true,
      status: "pending" as const,
      independentOfSource: false,
    });
    s.pendingAbilities = [
      pending("p-1", "out-1"),
      pending("p-2", "in-1"),
    ] as GameState["pendingAbilities"];
    uninstallCard(s, "out-1", "hand");
    expect(s.pendingAbilities.map((p) => p.status)).toEqual([
      "cancelled",
      "pending",
    ]);
  });

  it("puts an uninstalled card in a score area faceup (CR 8.5.1b)", () => {
    const s = fresh();
    const agenda = put(s, "hostile-takeover", "ht-1", "server:hq:root");
    s.servers.hq.root = ["ht-1"];
    agenda.faceup = false;
    uninstallCard(s, "ht-1", "score-area");
    expect(s.cards["ht-1"]!.faceup).toBe(true);
    expect(s.cards["ht-1"]!.rezzed).toBe(false);
  });

  it("shuffles a card it adds to a deck when told to shuffle", () => {
    const s = iceBoard();
    const ids = Array.from({ length: 12 }, (_, i) => `rd-${i}`);
    for (const id of ids) put(s, "hedge-fund", id, "corp:rd");
    s.corp.deck = [...ids];
    uninstallCard(s, "out-1", "deck-shuffle");
    expect(s.corp.deck).not.toEqual([...ids, "out-1"]);
    expect([...s.corp.deck].sort()).toEqual([...ids, "out-1"].sort());
  });

  it("writes the caller's log line", () => {
    const s = iceBoard();
    uninstallCard(s, "out-1", "hand", { logLine: "Bounce Ice Wall." });
    expect(s.log).toContain("Bounce Ice Wall.");
  });

  it("removes a card that is not installed from the game without uninstalling it (CR 4.9.2)", () => {
    const s = fresh();
    put(s, "hedge-fund", "hf-1", "corp:archives");
    s.corp.discardPile = ["hf-1"];
    removeCardFromGame(s, "hf-1");
    expect(s.corp.discardPile).toEqual([]);
    expect(s.removedFromGame).toEqual(["hf-1"]);
    expect(s.cards["hf-1"]!.zone).toBe("removed-from-game");
    expect(s.cards["hf-1"]!.faceup).toBe(true);
    removeCardFromGame(s, "no-such-card");
    expect(s.removedFromGame).toEqual(["hf-1"]);
  });

  it("removes a hosted card that is not installed from the game, ending its host link (CR 1.13.12, 4.9.2)", () => {
    const s = fresh();
    put(s, "personal-workshop", "pw-1", "runner:installed");
    s.runner.installed = ["pw-1"];
    put(s, "corroder", "cor-1", "runner:grip");
    s.runner.hand = ["cor-1"];
    hostCard(s, "cor-1", "pw-1");
    s.cards["cor-1"]!.rezzed = true;
    removeCardFromGame(s, "cor-1");
    expect(s.cards["cor-1"]!.zone).toBe("removed-from-game");
    expect(s.cards["cor-1"]!.hostId).toBeUndefined();
    expect(s.cards["cor-1"]!.rezzed).toBe(false);
    expect(s.cards["pw-1"]!.hostedCardIds ?? []).toEqual([]);
  });
});

describe("a remote with nothing left in it (CR 8.5.8)", () => {
  it("uninstalling the last card of a remote server makes the server cease to exist at the next checkpoint (CR 8.5.8)", () => {
    const s = fresh();
    put(s, "pad-campaign", "pad-1", "server:remote-1:root");
    s.servers["remote-1"] = {
      id: "remote-1",
      kind: "remote",
      ice: [],
      root: ["pad-1"],
    } as GameState["servers"][string];
    expect(uninstallCard(s, "pad-1", "hand")).toBe(true);
    checkpointAfterInstruction(s, "test");
    expect(s.servers["remote-1"]).toBeUndefined();
    expect(s.cards["pad-1"]!.zone).toBe("corp:hq");
  });
});

describe("ice leaving its position during a run (CR 6.2.4, 6.2.6, 6.2.7a, 8.5.10)", () => {
  it("uninstalling the ice the Runner is approaching empties their position and ends the approach (CR 6.2.4, 6.2.7a, 8.5.10)", () => {
    const s = iceBoard();
    s.run = run({ phase: "approach_ice", position: 0 });
    uninstallCard(s, "out-1", "hand");
    expect(s.run!.positionVacated).toBe(true);
    expect(s.run!.approachedIceUninstalled).toBe(true);
    // The emptied position is outward of In: the Runner approaches In next.
    expect(s.run!.position).toBe(0);
    expect(s.servers.hq.ice[s.run!.position!]).toBe("in-1");
  });

  it("uninstalling the ice the Runner is encountering ends the encounter (CR 6.2.7c, 8.5.10)", () => {
    const s = iceBoard();
    s.run = run({
      position: 1,
      encounter: { iceId: "in-1", broken: [false] },
    });
    uninstallCard(s, "in-1", "deck-top");
    expect(s.run!.encounter?.iceUninstalled).toBe(true);
    expect(s.run!.positionVacated).toBe(true);
  });

  it("removing hosted ice the Runner is encountering from the game ends the encounter (CR 6.2.1a, 6.2.7c)", () => {
    const s = iceBoard();
    put(s, "ice-wall", "hosted-ice", "server:hq:root");
    put(s, "awakening-center", "ac-1", "server:hq:root");
    s.servers.hq.root = ["ac-1"];
    hostCard(s, "hosted-ice", "ac-1");
    s.servers.hq.root = ["ac-1"];
    s.cards["hosted-ice"]!.zone = "hosted:ac-1";
    s.run = run({
      position: 0,
      encounter: { iceId: "hosted-ice", broken: [] },
    });
    removeCardFromGame(s, "hosted-ice");
    expect(s.cards["hosted-ice"]!.zone).toBe("removed-from-game");
    expect(s.run.encounter?.iceUninstalled).toBe(true);
    expect(s.run.positionVacated).toBeFalsy();
  });

  it("uninstalling ice outward of the Runner keeps them on the same ice (CR 6.2.6, 4.6.9e)", () => {
    const s = iceBoard();
    s.run = run({ phase: "approach_ice", position: 1 });
    uninstallCard(s, "out-1", "hand");
    expect(s.servers.hq.ice[s.run!.position!]).toBe("in-1");
    expect(s.run!.positionVacated).toBeFalsy();
  });

  it("an emptied position on another server ceases to exist even at the Runner's index (CR 10.3.1i)", () => {
    const s = iceBoard();
    s.servers.hq.ice = ["out-1", "gone-1"];
    s.run = run({ attackedServerId: "rd", phase: "approach_ice", position: 1 });
    expect(ceaseVacantPositions(s)).toBe(1);
    expect(s.servers.hq.ice).toEqual(["out-1"]);
    expect(s.run.position).toBe(1);
  });

  it("an emptied position the Runner is not in ceases to exist at the checkpoint, and the Runner keeps theirs (CR 6.2.4, 10.3.1i)", () => {
    const s = iceBoard();
    s.servers.hq.ice = ["gone-1", "out-1", "in-1"];
    s.run = run({ phase: "approach_ice", position: 2 });
    expect(ceaseVacantPositions(s)).toBe(1);
    expect(s.servers.hq.ice).toEqual(["out-1", "in-1"]);
    expect(s.servers.hq.ice[s.run!.position!]).toBe("in-1");
    // The Runner's own emptied position stays.
    s.servers.hq.ice = ["out-1", "gone-2"];
    s.run.position = 1;
    expect(ceaseVacantPositions(s)).toBe(0);
    expect(s.servers.hq.ice).toEqual(["out-1", "gone-2"]);
  });
});

describe("arranging installed ice (CR 8.3.1, 8.3.2)", () => {
  it("Mandatory Seed Replacement keeps every ice in a server while the Corp chooses (CR 8.3.2a, 6.2.1)", () => {
    const s = iceBoard();
    put(s, "mandatory-seed-replacement", "msr-1", "corp:score");
    runKind(s, "msr-1", "rearrange_ice_protecting_all_servers");
    expect(s.pendingChoice?.chooser).toBe("corp");
    expect(s.servers.hq.ice).toEqual(["out-1", "in-1"]);
    expect(s.servers.rd.ice).toEqual(["rd-1"]);
    // No server can end with a different number of ice (CR 8.3.2).
    let after = choose(s, "arrange:hq:0:rd-1");
    after = choose(after, "arrange:hq:1:out-1");
    expect(after.servers.hq.ice).toEqual(["rd-1", "out-1"]);
    expect(after.servers.rd.ice).toEqual(["in-1"]);
  });

  it("Sunset during an encounter keeps the Runner with the ice they encounter (CR 6.2.7d)", () => {
    const s = iceBoard();
    put(s, "sunset", "sun-1", "corp:play-area");
    s.run = run({ position: 0, encounter: { iceId: "out-1", broken: [] } });
    runKind(s, "sun-1", "choose_server_rearrange_ice");
    let after = choose(s, "sunset:hq");
    after = choose(after, "arrange:hq:0:in-1");
    expect(after.servers.hq.ice).toEqual(["in-1", "out-1"]);
    expect(after.run!.position).toBe(1);
    expect(after.run!.encounter?.iceId).toBe("out-1");
  });

  it("Sunset while the Runner approaches leaves them in their position, approaching the ice now there (CR 6.2.7b)", () => {
    const s = iceBoard();
    put(s, "sunset", "sun-1", "corp:play-area");
    s.run = run({ phase: "approach_ice", position: 0 });
    runKind(s, "sun-1", "choose_server_rearrange_ice");
    let after = choose(s, "sunset:hq");
    after = choose(after, "arrange:hq:0:in-1");
    expect(after.run!.position).toBe(0);
    expect(after.servers.hq.ice[0]).toBe("in-1");
  });

  it("Escher does not show the Runner the title of unrezzed ice (CR 1.21.1)", () => {
    const s = iceBoard();
    s.cards["in-1"]!.rezzed = false;
    s.cards["in-1"]!.faceup = false;
    s.cards["in-1"]!.title = "Secret Wall";
    put(s, "escher", "esc-1", "runner:play-area");
    runKind(s, "esc-1", "rearrange_ice", {
      chooser: "runner",
      serverIds: ["hq", "rd"],
    });
    const labels = s.pendingChoice!.options.map((o) => o.label).join("\n");
    expect(labels).not.toContain("Secret Wall");
    expect(labels).toContain("the unrezzed ice at hq, position 2");
    let after = choose(s, "arrange:hq:0:in-1");
    after = choose(after, "arrange:hq:1:out-1");
    expect(after.log.join("\n")).not.toContain("Secret Wall");
  });

  it("offers to leave the rest in place once the remaining ice already sit in the remaining positions", () => {
    const s = iceBoard();
    put(s, "mandatory-seed-replacement", "msr-1", "corp:score");
    runKind(s, "msr-1", "rearrange_ice_protecting_all_servers");
    const after = choose(s, "arrange:keep-rest");
    expect(after.servers.hq.ice).toEqual(["out-1", "in-1"]);
    expect(after.servers.rd.ice).toEqual(["rd-1"]);
    expect(after.pendingChoice).toBeNull();
  });

  it("arranging 1 or fewer ice does nothing (CR 8.3.1a)", () => {
    const s = fresh();
    const ice = put(s, "ice-wall", "only-1", "server:hq:ice");
    ice.rezzed = true;
    s.servers.hq.ice = ["only-1"];
    put(s, "mandatory-seed-replacement", "msr-1", "corp:score");
    runKind(s, "msr-1", "rearrange_ice_protecting_all_servers");
    expect(s.pendingChoice).toBeNull();
    expect(s.servers.hq.ice).toEqual(["only-1"]);
  });

  it("refuses an arrangement that adds, drops or repeats ice, or changes a server's count (CR 8.3.1)", () => {
    const s = iceBoard();
    expect(isRearrangement(s, { hq: ["in-1", "out-1"] })).toBe(true);
    expect(rearrangeIce(s, { rd: ["rd-1"] })).toBe(true);
    expect(isRearrangement(s, { hq: ["in-1"] })).toBe(false);
    expect(isRearrangement(s, { hq: ["in-1", "in-1"] })).toBe(false);
    expect(isRearrangement(s, { hq: ["in-1", "rd-1"] })).toBe(false);
    expect(isRearrangement(s, { hq: ["rd-1"], rd: ["out-1", "in-1"] })).toBe(
      false,
    );
    expect(isRearrangement(s, { "remote-9": [] })).toBe(false);
    expect(rearrangeIce(s, { hq: ["in-1"] })).toBe(false);
    expect(s.servers.hq.ice).toEqual(["out-1", "in-1"]);
  });
});

describe("moving installed ice (CR 6.2.2, 6.2.7a, 6.2.7d)", () => {
  it("ice encountered during the breach moves without giving the Runner a position (CR 6.2.5d)", () => {
    const s = iceBoard();
    s.run = run({
      phase: "breach",
      position: null,
      successful: true,
      encounter: { iceId: "in-1", broken: [] },
    });
    moveIce(s, "in-1", "rd", "outermost");
    expect(s.run!.attackedServerId).toBe("hq");
    expect(s.run!.position).toBeNull();
  });

  it("moving the ice the Runner encounters takes the Runner with it (CR 6.2.7d)", () => {
    const s = iceBoard();
    s.run = run({ position: 1, encounter: { iceId: "in-1", broken: [] } });
    expect(moveIce(s, "in-1", "rd", "outermost")).toBe(true);
    expect(s.run!.attackedServerId).toBe("rd");
    expect(s.run!.position).toBe(0);
    expect(s.servers.rd.ice).toEqual(["in-1", "rd-1"]);
    expect(s.cards["in-1"]!.zone).toBe("server:rd:ice");
    expect(s.run!.encounter?.iceUninstalled).toBeFalsy();
  });

  it("moving the ice the Runner approaches to an innermost position ends the approach (CR 6.2.2b, 6.2.7a)", () => {
    const s = iceBoard();
    s.run = run({ phase: "approach_ice", position: 0 });
    moveIce(s, "out-1", "rd", "innermost");
    expect(s.run!.approachedIceUninstalled).toBe(true);
    expect(s.run!.positionVacated).toBe(true);
    expect(s.servers.rd.ice).toEqual(["rd-1", "out-1"]);
  });

  it("moving ice to the outermost position of the attacked server keeps the Runner's position (CR 6.2.2a, 6.2.6a, 4.6.9e)", () => {
    const s = iceBoard();
    s.run = run({ phase: "approach_ice", position: 1 });
    moveIce(s, "rd-1", "hq", "outermost");
    expect(s.servers.hq.ice).toEqual(["rd-1", "out-1", "in-1"]);
    expect(s.servers.hq.ice[s.run!.position!]).toBe("in-1");
  });

  it("moving ice to the outermost position of its own server keeps the other ice (CR 6.2.2a)", () => {
    const s = iceBoard();
    expect(moveIce(s, "in-1", "hq", "outermost")).toBe(true);
    expect(s.servers.hq.ice).toEqual(["in-1", "out-1"]);
  });

  it("does nothing for ice that protects no server or a server that does not exist", () => {
    const s = iceBoard();
    expect(moveIce(s, "nope", "rd", "outermost")).toBe(false);
    expect(moveIce(s, "out-1", "remote-9" as "rd", "outermost")).toBe(false);
    expect(s.servers.hq.ice).toEqual(["out-1", "in-1"]);
  });
});

describe("moving the Runner to a position (CR 6.2.8)", () => {
  it("Mind Game moves the Runner to a server with no ice and leaves them no position, not −1 (CR 6.2.8b)", () => {
    const s = iceBoard();
    put(s, "mind-game", "mg-1", "server:hq:ice");
    s.servers.hq.ice = ["mg-1", "in-1"];
    s.run = run({ position: 0, encounter: { iceId: "mg-1", broken: [] } });
    runKind(s, "mg-1", "redirect_resolve", { serverId: "archives" });
    expect(s.run!.attackedServerId).toBe("archives");
    expect(s.run!.position).toBeNull();
  });

  it("Susanoo-no-Mikoto moves the Runner to the outermost position of Archives (CR 6.2.8b)", () => {
    const s = iceBoard();
    const arch = put(s, "ice-wall", "arch-1", "server:archives:ice");
    arch.rezzed = true;
    put(s, "ice-wall", "arch-2", "server:archives:ice");
    s.servers.archives.ice = ["arch-1", "arch-2"];
    put(s, "susanoo-no-mikoto", "sus-1", "server:hq:ice");
    s.servers.hq.ice = ["out-1", "sus-1"];
    s.run = run({ position: 1, encounter: { iceId: "sus-1", broken: [] } });
    runKind(s, "sus-1", "redirect_susanoo_to_archives");
    expect(s.run!.attackedServerId).toBe("archives");
    expect(s.run!.position).toBe(0);
  });

  it("Proprionegation does not move the Runner once the run is successful (CR 6.2.8c)", () => {
    const s = iceBoard();
    put(s, "proprionegation", "pp-1", "corp:score");
    s.run = run({ phase: "breach", position: null, successful: true });
    runKind(s, "pp-1", "move_runner_to_archives_outermost");
    expect(s.run!.attackedServerId).toBe("hq");
    expect(s.log.join("\n")).toContain("6.2.8c");
  });

  it("Baker changes the attacked server and the Runner approaches that server, not its ice (CR 1.2.1, 6.2.5c)", () => {
    const s = iceBoard();
    put(s, "baker", "bk-1", "runner:installed");
    s.runner.installed = ["bk-1"];
    s.run = run({
      attackedServerId: "archives",
      phase: "movement",
      position: null,
    });
    runKind(s, "bk-1", "redirect_approach_to_server", { serverId: "hq" });
    expect(s.run!.attackedServerId).toBe("hq");
    expect(s.run!.position).toBeNull();
  });

  it("Cell Portal moves the Runner to the outermost position of the attacked server (CR 6.2.8b)", () => {
    const s = iceBoard();
    put(s, "cell-portal", "cp-1", "server:hq:ice");
    s.servers.hq.ice = ["out-1", "cp-1"];
    s.run = run({ position: 1, encounter: { iceId: "cp-1", broken: [] } });
    runKind(s, "cp-1", "move_runner_to_outermost_attacked");
    expect(s.run!.position).toBe(0);
    expect(s.log.join("\n")).toContain("6.2.8b");
  });

  it("the position helpers follow CR 6.2.8a, 6.2.8c and 6.2.7d", () => {
    const s = iceBoard();
    expect(runnerCanMoveToPosition(s)).toBe(false);
    expect(moveRunnerToIce(s, "rd-1")).toBe(false);
    expect(moveRunnerToOutermost(s, "rd")).toBe(false);
    s.run = run({ phase: "movement", position: 1 });
    expect(runnerCanMoveToPosition(s)).toBe(true);
    expect(moveRunnerToIce(s, "rd-1")).toBe(true);
    expect(s.run.attackedServerId).toBe("rd");
    expect(s.run.position).toBe(0);
    expect(moveRunnerToIce(s, "not-installed")).toBe(false);
    expect(moveRunnerToOutermost(s, "remote-9" as "rd")).toBe(false);
    for (const phase of ["breach", "access", "ends"] as RunState["phase"][]) {
      s.run.phase = phase;
      expect(runnerCanMoveToPosition(s)).toBe(false);
    }
    s.run.phase = "success";
    // The engine's "success" phase includes approaching the server, which
    // is still the Movement Phase (CR 6.9.4g).
    expect(runnerCanMoveToPosition(s)).toBe(true);
    s.run.successful = true;
    expect(runnerCanMoveToPosition(s)).toBe(false);
    setAttackedServer(s.run, "archives");
    expect(s.run.attackedServerId).toBe("archives");
    expect(s.run.position).toBe(0);
  });

  it("an emptied position the Runner is in holds no ice (CR 6.2.4)", () => {
    const s = iceBoard();
    s.run = run({ phase: "approach_ice", position: 0 });
    expect(iceAtRunnerPosition(s)).toBe("out-1");
    s.run.positionVacated = true;
    expect(iceAtRunnerPosition(s)).toBeNull();
    s.run = null;
    expect(iceAtRunnerPosition(s)).toBeNull();
  });

  it("uninstalling ice the Runner was sent to encounter ends that approach (CR 6.2.7a)", () => {
    const s = iceBoard();
    s.run = run({
      attackedServerId: "rd",
      phase: "approach_ice",
      position: 0,
      forceEncounterIceId: "in-1",
    });
    uninstallCard(s, "in-1", "hand");
    expect(s.run.approachedIceUninstalled).toBe(true);
    expect(s.run.position).toBe(0);
  });

  it("a Runner with no position keeps none when ice of the attacked server is uninstalled (CR 6.2.5c, 6.2.4)", () => {
    const s = iceBoard();
    s.run = run({ phase: "movement", position: null });
    uninstallCard(s, "out-1", "hand");
    expect(s.run.position).toBeNull();
    expect(s.run.positionVacated).toBeFalsy();
    moveRunnerInward(s);
    expect(s.run.position).toBeNull();
  });

  it("uninstalling a forced-encounter ice outside the approach does not end an approach (CR 6.2.7a, 6.2.7e)", () => {
    const s = iceBoard();
    s.run = run({
      attackedServerId: "rd",
      phase: "movement",
      position: 0,
      forceEncounterIceId: "in-1",
    });
    uninstallCard(s, "in-1", "hand");
    expect(s.run.approachedIceUninstalled).toBeFalsy();
  });

  it("an encountered card that was never installed is not marked uninstalled (CR 6.5.9a, 8.5.1b)", () => {
    const s = iceBoard();
    put(s, "ice-wall", "hq-ice", "corp:hq");
    s.corp.hand = ["hq-ice"];
    s.run = run({ position: 0, encounter: { iceId: "hq-ice", broken: [] } });
    noteIceUninstalled(s, "hq-ice");
    expect(s.run.encounter?.iceUninstalled).toBeFalsy();
    expect(s.run.positionVacated).toBeFalsy();
  });

  it("ice added outermost on another server does not move the Runner (CR 6.2.6)", () => {
    const s = iceBoard();
    put(s, "ice-wall", "new-1", "corp:hq");
    s.corp.hand = ["new-1"];
    s.run = run({ phase: "approach_ice", position: 1 });
    s.corp.hand = [];
    addOutermostIce(s, "rd", "new-1");
    s.cards["new-1"]!.zone = "server:rd:ice";
    expect(s.run.position).toBe(1);
    s.run.position = null;
    put(s, "ice-wall", "new-2", "server:hq:ice");
    addOutermostIce(s, "hq", "new-2");
    expect(s.run.position).toBeNull();
    addOutermostIce(s, "remote-9" as "hq", "new-2");
    expect(s.servers.hq.ice).toEqual(["new-2", "out-1", "in-1"]);
  });

  it("follows only the ice being encountered, and counts only positions outward of the Runner", () => {
    const s = iceBoard();
    s.run = run({ position: 1, encounter: { iceId: "in-1", broken: [] } });
    followEncounteredIce(s, "out-1");
    expect(s.run.position).toBe(1);
    s.servers.hq.ice = ["in-1", "out-1"];
    followEncounteredIce(s, "in-1");
    expect(s.run.position).toBe(0);
    s.run.position = 2;
    notePositionsCeased(s, "hq", [0, 2, 3]);
    expect(s.run.position).toBe(1);
    notePositionsCeased(s, "rd", [0]);
    expect(s.run.position).toBe(1);
    s.run.position = null;
    notePositionsCeased(s, "hq", [0]);
    expect(s.run.position).toBeNull();
  });
});
