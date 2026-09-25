import { describe, expect, it, beforeAll } from "vitest";
import {
  applyAction,
  applyIceStub,
  createInitialState,
  explainAction,
  isActionLegal,
  queryLegality,
  setupEmptyRemoteWithIce,
  CR,
  assertPinnedTag,
  crDataPresent,
  idForNumber,
} from "../src/index.js";
import type { ServerId } from "../src/state/types.js";

beforeAll(() => {
  if (!crDataPresent()) {
    throw new Error("Run `npm run fetch-cr` before tests.");
  }
  assertPinnedTag("v26.03");
});

function must(
  state: ReturnType<typeof createInitialState>,
  action: Parameters<typeof applyAction>[1],
) {
  const r = applyAction(state, action);
  if (!r.ok) throw new Error(`${r.error} ${JSON.stringify(r.cites)}`);
  return r.state;
}

describe("queryLegality API", () => {
  it("reports window + priority + cited legal actions at corp.takeAction", () => {
    let s = createInitialState();
    s = must(s, { type: "pass_window" });
    s = must(s, { type: "pass_window" });
    s = must(s, { type: "pass_window" });
    const view = queryLegality(s);
    expect(view.window.key).toBe("corp.takeAction");
    expect(view.window.stepNumber).toBe("11.2_2_b_ii");
    expect(view.priority).toBe("corp");
    expect(view.legal.some((e) => e.action.type === "basic_gain_credit")).toBe(
      true,
    );
    const credit = view.legal.find((e) => e.action.type === "basic_gain_credit")!;
    expect(credit.actor).toBe("corp");
    expect(credit.cites.map((c) => c.number)).toEqual(
      expect.arrayContaining([CR.actionPhase.number]),
    );
  });

  it("approach PAW lists rez for Corp with priority corp (11.4_2_b)", () => {
    let s = setupEmptyRemoteWithIce();
    const remote = Object.values(s.servers).find((x) => x.kind === "remote")!;
    s = must(s, { type: "basic_run", serverId: remote.id as ServerId });
    const view = queryLegality(s);
    expect(view.window.stepId).toBe(
      "sec_appendix_timing_structure_of_a_run_2_b",
    );
    expect(view.priority).toBe("corp");
    expect(view.legal.some((e) => e.action.type === "rez_ice")).toBe(true);
    expect(view.legal.some((e) => e.action.type === "pass_window")).toBe(true);
  });
});

describe("golden: illegal outside window", () => {
  it("basic_gain_credit illegal at gainClicks citing 5.4.1 / 5.2.4", () => {
    const s = createInitialState();
    const expl = explainAction(s, { type: "basic_gain_credit" });
    expect(expl.legal).toBe(false);
    if (expl.legal) return;
    expect(expl.cites.map((c) => c.id)).toEqual(
      expect.arrayContaining([CR.actionPhase.id, CR.actionsOutsidePhase.id]),
    );
    expect(expl.window.key).toBe("corp.gainClicks");
  });

  it("rez_ice illegal outside approach PAW citing 8.1.2a / 6.4.3", () => {
    const s = createInitialState();
    const expl = explainAction(s, { type: "rez_ice", cardId: "corp-ice-1" });
    expect(expl.legal).toBe(false);
    if (expl.legal) return;
    expect(expl.cites.map((c) => c.number)).toEqual(
      expect.arrayContaining([CR.rezInPaw.number, CR.rezIceRestriction.number]),
    );
  });

  it("jack_out illegal at takeAction citing 6.6.3", () => {
    const s = setupEmptyRemoteWithIce();
    const expl = explainAction(s, { type: "jack_out" });
    expect(expl.legal).toBe(false);
    if (expl.legal) return;
    expect(expl.cites.map((c) => c.id)).toContain(CR.jackOutMovement.id);
  });

  it("break_subroutine illegal during approach PAW citing 6.5.4", () => {
    let s = setupEmptyRemoteWithIce();
    const remote = Object.values(s.servers).find((x) => x.kind === "remote")!;
    s = must(s, { type: "basic_run", serverId: remote.id as ServerId });
    const expl = explainAction(s, {
      type: "break_subroutine",
      breakerId: "runner-program-1",
      subIndex: 0,
    });
    expect(expl.legal).toBe(false);
    if (expl.legal) return;
    expect(expl.cites.map((c) => c.id)).toContain(CR.encounterBreakPaw.id);
  });

  it("pinned index resolves cannot / checkpoint / priority ids", () => {
    expect(idForNumber("1.2.2")).toBe(CR.cannotPrecedence.id);
    expect(idForNumber("1.16.3")).toBe(CR.costCheckpoint.id);
    expect(idForNumber("9.2.4")).toBe(CR.priorityWindow.id);
    expect(idForNumber("9.11.1b")).toBe(CR.timingCheckpoint.id);
  });
});

describe("cannot precedence (CR 1.2.2)", () => {
  it("Lockdown Wall rez forbids jack_out even in jack-out window", () => {
    let s = setupEmptyRemoteWithIce();
    const remote = Object.values(s.servers).find((x) => x.kind === "remote")!;
    applyIceStub(s.cards[remote.ice[0]], "lockdown");

    // Install Crowbar before the run
    s = must(s, {
      type: "basic_install",
      cardId: "runner-program-1",
      destination: { kind: "rig" },
    });
    s = must(s, { type: "pass_window" });

    s = must(s, { type: "basic_run", serverId: remote.id as ServerId });
    s = must(s, { type: "rez_ice", cardId: remote.ice[0] });
    expect(s.run?.cannotJackOut).toBe(true);
    expect(
      s.log.some(
        (l) =>
          l.includes("Cannot jack_out") && l.includes(CR.cannotPrecedence.number),
      ),
    ).toBe(true);

    s = must(s, { type: "pass_window" }); // approach → encounter
    expect(s.timingKey).toBe("run.encounterPaw");
    s = must(s, {
      type: "break_subroutine",
      breakerId: "runner-program-1",
      subIndex: 0,
    });
    s = must(s, { type: "pass_window" }); // → jack-out window
    expect(s.timingKey).toBe("run.jackOutWindow");

    expect(isActionLegal(s, { type: "jack_out" })).toBe(false);
    const expl = explainAction(s, { type: "jack_out" });
    expect(expl.legal).toBe(false);
    if (expl.legal) return;
    expect(expl.cites.map((c) => c.id)).toContain(CR.cannotPrecedence.id);

    const view = queryLegality(s);
    expect(view.legal.some((e) => e.action.type === "jack_out")).toBe(false);
    expect(view.legal.some((e) => e.action.type === "continue_run")).toBe(true);

    const blocked = applyAction(s, { type: "jack_out" });
    expect(blocked.ok).toBe(false);
    if (blocked.ok) return;
    expect(blocked.cites.map((c) => c.id)).toContain(CR.cannotPrecedence.id);

    // Continue still works
    s = must(s, { type: "continue_run" });
    expect(s.run).toBeNull();
  });
});

describe("checkpoints", () => {
  it("rez opens and closes a cost checkpoint (CR 1.16.3)", () => {
    let s = setupEmptyRemoteWithIce();
    const remote = Object.values(s.servers).find((x) => x.kind === "remote")!;
    s = must(s, { type: "basic_run", serverId: remote.id as ServerId });
    s = must(s, { type: "rez_ice", cardId: remote.ice[0] });
    const log = s.log.join("\n");
    expect(log).toContain("Checkpoint open [cost]");
    expect(log).toContain(CR.costCheckpoint.number);
    expect(log).toContain("Checkpoint close [cost]");
    // Nested stack empty after pay
    expect(s.checkpoints).toHaveLength(0);
  });

  it("closing approach PAW records priority-window checkpoint (CR 9.2.4)", () => {
    let s = setupEmptyRemoteWithIce();
    const remote = Object.values(s.servers).find((x) => x.kind === "remote")!;
    s = must(s, { type: "basic_run", serverId: remote.id as ServerId });
    s = must(s, { type: "pass_window" });
    const log = s.log.join("\n");
    expect(log).toContain("Checkpoint open [priority_window]");
    expect(log).toContain(CR.priorityWindow.number);
    expect(log).toContain(CR.timingCheckpoint.number);
    expect(s.checkpoints).toHaveLength(0);
  });

  it("break opens nested cost checkpoint under encounter PAW", () => {
    let s = setupEmptyRemoteWithIce();
    const remote = Object.values(s.servers).find((x) => x.kind === "remote")!;
    s = must(s, {
      type: "basic_install",
      cardId: "runner-program-1",
      destination: { kind: "rig" },
    });
    s = must(s, { type: "pass_window" });
    s = must(s, { type: "basic_run", serverId: remote.id as ServerId });
    s = must(s, { type: "rez_ice", cardId: remote.ice[0] });
    s = must(s, { type: "pass_window" });
    s = must(s, {
      type: "break_subroutine",
      breakerId: "runner-program-1",
      subIndex: 0,
    });
    expect(s.log.some((l) => l.includes("break_subroutine") && l.includes("cost"))).toBe(
      true,
    );
    expect(s.checkpoints).toHaveLength(0);
  });
});
