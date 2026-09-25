import { describe, expect, it, beforeAll } from "vitest";
import {
  applyAction,
  applyIceStub,
  BASTION,
  createInitialState,
  CR,
  effectiveBreakerStrength,
  effectiveIceStrength,
  explainAction,
  idForNumber,
  isActionLegal,
  queryLegality,
  runFortifyPumpSlice,
  runMultiSubEtrSlice,
  runPumpBreakSlice,
  setupEmptyRemoteWithIce,
  assertPinnedTag,
  crDataPresent,
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

describe("CR pin: pump / paid ability / strength cites", () => {
  it("resolves 3.9.5b / 3.9.5g / 9.5.1 / 3.4.4 via index", () => {
    expect(idForNumber("3.9.5b")).toBe(CR.icebreakerStrengthImplicit.id);
    expect(idForNumber("3.9.5g")).toBe(CR.icebreakerInterfaceStrength.id);
    expect(idForNumber("9.5.1")).toBe(CR.paidAbility.id);
    expect(idForNumber("9.5.2")).toBe(CR.triggerPaidAbilities.id);
    expect(idForNumber("3.4.4")).toBe(CR.iceStrength.id);
    expect(idForNumber("3.9.4a")).toBe(CR.programStrength.id);
  });
});

describe("strength pump (CR 3.9.5b / 3.9.5g)", () => {
  it("break illegal when breaker strength < ice strength", () => {
    let s = setupEmptyRemoteWithIce("bastion");
    s.runner.credits = 6;
    s = must(s, {
      type: "basic_install",
      cardId: "runner-program-1",
      destination: { kind: "rig" },
    });
    s = must(s, { type: "pass_window" });
    const remote = Object.values(s.servers).find((x) => x.kind === "remote")!;
    s = must(s, { type: "basic_run", serverId: remote.id as ServerId });
    s = must(s, { type: "rez_ice", cardId: remote.ice[0] });
    s = must(s, { type: "pass_window" });

    expect(effectiveIceStrength(s, remote.ice[0])).toBe(BASTION.strength);
    expect(effectiveBreakerStrength(s, "runner-program-1")).toBe(1);

    const expl = explainAction(s, {
      type: "break_subroutine",
      breakerId: "runner-program-1",
      subIndex: 0,
    });
    expect(expl.legal).toBe(false);

    const r = applyAction(s, {
      type: "break_subroutine",
      breakerId: "runner-program-1",
      subIndex: 0,
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.cites.map((c) => c.id)).toEqual(
      expect.arrayContaining([CR.icebreakerInterfaceStrength.id]),
    );
  });

  it("pump paid ability raises strength; queryLegality lists pump then break", () => {
    let s = setupEmptyRemoteWithIce("bastion");
    s.runner.credits = 6;
    s = must(s, {
      type: "basic_install",
      cardId: "runner-program-1",
      destination: { kind: "rig" },
    });
    s = must(s, { type: "pass_window" });
    const remote = Object.values(s.servers).find((x) => x.kind === "remote")!;
    s = must(s, { type: "basic_run", serverId: remote.id as ServerId });
    s = must(s, { type: "rez_ice", cardId: remote.ice[0] });
    s = must(s, { type: "pass_window" });

    let view = queryLegality(s);
    expect(view.window.stepNumber).toBe("11.4_3_b");
    expect(
      view.legal.some(
        (e) =>
          e.action.type === "use_paid_ability" &&
          e.action.abilityId === "crowbar-pump",
      ),
    ).toBe(true);
    expect(view.legal.some((e) => e.action.type === "break_subroutine")).toBe(
      false,
    );

    s = must(s, {
      type: "use_paid_ability",
      cardId: "runner-program-1",
      abilityId: "crowbar-pump",
    });
    expect(s.log.some((l) => l.includes(CR.icebreakerStrengthImplicit.number))).toBe(
      true,
    );
    expect(effectiveBreakerStrength(s, "runner-program-1")).toBe(2);

    s = must(s, {
      type: "use_paid_ability",
      cardId: "runner-program-1",
      abilityId: "crowbar-pump",
    });
    expect(effectiveBreakerStrength(s, "runner-program-1")).toBe(3);

    view = queryLegality(s);
    expect(view.legal.some((e) => e.action.type === "break_subroutine")).toBe(
      true,
    );
    const pumpCite = view.legal.find(
      (e) => e.action.type === "use_paid_ability",
    )!;
    expect(pumpCite.cites.map((c) => c.id)).toEqual(
      expect.arrayContaining([CR.paidAbility.id]),
    );
  });

  it("demo: pump twice, break both Bastion subs → successful run", () => {
    const s = runPumpBreakSlice();
    const log = s.log.join("\n");
    expect(log).toContain(CR.icebreakerStrengthImplicit.number);
    expect(log).toContain(CR.paidAbility.number);
    expect(log).toContain(CR.encounterBreakPaw.number);
    expect(log).toContain(CR.successfulRun.number);
    expect(s.run).toBeNull();
    expect(s.cards["corp-ice-1"].title).toBe("Bastion");
  });
});

describe("multi-subroutine ice (CR 6.5.5 / 1.10.3a / 6.1.4)", () => {
  it("unbroken Bastion resolves gain_credits then ETR in order", () => {
    const s = runMultiSubEtrSlice();
    const log = s.log.join("\n");
    const gainIdx = log.indexOf('Resolve subroutine "The Corp gains 2{c}."');
    const etrIdx = log.indexOf('Resolve subroutine "End the run."');
    expect(gainIdx).toBeGreaterThan(-1);
    expect(etrIdx).toBeGreaterThan(gainIdx);
    expect(log).toContain(CR.encounterSubResolve.number);
    expect(log).toContain(CR.gainCredits.number);
    expect(log).toContain(CR.endTheRun.number);
    expect(log).toContain("unsuccessful");
    expect(s.run).toBeNull();
  });

  it("breaking only the ETR sub still lets gain_credits fire", () => {
    let s = setupEmptyRemoteWithIce("bastion");
    s.runner.credits = 8;
    s = must(s, {
      type: "basic_install",
      cardId: "runner-program-1",
      destination: { kind: "rig" },
    });
    s = must(s, { type: "pass_window" });
    const remote = Object.values(s.servers).find((x) => x.kind === "remote")!;
    s = must(s, { type: "basic_run", serverId: remote.id as ServerId });
    s = must(s, { type: "rez_ice", cardId: remote.ice[0] });
    const afterRez = s.corp.credits;
    s = must(s, { type: "pass_window" });

    // Pump to strength 3
    s = must(s, {
      type: "use_paid_ability",
      cardId: "runner-program-1",
      abilityId: "crowbar-pump",
    });
    s = must(s, {
      type: "use_paid_ability",
      cardId: "runner-program-1",
      abilityId: "crowbar-pump",
    });
    // Break only ETR (index 1)
    s = must(s, {
      type: "break_subroutine",
      breakerId: "runner-program-1",
      subIndex: 1,
    });
    s = must(s, { type: "pass_window" });

    // Gain fired; ETR broken so run continues to jack-out / success path
    expect(s.corp.credits).toBe(afterRez + 2);
    expect(s.log.some((l) => l.includes("End the run") && l.includes("unsuccessful"))).toBe(
      false,
    );
    // Should reach jack-out or already finished successfully
    expect(
      s.timingKey === "run.jackOutWindow" ||
        s.run === null ||
        s.timingKey.startsWith("runner."),
    ).toBe(true);
  });
});

describe("generic paid-ability PAW hooks (CR 9.5)", () => {
  it("use_paid_ability illegal outside PAW citing 9.5.1 / 9.5.2", () => {
    const s = createInitialState();
    const expl = explainAction(s, {
      type: "use_paid_ability",
      cardId: "runner-program-1",
      abilityId: "crowbar-pump",
    });
    expect(expl.legal).toBe(false);
    if (expl.legal) return;
    expect(expl.cites.map((c) => c.id)).toEqual(
      expect.arrayContaining([CR.paidAbility.id, CR.triggerPaidAbilities.id]),
    );
  });

  it("approach fortify then pump past fortified Bastion", () => {
    const s = runFortifyPumpSlice();
    const log = s.log.join("\n");
    expect(log).toContain(CR.iceStrength.number);
    expect(log).toContain("Fortify Bastion");
    expect(log).toContain(CR.icebreakerStrengthImplicit.number);
    expect(log).toContain(CR.successfulRun.number);
    expect(s.run).toBeNull();
  });

  it("fortify appears in approach PAW legality after rez", () => {
    let s = setupEmptyRemoteWithIce("bastion");
    s.corp.credits = 8;
    const remote = Object.values(s.servers).find((x) => x.kind === "remote")!;
    s = must(s, { type: "basic_run", serverId: remote.id as ServerId });
    s = must(s, { type: "rez_ice", cardId: remote.ice[0] });
    const view = queryLegality(s);
    expect(view.priority).toBe("corp");
    expect(
      view.legal.some(
        (e) =>
          e.action.type === "use_paid_ability" &&
          e.action.abilityId === "fortify" &&
          e.actor === "corp",
      ),
    ).toBe(true);
    expect(isActionLegal(s, {
      type: "use_paid_ability",
      cardId: remote.ice[0],
      abilityId: "fortify",
    })).toBe(true);
  });

  it("applyIceStub bastion installs fortify + multi-sub text", () => {
    const s = createInitialState();
    applyIceStub(s.cards["corp-ice-1"], "bastion");
    const ice = s.cards["corp-ice-1"];
    expect(ice.title).toBe("Bastion");
    expect(ice.subroutines).toHaveLength(2);
    expect(ice.subroutines![0].effect).toBe("gain_credits");
    expect(ice.subroutines![1].effect).toBe("end_the_run");
    expect(ice.paidAbilities?.some((a) => a.id === "fortify")).toBe(true);
  });
});
