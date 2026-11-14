/**
 * Project Yagi-Uda swaps 1 HQ card with 1 card in the root of or protecting
 * the attacked server (CR 8.8.2, 8.8.4b, 6.2.7c, 6.2.7e).
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
  instantiateCard,
} from "../src/index.js";
import { iceAtRunnerPosition } from "../src/state/runPosition.js";
import type { Action, GameState, ServerId } from "../src/state/types.js";

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.147.23");
});

function must(s: GameState, action: Action): GameState {
  const r = applyAction(s, action);
  if (!r.ok) throw new Error(`${action.type}: ${r.error}`);
  return r.state;
}

const pass = (s: GameState): GameState => must(s, { type: "pass_window" });
const logged = (s: GameState): string => s.log.join("\n");

function addCard(s: GameState, def: string, id: string, zone: string, rezzed = false) {
  const card = instantiateCard(def, id, zone);
  card.rezzed = rezzed;
  card.faceup = rezzed;
  s.cards[id] = card;
  return card;
}

/** A run on `serverId`, protected by Ice Wall "a" (outer) and Enigma "b". HQ holds `hand`. */
function runOn(
  serverId: ServerId,
  hand: Array<[def: string, id: string]>,
  root: Array<[def: string, id: string]> = [],
): GameState {
  const s = createInitialState();
  if (!s.servers[serverId]) {
    s.servers[serverId] = { id: serverId, kind: "remote", ice: [], root: [] };
  }
  addCard(s, "ice-wall", "a", `server:${serverId}:ice`, true);
  addCard(s, "enigma", "b", `server:${serverId}:ice`, true);
  s.servers[serverId]!.ice = ["a", "b"];
  for (const [def, id] of root) addCard(s, def, id, `server:${serverId}:root`, true);
  s.servers[serverId]!.root = root.map(([, id]) => id);
  for (const [def, id] of hand) addCard(s, def, id, "corp:hq");
  s.corp.hand = hand.map(([, id]) => id);
  s.runner.credits = 20;
  s.runner.clicks = 4;
  s.corp.credits = 20;
  s.activeSide = "runner";
  s.timingKey = "runner.takeAction";
  return must(s, { type: "basic_run", serverId });
}

function encountering(s: GameState, iceId: string): GameState {
  let t = s;
  for (let i = 0; i < 12 && t.run?.encounter?.iceId !== iceId; i += 1) t = pass(t);
  expect(t.run?.encounter?.iceId).toBe(iceId);
  expect(t.timingKey).toBe("run.encounterPaw");
  return t;
}

function pick(s: GameState, hqCardId: string, serverCardId: string) {
  return evalEffect(
    { state: s, sourceId: "yagi" },
    { op: "do", action: { kind: "swap_yagi_hq_with_attacked_pick", hqCardId, serverCardId } },
  );
}

function offeredPairs(s: GameState): string[] {
  addCard(s, "project-yagi-uda", "yagi", "corp:scored");
  const r = evalEffect(
    { state: s, sourceId: "yagi" },
    { op: "do", action: { kind: "swap_yagi_hq_with_attacked_root_or_ice" } },
  );
  expect(r.ok).toBe(true);
  return (s.pendingChoice?.options ?? []).map((o) => o.id).sort();
}

describe("Project Yagi-Uda swaps the encountered ice into HQ (CR 8.8.4b, 6.2.7c)", () => {
  it("ends the encounter; no subroutine of the swapped-out ice resolves", () => {
    const s = encountering(runOn("hq", [["ice-wall", "new"]]), "a");
    expect(pick(s, "new", "a").ok).toBe(true);
    expect(s.cards["a"]?.zone).toBe("corp:hq");
    expect(s.servers.hq.ice).toEqual(["new", "b"]);
    expect(s.run?.encounter?.iceUninstalled).toBe(true);
    // The position still exists; the HQ card now occupies it (CR 6.2.4).
    expect(s.run?.positionVacated ?? false).toBe(false);
    expect(iceAtRunnerPosition(s)).toBe("new");
    expect(logged(s)).not.toContain("6.2.7e");

    const t = pass(s);
    expect(logged(t)).not.toContain('Resolve subroutine "End the run."');
    expect(t.run?.endedTheRun ?? false).toBe(false);
    expect(t.run?.phase).toBe("movement");
    expect(t.timingKey).toBe("run.jackOutWindow");
  });

  it("the Runner then moves inward from that position to the next ice", () => {
    let s = encountering(runOn("hq", [["ice-wall", "new"]]), "a");
    pick(s, "new", "a");
    s = pass(s);
    s = must(s, { type: "continue_run" });
    for (let i = 0; i < 4 && s.timingKey !== "run.approachPaw"; i += 1) s = pass(s);
    expect(s.timingKey).toBe("run.approachPaw");
    expect(s.run?.position).toBe(1);
    expect(iceAtRunnerPosition(s)).toBe("b");
    expect(logged(s)).toContain("Approach ice Enigma");
  });
});

describe("Project Yagi-Uda only swaps a card into a location it may occupy (CR 8.8.2)", () => {
  it("offers ice for ice, and an upgrade for a root upgrade on a central", () => {
    const s = encountering(
      runOn(
        "hq",
        [
          ["ice-wall", "h-ice"],
          ["hostile-takeover", "h-agenda"],
          ["pad-campaign", "h-asset"],
          ["manta-grid", "h-upg"],
        ],
        [["caprice-nisei", "r-upg"]],
      ),
      "a",
    );
    expect(offeredPairs(s)).toEqual(
      [
        "yagi:h-ice:a",
        "yagi:h-ice:b",
        "yagi:h-upg:r-upg",
      ].sort(),
    );
  });

  it("on a remote, an agenda or asset may replace the root asset but not sit beside it", () => {
    const s = encountering(
      runOn(
        "remote-1" as ServerId,
        [
          ["hostile-takeover", "h-agenda"],
          ["manta-grid", "h-upg"],
        ],
        [
          ["pad-campaign", "r-asset"],
          ["caprice-nisei", "r-upg"],
        ],
      ),
      "a",
    );
    expect(offeredPairs(s)).toEqual(
      [
        "yagi:h-agenda:r-asset",
        "yagi:h-upg:r-asset",
        "yagi:h-upg:r-upg",
      ].sort(),
    );
  });

  it("keeps an upgrade's server limit and the one-region limit (CR 8.5.12, 3.6.5)", () => {
    const s = encountering(
      runOn(
        "hq",
        [
          ["bio-vault", "h-remote-only"],
          ["panic-button", "h-hq-only"],
          ["breaker-bay-grid", "h-region"],
        ],
        [
          ["caprice-nisei", "r-upg"],
          ["amazon-industrial-zone", "r-region"],
        ],
      ),
      "a",
    );
    expect(offeredPairs(s)).toEqual(
      [
        "yagi:h-hq-only:r-region",
        "yagi:h-hq-only:r-upg",
        "yagi:h-region:r-region",
      ].sort(),
    );
  });

  it("a pick that names an illegal pair changes nothing", () => {
    const s = encountering(runOn("hq", [["hostile-takeover", "h-agenda"]]), "a");
    expect(pick(s, "h-agenda", "a").ok).toBe(true);
    expect(s.servers.hq.ice).toEqual(["a", "b"]);
    expect(s.corp.hand).toEqual(["h-agenda"]);
    expect(s.cards["h-agenda"]?.zone).toBe("corp:hq");
    expect(s.run?.encounter?.iceUninstalled ?? false).toBe(false);
    expect(logged(s)).toContain("8.8.2");
  });
});

describe("Project Yagi-Uda uninstalls the card it swaps out (CR 8.8.4b)", () => {
  it("trashes hosted cards and counters on the swapped-out ice", () => {
    const s = encountering(runOn("hq", [["ice-wall", "new"]]), "a");
    const parasite = addCard(s, "parasite", "par", "runner:installed");
    parasite.hostId = "a";
    s.runner.installed = ["par"];
    s.cards["a"]!.hostedCardIds = ["par"];
    s.cards["a"]!.advancementCounters = 2;

    pick(s, "new", "a");
    expect(s.cards["par"]?.zone).toBe("runner:heap");
    expect(s.cards["par"]?.hostId).toBeUndefined();
    expect(s.cards["a"]?.hostedCardIds ?? []).toEqual([]);
    expect(s.cards["a"]?.advancementCounters ?? 0).toBe(0);
    expect(logged(s)).toContain("8.8.4b");
  });
});
