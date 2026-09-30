/**
 * CR adherence M1: Crisium / Flagship success ternary (CR 6.8.4a).
 * Reaching Success Phase with runsCannotBeSuccessful must leave
 * `run.successful === null` — not collapse to unsuccessful.
 */
import { describe, expect, it, beforeAll } from "vitest";
import {
  applyAction,
  assertCardsPinnedTag,
  assertPinnedTag,
  cardsDataPresent,
  createInitialState,
  crDataPresent,
  CR,
  evalEffect,
  fx,
  getCardDef,
  instantiateCard,
} from "../src/index.js";
import type { Action, GameState, ServerId } from "../src/state/types.js";

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.107.0");
});

function must(state: GameState, action: Action): GameState {
  const r = applyAction(state, action);
  if (!r.ok) throw new Error(`${r.error} ${JSON.stringify(r.cites)}`);
  return r.state;
}

/** Runner turn, empty archives, optional rezzed upgrade on a central. */
function runnerReadyWithUpgrade(
  defId: "crisium-grid" | "flagship",
  serverId: ServerId,
): GameState {
  let s = createInitialState();
  s = structuredClone(s);
  const up = instantiateCard(defId, "up-1", `server:${serverId}:root`);
  up.rezzed = true;
  up.faceup = true;
  s.cards["up-1"] = up;
  s.servers[serverId]!.root = ["up-1"];
  s.servers[serverId]!.ice = [];
  s.servers.archives.ice = [];
  s.activeSide = "runner";
  s.timingKey = "runner.takeAction";
  s.runner.clicks = 4;
  return s;
}

describe("CR M1 — success ternary (6.8.4a)", () => {
  it("CR cite resolves for notUnsuccessfulWhenReachedSuccessPhase", () => {
    expect(CR.notUnsuccessfulWhenReachedSuccessPhase).toEqual({
      number: "6.8.4a",
      id: "rule_not_unsuccessful_when_reached_success_phase",
    });
    expect(getCardDef("crisium-grid").runsCannotBeSuccessful).toBe(true);
    expect(getCardDef("flagship").runsCannotBeSuccessful).toBe(true);
  });

  it("Crisium: Success Phase reached → successful null, not unsuccessful (CR 6.8.4a)", () => {
    let s = runnerReadyWithUpgrade("crisium-grid", "archives");
    s = must(s, { type: "basic_run", serverId: "archives" });

    // Run finished; no active run shell.
    expect(s.run).toBeNull();
    expect(
      s.log.some((l) =>
        l.includes(CR.notUnsuccessfulWhenReachedSuccessPhase.number),
      ),
    ).toBe(true);
    expect(s.log.some((l) => /Run complete — unsuccessful/.test(l))).toBe(
      false,
    );
    expect(
      s.log.some((l) =>
        /Run complete — neither successful nor unsuccessful/.test(l),
      ),
    ).toBe(true);
    expect(s.turn.successfulRunThisTurn).toBe(false);
    expect(s.turn.successfulArchivesRunThisTurn).toBe(false);
  });

  it("Flagship on HQ: blocked success is not run_unsuccessful (CR 6.8.4a)", () => {
    let s = runnerReadyWithUpgrade("flagship", "hq");
    // Empty ice so the run walks to Success Phase immediately.
    s.servers.hq.ice = [];

    // Capture ternary mid-success by evaluating conds against a synthetic
    // post-success state that mirrors the host outcome.
    const mid = structuredClone(s);
    mid.run = {
      attackedServerId: "hq",
      phase: "success",
      position: null,
      successful: null,
      accessedCardIds: [],
      accessCandidates: [],
      accessRemaining: null,
      encounter: null,
      endedTheRun: false,
      cannotJackOut: false,
      strengthBoosts: {},
      encounterStrengthBoosts: {},
      iceStrengthBoosts: {},
      accessingCardId: null,
    };
    const src = instantiateCard("phoneutria", "ph-1", "server:hq:ice");
    mid.cards["ph-1"] = src;
    expect(
      evalEffect(
        { state: mid, sourceId: "ph-1" },
        {
          op: "if",
          cond: { op: "run_unsuccessful" },
          then: fx.do({ kind: "give_tags", amount: 1 }),
        },
      ).ok,
    ).toBe(true);
    expect(mid.runner.tags).toBe(0);
    expect(
      evalEffect(
        { state: mid, sourceId: "ph-1" },
        {
          op: "if",
          cond: { op: "run_successful" },
          then: fx.do({ kind: "give_tags", amount: 1 }),
        },
      ).ok,
    ).toBe(true);
    expect(mid.runner.tags).toBe(0);

    s = must(s, { type: "basic_run", serverId: "hq" });
    expect(s.run).toBeNull();
    expect(s.turn.successfulRunThisTurn).toBe(false);
    expect(s.turn.successfulHqRunThisTurn).toBe(false);
    expect(
      s.log.some((l) =>
        l.includes(CR.notUnsuccessfulWhenReachedSuccessPhase.number),
      ),
    ).toBe(true);
  });

  it("ETR still declares unsuccessful (successful === false)", () => {
    let s = createInitialState();
    s = structuredClone(s);
    s.activeSide = "runner";
    s.timingKey = "runner.takeAction";
    s.runner.clicks = 4;
    s.run = {
      attackedServerId: "hq",
      phase: "encounter",
      position: 0,
      successful: null,
      accessedCardIds: [],
      accessCandidates: [],
      accessRemaining: null,
      encounter: {
        iceId: "corp-ice-1",
        unbroken: [0],
        resolved: [],
        strengthBoost: 0,
      },
      endedTheRun: false,
      cannotJackOut: false,
      strengthBoosts: {},
      encounterStrengthBoosts: {},
      iceStrengthBoosts: {},
      accessingCardId: null,
    };
    const r = evalEffect(
      { state: s, sourceId: "corp-ice-1" },
      fx.etr(),
    );
    expect(r.ok).toBe(true);
    expect(s.run!.successful).toBe(false);
    expect(s.run!.endedTheRun).toBe(true);
    expect(
      evalEffect(
        { state: s, sourceId: "corp-ice-1" },
        {
          op: "if",
          cond: { op: "run_unsuccessful" },
          then: fx.do({ kind: "give_tags", amount: 1 }),
        },
      ).ok,
    ).toBe(true);
    expect(s.runner.tags).toBe(1);
  });
});
