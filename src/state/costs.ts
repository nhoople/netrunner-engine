/** Richer cost model + recurring credit refill (CR 1.10 / 1.16). */

import { log } from "./createGame.js";
import { dealDamage } from "./damage.js";
import { removeCardFromCurrentZone } from "./scoring.js";
import type {
  CardInstance,
  CostSpec,
  GameState,
  PaidAbility,
  RecurringSpendPurpose,
  Side,
} from "./types.js";
import { CR } from "../timing/labels.js";
import { withCostCheckpoint } from "../legality/checkpoints.js";

/**
 * First time each turn the Runner spends credits from an installed card,
 * place 1 power on each card with powerOnFirstInstalledCardCreditSpendThisTurn.
 */
export function noteInstalledCardCreditSpend(state: GameState): void {
  if (state.turn.installedCardCreditSpendThisTurn) return;
  state.turn.installedCardCreditSpendThisTurn = true;
  for (const id of state.runner.rig) {
    const card = state.cards[id];
    if (!card?.powerOnFirstInstalledCardCreditSpendThisTurn) continue;
    card.powerCounters = (card.powerCounters ?? 0) + 1;
    log(
      state,
      `${card.title} — place 1 power (first installed-card credit spend this turn) → ${card.powerCounters}.`,
    );
  }
}

export function abilityCost(ability: PaidAbility): CostSpec {
  if (ability.cost) return ability.cost;
  return {
    clicks: ability.clickCost,
    credits: ability.creditCost,
  };
}

/** True when there is an active run attacking HQ, R&D, or Archives. */
export function isAttackingCentral(state: GameState): boolean {
  const sid = state.run?.attackedServerId;
  return sid === "hq" || sid === "rd" || sid === "archives";
}

/** Recurring ¢ from installed cards with `run_central` while attacking a central. */
export function recurringCreditsForCentralRun(state: GameState): number {
  if (!isAttackingCentral(state)) return 0;
  let n = 0;
  for (const id of state.runner.rig) {
    const card = state.cards[id];
    if ((card.recurringSpendFor ?? []).includes("run_central")) {
      n += card.recurringCredits ?? 0;
    }
  }
  return n;
}

/**
 * Runner credit pool for any payment: bank + run event credits + Cezve-class
 * `run_central` recurring while attacking a central (CR §1.10.5a / §6.3.4).
 */
export function runnerAvailableCredits(state: GameState): number {
  return (
    state.runner.credits +
    (state.run ? (state.run.eventCredits ?? 0) : 0) +
    recurringCreditsForCentralRun(state)
  );
}

/**
 * Spend Runner credits drawing from `run_central` recurring (when attacking a
 * central), then run event credits, then the credit bank.
 */
export function spendRunnerCredits(state: GameState, amount: number): void {
  let left = amount;
  if (left <= 0) return;
  left = takeFromCentralRunRecurring(state, left);
  if (left > 0 && state.run && (state.run.eventCredits ?? 0) > 0) {
    const fromEvent = Math.min(left, state.run.eventCredits ?? 0);
    state.run.eventCredits = (state.run.eventCredits ?? 0) - fromEvent;
    left -= fromEvent;
    if (fromEvent > 0) {
      log(state, `Spend ${fromEvent}¢ from run event credits.`);
    }
  }
  state.runner.credits -= left;
}

function takeFromCentralRunRecurring(
  state: GameState,
  amount: number,
): number {
  if (!isAttackingCentral(state) || amount <= 0) return amount;
  let left = amount;
  for (const id of state.runner.rig) {
    if (left <= 0) break;
    const card = state.cards[id];
    if (!(card.recurringSpendFor ?? []).includes("run_central")) continue;
    const pool = card.recurringCredits ?? 0;
    if (pool <= 0) continue;
    const take = Math.min(left, pool);
    card.recurringCredits = pool - take;
    left -= take;
    if (take > 0) {
      log(
        state,
        `Spend ${take}¢ from ${card.title} recurring credits (run_central).`,
      );
      noteInstalledCardCreditSpend(state);
    }
  }
  return left;
}

export function canPayCost(
  state: GameState,
  side: Side,
  cost: CostSpec,
  source?: CardInstance,
): boolean {
  const p = side === "corp" ? state.corp : state.runner;
  if ((cost.clicks ?? 0) > p.clicks) return false;
  const creditNeed = cost.credits ?? 0;
  if (side === "runner") {
    if (creditNeed > runnerAvailableCredits(state)) return false;
  } else {
    if (creditNeed > p.credits) return false;
  }
  if ((cost.recurringCredits ?? 0) > 0) {
    if (!source || (source.recurringCredits ?? 0) < (cost.recurringCredits ?? 0)) {
      return false;
    }
  }
  if ((cost.virusCounters ?? 0) > 0) {
    if (!source || (source.virusCounters ?? 0) < (cost.virusCounters ?? 0)) {
      return false;
    }
  }
  if ((cost.agendaCounters ?? 0) > 0) {
    if (!source || (source.agendaCounters ?? 0) < (cost.agendaCounters ?? 0)) {
      return false;
    }
  }
  if ((cost.powerCounters ?? 0) > 0) {
    if (!source || (source.powerCounters ?? 0) < (cost.powerCounters ?? 0)) {
      return false;
    }
  }
  if ((cost.advancementTokens ?? 0) > 0) {
    if (
      !source ||
      (source.advancementTokens ?? 0) < (cost.advancementTokens ?? 0)
    ) {
      return false;
    }
  }
  if ((cost.trashFromHq ?? 0) > 0) {
    if (state.corp.hand.length < (cost.trashFromHq ?? 0)) return false;
  }
  if ((cost.trashFromGrip ?? 0) > 0) {
    if (state.runner.hand.length < (cost.trashFromGrip ?? 0)) return false;
  }
  // coreDamage is always payable (may flatline when paid).
  return true;
}

export function payCost(
  state: GameState,
  side: Side,
  cost: CostSpec,
  openedBy: string,
  source?: CardInstance,
): void {
  const p = side === "corp" ? state.corp : state.runner;
  withCostCheckpoint(state, openedBy, () => {
    p.clicks -= cost.clicks ?? 0;
    let creditsLeft = cost.credits ?? 0;
    if (side === "runner") {
      creditsLeft = takeFromCentralRunRecurring(state, creditsLeft);
      if (state.run && (state.run.eventCredits ?? 0) > 0) {
        const fromEvent = Math.min(creditsLeft, state.run.eventCredits ?? 0);
        state.run.eventCredits = (state.run.eventCredits ?? 0) - fromEvent;
        creditsLeft -= fromEvent;
        if (fromEvent > 0) {
          log(
            state,
            `Spend ${fromEvent}¢ from run event credits (Overclock pool).`,
          );
        }
      }
    }
    p.credits -= creditsLeft;
    if (source && (cost.recurringCredits ?? 0) > 0) {
      source.recurringCredits =
        (source.recurringCredits ?? 0) - (cost.recurringCredits ?? 0);
      if (
        side === "runner" &&
        state.runner.rig.includes(source.id) &&
        (cost.recurringCredits ?? 0) > 0
      ) {
        noteInstalledCardCreditSpend(state);
      }
    }
    if (source && (cost.virusCounters ?? 0) > 0) {
      source.virusCounters =
        (source.virusCounters ?? 0) - (cost.virusCounters ?? 0);
    }
    if (source && (cost.agendaCounters ?? 0) > 0) {
      source.agendaCounters =
        (source.agendaCounters ?? 0) - (cost.agendaCounters ?? 0);
      log(
        state,
        `Spend ${cost.agendaCounters} agenda counter(s) from ${source.title} → ${source.agendaCounters}.`,
      );
    }
    if (source && (cost.powerCounters ?? 0) > 0) {
      source.powerCounters =
        (source.powerCounters ?? 0) - (cost.powerCounters ?? 0);
      log(
        state,
        `Spend ${cost.powerCounters} power counter(s) from ${source.title} → ${source.powerCounters}.`,
      );
      if (
        source.trashWhenPowerEmpty &&
        (source.powerCounters ?? 0) <= 0
      ) {
        removeCardFromCurrentZone(state, source.id);
        if (source.side === "runner") {
          state.runner.discard.push(source.id);
          source.zone = "runner:heap";
        } else {
          state.corp.discard.push(source.id);
          source.zone = "corp:archives";
        }
        source.faceup = true;
        log(
          state,
          `${source.title} trashed — power counters empty (CR ${CR.trashing.number}).`,
        );
      }
    }
    if (source && (cost.advancementTokens ?? 0) > 0) {
      source.advancementTokens =
        (source.advancementTokens ?? 0) - (cost.advancementTokens ?? 0);
      log(
        state,
        `Spend ${cost.advancementTokens} advancement(s) from ${source.title} → ${source.advancementTokens} (CR ${CR.advancing.number}).`,
      );
    }
    if ((cost.trashFromHq ?? 0) > 0) {
      for (let i = 0; i < (cost.trashFromHq ?? 0); i++) {
        const id = state.corp.hand.pop();
        if (!id) break;
        state.corp.discard.push(id);
        const c = state.cards[id];
        c.zone = "corp:archives";
        c.faceup = true;
        log(state, `Trash ${c.title} from HQ as cost.`);
      }
    }
    if ((cost.trashFromGrip ?? 0) > 0) {
      for (let i = 0; i < (cost.trashFromGrip ?? 0); i++) {
        const id = state.runner.hand.pop();
        if (!id) break;
        state.runner.discard.push(id);
        const c = state.cards[id];
        c.zone = "runner:heap";
        c.faceup = true;
        log(state, `Trash ${c.title} from grip as cost.`);
      }
    }
    if (cost.trashSelf && source) {
      removeCardFromCurrentZone(state, source.id);
      if (source.side === "runner") {
        state.runner.discard.push(source.id);
        source.zone = "runner:heap";
      } else {
        state.corp.discard.push(source.id);
        source.zone = "corp:archives";
      }
      source.faceup = true;
      log(
        state,
        `${source.title} trashed as cost (CR ${CR.trashing.number}).`,
      );
    }
    if ((cost.coreDamage ?? 0) > 0 && source) {
      dealDamage(state, "core", cost.coreDamage ?? 0, source.id);
    }
  });
}

/** Refill recurring credit pools on installed/rezzed cards for a side. */
export function refillRecurringCredits(state: GameState, side: Side): void {
  const ids =
    side === "corp"
      ? Object.values(state.cards)
          .filter((c) => c.side === "corp" && c.rezzed && (c.recurringCreditsMax ?? 0) > 0)
          .map((c) => c.id)
      : state.runner.rig.filter(
          (id) => (state.cards[id].recurringCreditsMax ?? 0) > 0,
        );

  for (const id of ids) {
    const card = state.cards[id];
    const max = card.recurringCreditsMax ?? 0;
    card.recurringCredits = max;
  }
  if (ids.length > 0) {
    log(
      state,
      `${side} recurring credits refill on ${ids.length} card(s) (CR ${CR.recurringCredits.number}).`,
    );
  }
}

/**
 * Spend Runner credits for trash / play_event, drawing from matching
 * recurringSpendFor pools (incl. `run_central` while attacking a central)
 * before the credit bank / run event credits.
 */
export function spendRunnerCreditsFor(
  state: GameState,
  amount: number,
  purpose: Exclude<RecurringSpendPurpose, "run_central">,
): void {
  let left = amount;
  if (left <= 0) return;
  for (const id of state.runner.rig) {
    if (left <= 0) break;
    const card = state.cards[id];
    if (!recurringMatchesPurpose(state, card, purpose)) continue;
    const pool = card.recurringCredits ?? 0;
    if (pool <= 0) continue;
    const take = Math.min(left, pool);
    card.recurringCredits = pool - take;
    left -= take;
    if (take > 0) {
      const label = (card.recurringSpendFor ?? []).includes("run_central")
        ? "run_central"
        : purpose;
      log(
        state,
        `Spend ${take}¢ from ${card.title} recurring credits (${label}).`,
      );
      noteInstalledCardCreditSpend(state);
    }
  }
  if (left > 0 && state.run && (state.run.eventCredits ?? 0) > 0) {
    const fromEvent = Math.min(left, state.run.eventCredits ?? 0);
    state.run.eventCredits = (state.run.eventCredits ?? 0) - fromEvent;
    left -= fromEvent;
  }
  state.runner.credits -= left;
}

/** Credits available for a purpose including matching recurring pools. */
export function runnerCreditsFor(
  state: GameState,
  purpose: Exclude<RecurringSpendPurpose, "run_central">,
): number {
  let total = state.runner.credits + (state.run?.eventCredits ?? 0);
  for (const id of state.runner.rig) {
    const card = state.cards[id];
    if (recurringMatchesPurpose(state, card, purpose)) {
      total += card.recurringCredits ?? 0;
    }
  }
  return total;
}

/**
 * Sum of installed Runner cards’ `eventPlayCostDiscount` (Ghosttongue-class).
 * CR §1.16.2a — lower after increases; caller floors at 0.
 */
export function eventPlayCostDiscountTotal(state: GameState): number {
  let n = 0;
  for (const id of state.runner.rig) {
    n += state.cards[id].eventPlayCostDiscount ?? 0;
  }
  return n;
}

/**
 * Effective event play cost after continuous discounts (CR §1.16.2a / §3.7.2).
 */
export function effectiveEventPlayCost(
  state: GameState,
  playCost: number | undefined,
): number {
  return Math.max(0, (playCost ?? 0) - eventPlayCostDiscountTotal(state));
}

function recurringMatchesPurpose(
  state: GameState,
  card: CardInstance,
  purpose: Exclude<RecurringSpendPurpose, "run_central">,
): boolean {
  const purposes = card.recurringSpendFor ?? [];
  if (purposes.includes(purpose)) return true;
  // Generic "trash" also covers asset trash costs.
  if (purpose === "trash_asset" && purposes.includes("trash")) return true;
  // Cezve-class: any purpose while attacking a central.
  if (purposes.includes("run_central") && isAttackingCentral(state)) return true;
  return false;
}
