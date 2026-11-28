/**
 * Hosting and trash (CR audit Phase 3, area 1).
 *
 * One trash procedure (`trashCard`, src/state/hostingAndTrash/trash.ts) and one
 * hosting procedure (`hostCard` / `unhostCard`, src/state/hostingAndTrash/host.ts).
 *
 * CR 1.13.12: moving a hosted card ends the host relationship.
 * CR 1.13.13: when a host changes zones, its hosted cards are trashed during
 *   the next checkpoint, and that cannot be prevented.
 * CR 10.3.1g: the checkpoint step that trashes them.
 * CR 4.4.6b: a Corp card is faceup in Archives only if the Runner could see it.
 * CR 1.16.1a: optional interrupts cannot cancel paying a cost.
 * CR 3.5.1b, 10.3.1b: an ended current is trashed during the next checkpoint.
 */
import { beforeAll, describe, expect, it } from "vitest";
import {
  assertCardsPinnedTag,
  assertPinnedTag,
  cardsDataPresent,
  crDataPresent,
  createInitialState,
  evalEffect,
  instantiateCard,
} from "../../../src/index.js";
import type { GameState } from "../../../src/index.js";
import { fx } from "../../../src/effects/ir/fx.js";
import { checkpointAfterInstruction } from "../../../src/legality/checkpoints.js";
import { checkInvariants } from "../../../src/debug/invariants.js";
import {
  hostCard,
  unhostAllFrom,
  unhostCard,
} from "../../../src/state/hostingAndTrash/host.js";
import {
  controllerOf,
  discardCard,
  resolveSkorpiosTrash,
  trashCard,
} from "../../../src/state/hostingAndTrash/trash.js";
import { createPendingAbilityInstance } from "../../../src/state/triggers/pendingAbilities.js";
import { recomputeRunnerLink } from "../../../src/state/hostingAndTrash/trashHooks.js";
import { recomputeRunnerMaxHandSize } from "../../../src/state/continuous/handSize.js";
import { CR } from "../../../src/timing/labels.js";
import {
  coversKind,
  expectStateDelta,
  snapshot,
} from "../../effects/kind-coverage.js";
import { identityZone } from "../../rulings/rulings-helpers.js";

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.147.29");
});

function put(s: GameState, defId: string, id: string, zone: string) {
  const card = instantiateCard(defId, id, zone as never);
  s.cards[id] = card;
  return card;
}

/** Off-Campus Apartment with a connection installed on it (CR 8.5.16b). */
function apartmentWithConnection(): GameState {
  const s = createInitialState();
  put(s, "off-campus-apartment", "oca-1", "runner:installed");
  put(s, "professional-contacts", "pc-1", "runner:installed");
  s.runner.installed = ["oca-1", "pc-1"];
  // Written field by field, as the install did before area 1, so this test
  // also runs against the old engine.
  s.cards["pc-1"]!.hostId = "oca-1";
  s.cards["oca-1"]!.hostedCardIds = ["pc-1"];
  s.activeSide = "runner";
  return s;
}

/** Problems the invariant checker reports about these cards. */
function problemsOf(s: GameState, ids: string[]) {
  return checkInvariants(s).filter((p) => ids.includes(p.id));
}

function run(s: GameState, sourceId: string, kind: string, extra = {}) {
  const r = evalEffect(
    { state: s, sourceId },
    fx.do({ kind, ...extra } as never),
  );
  if (!r.ok) throw new Error(r.error);
}

describe("a host's hosted cards wait for the checkpoint (CR 1.13.13, 10.3.1g)", () => {
  it("trashing Off-Campus Apartment leaves its connection installed until the checkpoint trashes it", () => {
    const s = apartmentWithConnection();
    coversKind("trash_self");
    const before = snapshot(s);
    run(s, "oca-1", "trash_self");

    // Not moved at once: the connection is still installed and hosted.
    expect(s.runner.installed).toEqual(["pc-1"]);
    expect(s.cards["pc-1"]?.hostId).toBe("oca-1");
    expect(s.runner.discardPile).toEqual(["oca-1"]);

    checkpointAfterInstruction(s, "test.trash");
    expectStateDelta(before, s, {
      "cards.oca-1.zone": { from: "runner:installed", to: "runner:heap" },
      "cards.pc-1.zone": { from: "runner:installed", to: "runner:heap" },
      "runner.installed": { from: ["oca-1", "pc-1"], to: [] },
    });
    expect(s.runner.discardPile).toEqual(["oca-1", "pc-1"]);
    expect(s.cards["pc-1"]?.hostId).toBeUndefined();
    expect(
      s.log.some(
        (line) =>
          line.startsWith("Professional Contacts trashed") &&
          line.includes(CR.checkpointHostedOnUninstalled.number),
      ),
    ).toBe(true);
    expect(problemsOf(s, ["oca-1", "pc-1", "lep-1", "co-1", "dj-1"])).toEqual(
      [],
    );
  });

  it("adding the host to the grip trashes its hosted connection at the checkpoint", () => {
    const s = apartmentWithConnection();
    put(s, "self-growth-program", "sgp-1", "corp:play-area");
    coversKind("add_n_installed_runner_to_grip_pick");
    const before = snapshot(s);
    run(s, "sgp-1", "add_n_installed_runner_to_grip_pick", {
      cardId: "oca-1",
      remaining: 0,
    });
    checkpointAfterInstruction(s, "test.bounce");
    expectStateDelta(before, s, {
      "cards.oca-1.zone": { from: "runner:installed", to: "runner:grip" },
      "cards.pc-1.zone": { from: "runner:installed", to: "runner:heap" },
    });
    expect(s.runner.installed).toEqual([]);
    expect(problemsOf(s, ["oca-1", "pc-1"])).toEqual([]);
  });
});

describe("trashing a hosted card ends the host relationship (CR 1.13.12)", () => {
  it("removes a trashed connection from Off-Campus Apartment's hosted list", () => {
    const s = apartmentWithConnection();
    coversKind("trash_self");
    const before = snapshot(s);
    run(s, "pc-1", "trash_self");
    expectStateDelta(before, s, {
      "cards.pc-1.zone": { from: "runner:installed", to: "runner:heap" },
      "cards.oca-1.hostedCardIds": { from: ["pc-1"], to: [] },
    });
    expect(s.cards["pc-1"]?.hostId).toBeUndefined();
    expect(problemsOf(s, ["oca-1", "pc-1", "lep-1", "co-1", "dj-1"])).toEqual(
      [],
    );
  });

  it("hostCard writes both ends, and moving the card elsewhere ends both", () => {
    const s = createInitialState();
    put(s, "leprechaun", "lep-1", "runner:installed");
    put(s, "corroder", "co-1", "runner:installed");
    put(s, "djinn", "dj-1", "runner:installed");
    s.runner.installed = ["lep-1", "co-1", "dj-1"];
    hostCard(s, "co-1", "lep-1", { installed: true });
    expect(s.cards["co-1"]?.hostId).toBe("lep-1");
    expect(s.cards["lep-1"]?.hostedCardIds).toEqual(["co-1"]);
    // A card is hosted on one card at a time (CR 1.13.4).
    hostCard(s, "co-1", "dj-1", { installed: true });
    expect(s.cards["lep-1"]?.hostedCardIds).toEqual([]);
    expect(s.cards["dj-1"]?.hostedCardIds).toEqual(["co-1"]);
    expect(s.cards["co-1"]?.zone).toBe("runner:installed");
    expect(problemsOf(s, ["oca-1", "pc-1", "lep-1", "co-1", "dj-1"])).toEqual(
      [],
    );
  });
});

describe("one trash procedure for both sides", () => {
  it("an unrezzed installed Corp card the Runner trashes goes to Archives facedown (CR 4.4.6b)", () => {
    const s = createInitialState();
    put(s, "pad-campaign", "pad-1", "server:hq:root");
    s.servers.hq.root = ["pad-1"];
    put(s, "sure-gamble", "src-r", "runner:play-area");
    coversKind("trash_installed_corp_card");
    const before = snapshot(s);
    run(s, "src-r", "trash_installed_corp_card", { cardId: "pad-1" });
    expectStateDelta(before, s, {
      "cards.pad-1.zone": { from: "server:hq:root", to: "corp:archives" },
      "corp.discardPile": { from: [], to: ["pad-1"] },
    });
    expect(s.cards["pad-1"]?.faceup).toBe(false);
  });

  it("a trash that is a cost opens no trash-interrupt window (CR 1.16.1a)", () => {
    const s = createInitialState();
    put(s, "sacrificial-construct", "sc-1", "runner:installed");
    put(s, "corroder", "co-1", "runner:installed");
    s.runner.installed = ["sc-1", "co-1"];
    trashCard(s, "co-1", { by: "runner", cause: "cost" });
    expect(s.pendingTrashPrevent ?? null).toBeNull();
    expect(s.cards["co-1"]?.zone).toBe("runner:heap");

    // Not a cost: the Runner may prevent it (CR 9.9.4c).
    put(s, "corroder", "co-2", "runner:installed");
    s.runner.installed.push("co-2");
    trashCard(s, "co-2", { by: "corp" });
    expect(s.pendingTrashPrevent?.cardId).toBe("co-2");
    expect(s.cards["co-2"]?.zone).toBe("runner:installed");
  });

  it("a card the checkpoint trashes cannot be prevented (CR 1.13.13)", () => {
    const s = apartmentWithConnection();
    put(s, "sacrificial-construct", "sc-1", "runner:installed");
    s.runner.installed.push("sc-1");
    put(s, "corroder", "co-1", "runner:installed");
    s.runner.installed.push("co-1");
    hostCard(s, "co-1", "oca-1", { installed: true });
    trashCard(s, "oca-1", { by: "corp", preventable: false });
    checkpointAfterInstruction(s, "test.trash");
    expect(s.pendingTrashPrevent ?? null).toBeNull();
    expect(s.cards["co-1"]?.zone).toBe("runner:heap");
  });
});

describe("a card hosts itself as a condition counter (CR 10.1.4, 1.13.1)", () => {
  it("Wetwork Refit hosts itself on ice, and On the Lam on a resource without being rezzed", () => {
    const s = createInitialState();
    put(s, "ice-wall", "iw-1", "server:hq:ice");
    s.servers.hq.ice = ["iw-1"];
    s.cards["iw-1"]!.rezzed = true;
    put(s, "wetwork-refit", "wr-1", "corp:play-area");
    s.corp.playArea = ["wr-1"];
    put(s, "daily-casts", "dc-1", "runner:installed");
    put(s, "on-the-lam", "otl-1", "runner:grip");
    s.runner.installed = ["dc-1"];
    s.runner.hand = ["otl-1"];
    coversKind("host_self_as_condition");
    const before = snapshot(s);
    run(s, "wr-1", "host_self_as_condition", { hostId: "iw-1" });
    run(s, "otl-1", "host_self_as_condition", { hostId: "dc-1" });
    expectStateDelta(before, s, {
      "cards.wr-1.zone": { from: "corp:play-area", to: "hosted:iw-1" },
      "cards.wr-1.hostId": { to: "iw-1" },
      "cards.iw-1.hostedCardIds": { to: ["wr-1"] },
      "cards.otl-1.zone": { from: "runner:grip", to: "hosted:dc-1" },
      "cards.dc-1.hostedCardIds": { to: ["otl-1"] },
      "corp.playArea": { from: ["wr-1"], to: [] },
      "runner.hand": { from: ["otl-1"], to: [] },
    });
    expect(s.cards["wr-1"]?.convertedInto).toBe("counter");
    expect(s.cards["wr-1"]?.rezzed).toBe(true);
    expect(s.cards["otl-1"]?.rezzed ?? false).toBe(false);
    expect(problemsOf(s, ["wr-1", "iw-1", "otl-1", "dc-1"])).toEqual([]);
  });
});

describe("the face a trashed or discarded card has in its discard pile (CR 4.4.6b, 4.4.7b)", () => {
  function corpBoard() {
    const s = createInitialState();
    put(s, "hedge-fund", "hq-1", "corp:hq");
    put(s, "hedge-fund", "hq-2", "corp:hq");
    put(s, "hedge-fund", "rd-1", "corp:rd");
    s.corp.hand = ["hq-1", "hq-2"];
    s.corp.deck = ["rd-1", ...s.corp.deck];
    put(s, "pad-campaign", "rez-1", "server:hq:root");
    put(s, "pad-campaign", "up-1", "server:archives:root");
    s.servers.hq.root = ["rez-1"];
    s.servers.archives.root = ["up-1"];
    s.cards["rez-1"]!.rezzed = true;
    return s;
  }

  it("faces a Corp card up only if the Runner could see it", () => {
    const s = corpBoard();
    // An exposed (faceup) unrezzed installed card was visible.
    s.cards["up-1"]!.faceup = true;
    // A card in HQ or R&D is hidden even if it was faceup before (CR 1.21.3).
    s.cards["rd-1"]!.faceup = true;
    s.cards["hq-2"]!.revealing = true;
    for (const id of ["hq-1", "hq-2", "rd-1", "rez-1", "up-1"]) {
      trashCard(s, id, { by: "runner" });
    }
    expect(s.cards["hq-1"]?.faceup).toBe(false);
    expect(s.cards["hq-2"]?.faceup).toBe(true);
    expect(s.cards["rd-1"]?.faceup).toBe(false);
    expect(s.cards["rez-1"]?.faceup).toBe(true);
    expect(s.cards["rez-1"]?.rezzed).toBe(false);
    expect(s.cards["up-1"]?.faceup).toBe(true);
    expect(s.corp.discardPile).toEqual([
      "hq-1",
      "hq-2",
      "rd-1",
      "rez-1",
      "up-1",
    ]);
  });

  it("keeps the face the procedure sets: install-time trash and sabotage (CR 8.5.7, 10.12.2a)", () => {
    const s = corpBoard();
    trashCard(s, "rez-1", { by: "corp", faceup: false });
    expect(s.cards["rez-1"]?.faceup).toBe(false);
  });

  it("discards without trashing: facedown from HQ, faceup from the grip (CR 1.19.3)", () => {
    const s = corpBoard();
    put(s, "sure-gamble", "g-1", "runner:grip");
    s.runner.hand = ["g-1"];
    s.cards["g-1"]!.faceup = false;
    discardCard(s, "hq-1");
    discardCard(s, "g-1");
    expect(s.cards["hq-1"]).toMatchObject({
      zone: "corp:archives",
      faceup: false,
    });
    expect(s.cards["g-1"]).toMatchObject({ zone: "runner:heap", faceup: true });
    expect(s.corp.hand).toEqual(["hq-2"]);
    expect(s.runner.hand).toEqual([]);
  });

  it("turns a Runner card faceup in the heap (CR 4.4.7b, 8.1.4c)", () => {
    const s = createInitialState();
    put(s, "sure-gamble", "g-1", "runner:grip");
    s.runner.hand = ["g-1"];
    s.cards["g-1"]!.faceup = false;
    trashCard(s, "g-1", { by: "runner" });
    expect(s.cards["g-1"]).toMatchObject({ zone: "runner:heap", faceup: true });
  });
});

describe("what leaves play with a trashed card", () => {
  it("ends the hosted card's link when the card is trashed or discarded (CR 1.13.12)", () => {
    const s = createInitialState();
    put(s, "glenn-station", "gs-1", "server:hq:root");
    s.servers.hq.root = ["gs-1"];
    put(s, "hedge-fund", "h-1", "corp:hq");
    put(s, "hedge-fund", "h-2", "corp:hq");
    s.corp.hand = ["h-1", "h-2"];
    hostCard(s, "h-1", "gs-1");
    hostCard(s, "h-2", "gs-1");
    trashCard(s, "h-1", { by: "corp" });
    expect(s.cards["gs-1"]?.hostedCardIds).toEqual(["h-2"]);
    discardCard(s, "h-2");
    expect(s.cards["gs-1"]?.hostedCardIds).toEqual([]);
    expect(s.cards["h-2"]?.hostId).toBeUndefined();
    expect(problemsOf(s, ["gs-1", "h-1", "h-2"])).toEqual([]);
  });

  it("ends the pending abilities of the card that left, and no others (CR 9.6.10)", () => {
    for (const side of ["runner", "corp"] as const) {
      const s = createInitialState();
      const leaving = side === "runner" ? "co-1" : "pad-1";
      put(s, "corroder", "co-1", "runner:installed");
      put(s, "corroder", "co-2", "runner:installed");
      s.runner.installed = ["co-1", "co-2"];
      put(s, "pad-campaign", "pad-1", "server:hq:root");
      s.servers.hq.root = ["pad-1"];
      s.cards["pad-1"]!.rezzed = true;
      for (const id of [leaving, "co-2"]) {
        createPendingAbilityInstance(s, {
          abilityKey: "test",
          sourceId: id,
          controller: s.cards[id]!.side,
          mandatory: true,
        });
      }
      trashCard(s, leaving, { by: "corp", cause: "cost" });
      expect(
        s.pendingAbilities
          .filter((p) => p.status === "pending")
          .map((p) => p.sourceId),
      ).toEqual(["co-2"]);
    }
  });

  it("Marilyn Campaign shuffles itself into R&D instead (CR 1.2.1)", () => {
    const s = createInitialState();
    put(s, "marilyn-campaign", "mc-1", "server:hq:root");
    s.servers.hq.root = ["mc-1"];
    s.cards["mc-1"]!.rezzed = true;
    trashCard(s, "mc-1", { by: "runner" });
    expect(s.cards["mc-1"]).toMatchObject({
      zone: "corp:rd",
      faceup: false,
      rezzed: false,
    });
    expect(s.corp.deck).toContain("mc-1");
    expect(s.corp.discardPile).not.toContain("mc-1");
    expect(s.servers.hq.root).toEqual([]);
  });

  it("Director Haas waits for its own ability while the Runner accesses it", () => {
    const s = createInitialState();
    put(s, "director-haas", "dh-1", "server:hq:root");
    s.servers.hq.root = ["dh-1"];
    s.run = {
      attackedServerId: "hq",
      phase: "success",
      position: null,
      successful: true,
      accessedCardIds: [],
      accessCandidates: [],
      randomAccessLimit: null,
      encounter: null,
      endedTheRun: false,
      cannotJackOut: false,
      accessingCardId: "dh-1",
    } as never;
    trashCard(s, "dh-1", { by: "runner", cause: "access" });
    expect(s.corp.discardPile).not.toContain("dh-1");
    expect(s.log.some((l) => l.includes("trashed while accessed"))).toBe(true);
  });

  it("an installed program's trash also trashes Q-Coherence Chip; a program from the grip does not", () => {
    const s = createInitialState();
    put(s, "q-coherence-chip", "q-1", "runner:installed");
    put(s, "corroder", "co-1", "runner:grip");
    put(s, "corroder", "co-2", "runner:installed");
    s.runner.installed = ["q-1", "co-2"];
    s.runner.hand = ["co-1"];
    trashCard(s, "co-1", { by: "runner" });
    expect(s.runner.installed).toEqual(["q-1", "co-2"]);
    expect(s.turn.runnerTrashedOwnInstalledThisTurn).toBe(false);
    trashCard(s, "co-2", { by: "corp", cause: "cost" });
    expect(s.runner.installed).toEqual([]);
    expect(s.cards["q-1"]?.zone).toBe("runner:heap");
    expect(s.turn.runnerTrashedOwnInstalledThisTurn).toBe(true);
  });

  it("Nanuq is removed from the game instead, faceup", () => {
    const s = createInitialState();
    put(s, "nanuq", "n-1", "runner:installed");
    s.runner.installed = ["n-1"];
    trashCard(s, "n-1", { by: "corp", cause: "cost" });
    expect(s.cards["n-1"]).toMatchObject({
      zone: "removed-from-game",
      faceup: true,
    });
    expect(s.removedFromGame.filter((id) => id === "n-1")).toHaveLength(1);
    expect(s.runner.discardPile).not.toContain("n-1");
  });

  it("an installed card's 'when uninstalled' ability is noted; one trashed from the grip is not", () => {
    const s = createInitialState();
    put(s, "corroder", "co-1", "runner:installed");
    put(s, "corroder", "co-2", "runner:grip");
    s.runner.installed = ["co-1"];
    s.runner.hand = ["co-2"];
    for (const id of ["co-1", "co-2"]) {
      s.cards[id]!.onUninstall = fx.gainCredits("runner", 1);
    }
    trashCard(s, "co-2", { by: "corp", cause: "cost" });
    expect(
      s.log.some((l) => l.includes("co-2") || l.includes("uninstalled")),
    ).toBe(false);
    trashCard(s, "co-1", { by: "corp", cause: "cost" });
    expect(s.log.some((l) => l.includes("becomes pending — uninstalled"))).toBe(
      true,
    );
  });

  it("Skorpios removes the trashed card from the game, or lets it reach the heap", () => {
    for (const option of ["skorpios-rfg:co-1", "skorpios-heap:co-1"]) {
      const s = createInitialState();
      put(
        s,
        "skorpios-defense-systems-persuasive-power",
        "sk-id",
        identityZone(s, "corp"),
      );
      s.corp.identityId = "sk-id";
      put(s, "corroder", "co-1", "runner:installed");
      s.runner.installed = ["co-1"];
      trashCard(s, "co-1", { by: "corp", cause: "cost" });
      expect(s.turn.pendingSkorpiosTrash?.cardId).toBe("co-1");
      resolveSkorpiosTrash(s, option);
      const rfg = option.startsWith("skorpios-rfg");
      expect(s.cards["co-1"]?.zone).toBe(
        rfg ? "removed-from-game" : "runner:heap",
      );
      expect(s.turn.skorpiosRfgUsedThisTurn ?? false).toBe(rfg);
      expect(s.turn.pendingSkorpiosTrash).toBeUndefined();
    }
  });
});

describe("a checkpoint's trash (CR 10.3.1g)", () => {
  it("recomputes link and hand size, leaves the active order, and notes the card's own trash ability", () => {
    const s = createInitialState();
    put(s, "off-campus-apartment", "oca-1", "runner:installed");
    put(s, "borrowed-satellite", "bs-1", "runner:installed");
    s.runner.installed = ["oca-1", "bs-1"];
    hostCard(s, "bs-1", "oca-1", { installed: true });
    s.activeOrder = ["oca-1", "bs-1"];
    s.cards["bs-1"]!.onTrash = fx.gainCredits("runner", 1);
    recomputeRunnerLink(s);
    recomputeRunnerMaxHandSize(s);
    const linkWith = s.runner.link;
    const handWith = s.runner.maxHandSize;
    trashCard(s, "bs-1", { cause: "checkpoint" });
    expect(s.runner.link).toBe(linkWith - 1);
    expect(s.runner.maxHandSize).toBe(handWith - 1);
    expect(s.activeOrder).toEqual(["oca-1"]);
    expect(s.turn.storedConditionalPending).toEqual([
      expect.objectContaining({
        cardId: "bs-1",
        abilityKey: "on-trash",
        mandatory: true,
      }),
    ]);
    expect(s.pendingTrashPrevent ?? null).toBeNull();
  });
});

describe("hostCard and unhostCard keep both ends in step (CR 1.13.4)", () => {
  it("hosts once, sets the face, leaves other hosted cards, and empties a host", () => {
    const s = createInitialState();
    put(s, "street-peddler", "sp-1", "runner:installed");
    s.runner.installed = ["sp-1"];
    for (const id of ["a", "b"]) put(s, "corroder", id, "runner:stack");
    s.runner.deck = ["a", "b", ...s.runner.deck];
    hostCard(s, "a", "sp-1", { faceup: false });
    hostCard(s, "a", "sp-1", { faceup: false });
    hostCard(s, "b", "sp-1", { faceup: true });
    expect(s.cards["sp-1"]?.hostedCardIds).toEqual(["a", "b"]);
    expect(s.cards["a"]).toMatchObject({ zone: "hosted:sp-1", faceup: false });
    expect(s.cards["b"]?.faceup).toBe(true);
    expect(s.runner.deck).not.toContain("a");
    hostCard(s, "a", "missing-host");
    expect(s.cards["a"]?.hostId).toBe("sp-1");
    unhostCard(s, "a");
    expect(s.cards["sp-1"]?.hostedCardIds).toEqual(["b"]);
    expect(s.cards["a"]?.hostId).toBeUndefined();
    expect(unhostAllFrom(s, "sp-1")).toEqual(["b"]);
    expect(s.cards["sp-1"]?.hostedCardIds).toEqual([]);
    expect(s.cards["b"]?.hostId).toBeUndefined();
    expect(unhostAllFrom(s, "missing-host")).toEqual([]);
  });

  it("names the controller who carries out an ability's trash (CR 1.14.5)", () => {
    const s = createInitialState();
    put(s, "corroder", "co-1", "runner:installed");
    expect(controllerOf(s, "co-1")).toBe("runner");
    expect(controllerOf(s, "corp-id")).toBe("corp");
    expect(controllerOf(s, "missing")).toBeNull();
    expect(() => trashCard(s, "missing")).not.toThrow();
    expect(() => discardCard(s, "missing")).not.toThrow();
  });
});

describe("a replaced trash is still a trash", () => {
  it("Marilyn Campaign shuffled into R&D still meets 'the Runner trashed a Corp card' (printed: it is still considered trashed)", () => {
    const s = createInitialState();
    put(s, "marilyn-campaign", "mc-1", "server:hq:root");
    s.servers.hq.root = ["mc-1"];
    s.cards["mc-1"]!.rezzed = true;
    const archivesBefore = s.turn.corpCardsAddedToArchivesThisTurn;
    trashCard(s, "mc-1", { by: "runner" });
    expect(s.turn.runnerTrashedCorpCardThisTurn).toBe(true);
    expect(s.turn.corpCardsAddedToArchivesThisTurn).toBe(archivesBefore);
  });
});

describe("a set of cards trashed together (CR 9.12.2a)", () => {
  it("Hostile Infrastructure in another server sees every card Light the Fire! trashes", () => {
    const s = createInitialState();
    put(s, "hostile-infrastructure", "hi-1", "server:rd:root");
    s.servers.rd.root = ["hi-1"];
    s.cards["hi-1"]!.rezzed = true;
    put(s, "pad-campaign", "p-1", "server:hq:root");
    put(s, "pad-campaign", "p-2", "server:hq:root");
    s.servers.hq.root = ["p-1", "p-2"];
    put(s, "light-the-fire", "ltf-1", "runner:play-area");
    s.run = {
      attackedServerId: "hq",
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
    } as never;
    run(s, "ltf-1", "trash_attacked_server_root");
    expect(
      s.log.some((l) =>
        l.includes(
          "Hostile Infrastructure remains active — 2 instances become pending",
        ),
      ),
    ).toBe(true);
  });
});

describe("more of the trash procedure's branches", () => {
  it("a checkpoint faces a Runner card up and a Corp card up only if the Runner could see it (CR 4.4.6b, 8.1.4c)", () => {
    const s = createInitialState();
    put(s, "street-peddler", "sp-1", "runner:installed");
    put(s, "corroder", "fd-1", "runner:installed");
    put(s, "pad-campaign", "up-1", "server:hq:root");
    put(s, "pad-campaign", "dn-1", "server:rd:root");
    s.servers.hq.root = ["up-1"];
    s.servers.rd.root = ["dn-1"];
    s.cards["up-1"]!.faceup = true;
    hostCard(s, "fd-1", "sp-1", { faceup: false });
    for (const id of ["fd-1", "up-1", "dn-1"]) {
      trashCard(s, id, { cause: "checkpoint" });
    }
    expect(s.cards["fd-1"]).toMatchObject({
      zone: "runner:heap",
      faceup: true,
    });
    expect(s.cards["up-1"]?.faceup).toBe(true);
    expect(s.cards["dn-1"]?.faceup).toBe(false);
  });

  it("Director Haas records its own ability and still counts as the Runner trashing a Corp card", () => {
    const s = createInitialState();
    put(s, "director-haas", "dh-1", "server:hq:root");
    s.servers.hq.root = ["dh-1"];
    s.run = {
      attackedServerId: "hq",
      phase: "success",
      position: null,
      successful: true,
      accessedCardIds: [],
      accessCandidates: [],
      randomAccessLimit: null,
      encounter: null,
      endedTheRun: false,
      cannotJackOut: false,
      accessingCardId: "dh-1",
    } as never;
    const archivesBefore = s.turn.corpCardsAddedToArchivesThisTurn;
    trashCard(s, "dh-1", { by: "runner", cause: "access" });
    expect(s.turn.runnerTrashedCorpCardThisTurn).toBe(true);
    expect(s.turn.corpCardsAddedToArchivesThisTurn).toBe(archivesBefore);
    // Its own ability resolves at once: the Runner scores it (printed text).
    expect(s.cards["dh-1"]?.zone).toBe("runner:score");
    expect(
      s.log.some((l) => l.includes("Pending ability on-trash-while-accessed")),
    ).toBe(true);
  });

  it("Threat assets give tags only when the Runner trashes them (CR 1.14.5a)", () => {
    for (const by of ["corp", "runner"] as const) {
      const s = createInitialState();
      put(s, "pad-campaign", "pap-1", "server:hq:root");
      s.servers.hq.root = ["pap-1"];
      s.cards["pap-1"]!.rezzed = true;
      s.cards["pap-1"]!.threatGiveTagsOnRezzedTrash = { level: 0, tags: 1 };
      const tags = s.runner.tags;
      trashCard(s, "pap-1", { by });
      expect(s.runner.tags - tags).toBe(by === "runner" ? 1 : 0);
    }
  });

  it("Marilyn Campaign and a checkpoint trash end their own pending abilities only (CR 9.6.10)", () => {
    const s = createInitialState();
    put(s, "marilyn-campaign", "mc-1", "server:hq:root");
    put(s, "pad-campaign", "pad-1", "server:rd:root");
    put(s, "pad-campaign", "pad-2", "server:archives:root");
    s.servers.hq.root = ["mc-1"];
    s.servers.rd.root = ["pad-1"];
    s.servers.archives.root = ["pad-2"];
    for (const id of ["mc-1", "pad-1", "pad-2"]) {
      s.cards[id]!.rezzed = true;
      createPendingAbilityInstance(s, {
        abilityKey: "test",
        sourceId: id,
        controller: "corp",
        mandatory: true,
      });
    }
    trashCard(s, "mc-1", { by: "runner" });
    trashCard(s, "pad-1", { cause: "checkpoint" });
    expect(
      s.pendingAbilities
        .filter((p) => p.status === "pending")
        .map((p) => p.sourceId),
    ).toEqual(["pad-2"]);
  });

  it("an installed non-program's trash leaves Q-Coherence Chip installed", () => {
    const s = createInitialState();
    put(s, "q-coherence-chip", "q-1", "runner:installed");
    put(s, "borrowed-satellite", "bs-1", "runner:installed");
    s.runner.installed = ["q-1", "bs-1"];
    trashCard(s, "bs-1", { by: "corp", cause: "cost" });
    expect(s.runner.installed).toEqual(["q-1"]);
  });

  it("Nanuq's 'when uninstalled' ability is still noted when it leaves the game", () => {
    const s = createInitialState();
    put(s, "nanuq", "n-1", "runner:installed");
    s.runner.installed = ["n-1"];
    s.cards["n-1"]!.onUninstall = fx.gainCredits("runner", 1);
    trashCard(s, "n-1", { by: "corp", cause: "cost" });
    expect(
      s.log.some((l) => l.includes("Nanuq becomes pending — uninstalled")),
    ).toBe(true);
  });
});
