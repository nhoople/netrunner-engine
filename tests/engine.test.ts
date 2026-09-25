import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, beforeAll } from "vitest";
import {
  applyAction,
  legalActions,
  createInitialState,
  runVerticalSlice,
  CR,
  CORP_STEPS,
  RUNNER_STEPS,
  STEPS,
  getStep,
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

function must(
  state: ReturnType<typeof createInitialState>,
  action: Parameters<typeof applyAction>[1],
) {
  const r = applyAction(state, action);
  if (!r.ok) throw new Error(r.error);
  return r.state;
}

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

describe("timing step graph", () => {
  it("every graph stepId exists in pinned timing-structures.json", () => {
    const root = join(dirname(fileURLToPath(import.meta.url)), "..");
    const timing = JSON.parse(
      readFileSync(join(root, "vendor/cr-data/timing-structures.json"), "utf8"),
    ) as Array<{ id: string }>;
    const ids = new Set(timing.map((n) => n.id));
    for (const step of Object.values(STEPS)) {
      expect(ids.has(step.stepId), step.key).toBe(true);
    }
  });

  it("labels corp click gain with appendix 11.2_1_a", () => {
    const state = createInitialState();
    expect(state.timingKey).toBe("corp.gainClicks");
    expect(state.timing.stepId).toBe(CORP_STEPS.gainClicks.stepId);
    expect(state.timing.stepNumber).toBe("11.2_1_a");
  });

  it("pass on gainClicks auto-walks PAW/recurring/begin → mandatoryDraw (11.2_1_e)", () => {
    let s = createInitialState();
    s = must(s, { type: "pass_window" });
    expect(s.corp.clicks).toBe(3);
    expect(s.timingKey).toBe("corp.mandatoryDraw");
    expect(s.timing.stepId).toBe("sec_appendix_timing_structure_corps_turn_1_e");
    expect(s.log.some((l) => l.includes(CR.corpAllottedClicks.number))).toBe(
      true,
    );
  });

  it("mandatory draw then action PAW → takeAction cites 11.2_2_b_ii", () => {
    let s = createInitialState();
    s = must(s, { type: "pass_window" });
    s = must(s, { type: "pass_window" });
    expect(s.timingKey).toBe("corp.actionPaw");
    expect(s.timing.stepNumber).toBe("11.2_2_a");
    s = must(s, { type: "pass_window" });
    expect(s.timingKey).toBe("corp.takeAction");
    expect(getStep(s).stepId).toBe(CORP_STEPS.takeAction.stepId);
    expect(legalActions(s).some((a) => a.type === "basic_gain_credit")).toBe(
      true,
    );
  });

  it("runner gainClicks auto-walks to action PAW (no draw phase, CR 5.3.3)", () => {
    let s = createInitialState();
    // Fast-forward Corp turn minimally via vertical path start of runner:
    s = must(s, { type: "pass_window" }); // clicks
    s = must(s, { type: "pass_window" }); // draw
    s = must(s, { type: "pass_window" }); // → takeAction
    // burn 3 clicks
    s = must(s, { type: "basic_gain_credit" });
    s = must(s, { type: "pass_window" });
    s = must(s, { type: "basic_gain_credit" });
    s = must(s, { type: "pass_window" });
    s = must(s, { type: "basic_gain_credit" });
    s = must(s, { type: "pass_window" }); // actionPhaseEnd → discard
    s = must(s, { type: "discard_to_hand_size" });
    expect(s.timingKey).toBe("corp.turnComplete");
    s = must(s, { type: "pass_window" });
    expect(s.timingKey).toBe("runner.gainClicks");
    s = must(s, { type: "pass_window" });
    expect(s.runner.clicks).toBe(4);
    expect(s.timingKey).toBe("runner.actionPaw");
    expect(s.log.some((l) => l.includes(CR.noRunnerDrawPhase.number))).toBe(
      true,
    );
    expect(s.timing.stepId).toBe(RUNNER_STEPS.actionWindow.stepId);
  });
});

describe("basic action legality wired to timing window", () => {
  it("rejects Corp basic credit outside take-action step (CR 5.4.1)", () => {
    const s = createInitialState();
    const r = applyAction(s, { type: "basic_gain_credit" });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.cites.map((c) => c.number)).toEqual(
      expect.arrayContaining([CR.actionPhase.number]),
    );
  });

  it("rejects Corp basic credit while still on action PAW (11.2_2_a)", () => {
    let s = createInitialState();
    s = must(s, { type: "pass_window" });
    s = must(s, { type: "pass_window" });
    expect(s.timingKey).toBe("corp.actionPaw");
    const r = applyAction(s, { type: "basic_gain_credit" });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.cites.map((c) => c.id)).toContain(CR.actionPhase.id);
  });

  it("allows Corp gain credit only at takeAction citing 5.2.6b", () => {
    let cur = createInitialState();
    cur = must(cur, { type: "pass_window" });
    cur = must(cur, { type: "pass_window" });
    cur = must(cur, { type: "pass_window" });
    expect(cur.timingKey).toBe("corp.takeAction");
    const before = cur.corp.credits;
    const r = applyAction(cur, { type: "basic_gain_credit" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.state.corp.credits).toBe(before + 1);
    expect(r.state.corp.clicks).toBe(2);
    expect(r.state.timingKey).toBe("corp.actionPaw");
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
    expect(log).toContain("11.4_2_a");
    expect(log).toContain("11.4_2_c_ii");
    expect(s.turnNumber).toBe(2);
    expect(s.activeSide).toBe("corp");
    expect(s.timingKey).toBe("corp.gainClicks");
  });

  it("lists run on empty remote among legal Runner actions at takeAction", () => {
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
    expect(s.timingKey).toBe("runner.takeAction");

    const legal = legalActions(s);
    const remoteRun = legal.find(
      (a) => a.type === "basic_run" && a.serverId.startsWith("remote-"),
    );
    expect(remoteRun).toBeDefined();
  });
});
