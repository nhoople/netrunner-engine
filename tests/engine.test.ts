import { describe, expect, it, beforeAll } from "vitest";
import {
  applyAction,
  legalActions,
  createInitialState,
  runVerticalSlice,
  CR,
  CORP_STEPS,
  loadPin,
  loadIndex,
  idForNumber,
  assertPinnedTag,
  crDataPresent,
} from "../src/index.js";

beforeAll(() => {
  if (!crDataPresent()) {
    throw new Error("Run `npm run fetch-cr` before tests (needs network once).");
  }
  assertPinnedTag("v26.03");
});

describe("CR pin v26.03", () => {
  it("records pin tag and resolves cited rule numbers via index", () => {
    const pin = loadPin();
    expect(pin.tag).toBe("v26.03");
    expect(pin.rawBase).toContain("v26.03");

    const index = loadIndex();
    expect(idForNumber("5.2.6b")).toBe("rule_corp_basic_action_credit");
    expect(index.numbers["5.2.7f"]).toBe("runner_basic_action_run");
    expect(index.numbers["1.11.2a"]).toBe(CR.corpAllottedClicks.id);
    expect(index.numbers["6.7.2"]).toBe(CR.successfulRun.id);
    expect(index.numbers["7.4.1a"]).toBe(CR.remoteCandidates.id);
  });
});

describe("timing labels", () => {
  it("labels corp click gain with appendix 11.2_1_a", () => {
    const state = createInitialState();
    expect(state.timing.stepId).toBe(CORP_STEPS.gainClicks.stepId);
    expect(state.timing.stepNumber).toBe("11.2_1_a");
  });

  it("gains 3 Corp clicks per CR 1.11.2a", () => {
    let s = createInitialState();
    const r = applyAction(s, { type: "pass_window" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.state.corp.clicks).toBe(3);
    expect(r.state.log.at(-1)).toContain(CR.corpAllottedClicks.number);
  });
});

describe("basic action legality", () => {
  it("rejects Corp basic credit outside action phase (CR 5.4.1 / 5.2.6b)", () => {
    const s = createInitialState();
    const r = applyAction(s, { type: "basic_gain_credit" });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.cites.map((c) => c.number)).toEqual(
      expect.arrayContaining([CR.actionPhase.number]),
    );
  });

  it("allows Corp gain credit during action phase citing 5.2.6b", () => {
    let cur = createInitialState();
    cur = must(cur, { type: "pass_window" });
    cur = must(cur, { type: "pass_window" });
    cur = must(cur, { type: "pass_window" });
    const before = cur.corp.credits;
    const r = applyAction(cur, { type: "basic_gain_credit" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.state.corp.credits).toBe(before + 1);
    expect(r.state.corp.clicks).toBe(2);
    expect(r.state.log.at(-1)).toContain(CR.corpBasicCredit.number);
  });

  it("rejects Runner run as Corp (CR 5.2.7f)", () => {
    let s = createInitialState();
    s = must(s, { type: "pass_window" });
    s = must(s, { type: "pass_window" });
    s = must(s, { type: "pass_window" });
    const r = applyAction(s, { type: "basic_run", serverId: "hq" });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.cites.map((c) => c.id)).toContain(CR.runnerBasicRun.id);
  });
});

describe("vertical slice", () => {
  it("credit/draw → install empty remote → run → access → end", () => {
    const s = runVerticalSlice();
    expect(s.done).toBe(true);

    const remote = Object.values(s.servers).find((x) => x.kind === "remote");
    expect(remote).toBeDefined();
    expect(remote!.root).toHaveLength(0);
    expect(remote!.ice.length).toBeGreaterThan(0);

    const log = s.log.join("\n");
    expect(log).toContain(CR.corpBasicDraw.number);
    expect(log).toContain(CR.corpBasicCredit.number);
    expect(log).toContain(CR.corpBasicInstall.number);
    expect(log).toContain(CR.creatingRemotes.number);
    expect(log).toContain(CR.runnerBasicRun.number);
    expect(log).toContain(CR.successfulRun.number);
    expect(log).toContain("No access candidates");
    expect(log).toContain(CR.noRunnerDrawPhase.number);
    expect(log).toContain("Vertical slice complete");
    // After Runner turn completes, cursor advances to Corp turn 2 draw phase.
    expect(s.turnNumber).toBe(2);
    expect(s.activeSide).toBe("corp");
    expect(s.timing.stepId).toBe(CORP_STEPS.gainClicks.stepId);
  });

  it("lists run on empty remote among legal Runner actions", () => {
    // Mid-slice: after Corp installs, on Runner take-action
    let s = createInitialState();
    s = must(s, { type: "pass_window" });
    s = must(s, { type: "pass_window" });
    s = must(s, { type: "pass_window" });
    s = must(s, { type: "basic_draw" });
    s = must(s, { type: "pass_window" });
    s = must(s, { type: "basic_gain_credit" });
    s = must(s, { type: "pass_window" });
    const iceId = s.corp.hand.find((id) => s.cards[id].type === "ice")!;
    s = must(s, {
      type: "basic_install",
      cardId: iceId,
      destination: { kind: "new_remote" },
    });
    s = must(s, { type: "pass_window" });
    s = must(s, { type: "discard_to_hand_size" });
    s = must(s, { type: "pass_window" });
    s = must(s, { type: "pass_window" });
    s = must(s, { type: "pass_window" });

    const legal = legalActions(s);
    const remoteRun = legal.find(
      (a) => a.type === "basic_run" && a.serverId.startsWith("remote-"),
    );
    expect(remoteRun).toBeDefined();
  });
});

function must(
  state: ReturnType<typeof createInitialState>,
  action: Parameters<typeof applyAction>[1],
) {
  const r = applyAction(state, action);
  if (!r.ok) throw new Error(r.error);
  return r.state;
}
