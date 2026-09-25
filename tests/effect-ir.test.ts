import { describe, expect, it, beforeAll } from "vitest";
import {
  applyAction,
  applyIceStub,
  assertPinnedTag,
  createInitialState,
  CR,
  crDataPresent,
  effectContains,
  fx,
  idForNumber,
  queryLegality,
  runPulseNeedleSlice,
  runScrapCodeSlice,
  setupEmptyRemoteWithIce,
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

describe("effect IR shape", () => {
  it("fx helpers build seq / do / if / prevent trees", () => {
    const tree = fx.seq(
      fx.netDamage(1),
      fx.if({ op: "has_installed_program" }, fx.trashProgram()),
      fx.giveTags(1),
      fx.etr(),
    );
    expect(tree.op).toBe("seq");
    expect(effectContains(tree, (p) => p.kind === "net_damage")).toBe(true);
    expect(effectContains(tree, (p) => p.kind === "give_tags")).toBe(true);
    expect(effectContains(tree, (p) => p.kind === "end_the_run")).toBe(true);
    expect(fx.prevent("jack_out")).toEqual({
      op: "prevent",
      forbid: "jack_out",
    });
  });

  it("Crowbar / Bastion / Static Wall express abilities via IR", () => {
    const s = createInitialState();
    const crowbar = s.cards["runner-program-1"];
    expect(crowbar.paidAbilities![0].effect).toEqual({
      op: "do",
      action: { kind: "pump_strength", amount: 1 },
    });
    applyIceStub(s.cards["corp-ice-1"], "static");
    expect(s.cards["corp-ice-1"].subroutines![0].effect).toEqual({
      op: "do",
      action: { kind: "end_the_run" },
    });
  });
});

describe("CR pin: damage / tags / trash", () => {
  it("resolves 10.4.1 / 10.4.2a / 10.5.1 / 1.19.1", () => {
    expect(idForNumber("10.4.1")).toBe(CR.sufferDamage.id);
    expect(idForNumber("10.4.2a")).toBe(CR.netDamage.id);
    expect(idForNumber("10.5.1")).toBe(CR.tags.id);
    expect(idForNumber("1.19.1")).toBe(CR.trashing.id);
  });
});

describe("Pulse Needle: net damage + tag (effect IR)", () => {
  it("demo fires both encounter effects then continues (no ETR)", () => {
    const s = runPulseNeedleSlice();
    const log = s.log.join("\n");
    expect(log).toContain(CR.netDamage.number);
    expect(log).toContain(CR.sufferDamage.number);
    expect(log).toContain(CR.tags.number);
    expect(log).toContain(CR.successfulRun.number);
    expect(s.runner.tags).toBe(1);
    expect(s.runner.discard.length).toBeGreaterThanOrEqual(1);
    expect(s.run).toBeNull();
  });

  it("queryLegality still lists break on Pulse Needle encounter", () => {
    let s = setupEmptyRemoteWithIce("pulse");
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
    const view = queryLegality(s);
    expect(view.window.stepNumber).toBe("11.4_3_b");
    expect(view.legal.some((e) => e.action.type === "break_subroutine")).toBe(
      true,
    );
    expect(view.legal.some((e) => e.action.type === "pass_window")).toBe(true);
  });
});

describe("Scrap Code: trash program + ETR", () => {
  it("demo trashes Crowbar then ends the run", () => {
    const s = runScrapCodeSlice();
    const log = s.log.join("\n");
    expect(log).toContain(CR.trashing.number);
    expect(log).toContain(CR.endTheRun.number);
    expect(s.cards["runner-program-1"].zone).toBe("runner:heap");
    expect(s.runner.rig).not.toContain("runner-program-1");
    expect(s.run).toBeNull();
  });
});

describe("Lockdown onRez prevent IR", () => {
  it("rezzing Lockdown evaluates prevent jack_out via onRez", () => {
    let s = setupEmptyRemoteWithIce();
    const remote = Object.values(s.servers).find((x) => x.kind === "remote")!;
    applyIceStub(s.cards[remote.ice[0]], "lockdown");
    expect(s.cards[remote.ice[0]].onRez).toEqual({
      op: "prevent",
      forbid: "jack_out",
    });
    s = must(s, { type: "basic_run", serverId: remote.id as ServerId });
    s = must(s, { type: "rez_ice", cardId: remote.ice[0] });
    expect(s.run?.cannotJackOut).toBe(true);
    expect(
      s.log.some(
        (l) =>
          l.includes("Cannot jack_out") && l.includes(CR.cannotPrecedence.number),
      ),
    ).toBe(true);
  });
});
