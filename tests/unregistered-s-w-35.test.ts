/**
 * Unregistered S&W '35 — "Use this hardware only if you have made a
 * successful run on HQ this turn. [click][click]: Trash 1 rezzed bioroid,
 * clone, executive, or sysop in the root of a remote server."
 *
 * The ability chooses its target (CR 1.15.2): a rezzed card in the root of
 * a remote server with one of the four subtypes. It trashes that card and
 * gains nothing. Its static restriction (CR 9.3.7a) blocks the paid ability
 * until the Runner has made a successful run on HQ this turn.
 */
import { beforeAll, describe, expect, it } from "vitest";
import {
  applyIntent,
  assertPinnedTag,
  createInitialState,
  crDataPresent,
  evalEffect,
  instantiateCard,
  loadCardCatalog,
  queryLegality,
} from "../src/index.js";
import { primitiveNameFollowsStandard } from "../src/effects/primitiveNames.js";
import type { Effect } from "../src/effects/ir.js";
import type { Action, GameState, ServerId } from "../src/state/types.js";

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  assertPinnedTag("v26.03");
  loadCardCatalog(true);
});

const USE: Action = {
  type: "use_paid_ability",
  cardId: "usw-1",
  abilityId: "unregistered-trash",
};

/** The cards-data composition for the printed ability. */
const PRINTED: Effect = {
  op: "do",
  action: {
    kind: "choose_card",
    chooser: "runner",
    zone: "remote_root",
    rezzedOnly: true,
    includeSubtypes: ["bioroid", "clone", "executive", "sysop"],
    then: {
      op: "do",
      action: { kind: "trash_corp_card", cardId: "$chosen" },
    },
  },
};

/** Runner at take-action with S&W installed and a successful HQ run. */
function runnerWithSw(): GameState {
  const s = createInitialState();
  s.cards["runner-program-1"]!.rezzed = false;
  for (const server of Object.values(s.servers)) {
    server.root = [];
    server.ice = [];
  }
  s.cards["usw-1"] = instantiateCard(
    "unregistered-s-w-35",
    "usw-1",
    "runner:installed",
  );
  s.runner.installed = ["usw-1"];
  s.activeSide = "runner";
  s.turnPhase = "runner_action";
  s.timingKey = "runner.takeAction";
  s.runner.clicks = 4;
  s.runner.credits = 5;
  s.turn.successfulHqRunThisTurn = true;
  return s;
}

function ensureServer(s: GameState, serverId: ServerId): void {
  if (s.servers[serverId]) return;
  s.servers[serverId] = {
    id: serverId,
    kind: "remote",
    ice: [],
    root: [],
  } as GameState["servers"][string];
  const n = Number(serverId.replace("remote-", ""));
  s.nextRemoteNumber = Math.max(s.nextRemoteNumber ?? 1, n + 1);
}

/** Install a Corp card in a server's root or ice. */
function corpCard(
  s: GameState,
  cardKey: string,
  id: string,
  serverId: ServerId,
  where: "root" | "ice",
  rezzed: boolean,
): void {
  ensureServer(s, serverId);
  const card = instantiateCard(cardKey, id, `server:${serverId}:${where}`);
  card.rezzed = rezzed;
  card.faceup = rezzed;
  s.cards[id] = card;
  s.servers[serverId][where].push(id);
}

function act(s: GameState, action: Action): GameState {
  const r = applyIntent(s, action);
  if (!r.ok) throw new Error(r.error);
  return r.state;
}

function offered(s: GameState): string[] {
  return (s.pendingChoice?.options ?? []).map((o) => o.id);
}

function offersAbility(s: GameState): boolean {
  return queryLegality(s).legal.some(
    (entry) =>
      entry.action.type === "use_paid_ability" &&
      entry.action.abilityId === "unregistered-trash",
  );
}

describe("Unregistered S&W '35", () => {
  it("offers rezzed bioroid, clone, executive and sysop cards in remote roots", () => {
    const s = runnerWithSw();
    corpCard(s, "alix-t4lb07", "bio-1", "remote-1", "root", true);
    corpCard(s, "caprice-nisei", "clone-1", "remote-1", "root", true);
    corpCard(s, "chairman-hiro", "exec-1", "remote-2", "root", true);
    corpCard(s, "akitaro-watanabe", "sysop-1", "remote-2", "root", true);
    const after = act(s, USE);
    expect(offered(after).sort()).toEqual(
      [
        "choose-card:bio-1",
        "choose-card:clone-1",
        "choose-card:exec-1",
        "choose-card:sysop-1",
      ].sort(),
    );
    expect(after.runner.clicks).toBe(2);
  });

  it("trashes the chosen card and gains no credits", () => {
    const s = runnerWithSw();
    corpCard(s, "chairman-hiro", "exec-1", "remote-1", "root", true);
    let after = act(s, USE);
    const credits = after.runner.credits;
    after = act(after, { type: "choose_option", optionId: "choose-card:exec-1" });
    // The emptied remote server ceases to exist (CR 4.6.8e).
    expect(after.servers["remote-1"]?.root ?? []).not.toContain("exec-1");
    expect(after.corp.discardPile).toContain("exec-1");
    expect(after.cards["exec-1"]!.zone).toBe("corp:archives");
    expect(after.runner.credits).toBe(credits);
    expect(after.runner.credits).toBe(5);
  });

  it("does not offer ice, unrezzed cards, central roots, or other subtypes", () => {
    const s = runnerWithSw();
    // Ice with a matching subtype, protecting a remote.
    corpCard(s, "eli-1-0", "ice-1", "remote-1", "ice", true);
    // Unrezzed sysop in a remote root.
    corpCard(s, "akitaro-watanabe", "unrezzed-1", "remote-1", "root", false);
    // Rezzed bioroid in a central server's root.
    corpCard(s, "ash-2x3zb9cy", "central-1", "hq", "root", true);
    // Rezzed card with another subtype in a remote root.
    corpCard(s, "pad-campaign", "pad-1", "remote-2", "root", true);
    // The one legal target.
    corpCard(s, "alix-t4lb07", "bio-1", "remote-2", "root", true);
    const after = act(s, USE);
    expect(offered(after)).toEqual(["choose-card:bio-1"]);
  });

  it("with no legal target, pays the cost and trashes nothing (CR 1.15.3)", () => {
    const s = runnerWithSw();
    corpCard(s, "eli-1-0", "ice-1", "remote-1", "ice", true);
    corpCard(s, "pad-campaign", "pad-1", "remote-1", "root", true);
    const after = act(s, USE);
    expect(after.pendingChoice ?? null).toBeNull();
    expect(after.corp.discardPile).toEqual([]);
    expect(after.runner.credits).toBe(5);
  });

  it("can be used only after a successful run on HQ this turn (CR 9.3.7a)", () => {
    const s = runnerWithSw();
    corpCard(s, "alix-t4lb07", "bio-1", "remote-1", "root", true);
    s.turn.successfulHqRunThisTurn = false;
    expect(offersAbility(s)).toBe(false);
    const refused = applyIntent(s, USE);
    expect(refused.ok).toBe(false);
    if (!refused.ok) expect(refused.error).toContain("successful run on HQ");
    s.turn.successfulHqRunThisTurn = true;
    expect(offersAbility(s)).toBe(true);
    expect(applyIntent(s, USE).ok).toBe(true);
  });

  it("a subtype filter does not match a facedown card the chooser cannot see (CR 1.21.2)", () => {
    const s = runnerWithSw();
    corpCard(s, "akitaro-watanabe", "hidden-1", "remote-1", "root", false);
    const r = evalEffect({ state: s, sourceId: "usw-1" }, {
      op: "do",
      action: {
        kind: "choose_card",
        chooser: "runner",
        zone: "remote_root",
        includeSubtypes: ["sysop"],
        then: { op: "do", action: { kind: "trash_corp_card", cardId: "$chosen" } },
      },
    });
    expect(r.ok).toBe(true);
    expect(s.pendingChoice ?? null).toBeNull();
  });

  it("the cards composition and the pinned card-titled kind resolve the same", () => {
    expect(primitiveNameFollowsStandard("choose_card")).toBe(true);
    for (const effect of [
      PRINTED,
      {
        op: "do",
        action: { kind: "trash_unregistered_rezzed_ice_gain_per_strength" },
      } as Effect,
    ]) {
      const s = runnerWithSw();
      corpCard(s, "eli-1-0", "ice-1", "remote-1", "ice", true);
      corpCard(s, "akitaro-watanabe", "sysop-1", "remote-1", "root", true);
      const r = evalEffect({ state: s, sourceId: "usw-1" }, effect);
      expect(r.ok).toBe(true);
      expect(offered(s)).toEqual(["choose-card:sysop-1"]);
    }
  });
});
