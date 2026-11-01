/**
 * General CR 9.9.9 replacement layer (once-per-effect + interrupt-open hook).
 */
import { beforeAll, describe, expect, it } from "vitest";
import {
  allocateEffectIdentity,
  applyActiveReplacementsAtInterruptOpen,
  assertCardsPinnedTag,
  assertPinnedTag,
  cardsDataPresent,
  createInitialState,
  crDataPresent,
  instantiateCard,
  replacementAlreadyApplied,
  stealAgenda,
  tryApplyReplacement,
} from "../src/index.js";
import { dealDamage } from "../src/state/damage.js";
import { CR } from "../src/timing/labels.js";

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.147.14");
});

describe("CR 9.9.9 replacement layer", () => {
  it("applies each replacement only once to an effect (CR 9.9.9c)", () => {
    const s = createInitialState();
    const effectId = allocateEffectIdentity(s, "test");
    expect(tryApplyReplacement(s, effectId, "repl-a")).toBe(true);
    expect(tryApplyReplacement(s, effectId, "repl-a")).toBe(false);
    expect(tryApplyReplacement(s, effectId, "repl-b")).toBe(true);
    expect(replacementAlreadyApplied(s, effectId, "repl-a")).toBe(true);
  });

  it("Vacheron steal uses once-per-effect bookkeeping (CR 9.9.9c.ex1)", () => {
    let s = createInitialState();
    s = structuredClone(s);
    const vac = instantiateCard(
      "project-vacheron",
      "vac-1",
      "server:remote-1:root",
    );
    s.cards["vac-1"] = vac;
    s.servers["remote-1"] = {
      id: "remote-1",
      kind: "remote",
      ice: [],
      root: ["vac-1"],
    };
    stealAgenda(s, "vac-1");
    expect(s.cards["vac-1"]!.agendaCounters).toBe(4);
    expect(s.runner.scoreArea).toContain("vac-1");
    expect(s.log.join("\n")).toContain(
      CR.replacementEffectOnlyOncePerEffect.number,
    );
    const effectId = Object.keys(s.turn.appliedReplacements ?? {})[0];
    expect(effectId).toBeTruthy();
    expect(replacementAlreadyApplied(s, effectId!, "vacheron:vac-1")).toBe(
      true,
    );
    expect(tryApplyReplacement(s, effectId!, "vacheron:vac-1")).toBe(false);
  });

  it("applies active expected replacements as the interrupt window opens (CR 9.9.9b)", () => {
    const s = createInitialState();
    const effectId = allocateEffectIdentity(s, "damage:meat");
    // No corpus static expected-effect replacements yet — hook is a no-op.
    const out = applyActiveReplacementsAtInterruptOpen(
      s,
      { damage: { type: "meat", amount: 3 } },
      effectId,
    );
    expect(out.damage).toEqual({ type: "meat", amount: 3 });

    // Opening a damage interrupt builds expectedEffects through the hook.
    let s2 = createInitialState();
    s2 = structuredClone(s2);
    const result = dealDamage(s2, "meat", 2, "corp-id", { interactive: true });
    expect(result).toBe("pending");
    expect(s2.pendingDamage?.expectedEffects?.damage).toEqual({
      type: "meat",
      amount: 2,
    });
    expect(s2.turn.effectIdentitySeq).toBeGreaterThanOrEqual(1);
  });
});
