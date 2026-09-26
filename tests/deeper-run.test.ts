import { describe, expect, it, beforeAll } from "vitest";
import {
  applyAction,
  applyIceDef,
  PALISADE,
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
  instantiateCard,
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
    let s = setupEmptyRemoteWithIce("palisade");
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
    s = must(s, { type: "pass_window" });

    expect(effectiveIceStrength(s, remote.ice[0])).toBe(
      (PALISADE().strength ?? 0) + (PALISADE().strengthBonusProtectingRemote ?? 0),
    );
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
    let s = setupEmptyRemoteWithIce("palisade");
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
    s = must(s, { type: "pass_window" });

    let view = queryLegality(s);
    expect(view.window.stepNumber).toBe("11.4_3_b");
    expect(
      view.legal.some(
        (e) =>
          e.action.type === "use_paid_ability" &&
          e.action.abilityId === "marjanah-pump",
      ),
    ).toBe(true);
    expect(view.legal.some((e) => e.action.type === "break_subroutine")).toBe(
      false,
    );

    s = must(s, {
      type: "use_paid_ability",
      cardId: "runner-program-1",
      abilityId: "marjanah-pump",
    });
    expect(s.log.some((l) => l.includes(CR.icebreakerStrengthImplicit.number))).toBe(
      true,
    );
    expect(effectiveBreakerStrength(s, "runner-program-1")).toBe(2);

    s = must(s, {
      type: "use_paid_ability",
      cardId: "runner-program-1",
      abilityId: "marjanah-pump",
    });
    s = must(s, {
      type: "use_paid_ability",
      cardId: "runner-program-1",
      abilityId: "marjanah-pump",
    });
    expect(effectiveBreakerStrength(s, "runner-program-1")).toBe(4);

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

  it("demo: pump Marjanah past Palisade → successful run", () => {
    const s = runPumpBreakSlice();
    const log = s.log.join("\n");
    expect(log).toContain(CR.icebreakerStrengthImplicit.number);
    expect(log).toContain(CR.paidAbility.number);
    expect(log).toContain(CR.encounterBreakPaw.number);
    expect(log).toContain(CR.successfulRun.number);
    expect(s.run).toBeNull();
    expect(s.cards["corp-ice-1"].title).toBe("Palisade");
  });
});

describe("multi-subroutine ice (CR 6.5.5 / 1.10.3a / 6.1.4)", () => {
  it("unbroken Hortum resolves gain_credits then ETR in order", () => {
    const s = runMultiSubEtrSlice();
    const log = s.log.join("\n");
    const gainIdx = log.indexOf("Gain 1¢");
    const etrIdx = log.indexOf("End the run");
    expect(gainIdx).toBeGreaterThan(-1);
    expect(etrIdx).toBeGreaterThan(gainIdx);
    expect(log).toContain(CR.encounterSubResolve.number);
    expect(log).toContain(CR.gainCredits.number);
    expect(log).toContain(CR.endTheRun.number);
    expect(log).toContain("unsuccessful");
    expect(s.run).toBeNull();
  });

  it("breaking only the ETR sub still lets gain_credits fire", () => {
    let s = setupEmptyRemoteWithIce("hortum");
    s.runner.credits = 12;
    // Replace Marjanah with Unity (code gate breaker) for Hortum.
    const unity = instantiateCard("unity", "runner-program-1", "runner:grip");
    s = structuredClone(s);
    s.cards["runner-program-1"] = unity;
    s.runner.hand = ["runner-program-1"];

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

    // Unity str 1, Hortum str 4 — pump to match
    for (let i = 0; i < 3; i++) {
      s = must(s, {
        type: "use_paid_ability",
        cardId: "runner-program-1",
        abilityId: "unity-pump",
      });
    }
    // Break only ETR (index 1)
    s = must(s, {
      type: "break_subroutine",
      breakerId: "runner-program-1",
      subIndex: 1,
    });
    s = must(s, { type: "pass_window" });

    expect(s.corp.credits).toBe(afterRez + 1);
    expect(
      s.log.some((l) => l.includes("End the run") && l.includes("unsuccessful")),
    ).toBe(false);
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
      abilityId: "marjanah-pump",
    });
    expect(expl.legal).toBe(false);
    if (expl.legal) return;
    expect(expl.cites.map((c) => c.id)).toEqual(
      expect.arrayContaining([CR.paidAbility.id, CR.triggerPaidAbilities.id]),
    );
  });

  it("Palisade remote strength then pump past it", () => {
    const s = runFortifyPumpSlice();
    const log = s.log.join("\n");
    expect(log).toContain(CR.icebreakerStrengthImplicit.number);
    expect(log).toContain(CR.successfulRun.number);
    expect(s.run).toBeNull();
    expect(effectiveIceStrength(s, "corp-ice-1")).toBe(4);
  });

  it("Palisade remote strength bonus is visible after rez on approach", () => {
    let s = setupEmptyRemoteWithIce("palisade");
    s.corp.credits = 6;
    const remote = Object.values(s.servers).find((x) => x.kind === "remote")!;
    s = must(s, { type: "basic_run", serverId: remote.id as ServerId });
    s = must(s, { type: "rez_ice", cardId: remote.ice[0] });
    expect(effectiveIceStrength(s, remote.ice[0])).toBe(4);
    expect(isActionLegal(s, { type: "pass_window" })).toBe(true);
  });

  it("applyIceDef palisade installs remote-bonus barrier text", () => {
    const s = createInitialState();
    applyIceDef(s.cards["corp-ice-1"], "palisade");
    const ice = s.cards["corp-ice-1"];
    expect(ice.title).toBe("Palisade");
    expect(ice.subroutines).toHaveLength(1);
    expect(ice.subroutines![0].effect).toEqual({
      op: "do",
      action: { kind: "end_the_run" },
    });
    expect(ice.strengthBonusProtectingRemote).toBe(2);
  });
});
