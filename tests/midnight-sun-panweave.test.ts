/**
 * Midnight Sun PAN-Weave cluster:
 * onFirstSuccessfulHqRunThisTurn + lose_credits.then ("if they do") credit transfer.
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
  assertCardsPinnedTag("v1.37.1");
});

function must(
  state: ReturnType<typeof createInitialState>,
  action: Parameters<typeof applyAction>[1],
) {
  const r = applyAction(state, action);
  if (!r.ok) throw new Error(`${r.error} ${JSON.stringify(r.cites)}`);
  return r.state;
}

/** PAN-Weave printed ability as Effect IR. */
function panweaveEffect() {
  return fx.loseCredits(
    "corp",
    1,
    fx.gainCredits("runner", 1),
  );
}

function withPanweave(opts?: { corpCredits?: number; runnerCredits?: number }) {
  let s = createInitialState();
  s = structuredClone(s);
  const pw = instantiateCard("pan-weave", "pw-1", "runner:rig");
  pw.onFirstSuccessfulHqRunThisTurn = panweaveEffect();
  pw.unsupported = [];
  s.cards["pw-1"] = pw;
  s.runner.rig = ["pw-1"];
  s.corp.credits = opts?.corpCredits ?? 5;
  s.runner.credits = opts?.runnerCredits ?? 3;
  s.servers.hq.ice = [];
  s.servers.hq.root = [];
  s.servers.rd.ice = [];
  s.servers.rd.root = [];
  s.corp.hand = [];
  s.corp.deck = [];
  s.activeSide = "runner";
  s.timingKey = "runner.takeAction";
  s.runner.clicks = 4;
  return s;
}

/** Drain empty-server breach back to runner take-action. */
function finishToTakeAction(
  state: ReturnType<typeof createInitialState>,
): ReturnType<typeof createInitialState> {
  let s = state;
  while (s.run && s.timingKey === "breach.awaitAccess") {
    if (s.run.accessCandidates.length === 0) {
      s = must(s, { type: "finish_breach" });
    } else {
      s = must(s, { type: "access_card", cardId: s.run.accessCandidates[0]! });
    }
  }
  if (s.timingKey === "runner.actionPaw") {
    s = must(s, { type: "pass_window" });
  }
  return s;
}

describe("MS PAN-Weave first-HQ credit transfer (always)", () => {
  it("accepts lose_credits.then Effect IR", () => {
    expect(validateEffectTree(panweaveEffect())).toBeNull();
  });

  it("rejects malformed lose_credits.then", () => {
    expect(
      validateEffectTree({
        op: "do",
        action: {
          kind: "lose_credits",
          side: "corp",
          amount: 1,
          then: { op: "do", action: { kind: "not_a_real_primitive" } },
        },
      } as never),
    ).toMatch(/unknown kind|not_a_real/);
  });

  it("first successful HQ: Corp loses 1¢, Runner gains 1¢", () => {
    let s = withPanweave({ corpCredits: 5, runnerCredits: 3 });
    s = must(s, { type: "basic_run", serverId: "hq" as ServerId });
    expect(s.turn.successfulHqRunThisTurn).toBe(true);
    expect(s.corp.credits).toBe(4);
    expect(s.runner.credits).toBe(4);
  });

  it("second successful HQ same turn does not transfer again", () => {
    let s = withPanweave({ corpCredits: 5, runnerCredits: 3 });
    s = must(s, { type: "basic_run", serverId: "hq" as ServerId });
    expect(s.corp.credits).toBe(4);
    expect(s.runner.credits).toBe(4);

    s = finishToTakeAction(s);
    expect(s.timingKey).toBe("runner.takeAction");
    s.runner.clicks = 4;
    s = must(s, { type: "basic_run", serverId: "hq" as ServerId });
    expect(s.corp.credits).toBe(4);
    expect(s.runner.credits).toBe(4);
  });

  it("successful R&D does not trigger; later first HQ still does", () => {
    let s = withPanweave({ corpCredits: 5, runnerCredits: 3 });
    s = must(s, { type: "basic_run", serverId: "rd" as ServerId });
    expect(s.turn.successfulHqRunThisTurn).toBe(false);
    expect(s.corp.credits).toBe(5);
    expect(s.runner.credits).toBe(3);

    s = finishToTakeAction(s);
    expect(s.timingKey).toBe("runner.takeAction");
    s.runner.clicks = 4;
    s = must(s, { type: "basic_run", serverId: "hq" as ServerId });
    expect(s.turn.successfulHqRunThisTurn).toBe(true);
    expect(s.corp.credits).toBe(4);
    expect(s.runner.credits).toBe(4);
  });

  it("Corp at 0¢: loses nothing; Runner does not gain (if they do)", () => {
    let s = withPanweave({ corpCredits: 0, runnerCredits: 3 });
    s = must(s, { type: "basic_run", serverId: "hq" as ServerId });
    expect(s.turn.successfulHqRunThisTurn).toBe(true);
    expect(s.corp.credits).toBe(0);
    expect(s.runner.credits).toBe(3);
  });
});

describe("MS PAN-Weave card data (when wired)", () => {
  function panweaveWired(): boolean {
    const def = getCardDef("pan-weave");
    return (
      (def.unsupported?.length ?? 0) === 0 &&
      Boolean(def.onFirstSuccessfulHqRunThisTurn)
    );
  }

  it("pan-weave is fully clear with onFirstSuccessfulHqRunThisTurn", () => {
    if (!panweaveWired()) {
      expect(getCardDef("pan-weave").unsupported!.length).toBeGreaterThan(0);
      return;
    }
    const def = getCardDef("pan-weave");
    expect(def.unsupported).toEqual([]);
    expect(def.onInstall).toBeTruthy();
    expect(def.onFirstSuccessfulHqRunThisTurn).toBeTruthy();
    expect(validateEffectTree(def.onFirstSuccessfulHqRunThisTurn!)).toBeNull();
  });
});
