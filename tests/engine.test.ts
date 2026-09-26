import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, beforeAll } from "vitest";
import {
  applyAction,
  legalActions,
  createInitialState,
  runVerticalSlice,
  runIceBreakSlice,
  runIceEtrSlice,
  setupEmptyRemoteWithIce,
  CR,
  CORP_STEPS,
  RUNNER_STEPS,
  STEPS,
  getStep,
  loadPin,
  loadIndex,
  idForNumber,
  assertPinnedTag,
  assertPinnedFilesPresent,
  crDataPresent,
  vendorPathForPinFile,
} from "../src/index.js";
import type { ServerId } from "../src/state/types.js";

beforeAll(() => {
  if (!crDataPresent()) {
    throw new Error("Run `npm run fetch-cr` before tests (needs network once).");
  }
  assertPinnedTag("v26.03");
  assertPinnedFilesPresent();
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
    expect(pin.files).toEqual(
      expect.arrayContaining([
        "data/index.json",
        "data/timing-structures.json",
        "data/nodes.json",
      ]),
    );
    const index = loadIndex();
    expect(idForNumber("5.2.6b")).toBe("rule_corp_basic_action_credit");
    expect(index.numbers["8.1.2a"]).toBe(CR.rezInPaw.id);
    expect(index.numbers["6.5.4"]).toBe(CR.encounterBreakPaw.id);
    expect(index.numbers["6.6.3"]).toBe(CR.jackOutMovement.id);
    expect(index.numbers["6.8.4"]).toBe(CR.unsuccessfulRun.id);
    expect(index.numbers["3.9.5b"]).toBe(CR.icebreakerStrengthImplicit.id);
    expect(index.numbers["3.9.5g"]).toBe(CR.icebreakerInterfaceStrength.id);
    expect(index.numbers["9.5.1"]).toBe(CR.paidAbility.id);
  });

  it("vendors every pin-listed file including nodes.json", () => {
    const pin = loadPin();
    for (const rel of pin.files) {
      const path = vendorPathForPinFile(rel);
      expect(existsSync(path), path).toBe(true);
    }
    const nodes = JSON.parse(
      readFileSync(vendorPathForPinFile("data/nodes.json"), "utf8"),
    ) as Array<{ id: string; number: string }>;
    expect(nodes.length).toBeGreaterThan(1000);
    const byNumber = new Map(nodes.map((n) => [n.number, n.id]));
    expect(byNumber.get("5.2.6b")).toBe("rule_corp_basic_action_credit");
    expect(byNumber.get("6.5.4")).toBe(CR.encounterBreakPaw.id);
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

  it("pass on gainClicks auto-walks → mandatoryDraw (11.2_1_e)", () => {
    let s = createInitialState();
    s = must(s, { type: "pass_window" });
    expect(s.corp.clicks).toBe(3);
    expect(s.timingKey).toBe("corp.mandatoryDraw");
  });

  it("mandatory draw then action PAW → takeAction", () => {
    let s = createInitialState();
    s = must(s, { type: "pass_window" });
    s = must(s, { type: "pass_window" });
    s = must(s, { type: "pass_window" });
    expect(s.timingKey).toBe("corp.takeAction");
    expect(getStep(s).stepId).toBe(CORP_STEPS.takeAction.stepId);
  });

  it("runner gainClicks lands on action PAW (CR 5.3.3)", () => {
    let s = createInitialState();
    s = must(s, { type: "pass_window" });
    s = must(s, { type: "pass_window" });
    s = must(s, { type: "pass_window" });
    s = must(s, { type: "basic_gain_credit" });
    s = must(s, { type: "pass_window" });
    s = must(s, { type: "basic_gain_credit" });
    s = must(s, { type: "pass_window" });
    s = must(s, { type: "basic_gain_credit" });
    s = must(s, { type: "pass_window" });
    s = must(s, { type: "discard_to_hand_size" });
    s = must(s, { type: "pass_window" });
    s = must(s, { type: "pass_window" });
    expect(s.timingKey).toBe("runner.actionPaw");
    expect(s.timing.stepId).toBe(RUNNER_STEPS.actionWindow.stepId);
    expect(s.log.some((l) => l.includes(CR.noRunnerDrawPhase.number))).toBe(
      true,
    );
  });
});

describe("basic action legality", () => {
  it("rejects Corp basic credit outside take-action step", () => {
    const s = createInitialState();
    const r = applyAction(s, { type: "basic_gain_credit" });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.cites.map((c) => c.number)).toContain(CR.actionPhase.number);
  });

  it("allows Corp gain credit at takeAction citing 5.2.6b", () => {
    let cur = createInitialState();
    cur = must(cur, { type: "pass_window" });
    cur = must(cur, { type: "pass_window" });
    cur = must(cur, { type: "pass_window" });
    const r = applyAction(cur, { type: "basic_gain_credit" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.state.log.at(-1)).toContain(CR.corpBasicCredit.number);
  });
});

describe("vertical slice (decline rez)", () => {
  it("credit/draw → install → run → approach pass → jack-out pass → breach → end", () => {
    const s = runVerticalSlice();
    expect(s.done).toBe(true);
    const log = s.log.join("\n");
    expect(log).toContain(CR.corpBasicInstall.number);
    expect(log).toContain("11.4_2_b");
    expect(log).toContain("11.4_2_c_ii");
    expect(log).toContain("11.4_4_c");
    expect(log).toContain(CR.successfulRun.number);
    expect(log).toContain("No access candidates");
    expect(s.timingKey).toBe("corp.gainClicks");
  });

  it("lists run on empty remote at takeAction", () => {
    const s = setupEmptyRemoteWithIce();
    expect(s.timingKey).toBe("runner.takeAction");
    const remoteRun = legalActions(s).find(
      (a) => a.type === "basic_run" && a.serverId.startsWith("remote-"),
    );
    expect(remoteRun).toBeDefined();
  });
});

describe("ice / rez / break / jack-out", () => {
  it("approach PAW offers rez citing 8.1.2a / 11.4_2_b", () => {
    let s = setupEmptyRemoteWithIce();
    const remote = Object.values(s.servers).find((x) => x.kind === "remote")!;
    s = must(s, { type: "basic_run", serverId: remote.id as ServerId });
    expect(s.timingKey).toBe("run.approachPaw");
    expect(s.timing.stepNumber).toBe("11.4_2_b");
    const legal = legalActions(s);
    expect(legal.some((a) => a.type === "rez_ice")).toBe(true);
    expect(legal.some((a) => a.type === "pass_window")).toBe(true);
  });

  it("rez then unbroken ETR ends the run unsuccessfully (CR 6.5.5 / 6.8.4)", () => {
    const s = runIceEtrSlice();
    expect(s.run).toBeNull();
    const log = s.log.join("\n");
    expect(log).toContain(CR.rezInPaw.number);
    expect(log).toContain(CR.encounterIce.number);
    expect(log).toContain(CR.encounterSubResolve.number);
    expect(log).toContain(CR.endTheRun.number);
    expect(log).toContain("unsuccessful");
    expect(log).not.toContain("Run successful");
    expect(s.timingKey === "runner.actionPaw" || s.timingKey === "runner.takeAction" || s.timingKey === "runner.actionPhaseEnd").toBe(true);
  });

  it("rez + break with Crowbar then continue → successful empty breach", () => {
    const s = runIceBreakSlice();
    const log = s.log.join("\n");
    expect(log).toContain(CR.rezProcedure.number);
    expect(log).toContain(CR.encounterBreakPaw.number);
    expect(log).toContain(CR.fullyBreak.number);
    expect(log).toContain(CR.successfulRun.number);
    expect(log).toContain("No access candidates");
    expect(s.cards["corp-ice-1"].rezzed).toBe(true);
    expect(s.runner.rig).toContain("runner-program-1");
    expect(s.run).toBeNull();
  });

  it("jack-out after declining rez ends run unsuccessfully (CR 6.6.3)", () => {
    let s = setupEmptyRemoteWithIce();
    const remote = Object.values(s.servers).find((x) => x.kind === "remote")!;
    s = must(s, { type: "basic_run", serverId: remote.id as ServerId });
    s = must(s, { type: "pass_window" }); // decline rez
    expect(s.timingKey).toBe("run.jackOutWindow");
    expect(legalActions(s).some((a) => a.type === "jack_out")).toBe(true);
    s = must(s, { type: "jack_out" });
    expect(s.run).toBeNull();
    expect(s.log.some((l) => l.includes(CR.jackOutMovement.number))).toBe(true);
    expect(s.log.some((l) => l.includes("unsuccessful"))).toBe(true);
  });

  it("cannot rez outside approach PAW", () => {
    const s = createInitialState();
    const r = applyAction(s, { type: "rez_ice", cardId: "corp-ice-1" });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.cites.map((c) => c.id)).toContain(CR.rezInPaw.id);
  });
});
