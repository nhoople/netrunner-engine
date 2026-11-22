/**
 * Three card fixes checked against the printed text and CR v26.03.
 *
 * La Costa Grid: "place 1 advancement counter on a card in the root of this
 * server". Placing a counter is not advancing (CR 1.18.2), so any card in
 * the root may take it, La Costa Grid included. "A card you can advance"
 * (Vladisibirsk City Grid, Hype Machine) still limits the pick (CR 1.18.3).
 *
 * Dummy Box: "Trash 1 card from your grip: Prevent the Corp from trashing 1
 * installed card of the same type." The grip card is a cost, so without one
 * the ability cannot be used (CR 1.16.1). The interrupt window still opens
 * whatever the grip holds, so the Corp learns nothing about the grip
 * (CR 10.2.2a, 9.2.9c).
 *
 * Tech Startup: "search R&D for an asset, reveal it, and install it.
 * Shuffle R&D." A search may find nothing (CR 8.7.2e); the found card is
 * revealed to both players (CR 8.7.2c, 1.21.3); the Corp picks where it is
 * installed (CR 8.5.16b).
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
  legalActions,
} from "../src/index.js";
import type { Action, Effect, GameState } from "../src/index.js";
import {
  syncPaidAbilitiesFromRecords,
  type AbilityRecord,
} from "../src/effects/abilityRecord.js";
import { trashCard } from "../src/state/procedures/trash.js";
import type { ServerId, ZoneId } from "../src/state/types.js";

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.147.26");
});

function must(state: GameState, action: Action): GameState {
  const result = applyAction(state, action);
  if (!result.ok) throw new Error(`${state.timingKey}: ${result.error}`);
  return result.state;
}

/** A table without the fixture's starting grip and R&D cards. */
function table(): GameState {
  const s = createInitialState();
  for (const id of [...s.runner.hand, ...s.corp.deck]) delete s.cards[id];
  s.runner.hand = [];
  s.corp.deck = [];
  return s;
}

function put(s: GameState, defId: string, id: string, zone: string) {
  const card = instantiateCard(defId, id, zone as ZoneId);
  s.cards[id] = card;
  return card;
}

function run(s: GameState, sourceId: string, effect: Effect): void {
  const r = evalEffect({ state: s, sourceId }, effect);
  if (!r.ok) throw new Error(r.error);
}

const optionIds = (s: GameState): string[] =>
  (s.pendingChoice?.options ?? []).map((o) => o.id);

function remoteWith(
  s: GameState,
  serverId: ServerId,
  cards: Array<[string, string]>,
): void {
  s.servers[serverId] = { id: serverId, kind: "remote", ice: [], root: [] };
  for (const [defId, id] of cards) {
    const card = put(s, defId, id, `server:${serverId}:root`);
    card.rezzed = true;
    card.faceup = true;
    s.servers[serverId].root.push(id);
  }
  s.nextRemoteNumber = Math.max(s.nextRemoteNumber, 2);
}

describe("La Costa Grid places on any card in its root (CR 1.18.2)", () => {
  // The cards pin still has the IR without `anyCard`; this is the IR the
  // card data will carry.
  const laCosta = fx.placeAdvancements(1, false, {
    sameServerRootAsSource: true,
    anyCard: true,
  });

  it("places on itself when it is alone in the root", () => {
    const s = table();
    remoteWith(s, "remote-1" as ServerId, [["la-costa-grid", "lc"]]);
    run(s, "lc", laCosta);
    expect(s.cards["lc"].advancementCounters).toBe(1);
  });

  it("offers every card in the root, not only ones that can be advanced", () => {
    const s = table();
    remoteWith(s, "remote-1" as ServerId, [
      ["la-costa-grid", "lc"],
      ["pad-campaign", "pad"],
      ["hostile-takeover", "agenda"],
    ]);
    run(s, "lc", laCosta);
    expect(optionIds(s)).toEqual(["adv:lc", "adv:pad", "adv:agenda"]);
    const t = must(s, { type: "choose_option", optionId: "adv:pad" });
    expect(t.cards["pad"].advancementCounters).toBe(1);
  });

  it("a card you can advance still limits Vladisibirsk-style text (CR 1.18.3)", () => {
    const s = table();
    remoteWith(s, "remote-1" as ServerId, [
      ["la-costa-grid", "lc"],
      ["pad-campaign", "pad"],
    ]);
    run(
      s,
      "lc",
      fx.placeAdvancements(1, false, { sameServerRootAsSource: true }),
    );
    expect(s.cards["lc"].advancementCounters ?? 0).toBe(0);
    expect(s.cards["pad"].advancementCounters ?? 0).toBe(0);
  });
});

describe("Dummy Box needs a grip card of the same type (CR 1.16.1)", () => {
  /** Dummy Box with the IR the card data will carry. */
  function dummyBoxTable(grip: Array<[string, string]>): GameState {
    const s = table();
    s.activeSide = "corp";
    s.timingKey = "corp.takeAction";
    const box = put(s, "dummy-box", "db", "runner:installed");
    box.faceup = true;
    box.abilities = [
      {
        ...structuredClone(box.abilities![0]!),
        cost: { trashFromGripSameTypeAsPendingTrash: true },
        onlyCorpTrashes: true,
        instructions: fx.do({
          kind: "prevent_pending_installed_trash",
          amount: 1,
        }),
      } as AbilityRecord,
    ];
    syncPaidAbilitiesFromRecords(box);
    const prog = put(s, "corroder", "prog", "runner:installed");
    prog.faceup = true;
    s.runner.installed = ["db", "prog"];
    s.runner.hand = [];
    for (const [defId, id] of grip) {
      put(s, defId, id, "runner:grip");
      s.runner.hand.push(id);
    }
    return s;
  }

  const useBox: Action = {
    type: "use_paid_ability",
    cardId: "db",
    abilityId: "dummy-box-prevent",
  };

  it("does not prevent a trash the Runner carries out (CR 1.14.5)", () => {
    const s = dummyBoxTable([["gordian-blade", "grip-prog"]]);
    trashCard(s, "prog", { by: "runner" });
    // Dummy Box is the only trash interrupt and it cannot apply, so no
    // window opens and the program is trashed.
    expect(s.pendingTrashPrevent).toBeNull();
    expect(s.runner.discardPile).toEqual(["prog"]);
    expect(s.runner.hand).toEqual(["grip-prog"]);
  });

  it("is not offered for a Runner trash even when another interrupt opens the window", () => {
    const s = dummyBoxTable([["gordian-blade", "grip-prog"]]);
    // Sacrificial Construct prevents any trash, so the window opens.
    const sc = put(s, "sacrificial-construct", "sc", "runner:installed");
    sc.faceup = true;
    s.runner.installed.push("sc");
    trashCard(s, "prog", { by: "runner" });
    expect(s.pendingTrashPrevent?.cardId).toBe("prog");
    expect(legalActions(s)).not.toContainEqual(useBox);
    expect(applyAction(s, useBox).ok).toBe(false);
  });

  it("a Corp trash the Runner lets through stays the Corp's (CR 1.14.5a)", () => {
    const s = dummyBoxTable([["gordian-blade", "grip-prog"]]);
    s.turn.runnerTrashedOwnInstalledThisTurn = false;
    trashCard(s, "prog", { by: "corp" });
    expect(s.pendingTrashPrevent?.by).toBe("corp");
    const t = must(s, { type: "accept_installed_trash" });
    expect(t.runner.discardPile).toEqual(["prog"]);
    // "You trashed any of your installed cards" is not met by a Corp trash.
    expect(t.turn.runnerTrashedOwnInstalledThisTurn).toBe(false);
  });

  it("opens the interrupt window even with no matching card, so the grip stays hidden", () => {
    const s = dummyBoxTable([["sure-gamble", "event"]]);
    trashCard(s, "prog", { by: "corp" });
    expect(s.pendingTrashPrevent?.cardId).toBe("prog");
    // ...but the Runner cannot use Dummy Box: there is no program to trash.
    expect(legalActions(s)).not.toContainEqual(useBox);
    expect(applyAction(s, useBox).ok).toBe(false);
    const t = must(s, { type: "accept_installed_trash" });
    expect(t.runner.discardPile).toContain("prog");
    expect(t.runner.hand).toEqual(["event"]);
  });

  it("trashes a same-type grip card as the cost and prevents the trash", () => {
    const s = dummyBoxTable([
      ["sure-gamble", "event"],
      ["gordian-blade", "grip-prog"],
    ]);
    trashCard(s, "prog", { by: "corp" });
    expect(legalActions(s)).toContainEqual(useBox);
    let t = must(s, useBox);
    if (t.pendingChoice) {
      // Only the program is offered as the cost card.
      expect(optionIds(t)).toContain("cost-card:grip-prog");
      expect(optionIds(t)).not.toContain("cost-card:event");
      t = must(t, { type: "choose_option", optionId: "cost-card:grip-prog" });
    }
    expect(t.runner.discardPile).toEqual(["grip-prog"]);
    expect(t.runner.installed).toContain("prog");
    expect(t.pendingTrashPrevent).toBeNull();
  });

  it("lets the Runner pick which same-type grip card pays the cost", () => {
    const s = dummyBoxTable([
      ["gordian-blade", "grip-a"],
      ["corroder", "grip-b"],
      ["sure-gamble", "event"],
    ]);
    trashCard(s, "prog", { by: "corp" });
    const asked = must(s, useBox);
    expect(optionIds(asked)).toEqual(["cost-card:grip-a", "cost-card:grip-b"]);
    const t = must(asked, {
      type: "choose_option",
      optionId: "cost-card:grip-b",
    });
    expect(t.runner.discardPile).toEqual(["grip-b"]);
    expect(t.runner.hand.sort()).toEqual(["event", "grip-a"]);
    expect(t.runner.installed).toContain("prog");
  });
});

describe("Tech Startup searches R&D for an asset (CR 8.7)", () => {
  function startupTable(): GameState {
    const s = table();
    s.activeSide = "corp";
    remoteWith(s, "remote-1" as ServerId, [["pad-campaign", "pad-installed"]]);
    for (const [defId, id] of [
      ["pad-campaign", "pad-rd"],
      ["hedge-fund", "op-rd"],
    ] as const) {
      put(s, defId, id, "corp:rd").faceup = false;
    }
    s.corp.deck = ["pad-rd", "op-rd"];
    put(s, "tech-startup", "ts", "corp:archives").faceup = true;
    s.corp.discardPile = ["ts"];
    return s;
  }
  const search = fx.do({ kind: "search_rd_asset_install" });

  it("with no asset in R&D, asks nothing and still shuffles (CR 8.7.3)", () => {
    const s = startupTable();
    s.corp.deck = ["op-rd"];
    delete s.cards["pad-rd"];
    run(s, "ts", search);
    expect(s.pendingChoice).toBeFalsy();
    expect(s.corp.deck).toEqual(["op-rd"]);
    expect(s.log.join("\n")).toContain("no asset found; shuffle R&D");
  });

  it("offers only an asset the Corp can install (CR 8.7.2b)", () => {
    const s = startupTable();
    // This copy cannot be installed: it needs bad publicity the Corp lacks.
    s.cards["pad-rd"].installRequiresCorpBadPublicityGte = 1;
    put(s, "adonis-campaign", "adonis-rd", "corp:rd").faceup = false;
    s.corp.deck.push("adonis-rd");
    run(s, "ts", search);
    expect(optionIds(s)).toEqual([
      "choose-card:adonis-rd",
      "choose-cards-done",
    ]);
  });

  it("may find nothing even with an asset in R&D (CR 8.7.2e)", () => {
    const s = startupTable();
    run(s, "ts", search);
    expect(optionIds(s)).toEqual(["choose-card:pad-rd", "choose-cards-done"]);
    const t = must(s, { type: "choose_option", optionId: "choose-cards-done" });
    expect(t.pendingChoice).toBeFalsy();
    expect([...t.corp.deck].sort()).toEqual(["op-rd", "pad-rd"]);
    expect(t.log.join("\n")).toContain("no asset found; shuffle R&D");
  });

  it("reveals the found asset and lets the Corp pick an existing remote", () => {
    const s = startupTable();
    run(s, "ts", search);
    const found = must(s, {
      type: "choose_option",
      optionId: "choose-card:pad-rd",
    });
    // Both players see which asset it was (CR 1.21.3).
    expect(found.reveals?.at(-1)?.cards.map((c) => c.title)).toEqual([
      "PAD Campaign",
    ]);
    // While the Corp picks a server, the found card is set aside, not in
    // R&D (CR 8.7.2, 4.8.4), so the R&D count is right (CR 10.2.3a).
    expect(found.corp.deck).toEqual(["op-rd"]);
    expect(found.cards["pad-rd"].zone).toBe("corp:set-aside");
    expect(optionIds(found)).toEqual([
      "install-dest:__new_remote__",
      "install-dest:remote-1",
    ]);
    // The asset already there is trashed to make room (CR 8.5.6a).
    const t = must(found, {
      type: "choose_option",
      optionId: "install-dest:remote-1",
    });
    expect(t.servers["remote-1"]?.root).toContain("pad-rd");
    expect(t.cards["pad-installed"].zone).toBe("corp:archives");
    expect(t.corp.deck).toEqual(["op-rd"]);
    expect(t.corp.corpSetAside ?? []).toEqual([]);
  });
});
