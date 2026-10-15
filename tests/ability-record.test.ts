/**
 * CR 9.3 ability records materialize onto the hooks the engine already evaluates.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  applyAbilityRecords,
  createInitialState,
  evalEffect,
  hookToTrigger,
  triggerToHook,
  validateAbilityRecord,
} from "../src/index.js";

describe("CR 9.3 ability records", () => {
  it("round-trips a conditional trigger to its hook", () => {
    expect(hookToTrigger("onTurnBegin")).toBe("turn_begin");
    expect(triggerToHook("turn_begin")).toBe("onTurnBegin");
    expect(triggerToHook("first_successful_hq_run_this_turn")).toBe(
      "onFirstSuccessfulHqRunThisTurn",
    );
    expect(triggerToHook("additional_cost_on_score_agenda_installed_this_turn")).toBe(
      "additionalCostOnScoreAgendaInstalledThisTurn",
    );
  });

  it("plays an instruction from a play ability", () => {
    const card: Record<string, unknown> = {
      abilities: [
        {
          class: "play",
          instructions: {
            op: "do",
            action: { kind: "gain_credits", side: "runner", amount: 9 },
          },
        },
      ],
    };
    expect(applyAbilityRecords(card)).toBeNull();
    const state = createInitialState();
    state.runner.credits = 5;
    const played = evalEffect(
      { state, sourceId: "sure-gamble" },
      card.onPlay as never,
    );
    expect(played.ok).toBe(true);
    expect(state.runner.credits).toBe(14);
  });

  it("keeps a paid cost with its instructions", () => {
    const card: Record<string, unknown> = {
      abilities: [
        {
          class: "paid",
          id: "click-for-credit",
          label: "Click: gain 1",
          cost: { clicks: 1 },
          windows: ["click"],
          instructions: {
            op: "do",
            action: { kind: "gain_credits", side: "runner", amount: 1 },
          },
        },
      ],
    };
    expect(applyAbilityRecords(card)).toBeNull();
    const paid = (card.paidAbilities as Array<{ clickCost: number; effect: unknown }>)[0];
    expect(paid.clickCost).toBe(1);
    const empty: Record<string, unknown> = {
      abilities: [
        {
          class: "paid",
          id: "zero",
          cost: { credits: 0 },
          windows: ["encounter_paw"],
          instructions: { op: "do", action: { kind: "rfg_self" } },
        },
      ],
    };
    expect(applyAbilityRecords(empty)).toBeNull();
    const zero = (empty.paidAbilities as Array<{ cost: object; creditCost: number }>)[0];
    expect(zero.cost).toEqual({});
    expect(zero.creditCost).toBe(0);
    expect(paid.effect).toEqual({
      op: "do",
      action: { kind: "gain_credits", side: "runner", amount: 1 },
    });
  });

  it("fires a conditional ability from its trigger window", () => {
    const card: Record<string, unknown> = {
      abilities: [
        {
          class: "conditional",
          trigger: "turn_begin",
          instructions: {
            op: "do",
            action: { kind: "draw", side: "runner", amount: 1 },
          },
        },
      ],
    };
    expect(applyAbilityRecords(card)).toBeNull();
    expect(card.onTurnBegin).toBeDefined();
    expect(card.onPlay).toBeUndefined();
  });

  it("keeps a subroutine as an instruction on the ice", () => {
    const card: Record<string, unknown> = {
      abilities: [
        {
          class: "subroutine",
          id: "etr",
          text: "End the run",
          instructions: { op: "do", action: { kind: "end_the_run" } },
        },
      ],
    };
    expect(applyAbilityRecords(card)).toBeNull();
    const sub = (card.subroutines as Array<{ id: string; effect: { op: string } }>)[0];
    expect(sub.id).toBe("etr");
    expect(sub.effect.op).toBe("do");
  });

  it("applies a static declaration without resolving an instruction", () => {
    const card: Record<string, unknown> = {
      abilities: [
        {
          class: "static",
          declaration: { field: "link", value: 1 },
        },
      ],
    };
    expect(applyAbilityRecords(card)).toBeNull();
    expect(card.link).toBe(1);
    expect(card.onPlay).toBeUndefined();
  });

  it("rejects a static ability that contains instructions", () => {
    expect(
      validateAbilityRecord(
        {
          class: "static",
          instructions: { op: "do", action: { kind: "end_the_run" } },
        },
        "abilities[0]",
      ),
    ).toMatch(/cannot contain instructions/);
  });

  it("rejects a paid ability without a cost", () => {
    expect(
      validateAbilityRecord(
        {
          class: "paid",
          windows: ["click"],
          instructions: { op: "do", action: { kind: "end_the_run" } },
        },
        "abilities[0]",
      ),
    ).toMatch(/needs a cost/);
  });

  it("rejects a conditional ability without a trigger", () => {
    expect(
      validateAbilityRecord(
        {
          class: "conditional",
          instructions: { op: "do", action: { kind: "end_the_run" } },
        },
        "abilities[0]",
      ),
    ).toMatch(/needs a trigger/);
  });

  it("materializes a classified catalog card onto the hooks", () => {
    const file = join(
      process.cwd(),
      "../netrunner-cards-data/data/system-gateway/sure-gamble.json",
    );
    if (!existsSync(file)) return;
    const card = JSON.parse(readFileSync(file, "utf8")) as Record<string, unknown>;
    expect(applyAbilityRecords(card)).toBeNull();
    expect(card.onPlay).toEqual({
      op: "do",
      action: { kind: "gain_credits", side: "runner", amount: 9 },
    });
  });

  it("leaves a card that still uses hooks unchanged", () => {
    const card: Record<string, unknown> = {
      onPlay: { op: "do", action: { kind: "end_the_run" } },
    };
    expect(applyAbilityRecords(card)).toBeNull();
    expect(card.abilities).toBeUndefined();
    expect(card.onPlay).toBeDefined();
  });
});
