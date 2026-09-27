/**
 * Midnight Sun Virtuoso cluster:
 * onFirstSuccessfulMarkRunThisTurn + bonus_access + breach_server_when_run_ends;
 * console limit already enforced on install (CR 3.8.5b).
 */
import { describe, expect, it, beforeAll } from "vitest";
import {
  applyAction,
  assertCardsPinnedTag,
  assertPinnedTag,
  cardsDataPresent,
  createInitialState,
  crDataPresent,
  fx,
  getCardDef,
  instantiateCard,
  validateEffectTree,
} from "../src/index.js";
import type { ServerId } from "../src/state/types.js";

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v0.76.0");
});

function must(
  state: ReturnType<typeof createInitialState>,
  action: Parameters<typeof applyAction>[1],
) {
  const r = applyAction(state, action);
  if (!r.ok) throw new Error(`${r.error} ${JSON.stringify(r.cites)}`);
  return r.state;
}

function virtuosoMarkEffect() {
  return fx.if(
    { op: "attacking_hq" },
    fx.bonusAccess(1),
    fx.breachServerWhenRunEnds("hq"),
  );
}

describe("MS Virtuoso mark-HQ IR (always)", () => {
  it("accepts Virtuoso-shaped onFirstSuccessfulMarkRunThisTurn Effect IR", () => {
    expect(validateEffectTree(virtuosoMarkEffect())).toBeNull();
  });

  it("HQ mark → +1 bonus access during mark breach", () => {
    let s = createInitialState();
    s = structuredClone(s);
    s.markServerId = "hq";

    const v = instantiateCard("virtuoso", "v-1", "runner:rig");
    v.onFirstSuccessfulMarkRunThisTurn = virtuosoMarkEffect();
    s.cards["v-1"] = v;
    s.runner.rig = ["v-1"];

    // Two cards in HQ so bonus access can add a second candidate.
    const a = instantiateCard("hedge-fund", "hq-a", "corp:hq");
    const b = instantiateCard("hedge-fund", "hq-b", "corp:hq");
    s.cards["hq-a"] = a;
    s.cards["hq-b"] = b;
    s.corp.hand = ["hq-a", "hq-b"];
    s.servers.hq.ice = [];
    s.servers.hq.root = [];
    s.activeSide = "runner";
    s.timingKey = "runner.takeAction";
    s.runner.clicks = 4;

    s = must(s, { type: "basic_run", serverId: "hq" as ServerId });
    expect(s.turn.successfulMarkRunThisTurn).toBe(true);
    expect(s.turn.successfulRunThisTurn).toBe(true);
    // Still mid-breach with bonus access.
    expect(s.run?.bonusAccess).toBe(1);
    expect(s.timingKey).toBe("breach.awaitAccess");
    expect(s.run?.accessRemaining).toBeGreaterThanOrEqual(2);
    expect(s.run?.accessCandidates.length).toBeGreaterThanOrEqual(2);

    // Finish breach — non-agenda access auto-continues.
    while (s.run && s.timingKey === "breach.awaitAccess") {
      if (s.run.accessCandidates.length === 0) {
        s = must(s, { type: "finish_breach" });
        break;
      }
      const cand = s.run.accessCandidates[0]!;
      s = must(s, { type: "access_card", cardId: cand });
    }
    expect(s.run).toBeNull();
  });

  it("non-HQ mark → post-run HQ breach (not a successful HQ run)", () => {
    let s = createInitialState();
    s = structuredClone(s);
    s.markServerId = "archives";

    const v = instantiateCard("virtuoso", "v-2", "runner:rig");
    v.onFirstSuccessfulMarkRunThisTurn = virtuosoMarkEffect();
    s.cards["v-2"] = v;
    s.runner.rig = ["v-2"];

    const hqCard = instantiateCard("hedge-fund", "hq-1", "corp:hq");
    s.cards["hq-1"] = hqCard;
    s.corp.hand = ["hq-1"];
    s.servers.archives.ice = [];
    s.servers.archives.root = [];
    s.corp.discard = [];
    s.activeSide = "runner";
    s.timingKey = "runner.takeAction";
    s.runner.clicks = 4;

    s = must(s, { type: "basic_run", serverId: "archives" as ServerId });
    expect(s.turn.successfulMarkRunThisTurn).toBe(true);
    // Archives empty → mark breach auto-completes; then post-run HQ breach.
    expect(s.run?.isPostRunBreach).toBe(true);
    expect(s.run?.attackedServerId).toBe("hq");
    expect(s.run?.successful).toBeNull();
    expect(s.timingKey).toBe("breach.awaitAccess");
    expect(s.turn.successfulHqRunThisTurn).toBe(false);

    s = must(s, { type: "access_card", cardId: "hq-1" });
    expect(s.run).toBeNull();
    expect(s.turn.successfulHqRunThisTurn).toBe(false);
    expect(s.log.some((l) => /Post-run breach of hq/i.test(l))).toBe(true);
  });

  it("fires only on the first successful mark run each turn", () => {
    let s = createInitialState();
    s = structuredClone(s);
    s.markServerId = "archives";

    const v = instantiateCard("virtuoso", "v-3", "runner:rig");
    v.onFirstSuccessfulMarkRunThisTurn = virtuosoMarkEffect();
    s.cards["v-3"] = v;
    s.runner.rig = ["v-3"];
    s.servers.archives.ice = [];
    s.corp.discard = [];
    s.corp.hand = [];
    s.activeSide = "runner";
    s.timingKey = "runner.takeAction";
    s.runner.clicks = 4;

    s = must(s, { type: "basic_run", serverId: "archives" as ServerId });
    expect(s.turn.successfulMarkRunThisTurn).toBe(true);
    const postLogs = s.log.filter((l) => /Post-run breach of hq/i.test(l));
    expect(postLogs).toHaveLength(1);

    // Drain empty HQ post-run breach if still open
    while (s.run && s.timingKey === "breach.awaitAccess") {
      if (s.run.accessCandidates.length === 0) {
        s = must(s, { type: "finish_breach" });
      } else {
        const cand = s.run.accessCandidates[0]!;
        s = must(s, { type: "access_card", cardId: cand });
      }
    }

    if (s.timingKey === "runner.actionPaw") {
      s = must(s, { type: "pass_window" });
    }
    expect(s.timingKey).toBe("runner.takeAction");
    s.runner.clicks = 4;
    const logLen = s.log.length;
    s = must(s, { type: "basic_run", serverId: "archives" as ServerId });
    const newPost = s.log
      .slice(logLen)
      .filter((l) => /Post-run breach of hq/i.test(l));
    expect(newPost).toHaveLength(0);
  });

  it("non-mark successful run does not consume the mark trigger", () => {
    let s = createInitialState();
    s = structuredClone(s);
    s.markServerId = "hq";

    const v = instantiateCard("virtuoso", "v-4", "runner:rig");
    v.onFirstSuccessfulMarkRunThisTurn = virtuosoMarkEffect();
    s.cards["v-4"] = v;
    s.runner.rig = ["v-4"];
    s.servers.archives.ice = [];
    s.corp.discard = [];
    s.activeSide = "runner";
    s.timingKey = "runner.takeAction";
    s.runner.clicks = 4;

    s = must(s, { type: "basic_run", serverId: "archives" as ServerId });
    expect(s.turn.successfulMarkRunThisTurn).toBe(false);
    expect(s.turn.successfulRunThisTurn).toBe(true);
    expect(s.log.some((l) => /bonus access|Post-run breach/i.test(l))).toBe(
      false,
    );
  });

  it("installing a second console trashes the first (CR 3.8.5b)", () => {
    let s = createInitialState();
    s = structuredClone(s);
    const first = instantiateCard("virtuoso", "con-1", "runner:grip");
    const second = instantiateCard("endurance", "con-2", "runner:grip");
    s.cards["con-1"] = first;
    s.cards["con-2"] = second;
    s.runner.hand = ["con-1", "con-2"];
    s.runner.credits = 20;
    s.runner.clicks = 4;
    s.activeSide = "runner";
    s.timingKey = "runner.takeAction";

    s = must(s, { type: "basic_install", cardId: "con-1", destination: { kind: "rig" } });
    expect(s.runner.rig).toContain("con-1");
    if (s.timingKey === "runner.actionPaw") {
      s = must(s, { type: "pass_window" });
    }
    s = must(s, { type: "basic_install", cardId: "con-2", destination: { kind: "rig" } });
    expect(s.runner.rig).toContain("con-2");
    expect(s.runner.rig).not.toContain("con-1");
    expect(s.runner.discard).toContain("con-1");
    expect(s.log.some((l) => /console limit/i.test(l))).toBe(true);
  });
});

describe("MS Virtuoso / console card wiring (v0.31.0+)", () => {
  it("Virtuoso fully wired; Endurance and Marrow console notes cleared", () => {
    expect(getCardDef("virtuoso").unsupported).toEqual([]);
    expect(getCardDef("endurance").unsupported).toEqual([]);
    expect(getCardDef("marrow").unsupported).toEqual([]);
    expect(getCardDef("virtuoso").onFirstSuccessfulMarkRunThisTurn).toBeTruthy();
    expect(
      validateEffectTree(getCardDef("virtuoso").onFirstSuccessfulMarkRunThisTurn!),
    ).toBeNull();
    expect(getCardDef("virtuoso").onTurnBegin).toEqual(fx.identifyMark());
  });
});
