/**
 * Continuous cost modifiers (framework migration M5 residual).
 * Collect/solve over stub helpers so rez and install consumers share one layer.
 */
import {
  continuousIceRezCostIncrease,
  continuousIceRezCostReduction,
  iceRezCostReductionFromScoredAgendaCounters,
} from "../cards/stubs.js";
import { abilitiesSuppressed } from "./abilities.js";
import type { GameState } from "./types.js";

export type ContinuousRezCostMod = {
  kind: "ice_rez_cost_increase" | "ice_rez_cost_reduction";
  iceId: string;
  amount: number;
};

export type ContinuousInstallCostMod = {
  kind: "runner_install_cost_delta";
  cardId: string;
  amount: number;
};

/** Collect continuous ice rez-cost increases for one ice. */
export function collectIceRezCostIncreases(
  state: GameState,
  iceId: string,
): ContinuousRezCostMod[] {
  const amount = continuousIceRezCostIncrease(state, iceId);
  if (amount === 0) return [];
  return [{ kind: "ice_rez_cost_increase", iceId, amount }];
}

/** Collect continuous ice rez-cost reductions for one ice. */
export function collectIceRezCostReductions(
  state: GameState,
  iceId: string,
): ContinuousRezCostMod[] {
  const mods: ContinuousRezCostMod[] = [];
  const server = continuousIceRezCostReduction(state, iceId);
  if (server > 0) {
    mods.push({ kind: "ice_rez_cost_reduction", iceId, amount: server });
  }
  const agenda = iceRezCostReductionFromScoredAgendaCounters(state);
  if (agenda > 0) {
    mods.push({ kind: "ice_rez_cost_reduction", iceId, amount: agenda });
  }
  return mods;
}

/** Total continuous ice rez-cost increase via the cost layer. */
export function resolveIceRezCostIncrease(
  state: GameState,
  iceId: string,
): number {
  return collectIceRezCostIncreases(state, iceId).reduce(
    (n, m) => n + m.amount,
    0,
  );
}

/** Total continuous ice rez-cost reduction via the cost layer. */
export function resolveIceRezCostReduction(
  state: GameState,
  iceId: string,
): number {
  return collectIceRezCostReductions(state, iceId).reduce(
    (n, m) => n + m.amount,
    0,
  );
}

function countInstalledIcebreakers(state: GameState): number {
  return state.runner.installed.filter(
    (id) =>
      Boolean(state.cards[id].breaker) ||
      (state.cards[id].subtypes ?? []).includes("icebreaker"),
  ).length;
}

/**
 * Continuous Runner install cost deltas (increases and reductions) for one
 * card about to install. One-shot / interrupt discounts (Patchwork pending,
 * host companion discounts) stay in installRunner.
 */
export function collectRunnerInstallCostDeltas(
  state: GameState,
  cardId: string,
): ContinuousInstallCostMod[] {
  const card = state.cards[cardId];
  if (!card) return [];
  const mods: ContinuousInstallCostMod[] = [];
  const push = (amount: number) => {
    if (amount === 0) return;
    mods.push({ kind: "runner_install_cost_delta", cardId, amount });
  };

  if (card.type === "resource") {
    for (const c of Object.values(state.cards)) {
      if (!c || abilitiesSuppressed(state, c.id)) continue;
      if (
        c.zone === "corp:play-area" &&
        typeof c.resourceInstallCostIncrease === "number"
      ) {
        push(c.resourceInstallCostIncrease);
      }
      if (
        c.zone === "corp:score" &&
        typeof c.nonVirtualResourceInstallCostIncrease === "number" &&
        !(card.subtypes ?? []).some((s) => s.toLowerCase() === "virtual")
      ) {
        push(c.nonVirtualResourceInstallCostIncrease);
      }
    }
  }

  for (const server of Object.values(state.servers)) {
    for (const id of server.root) {
      if (abilitiesSuppressed(state, id)) continue;
      const c = state.cards[id];
      if (!c?.rezzed) continue;
      if (
        card.type === "program" &&
        typeof c.programInstallCostIncrease === "number"
      ) {
        push(c.programInstallCostIncrease);
      }
      if (
        card.type === "hardware" &&
        typeof c.hardwareInstallCostIncrease === "number"
      ) {
        push(c.hardwareInstallCostIncrease);
      }
      if (
        card.type === "resource" &&
        (card.subtypes ?? []).includes("virtual") &&
        typeof c.virtualResourceInstallCostIncrease === "number"
      ) {
        push(c.virtualResourceInstallCostIncrease);
      }
    }
  }

  if (
    card.installCostDiscountIfSuccessfulRunThisTurn &&
    state.turn.successfulRunThisTurn
  ) {
    push(-card.installCostDiscountIfSuccessfulRunThisTurn);
  }
  if (
    card.installCostDiscountIfSuccessfulHqRunThisTurn &&
    state.turn.successfulHqRunThisTurn
  ) {
    push(-card.installCostDiscountIfSuccessfulHqRunThisTurn);
  }
  if (card.installCostDiscountPerInstalledIcebreaker) {
    push(
      -(
        card.installCostDiscountPerInstalledIcebreaker *
        countInstalledIcebreakers(state)
      ),
    );
  }
  if ((card.installCostReductionPerLink ?? 0) > 0 && state.runner.link > 0) {
    push(-(card.installCostReductionPerLink! * state.runner.link));
  }

  if (card.type === "program" && state.turn.programsInstalledThisTurn === 0) {
    for (const id of state.runner.installed) {
      if (abilitiesSuppressed(state, id)) continue;
      const discount = state.cards[id].firstProgramInstallDiscount ?? 0;
      if (discount > 0) push(-discount);
    }
  }
  if (
    (card.type === "program" || card.type === "hardware") &&
    state.turn.programsInstalledThisTurn === 0 &&
    state.turn.hardwareInstalledThisTurn === 0
  ) {
    let kate = 0;
    const identityId = state.runner.identityId;
    if (!abilitiesSuppressed(state, identityId)) {
      kate = state.cards[identityId]?.firstProgramOrHardwareInstallDiscount ?? 0;
    }
    for (const id of state.runner.installed) {
      if (abilitiesSuppressed(state, id)) continue;
      kate = Math.max(
        kate,
        state.cards[id]?.firstProgramOrHardwareInstallDiscount ?? 0,
      );
    }
    if (kate > 0) push(-kate);
  }

  return mods;
}

/** Net continuous Runner install cost delta (positive = more expensive). */
export function resolveRunnerInstallCostDelta(
  state: GameState,
  cardId: string,
): number {
  return collectRunnerInstallCostDeltas(state, cardId).reduce(
    (n, m) => n + m.amount,
    0,
  );
}
